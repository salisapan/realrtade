/* Signup gate for /glance only.
   TODO(cto): glanceSignupMock in site-config.js is true because
   glance-signup-consent is not deployed. Set it false when the function
   returns 200 {signup_token, store_url}. Do not record consent in the browser.
   On http the page always uses the mock and logs the token: the cookie is Secure. */
(function () {
  var TERMS_VERSION = '2026-10-15';
  var PRIVACY_VERSION = '2026-10-15';
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function lang() {
    return document.documentElement.lang === 'he' ? 'he' : 'en';
  }

  function cfg() {
    return window.FLOW_CONFIG || {};
  }

  function onHttp() {
    return location.protocol !== 'https:';
  }

  function sourceValue() {
    var q = new URLSearchParams(location.search);
    var parts = ['glance'];
    var utm = [];
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach(function (key) {
      var value = q.get(key);
      if (value) utm.push(key + '=' + value.slice(0, 80));
    });
    if (utm.length) parts.push('utm', utm.join(' '));
    return parts.join(' ').slice(0, 500);
  }

  function httpsUrl(value) {
    if (!value) return '';
    try {
      var url = new URL(value);
      return url.protocol === 'https:' ? url.toString() : '';
    } catch (e) {
      return '';
    }
  }

  function setCookie(token) {
    document.cookie = 'glance_signup=' + encodeURIComponent(token)
      + '; Max-Age=2592000; Path=/; SameSite=Lax; Secure';
  }

  function bind(form) {
    var email = form.querySelector('#su-email');
    var terms = form.querySelector('#su-terms');
    var marketing = form.querySelector('#su-mail');
    var button = form.querySelector('[data-submit]');
    var retry = form.querySelector('[data-retry]');
    var loading = false;
    var spin = document.createElement('span');
    spin.className = 'su-spin';
    spin.setAttribute('aria-hidden', 'true');
    for (var i = 0; i < 12; i++) {
      var tick = document.createElement('i');
      tick.style.setProperty('--i', String(i));
      spin.appendChild(tick);
    }
    button.appendChild(spin);

    function validEmail() {
      return EMAIL_RE.test((email.value || '').trim());
    }

    function paint() {
      var value = (email.value || '').trim();
      var showInvalid = value.length > 0 && !validEmail();
      if (showInvalid) form.setAttribute('data-show-invalid', '1');
      else form.removeAttribute('data-show-invalid');
      email.setAttribute('aria-invalid', showInvalid ? 'true' : 'false');
      if (!loading && form.getAttribute('data-state') !== 'success') {
        button.disabled = !(validEmail() && terms.checked);
      }
    }

    function lockFields() {
      email.disabled = true;
      email.readOnly = true;
      terms.disabled = true;
      marketing.disabled = true;
    }

    function unlock() {
      loading = false;
      email.disabled = false;
      email.readOnly = false;
      terms.disabled = false;
      marketing.disabled = false;
      button.removeAttribute('aria-busy');
      form.removeAttribute('data-mail');
      if (form.getAttribute('data-state') === 'loading') form.removeAttribute('data-state');
      paint();
    }

    function showServerError() {
      loading = false;
      email.disabled = false;
      email.readOnly = false;
      terms.disabled = false;
      marketing.disabled = false;
      button.removeAttribute('aria-busy');
      form.removeAttribute('data-mail');
      form.setAttribute('data-state', 'error');
      paint();
    }

    email.addEventListener('input', function () {
      if (form.getAttribute('data-state') === 'invalid' && validEmail()) form.removeAttribute('data-state');
      if (form.getAttribute('data-state') === 'error') form.removeAttribute('data-state');
      paint();
    });
    terms.addEventListener('change', function () {
      if (terms.checked && form.getAttribute('data-state') === 'terms') form.removeAttribute('data-state');
      paint();
    });
    paint();

    if (retry) {
      retry.addEventListener('click', function () {
        form.removeAttribute('data-state');
        unlock();
        email.focus();
      });
    }

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (loading) return;
      var address = (email.value || '').trim();
      if (!EMAIL_RE.test(address)) {
        form.setAttribute('data-state', 'invalid');
        paint();
        email.focus();
        return;
      }
      if (!terms.checked) {
        form.setAttribute('data-state', 'terms');
        terms.focus();
        return;
      }
      loading = true;
      lockFields();
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      form.removeAttribute('data-mail');
      form.setAttribute('data-state', 'loading');

      var body = {
        email: address,
        terms_version: TERMS_VERSION,
        privacy_version: PRIVACY_VERSION,
        terms_accepted_at: new Date().toISOString(),
        marketing_opt_in: !!marketing.checked,
        locale: lang(),
        ua: (navigator.userAgent || '').slice(0, 400),
        referrer: (document.referrer || '').slice(0, 500),
        source: sourceValue()
      };

      var q = new URLSearchParams(location.search);
      var config = cfg();
      var useMock = onHttp() || !!config.glanceSignupMock;
      var failAddress = address.toLowerCase() === 'fail@flow.dev' || q.get('fail') === '1';

      var pending = useMock
        ? Promise.resolve(failAddress
          ? { ok: false, status: 400, payload: {} }
          : { ok: true, status: 200, payload: { signup_token: 'mock-' + Date.now().toString(36), store_url: config.glanceStoreUrl || config.chromeStoreUrl || '' } })
        : fetch(config.glanceSignupConsentUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        }).then(function (res) {
          return res.json().catch(function () { return {}; }).then(function (payload) {
            return { ok: res.ok, status: res.status, payload: payload || {} };
          });
        }).catch(function () {
          return { ok: false, status: 0, payload: {} };
        });

      pending.then(function (result) {
        if (!result.ok) {
          showServerError();
          return;
        }
        var token = result.payload && result.payload.signup_token;
        var store = httpsUrl(result.payload && result.payload.store_url) || httpsUrl(config.glanceStoreUrl) || httpsUrl(config.chromeStoreUrl);
        if (!token || !store) {
          showServerError();
          return;
        }
        setCookie(token);
        if (onHttp()) console.log(token);
        loading = false;
        button.removeAttribute('aria-busy');
        button.disabled = true;
        form.setAttribute('data-state', 'success');
        if (marketing.checked) form.setAttribute('data-mail', '1');
        else form.removeAttribute('data-mail');
        if (q.get('hold') === '1' || q.get('state')) return;
        window.setTimeout(function () { location.assign(store); }, 1200);
      });
    });

    var preset = new URLSearchParams(location.search).get('state');
    if (preset === 'invalid') {
      email.value = 'not-an-email';
      form.setAttribute('data-state', 'invalid');
      form.setAttribute('data-show-invalid', '1');
      paint();
    } else if (preset === 'terms') {
      email.value = 'you@company.com';
      terms.checked = false;
      form.setAttribute('data-state', 'terms');
      paint();
    } else if (preset === 'loading') {
      email.value = 'you@company.com';
      terms.checked = true;
      loading = true;
      lockFields();
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      form.setAttribute('data-state', 'loading');
    } else if (preset === 'error') {
      email.value = 'you@company.com';
      terms.checked = true;
      form.setAttribute('data-state', 'error');
      paint();
    } else if (preset === 'success') {
      email.value = 'you@company.com';
      terms.checked = true;
      marketing.checked = true;
      button.disabled = true;
      form.setAttribute('data-state', 'success');
      form.setAttribute('data-mail', '1');
    }
  }

  function themeToggle() {
    var button = document.getElementById('themeBtn');
    if (!button) return;
    function paint() {
      var dark = document.documentElement.getAttribute('data-theme') === 'dark';
      var he = lang() === 'he';
      button.setAttribute('aria-label', dark ? (he ? 'מצב בהיר' : 'Light mode') : (he ? 'מצב כהה' : 'Dark mode'));
      button.setAttribute('aria-pressed', dark ? 'true' : 'false');
      var section = document.getElementById('get-glance');
      if (section) section.setAttribute('aria-label', he ? 'לקבל את Glance' : 'Get Glance');
      var menu = document.getElementById('menuBtn');
      if (menu) {
        var open = menu.getAttribute('aria-expanded') === 'true';
        menu.setAttribute('aria-label', open ? (he ? 'סגירת התפריט' : 'Close menu') : (he ? 'פתיחת התפריט' : 'Open menu'));
      }
    }
    button.addEventListener('click', function () {
      var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('glance_theme', next); } catch (e) {}
      paint();
    });
    new MutationObserver(paint).observe(document.documentElement, { attributes: true, attributeFilter: ['lang', 'data-theme'] });
    paint();
  }

  function menuToggle() {
    var button = document.getElementById('menuBtn');
    var nav = document.getElementById('primaryNav');
    if (!button || !nav) return;
    button.addEventListener('click', function () {
      var open = button.getAttribute('aria-expanded') !== 'true';
      nav.classList.toggle('open', open);
      button.setAttribute('aria-expanded', open ? 'true' : 'false');
      var he = lang() === 'he';
      button.setAttribute('aria-label', open ? (he ? 'סגירת התפריט' : 'Close menu') : (he ? 'פתיחת התפריט' : 'Open menu'));
    });
  }

  function boot() {
    var form = document.getElementById('signup');
    if (form) bind(form);
    themeToggle();
    menuToggle();
    if (document.querySelector('[data-lang-panel]')) {
      function show() {
        var current = lang();
        document.querySelectorAll('[data-lang-panel]').forEach(function (panel) {
          panel.hidden = panel.getAttribute('data-lang-panel') !== current;
        });
      }
      new MutationObserver(show).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
      show();
    }
    var welcome = document.getElementById('welcome');
    if (welcome && window.GlanceWelcome) window.GlanceWelcome(welcome);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
