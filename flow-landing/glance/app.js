/* Corner v21 — Glance proposes the ACTIONS it will take · Do It prepares + verifies · Approve closes · Undo always.
   Hero = one cinematic scroll story (pinned ~325vh): window lands by 25vh → Glance notices → Do It →
   execution across tools (beams + floating tool tiles, Preparing → Verifying → Verified ✓) → Prepared →
   Approve (proof states again, fetched back) → Closed + receipt + Undo.
   ONE rAF loop reads scroll, lerp-smooths it and writes transform/opacity only. Click flow drives the
   same timeline. Vanilla JS · file:// friendly · prefers-reduced-motion = static composition. */
(function () {
  'use strict';

  var LANG = (document.documentElement.lang || '').slice(0, 2) || 'en';
  var HE = LANG === 'he';
  var I18 = window.GLANCE_I18N || {};
  var LIVING = { idle: 'glance/living/key-idle-192.png', thinking: 'glance/living/thinking-192.webp', done: 'glance/living/done-192.webp', keyDone: 'glance/living/key-done-192.png' };
  function gplus() {
    return '<b class="gplus"><span class="gplus-name">Glance</span></b>';
  }
  var VIEWER_DEFAULT = (I18.viewer && I18.viewer[LANG]) || (HE ? 'סאלי ספן' : 'Sali Sapan');
  var VIEWER_LS_KEY = 'glance.corner.viewerName';
  var viewerName = VIEWER_DEFAULT;
  var MQ_REDUCE = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function reduced() { return !!(MQ_REDUCE && MQ_REDUCE.matches); }

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function glyph(id) { return window.glyphSVG ? window.glyphSVG(id) : ''; }
  function expandViewer(str) { return str == null ? str : String(str).split(VIEWER_DEFAULT).join(esc(viewerName)); }
  function clamp(v, a, b) { a = a == null ? 0 : a; b = b == null ? 1 : b; return v < a ? a : v > b ? b : v; }
  function smooth(a, b, t) { var x = clamp((t - a) / (b - a)); return x * x * (3 - 2 * x); }
  function easeOut(x) { return 1 - Math.pow(1 - clamp(x), 3); }
  var OK = '<i class="ss-ok" aria-label="verified">✓</i>';

  /* ---------------- UI copy ---------------- */
  var T = (I18.T && I18.T[LANG]) || (HE ? {
    will: 'Glance יבצע', doing: 'Glance עובד', prepared: 'מוכן · שום דבר לא נשלח', closing: 'סוגר ומאמת', done: 'בוצע',
    queued: 'בתור', verifying: function (a) { return 'מאמת ב־' + a + '…'; }, applying: function (a) { return 'מבצע ב־' + a + '…'; }, fetching: function (a) { return 'מושך חזרה מ־' + a + '…'; },
    chip: function (n, tools, sugg) { return gplus() + ' יכול לסגור את זה ב־<b class="file">' + n + ' צעדים</b>' + (tools.length ? ' · ' + tools.map(function (t) { return '<bdi>' + esc(t) + '</bdi>'; }).join(' · ') : '') + (sugg ? '<span class="chip-sugg"> · <bdi dir="ltr">+' + sugg + '</bdi> מוצע</span>' : ''); },
    none: gplus() + ' · סמנו לפחות צעד אחד',
    suggested: 'מוצע', added: 'נוסף', afterApprove: 'אחרי אישור', you: 'אתם', yourStep: 'הצעד שלך · ייכלל בסגירה',
    caps: ['Glance קורא את הבקשה. עדיין שום דבר לא קורה.', 'לחיצה אחת. Glance מכין כל צעד בכלי שלו.', 'מוכן, מאומת, שום דבר לא נשלח. ההחלטה שלך.', 'האישור סוגר. כל צעד נמשך חזרה כהוכחה.', 'נסגר, עם קבלה. ביטול במרחק לחיצה.'],
    ping: function (n) { return 'יכול לסגור · ' + n + ' צעדים'; }
  } : {
    will: 'Glance will', doing: 'Glance is doing', prepared: 'Prepared · nothing sent', closing: 'Closing · verifying', done: 'Done',
    queued: 'Queued', verifying: function (a) { return 'Verifying in ' + a + '…'; }, applying: function (a) { return 'Applying in ' + a + '…'; }, fetching: function (a) { return 'Fetching back from ' + a + '…'; },
    chip: function (n, tools, sugg) { return gplus() + ' can close this in <b class="file">' + n + ' step' + (n === 1 ? '' : 's') + '</b>' + (tools.length ? ' · ' + tools.map(esc).join(' · ') : '') + (sugg ? '<span class="chip-sugg"> · +' + sugg + ' suggested</span>' : ''); },
    none: gplus() + ' · tick at least one step',
    suggested: 'Suggested', added: 'Added', afterApprove: 'after Approve', you: 'You', yourStep: 'your step · included in the close',
    caps: ['Glance reads the ask. Nothing happens yet.', 'One click. Glance prepares every step, in each tool.', 'Prepared, verified, nothing sent. Your call.', 'Approve closes it. Each step is fetched back as proof.', 'Closed, with a receipt. Undo is one click away.'],
    ping: function (n) { return 'can close this · ' + n + ' steps'; }
  });

  /* ---------------- hero case · one email, closed across non-Google tools ---------------- */
  var LAUNCH_EN = {
    subj: 'Can we move to Wednesday?', av: 'M', fromName: 'Megan Carter', fromAddr: 'megan.carter@gmail.com', fromTime: '09:12',
    greet: 'Hi Sali,', sign: 'Megan', att: 'Room photos.pdf',
    msgBody: 'Can we move our design session to Wednesday at 6pm? I attached photos of the room.',
    intent: 'Megan wants the session on Wednesday at 6pm.',
    reply: 'Wednesday at 6 works.', replyNote: 'Room photos', replyTo: 'Megan Carter',
    actions: [
      { tool: 'calendar', app: 'Calendar', text: 'Move the session to Wed 18:00', out: 'Session with Megan · Thu 17:00', run: 'Checking you are free…', result: 'Wed 18:00 · free', done: 'Wed 18:00 · booked', tile: 'Wed 18:00' },
      { tool: 'drive', app: 'Drive', text: 'Save the photos to Megan’s folder', out: 'Room photos.pdf · not saved', run: 'Saving the file…', result: 'Saved · Megan / Room', done: 'Photos saved', tile: 'Megan / Room' },
      { tool: 'gmail', app: 'Gmail', text: 'Confirmation reply to Megan', out: 'Not sent', run: 'Drafting the reply…', result: 'Reply ready · not sent', done: 'Reply sent to Megan', tile: 'Wed 18:00 works' }
    ],
    close: { text: 'Close once Megan knows it’s Wednesday', done: 'Loop closed · session is Wednesday' },
    receipt: '<b>Closed</b> · session on Wednesday 18:00 · <em class="js-undo">Undo</em>'
  };
  var LAUNCH_HE = {
    subj: 'אפשר להקדים לרביעי?', av: 'מ', fromName: 'מיכל אברהם', fromAddr: 'michal.a@gmail.com', fromTime: '09:12',
    greet: 'סאלי,', sign: 'מיכל', att: 'תמונות החדר.pdf',
    msgBody: 'אפשר להקדים את פגישת העיצוב שלנו ליום רביעי ב־18:00? צירפתי תמונות של החדר.',
    intent: 'מיכל רוצה להקדים את הפגישה לרביעי ב־18:00.',
    reply: 'רביעי ב־18:00 מתאים.', replyNote: 'תמונות החדר', replyTo: 'מיכל אברהם',
    actions: [
      { tool: 'calendar', app: 'Calendar', text: 'להזיז את הפגישה לרביעי 18:00', out: 'פגישה עם מיכל · חמישי 17:00', run: 'בודק שאתם פנויים…', result: 'רביעי 18:00 · פנוי', done: 'רביעי 18:00 · נקבע', tile: 'רביעי 18:00' },
      { tool: 'drive', app: 'Drive', text: 'לשמור את התמונות בתיקייה של מיכל', out: 'תמונות החדר.pdf · לא נשמר', run: 'שומר את הקובץ…', result: 'נשמר · מיכל / חדר', done: 'התמונות נשמרו', tile: 'מיכל / חדר' },
      { tool: 'gmail', app: 'Gmail', text: 'תשובת אישור למיכל', out: 'לא נשלחה', run: 'מכין תשובה…', result: 'התשובה מוכנה · לא נשלחה', done: 'התשובה נשלחה למיכל', tile: 'רביעי 18:00 מתאים' }
    ],
    close: { text: 'לסגור כשמיכל יודעת שזה רביעי', done: 'הלולאה נסגרה · הפגישה ברביעי' },
    receipt: '<b>נסגר</b> · הפגישה ברביעי 18:00 · <em class="js-undo">ביטול</em>'
  };
  var CASES_EN = { launch: LAUNCH_EN };
  var CASES_HE = { launch: LAUNCH_HE };
  var CASES = (I18.LAUNCH && I18.LAUNCH[LANG]) ? { launch: I18.LAUNCH[LANG] } : (HE ? CASES_HE : CASES_EN);

  /* Slack · office manager · one short message, three steps, one Do It */
  function waPack(o) { return o; }
  var WA_ASKS = [HE ? waPack({
    ask: 'צריך לתאם טכנאי למזגן במשרד השבוע, מתי נוח לך?',
    intent: 'מנהל המשרד מבקש לתאם טכנאי למזגן השבוע.',
    draft: 'אפשר ביום שלישי ב־10:00 או ביום רביעי ב־16:00. מה נוח לך?',
    actions: [
      { tool: 'calendar', app: 'Calendar', text: 'למצוא זמן פנוי השבוע', out: 'שלישי 10:00 · רביעי 16:00', run: 'בודק את היומן…', runSub: 'השבוע', result: 'שני זמנים פנויים', done: 'שני זמנים פנויים' },
      { tool: 'slack', app: 'Slack', text: 'תשובה עם שתי אפשרויות', out: 'לא נשלח', run: 'מכין תשובה…', runSub: 'אל דוד', result: 'התשובה מוכנה', done: 'נשלחה לדוד' },
      { tool: 'calendar', app: 'Calendar', text: 'תזכורת ליום הביקור', out: 'שלישי 08:00', run: 'קובע תזכורת…', runSub: 'יום הביקור', result: 'התזכורת מוכנה', done: 'התזכורת נקבעה' }
    ],
    close: { text: 'לסגור כשהטכנאי מתואם', done: 'נסגר · הטכנאי מתואם' },
    receipt: '<b>נסגר</b> · הטכנאי מתואם · <em class="js-undo">ביטול</em>'
  }) : waPack({
    ask: 'The office AC technician needs to come this week. When works for you?',
    intent: 'The office manager wants to book the AC technician this week.',
    draft: 'Tuesday at 10:00 or Wednesday at 4:00 pm. Which works for you?',
    actions: [
      { tool: 'calendar', app: 'Calendar', text: 'Find a free slot this week', out: 'Tue 10:00 · Wed 16:00', run: 'Checking your calendar…', runSub: 'This week', result: 'Two free slots', done: 'Two free slots' },
      { tool: 'slack', app: 'Slack', text: 'Reply with two options', out: 'Not sent', run: 'Preparing the reply…', runSub: 'To David', result: 'Reply ready', done: 'Sent to David' },
      { tool: 'calendar', app: 'Calendar', text: 'Reminder for the visit day', out: 'Tue 08:00', run: 'Setting a reminder…', runSub: 'Visit day', result: 'Reminder ready', done: 'Reminder set' }
    ],
    close: { text: 'Close once the technician is booked', done: 'Closed · technician scheduled' },
    receipt: '<b>Closed</b> · technician scheduled · <em class="js-undo">Undo</em>'
  })];
  if (I18.WA && I18.WA[LANG]) WA_ASKS = [I18.WA[LANG]];
  function waFromAsk(text) { return WA_ASKS[0]; }
  function waData(pack) {
    return { intent: pack.intent, actions: pack.actions, close: pack.close, receipt: pack.receipt, waitSub: (I18.STR && I18.STR[LANG] && I18.STR[LANG].waitSub) || (HE ? 'Glance לא שולח בשמך' : 'Glance never sends for you') };
  }
  var WA = waData(WA_ASKS[0]);
  var T_WA = (I18.T_WA && I18.T_WA[LANG]) || (HE ? {
    will: 'Glance יבצע', doing: 'Glance עובד', prepared: 'מוכן · שום דבר לא נשלח', done: 'בוצע', afterApprove: 'אחרי אישור', suggested: 'מוצע',
    verifying: function (a) { return 'מאמת ב־' + a + '…'; }
  } : {
    will: 'Glance will', doing: 'Glance is doing', prepared: 'Prepared · nothing sent', done: 'Done', afterApprove: 'after Approve', suggested: 'Suggested',
    verifying: function (a) { return 'Verifying in ' + a + '…'; }
  });
  if (!(I18.T_WA && I18.T_WA[LANG])) {
  T_WA.chip = HE
    ? function (n, tools) { return gplus() + ' יסגור את זה ב־<b class="file">' + n + ' צעדים</b>'; }
    : function (n, tools) { return gplus() + ' can close this in <b class="file">' + n + ' step' + (n === 1 ? '' : 's') + '</b>'; };
  T_WA.none = HE ? (gplus() + ' · סמנו לפחות צעד אחד') : (gplus() + ' · tick at least one step');
  }

  /* ---------------- row templates (step-states v1 parity) ---------------- */
  function appB(app) { return '<b class="act-app"><bdi>' + esc(app) + '</bdi></b>'; }
  function brandId(tool) { return tool === 'outlookcal' ? 'outlook' : tool; }
  function brandMark(tool) {
    var id = brandId(tool);
    var svg = window.BRAND && window.BRAND[id];
    if (!svg) return '<span class="act-glyph" data-glyph="' + tool + '">' + glyph(tool) + '</span>';
    return '<span class="act-glyph is-brand" data-glyph="' + tool + '" data-brand="' + id + '">' + svg + '</span>';
  }
  function classifyStep(txt) {
    var known = [['dropbox', 'dropbox', 'Dropbox'], ['hubspot', 'hubspot', 'HubSpot'], ['notion', 'notion', 'Notion'], ['jira', 'jira', 'Jira'], ['zoom', 'zoom', 'Zoom'], ['calendly', 'calendly', 'Calendly'], ['asana', 'asana', 'Asana'], ['gmail', 'gmail', 'Gmail'], ['outlook', 'outlook', 'Outlook'], ['slack', 'slack', 'Slack'], ['slack', 'slack', 'Slack'], ['clickup', 'clickup', 'ClickUp']];
    var low = String(txt).toLowerCase();
    var hit = null;
    for (var i = 0; i < known.length; i++) if (low.indexOf(known[i][0]) >= 0) { hit = known[i]; break; }
    var base = { text: txt, run: '…', result: txt, done: txt, tile: txt, added: true, on: true };
    if (hit) return Object.assign(base, { tool: hit[1], app: hit[2], out: (I18.STR && I18.STR[LANG] && I18.STR[LANG].ready) || ((I18.STR && I18.STR[LANG] && I18.STR[LANG].ready) || (HE ? 'מוכן' : 'Ready')), status: 'ready' });
    var vague = txt.length < 12 || /[?]/.test(txt) || /^(ok|yes|maybe|hmm|what|why|please|thanks|היי|כן)\b/i.test(low);
    if (vague) return Object.assign(base, { tool: 'you', app: T.you, out: ((I18.STR && I18.STR[LANG] && I18.STR[LANG].unclear) || (HE ? 'לא ברור · ' : 'Unclear · ')) + ((I18.STR && I18.STR[LANG] && I18.STR[LANG].unclearQ) || (HE ? 'מה צריך ש-Glance יעשה כאן?' : 'What should Glance do with this?')), status: 'unclear' });
    return Object.assign(base, { tool: 'you', app: T.you, out: (I18.STR && I18.STR[LANG] && I18.STR[LANG].needsConn) || (HE ? 'צריך חיבור' : 'Needs connection'), status: 'connect' });
  }
  function rowHTML(a, i, L) {
    L = L || T;
    var kind = (a.suggested ? ' act-suggested' : '') + (a.added ? ' act-added' : '');
    var checked = a.on === false || (a.suggested && a.on !== true) ? '' : ' checked';
    var out = a.added && a.status === 'ready' ? (appB(a.app) + ' · ' + (HE ? 'מוכן' : 'Ready')) : a.added ? expandViewer(a.out) : (appB(a.app) + ' · ' + expandViewer(a.out));
    return '<li class="act' + kind + '" data-i="' + i + '" data-app="' + esc(a.chip || a.app) + '" data-status="' + esc(a.status || '') + '" data-run="' + esc(expandViewer(a.run || '')) + '" data-run-sub="' + esc(expandViewer(a.runSub || '')) + '">' +
      '<label class="act-row">' +
        '<input type="checkbox" class="act-check"' + checked + '>' +
        '<span class="act-box" aria-hidden="true"></span>' +
        brandMark(a.tool) +
        '<span class="act-body">' +
          '<span class="act-text">' + expandViewer(a.text) + '</span>' +
          '<span class="act-out" data-out="' + esc(out) + '">' + out + '</span>' +
          '<span class="act-res">' + appB(a.app) + ' · <span class="act-res-txt" data-prep="' + esc(expandViewer(a.result)) + '" data-done="' + esc(expandViewer(a.done)) + '">' + expandViewer(a.result) + '</span></span>' +
        '</span>' +
        (a.suggested ? '<span class="act-tag ss-tag">' + L.suggested + '</span>' : a.added ? '<span class="act-tag ss-tag">' + L.added + '</span>' : '') +
      '</label>' +
      (a.added ? '<button type="button" class="act-x" aria-label="' + ((I18.STR && I18.STR[LANG] && I18.STR[LANG].removeStep) || (HE ? 'הסרת צעד' : 'Remove step')) + '">×</button>' : '') +
      '</li>';
  }
  function closeHTML(c, L) {
    L = L || T;
    return '<li class="act act-close" data-close="1">' +
      '<span class="act-row">' +
        '<span class="act-lock" aria-hidden="true"><svg viewBox="0 0 16 16" width="16" height="16"><rect x="3.25" y="7.15" width="9.5" height="6.35" rx="1.3" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M5.2 7.15V5.15a2.8 2.8 0 0 1 5.6 0V7.15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></span>' +
        '<span class="act-glyph" data-glyph="glance">' + glyph('glance') + '</span>' +
        '<span class="act-body">' +
          '<span class="act-text">' + expandViewer(c.text) + '</span>' +
          '<span class="act-res"><span class="act-res-txt">' + expandViewer(c.done) + '</span></span>' +
        '</span>' +
        '<span class="act-tag">' + L.afterApprove + '</span>' +
      '</span></li>';
  }

  /* ---------------- demo closer (Slack · Meet) ---------------- */
  function makeCloser(stage, data, opts) {
    opts = opts || {};
    var L = opts.L || T;
    var list = stage.querySelector('.acts');
    var runBox = stage.querySelector('.acts-run');
    var runTitle = runBox && runBox.querySelector('.run-title');
    var runSub = runBox && runBox.querySelector('.run-sub');
    var runCount = runBox && runBox.querySelector('.run-count');
    var runFill = runBox && runBox.querySelector('.run-fill');
    var approve = stage.querySelector('.approve-banner');
    var chipTxt = stage.querySelector('.chip-txt');
    var receipt = stage.querySelector('.receipt-stack');
    var actsLabel = stage.querySelector('.acts-label');
    var stepMs = opts.stepMs || 760;
    var st = 'propose', timers = [];

    function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
    function clearT() { timers.forEach(clearTimeout); timers = []; }
    function rings(src) { $all('.living-ico', stage).forEach(function (im) { if (!im.closest('.mj-pill')) im.src = src; }); }
    function rows() { return $all('li.act:not(.act-close)', list); }
    function closeRow() { return list.querySelector('li.act-close'); }
    function selected() { return rows().filter(function (li) { var cb = li.querySelector('.act-check'); return cb && cb.checked; }); }
    function render(d) {
      data = d;
      list.innerHTML = d.actions.map(function (a, i) { return rowHTML(a, i, L); }).join('') + closeHTML(d.close, L);
      syncChip(); setReceipt();
    }
    function setReceipt() { if (receipt) receipt.innerHTML = '<div class="receipt receipt-hero"><span class="receipt-dot"></span><span class="receipt-txt">' + expandViewer(data.receipt) + '</span></div>' + (data.receiptLines ? '' : ''); }
    function syncChip() {
      if (!chipTxt) return;
      var sel = selected(), tools = [];
      sel.forEach(function (li) { var a = li.getAttribute('data-app'); if (a && tools.indexOf(a) < 0) tools.push(a); });
      stage.classList.toggle('no-actions', sel.length === 0);
      chipTxt.innerHTML = sel.length ? L.chip(sel.length, tools, 0) : L.none;
    }
    function setLabel(t) { if (actsLabel) actsLabel.textContent = t; }
    function clearRows() {
      $all('li.act', list).forEach(function (li) {
        li.classList.remove('is-active', 'is-done', 'is-pending', 'is-skipped', 'is-ready', 'is-final', 'st-verifying');
        li.removeAttribute('data-proof');
        var r = li.querySelector('.act-res-txt[data-prep]'); if (r) r.innerHTML = r.getAttribute('data-prep');
        var o = li.querySelector('.act-out[data-out]'); if (o) o.innerHTML = o.getAttribute('data-out');
      });
    }
    function setState(next) {
      st = next;
      stage.setAttribute('data-state', next);
      if (approve) approve.hidden = next !== 'wait';
      if (runBox) runBox.hidden = next !== 'working';
      $all('.act-check', list).forEach(function (cb) { cb.disabled = next !== 'propose'; });
      if (next === 'propose' || next === 'held') { rings(LIVING.idle); clearRows(); setLabel(L.will); }
      else if (next === 'working') { rings(LIVING.thinking); setLabel(L.doing); }
      else if (next === 'wait') { rings(LIVING.idle); setLabel(L.prepared); }
      else if (next === 'settled') { rings(LIVING.done); setLabel(L.done); later(function () { if (st === 'settled') rings(LIVING.keyDone); }, 2100); }
      if (opts.onState) opts.onState(next);
    }
    function outTxt(li, t) { var o = li.querySelector('.act-out'); var app = li.getAttribute('data-app'); if (o) o.innerHTML = appB(app) + ' · ' + t; }
    function doIt() {
      if (st !== 'propose') return;
      var sel = selected(); if (!sel.length) return;
      setState('working');
      rows().forEach(function (li) { li.classList.add(sel.indexOf(li) >= 0 ? 'is-pending' : 'is-skipped'); if (sel.indexOf(li) >= 0) { li.setAttribute('data-proof', 'queued'); } });
      var n = sel.length;
      sel.forEach(function (li, k) {
        var t0 = k * stepMs;
        later(function () {
          li.classList.remove('is-pending'); li.classList.add('is-active'); li.setAttribute('data-proof', 'preparing');
          outTxt(li, li.getAttribute('data-run'));
          if (runTitle) runTitle.innerHTML = li.getAttribute('data-run');
          if (runSub) { var rs = li.getAttribute('data-run-sub') || ''; runSub.innerHTML = appB(li.getAttribute('data-app')) + (rs ? ' · ' + rs : ''); }
          if (runCount) runCount.innerHTML = (k + 1) + '<span>/</span>' + n;
          if (runFill) runFill.style.width = Math.round(((k + 0.5) / n) * 100) + '%';
          if (opts.onStep) opts.onStep(k, li, n);
        }, t0);
        later(function () { li.classList.remove('is-active'); li.classList.add('st-verifying'); li.setAttribute('data-proof', 'verifying'); outTxt(li, (L.verifying ? L.verifying(li.getAttribute('data-app')) : '…')); }, t0 + stepMs * 0.58);
        later(function () {
          li.classList.remove('st-verifying'); li.classList.add('is-done'); li.setAttribute('data-proof', 'verified');
          var r = li.querySelector('.act-res-txt'); if (r) r.innerHTML = r.getAttribute('data-prep') + ' ' + OK;
          if (opts.onStepDone) opts.onStepDone(k, li, n);
        }, t0 + stepMs * 0.94);
      });
      later(function () {
        var cr = closeRow(); if (cr) cr.classList.add('is-ready');
        var toWait = function () { if (opts.direct) { st = 'wait'; approveClose(); } else setState('wait'); }; if (opts.onRunEnd) opts.onRunEnd(toWait); else toWait();
      }, n * stepMs + 40);
    }
    function approveClose() {
      if (st !== 'wait') return;
      $all('li.act.is-done .act-res-txt[data-done]', list).forEach(function (r) { r.innerHTML = r.getAttribute('data-done') + ' ' + OK; });
      var cr = closeRow(); if (cr) { cr.classList.remove('is-ready'); cr.classList.add('is-done', 'is-final'); }
      setReceipt(); setState('settled');
      stage.classList.add('flash-settle'); later(function () { stage.classList.remove('flash-settle'); }, 700);
    }
    function undo() { clearT(); setState('propose'); syncChip(); }
    function hold() { if (st === 'working') return; clearT(); setState('held'); }
    function unpark() { setState('propose'); }
    list.addEventListener('change', function (e) { if (e.target && e.target.classList.contains('act-check')) syncChip(); });
    stage.addEventListener('keydown', function (e) {
      var inp = e.target;
      if (!inp || !inp.classList || !inp.classList.contains('ss-add-input')) return;
      if (e.key !== 'Enter') return;
      e.preventDefault();
      var txt = inp.value.trim();
      if (!txt || st !== 'propose') return;
      var a = classifyStep(txt);
      a.text = esc(txt); a.result = esc(txt); a.done = esc(txt);
      data.actions.push(a);
      inp.value = '';
      render(data);
    });
    stage.addEventListener('click', function (e) {
      var t = e.target; if (!t || !t.closest) return;
      if (t.closest('.approve-btn')) { e.preventDefault(); approveClose(); return; }
      if (t.closest('.do-halo')) { e.preventDefault(); if (opts.onDoIt) opts.onDoIt(); doIt(); return; }
      if (t.closest('.chip-x')) { e.preventDefault(); hold(); return; }
      if (t.closest('.js-undo')) { e.preventDefault(); undo(); if (opts.onUndo) opts.onUndo(); return; }
      if (t.closest('.js-unpark')) { e.preventDefault(); unpark(); return; }
    });
    render(data); setState('propose');
    return { render: function (d) { clearT(); render(d || data); setState('propose'); }, state: function () { return st; }, doIt: doIt, approve: approveClose, undo: undo, stage: stage };
  }
  window.__glanceKit = { makeCloser: makeCloser, rowHTML: rowHTML, closeHTML: closeHTML, T: T, HE: HE, esc: esc, LIVING: LIVING, OK: OK, reduced: reduced };

  /* =====================================================================
     HERO · cinematic scroll story
     ===================================================================== */
  var K = { askA: .10, askB: .19, pingA: .16, pingB: .22, cardA: .21, cardB: .30, rowsA: .255, rowsB: .36, tick: .405,
            pressA: .43, pressB: .47, runA: .47, runB: .75, collA: .79, collB: .85, apprA: .85, apprB: .885, proofA: .885, proofB: .945, closeA: .95 };
  var hero = document.getElementById('hero');
  var H = null;
  if (hero) H = initHero();

  var RTL = document.documentElement.dir === 'rtl';
  function initHero() {
    var pin = $('.h21-pin', hero), copy = $('.h21-copy', hero), endL = $('.h21-end', hero), rig = $('.h21-rig', hero);
    var win = $('.h21-win', hero), tilesBox = $('.h21-tiles', hero), svg = $('.h21-beams', hero), card = $('#product-moment');
    var gs = $('#live-glance'), list = $('#live-acts'), chipTxt = $('#live-chip .chip-txt'), approve = $('#live-approve');
    var receipt = $('#live-receipt'), doit = $('#btn-doit'), ask = $('.h21-ask', hero), ping = $('.h21-ping', hero);
    var sweep = $('.h21-sweep', hero), dim = $('.h21-dim', hero), capSteps = $all('.h21-steps li', hero), capTxt = $('.h21-cap-txt', hero), cap = $('.h21-cap', hero);
    var label = $('.acts-label', gs), addBox = $('.ss-add', gs), icoLive = $('#live-living-ico');
    var data = null, caseId = 'launch', manual = false, held = false;
    var tCard = 0, peak = 0, tween = null, ys = window.scrollY, yTarget = ys, last = {}, beams = [], tiles = [];
    var geo = { range: 1, top: 0, vh: window.innerHeight, mobile: false, rs: 1, drop: 0, cardDx: 0 };
    var t0 = performance.now(), running = false, inView = true, lastFrame = 0;

    function set(el, prop, val, key) { var k = key || prop; var c = el.__c || (el.__c = {}); if (c[k] === val) return; c[k] = val; if (prop === 'class') return; el.style[prop] = val; }
    function setCls(el, cls, on) { if (!el) return; if (el.classList.contains(cls) !== !!on) el.classList.toggle(cls, !!on); }
    function setHTML(el, html) { if (el && el.__h !== html) { el.__h = html; el.innerHTML = html; } }

    /* ----- data / DOM build ----- */
    function bindMail(c) {
      $all('[data-bind]', hero).forEach(function (el) {
        var k = el.getAttribute('data-bind');
        if (k === 'pingTxt') { el.textContent = T.ping(c.actions.filter(function (a) { return !a.suggested; }).length); return; }
        if (c[k] != null) { if (k === 'intent') el.innerHTML = expandViewer(c[k]); else el.textContent = expandViewer(c[k]); }
      });
    }
    function build(id) {
      caseId = id; var c = CASES[id];
      data = JSON.parse(JSON.stringify(c));
      data.actions.forEach(function (a) { a.on = !a.suggested; });
      card.setAttribute('data-case', id);
      bindMail(data);
      list.innerHTML = data.actions.map(function (a, i) { return rowHTML(a, i); }).join('') + closeHTML(data.close);
      tilesBox.innerHTML = data.actions.map(function (a, i) {
        return '<div class="h21-tile" data-k="' + i + '" data-tool="' + a.tool + '"><span class="h21-tile-ic' + (window.BRAND && window.BRAND[a.tool] ? ' is-brand' : '') + '">' + ((window.BRAND && window.BRAND[a.tool]) || glyph(a.tool)) + '</span><span class="h21-tile-tx"><b><bdi>' + esc(a.app) + '</bdi></b><em>' + expandViewer(a.tile || a.result) + '</em></span><i class="h21-tile-ok" aria-hidden="true"></i></div>';
      }).join('');
      if (svg) svg.innerHTML = '';
      tiles = $all('.h21-tile', tilesBox);
      beams = [];
      receipt.innerHTML = '<div class="receipt receipt-hero"><span class="receipt-dot"></span><span class="receipt-txt">' + expandViewer(data.receipt) + '</span></div>';
      last = {}; $all('li.act', list).forEach(function (li) { li.__c = null; li.__h = null; });
      measure();
    }
    /* parallel run: every selected tool starts almost together (small stagger) and finishes together */
    function pu(t, a, b, k, n) { var st = (b - a) * 0.09, d = (b - a) - st * Math.max(0, n - 1); return (t - (a + k * st)) / d; }
    function rowsEls() { return $all('li.act:not(.act-close)', list); }

    /* ----- geometry ----- */
    function measure() {
      var vh = window.innerHeight, vw = document.documentElement.clientWidth;
      geo.vh = vh; geo.mobile = vw <= 760;
      var rect = hero.getBoundingClientRect();
      geo.top = rect.top + window.scrollY;
      geo.range = Math.max(1, hero.offsetHeight - vh);
      // rig scale to fit
      var baseW = parseFloat(getComputedStyle(rig).getPropertyValue('--rig-w')) || rig.offsetWidth;
      var baseH = parseFloat(getComputedStyle(rig).getPropertyValue('--rig-h')) || rig.offsetHeight;
      if (geo.mobile) geo.rs = 1;
      else geo.rs = Math.min(1, (vw - 48) / baseW, (vh - 48 - 150) / baseH);
      // landed position vs opening drop
      var landedTop = rig.offsetTop;
      /* 13.11: on phones the mail starts right under the copy (and its Get Glance CTA), not at 56% of the screen, so it shows on the first screen */
      var dropTo = vh * (geo.mobile ? 0.56 : 0.64);
      if (geo.mobile && copy) dropTo = Math.min(dropTo, copy.offsetTop + copy.offsetHeight + 18);
      geo.drop = Math.max(0, dropTo - landedTop);
      // card centering offset (desktop only)
      if (!geo.mobile) {
        var pinW = pin.clientWidth, cw = card.offsetWidth, cl = card.offsetLeft;
        var rigLeft = (pinW - rig.offsetWidth * geo.rs) / 2;
        geo.cardDx = (pinW / 2) - (rigLeft + (cl + cw / 2) * geo.rs);
        geo.cardDx /= geo.rs;
      } else geo.cardDx = 0;
      geo.introDx = geo.mobile ? 0 : (rig.offsetWidth - win.offsetWidth) / 2 * geo.rs * (RTL ? -1 : 1);
      last = {}; cacheBeams(); kick();
    }
    var beamCache = [];
    function cacheBeams() {
      beamCache = [];
      if (geo.mobile) return;
      var rows = rowsEls();
      tiles.forEach(function (tile, i) {
        var row = rows[i];
        if (!row || !tile) { beamCache[i] = null; return; }
        function rel(el) {
          var x = 0, y = 0, n = el;
          while (n && n !== rig) { x += n.offsetLeft || 0; y += n.offsetTop || 0; n = n.offsetParent; }
          return { x: x, y: y };
        }
        var a = rel(row), b = rel(tile);
        beamCache[i] = { x1: a.x, y1: a.y + row.offsetHeight / 2, x2: b.x + tile.offsetWidth, y2: b.y + tile.offsetHeight / 2 };
      });
    }

    /* ----- state from t ----- */
    function stateAt(t) {
      if (held) return 'held';
      if (t < K.pressB) return 'propose';
      if (t < K.runB) return 'working';
      if (t < K.apprB) return 'wait';
      if (t < K.closeA) return 'approving';
      return 'settled';
    }
    function selectedIdx(t) {
      var out = [];
      data.actions.forEach(function (a, i) {
        var on = manual ? a.on : (!a.suggested || t >= K.tick);
        if (on) out.push(i);
      });
      return out;
    }

    /* ----- render card for t ----- */
    function renderCard(t, time) {
      var state = stateAt(t);
      if (card.getAttribute('data-state') !== state) {
        card.setAttribute('data-state', state);
        approve.hidden = state !== 'wait';
        icoLive.src = state === 'working' || state === 'approving' ? LIVING.thinking : state === 'settled' ? LIVING.keyDone : LIVING.idle;
        label.textContent = state === 'working' ? T.doing : state === 'wait' ? T.prepared : state === 'approving' ? T.closing : state === 'settled' ? T.done : T.will;
        $all('.act-check', list).forEach(function (cb) { cb.disabled = state !== 'propose'; });
      }
      var rows = rowsEls(), sel = selectedIdx(t), n = sel.length || 1;
      // checkbox sync (scroll mode drives the Suggested tick)
      if (!manual) rows.forEach(function (li, i) { var cb = li.querySelector('.act-check'); var on = sel.indexOf(i) >= 0; if (cb && cb.checked !== on) cb.checked = on; });
      // chip
      var tools = [], sugg = 0;
      sel.forEach(function (i) { var a = data.actions[i]; if (tools.indexOf(a.app) < 0) tools.push(a.app); });
      data.actions.forEach(function (a, i) { if (a.suggested && sel.indexOf(i) < 0) sugg++; });
      setHTML(chipTxt, sel.length ? T.chip(sel.length, tools, sugg) : T.none);
      setCls(card, 'no-actions', !sel.length);
      // rows
      rows.forEach(function (li, i) {
        var k = sel.indexOf(i), proof = '', out = null, res = null, cls = '';
        if (state === 'propose' || state === 'held') { proof = ''; }
        else if (k < 0) { cls = 'is-skipped'; }
        else if (state === 'working') {
          var u = pu(t, K.runA, K.runB, k, n);
          if (u < 0) { cls = 'is-pending'; proof = 'queued'; out = T.queued; }
          else if (u < 0.45) { cls = 'is-active'; proof = 'preparing'; out = data.actions[i].run; }
          else if (u < 0.8) { cls = 'st-verifying'; proof = 'verifying'; out = T.verifying(data.actions[i].app); }
          else { cls = 'is-done'; proof = 'verified'; res = 'prep'; }
        } else if (state === 'wait') { cls = 'is-done'; proof = 'verified'; res = 'prep'; }
        else if (state === 'approving') {
          var u2 = pu(t, K.proofA, K.proofB, k, n);
          if (u2 < 0) { cls = 'is-pending'; proof = 'queued'; out = T.queued; }
          else if (u2 < 0.4) { cls = 'is-active'; proof = 'preparing'; out = T.applying(data.actions[i].app); }
          else if (u2 < 0.8) { cls = 'st-verifying'; proof = 'verifying'; out = T.fetching(data.actions[i].app); }
          else { cls = 'is-done'; proof = 'verified'; res = 'done'; }
        } else if (state === 'settled') { cls = 'is-done'; proof = 'verified'; res = 'done'; }
        var pg = (state === 'propose' || state === 'held' || k < 0) ? 0 : state === 'working' ? clamp((t - K.runA) / (K.runB - K.runA) > 0 ? pu(t, K.runA, K.runB, k, n) / 0.8 : 0) : 1;
        var pgs = pg.toFixed(3); if (li.__p !== pgs) { li.__p = pgs; li.style.setProperty('--p', pgs); }
        var key = cls + '|' + proof + '|' + res + '|' + out;
        if (li.__k !== key) {
          li.__k = key;
          li.classList.remove('is-pending', 'is-active', 'st-verifying', 'is-done', 'is-skipped');
          if (cls) li.classList.add(cls);
          if (proof) li.setAttribute('data-proof', proof); else li.removeAttribute('data-proof');
          var o = li.querySelector('.act-out');
          o.innerHTML = out ? appB(data.actions[i].app) + ' · ' + expandViewer(out) : o.getAttribute('data-out');
          var r = li.querySelector('.act-res-txt');
          if (res) r.innerHTML = r.getAttribute(res === 'done' ? 'data-done' : 'data-prep') + ' ' + OK;
        }
      });
      var cr = list.querySelector('.act-close');
      if (cr) {
        var ck = state === 'settled' ? 'final' : state === 'wait' || state === 'approving' ? 'ready' : '';
        if (cr.__k !== ck) {
          cr.__k = ck; cr.classList.remove('is-ready', 'is-done', 'is-final', 'ss-proofed');
          if (ck === 'ready') cr.classList.add('is-ready');
          if (ck === 'final') { cr.classList.add('is-done', 'is-final', 'ss-proofed'); var crr = cr.querySelector('.act-res-txt'); if (crr && crr.innerHTML.indexOf('ss-ok') < 0) crr.innerHTML += ' ' + OK; }
        }
      }
      // cascade (scroll mode only)
      var items = rows.concat([cr, addBox, $('#live-chip')]);
      items.forEach(function (el, j) {
        if (!el) return;
        var a = manual || reduced() ? 1 : smooth(K.rowsA + j * 0.011, K.rowsA + j * 0.011 + 0.035, t);
        set(el, 'opacity', a >= 1 ? '' : a.toFixed(3));
        set(el, 'transform', a >= 1 ? '' : 'translate3d(0,' + ((1 - a) * 10).toFixed(1) + 'px,0)');
      });
      // Do It press (Flow's own press: scale-down, ring flash, ripple)
      var pr = manual ? (state === 'propose' && tween && tween.press ? tween.pressU : 0) : clamp((t - K.pressA) / (K.pressB - K.pressA));
      var pressed = pr > 0 && pr < 1;
      set(doit, 'transform', pressed ? 'scale(' + (1 - 0.04 * Math.sin(Math.PI * Math.min(1, pr * 1.6))).toFixed(3) + ')' : '');
      setCls(doit, 'is-pressing', pr > 0.15 && pr < 0.75);
      var rip = doit.querySelector('.doit-ripple');
      var ru = clamp((pr - 0.3) / 0.7);
      set(rip, 'opacity', pressed && pr > 0.3 ? (0.8 * (1 - ru)).toFixed(3) : '0');
      set(rip, 'transform', 'scale(' + (1 + 0.45 * ru).toFixed(3) + ')');
      // approve press
      var ap = clamp((t - K.apprA) / (K.apprB - K.apprA));
      var abtn = $('#btn-approve');
      set(abtn, 'transform', ap > 0 && ap < 1 ? 'scale(' + (1 - 0.04 * Math.sin(Math.PI * ap)).toFixed(3) + ')' : '');
      setCls(abtn, 'is-pressing', ap > 0.2 && ap < 0.8);
      return { state: state, sel: sel };
    }

    /* ----- tiles + beams ----- */
    function renderTiles(t, time, sel) {
      var state = stateAt(t), n = sel.length || 1;
      var cc = smooth(K.collA, K.collB, t);
      var active = false;
      tiles.forEach(function (tile, i) {
        var k = sel.indexOf(i), u = -1;
        if (k >= 0 && (state === 'working' || state === 'wait' || state === 'approving' || state === 'settled')) {
          u = pu(t, K.runA, K.runB, k, n);
        }
        var vis = u >= 0.36 ? smooth(0.36, 0.5, u) : 0;
        vis *= (1 - cc);
        if (state === 'settled') vis = 1;
        if (state === 'propose' || state === 'held') vis = 0;
        var ok = state === 'settled' || u >= 0.8;
        setCls(tile, 'is-ok', ok);
        setCls(tile, 'is-on', vis > 0.02);
        if (vis > 0.01) active = true;
        var parked = state === 'settled' || !geo.mobile;
        var fx = parked ? 0 : Math.cos(time * 0.0008 + i * 1.3) * 4;
        var fy = parked ? 0 : Math.sin(time * 0.0011 + i * 1.7) * 6;
        var par = parked ? 0 : (t - K.runA) * (i % 2 ? 28 : -22);
        var tx = fx, ty = fy + par;
        var s = 0.86 + 0.14 * vis;
        set(tile, 'opacity', vis.toFixed(3));
        set(tile, 'transform', parked ? 'none' : (geo.mobile ? 'translate3d(0,' + ((1 - vis) * 10).toFixed(1) + 'px,0) scale(' + (0.9 + 0.1 * vis).toFixed(3) + ')' :
          'translate3d(' + tx.toFixed(1) + 'px,' + ty.toFixed(1) + 'px,' + (40 + i * 18) + 'px) scale(' + s.toFixed(3) + ')'));
        // beams
        var b = beams[i]; if (!b || !b.p || geo.mobile) return;
        var bvis = k >= 0 && u >= 0 && (state === 'working' || state === 'wait') ? (1 - cc) : 0;
        if (bvis <= 0.001) { set(b.p, 'opacity', '0'); set(b.d, 'opacity', '0'); return; }
        var g0 = beamCache[i];
        if (!g0) { set(b.p, 'opacity', '0'); set(b.d, 'opacity', '0'); return; }
        var y1 = g0.y1, x1 = g0.x1 + 18, x2 = g0.x2 + tx, y2 = g0.y2 + ty, dx, d;
        dx = Math.max(60, Math.abs(x1 - x2) * 0.45);
        if (x2 >= x1) {
          d = 'M' + x1.toFixed(1) + ' ' + y1.toFixed(1) + ' C' + (x1 + dx).toFixed(1) + ' ' + y1.toFixed(1) + ' ' + (x2 - dx).toFixed(1) + ' ' + y2.toFixed(1) + ' ' + x2.toFixed(1) + ' ' + y2.toFixed(1);
        } else {
          d = 'M' + x1.toFixed(1) + ' ' + y1.toFixed(1) + ' C' + (x1 - dx).toFixed(1) + ' ' + y1.toFixed(1) + ' ' + (x2 + dx).toFixed(1) + ' ' + y2.toFixed(1) + ' ' + x2.toFixed(1) + ' ' + y2.toFixed(1);
        }
        if (b.p.__d !== d) { b.p.__d = d; b.p.setAttribute('d', d); b.L = b.p.getTotalLength(); b.p.style.strokeDasharray = b.L.toFixed(1); }
        var draw = smooth(0, 0.38, u);
        b.p.style.strokeDashoffset = (b.L * (1 - draw)).toFixed(1);
        set(b.p, 'opacity', ((u >= 0.8 ? 0.28 : 0.9) * bvis).toFixed(3));
        if (u >= 0.45 && u < 0.82) {
          var q = (u - 0.45) / 0.37; var pt = b.p.getPointAtLength(b.L * (1 - q));
          b.d.setAttribute('cx', pt.x.toFixed(1)); b.d.setAttribute('cy', pt.y.toFixed(1)); set(b.d, 'opacity', bvis.toFixed(3));
        } else if (u >= 0 && u < 0.38) {
          var pt2 = b.p.getPointAtLength(b.L * draw); b.d.setAttribute('cx', pt2.x.toFixed(1)); b.d.setAttribute('cy', pt2.y.toFixed(1)); set(b.d, 'opacity', bvis.toFixed(3));
        } else set(b.d, 'opacity', '0');
      });
      return active;
    }
    function measureCollapse() {
      var cr = card.getBoundingClientRect();
      tiles.forEach(function (tile) {
        tile.__toCardX = 0; tile.__toCardY = 0;
        var r = tile.getBoundingClientRect(); if (!r.width) return;
        tile.__toCardX = (cr.left + cr.width * 0.25) - (r.left + r.width / 2);
        tile.__toCardY = (cr.top + cr.height * 0.5) - (r.top + r.height / 2);
      });
    }

    function paintMail(state) {
      var art = $('#gw-artifact', hero);
      if (!art || !data) return;
      var show = false;
      var sent = state === 'settled';
      var key = (show ? '1' : '0') + (sent ? 's' : 'd') + (data.subj || '');
      if (art.__k === key) return;
      art.__k = key;
      art.hidden = !show;
      art.classList.toggle('is-sent', sent);
      var kEl = art.querySelector('[data-art-k]');
      if (kEl) kEl.textContent = sent ? ((I18.STR && I18.STR[LANG] && I18.STR[LANG].sent) || (HE ? 'נשלח' : 'Sent')) : ((I18.STR && I18.STR[LANG] && I18.STR[LANG].draft) || (HE ? 'טיוטה' : 'Draft'));
      var who = art.querySelector('[data-art-who]');
      if (who) who.textContent = data.replyTo || '';
      var body = art.querySelector('[data-art-body]');
      if (body) body.textContent = data.reply || '';
      var note = art.querySelector('[data-art-notion]');
      if (note) note.textContent = data.replyNote || '';
    }

    /* ----- one frame ----- */
    function frame(now) {
      running = false;
      var dt = Math.min(64, now - (lastFrame || now)); lastFrame = now;
      yTarget = window.scrollY;
      var rm = reduced();
      var f = rm ? 1 : 1 - Math.pow(1 - 0.58, dt / 16.7);
      ys += (yTarget - ys) * f; if (Math.abs(yTarget - ys) < 0.3) ys = yTarget;
      var into = ys - geo.top;
      var p = clamp(into / geo.range);
      var land = rm ? 1 : clamp(Math.max(0, ys) / (geo.vh * 0.25)); /* settles within the first 25vh of page scroll */
      /* one pass: scrolling back scrubs the same story. It does not rewind into another case. */
      // timeline value for the card
      if (tween) {
        var tu = clamp((now - tween.start) / tween.dur);
        var e = tu < 0.5 ? 2 * tu * tu : 1 - Math.pow(-2 * tu + 2, 2) / 2;
        if (tween.press) { tween.pressU = clamp((now - tween.start) / 420); }
        tCard = tween.from + (tween.to - tween.from) * (tween.press ? clamp((now - tween.start - 380) / (tween.dur - 380)) * 1 : e);
        if (tween.press) { var tp = clamp((now - tween.start - 380) / (tween.dur - 380)); tCard = tween.from + (tween.to - tween.from) * (tp < 0.5 ? 2 * tp * tp : 1 - Math.pow(-2 * tp + 2, 2) / 2); }
        if (tu >= 1) { tCard = tween.to; tween = null; }
      } else if (!manual) {
        var raw = rm ? 1 : p;
        if (!rm && raw > peak) peak = raw;
        tCard = rm ? raw : peak;
      }
      /* Resting still (reduced motion, or the static hero used for the page at rest)
         shows the proposed steps, not the empty card from before the scroll story. */
      if ((rm || document.documentElement.classList.contains('h21-static')) && !manual) tCard = K.tick - 0.001;
      else if (tCard > peak) peak = tCard;
      var t = tCard;
      hero.setAttribute('data-stage', String(stageIdx(t)));
      // camera
      var e2 = easeOut(land);
      var endA = manual ? 0 : smooth(K.closeA, 1, t);
      var rs = geo.rs;
      var rot = (1 - e2) * 24, sc = rs * (0.8 + 0.2 * e2) * (1 - 0.06 * endA), ty = (1 - e2) * geo.drop + endA * (geo.mobile ? 0 : 26);
      set(rig, 'transform', 'translate3d(' + ((1 - e2) * (geo.introDx || 0)).toFixed(1) + 'px,' + ty.toFixed(1) + 'px,0) rotateX(' + rot.toFixed(2) + 'deg) scale(' + sc.toFixed(4) + ')');
      hero.setAttribute('data-land', land.toFixed(3));
      set(copy, 'opacity', clamp(1 - e2 * 1.5).toFixed(3));
      set(copy, 'transform', 'translate3d(0,' + (-e2 * 70).toFixed(1) + 'px,0) scale(' + (1 - e2 * 0.05).toFixed(4) + ')');
      set(copy, 'visibility', e2 > 0.98 ? 'hidden' : 'visible');
      set(endL, 'opacity', endA.toFixed(3));
      set(endL, 'transform', 'translate3d(0,' + ((1 - endA) * 18).toFixed(1) + 'px,0)');
      var bgF = $('.h21-floor', hero); set(bgF, 'opacity', (1 - e2 * 0.7).toFixed(3));
      // light sweep: intro once on load, then scroll-linked across the landing
      var intro = clamp((now - t0 - 500) / 1500);
      var sw = land > 0.01 ? land : intro;
      set(sweep, 'transform', 'translate3d(' + (-110 + 240 * sw).toFixed(1) + '%,0,0) skewX(-18deg)');
      set(sweep, 'opacity', (sw > 0 && sw < 1 ? Math.sin(Math.PI * sw) : 0).toFixed(3));
      // ask underline + ping
      var au = manual || rm ? 1 : smooth(K.askA, K.askB, t);
      set(ask, 'backgroundSize', (au * 100).toFixed(1) + '% 2px');
      setCls(ask, 'is-lit', au > 0.98);
      var c = manual || rm ? 1 : smooth(K.cardA, K.cardB, t);
      var pg = manual || rm ? 0 : smooth(K.pingA, K.pingB, t) * (1 - smooth(K.cardA, K.cardA + 0.05, t));
      set(ping, 'opacity', pg.toFixed(3));
      set(ping, 'transform', 'translate3d(0,' + ((1 - pg) * 6).toFixed(1) + 'px,0) scale(' + (0.92 + 0.08 * pg).toFixed(3) + ')');
      setCls(ping, 'is-on', pg > 0.05);
      // card stays at its side. No rise-to-front, no centering over Gmail.
      var cc = smooth(K.collA, K.collB, t);
      var cardT = 'translate3d(0,' + ((1 - c) * (geo.mobile ? 28 : 56)).toFixed(1) + 'px,0)';
      set(card, 'transform', cardT);
      set(card, 'opacity', clamp(c * 1.5).toFixed(3));
      setCls(card, 'is-out', c > 0.6);
      set(card, 'pointerEvents', c > 0.9 ? '' : 'none');
      var runV = smooth(K.runA - 0.02, K.runA + 0.03, t) * (1 - smooth(K.runB, K.runB + 0.04, t));
      set(dim, 'opacity', (geo.mobile ? runV * 0.28 : runV * 0.18).toFixed(3));
      paintMail(stateAt(t));
      var r = renderCard(t, now);
      var tilesActive = renderTiles(t, now, r.sel);
      // caption
      var si = stageIdx(t);
      capSteps.forEach(function (li, i) { setCls(li, 'on', i === si); setCls(li, 'done', i < si); });
      setHTML(capTxt, T.caps[si]);
      set(cap, 'opacity', (manual ? 1 : smooth(0.08, 0.16, t)).toFixed(3));
      // keep looping while something moves
      var moving = Math.abs(yTarget - ys) > 0.3 || tween || tilesActive || (now - t0 < 2200);
      if (moving && inView) kick();
    }
    function stageIdx(t) { return t < K.pressA ? 0 : t < K.runB ? 1 : t < K.apprA ? 2 : t < K.closeA ? 3 : 4; }
    function kick() { if (!running) { running = true; requestAnimationFrame(frame); } }

    /* ----- click flow (drives the same timeline) ----- */
    function goManual() { if (!manual) { manual = true; data.actions.forEach(function (a, i) { a.on = selectedIdx(tCard).indexOf(i) >= 0; }); } }
    function doIt() {
      var st = stateAt(tCard); if (st !== 'propose') return;
      goManual();
      data.actions.forEach(function (a, i) {
        var cb = list.querySelector('li.act[data-i="' + i + '"] .act-check');
        if (cb) a.on = cb.checked;
      });
      if (!data.actions.some(function (a) { return a.on; })) return;
      var from = Math.max(tCard, K.tick + 0.001); from = Math.min(from, K.pressA);
      var n = data.actions.filter(function (a) { return a.on; }).length;
      tCard = from;
      tween = { from: K.pressB - 0.0001, to: K.runB + 0.012, start: performance.now(), dur: reduced() ? 400 : 900 + n * 950, press: !reduced(), pressU: 0 };
      kick();
    }
    function approveIt() { if (stateAt(tCard) !== 'wait') return; goManual(); tween = { from: K.apprA, to: 1, start: performance.now(), dur: reduced() ? 300 : 2100 }; kick(); }
    function undo() { goManual(); held = false; tween = null; tCard = K.tick + 0.001; peak = tCard; last = {}; kick(); }
    function hold() { var st = stateAt(tCard); if (st !== 'propose' && st !== 'wait') return; goManual(); tween = null; tCard = K.tick + 0.001; peak = tCard; held = true; card.setAttribute('data-state', 'held'); kick(); }
    function unpark() { held = false; card.setAttribute('data-state', ''); kick(); }
    function resetTabs() { $all('.uc-tab', hero).forEach(function (t) { var on = t.getAttribute('data-case') === 'invoice'; t.classList.toggle('on', on); t.setAttribute('aria-selected', on ? 'true' : 'false'); }); }

    card.addEventListener('click', function (e) {
      var tg = e.target; if (!tg || !tg.closest) return;
      if (tg.closest('.approve-btn')) { e.preventDefault(); approveIt(); return; }
      if (tg.closest('.do-halo')) { e.preventDefault(); doIt(); return; }
      if (tg.closest('.chip-x')) { e.preventDefault(); hold(); return; }
      if (tg.closest('.js-undo')) { e.preventDefault(); undo(); return; }
      if (tg.closest('.js-unpark')) { e.preventDefault(); unpark(); return; }
      if (tg.closest('.ss-add-btn')) { e.preventDefault(); addBox.setAttribute('data-open', 'true'); var inp = $('#custom-step-input'); if (inp) inp.focus({ preventScroll: true }); return; }
      if (tg.closest('.act-x')) { e.preventDefault(); var li = tg.closest('li.act'); if (!li) return; var ix = +li.getAttribute('data-i'); goManual(); data.actions.splice(ix, 1); li.remove(); $all('li.act:not(.act-close)', list).forEach(function (row, n) { row.setAttribute('data-i', n); }); kick(); return; }
    });
    list.addEventListener('change', function (e) {
      if (!e.target.classList.contains('act-check')) return;
      var li = e.target.closest('li.act'); var i = +li.getAttribute('data-i');
      goManual(); data.actions[i].on = e.target.checked; if (tCard < K.rowsB) tCard = K.tick + 0.001; if (tCard > peak) peak = tCard; last = {}; kick();
    });
    var inp = $('#custom-step-input');
    if (inp) inp.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { addBox.setAttribute('data-open', 'false'); return; }
      if (e.key !== 'Enter') return;
      e.preventDefault(); var txt = inp.value.trim(); if (!txt || stateAt(tCard) !== 'propose') return;
      goManual();
      var a = classifyStep(txt);
      a.text = esc(txt); a.result = esc(txt); a.done = esc(txt); a.tile = esc(txt);
      data.actions.push(a);
      var tmp = document.createElement('ol'); tmp.innerHTML = rowHTML(a, data.actions.length - 1);
      list.insertBefore(tmp.firstChild, list.querySelector('.act-close'));
      var brand = window.BRAND && window.BRAND[a.tool];
      tilesBox.insertAdjacentHTML('beforeend', '<div class="h21-tile" data-k="' + (data.actions.length - 1) + '" data-tool="' + a.tool + '"><span class="h21-tile-ic' + (brand ? ' is-brand' : '') + '">' + (brand || glyph(a.tool)) + '</span><span class="h21-tile-tx"><b><bdi>' + esc(a.app) + '</bdi></b><em>' + esc(txt) + '</em></span><i class="h21-tile-ok" aria-hidden="true"></i></div>');
      tiles = $all('.h21-tile', tilesBox);
      inp.value = ''; kick();
    });
    $all('.uc-tab', hero).forEach(function (tab) {
      tab.addEventListener('click', function () {
        $all('.uc-tab', hero).forEach(function (x) { x.classList.toggle('on', x === tab); x.setAttribute('aria-selected', x === tab ? 'true' : 'false'); });
        manual = true; held = false; tween = null;
        build(tab.getAttribute('data-case'));
        tCard = K.tick + 0.001; peak = tCard;
        card.classList.remove('case-flash'); void card.offsetWidth; card.classList.add('case-flash');
        kick();
      });
    });

    window.addEventListener('scroll', kick, { passive: true });
    window.addEventListener('resize', function () { measure(); }, { passive: true });
    if (MQ_REDUCE && MQ_REDUCE.addEventListener) MQ_REDUCE.addEventListener('change', function () { document.documentElement.classList.toggle('h21-static', reduced()); measure(); });
    document.documentElement.classList.toggle('h21-static', reduced());
    if ('IntersectionObserver' in window) new IntersectionObserver(function (en) { inView = en[0].isIntersecting; if (inView) kick(); }, { rootMargin: '200px' }).observe(hero);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
    window.addEventListener('load', measure);
    document.addEventListener('glance:theme', function () { last = {}; kick(); });
    build('launch');

    return {
      state: function () { return { t: tCard, state: stateAt(tCard), manual: manual, land: +hero.getAttribute('data-land'), stage: stageIdx(tCard), rs: geo.rs, range: geo.range, top: geo.top }; },
      rebuild: function () { build(caseId); },
      measure: measure, K: K
    };
  }

  /* ---------------- Slack demo ---------------- */
  var demos = {};
  var waRoot = document.getElementById('demo-whatsapp');
  if (waRoot) {
    var waL = { will: T_WA.will, doing: T_WA.doing, prepared: T_WA.prepared, done: T_WA.done, afterApprove: '', suggested: T_WA.suggested, chip: T_WA.chip, none: T_WA.none, verifying: function (a) { return (I18.T && I18.T[LANG] && I18.T[LANG].verifying) ? I18.T[LANG].verifying(a) : (HE ? 'מאמת ב־' + a + '…' : 'Verifying in ' + a + '…'); } };
    function paintWaThread(pack, keepAsk) {
      var ask = document.getElementById('wa-ask-text');
      var preIn = document.getElementById('wa-pre-in');
      var preOut = document.getElementById('wa-pre-out');
      var preview = document.getElementById('wa-list-preview');
      var draft = document.getElementById('wa-draft-text');
      var sent = document.getElementById('wa-sent-text');
      var intent = document.getElementById('wa-intent');
      if (ask && !keepAsk) ask.textContent = pack.ask;
      if (preIn) preIn.querySelector('p').textContent = pack.preIn;
      if (preOut) preOut.querySelector('p').textContent = pack.preOut;
      if (preview) preview.textContent = pack.ask;
      if (draft) draft.textContent = pack.draft;
      if (sent) sent.textContent = pack.draft;
      if (intent) intent.textContent = pack.intent;
      ['wa-draft-file', 'wa-sent-file'].forEach(function (id) {
        var el = document.getElementById(id); if (!el) return;
        el.hidden = !pack.file;
        var b = el.querySelector('b'); if (b && pack.file) b.textContent = pack.file;
      });
    }
    demos.whatsapp = makeCloser(waRoot, WA, { L: waL, stepMs: 900, direct: true });
    function applyWa(pack, keepAsk) {
      WA = waData(pack);
      if (window.__glance) window.__glance.wa = WA;
      paintWaThread(pack, keepAsk);
      demos.whatsapp.render(WA);
    }
    var waInput = document.getElementById('wa-compose');
    var waThinkTimer = null;
    function sendWa(text) {
      text = String(text || '').trim();
      if (!text || demos.whatsapp.state() === 'working') return;
      var live = document.getElementById('wa-live');
      if (live) {
        var bubble = document.createElement('div');
        bubble.className = 'wa21-msg bubble in tail wa21-just';
        var now = new Date();
        var stamp = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
        bubble.innerHTML = '<p></p><span class="wa21-time"></span>';
        bubble.querySelector('p').textContent = text;
        bubble.querySelector('.wa21-time').textContent = stamp;
        live.appendChild(bubble);
      }
      var preview = document.getElementById('wa-list-preview');
      if (preview) preview.textContent = text;
      if (waInput) waInput.value = '';
      var card = document.getElementById('wa-glance');
      var think = card && card.querySelector('.wa-think');
      if (card) card.classList.add('is-thinking');
      if (think) think.hidden = false;
      clearTimeout(waThinkTimer);
      waThinkTimer = setTimeout(function () {
        if (card) card.classList.remove('is-thinking');
        if (think) think.hidden = true;
        applyWa(waFromAsk(text), true);
      }, 1000);
    }
    $all('#wa-suggests button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var i = +btn.getAttribute('data-i');
        if (WA_ASKS[i]) sendWa(WA_ASKS[i].ask);
      });
    });
    var waSend = document.getElementById('wa-send');
    if (waSend) waSend.addEventListener('click', function () { sendWa(waInput && waInput.value); });
    if (waInput) waInput.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      sendWa(waInput.value);
    });
    paintWaThread(WA_ASKS[0]);
  }

  /* ---------------- viewer name ("See it with my name") ---------------- */
  function initials(n) { var p = String(n).trim().split(/\s+/); return ((p[0] || '')[0] || '').toUpperCase() + ((p[1] || '')[0] || '').toUpperCase(); }
  function applyViewerEverywhere() {
    $all('.viewer-name').forEach(function (el) { el.textContent = viewerName; });
    $all('.viewer-initials').forEach(function (el) { el.textContent = initials(viewerName) || 'S'; });
    $all('.viewer-first-name').forEach(function (el) { el.textContent = String(viewerName).split(/\s+/)[0]; });
    if (H) H.rebuild();
    Object.keys(demos).forEach(function (k) { demos[k].render(); });
    document.dispatchEvent(new CustomEvent('glance:viewer', { detail: viewerName }));
  }
  function syncCaptureUI() {
    var card = document.getElementById('capture-card'), hint = document.getElementById('capture-hint');
    if (viewerName !== VIEWER_DEFAULT) {
      if (card) card.hidden = true; document.body.classList.remove('capture-open');
      if (hint) {
        hint.hidden = false;
        hint.innerHTML = ((I18.STR && I18.STR[LANG] && I18.STR[LANG].preview) || (HE ? 'מוצג עבור <b>' : 'Previewing as <b>')) + esc(viewerName) + '</b> · <button type="button" class="name-reset-inline" id="btn-reset-viewer">' + ((I18.STR && I18.STR[LANG] && I18.STR[LANG].backTo) || (HE ? 'חזרה לסאלי' : 'Back to Sali Sapan')) + '</button>';
        var r = document.getElementById('btn-reset-viewer'); if (r) r.addEventListener('click', function () { setViewer(VIEWER_DEFAULT); });
      }
    } else if (hint) { hint.hidden = true; hint.textContent = ''; }
  }
  function setViewer(next) {
    viewerName = (next || VIEWER_DEFAULT).trim().slice(0, 40) || VIEWER_DEFAULT;
    try { if (viewerName === VIEWER_DEFAULT) localStorage.removeItem(VIEWER_LS_KEY); else localStorage.setItem(VIEWER_LS_KEY, viewerName); } catch (e) {}
    applyViewerEverywhere(); syncCaptureUI();
  }
  try {
    var fromUrl = (new URLSearchParams(location.search).get('name') || '').trim();
    if (fromUrl) { viewerName = fromUrl.slice(0, 40); localStorage.setItem(VIEWER_LS_KEY, viewerName); }
    else { var stored = (localStorage.getItem(VIEWER_LS_KEY) || '').trim(); if (stored) viewerName = stored.slice(0, 40); }
  } catch (e) { viewerName = VIEWER_DEFAULT; }
  var bb = document.getElementById('btn-back-demos');
  if (bb) bb.addEventListener('click', function (e) { e.preventDefault(); var s = document.getElementById('surfaces'); if (s) s.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' }); });

  Object.keys(LIVING).forEach(function (k) { var im = new Image(); im.src = LIVING[k]; });
  if (viewerName !== VIEWER_DEFAULT) applyViewerEverywhere();
  syncCaptureUI();
  window.__glance = { cases: CASES, wa: WA, demos: demos, hero: H };
})();
