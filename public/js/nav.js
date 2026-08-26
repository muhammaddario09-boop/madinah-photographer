// Mobile navigation toggle — injects a hamburger button into .nav-inner.
// No-op on pages without .nav (rate card, invoice, admin).
(function () {
  function init() {
    var nav = document.querySelector('.nav');
    if (!nav) return;
    var inner = nav.querySelector('.nav-inner');
    var links = nav.querySelector('.nav-links');
    if (!inner || !links || nav.querySelector('.nav-toggle')) return;

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'nav-toggle';
    btn.setAttribute('aria-label', 'Buka menu navigasi');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', 'mobile-nav-links');
    btn.innerHTML = '<span></span><span></span><span></span>';

    links.id = 'mobile-nav-links';

    // Place next to the language switcher / CTA group when possible
    var actions = inner.lastElementChild;
    if (actions && actions !== links && actions.tagName === 'DIV') {
      actions.appendChild(btn);
    } else {
      inner.appendChild(btn);
    }

    function setOpen(open) {
      nav.classList.toggle('nav-open', open);
      btn.setAttribute('aria-expanded', String(open));
      btn.setAttribute('aria-label', open ? 'Tutup menu navigasi' : 'Buka menu navigasi');
    }

    btn.addEventListener('click', function () {
      setOpen(!nav.classList.contains('nav-open'));
    });

    // Close after choosing a link
    links.addEventListener('click', function (e) {
      if (e.target.closest('a')) setOpen(false);
    });

    // Close on Escape and restore focus to the toggle
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('nav-open')) {
        setOpen(false);
        btn.focus();
      }
    });

    // Close on tap outside
    document.addEventListener('click', function (e) {
      if (nav.classList.contains('nav-open') && !e.target.closest('.nav')) {
        setOpen(false);
      }
    });

    // Reset when returning to desktop widths
    window.addEventListener('resize', function () {
      if (window.innerWidth > 900) setOpen(false);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
