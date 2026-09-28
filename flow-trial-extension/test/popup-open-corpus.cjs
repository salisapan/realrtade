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
    querySelector: () => null,
    // exportRecipe() (Setup tab's own Export button, and the referral card's
    // "Export your setup for them") builds a real <a> and calls .click() on
    // it to trigger the download — a no-op here is all a headless stub needs.
    click() {}
  };
}

const CORE = path.join(__dirname, '..', 'core');
const SRC = path.join(__dirname, '..', 'src');
const POPUP = path.join(__dirname, '..', 'popup');

function load(stored, opts) {
  opts = opts || {};
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
        // Two real callers, two real calling conventions — both genuinely
        // supported by chrome.storage.local, not two different stubs papering
        // over one: storage.js passes an object of keys-with-defaults plus a
        // callback; chrome-storage-adapter.js (execution-memory.js's own
        // client-side adapter) passes a single string key and awaits a
        // Promise instead, with no defaults concept at all. A stub that only
        // implements the callback half silently starves anything that reads
        // Execution Memory through the popup — `await undefined` resolves
        // immediately, indistinguishable from "no memory yet."
        get: (keysWithDefaults, cb) => {
          const isString = typeof keysWithDefaults === 'string';
          const keys = isString ? [keysWithDefaults] : Object.keys(keysWithDefaults);
          const result = {};
          for (const k of keys) {
            result[k] = Object.prototype.hasOwnProperty.call(store, k)
              ? store[k]
              : (isString ? undefined : keysWithDefaults[k]);
          }
          if (cb) { cb(result); return; }
          return Promise.resolve(result);
        },
        set: (patch, cb) => { Object.assign(store, patch); if (cb) { cb(); return; } return Promise.resolve(); }
      }
    },
    runtime: {
      sendMessage: (msg, cb) => {
        // popup.js's only two-way call is flow:connector-status; everything
        // else (flow:pending-count, flow:track) is fire-and-forget in the
        // real extension too, so an empty reply is a faithful stub.
        // flow:undo-action is the exception the Activity row waits on.
        if (msg && msg.type === 'flow:undo-action') {
          if (cb) cb({ ok: opts.undoOk !== false });
          return;
        }
        if (cb) cb(msg && msg.type === 'flow:connector-status' ? {} : { ok: true });
      }
    }
  };

  // Blob/URL: only exportRecipe() (Setup tab and, since this session's growth
  // work, the referral card) needs these — real objects are pointless here,
  // just enough surface that the call doesn't throw ReferenceError.
  const sandbox = {
    module: undefined, console, document, chrome: chromeStub,
    crypto: { randomUUID: () => 'test-uuid' },
    navigator: { clipboard: { writeText: async () => {} } },
    Blob: class { constructor(parts, opts) { this.parts = parts; this.type = opts && opts.type; } },
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL: () => {} },
    // Both button-confirmation resets (referralCopy's "Copied", and this
    // session's referralExportRecipe's "Exported") use the real setTimeout —
    // Node's own is a faithful stand-in, not a stub that needs its own logic.
    setTimeout, clearTimeout
  };
  vm.createContext(sandbox);
  // Same file list, same order popup.html actually loads them in — core/
  // modules with storage.js (client-side) spliced in where it belongs, then
  // the chrome-storage-adapter right after execution-memory.js so a real
  // Dismiss persists through the chromeStub above, exactly like it does in
  // the real extension.
  const loadOrder = [
    [CORE, 'domains.js'], [CORE, 'connectors.js'], [CORE, 'extract.js'], [CORE, 'judgment.js'],
    [CORE, 'close-quality-metrics.js'],
    [SRC, 'storage.js'],
    [CORE, 'actions.js'], [CORE, 'execution-memory.js'],
    [SRC, 'chrome-storage-adapter.js'],
    [SRC, 'receipt-copy.js']
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
    const quality = store().closeQuality;
    check('dismissing the chip fires one false-Do-It', quality && quality.falseDoIt === 1 && quality.recent[0].kind === 'falseDoIt' && quality.recent[0].reason === 'dismiss', quality);
  }

  console.log('\n--- popup.js: the referral card offers exporting the real setup, not just a link ---\n');
  {
    // Reuses the exact same "earned trust" gate the referral link already
    // has (3+ real writes, storage.js's own writeCountsFrom) rather than a
    // second dismissible surface — see wireReferral()'s own comment on why
    // this lives inside the existing card instead of a new one.
    const stored = { writeStats: { total: 3, recent: [] }, domainId: 'sales', connectorId: 'googleTasks' };
    const { sandbox, document } = load(stored);
    vm.runInContext(fs.readFileSync(path.join(POPUP, 'popup.js'), 'utf8'), sandbox, { filename: 'popup.js' });
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    const referral = document.getElementById('referral');
    check('the referral card is shown after 3 real writes', referral.hidden === false);

    const exportBtn = document.getElementById('referralExportRecipe');
    let threw = null;
    try { (exportBtn.listeners.click || []).forEach((fn) => fn()); } catch (e) { threw = e; }
    check('clicking it exports the real setup without throwing', threw === null, threw && String(threw));
    check('it confirms the export the same way Setup tab\'s own button does', exportBtn.textContent === 'Exported', exportBtn.textContent);
  }

  console.log('\n--- popup.js: importing a recipe applies it instead of silently throwing ---\n');
  {
    // Regression guard for a real bug: the import handler's success path
    // called renderDomains() — a function that had been deleted along with
    // the domain-picker UI it used to refresh (domain selection moved out
    // of onboarding; see wireSave()'s own comment). That reference threw
    // BEFORE either noteRecipe() call below it ever ran, so a real recipe
    // import silently did nothing visible in the popup — not even an error
    // — while still writing to storage first if a domain field validated.
    // Today's own Export button only ever sets connectorId now (also
    // fixed alongside this, in exportRecipe() — see that function's own
    // comment), so this is also the shape every real recipe this product
    // currently produces actually has.
    const stored = { connectorId: null };
    const { sandbox, document } = load(stored);
    vm.runInContext(fs.readFileSync(path.join(POPUP, 'popup.js'), 'utf8'), sandbox, { filename: 'popup.js' });
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    const input = document.getElementById('recipeImport');
    // connectorLabel here is stale on purpose — the popup looks up the
    // LIVE connector's own label from FLOW_CONNECTORS rather than trusting
    // whatever label an old .glance recipe file happens to carry (see
    // core/connectors.js: this catalog entry's label was renamed
    // 'Google Tasks' -> 'Google' so the setup card's title accurately
    // scopes to what the one sign-in actually grants — Tasks, Calendar,
    // and Gmail drafts together, not Tasks alone). A recipe exported
    // before that rename still says the old label; the confirmation text
    // must show the current one regardless.
    const fakeFile = { text: async () => JSON.stringify({ flowRecipe: 1, connectorId: 'googleTasks', connectorLabel: 'Google Tasks' }) };
    let threw = null;
    try {
      await Promise.all((input.listeners.change || []).map((fn) => fn({ target: { files: [fakeFile], value: '' } })));
    } catch (e) { threw = e; }
    check('importing a real recipe does not throw', threw === null, threw && String(threw));

    const note = document.getElementById('recipeNote');
    check('it shows a real confirmation, not silence', note.hidden === false);
    check('the confirmation names the live connector label, not the stale one from the imported recipe', note.textContent.includes('Google') && !note.textContent.includes('Google Tasks'), note.textContent);
    check('it is shown as success, not an error', note.style.color === 'var(--ok)', note.style.color);
  }

  console.log('\n--- popup.js: importing a recipe for a dormant (non-MVP) connector never points at a card that isn\'t there ---\n');
  {
    // Same dead-end class as background.js's own connector-error fix from
    // this pass, reached through a different door: notion has real,
    // working connect code (background.js's WRITERS/UNDOERS) but carries
    // no `mvp` flag, so renderConnectors() never gives it a card on this
    // screen (see core/connectors.js's own header comment). Telling the
    // user to "Connect Notion above" would send them looking for a button
    // that was never rendered.
    const { sandbox, document } = load({});
    vm.runInContext(fs.readFileSync(path.join(POPUP, 'popup.js'), 'utf8'), sandbox, { filename: 'popup.js' });
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    const input = document.getElementById('recipeImport');
    const fakeFile = { text: async () => JSON.stringify({ flowRecipe: 1, connectorId: 'notion', connectorLabel: 'Notion' }) };
    await Promise.all((input.listeners.change || []).map((fn) => fn({ target: { files: [fakeFile], value: '' } })));

    const note = document.getElementById('recipeNote');
    check('it still confirms the load', note.hidden === false, note);
    check('it never tells the user to connect a card that was never shown', !note.textContent.includes('Connect Notion above'), note.textContent);
  }

  console.log('\n--- popup.js: an invalid recipe file is still rejected, not silently accepted ---\n');
  {
    const { sandbox, document } = load({});
    vm.runInContext(fs.readFileSync(path.join(POPUP, 'popup.js'), 'utf8'), sandbox, { filename: 'popup.js' });
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    const input = document.getElementById('recipeImport');
    const fakeFile = { text: async () => 'not json at all' };
    await Promise.all((input.listeners.change || []).map((fn) => fn({ target: { files: [fakeFile], value: '' } })));

    const note = document.getElementById('recipeNote');
    check('garbage input is rejected with a real error, not a crash or silent success', note.hidden === false && note.style.color === 'var(--err)', [note.hidden, note.style.color]);
  }

  console.log('\n--- popup.js: exportRecipe() no longer fabricates a domain nobody chose ---\n');
  {
    // Regression guard for a related state-truthfulness bug in the same
    // area: domain selection isn't a live onboarding question anymore
    // (wireSave() deliberately leaves domainId unset), but exportRecipe()
    // used to default an unset domainId to 'sales' unconditionally — every
    // account's exported recipe claimed a domain choice that was never
    // actually made, lawyer or doctor accounts included.
    const stored = { connectorId: 'googleTasks' }; // no domainId set — the real, common MVP case
    const { sandbox, document } = load(stored);
    let captured = null;
    sandbox.URL.createObjectURL = (blob) => { captured = blob; return 'blob:test'; };
    vm.runInContext(fs.readFileSync(path.join(POPUP, 'popup.js'), 'utf8'), sandbox, { filename: 'popup.js' });
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    const exportBtn = document.getElementById('recipeExport');
    (exportBtn.listeners.click || []).forEach((fn) => fn());

    const recipe = JSON.parse(captured.parts[0]);
    check('the exported recipe carries the real connector', recipe.connectorId === 'googleTasks', recipe);
    check('it does not fabricate a domain that was never chosen', !('domainId' in recipe), recipe);
  }

  console.log('\n--- popup.js: the memory-insight card renders instead of throwing ---\n');
  {
    // Regression guard for a real bug: STEP_NOUNS was declared as a `const`
    // AFTER renderLog()/renderMemoryInsight() were already called earlier in
    // the same popupInit() function body — a `const` is in the temporal dead
    // zone until its own statement runs, same as the `let currentInsight`
    // bug this file's own comment already documents fixing. Because
    // STEP_NOUNS is only read after renderMemoryInsight's own
    // `if (!currentInsight) return` guard, this stayed hidden through every
    // popup open that had nothing to show — and threw ReferenceError,
    // aborting the rest of popupInit() silently, the first time Execution
    // Memory actually had something to say.
    const makeEvent = (status) => ({ intentionId: 'm' + Math.random(), processType: 'reply-track', steps: ['task'], status, scope: status === 'dismissed' ? 'partial' : null, timestamp: new Date().toISOString() });
    const stored = { flowExecutionEvents: [makeEvent('dismissed'), makeEvent('dismissed'), makeEvent('dismissed')] };
    const { sandbox, document } = load(stored);
    vm.runInContext(fs.readFileSync(path.join(POPUP, 'popup.js'), 'utf8'), sandbox, { filename: 'popup.js' });
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    const card = document.getElementById('memoryInsight');
    check('the insight card renders instead of the popup throwing', card.hidden === false);
    const text = document.getElementById('memoryInsightText').textContent;
    check('it names the actual step and the human process name, not the raw id',
      text.includes('the Task step') && text.includes('Reply & Track'), text);
  }

  console.log('\n--- popup.js: the Activity tab surfaces compounding Execution Memory value ---\n');
  {
    // Three real dismissals of the same non-anchor step, no acceptances —
    // exactly the sample size and shape FlowActions.isNetRejected() (and so
    // applyMemory()) already treats as a real, acted-on preference, not
    // noise. renderLearned() must count this the same way or its claim
    // could disagree with what the live chip is actually doing.
    const makeEvent = (status) => ({ intentionId: 'm' + Math.random(), processType: 'reply-track', steps: ['task'], status, scope: status === 'dismissed' ? 'partial' : null, timestamp: new Date().toISOString() });
    const stored = { flowExecutionEvents: [makeEvent('dismissed'), makeEvent('dismissed'), makeEvent('dismissed')] };
    const { sandbox, document } = load(stored);
    vm.runInContext(fs.readFileSync(path.join(POPUP, 'popup.js'), 'utf8'), sandbox, { filename: 'popup.js' });
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    const el = document.getElementById('learnedStat');
    check('the learned-stat line is shown once a real preference exists', el.hidden === false);
    check('it states the count in plain language', el.textContent === 'Glance has adjusted 1 thing about how it works for you.', el.textContent);
  }

  console.log('\n--- popup.js: a fresh account with no Execution Memory shows nothing ---\n');
  {
    // Zero learned preferences is the common, correct state for a new
    // install — it must stay silent rather than announce "0 things
    // learned," which would read as the product failing at the one thing
    // this line exists to reassure about.
    const { sandbox, document } = load({});
    vm.runInContext(fs.readFileSync(path.join(POPUP, 'popup.js'), 'utf8'), sandbox, { filename: 'popup.js' });
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    const el = document.getElementById('learnedStat');
    check('the learned-stat line stays hidden with nothing learned yet', el.hidden === true);
  }

  console.log('\n--- popup.js: a written log row reads as Handled and still offers Undo ---\n');
  {
    const stored = {
      log: [
        { ts: Date.now(), kind: 'written', label: 'Log the invoice', messageId: 'm1', where: 'Google Tasks', url: 'https://tasks.google.com/x', ref: { taskId: 't1' }, connectorId: 'googleTask' },
        { ts: Date.now() - 1000, kind: 'undone', label: 'Log the invoice', messageId: 'm0' }
      ]
    };
    const { sandbox, document } = load(stored);
    vm.runInContext(fs.readFileSync(path.join(POPUP, 'popup.js'), 'utf8'), sandbox, { filename: 'popup.js' });
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    const host = document.getElementById('log-list');
    const kinds = find(host, 'log-kind').map((n) => n.textContent);
    check('a written row is labeled Handled, not the stored kind', kinds.includes('Handled'), kinds);
    check('an undone row is labeled Undone', kinds.includes('Undone'), kinds);
    const undo = find(host, 'ghost').find((n) => n.tagName === 'button' && n.textContent === 'Undo');
    check('the written row still has an Undo button', Boolean(undo));
    const hint = find(host, 'log-undo-note').map((n) => n.textContent);
    check('the row says Undo removes the Google Task', hint.indexOf('Undo removes the Google Task.') !== -1, hint);
  }

  console.log('\n--- popup.js: a failed Undo keeps the button and says the record is still there ---\n');
  {
    const stored = {
      log: [
        { ts: Date.now(), kind: 'written', label: 'Log the invoice', messageId: 'm1', where: 'Google Tasks', url: 'https://tasks.google.com/x', ref: { taskId: 't1' }, connectorId: 'googleTask' }
      ]
    };
    const { sandbox, document } = load(stored, { undoOk: false });
    vm.runInContext(fs.readFileSync(path.join(POPUP, 'popup.js'), 'utf8'), sandbox, { filename: 'popup.js' });
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    const host = document.getElementById('log-list');
    const undo = find(host, 'ghost').find((n) => n.tagName === 'button' && n.textContent === 'Undo');
    check('Undo is there before the click', Boolean(undo));
    undo.listeners.click[0]();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    check('a failed reverse leaves the button labeled Undo', undo.textContent === 'Undo', undo.textContent);
    const note = find(host, 'log-undo-note').map((n) => n.textContent);
    check('the note says the Google Task is still there', note.indexOf('Still there — the Google Task was not removed.') !== -1, note);
  }

  console.log('\nTOTAL FAILURES:', failures);
  process.exit(failures ? 1 : 0);
}

run();
