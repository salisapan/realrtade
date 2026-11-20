/* Corner v25 — bottom signup. Query ?state= drives the review states. */
(function () {
  'use strict';
  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function qs(sel, root) { return (root || document).querySelector(sel); }
  function param(name) {
    try { return new URLSearchParams(location.search).get(name); }
    catch (e) { return null; }
  }

  function spokes(host) {
    if (!host || host.querySelector('.su-spin')) return;
    var spin = document.createElement('span');
    spin.className = 'su-spin';
    spin.setAttribute('aria-hidden', 'true');
    for (var i = 0; i < 12; i++) {
      var line = document.createElement('i');
      line.style.setProperty('--i', String(i));
      spin.appendChild(line);
    }
    host.appendChild(spin);
  }

  function boot() {
    var form = qs('[data-signup]');
    if (!form) return;
    var email = qs('#su-email', form);
    var terms = qs('#su-terms', form);
    var mail = qs('#su-mail', form);
    var btn = qs('[data-submit]', form);
    var retry = qs('[data-retry]', form);
    var forced = null;
    spokes(btn);

    function unlock() {
      email.disabled = false;
      terms.disabled = false;
      mail.disabled = false;
      btn.removeAttribute('aria-busy');
    }

    function showLive() {
      var value = email.value.trim();
      var valid = EMAIL.test(value);
      if (value && !valid) form.setAttribute('data-show-invalid', '1');
      else form.removeAttribute('data-show-invalid');
      btn.disabled = !(valid && terms.checked);
      form.dataset.mail = mail.checked ? '1' : '0';
      unlock();
    }

    function apply(state) {
      unlock();
      form.removeAttribute('data-show-invalid');
      form.removeAttribute('data-redirect');
      if (!state) {
        forced = null;
        form.dataset.state = '';
        showLive();
        return;
      }
      forced = state;
      form.dataset.state = state;
      if (state === 'empty') {
        email.value = '';
        terms.checked = false;
        mail.checked = false;
        btn.disabled = true;
      } else if (state === 'invalid') {
        email.value = 'sali@';
        terms.checked = true;
        mail.checked = false;
        btn.disabled = true;
      } else if (state === 'terms') {
        email.value = 'sali@flow.dev';
        terms.checked = false;
        mail.checked = false;
        btn.disabled = true;
      } else if (state === 'loading') {
        email.value = 'sali@flow.dev';
        terms.checked = true;
        mail.checked = false;
        btn.disabled = true;
        email.disabled = true;
        terms.disabled = true;
        mail.disabled = true;
        btn.setAttribute('aria-busy', 'true');
      } else if (state === 'error') {
        email.value = 'fail@flow.dev';
        terms.checked = true;
        mail.checked = false;
        btn.disabled = false;
      } else if (state === 'success') {
        email.value = 'sali@flow.dev';
        terms.checked = true;
        mail.checked = true;
        btn.disabled = true;
      }
      form.dataset.mail = mail.checked ? '1' : '0';
    }

    function submit() {
      if (forced === 'loading') return;
      var value = email.value.trim();
      if (!EMAIL.test(value)) {
        forced = null;
        form.dataset.state = 'invalid';
        form.setAttribute('data-show-invalid', '1');
        btn.disabled = true;
        return;
      }
      if (!terms.checked) {
        forced = null;
        form.dataset.state = 'terms';
        form.removeAttribute('data-show-invalid');
        btn.disabled = true;
        return;
      }
      forced = 'loading';
      form.dataset.state = 'loading';
      form.removeAttribute('data-show-invalid');
      btn.disabled = true;
      btn.setAttribute('aria-busy', 'true');
      email.disabled = true;
      terms.disabled = true;
      mail.disabled = true;
      var opted = mail.checked;
      var fail = value.toLowerCase() === 'fail@flow.dev';
      window.setTimeout(function () {
        if (form.dataset.state !== 'loading') return;
        unlock();
        if (fail) {
          forced = 'error';
          form.dataset.state = 'error';
          form.removeAttribute('data-redirect');
          btn.disabled = false;
          return;
        }
        forced = 'success';
        form.dataset.state = 'success';
        form.dataset.mail = opted ? '1' : '0';
        form.removeAttribute('data-redirect');
        btn.disabled = true;
      }, 700);
    }

    email.addEventListener('input', function () {
      if (forced) forced = null;
      if (form.dataset.state && form.dataset.state !== 'loading') form.dataset.state = '';
      form.removeAttribute('data-redirect');
      showLive();
    });
    terms.addEventListener('change', function () {
      if (forced) forced = null;
      if (form.dataset.state === 'terms') form.dataset.state = '';
      showLive();
    });
    mail.addEventListener('change', function () {
      form.dataset.mail = mail.checked ? '1' : '0';
      if (!forced) showLive();
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      submit();
    });
    form.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' || (retry && e.target === retry)) return;
      e.preventDefault();
      submit();
    });
    if (retry) retry.addEventListener('click', function () {
      forced = null;
      form.dataset.state = '';
      form.removeAttribute('data-redirect');
      showLive();
      email.focus();
    });

    var initial = param('state');
    var known = { empty: 1, invalid: 1, terms: 1, loading: 1, error: 1, success: 1 };
    apply(known[initial] ? initial : null);
    if (!initial) {
      form.dataset.state = 'empty';
      btn.disabled = true;
      mail.checked = false;
      terms.checked = false;
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
