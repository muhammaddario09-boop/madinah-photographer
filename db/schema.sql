-- MADINAH PHOTOGRAPHER — DATABASE SCHEMA
-- All timestamps stored as UTC ISO-8601 strings; converted to Asia/Riyadh
-- at the presentation layer (see lib/timezone.js). Never trust client TZ.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('ADMIN','PHOTOGRAPHER','CLIENT')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS photographers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  name TEXT NOT NULL,
  bio TEXT,
  avatar_url TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT NOT NULL,
  country TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  cover_image TEXT,
  duration_minutes INTEGER NOT NULL,
  starting_price REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'SAR',
  edited_photos INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS packages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service_id INTEGER NOT NULL REFERENCES services(id),
  name TEXT NOT NULL,
  description TEXT,
  price REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'SAR',
  duration_minutes INTEGER NOT NULL,
  edited_photos INTEGER,
  raw_photos_included INTEGER NOT NULL DEFAULT 0,
  deposit_percentage INTEGER NOT NULL DEFAULT 30,
  cancellation_policy TEXT,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  travel_buffer_minutes INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

-- Weekly recurring working hours per photographer.
-- day_of_week: 0=Sunday .. 6=Saturday (matches section 13 listing Sun-Sat)
CREATE TABLE IF NOT EXISTS availability_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  photographer_id INTEGER NOT NULL REFERENCES photographers(id),
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  is_off INTEGER NOT NULL DEFAULT 0,
  start_time TEXT, -- 'HH:MM' in Asia/Riyadh
  end_time TEXT
);

-- Date-specific overrides. Always takes priority over availability_rules.
CREATE TABLE IF NOT EXISTS availability_overrides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  photographer_id INTEGER NOT NULL REFERENCES photographers(id),
  date TEXT NOT NULL, -- 'YYYY-MM-DD'
  is_off INTEGER NOT NULL DEFAULT 0,
  start_time TEXT,
  end_time TEXT,
  reason TEXT,
  UNIQUE(photographer_id, date)
);

CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_code TEXT UNIQUE NOT NULL, -- e.g. MDN-2026-0001
  client_id INTEGER NOT NULL REFERENCES clients(id),
  photographer_id INTEGER NOT NULL REFERENCES photographers(id),
  service_id INTEGER NOT NULL REFERENCES services(id),
  package_id INTEGER NOT NULL REFERENCES packages(id),
  location_id INTEGER REFERENCES locations(id),
  date TEXT NOT NULL,        -- 'YYYY-MM-DD' Asia/Riyadh
  start_time TEXT NOT NULL,  -- 'HH:MM' Asia/Riyadh
  end_time TEXT NOT NULL,
  occasion TEXT,
  number_of_people INTEGER DEFAULT 1,
  style_preference TEXT,
  special_request TEXT,
  deposit_amount REAL NOT NULL DEFAULT 0,
  total_price REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'SAR',
  payment_status TEXT NOT NULL DEFAULT 'UNPAID'
    CHECK (payment_status IN ('UNPAID','DEPOSIT_PAID','PAID','REFUNDED')),
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','AWAITING_PAYMENT','CONFIRMED','RESCHEDULE_REQUESTED','COMPLETED','CANCELLED','NO_SHOW')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  -- Hard DB-level guard: the same photographer cannot hold two live bookings
  -- in the same slot. Combined with the transaction in bookingEngine.js this
  -- is the second line of defense against double booking / race conditions.
  UNIQUE(photographer_id, date, start_time)
);

CREATE TABLE IF NOT EXISTS booking_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL REFERENCES bookings(id),
  event TEXT NOT NULL, -- CREATED, CONFIRMED, RESCHEDULED, CANCELLED, ...
  from_date TEXT,
  from_time TEXT,
  to_date TEXT,
  to_time TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL REFERENCES bookings(id),
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'SAR',
  method TEXT NOT NULL, -- BANK_TRANSFER, GATEWAY, CASH
  type TEXT NOT NULL CHECK (type IN ('DEPOSIT','FULL','BALANCE')),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PAID','FAILED','REFUNDED')),
  reference TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS portfolio (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  image_url TEXT NOT NULL,
  title TEXT,
  category TEXT,
  description TEXT,
  location TEXT,
  featured INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER REFERENCES bookings(id),
  channel TEXT NOT NULL CHECK (channel IN ('WHATSAPP','EMAIL','SMS')),
  type TEXT NOT NULL, -- CONFIRMATION, REMINDER_24H, REMINDER_3H, RESCHEDULE, CANCELLATION
  payload TEXT,        -- rendered message body
  status TEXT NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','SENT','FAILED')),
  scheduled_for TEXT,   -- when it should fire
  sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT,      -- e.g. 'admin', 'client', 'system'
  action TEXT NOT NULL,
  entity TEXT,
  entity_id INTEGER,
  meta TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(date);
CREATE INDEX IF NOT EXISTS idx_bookings_photographer_date ON bookings(photographer_id, date);
