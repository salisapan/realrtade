// Gate 0.9.55. A scan that already read mail A must not paint A's card after
// the open mail is B, and a click on a card bound to A must not run on B.
// Run: node test/mail-switch-race-corpus.cjs
// Needs jsdom, a devDependency of this package. Missing jsdom is a failed run.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch (e) {
  console.error('FAIL: jsdom is not installed. The mail-switch regression cannot run.');
  process.exit(1);
}

const ROOT = path.join(__dirname, '..');
const ME = 'glance.salisapan@outlook.com';
const FLOW = 'ai.local.flow@gmail.com';
const ID_A = 'MSG-Q3-SUMMARY-111';
const ID_B = 'MSG-OFFICE-MOVE-222';
const SUBJ_A = 'Gate A 0.9.41 – quick question on the Q3 summary';
const SUBJ_B = 'Office move - can you confirm the date?';
const BODY_A = 'Hi,\nCan you reply and confirm whether the Q3 summary will include the October numbers?\nThanks,\nFlow';
const BODY_B = 'Hi,\nCan you reply and confirm whether the office move is still on for October 20?\nThanks,\nFlow';

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else {
    failures++;
    console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail).slice(0, 800) : '');
  }
}

// Every card paint is a call inside paintIfCurrent, or a call inside an
// entry painter that still refuses to draw unless paintDepth is open.
const { lintPaintGate } = require('./paint-gate-lint.cjs');

