const express = require('express');
const router = express.Router();
const db = require('../db');
const { setStatus } = require('../lib/bookingEngine');
const { todayRiyadhISODate } = require('../lib/timezone');
const { verifyPassword, hashPassword, generateToken, verifyToken } = require('../lib/auth');
const {
  fetchPortfolioFromSupabase,
  recordPortfolioToSupabase,
  deletePortfolioFromSupabase,
  fetchBookingsFromSupabase,
  fetchDashboardStatsFromSupabase,
  fetchBookingDetailsFromSupabase,
  updateBookingStatusInSupabase,
  updateBookingDriveUrlInSupabase,
  deleteBookingFromSupabase,
  resetAllBookingsInSupabase,
  fetchServicesFromSupabase,
  updateServiceInSupabase,
  createServiceInSupabase,
  deleteServiceInSupabase,
  updatePackageInSupabase,
  createPackageInSupabase,
  deletePackageInSupabase,
  fetchLocationsFromSupabase,
  updateLocationInSupabase,
  createLocationInSupabase,
  deleteLocationInSupabase,
  fetchSettingsFromSupabase,
  updateSettingsInSupabase,
  fetchPhotographersFromSupabase,
  updatePhotographerInSupabase,
  updateUserPasswordInSupabase
} = require('../lib/supabase');

