// Regression corpus for core/execution-memory.js — the local-only record of
// what an account actually does with a proposed process (Do It / remove-
// before-confirming / undo-after-confirming). actions.js's applyMemory() is
// only as correct as the shape this module writes, so this file locks that
// shape down directly, independent of the demotion/ordering math already
// covered in intent-actions-corpus.cjs.
//
// This module has no chrome.* reference at all (see its own header comment
// for why — it's core/, meant to run somewhere other than a Chrome
// extension one day) — persistence is an injected adapter, defaulting to a
// plain in-memory store. `resetAdapter()` below gives each test block a
// fresh, independent one via the SAME setStorageAdapter() seam a real host
// (Glance's src/chrome-storage-adapter.js, or a future Flow runtime) uses —
// this corpus is exercising the actual public contract, not a shortcut
// around it.
//
// Run: node test/execution-memory-corpus.cjs

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = { module: undefined, console };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'core', 'execution-memory.js'), 'utf8'), sandbox, { filename: 'execution-memory.js' });
const FlowExecutionMemory = vm.runInContext('FlowExecutionMemory', sandbox);

// A fresh, independent in-memory adapter per test block — same shape a real
// adapter must implement: { get(key) -> Promise<value>, set(key, value) -> Promise<void> }.
function freshAdapter() {
  const store = new Map();
  return {
    backing: store,
    async get(key) { return store.get(key); },
    async set(key, value) { store.set(key, value); }
  };
}
function resetAdapter() {
  FlowExecutionMemory.setStorageAdapter(freshAdapter());
}

