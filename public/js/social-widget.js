// Floating Dual-WhatsApp & Instagram Widget for UMROH LENS Madinah
(function() {
  let paymentInfo = null;

  async function loadSocialConfig() {
    try {
      const res = await fetch('/api/payment-info');
      if (res.ok) {
        paymentInfo = await res.json();
      }
    } catch (e) {}

    const wa1 = (paymentInfo && paymentInfo.adminWhatsApp) ? paymentInfo.adminWhatsApp.replace(/[^0-9+]/g, '') : '+966501234567';
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
        bottom: 24px;
        right: 24px;
        z-index: 9999;
        font-family: var(--font-body, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
      }
      .social-btn-main {
        width: 58px;
        height: 58px;
        border-radius: 50%;
        background: linear-gradient(135deg, #25D366 0%, #128C7E 100%);
        box-shadow: 0 8px 24px rgba(18, 140, 126, 0.45);
        display: flex;
        align-items: center;
        justify-content: center;
        color: #fff;
        cursor: pointer;
        transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.25s ease;
        position: relative;
        border: 2px solid rgba(255,255,255,0.4);
      }
      .social-btn-main:hover {
        transform: scale(1.08);
        box-shadow: 0 12px 30px rgba(18, 140, 126, 0.6);
      }
      .social-badge {
        position: absolute;
        top: -4px;
        right: -4px;
        background: #D4AF37;
        color: #1a1a18;
        font-size: 0.65rem;
        font-weight: 700;
        padding: 2px 6px;
        border-radius: 10px;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
      }
      .social-popup {
        display: none;
        position: absolute;
        bottom: 70px;
        right: 0;
        width: 310px;
        background: #ffffff;
        border-radius: 12px;
        box-shadow: 0 20px 50px rgba(0,0,0,0.25);
        border: 1px solid rgba(212, 175, 55, 0.3);
        overflow: hidden;
        animation: popupSlide 0.3s ease-out forwards;
      }
      @keyframes popupSlide {
        from { opacity: 0; transform: translateY(12px) scale(0.96); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      .social-popup-header {
        background: linear-gradient(135deg, #1c1c1a 0%, #2e2a22 100%);
        padding: 16px;
        color: #fff;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .social-popup-title {
        font-family: var(--font-display, Georgia, serif);
        font-size: 1.05rem;
        color: #D4AF37;
        margin: 0;
      }
      .social-popup-subtitle {
        font-size: 0.75rem;
        color: rgba(255,255,255,0.7);
        margin: 2px 0 0;
      }
      .social-popup-body {
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        background: #fafaf8;
      }
      .social-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 14px;
        border-radius: 8px;
        text-decoration: none;
        color: #1a1a18;
        background: #ffffff;
        border: 1px solid rgba(0,0,0,0.06);
        transition: all 0.2s ease;
      }
      .social-item:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0,0,0,0.08);
        border-color: #D4AF37;
      }
      .social-item-icon {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        font-size: 1.1rem;
      }
      .social-icon-wa {
        background: #E8F8F0;
        color: #25D366;
      }
      .social-icon-ig {
        background: #FDF0F5;
        color: #E1306C;
      }
      .social-item-name {
        font-size: 0.88rem;
        font-weight: 600;
        margin: 0;
      }
      .social-item-desc {
        font-size: 0.72rem;
        color: #706e68;
        margin: 1px 0 0;
      }
    `;
    document.head.appendChild(style);

    const waMsg1 = encodeURIComponent('Halo Admin UMROH LENS, saya ingin bertanya tentang paket & jadwal sesi foto di Madinah.');
    const waMsg2 = encodeURIComponent('Halo Tim Madinah UMROH LENS, saya ingin konfirmasi jadwal pemotretan saya di Madinah.');

    const wrap = document.createElement('div');
    wrap.id = 'social-floating-widget';
    wrap.className = 'social-widget-wrap';
    wrap.innerHTML = `
      <div class="social-popup" id="social-popup">
        <div class="social-popup-header">
          <div>
            <h4 class="social-popup-title">Hubungi Kami</h4>
            <p class="social-popup-subtitle">UMROH LENS Madinah Al-Munawwarah</p>
          </div>
          <span style="cursor:pointer; font-size:1.2rem; opacity:0.7;" onclick="document.getElementById('social-popup').style.display='none'">&times;</span>
        </div>
        <div class="social-popup-body">
          <a class="social-item" href="https://wa.me/${wa1.replace('+','')}?text=${waMsg1}" target="_blank" rel="noopener">
            <div class="social-item-icon social-icon-wa">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
            </div>
            <div>
              <p class="social-item-name">Admin WhatsApp 1</p>
              <p class="social-item-desc">CS Booking &amp; Info Paket (${wa1})</p>
            </div>
          </a>

          <a class="social-item" href="https://wa.me/${wa2.replace('+','')}?text=${waMsg2}" target="_blank" rel="noopener">
            <div class="social-item-icon social-icon-wa">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
            </div>
            <div>
              <p class="social-item-name">Admin WhatsApp 2</p>
              <p class="social-item-desc">Tim Madinah &amp; Jadwal (${wa2})</p>
            </div>
          </a>

          <a class="social-item" href="${igUrl}" target="_blank" rel="noopener">
            <div class="social-item-icon social-icon-ig">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
            </div>
            <div>
              <p class="social-item-name">Instagram Official</p>
              <p class="social-item-desc">${igHandle}</p>
            </div>
          </a>
        </div>
      </div>

      <div class="social-btn-main" id="social-btn-main" onclick="toggleSocialPopup()" title="Hubungi CS WhatsApp & Instagram">
        <span class="social-badge">2 CS</span>
        <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
      </div>
    `;
    document.body.appendChild(wrap);
  }

  window.toggleSocialPopup = function() {
    const pop = document.getElementById('social-popup');
    if (pop) {
      pop.style.display = (pop.style.display === 'block') ? 'none' : 'block';
    }
  };

  // Auto-init on page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadSocialConfig);
  } else {
    loadSocialConfig();
  }
})();
