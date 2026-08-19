// NOTIFICATION ENGINE (spec sections 23-24)
// Provider-agnostic by design: routes call queueNotification(), and a
// `channel` column decides WHATSAPP / EMAIL / SMS. No provider is wired
// in this build (no WhatsApp Business API / Twilio credentials exist in
// this environment) — sendViaProvider() is the single seam to implement
// later. Until then, notifications are recorded as QUEUED and the admin
// UI renders the exact message so it can be sent manually.

function renderConfirmation(booking, service, photographer, location) {
  return [
    `Hello ${booking.clientName}, your photography session in Madinah has been confirmed.`,
    `Booking ID: ${booking.bookingCode}`,
    `Service: ${service.name}`,
    `Date: ${booking.date}`,
    `Time: ${booking.start_time} - ${booking.end_time}`,
    `Location: ${location ? location.name : 'TBD'}`,
    `Photographer: ${photographer.name}`,
  ].join('\n');
}

function renderReminder(booking, hoursBefore) {
  const line = hoursBefore === 24
    ? 'Your photography session is tomorrow.'
    : `Your photography session starts in ${hoursBefore} hours.`;
  return [
    line,
    `Booking ID: ${booking.booking_code}`,
    `Date: ${booking.date}`,
    `Time: ${booking.start_time} - ${booking.end_time}`,
  ].join('\n');
}

function queueNotification(db, { bookingId, channel, type, payload, scheduledFor }) {
  db.prepare(
    `INSERT INTO notifications (booking_id, channel, type, payload, status, scheduled_for)
     VALUES (?,?,?,?, 'QUEUED', ?)`
  ).run(bookingId, channel, type, payload, scheduledFor || null);
}

// Seam for a real provider later: WhatsApp Cloud API, SendGrid, Twilio, etc.
async function sendViaProvider(_notification) {
  throw new Error('No notification provider configured. Implement sendViaProvider() for WHATSAPP/EMAIL/SMS.');
}

module.exports = { renderConfirmation, renderReminder, queueNotification, sendViaProvider };
