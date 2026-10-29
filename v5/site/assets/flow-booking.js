/* Flow booking flow — FRONT-END MOCK ONLY — v13r34
 *
 * TODO (needs approval via David before any of this becomes real):
 *  - Backend / storage: none exists. This file sends no data anywhere, stores nothing (no localStorage, cookies or network calls).
 *    Capturing the email / company / website server-side needs a backend and storage that must be approved via David first.
 *  - Google / Microsoft sign-in ("המשך עם Google" / "המשך עם Microsoft") is SIMULATED here: a click just fills the demo account
 *    DEMO_ACCOUNT and jumps to step 2. No OAuth runs. TODO (real OAuth): request ONLY the basic scopes openid, email, profile;
 *    do NOT reuse Glance's OAuth apps — create separate Flow OAuth clients — and the backend that receives the token needs
 *    approval via David as well.
 *
 * Any element with [data-book] opens the flow. Step 1: work email. Step 2: company + website, prefilled from the email domain
 * (empty for personal domains). Step 3: button that opens the Google Calendar booking page in a new tab.
 */
(function () {
  var DEMO_ACCOUNT = 'dana@apm.co.il'; // mock only: stands in for the account a real Google/Microsoft sign-in would return
  var BOOKING_URL = 'https://calendar.app.google/96Z1x4KntqhnXHCt5';
  var PERSONAL = ['gmail.com', 'googlemail.com', 'outlook.com', 'outlook.co.il', 'hotmail.com', 'hotmail.co.il', 'live.com', 'msn.com', 'yahoo.com', 'yahoo.co.il', 'ymail.com', 'walla.co.il', 'walla.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com', 'proton.me', 'protonmail.com', 'gmx.com', 'mail.com', 'zahav.net.il', 'netvision.net.il', '012.net.il', 'bezeqint.net', 'inter.net.il'];
  var SLD = ['co', 'com', 'org', 'net', 'ac', 'gov', 'muni', 'edu', 'idf'];
  var T = {
    he: { gg: 'המשך עם Google', ms: 'המשך עם Microsoft', or: 'או', t1: 'קביעת שיחה', s1: 'נתחיל מהאימייל הארגוני שלכם.', email: 'אימייל ארגוני', emailPh: 'name@company.com', next: 'המשך', bad: 'כתובת האימייל לא נראית תקינה.',
      t2: 'אשרו את הפרטים', s2: 'מילאנו אותם לפי האימייל. אפשר לערוך.', s2e: 'הזינו את פרטי החברה.', company: 'שם החברה', site: 'אתר החברה', sitePh: 'company.com', need: 'נא למלא את שני השדות.', back: 'חזרה',
      t3: 'מוכנים לקבוע', s3: 'היומן ייפתח בלשונית חדשה, ושם בוחרים מועד.', open: 'פתחו את היומן', close: 'סגירה', dlg: 'קביעת שיחה' },
    en: { gg: 'Continue with Google', ms: 'Continue with Microsoft', or: 'or', t1: 'Book a call', s1: 'Start with your work email.', email: 'Work email', emailPh: 'name@company.com', next: 'Continue', bad: 'That email doesn’t look right.',
      t2: 'Confirm your details', s2: 'Filled in from your email. Edit if needed.', s2e: 'Enter your company details.', company: 'Company name', site: 'Company website', sitePh: 'company.com', need: 'Please fill in both fields.', back: 'Back',
      t3: 'Ready to book', s3: 'The calendar opens in a new tab, where you pick a time.', open: 'Open the calendar', close: 'Close', dlg: 'Book a call' }
  };
  function uiLang() { var d = document.documentElement; return (d.dataset.ui || d.lang || 'he').slice(0, 2); }
  function tr() { return T[uiLang()] || T.en; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function domainOf(email) { return email.split('@')[1].toLowerCase(); }
  function isPersonal(d) { return PERSONAL.indexOf(d) > -1; }
  function companyFrom(d) {
    var parts = d.split('.'); parts.pop();                       // drop TLD
    while (parts.length > 1 && SLD.indexOf(parts[parts.length - 1]) > -1) parts.pop(); // drop co / com / org / ac …
    var n = parts[parts.length - 1] || ''; if (!n) return '';
    return n.length <= 4 ? n.toUpperCase() : n.charAt(0).toUpperCase() + n.slice(1);
  }
  var G_SVG = '<svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';
  var MS_SVG = '<svg viewBox="0 0 21 21" width="18" height="18" aria-hidden="true"><rect x="1" y="1" width="9" height="9" fill="#F25022"/><rect x="11" y="1" width="9" height="9" fill="#7FBA00"/><rect x="1" y="11" width="9" height="9" fill="#00A4EF"/><rect x="11" y="11" width="9" height="9" fill="#FFB900"/></svg>';
  var root, st = { step: 1, email: '', company: '', site: '', opener: null };

  function build() {
    root = document.createElement('div'); root.className = 'fb'; root.lang = uiLang(); root.dir = uiLang() === 'he' ? 'rtl' : 'ltr'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true');
    root.innerHTML = '<div class="fb-card"><button type="button" class="fb-x" data-x><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/></svg></button><div data-body></div></div>';
    document.body.appendChild(root);
    root.addEventListener('mousedown', function (e) { if (e.target === root) close(); });
    root.querySelector('[data-x]').addEventListener('click', close);
    document.addEventListener('keydown', function (e) {
      if (!root.classList.contains('is-open')) return;
      if (e.key === 'Escape') close();
      if (e.key === 'Tab') { var f = root.querySelectorAll('button,input,a'); if (!f.length) return; var a = f[0], z = f[f.length - 1]; if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); } }
    });
  }
  function dots() { return '<div class="fb-steps" aria-hidden="true">' + [1, 2, 3].map(function (i) { return '<i' + (i <= st.step ? ' class="on"' : '') + '></i>'; }).join('') + '</div>'; }
  function render() {
    var t = tr(), b = root.querySelector('[data-body]'), h;
    root.lang = uiLang(); root.dir = uiLang() === 'he' ? 'rtl' : 'ltr';
    root.setAttribute('aria-label', t.dlg); root.querySelector('[data-x]').setAttribute('aria-label', t.close);
    if (st.step === 1) {
      h = dots() + '<h2>' + t.t1 + '</h2><p class="fb-sub">' + t.s1 + '</p>' +
        '<div class="fb-sso"><button type="button" class="fb-oauth" data-sso="google">' + G_SVG + '<span>' + t.gg + '</span></button><button type="button" class="fb-oauth" data-sso="microsoft">' + MS_SVG + '<span>' + t.ms + '</span></button></div><div class="fb-or" aria-hidden="true"><span>' + t.or + '</span></div>' +
        '<form data-f novalidate><label>' + t.email + '<input type="email" name="email" dir="ltr" autocomplete="email" inputmode="email" placeholder="' + t.emailPh + '" value="' + esc(st.email) + '" required></label><p class="fb-err" data-err role="alert"></p><button class="fb-btn doit" type="submit"><span class="shell"></span><span class="dring"></span><span class="shine"></span><span class="dlbl">' + t.next + '</span></button></form>';
    } else if (st.step === 2) {
      var pre = !isPersonal(domainOf(st.email));
      h = dots() + '<h2>' + t.t2 + '</h2><p class="fb-sub">' + (pre ? t.s2 : t.s2e) + '</p>' +
        '<form data-f novalidate><label>' + t.company + '<input name="company" autocomplete="organization" value="' + esc(st.company) + '" required></label>' +
        '<label>' + t.site + '<input name="site" dir="ltr" autocomplete="url" inputmode="url" placeholder="' + t.sitePh + '" value="' + esc(st.site) + '" required></label><p class="fb-err" data-err role="alert"></p>' +
        '<button class="fb-btn doit" type="submit"><span class="shell"></span><span class="dring"></span><span class="shine"></span><span class="dlbl">' + t.next + '</span></button><button type="button" class="fb-link" data-back>' + t.back + '</button></form>';
    } else {
      h = dots() + '<h2>' + t.t3 + '</h2><p class="fb-sub">' + t.s3 + '</p>' +
        '<div class="fb-sum"><b>' + esc(st.company) + '</b><span>' + esc(st.site) + '</span></div>' +
        '<div class="fb-act"><button type="button" class="fb-btn doit" data-open><span class="shell"></span><span class="dring"></span><span class="shine"></span><span class="dlbl">' + t.open + '</span></button><button type="button" class="fb-link" data-back>' + t.back + '</button></div>';
    }
    b.innerHTML = h;
    var f = b.querySelector('[data-f]'); if (f) f.addEventListener('submit', onSubmit);
    b.querySelectorAll('[data-sso]').forEach(function (btn) { btn.addEventListener('click', function () { signInDemo(); }); });
    var bk = b.querySelector('[data-back]'); if (bk) bk.addEventListener('click', function () { st.step--; render(); });
    var op = b.querySelector('[data-open]'); if (op) op.addEventListener('click', function () { window.open(BOOKING_URL, '_blank', 'noopener'); });
    var first = b.querySelector('input,[data-open]'); if (first) setTimeout(function () { first.focus(); }, 30);
  }
  function signInDemo() { // simulated sign-in (see TODO at top): demo account, straight to step 2
    st.email = DEMO_ACCOUNT; var d = domainOf(DEMO_ACCOUNT);
    if (isPersonal(d)) { st.company = ''; st.site = ''; } else { st.company = companyFrom(d); st.site = d; }
    st.step = 2; render();
  }
  function onSubmit(e) {
    e.preventDefault(); var t = tr(), f = e.target, err = f.querySelector('[data-err]');
    if (st.step === 1) {
      var v = f.email.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) { err.textContent = t.bad; return; }
      st.email = v; var d = domainOf(v);
      if (isPersonal(d)) { st.company = ''; st.site = ''; } else { st.company = companyFrom(d); st.site = d; }
      st.step = 2;
    } else {
      st.company = f.company.value.trim(); st.site = f.site.value.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
      if (!st.company || !st.site) { err.textContent = t.need; return; }
      st.step = 3;
    }
    render();
  }
  function open(opener) {
    if (!root) build();
    st = { step: 1, email: '', company: '', site: '', opener: opener || null };
    render(); root.classList.add('is-open');
    document.documentElement.style.overflow = 'hidden'; if (window.__lenis) window.__lenis.stop();
  }
  function close() {
    if (!root) return; root.classList.remove('is-open');
    document.documentElement.style.overflow = ''; if (window.__lenis) window.__lenis.start();
    if (st.opener && st.opener.focus) st.opener.focus();
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-book]'); if (!b) return;
    e.preventDefault(); open(b);
  });
  window.FlowBooking = { open: open, close: close };
})();
