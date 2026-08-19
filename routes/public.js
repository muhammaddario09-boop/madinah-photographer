const express = require('express');
const router = express.Router();
const db = require('../db');
const { getAvailableSlots } = require('../lib/availabilityEngine');
const { createBooking, reschedule } = require('../lib/bookingEngine');
const { renderConfirmation, queueNotification } = require('../lib/notificationEngine');
const { todayRiyadhISODate } = require('../lib/timezone');

function bufferMinutes(db) {
  const row = db.prepare(`SELECT value FROM settings WHERE key='buffer_minutes'`).get();
  return row ? Number(row.value) : 30;
}

router.get('/services', (req, res) => {
  const services = db.prepare(`SELECT * FROM services WHERE active=1 ORDER BY sort_order`).all();
  res.json(services);
});

router.get('/services/:slug', (req, res) => {
  const service = db.prepare(`SELECT * FROM services WHERE slug=? AND active=1`).get(req.params.slug);
  if (!service) return res.status(404).json({ error: 'Service not found' });
  const packages = db.prepare(`SELECT * FROM packages WHERE service_id=? AND active=1`).all(service.id);
  res.json({ ...service, packages });
});

router.get('/locations', (req, res) => {
  res.json(db.prepare(`SELECT * FROM locations WHERE active=1`).all());
});

router.get('/photographers', (req, res) => {
  res.json(db.prepare(`SELECT id, name, bio, avatar_url FROM photographers WHERE active=1`).all());
});

// GET /api/availability?photographerId=1&date=2026-08-25&duration=60
router.get('/availability', (req, res) => {
  const photographerId = Number(req.query.photographerId) || db.prepare(`SELECT id FROM photographers LIMIT 1`).get().id;
  const date = req.query.date || todayRiyadhISODate();
  const duration = Number(req.query.duration) || 60;
  const buffer = bufferMinutes(db);

  const result = getAvailableSlots(db, {
    photographerId, dateStr: date, sessionDuration: duration, bufferMinutes: buffer,
  });
  res.json({ date, photographerId, buffer, ...result });
});

// GET /api/availability/month?photographerId=1&year=2026&month=8
// Rolls up each day to AVAILABLE / LIMITED / BOOKED / OFF for the calendar UI.
router.get('/availability/month', (req, res) => {
  const photographerId = Number(req.query.photographerId) || db.prepare(`SELECT id FROM photographers LIMIT 1`).get().id;
  const year = Number(req.query.year);
  const month = Number(req.query.month); // 1-12
  const duration = Number(req.query.duration) || 60;
  const buffer = bufferMinutes(db);

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const days = {};
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const { isOff, slots } = getAvailableSlots(db, {
      photographerId, dateStr, sessionDuration: duration, bufferMinutes: buffer,
    });
    if (isOff) { days[dateStr] = 'OFF'; continue; }
    const available = slots.filter((s) => s.status === 'AVAILABLE').length;
    if (available === 0) days[dateStr] = 'BOOKED';
    else if (available <= 2) days[dateStr] = 'LIMITED';
    else days[dateStr] = 'AVAILABLE';
  }
  res.json({ year, month, days });
});

// GET /api/payment-info — returns bank account details and WhatsApp numbers
router.get('/payment-info', (req, res) => {
  const settingsRows = db.prepare(`SELECT key, value FROM settings`).all();
  const s = {};
  settingsRows.forEach(r => { s[r.key] = r.value; });
  res.json({
    whatsappNumber: s.admin_whatsapp || '+966501234567',
    bankSAR: {
      name: s.bank_sar_name || 'Al Rajhi Bank (Saudi Arabia)',
      account: s.bank_sar_account || 'SA84 8000 0123 4567 8901 2345',
      holder: s.bank_sar_holder || 'Al-Madani Photography Studio'
    },
    bankIDR: {
      name: s.bank_idr_name || 'Bank Syariah Indonesia (BSI) / BCA',
      account: s.bank_idr_account || '7123456789 (BSI) / 5420123456 (BCA)',
      holder: s.bank_idr_holder || 'Al-Madani Photography',
      rate: Number(s.idr_sar_rate) || 4200
    }
  });
});

