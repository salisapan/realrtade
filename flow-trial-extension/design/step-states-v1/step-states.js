/* Glance · Step states v1 — spec-sheet renderer.
   Row markup = corner-v20/app.js rowHTML()/closeHTML() (act · act-row · act-check · act-box · act-glyph · act-body · act-text · act-out · act-res · act-tag),
   extended with: act-suggested · act-added · act-manual · act-multi (file pills) · per-step ProofOfClose states (st-*).
   Vanilla JS · file:// friendly · no network. */
(function () {
  'use strict';

  /* ✎ manual glyph (Material "edit", Apache-2.0) — added beside the v20 set */
  if (window.GLYPHS && !window.GLYPHS.manual) window.GLYPHS.manual = { label: 'Manual', d: 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z' };
  function glyph(id) { return window.glyphSVG ? window.glyphSVG(id) : ''; }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  var OK = '<i class="ss-ok" aria-label="verified">✓</i>';
  var DOIT = '<button type="button" class="do-halo" aria-label="Do It"><img class="chip-do" src="do-it.png" alt="Do It"><span class="doit-dark" role="img" aria-label="Do It">[Do It]</span></button>';

  /* ---------------- copy ---------------- */
  var EN = {
    brand: 'Glance', intentLabel: 'Detected intent', will: 'Glance will', prepared: 'Prepared · nothing sent', done: 'Done',
    hold: 'Hold It', add: '+ Add a step', addPh: 'Type a step…', enter: 'Enter',
    count: function (n, tools, sugg) {
      return '<b>+ Glance</b> can close this in <b class="file">' + n + ' step' + (n === 1 ? '' : 's') + '</b>' +
        (tools.length ? ' · ' + tools.map(esc).join(' · ') : '') + (sugg ? '<span class="chip-sugg"> · +' + sugg + ' suggested</span>' : '');
    },
    none: '<b>+ Glance</b> · tick at least one step',
  };
  var HE = {
    brand: 'Glance', intentLabel: 'כוונה שזוהתה', will: 'Glance יבצע', prepared: 'מוכן · שום דבר לא נשלח', done: 'בוצע',
    hold: 'השהה', add: '+ הוסף צעד', addPh: 'הקלד צעד…', enter: 'Enter',
    count: function (n, tools, sugg) {
      return '<b><bdi>+ Glance</bdi></b> יכול לסגור את זה ב-<b class="file">' + n + ' צעדים</b>' +
        (sugg ? '<span class="chip-sugg"> · <bdi dir="ltr">+' + sugg + '</bdi> מוצע</span>' : '');
    },
    none: '<b><bdi>+ Glance</bdi></b> · סמן לפחות צעד אחד',
  };

  /* ---------------- data ---------------- */
  function INV() {
    return [
      { tool: 'morning', app: 'Morning', text: 'Create INV-4821', out: '₪12,400 + VAT · due Oct 21', res: 'INV-4821 · ₪12,400 + VAT · Ready', done: 'INV-4821 · ₪12,400 + VAT · Issued' },
      { tool: 'gmail', app: 'Gmail', text: 'Draft reply to Noa', out: 'Invoice attached · not sent', res: 'Reply to Noa drafted · INV-4821.pdf attached', done: 'Reply sent to Noa · invoice attached' },
      { tool: 'calendar', app: 'Calendar', text: 'Payment check · Oct 21 09:00', out: 'Reminder for you only', res: 'Payment check · Tue Oct 21 · 09:00', done: 'Payment check set · Oct 21' },
    ];
  }
  function SUGG(checked) { return { kind: 'suggested', tool: 'drive', app: 'Drive', text: 'Save contract.pdf to /Clients/Noa', out: 'From Noa’s email · 2.1 MB', tag: 'Suggested', checked: !!checked }; }
  var CLOSE = { kind: 'close', text: 'Close once the invoice reaches Noa', done: 'Loop closed · Noa has INV-4821 · check set for Oct 21', tag: 'after Approve' };
  var FILES = [
    { n: 'contract.pdf', on: true }, { n: 'brief-v3.pdf', on: true }, { n: 'moodboard.png', on: false },
    { n: 'notes.docx', on: false }, { n: 'budget.xlsx', on: false },
  ];
  function files(extraOn) { return FILES.map(function (f) { return { n: f.n, on: f.on || (extraOn || []).indexOf(f.n) >= 0 }; }); }
  function cropped(rows) { rows[0].crop = rows[1].crop = true; return rows; }
  var ADDED = { kind: 'added', tool: 'todo', app: 'To Do', text: 'Call Noa · Thu Oct 9', out: 'Reminder for you', tag: 'Added', checked: true };
  var MANUAL = { kind: 'manual', text: 'Print the contract', tag: 'Manual · for you' };

  var HE_ROWS = [
    { tool: 'morning', app: 'Morning', text: 'להפיק חשבונית <bdi>INV-4821</bdi>', out: '<bdi>₪12,400</bdi> + מע״מ · לתשלום עד 21.10' },
    { tool: 'gmail', app: 'Gmail', text: 'טיוטת תשובה לנועה', out: 'החשבונית מצורפת, לא נשלחת' },
    { tool: 'calendar', app: 'Calendar', text: 'בדיקת תשלום 21.10 09:00', out: 'תזכורת רק לך' },
    { kind: 'suggested', tool: 'drive', app: 'Drive', text: 'לשמור את <bdi>contract.pdf</bdi> בתיקיית נועה', out: 'מהמייל של נועה · <bdi>2.1 MB</bdi>', tag: 'מוצע', checked: false },
    { kind: 'close', text: 'לסגור את הלולאה כשהחשבונית מגיעה לנועה', tag: 'אחרי אישור' },
  ];

  /* chip modes: count (live recount) · ask (the chip is the question) · files (question recounts from pills) */
  var CARDS = {
    f1: { intent: 'Invoice for Noa · October', rows: INV().concat([SUGG(false), CLOSE]), add: 'closed', chip: { mode: 'count' } },
    f1b: { intent: 'Invoice for Noa · October', rows: INV().concat([SUGG(true), CLOSE]), add: 'closed', chip: { mode: 'count' } },
    f2chip: { bare: true, chip: { mode: 'ask', q: 'Save <bdi>contract.pdf</bdi> to OneDrive?', icon: 'onedrive' } },
    f2: { intent: 'Attachment · contract.pdf · 2.1 MB', run: 'save',
      rows: [{ tool: 'onedrive', app: 'OneDrive', text: 'Save contract.pdf to /Clients/Noa', out: '2.1 MB · from Noa Klein', checked: true, done: '/Clients/Noa/contract.pdf · Saved ' + OK }],
      chip: { mode: 'ask', q: 'Save <bdi>contract.pdf</bdi> to OneDrive?', noHold: true } },
    f2done: { intent: 'Attachment · contract.pdf · 2.1 MB', state: 'settled', label: 'done', icon: 'done',
      rows: [{ tool: 'onedrive', app: 'OneDrive', checked: true, done: '/Clients/Noa/contract.pdf · Saved ' + OK, undo: true, st: 'is-done' }] },
    f3: { intent: 'Attachments · 5 files · 8.4 MB', rows: [{ kind: 'multi', tool: 'drive', app: 'Drive', out: '/Clients/Noa', checked: true, files: files() }], chip: { mode: 'files', noHold: true } },
    f3x: { intent: 'Attachments · 5 files · 8.4 MB', rows: [{ kind: 'multi', tool: 'drive', app: 'Drive', out: '/Clients/Noa', checked: true, files: files(['budget.xlsx']), expanded: true }], chip: { mode: 'files', noHold: true } },
    f4a: { crop: true, rows: cropped(INV()).concat([CLOSE]), add: 'closed', chip: { mode: 'count' } },
    f4b: { crop: true, rows: cropped(INV()).concat([CLOSE]), add: 'open', addValue: 'remind me to call Noa Thursday', chip: { mode: 'count' } },
    f4c: { crop: true, rows: cropped(INV()).concat([ADDED, CLOSE]), add: 'closed', chip: { mode: 'count' } },
    f4d: { crop: true, rows: cropped(INV()).concat([MANUAL, CLOSE]), add: 'closed', chip: { mode: 'count' } },
    'f4d-receipt': { bare: true, state: 'settled', receipt: ['<b>Closed</b> · INV-4821 issued · reply sent to Noa · <em class="js-undo">Undo</em>'], manualLeft: 1 },
    f5: { seq: true },
    f5b: { intent: 'Invoice for Noa · October', state: 'wait', label: 'prepared',
      rows: INV().map(function (r) { r.st = 'is-done'; r.checked = true; return r; }).concat([
        (function () { var s = SUGG(true); s.st = 'st-failed'; s.out = 'Couldn’t confirm · <em class="ss-retry">Retry</em>'; return s; })(),
        (function () { var c = Object.assign({}, CLOSE); c.st = 'is-ready'; return c; })()]),
      approve: { title: 'Still open · waiting for your approval', sub: 'Prepared ≠ closed · 3 of 4 verified · Drive left out' } },
    'f5b-done': { intent: 'Invoice for Noa · October', state: 'settled', label: 'done', icon: 'done', badge: 'Closed',
      rows: INV().map(function (r) { r.st = 'is-done'; r.checked = true; r.res = r.done; return r; }).concat([
        (function () { var s = SUGG(true); s.st = 'is-skipped'; return s; })(),
        (function () { var c = Object.assign({}, CLOSE); c.st = 'is-done is-final'; return c; })()]),
      receipt: ['<b>Closed</b> · INV-4821 issued · reply sent to Noa · <em class="js-undo">Undo</em>'] },
    f6: { he: true, intent: 'חשבונית לנועה · אוקטובר', rows: HE_ROWS, add: 'closed', chip: { mode: 'count' } },
  };

  /* ---------------- row templates (v20 app.js rowHTML / closeHTML, extended) ---------------- */
  function appB(app) { return '<b class="act-app"><bdi>' + esc(app) + '</bdi></b>'; }
  function pillsHTML(a) {
    var vis = a.expanded ? a.files : a.files.slice(0, 3);
    var more = a.files.length - 3;
    return '<span class="act-files" role="group" aria-label="Attachments">' +
      vis.map(function (f, i) { return '<button type="button" class="ss-pill" data-f="' + i + '" aria-pressed="' + f.on + '"><span class="ss-pill-ck" aria-hidden="true"></span>' + esc(f.n) + '</button>'; }).join('') +
      (a.files.length > 3 ? (a.expanded ? '<button type="button" class="ss-pill ss-pill-more" data-less="1">Less</button>' : '<button type="button" class="ss-pill ss-pill-more" data-more="1">+' + more + '</button>') : '') +
      '</span>';
  }
  function rowHTML(a, i, L) {
    if (a.kind === 'close') return closeHTML(a);
    if (a.kind === 'manual') {
      return '<li class="act act-manual">' +
        '<span class="act-row">' +
          '<span class="act-box act-none" aria-hidden="true"></span>' +
          '<span class="act-glyph" data-glyph="manual">' + glyph('manual') + '</span>' +
          '<span class="act-body"><span class="act-text">' + a.text + '</span></span>' +
          '<span class="act-tag">' + a.tag + '</span>' +
        '</span></li>';
    }
    var cls = 'act' + (a.kind ? ' act-' + a.kind : '') + (a.crop ? ' ss-crop-row' : '') + (a.st ? ' ' + a.st : '') + (a.expanded ? ' is-expanded' : '');
    var text = a.kind === 'multi' ? 'Save <b class="ss-n">' + a.files.filter(function (f) { return f.on; }).length + '</b> of ' + a.files.length + ' attachments' : a.text;
    var res = a.res || a.done || '';
    var multi = a.kind === 'multi';
    return '<li class="' + cls + '" data-i="' + i + '" data-app="' + esc(a.app) + '">' +
      (multi ? '<div class="act-row">' : '<label class="act-row">') +
        (multi ? '<label class="ss-contents">' : '') +
        '<input type="checkbox" class="act-check"' + (a.checked !== false ? ' checked' : '') + '>' +
        '<span class="act-box" aria-hidden="true"></span>' +
        '<span class="act-glyph" data-glyph="' + a.tool + '">' + glyph(a.tool) + '</span>' +
        '<span class="act-body">' +
          (text ? '<span class="act-text">' + text + '</span>' : '') +
          (a.out ? '<span class="act-out">' + appB(a.app) + ' · ' + a.out + '</span>' : '') +
          (res ? '<span class="act-res">' + appB(a.app) + ' · <span class="act-res-txt">' + res + (a.st === 'is-done' && !a.undo && res.indexOf('ss-ok') < 0 ? ' <i class="ss-ok ss-ok-auto" aria-label="verified">✓</i>' : '') + '</span></span>' : '') +
        '</span>' +
        (multi ? '</label>' : '') +
        (a.tag ? '<span class="act-tag ss-tag">' + a.tag + '</span>' : '') +
        (a.undo ? '<em class="js-undo ss-undo">Undo</em>' : '') +
        (multi ? pillsHTML(a) : '') +
      (multi ? '</div>' : '</label>') + '</li>';
  }
  function closeHTML(c) {
    return '<li class="act act-close' + (c.st ? ' ' + c.st : '') + '" data-close="1">' +
      '<span class="act-row">' +
        '<span class="act-box act-lock" aria-hidden="true"></span>' +
        '<span class="act-glyph" data-glyph="glance">' + glyph('glance') + '</span>' +
        '<span class="act-body">' +
          '<span class="act-text">' + c.text + '</span>' +
          (c.done ? '<span class="act-res"><span class="act-res-txt">' + c.done + '</span></span>' : '') +
        '</span>' +
        '<span class="act-tag">' + c.tag + '</span>' +
      '</span></li>';
  }
  function chipHTML(cfg, L) {
    var c = cfg.chip;
    var hold = c.noHold || c.mode === 'ask' || c.mode === 'files' ? '' : '<button type="button" class="chip-hold">' + L.hold + '</button>';
    return '<div class="chip chip-invoice">' + hold +
      (c.icon ? '<span class="ss-chip-glyph" aria-hidden="true">' + glyph(c.icon) + '</span>' : '') +
      '<span class="chip-txt">' + (c.q || '') + '</span>' +
      '<span class="chip-act"><button type="button" class="chip-x" aria-label="Dismiss">×</button>' + DOIT + '</span></div>';
  }
  function addHTML(cfg, L) {
    if (!cfg.add) return '';
    return '<div class="ss-add" data-open="' + (cfg.add === 'open') + '">' +
      '<button type="button" class="ss-add-btn">' + L.add + '</button>' +
      '<div class="ss-add-row act-row">' +
        '<span class="act-box act-none" aria-hidden="true"></span>' +
        '<span class="act-glyph" data-glyph="you">' + glyph('you') + '</span>' +
        '<input type="text" class="ss-add-input" maxlength="80" placeholder="' + L.addPh + '" value="' + esc(cfg.addValue || '') + '" aria-label="New step">' +
        '<kbd class="ss-kbd">↵</kbd>' +
      '</div></div>';
  }
  function receiptHTML(cfg) {
    var r = (cfg.receipt || []).map(function (t) { return '<div class="receipt receipt-hero"><span class="receipt-dot"></span><span class="receipt-txt">' + t + '</span></div>'; }).join('');
    if (cfg.manualLeft) r += '<div class="receipt ss-receipt-manual"><span class="ss-receipt-ic" aria-hidden="true">' + glyph('manual') + '</span><span class="receipt-txt">' + cfg.manualLeft + ' manual step left for you</span></div>';
    return r ? '<div class="receipt-stack">' + r + '</div>' : '';
  }
  function approveHTML(a, disabled) {
    return '<div class="approve-banner' + (disabled ? ' ss-approve-off' : '') + '">' +
      '<div class="approve-meta"><div class="approve-title">' + a.title + '</div><div class="approve-sub">' + a.sub + '</div></div>' +
      '<button type="button" class="approve-btn"' + (disabled ? ' disabled aria-disabled="true"' : '') + '>Approve close</button></div>';
  }
  function headHTML(cfg, L) {
    return '<div class="gs-head">' +
      '<img class="living-ico" src="living/' + (cfg.icon === 'done' ? 'key-done-512.png' : 'key-idle-512.png') + '" alt="" width="26" height="26">' +
      '<div class="gs-head-meta"><div class="gs-brand">' + L.brand + '</div><div class="gs-intent-label">' + L.intentLabel + '</div></div>' +
      (cfg.badge ? '<span class="handled gs-badge">' + cfg.badge + '</span>' : '') +
      '</div>' +
      '<p class="gs-intent">' + cfg.intent + '</p>';
  }

  /* F5 · ProofOfClose — one row, every state */
  function seqHTML() {
    var base = { tool: 'gmail', app: 'Gmail', text: 'Draft reply to Noa', checked: true };
    function r(o) { return Object.assign({}, base, o); }
    var steps = [
      ['Queued', rowHTML(r({ st: 'is-pending', out: 'Queued' }), 0, EN)],
      ['Preparing', rowHTML(r({ st: 'is-active', out: 'Preparing the draft…' }), 0, EN)],
      ['Verifying', rowHTML(r({ st: 'st-verifying', out: 'Verifying in Drafts…' }), 0, EN)],
      ['Verified', rowHTML(r({ st: 'is-done', res: 'Reply to Noa drafted · invoice attached' }), 0, EN)],
      ['Couldn’t confirm', rowHTML(r({ st: 'st-failed', out: 'Couldn’t confirm · <em class="ss-retry">Retry</em>' }), 0, EN),
        approveHTML({ title: 'Still open · 1 step unconfirmed', sub: 'Approve unlocks once it verifies' }, true)],
      ['After Approve · fetched back', closeHTML(Object.assign({}, CLOSE, { st: 'is-done is-final ss-proofed', done: '<b class="act-app">Gmail</b> · Sent · fetched back ' + OK }))],
    ];
    return '<div class="ss-seq">' + steps.map(function (s, k) {
      return '<div class="ss-seq-step"><div class="ss-seq-lbl"><span class="ss-seq-n">' + (k + 1) + '</span>' + s[0] + '</div><ol class="acts">' + s[1] + '</ol>' + (s[2] || '') + '</div>';
    }).join('') + '</div>';
  }

  function cardHTML(id, cfg) {
    var L = cfg.he ? HE : EN;
    var state = cfg.state || 'propose';
    var inner;
    if (cfg.seq) {
      inner = '<div class="glance-surface g19 ss-gs">' + seqHTML() + '</div>';
      return '<div class="stage stage-live ss-stage" data-state="wait" data-id="' + id + '">' + inner + '</div>';
    }
    if (cfg.bare) {
      inner = '<div class="glance-surface g19 ss-bare">' + (cfg.chip ? chipHTML(cfg, L) : '') + receiptHTML(cfg) + '</div>';
    } else {
      var label = cfg.label === 'done' ? L.done : cfg.label === 'prepared' ? L.prepared : L.will;
      inner = '<div class="glance-surface g19 ss-gs' + (cfg.crop ? ' ss-crop' : '') + '"' + (cfg.he ? ' dir="rtl" lang="he"' : '') + '>' +
        (cfg.crop ? '' : headHTML(cfg, L)) +
        (cfg.crop ? '' : '<div class="acts-head"><span class="acts-label">' + label + '</span></div>') +
        '<ol class="acts">' + cfg.rows.map(function (a, i) { return rowHTML(a, i, L); }).join('') + '</ol>' +
        addHTML(cfg, L) +
        (cfg.approve ? approveHTML(cfg.approve, false) : '') +
        (cfg.chip ? chipHTML(cfg, L) : '') +
        receiptHTML(cfg) +
        '</div>';
    }
    return '<div class="stage stage-live ss-stage" data-state="' + state + '" data-id="' + id + '">' + inner + '</div>';
  }

  /* ---------------- live behaviour ---------------- */
  function stageOf(el) { return el.closest('.ss-stage'); }
  function cfgOf(stage) { return CARDS[stage.getAttribute('data-id')]; }
  function syncChip(stage) {
    var cfg = cfgOf(stage); if (!cfg || !cfg.chip) return;
    var L = cfg.he ? HE : EN;
    var txt = stage.querySelector('.chip-txt'); if (!txt) return;
    var mode = cfg.chip.mode;
    if (mode === 'count') {
      var rows = $all('li.act:not(.act-close):not(.act-manual)', stage);
      var sel = rows.filter(function (li) { var cb = li.querySelector('.act-check'); return cb && cb.checked; });
      var sugg = rows.filter(function (li) { var cb = li.querySelector('.act-check'); return li.classList.contains('act-suggested') && cb && !cb.checked; }).length;
      var tools = [];
      sel.forEach(function (li) { var a = li.getAttribute('data-app'); if (a && tools.indexOf(a) < 0) tools.push(a); });
      stage.classList.toggle('no-actions', sel.length === 0);
      txt.innerHTML = sel.length ? L.count(sel.length, tools, sugg) : L.none;
    } else if (mode === 'files') {
      var row = cfg.rows[0];
      var on = row.files.filter(function (f) { return f.on; }).length;
      var cb = stage.querySelector('.act-check');
      var go = on > 0 && cb && cb.checked;
      stage.classList.toggle('no-actions', !go);
      txt.innerHTML = on ? 'Save <b class="file">' + on + ' of ' + row.files.length + '</b> attachments to Drive?' : 'Pick at least one file';
    } else {
      txt.innerHTML = cfg.chip.q;
    }
  }
  function renderCard(host) {
    var id = host.getAttribute('data-card');
    host.innerHTML = cardHTML(id, CARDS[id]);
    syncChip(host.querySelector('.ss-stage'));
  }
  function rerender(stage) { renderCard(stage.parentNode); }

  function resolveStep(stage, raw) {
    var cfg = cfgOf(stage); var t = raw.trim(); if (!t) return;
    var row;
    if (/\b(remind|call)\b/i.test(t) && /noa/i.test(t)) row = Object.assign({}, ADDED);
    else row = Object.assign({}, MANUAL, { text: esc(t.charAt(0).toUpperCase() + t.slice(1)) });
    var close = cfg.rows.pop(); cfg.rows.push(row, close);
    cfg.add = 'closed'; cfg.addValue = '';
    rerender(stage);
  }

  document.addEventListener('change', function (e) {
    if (e.target.classList.contains('act-check')) syncChip(stageOf(e.target));
  });
  document.addEventListener('click', function (e) {
    var t = e.target; if (!t.closest) return;
    var stage = stageOf(t); if (!stage) return;
    var cfg = cfgOf(stage);
    var pill = t.closest('.ss-pill');
    if (pill) {
      e.preventDefault();
      var row = cfg.rows[0];
      if (pill.hasAttribute('data-more')) row.expanded = true;
      else if (pill.hasAttribute('data-less')) row.expanded = false;
      else { var f = row.files[+pill.getAttribute('data-f')]; f.on = !f.on; row.checked = row.files.some(function (x) { return x.on; }); }
      rerender(stage); return;
    }
    if (t.closest('.ss-add-btn')) {
      cfg.add = 'open'; rerender(stage);
      var inp = document.querySelector('.ss-stage[data-id="' + stage.getAttribute('data-id') + '"] .ss-add-input');
      if (inp) inp.focus({ preventScroll: true });
      return;
    }
    if (t.closest('.do-halo') && cfg.run === 'save') {
      e.preventDefault();
      var li = stage.querySelector('li.act'); li.classList.add('is-active');
      setTimeout(function () {
        li.classList.remove('is-active'); li.classList.add('is-done');
        stage.setAttribute('data-state', 'settled');
        var ic = stage.querySelector('.living-ico'); if (ic) ic.src = 'living/key-done-512.png';
        stage.querySelector('.acts-label').textContent = EN.done;
        if (!li.querySelector('.ss-undo')) li.querySelector('.act-row').insertAdjacentHTML('beforeend', '<em class="js-undo ss-undo">Undo</em>');
      }, 900);
      return;
    }
    if (t.closest('.js-undo') && cfg.run === 'save') { e.preventDefault(); rerender(stage); return; }
  });
  document.addEventListener('keydown', function (e) {
    if (!e.target.classList || !e.target.classList.contains('ss-add-input')) return;
    var stage = stageOf(e.target);
    if (e.key === 'Enter') { e.preventDefault(); resolveStep(stage, e.target.value); }
    else if (e.key === 'Escape') { var cfg = cfgOf(stage); cfg.add = 'closed'; rerender(stage); }
  });
  document.addEventListener('input', function (e) {
    if (e.target.classList && e.target.classList.contains('ss-add-input')) cfgOf(stageOf(e.target)).addValue = e.target.value;
  });

  $all('[data-card]').forEach(renderCard);
  window.__ss = { cards: CARDS, rerender: function (id) { renderCard(document.querySelector('[data-card="' + id + '"]')); } };
})();
