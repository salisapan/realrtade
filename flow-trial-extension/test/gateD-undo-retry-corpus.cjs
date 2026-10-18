// AI Engineer's Gate D. jsdom loads the manifest content scripts over one
// persistent chrome.storage.local. UI=en and UI=he.
// Run: node test/gateD-undo-retry-corpus.cjs
// Needs jsdom. Missing jsdom is a failed run.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch (e) {
  console.error('FAIL: jsdom is not installed. Gate D cannot run.');
  process.exit(1);
}

const ROOT = path.join(__dirname, '..');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else {
    failures++;
    console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail).slice(0, 900) : '');
  }
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function scripts() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8')).content_scripts[0].js;
}

function materialize(store, keys) {
  const snap = {};
  Object.keys(store).forEach((k) => { if (k.charAt(0) !== '_') snap[k] = store[k]; });
  if (keys == null) return snap;
  if (typeof keys === 'string') return { [keys]: snap[keys] };
  if (Array.isArray(keys)) {
    const out = {};
    keys.forEach((k) => { out[k] = snap[k]; });
    return out;
  }
  const out = {};
  Object.keys(keys).forEach((k) => { out[k] = snap[k] !== undefined ? snap[k] : keys[k]; });
  return out;
}

function html(messageId) {
  return `<!doctype html><html><body>
    <h2 class="hP">Call</h2>
    <div role="main">
      <div role="listitem" data-legacy-message-id="${messageId}" data-legacy-thread-id="thread-1">
        <span email="me@x.com" name="Me">me</span>
        <div class="a3s">Please hold Thursday at 14:00 and call Dana.</div>
      </div>
    </div>
  </body></html>`;
}

function boot(store, lang, messageId) {
  const dom = new JSDOM(html(messageId), {
    url: 'https://mail.google.com/mail/u/0/#inbox',
    runScripts: 'outside-only',
    pretendToBeVisual: true
  });
  const w = dom.window;
  Object.defineProperty(w.HTMLElement.prototype, 'innerText', {
    get() { return this.textContent || ''; }
  });
  w.TextEncoder = TextEncoder;
  w.TextDecoder = TextDecoder;
  if (!w.crypto || !w.crypto.subtle) Object.defineProperty(w, 'crypto', { value: require('crypto').webcrypto });
  const errors = [];
  const uncaught = [];
  w.addEventListener('error', (e) => uncaught.push(String(e.error && e.error.stack || e.message)));
  w.console = {
    log() {}, info() {}, debug() {},
    warn(...a) { errors.push(a.map(String).join(' ')); },
    error(...a) { errors.push(a.map(String).join(' ')); }
  };
  const sent = [];
  w.chrome = {
    runtime: {
      id: 'ext', lastError: null, getURL: (s) => s,
      getManifest: () => ({ version: '0.9.56' }),
      onMessage: { addListener() {} },
      sendMessage(msg, cb) {
        sent.push(msg);
        let result = { ok: true };
        if (msg && msg.type === 'flow:connector-status') result = { googleTasks: { connected: true, configured: true } };
        if (msg && msg.type === 'flow:pro-status') result = { ok: true, active: false };
        if (msg && msg.type === 'flow:google-undo') {
          const fail = store._fail && store._fail[msg.connectorId];
          if (fail === 500) result = { ok: false, status: 500 };
          else if (fail === 'edited') result = { ok: false, reason: 'user-edited' };
          else result = { ok: true };
        }
        if (cb) setTimeout(() => cb(result), 0);
        return Promise.resolve(result);
      }
    },
    storage: {
      local: {
        get(keys, cb) {
          const result = materialize(store, keys);
          const p = Promise.resolve(result);
          if (typeof cb === 'function') p.then((value) => cb(value));
          return p;
        },
        set(patch, cb) {
          Object.assign(store, JSON.parse(JSON.stringify(patch)));
          if (typeof cb === 'function') setTimeout(cb, 0);
          return Promise.resolve();
        },
        remove(keys, cb) {
          [].concat(keys).forEach((k) => { delete store[k]; });
          if (typeof cb === 'function') setTimeout(cb, 0);
          return Promise.resolve();
        }
      },
      onChanged: { addListener() {} }
    },
    i18n: { getUILanguage: () => lang, getMessage: () => '' }
  };
  const ctx = dom.getInternalVMContext();
  for (const file of scripts()) {
    new vm.Script(fs.readFileSync(path.join(ROOT, file), 'utf8'), { filename: file }).runInContext(ctx);
  }
  return {
    w, doc: w.document, errors, uncaught, sent,
    close() { w.close(); }
  };
}