// POST /api/bookings — creates a booking with full server-side re-validation.
router.post('/bookings', (req, res) => {
  try {
    const b = req.body;
    const buffer = bufferMinutes(db);
    const photographerId = b.photographerId || db.prepare(`SELECT id FROM photographers LIMIT 1`).get().id;

    const pkg = db.prepare(`SELECT * FROM packages WHERE id=?`).get(b.packageId);
    if (!pkg) return res.status(400).json({ error: 'Invalid package selected.' });
    const service = db.prepare(`SELECT * FROM services WHERE id=?`).get(pkg.service_id);

    const depositAmount = Math.round((pkg.price * pkg.deposit_percentage) / 100);

    const result = createBooking(db, {
      photographerId,
      serviceId: service.id,
      packageId: pkg.id,
      locationId: b.locationId,
      clientName: b.clientName,
      clientEmail: b.clientEmail,
      clientPhone: b.clientPhone,
      clientCountry: b.clientCountry,
      date: b.date,
      startTime: b.startTime,
      durationMinutes: pkg.duration_minutes,
      bufferMinutes: buffer,
      occasion: b.occasion,
      numberOfPeople: b.numberOfPeople,
      stylePreference: b.stylePreference,
      specialRequest: b.specialRequest,
      totalPrice: pkg.price,
      depositAmount,
      currency: pkg.currency,
    });

    // Record Payment Proof if uploaded
    if (b.paymentProof) {
      db.prepare(
        `INSERT INTO payments (booking_id, amount, currency, method, type, status, reference, proof_url)
         VALUES (?, ?, ?, 'BANK_TRANSFER', 'DEPOSIT', 'PENDING', ?, ?)`
      ).run(result.id, depositAmount, pkg.currency, 'Screenshot Transfer', b.paymentProof);

      db.prepare(`UPDATE bookings SET payment_status = 'DEPOSIT_PAID' WHERE id = ?`).run(result.id);
    }

    const location = b.locationId ? db.prepare(`SELECT * FROM locations WHERE id=?`).get(b.locationId) : null;
    const photographer = db.prepare(`SELECT * FROM photographers WHERE id=?`).get(photographerId);
    const message = renderConfirmation(
      { ...result, clientName: b.clientName, date: b.date, start_time: b.startTime, end_time: result.endTime },
      service, photographer, location
    );
    queueNotification(db, { bookingId: result.id, channel: 'WHATSAPP', type: 'CONFIRMATION', payload: message });
    queueNotification(db, { bookingId: result.id, channel: 'WHATSAPP', type: 'REMINDER_24H', payload: null, scheduledFor: null });
    queueNotification(db, { bookingId: result.id, channel: 'WHATSAPP', type: 'REMINDER_3H', payload: null, scheduledFor: null });

    // WhatsApp Direct URL Generation
    const waSetting = db.prepare(`SELECT value FROM settings WHERE key='admin_whatsapp'`).get();
    const waNumber = (waSetting ? waSetting.value : '+966501234567').replace(/[^0-9]/g, '');

    const waText = [
      `Assalamu'alaikum UMROH LENS,`,
      `Saya ingin konfirmasi reservasi sesi foto di Madinah:`,
      ``,
      `📋 *Booking Code*: ${result.bookingCode}`,
      `👤 *Nama*: ${b.clientName}`,
      `📸 *Layanan*: ${service.name} (${pkg.name})`,
      `📅 *Tanggal*: ${b.date}`,
      `⏰ *Waktu*: ${b.startTime} - ${result.endTime} (Waktu Madinah)`,
      `📍 *Lokasi*: ${location ? location.name : 'Madinah'}`,
      `💵 *Deposit*: ${pkg.currency} ${depositAmount} (Bukti Transfer Terlampir)`,
      ``,
      `Mohon verifikasi dan konfirmasi jadwal sesi saya. Terima kasih!`
    ].join('\n');

    const whatsappUrl = `https://wa.me/${waNumber}?text=${encodeURIComponent(waText)}`;

const { recordBookingToCloud, syncCloudBookingsToDb } = require('../lib/cloudStore');

    // Record to central cloud datastore
    recordBookingToCloud({
      booking_code: result.bookingCode,
      client_name: b.clientName,
      client_email: b.clientEmail,
      client_phone: b.clientPhone,
      client_country: b.clientCountry || 'Indonesia',
      service_id: b.serviceId,
      service_name: service.name,
      package_id: b.packageId,
      package_name: pkg.name,
      location_id: b.locationId,
      location_name: location ? location.name : 'Madinah Area',
      date: b.date,
      start_time: b.startTime,
      end_time: result.endTime,
      total_price: pkg.price,
      deposit_amount: depositAmount,
      currency: pkg.currency,
      status: 'PENDING',
      payment_status: b.paymentProof ? 'DEPOSIT_PAID' : 'PENDING',
      occasion: b.occasion || 'Umrah',
      number_of_people: b.numberOfPeople || 1,
      proof_url: b.paymentProof || null,
      created_at: new Date().toISOString()
    }).catch(err => console.error('Cloud sync error:', err.message));

    res.status(201).json({
      bookingCode: result.bookingCode,
      id: result.id,
      status: 'PENDING',
      depositAmount,
      totalPrice: pkg.price,
      currency: pkg.currency,
      date: b.date,
      startTime: b.startTime,
      endTime: result.endTime,
      whatsappMessage: message,
      whatsappUrl,
    });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Your booking could not be completed. Please try again.' });
  }
});

