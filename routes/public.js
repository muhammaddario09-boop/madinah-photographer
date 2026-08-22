const express = require('express');
const router = express.Router();
const db = require('../db');
const { getAvailableSlots } = require('../lib/availabilityEngine');
const { createBooking, reschedule } = require('../lib/bookingEngine');
const { renderConfirmation, queueNotification } = require('../lib/notificationEngine');
const { recordBookingToCloud } = require('../lib/cloudStore');
const {
  recordBookingToSupabase,
  fetchPortfolioFromSupabase,
  fetchServicesFromSupabase,
  fetchLocationsFromSupabase,
  fetchPhotographersFromSupabase,
  fetchSettingsFromSupabase,
  fetchBookingByCodeFromSupabase
} = require('../lib/supabase');

function bufferMinutes(db) {
  const row = db.prepare(`SELECT value FROM settings WHERE key='buffer_minutes'`).get();
  return row ? Number(row.value) : 30;
}

router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'UMROH LENS API' });
});

router.get('/services', async (req, res) => {
  try {
    const supaServices = await fetchServicesFromSupabase();
    if (supaServices) return res.json(supaServices);
    const services = db.prepare(`SELECT * FROM services WHERE active=1 ORDER BY sort_order`).all();
    const full = services.map(s => {
      const packages = db.prepare(`SELECT * FROM packages WHERE service_id=? AND active=1 ORDER BY price`).all(s.id);
      return { ...s, packages };
    });
    res.json(full);
  } catch (err) {
    console.error('GET /services error:', err.message);
    res.json([]);
  }
});

router.get('/services/:slug', async (req, res) => {
  try {
    const param = req.params.slug;
    const supaServices = await fetchServicesFromSupabase();
    if (supaServices) {
      const found = supaServices.find(s => s.slug === param || String(s.id) === param || (s.slug && s.slug.toLowerCase() === param.toLowerCase()));
      if (found) return res.json(found);
    }
    const service = db.prepare(`SELECT * FROM services WHERE (slug=? OR id=? OR LOWER(slug)=LOWER(?)) AND active=1`).get(param, isNaN(param) ? -1 : Number(param), param);
    if (!service) return res.status(404).json({ error: 'Service not found' });
    const packages = db.prepare(`SELECT * FROM packages WHERE service_id=? AND active=1 ORDER BY price`).all(service.id);
    res.json({ ...service, packages });
  } catch (err) {
    console.error('GET /services/:slug error:', err.message);
    res.status(404).json({ error: 'Service not found' });
  }
});

router.get('/locations', async (req, res) => {
  try {
    const supaLocs = await fetchLocationsFromSupabase();
    if (supaLocs) return res.json(supaLocs);
    res.json(db.prepare(`SELECT * FROM locations WHERE active=1 ORDER BY id`).all());
  } catch (err) {
    console.error('GET /locations error:', err.message);
    res.json([]);
  }
});

