// Admin Authentication & Navigation Helper

function getAdminToken() {
  return localStorage.getItem('admin_token');
}

function setAdminToken(token, user) {
  localStorage.setItem('admin_token', token);
  if (user) localStorage.setItem('admin_user', JSON.stringify(user));
}

function clearAdminToken() {
  localStorage.removeItem('admin_token');
  localStorage.removeItem('admin_user');
}

function getAdminUser() {
  try {
    return JSON.parse(localStorage.getItem('admin_user') || '{}');
  } catch (e) {
    return {};
  }
}

// Global fetch wrapper for admin API calls
async function adminFetch(url, options = {}) {
  const token = getAdminToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401 || res.status === 403) {
      clearAdminToken();
      if (!window.location.pathname.endsWith('/admin/login.html')) {
        window.location.href = '/admin/login.html?redirect=' + encodeURIComponent(window.location.pathname);
      }
      throw new Error('Unauthorized');
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
    ['Portfolio & Photos', '/admin/portfolio.html', 'portfolio'],
  ];

  document.write(`
    <div class="admin-shell">
      <aside class="admin-sidebar">
        <span class="brand">Al-Madani <span style="color:var(--gold-soft)">Admin</span></span>
        
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
