// BOOKING FLOW — spec section 9 state machine:
// SERVICE -> PACKAGE -> DATE -> TIME -> DETAILS -> PAYMENT -> CONFIRMATION
// Guest booking only (spec section 38) — no account required.

const STEPS = ['SERVICE', 'PACKAGE', 'DATE', 'TIME', 'DETAILS', 'PAYMENT', 'CONFIRMATION'];
const state = {
  step: 0,
  services: [],
  service: null,
  package: null,
  locations: [],
  photographerId: null,
  calMonth: null, calYear: null,
  monthDays: {},
  date: null,
  slots: [],
  time: null,
  client: {},
  photoshoot: {},
  locationId: null,
  result: null,
  error: null,
};

const params = new URLSearchParams(location.search);

async function init() {
  const [services, photographers, locations] = await Promise.all([
    fetch('/api/services').then(r => r.json()),
    fetch('/api/photographers').then(r => r.json()),
    fetch('/api/locations').then(r => r.json()),
  ]);
  state.services = services;
  state.locations = locations;
  state.photographerId = photographers[0].id;

  const presetSlug = params.get('service');
  if (presetSlug) {
    state.service = services.find(s => s.slug === presetSlug) || null;
    if (state.service) state.step = 1;
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
    <div class="step-label">Step 1 — Select Service</div>
    <h2 style="margin-bottom:24px;">What kind of session?</h2>
    ${state.services.map(s => `
      <div class="option-card ${state.service?.id === s.id ? 'selected' : ''}" data-id="${s.id}">
        <div>
          <h3 style="font-size:1.05rem;">${s.name}</h3>
          <p style="color:var(--charcoal-soft); font-size:0.86rem; margin-top:4px;">${s.duration_minutes} min · from ${s.currency} ${s.starting_price}</p>
        </div>
        <span style="font-size:1.2rem;">→</span>
      </div>
    `).join('')}
  `;
}

function renderPackage() {
  const pkgs = state.service.packages || [];
  return `
    <div class="step-label">Step 2 — Select Package</div>
    <h2 style="margin-bottom:24px;">${state.service.name}</h2>
    ${pkgs.map(p => `
      <div class="option-card ${state.package?.id === p.id ? 'selected' : ''}" data-id="${p.id}">
        <div>
          <h3 style="font-size:1.05rem;">${p.name}</h3>
          <p style="color:var(--charcoal-soft); font-size:0.86rem; margin-top:4px;">${p.duration_minutes} min · ${p.edited_photos} edited photos · ${p.deposit_percentage}% deposit</p>
        </div>
        <span style="font-family:var(--font-display); font-size:1.15rem;">${p.currency} ${p.price}</span>
      </div>
    `).join('')}
    <div class="actions-row"><button class="btn btn-ghost" id="back">Back</button><span></span></div>
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
      <button class="btn btn-ghost" id="prev-month" style="padding:8px 14px;">←</button>
      <strong style="font-family:var(--font-display); font-size:1.2rem;">${monthName} ${y}</strong>
      <button class="btn btn-ghost" id="next-month" style="padding:8px 14px;">→</button>
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
    <div class="field"><label>Full name</label><input id="f-name" value="${state.client.name || ''}"></div>
    <div class="field"><label>WhatsApp / phone</label><input id="f-phone" value="${state.client.phone || ''}"></div>
    <div class="field"><label>Email (optional)</label><input id="f-email" value="${state.client.email || ''}"></div>
    <div class="field"><label>Country</label><input id="f-country" value="${state.client.country || ''}"></div>
    <div class="field">
      <label>Location</label>
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
    <div class="field"><label>Number of people</label><input id="f-people" type="number" min="1" value="${state.photoshoot.people || 1}"></div>
    <div class="field">
      <label>Preferred style</label>
      <select id="f-style">
        ${['Editorial','Natural','Cinematic','Candid','Traditional'].map(o => `<option ${state.photoshoot.style===o?'selected':''}>${o}</option>`).join('')}
      </select>
    </div>
    <div class="field"><label>Special request</label><textarea id="f-request">${state.photoshoot.request || ''}</textarea></div>
    <div class="actions-row"><button class="btn btn-ghost" id="back">Back</button><button class="btn btn-primary" id="next">Continue to Payment</button></div>
  `;
}

function renderPayment() {
  const p = state.package;
  const deposit = Math.round(p.price * p.deposit_percentage / 100);
  return `
    <div class="step-label">Step 6 — Payment</div>
    <h2 style="margin-bottom:24px;">Review &amp; confirm</h2>
    <div class="summary-line"><span>Service</span><span>${state.service.name}</span></div>
    <div class="summary-line"><span>Package</span><span>${p.name}</span></div>
    <div class="summary-line"><span>Date</span><span>${state.date}</span></div>
    <div class="summary-line"><span>Time</span><span>${state.time}</span></div>
    <div class="summary-line"><span>Total</span><span>${p.currency} ${p.price}</span></div>
    <div class="summary-line" style="font-weight:600;"><span>Deposit due now (${p.deposit_percentage}%)</span><span>${p.currency} ${deposit}</span></div>
    <div class="field" style="margin-top:24px;">
      <label>Payment method</label>
      <select id="f-payment-method">
        <option value="BANK_TRANSFER">Manual Bank Transfer</option>
        <option value="GATEWAY">Payment Gateway (demo)</option>
      </select>
    </div>
    <p style="font-size:0.78rem; color:var(--charcoal-soft); margin-top:8px;">This is a prototype checkout — no real payment is processed. See README for gateway integration notes.</p>
    <div class="actions-row"><button class="btn btn-ghost" id="back">Back</button><button class="btn btn-primary" id="confirm">Confirm Booking</button></div>
  `;
}

function renderConfirmation() {
  if (!state.result) return `<div style="text-align:center; padding:60px 0; color:var(--charcoal-soft);">Processing…</div>`;
  const r = state.result;
  return `
    <div style="text-align:center; margin-bottom:36px;">
      <p class="eyebrow">Booking Confirmed</p>
      <h1 style="font-size:2.2rem; margin-top:10px;">${r.bookingCode}</h1>
    </div>
    <div class="manifest">
      <div class="manifest-row"><span>Service</span><span></span><span>${state.service.name}</span></div>
      <div class="manifest-row"><span>Date</span><span></span><span>${r.date}</span></div>
      <div class="manifest-row"><span>Time</span><span></span><span>${r.startTime} – ${r.endTime}</span></div>
      <div class="manifest-row"><span>Payment</span><span></span><span>Deposit ${r.currency} ${r.depositAmount} due</span></div>
    </div>
    <div class="actions-row" style="justify-content:center; gap:14px;">
      <a class="btn btn-ghost" href="/my-booking.html?code=${r.bookingCode}">View Booking</a>
      <a class="btn btn-primary" href="/">Return Home</a>
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
    document.querySelectorAll('.option-card').forEach(c => c.addEventListener('click', () => {
      state.package = state.service.packages.find(p => p.id == c.dataset.id);
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
        name: document.getElementById('f-name').value,
        phone: document.getElementById('f-phone').value,
        email: document.getElementById('f-email').value,
        country: document.getElementById('f-country').value,
      };
      state.locationId = document.getElementById('f-location').value;
      state.photoshoot = {
        occasion: document.getElementById('f-occasion').value,
        people: document.getElementById('f-people').value,
        style: document.getElementById('f-style').value,
        request: document.getElementById('f-request').value,
      };
      if (!state.client.name || !state.client.phone) {
        state.error = 'Please provide your name and phone number.';
        render();
        return;
      }
      goto(5);
    });
  }

  if (stepName === 'PAYMENT') {
    document.getElementById('confirm')?.addEventListener('click', async () => {
      const btn = document.getElementById('confirm');
      btn.disabled = true; btn.textContent = 'Booking…';
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
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          state.error = data.error;
          if (data.error && data.error.includes('no longer available')) {
            // Slot was taken between selection and submit — bounce back to TIME.
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