router.get('/bookings/:code', async (req, res) => {
  try {
    let booking = db.prepare(`SELECT * FROM bookings WHERE booking_code=?`).get(req.params.code);
    if (!booking) {
      await syncCloudBookingsToDb(db);
      booking = db.prepare(`SELECT * FROM bookings WHERE booking_code=?`).get(req.params.code);
    }
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });
    const service = booking.service_id ? db.prepare(`SELECT * FROM services WHERE id=?`).get(booking.service_id) : null;
    const pkg = booking.package_id ? db.prepare(`SELECT * FROM packages WHERE id=?`).get(booking.package_id) : null;
    const location = booking.location_id ? db.prepare(`SELECT * FROM locations WHERE id=?`).get(booking.location_id) : null;
    const photographer = booking.photographer_id ? db.prepare(`SELECT * FROM photographers WHERE id=?`).get(booking.photographer_id) : null;
    const client = booking.client_id ? db.prepare(`SELECT * FROM clients WHERE id=?`).get(booking.client_id) : null;

    res.json({
      booking: {
        ...booking,
        client_name: client?.name || 'Client',
        client_email: client?.email || '',
        client_phone: client?.phone || ''
      },
      service: service || { name: 'Madinah Photoshoot' },
      package: pkg || { name: 'Standard' },
      location: location || { name: 'Madinah Area' },
      photographer: photographer || { name: 'UMROH LENS' }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/bookings/:code/reschedule', (req, res) => {
  try {
    const booking = db.prepare(`SELECT * FROM bookings WHERE booking_code=?`).get(req.params.code);
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });
    const buffer = bufferMinutes(db);
    const updated = reschedule(db, booking.id, { date: req.body.date, startTime: req.body.startTime, bufferMinutes: buffer }, 'client');
    res.json({ ok: true, booking: updated });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Reschedule failed. Please try again.' });
  }
});

router.get('/portfolio', (req, res) => {
  res.json(db.prepare(`SELECT * FROM portfolio WHERE active=1 ORDER BY featured DESC, sort_order`).all());
});

module.exports = router;
