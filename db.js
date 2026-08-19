const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || (process.env.VERCEL ? path.join('/tmp', 'data.sqlite') : path.join(__dirname, 'data.sqlite'));
const isNew = !fs.existsSync(DB_PATH);
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

const { hashPassword } = require('./lib/auth');

const schema = fs.readFileSync(path.join(__dirname, 'db', 'schema.sql'), 'utf8');
db.exec(schema);

function ensureAdminUser() {
  const adminCount = db.prepare(`SELECT COUNT(*) as count FROM users WHERE role='ADMIN'`).get().count;
  if (adminCount === 0) {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@madinahphoto.com';
    const adminPass = process.env.ADMIN_PASSWORD || 'AdminMadinah2026!';
    const passwordHash = hashPassword(adminPass);
    db.prepare(`INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'ADMIN')`).run(adminEmail, passwordHash);
    console.log(`Created default admin user: ${adminEmail}`);
  }
}
ensureAdminUser();

if (isNew) seed();

function seed() {
  const insertPhotographer = db.prepare(
    `INSERT INTO photographers (name, bio, avatar_url) VALUES (?,?,?)`
  );
  const p = insertPhotographer.run(
    'Yusuf Al-Madani',
    'Editorial photographer based in Madinah, specializing in pilgrimage, portrait, and golden-hour storytelling around the Prophet\'s Mosque.',
    '/img/photographer-1.jpg'
  );
  const photographerId = p.lastInsertRowid;

  // Weekly schedule per spec section 13.
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

  db.prepare(`INSERT INTO settings (key, value) VALUES ('min_booking_notice_hours', '12')`).run();
  db.prepare(`INSERT INTO settings (key, value) VALUES ('max_booking_window_days', '90')`).run();
  db.prepare(`INSERT INTO settings (key, value) VALUES ('cancellation_deadline_hours', '48')`).run();
  db.prepare(`INSERT INTO settings (key, value) VALUES ('buffer_minutes', '30')`).run();
  db.prepare(`INSERT INTO settings (key, value) VALUES ('max_sessions_per_day', '8')`).run();

  console.log('Seeded database with 1 photographer, 6 services, 18 packages, 6 locations.');
}

module.exports = db;
