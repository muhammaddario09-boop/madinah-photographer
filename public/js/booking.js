// BOOKING FLOW — Full State Machine & Payment Handling:
// SERVICE -> PACKAGE -> DATE -> TIME -> DETAILS -> PAYMENT (Bank Details & Receipt Upload) -> CONFIRMATION (Direct WhatsApp)

const STEPS = ['SERVICE', 'PACKAGE', 'DATE', 'TIME', 'DETAILS', 'PAYMENT', 'CONFIRMATION'];
const state = {
  step: 0,
  services: [],
  service: null,
  package: null,
  locations: [],
  photographerId: null,
  paymentInfo: null,
  calMonth: null, calYear: null,
  monthDays: {},
  date: null,
  slots: [],
  time: null,
  client: {},
  photoshoot: {},
  locationId: null,
  paymentProof: '',
  result: null,
  error: null,
};

const params = new URLSearchParams(location.search);

async function init() {
  const [services, photographers, locations, paymentInfo] = await Promise.all([
    fetch('/api/services').then(r => r.json()).catch(() => []),
    fetch('/api/photographers').then(r => r.json()).catch(() => []),
    fetch('/api/locations').then(r => r.json()).catch(() => []),
    fetch('/api/payment-info').then(r => r.json()).catch(() => ({})),
  ]);
  state.services = Array.isArray(services) ? services : [];
  state.locations = Array.isArray(locations) ? locations : [];
  state.photographerId = photographers[0]?.id || 1;
  state.paymentInfo = paymentInfo;

  const presetSlug = params.get('service');
  const presetPkg = params.get('package');
  if (presetSlug) {
    state.service = state.services.find(s => s.slug === presetSlug || String(s.id) === presetSlug) || null;
    if (state.service) {
      state.step = 1;
      if (presetPkg && state.service.packages) {
        state.package = state.service.packages.find(p => String(p.id) === String(presetPkg) || p.name.toLowerCase() === presetPkg.toLowerCase()) || null;
        if (state.package) {
          state.step = 2; // Jump to DATE step
          loadMonth();
        }
      }
    }
  }
  render();
}

function renderSteps() {
  const dots = STEPS.slice(0, 6).map((s, i) => {
    let cls = 'step-dot';
    if (i < state.step) cls += ' done';
    if (i === state.step) cls += ' active';
    return `<div class="${cls}"></div>`;
  }).join('');
  document.getElementById('steps').innerHTML = dots;
}

function goto(step) { state.step = step; state.error = null; render(); window.scrollTo(0,0); }

function render() {
  renderSteps();
  const el = document.getElementById('step-content');
  const stepName = STEPS[state.step];
  el.innerHTML = state.error ? `<div class="error-msg">${state.error}</div>` : '';
  el.innerHTML += ({
    SERVICE: renderService,
    PACKAGE: renderPackage,
    DATE: renderDate,
    TIME: renderTime,
    DETAILS: renderDetails,
    PAYMENT: renderPayment,
    CONFIRMATION: renderConfirmation,
  })[stepName]();
  bindStep(stepName);
}

function renderService() {
  return `
    <div class="step-label">Step 1 — Pilih Layanan</div>
    <h2 style="margin-bottom:24px;">Pilihan Jenis Sesi Fotografi</h2>
    ${state.services.map(s => {
      const isLong = (s.slug || '').includes('family') || (s.slug || '').includes('tour');
      const dur = isLong ? 120 : 90;
      return `
        <div class="option-card ${state.service?.id === s.id ? 'selected' : ''}" data-id="${s.id}" style="display:flex; gap:16px; align-items:center;">
          <div style="width:70px; height:70px; border-radius:4px; background-image:url('${s.cover_image || '/img/service-golden-hour.jpg'}'); background-size:cover; background-position:center; flex-shrink:0; border:1px solid var(--line);"></div>
          <div style="flex:1;">
            <h3 style="font-size:1.05rem;">${s.name}</h3>
            <p style="color:var(--charcoal-soft); font-size:0.86rem; margin-top:4px;">
              ⏱️ ${dur} Menit · 📸 40 Foto Edit + RAW + 1 Min Video
            </p>
          </div>
          <span style="font-size:1.1rem; color:var(--gold); font-weight:600;">Pilih ›</span>
        </div>
      `;
    }).join('')}
  `;
}

