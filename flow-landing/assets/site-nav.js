/* Shared nav: active link, EN/HE with real RTL, optional page dictionary. */
(function () {
  var NAV = {
    glance: { en: 'Glance', he: 'Glance' },
    flow: { en: 'Flow', he: 'Flow' },
    pricing: { en: 'Pricing', he: 'תמחור' },
    security: { en: 'Security', he: 'אבטחה' },
    contact: { en: 'Contact', he: 'צור קשר' },
    cta: { en: 'Get Glance', he: 'קבלו את Glance' }
  };

  function stored() {
    try { return localStorage.getItem('flow_lang') === 'he' ? 'he' : 'en'; }
    catch (e) { return 'en'; }
  }

  function apply(lang) {
    var root = document.documentElement;
    root.setAttribute('lang', lang);
    root.setAttribute('dir', lang === 'he' ? 'rtl' : 'ltr');
    document.querySelectorAll('[data-nav]').forEach(function (el) {
      var k = el.getAttribute('data-nav');
      if (NAV[k]) el.textContent = NAV[k][lang];
    });
    var dict = window.FLOW_PAGE_I18N || null;
    if (dict) {
      document.querySelectorAll('[data-i18n]').forEach(function (el) {
        var k = el.getAttribute('data-i18n');
        if (dict[k] && dict[k][lang]) el.innerHTML = dict[k][lang];
      });
    }
    var btn = document.getElementById('langBtn');
    if (btn) {
      btn.textContent = lang === 'he' ? 'EN' : 'עב';
      btn.setAttribute('aria-pressed', lang === 'he' ? 'true' : 'false');
    }
  }

  var path = location.pathname.replace(/\/index\.html$/, '/');
  document.querySelectorAll('.site-links a').forEach(function (a) {
    var href = a.getAttribute('href') || '';
    var on =
      (href === '/trial.html' && /\/trial\.html$/.test(path)) ||
      (href === '/pricing.html' && /\/pricing\.html$/.test(path)) ||
      (href === '/security.html' && /\/security\.html$/.test(path)) ||
      (href === '/contact.html' && /\/contact\.html$/.test(path));
    if (on) a.classList.add('active');
  });

  apply(stored());
  var btn = document.getElementById('langBtn');
  if (btn) {
    btn.addEventListener('click', function () {
      var next = stored() === 'he' ? 'en' : 'he';
      try { localStorage.setItem('flow_lang', next); } catch (e) {}
      apply(next);
    });
  }
})();
