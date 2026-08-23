/**
 * UMROH LENS — Telegram Bot Notification Dispatcher & Interactive Command Bot
 * Handles two-way communication:
 * 1. Outgoing alerts (new booking notifications, status changes)
 * 2. Incoming admin commands (/today, /total, /pending, /besok, /cek, /kurs)
 */

const { fetchSettingsFromSupabase, fetchBookingsFromSupabase, fetchBookingByCodeFromSupabase } = require('./supabase');
const { todayRiyadhISODate } = require('./timezone');

async function getTelegramConfig(db) {
  let botToken = process.env.TELEGRAM_BOT_TOKEN || '';
  let chatId = process.env.TELEGRAM_CHAT_ID || '';

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
 * Send message to Telegram chat
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

/**
 * Handle incoming user commands sent directly to the Telegram bot
 */
async function handleTelegramIncomingMessage(message, db) {
  if (!message || !message.text) return;

  const text = message.text.trim();
  const lower = text.toLowerCase();
  const chatId = String(message.chat.id);
  const senderName = message.from?.first_name || 'Admin';

  const today = todayRiyadhISODate();
  const todayDateObj = new Date(today + 'T00:00:00Z');
  const tomorrowDateObj = new Date(todayDateObj.getTime() + 24 * 60 * 60 * 1000);
  const tomorrow = tomorrowDateObj.toISOString().slice(0, 10);

  // 1. HELP / START MENU
  if (lower.startsWith('/start') || lower.startsWith('/help') || lower === 'menu' || lower === 'halo' || lower === 'hai' || lower === 'bantuan') {
    const menuMsg = [
      `👋 <b>Ahlan wa Sahlan, ${senderName}!</b>`,
      `Saya asisten bot resmi <b>UMROH LENS Madinah</b> 🇸🇦.`,
      ``,
      `Anda dapat mengirim perintah atau mengetik langsung pertanyaan berikut:`,
      `━━━━━━━━━━━━━━━━━━━━━━━━`,
      `📅 <b>/today</b> (atau ketik: <i>"hari ini jadwal apa"</i>)`,
      `👉 Melihat jadwal pemotretan hari ini di Madinah.`,
      ``,
      `🗓️ <b>/besok</b> (atau <b>/tomorrow</b>)`,
      `👉 Melihat jadwal pemotretan besok.`,
      ``,
      `📊 <b>/total</b> (atau <b>/summary</b> / <i>"berapa total reservasi"</i>)`,
      `👉 Rekap jumlah total reservasi &amp; omset terkumpul.`,
      ``,
      `⚠️ <b>/pending</b>`,
      `👉 Daftar jemaah yang menunggu verifikasi transfer / DP.`,
      ``,
      `🔎 <b>/cek [KODE]</b> (contoh: <code>/cek MDN-2026-0001</code>)`,
      `👉 Melihat detail status jemaah &amp; link Google Drive foto.`,
      ``,
      `💱 <b>/kurs</b>`,
      `👉 Info kurs SAR ➔ IDR &amp; nomor rekening bank studio.`,
      `━━━━━━━━━━━━━━━━━━━━━━━━`,
      `🌐 Panel Admin: <a href="https://madinah-photographer.vercel.app/admin">madinah-photographer.vercel.app</a>`
    ].join('\n');

    return sendTelegramMessage(menuMsg, db, null, chatId);
  }

  // 2. TODAY'S SHOOTS SCHEDULE
  if (
    lower.startsWith('/today') ||
    lower.startsWith('/hariini') ||
    lower.includes('hari ini') ||
    lower.includes('jadwal hari ini') ||
    lower.includes('jadwal apa')
  ) {
    let bookings = await fetchBookingsFromSupabase({ from: today, to: today });
    if (bookings === null && db) {
      bookings = db.prepare(`
        SELECT b.*, COALESCE(c.name, 'Guest') as client_name, COALESCE(c.phone, '') as client_phone, COALESCE(s.name, 'Madinah Session') as service_name, COALESCE(p.name, 'UMROH LENS') as photographer_name
        FROM bookings b
        LEFT JOIN clients c ON c.id=b.client_id
        LEFT JOIN services s ON s.id=b.service_id
        LEFT JOIN photographers p ON p.id=b.photographer_id
        WHERE b.date=? AND b.status NOT IN ('CANCELLED','NO_SHOW')
        ORDER BY b.start_time ASC
      `).all(today);
    }

    const activeBookings = (Array.isArray(bookings) ? bookings : []).filter(b => !['CANCELLED', 'NO_SHOW'].includes(b.status));

    if (activeBookings.length === 0) {
      const emptyMsg = [
        `🕌 <b>JADWAL HARI INI — ${today} (WAKTU MADINAH)</b>`,
        `━━━━━━━━━━━━━━━━━━━━━━━━`,
        `✅ <b>Tidak ada jadwal sesi foto hari ini.</b>`,
        `Semua tenang &amp; siap untuk sesi berikutnya! ✨`
      ].join('\n');
      return sendTelegramMessage(emptyMsg, db, null, chatId);
    }

    const listText = activeBookings.map((b, i) => {
      const rawPhone = (b.client_phone || '').replace(/[^0-9]/g, '');
      const waLink = rawPhone ? `https://wa.me/${rawPhone}` : '#';
      const driveInfo = b.drive_url ? `✅ <a href="${b.drive_url}">Link Drive Tersedia</a>` : `⏳ <i>Belum diinput link Drive</i>`;
      return [
        `<b>${i + 1}. ⏰ ${b.start_time} – ${b.end_time}</b>`,
        `   👤 Jemaah: <b>${b.client_name}</b> (<a href="${waLink}">Chat WA</a>)`,
        `   📸 Sesi: ${b.service_name}`,
        `   💰 Status Bayar: <b>${b.payment_status?.replace('_', ' ')}</b>`,
        `   📁 Drive: ${driveInfo}`,
        `   📋 Kode: <code>${b.booking_code}</code>`
      ].join('\n');
    }).join('\n\n');

    const msg = [
      `🎯 <b>JADWAL PEMOTRETAN HARI INI (${activeBookings.length} SESI)</b>`,
      `📅 Tanggal: <b>${today} (Waktu Madinah)</b>`,
      `━━━━━━━━━━━━━━━━━━━━━━━━`,
      listText,
      `━━━━━━━━━━━━━━━━━━━━━━━━`,
      `👉 <a href="https://madinah-photographer.vercel.app/admin/calendar.html">Buka Kalender Lengkap</a>`
    ].join('\n');

    return sendTelegramMessage(msg, db, null, chatId);
  }

  // 3. TOMORROW'S SHOOTS SCHEDULE
  if (
    lower.startsWith('/besok') ||
    lower.startsWith('/tomorrow') ||
    lower.includes('besok') ||
    lower.includes('jadwal besok')
  ) {
    let bookings = await fetchBookingsFromSupabase({ from: tomorrow, to: tomorrow });
    if (bookings === null && db) {
      bookings = db.prepare(`
        SELECT b.*, COALESCE(c.name, 'Guest') as client_name, COALESCE(c.phone, '') as client_phone, COALESCE(s.name, 'Madinah Session') as service_name
        FROM bookings b
        LEFT JOIN clients c ON c.id=b.client_id
        LEFT JOIN services s ON s.id=b.service_id
        WHERE b.date=? AND b.status NOT IN ('CANCELLED','NO_SHOW')
        ORDER BY b.start_time ASC
      `).all(tomorrow);
    }

    const activeBookings = (Array.isArray(bookings) ? bookings : []).filter(b => !['CANCELLED', 'NO_SHOW'].includes(b.status));

    if (activeBookings.length === 0) {
      return sendTelegramMessage(`🕌 <b>JADWAL BESOK (${tomorrow})</b>:\nBelum ada jadwal sesi foto untuk besok.`, db, null, chatId);
    }

    const listText = activeBookings.map((b, i) => (
      `<b>${i + 1}. ⏰ ${b.start_time} – ${b.end_time}</b>\n   👤 <b>${b.client_name}</b> (${b.service_name})\n   📋 <code>${b.booking_code}</code>`
    )).join('\n\n');

    const msg = [
      `🗓️ <b>JADWAL PEMOTRETAN BESOK (${activeBookings.length} SESI)</b>`,
      `📅 Tanggal: <b>${tomorrow} (Waktu Madinah)</b>`,
      `━━━━━━━━━━━━━━━━━━━━━━━━`,
      listText,
      `━━━━━━━━━━━━━━━━━━━━━━━━`,
      `👉 <a href="https://madinah-photographer.vercel.app/admin/bookings.html">Lihat Data Jemaah</a>`
    ].join('\n');

    return sendTelegramMessage(msg, db, null, chatId);
  }

  // 4. SUMMARY / TOTAL RESERVASI & REVENUE
  if (
    lower.startsWith('/total') ||
    lower.startsWith('/summary') ||
    lower.startsWith('/rekap') ||
    lower.includes('total reservasi') ||
    lower.includes('berapa total') ||
    lower.includes('omset') ||
    lower.includes('rekap')
  ) {
    let allBookings = await fetchBookingsFromSupabase();
    if (allBookings === null && db) {
      allBookings = db.prepare(`SELECT * FROM bookings`).all();
    }
    const list = Array.isArray(allBookings) ? allBookings : [];

    const total = list.length;
    const confirmed = list.filter(b => ['CONFIRMED', 'COMPLETED'].includes(b.status)).length;
    const pending = list.filter(b => ['PENDING', 'AWAITING_PAYMENT'].includes(b.status)).length;
    const cancelled = list.filter(b => b.status === 'CANCELLED').length;
    const paid = list.filter(b => ['PAID', 'DEPOSIT_PAID'].includes(b.payment_status)).length;
    const unpaid = list.filter(b => b.payment_status === 'UNPAID' && b.status !== 'CANCELLED').length;

    const totalRevenueSAR = list
      .filter(b => ['DEPOSIT_PAID', 'PAID'].includes(b.payment_status) && b.status !== 'CANCELLED')
      .reduce((sum, b) => sum + (Number(b.total_price) || 0), 0);

    let s = await fetchSettingsFromSupabase();
    const rate = Number(s?.idr_sar_rate) || 4200;
    const revenueIDR = (totalRevenueSAR * rate).toLocaleString('id-ID');

    const msg = [
      `📊 <b>REKAP &amp; TOTAL RESERVASI — UMROH LENS</b> 🇸🇦`,
      `━━━━━━━━━━━━━━━━━━━━━━━━`,
      `📋 <b>Total Reservasi Terdaftar</b>: <b>${total} Booking</b>`,
      `✅ <b>Sesi Terkonfirmasi/Selesai</b>: <b>${confirmed} Sesi</b>`,
      `⏳ <b>Menunggu Konfirmasi</b>: <b>${pending} Booking</b>`,
      `❌ <b>Dibatalkan</b>: <b>${cancelled}</b>`,
      `━━━━━━━━━━━━━━━━━━━━━━━━`,
      `💳 <b>Status Pembayaran</b>:`,
      `• DP / Lunas: <b>${paid}</b> Jemaah`,
      `• Menunggu Transfer (UNPAID): <b>${unpaid}</b> Jemaah`,
      ``,
      `💰 <b>Total Estimasi Omset Terkumpul</b>:`,
      `💵 <b>SAR ${totalRevenueSAR.toLocaleString()}</b> (≈ Rp ${revenueIDR})`,
      `━━━━━━━━━━━━━━━━━━━━━━━━`,
      `👉 <a href="https://madinah-photographer.vercel.app/admin">Buka Dashboard Admin</a>`
    ].join('\n');

    return sendTelegramMessage(msg, db, null, chatId);
  }

  // 5. PENDING PAYMENTS
  if (
    lower.startsWith('/pending') ||
    lower.includes('pending') ||
    lower.includes('belum bayar') ||
    lower.includes('menunggu pembayaran')
  ) {
    let allBookings = await fetchBookingsFromSupabase();
    if (allBookings === null && db) {
      allBookings = db.prepare(`
        SELECT b.*, COALESCE(c.name, 'Guest') as client_name, COALESCE(c.phone, '') as client_phone, COALESCE(s.name, 'Madinah Session') as service_name
        FROM bookings b
        LEFT JOIN clients c ON c.id=b.client_id
        LEFT JOIN services s ON s.id=b.service_id
        WHERE b.payment_status='UNPAID' AND b.status NOT IN ('CANCELLED')
      `).all();
    }

    const pendingList = (Array.isArray(allBookings) ? allBookings : []).filter(b => b.payment_status === 'UNPAID' && b.status !== 'CANCELLED');

    if (pendingList.length === 0) {
      return sendTelegramMessage(`✅ <b>Semua Bersih!</b> Tidak ada pembayaran yang pending saat ini.`, db, null, chatId);
    }

    const rows = pendingList.slice(0, 8).map((b, i) => {
      const rawPhone = (b.client_phone || '').replace(/[^0-9]/g, '');
      return `<b>${i + 1}. ${b.client_name}</b> (DP: SAR ${b.deposit_amount})\n   📅 ${b.date} · ⏰ ${b.start_time}\n   📱 <a href="https://wa.me/${rawPhone}">Chat WhatsApp Jemaah</a>\n   📋 <code>${b.booking_code}</code>`;
    }).join('\n\n');

    const msg = [
      `⚠️ <b>PEMBAYARAN MENUNGGU VERIFIKASI (${pendingList.length} BOOKING)</b>`,
      `━━━━━━━━━━━━━━━━━━━━━━━━`,
      rows,
      `━━━━━━━━━━━━━━━━━━━━━━━━`,
      `👉 <a href="https://madinah-photographer.vercel.app/admin/bookings.html">Verifikasi di Panel Admin</a>`
    ].join('\n');

    return sendTelegramMessage(msg, db, null, chatId);
  }

  // 6. CEK BOOKING BY CODE
  if (lower.startsWith('/cek') || lower.includes('mdn-')) {
    const match = text.match(/MDN-\d{4}-\d+/i);
    const code = match ? match[0].toUpperCase() : text.replace('/cek', '').trim().toUpperCase();

    if (!code) {
      return sendTelegramMessage(`⚠️ Format salah. Gunakan contoh: <code>/cek MDN-2026-0001</code>`, db, null, chatId);
    }

    let bData = await fetchBookingByCodeFromSupabase(code);
    if (!bData && db) {
      const b = db.prepare(`SELECT * FROM bookings WHERE booking_code=? COLLATE NOCASE`).get(code);
      if (b) {
        const client = db.prepare(`SELECT * FROM clients WHERE id=?`).get(b.client_id);
        const svc = db.prepare(`SELECT * FROM services WHERE id=?`).get(b.service_id);
        bData = {
          booking: { ...b, client_name: client?.name, client_phone: client?.phone, client_email: client?.email },
          service: svc || { name: 'Madinah Session' }
        };
      }
    }

    if (!bData || !bData.booking) {
      return sendTelegramMessage(`❌ Booking dengan kode <code>${code}</code> tidak ditemukan di sistem.`, db, null, chatId);
    }

    const b = bData.booking;
    const svc = bData.service || {};
    const rawPhone = (b.client_phone || '').replace(/[^0-9]/g, '');

    const msg = [
      `📋 <b>DETAIL RESERVASI: <code>${b.booking_code}</code></b>`,
      `━━━━━━━━━━━━━━━━━━━━━━━━`,
      `👤 <b>Nama Jemaah</b>: <b>${b.client_name || 'Guest'}</b>`,
      `📱 <b>WhatsApp</b>: <a href="https://wa.me/${rawPhone}">${b.client_phone || '—'}</a>`,
      `📸 <b>Layanan</b>: ${svc.name || 'Madinah Session'}`,
      `📅 <b>Tanggal</b>: <b>${b.date}</b>`,
      `⏰ <b>Waktu</b>: <b>${b.start_time} – ${b.end_time} (Madinah)</b>`,
      `💰 <b>Status Bayar</b>: <b>${b.payment_status}</b> (DP: SAR ${b.deposit_amount})`,
      `🎯 <b>Status Sesi</b>: <b>${b.status}</b>`,
      `📁 <b>Google Drive</b>: ${b.drive_url ? `<a href="${b.drive_url}">Buka Folder Drive ↗</a>` : '<i>Belum diinput link Drive</i>'}`,
      `━━━━━━━━━━━━━━━━━━━━━━━━`,
      `🧾 <a href="https://madinah-photographer.vercel.app/invoice.html?code=${b.booking_code}">Buka Invoice Resmi</a> | <a href="https://madinah-photographer.vercel.app/gallery.html?code=${b.booking_code}">Buka Galeri</a>`
    ].join('\n');

    return sendTelegramMessage(msg, db, null, chatId);
  }

  // 7. KURS & BANK INFO
  if (lower.startsWith('/kurs') || lower.includes('kurs') || lower.includes('rekening') || lower.includes('bank')) {
    let s = await fetchSettingsFromSupabase();
    if (!s && db) {
      const rows = db.prepare(`SELECT key, value FROM settings`).all();
      s = {};
      rows.forEach(r => { s[r.key] = r.value; });
    }

    const msg = [
      `💱 <b>PENGATURAN KURS &amp; REKENING RESMI — UMROH LENS</b>`,
      `━━━━━━━━━━━━━━━━━━━━━━━━`,
      `📈 <b>Kurs Aktif</b>: <b>1 SAR = Rp ${(Number(s?.idr_sar_rate) || 4200).toLocaleString('id-ID')}</b>`,
      ``,
      `🇸🇦 <b>Bank Saudi Arabia (SAR)</b>:`,
      `• Bank: <b>${s?.bank_sar_name || 'Al Rajhi Bank'}</b>`,
      `• Rek/IBAN: <code>${s?.bank_sar_account || 'SA84 8000 0123 4567 8901 2345'}</code>`,
      `• A/N: <b>${s?.bank_sar_holder || 'UMROH LENS Photography Studio'}</b>`,
      ``,
      `🇮🇩 <b>Bank Indonesia (Rupiah IDR)</b>:`,
      `• Bank: <b>${s?.bank_idr_name || 'Bank Central Asia (BCA) / BSI'}</b>`,
      `• No. Rek: <code>${s?.bank_idr_account || '5420123456'}</code>`,
      `• A/N: <b>${s?.bank_idr_holder || 'WAHYU AFRIANSYAH'}</b>`,
      `━━━━━━━━━━━━━━━━━━━━━━━━`,
      `⚙️ <a href="https://madinah-photographer.vercel.app/admin/settings.html">Ubah di Panel Pengaturan</a>`
    ].join('\n');

    return sendTelegramMessage(msg, db, null, chatId);
  }

  // Fallback unrecognized query
  const fallbackMsg = [
    `🤖 Perintah tidak dikenali: <i>"${text}"</i>`,
    ``,
    `Ketik <b>/help</b> atau <b>menu</b> untuk melihat daftar perintah yang bisa Anda tanyakan seperti <b>/today</b> (jadwal hari ini) atau <b>/total</b> (total omset & reservasi).`
  ].join('\n');

  return sendTelegramMessage(fallbackMsg, db, null, chatId);
}

module.exports = {
  getTelegramConfig,
  sendTelegramMessage,
  sendNewBookingTelegramAlert,
  handleTelegramIncomingMessage
};
