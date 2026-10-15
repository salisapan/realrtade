/* Signup gate for /glance only.
   TODO(cto): glanceSignupMock in site-config.js is true because
   glance-signup-consent is not deployed. Set it false when the function
   returns 200 {signup_token, store_url}. Do not record consent in the browser. */
(function () {
  var TERMS_VERSION = '2026-10-15';
  var PRIVACY_VERSION = '2026-10-15';
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var COPY = {
    invalid: {
      en: 'Enter a valid email address.',
      he: 'הזינו כתובת אימייל תקינה.'
    },
    terms: {
      en: 'Agree to the Terms of Service and Privacy Policy to continue.',
      he: 'כדי להמשיך, אשרו את תנאי השימוש ואת מדיניות הפרטיות.'
    },
    fail: {
      en: 'Something went wrong. Your consent was not recorded.',
      he: 'משהו השתבש. ההסכמה לא נרשמה.'
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

  function sourceValue() {
    var q = new URLSearchParams(location.search);
    var parts = ['glance'];
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach(function (key) {
      var value = q.get(key);
      if (value) parts.push(key + '=' + value.slice(0, 80));
    });
    if (document.referrer) {
      try { parts.push('ref=' + new URL(document.referrer).host); } catch (e) {}
    }
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

  function showError(el, textEl, message) {
    textEl.textContent = message;
    el.hidden = false;
  }

  function bind(form) {
    var email = form.querySelector('#gateEmail');
    var terms = form.querySelector('#gateTerms');
    var marketing = form.querySelector('#gateMarketing');
    var button = form.querySelector('#gateSubmit');
    var error = form.querySelector('#gateError');
    var errorText = form.querySelector('#gateErrorText');
    var success = form.querySelector('#gateSuccess');
    var mail = form.querySelector('#gateMail');
    var errorCode = '';

    function refresh() {
      var ok = EMAIL_RE.test((email.value || '').trim()) && terms.checked;
      button.disabled = !ok;
      email.setAttribute('aria-invalid', email.value && !EMAIL_RE.test(email.value.trim()) ? 'true' : 'false');
      if (errorCode) showError(error, errorText, text(errorCode));
    }

    function fail(code) {
      errorCode = code || 'fail';
      success.hidden = true;
      if (mail) mail.hidden = true;
      showError(error, errorText, text(errorCode));
      button.disabled = false;
      refresh();
    }

    email.addEventListener('input', function () {
      if (errorCode === 'invalid') errorCode = '';
      if (!errorCode) error.hidden = true;
      refresh();
    });
    email.addEventListener('blur', function () {
      if (email.value && !EMAIL_RE.test(email.value.trim())) {
        errorCode = 'invalid';
        showError(error, errorText, text('invalid'));
      }
    });
    terms.addEventListener('change', function () {
      if (errorCode === 'terms') errorCode = '';
      if (!errorCode) error.hidden = true;
      refresh();
    });
    new MutationObserver(refresh).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    refresh();

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var address = (email.value || '').trim();
      if (!EMAIL_RE.test(address)) { fail('invalid'); email.focus(); return; }
      if (!terms.checked) { fail('terms'); terms.focus(); return; }
      errorCode = '';
      error.hidden = true;
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');

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
      var pending = config.glanceSignupMock
        ? Promise.resolve(q.get('fail') === '1'
          ? { ok: false, status: 400, payload: { error: '' } }
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
        button.removeAttribute('aria-busy');
        if (!result.ok) {
          var message = result.payload && (result.payload.error || result.payload.message);
          if (message) {
            errorCode = '';
            showError(error, errorText, String(message));
            refresh();
            return;
          }
          fail('fail');
          return;
        }
        var token = result.payload && result.payload.signup_token;
        var store = httpsUrl(result.payload && result.payload.store_url) || httpsUrl(config.glanceStoreUrl) || httpsUrl(config.chromeStoreUrl);
        if (!token || !store) { fail('fail'); return; }
        setCookie(token);
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
      button.textContent = dark ? (lang() === 'he' ? 'בהיר' : 'Light') : (lang() === 'he' ? 'כהה' : 'Dark');
      button.setAttribute('aria-pressed', dark ? 'true' : 'false');
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

  function boot() {
    var form = document.getElementById('glanceGate');
    if (form) bind(form);
    themeToggle();
    document.querySelectorAll('[data-lang-panel]').forEach(function () {
      function show() {
        var current = lang();
        document.querySelectorAll('[data-lang-panel]').forEach(function (panel) {
          panel.hidden = panel.getAttribute('data-lang-panel') !== current;
        });
      }
      new MutationObserver(show).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
      show();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
