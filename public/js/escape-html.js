// Escape untrusted strings before inserting into HTML — XSS guard.
// Usage: element.innerHTML = `... ${escapeHtml(apiValue)} ...`;
(function () {
  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Safe external link helper: allow only http(s), else fallback
  function safeUrl(url, fallback) {
    if (typeof url === 'string' && /^https:\/\//i.test(url)) return url;
    if (typeof url === 'string' && /^http:\/\//i.test(url)) return url;
    return fallback || '#';
  }

  window.escapeHtml = escapeHtml;
  window.safeUrl = safeUrl;
})();
