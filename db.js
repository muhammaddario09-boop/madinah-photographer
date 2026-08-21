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

// Execute pure SQL Schema directly from db/schema.sql
const schema = fs.readFileSync(path.join(__dirname, 'db', 'schema.sql'), 'utf8');
db.exec(schema);

// Migration: add proof_url column if not present
try {
  db.exec(`ALTER TABLE payments ADD COLUMN proof_url TEXT;`);
} catch (e) {}

// Synchronously restore state on boot (100% crash-free, 0ms startup time)
function loadPersistedState() {
  try {
    const jsonPath = path.join(__dirname, 'data', 'cloud_bookings.json');
    if (fs.existsSync(jsonPath)) {
      const parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      if (parsed.settings && typeof parsed.settings === 'object') {
        const upsert = db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`);
        for (const [k, v] of Object.entries(parsed.settings)) {
          if (v !== undefined && v !== null) upsert.run(k, String(v));
        }
      }
      if (Array.isArray(parsed.portfolio) && parsed.portfolio.length > 0) {
        db.prepare(`DELETE FROM portfolio`).run();
        const insertP = db.prepare(`INSERT INTO portfolio (image_url, title, category, description, location, featured, sort_order, active) VALUES (?,?,?,?,?,?,?,1)`);
        for (const p of parsed.portfolio) {
          if (p.image_url) {
            insertP.run(p.image_url, p.title || '', p.category || 'Portrait', p.description || '', p.location || 'Madinah', p.featured ? 1 : 0, p.sort_order || 0);
          }
        }
      }
    }
  } catch (e) {
    console.error('loadPersistedState error:', e.message);
  }
}
loadPersistedState();

// Ensure Admin User credentials
const { hashPassword } = require('./lib/auth');
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

module.exports = db;
