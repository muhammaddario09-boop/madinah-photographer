/**
 * UMROH LENS — Telegram Bot Notification Dispatcher
 * Sends instant real-time alerts to Admin Telegram whenever a new booking is created or updated.
 */

const { fetchSettingsFromSupabase } = require('./supabase');

async function getTelegramConfig(db) {
  let botToken = process.env.TELEGRAM_BOT_TOKEN || '';
  let chatId = process.env.TELEGRAM_CHAT_ID || '';

  // Check Supabase / SQLite settings for dynamic overrides
  try {
    const supaSettings = await fetchSettingsFromSupabase();
    if (supaSettings) {
      if (supaSettings.telegram_bot_token) botToken = supaSettings.telegram_bot_token;
      if (supaSettings.telegram_chat_id) chatId = supaSettings.telegram_chat_id;
    }
  } catch (e) {}

  if ((!botToken || !chatId) && db) {
    try {
      const rowToken = db.prepare(`SELECT value FROM settings WHERE key='telegram_bot_token'`).get();
      const rowChat = db.prepare(`SELECT value FROM settings WHERE key='telegram_chat_id'`).get();
      if (rowToken && rowToken.value) botToken = rowToken.value;
      if (rowChat && rowChat.value) chatId = rowChat.value;
    } catch (e) {}
  }

  return {
    botToken: String(botToken || '').trim(),
    chatId: String(chatId || '').trim()
  };
}

/**
 * Send custom message to Telegram
 */
async function sendTelegramMessage(text, db = null, customToken = null, customChatId = null) {
  const config = await getTelegramConfig(db);
  const botToken = customToken || config.botToken;
  const chatId = customChatId || config.chatId;

  if (!botToken || !chatId) {
    return { ok: false, error: 'Telegram Bot Token atau Chat ID belum dikonfigurasi.' };
  }

  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      })
    });

    const data = await res.json();
    if (!res.ok || !data.ok) {
      throw new Error(data.description || 'Gagal mengirim pesan Telegram');
    }

    console.log('[Telegram Notification] Sent successfully to chat_id:', chatId);
    return { ok: true, result: data.result };
  } catch (err) {
    console.error('[Telegram Notification Error]', err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Send New Booking Notification to Telegram
 */
async function sendNewBookingTelegramAlert(bookingData, db = null) {
  const {
    bookingCode,
    clientName,
    clientPhone,
    clientCountry,
    serviceName,
    packageName,
    date,
    startTime,
    endTime,
    locationName,
    occasion,
    numberOfPeople,
    depositAmount,
    totalPrice,
    currency,
    hasProof
  } = bookingData;

  const rawPhone = String(clientPhone || '').replace(/[^0-9]/g, '');
  const waLink = rawPhone ? `https://wa.me/${rawPhone}` : '#';

  const htmlMessage = [
    `📸 <b>NOTIFIKASI RESERVASI BARU — UMROH LENS</b> 🇸🇦`,
    `━━━━━━━━━━━━━━━━━━━━━━━━`,
    `📋 <b>Kode Booking</b>: <code>${bookingCode}</code>`,
    `👤 <b>Nama Jemaah</b>: <b>${clientName || 'Guest'}</b>`,
    `📱 <b>WhatsApp</b>: <a href="${waLink}">${clientPhone || '—'}</a> (${clientCountry || 'Indonesia'})`,
    `📸 <b>Layanan</b>: ${serviceName || 'Madinah Photoshoot'}`,
    `📦 <b>Paket</b>: ${packageName || 'Standard Bespoke'}`,
    `📅 <b>Tanggal Sesi</b>: <b>${date}</b>`,
    `⏰ <b>Waktu Madinah</b>: <b>${startTime} – ${endTime}</b>`,
    `📍 <b>Lokasi</b>: ${locationName || 'Masjid Nabawi Area'}`,
    `👥 <b>Peserta</b>: ${numberOfPeople || 1} Orang (${occasion || 'Umrah'})`,
    `💵 <b>Deposit</b>: ${currency || 'SAR'} ${depositAmount || 0}`,
    `💰 <b>Total Investasi</b>: ${currency || 'SAR'} ${totalPrice || 0}`,
    `🧾 <b>Bukti Transfer</b>: ${hasProof ? '✅ Sudah Dilampirkan' : '⏳ Belum / Kirim via WA'}`,
    `━━━━━━━━━━━━━━━━━━━━━━━━`,
    `⚡ <b>Tautan Cepat Admin</b>:`,
    `👉 <a href="https://madinah-photographer.vercel.app/admin/bookings.html">Buka Panel Bookings &amp; Kelola</a>`,
    `👉 <a href="${waLink}">Chat Jemaah via WhatsApp</a>`,
    `👉 <a href="https://madinah-photographer.vercel.app/invoice.html?code=${bookingCode}">Lihat Kuitansi Invoice</a>`
  ].join('\n');

  return sendTelegramMessage(htmlMessage, db);
}

module.exports = {
  getTelegramConfig,
  sendTelegramMessage,
  sendNewBookingTelegramAlert
};
