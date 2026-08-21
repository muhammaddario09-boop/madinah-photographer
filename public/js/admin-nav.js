// Admin Authentication & Navigation Helper — Safari & WebKit Compatible

function getAdminToken() {
  try {
    const raw = localStorage.getItem('admin_token');
    if (!raw) return null;
    return String(raw).replace(/["'\s]/g, '').trim();
  } catch (e) {
    return null;
  }
}

function setAdminToken(token, user) {
  if (token) {
    const clean = String(token).replace(/["'\s]/g, '').trim();
    localStorage.setItem('admin_token', clean);
  }
  if (user) {
    localStorage.setItem('admin_user', typeof user === 'string' ? user : JSON.stringify(user));
  }
}

function clearAdminToken() {
  localStorage.removeItem('admin_token');
  localStorage.removeItem('admin_user');
}

function getAdminUser() {
  try {
    const raw = localStorage.getItem('admin_user');
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

// Global fetch wrapper for admin API calls
async function adminFetch(url, options = {}) {
  const token = getAdminToken();
  const headers = {};

  if (options.body && typeof options.body === 'string') {
    headers['Content-Type'] = 'application/json';
  }

  if (options.headers) {
    Object.assign(headers, options.headers);
  }

  if (token) {
    const cleanToken = token.replace(/[^A-Za-z0-9_\-\.]/g, '');
    if (cleanToken.length > 5) {
      headers['Authorization'] = 'Bearer ' + cleanToken;
    }
  }

  try {
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401 || res.status === 403) {
      clearAdminToken();
      if (!window.location.pathname.endsWith('/admin/login.html')) {
        window.location.href = '/admin/login.html?redirect=' + encodeURIComponent(window.location.pathname);
      }
      throw new Error('Session expired. Please login again.');
    }
    return res;
  } catch (err) {
    throw err;
  }
}

// Enforce auth check on protected admin pages
(function checkAdminAuth() {
  const path = window.location.pathname;
  if (path.startsWith('/admin') && !path.endsWith('/admin/login.html') && !path.endsWith('/admin/login')) {
    const token = getAdminToken();
    if (!token) {
      window.location.href = '/admin/login.html?redirect=' + encodeURIComponent(path);
    }
  }
})();

function logoutAdmin() {
  clearAdminToken();
  window.location.href = '/admin/login.html';
}

function renderAdminNav(active) {
  const user = getAdminUser();
  const items = [
    ['Dashboard', '/admin/index.html', 'dashboard'],
    ['Calendar', '/admin/calendar.html', 'calendar'],
    ['Bookings', '/admin/bookings.html', 'bookings'],
    ['Availability', '/admin/availability.html', 'availability'],
    ['Services & Pricing', '/admin/services.html', 'services'],
    ['Locations & Spots', '/admin/locations.html', 'locations'],
    ['Portfolio & Photos', '/admin/portfolio.html', 'portfolio'],
  ];

  document.write(`
    <div class="admin-shell">
      <aside class="admin-sidebar">
        <span class="brand">UMROH LENS <span style="color:var(--gold-soft)">Admin</span></span>
        
        <div style="margin-bottom: 24px; padding: 10px 12px; background: rgba(255,255,255,0.05); border-radius: 4px; font-size: 0.78rem;">
          <div style="opacity: 0.6; text-transform: uppercase; letter-spacing: 0.05em; font-size: 0.68rem;">Logged in as</div>
          <div style="color: var(--sand); font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${user.email || 'Admin'}</div>
        </div>

        ${items.map(([label, href, key]) => `<a href="${href}" class="${key === active ? 'active' : ''}">${label}</a>`).join('')}

        <div style="margin-top: 32px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 16px;">
          <a href="javascript:void(0)" onclick="logoutAdmin()" style="color: #ff9b9b; opacity: 0.85;">⎋ Logout</a>
          <a href="/" style="opacity: 0.5; margin-top: 8px;">← Exit to site</a>
        </div>
      </aside>
      <main class="admin-main" id="admin-main"></main>
    </div>
  `);
}
