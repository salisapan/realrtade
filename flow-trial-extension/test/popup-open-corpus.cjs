// popup.js corpus — the Unified Open Items Surface (the new "Open" tab)
// specifically. popup.js had no tests before this; the file is one large
// IIFE with no module boundary, so exercising the Open tab's real functions
// means actually running popupInit() end to end, same as a real popup load
// would, rather than importing pieces of it in isolation.
//
// The DOM stub auto-vivifies a node for ANY id popup.js asks for — the
// Setup and Activity tabs' own wiring (connectors, recipe import/export,
// memory insight, referral) still runs during popupInit() and must not
// throw, but this corpus only asserts on the Open tab's own behavior:
// rendering FlowStorage.getPending() and the Dismiss action's real,
// DOM-independent storage calls.
//
// Run: node test/popup-open-corpus.cjs

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function makeNode(tag) {
  return {
    tagName: tag,
    className: '',
    id: '',
    type: '',
    textContent: '',
    href: '',
    disabled: false,
    hidden: false,
    value: '',
    children: [],
    parentNode: null,
    attrs: {},
    listeners: {},
    dataset: {},
    style: {},
    appendChild(c) { c.parentNode = this; this.children.push(c); return c; },
    removeChild(c) { this.children = this.children.filter((x) => x !== c); c.parentNode = null; return c; },
    replaceChildren(...cs) { this.children = cs; for (const c of cs) c.parentNode = this; },
    setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return this.attrs[k]; },
    addEventListener(k, fn) { (this.listeners[k] = this.listeners[k] || []).push(fn); },
    querySelectorAll: () => [],
    querySelector: () => null
  };
}

const CORE = path.join(__dirname, '..', 'core');
const SRC = path.join(__dirname, '..', 'src');
const POPUP = path.join(__dirname, '..', 'popup');

function load(stored) {
  const byId = new Map();
  const document = {
    getElementById(id) {
      if (!byId.has(id)) { const n = makeNode('div'); n.id = id; byId.set(id, n); }
      return byId.get(id);
    },
    querySelectorAll: () => [],
    createElement: (t) => makeNode(t)
  };

  let store = JSON.parse(JSON.stringify(stored || {}));
  const chromeStub = {
    storage: {
      local: {
        get: (keysWithDefaults, cb) => {
          const result = {};
          for (const k of Object.keys(keysWithDefaults)) {
            result[k] = Object.prototype.hasOwnProperty.call(store, k) ? store[k] : keysWithDefaults[k];
          }
          cb(result);
        },
        set: (patch, cb) => { Object.assign(store, patch); if (cb) cb(); }
      }
    },
    runtime: {
      sendMessage: (msg, cb) => {
        // popup.js's only two-way call is flow:connector-status; everything
        // else (flow:pending-count, flow:track) is fire-and-forget in the
        // real extension too, so an empty reply is a faithful stub.
        if (cb) cb(msg && msg.type === 'flow:connector-status' ? {} : { ok: true });
      }
    }
  };

  const sandbox = { module: undefined, console, document, chrome: chromeStub, crypto: { randomUUID: () => 'test-uuid' }, navigator: { clipboard: { writeText: async () => {} } } };
  vm.createContext(sandbox);
  // Same file list, same order popup.html actually loads them in — core/
  // modules with storage.js (client-side) spliced in where it belongs, then
  // the chrome-storage-adapter right after execution-memory.js so a real
  // Dismiss persists through the chromeStub above, exactly like it does in
  // the real extension.
  const loadOrder = [
    [CORE, 'domains.js'], [CORE, 'connectors.js'], [CORE, 'extract.js'], [CORE, 'judgment.js'],
    [SRC, 'storage.js'],
    [CORE, 'actions.js'], [CORE, 'execution-memory.js'],
    [SRC, 'chrome-storage-adapter.js']
  ];
  for (const [dir, f] of loadOrder) {
    vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), sandbox, { filename: f });
  }
  return { sandbox, document, store: () => store };
}