function renderPackage() {
  const isLong = (state.service?.slug || '').includes('family') || (state.service?.slug || '').includes('tour');
  const dur = isLong ? 120 : 90;
  const p = (state.service?.packages && state.service.packages[0]) || { id: 1, name: 'Standard Bespoke Session', duration_minutes: dur, edited_photos: 40 };

  return `
    <div class="step-label">Step 2 — Konfirmasi Pilihan Paket Standar</div>
    <h2 style="margin-bottom:24px;">${state.service.name}</h2>
    
    <div class="option-card selected" data-id="${p.id}" style="display:flex; justify-content:space-between; align-items:center; cursor:pointer;">
      <div>
        <h3 style="font-size:1.1rem; color:var(--charcoal);">Standard Bespoke Session</h3>
        <p style="color:var(--charcoal-soft); font-size:0.88rem; margin-top:6px; line-height:1.5;">
          ⏱️ <strong>${dur} Menit Hunting</strong> • 📸 <strong>40 Pcs Foto Edit Resolusi Tinggi</strong><br>
          🎬 <strong>1 Menit Video Reels 4K</strong> • <strong>100% Seluruh File RAW Original</strong>
        </p>
      </div>
      <span style="font-size:0.85rem; font-weight:700; color:var(--gold); background:var(--ivory); padding:6px 14px; border-radius:4px; border:1px solid var(--line); white-space:nowrap;">
        Paket Terpilih ✓
      </span>
    </div>

    <div class="actions-row">
      <button class="btn btn-ghost" id="back">Kembali</button>
      <button class="btn btn-primary" id="next-pkg">Lanjut Pilih Tanggal &amp; Jam →</button>
    </div>
  `;
}

function renderDate() {
  const now = new Date();
  const y = state.calYear || now.getFullYear();
  const m = state.calMonth || (now.getMonth() + 1);
  const monthName = new Date(y, m - 1, 1).toLocaleString('en', { month: 'long' });
  return `
    <div class="step-label">Step 3 — Select Date</div>
    <h2 style="margin-bottom:24px;">Choose a date</h2>
    <div class="cal-nav">
      <button class="btn btn-ghost" id="prev-month" style="padding:8px 14px;" aria-label="Bulan sebelumnya">←</button>
      <strong style="font-family:var(--font-display); font-size:1.2rem;">${monthName} ${y}</strong>
      <button class="btn btn-ghost" id="next-month" style="padding:8px 14px;" aria-label="Bulan berikutnya">→</button>
    </div>
    <div class="cal-grid" id="cal-dow">
      ${['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => `<div class="cal-dow">${d}</div>`).join('')}
    </div>
    <div class="cal-grid" id="cal-grid"><div style="grid-column:1/-1; text-align:center; padding:30px; color:var(--charcoal-soft);">Loading availability…</div></div>
    <div class="actions-row"><button class="btn btn-ghost" id="back">Back</button><span></span></div>
  `;
}

async function loadMonth() {
  const now = new Date();
  const y = state.calYear || now.getFullYear();
  const m = state.calMonth || (now.getMonth() + 1);
  state.calYear = y; state.calMonth = m;
  const res = await fetch(`/api/availability/month?photographerId=${state.photographerId}&year=${y}&month=${m}&duration=${state.package.duration_minutes}`).then(r => r.json());
  state.monthDays = res.days;
  renderCalGrid();
}

