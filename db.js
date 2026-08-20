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

// Execute pure SQL Schema & Initial Seed Data directly from db/schema.sql
const schema = fs.readFileSync(path.join(__dirname, 'db', 'schema.sql'), 'utf8');
db.exec(schema);

// Migration: add proof_url column if not present
try {
  db.exec(`ALTER TABLE payments ADD COLUMN proof_url TEXT;`);
} catch (e) {}

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

// Auto-restore persistent state on Serverless Cold Starts
const {
  syncCloudBookingsToDb,
  syncCloudSettingsToDb,
  syncCloudPortfolioToDb,
  syncCloudServicesToDb,
  syncCloudLocationsToDb
} = require('./lib/cloudStore');

async function autoRestorePersistentData() {
  try {
    await Promise.all([
      syncCloudSettingsToDb(db),
      syncCloudServicesToDb(db),
      syncCloudLocationsToDb(db),
      syncCloudPortfolioToDb(db),
      syncCloudBookingsToDb(db)
    ]);
  } catch (e) {}
}

if (process.env.VERCEL) {
  autoRestorePersistentData();
}

module.exports = db;