function registeredFiles() {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  const bg = fs.readFileSync(path.join(ROOT, 'src/background.js'), 'utf8');
  const only = JSON.parse(bg.match(/const GMAIL_ONLY_SCRIPTS = (\[[^\]]*\])/)[1].replace(/'/g, '"'));
  const table = bg.match(/const SURFACES = \{([\s\S]*?)\n\};/)[1];
  const outlook = table.slice(table.indexOf('outlook:'));
  const extra = (outlook.match(/extra: \[([\s\S]*?)\]/)[1].match(/'([^']+)'/g) || []).map((s) => s.slice(1, -1));
  return (manifest.content_scripts[0].js || []).filter((f) => only.indexOf(f) < 0).concat(extra);
}

function urlFor(id) {
  return 'https://outlook.live.com/mail/0/inbox/id/' + encodeURIComponent(id);
}

function showMail(doc, win, mail) {
  win.history.pushState({}, '', urlFor(mail.id));
  const heading = doc.querySelector('#ReadingPaneContainerId [role="heading"] span');
  if (heading) {
    heading.textContent = mail.subject;
    heading.setAttribute('title', mail.subject);
  }
  const to = doc.querySelector('#ReadingPaneContainerId .to');
  if (to) to.innerHTML = mail.toHtml;
  let cc = doc.querySelector('#ReadingPaneContainerId .cc');
  if (mail.ccHtml) {
    if (!cc) {
      cc = doc.createElement('div');
      cc.className = 'cc';
      if (to && to.parentNode) to.parentNode.insertBefore(cc, to.nextSibling);
    }
    cc.innerHTML = mail.ccHtml;
  } else if (cc) cc.remove();
  const body = doc.querySelector('#ReadingPaneContainerId [role="document"]');
  if (body) body.innerHTML = mail.bodyHtml;
}

function lines(text) {
  return String(text || '').split('\n').map((line) => '<div>' + line + '</div>').join('');
}

const MAIL_A = {
  id: ID_A,
  subject: SUBJ_A,
  toHtml: 'אל: <span>' + ME + '</span>',
  ccHtml: '',
  bodyHtml: lines(BODY_A)
};
const MAIL_B = {
  id: ID_B,
  subject: SUBJ_B,
  toHtml: 'אל: <span>' + FLOW + '</span>',
  ccHtml: 'עותק: <span>' + ME + '</span>',
  bodyHtml: lines(BODY_B)
};
const ID_C = 'MSG-HANDOFF-333';
const MAIL_C = {
  id: ID_C,
  subject: 'Handoff confirm the third mail',
  toHtml: 'אל: <span>' + ME + '</span>',
  ccHtml: '',
  bodyHtml: lines('Hi,\nCan you reply and confirm the handoff for the third mail?\nThanks,\nFlow')
};

function boundTo(host, id) {
  const raw = host && host.getAttribute ? (host.getAttribute('data-glance-message') || '') : '';
  return raw.split('|').indexOf(id) >= 0;
}

function chipText(doc) {
  const host = doc.querySelector('#ReadingPaneContainerId .flow-chip-host');
  return host ? String(host.textContent || '').replace(/\s+/g, ' ').trim() : '';
}

// OWA already captured pushState, so a reading-pane swap does not run the wrapper.
function swapPane(doc, win, mail) {
  const proto = win.History && win.History.prototype;
  if (!proto || typeof proto.pushState !== 'function') throw new Error('History.prototype.pushState missing');
  proto.pushState.call(win.history, {}, '', urlFor(mail.id));
  const body = doc.querySelector('#ReadingPaneContainerId [role="document"]');
  if (body && body.parentNode) {
    const next = body.cloneNode(false);
    next.innerHTML = mail.bodyHtml;
    body.parentNode.replaceChild(next, body);
  }
  const heading = doc.querySelector('#ReadingPaneContainerId [role="heading"] span');
  if (heading) {
    heading.textContent = mail.subject;
    heading.setAttribute('title', mail.subject);
  }
}

function proofForA() {
  return {
    glanceProofs: {
      records: {
        [ID_A]: {
          messageId: ID_A,
          ids: [ID_A],
          kind: 'written',
          connectorId: 'outlookTask',
          system: 'microsoft/todo',
          externalId: 'task-a-only',
          ref: { taskId: 'task-a-only', externalId: 'task-a-only', created: { title: 'A only', importance: 'normal' } },
          fetchedBack: true,
          writtenLine: 'A-ONLY-RECEIPT',
          receiptStatus: 'Handled.',
          label: 'A only',
          objectName: 'To Do',
          app: 'outlook'
        }
      },
      byId: { [ID_A]: ID_A }
    }
  };
}

function logOnly(id) {
  return {
    log: [{
      kind: 'written',
      messageId: id,
      itemId: id,
      connectorId: 'outlookTask',
      system: 'microsoft/todo',
      externalId: 'task-' + id,
      ref: { taskId: 'task-' + id, externalId: 'task-' + id, created: { title: 'Log ' + id, importance: 'normal' } },
      fetchedBack: true,
      writtenLine: 'RECEIPT-' + id,
      receiptStatus: 'Handled.',
      label: 'RECEIPT-' + id,
      objectName: 'To Do',
      app: 'outlook'
    }]
  };
}

async function boot(opts) {
  const o = opts || {};
  const startMail = o.mail || MAIL_A;
  const files = registeredFiles();
  let html = fs.readFileSync(path.join(__dirname, 'fixtures/owa-reading-pane-he.html'), 'utf8');
  const dom = new JSDOM(html, { url: urlFor(startMail.id), runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  Object.defineProperty(w.HTMLElement.prototype, 'innerText', {
    get() {
      return this.innerHTML.replace(/<br\s*\/?>/gi, '\n').replace(/<\/div>/gi, '\n').replace(/<(?:[^>"']|"[^"]*"|'[^']*')*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\n{3,}/g, '\n\n').trim();
    }
  });
  w.TextEncoder = TextEncoder;
  w.TextDecoder = TextDecoder;
  if (!w.crypto || !w.crypto.subtle) Object.defineProperty(w, 'crypto', { value: require('crypto').webcrypto });
  const logs = [];
  w.console = Object.assign({}, console, {
    log: (...a) => logs.push(a.map(String).join(' ')),
    info: (...a) => logs.push(a.map(String).join(' ')),
    debug: (...a) => logs.push(a.map(String).join(' ')),
    warn: (...a) => logs.push(a.map(String).join(' ')),
    error: (...a) => logs.push('ERROR ' + a.map(String).join(' '))
  });
  const store = Object.assign({
    outlookAuth: {
      token: { accessToken: 'AT', refreshToken: 'RT', expiresAt: Date.now() + 3600e3, rtIssuedAt: Date.now() },
      account: { address: ME, name: 'Glance' },
      ownAddresses: [ME]
    },
    outlookSync: { stateVersion: 3 }
  }, o.store || {});
  const sent = [];
  const queued = [];
  let armed = false;
  let released = !o.holdAfterRead;
  function snapshotGet(k, cb) {
    const snap = JSON.parse(JSON.stringify(store));
    let r;
    if (k && typeof k === 'object' && !Array.isArray(k)) r = Object.assign({}, k, snap);
    else if (typeof k === 'string') r = { [k]: snap[k] };
    else if (Array.isArray(k)) { r = {}; k.forEach((x) => { r[x] = snap[x]; }); }
    else r = snap;
    if (cb) cb(r);
    return r;
  }
  function reply(msg) {
    sent.push(msg);
    if (msg.type === 'flow:outlook-session') return { ok: true, token: store.outlookAuth.token, changed: false, how: 'fresh' };
    if (msg.type === 'flow:outlook-fetch') {
      const u = String(msg.url || '');
      if (/\/me\?/.test(u)) return { ok: true, status: 200, body: JSON.stringify({ mail: ME, displayName: 'Glance' }) };
      if (/\/me\/messages/.test(u)) return { ok: true, status: 200, body: JSON.stringify({ value: [] }) };
      return { ok: false, status: 404, body: '{}' };
    }
    if (msg.type === 'flow:drive-find-one') {
      return { ok: true, match: 'one', file: { id: 'f1', name: 'glance-pricing-q4.pdf', url: 'https://drive.google.com/file/d/f1/view' } };
    }
    if (msg.type === 'flow:execute-action' && msg.payload && msg.payload.connectorId === 'outlookCalendar') {
      return { ok: true, ref: { eventId: 'ev-1' }, written: 'On your calendar, with the file.', url: 'https://outlook.live.com/calendar/item/ev-1' };
    }
    if (msg.type === 'flow:execute-action') return { ok: true, ref: 'draft-1', where: 'drafts', url: 'https://outlook.live.com/mail/0/drafts' };
    if (msg.type === 'flow:undo-action') return { ok: true, written: 'Undone' };
    if (msg.type === 'flow:reconcile-proof') {
      const status = o.reconcileStatus || 200;
      return { ok: status === 200, status: status };
    }
    return { ok: true };
  }
  const heldReconcile = [];
  let reconcileOpen = !o.holdReconcile;
  w.chrome = {
    runtime: {
      id: 'ext', lastError: null, getURL: (s) => 'chrome-extension://x/' + s,
      getManifest: () => ({ version: 'test' }),
      onMessage: { addListener() {} },
      sendMessage: (msg, cb) => {
        const r = reply(msg);
        if (msg && msg.type === 'flow:reconcile-proof' && o.holdReconcile && !reconcileOpen) {
          heldReconcile.push(() => cb && cb(r));
          return;
        }
        const slow = msg && msg.type === 'flow:outlook-fetch' && o.slowFetches > 0;
        if (slow) o.slowFetches -= 1;
        setTimeout(() => cb && cb(r), slow ? (o.fetchDelayMs || 3000) : 5);
      }
    },
    storage: {
      local: {
        get: (k, cb) => {
          const run = () => snapshotGet(k, cb);
          if (armed && !released) { queued.push(run); return; }
          setTimeout(run, 1);
        },
        set: (p, cb) => { Object.assign(store, JSON.parse(JSON.stringify(p))); if (cb) setTimeout(cb, 1); return Promise.resolve(); },
        remove: (k, cb) => { [].concat(k).forEach((x) => { delete store[x]; }); if (cb) cb(); return Promise.resolve(); }
      },
      onChanged: { addListener() {} },
      sync: { get: (k, cb) => cb && cb({}) }
    },
    i18n: { getUILanguage: () => 'en' }
  };
  const ctx = dom.getInternalVMContext();
  for (const f of files) {
    new vm.Script(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f }).runInContext(ctx);
  }
  vm.runInContext(`
    (function () {
      const orig = FlowOwaParse.readPane;
      FlowOwaParse.readPane = function () {
        const pane = orig.apply(this, arguments);
        if (globalThis.__onRead) globalThis.__onRead(pane);
        return pane;
      };
    })();
  `, ctx);
  w.__onRead = () => { if (o.holdAfterRead && !released) armed = true; };
  showMail(w.document, w, startMail);
  return {
    w, doc: w.document, logs, sent, queued, store, heldReconcile,
    release() { released = true; const pending = queued.splice(0); pending.forEach((fn) => fn()); },
    releaseReconcile() { reconcileOpen = true; const pending = heldReconcile.splice(0); pending.forEach((fn) => fn()); }
  };
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

(async () => {
  const outlookSrc = fs.readFileSync(path.join(ROOT, 'src/content-outlook.js'), 'utf8');
  const gateViolations = lintPaintGate(outlookSrc);
  check('every paint goes through paintIfCurrent', gateViolations.length === 0, gateViolations.slice(0, 12));
  check('setting the UI language is not a card paint', lintPaintGate('function pageUiLang() { FlowChipHost.setUiLang(lang); }\n').length === 0);
  function mustFail(name, src, needle) {
    const hit = lintPaintGate(src);
    check(name, hit.some((row) => String(row).indexOf(needle) >= 0), hit);
  }
  mustFail('the paint gate lint catches a dot call', 'function sneak() { FlowChipHost.inject(mount, ctx, {}); }\n', 'FlowChipHost');
  mustFail('the paint gate lint catches a bracket call', "function sneak() { FlowChipHost['inject'](mount, ctx); }\n", 'FlowChipHost');
  mustFail('the paint gate lint catches an alias', 'function sneak() { const p = FlowChipHost.showDraftReceipt; p(host, {}); }\n', 'FlowChipHost');
  mustFail('the paint gate lint catches a destructure', 'function sneak() { const { setChipState } = FlowChipHost; setChipState(chip, "a", "b"); }\n', 'FlowChipHost');
  mustFail('the paint gate lint catches call', 'function sneak() { FlowChipHost.inject.call(FlowChipHost, mount, ctx); }\n', 'FlowChipHost');
  mustFail('the paint gate lint catches apply', 'function sneak() { FlowChipHost.inject.apply(FlowChipHost, [mount, ctx]); }\n', 'FlowChipHost');
  mustFail('the paint gate lint catches bind', 'function sneak() { const run = FlowChipHost.inject.bind(FlowChipHost); run(mount, ctx); }\n', 'FlowChipHost');
  mustFail('the paint gate lint catches appendChild', 'function sneak() { host.appendChild(node); }\n', 'appendChild');
  mustFail('the paint gate lint catches a bracket appendChild', "function sneak() { host['appendChild'](node); }\n", 'appendChild');
  mustFail('the paint gate lint catches insertBefore', 'function sneak() { mount.insertBefore(node, mount.firstChild); }\n', 'insertBefore');
  mustFail('the paint gate lint catches replaceChildren', 'function sneak() { host.replaceChildren(node); }\n', 'replaceChildren');
  mustFail('the paint gate lint catches append', 'function sneak() { pane.append(node); }\n', 'append');
  mustFail('the paint gate lint catches prepend', 'function sneak() { pane.prepend(node); }\n', 'prepend');
  mustFail('the paint gate lint catches innerHTML', 'function sneak() { pane.innerHTML = "<p></p>"; }\n', 'innerHTML');
  mustFail('the paint gate lint catches outerHTML', 'function sneak() { host.outerHTML = "<div></div>"; }\n', 'outerHTML');
  mustFail('the paint gate lint catches insertAdjacentHTML', 'function sneak() { mount.insertAdjacentHTML("beforeend", "<div></div>"); }\n', 'insertAdjacentHTML');
  mustFail('the paint gate lint catches mountPoint()', 'function sneak() { mountPoint().appendChild(node); }\n', 'appendChild');
  mustFail('the paint gate lint catches a mountPoint alias', 'function sneak() { const m = mountPoint(); m.prepend(node); }\n', 'prepend');
  mustFail('the paint gate lint catches a pane alias', 'function sneak() { const card = pane; card.innerHTML = "x"; }\n', 'innerHTML');
  mustFail('the paint gate lint catches a missing paintDepth guard', 'function paintHint(host, text) { return text; }\n', 'paintDepth');
  mustFail('the paint gate lint catches a paintIfCurrent with no live-mail guard', 'function paintIfCurrent(token, fn) { paintDepth += 1; try { return fn(); } finally { paintDepth -= 1; } }\n', 'mailTokenLive');
  const allowed = lintPaintGate([
    'function paintHint(host, text) { if (paintDepth <= 0 || !host) return; host.appendChild(node); const el = FlowChipHost.el; el("span"); }',
    'function paintSkippedOnly(pane, skipped) { if (paintDepth <= 0) return null; const mount = mountPoint(); skipped.forEach(function (file) { host.appendChild(file); }); mount.insertBefore(host, mount.firstChild); }',
    'paintIfCurrent(token, function () { FlowChipHost.inject(mount, ctx, {}); mount.appendChild(host); });',
    'function localOnly() { const host = document.createElement("div"); host.appendChild(node); }'
  ].join('\n'));
  check('the paint gate lint allows a gated paint', allowed.length === 0, allowed);

  const race = await boot({ holdAfterRead: true });
  const waitHold = Date.now() + 4000;
  while (Date.now() < waitHold && race.queued.length === 0) await sleep(20);
  check('mail A scan is waiting after it read the pane', race.queued.length > 0, { queued: race.queued.length });
  showMail(race.doc, race.w, MAIL_B);
  race.release();
  let sawAonB = false;
  let sample = '';
  const until = Date.now() + 900;
  while (Date.now() < until) {
    const host = race.doc.querySelector('#ReadingPaneContainerId .flow-chip-host');
    const heading = race.doc.querySelector('#ReadingPaneContainerId [role="heading"]');
    const onB = heading && String(heading.textContent || '').indexOf('Office move') >= 0;
    const boundA = host && boundTo(host, ID_A);
    const boundB = host && boundTo(host, ID_B);
    if (onB && host && (boundA || (!boundB && /Reply/.test(host.textContent || '')))) {
      sawAonB = true;
      sample = chipText(race.doc) + ' bound=' + (host.getAttribute('data-glance-message') || '');
      break;
    }
    await sleep(15);
  }
  check('a late result from Q3 does not paint Reply & Track on Office move', !sawAonB, { sample: sample, text: chipText(race.doc) });
  race.w.close();

  const click = await boot({ holdAfterRead: false });
  const waitCard = Date.now() + 5000;
  let hostA = null;
  while (Date.now() < waitCard && !hostA) {
    const host = click.doc.querySelector('#ReadingPaneContainerId .flow-chip-host');
    if (host && boundTo(host, ID_A)) hostA = host;
    await sleep(30);
  }
  check('Q3 in To paints a card bound to that mail', Boolean(hostA), { text: chipText(click.doc) });
  const parent = hostA && hostA.parentNode;
  showMail(click.doc, click.w, MAIL_B);
  await sleep(40);
  if (hostA && parent && !hostA.isConnected) parent.insertBefore(hostA, parent.firstChild);
  const btn = hostA && (hostA.querySelector('button.flow-chip') || hostA.querySelector('.do-halo') || hostA.querySelector('.flow-chip'));
  const before = click.sent.filter((m) => m.type === 'flow:execute-action').length;
  if (btn) btn.click();
  await sleep(400);
  const acts = click.sent.filter((m) => m.type === 'flow:execute-action');
  const ignored = click.logs.some((line) => line.indexOf('stale card click ignored') >= 0);
  check('a click on a card bound to the previous mail does nothing',
    Boolean(hostA) && Boolean(btn) && acts.length === before && ignored,
    { acts: acts.length, ignored: ignored, logs: click.logs.filter((l) => /stale|decision|Glance:/.test(l)).slice(-6) });
  click.w.close();

  const rapid = await boot({ holdAfterRead: false });
  const mails = [];
  for (let i = 1; i <= 20; i++) {
    const id = 'MSG-SWITCH-' + String(i).padStart(2, '0');
    mails.push({
      id: id,
      subject: 'Switch ' + i + ' confirm the figure',
      toHtml: 'אל: <span>' + ME + '</span>',
      ccHtml: '',
      bodyHtml: lines('Hi,\nCan you reply and confirm the figure for switch ' + i + '?\nThanks,\nFlow')
    });
  }
  let foreign = '';
  const started = Date.now();
  for (let i = 0; i < mails.length; i++) {
    showMail(rapid.doc, rapid.w, mails[i]);
    const host = rapid.doc.querySelector('#ReadingPaneContainerId .flow-chip-host');
    if (!host) continue;
    const raw = host.getAttribute('data-glance-message') || '';
    const ids = raw.split('|').filter(Boolean);
    if (ids.length && ids.indexOf(mails[i].id) < 0) foreign = raw;
  }
  let host20 = null;
  while (Date.now() < started + 2000 && !host20) {
    const host = rapid.doc.querySelector('#ReadingPaneContainerId .flow-chip-host');
    if (host && boundTo(host, mails[19].id)) host20 = host;
    else if (host) {
      const raw = host.getAttribute('data-glance-message') || '';
      const ids = raw.split('|').filter(Boolean);
      if (ids.length && ids.indexOf(mails[19].id) < 0) foreign = foreign || raw;
    }
    if (!host20) await sleep(20);
  }
  check('20 fast switches never show another mail\'s card', !foreign, { foreign: foreign, text: chipText(rapid.doc) });
  check('mail 20\'s card is up within 2 seconds', Boolean(host20) && (Date.now() - started) <= 2000, { ms: Date.now() - started, text: chipText(rapid.doc) });
  rapid.w.close();

  const timed = await boot({ slowFetches: 1, fetchDelayMs: 3000 });
  await sleep(120);
  const switches = [];
  for (let i = 1; i <= 20; i++) {
    const id = 'MSG-TIME-' + String(i).padStart(2, '0');
    const t0 = Date.now();
    showMail(timed.doc, timed.w, {
      id: id,
      subject: 'Q3 return ' + i,
      toHtml: 'אל: <span>' + ME + '</span>',
      ccHtml: '',
      bodyHtml: lines('Hi,\nCan you reply and confirm whether the Q3 summary for switch ' + i + ' is ready?\nThanks,\nFlow')
    });
    let host = null;
    while (Date.now() - t0 < 2000) {
      const found = timed.doc.querySelector('#ReadingPaneContainerId .flow-chip-host');
      if (found && boundTo(found, id)) { host = found; break; }
      await sleep(20);
    }
    switches.push({ i: i, ms: Date.now() - t0, up: Boolean(host) });
  }
  const slow = switches.filter((row) => !row.up || row.ms > 2000);
  check('the Q3 card is back within 2 seconds on all 20 switches', slow.length === 0 && switches.length === 20, slow);
  timed.w.close();

  async function cardFor(page, id) {
    const until = Date.now() + 5000;
    while (Date.now() < until) {
      const host = page.doc.querySelector('.flow-chip-host');
      if (host && boundTo(host, id) && host.getAttribute('data-glance-open')) return host;
      await sleep(30);
    }
    return null;
  }

  const subject = await boot({ holdAfterRead: false });
  const hostSub = await cardFor(subject, ID_A);
  const tokenBefore = hostSub && hostSub.getAttribute('data-glance-open');
  const clearedBefore = subject.logs.filter((line) => line.indexOf('stale card cleared') >= 0).length;
  const heading = subject.doc.querySelector('#ReadingPaneContainerId [role="heading"] span');
  if (heading) heading.textContent = 'Q3 summary — subject edited in place';
  await sleep(60);
  const hostAfter = subject.doc.querySelector('#ReadingPaneContainerId .flow-chip-host');
  const clearedAfter = subject.logs.filter((line) => line.indexOf('stale card cleared') >= 0).length;
  check('a subject edit with the same message id is not a mail switch',
    tokenBefore === 'msg|' + ID_A && hostAfter === hostSub && clearedAfter === clearedBefore &&
    subject.w.__glanceOutlookPage.openMailToken() === tokenBefore,
    { tokenBefore: tokenBefore, tokenNow: subject.w.__glanceOutlookPage.openMailToken(), cleared: clearedAfter - clearedBefore, text: chipText(subject.doc) });
  const liveDo = hostSub && (hostSub.querySelector('.do-halo') || hostSub.querySelector('button.flow-chip'));
  const actsBefore = subject.sent.filter((m) => m.type === 'flow:execute-action').length;
  if (liveDo) liveDo.click();
  await sleep(300);
  check('Do It still runs after a subject-only edit',
    subject.sent.filter((m) => m.type === 'flow:execute-action').length === actsBefore + 1,
    { acts: subject.sent.filter((m) => m.type === 'flow:execute-action').length });
  subject.w.close();

  const actions = await boot({ holdAfterRead: false });
  const hostAct = await cardFor(actions, ID_A);
  const holdBtn = hostAct && hostAct.querySelector('.chip-hold');
  if (holdBtn) holdBtn.click();
  check('Hold It on the open mail marks the card', Boolean(hostAct && hostAct.querySelector('[data-glance-held="1"]')));
  const held = hostAct && hostAct.querySelector('[data-glance-held="1"]');
  if (held) held.removeAttribute('data-glance-held');
  const actParent = hostAct && hostAct.parentNode;
  showMail(actions.doc, actions.w, MAIL_B);
  await sleep(50);
  if (hostAct && actParent && !hostAct.isConnected) actParent.insertBefore(hostAct, actParent.firstChild);
  const staleHold = hostAct && hostAct.querySelector('.chip-hold');
  if (staleHold) staleHold.click();
  const dismiss = hostAct && (hostAct.querySelector('.chip-x') || hostAct.querySelector('.flow-chip-dismiss'));
  if (dismiss) dismiss.click();
  const dismissLeftTheCard = hostAct.isConnected;
  await sleep(250);
  const dismissed = ((actions.store && actions.store.log) || []).some((e) => e && e.kind === 'dismissed');
  check('Hold It on another mail\'s card does nothing',
    Boolean(staleHold) && !hostAct.querySelector('[data-glance-held="1"]') &&
    actions.logs.some((line) => line.indexOf('stale card click ignored') >= 0));
  check('Dismiss on another mail\'s card does not record a dismiss',
    Boolean(dismiss) && !dismissed && dismissLeftTheCard,
    { dismissed: dismissed, connected: dismissLeftTheCard });
  hostAct.removeAttribute('data-glance-open');
  const bareDo = hostAct.querySelector('.do-halo') || hostAct.querySelector('button.flow-chip');
  const bareBefore = actions.sent.filter((m) => m.type === 'flow:execute-action').length;
  if (bareDo) bareDo.click();
  await sleep(250);
  check('a card with no open-mail token never executes',
    Boolean(bareDo) && actions.sent.filter((m) => m.type === 'flow:execute-action').length === bareBefore &&
    actions.logs.some((line) => line.indexOf('card with no open-mail token ignored') >= 0),
    { acts: actions.sent.filter((m) => m.type === 'flow:execute-action').length });
  actions.w.close();

  const undoPage = await boot({ holdAfterRead: false });
  const hostUndo = await cardFor(undoPage, ID_A);
  const doUndo = hostUndo && (hostUndo.querySelector('.do-halo') || hostUndo.querySelector('button.flow-chip'));
  if (doUndo) doUndo.click();
  let undoBtn = null;
  const undoUntil = Date.now() + 2000;
  while (Date.now() < undoUntil && !undoBtn) {
    undoBtn = hostUndo && hostUndo.querySelector('.flow-chip-undo');
    if (!undoBtn) await sleep(30);
  }
  const undoParent = hostUndo && hostUndo.parentNode;
  showMail(undoPage.doc, undoPage.w, MAIL_B);
  await sleep(50);
  if (hostUndo && undoParent && !hostUndo.isConnected) undoParent.insertBefore(hostUndo, undoParent.firstChild);
  const undosBefore = undoPage.sent.filter((m) => m.type === 'flow:undo-action').length;
  if (undoBtn) undoBtn.click();
  await sleep(250);
  check('Undo on another mail\'s card does not undo',
    Boolean(undoBtn) && undoPage.sent.filter((m) => m.type === 'flow:undo-action').length === undosBefore &&
    undoPage.logs.some((line) => line.indexOf('stale card click ignored') >= 0),
    { undos: undoPage.sent.filter((m) => m.type === 'flow:undo-action').length });
  undoPage.w.close();

  const layout = await boot({ holdAfterRead: false });
  const hostLayout = await cardFor(layout, ID_A);
  const paneEl = layout.doc.getElementById('ReadingPaneContainerId');
  if (paneEl) paneEl.removeAttribute('id');
  const origQuery = layout.doc.querySelector.bind(layout.doc);
  layout.doc.querySelector = function (sel) {
    if (sel === '#ReadingPaneContainerId') throw new Error('selector missing');
    return origQuery(sel);
  };
  const urlToken = layout.w.__glanceOutlookPage.openMailToken();
  layout.doc.querySelector = origQuery;
  check('the open mail is the URL message id when ReadingPaneContainerId throws',
    Boolean(hostLayout) && urlToken === 'msg|' + ID_A, { urlToken: urlToken });
  layout.w.history.pushState({}, '', 'https://outlook.live.com/mail/0/inbox/id/' + encodeURIComponent('AQQkCONV-LAYOUT'));
  await sleep(40);
  const convBefore = layout.w.__glanceOutlookPage.openMailToken();
  const convHead = layout.doc.querySelector('[role="main"] [role="heading"]');
  if (convHead) convHead.textContent = 'Another mail in the same conversation';
  await sleep(40);
  const convAfter = layout.w.__glanceOutlookPage.openMailToken();
  check('a subject edit on a conversation address is not a mail switch',
    convBefore.indexOf('conv|AQQkCONV-LAYOUT') === 0 && convBefore === convAfter && convAfter.indexOf('Another mail') < 0 &&
    !layout.doc.getElementById('ReadingPaneContainerId'),
    { convBefore: convBefore, convAfter: convAfter });
  const convBody = layout.doc.querySelector('[role="main"] [role="document"]') || layout.doc.querySelector('[role="document"]');
  if (convBody) convBody.textContent = 'A different message body in the same conversation.';
  const convMoved = layout.w.__glanceOutlookPage.openMailToken();
  check('a different message on a conversation address is a mail switch',
    convMoved !== convBefore && convMoved.indexOf('conv|AQQkCONV-LAYOUT') === 0 && convMoved.indexOf('Another mail') < 0,
    { convBefore: convBefore, convMoved: convMoved });
  layout.w.history.pushState({}, '', 'https://outlook.live.com/mail/0/inbox/');
  const paneBefore = layout.w.__glanceOutlookPage.openMailToken();
  if (convHead) convHead.textContent = 'Subject edited on a pane with no id';
  const paneAfter = layout.w.__glanceOutlookPage.openMailToken();
  check('a subject edit on a pane address is not a mail switch',
    paneBefore.indexOf('pane|') === 0 && paneBefore === paneAfter && paneAfter.indexOf('Subject edited') < 0,
    { paneBefore: paneBefore, paneAfter: paneAfter });
  if (convBody) convBody.textContent = 'The pane now shows a different message.';
  const paneMoved = layout.w.__glanceOutlookPage.openMailToken();
  check('a different message on a pane address is a mail switch',
    paneMoved !== paneBefore && paneMoved.indexOf('pane|') === 0,
    { paneBefore: paneBefore, paneMoved: paneMoved });
  layout.w.close();

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const when = 'tomorrow (' + months[tomorrow.getMonth()] + ' ' + tomorrow.getDate() + ', ' + tomorrow.getFullYear() + ')';
  const cal = await boot({ holdAfterRead: false });
  cal.store.outlookAuth.token.grantedScopes = ['Mail.Read', 'Calendars.ReadWrite'];
  showMail(cal.doc, cal.w, {
    id: 'MSG-CAL-HOLD',
    subject: 'Put the file on the calendar',
    toHtml: 'אל: <span>' + ME + '</span>',
    ccHtml: '',
    bodyHtml: lines('Put the glance-pricing-q4.pdf file on my calendar ' + when + ' at 10:00.')
  });
  let calHost = null;
  const calUntil = Date.now() + 4000;
  while (Date.now() < calUntil && !calHost) {
    const host = cal.doc.querySelector('.flow-chip-host[data-glance-chain="calendar-hold"]');
    if (host && host.getAttribute('data-glance-open') === 'msg|MSG-CAL-HOLD') calHost = host;
    else await sleep(40);
  }
  const calParent = calHost && calHost.parentNode;
  if (calHost) showMail(cal.doc, cal.w, MAIL_B);
  await sleep(50);
  if (calHost && calParent && !calHost.isConnected) calParent.insertBefore(calHost, calParent.firstChild);
  const calDo = calHost && (calHost.querySelector('.do-halo') || calHost.querySelector('button.flow-chip'));
  const calBefore = cal.sent.filter((m) => m.type === 'flow:execute-action' && m.payload && m.payload.connectorId === 'outlookCalendar').length;
  if (calDo) calDo.click();
  await sleep(250);
  const calAfter = cal.sent.filter((m) => m.type === 'flow:execute-action' && m.payload && m.payload.connectorId === 'outlookCalendar').length;
  check('a calendar Do It on another mail\'s card does nothing',
    Boolean(calHost) && Boolean(calDo) && calAfter === calBefore &&
    cal.logs.some((line) => line.indexOf('stale card click ignored') >= 0),
    { host: Boolean(calHost), acts: calAfter, text: calHost ? String(calHost.textContent || '').slice(0, 180) : chipText(cal.doc) });
  cal.w.close();

  const slowStatuses = [404, 410, 500];
  const slowModes = ['url', 'pane'];
  for (let si = 0; si < slowStatuses.length; si++) {
    for (let mi = 0; mi < slowModes.length; mi++) {
      const status = slowStatuses[si];
      const mode = slowModes[mi];
      const page = await boot({ holdReconcile: true, reconcileStatus: status, store: proofForA() });
      const holdUntil = Date.now() + 4000;
      while (Date.now() < holdUntil && page.heldReconcile.length === 0) await sleep(20);
      const fetchesBefore = page.sent.filter((m) => m.type === 'flow:outlook-fetch').length;
      check('a slow ' + status + ' reconcile on Q3 is in flight before the ' + mode + ' switch',
        page.heldReconcile.length > 0, { held: page.heldReconcile.length });
      if (mode === 'url') showMail(page.doc, page.w, MAIL_B);
      else swapPane(page.doc, page.w, MAIL_B);
      const armUntil = Date.now() + 2000;
      while (Date.now() < armUntil && page.sent.filter((m) => m.type === 'flow:outlook-fetch').length <= fetchesBefore) await sleep(20);
      page.releaseReconcile();
      await sleep(400);
      const text = chipText(page.doc);
      const leaked = text.indexOf('Deleted in To Do') >= 0 || text.indexOf('A-ONLY-RECEIPT') >= 0 || text.indexOf("couldn't verify") >= 0;
      check('a slow ' + status + ' reconcile does not paint Q3 onto Office move after a ' + mode + ' switch',
        !leaked, { text: text, fetches: page.sent.filter((m) => m.type === 'flow:outlook-fetch').length });
      page.w.close();
    }
  }

  function switchMail(page, mode, mail) {
    if (mode === 'url') showMail(page.doc, page.w, mail);
    else swapPane(page.doc, page.w, mail);
  }

  async function waitHeld(page) {
    const holdUntil = Date.now() + 4000;
    while (Date.now() < holdUntil && page.heldReconcile.length === 0) await sleep(20);
    return page.heldReconcile.length > 0;
  }

  async function waitFetchGrowth(page, before) {
    const armUntil = Date.now() + 2000;
    while (Date.now() < armUntil && page.sent.filter((m) => m.type === 'flow:outlook-fetch').length <= before) await sleep(20);
  }

  function leakedOnto(doc, previousIds, previousLines) {
    const host = doc.querySelector('#ReadingPaneContainerId .flow-chip-host');
    const text = chipText(doc);
    const raw = host ? String(host.getAttribute('data-glance-message') || '') : '';
    const ids = raw.split('|').filter(Boolean);
    const badId = previousIds.some((id) => ids.indexOf(id) >= 0);
    const badLine = previousLines.some((line) => line && text.indexOf(line) >= 0);
    const badState = text.indexOf('Deleted in To Do') >= 0 || text.indexOf("couldn't verify") >= 0;
    return badId || badLine || badState ? { text: text, raw: raw } : null;
  }

  const logStatuses = [404, 410, 500, 200];
  const logModes = ['url', 'pane'];
  const logDirs = [
    { from: MAIL_A, to: MAIL_B, name: 'A->B' },
    { from: MAIL_B, to: MAIL_A, name: 'B->A' }
  ];
  for (let si = 0; si < logStatuses.length; si++) {
    for (let mi = 0; mi < logModes.length; mi++) {
      for (let di = 0; di < logDirs.length; di++) {
        const status = logStatuses[si];
        const mode = logModes[mi];
        const dir = logDirs[di];
        const page = await boot({
          mail: dir.from,
          holdReconcile: true,
          reconcileStatus: status,
          store: logOnly(dir.from.id)
        });
        const held = await waitHeld(page);
        const fetchesBefore = page.sent.filter((m) => m.type === 'flow:outlook-fetch').length;
        check('a log-only ' + status + ' reconcile on ' + dir.name + ' is in flight before the ' + mode + ' switch', held, { held: page.heldReconcile.length });
        switchMail(page, mode, dir.to);
        await waitFetchGrowth(page, fetchesBefore);
        page.releaseReconcile();
        await sleep(400);
        const leak = leakedOnto(page.doc, [dir.from.id], ['RECEIPT-' + dir.from.id]);
        check('a log-only ' + status + ' reconcile does not paint ' + dir.from.id + ' onto ' + dir.to.id + ' after a ' + mode + ' switch',
          !leak, leak);
        page.w.close();
      }
    }
  }

  for (let si = 0; si < logStatuses.length; si++) {
    for (let mi = 0; mi < logModes.length; mi++) {
      const status = logStatuses[si];
      const mode = logModes[mi];
      const page = await boot({
        mail: MAIL_A,
        holdReconcile: true,
        reconcileStatus: status,
        store: logOnly(ID_A)
      });
      const held = await waitHeld(page);
      check('a log-only ' + status + ' reconcile is in flight before A->B->C ' + mode, held, { held: page.heldReconcile.length });
      const beforeB = page.sent.filter((m) => m.type === 'flow:outlook-fetch').length;
      switchMail(page, mode, MAIL_B);
      await waitFetchGrowth(page, beforeB);
      const beforeC = page.sent.filter((m) => m.type === 'flow:outlook-fetch').length;
      switchMail(page, mode, MAIL_C);
      await waitFetchGrowth(page, beforeC);
      page.releaseReconcile();
      await sleep(400);
      const leak = leakedOnto(page.doc, [ID_A, ID_B], ['RECEIPT-' + ID_A, 'RECEIPT-' + ID_B]);
      check('a log-only ' + status + ' reconcile does not paint an earlier mail after A->B->C ' + mode, !leak, leak);
      page.w.close();
    }
  }

  const reasonPage = await boot({ holdAfterRead: false });
  const reasonHost = reasonPage.doc.createElement('div');
  reasonPage.doc.body.appendChild(reasonHost);
  const reasonLines = {
    'calendar-write-not-granted': 'צריך הרשאה ליומן',
    'token-expired': 'צריך להתחבר מחדש',
    'needs-sign-in': 'צריך להתחבר מחדש',
    'not-connected': 'צריך להתחבר מחדש',
    'user-edited': 'ערכת את זה',
    'unconfirmed': 'לא הצלחתי לאשר',
    'verify-timeout': 'לא הצלחתי לאשר',
    'some-raw-code': 'לא הצלחתי לסיים, נסה שוב',
    'graph-error-42': 'לא הצלחתי לסיים, נסה שוב'
  };
  const reasonCodes = Object.keys(reasonLines);
  let reasonBad = '';
  for (let ri = 0; ri < reasonCodes.length; ri++) {
    const code = reasonCodes[ri];
    reasonHost.textContent = '';
    const payload = code === 'graph-error-42' ? { error: code } : { reason: code };
    reasonPage.w.__glanceOutlookPage.paintCalendarFailure(reasonHost, null, payload);
    const shown = String(reasonHost.textContent || '');
    if (shown.indexOf(code) >= 0 || shown.indexOf(reasonLines[code]) < 0) reasonBad = code + ':' + shown;
  }
  check('a calendar failure shows Hebrew, never the reason code', !reasonBad, { reasonBad: reasonBad });
  await sleep(250);
  reasonPage.w.close();

  const legacyId = 'AQMkAGlegacyCD';
  const legacyLower = 'aqmkaglegacycd';
  const legacyPage = await boot({
    mail: {
      id: legacyId,
      subject: 'Legacy case confirm the old record',
      toHtml: 'אל: <span>' + ME + '</span>',
      ccHtml: '',
      bodyHtml: lines('Hi,\nCan you reply and confirm the legacy record?\nThanks,\nFlow')
    },
    store: {
      glanceProofs: {
        records: {
          'legacy-row': {
            ids: [legacyLower],
            messageId: '',
            kind: 'written',
            connectorId: 'outlookTask',
            system: 'microsoft/todo',
            externalId: 'task-legacy',
            ref: { taskId: 'task-legacy', externalId: 'task-legacy', created: { title: 'Legacy', importance: 'normal' } },
            fetchedBack: true,
            writtenLine: 'LEGACY-LINE',
            receiptStatus: 'Handled.',
            label: 'LEGACY-LINE',
            objectName: 'To Do',
            app: 'outlook'
          }
        },
        byId: {}
      }
    }
  });
  let legacyHost = null;
  const legacyUntil = Date.now() + 4000;
  while (Date.now() < legacyUntil && !legacyHost) {
    const host = legacyPage.doc.querySelector('.flow-chip-host');
    if (host && String(host.textContent || '').indexOf('LEGACY-LINE') >= 0) legacyHost = host;
    else await sleep(30);
  }
  const legacyMarked = legacyHost && String(legacyHost.getAttribute('data-glance-decision') || '').indexOf(legacyLower) >= 0;
  check('an old lowercase id with no message id still shows the receipt', Boolean(legacyHost) && legacyMarked, { text: chipText(legacyPage.doc), marked: legacyHost && legacyHost.getAttribute('data-glance-decision') });
  const legacyUndo = legacyHost && legacyHost.querySelector('.flow-chip-undo');
  const legacyUndosBefore = legacyPage.sent.filter((m) => {
    if (!m) return false;
    if (m.type === 'flow:undo-action') return true;
    return String(m.method || '').toUpperCase() === 'DELETE';
  }).length;
  if (legacyUndo) legacyUndo.click();
  await sleep(200);
  const legacyText = legacyHost ? String(legacyHost.textContent || '') : '';
  const legacyDeletes = legacyPage.sent.filter((m) => {
    if (!m) return false;
    if (m.type === 'flow:undo-action') return true;
    return String(m.method || '').toUpperCase() === 'DELETE';
  });
  const stillThere = legacyPage.store.glanceProofs && legacyPage.store.glanceProofs.records && legacyPage.store.glanceProofs.records['legacy-row'];
  check("Undo on a legacy case match says Couldn't confirm and deletes nothing",
    Boolean(legacyUndo) && legacyText.indexOf("Couldn't confirm") >= 0 &&
    legacyDeletes.length === legacyUndosBefore &&
    stillThere && stillThere.undone !== true,
    { text: legacyText, deletes: legacyDeletes.length, still: Boolean(stillThere) });
  await sleep(250);
  legacyPage.w.close();

  console.log('\nTOTAL FAILURES:', failures);
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
