function renderAdminNav(active) {
  const items = [
    ['Dashboard', '/admin/index.html', 'dashboard'],
    ['Calendar', '/admin/calendar.html', 'calendar'],
    ['Bookings', '/admin/bookings.html', 'bookings'],
    ['Availability', '/admin/availability.html', 'availability'],
  ];
  document.write(`
    <div class="admin-shell">
      <aside class="admin-sidebar">
        <span class="brand">Al-Madani <span style="color:var(--gold-soft)">Admin</span></span>
        ${items.map(([label, href, key]) => `<a href="${href}" class="${key === active ? 'active' : ''}">${label}</a>`).join('')}
        <a href="/" style="margin-top:24px; opacity:0.5;">← Exit to site</a>
      </aside>
      <main class="admin-main" id="admin-main"></main>
    </div>
  `);
}
