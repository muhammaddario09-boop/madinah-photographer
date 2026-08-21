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
 * Fetch all active portfolio items directly from Supabase
 */
async function fetchPortfolioFromSupabase() {
  if (!isSupabaseConfigured()) return null;
  try {
    const rows = await supabaseFetch('portfolio', { query: '?active=eq.1&select=*&order=sort_order.asc,id.desc' });
    if (!Array.isArray(rows)) return null;
    return rows;
  } catch (err) {
    console.error('fetchPortfolioFromSupabase error:', err.message);
    return null;
  }
}

/**
 * Record or update a portfolio photo directly in Supabase
 */
async function recordPortfolioToSupabase(item) {
  if (!isSupabaseConfigured()) return;
  try {
    const payload = {
      image_url: item.image_url,
      title: item.title || '',
      category: item.category || 'Portrait',
      description: item.description || '',
      location: item.location || 'Madinah',
      featured: item.featured ? 1 : 0,
      sort_order: Number(item.sort_order) || 0,
      active: 1
    };

    if (item.id) {
      await supabaseFetch('portfolio', {
        method: 'PATCH',
        query: `?id=eq.${item.id}`,
        body: payload
      });
    } else {
      await supabaseFetch('portfolio', {
        method: 'POST',
        body: payload,
        prefer: 'return=representation'
      });
    }
    console.log(`[Supabase Sync] Portfolio ${item.title} saved to Supabase!`);
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

/**
 * Fetch all bookings from Supabase with relational client and payment joins
 */
async function fetchBookingsFromSupabase(filters = {}) {
  if (!isSupabaseConfigured()) return null;
  try {
    let query = '?select=*,clients(name,email,phone,country),services(name),photographers(name),payments(proof_url,amount,status)&order=date.desc,start_time.desc';
    if (filters.status) query += `&status=eq.${encodeURIComponent(filters.status)}`;
    if (filters.from) query += `&date=gte.${encodeURIComponent(filters.from)}`;
    if (filters.to) query += `&date=lte.${encodeURIComponent(filters.to)}`;
    
    const rows = await supabaseFetch('bookings', { query });
    if (!Array.isArray(rows)) return null;

    return rows.map(b => ({
      id: b.id,
      booking_code: b.booking_code,
      client_id: b.client_id,
      client_name: b.clients?.name || 'Guest',
      client_phone: b.clients?.phone || '',
      client_email: b.clients?.email || '',
      client_country: b.clients?.country || 'Indonesia',
      service_id: b.service_id,
      service_name: b.services?.name || 'Madinah Session',
      photographer_name: b.photographers?.name || 'UMROH LENS',
      date: b.date,
      start_time: b.start_time,
      end_time: b.end_time,
      occasion: b.occasion,
      number_of_people: b.number_of_people,
      total_price: Number(b.total_price) || 0,
      deposit_amount: Number(b.deposit_amount) || 0,
      currency: b.currency || 'SAR',
      status: b.status,
      payment_status: b.payment_status,
      proof_url: (b.payments && b.payments[0]) ? b.payments[0].proof_url : null,
      created_at: b.created_at
    }));
  } catch (err) {
    console.error('fetchBookingsFromSupabase error:', err.message);
    return null;
  }
}

/**
 * Fetch dashboard overview statistics directly from Supabase
 */
async function fetchDashboardStatsFromSupabase(today) {
  if (!isSupabaseConfigured()) return null;
  try {
    const all = await supabaseFetch('bookings', { query: '?select=id,date,status,payment_status,total_price' });
    if (!Array.isArray(all)) return null;

    const todayShoots = all.filter(b => b.date === today && !['CANCELLED', 'NO_SHOW'].includes(b.status)).length;
    const upcoming = all.filter(b => b.date > today && ['CONFIRMED', 'PENDING', 'AWAITING_PAYMENT'].includes(b.status)).length;
    const pendingPayments = all.filter(b => b.payment_status === 'UNPAID' && b.status !== 'CANCELLED').length;
    const revenue = all
      .filter(b => ['DEPOSIT_PAID', 'PAID'].includes(b.payment_status) && b.status !== 'CANCELLED')
      .reduce((sum, b) => sum + (Number(b.total_price) || 0), 0);

    return { todayShoots, upcoming, pendingPayments, revenue };
  } catch (err) {
    console.error('fetchDashboardStatsFromSupabase error:', err.message);
    return null;
  }
}

/**
 * Fetch full booking details (client, payments, history) from Supabase
 */
async function fetchBookingDetailsFromSupabase(id) {
  if (!isSupabaseConfigured()) return null;
  try {
    const bookings = await supabaseFetch('bookings', { query: `?id=eq.${id}&select=*,clients(*),services(*),locations(*)` });
    if (!Array.isArray(bookings) || !bookings[0]) return null;

    const booking = bookings[0];
    const client = booking.clients || null;
    const history = await supabaseFetch('booking_history', { query: `?booking_id=eq.${id}&order=created_at.asc` }) || [];
    const payments = await supabaseFetch('payments', { query: `?booking_id=eq.${id}&order=created_at.asc` }) || [];

    return { booking, client, history, payments };
  } catch (err) {
    console.error('fetchBookingDetailsFromSupabase error:', err.message);
    return null;
  }
}

/**
 * Update booking status or payment status directly in Supabase
 */
async function updateBookingStatusInSupabase(id, status, payment_status, note = null) {
  if (!isSupabaseConfigured()) return false;
  try {
    const updateBody = { updated_at: new Date().toISOString() };
    if (status) updateBody.status = status;
    if (payment_status) updateBody.payment_status = payment_status;

    await supabaseFetch('bookings', {
      method: 'PATCH',
      query: `?id=eq.${id}`,
      body: updateBody
    });

    if (status) {
      await supabaseFetch('booking_history', {
        method: 'POST',
        body: {
          booking_id: Number(id),
          event: status,
          note: note || `Status updated by Admin to ${status}`
        }
      }).catch(() => {});
    }

    await supabaseFetch('activity_logs', {
      method: 'POST',
      body: {
        actor: 'admin',
        action: 'status_updated',
        entity: 'booking',
        entity_id: Number(id),
        meta: JSON.stringify({ status, payment_status })
      }
    }).catch(() => {});

    return true;
  } catch (err) {
    console.error('updateBookingStatusInSupabase error:', err.message);
    return false;
  }
}

/**
 * Delete a booking from Supabase
 */
async function deleteBookingFromSupabase(id) {
  if (!isSupabaseConfigured()) return false;
  try {
    await supabaseFetch('payments', { method: 'DELETE', query: `?booking_id=eq.${id}` }).catch(() => {});
    await supabaseFetch('booking_history', { method: 'DELETE', query: `?booking_id=eq.${id}` }).catch(() => {});
    await supabaseFetch('activity_logs', { method: 'DELETE', query: `?entity=eq.booking&entity_id=eq.${id}` }).catch(() => {});
    await supabaseFetch('bookings', { method: 'DELETE', query: `?id=eq.${id}` });
    return true;
  } catch (err) {
    console.error('deleteBookingFromSupabase error:', err.message);
    return false;
  }
}

/**
 * Reset all bookings and payments in Supabase (Clean Slate)
 */
async function resetAllBookingsInSupabase() {
  if (!isSupabaseConfigured()) return false;
  try {
    await supabaseFetch('payments', { method: 'DELETE', query: '?id=gt.0' }).catch(() => {});
    await supabaseFetch('booking_history', { method: 'DELETE', query: '?id=gt.0' }).catch(() => {});
    await supabaseFetch('activity_logs', { method: 'DELETE', query: '?id=gt.0' }).catch(() => {});
    await supabaseFetch('bookings', { method: 'DELETE', query: '?id=gt.0' }).catch(() => {});
    console.log('[Supabase Admin] All bookings wiped to clean slate 0 on Supabase!');
    return true;
  } catch (err) {
    console.error('resetAllBookingsInSupabase error:', err.message);
    return false;
  }
}

module.exports = {
  SUPABASE_URL,
  SUPABASE_KEY,
  isSupabaseConfigured,
  supabaseFetch,
  recordBookingToSupabase,
  recordActivityLogToSupabase,
  ensureAdminUserInSupabase,
  fetchPortfolioFromSupabase,
  recordPortfolioToSupabase,
  deletePortfolioFromSupabase,
  fetchBookingsFromSupabase,
  fetchDashboardStatsFromSupabase,
  fetchBookingDetailsFromSupabase,
  updateBookingStatusInSupabase,
  deleteBookingFromSupabase,
  resetAllBookingsInSupabase
};