// Public Login Route
router.post('/login', (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const adminEmail = process.env.ADMIN_EMAIL || 'admin@madinahphoto.com';
    const adminPass = process.env.ADMIN_PASSWORD || 'AdminMadinah2026!';

    // Direct master credential check OR database hash verification
    const isMasterMatch = (email.trim().toLowerCase() === adminEmail.toLowerCase() && password === adminPass);

    let user = null;
    try {
      user = db.prepare(`SELECT * FROM users WHERE email = ? COLLATE NOCASE`).get(email.trim());
    } catch(e) {}

    const isValid = isMasterMatch || (user && verifyPassword(password, user.password_hash));

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const userId = user ? user.id : 1;
    const token = generateToken({
      id: userId,
      email: email.trim(),
      role: 'ADMIN'
    });

    res.json({
      ok: true,
      token,
      user: {
        id: userId,
        email: email.trim(),
        role: 'ADMIN'
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Login processing error: ' + err.message });
  }
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

  let user = null;
  try {
    user = db.prepare(`SELECT id, email, role FROM users WHERE id = ?`).get(payload.id);
  } catch (e) {}

  req.user = user || { id: payload.id || 1, email: payload.email || 'admin@madinahphoto.com', role: 'ADMIN' };
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
router.post('/change-password', async (req, res) => {
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
  await updateUserPasswordInSupabase(req.user.email || 'admin@madinahphoto.com', newHash).catch(() => {});

  res.json({ ok: true, message: 'Password successfully updated.' });
});

router.get('/dashboard', async (req, res) => {
  const today = todayRiyadhISODate();
  const supaStats = await fetchDashboardStatsFromSupabase(today);
  if (supaStats) return res.json(supaStats);

  const todayShoots = db.prepare(`SELECT COUNT(*) n FROM bookings WHERE date=? AND status NOT IN ('CANCELLED','NO_SHOW')`).get(today).n;
  const upcoming = db.prepare(`SELECT COUNT(*) n FROM bookings WHERE date>? AND status IN ('CONFIRMED','PENDING','AWAITING_PAYMENT')`).get(today).n;
  const pendingPayments = db.prepare(`SELECT COUNT(*) n FROM bookings WHERE payment_status='UNPAID' AND status NOT IN ('CANCELLED')`).get().n;
  const revenue = db.prepare(`SELECT COALESCE(SUM(total_price),0) r FROM bookings WHERE payment_status IN ('DEPOSIT_PAID','PAID') AND status NOT IN ('CANCELLED')`).get().r;
  res.json({ todayShoots, upcoming, pendingPayments, revenue });
});

const {
  recordBookingToCloud,
  removeBookingFromCloud,
  resetAllBookingsInCloud,
  recordSettingsToCloud,
  recordPortfolioToCloud,
  recordServicesToCloud,
  recordLocationsToCloud
} = require('../lib/cloudStore');

router.get('/bookings', async (req, res) => {
  const { status, from, to } = req.query;
  const supaBookings = await fetchBookingsFromSupabase({ status, from, to });
  if (supaBookings !== null) {
    return res.json(supaBookings);
  }

  let sql = `SELECT b.*, 
             COALESCE(c.name, 'Guest') AS client_name, 
             COALESCE(c.phone, '') AS client_phone, 
             COALESCE(s.name, 'Madinah Session') AS service_name, 
             COALESCE(p.name, 'UMROH LENS') AS photographer_name,
             (SELECT proof_url FROM payments WHERE booking_id=b.id AND proof_url IS NOT NULL ORDER BY id DESC LIMIT 1) AS proof_url
             FROM bookings b
             LEFT JOIN clients c ON c.id=b.client_id
             LEFT JOIN services s ON s.id=b.service_id
             LEFT JOIN photographers p ON p.id=b.photographer_id
             WHERE 1=1`;
  const params = [];
  if (status) { sql += ` AND b.status=?`; params.push(status); }
  if (from) { sql += ` AND b.date>=?`; params.push(from); }
  if (to) { sql += ` AND b.date<=?`; params.push(to); }
  sql += ` ORDER BY b.date DESC, b.start_time DESC`;
  try {
    res.json(db.prepare(sql).all(...params));
  } catch(err) {
    console.error('Admin /bookings SQL error:', err.message);
    res.json([]);
  }
});

router.get('/bookings/:id', async (req, res) => {
  const supaDetails = await fetchBookingDetailsFromSupabase(req.params.id);
  if (supaDetails) return res.json(supaDetails);

  const booking = db.prepare(`SELECT * FROM bookings WHERE id=?`).get(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Not found' });
  const client = db.prepare(`SELECT * FROM clients WHERE id=?`).get(booking.client_id);
  const history = db.prepare(`SELECT * FROM booking_history WHERE booking_id=? ORDER BY created_at`).all(booking.id);
  const payments = db.prepare(`SELECT * FROM payments WHERE booking_id=?`).all(booking.id);
  res.json({ booking, client, history, payments });
});

router.post('/bookings/:id/status', async (req, res) => {
  try {
    const { status, payment_status, note } = req.body || {};
    await updateBookingStatusInSupabase(req.params.id, status, payment_status, note);

    let booking = db.prepare(`SELECT * FROM bookings WHERE id=? OR booking_code=?`).get(req.params.id, req.params.id);
    if (booking) {
      let newBookingStatus = booking.status;
      let newPaymentStatus = booking.payment_status;
      if (status) newBookingStatus = status;
      if (payment_status) newPaymentStatus = payment_status;

      db.prepare(`UPDATE bookings SET status = ?, payment_status = ?, updated_at = datetime('now') WHERE id = ?`).run(
        newBookingStatus, newPaymentStatus, booking.id
      );

      recordBookingToCloud({ booking_code: booking.booking_code, status: newBookingStatus, payment_status: newPaymentStatus }).catch(() => {});
    }

    res.json({ ok: true, from: booking ? booking.status : null, to: payment_status || status, booking_id: req.params.id });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.post('/bookings/:id/drive', async (req, res) => {
  try {
    const { drive_url } = req.body || {};
    const cleanUrl = String(drive_url || '').trim();

    let booking = db.prepare(`SELECT * FROM bookings WHERE id=? OR booking_code=?`).get(req.params.id, req.params.id);
    if (booking) {
      db.prepare(`UPDATE bookings SET drive_url = ?, updated_at = datetime('now') WHERE id = ?`).run(
        cleanUrl || null, booking.id
      );
      recordBookingToCloud({ booking_code: booking.booking_code, drive_url: cleanUrl || null }).catch(() => {});
    }

    await updateBookingDriveUrlInSupabase(req.params.id, cleanUrl).catch(() => {});

    res.json({ ok: true, drive_url: cleanUrl, booking_id: req.params.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/bookings/:id', async (req, res) => {
  try {
    await deleteBookingFromSupabase(req.params.id);
    const booking = db.prepare(`SELECT id, booking_code FROM bookings WHERE id=? OR booking_code=?`).get(req.params.id, req.params.id);
    if (booking) {
      db.prepare(`DELETE FROM payments WHERE booking_id=?`).run(booking.id);
      db.prepare(`DELETE FROM booking_history WHERE booking_id=?`).run(booking.id);
      db.prepare(`DELETE FROM notifications WHERE booking_id=?`).run(booking.id);
      db.prepare(`DELETE FROM bookings WHERE id=?`).run(booking.id);
      removeBookingFromCloud(booking.booking_code).catch(() => {});
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/bookings/reset-all', async (req, res) => {
  try {
    await resetAllBookingsInSupabase();
    db.prepare(`DELETE FROM payments`).run();
    db.prepare(`DELETE FROM booking_history`).run();
    db.prepare(`DELETE FROM notifications`).run();
    db.prepare(`DELETE FROM bookings`).run();
    resetAllBookingsInCloud().catch(() => {});
    res.json({ ok: true, message: 'All bookings cleared successfully.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/calendar', async (req, res) => {
  try {
    const supaBookings = await fetchBookingsFromSupabase();
    if (supaBookings !== null) {
      return res.json(supaBookings.map(b => ({
        id: b.id,
        booking_code: b.booking_code,
        date: b.date,
        start_time: b.start_time,
        end_time: b.end_time,
        service_name: b.service_name,
        client_name: b.client_name,
        client_phone: b.client_phone,
        status: b.status,
        payment_status: b.payment_status
      })));
    }

    const from = req.query.from || '2000-01-01';
    const to = req.query.to || '2099-12-31';
    const photographerId = req.query.photographerId;
    let sql = `SELECT b.id, b.booking_code, b.date, b.start_time, b.end_time, b.status,
               COALESCE(c.name, 'Guest') AS client_name, 
               COALESCE(s.name, 'Madinah Session') AS service_name, 
               COALESCE(p.name, 'UMROH LENS') AS photographer_name
               FROM bookings b
               LEFT JOIN clients c ON c.id=b.client_id
               LEFT JOIN services s ON s.id=b.service_id
               LEFT JOIN photographers p ON p.id=b.photographer_id
               WHERE b.date BETWEEN ? AND ? AND b.status NOT IN ('CANCELLED')`;
    const params = [from, to];
    if (photographerId) { sql += ` AND b.photographer_id=?`; params.push(photographerId); }
    sql += ` ORDER BY b.date, b.start_time`;
    res.json(db.prepare(sql).all(...params));
  } catch (err) {
    res.json([]);
  }
});

// --- Availability manager ---
router.get('/availability/rules', (req, res) => {
  const photoRow = db.prepare(`SELECT id FROM photographers LIMIT 1`).get();
  const photographerId = req.query.photographerId || (photoRow ? photoRow.id : 1);
  res.json(db.prepare(`SELECT * FROM availability_rules WHERE photographer_id=? ORDER BY day_of_week`).all(photographerId));
});

router.put('/availability/rules/:id', (req, res) => {
  const { isOff, startTime, endTime } = req.body;
  db.prepare(`UPDATE availability_rules SET is_off=?, start_time=?, end_time=? WHERE id=?`)
    .run(isOff ? 1 : 0, startTime || null, endTime || null, req.params.id);
  res.json({ ok: true });
});

router.get('/availability/overrides', (req, res) => {
  const photoRow = db.prepare(`SELECT id FROM photographers LIMIT 1`).get();
  const photographerId = req.query.photographerId || (photoRow ? photoRow.id : 1);
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

router.get('/photographer', async (req, res) => {
  try {
    const supaPhotos = await fetchPhotographersFromSupabase();
    if (supaPhotos && supaPhotos[0]) return res.json(supaPhotos[0]);
    const p = db.prepare(`SELECT * FROM photographers ORDER BY id LIMIT 1`).get();
    res.json(p || { name: 'UMROH LENS', avatar_url: '/img/photographer-1.jpg', bio: '' });
  } catch (e) {
    res.json({ name: 'UMROH LENS', avatar_url: '/img/photographer-1.jpg', bio: '' });
  }
});

router.put('/photographer', async (req, res) => {
  try {
    const { name, bio, avatar_url } = req.body || {};
    await updatePhotographerInSupabase({ name, bio, avatar_url }).catch(() => {});
    const p = db.prepare(`SELECT id FROM photographers ORDER BY id LIMIT 1`).get();
    if (p) {
      db.prepare(`UPDATE photographers SET name=?, bio=?, avatar_url=? WHERE id=?`)
        .run(name || 'UMROH LENS', bio || '', avatar_url || '/img/photographer-1.jpg', p.id);
    } else {
      db.prepare(`INSERT INTO photographers (name, bio, avatar_url) VALUES (?,?,?)`)
        .run(name || 'UMROH LENS', bio || '', avatar_url || '/img/photographer-1.jpg');
    }
    recordSettingsToCloud({
      photographer_name: name,
      photographer_bio: bio,
      photographer_avatar: avatar_url
    }).catch(() => {});
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Services & Price List Manager ---
router.get('/services-full', async (req, res) => {
  try {
    const supaServices = await fetchServicesFromSupabase();
    if (supaServices) return res.json(supaServices);
    const services = db.prepare(`SELECT * FROM services ORDER BY sort_order`).all();
    const full = services.map(s => {
      const packages = db.prepare(`SELECT * FROM packages WHERE service_id = ? ORDER BY price`).all(s.id);
      return { ...s, packages };
    });
    res.json(full);
  } catch (err) {
    res.json([]);
  }
});

router.put('/services/:id', async (req, res) => {
  const { name, description, cover_image, starting_price, currency, edited_photos } = req.body;
  await updateServiceInSupabase(req.params.id, {
    name, description, cover_image,
    starting_price: Number(starting_price) || 0,
    currency: currency || 'SAR',
    edited_photos: Number(edited_photos) || 0
  }).catch(() => {});
  db.prepare(
    `UPDATE services SET name=?, description=?, cover_image=?, starting_price=?, currency=?, edited_photos=? WHERE id=?`
  ).run(name, description, cover_image, Number(starting_price) || 0, currency || 'SAR', Number(edited_photos) || 0, req.params.id);
  recordServicesToCloud(db).catch(() => {});
  res.json({ ok: true });
});

router.post('/services', async (req, res) => {
  const { name, slug, description, cover_image, duration_minutes, starting_price, currency, edited_photos, sort_order } = req.body;
  const created = await createServiceInSupabase({
    name,
    slug: slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    description: description || '',
    cover_image: cover_image || '/img/service-golden-hour.jpg',
    duration_minutes: Number(duration_minutes) || 60,
    starting_price: Number(starting_price) || 350,
    currency: currency || 'SAR',
    edited_photos: Number(edited_photos) || 10,
    sort_order: Number(sort_order) || 0,
    active: 1
  }).catch(() => {});

  const info = db.prepare(
    `INSERT INTO services (name, slug, description, cover_image, duration_minutes, starting_price, currency, edited_photos, sort_order)
     VALUES (?,?,?,?,?,?,?,?,?)`
  );
  const result = info.run(
    name, slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    description || '', cover_image || '/img/service-golden-hour.jpg',
    Number(duration_minutes) || 60, Number(starting_price) || 350,
    currency || 'SAR', Number(edited_photos) || 10, Number(sort_order) || 0
  );
  recordServicesToCloud(db).catch(() => {});
  res.json({ ok: true, id: created ? created.id : result.lastInsertRowid });
});

router.delete('/services/:id', async (req, res) => {
  await deleteServiceInSupabase(req.params.id).catch(() => {});
  db.prepare(`DELETE FROM packages WHERE service_id=?`).run(req.params.id);
  db.prepare(`DELETE FROM services WHERE id=?`).run(req.params.id);
  recordServicesToCloud(db).catch(() => {});
  res.json({ ok: true });
});

router.put('/packages/:id', async (req, res) => {
  const { name, description, price, currency, duration_minutes, edited_photos, deposit_percentage, cancellation_policy } = req.body;
  await updatePackageInSupabase(req.params.id, {
    name, description,
    price: Number(price) || 0,
    currency: currency || 'SAR',
    duration_minutes: Number(duration_minutes) || 30,
    edited_photos: Number(edited_photos) || 10,
    deposit_percentage: Number(deposit_percentage) || 30,
    cancellation_policy: cancellation_policy || ''
  }).catch(() => {});
  db.prepare(
    `UPDATE packages SET name=?, description=?, price=?, currency=?, duration_minutes=?, edited_photos=?, deposit_percentage=?, cancellation_policy=? WHERE id=?`
  ).run(
    name, description, Number(price) || 0, currency || 'SAR',
    Number(duration_minutes) || 30, Number(edited_photos) || 10,
    Number(deposit_percentage) || 30, cancellation_policy || '',
    req.params.id
  );
  recordServicesToCloud(db).catch(() => {});
  res.json({ ok: true });
});

router.post('/packages', async (req, res) => {
  const { service_id, name, description, price, currency, duration_minutes, edited_photos, deposit_percentage, cancellation_policy } = req.body;
  const created = await createPackageInSupabase({
    service_id: Number(service_id),
    name,
    description: description || '',
    price: Number(price) || 0,
    currency: currency || 'SAR',
    duration_minutes: Number(duration_minutes) || 30,
    edited_photos: Number(edited_photos) || 10,
    deposit_percentage: Number(deposit_percentage) || 30,
    cancellation_policy: cancellation_policy || '',
    active: 1
  }).catch(() => {});

  const info = db.prepare(
    `INSERT INTO packages (service_id, name, description, price, currency, duration_minutes, edited_photos, deposit_percentage, cancellation_policy)
     VALUES (?,?,?,?,?,?,?,?,?)`
  );
  const result = info.run(
    service_id, name, description, Number(price) || 0, currency || 'SAR',
    Number(duration_minutes) || 30, Number(edited_photos) || 10,
    Number(deposit_percentage) || 30, cancellation_policy || ''
  );
  recordServicesToCloud(db).catch(() => {});
  res.json({ ok: true, id: created ? created.id : result.lastInsertRowid });
});

router.delete('/packages/:id', async (req, res) => {
  await deletePackageInSupabase(req.params.id).catch(() => {});
  db.prepare(`DELETE FROM packages WHERE id=?`).run(req.params.id);
  recordServicesToCloud(db).catch(() => {});
  res.json({ ok: true });
});

// --- Locations & Shooting Spots Manager ---
router.get('/locations', async (req, res) => {
  try {
    const supaLocs = await fetchLocationsFromSupabase();
    if (supaLocs) return res.json(supaLocs);
    const locations = db.prepare(`SELECT * FROM locations ORDER BY id`).all();
    res.json(locations);
  } catch(e) {
    res.json([]);
  }
});

router.post('/locations', async (req, res) => {
  try {
    const { name, description, travel_buffer_minutes } = req.body;
    if (!name) return res.status(400).json({ error: 'Location name is required.' });
    const created = await createLocationInSupabase({
      name: name.trim(),
      description: description || '',
      travel_buffer_minutes: Number(travel_buffer_minutes) || 15,
      active: 1
    }).catch(() => {});

    const info = db.prepare(
      `INSERT INTO locations (name, description, travel_buffer_minutes) VALUES (?,?,?)`
    ).run(name.trim(), description || '', Number(travel_buffer_minutes) || 15);
    recordLocationsToCloud(db).catch(() => {});
    res.json({ ok: true, id: created ? created.id : info.lastInsertRowid });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

const handleLocationUpdate = async (req, res) => {
  try {
    const { name, description, travel_buffer_minutes } = req.body;
    await updateLocationInSupabase(req.params.id, {
      name: name.trim(),
      description: description || '',
      travel_buffer_minutes: Number(travel_buffer_minutes) || 15
    }).catch(() => {});

    db.prepare(
      `UPDATE locations SET name=?, description=?, travel_buffer_minutes=? WHERE id=?`
    ).run(name.trim(), description || '', Number(travel_buffer_minutes) || 15, req.params.id);
    recordLocationsToCloud(db).catch(() => {});
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
};

router.put('/locations/:id', handleLocationUpdate);
router.patch('/locations/:id', handleLocationUpdate);

router.delete('/locations/:id', async (req, res) => {
  try {
    await deleteLocationInSupabase(req.params.id).catch(() => {});
    db.prepare(`DELETE FROM locations WHERE id=?`).run(req.params.id);
    recordLocationsToCloud(db).catch(() => {});
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Portfolio & Gallery Manager ---
router.get('/portfolio', async (req, res) => {
  try {
    const supaPhotos = await fetchPortfolioFromSupabase();
    if (supaPhotos !== null) {
      return res.json(supaPhotos);
    }
    const items = db.prepare(`SELECT * FROM portfolio ORDER BY sort_order, id DESC`).all();
    res.json(items || []);
  } catch (err) {
    res.json([]);
  }
});

router.post('/portfolio', async (req, res) => {
  const { image_url, title, category, description, location, featured, sort_order } = req.body;
  if (!image_url) return res.status(400).json({ error: 'Image URL is required.' });
  await recordPortfolioToSupabase(req.body).catch(() => {});
  const info = db.prepare(
    `INSERT INTO portfolio (image_url, title, category, description, location, featured, sort_order)
     VALUES (?,?,?,?,?,?,?)`
  );
  info.run(image_url, title || '', category || 'Portrait', description || '', location || 'Madinah', featured ? 1 : 0, Number(sort_order) || 0);
  await recordPortfolioToCloud(db).catch(() => {});
  res.json({ ok: true });
});

router.put('/portfolio/:id', async (req, res) => {
  const { image_url, title, category, description, location, featured, sort_order } = req.body;
  await recordPortfolioToSupabase({ ...req.body, id: req.params.id }).catch(() => {});
  db.prepare(
    `UPDATE portfolio SET image_url=?, title=?, category=?, description=?, location=?, featured=?, sort_order=? WHERE id=?`
  ).run(image_url, title, category, description, location, featured ? 1 : 0, Number(sort_order) || 0, req.params.id);
  await recordPortfolioToCloud(db).catch(() => {});
  res.json({ ok: true });
});

router.delete('/portfolio/:id', async (req, res) => {
  await deletePortfolioFromSupabase(req.params.id).catch(() => {});
  db.prepare(`DELETE FROM portfolio WHERE id=?`).run(req.params.id);
  await recordPortfolioToCloud(db).catch(() => {});
  res.json({ ok: true });
});

// --- Settings Manager (WhatsApp & Bank Accounts) ---
router.get('/settings', async (req, res) => {
  try {
    const supaSettings = await fetchSettingsFromSupabase();
    if (supaSettings) return res.json(supaSettings);
    const rows = db.prepare(`SELECT key, value FROM settings`).all();
    const map = {};
    rows.forEach(r => { map[r.key] = r.value; });
    res.json(map);
  } catch (e) {
    res.json({});
  }
});

router.put('/settings', async (req, res) => {
  const settings = req.body || {};
  await updateSettingsInSupabase(settings).catch(() => {});
  const upsert = db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value`
  );
  for (const [key, val] of Object.entries(settings)) {
    upsert.run(key, String(val));
  }
  recordSettingsToCloud(settings).catch(() => {});
  res.json({ ok: true });
});

module.exports = router;
