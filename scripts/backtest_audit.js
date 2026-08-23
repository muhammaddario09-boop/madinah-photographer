/**
 * UMROH LENS MADINAH — Comprehensive Backtest & System Audit Suite
 * Tests all Public & Admin API endpoints, SQLite queries, auth, and booking engines.
 */

const http = require('http');
const app = require('../server');
const db = require('../db');

let server;
let port = 4123;
let baseUrl = `http://localhost:${port}`;
let adminToken = '';

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    if (adminToken && !headers['Authorization']) {
      options.headers['Authorization'] = `Bearer ${adminToken}`;
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (e) {
          json = data;
        }
        resolve({ status: res.statusCode, headers: res.headers, body: json });
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

let passed = 0;
let failed = 0;

function assert(condition, testName, extraInfo = '') {
  if (condition) {
    console.log(`  ✅ [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${testName} ${extraInfo}`);
    failed++;
  }
}

async function runAudit() {
  console.log('\n============================================================');
  console.log('🚀 MEMULAI AUDIT & BACKTEST SISTEM UMROH LENS MADINAH');
  console.log('============================================================\n');

  // Start temporary test server
  await new Promise((resolve) => {
    server = app.listen(port, () => {
      console.log(`📡 Server tes aktif di ${baseUrl}`);
      resolve();
    });
  });

  try {
    // ---------------------------------------------------------
    // 1. PUBLIC APIS
    // ---------------------------------------------------------
    console.log('\n--- 1. AUDIT PUBLIC APIS ---');
    
    const health = await request('GET', '/api/health');
    assert(health.status === 200 && health.body.status === 'ok', 'Health Check endpoint (/api/health)');

    const servicesRes = await request('GET', '/api/services');
    assert(servicesRes.status === 200 && Array.isArray(servicesRes.body) && servicesRes.body.length > 0, 'Katalog Layanan Publik (/api/services)');
    const firstSvc = servicesRes.body[0];
    assert(firstSvc.packages && firstSvc.packages.length > 0, `Layanan "${firstSvc.name}" memiliki tier paket harga terpasang`);

    const svcDetail = await request('GET', `/api/services/${firstSvc.slug}`);
    assert(svcDetail.status === 200 && svcDetail.body.id === firstSvc.id, `Detail Layanan per slug (/api/services/${firstSvc.slug})`);

    const locsRes = await request('GET', '/api/locations');
    assert(locsRes.status === 200 && Array.isArray(locsRes.body) && locsRes.body.length > 0, 'Daftar Spot Lokasi Publik (/api/locations)');

    const photoRes = await request('GET', '/api/photographers');
    assert(photoRes.status === 200 && Array.isArray(photoRes.body) && photoRes.body.length > 0, 'Profil Fotografer Publik (/api/photographers)');

    const paymentInfo = await request('GET', '/api/payment-info');
    assert(
      paymentInfo.status === 200 &&
      paymentInfo.body.bankSAR && paymentInfo.body.bankSAR.account &&
      paymentInfo.body.bankIDR && paymentInfo.body.bankIDR.account &&
      paymentInfo.body.adminWhatsApp,
      'Info Pembayaran Dual-Bank (SAR & IDR) + WhatsApp (/api/payment-info)'
    );

    const availRes = await request('GET', '/api/availability?date=2026-09-15&duration=60');
    assert(availRes.status === 200 && Array.isArray(availRes.body.slots), 'Kalkulator Ketersediaan Slot Waktu (/api/availability)');

    const monthAvail = await request('GET', '/api/availability/month?year=2026&month=9');
    assert(monthAvail.status === 200 && monthAvail.body.days, 'Kalender Ketersediaan Bulanan (/api/availability/month)');

    // ---------------------------------------------------------
    // 2. ADMIN AUTHENTICATION & SECURITY
    // ---------------------------------------------------------
    console.log('\n--- 2. AUDIT ADMIN AUTH & SECURITY ---');

    const unauthMe = await request('GET', '/api/admin/me');
    assert(unauthMe.status === 401, 'Proteksi Akses Tanpa Token ditolak dengan HTTP 401');

    const loginRes = await request('POST', '/api/admin/login', {
      email: 'admin@madinahphoto.com',
      password: process.env.ADMIN_PASSWORD || 'AdminMadinah2026!'
    });
    assert(loginRes.status === 200 && loginRes.body.token, 'Login Admin Master Sukses & Token Diterbitkan');
    adminToken = loginRes.body.token;

    const authMe = await request('GET', '/api/admin/me');
    assert(authMe.status === 200 && authMe.body.user && authMe.body.user.role === 'ADMIN', 'Verifikasi Admin Me (/api/admin/me)');

    // ---------------------------------------------------------
    // 3. ADMIN DASHBOARD & METRICS
    // ---------------------------------------------------------
    console.log('\n--- 3. AUDIT ADMIN DASHBOARD & STATISTIK ---');

    const dashRes = await request('GET', '/api/admin/dashboard');
    assert(
      dashRes.status === 200 &&
      typeof dashRes.body.todayShoots === 'number' &&
      typeof dashRes.body.upcoming === 'number' &&
      typeof dashRes.body.pendingPayments === 'number',
      'Metrik Dashboard KPI (/api/admin/dashboard)'
    );

    const calRes = await request('GET', '/api/admin/calendar');
    assert(calRes.status === 200 && Array.isArray(calRes.body), 'Kalender Reservasi Admin (/api/admin/calendar)');

    // ---------------------------------------------------------
    // 4. ADMIN SETTINGS (DUAL BANK & KURS)
    // ---------------------------------------------------------
    console.log('\n--- 4. AUDIT SETTINGS, KURS & DUAL-BANK ---');

    const getSettings = await request('GET', '/api/admin/settings');
    assert(getSettings.status === 200 && getSettings.body.idr_sar_rate, 'Ambil Pengaturan Kurs & Bank (/api/admin/settings)');

    const updateSettings = await request('PUT', '/api/admin/settings', {
      idr_sar_rate: '4250',
      bank_sar_name: 'Al Rajhi Bank (Saudi Arabia)',
      bank_sar_account: 'SA84 8000 0123 4567 8901 2345',
      bank_sar_holder: 'UMROH LENS Photography Studio',
      bank_idr_name: 'Bank Central Asia (BCA)',
      bank_idr_account: '5420123456 (BCA)',
      bank_idr_holder: 'WAHYU AFRIANSYAH',
      admin_whatsapp: '+6282175272547',
      admin_whatsapp_2: '+6281234567890'
    });
    assert(updateSettings.status === 200 && updateSettings.body.ok, 'Simpan Pengaturan Kurs & Dual-Bank Sukses');

    // ---------------------------------------------------------
    // 5. SERVICES & PACKAGES CRUD LIFECYCLE
    // ---------------------------------------------------------
    console.log('\n--- 5. AUDIT LIFECYCLE LAYANAN & PAKET (TAMBAH, EDIT, HAPUS) ---');

    // 5a. Create Service
    const createSvc = await request('POST', '/api/admin/services', {
      name: 'Audited Test Service Madinah',
      slug: 'audited-test-service',
      description: 'Layanan uji coba otomatis audit backend',
      cover_image: '/img/service-golden-hour.jpg',
      duration_minutes: 75,
      starting_price: 450,
      currency: 'SAR',
      edited_photos: 15,
      sort_order: 99
    });
    assert(createSvc.status === 200 && createSvc.body.id, 'Tambah Layanan Baru (/api/admin/services POST)');
    const createdSvcId = createSvc.body.id;

    // 5b. Update Service
    const updateSvc = await request('PUT', `/api/admin/services/${createdSvcId}`, {
      name: 'Audited Test Service Madinah (Updated)',
      description: 'Deskripsi terupdate melalui audit',
      cover_image: '/img/service-golden-hour.jpg',
      starting_price: 480,
      currency: 'SAR',
      edited_photos: 20
    });
    assert(updateSvc.status === 200 && updateSvc.body.ok, `Update Layanan ID #${createdSvcId}`);

    // 5c. Create Package under this service
    const createPkg = await request('POST', '/api/admin/packages', {
      service_id: createdSvcId,
      name: 'Test VVIP Tier',
      description: 'Fasilitas lengkap sesi uji coba',
      price: 850,
      currency: 'SAR',
      duration_minutes: 75,
      edited_photos: 30,
      deposit_percentage: 30
    });
    assert(createPkg.status === 200 && createPkg.body.id, 'Tambah Tier Paket Baru (/api/admin/packages POST)');
    const createdPkgId = createPkg.body.id;

    // 5d. Update Package
    const updatePkg = await request('PUT', `/api/admin/packages/${createdPkgId}`, {
      name: 'Test VVIP Tier (Updated)',
      price: 900,
      duration_minutes: 75,
      edited_photos: 35,
      deposit_percentage: 30,
      description: 'Deskripsi paket terupdate'
    });
    assert(updatePkg.status === 200 && updatePkg.body.ok, `Update Paket ID #${createdPkgId}`);

    // 5e. Delete Package
    const delPkg = await request('DELETE', `/api/admin/packages/${createdPkgId}`);
    assert(delPkg.status === 200 && delPkg.body.ok, `Hapus Paket ID #${createdPkgId}`);

    // 5f. Delete Service
    const delSvc = await request('DELETE', `/api/admin/services/${createdSvcId}`);
    assert(delSvc.status === 200 && delSvc.body.ok, `Hapus Layanan ID #${createdSvcId}`);

    // ---------------------------------------------------------
    // 6. BOOKING & PAYMENT PROOF FLOW LIFECYCLE
    // ---------------------------------------------------------
    console.log('\n--- 6. AUDIT BOOKING & VERIFIKASI PEMBAYARAN ---');

    // 6a. Create Booking via Public API
    const randomDay = Math.floor(Math.random() * 20 + 1).toString().padStart(2, '0');
    const testDate = `2026-11-${randomDay}`;
    const bookingRes = await request('POST', '/api/bookings', {
      photographerId: 1,
      packageId: 1,
      locationId: 1,
      date: testDate,
      startTime: '08:00',
      clientName: 'Test Jemaah Audit',
      clientPhone: '+6281234567890',
      clientEmail: 'jemaah.audit@example.com',
      clientCountry: 'Indonesia',
      occasion: 'Umrah',
      numberOfPeople: 2,
      paymentProof: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    });

    assert(bookingRes.status === 201 && bookingRes.body.bookingCode, `Buat Reservasi Baru (Booking Code: ${bookingRes.body?.bookingCode})`);
    const bookingCode = bookingRes.body?.bookingCode;
    const bookingId = bookingRes.body?.id;

    // 6b. Retrieve Booking by Code
    const getBooking = await request('GET', `/api/bookings/${bookingCode}`);
    assert(getBooking.status === 200 && getBooking.body.booking && getBooking.body.booking.booking_code === bookingCode, `Ambil Booking Detail (/api/bookings/${bookingCode})`);

    // 6c. Verify Payment Status Update by Admin
    const updatePay = await request('POST', `/api/admin/bookings/${bookingId}/status`, {
      payment_status: 'PAID',
      status: 'CONFIRMED'
    });
    assert(updatePay.status === 200 && updatePay.body.ok, 'Verifikasi & Konfirmasi Pembayaran Sesi oleh Admin');

    // 6d. Input Google Drive link by Admin
    const updateDrive = await request('POST', `/api/admin/bookings/${bookingId}/drive`, {
      drive_url: 'https://drive.google.com/drive/folders/test-audit-folder-123'
    });
    assert(updateDrive.status === 200 && updateDrive.body.ok, 'Simpan Link Google Drive Hasil Foto');

    // 6e. Clean up test booking
    const delBooking = await request('DELETE', `/api/admin/bookings/${bookingId}`);
    assert(delBooking.status === 200 && delBooking.body.ok, `Hapus Booking Uji Coba ID #${bookingId}`);

    // ---------------------------------------------------------
    // 7. INTERACTIVE TELEGRAM BOT & WEBHOOK AUDIT
    // ---------------------------------------------------------
    console.log('\n--- 7. AUDIT ASISTEN INTERAKTIF TELEGRAM BOT ---');

    // 7a. Test Webhook receiving /today command
    const hookToday = await request('POST', '/api/telegram/webhook', {
      message: {
        chat: { id: 8521969387 },
        from: { first_name: 'Wahyu' },
        text: '/today'
      }
    });
    assert(hookToday.status === 200 && hookToday.body.ok, 'Webhook Bot merespon perintah "/today" (Jadwal Hari Ini)');

    // 7b. Test Webhook receiving "berapa total reservasi"
    const hookSummary = await request('POST', '/api/telegram/webhook', {
      message: {
        chat: { id: 8521969387 },
        from: { first_name: 'Wahyu' },
        text: 'berapa total reservasi'
      }
    });
    assert(hookSummary.status === 200 && hookSummary.body.ok, 'Webhook Bot merespon pertanyaan "berapa total reservasi" (/total)');

    // 7c. Test Webhook receiving /pending
    const hookPending = await request('POST', '/api/telegram/webhook', {
      message: {
        chat: { id: 8521969387 },
        from: { first_name: 'Wahyu' },
        text: '/pending'
      }
    });
    assert(hookPending.status === 200 && hookPending.body.ok, 'Webhook Bot merespon perintah "/pending"');

    // 7d. Test Webhook receiving /kurs
    const hookKurs = await request('POST', '/api/telegram/webhook', {
      message: {
        chat: { id: 8521969387 },
        from: { first_name: 'Wahyu' },
        text: '/kurs'
      }
    });
    assert(hookKurs.status === 200 && hookKurs.body.ok, 'Webhook Bot merespon perintah "/kurs" (Info Bank & Kurs)');

    // ---------------------------------------------------------
    // 8. SUMMARY
    // ---------------------------------------------------------
    console.log('\n============================================================');
    console.log(`📊 HASIL AUDIT & BACKTEST:`);
    console.log(`   ✅ Lulus (Passed) : ${passed}`);
    console.log(`   ❌ Gagal (Failed) : ${failed}`);
    console.log('============================================================\n');

  } catch (err) {
    console.error('Fatal audit error:', err);
    failed++;
  }

  if (server) {
    server.close();
  }

  setTimeout(() => {
    process.exit(failed > 0 ? 1 : 0);
  }, 100);
}

runAudit();
