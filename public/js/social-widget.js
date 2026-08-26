// Floating Dual-WhatsApp & Instagram Widget for UMROH LENS Madinah (Luxury Edition)
(function() {
  let paymentInfo = null;

  async function loadSocialConfig() {
    try {
      const res = await fetch('/api/payment-info');
      if (res.ok) {
        paymentInfo = await res.json();
      }
    } catch (e) {}

    const wa1 = (paymentInfo && paymentInfo.adminWhatsApp) ? paymentInfo.adminWhatsApp.replace(/[^0-9+]/g, '') : '+6282175272547';
    const wa2 = (paymentInfo && paymentInfo.adminWhatsApp2) ? paymentInfo.adminWhatsApp2.replace(/[^0-9+]/g, '') : '+6281234567890';
    const igUrl = (paymentInfo && paymentInfo.instagramUrl) || 'https://instagram.com/umrohlens';
    const igHandle = (paymentInfo && paymentInfo.instagramHandle) || '@umrohlens';

    // Update any instagram links on page
    document.querySelectorAll('.instagram-link').forEach(el => {
      el.href = igUrl;
      el.textContent = igHandle;
    });

    renderWidget(wa1, wa2, igUrl, igHandle);
  }

  function renderWidget(wa1, wa2, igUrl, igHandle) {
    if (document.getElementById('social-floating-widget')) return;

    const style = document.createElement('style');
    style.innerHTML = `
      .social-widget-wrap {
        position: fixed;
        bottom: 26px;
        right: 26px;
        z-index: 99999;
        font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      .social-btn-main {
        padding: 13px 24px 13px 18px;
        border-radius: 50px;
        background: linear-gradient(135deg, #1C1814 0%, #2D2620 100%);
        box-shadow: 0 10px 30px rgba(28, 24, 20, 0.35);
        display: flex;
        align-items: center;
        gap: 12px;
        color: #FFFFFF;
        cursor: pointer;
        transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.25s ease, border-color 0.25s ease;
        position: relative;
        border: 1px solid rgba(184, 144, 69, 0.4);
      }
      .social-btn-main:hover {
        transform: translateY(-3px) scale(1.03);
        box-shadow: 0 14px 36px rgba(184, 144, 69, 0.35);
        border-color: #B89045;
      }
      .social-pulse-icon {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: #25D366;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #fff;
        box-shadow: 0 0 12px rgba(37, 211, 102, 0.5);
      }
      .social-btn-text {
        font-size: 0.88rem;
        font-weight: 600;
        letter-spacing: 0.02em;
      }
      .social-badge-count {
        background: #B89045;
        color: #1C1814;
        font-size: 0.7rem;
        font-weight: 800;
        padding: 2px 7px;
        border-radius: 12px;
      }
      .social-popup {
        display: none;
        position: absolute;
        bottom: 68px;
        right: 0;
        width: 340px;
        background: #FFFFFF;
        border-radius: 14px;
        box-shadow: 0 20px 50px rgba(28, 24, 20, 0.22);
        border: 1px solid rgba(184, 144, 69, 0.3);
        overflow: hidden;
        animation: popupSlide 0.25s ease-out forwards;
      }
      @keyframes popupSlide {
        from { opacity: 0; transform: translateY(12px) scale(0.96); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      .social-popup-header {
        background: linear-gradient(135deg, #1C1814 0%, #2A241E 100%);
        padding: 18px 20px;
        color: #fff;
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-bottom: 1px solid rgba(184, 144, 69, 0.25);
      }
      .social-popup-title {
        font-family: 'Fraunces', Georgia, serif;
        font-size: 1.15rem;
        color: #DFC285;
        margin: 0;
      }
      .social-popup-subtitle {
        font-size: 0.76rem;
        color: rgba(255,255,255,0.7);
        margin: 2px 0 0;
      }
      .social-popup-body {
        padding: 14px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        background: #F8F5EE;
      }
      .social-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 14px;
        border-radius: 8px;
        text-decoration: none;
        color: #1C1814;
        background: #FFFFFF;
        border: 1px solid rgba(28, 24, 20, 0.08);
        transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
      }
      .social-item:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 16px rgba(184, 144, 69, 0.15);
        border-color: #B89045;
      }
      .social-item-icon {
        width: 38px;
        height: 38px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        font-size: 1.15rem;
      }
      .social-icon-wa1 {
        background: #E8F8F0;
        color: #25D366;
      }
      .social-icon-wa2 {
        background: #FFF8E6;
        color: #B89045;
      }
      .social-icon-ig {
        background: #FDF0F5;
        color: #E1306C;
      }
      .social-item-name {
        font-size: 0.88rem;
        font-weight: 700;
        margin: 0;
        color: #1C1814;
      }
      .social-item-desc {
        font-size: 0.74rem;
        color: #70685E;
        margin: 2px 0 0;
      }
      .social-tpl-badge {
        font-size: 0.68rem;
        color: #B89045;
        font-weight: 600;
      }
      @media (max-width: 600px) {
        .social-widget-wrap { right: 18px; bottom: 18px; }
        .social-popup { width: 300px; }
      }
    `;
    document.head.appendChild(style);

    // Template Teks WhatsApp 1: Konsultasi Paket & Cek Ketersediaan Slot
    const waMsg1 = encodeURIComponent(
      `Assalamu'alaikum Admin UMROH LENS,\n\n` +
      `Saya ingin konsultasi & tanya ketersediaan jadwal sesi foto di Madinah:\n` +
      `• Nama: \n` +
      `• Tanggal di Madinah: \n` +
      `• Jumlah Orang: \n` +
      `• Pilihan Paket: \n\n` +
      `Mohon info ketersediaan slot. Terima kasih.`
    );

    // Template Teks WhatsApp 2: Konfirmasi Booking & Tim Operasional Madinah
    const waMsg2 = encodeURIComponent(
      `Assalamu'alaikum Tim Madinah UMROH LENS,\n\n` +
      `Saya ingin konfirmasi jadwal / info operasional pemotretan:\n` +
      `• Kode Booking (jika ada): \n` +
      `• Nama Klien: \n` +
      `• Tanggal Sesi: \n` +
      `• Lokasi Sesi: \n\n` +
      `Mohon dibantu konfirmasi tim di Madinah. Terima kasih.`
    );

    const wrap = document.createElement('div');
    wrap.id = 'social-floating-widget';
    wrap.className = 'social-widget-wrap';
    wrap.innerHTML = `
      <div class="social-popup" id="social-popup">
        <div class="social-popup-header">
          <div>
            <h4 class="social-popup-title">Hubungi CS &amp; Admin</h4>
            <p class="social-popup-subtitle">UMROH LENS Madinah Al-Munawwarah</p>
          </div>
          <span style="cursor:pointer; font-size:1.4rem; color:#DFC285;" onclick="document.getElementById('social-popup').style.display='none'">&times;</span>
        </div>
        <div class="social-popup-body">
          <!-- WhatsApp 1 -->
          <a class="social-item" href="https://wa.me/${wa1.replace('+','')}?text=${waMsg1}" target="_blank" rel="noopener">
            <div class="social-item-icon social-icon-wa1">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
            </div>
            <div>
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <p class="social-item-name">Admin WhatsApp 1</p>
                <span class="social-tpl-badge">Tanya Paket 💬</span>
              </div>
              <p class="social-item-desc">CS Booking &amp; Konsultasi (${wa1})</p>
            </div>
          </a>

          <!-- WhatsApp 2 -->
          <a class="social-item" href="https://wa.me/${wa2.replace('+','')}?text=${waMsg2}" target="_blank" rel="noopener">
            <div class="social-item-icon social-icon-wa2">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
            </div>
            <div>
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <p class="social-item-name">Admin WhatsApp 2</p>
                <span class="social-tpl-badge">Jadwal Madinah 🇸🇦</span>
              </div>
              <p class="social-item-desc">Tim Operasional &amp; Jadwal (${wa2})</p>
            </div>
          </a>

          <!-- Instagram -->
          <a class="social-item" href="${igUrl}" target="_blank" rel="noopener">
            <div class="social-item-icon social-icon-ig">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
            </div>
            <div>
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <p class="social-item-name">Instagram Official</p>
                <span class="social-tpl-badge">Galeri &amp; Feed 📸</span>
              </div>
              <p class="social-item-desc">${igHandle}</p>
            </div>
          </a>
        </div>
      </div>

      <!-- Main Trigger Button -->
      <button type="button" class="social-btn-main" id="social-btn-main" onclick="toggleSocialPopup()" aria-haspopup="true" aria-expanded="false" aria-controls="social-popup" title="Hubungi CS WhatsApp &amp; Instagram">
        <div class="social-pulse-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
        </div>
        <span class="social-btn-text">Chat Admin</span>
        <span class="social-badge-count">2 WA</span>
      </button>
    `;
    document.body.appendChild(wrap);
  }

  window.toggleSocialPopup = function() {
    const pop = document.getElementById('social-popup');
    const btn = document.getElementById('social-btn-main');
    if (!pop) return;
    const open = pop.style.display === 'block';
    pop.style.display = open ? 'none' : 'block';
    if (btn) btn.setAttribute('aria-expanded', String(!open));
  };

  // Close popup on Escape and return focus to the trigger
  document.addEventListener('keydown', function(e) {
    if (e.key !== 'Escape') return;
    const pop = document.getElementById('social-popup');
    const btn = document.getElementById('social-btn-main');
    if (pop && pop.style.display === 'block') {
      pop.style.display = 'none';
      if (btn) {
        btn.setAttribute('aria-expanded', 'false');
        btn.focus();
      }
    }
  });

  document.addEventListener('click', function(e) {
    const wrap = document.getElementById('social-floating-widget');
    const pop = document.getElementById('social-popup');
    if (wrap && pop && !wrap.contains(e.target) && pop.style.display === 'block') {
      pop.style.display = 'none';
    }
  });

  // Auto-init on page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadSocialConfig);
  } else {
    loadSocialConfig();
  }
})();
