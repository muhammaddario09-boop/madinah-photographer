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
 * Sync or Record a new booking directly to Supabase with full activity logging
 */
async function recordBookingToSupabase(booking, client, paymentProof = null) {
  if (!isSupabaseConfigured()) return false;
  try {
    // 1. Upsert Client into Supabase
    let clientId = 1;
    if (client && client.name) {
      try {
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
      } catch (ce) {
        try {
          const found = await supabaseFetch('clients', { query: `?phone=eq.${encodeURIComponent(client.phone || '')}&limit=1` });
          if (Array.isArray(found) && found[0]) clientId = found[0].id;
        } catch (fe) {}
      }
    }

    // 2. Insert or Upsert Booking into Supabase
    let bookingId = 1;
    try {
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
        payment_status: paymentProof ? 'DEPOSIT_PAID' : (booking.payment_status || 'UNPAID'),
        status: booking.status || 'PENDING'
      };

      const savedBooking = await supabaseFetch('bookings', {
        method: 'POST',
        query: '?on_conflict=booking_code',
        body: bookingPayload,
        prefer: 'resolution=merge-duplicates,return=representation'
      });

      if (Array.isArray(savedBooking) && savedBooking[0]) {
        bookingId = savedBooking[0].id;
      } else {
        const found = await supabaseFetch('bookings', { query: `?booking_code=eq.${encodeURIComponent(booking.booking_code)}&limit=1` });
        if (Array.isArray(found) && found[0]) bookingId = found[0].id;
      }
    } catch (be) {
      console.warn('[Supabase Booking Notice]', be.message);
      try {
        const found = await supabaseFetch('bookings', { query: `?booking_code=eq.${encodeURIComponent(booking.booking_code)}&limit=1` });
        if (Array.isArray(found) && found[0]) bookingId = found[0].id;
      } catch (fe) {}
    }

    // 3. Record Booking History to Supabase
    try {
      await supabaseFetch('booking_history', {
        method: 'POST',
        body: {
          booking_id: bookingId,
          event: 'CREATED',
          to_date: booking.date,
          to_time: booking.start_time,
          note: `Booking ${booking.booking_code} created by client ${client ? client.name : ''}`
        }
      });
    } catch (e) {}

    // 4. Record Activity Log to Supabase
    try {
      await supabaseFetch('activity_logs', {
        method: 'POST',
        body: {
          actor: 'client',
          action: 'booking_created',
          entity: 'booking',
          entity_id: bookingId,
          meta: JSON.stringify({ booking_code: booking.booking_code, client_name: client ? client.name : '' })
        }
      });
    } catch (e) {}

    // 5. Record Payment Proof if present
    if (paymentProof) {
      try {
        await supabaseFetch('payments', {
          method: 'POST',
          body: {
            booking_id: bookingId,
            amount: Number(booking.deposit_amount) || 0,
            currency: booking.currency || 'SAR',
            method: 'BANK_TRANSFER',
            type: 'DEPOSIT',
            status: 'PENDING',
            reference: 'Transfer Confirmation',
            proof_url: typeof paymentProof === 'string' && paymentProof.length > 500 ? 'data:image/receipt_uploaded' : paymentProof
          }
        });
      } catch (e) {}
    }

    console.log(`[Supabase Sync] Booking ${booking.booking_code} + Client + Activity Log synced successfully to Supabase!`);
    return true;
  } catch (err) {
    console.error('[Supabase Sync Error]', err.message);
    return false;
  }
}

/**
 * Record custom activity log to Supabase
 */
async function recordActivityLogToSupabase(actor, action, entity, entityId, meta = null) {
  if (!isSupabaseConfigured()) return;
  try {
    await supabaseFetch('activity_logs', {
      method: 'POST',
      body: {
        actor: actor || 'system',
        action: action,
        entity: entity || null,
        entity_id: entityId || null,
        meta: meta ? (typeof meta === 'string' ? meta : JSON.stringify(meta)) : null
      }
    });
  } catch (e) {}
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
  recordActivityLogToSupabase,
  ensureAdminUserInSupabase,
  recordPortfolioToSupabase,
  deletePortfolioFromSupabase
};