let failures = 0;
function check(name, cond, detail) {
  if (cond) { console.log('PASS:', name); }
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

function find(node, cls, out) {
  out = out || [];
  if (String(node.className || '').split(/\s+/).includes(cls)) out.push(node);
  for (const c of node.children) find(c, cls, out);
  return out;
}

async function run() {
  console.log('--- popup.js: Open tab renders every still-open process ---\n');
  {
    const proc = { id: 'reply-track', name: 'Reply & Track', steps: [{ id: 'task' }] };
    const stored = {
      log: [
        { ts: Date.now(), kind: 'shown', messageId: 'm1', process: proc, sender: { name: 'Dana Cole' }, subject: 'Invoice #4', app: 'gmail', threadUrl: 'https://mail.google.com/x/1', intent: { label: 'Log invoice' } },
        { ts: Date.now(), kind: 'shown', messageId: 'm2', process: proc, sender: { email: 'sam@example.com' }, subject: null, threadUrl: 'https://mail.google.com/x/2', intent: {} }
      ]
    };
    const { sandbox, document } = load(stored);
    vm.runInContext(fs.readFileSync(path.join(POPUP, 'popup.js'), 'utf8'), sandbox, { filename: 'popup.js' });
    // popupInit() is a top-level async IIFE — give its microtasks a tick to
    // resolve before asserting on what it rendered.
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    const host = document.getElementById('open-list');
    const rows = find(host, 'log-item');
    check('renders one row per pending process', rows.length === 2, rows.length);

    const empty = document.getElementById('open-empty');
    check('the empty state stays hidden when something is open', empty.hidden === true, empty.hidden);

    const labels = find(host, 'log-label').map((n) => n.textContent);
    check('each row shows the process name', labels.every((l) => l === 'Reply & Track'), labels);

    const subtitles = find(host, 'log-where').map((n) => n.textContent);
    check('a row with a name and subject shows both, joined', subtitles.includes('Dana Cole — Invoice #4'), subtitles);
    check('a row with only an email falls back to it', subtitles.includes('sam@example.com'), subtitles);

    const views = find(host, 'ghost').filter((n) => n.tagName === 'a');
    check('a threadUrl gets a real View link', views.some((v) => v.href === 'https://mail.google.com/x/1'), views.map((v) => v.href));

    const kinds = find(host, 'log-kind').map((n) => n.textContent);
    check('entries logged with an app tag show it, uppercased', kinds.includes('GMAIL'), kinds);
  }

  console.log('\n--- popup.js: Open tab is honestly empty when nothing is pending ---\n');
  {
    const { document } = (() => {
      const l = load({});
      vm.runInContext(fs.readFileSync(path.join(POPUP, 'popup.js'), 'utf8'), l.sandbox, { filename: 'popup.js' });
      return l;
    })();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    const host = document.getElementById('open-list');
    check('no pending processes renders no rows', find(host, 'log-item').length === 0);
    check('the empty state is shown', document.getElementById('open-empty').hidden === false);
  }

  console.log('\n--- popup.js: Dismiss closes the process for good, DOM-independent ---\n');
  {
    const proc = { id: 'reply-track', name: 'Reply & Track', steps: [{ id: 'task' }] };
    const stored = { log: [{ ts: Date.now(), kind: 'shown', messageId: 'm1', process: proc, sender: {}, intent: { label: 'Log it' } }] };
    const { sandbox, document, store } = load(stored);
    vm.runInContext(fs.readFileSync(path.join(POPUP, 'popup.js'), 'utf8'), sandbox, { filename: 'popup.js' });
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    const host = document.getElementById('open-list');
    const dismissBtn = find(host, 'ghost').find((n) => n.tagName === 'button' && n.textContent === 'Dismiss');
    check('a pending row has a Dismiss button', Boolean(dismissBtn));

    (dismissBtn.listeners.click || []).forEach((fn) => fn());
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    const FlowStorage = vm.runInContext('FlowStorage', sandbox);
    check('dismissing from the popup really closes the message', await FlowStorage.hasTerminalOutcome('m1'));
    check('...and it drops out of the pending list', (await FlowStorage.getPending()).length === 0);
    check('the dismissal was actually persisted to storage, not just in memory', (store().log || []).some((e) => e.kind === 'dismissed' && e.messageId === 'm1'));
  }

  console.log('\nTOTAL FAILURES:', failures);
  process.exit(failures ? 1 : 0);
}

run();
