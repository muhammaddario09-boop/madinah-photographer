/**
 * SUPABASE CLIENT & REST INTEGRATION MODULE
 * Supports both direct REST API query and Supabase PostgreSQL connections
 */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://fnmqjgjklkvynnordezb.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZubXFqZ2prbGt2eW5ub3JkZXpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODczMDU5NjcsImV4cCI6MjEwMjg4MTk2N30.E38belTWveA38cws9_ltkKg0pB6SE-IZtOpuf9whzRQ';

function isSupabaseConfigured() {
  return !!(SUPABASE_URL && SUPABASE_KEY);
}

/**
 * Execute REST SQL query directly to Supabase via PostgREST / RPC
 */
async function supabaseFetch(table, options = {}) {
  if (!isSupabaseConfigured()) return null;

  const url = `${SUPABASE_URL}/rest/v1/${table}${options.query || ''}`;
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': options.prefer || 'return=representation'
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase Error (${res.status}): ${err}`);
  }

  return await res.json();
}

module.exports = {
  SUPABASE_URL,
  SUPABASE_KEY,
  isSupabaseConfigured,
  supabaseFetch
};
