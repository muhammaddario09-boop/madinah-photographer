const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// Determine database path based on environment (Vercel has read-only root, /tmp is writable)
const isVercel = process.env.VERCEL === '1' || !!process.env.VERCEL;
const isProduction = process.env.NODE_ENV === 'production';

let dbPath;
if (isVercel) {
  dbPath = process.env.DB_PATH || path.join('/tmp', 'madinah_cache.sqlite');
} else {
  dbPath = process.env.DB_PATH || path.join(__dirname, 'data.sqlite');
}

let db;
try {
  db = new Database(dbPath, { timeout: 10000 });
} catch (err) {
  // Fallback to in-memory mode if file initialization fails
  db = new Database(':memory:', { timeout: 10000 });
}

// Execute pure SQL Schema directly from db/schema.sql
const schemaPath = path.join(__dirname, 'db', 'schema.sql');
if (fs.existsSync(schemaPath)) {
  const schema = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schema);
} else {
  console.error('Schema file not found at:', schemaPath);
}

// Migration: add proof_url column if not present
try {
  db.exec(`ALTER TABLE payments ADD COLUMN proof_url TEXT;`);
} catch (e) {}

// Ensure Admin User credentials
const { hashPassword } = require('./lib/auth');
const { ensureAdminUserInSupabase } = require('./lib/supabase');

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

  // Ensure Admin is stored in Supabase users table as well
  ensureAdminUserInSupabase(adminEmail, passwordHash).catch(() => {});
}
ensureAdminUser();

module.exports = db;