function renderCalGrid() {
  const y = state.calYear, m = state.calMonth;
  const first = new Date(Date.UTC(y, m - 1, 1));
  const startDow = first.getUTCDay();
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const todayStr = new Date().toISOString().slice(0,10);
  let cells = '';
  for (let i = 0; i < startDow; i++) cells += `<div></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const status = state.monthDays[dateStr] || 'OFF';
    let cls = 'cal-day';
    if (dateStr < todayStr) cls += ' disabled';
    else if (status === 'OFF') cls += ' off';
    else if (status === 'BOOKED') cls += ' booked';
    else if (status === 'LIMITED') cls += ' limited';
    else cls += ' available';
    if (state.date === dateStr) cls += ' selected';
    cells += `<div class="${cls}" data-date="${dateStr}">${d}</div>`;
  }
  document.getElementById('cal-grid').innerHTML = cells;
  document.querySelectorAll('.cal-day[data-date]').forEach(elm => {
    elm.addEventListener('click', () => {
      state.date = elm.dataset.date;
      state.time = null;
      goto(3);
    });
  });
}

function renderTime() {
  return `
    <div class="step-label">Step 4 — Available Time</div>
    <h2 style="margin-bottom:8px;">${new Date(state.date + 'T00:00:00').toLocaleDateString('en', { weekday:'long', month:'long', day:'numeric' })}</h2>
    <p style="color:var(--charcoal-soft); margin-bottom:24px; font-size:0.88rem;">Times shown in Madinah local time (Asia/Riyadh).</p>
    <div class="manifest" id="manifest"><div style="padding:24px; text-align:center; color:var(--charcoal-soft);">Loading slots…</div></div>
    <div class="actions-row"><button class="btn btn-ghost" id="back">Back</button><span></span></div>
  `;
}

async function loadSlots() {
  const res = await fetch(`/api/availability?photographerId=${state.photographerId}&date=${state.date}&duration=${state.package.duration_minutes}`).then(r => r.json());
  state.slots = res.slots || [];
  const manifest = document.getElementById('manifest');
  if (res.isOff || state.slots.length === 0) {
    manifest.innerHTML = `<div style="padding:24px; text-align:center; color:var(--charcoal-soft);">No sessions available this date. Please choose another date.</div>`;
    return;
  }
  manifest.innerHTML = state.slots.map(s => `
    <div class="manifest-row ${s.status === 'AVAILABLE' ? '' : 'disabled'}" data-time="${s.start}" style="${s.status === 'AVAILABLE' ? 'cursor:pointer;' : 'opacity:0.35;'}">
      <div class="manifest-time">${s.start}</div>
      <div style="color:var(--charcoal-soft); font-size:0.85rem;">${s.start} – ${s.end}</div>
      <div class="manifest-status"><span class="dot ${s.status === 'AVAILABLE' ? 'dot-available' : 'dot-booked'}"></span>${s.status}</div>
    </div>
  `).join('');
  manifest.querySelectorAll('.manifest-row[data-time]:not(.disabled)').forEach(row => {
    row.addEventListener('click', () => { state.time = row.dataset.time; goto(4); });
  });
}

function renderDetails() {
  return `
    <div class="step-label">Step 5 — Your Details</div>
    <h2 style="margin-bottom:24px;">Tell us about the session</h2>
    <div class="field"><label>Full Name *</label><input id="f-name" value="${state.client.name || ''}" placeholder="e.g. Ahmad Fauzi"></div>
    <div class="field"><label>WhatsApp / Phone Number *</label><input id="f-phone" value="${state.client.phone || ''}" placeholder="+62 812 3456 7890 / +966 50 123 4567"></div>
    <div class="field"><label>Email (optional)</label><input id="f-email" value="${state.client.email || ''}" placeholder="name@example.com"></div>
    <div class="field"><label>Country of Residence</label><input id="f-country" value="${state.client.country || ''}" placeholder="Indonesia / Malaysia / Saudi Arabia"></div>
    <div class="field">
      <label>Location in Madinah</label>
      <select id="f-location">
        ${state.locations.map(l => `<option value="${l.id}" ${state.locationId == l.id ? 'selected' : ''}>${l.name}</option>`).join('')}
      </select>
    </div>
    <div class="field">
      <label>What are you celebrating?</label>
      <select id="f-occasion">
        ${['Umrah','Anniversary','Honeymoon','Family Trip','Birthday','Couple Trip','Personal Memories','Other'].map(o => `<option ${state.photoshoot.occasion===o?'selected':''}>${o}</option>`).join('')}
      </select>
    </div>
    <div class="field"><label>Number of People</label><input id="f-people" type="number" min="1" value="${state.photoshoot.people || 1}"></div>
    <div class="field">
      <label>Preferred Style</label>
      <select id="f-style">
        ${['Editorial','Natural','Cinematic','Candid','Traditional'].map(o => `<option ${state.photoshoot.style===o?'selected':''}>${o}</option>`).join('')}
      </select>
    </div>
    <div class="field"><label>Special Requests / Notes</label><textarea id="f-request" placeholder="Hotel pickup, specific timing, or props needed…">${state.photoshoot.request || ''}</textarea></div>
    <div class="actions-row"><button class="btn btn-ghost" id="back">Back</button><button class="btn btn-primary" id="next">Continue to Payment</button></div>
  `;
}

function compressReceiptImage(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (e) => {
      const img = new Image();
      img.src = e.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width, height = img.height;
        if (width > 1200) {
          height = Math.round((height * 1200) / width);
          width = 1200;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => resolve(e.target.result);
    };
    reader.onerror = () => resolve('');
  });
}

function renderPayment() {
  const p = state.package;
  const paymentProof = state.paymentProof || '';
  const pi = state.paymentInfo || {};
  const bankSAR = pi.bankSAR || {};
  const bankIDR = pi.bankIDR || {};
  const depositPct = p.deposit_percentage || 30;
  const totalSAR = p.price || 0;
  const depositSAR = Math.round((totalSAR * depositPct) / 100);
  const rate = bankIDR.rate || 4800;
  const depositIDR = (depositSAR * rate).toLocaleString('id-ID');
  const totalIDR = (totalSAR * rate).toLocaleString('id-ID');
  const adminWA = (pi.adminWhatsApp || '+6282175272547').replace(/[^0-9]/g, '');
  const waLink = `https://wa.me/${adminWA}`;

  return `
    <div class="step-label">Step 6 — Informasi Pembayaran Deposit &amp; Konfirmasi</div>
    <h2 style="margin-bottom:20px;">Ringkasan &amp; Cara Pembayaran</h2>

    <!-- Booking Summary -->
    <div class="summary-line"><span>Layanan Sesi</span><strong>${state.service.name}</strong></div>
    <div class="summary-line"><span>Paket</span><span>${p.name} (${p.duration_minutes} Menit)</span></div>
    <div class="summary-line"><span>Tanggal &amp; Waktu</span><strong>${state.date} pukul ${state.time} (Madinah)</strong></div>
    <div class="summary-line"><span>Nama Jemaah</span><span>${state.client.name || '—'}</span></div>
    <div class="summary-line"><span>Kontak WhatsApp</span><span>${state.client.phone || '—'}</span></div>

    <!-- Pricing Box -->
    <div style="background:linear-gradient(135deg,#2C1810,#3D2515); color:#F5EFE0; border-radius:10px; padding:20px 22px; margin:22px 0;">
      <div style="font-size:0.78rem; text-transform:uppercase; letter-spacing:0.08em; color:#C9A96E; margin-bottom:10px; font-weight:600;">💵 Investasi Sesi Foto Anda</div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <span style="font-size:0.9rem; opacity:0.85;">Total Investasi</span>
        <span style="font-size:1.05rem; font-weight:700; color:#F0D080;">SAR ${totalSAR} <span style="font-size:0.78rem; opacity:0.7;">(≈ Rp ${totalIDR})</span></span>
      </div>
      <div style="border-top:1px solid rgba(255,255,255,0.15); margin:10px 0; padding-top:10px; display:flex; justify-content:space-between; align-items:center;">
        <span style="font-size:0.9rem; opacity:0.85;">Uang Muka / DP (${depositPct}%)</span>
        <span style="font-size:1.35rem; font-weight:800; color:#F5C842;">SAR ${depositSAR} <span style="font-size:0.82rem; font-weight:600; opacity:0.85;">(≈ Rp ${depositIDR})</span></span>
      </div>
      <div style="font-size:0.76rem; color:rgba(245,239,224,0.6); margin-top:6px;">Sisa ${100-depositPct}% dibayarkan tunai saat hari sesi di Madinah</div>
    </div>

    <!-- Bank SAR -->
    <div style="background:#fff; border:1px solid var(--line); border-left:4px solid #25D366; border-radius:8px; padding:18px 20px; margin-bottom:14px;">
      <div style="font-size:0.76rem; font-weight:700; text-transform:uppercase; letter-spacing:0.07em; color:#888; margin-bottom:10px;">🇸🇦 Transfer via Bank Saudi (SAR — Untuk Jemaah di Arab Saudi)</div>
      <div style="display:grid; gap:6px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:0.85rem; color:var(--charcoal-soft);">Nama Bank</span>
          <strong style="font-size:0.9rem;">${bankSAR.name || 'Al Rajhi Bank'}</strong>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:0.85rem; color:var(--charcoal-soft);">No. Rekening / IBAN</span>
          <strong style="font-size:0.88rem; font-family:monospace; background:#f5f5f5; padding:3px 8px; border-radius:3px;">${bankSAR.account || 'SA84 8000 0123 4567 8901 2345'}</strong>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:0.85rem; color:var(--charcoal-soft);">Atas Nama</span>
          <strong style="font-size:0.9rem;">${bankSAR.holder || 'UMROH LENS Photography'}</strong>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:0.85rem; color:var(--charcoal-soft);">Jumlah DP</span>
          <strong style="font-size:1rem; color:#2E5B1A;">SAR ${depositSAR}</strong>
        </div>
      </div>
    </div>

    <!-- Bank IDR -->
    <div style="background:#fff; border:1px solid var(--line); border-left:4px solid #1a73e8; border-radius:8px; padding:18px 20px; margin-bottom:20px;">
      <div style="font-size:0.76rem; font-weight:700; text-transform:uppercase; letter-spacing:0.07em; color:#888; margin-bottom:10px;">🇮🇩 Transfer via Bank Indonesia (IDR — Untuk Jemaah dari Indonesia)</div>
      <div style="display:grid; gap:6px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:0.85rem; color:var(--charcoal-soft);">Nama Bank</span>
          <strong style="font-size:0.9rem;">${bankIDR.name || 'BCA / BSI'}</strong>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:0.85rem; color:var(--charcoal-soft);">No. Rekening</span>
          <strong style="font-size:0.88rem; font-family:monospace; background:#f5f5f5; padding:3px 8px; border-radius:3px;">${bankIDR.account || '5420123456'}</strong>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:0.85rem; color:var(--charcoal-soft);">Atas Nama</span>
          <strong style="font-size:0.9rem;">${bankIDR.holder || 'WAHYU AFRIANSYAH'}</strong>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:0.85rem; color:var(--charcoal-soft);">Jumlah DP</span>
          <strong style="font-size:1rem; color:#1a4fa8;">Rp ${depositIDR}</strong>
        </div>
        <div style="font-size:0.75rem; color:var(--charcoal-soft); margin-top:4px; padding-top:8px; border-top:1px dashed var(--line);">
          *Kurs estimasi: 1 SAR = Rp ${rate.toLocaleString('id-ID')} (kurs aktual dikonfirmasi admin via WhatsApp)
        </div>
      </div>
    </div>

    <!-- Steps to Pay -->
    <div style="background:#F0F7FF; border:1px solid #C2D7FA; border-radius:8px; padding:16px 20px; margin-bottom:22px;">
      <div style="font-size:0.78rem; font-weight:700; text-transform:uppercase; letter-spacing:0.07em; color:#1a73e8; margin-bottom:10px;">📋 Langkah Pembayaran</div>
      <ol style="margin:0; padding-left:18px; font-size:0.86rem; color:var(--charcoal); line-height:1.8;">
        <li>Transfer uang muka / DP sesuai nominal di atas ke rekening yang sesuai (SAR atau IDR).</li>
        <li>Screenshot / foto bukti transfer Anda.</li>
        <li>Klik tombol <strong>"Kunci Jadwal &amp; Kirim ke WhatsApp"</strong> di bawah.</li>
        <li>Lampirkan foto bukti transfer langsung di chat WhatsApp yang terbuka.</li>
        <li>Admin akan memverifikasi dan mengonfirmasi booking Anda dalam <strong>1×24 jam</strong>.</li>
      </ol>
    </div>

    <!-- Optional Upload -->
    <div style="margin-bottom:24px;">
      <label style="display:block; font-size:0.8rem; font-weight:700; color:var(--charcoal-soft); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:8px;">
        Unggah Bukti Transfer (Opsional — Bisa juga via WhatsApp)
      </label>
      <label for="proof-file-input" style="display:block; border:2px dashed var(--gold-soft); background:#fff; padding:18px; text-align:center; border-radius:8px; cursor:pointer; transition:background 0.2s;">
        <input type="file" id="proof-file-input" accept="image/*" style="display:none;">
        <div style="font-size:1.4rem; margin-bottom:4px;">📎</div>
        <div style="font-size:0.88rem; font-weight:600; color:var(--charcoal);">Pilih Foto / Screenshot Bukti Transfer dari Perangkat</div>
        <div style="font-size:0.76rem; color:var(--charcoal-soft); margin-top:2px;">JPG, PNG, WEBP · Maks 10MB</div>
        <div>
          <img id="proof-preview" src="${paymentProof}" style="max-height:140px; max-width:100%; border-radius:4px; margin-top:12px; display:${paymentProof ? 'inline-block' : 'none'}; object-fit:cover; border:1px solid var(--line);">
        </div>
      </label>
    </div>

    <div class="actions-row">
      <button class="btn btn-ghost" id="back">Kembali</button>
      <button class="btn btn-primary" id="confirm" style="padding:14px 28px; font-weight:700; display:flex; align-items:center; gap:8px;">
        <span style="font-size:1.1rem;">📱</span> Kunci Jadwal &amp; Kirim ke WhatsApp →
      </button>
    </div>
  `;
}

