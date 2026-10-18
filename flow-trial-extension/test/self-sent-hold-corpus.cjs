// A new self-sent mail in a thread that already has a handled message
// gets its own task card, with no draft and no calendar step. The
// handled record matches only that mail's legacy message id or rfc Message-ID.
// Run: node test/self-sent-hold-corpus.cjs
// Needs jsdom. Missing jsdom is a failed run.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch (e) {
  console.error('FAIL: jsdom is not installed. The self-sent hold regression cannot run.');
  process.exit(1);
}

const ROOT = path.join(__dirname, '..');
const BODY = 'פגישת תכנון ביום שני 19/10 בשעה 11:00';
const BODY_BET = 'פגישת תכנון ביום שני 19/10 ב-11:00';
const ME = 'me@x.com';
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else {
    failures++;
    console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail).slice(0, 900) : '');
  }
}

const core = { module: undefined, console, Date, URL, URLSearchParams, Intl };
core.globalThis = core;
vm.createContext(core);
for (const f of ['domains.js', 'extract.js', 'judgment.js', 'source-text.js', 'google-closes.js', 'close-families.js', 'fact-reply.js', 'intent.js', 'actions.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'core', f), 'utf8'), core, { filename: f });
}
const FlowIntent = vm.runInContext('FlowIntent', core);
const FlowActions = vm.runInContext('FlowActions', core);
const NOW = new Date(2026, 9, 16, 12, 0, 0);
// The open mail is from the person to the person. inbound false with no
// address is outbound and stays quiet; the card is this self-addressed note.
function selfCtx() {
  return { now: NOW, senderEmail: ME, ownAddresses: [ME], to: [ME], inbound: false };
}
function selfTask(body) {
  const classified = FlowIntent.classify(body, selfCtx());
  const plan = classified && classified.type ? FlowActions.planFor(classified, { text: body }) : null;
  const steps = (plan && plan.steps) || [];
  const task = steps.length > 0 && steps.every((step) => step.kind === 'googleTask' || step.kind === 'googleTasks');
  return { classified, task, steps: steps.map((step) => step.kind) };
}
const sha = selfTask(BODY);
check('פגישת תכנון on Monday 19/10 at 11:00 is a task with no draft',
  sha.classified && sha.classified.type === 'request' && sha.classified.entities && sha.classified.entities.dateIso === '2026-10-19' &&
  sha.classified.entities.hour === 11 && sha.classified.entities.minute === 0 && sha.task,
  { type: sha.classified && sha.classified.type, steps: sha.steps, entities: sha.classified && sha.classified.entities });
const bet = selfTask(BODY_BET);
check('פגישת תכנון on Monday 19/10 at ב-11:00 is a task with no draft',
  bet.classified && bet.classified.type === 'request' && bet.classified.entities && bet.classified.entities.dateIso === '2026-10-19' &&
  bet.classified.entities.hour === 11 && bet.classified.entities.minute === 0 && bet.task,
  { type: bet.classified && bet.classified.type, steps: bet.steps, entities: bet.classified && bet.classified.entities });

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

function attachChrome(w, store, lang, errors) {
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
        if (msg && msg.type === 'flow:google-verify') result = { ok: true, states: (msg.steps || []).map(() => 'present') };
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
  w.__errors = errors;
  w.__sent = sent;
}

function page(html, store, lang) {
  const dom = new JSDOM(html, { url: 'https://mail.google.com/mail/u/0/#inbox', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  const fixed = new Date(2026, 9, 16, 12, 0, 0).getTime();
  class FixedDate extends w.Date {
    constructor(...a) { if (a.length === 0) super(fixed); else super(...a); }
    static now() { return fixed; }
  }
  w.Date = FixedDate;
  Object.defineProperty(w.HTMLElement.prototype, 'innerText', {
    get() { return this.textContent || ''; }
  });
  w.TextEncoder = TextEncoder;
  w.TextDecoder = TextDecoder;
  if (!w.crypto || !w.crypto.subtle) Object.defineProperty(w, 'crypto', { value: require('crypto').webcrypto });
  const errors = [];
  w.addEventListener('error', (e) => errors.push(String(e.error && e.error.message || e.message)));
  w.console = { log() {}, info() {}, debug() {}, warn(...a) { errors.push(a.map(String).join(' ')); }, error(...a) { errors.push(a.map(String).join(' ')); } };
  attachChrome(w, store, lang, errors);
  const ctx = dom.getInternalVMContext();
  for (const file of scripts()) {
    new vm.Script(fs.readFileSync(path.join(ROOT, file), 'utf8'), { filename: file }).runInContext(ctx);
  }
  return { w, doc: w.document, errors, close() { w.close(); } };
}

function gmailFixture(body) {
  const text = body || BODY;
  return `<!doctype html><html><body>
    <a aria-label="Google Account: Me (${ME})" href="https://accounts.google.com/SignOutOptions"></a>
    <h2 class="hP">${text}</h2>
    <div role="main">
      <div role="listitem" data-legacy-thread-id="thread-plan" data-legacy-message-id="m-old" data-rfc822msgid="&lt;m-old@mail.gmail.com&gt;">
        <span email="dana@example.com" name="Dana">Dana</span>
        <span email="${ME}">me</span>
        <div class="a3s">Thanks, see you then.</div>
      </div>
      <div role="listitem" data-legacy-thread-id="thread-plan" data-legacy-message-id="m-new" data-rfc822msgid="&lt;m-new@mail.gmail.com&gt;">
        <span email="${ME}" name="Me">Me</span>
        <div>to <span email="${ME}">me</span></div>
        <div class="a3s">${text}</div>
      </div>
    </div>
  </body></html>`;
}

function laneRow() {
  return {
    expires: Date.now() + 86400000,
    steps: [{ connectorId: 'googleHold', ref: { eventId: 'e-old', contentHash: 'h', calendarId: 'primary' }, line: 'Calendar · old', undoLine: 'Calendar event removed.' }],
    ids: ['m-old', 'm-new', 'scan:thread-plan', BODY, '<m-new@mail.gmail.com>']
  };
}

function shown(id, subject, intent, process) {
  return {
    kind: 'shown', messageId: id, app: 'gmail', ts: NOW.getTime(),
    subject: subject, sender: { name: 'Dana', email: 'dana@example.com' },
    intent: intent, process: process
  };
}

(async () => {
  const row = laneRow();
  const store = {
    onboarded: true,
    connectorId: 'googleTasks',
    log: [],
    resolvedMessageIds: ['scan:thread-plan', 'm-old'],
    glanceLaneUndo: {
      'm-old': row,
      'thread-plan': row,
      [BODY]: row
    }
  };
  const held = page(gmailFixture(), store, 'en');
  await sleep(900);
  const fresh = held.doc.querySelector('[data-legacy-message-id="m-new"]');
  const old = held.doc.querySelector('[data-legacy-message-id="m-old"]');
  const card = fresh && fresh.querySelector('.flow-chip-host');
  const text = card ? String(card.textContent || '').replace(/\s+/g, ' ') : '';
  check('a new self-sent mail in a handled thread gets a task card',
    !!card && card.getAttribute('data-glance-chain') !== 'lane-proof' &&
    /To Do/.test(text) && /Do It/.test(text) &&
    !/Putting this on your calendar|Scheduling this|Handled\.|Nothing to close|טופל/.test(text),
    { text, chain: card && card.getAttribute('data-glance-chain'), errors: held.errors });
  check('the older message keeps its own Handled receipt',
    !!(old && old.querySelector('.flow-chip-handled')) && old.querySelector('.flow-chip-handled').textContent === 'Handled.',
    old && old.textContent);
  check('the new card is not the old receipt',
    held.errors.length === 0, held.errors);
  held.close();

  const betPage = page(gmailFixture(BODY_BET), store, 'en');
  await sleep(900);
  const betCard = betPage.doc.querySelector('[data-legacy-message-id="m-new"] .flow-chip-host');
  const betText = betCard ? String(betCard.textContent || '').replace(/\s+/g, ' ') : '';
  check('פגישת תכנון ב-11:00 on a self-sent mail gets a task card',
    !!betCard && betCard.getAttribute('data-glance-chain') !== 'lane-proof' &&
    /To Do/.test(betText) && /Do It/.test(betText) &&
    !/Putting this on your calendar|Scheduling this/.test(betText),
    { text: betText, errors: betPage.errors });
  betPage.close();

  const ask = 'Please follow up with Dana about the invoice.';
  const intent = FlowIntent.classify(ask, { now: NOW, senderEmail: 'dana@example.com', inbound: true });
  const askPlan = FlowActions.planFor(intent, {});
  async function panel(lang) {
    const bag = {
      onboarded: true,
      connectorId: 'googleTasks',
      briefLastShownDate: new Date(2026, 9, 16, 12, 0, 0).toDateString(),
      log: [
        shown('m-handled', 'Invoice handled', intent, askPlan),
        shown('m-open', 'Invoice still open', intent, askPlan)
      ],
      glanceLaneUndo: {
        'm-handled': {
          expires: Date.now() + 86400000,
          steps: [{ connectorId: 'googleLaneTask', ref: { taskId: 't-h', taskListId: 'L', contentHash: 'h' }, line: 'Google Task · Invoice', undoLine: 'Google Task removed.' }]
        }
      }
    };
    const html = '<!doctype html><html><body><h2 class="hP">Inbox</h2><div role="main"></div></body></html>';
    const view = page(html, bag, lang);
    await sleep(900);
    const indicator = view.doc.getElementById('flow-brief-indicator-host');
    if (indicator) indicator.click();
    await sleep(50);
    const head = view.doc.querySelector('.flow-brief-panel-head-label');
    const rows = Array.from(view.doc.querySelectorAll('.flow-brief-row'));
    const ids = rows.map((r) => r.getAttribute('data-message-id'));
    const handledCard = view.doc.querySelector('.flow-chip-handled');
    return { head: head && head.textContent, ids, rows, errors: view.errors, handled: handledCard && handledCard.textContent, close: () => view.close() };
  }

  const en = await panel('en');
  check('English UI uses one English header and keeps a handled mail out of Do It',
    en.head === 'Still open' && en.ids.indexOf('m-handled') < 0 && en.ids.indexOf('m-open') >= 0 &&
    en.rows.some((r) => r.getAttribute('data-message-id') === 'm-open' && r.querySelector('.flow-brief-doit')),
    en);
  en.close();
  const he = await panel('he');
  check('Hebrew UI uses one Hebrew header and the same handled record',
    he.head === 'מה עדיין פתוח' && !/Still open/.test(he.head || '') && he.ids.indexOf('m-handled') < 0 && he.ids.indexOf('m-open') >= 0,
    he);
  check('the panel boots with no console errors', en.errors.length === 0 && he.errors.length === 0, { en: en.errors, he: he.errors });
  he.close();

  if (failures) {
    console.log('\n' + failures + ' failed');
    process.exit(1);
  }
  console.log('\nall passed');
})().catch((e) => {
  console.log('FAIL: self-sent hold threw', e);
  process.exit(1);
});