router.get('/photographers', async (req, res) => {
  try {
    const supaPhoto = await fetchPhotographersFromSupabase();
    if (supaPhoto) return res.json(supaPhoto);
    const list = db.prepare(`SELECT id, name, bio, avatar_url FROM photographers WHERE active=1`).all();
    res.json(list.length ? list : [{
      id: 1,
      name: 'UMROH LENS',
      bio: 'Fotografer profesional berbasis di Madinah Al-Munawwarah.',
      avatar_url: '/img/photographer-1.jpg'
    }]);
  } catch (e) {
    res.json([{
      id: 1,
      name: 'UMROH LENS',
      bio: 'Fotografer profesional berbasis di Madinah Al-Munawwarah.',
      avatar_url: '/img/photographer-1.jpg'
    }]);
  }
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

// GET /api/payment-info — returns bank account details, dual WhatsApp numbers, and Instagram info
router.get('/payment-info', async (req, res) => {
  try {
    let s = await fetchSettingsFromSupabase();
    if (!s) {
      const settingsRows = db.prepare(`SELECT key, value FROM settings`).all();
      s = {};
      settingsRows.forEach(r => { s[r.key] = r.value; });
    }
    const wa = s.admin_whatsapp || '+6282175272547';
    const wa2 = s.admin_whatsapp_2 || '+6281234567890';
    const igUrl = s.instagram_url || 'https://instagram.com/umrohlens';
    const igHandle = s.instagram_handle || '@umrohlens';
    res.json({
      adminWhatsApp: wa,
      whatsappNumber: wa,
      adminWhatsApp2: wa2,
      instagramUrl: igUrl,
      instagramHandle: igHandle,
      bankSAR: {
        name: s.bank_sar_name || 'Al Rajhi Bank (Saudi Arabia)',
        account: s.bank_sar_account || 'SA84 8000 0123 4567 8901 2345',
        holder: s.bank_sar_holder || 'UMROH LENS Photography Studio'
      },
      bankIDR: {
        name: s.bank_idr_name || 'Bank Central Asia (BCA)',
        account: s.bank_idr_account || '5420123456 (BCA)',
        holder: s.bank_idr_holder || 'WAHYU AFRIANSYAH',
        rate: Number(s.idr_sar_rate) || 4200
      }
    });
  } catch (err) {
    res.json({
      adminWhatsApp: '+6282175272547',
      whatsappNumber: '+6282175272547',
      adminWhatsApp2: '+6281234567890',
      instagramUrl: 'https://instagram.com/umrohlens',
      instagramHandle: '@umrohlens',
      bankSAR: {
        name: 'Al Rajhi Bank (Saudi Arabia)',
        account: 'SA84 8000 0123 4567 8901 2345',
        holder: 'UMROH LENS Photography Studio'
      },
      bankIDR: {
        name: 'Bank Central Asia (BCA)',
        account: '5420123456 (BCA)',
        holder: 'WAHYU AFRIANSYAH',
        rate: 4200
      }
    });
  }
});

// POST /api/bookings — creates a booking with full server-side re-validation.
router.post('/bookings', async (req, res) => {
  try {
    const b = req.body;
    const buffer = bufferMinutes(db);
    const photoRow = db.prepare(`SELECT id FROM photographers LIMIT 1`).get();
    const photographerId = b.photographerId || (photoRow ? photoRow.id : 1);

    const pkg = (b.packageId ? db.prepare(`SELECT * FROM packages WHERE id=?`).get(b.packageId) : null) || db.prepare(`SELECT * FROM packages LIMIT 1`).get();
    if (!pkg) return res.status(400).json({ error: 'Invalid package selected.' });
    const service = (pkg.service_id ? db.prepare(`SELECT * FROM services WHERE id=?`).get(pkg.service_id) : null) || db.prepare(`SELECT * FROM services LIMIT 1`).get() || { id: 1, name: 'Madinah Session' };

    const depositAmount = Math.round(((pkg.price || 350) * (pkg.deposit_percentage || 30)) / 100);

    const result = createBooking(db, {
      photographerId,
      serviceId: service.id,
      packageId: pkg.id,
      locationId: b.locationId || 1,
      clientName: b.clientName,
      clientEmail: b.clientEmail,
      clientPhone: b.clientPhone,
      clientCountry: b.clientCountry || 'Indonesia',
      date: b.date,
      startTime: b.startTime,
      durationMinutes: pkg.duration_minutes || 60,
      bufferMinutes: buffer,
      occasion: b.occasion || 'Umrah',
      numberOfPeople: Number(b.numberOfPeople) || 2,
      stylePreference: b.stylePreference || null,
      specialRequest: b.specialRequest || null,
      totalPrice: pkg.price || 350,
      depositAmount,
      currency: pkg.currency || 'SAR',
    });

    // Record Payment Proof if uploaded
    if (b.paymentProof) {
      try {
        db.prepare(
          `INSERT INTO payments (booking_id, amount, currency, method, type, status, reference, proof_url)
           VALUES (?, ?, ?, 'BANK_TRANSFER', 'DEPOSIT', 'PENDING', ?, ?)`
        ).run(result.id, depositAmount, pkg.currency || 'SAR', 'Screenshot Transfer', b.paymentProof);
      } catch(payErr) {
        console.error('Payment record notice:', payErr.message);
      }
    }

    // Always set initial payment status based on proof presence
    const payStatus = b.paymentProof ? 'DEPOSIT_PAID' : 'UNPAID';
    db.prepare(`UPDATE bookings SET payment_status = ? WHERE id = ?`).run(payStatus, result.id);

    const location = b.locationId ? db.prepare(`SELECT * FROM locations WHERE id=?`).get(b.locationId) : null;
    const photographer = (photographerId ? db.prepare(`SELECT * FROM photographers WHERE id=?`).get(photographerId) : null) || { name: 'UMROH LENS' };
    const message = renderConfirmation(
      { ...result, clientName: b.clientName, date: b.date, start_time: b.startTime, end_time: result.endTime },
      service, photographer, location
    );
    try {
      queueNotification(db, { bookingId: result.id, channel: 'WHATSAPP', type: 'CONFIRMATION', payload: message });
      queueNotification(db, { bookingId: result.id, channel: 'WHATSAPP', type: 'REMINDER_24H', payload: null, scheduledFor: null });
      queueNotification(db, { bookingId: result.id, channel: 'WHATSAPP', type: 'REMINDER_3H', payload: null, scheduledFor: null });
    } catch(notifErr) {
      console.error('Queue notification notice:', notifErr.message);
    }

    // WhatsApp Direct URL Generation
    const waSetting = db.prepare(`SELECT value FROM settings WHERE key='admin_whatsapp'`).get();
    const waNumber = (waSetting ? waSetting.value : '+966501234567').replace(/[^0-9]/g, '');

    const waText = [
      `Assalamu'alaikum Admin UMROH LENS,`,
      `Saya ingin mengajukan reservasi sesi foto di Madinah:`,
      ``,
      `📋 *Booking Code*: ${result.bookingCode}`,
      `👤 *Nama Jemaah*: ${b.clientName}`,
      `📞 *No. WhatsApp*: ${b.clientPhone}`,
      `📸 *Layanan*: ${service.name} (${pkg.name})`,
      `📅 *Tanggal*: ${b.date}`,
      `⏰ *Waktu Sesi*: ${b.startTime} - ${result.endTime} (Waktu Madinah)`,
      `📍 *Spot Lokasi*: ${location ? location.name : 'Madinah Area'}`,
      b.paymentProof ? `💵 *Bukti Transfer*: Terlampir di sistem` : `📄 *Status*: Mohon kirimkan Rate Card PDF & konfirmasi ketersediaan slot fotografer`,
      ``,
      `Mohon dibantu konfirmasi jadwal sesi kami. Terima kasih!`
    ].join('\n');

    const whatsappUrl = `https://wa.me/${waNumber}?text=${encodeURIComponent(waText)}`;

    // Record to Supabase PostgreSQL & persistent store before closing response
    await recordBookingToSupabase(
      {
        booking_code: result.bookingCode,
        photographer_id: photographerId,
        service_id: service.id,
        package_id: pkg.id,
        location_id: b.locationId || 1,
        date: b.date,
        start_time: b.startTime,
        end_time: result.endTime,
        occasion: b.occasion || 'Umrah',
        number_of_people: Number(b.numberOfPeople) || 1,
        style_preference: b.stylePreference || null,
        special_request: b.specialRequest || null,
        deposit_amount: depositAmount,
        total_price: pkg.price,
        currency: pkg.currency,
        payment_status: b.paymentProof ? 'DEPOSIT_PAID' : 'UNPAID',
        status: 'PENDING'
      },
      {
        name: b.clientName,
        email: b.clientEmail,
        phone: b.clientPhone,
        country: b.clientCountry || 'Indonesia'
      },
      b.paymentProof || null
    ).catch(e => console.error('Supabase booking sync error:', e.message));

    recordBookingToCloud({
      booking_code: result.bookingCode,
      client_name: b.clientName,
      client_email: b.clientEmail,
      client_phone: b.clientPhone,
      client_country: b.clientCountry || 'Indonesia',
      service_id: service.id,
      service_name: service.name,
      package_id: pkg.id,
      package_name: pkg.name,
      location_id: b.locationId || null,
      location_name: location ? location.name : 'Madinah Area',
      date: b.date,
      start_time: b.startTime,
      end_time: result.endTime,
      total_price: pkg.price,
      deposit_amount: depositAmount,
      currency: pkg.currency,
      status: 'PENDING',
      payment_status: b.paymentProof ? 'DEPOSIT_PAID' : 'UNPAID',
      occasion: b.occasion || 'Umrah',
      number_of_people: b.numberOfPeople || 1,
      proof_url: b.paymentProof || null,
      created_at: new Date().toISOString()
    }).catch(() => {});

    return res.status(201).json({
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
    console.error('POST /bookings error:', e);
    const status = (typeof e.status === 'number' && e.status >= 400 && e.status < 600) ? e.status : 400;
    return res.status(status).json({ error: e.message || 'Your booking could not be completed. Please try again.' });
  }
});

router.get('/bookings/:code', async (req, res) => {
  try {
    const rawCode = String(req.params.code || '').trim().toUpperCase();

    // 1. Check Supabase first (cloud primary database)
    const supaData = await fetchBookingByCodeFromSupabase(rawCode);
    if (supaData && supaData.booking) {
      let s = await fetchSettingsFromSupabase();
      const waNumber = (s?.admin_whatsapp || '+6282175272547').replace(/[^0-9]/g, '');
      const waText = [
        `Assalamu'alaikum UMROH LENS,`,
        `Saya ingin menanyakan reservasi saya:`,
        ``,
        `📋 *Booking Code*: ${supaData.booking.booking_code}`,
        `👤 *Nama*: ${supaData.booking.client_name}`,
        `📸 *Layanan*: ${supaData.service.name}`,
        `📅 *Tanggal*: ${supaData.booking.date}`,
        `⏰ *Waktu*: ${supaData.booking.start_time} - ${supaData.booking.end_time} (Waktu Madinah)`,
        `💵 *Status Pembayaran*: ${supaData.booking.payment_status}`,
        ``,
        `Terima kasih!`
      ].join('\n');
      const whatsappUrl = `https://wa.me/${waNumber}?text=${encodeURIComponent(waText)}`;

      return res.json({
        ...supaData,
        whatsappUrl
      });
    }

    // 2. Fallback to local SQLite cache
    const booking = db.prepare(`SELECT * FROM bookings WHERE booking_code=? COLLATE NOCASE`).get(rawCode);
    if (!booking) return res.status(404).json({ error: 'Booking tidak ditemukan. Pastikan Booking ID Anda benar (Contoh: MDN-2026-0001).' });

    const service = booking.service_id ? db.prepare(`SELECT * FROM services WHERE id=?`).get(booking.service_id) : null;
    const pkg = booking.package_id ? db.prepare(`SELECT * FROM packages WHERE id=?`).get(booking.package_id) : null;
    const location = booking.location_id ? db.prepare(`SELECT * FROM locations WHERE id=?`).get(booking.location_id) : null;
    const photographer = booking.photographer_id ? db.prepare(`SELECT * FROM photographers WHERE id=?`).get(booking.photographer_id) : null;
    const client = booking.client_id ? db.prepare(`SELECT * FROM clients WHERE id=?`).get(booking.client_id) : null;

    let s = await fetchSettingsFromSupabase();
    const waNumber = (s?.admin_whatsapp || '+6282175272547').replace(/[^0-9]/g, '');
    const waText = [
      `Assalamu'alaikum UMROH LENS,`,
      `Saya ingin menanyakan reservasi saya:`,
      ``,
      `📋 *Booking Code*: ${booking.booking_code}`,
      `👤 *Nama*: ${client?.name || 'Client'}`,
      `📸 *Layanan*: ${service?.name || 'Madinah Photoshoot'}`,
      `📅 *Tanggal*: ${booking.date}`,
      `⏰ *Waktu*: ${booking.start_time} - ${booking.end_time} (Waktu Madinah)`,
      `💵 *Status Pembayaran*: ${booking.payment_status}`,
      ``,
      `Terima kasih!`
    ].join('\n');
    const whatsappUrl = `https://wa.me/${waNumber}?text=${encodeURIComponent(waText)}`;

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
      photographer: photographer || { name: 'UMROH LENS' },
      whatsappUrl
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/bookings/:code/reschedule', async (req, res) => {
  try {
    const booking = db.prepare(`SELECT * FROM bookings WHERE booking_code=?`).get(req.params.code);
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });
    const buffer = bufferMinutes(db);
    const updated = reschedule(db, booking.id, { date: req.body.date, startTime: req.body.startTime, bufferMinutes: buffer }, 'client');

    const client = db.prepare(`SELECT * FROM clients WHERE id=?`).get(booking.client_id);
    const service = db.prepare(`SELECT * FROM services WHERE id=?`).get(booking.service_id);

    // Generate WhatsApp Notification Template for Reschedule
    let s = await fetchSettingsFromSupabase();
    if (!s) {
      const waSetting = db.prepare(`SELECT value FROM settings WHERE key='admin_whatsapp'`).get();
      s = { admin_whatsapp: waSetting ? waSetting.value : '+6282175272547' };
    }
    const waNumber = (s.admin_whatsapp || '+6282175272547').replace(/[^0-9]/g, '');

    const waText = [
      `Assalamu'alaikum UMROH LENS,`,
      `Saya ingin mengajukan *Perubahan Jadwal (Reschedule)* sesi foto saya di Madinah:`,
      ``,
      `📋 *Booking Code*: ${booking.booking_code}`,
      `👤 *Nama*: ${client ? client.name : 'Klien'}`,
      `📸 *Layanan*: ${service ? service.name : 'Sesi Foto'}`,
      `📅 *Jadwal Baru*: ${req.body.date}`,
      `⏰ *Waktu Baru*: ${req.body.startTime} (Waktu Madinah)`,
      ``,
      `Mohon konfirmasi dan persetujuan perubahan jadwal ini. Terima kasih!`
    ].join('\n');

    const whatsappUrl = `https://wa.me/${waNumber}?text=${encodeURIComponent(waText)}`;

    res.json({
      ok: true,
      booking: updated,
      status: 'RESCHEDULE_REQUESTED',
      whatsappUrl,
      whatsappMessage: waText
    });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Reschedule failed. Please try again.' });
  }
});

router.get('/portfolio', async (req, res) => {
  try {
    const supaPhotos = await fetchPortfolioFromSupabase();
    if (supaPhotos !== null) {
      return res.json(supaPhotos);
    }
    res.json(db.prepare(`SELECT * FROM portfolio WHERE active=1 ORDER BY featured DESC, sort_order`).all());
  } catch(err) {
    console.error('GET /portfolio error:', err.message);
    res.json([]);
  }
});

module.exports = router;