function step(connectorId, ref, line) {
  return { connectorId, ref, line, undoLine: connectorId === 'googleHold' ? 'Calendar event removed.' : 'Google Task removed.' };
}

function twoSteps() {
  return [
    step('googleHold', { eventId: 'e1', contentHash: 'h', calendarId: 'primary' }, 'Calendar · Call Thu 14:00'),
    step('googleLaneTask', { taskId: 't1', taskListId: 'glance-list', contentHash: 'h2' }, 'Google Task · Call Dana')
  ];
}

function hosts(doc) {
  return Array.from(doc.querySelectorAll('.flow-chip-host'));
}
function text(node) {
  return node ? String(node.textContent || '').replace(/\s+/g, ' ').trim() : '';
}
function undos(sent) {
  return sent.filter((msg) => msg && msg.type === 'flow:google-undo');
}
function record(store, id) {
  const bag = store.glanceLaneUndo || {};
  return bag[id] || null;
}

async function open(store, lang, id) {
  const view = boot(store, lang, id);
  await sleep(800);
  return view;
}

async function run(lang) {
  const he = lang === 'he';
  const handled = he ? 'טופל.' : 'Handled.';
  const undoAll = he ? 'בטל הכל' : 'Undo all';
  const undo = he ? 'בטל' : 'Undo';
  const tryAgain = he ? 'נסה שוב' : 'Try again';
  const calendarFailed = he ? 'היומן נכשל.' : 'Calendar failed.';
  const taskRemoved = he ? 'משימת Google הוסרה.' : 'Google Task removed.';
  const calendarRemoved = he ? 'אירוע היומן הוסר.' : 'Calendar event removed.';
  const edited = he ? 'שינית את זה. Undo השאיר אותו כמו שהוא.' : 'You edited this. Undo left it alone.';
  const store = {
    onboarded: true,
    connectorId: 'googleTasks',
    log: [],
    glanceLaneUndo: {
      m1: { expires: Date.now() + 86400000, steps: twoSteps(), ids: ['m1'] }
    },
    _fail: { googleHold: 500 }
  };
  let view = await open(store, lang, 'm1');
  let host = hosts(view.doc);
  let body = text(host[0]);
  const englishChrome = /Handled\.|Undo all|Try again|Undoing|Calendar failed\./;
  check('[' + lang + ' 3] a reload shows Handled and Undo all for both steps',
    host.length === 1 && view.doc.querySelector('.flow-chip-handled') &&
    view.doc.querySelector('.flow-chip-handled').textContent === handled &&
    view.doc.querySelector('.flow-chip-undo') && view.doc.querySelector('.flow-chip-undo').textContent === undoAll &&
    body.indexOf('Calendar · Call Thu 14:00') >= 0 && body.indexOf('Google Task · Call Dana') >= 0 &&
    (!he || !englishChrome.test(body)),
    { hosts: host.length, body, errors: view.errors, uncaught: view.uncaught });

  const before = view.sent.length;
  view.doc.querySelector('.flow-chip-undo').click();
  await sleep(400);
  const batch = undos(view.sent.slice(before));
  body = text(hosts(view.doc)[0]);
  check('[' + lang + ' 1] Calendar 500 undoes the task first and names Calendar, not a missed task',
    batch.length === 2 && batch[0].connectorId === 'googleLaneTask' && batch[0].ref.taskId === 't1' &&
    batch[1].connectorId === 'googleHold' && batch[1].ref.eventId === 'e1' &&
    body.indexOf(calendarFailed) >= 0 && body.indexOf(taskRemoved) >= 0 &&
    body.indexOf('was not removed') < 0 && body.indexOf('לא הוסרה') < 0 &&
    body.indexOf(tryAgain) >= 0,
    { batch: batch.map((m) => m.connectorId), body });
  const left = record(store, 'm1');
  check('[' + lang + ' 2] the stored record is only the calendar hold and Try again is up',
    left && left.steps && left.steps.length === 1 && left.steps[0].connectorId === 'googleHold' &&
    view.doc.querySelector('.flow-chip-undo').textContent === tryAgain,
    left && left.steps);

  store._fail = {};
  const retryAt = view.sent.length;
  view.doc.querySelector('.flow-chip-undo').click();
  await sleep(400);
  const retry = undos(view.sent.slice(retryAt));
  body = text(view.doc.querySelector('.flow-chip-host'));
  check('[' + lang + ' 2] Try again calls only the calendar hold, then clears the record',
    retry.length === 1 && retry[0].connectorId === 'googleHold' && retry[0].ref.eventId === 'e1' &&
    body.indexOf(calendarRemoved) >= 0 && !view.doc.querySelector('.flow-chip-undo') && !record(store, 'm1'),
    { retry, body, left: record(store, 'm1') });
  view.close();

  store.glanceLaneUndo = {
    m1: { expires: Date.now() + 86400000, steps: [twoSteps()[0]], ids: ['m1'] }
  };
  store._fail = {};
  view = await open(store, lang, 'm1');
  host = hosts(view.doc);
  body = text(host[0]);
  const button = view.doc.querySelector('.flow-chip-undo');
  check('[' + lang + ' 2/7] a partial reload is one Handled host and a single Undo for the calendar',
    host.length === 1 && view.doc.querySelector('.flow-chip-handled').textContent === handled &&
    body.indexOf('Calendar · Call Thu 14:00') >= 0 && body.indexOf('Google Task · Call Dana') < 0 &&
    button && button.textContent === undo && (!he || !englishChrome.test(body)),
    { hosts: host.length, body });
  const reloadAt = view.sent.length;
  button.click();
  await sleep(400);
  const only = undos(view.sent.slice(reloadAt));
  check('[' + lang + ' 2/7] that Undo runs only the calendar hold',
    only.length === 1 && only[0].connectorId === 'googleHold' && !undos(view.sent.slice(reloadAt)).some((m) => m.connectorId === 'googleLaneTask'),
    only.map((m) => m.connectorId));
  view.close();

  store.glanceLaneUndo = {
    m9: {
      expires: Date.now() + 86400000,
      steps: [step('googleLaneTask', { taskId: 't9', taskListId: 'glance-list', contentHash: 'h9' }, 'Google Task · Call Dana')],
      ids: ['m9']
    }
  };
  store._fail = {};
  view = await open(store, lang, 'm9');
  button && null;
  const undoBtn = view.doc.querySelector('.flow-chip-undo');
  check('[' + lang + ' 7] reopening m9 shows Handled and Undo',
    hosts(view.doc).length === 1 && view.doc.querySelector('.flow-chip-handled').textContent === handled &&
    undoBtn && undoBtn.textContent === undo,
    text(hosts(view.doc)[0]));
  const taskAt = view.sent.length;
  undoBtn.click();
  await sleep(300);
  const taskUndo = undos(view.sent.slice(taskAt));
  check('[' + lang + ' 7] Undo removes that task',
    taskUndo.length === 1 && taskUndo[0].connectorId === 'googleLaneTask' && taskUndo[0].ref.taskId === 't9' &&
    text(view.doc.querySelector('.flow-chip-host')).indexOf(taskRemoved) >= 0,
    taskUndo);
  view.close();

  store.glanceLaneUndo = {
    m9: {
      expires: Date.now() + 86400000,
      steps: [step('googleLaneTask', { taskId: 't9', taskListId: 'glance-list', contentHash: 'h9' }, 'Google Task · Call Dana')],
      ids: ['m9']
    }
  };
  const first = await open(store, lang, 'm9');
  const second = await open(store, lang, 'm9');
  check('[' + lang + ' 7b] reopening twice shows the receipt and does not call Undo',
    first.doc.querySelector('.flow-chip-handled').textContent === handled &&
    second.doc.querySelector('.flow-chip-handled').textContent === handled &&
    undos(first.sent).length === 0 && undos(second.sent).length === 0,
    { first: undos(first.sent).length, second: undos(second.sent).length });
  const quiet = first.errors.concat(first.uncaught, second.errors, second.uncaught, view.errors, view.uncaught);
  check('[' + lang + ' ] no console or uncaught errors', quiet.length === 0, quiet);
  first.close();
  second.close();

  store.glanceLaneUndo = {
    m1: {
      expires: Date.now() + 86400000,
      steps: twoSteps(),
      ids: ['m1']
    }
  };
  store._fail = { googleLaneTask: 'edited' };
  view = await open(store, lang, 'm1');
  view.doc.querySelector('.flow-chip-undo').click();
  await sleep(400);
  body = text(view.doc.querySelector('.flow-chip-host'));
  check('[' + lang + ' ] an edited step shows the refusal line and no Try again',
    body.indexOf(edited) >= 0 && body.indexOf(calendarRemoved) >= 0 && body.indexOf(tryAgain) < 0 &&
    !view.doc.querySelector('.flow-chip-undo'),
    body);
  quiet.push.apply(quiet, view.errors.concat(view.uncaught));
  check('[' + lang + ' ] the edited refusal adds no console errors', view.errors.length === 0 && view.uncaught.length === 0, view.errors.concat(view.uncaught));
  view.close();
}

(async () => {
  await run('en');
  await run('he');
  if (failures) {
    console.log('\n' + failures + ' failed');
    process.exit(1);
  }
  console.log('\nall passed');
})().catch((e) => {
  console.log('FAIL: gate D threw', e);
  process.exit(1);
});