let failures = 0;
function check(name, cond, detail) {
  if (cond) { console.log('PASS:', name); }
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

async function run() {
  console.log('--- execution-memory.js: getAll() on an empty profile ---\n');
  {
    const mem = await FlowExecutionMemory.getAll();
    check('an untouched profile returns an empty object, not null/undefined', mem && typeof mem === 'object' && Object.keys(mem).length === 0, mem);
  }

  console.log('\n--- execution-memory.js: recordDoIt() ---\n');
  resetAdapter();
  {
    await FlowExecutionMemory.recordDoIt('reply-track', ['draft'], ['task']);
    const mem = await FlowExecutionMemory.getAll();
    const proc = mem['reply-track'];
    check('recordDoIt creates the process entry on first use', Boolean(proc), mem);
    check('recordDoIt increments closedCount once per call', proc.closedCount === 1, proc.closedCount);
    check('an accepted step kind gets accepted:1', proc.steps.draft && proc.steps.draft.accepted === 1, proc.steps.draft);
    check('a removed step kind gets removed:1, not accepted', proc.steps.task && proc.steps.task.removed === 1 && proc.steps.task.accepted === 0, proc.steps.task);

    // A second Do It on the same process accumulates rather than overwrites.
    await FlowExecutionMemory.recordDoIt('reply-track', ['draft', 'task'], []);
    const mem2 = await FlowExecutionMemory.getAll();
    check('a second recordDoIt accumulates closedCount', mem2['reply-track'].closedCount === 2, mem2['reply-track'].closedCount);
    check('a second recordDoIt accumulates accepted counts rather than overwriting', mem2['reply-track'].steps.draft.accepted === 2, mem2['reply-track'].steps.draft);
    check('a step accepted this time and removed last time carries both counts', mem2['reply-track'].steps.task.accepted === 1 && mem2['reply-track'].steps.task.removed === 1, mem2['reply-track'].steps.task);
  }

  console.log('\n--- execution-memory.js: recordDismiss() ---\n');
  resetAdapter();
  {
    await FlowExecutionMemory.recordDismiss('schedule', ['calendar', 'task']);
    const mem = await FlowExecutionMemory.getAll();
    const proc = mem['schedule'];
    check('a full dismiss records every step kind as removed', proc.steps.calendar.removed === 1 && proc.steps.task.removed === 1, proc.steps);
    check('a dismiss does not touch closedCount', proc.closedCount === 0, proc.closedCount);
  }

  console.log('\n--- execution-memory.js: recordUndo() ---\n');
  resetAdapter();
  {
    await FlowExecutionMemory.recordDoIt('schedule-confirm', ['calendar', 'draft', 'task'], []);
    await FlowExecutionMemory.recordUndo('schedule-confirm', ['draft', 'task']);
    const mem = await FlowExecutionMemory.getAll();
    const proc = mem['schedule-confirm'];
    check('recordUndo increments undoneCount once per call', proc.undoneCount === 1, proc.undoneCount);
    check('an undone step kind gets undone:1 in addition to its earlier accepted:1', proc.steps.draft.accepted === 1 && proc.steps.draft.undone === 1, proc.steps.draft);
    check('a step that was accepted but never undone keeps undone:0', proc.steps.calendar.accepted === 1 && proc.steps.calendar.undone === 0, proc.steps.calendar);
  }

  console.log('\n--- execution-memory.js: recordPin() ---\n');
  resetAdapter();
  {
    // The setup an insight card would actually see: task net-rejected on
    // reply-track, then the user explicitly answers "no, keep proposing it."
    await FlowExecutionMemory.recordDoIt('reply-track', ['draft'], ['task']);
    await FlowExecutionMemory.recordDoIt('reply-track', [], ['task']);
    await FlowExecutionMemory.recordDoIt('reply-track', [], ['task']);
    let mem = await FlowExecutionMemory.getAll();
    // Same threshold actions.js's isNetRejected() applies (see its own
    // dedicated tests in intent-actions-corpus.cjs) — checked inline here
    // since this file doesn't load actions.js; the point of this block is
    // recordPin()'s own effect on the aggregate, not re-testing that predicate.
    const taskStats = mem['reply-track'].steps.task;
    check('task is genuinely net-rejected before any pin', taskStats.removed + taskStats.undone >= 3 && taskStats.removed + taskStats.undone > taskStats.accepted, taskStats);

    await FlowExecutionMemory.recordPin('reply-track', 'task');
    mem = await FlowExecutionMemory.getAll();
    check('recordPin sets pinned:1 on exactly the pinned step', mem['reply-track'].steps.task.pinned === 1, mem['reply-track'].steps.task);
    check('recordPin does not touch other steps of the same process', mem['reply-track'].steps.draft.pinned === 0, mem['reply-track'].steps.draft);
    check('the earlier removed/undone counts are untouched by pinning — the override lives in the pinned counter, not by erasing history', mem['reply-track'].steps.task.removed === 3, mem['reply-track'].steps.task);
  }
  {
    // No processId or no stepKind -> same quiet no-op contract as the other
    // record* functions.
    let threw = false;
    try { await FlowExecutionMemory.recordPin(null, 'task'); await FlowExecutionMemory.recordPin('reply-track', null); } catch (e) { threw = true; }
    check('recordPin with missing arguments resolves quietly instead of throwing', threw === false);
  }

  console.log('\n--- execution-memory.js: toPatternSummary() (team-sharing foundation, not wired to anything) ---\n');
  resetAdapter();
  {
    await FlowExecutionMemory.recordDoIt('reply-track', ['draft'], ['task'], 'msg-1');
    await FlowExecutionMemory.recordUndo('reply-track', ['draft'], 'msg-1');
    await FlowExecutionMemory.recordPin('reply-track', 'task', 'msg-1');
    const mem = await FlowExecutionMemory.getAll();
    const rows = FlowExecutionMemory.toPatternSummary(mem);

    const draftRow = rows.find(r => r.processType === 'reply-track' && r.stepKind === 'draft');
    const taskRow = rows.find(r => r.processType === 'reply-track' && r.stepKind === 'task');
    check('every process/step combination in the aggregate produces exactly one row', rows.length === 2, rows);
    check('a row carries the accepted/removed/undone/pinned counts from the aggregate', draftRow.accepted === 1 && draftRow.undone === 1 && taskRow.removed === 1 && taskRow.pinned === 1, rows);
    check('a row never carries an intentionId, timestamp, or any other identifying field — only the five documented keys', Object.keys(draftRow).sort().join(',') === 'accepted,pinned,processType,removed,stepKind,undone', draftRow);
    check('an empty aggregate produces an empty summary, not an error', FlowExecutionMemory.toPatternSummary({}).length === 0);
    check('a missing aggregate produces an empty summary, not a throw', FlowExecutionMemory.toPatternSummary(undefined).length === 0);
  }

  console.log('\n--- execution-memory.js: processes stay isolated from each other ---\n');
  resetAdapter();
  {
    await FlowExecutionMemory.recordDoIt('reply-track', ['draft'], []);
    await FlowExecutionMemory.recordDismiss('follow-through', ['task', 'draft']);
    const mem = await FlowExecutionMemory.getAll();
    check('writing one process does not create or touch an unrelated one', mem['reply-track'].steps.draft.accepted === 1 && !mem['reply-track'].steps.task, mem['reply-track']);
    check('the unrelated process recorded independently', mem['follow-through'].steps.task.removed === 1 && mem['follow-through'].steps.draft.removed === 1, mem['follow-through']);
  }

  console.log('\n--- execution-memory.js: the raw event log matches the requested schema ---\n');
  resetAdapter();
  {
    await FlowExecutionMemory.recordDoIt('reply-track', ['draft'], ['task'], 'msg-42');
    const log = await FlowExecutionMemory.getLog();
    check('a Do It with one kept and one removed step produces exactly two events', log.length === 2, log);

    const accepted = log.find((e) => e.status === 'accepted');
    const dismissed = log.find((e) => e.status === 'dismissed');
    check('the accepted event carries only the kept step id', Boolean(accepted) && JSON.stringify(accepted.steps) === JSON.stringify(['draft']), accepted);
    check('the dismissed event carries only the removed step id', Boolean(dismissed) && JSON.stringify(dismissed.steps) === JSON.stringify(['task']), dismissed);
    check('both events carry the process id as processType', accepted.processType === 'reply-track' && dismissed.processType === 'reply-track', [accepted, dismissed]);
    check('both events carry the message as intentionId', accepted.intentionId === 'msg-42' && dismissed.intentionId === 'msg-42', [accepted, dismissed]);
    check('every event stamps an ISO timestamp', typeof accepted.timestamp === 'string' && !Number.isNaN(Date.parse(accepted.timestamp)), accepted.timestamp);

    // Every field the schema in the follow-up guidelines specifies, present
    // on every entry — not just the ones this suite happens to check above.
    const requiredKeys = ['intentionId', 'processType', 'steps', 'status', 'timestamp'];
    const schemaOk = log.every((e) => requiredKeys.every((k) => Object.prototype.hasOwnProperty.call(e, k)));
    check('every logged event has all five required schema fields', schemaOk, log);
  }
  {
    // No intentionId supplied (e.g. an older call site, or a process not
    // tied to one specific message) -> null, never undefined or a crash.
    await FlowExecutionMemory.recordDismiss('log-it', ['task']);
    const log = await FlowExecutionMemory.getLog();
    check('an event recorded with no intentionId stores null, not undefined', log[0].intentionId === null, log[0]);
  }
  {
    // Newest-first, same convention as FlowStorage's own appendLog.
    resetAdapter();
    await FlowExecutionMemory.recordDismiss('log-it', ['task'], 'msg-1');
    await FlowExecutionMemory.recordDismiss('log-it', ['task'], 'msg-2');
    const log = await FlowExecutionMemory.getLog();
    check('the log is ordered newest-first', log[0].intentionId === 'msg-2' && log[1].intentionId === 'msg-1', log);
  }

  console.log('\n--- execution-memory.js: a bookkeeping failure never throws ---\n');
  {
    // mutate() catches internally — recordDoIt with no processId is the
    // simplest way to hit its own no-op guard without reaching into
    // internals; this is the same contract described in the module's own
    // header ("never let memory bookkeeping be the reason a real write
    // fails or a dismiss doesn't register").
    let threw = false;
    try { await FlowExecutionMemory.recordDoIt(null, ['draft'], []); } catch (e) { threw = true; }
    check('recordDoIt with no processId resolves quietly instead of throwing', threw === false);
  }

  // ------------------------------------------------------------------
  // The core/client boundary itself: this module must never reference
  // chrome.* (or any other host-specific global), and setStorageAdapter()
  // must genuinely redirect persistence rather than being a no-op some
  // caller forgot to wire up. This is the actual thing the src/ -> core/
  // split depends on being true.
  // ------------------------------------------------------------------

  console.log('\n--- execution-memory.js: has no chrome.* (or other host-global) reference ---\n');
  {
    // Strip comments first — the file's own header prose explains, in
    // words, why there's no chrome.storage.local call here, which would
    // otherwise trip a naive text search on the very sentence documenting
    // its absence. This checks the executable code, not the commentary
    // about it.
    const raw = fs.readFileSync(path.join(__dirname, '..', 'core', 'execution-memory.js'), 'utf8');
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    check('the executable code contains no reference to chrome.*', !/\bchrome\s*\./.test(code), 'a chrome.* reference would break this module outside a browser extension');
    check('the executable code contains no reference to document/window', !/\b(document|window)\s*\./.test(code));
  }

  console.log('\n--- execution-memory.js: works with no adapter configured at all ---\n');
  {
    // A fresh sandbox, never calling setStorageAdapter — exercising the
    // built-in default a bare `require('core/execution-memory.js')` gets
    // before any host wires anything in.
    const freshSandbox = { module: undefined, console };
    vm.createContext(freshSandbox);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'core', 'execution-memory.js'), 'utf8'), freshSandbox, { filename: 'execution-memory.js' });
    const Fresh = vm.runInContext('FlowExecutionMemory', freshSandbox);
    let threw = null;
    try {
      await Fresh.recordDoIt('reply-track', ['draft'], []);
      var mem = await Fresh.getAll();
    } catch (e) { threw = e.message; }
    check('the unconfigured default never throws', threw === null, threw);
    check('...and is fully functional (correct, just not durable)', mem && mem['reply-track'] && mem['reply-track'].steps.draft.accepted === 1, mem);
  }

  console.log('\n--- execution-memory.js: setStorageAdapter() genuinely redirects persistence ---\n');
  {
    const probe = freshAdapter();
    FlowExecutionMemory.setStorageAdapter(probe);
    await FlowExecutionMemory.recordDismiss('log-it', ['task'], 'probe-1');
    check('an event written after setStorageAdapter() lands in THAT adapter’s own backing store',
      Array.isArray(probe.backing.get('flowExecutionEvents')) && probe.backing.get('flowExecutionEvents').some((e) => e.intentionId === 'probe-1'),
      probe.backing.get('flowExecutionEvents'));

    // Swapping to a second adapter must not leak the first one's data in —
    // each adapter is a genuinely independent store from the module's
    // point of view.
    const second = freshAdapter();
    FlowExecutionMemory.setStorageAdapter(second);
    const memOnSecond = await FlowExecutionMemory.getAll();
    check('a newly-swapped-in adapter starts empty, not inheriting the previous one’s data',
      Object.keys(memOnSecond).length === 0, memOnSecond);
  }

  console.log('\nTOTAL FAILURES:', failures);
  process.exit(failures ? 1 : 0);
}

run();
