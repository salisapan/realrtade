/* Corner v21 — Meet journey: one intent heard on a Google Meet call → Glance prepares it in
   Docs → Drive → Calendar → Gmail (the stage visibly switches tools, ~1.8s each) → back to Meet,
   Prepared · nothing sent → Approve → Closed + receipt + Undo. Autoplays once in view (stops at
   Prepared: Glance never approves for you). Replay control. Light + Dark. */
(function () {
  'use strict';
  var kit = window.__glanceKit; if (!kit) return;
  var root = document.getElementById('mj'); if (!root) return;
  var HE = kit.HE;
  var LANG = (document.documentElement.lang || '').slice(0, 2) || 'en';
  var I18 = window.GLANCE_I18N || {};
  function $(s, r) { return (r || document).querySelector(s); }
  function $all(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

  var DATA = (I18.MEET && I18.MEET[LANG]) || (HE ? {
    intent: 'נועה צריכה את ההצעה ל־<bdi>Riverview</bdi> עד יום ראשון.',
    actions: [
      { tool: 'docs', app: 'Docs', text: 'ליצור הצעת מחיר', out: '<bdi>₪48,000</bdi>', run: 'יוצר הצעה…', runSub: '', result: 'מוכנה', done: 'נוצרה' },
      { tool: 'slack', app: 'Slack', text: 'טיוטה ב־<bdi>#riverview</bdi>', out: 'לא נשלח', run: 'מכין טיוטה…', runSub: '', result: 'מוכנה', done: 'נשלחה' },
      { tool: 'morning', app: 'Morning', text: 'הצעת מחיר <bdi>Q-2208</bdi>', out: 'לא הופקה', run: 'פותח הצעה…', runSub: '', result: 'מוכנה', done: 'הופקה' },
      { tool: 'outlook', app: 'Outlook', text: 'טיוטה לנועה', out: 'לא נשלח', run: 'מכין טיוטה…', runSub: '', result: 'מוכנה', done: 'נשלחה' }
    ],
    close: { text: 'לסגור כשההצעה אצל נועה', done: 'נסגר · ההצעה אצל נועה' },
    receipt: '<b>נסגר</b> · ההצעה אצל נועה · <bdi>Slack</bdi> · <bdi>Morning</bdi> · <bdi>Outlook</bdi> · <em class="js-undo">ביטול</em>',
    pill: { docs: ['Docs · יוצר הצעה…', 'Docs · מוכן ✓'], slack: ['Slack · מכין טיוטה…', 'Slack · מוכן ✓'], morning: ['Morning · פותח הצעה…', 'Morning · מוכן ✓'], outlook: ['Outlook · מכין טיוטה…', 'Outlook · מוכן ✓'] },
    L: { will: 'Glance יבצע', doing: 'Glance עובד', prepared: 'מוכן · שום דבר לא נשלח', done: 'בוצע', afterApprove: '', suggested: 'מוצע', verifying: function (a) { return 'מאמת ב־' + a + '…'; } }
  } : {
    intent: 'Nora needs the Riverview proposal by Sunday.',
    actions: [
      { tool: 'docs', app: 'Docs', text: 'Create the proposal', out: '€48,000', run: 'Creating…', runSub: '', result: 'Ready', done: 'Created' },
      { tool: 'slack', app: 'Slack', text: 'Draft in #riverview', out: 'Not sent', run: 'Drafting…', runSub: '', result: 'Ready', done: 'Sent' },
      { tool: 'morning', app: 'Xero', text: 'Quote Q-2208', out: 'Not issued', run: 'Opening…', runSub: '', result: 'Ready', done: 'Issued' },
      { tool: 'outlook', app: 'Outlook', text: 'Draft to Nora', out: 'Not sent', run: 'Drafting…', runSub: '', result: 'Ready', done: 'Sent' }
    ],
    close: { text: 'Close once Nora has the proposal', done: 'Closed · Nora has the proposal' },
    receipt: '<b>Closed</b> · proposal with Nora · Slack · Xero · Outlook · <em class="js-undo">Undo</em>',
    pill: { docs: ['Docs · Creating…', 'Docs · Ready ✓'], slack: ['Slack · Drafting…', 'Slack · Ready ✓'], morning: ['Xero · Opening…', 'Xero · Ready ✓'], outlook: ['Outlook · Drafting…', 'Outlook · Ready ✓'] },
    L: null
  });
  var L = DATA.L || { will: kit.T.will, doing: kit.T.doing, prepared: kit.T.prepared, done: kit.T.done, afterApprove: kit.T.afterApprove, suggested: kit.T.suggested, verifying: kit.T.verifying };
  L.afterApprove = ''; L.chip = function (n) { return kit.T.chip(n, [], 0); }; L.none = kit.T.none;

  var STEP = 1800, ORDER = ['docs', 'slack', 'morning', 'outlook'];
  var screens = {}; $all('.mj-screen', root).forEach(function (s) { screens[s.getAttribute('data-screen')] = s; });
  var rail = {}; $all('.mj-rail li', root).forEach(function (li) { rail[li.getAttribute('data-k')] = li; });
  var pill = $('.mj-pill', root), pillT = $('.mj-pill-t', root), pillIco = $('.mj-pill .living-ico', root);
  var cardStage = document.getElementById('demo-meet');
  var timers = [], played = false;
  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
  function clearT() { timers.forEach(clearTimeout); timers = []; }

  function show(name) {
    var cur = root.getAttribute('data-step');
    Object.keys(screens).forEach(function (k) {
      var s = screens[k];
      s.classList.remove('leaving');
      if (k === cur && k !== name) s.classList.add('leaving');
      s.classList.toggle('on', k === name);
      if (k === name && k !== 'meet') { s.classList.remove('play'); void s.offsetWidth; s.classList.add('play'); }
    });
    root.setAttribute('data-step', name);
    if (name === 'docs') typeSummary();
    later(function () { $all('.mj-screen.leaving', root).forEach(function (s) { s.classList.remove('leaving'); }); }, 700);
    Object.keys(rail).forEach(function (k) { rail[k].classList.toggle('on', k === name); });
  }
  function setPill(txt, done) { pillT.textContent = txt; pill.classList.toggle('is-done', !!done); pillIco.src = done ? kit.LIVING.keyDone : kit.LIVING.thinking; }
  var summaryFull = '';
  function typeSummary() {
    var el = document.getElementById('meet-summary');
    if (!el) return;
    if (!summaryFull) summaryFull = el.textContent;
    if (kit.reduced()) { el.textContent = summaryFull; return; }
    el.textContent = '';
    var i = 0;
    (function step() {
      if (root.getAttribute('data-step') !== 'docs') return;
      i += 1;
      el.textContent = summaryFull.slice(0, i);
      if (i < summaryFull.length) later(step, 18);
    })();
  }
  function resetRail() { Object.keys(rail).forEach(function (k) { rail[k].classList.remove('done'); }); }

  var closer = kit.makeCloser(cardStage, DATA, {
    L: L, stepMs: STEP, direct: true,
    onDoIt: function () { root.setAttribute('data-phase', 'run'); resetRail(); },
    onStep: function (k) { var key = ORDER[k] || 'docs'; show(key); pill.classList.add('on'); setPill(DATA.pill[key][0], false); },
    onStepDone: function (k) { var key = ORDER[k] || 'docs'; rail[key].classList.add('done'); setPill(DATA.pill[key][1], true); },
    onRunEnd: function (cb) {
      later(function () { pill.classList.remove('on'); show('meet'); root.setAttribute('data-phase', 'back'); later(cb, kit.reduced() ? 0 : 380); }, kit.reduced() ? 0 : 260);
    },
    onState: function (s) {
      root.setAttribute('data-state', s);
      if (s === 'wait' || s === 'settled') root.setAttribute('data-ran', '1');
      var replay = document.getElementById('mj-replay');
      if (replay) replay.hidden = root.getAttribute('data-ran') !== '1';
      if (s === 'propose') { root.setAttribute('data-phase', root.getAttribute('data-phase') === 'intro' ? 'intro' : 'ready'); }
    },
    onUndo: function () { reset(true); }
  });

  function reset(keepCard) {
    clearT(); pill.classList.remove('on', 'is-done'); resetRail();
    Object.keys(screens).forEach(function (k) { screens[k].classList.remove('play', 'leaving'); });
    show('meet');
    if (!keepCard && closer.state() !== 'propose') closer.undo();
    root.setAttribute('data-phase', keepCard ? 'ready' : 'intro');
    $('.mt', root).classList.remove('cc-on', 'hl-on');
  }
  function intro(autoDo) {
    reset(false);
    var mt = $('.mt', root);
    var R = kit.reduced();
    later(function () { mt.classList.add('cc-on'); }, R ? 0 : 250);
    later(function () { mt.classList.add('hl-on'); }, R ? 0 : 1650);
    later(function () { root.setAttribute('data-phase', 'ready'); }, R ? 0 : 2100);
    if (autoDo && !R) later(function () { if (closer.state() === 'propose') { var b = cardStage.querySelector('.demo-doit'); b.classList.add('is-pressing'); later(function () { b.classList.remove('is-pressing'); closer.doIt(); root.setAttribute('data-phase', 'run'); resetRail(); }, 260); } }, 3500);
  }
  // clicking Do It before the intro finished still works
  cardStage.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('.do-halo')) { $('.mt', root).classList.add('cc-on', 'hl-on'); } }, true);
  $('#mj-replay').addEventListener('click', function () { intro(true); });
  var overlayUndo = $('.mj-close .js-undo', root);
  if (overlayUndo) overlayUndo.addEventListener('click', function (e) { e.preventDefault(); closer.undo(); });

  // canvas: one fixed design size, scaled to the frame (narrow design on phones so type stays legible)
  var vp = $('.mj-viewport', root), cv = $('.mj-canvas', root);
  function fit() {
    var w = vp.clientWidth || 1180, narrow = window.innerWidth <= 760;
    var W = narrow ? 820 : 1180, H = narrow ? 620 : 640;
    root.classList.toggle('mj-narrow', narrow);
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    var sc = w / W; vp.style.setProperty('--mj-s', sc.toFixed(4)); vp.style.height = Math.round(H * sc) + 'px';
  }
  fit(); window.addEventListener('resize', fit);
  // caption words appear one by one
  $all('.mt-w', root).forEach(function (w, i) { w.style.transitionDelay = (i * 120) + 'ms'; });
  // static start for screenshots / no JS autoplay yet: captions shown, card visible
  $('.mt', root).classList.add('cc-on', 'hl-on'); root.setAttribute('data-phase', 'ready');
  if ('IntersectionObserver' in window && !kit.reduced()) {
    var io = new IntersectionObserver(function (en) { if (en[0].isIntersecting && !played) { played = true; io.disconnect(); intro(true); } }, { threshold: 0.45 });
    io.observe(root);
  }
  window.__meet = { closer: closer, intro: intro, reset: reset, played: function () { return played; }, step: function () { return root.getAttribute('data-step'); } };
})();
