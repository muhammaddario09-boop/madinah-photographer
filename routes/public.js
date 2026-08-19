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

    const location = b.locationId ? db.prepare(`SELECT * FROM locations WHERE id=?`).get(b.locationId) : null;
    const photographer = db.prepare(`SELECT * FROM photographers WHERE id=?`).get(photographerId);
    const message = renderConfirmation(
      { ...result, clientName: b.clientName, date: b.date, start_time: b.startTime, end_time: result.endTime },
      service, photographer, location
    );
    queueNotification(db, { bookingId: result.id, channel: 'WHATSAPP', type: 'CONFIRMATION', payload: message });
    queueNotification(db, { bookingId: result.id, channel: 'WHATSAPP', type: 'REMINDER_24H', payload: null, scheduledFor: null });
    queueNotification(db, { bookingId: result.id, channel: 'WHATSAPP', type: 'REMINDER_3H', payload: null, scheduledFor: null });

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
    });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Your booking could not be completed. Please try again.' });
  }
});

router.get('/bookings/:code', (req, res) => {
  const booking = db.prepare(`SELECT * FROM bookings WHERE booking_code=?`).get(req.params.code);
  if (!booking) return res.status(404).json({ error: 'Booking not found.' });
  const service = db.prepare(`SELECT * FROM services WHERE id=?`).get(booking.service_id);
  const pkg = db.prepare(`SELECT * FROM packages WHERE id=?`).get(booking.package_id);
  const location = booking.location_id ? db.prepare(`SELECT * FROM locations WHERE id=?`).get(booking.location_id) : null;
  const photographer = db.prepare(`SELECT * FROM photographers WHERE id=?`).get(booking.photographer_id);
  res.json({ booking, service, package: pkg, location, photographer });
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
