// All photographer schedules, bookings, and slot math are computed in
// Asia/Riyadh regardless of the browser's timezone (spec section 33).
// The DB never stores a browser-local time; 'date' + 'start_time' fields
// on bookings ARE Asia/Riyadh wall-clock values already, so no conversion
// is needed for slot math. This helper exists for the one place we do
// need a real instant: turning "today" into a Riyadh calendar date, and
// for formatting notification timestamps.

const RIYADH_OFFSET_MINUTES = 3 * 60; // UTC+3, no DST

function nowInRiyadh() {
  const utc = Date.now();
  return new Date(utc + RIYADH_OFFSET_MINUTES * 60 * 1000);
}

function todayRiyadhISODate() {
  const d = nowInRiyadh();
  return d.toISOString().slice(0, 10);
}

function riyadhDayOfWeek(dateStr) {
  // Returns 0=Sunday..6=Saturday for a 'YYYY-MM-DD' Riyadh date, matching
  // the day_of_week convention used in availability_rules.
  const [y, m, d] = dateStr.split('-').map(Number);
  // Date.UTC gives us a stable weekday calc independent of host TZ.
  const jsDay = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun..6=Sat
  return jsDay;
}

function nowRiyadhHHMM() {
  const d = nowInRiyadh();
  const h = String(d.getUTCHours()).padStart(2, '0');
  const m = String(d.getUTCMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function isSlotInPast(dateStr, timeStr) {
  const today = todayRiyadhISODate();
  if (dateStr < today) return true;
  if (dateStr > today) return false;
  const nowTime = nowRiyadhHHMM();
  return timeStr <= nowTime;
}

function formatRiyadhDisplay(dateObj) {
  const d = new Date(dateObj);
  return d.toLocaleString('en-US', { timeZone: 'Asia/Riyadh' });
}

module.exports = {
  nowInRiyadh,
  todayRiyadhISODate,
  riyadhDayOfWeek,
  nowRiyadhHHMM,
  isSlotInPast,
  formatRiyadhDisplay
};
