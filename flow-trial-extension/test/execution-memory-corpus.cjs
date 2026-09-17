// Regression corpus for execution-memory.js — the local-only record of what
// an account actually does with a proposed process (Do It / remove-before-
// confirming / undo-after-confirming). actions.js's applyMemory() is only as
// correct as the shape this module writes, so this file locks that shape
// down directly, independent of the demotion/ordering math already covered
// in intent-actions-corpus.cjs.
//
// Run: node test/execution-memory-corpus.cjs

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// A minimal in-memory stand-in for chrome.storage.local — get/set are the
// only two calls this module ever makes, both promise-based like the real
// API. One shared `store` object per test file run, the same way a single
// browser profile's storage would persist across calls within a session.
let store = {};
const chromeStub = {
  storage: {
    local: {
      get: (key) => Promise.resolve(Object.prototype.hasOwnProperty.call(store, key) ? { [key]: store[key] } : {}),
      set: (obj) => { Object.assign(store, obj); return Promise.resolve(); }
    }
  }
};

const sandbox = { module: undefined, console, chrome: chromeStub };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'execution-memory.js'), 'utf8'), sandbox, { filename: 'execution-memory.js' });
const FlowExecutionMemory = vm.runInContext('FlowExecutionMemory', sandbox);

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
  store = {};
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
  store = {};
  {
    await FlowExecutionMemory.recordDismiss('schedule', ['calendar', 'task']);
    const mem = await FlowExecutionMemory.getAll();
    const proc = mem['schedule'];
    check('a full dismiss records every step kind as removed', proc.steps.calendar.removed === 1 && proc.steps.task.removed === 1, proc.steps);
    check('a dismiss does not touch closedCount', proc.closedCount === 0, proc.closedCount);
  }

  console.log('\n--- execution-memory.js: recordUndo() ---\n');
  store = {};
  {
    await FlowExecutionMemory.recordDoIt('schedule-confirm', ['calendar', 'draft', 'task'], []);
    await FlowExecutionMemory.recordUndo('schedule-confirm', ['draft', 'task']);
    const mem = await FlowExecutionMemory.getAll();
    const proc = mem['schedule-confirm'];
    check('recordUndo increments undoneCount once per call', proc.undoneCount === 1, proc.undoneCount);
    check('an undone step kind gets undone:1 in addition to its earlier accepted:1', proc.steps.draft.accepted === 1 && proc.steps.draft.undone === 1, proc.steps.draft);
    check('a step that was accepted but never undone keeps undone:0', proc.steps.calendar.accepted === 1 && proc.steps.calendar.undone === 0, proc.steps.calendar);
  }

  console.log('\n--- execution-memory.js: processes stay isolated from each other ---\n');
  store = {};
  {
    await FlowExecutionMemory.recordDoIt('reply-track', ['draft'], []);
    await FlowExecutionMemory.recordDismiss('follow-through', ['task', 'draft']);
    const mem = await FlowExecutionMemory.getAll();
    check('writing one process does not create or touch an unrelated one', mem['reply-track'].steps.draft.accepted === 1 && !mem['reply-track'].steps.task, mem['reply-track']);
    check('the unrelated process recorded independently', mem['follow-through'].steps.task.removed === 1 && mem['follow-through'].steps.draft.removed === 1, mem['follow-through']);
  }

  console.log('\n--- execution-memory.js: the raw event log matches the requested schema ---\n');
  store = {};
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
    store = {};
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

  console.log('\nTOTAL FAILURES:', failures);
  process.exit(failures ? 1 : 0);
}

run();
