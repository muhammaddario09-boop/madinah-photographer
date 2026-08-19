// BOOKING ENGINE
// Owns booking creation, the status state machine, and reschedule/cancel
// flows. Double-booking protection is two layers deep:
//   1. isSlotStillAvailable() re-checks server-side inside a DB transaction
//      (spec section 15) — the frontend's slot list is never trusted.
//   2. A UNIQUE(photographer_id, date, start_time) constraint on the
//      bookings table (schema.sql) makes a race-condition double-insert
//      fail at the DB engine level even if two requests land in the same
//      millisecond — SQLite serializes writes, and better-sqlite3 runs
//      synchronously, so this transaction is atomic by construction.

const { isSlotStillAvailable, toMinutes, toHHMM } = require('./availabilityEngine');

const STATUSES = [
  'PENDING',
  'AWAITING_PAYMENT',
  'CONFIRMED',
  'RESCHEDULE_REQUESTED',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
];

// Legal transitions for the booking state machine (spec section 16).
const TRANSITIONS = {
  PENDING: ['AWAITING_PAYMENT', 'CONFIRMED', 'CANCELLED'],
  AWAITING_PAYMENT: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['RESCHEDULE_REQUESTED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'],
  RESCHEDULE_REQUESTED: ['CONFIRMED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

function canTransition(from, to, actor = 'client') {
  if (actor === 'admin') return true; // Admin has full authority to change to any status
  return (TRANSITIONS[from] || []).includes(to);
}

function nextBookingCode(db) {
  const year = new Date().getFullYear();
  const row = db
    .prepare(`SELECT COUNT(*) AS n FROM bookings WHERE booking_code LIKE ?`)
    .get(`MDN-${year}-%`);
  const seq = String(row.n + 1).padStart(4, '0');
  return `MDN-${year}-${seq}`;
}

/**
 * Create a booking. Throws { status: 409, message } on collision so the
 * route layer can surface the spec's exact user-facing copy.
 */
function createBooking(db, input) {
  const {
    photographerId, serviceId, packageId, locationId,
    clientName, clientEmail, clientPhone, clientCountry,
    date, startTime, durationMinutes, bufferMinutes,
    occasion, numberOfPeople, stylePreference, specialRequest,
    totalPrice, depositAmount, currency,
  } = input;

  const validDuration = Number(durationMinutes) || 60;
  const startMins = toMinutes(startTime || '10:00') || 600;
  const endTime = toHHMM(startMins + validDuration);

  const tx = db.transaction(() => {
    const check = isSlotStillAvailable(db, {
      photographerId, dateStr: date, startTime, endTime, bufferMinutes,
    });
    if (!check.ok) {
      const err = new Error(check.reason);
      err.status = 409;
      throw err;
    }

    let client = clientEmail
      ? db.prepare(`SELECT id FROM clients WHERE email = ?`).get(clientEmail)
      : null;
    if (!client) {
      const info = db
        .prepare(`INSERT INTO clients (name, email, phone, country) VALUES (?,?,?,?)`)
        .run(clientName, clientEmail || null, clientPhone, clientCountry || null);
      client = { id: info.lastInsertRowid };
    }

    const bookingCode = nextBookingCode(db);

    // The UNIQUE constraint on (photographer_id, date, start_time) is the
    // last line of defense: if two requests raced past the check above,
    // this INSERT throws and the whole transaction rolls back.
    const info = db
      .prepare(
        `INSERT INTO bookings
        (booking_code, client_id, photographer_id, service_id, package_id, location_id,
         date, start_time, end_time, occasion, number_of_people, style_preference,
         special_request, deposit_amount, total_price, currency, payment_status, status)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .run(
        bookingCode, client.id, photographerId, serviceId, packageId, locationId || null,
        date, startTime, endTime, occasion || null, numberOfPeople || 1, stylePreference || null,
        specialRequest || null, depositAmount || 0, totalPrice, currency || 'SAR',
        'UNPAID', 'PENDING'
      );

    db.prepare(
      `INSERT INTO booking_history (booking_id, event, to_date, to_time, note)
       VALUES (?, 'CREATED', ?, ?, ?)`
    ).run(info.lastInsertRowid, date, startTime, 'Booking created by client');

    db.prepare(
      `INSERT INTO activity_logs (actor, action, entity, entity_id) VALUES ('client','booking_created','booking',?)`
    ).run(info.lastInsertRowid);

    return { id: info.lastInsertRowid, bookingCode, endTime };
  });

  try {
    return tx();
  } catch (e) {
    // SQLite UNIQUE violation surfaces here if the race-condition case above
    // wasn't already caught by the pre-check.
    if (String(e.message).includes('UNIQUE') ) {
      const err = new Error('This time slot is no longer available. Please choose another time.');
      err.status = 409;
      throw err;
    }
    throw e;
  }
}

function setStatus(db, bookingId, newStatus, actor = 'admin', note = '') {
  const booking = db.prepare(`SELECT * FROM bookings WHERE id = ?`).get(bookingId);
  if (!booking) { const e = new Error('Booking not found'); e.status = 404; throw e; }
  if (!canTransition(booking.status, newStatus, actor)) {
    const e = new Error(`Cannot move booking from ${booking.status} to ${newStatus}`);
    e.status = 400;
    throw e;
  }
  db.prepare(`UPDATE bookings SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(newStatus, bookingId);
  db.prepare(
    `INSERT INTO booking_history (booking_id, event, note) VALUES (?, ?, ?)`
  ).run(bookingId, newStatus, note);
  db.prepare(
    `INSERT INTO activity_logs (actor, action, entity, entity_id) VALUES (?, ?, 'booking', ?)`
  ).run(actor, `status_${newStatus.toLowerCase()}`, bookingId);
  return booking;
}

/**
 * Reschedule: validates the new slot inside a transaction, keeps the old
 * date/time in booking_history (spec section 28 — never delete history),
 * and moves status back to CONFIRMED-eligible.
 */
function reschedule(db, bookingId, { date, startTime, bufferMinutes }, actor = 'client') {
  const tx = db.transaction(() => {
    const booking = db.prepare(`SELECT * FROM bookings WHERE id = ?`).get(bookingId);
    if (!booking) { const e = new Error('Booking not found'); e.status = 404; throw e; }

    const durationMinutes = toMinutes(booking.end_time) - toMinutes(booking.start_time);
    const endTime = toHHMM(toMinutes(startTime) + durationMinutes);

    // Exclude the booking's own current slot from the collision check.
    db.prepare(`UPDATE bookings SET status = 'RESCHEDULE_REQUESTED' WHERE id = ?`).run(bookingId);

    const others = db
      .prepare(
        `SELECT start_time, end_time FROM bookings
         WHERE photographer_id = ? AND date = ? AND id != ?
         AND status NOT IN ('CANCELLED','NO_SHOW')`
      )
      .all(booking.photographer_id, date, bookingId);

    const s = toMinutes(startTime), e2 = toMinutes(endTime);
    const collide = others.some((b) => {
      const bs = toMinutes(b.start_time) - bufferMinutes;
      const be = toMinutes(b.end_time) + bufferMinutes;
      return s < be && bs < e2;
    });
    if (collide) {
      const err = new Error('This time slot is no longer available. Please choose another time.');
      err.status = 409;
      throw err;
    }

    db.prepare(
      `UPDATE bookings SET date = ?, start_time = ?, end_time = ?, status = 'CONFIRMED', updated_at = datetime('now') WHERE id = ?`
    ).run(date, startTime, endTime, bookingId);

    db.prepare(
      `INSERT INTO booking_history (booking_id, event, from_date, from_time, to_date, to_time, note)
       VALUES (?, 'RESCHEDULED', ?, ?, ?, ?, ?)`
    ).run(bookingId, booking.date, booking.start_time, date, startTime, `Rescheduled by ${actor}`);

    return { ...booking, date, start_time: startTime, end_time: endTime, status: 'CONFIRMED' };
  });

  return tx();
}

module.exports = { STATUSES, TRANSITIONS, canTransition, createBooking, setStatus, reschedule };
