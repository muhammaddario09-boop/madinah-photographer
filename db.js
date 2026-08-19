const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || (process.env.VERCEL ? path.join('/tmp', 'data.sqlite') : path.join(__dirname, 'data.sqlite'));

let db;
try {
  db = new Database(DB_PATH);
  if (process.env.VERCEL) {
    try { db.pragma('journal_mode = DELETE'); } catch(e) {}
  }
} catch(err) {
  // If opening failed (e.g. corrupted or locked), fallback to clean /tmp or memory
  const fallbackPath = process.env.VERCEL ? `/tmp/data_${Date.now()}.sqlite` : ':memory:';
  db = new Database(fallbackPath);
}

const { hashPassword } = require('./lib/auth');

const schema = fs.readFileSync(path.join(__dirname, 'db', 'schema.sql'), 'utf8');
db.exec(schema);

// Migration: add proof_url column to payments if not present
try {
  db.exec(`ALTER TABLE payments ADD COLUMN proof_url TEXT;`);
} catch (e) {}

function ensureSettings() {
  const defaults = {
    'studio_name': 'UMROH LENS',
    'min_booking_notice_hours': '12',
    'max_booking_window_days': '90',
    'cancellation_deadline_hours': '48',
    'buffer_minutes': '30',
    'max_sessions_per_day': '8',
    'admin_whatsapp': process.env.ADMIN_WHATSAPP || '+966501234567',
    'bank_sar_name': 'Al Rajhi Bank (Saudi Arabia)',
    'bank_sar_account': 'SA84 8000 0123 4567 8901 2345',
    'bank_sar_holder': 'UMROH LENS Photography Studio',
    'bank_idr_name': 'Bank Syariah Indonesia (BSI) / BCA',
    'bank_idr_account': '7123456789 (BSI) / 5420123456 (BCA)',
    'bank_idr_holder': 'UMROH LENS Photography',
    'idr_sar_rate': '4200'
  };

  const insertOrIgnore = db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`);
  for (const [k, v] of Object.entries(defaults)) {
    insertOrIgnore.run(k, v);
  }
}
ensureSettings();

function ensureAdminUser() {
  const adminCount = db.prepare(`SELECT COUNT(*) as count FROM users WHERE role='ADMIN'`).get().count;
  if (adminCount === 0) {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@madinahphoto.com';
    const adminPass = process.env.ADMIN_PASSWORD || 'AdminMadinah2026!';
    const passwordHash = hashPassword(adminPass);
    db.prepare(`INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'ADMIN')`).run(adminEmail, passwordHash);
  }
}
ensureAdminUser();

const photogCount = db.prepare(`SELECT COUNT(*) as count FROM photographers`).get().count;
if (photogCount === 0) {
  seed();
}

function ensureSampleBooking() {
  const existing = db.prepare(`SELECT id FROM bookings WHERE booking_code='MDN-2026-0001'`).get();
  if (!existing) {
    let client = db.prepare(`SELECT id FROM clients WHERE email='ahmad@example.com'`).get();
    if (!client) {
      const res = db.prepare(`INSERT INTO clients (name, email, phone, country) VALUES (?,?,?,?)`).run('Ahmad Dahlan', 'ahmad@example.com', '+628123456789', 'Indonesia');
      client = { id: res.lastInsertRowid };
    }
    const todayStr = new Date().toISOString().slice(0, 10);
    const bRes = db.prepare(
      `INSERT INTO bookings (booking_code, photographer_id, client_id, service_id, package_id, location_id, date, start_time, end_time, total_price, deposit_amount, currency, status, payment_status, occasion, number_of_people)
       VALUES (?, 1, ?, 1, 1, 1, ?, '16:00', '17:00', 650, 195, 'SAR', 'CONFIRMED', 'DEPOSIT_PAID', 'Umrah', 2)`
    ).run('MDN-2026-0001', client.id, todayStr);
    
    db.prepare(
      `INSERT INTO payments (booking_id, amount, currency, method, type, status, reference)
       VALUES (?, 195, 'SAR', 'BANK_TRANSFER', 'DEPOSIT', 'PAID', 'DP Transfer BSI')`
    ).run(bRes.lastInsertRowid);
  }
}
ensureSampleBooking();

function seed() {
  const insertPhotographer = db.prepare(
    `INSERT INTO photographers (name, bio, avatar_url) VALUES (?,?,?)`
  );
  const p = insertPhotographer.run(
    'UMROH LENS',
    'Professional editorial & pilgrimage photography studio based in Madinah Al-Munawwarah. Specializing in Umrah moments, couple portraits, family memories, and golden-hour sessions around Masjid Nabawi.',
    '/img/photographer-1.jpg'
  );
  const photographerId = p.lastInsertRowid;

  const weekly = [
    [0, 0, '08:00', '20:00'], // Sunday
    [1, 0, '08:00', '20:00'], // Monday
    [2, 0, '08:00', '20:00'], // Tuesday
    [3, 1, null, null],       // Wednesday OFF
    [4, 0, '14:00', '21:00'], // Thursday
    [5, 0, '14:00', '21:00'], // Friday
    [6, 0, '08:00', '21:00'], // Saturday
  ];
  const insertRule = db.prepare(
    `INSERT INTO availability_rules (photographer_id, day_of_week, is_off, start_time, end_time) VALUES (?,?,?,?,?)`
  );
  weekly.forEach(([dow, isOff, s, e]) => insertRule.run(photographerId, dow, isOff, s, e));

  const insertService = db.prepare(
    `INSERT INTO services (name, slug, description, cover_image, duration_minutes, starting_price, currency, edited_photos, sort_order)
     VALUES (?,?,?,?,?,?,?,?,?)`
  );
  const services = [
    ['Madinah Portrait', 'madinah-portrait', 'Individual editorial portraits around the city\'s most timeless corners.', '/img/service-portrait.jpg', 60, 450, 'SAR', 15, 1],
    ['Couple Session', 'couple-session', 'Intimate couple photography set against Madinah\'s golden stone and quiet streets.', '/img/service-couple.jpg', 60, 650, 'SAR', 20, 2],
    ['Family Session', 'family-session', 'Warm, unposed family and group photography.', '/img/service-family.jpg', 90, 850, 'SAR', 30, 3],
    ['Umrah Memory Session', 'umrah-memory-session', 'Documenting the quiet, meaningful moments of your pilgrimage.', '/img/service-umrah.jpg', 45, 400, 'SAR', 12, 4],
    ['Golden Hour Session', 'golden-hour-session', 'Photography timed to sunrise or sunset light.', '/img/service-golden-hour.jpg', 60, 700, 'SAR', 20, 5],
    ['Private Tour + Photography', 'private-tour-photography', 'A guided location experience paired with a full photography session.', '/img/service-tour.jpg', 120, 1400, 'SAR', 40, 6],
  ];
  const serviceIds = {};
  services.forEach((s) => {
    const info = insertService.run(...s);
    serviceIds[s[1]] = info.lastInsertRowid;
  });

  const insertPackage = db.prepare(
    `INSERT INTO packages (service_id, name, description, price, currency, duration_minutes, edited_photos, raw_photos_included, deposit_percentage, cancellation_policy)
     VALUES (?,?,?,?,?,?,?,?,?,?)`
  );
  Object.values(serviceIds).forEach((serviceId) => {
    insertPackage.run(serviceId, 'Essential', '30 minutes, 10 edited photos', 350, 'SAR', 30, 10, 0, 30, 'Full refund up to 48 hours before the session.');
    insertPackage.run(serviceId, 'Signature', '60 minutes, 25 edited photos', 650, 'SAR', 60, 25, 0, 30, 'Full refund up to 48 hours before the session.');
    insertPackage.run(serviceId, 'Premium', '90 minutes, 50 edited photos', 950, 'SAR', 90, 50, 1, 30, '50% refund up to 48 hours before the session.');
  });

  const insertLocation = db.prepare(
    `INSERT INTO locations (name, description, travel_buffer_minutes) VALUES (?,?,?)`
  );
  [
    ['Masjid Nabawi Area', 'The Prophet\'s Mosque and surrounding plazas.', 15],
    ['Quba Area', 'The first mosque built in Islam.', 30],
    ['Uhud Area', 'The historic mountain and battlefield site.', 30],
    ['Al Madinah Heritage Area', 'Old-city streets and heritage architecture.', 20],
    ['Hotel', 'In-hotel or hotel-lobby session.', 10],
    ['Private Location', 'A location you specify.', 30],
  ].forEach((l) => insertLocation.run(...l));
}

module.exports = db;
