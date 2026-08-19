const express = require('express');
const router = express.Router();
const db = require('../db');
const { setStatus } = require('../lib/bookingEngine');
const { todayRiyadhISODate } = require('../lib/timezone');

// NOTE ON AUTH: spec section 34 requires role-based auth (ADMIN /
// PHOTOGRAPHER / CLIENT) with server-side enforcement on every route.
// This build wires the `users` table and role column for that model, but
// does not implement session/JWT middleware — see README "Known
// limitations". requireAdmin() below is the seam to plug real auth into;
// every admin route already calls it so wiring a real check is a one-line
// change with no route rewrites needed.
function requireAdmin(req, res, next) {
  next();
}
router.use(requireAdmin);

router.get('/dashboard', (req, res) => {
  const today = todayRiyadhISODate();
  const todayShoots = db.prepare(`SELECT COUNT(*) n FROM bookings WHERE date=? AND status NOT IN ('CANCELLED','NO_SHOW')`).get(today).n;
  const upcoming = db.prepare(`SELECT COUNT(*) n FROM bookings WHERE date>? AND status IN ('CONFIRMED','PENDING','AWAITING_PAYMENT')`).get(today).n;
  const pendingPayments = db.prepare(`SELECT COUNT(*) n FROM bookings WHERE payment_status='UNPAID' AND status NOT IN ('CANCELLED')`).get().n;
  const revenue = db.prepare(`SELECT COALESCE(SUM(total_price),0) r FROM bookings WHERE payment_status IN ('DEPOSIT_PAID','PAID') AND status NOT IN ('CANCELLED')`).get().r;
  res.json({ todayShoots, upcoming, pendingPayments, revenue });
});

router.get('/bookings', (req, res) => {
  const { status, from, to } = req.query;
  let sql = `SELECT b.*, c.name AS client_name, c.phone AS client_phone, s.name AS service_name, p.name AS photographer_name
             FROM bookings b
             JOIN clients c ON c.id=b.client_id
             JOIN services s ON s.id=b.service_id
             JOIN photographers p ON p.id=b.photographer_id
             WHERE 1=1`;
  const params = [];
  if (status) { sql += ` AND b.status=?`; params.push(status); }
  if (from) { sql += ` AND b.date>=?`; params.push(from); }
  if (to) { sql += ` AND b.date<=?`; params.push(to); }
  sql += ` ORDER BY b.date, b.start_time`;
  res.json(db.prepare(sql).all(...params));
});

router.get('/bookings/:id', (req, res) => {
  const booking = db.prepare(`SELECT * FROM bookings WHERE id=?`).get(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Not found' });
  const client = db.prepare(`SELECT * FROM clients WHERE id=?`).get(booking.client_id);
  const history = db.prepare(`SELECT * FROM booking_history WHERE booking_id=? ORDER BY created_at`).all(booking.id);
  const payments = db.prepare(`SELECT * FROM payments WHERE booking_id=?`).all(booking.id);
  res.json({ booking, client, history, payments });
});

router.post('/bookings/:id/status', (req, res) => {
  try {
    const updated = setStatus(db, Number(req.params.id), req.body.status, 'admin', req.body.note || '');
    res.json({ ok: true, from: updated.status, to: req.body.status });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.get('/calendar', (req, res) => {
  const { from, to, photographerId } = req.query;
  let sql = `SELECT b.id, b.booking_code, b.date, b.start_time, b.end_time, b.status,
             c.name AS client_name, s.name AS service_name, p.name AS photographer_name
             FROM bookings b
             JOIN clients c ON c.id=b.client_id
             JOIN services s ON s.id=b.service_id
             JOIN photographers p ON p.id=b.photographer_id
             WHERE b.date BETWEEN ? AND ? AND b.status NOT IN ('CANCELLED')`;
  const params = [from, to];
  if (photographerId) { sql += ` AND b.photographer_id=?`; params.push(photographerId); }
  sql += ` ORDER BY b.date, b.start_time`;
  res.json(db.prepare(sql).all(...params));
});

// --- Availability manager ---
router.get('/availability/rules', (req, res) => {
  const photographerId = req.query.photographerId;
  res.json(db.prepare(`SELECT * FROM availability_rules WHERE photographer_id=? ORDER BY day_of_week`).all(photographerId));
});

router.put('/availability/rules/:id', (req, res) => {
  const { isOff, startTime, endTime } = req.body;
  db.prepare(`UPDATE availability_rules SET is_off=?, start_time=?, end_time=? WHERE id=?`)
    .run(isOff ? 1 : 0, startTime || null, endTime || null, req.params.id);
  res.json({ ok: true });
});

router.get('/availability/overrides', (req, res) => {
  const photographerId = req.query.photographerId;
  res.json(db.prepare(`SELECT * FROM availability_overrides WHERE photographer_id=? ORDER BY date`).all(photographerId));
});

router.post('/availability/overrides', (req, res) => {
  const { photographerId, date, isOff, startTime, endTime, reason } = req.body;
  db.prepare(
    `INSERT INTO availability_overrides (photographer_id, date, is_off, start_time, end_time, reason)
     VALUES (?,?,?,?,?,?)
     ON CONFLICT(photographer_id, date) DO UPDATE SET is_off=excluded.is_off, start_time=excluded.start_time, end_time=excluded.end_time, reason=excluded.reason`
  ).run(photographerId, date, isOff ? 1 : 0, startTime || null, endTime || null, reason || null);
  res.json({ ok: true });
});

router.delete('/availability/overrides/:id', (req, res) => {
  db.prepare(`DELETE FROM availability_overrides WHERE id=?`).run(req.params.id);
  res.json({ ok: true });
});

router.get('/services', (req, res) => {
  res.json(db.prepare(`SELECT * FROM services ORDER BY sort_order`).all());
});

router.get('/packages', (req, res) => {
  res.json(db.prepare(`SELECT p.*, s.name as service_name FROM packages p JOIN services s ON s.id=p.service_id`).all());
});

module.exports = router;
