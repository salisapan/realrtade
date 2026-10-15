/* Signup gate for /glance only.
   TODO(cto): glanceSignupMock in site-config.js is true because
   glance-signup-consent is not deployed. Set it false when the function
   returns 200 {signup_token, store_url}. Do not record consent in the browser.
   On http the page always uses the mock and logs the token: the cookie is Secure. */
(function () {
  var TERMS_VERSION = '2026-10-15';
  var PRIVACY_VERSION = '2026-10-15';
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var COPY = {
    invalid: {
      en: 'Enter a valid email.',
      he: 'הזינו אימייל תקין.'
    },
    terms: {
      en: 'Agree to the Terms and Privacy Policy to continue.',
      he: 'כדי להמשיך, אשרו את התנאים ואת מדיניות הפרטיות.'
    },
    fail: {
      en: 'Something went wrong. Nothing was saved.',
      he: 'משהו השתבש. לא נשמר דבר.'
    }
  };

  function lang() {
    return document.documentElement.lang === 'he' ? 'he' : 'en';
  }

  function cfg() {
    return window.FLOW_CONFIG || {};
  }

  function text(code) {
    var row = COPY[code] || COPY.fail;
    return row[lang()] || row.en;
  }

  function onHttp() {
    return location.protocol !== 'https:';
  }

  function sourceValue() {
    var q = new URLSearchParams(location.search);
    var place = q.get('source');
    if (place !== 'home' && place !== 'nav' && place !== 'glance') place = 'glance';
    var parts = [place];
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
    var email = form.querySelector('#gateEmail');
    var terms = form.querySelector('#gateTerms');
    var marketing = form.querySelector('#gateMarketing');
    var button = form.querySelector('#gateSubmit');
    var label = button.querySelector('.g1-doit-label');
    var hint = form.querySelector('#gateHint');
    var termsHint = form.querySelector('#gateTermsHint');
    var error = form.querySelector('#gateError');
    var errorText = form.querySelector('#gateErrorText');
    var retry = form.querySelector('#gateRetry');
    var success = form.querySelector('#gateSuccess');
    var mail = form.querySelector('#gateMail');
    var loading = false;
    var serverError = false;

    function paintHints() {
      var value = (email.value || '').trim();
      var valid = EMAIL_RE.test(value);
      var showInvalid = value.length > 0 && !valid;
      hint.hidden = !showInvalid;
      if (showInvalid) hint.textContent = text('invalid');
      email.setAttribute('aria-invalid', showInvalid ? 'true' : 'false');
      if (!termsHint.hidden) termsHint.textContent = text('terms');
      if (serverError) errorText.textContent = text('fail');
      if (!loading) button.disabled = !valid;
    }

    function lock(on) {
      loading = on;
      email.disabled = on;
      terms.disabled = on;
      marketing.disabled = on;
      button.disabled = on;
      button.setAttribute('aria-busy', on ? 'true' : 'false');
      if (on) form.setAttribute('data-state', 'loading');
      else form.removeAttribute('data-state');
      if (label) label.removeAttribute('hidden');
    }

    function showServerError() {
      serverError = true;
      success.hidden = true;
      if (mail) mail.hidden = true;
      errorText.textContent = text('fail');
      error.hidden = false;
      lock(false);
      paintHints();
      if (retry) retry.focus();
    }

    email.addEventListener('input', function () {
      serverError = false;
      error.hidden = true;
      paintHints();
    });
    terms.addEventListener('change', function () {
      if (terms.checked) termsHint.hidden = true;
      paintHints();
    });
    new MutationObserver(paintHints).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    paintHints();

    if (retry) {
      retry.addEventListener('click', function () {
        if (typeof form.requestSubmit === 'function') form.requestSubmit();
        else form.dispatchEvent(new Event('submit', { cancelable: true }));
      });
    }

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (loading) return;
      var address = (email.value || '').trim();
      if (!EMAIL_RE.test(address)) {
        paintHints();
        email.focus();
        return;
      }
      if (!terms.checked) {
        termsHint.hidden = false;
        termsHint.textContent = text('terms');
        terms.focus();
        return;
      }
      termsHint.hidden = true;
      serverError = false;
      error.hidden = true;
      success.hidden = true;
      if (mail) mail.hidden = true;
      lock(true);

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
      if (q.get('load') === '1') return;

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
        lock(false);
        button.disabled = true;
        success.hidden = false;
        if (mail) mail.hidden = !marketing.checked;
        if (q.get('hold') === '1') return;
        window.setTimeout(function () { location.assign(store); }, 700);
      });
    });
  }

  function themeToggle() {
    var button = document.getElementById('themeBtn');
    if (!button) return;
    function paint() {
      var dark = document.documentElement.getAttribute('data-theme') === 'dark';
      var he = lang() === 'he';
      button.setAttribute('aria-label', dark ? (he ? 'מצב בהיר' : 'Light mode') : (he ? 'מצב כהה' : 'Dark mode'));
      button.setAttribute('aria-pressed', dark ? 'true' : 'false');
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
    var form = document.getElementById('glanceGate');
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
