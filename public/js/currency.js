/**
 * UMROH LENS — Multi-Currency Switcher & Formatter Engine
 * Supports SAR (Saudi Riyal - Base), IDR (Indonesian Rupiah), and USD (US Dollar)
 */

(function(window) {
  const RATES = {
    SAR: { symbol: 'SAR', rate: 1, name: 'Saudi Riyal', flag: '🇸🇦', decimals: 0 },
    IDR: { symbol: 'Rp', rate: 4250, name: 'Indonesian Rupiah', flag: '🇮🇩', decimals: 0 },
    USD: { symbol: '$', rate: 0.267, name: 'US Dollar', flag: '🇺🇸', decimals: 0 }
  };

  function getCurrentCurrency() {
    try {
      return localStorage.getItem('umroh_currency') || 'SAR';
    } catch (e) {
      return 'SAR';
    }
  }

  function setCurrentCurrency(curr) {
    if (!RATES[curr]) curr = 'SAR';
    try {
      localStorage.setItem('umroh_currency', curr);
    } catch (e) {}
    window.dispatchEvent(new CustomEvent('currencyChanged', { detail: { currency: curr } }));
  }

  function convertPrice(amountSAR, targetCurrency = null) {
    const curr = targetCurrency || getCurrentCurrency();
    const config = RATES[curr] || RATES.SAR;
    const num = Number(amountSAR) || 0;
    const converted = num * config.rate;

    if (curr === 'IDR') {
      return `Rp ${Math.round(converted).toLocaleString('id-ID')}`;
    } else if (curr === 'USD') {
      return `$${Math.round(converted).toLocaleString('en-US')}`;
    } else {
      return `SAR ${Math.round(converted).toLocaleString('en-US')}`;
    }
  }

  function renderCurrencySwitcher() {
    const current = getCurrentCurrency();
    return `
      <div class="currency-dropdown" style="position:relative; display:inline-block;">
        <button type="button" class="currency-btn" onclick="toggleCurrencyMenu(event)" style="background:rgba(28,24,20,0.05); border:1px solid var(--line); border-radius:30px; padding:6px 14px; font-size:0.82rem; font-weight:600; cursor:pointer; color:var(--charcoal); display:flex; align-items:center; gap:6px; transition:background 0.2s, border-color 0.2s;">
          <span>${RATES[current].flag}</span>
          <span>${current}</span>
          <span style="font-size:0.65rem; opacity:0.6;">▼</span>
        </button>
        <div id="currency-menu" style="display:none; position:absolute; right:0; top:110%; background:#FFFFFF; border:1px solid var(--line); border-radius:8px; box-shadow:0 10px 30px rgba(0,0,0,0.12); padding:6px; min-width:140px; z-index:99999;">
          ${Object.keys(RATES).map(k => `
            <button type="button" onclick="selectCurrency('${k}')" style="width:100%; text-align:left; background:${k === current ? 'var(--ivory)' : 'transparent'}; border:none; padding:8px 12px; font-size:0.84rem; font-weight:${k === current ? '700' : '500'}; color:var(--charcoal); cursor:pointer; border-radius:4px; display:flex; justify-content:space-between; align-items:center; margin-bottom:2px;">
              <span>${RATES[k].flag} ${k}</span>
              <span style="font-size:0.75rem; color:var(--charcoal-soft);">${RATES[k].symbol}</span>
            </button>
          `).join('')}
        </div>
      </div>
    `;
  }

  window.toggleCurrencyMenu = function(e) {
    if (e) e.stopPropagation();
    const menu = document.getElementById('currency-menu');
    if (menu) menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
  };

  window.selectCurrency = function(curr) {
    setCurrentCurrency(curr);
    const menu = document.getElementById('currency-menu');
    if (menu) menu.style.display = 'none';
    window.location.reload();
  };

  document.addEventListener('click', (e) => {
    const menu = document.getElementById('currency-menu');
    if (menu && !e.target.closest('.currency-dropdown')) {
      menu.style.display = 'none';
    }
  });

  window.CurrencyEngine = {
    RATES,
    get: getCurrentCurrency,
    set: setCurrentCurrency,
    format: convertPrice,
    renderSwitcher: renderCurrencySwitcher
  };
})(window);
