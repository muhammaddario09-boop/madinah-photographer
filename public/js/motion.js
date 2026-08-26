// Apple-style scroll reveal — progressive enhancement.
// Any element with [data-reveal] fades/slides in when entering the viewport.
// Falls back to fully visible content without JS or with reduced motion.
(function () {
  function init() {
    var els = document.querySelectorAll('[data-reveal]');
    if (!els.length) return;

    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !('IntersectionObserver' in window)) return; // leave content visible

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -48px 0px' });

    Array.prototype.forEach.call(els, function (el) {
      el.classList.add('will-reveal');
      // Stagger siblings that share the same parent group
      var group = el.parentElement ? el.parentElement.querySelectorAll('[data-reveal]') : [];
      var idx = Array.prototype.indexOf.call(group, el);
      if (idx > 0) el.style.transitionDelay = Math.min(idx * 70, 350) + 'ms';
      observer.observe(el);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