function copyText(text, btn) {
  navigator.clipboard.writeText(text);
  const old = btn.textContent;
  btn.textContent = '✓ Copied!';
  setTimeout(() => { btn.textContent = old; }, 2000);
}

function renderConfirmation() {
  if (!state.result) return `<div style="text-align:center; padding:60px 0; color:var(--charcoal-soft);">Processing…</div>`;
  const r = state.result;
  const waUrl = r.whatsappUrl || '#';

  return `
    <div style="text-align:center; margin-bottom:36px;">
      <div style="display:inline-block; background:#DCE8D0; color:#3E5B2A; font-size:0.76rem; font-weight:600; padding:4px 14px; border-radius:20px; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:12px;">Booking Received</div>
      <h1 style="font-size:2.4rem; margin-top:4px; color:var(--charcoal);">${r.bookingCode}</h1>
      <p style="color:var(--charcoal-soft); font-size:0.95rem; margin-top:8px;">Terima kasih ${state.client.name || ''}, reservasi sesi foto Anda telah terdata di sistem kami.</p>
    </div>

    <div style="text-align:center; margin:32px 0;">
      <a class="btn" href="${waUrl}" target="_blank" style="background:#25D366; color:#121210; font-weight:700; padding:14px 28px; font-size:1rem; border-radius:4px; display:inline-flex; align-items:center; gap:8px; text-decoration:none; box-shadow:0 4px 12px rgba(0,0,0,0.2);">
        <span style="font-size:1.2rem;">📱</span> Buka WhatsApp &amp; Kirim Bukti
      </a>
      <p style="font-size:0.8rem; color:var(--charcoal-soft); margin-top:8px;">
        💡 Silakan lampirkan / kirimkan foto screenshot bukti transfer di dalam obrolan WhatsApp tersebut.
      </p>
    </div>

    <div class="manifest" style="margin-bottom:32px;">
      <div class="manifest-row"><span>Service</span><span></span><span>${state.service.name} (${state.package.name})</span></div>
      <div class="manifest-row"><span>Date &amp; Time</span><span></span><span>${r.date} · ${r.startTime} – ${r.endTime}</span></div>
      <div class="manifest-row"><span>Deposit</span><span></span><span>${r.currency} ${r.depositAmount}</span></div>
      <div class="manifest-row"><span>Status</span><span></span><span style="color:#8A5A1E; font-weight:600;">Menunggu Verifikasi Admin</span></div>
    </div>

    <!-- Direct WhatsApp CTA Box -->
    <div style="background: linear-gradient(135deg, #128C7E 0%, #075E54 100%); color:#fff; padding:28px 24px; border-radius:8px; text-align:center; margin-bottom:32px; box-shadow: 0 10px 25px rgba(18,140,126,0.25);">
      <div style="font-size:2rem; margin-bottom:6px;">💬</div>
      <h3 style="color:#fff; font-size:1.3rem; margin-bottom:8px;">Kirim Konfirmasi Langsung ke WhatsApp</h3>
      <p style="color:rgba(255,255,255,0.85); font-size:0.88rem; max-width:500px; margin:0 auto 20px;">
        Klik tombol hijau di bawah ini untuk membuka WhatsApp otomatis dengan format konfirmasi booking &amp; konfirmasi bukti transfer kepada fotografer.
      </p>
      <a class="btn" href="${waUrl}" target="_blank" style="background:#25D366; color:#121210; font-weight:700; padding:14px 28px; font-size:1rem; border-radius:4px; display:inline-flex; align-items:center; gap:8px; text-decoration:none; box-shadow:0 4px 12px rgba(0,0,0,0.2);">
        <span style="font-size:1.2rem;">📱</span> Buka WhatsApp &amp; Kirim Bukti
      </a>
    </div>

    <div class="actions-row" style="justify-content:center; gap:12px; flex-wrap:wrap;">
      <a class="btn btn-primary" href="/ratecard.html" target="_blank">📄 Buka Rate Card &amp; Pricelist PDF</a>
      <a class="btn btn-ghost" href="/my-booking.html?code=${r.bookingCode}">Cek Status Reservasi</a>
      <a class="btn btn-ghost" href="/">Kembali ke Beranda</a>
    </div>
  `;
}

