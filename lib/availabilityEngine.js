// AVAILABILITY / TIME-SLOT ENGINE
// Implements spec sections 10-13: slots are generated from working hours,
// never hand-entered; buffer time is baked into the grid; date overrides
// always outrank the weekly recurring schedule.

const { riyadhDayOfWeek } = require('./timezone');

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}
function toHHMM(mins) {
  const h = Math.floor(mins / 60).toString().padStart(2, '0');
  const m = (mins % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * Resolve the effective working window for a photographer on a given date.
 * Priority: availability_overrides (that date) > availability_rules (weekly).
 * Returns { isOff, startTime, endTime } or { isOff: true } if nothing applies.
 */
function resolveWorkingWindow(db, photographerId, dateStr) {
  const override = db
    .prepare(
      `SELECT is_off, start_time, end_time FROM availability_overrides
       WHERE photographer_id = ? AND date = ?`
    )
    .get(photographerId, dateStr);

  if (override) {
    return {
      isOff: !!override.is_off,
      startTime: override.start_time,
      endTime: override.end_time,
      source: 'override',
    };
  }

  const dow = riyadhDayOfWeek(dateStr);
  const rule = db
    .prepare(
      `SELECT is_off, start_time, end_time FROM availability_rules
       WHERE photographer_id = ? AND day_of_week = ?`
    )
    .get(photographerId, dow);

  if (!rule) return { isOff: false, startTime: '05:30', endTime: '22:30', source: 'default' };

  return {
    isOff: !!rule.is_off,
    startTime: rule.start_time,
    endTime: rule.end_time,
    source: 'weekly',
  };
}

/**
 * Generate the fixed slot grid for a working window.
 * step = sessionDuration + bufferMinutes, so every generated slot already
 * has enough travel/setup room before the next one (spec section 12).
 */
function generateGrid(startTime, endTime, sessionDuration, bufferMinutes) {
  const open = toMinutes(startTime);
  const close = toMinutes(endTime);
  const step = sessionDuration + bufferMinutes;
  const slots = [];
  for (let t = open; t + sessionDuration <= close; t += step) {
    slots.push({ start: toHHMM(t), end: toHHMM(t + sessionDuration) });
  }
  return slots;
}

/**
 * Returns true if [aStart,aEnd) and [bStart,bEnd) overlap, in minutes.
 */
function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Compute available slots for a photographer/date/session length, marking
 * grid slots BOOKED when they collide with an existing live booking
 * (including that booking's own buffer, so irregular custom-duration
 * bookings still protect their neighbours even off-grid).
 */
function getAvailableSlots(db, { photographerId, dateStr, sessionDuration, bufferMinutes }) {
  const window = resolveWorkingWindow(db, photographerId, dateStr);
  if (window.isOff || !window.startTime || !window.endTime) {
    return { isOff: true, source: window.source, slots: [] };
  }

  const grid = generateGrid(window.startTime, window.endTime, sessionDuration, bufferMinutes);

  const existing = db
    .prepare(
      `SELECT start_time, end_time FROM bookings
       WHERE photographer_id = ? AND date = ?
       AND status NOT IN ('CANCELLED','NO_SHOW')`
    )
    .all(photographerId, dateStr);

  const busyRanges = existing.map((b) => {
    const s = toMinutes(b.start_time) - bufferMinutes;
    const e = toMinutes(b.end_time) + bufferMinutes;
    return [s, e];
  });

  const slots = grid.map((slot) => {
    const s = toMinutes(slot.start);
    const e = toMinutes(slot.end);
    const isBooked = busyRanges.some(([bs, be]) => overlaps(s, e, bs, be));
    return { ...slot, status: isBooked ? 'BOOKED' : 'AVAILABLE' };
  });

  return { isOff: false, source: window.source, slots };
}

/**
 * Server-side re-check used at the moment of booking creation (spec section
 * 15). Never trust the frontend's cached slot list.
 */
function isSlotStillAvailable(db, { photographerId, dateStr, startTime, endTime, bufferMinutes }) {
  const window = resolveWorkingWindow(db, photographerId, dateStr);
  if (window.isOff) return { ok: false, reason: 'Photographer is not available on this date.' };

  const openOk = window.startTime <= startTime && endTime <= window.endTime;
  if (!openOk) return { ok: false, reason: 'Selected time is outside working hours.' };

  const existing = db
    .prepare(
      `SELECT start_time, end_time FROM bookings
       WHERE photographer_id = ? AND date = ?
       AND status NOT IN ('CANCELLED','NO_SHOW')`
    )
    .all(photographerId, dateStr);

  const s = toMinutes(startTime);
  const e = toMinutes(endTime);
  const collision = existing.some((b) => {
    const bs = toMinutes(b.start_time) - bufferMinutes;
    const be = toMinutes(b.end_time) + bufferMinutes;
    return overlaps(s, e, bs, be);
  });

  if (collision) {
    return { ok: false, reason: 'This time slot is no longer available. Please choose another time.' };
  }
  return { ok: true };
}

module.exports = {
  toMinutes,
  toHHMM,
  resolveWorkingWindow,
  generateGrid,
  getAvailableSlots,
  isSlotStillAvailable,
};
