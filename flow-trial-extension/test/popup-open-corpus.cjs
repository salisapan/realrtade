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
    classList: { toggle() {}, add() {}, remove() {}, contains: () => false },
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
    createElement: (t) => makeNode(t),
    createTextNode: (t) => { const n = makeNode('#text'); n.textContent = String(t); return n; }
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
        if (msg && msg.type === 'flow:search-drive') { if (cb) cb({ ok: true, files: opts.driveFiles || [] }); return; }
        if (msg && msg.type === 'flow:follow-draft') { (opts.drafts = opts.drafts || []).push(msg.payload); if (cb) cb({ ok: true }); return; }
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
    [CORE, 'google-closes.js'], [CORE, 'fact-reply.js'], [CORE, 'close-families.js'], [CORE, 'intent.js'],
    [CORE, 'close-quality-metrics.js'],
    [CORE, 'quiet-metrics.js'],
    [CORE, 'still-open.js'],
    [SRC, 'storage.js'],
    [CORE, 'actions.js'], [CORE, 'execution-memory.js'],
    [SRC, 'chrome-storage-adapter.js'],
    [SRC, 'receipt-copy.js'],
    [CORE, 'lang-normalize.js'], [CORE, 'request-types.js'], [CORE, 'intent-model-weights.js'], [CORE, 'intent-model.js'], [CORE, 'intent-pipeline.js'], [CORE, 'reply-meaning.js'], [CORE, 'story.js'], [CORE, 'recognition-stats.js'], [CORE, 'file-attach.js'], [CORE, 'file-path.js'], [CORE, 'person-model.js'], [CORE, 'outcome-labels.js'], [CORE, 'follow-up.js'], [CORE, 'expiry.js'], [CORE, 'meeting-debrief.js'], [CORE, 'recurrence.js'], [CORE, 'entitlements.js']
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