function bindStep(stepName) {
  document.getElementById('back')?.addEventListener('click', () => goto(Math.max(0, state.step - 1)));

  if (stepName === 'SERVICE') {
    document.querySelectorAll('.option-card').forEach(c => c.addEventListener('click', async () => {
      const svc = state.services.find(s => s.id == c.dataset.id);
      state.service = await fetch(`/api/services/${svc.slug}`).then(r => r.json());
      state.package = null;
      goto(1);
    }));
  }
  if (stepName === 'PACKAGE') {
    if (!state.package && state.service?.packages) {
      state.package = state.service.packages[0] || null;
    }
    document.getElementById('next-pkg')?.addEventListener('click', () => {
      if (!state.package && state.service?.packages) {
        state.package = state.service.packages[0] || null;
      }
      goto(2);
    });
    document.querySelectorAll('.option-card').forEach(c => c.addEventListener('click', () => {
      state.package = (state.service.packages && state.service.packages.find(p => p.id == c.dataset.id)) || (state.service.packages && state.service.packages[0]);
      goto(2);
    }));
  }
  if (stepName === 'DATE') {
    loadMonth();
    document.getElementById('prev-month')?.addEventListener('click', () => {
      state.calMonth--; if (state.calMonth < 1) { state.calMonth = 12; state.calYear--; }
      render();
    });
    document.getElementById('next-month')?.addEventListener('click', () => {
      state.calMonth++; if (state.calMonth > 12) { state.calMonth = 1; state.calYear++; }
      render();
    });
  }
  if (stepName === 'TIME') loadSlots();

  if (stepName === 'DETAILS') {
    document.getElementById('next')?.addEventListener('click', () => {
      state.client = {
        name: document.getElementById('f-name').value.trim(),
        phone: document.getElementById('f-phone').value.trim(),
        email: document.getElementById('f-email').value.trim(),
        country: document.getElementById('f-country').value.trim(),
      };
      state.locationId = document.getElementById('f-location').value;
      state.photoshoot = {
        occasion: document.getElementById('f-occasion').value,
        people: document.getElementById('f-people').value,
        style: document.getElementById('f-style').value,
        request: document.getElementById('f-request').value,
      };
      if (!state.client.name || !state.client.phone) {
        state.error = 'Please provide your full name and WhatsApp / phone number.';
        render();
        return;
      }
      goto(5);
    });
  }

  if (stepName === 'PAYMENT') {
    const proofInput = document.getElementById('proof-file-input');
    const proofPreview = document.getElementById('proof-preview');

    proofInput?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const dataUrl = await compressReceiptImage(file);
      state.paymentProof = dataUrl;
      proofPreview.src = dataUrl;
      proofPreview.style.display = 'inline-block';
    });

    document.getElementById('confirm')?.addEventListener('click', async () => {
      const btn = document.getElementById('confirm');
      btn.disabled = true; btn.textContent = 'Processing Reservation…';
      try {
        const res = await fetch('/api/bookings', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            photographerId: state.photographerId,
            packageId: state.package.id,
            locationId: state.locationId,
            date: state.date,
            startTime: state.time,
            clientName: state.client.name,
            clientPhone: state.client.phone,
            clientEmail: state.client.email,
            clientCountry: state.client.country,
            occasion: state.photoshoot.occasion,
            numberOfPeople: state.photoshoot.people,
            stylePreference: state.photoshoot.style,
            specialRequest: state.photoshoot.request,
            paymentProof: state.paymentProof,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          state.error = data.error;
          if (data.error && data.error.includes('no longer available')) {
            goto(3);
          } else {
            render();
          }
          return;
        }
        state.result = data;
        goto(6);
      } catch (e) {
        state.error = 'Your booking could not be completed. Please try again.';
        render();
      }
    });
  }
}

init();
