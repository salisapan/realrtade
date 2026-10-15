/* Corner v21 — Meet journey: one intent heard on a Google Meet call → Glance prepares it in
   Docs → Drive → Calendar → Gmail (the stage visibly switches tools, ~1.8s each) → back to Meet,
   Prepared · nothing sent → Approve → Closed + receipt + Undo. Autoplays once in view (stops at
   Prepared: Glance never approves for you). Replay control. Light + Dark. */
(function () {
  'use strict';
  var kit = window.__glanceKit; if (!kit) return;
  var root = document.getElementById('mj'); if (!root) return;
  var HE = kit.HE;
  function $(s, r) { return (r || document).querySelector(s); }
  function $all(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

  var DATA = HE ? {
    intent: 'נועה צריכה את ההצעה ל־<bdi>Riverview</bdi> עד יום ראשון.',
    actions: [
      { tool: 'docs', app: 'Docs', text: 'ליצור הצעת מחיר מהתבנית', out: '<bdi>Riverview Studio</bdi> · <bdi>₪48,000</bdi>', run: 'יוצר את ההצעה…', runSub: 'תבנית הצעת מחיר', result: 'הצעת <bdi>Riverview</bdi> · <bdi>₪48,000</bdi> · מוכנה', done: 'הצעת <bdi>Riverview</bdi> · <bdi>₪48,000</bdi> · נוצרה' },
      { tool: 'slack', app: 'Slack', text: 'טיוטה ב־<bdi>#riverview</bdi> עם ההצעה', out: 'הקובץ מצורף · לא נשלח', run: 'מכין הודעה ב־Slack…', runSub: '<bdi>#riverview</bdi>', result: 'טיוטה ב־<bdi>#riverview</bdi> · הקובץ מצורף', done: 'נשלח ב־<bdi>#riverview</bdi> · ההצעה מצורפת' },
      { tool: 'morning', app: 'Morning', text: 'הצעת מחיר <bdi>Q-2208</bdi>', out: '<bdi>₪48,000</bdi> · לא הופקה', run: 'פותח הצעת מחיר…', runSub: '<bdi>Q-2208</bdi>', result: 'הצעה <bdi>Q-2208</bdi> · מוכנה', done: 'הצעה <bdi>Q-2208</bdi> · הופקה' },
      { tool: 'outlook', app: 'Outlook', text: 'טיוטה לנועה עם ההצעה מצורפת', out: 'ההצעה מצורפת · לא נשלח', run: 'מכין טיוטה…', runSub: 'אל נועה לוי', result: 'טיוטה לנועה · ההצעה מצורפת', done: 'נשלח לנועה · ההצעה מצורפת' }
    ],
    close: { text: 'לסגור כשההצעה אצל נועה', done: 'הלולאה נסגרה · ההצעה אצל נועה' },
    receipt: '<b>נסגר</b> · ההצעה אצל נועה · <bdi>Slack</bdi> · <bdi>Morning</bdi> · <bdi>Outlook</bdi> · <em class="js-undo">ביטול</em>',
    pill: { docs: ['Docs · יוצר את ההצעה…', 'Docs · מוכן ✓'], slack: ['Slack · מכין הודעה…', 'Slack · נשלח ✓'], morning: ['Morning · פותח הצעת מחיר…', 'Morning · הופקה ✓'], outlook: ['Outlook · מכין טיוטה…', 'Outlook · נשלח ✓'] },
    L: { will: 'Glance יבצע', doing: 'Glance עובד', prepared: 'מוכן · שום דבר לא נשלח', done: 'בוצע', afterApprove: 'אחרי אישור', suggested: 'מוצע', verifying: function (a) { return 'מאמת ב־' + a + '…'; } }
  } : {
    intent: 'Noa needs the Riverview proposal by Sunday.',
    actions: [
      { tool: 'docs', app: 'Docs', text: 'Create proposal from template', out: 'Riverview Studio · ₪48,000', run: 'Creating the proposal…', runSub: 'Client proposal template', result: 'Riverview proposal · ₪48,000 · Ready', done: 'Riverview proposal · ₪48,000 · Created' },
      { tool: 'slack', app: 'Slack', text: 'Draft in #riverview with the proposal', out: 'PDF attached · not sent', run: 'Drafting the Slack note…', runSub: '#riverview', result: '#riverview draft · PDF attached', done: 'Sent in #riverview · proposal attached' },
      { tool: 'morning', app: 'Morning', text: 'Open quote Q-2208', out: '₪48,000 · not issued', run: 'Opening the quote…', runSub: 'Q-2208 · Riverview Studio', result: 'Quote Q-2208 · ready', done: 'Quote Q-2208 · issued' },
      { tool: 'outlook', app: 'Outlook', text: 'Draft to Noa with the proposal attached', out: 'Proposal attached · not sent', run: 'Drafting in Outlook…', runSub: 'To Noa Levi', result: 'Outlook draft · proposal attached', done: 'Sent to Noa · proposal attached' }
    ],
    close: { text: 'Close once Noa has the proposal', done: 'Loop closed · Noa has the proposal' },
    receipt: '<b>Closed</b> · proposal with Noa · Slack · Morning · Outlook · <em class="js-undo">Undo</em>',
    pill: { docs: ['Docs · Creating proposal…', 'Docs · Done ✓'], slack: ['Slack · Drafting #riverview…', 'Slack · Sent ✓'], morning: ['Morning · Opening quote…', 'Morning · Issued ✓'], outlook: ['Outlook · Drafting to Noa…', 'Outlook · Sent ✓'] },
    L: null
  };
  var L = DATA.L || { will: kit.T.will, doing: kit.T.doing, prepared: kit.T.prepared, done: kit.T.done, afterApprove: kit.T.afterApprove, suggested: kit.T.suggested, verifying: kit.T.verifying };
  L.chip = kit.T.chip; L.none = kit.T.none;

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
    L: L, stepMs: STEP,
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
