-- =========================================================================
-- SUPABASE POSTGRESQL SCHEMA FOR UMROH LENS
-- Copy and paste this directly into Supabase Dashboard -> SQL Editor -> Run
-- =========================================================================

-- Enable UUID extension if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Users Table (Admin & Staff)
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'ADMIN' CHECK (role IN ('ADMIN','STAFF')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Photographers Table
CREATE TABLE IF NOT EXISTS photographers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  bio TEXT,
  avatar_url TEXT,
  phone TEXT,
  email TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Weekly Availability Rules
CREATE TABLE IF NOT EXISTS availability_rules (
  id SERIAL PRIMARY KEY,
  photographer_id INTEGER NOT NULL REFERENCES photographers(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  is_off INTEGER NOT NULL DEFAULT 0,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  UNIQUE(photographer_id, day_of_week)
);

-- 4. Date-Specific Availability Overrides
CREATE TABLE IF NOT EXISTS availability_overrides (
  id SERIAL PRIMARY KEY,
  photographer_id INTEGER NOT NULL REFERENCES photographers(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  is_off INTEGER NOT NULL DEFAULT 0,
  start_time TEXT,
  end_time TEXT,
  note TEXT,
  UNIQUE(photographer_id, date)
);

-- 5. Locations (Madinah & Holy Places)
CREATE TABLE IF NOT EXISTS locations (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  travel_buffer_minutes INTEGER NOT NULL DEFAULT 15,
  active INTEGER NOT NULL DEFAULT 1
);

-- 6. Services Table
CREATE TABLE IF NOT EXISTS services (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  cover_image TEXT,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  starting_price NUMERIC(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'SAR',
  edited_photos INTEGER NOT NULL DEFAULT 10,
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- 7. Packages Table
CREATE TABLE IF NOT EXISTS packages (
  id SERIAL PRIMARY KEY,
  service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'SAR',
  duration_minutes INTEGER NOT NULL,
  edited_photos INTEGER NOT NULL,
  raw_photos_included INTEGER NOT NULL DEFAULT 0,
  deposit_percentage NUMERIC(5,2) NOT NULL DEFAULT 30.0,
  cancellation_policy TEXT,
  active INTEGER NOT NULL DEFAULT 1
);

-- 8. Add-ons Table
CREATE TABLE IF NOT EXISTS add_ons (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'SAR',
  active INTEGER NOT NULL DEFAULT 1
);

-- 9. Clients Table
CREATE TABLE IF NOT EXISTS clients (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT NOT NULL,
  country TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. Bookings Table (Double-Booking Guard)
CREATE TABLE IF NOT EXISTS bookings (
  id SERIAL PRIMARY KEY,
  booking_code TEXT UNIQUE NOT NULL,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  photographer_id INTEGER NOT NULL REFERENCES photographers(id),
  service_id INTEGER NOT NULL REFERENCES services(id),
  package_id INTEGER NOT NULL REFERENCES packages(id),
  location_id INTEGER REFERENCES locations(id),
  date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  occasion TEXT,
  number_of_people INTEGER DEFAULT 1,
  style_preference TEXT,
  special_request TEXT,
  deposit_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_price NUMERIC(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'SAR',
  payment_status TEXT NOT NULL DEFAULT 'UNPAID'
    CHECK (payment_status IN ('UNPAID','DEPOSIT_PAID','PAID','REFUNDED')),
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','AWAITING_PAYMENT','CONFIRMED','RESCHEDULE_REQUESTED','COMPLETED','CANCELLED','NO_SHOW')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(photographer_id, date, start_time)
);

-- 11. Booking History Table
CREATE TABLE IF NOT EXISTS booking_history (
  id SERIAL PRIMARY KEY,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  from_date TEXT,
  from_time TEXT,
  to_date TEXT,
  to_time TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. Payments Table
CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'SAR',
  method TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('DEPOSIT','FULL','BALANCE')),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PAID','FAILED','REFUNDED')),
  reference TEXT,
  proof_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. Portfolio & Photo Gallery Table
CREATE TABLE IF NOT EXISTS portfolio (
  id SERIAL PRIMARY KEY,
  image_url TEXT NOT NULL,
  title TEXT,
  category TEXT,
  description TEXT,
  location TEXT,
  featured INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

-- 14. Notifications Table
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  booking_id INTEGER REFERENCES bookings(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('WHATSAPP','EMAIL','SMS')),
  type TEXT NOT NULL,
  payload TEXT,
  status TEXT NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','SENT','FAILED')),
  scheduled_for TEXT,
  sent_at TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 15. Activity Logs Table
CREATE TABLE IF NOT EXISTS activity_logs (
  id SERIAL PRIMARY KEY,
  actor TEXT,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id INTEGER,
  meta TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 16. Settings Table
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- Indexes for lightning fast queries
CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(date);
CREATE INDEX IF NOT EXISTS idx_bookings_photographer_date ON bookings(photographer_id, date);
CREATE INDEX IF NOT EXISTS idx_portfolio_featured ON portfolio(featured, sort_order);

-- =========================================================================
-- INITIAL SEED DATA (MADINAH PHOTOGRAPHY STUDIO)
-- =========================================================================

-- Disable RLS for application backend access
ALTER TABLE services DISABLE ROW LEVEL SECURITY;
ALTER TABLE packages DISABLE ROW LEVEL SECURITY;
ALTER TABLE locations DISABLE ROW LEVEL SECURITY;
ALTER TABLE photographers DISABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio DISABLE ROW LEVEL SECURITY;
ALTER TABLE settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE bookings DISABLE ROW LEVEL SECURITY;
ALTER TABLE clients DISABLE ROW LEVEL SECURITY;
ALTER TABLE payments DISABLE ROW LEVEL SECURITY;
ALTER TABLE booking_history DISABLE ROW LEVEL SECURITY;
ALTER TABLE availability_rules DISABLE ROW LEVEL SECURITY;
ALTER TABLE availability_overrides DISABLE ROW LEVEL SECURITY;
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE add_ons DISABLE ROW LEVEL SECURITY;
ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs DISABLE ROW LEVEL SECURITY;

-- Settings
INSERT INTO settings (key, value) VALUES
  ('studio_name', 'UMROH LENS'),
  ('min_booking_notice_hours', '12'),
  ('max_booking_window_days', '90'),
  ('cancellation_deadline_hours', '48'),
  ('buffer_minutes', '30'),
  ('max_sessions_per_day', '8'),
  ('admin_whatsapp', '+6282175272547'),
  ('admin_whatsapp_2', '+6281234567890'),
  ('instagram_url', 'https://instagram.com/umrohlens'),
  ('instagram_handle', '@umrohlens'),
  ('bank_sar_name', 'Al Rajhi Bank (Saudi Arabia)'),
  ('bank_sar_account', 'SA84 8000 0123 4567 8901 2345'),
  ('bank_sar_holder', 'UMROH LENS Photography Studio'),
  ('bank_idr_name', 'Bank Central Asia (BCA)'),
  ('bank_idr_account', '5420123456 (BCA)'),
  ('bank_idr_holder', 'WAHYU AFRIANSYAH'),
  ('idr_sar_rate', '4200')
ON CONFLICT (key) DO NOTHING;

-- Default Photographer
INSERT INTO photographers (id, name, bio, avatar_url) VALUES
  (1, 'UMROH LENS', 'Professional editorial & pilgrimage photography studio based in Madinah Al-Munawwarah. Specializing in Umrah moments, couple portraits, family memories, and golden-hour sessions around Masjid Nabawi.', '/img/photographer-1.jpg')
ON CONFLICT (id) DO NOTHING;

-- Weekly Hours (05:30 - 22:30 everyday)
INSERT INTO availability_rules (id, photographer_id, day_of_week, is_off, start_time, end_time) VALUES
  (1, 1, 0, 0, '05:30', '22:30'),
  (2, 1, 1, 0, '05:30', '22:30'),
  (3, 1, 2, 0, '05:30', '22:30'),
  (4, 1, 3, 0, '05:30', '22:30'),
  (5, 1, 4, 0, '05:30', '22:30'),
  (6, 1, 5, 0, '05:30', '22:30'),
  (7, 1, 6, 0, '05:30', '22:30')
ON CONFLICT (id) DO NOTHING;

-- Locations
INSERT INTO locations (id, name, description, travel_buffer_minutes) VALUES
  (1, 'Masjid Nabawi Area', 'The Prophet''s Mosque courtyard, white marble plazas, and iconic green dome vista.', 15),
  (2, 'Quba Area', 'The first mosque built in Islam and surrounding date palm groves.', 30),
  (3, 'Jabal Uhud Area', 'The historic mountain, Archers Hill (Jabal Rumat), and martyrs sanctuary.', 30),
  (4, 'Al Madinah Heritage Area', 'Old-city alleyways, traditional stone architecture, and cultural heritage corridors.', 20),
  (5, 'Hotel Area', 'In-hotel lobby or suite photography session around Markaziah.', 10),
  (6, 'Private Location', 'Custom pilgrimage or family spot specified by client.', 30),
  (7, 'Bir Ali & Qiblatain Area', 'Historic miqat sanctuary and historic Two-Qibla Mosque.', 25),
  (8, 'AlUla Heritage Expedition', 'Exclusive desert rock heritage expedition in Hegra & Elephant Rock.', 60),
  (9, 'Makkah Al-Mukarramah (Special Request)', 'Private pilgrimage documentation in Holy Makkah.', 60)
ON CONFLICT (id) DO NOTHING;

-- Services
INSERT INTO services (id, name, slug, description, cover_image, duration_minutes, starting_price, currency, edited_photos, sort_order) VALUES
  (1, 'Madinah Portrait', 'madinah-portrait', 'Individual editorial portraits around the city''s most timeless corners.', '/img/service-portrait.jpg', 60, 350, 'SAR', 10, 1),
  (2, 'Couple Session', 'couple-session', 'Intimate couple photography set against Madinah''s golden stone and quiet streets.', '/img/service-couple.jpg', 60, 650, 'SAR', 20, 2),
  (3, 'Family Session', 'family-session', 'Warm, unposed family and group photography.', '/img/service-family.jpg', 90, 850, 'SAR', 30, 3),
  (4, 'Umrah Memory Session', 'umrah-memory-session', 'Documenting the quiet, meaningful moments of your pilgrimage.', '/img/service-umrah.jpg', 45, 400, 'SAR', 12, 4),
  (5, 'Golden Hour Session', 'golden-hour-session', 'Photography timed to sunrise or sunset light.', '/img/service-golden-hour.jpg', 60, 700, 'SAR', 20, 5),
  (6, 'Private Tour + Photography', 'private-tour-photography', 'A guided location experience paired with a full photography session.', '/img/service-tour.jpg', 120, 1400, 'SAR', 40, 6),
  (7, 'Cinematic Video & Reels', 'cinematic-video-reels', '4K Video Reels (60s) for Instagram & TikTok with cinematic sound grading and color tone.', '/img/service-reels.jpg', 60, 750, 'SAR', 25, 7),
  (8, 'Drone & Landmark Perspective', 'drone-landmark-perspective', 'Aerial 4K drone cinematography and wide landmark photography across Madinah & historic sites.', '/img/service-drone.jpg', 90, 1200, 'SAR', 35, 8)
ON CONFLICT (id) DO NOTHING;

-- Packages
INSERT INTO packages (id, service_id, name, description, price, currency, duration_minutes, edited_photos, raw_photos_included, deposit_percentage, cancellation_policy) VALUES
  (1, 1, 'Essential', '30 minutes, 10 edited photos', 350, 'SAR', 30, 10, 0, 30, 'Full refund up to 48 hours before the session.'),
  (2, 1, 'Signature', '60 minutes, 25 edited photos', 650, 'SAR', 60, 25, 0, 30, 'Full refund up to 48 hours before the session.'),
  (3, 1, 'Premium', '90 minutes, 50 edited photos', 950, 'SAR', 90, 50, 1, 30, '50% refund up to 48 hours before the session.'),
  (4, 2, 'Essential', '30 minutes, 10 edited photos', 650, 'SAR', 30, 10, 0, 30, 'Full refund up to 48 hours before the session.'),
  (5, 2, 'Signature', '60 minutes, 25 edited photos', 950, 'SAR', 60, 25, 0, 30, 'Full refund up to 48 hours before the session.'),
  (6, 2, 'Premium', '90 minutes, 50 edited photos', 1250, 'SAR', 90, 50, 1, 30, '50% refund up to 48 hours before the session.'),
  (7, 3, 'Essential', '30 minutes, 15 edited photos', 850, 'SAR', 30, 15, 0, 30, 'Full refund up to 48 hours before the session.'),
  (8, 3, 'Signature', '60 minutes, 30 edited photos', 1200, 'SAR', 60, 30, 0, 30, 'Full refund up to 48 hours before the session.'),
  (9, 3, 'Premium', '90 minutes, 60 edited photos', 1600, 'SAR', 90, 60, 1, 30, '50% refund up to 48 hours before the session.'),
  (10, 4, 'Essential', '30 minutes, 12 edited photos', 400, 'SAR', 30, 12, 0, 30, 'Full refund up to 48 hours before the session.'),
  (11, 4, 'Signature', '60 minutes, 25 edited photos', 700, 'SAR', 60, 25, 0, 30, 'Full refund up to 48 hours before the session.'),
  (12, 4, 'Premium', '90 minutes, 50 edited photos', 1000, 'SAR', 90, 50, 1, 30, '50% refund up to 48 hours before the session.'),
  (13, 5, 'Essential', '45 minutes, 20 edited photos', 700, 'SAR', 45, 20, 0, 30, 'Full refund up to 48 hours before the session.'),
  (14, 5, 'Signature', '75 minutes, 35 edited photos', 1050, 'SAR', 75, 35, 0, 30, 'Full refund up to 48 hours before the session.'),
  (15, 5, 'Premium', '105 minutes, 60 edited photos', 1400, 'SAR', 105, 60, 1, 30, '50% refund up to 48 hours before the session.'),
  (16, 6, 'Essential', '60 minutes, 30 edited photos', 1400, 'SAR', 60, 30, 0, 30, 'Full refund up to 48 hours before the session.'),
  (17, 6, 'Signature', '120 minutes, 50 edited photos', 2000, 'SAR', 120, 50, 0, 30, 'Full refund up to 48 hours before the session.'),
  (18, 6, 'Premium', '180 minutes, 80 edited photos', 2700, 'SAR', 180, 80, 1, 30, '50% refund up to 48 hours before the session.'),
  (19, 7, 'Essential Reels', '45 minutes, 1 Cinematic Reel (60s) + 15 edited photos', 650, 'SAR', 45, 15, 1, 30, 'Full refund up to 48 hours before the session.'),
  (20, 7, 'Signature Creator', '75 minutes, 2 Cinematic Reels (60s) + 30 edited photos + Drone', 1100, 'SAR', 75, 30, 1, 30, 'Full refund up to 48 hours before the session.'),
  (21, 7, 'VVIP Complete Story', '120 minutes, 3 Cinematic Reels + Full Drone + All RAW + 50 photos', 1600, 'SAR', 120, 50, 1, 30, '50% refund up to 48 hours before the session.'),
  (22, 8, 'Essential Drone', '45 minutes, 15 Drone Aerial Shots + 15 Ground Photos', 800, 'SAR', 45, 30, 1, 30, 'Full refund up to 48 hours before the session.'),
  (23, 8, 'Signature Landmark', '90 minutes, 30 Drone Aerial Shots + 30 Ground Photos', 1200, 'SAR', 90, 60, 1, 30, 'Full refund up to 48 hours before the session.'),
  (24, 8, 'VVIP Heritage Aerial', '150 minutes, Full 4K Drone Video + All Photos', 1800, 'SAR', 150, 100, 1, 30, '50% refund up to 48 hours before the session.')
ON CONFLICT (id) DO NOTHING;

-- Portfolio Initial Works
INSERT INTO portfolio (id, image_url, title, category, description, location, featured, sort_order, active) VALUES
  (1, '/img/service-golden-hour.jpg', 'Golden Hour at Masjid Nabawi', 'Masjid Nabawi', 'Sublime golden sunset lighting reflecting across the white marble courtyard.', 'Masjid Nabawi Area', 1, 1, 1),
  (2, '/img/service-couple.jpg', 'Serene Couple Portrait', 'Couple', 'Harmonious couple session with architectural backdrops of the Holy City.', 'Masjid Nabawi Area', 1, 2, 1),
  (3, '/img/service-portrait.jpg', 'Individual Editorial Portrait', 'Portrait', 'Timeless individual portrait capturing personal devotion and serenity.', 'Heritage Area', 1, 3, 1),
  (4, '/img/service-family.jpg', 'Joyful Family Pilgrimage', 'Family', 'Multi-generational family moments documented during sacred journey.', 'Masjid Nabawi Area', 1, 4, 1),
  (5, '/img/service-umrah.jpg', 'Moments of Quiet Reflection', 'Umrah', 'Candid documentation of pilgrims engaged in peaceful contemplation.', 'Masjid Nabawi Area', 1, 5, 1),
  (6, '/img/service-tour.jpg', 'Historic Mount Uhud Expedition', 'Uhud', 'Dramatic mountain terrain and historical battlefield storytelling.', 'Uhud Area', 1, 6, 1),
  (7, '/img/service-reels.jpg', 'Cinematic 4K Moments', 'Cinematic', 'Dynamic 4K vertical footage crafted for social media reels and stories.', 'Madinah Heritage', 1, 7, 1),
  (8, '/img/service-drone.jpg', 'Grand Aerial Landmark Perspective', 'Drone', 'Stunning bird-eye view of landmark landscapes and historic minarets.', 'Quba & Uhud Area', 1, 8, 1)
ON CONFLICT (id) DO NOTHING;