function isoDaysFromNow(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function datedIntent(iso) {
  return {
    type: 'decision',
    label: 'Send the contract',
    confidence: 'high',
    personalClose: 'dated-commitment',
    facts: { date: { iso: iso } },
    entities: { what: 'I will send the signed contract' },
    signals: { score: 80 }
  };
}

async function run() {
  console.log('--- popup.js: Open tab renders the Still Open list, not every unresolved chip ---\n');
  {
    const proc = { id: 'log-it', name: 'Log it', steps: [{ id: 'task' }] };
    const stored = {
      log: [
        { ts: Date.now(), kind: 'shown', messageId: 'm1', threadId: 't1', process: proc, sender: { name: 'Dana Cole' }, subject: 'Invoice #4', app: 'gmail', threadUrl: 'https://mail.google.com/x/1', intent: datedIntent(isoDaysFromNow(1)) },
        { ts: Date.now(), kind: 'shown', messageId: 'm2', threadId: 't2', process: proc, sender: { email: 'sam@example.com' }, subject: null, threadUrl: 'https://mail.google.com/x/2', intent: Object.assign(datedIntent(isoDaysFromNow(3)), { label: '' }) },
        { ts: Date.now(), kind: 'shown', messageId: 'meet', threadId: 't3', process: { id: 'schedule', name: 'Schedule', steps: [{ id: 'calendar' }] }, sender: { name: 'Pat' }, subject: 'Sync', intent: { type: 'event', label: 'Meeting', confidence: 'high' } },
        { ts: Date.now(), kind: 'shown', messageId: 'hedge', threadId: 't4', process: proc, sender: { name: 'Ada' }, subject: 'Maybe send the invoice if you feel like it.', intent: { type: 'request', label: 'Maybe send the invoice', confidence: 'high', personalClose: 'follow-up-ask', entities: { what: 'Maybe send the invoice if you feel like it.', requestWhat: 'Maybe send the invoice if you feel like it.' }, facts: {} } },
        { ts: Date.now(), kind: 'shown', messageId: 'news', threadId: 't5', process: proc, sender: { name: 'Ada' }, subject: 'Hope this email finds you well. Could you send the invoice?', intent: { type: 'request', label: 'Could you send the invoice?', confidence: 'high', personalClose: 'follow-up-ask', entities: { what: 'Hope this email finds you well. Could you send the invoice?' }, facts: {} } },
        { ts: Date.now(), kind: 'shown', messageId: 'multi', threadId: 't6', process: proc, sender: { name: 'Ada' }, subject: 'Please send the invoice. Put it on the calendar and in the task note.', intent: { type: 'request', label: 'Send the invoice', confidence: 'high', personalClose: 'follow-up-ask', entities: { what: 'Please send the invoice. Put it on the calendar and in the task note.' }, facts: {} } },
        { ts: Date.now(), kind: 'shown', messageId: 'quote', threadId: 't7', process: proc, sender: { name: 'Ada' }, subject: 'Sounds good, thanks!', text: 'Sounds good, thanks!\n\nOn Mon, Sep 1, 2025 at 9:41 AM Dana Cole <dana@meridian.com> wrote:\n> Could you send the invoice?', intent: { type: 'request', label: 'Could you send the invoice?', confidence: 'high', personalClose: 'follow-up-ask', entities: { what: 'Could you send the invoice?', requestWhat: 'Could you send the invoice?' }, facts: {} } },
        { ts: Date.now(), kind: 'shown', messageId: 'unsure', threadId: 't8', process: proc, sender: { name: 'Ada' }, subject: 'Please send the invoice.', intent: { type: 'request', label: 'Send the invoice', confidence: 'unsure', personalClose: 'follow-up-ask', entities: { what: 'Please send the invoice.' }, facts: {} } }
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
    check('renders the two dated closes and drops the meeting, hedge, newsletter, multi-target, quoted ask, and unsure row', rows.length === 2, rows.length);

    const empty = document.getElementById('open-empty');
    check('the empty state stays hidden when something is open', empty.hidden === true, empty.hidden);

    const labels = find(host, 'log-label').map((n) => n.textContent);
    check('each row shows the one-line why, not a backlog title', labels.every((l) => /^You promised this by /.test(l)), labels);
    check('each row offers Do It', find(host, 'primary').length === 2, find(host, 'primary').length);

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
    const proc = { id: 'log-it', name: 'Log it', steps: [{ id: 'task' }] };
    const stored = { log: [{ ts: Date.now(), kind: 'shown', messageId: 'm1', threadId: 't1', process: proc, sender: {}, intent: datedIntent(isoDaysFromNow(1)) }] };
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
    const still = store().stillOpenMetrics;
    check('dismissing a Still Open card is a false-close', still && still.falseClose === 1 && still.recent.some((e) => e.kind === 'falseClose' && e.reason === 'dismiss'), still);
  }

  console.log('\n--- popup.js: more than three real closes still render three, and Do It hands off without a second writer ---\n');
  {
    const proc = { id: 'log-it', name: 'Log it', steps: [{ id: 'task' }] };
    const log = [1, 3, 6, 40].map((days, i) => ({
      ts: Date.now(),
      kind: 'shown',
      messageId: 'c' + i,
      threadId: 'tc' + i,
      process: proc,
      sender: { name: 'Dana' },
      subject: days === 40 ? 'FAR-DEADLINE' : 'Soon ' + i,
      threadUrl: 'https://mail.google.com/x/' + i,
      intent: datedIntent(isoDaysFromNow(days))
    }));
    const { sandbox, document, store } = load({ log: log });
    vm.runInContext(fs.readFileSync(path.join(POPUP, 'popup.js'), 'utf8'), sandbox, { filename: 'popup.js' });
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    const host = document.getElementById('open-list');
    const rows = find(host, 'log-item');
    check('four qualifying closes render three rows', rows.length === 3, rows.length);
    const subtitles = find(host, 'log-where').map((n) => n.textContent);
    check('the far deadline is the one left off', subtitles.every((s) => s.indexOf('FAR-DEADLINE') === -1), subtitles);
    const doIt = find(host, 'primary')[0];
    (doIt.listeners.click || []).forEach((fn) => fn());
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    check('Do It with no Gmail tab stores a handoff instead of writing here', store().glanceStillOpenPendingDoIt, store().glanceStillOpenPendingDoIt);
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
    check('trusted closes stay hidden until a full write exists', document.getElementById('quietMetrics').hidden === true);
  }

  console.log('\n--- popup.js: Activity shows trusted closes and silence reasons ---\n');
  {
    const probe = load({});
    const Quiet = vm.runInContext('FlowQuietMetrics', probe.sandbox);
    const now = Date.now();
    let quietMetrics = Quiet.noteHandled(Quiet.emptyState(), { messageId: 'm1', ts: now });
    quietMetrics = Quiet.noteSilence(quietMetrics, { messageId: 's1', reason: 'family', ts: now });
    const { sandbox, document } = load({ quietMetrics: quietMetrics });
    vm.runInContext(fs.readFileSync(path.join(POPUP, 'popup.js'), 'utf8'), sandbox, { filename: 'popup.js' });
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    const node = document.getElementById('quietMetrics');
    check('the quiet line is shown once a trusted close and a silence exist', node.hidden === false, node.textContent);
    check('it names this week\'s trusted closes, Undo, and the reason code',
      node.textContent.indexOf('Trusted closes 1 this week') !== -1 &&
      node.textContent.indexOf('Undo 0') !== -1 &&
      node.textContent.indexOf('family 1') !== -1 &&
      node.textContent.indexOf('m1') === -1, node.textContent);
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

  console.log('\n--- popup.js: a loop that is yours says so, offers the prepared reply, and a passed deadline is its own label ---\n');
  {
    const base = { kind: 'reply', status: 'waiting', direction: 'theirs', createdAt: Date.now() - 4 * 86400000, nudges: 0, lang: 'en', counterpart: { name: 'Dana Cole', email: 'dana@acme.com' }, taskRef: null };
    const stored = {
      followWatches: [
        Object.assign({}, base, { id: 'y1', threadId: 'y1', subject: 'Vendor booking', what: 'Please confirm the final figure by Monday', stage: 'yours', yoursReason: 'question', yoursLine: 'Which vendor do you mean?', chaseIso: isoDaysFromNow(1) }),
        Object.assign({}, base, { id: 'd1', threadId: 'd1', subject: 'Lease', what: 'Please sign the lease by Thursday', stage: 'waiting', deadlineIso: isoDaysFromNow(-2), chaseIso: isoDaysFromNow(-2) })
      ]
    };
    const { sandbox, document } = load(stored);
    vm.runInContext(fs.readFileSync(path.join(POPUP, 'popup.js'), 'utf8'), sandbox, { filename: 'popup.js' });
    for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0));
    const host = document.getElementById('waiting-list');
    const metas = find(host, 'wait-meta').map((n) => n.textContent);
    check('the yours loop says "Your turn" and why', metas.some((m) => /^Your turn · they asked you something/.test(m)), metas);
    check('the late loop says the deadline passed, not just "Waiting"', metas.some((m) => /^Deadline passed /.test(m)), metas);
    const buttons = find(host, 'sm').map((n) => n.textContent);
    check('the yours loop offers Prepare my reply', buttons.includes('Prepare my reply'), buttons);
    check('and no nudge for it (the chase is not theirs to answer)', buttons.filter((b) => /nudge/i.test(b)).length === 1, buttons);
  }

  console.log('\n--- popup.js: file-backed rows prepare the one right file, quietly, and preparing does not close ---\n');
  {
    const base = { kind: 'reply', status: 'waiting', direction: 'theirs', createdAt: Date.now() - 2 * 86400000, nudges: 0, lang: 'en', counterpart: { name: 'Dana Cole', email: 'dana@acme.com' }, taskRef: null, chaseIso: isoDaysFromNow(1) };
    const CF = { object: 'contract', label: 'contract', lang: 'en', synonym: ['contract', 'agreement', 'nda', 'חוזה', 'הסכם'] };
    const stored = {
      followWatches: [
        Object.assign({}, base, { id: 'y1', threadId: 'y1', subject: 'Receipt', what: 'Please confirm by Monday', stage: 'yours', yoursReason: 'question', yoursLine: 'Can you send me the receipt?', fileChoice: { name: 'Receipt - Oct.pdf', driveFileId: 'F1' }, preparedAt: Date.now() }),
        Object.assign({}, base, { id: 'y2', threadId: 'y2', subject: 'Plain', what: 'Please confirm by Monday', stage: 'yours', yoursReason: 'question', yoursLine: 'Which vendor?' }),
        Object.assign({}, base, { id: 'm1', threadId: 'm1', subject: 'Contract', direction: 'mine', what: 'I will send you the signed contract by Friday.', file: CF })
      ]
    };
    const opts = { driveFiles: [{ id: 'C1', name: 'Contract - signed.pdf', mimeType: 'application/pdf' }, { id: 'X', name: 'Budget.xlsx', mimeType: 'application/vnd.ms-excel' }] };
    const { sandbox, document, store } = load(stored, opts);
    vm.runInContext(fs.readFileSync(path.join(POPUP, 'popup.js'), 'utf8'), sandbox, { filename: 'popup.js' });
    for (let i = 0; i < 12; i++) await new Promise((r) => setTimeout(r, 0));
    const host = document.getElementById('waiting-list');
    const items = find(host, 'wait-item');
    const btns = (it) => find(it, 'sm').filter((n) => !n.hidden).map((n) => n.textContent);
    const y1 = items.find((it) => find(it, 'wait-meta').some((n) => /draft ready/.test(n.textContent)));
    check('a prepared loop is labelled "draft ready", still Your turn', Boolean(y1) && /Your turn/.test(find(y1, 'wait-meta')[0].textContent), y1 && find(y1, 'wait-meta').map((n) => n.textContent));
    check('a yours loop with a chosen Drive file says Prepare reply with file', y1 && btns(y1).includes('Prepare reply with file'), y1 && btns(y1));
    const y2 = items.find((it) => find(it, 'wait-meta').some((n) => /Your turn/.test(n.textContent) && !/draft ready/.test(n.textContent)));
    check('a yours loop without a file keeps the plain button', Boolean(y2) && !btns(y2).includes('Prepare reply with file'), y2 && btns(y2));
    const m1 = items.find((it) => find(it, 'wait-meta').some((n) => /You promised/.test(n.textContent)));
    check('a file promise gets Prepare reply with file after one confident Drive match', m1 && btns(m1).includes('Prepare reply with file'), m1 && btns(m1));
    const click = find(m1, 'sm').find((n) => n.textContent === 'Prepare reply with file');
    click.listeners.click[0]();
    for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0));
    const draft = (opts.drafts || [])[0];
    check('it writes the promise draft with exactly that Drive file', draft && draft.driveFileId === 'C1' && /As promised, attached: Contract - signed\.pdf/.test(draft.body), draft);
    check('and says nothing was sent, not that the loop is closed', /Nothing was sent/.test(find(m1, 'wait-note')[0].textContent) && /Send it and I will close this/.test(find(m1, 'wait-note')[0].textContent), find(m1, 'wait-note').map((n) => n.textContent));
    const saved = store().followWatches.find((w) => w.id === 'm1');
    check('preparing only records the draft: the loop is still waiting, with the file named', saved.status === 'waiting' && saved.preparedFile === 'Contract - signed.pdf' && Boolean(saved.preparedAt), saved);
  }
  {
    const base = { kind: 'reply', status: 'waiting', direction: 'mine', createdAt: Date.now(), nudges: 0, lang: 'en', counterpart: { name: 'Dana Cole', email: 'dana@acme.com' }, taskRef: null, chaseIso: isoDaysFromNow(1), file: { object: 'contract', label: 'contract', lang: 'en', synonym: ['contract', 'agreement'] }, what: 'I will send you the signed contract by Friday.', subject: 'Contract' };
    for (const [label, files] of [['two contract files in Drive', [{ id: '1', name: 'Contract A.pdf', mimeType: 'application/pdf' }, { id: '2', name: 'Contract B.pdf', mimeType: 'application/pdf' }]], ['no file in Drive', []]]) {
      const { sandbox, document } = load({ followWatches: [Object.assign({ id: 'm9', threadId: 'm9' }, base)] }, { driveFiles: files });
      vm.runInContext(fs.readFileSync(path.join(POPUP, 'popup.js'), 'utf8'), sandbox, { filename: 'popup.js' });
      for (let i = 0; i < 12; i++) await new Promise((r) => setTimeout(r, 0));
      const shown = find(document.getElementById('waiting-list'), 'sm').filter((n) => !n.hidden).map((n) => n.textContent);
      check('promise row, ' + label + ': no file button (never a guess)', !shown.includes('Prepare reply with file'), shown);
    }
  }

  console.log('\n--- popup.js: a loop with a date this person usually misses says so ---\n');
  {
    const D = 86400000;
    const hist = [6, 8, 5, 9, 7].map((d, i) => ({ id: 'h' + i, threadId: 'h' + i, direction: 'theirs', kind: 'reply', counterpart: { name: 'Dana Cole', email: 'dana@acme.com' }, status: 'resolved', closedAs: 'replied', createdAt: Date.now() - 80 * D + i * 3 * D, resolvedAt: Date.now() - 80 * D + i * 3 * D + d * D }));
    const loop = { id: 'r1', threadId: 'r1', kind: 'reply', status: 'waiting', direction: 'theirs', createdAt: Date.now() - D, nudges: 0, lang: 'en', counterpart: { name: 'Dana Cole', email: 'dana@acme.com' }, subject: 'Figures', what: 'Please confirm the figures by Friday', deadlineIso: isoDaysFromNow(1), chaseIso: isoDaysFromNow(1), taskRef: null };
    const { sandbox, document } = load({ followWatches: hist.concat([loop]) });
    vm.runInContext(fs.readFileSync(path.join(POPUP, 'popup.js'), 'utf8'), sandbox, { filename: 'popup.js' });
    for (let i = 0; i < 12; i++) await new Promise((r) => setTimeout(r, 0));
    const metas = find(document.getElementById('waiting-list'), 'wait-meta').map((n) => n.textContent);
    check('the row says it is likely to slip and why', metas.some((m) => /likely to slip, Dana usually takes ~\d+ days/.test(m)), metas);
    const sumTxt = document.getElementById('waitingSummary').children.map((n) => n.textContent).join('');
    check('the summary line counts it', /1likely to slip|1 likely to slip/.test(sumTxt), sumTxt);
  }

  console.log('\nTOTAL FAILURES:', failures);
  process.exit(failures ? 1 : 0);
}

run();
