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

// Direct Image File Upload Route
router.post('/upload', (req, res) => {
  const { image } = req.body || {};
  if (!image || typeof image !== 'string' || !image.startsWith('data:image/')) {
    return res.status(400).json({ error: 'Valid image file data is required.' });
  }
  res.json({ ok: true, url: image });
});

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

const {
  syncCloudBookingsToDb,
  recordBookingToCloud,
  recordSettingsToCloud,
  recordPortfolioToCloud,
  recordServicesToCloud,
  syncCloudSettingsToDb,
  syncCloudPortfolioToDb
} = require('../lib/cloudStore');

router.get('/bookings', async (req, res) => {
  try {
    await syncCloudBookingsToDb(db);
  } catch (e) {
    console.error('Cloud sync error on /bookings:', e.message);
  }

  const { status, from, to } = req.query;
  let sql = `SELECT b.*, c.name AS client_name, c.phone AS client_phone, s.name AS service_name, p.name AS photographer_name,
             (SELECT proof_url FROM payments WHERE booking_id=b.id AND proof_url IS NOT NULL ORDER BY id DESC LIMIT 1) AS proof_url
             FROM bookings b
             JOIN clients c ON c.id=b.client_id
             JOIN services s ON s.id=b.service_id
             JOIN photographers p ON p.id=b.photographer_id
             WHERE 1=1`;
  const params = [];
  if (status) { sql += ` AND b.status=?`; params.push(status); }
  if (from) { sql += ` AND b.date>=?`; params.push(from); }
  if (to) { sql += ` AND b.date<=?`; params.push(to); }
  sql += ` ORDER BY b.date DESC, b.start_time DESC`;
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

router.post('/bookings/:id/status', async (req, res) => {
  try {
    await syncCloudBookingsToDb(db);
    let booking = db.prepare(`SELECT * FROM bookings WHERE id=? OR booking_code=?`).get(req.params.id, req.params.id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    const updated = setStatus(db, booking.id, req.body.status, 'admin', req.body.note || '');
    const b = db.prepare(`SELECT booking_code, status, payment_status FROM bookings WHERE id=?`).get(booking.id);
    if (b) {
      await recordBookingToCloud({ booking_code: b.booking_code, status: b.status, payment_status: b.payment_status });
    }
    res.json({ ok: true, from: updated.status, to: req.body.status });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.get('/calendar', async (req, res) => {
  try {
    await syncCloudBookingsToDb(db);
  } catch (e) {
    console.error('Cloud sync error on /calendar:', e.message);
  }

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

router.get('/photographer', (req, res) => {
  const p = db.prepare(`SELECT * FROM photographers ORDER BY id LIMIT 1`).get();
  res.json(p || {});
});

router.put('/photographer', async (req, res) => {
  const { name, bio, avatar_url } = req.body;
  const p = db.prepare(`SELECT id FROM photographers ORDER BY id LIMIT 1`).get();
  if (p) {
    db.prepare(`UPDATE photographers SET name=?, bio=?, avatar_url=? WHERE id=?`)
      .run(name || 'UMROH LENS', bio || '', avatar_url || '/img/photographer-1.jpg', p.id);
  } else {
    db.prepare(`INSERT INTO photographers (name, bio, avatar_url) VALUES (?,?,?)`)
      .run(name || 'UMROH LENS', bio || '', avatar_url || '/img/photographer-1.jpg');
  }
  await recordSettingsToCloud({
    photographer_name: name,
    photographer_bio: bio,
    photographer_avatar: avatar_url
  }).catch(() => {});
  res.json({ ok: true });
});

// --- Services & Price List Manager ---
router.get('/services-full', (req, res) => {
  const services = db.prepare(`SELECT * FROM services ORDER BY sort_order`).all();
  const full = services.map(s => {
    const packages = db.prepare(`SELECT * FROM packages WHERE service_id = ? ORDER BY price`).all(s.id);
    return { ...s, packages };
  });
  res.json(full);
});

router.put('/services/:id', async (req, res) => {
  const { name, description, cover_image, starting_price, currency, edited_photos } = req.body;
  db.prepare(
    `UPDATE services SET name=?, description=?, cover_image=?, starting_price=?, currency=?, edited_photos=? WHERE id=?`
  ).run(name, description, cover_image, Number(starting_price) || 0, currency || 'SAR', Number(edited_photos) || 0, req.params.id);
  await recordServicesToCloud(db).catch(() => {});
  res.json({ ok: true });
});

router.put('/packages/:id', async (req, res) => {
  const { name, description, price, currency, duration_minutes, edited_photos, deposit_percentage, cancellation_policy } = req.body;
  db.prepare(
    `UPDATE packages SET name=?, description=?, price=?, currency=?, duration_minutes=?, edited_photos=?, deposit_percentage=?, cancellation_policy=? WHERE id=?`
  ).run(
    name, description, Number(price) || 0, currency || 'SAR',
    Number(duration_minutes) || 30, Number(edited_photos) || 10,
    Number(deposit_percentage) || 30, cancellation_policy || '',
    req.params.id
  );
  await recordServicesToCloud(db).catch(() => {});
  res.json({ ok: true });
});

router.post('/packages', async (req, res) => {
  const { service_id, name, description, price, currency, duration_minutes, edited_photos, deposit_percentage, cancellation_policy } = req.body;
  const info = db.prepare(
    `INSERT INTO packages (service_id, name, description, price, currency, duration_minutes, edited_photos, deposit_percentage, cancellation_policy)
     VALUES (?,?,?,?,?,?,?,?,?)`
  );
  const result = info.run(
    service_id, name, description, Number(price) || 0, currency || 'SAR',
    Number(duration_minutes) || 30, Number(edited_photos) || 10,
    Number(deposit_percentage) || 30, cancellation_policy || ''
  );
  await recordServicesToCloud(db).catch(() => {});
  res.json({ ok: true, id: result.lastInsertRowid });
});

router.delete('/packages/:id', async (req, res) => {
  db.prepare(`DELETE FROM packages WHERE id=?`).run(req.params.id);
  await recordServicesToCloud(db).catch(() => {});
  res.json({ ok: true });
});

// --- Portfolio & Gallery Manager ---
router.get('/portfolio', async (req, res) => {
  try { await syncCloudPortfolioToDb(db); } catch(e) {}
  res.json(db.prepare(`SELECT * FROM portfolio WHERE active=1 ORDER BY sort_order, id DESC`).all());
});

router.post('/portfolio', async (req, res) => {
  const { image_url, title, category, description, location, featured, sort_order } = req.body;
  if (!image_url) return res.status(400).json({ error: 'Image URL is required.' });
  const info = db.prepare(
    `INSERT INTO portfolio (image_url, title, category, description, location, featured, sort_order)
     VALUES (?,?,?,?,?,?,?)`
  ).run(image_url, title || '', category || 'Portrait', description || '', location || 'Madinah', featured ? 1 : 0, Number(sort_order) || 0);
  await recordPortfolioToCloud(db).catch(() => {});
  res.json({ ok: true, id: info.lastInsertRowid });
});

router.put('/portfolio/:id', async (req, res) => {
  const { image_url, title, category, description, location, featured, sort_order } = req.body;
  db.prepare(
    `UPDATE portfolio SET image_url=?, title=?, category=?, description=?, location=?, featured=?, sort_order=? WHERE id=?`
  ).run(image_url, title, category, description, location, featured ? 1 : 0, Number(sort_order) || 0, req.params.id);
  await recordPortfolioToCloud(db).catch(() => {});
  res.json({ ok: true });
});

router.delete('/portfolio/:id', async (req, res) => {
  db.prepare(`DELETE FROM portfolio WHERE id=?`).run(req.params.id);
  await recordPortfolioToCloud(db).catch(() => {});
  res.json({ ok: true });
});

// --- Settings Manager (WhatsApp & Bank Accounts) ---
router.get('/settings', async (req, res) => {
  try { await syncCloudSettingsToDb(db); } catch (e) {}
  const rows = db.prepare(`SELECT key, value FROM settings`).all();
  const map = {};
  rows.forEach(r => { map[r.key] = r.value; });
  res.json(map);
});

router.put('/settings', async (req, res) => {
  const settings = req.body || {};
  const upsert = db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value`
  );
  for (const [key, val] of Object.entries(settings)) {
    upsert.run(key, String(val));
  }
  await recordSettingsToCloud(settings);
  res.json({ ok: true });
});

module.exports = router;
