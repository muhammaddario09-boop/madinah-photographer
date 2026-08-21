/**
 * SUPABASE CLIENT & CLOUD SYNC MODULE
 * Provides bidirectional sync and direct queries to Supabase PostgreSQL
 */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://fnmqjgjklkvynnordezb.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZubXFqZ2prbGt2eW5ub3JkZXpiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzMwNTk2NywiZXhwIjoyMTAyODgxOTY3fQ.RL8nVbK_HrcIu_7YMzNbjXysGg0SVdtwYxo9cLMyZ00';

function isSupabaseConfigured() {
  return !!(SUPABASE_URL && SUPABASE_KEY);
}

/**
 * Execute REST SQL query directly to Supabase via PostgREST
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
    console.error(`Supabase Error (${res.status} on ${table}):`, err);
    throw new Error(`Supabase Error (${res.status}): ${err}`);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/**
 * Sync or Record a new booking directly to Supabase
 */
async function recordBookingToSupabase(booking, client) {
  if (!isSupabaseConfigured()) return false;
  try {
    // 1. Upsert Client into Supabase
    let clientId = 1;
    if (client) {
      const clientPayload = {
        name: client.name,
        email: client.email || null,
        phone: client.phone || '',
        country: client.country || 'Indonesia'
      };
      const savedClient = await supabaseFetch('clients', {
        method: 'POST',
        body: clientPayload,
        prefer: 'return=representation'
      });
      if (Array.isArray(savedClient) && savedClient[0]) {
        clientId = savedClient[0].id;
      }
    }

    // 2. Upsert Booking into Supabase
    const bookingPayload = {
      booking_code: booking.booking_code,
      client_id: clientId,
      photographer_id: Number(booking.photographer_id) || 1,
      service_id: Number(booking.service_id) || 1,
      package_id: Number(booking.package_id) || 1,
      location_id: Number(booking.location_id) || 1,
      date: booking.date,
      start_time: booking.start_time,
      end_time: booking.end_time,
      occasion: booking.occasion || null,
      number_of_people: Number(booking.number_of_people) || 1,
      style_preference: booking.style_preference || null,
      special_request: booking.special_request || null,
      deposit_amount: Number(booking.deposit_amount) || 0,
      total_price: Number(booking.total_price) || 0,
      currency: booking.currency || 'SAR',
      payment_status: booking.payment_status || 'UNPAID',
      status: booking.status || 'PENDING'
    };

    await supabaseFetch('bookings', {
      method: 'POST',
      body: bookingPayload,
      prefer: 'resolution=merge-duplicates,return=representation'
    });

    console.log(`[Supabase Sync] Booking ${booking.booking_code} synced successfully to Supabase!`);
    return true;
  } catch (err) {
    console.error('[Supabase Sync Error]', err.message);
    return false;
  }
}

/**
 * Ensure Admin user exists in Supabase
 */
async function ensureAdminUserInSupabase(adminEmail, passwordHash) {
  if (!isSupabaseConfigured()) return;
  try {
    await supabaseFetch('users', {
      method: 'POST',
      body: {
        email: adminEmail,
        password_hash: passwordHash,
        role: 'ADMIN'
      },
      prefer: 'resolution=merge-duplicates'
    });
    console.log(`[Supabase Sync] Admin user ${adminEmail} synced to Supabase!`);
  } catch (e) {}
}

/**
 * Record a portfolio photo directly to Supabase
 */
async function recordPortfolioToSupabase(item) {
  if (!isSupabaseConfigured()) return;
  try {
    await supabaseFetch('portfolio', {
      method: 'POST',
      body: {
        image_url: item.image_url,
        title: item.title || '',
        category: item.category || 'Portrait',
        description: item.description || '',
        location: item.location || 'Madinah',
        featured: item.featured ? 1 : 0,
        sort_order: item.sort_order || 0,
        active: 1
      },
      prefer: 'resolution=merge-duplicates'
    });
    console.log(`[Supabase Sync] Portfolio ${item.title} synced to Supabase!`);
  } catch (e) {
    console.error('[Supabase Portfolio Error]', e.message);
  }
}

/**
 * Delete a portfolio item from Supabase
 */
async function deletePortfolioFromSupabase(id) {
  if (!isSupabaseConfigured()) return;
  try {
    await supabaseFetch('portfolio', {
      method: 'DELETE',
      query: `?id=eq.${id}`
    });
  } catch (e) {}
}

module.exports = {
  SUPABASE_URL,
  SUPABASE_KEY,
  isSupabaseConfigured,
  supabaseFetch,
  recordBookingToSupabase,
  ensureAdminUserInSupabase,
  recordPortfolioToSupabase,
  deletePortfolioFromSupabase
};
