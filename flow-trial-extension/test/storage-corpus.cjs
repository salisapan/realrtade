// Regression corpus for storage.js — specifically getPending() and
// consumeDailyBriefTrigger(), the two new functions the Morning Brief is
// built on. Both are pure derivations over the same log appendLog/
// hasTerminalOutcome already use, so this also cross-checks that the
// "still open" definition getPending() computes in bulk agrees with
// hasTerminalOutcome's own single-message definition.
//
// Run: node test/storage-corpus.cjs

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// A minimal in-memory chrome.storage.local — mirrors the real API's
// get(keysWithDefaults, cb)/set(patch, cb) shape closely enough that
// storage.js's own get()/set() wrappers work unmodified: any key not yet in
// `store` falls back to the default value passed in, exactly like the real
// API does when `keys` is an object.
let store = {};
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
  }
};

const sandbox = { module: undefined, console, chrome: chromeStub, crypto: { randomUUID: () => 'test-uuid' } };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'storage.js'), 'utf8'), sandbox, { filename: 'storage.js' });
const FlowStorage = vm.runInContext('FlowStorage', sandbox);

let failures = 0;
function check(name, cond, detail) {
  if (cond) { console.log('PASS:', name); }
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

async function run() {
  console.log('--- storage.js: getPending() on an untouched profile ---\n');
  {
    const pending = await FlowStorage.getPending();
    check('an untouched profile has nothing pending', Array.isArray(pending) && pending.length === 0, pending);
  }

  console.log('\n--- storage.js: a shown-with-process entry is pending ---\n');
  store = {};
  {
    await FlowStorage.appendLog({ kind: 'shown', messageId: 'm1', label: 'Log deal update', process: { id: 'reply-track', name: 'Reply & Track', steps: [] } });
    const pending = await FlowStorage.getPending();
    check('a shown process with no later outcome is pending', pending.length === 1 && pending[0].messageId === 'm1', pending);
    check('hasTerminalOutcome agrees this message is not yet resolved', (await FlowStorage.hasTerminalOutcome('m1')) === false);
  }

  console.log('\n--- storage.js: a shown entry with no process snapshot is never surfaced ---\n');
  store = {};
  {
    // Defensive case — a 'shown' entry that (for whatever reason) never got
    // a process snapshot attached must not crash the Brief or show up as an
    // item with nothing to close.
    await FlowStorage.appendLog({ kind: 'shown', messageId: 'm2', label: 'Log deal update' });
    const pending = await FlowStorage.getPending();
    check('a shown entry without a process snapshot is excluded', pending.length === 0, pending);
  }

  console.log('\n--- storage.js: writing or dismissing closes a pending item ---\n');
  store = {};
  {
    await FlowStorage.appendLog({ kind: 'shown', messageId: 'm3', process: { id: 'schedule', name: 'Schedule It', steps: [] } });
    check('m3 starts pending', (await FlowStorage.getPending()).length === 1);

    await FlowStorage.appendLog({ kind: 'written', messageId: 'm3', where: 'Google Calendar' });
    const pending = await FlowStorage.getPending();
    check('a written outcome removes it from pending', pending.length === 0, pending);
    check('hasTerminalOutcome agrees m3 is now resolved', (await FlowStorage.hasTerminalOutcome('m3')) === true);
  }
  store = {};
  {
    await FlowStorage.appendLog({ kind: 'shown', messageId: 'm4', process: { id: 'log-it', name: 'Log It', steps: [] } });
    await FlowStorage.appendLog({ kind: 'dismissed', messageId: 'm4' });
    check('a dismissed outcome removes it from pending', (await FlowStorage.getPending()).length === 0);
  }

  console.log('\n--- storage.js: only the most recent entry per message decides pending ---\n');
  store = {};
  {
    // Re-shown after Gmail rebuilds the node (see scanReadingPane's own
    // comment on this) without a new terminal outcome in between — still
    // pending, and the newer snapshot (not the older one) is what's used.
    await FlowStorage.appendLog({ kind: 'shown', messageId: 'm5', process: { id: 'schedule', name: 'Schedule It (old)', steps: [] } });
    await FlowStorage.appendLog({ kind: 'shown', messageId: 'm5', process: { id: 'schedule', name: 'Schedule It (new)', steps: [] } });
    const pending = await FlowStorage.getPending();
    check('re-shown with no terminal outcome in between is still exactly one pending item', pending.length === 1, pending);
    check('the most recent snapshot wins', pending[0].process.name === 'Schedule It (new)', pending[0]);
  }

  console.log('\n--- storage.js: several open processes come back oldest-first ---\n');
  store = {};
  {
    await FlowStorage.appendLog({ kind: 'shown', messageId: 'a', process: { id: 'log-it', name: 'A', steps: [] } });
    await FlowStorage.appendLog({ kind: 'shown', messageId: 'b', process: { id: 'log-it', name: 'B', steps: [] } });
    await FlowStorage.appendLog({ kind: 'shown', messageId: 'c', process: { id: 'log-it', name: 'C', steps: [] } });
    const pending = await FlowStorage.getPending();
    check('three open processes come back oldest-still-open first', JSON.stringify(pending.map((p) => p.messageId)) === JSON.stringify(['a', 'b', 'c']), pending.map((p) => p.messageId));
  }

  console.log('\n--- storage.js: mixed open/closed messages ---\n');
  store = {};
  {
    await FlowStorage.appendLog({ kind: 'shown', messageId: 'open1', process: { id: 'log-it', name: 'Open 1', steps: [] } });
    await FlowStorage.appendLog({ kind: 'shown', messageId: 'closed1', process: { id: 'log-it', name: 'Closed 1', steps: [] } });
    await FlowStorage.appendLog({ kind: 'written', messageId: 'closed1' });
    await FlowStorage.appendLog({ kind: 'shown', messageId: 'open2', process: { id: 'log-it', name: 'Open 2', steps: [] } });
    const pending = await FlowStorage.getPending();
    check('only the genuinely still-open messages are returned', JSON.stringify(pending.map((p) => p.messageId).sort()) === JSON.stringify(['open1', 'open2']), pending.map((p) => p.messageId));
  }

  console.log('\n--- storage.js: consumeDailyBriefTrigger() fires at most once per day ---\n');
  store = {};
  {
    const first = await FlowStorage.consumeDailyBriefTrigger();
    check('the first call today returns true', first === true);
    const second = await FlowStorage.consumeDailyBriefTrigger();
    check('a second call the same day returns false', second === false);

    // Simulate the next calendar day directly, the same way a real day
    // boundary would change what Date#toDateString() returns.
    store.briefLastShownDate = 'Mon Jan 01 2001';
    const third = await FlowStorage.consumeDailyBriefTrigger();
    check('a call on a new day returns true again', third === true);
    const fourth = await FlowStorage.consumeDailyBriefTrigger();
    check('and is consumed for that new day too', fourth === false);
  }

  console.log('\nTOTAL FAILURES:', failures);
  process.exit(failures ? 1 : 0);
}

run();
