const express = require('express');
const router = express.Router();
const db = require('../db');
const { setStatus } = require('../lib/bookingEngine');
const { todayRiyadhISODate } = require('../lib/timezone');
const { verifyPassword, hashPassword, generateToken, verifyToken } = require('../lib/auth');

// Public Login Route
router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const user = db.prepare(`SELECT * FROM users WHERE email = ? COLLATE NOCASE`).get(email.trim());
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  if (user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Access denied: Admin privileges required.' });
  }

  const token = generateToken({
    id: user.id,
    email: user.email,
    role: user.role
  });

  res.json({
    ok: true,
    token,
    user: {
      id: user.id,
      email: user.email,
      role: user.role
    }
  });
});

// Middleware for Admin Authentication
function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization || req.headers['x-admin-token'] || req.query.token;
  let token = null;

  if (authHeader) {
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    } else {
      token = String(authHeader).trim();
    }
  }

  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please login.' });
  }

  const payload = verifyToken(token);
  if (!payload || payload.role !== 'ADMIN') {
    return res.status(401).json({ error: 'Invalid or expired session. Please login again.' });
  }

  const user = db.prepare(`SELECT id, email, role FROM users WHERE id = ?`).get(payload.id);
  if (!user || user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Admin account not found or disabled.' });
  }

  req.user = user;
  next();
}

// Apply authentication guard to all subsequent routes
router.use(requireAdmin);

// Current Admin Profile
router.get('/me', (req, res) => {
  res.json({ user: req.user });
});

// Change Password Route
router.post('/change-password', (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and new password are required.' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters.' });
  }

  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.id);
  if (!user || !verifyPassword(currentPassword, user.password_hash)) {
    return res.status(400).json({ error: 'Current password is incorrect.' });
  }

  const newHash = hashPassword(newPassword);
  db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).run(newHash, req.user.id);

  res.json({ ok: true, message: 'Password successfully updated.' });
});

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
