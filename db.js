const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || (process.env.VERCEL ? ':memory:' : path.join(__dirname, 'data.sqlite'));

let db;
try {
  db = new Database(DB_PATH, { timeout: 10000 });
} catch (err) {
  db = new Database(':memory:', { timeout: 10000 });
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
    'admin_whatsapp': process.env.ADMIN_WHATSAPP || '+6282175272547',
    'admin_whatsapp_2': process.env.ADMIN_WHATSAPP_2 || '+6281234567890',
    'instagram_url': 'https://instagram.com/umrohlens',
    'instagram_handle': '@umrohlens',
    'bank_sar_name': 'Al Rajhi Bank (Saudi Arabia)',
    'bank_sar_account': 'SA84 8000 0123 4567 8901 2345',
    'bank_sar_holder': 'UMROH LENS Photography Studio',
    'bank_idr_name': 'Bank Central Asia (BCA)',
    'bank_idr_account': '5420123456 (BCA)',
    'bank_idr_holder': 'WAHYU AFRIANSYAH',
    'idr_sar_rate': '4200'
  };

  const insertOrIgnore = db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`);
  for (const [k, v] of Object.entries(defaults)) {
    insertOrIgnore.run(k, v);
  }
}
ensureSettings();

function ensureAvailabilityRules() {
  try {
    const rules = db.prepare(`SELECT COUNT(*) n FROM availability_rules`).get();
    if (rules && rules.n > 0) {
      db.prepare(`UPDATE availability_rules SET is_off=0, start_time='05:30', end_time='22:30' WHERE is_off=1 OR start_time > '06:00'`).run();
    }
  } catch (e) {}
}
ensureAvailabilityRules();

function ensureAdminUser() {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@madinahphoto.com';
  const adminPass = process.env.ADMIN_PASSWORD || 'AdminMadinah2026!';
  const passwordHash = hashPassword(adminPass);

  const existing = db.prepare(`SELECT id FROM users WHERE email=? COLLATE NOCASE`).get(adminEmail);
  if (existing) {
    db.prepare(`UPDATE users SET password_hash=?, role='ADMIN' WHERE id=?`).run(passwordHash, existing.id);
  } else {
    db.prepare(`INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'ADMIN')`).run(adminEmail, passwordHash);
  }
}
ensureAdminUser();

const photogCount = db.prepare(`SELECT COUNT(*) as count FROM photographers`).get().count;
if (photogCount === 0) {
  seed();
}
function ensureExtendedServicesAndLocations() {
  const extraServices = [
    ['Cinematic Video & Reels', 'cinematic-video-reels', '4K Video Reels (60s) for Instagram & TikTok with cinematic sound grading and color tone.', '/img/service-reels.jpg', 60, 750, 'SAR', 25, 7],
    ['Drone & Landmark Perspective', 'drone-landmark-perspective', 'Aerial 4K drone cinematography and wide landmark photography across Madinah & historic sites.', '/img/service-drone.jpg', 90, 1200, 'SAR', 35, 8],
  ];

  const insertService = db.prepare(
    `INSERT INTO services (name, slug, description, cover_image, duration_minutes, starting_price, currency, edited_photos, sort_order)
     VALUES (?,?,?,?,?,?,?,?,?)`
  );
  const insertPackage = db.prepare(
    `INSERT INTO packages (service_id, name, description, price, currency, duration_minutes, edited_photos, raw_photos_included, deposit_percentage, cancellation_policy)
     VALUES (?,?,?,?,?,?,?,?,?,?)`
  );

  extraServices.forEach(s => {
    const exists = db.prepare(`SELECT id FROM services WHERE slug=?`).get(s[1]);
    if (!exists) {
      const info = insertService.run(...s);
      const serviceId = info.lastInsertRowid;
      insertPackage.run(serviceId, 'Essential Reels', '45 minutes, 1 Cinematic Reel (60s) + 15 edited photos', 650, 'SAR', 45, 15, 1, 30, 'Full refund up to 48 hours before the session.');
      insertPackage.run(serviceId, 'Signature Creator', '75 minutes, 2 Cinematic Reels (60s) + 30 edited photos + Drone', 1100, 'SAR', 75, 30, 1, 30, 'Full refund up to 48 hours before the session.');
      insertPackage.run(serviceId, 'VVIP Complete Story', '120 minutes, 3 Cinematic Reels + Full Drone + All RAW + 50 photos', 1600, 'SAR', 120, 50, 1, 30, '50% refund up to 48 hours before the session.');
    }
  });

  const extraLocations = [
    ['Bir Ali & Qiblatain Area', 'Historic miqat and two-qibla heritage mosque.', 25],
    ['AlUla Heritage Expedition', 'Exclusive desert rock heritage expedition in Hegra & Elephant Rock.', 60],
    ['Makkah Al-Mukarramah (Special Request)', 'Private pilgrimage documentation in Holy Makkah.', 60],
  ];

  const insertLocation = db.prepare(
    `INSERT OR IGNORE INTO locations (name, description, travel_buffer_minutes) VALUES (?,?,?)`
  );
  extraLocations.forEach(l => {
    const exists = db.prepare(`SELECT id FROM locations WHERE name=?`).get(l[0]);
    if (!exists) {
      insertLocation.run(...l);
    }
  });
}
ensureExtendedServicesAndLocations();

function ensurePortfolio() {
  const count = db.prepare(`SELECT COUNT(*) n FROM portfolio`).get().n;
  if (count < 8) {
    const insert = db.prepare(
      `INSERT INTO portfolio (image_url, title, category, description, location, featured, sort_order)
       VALUES (?,?,?,?,?,?,?)`
    );
    const items = [
      ['/img/service-golden-hour.jpg', 'Golden Hour at Masjid Nabawi', 'Masjid Nabawi', 'Sublime golden sunset lighting reflecting across the white marble courtyard.', 'Masjid Nabawi Area', 1, 1],
      ['/img/service-couple.jpg', 'Serene Couple Portrait', 'Couple', 'Harmonious couple session with architectural backdrops of the Holy City.', 'Masjid Nabawi Area', 1, 2],
      ['/img/service-portrait.jpg', 'Individual Editorial Portrait', 'Portrait', 'Timeless individual portrait capturing personal devotion and serenity.', 'Heritage Area', 1, 3],
      ['/img/service-family.jpg', 'Joyful Family Pilgrimage', 'Family', 'Multi-generational family moments documented during sacred journey.', 'Masjid Nabawi Area', 1, 4],
      ['/img/service-umrah.jpg', 'Moments of Quiet Reflection', 'Umrah', 'Candid documentation of pilgrims engaged in peaceful contemplation.', 'Masjid Nabawi Area', 1, 5],
      ['/img/service-tour.jpg', 'Historic Mount Uhud Expedition', 'Uhud', 'Dramatic mountain terrain and historical battlefield storytelling.', 'Uhud Area', 1, 6],
      ['/img/service-reels.jpg', 'Cinematic 4K Moments', 'Cinematic', 'Dynamic 4K vertical footage crafted for social media reels and stories.', 'Madinah Heritage', 1, 7],
      ['/img/service-drone.jpg', 'Grand Aerial Landmark Perspective', 'Drone', 'Stunning bird-eye view of landmark landscapes and historic minarets.', 'Quba & Uhud Area', 1, 8],
    ];
    items.forEach(it => {
      const exists = db.prepare(`SELECT id FROM portfolio WHERE title=?`).get(it[1]);
      if (!exists) insert.run(...it);
    });
  }
}
ensurePortfolio();

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
    [0, 0, '05:30', '22:30'], // Sunday
    [1, 0, '05:30', '22:30'], // Monday
    [2, 0, '05:30', '22:30'], // Tuesday
    [3, 0, '05:30', '22:30'], // Wednesday
    [4, 0, '05:30', '22:30'], // Thursday
    [5, 0, '05:30', '22:30'], // Friday
    [6, 0, '05:30', '22:30'], // Saturday
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
