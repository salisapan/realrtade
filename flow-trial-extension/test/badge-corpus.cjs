// background.js corpus — the Subtle Persistent Indicator's badge half.
//
// updateBadge() and the flow:pending-count handler are the one piece of
// background.js that talks to chrome.action rather than a connector API, so
// they get their own small corpus instead of background-write-corpus.cjs's
// per-connector fixtures. Asserts on the actual chrome.action.* calls made,
// not just "it didn't throw" — a badge that silently never clears is the
// same class of quiet failure as a Brief indicator that never hides.
//
// Run: node test/badge-corpus.cjs

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function load() {
  const calls = [];
  let onMessageListener = null;
  let onInstalledListener = null;
  // A real backing store (not the always-empty stub the other tests in this
  // file use) — needed to prove getInstallId() actually persists across
  // calls, not just that it returns a string once.
  const storeBacking = {};
  // Distinct per call, not a fixed literal — a race between two concurrent
  // getInstallId() calls that each generated their own id would otherwise
  // be invisible: two racing calls both stamping the same fixed string
  // would look identical whether or not the race was actually closed.
  let uuidCounter = 0;

  const sandbox = {
    console,
    fetch: async () => ({ ok: false, status: 500, json: async () => ({}) }),
    crypto: { randomUUID: () => 'bg-test-uuid-' + (++uuidCounter) },
    chrome: {
      runtime: {
        getManifest: () => ({ oauth2: { client_id: 'real.apps.googleusercontent.com' } }),
        onMessage: { addListener(fn) { onMessageListener = fn; } },
        onInstalled: { addListener(fn) { onInstalledListener = fn; } },
        onStartup: { addListener() {} },
        lastError: null, getURL: (s) => s, id: 'ext'
      },
      action: {
        setBadgeText: (o) => calls.push(['text', o.text]),
        setBadgeBackgroundColor: (o) => calls.push(['color', o.color])
      },
      identity: { getAuthToken: (o, cb) => cb('tok'), removeCachedAuthToken: (o, cb) => cb(), launchWebAuthFlow: () => {} },
      storage: {
        local: {
          get: async (key) => (typeof key === 'string' ? { [key]: storeBacking[key] } : { ...storeBacking }),
          set: async (patch) => { Object.assign(storeBacking, patch); },
          remove: async (key) => { delete storeBacking[key]; }
        }
      },
      windows: { create: () => {}, onRemoved: { addListener() {} } },
      tabs: { create: () => {}, sendMessage: () => {} },
      alarms: { create: () => {}, onAlarm: { addListener() {} } }
    }
  };
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(require('./load-background.cjs').backgroundScript(), sandbox, { filename: 'background.js' });

  return {
    calls,
    install: (details) => onInstalledListener(details),
    // Fire-and-forget messages (flow:pending-count) never call sendResponse,
    // so this variant is fine for them and for anything synchronous.
    message: (msg) => onMessageListener(msg, {}, () => {}),
    // For handlers that reply asynchronously (reply() returns true and
    // calls sendResponse later, e.g. flow:get-install-id) — resolves with
    // whatever sendResponse actually received.
    messageAsync: (msg) => new Promise((resolve) => onMessageListener(msg, {}, resolve))
  };
}

let failures = 0;
function check(name, cond, detail) {
  if (cond) { console.log('PASS:', name); }
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

console.log('--- background.js: flow:pending-count sets the badge text ---\n');
{
  const bg = load();
  bg.message({ type: 'flow:pending-count', count: 3 });
  check('a positive count sets the badge text to that number', bg.calls.some((c) => c[0] === 'text' && c[1] === '3'), bg.calls);
  check('a non-empty badge also sets a background color', bg.calls.some((c) => c[0] === 'color'), bg.calls);
}

console.log('\n--- background.js: a count of zero clears the badge, not "0" ---\n');
{
  const bg = load();
  bg.message({ type: 'flow:pending-count', count: 0 });
  check('zero pending clears the badge text entirely', bg.calls.some((c) => c[0] === 'text' && c[1] === ''), bg.calls);
  check('a cleared badge never sets a background color', !bg.calls.some((c) => c[0] === 'color'), bg.calls);
}

console.log('\n--- background.js: a missing/non-numeric count is treated as zero, not NaN ---\n');
{
  const bg = load();
  bg.message({ type: 'flow:pending-count' });
  check('an absent count clears the badge rather than showing "NaN"', bg.calls.some((c) => c[0] === 'text' && c[1] === ''), bg.calls);
}

console.log('\n--- background.js: the badge never claims more than 99 ---\n');
{
  const bg = load();
  bg.message({ type: 'flow:pending-count', count: 250 });
  check('a huge pending count is capped, not shown verbatim', bg.calls.some((c) => c[0] === 'text' && c[1] === '99'), bg.calls);
}

console.log('\n--- background.js: install always starts from a clean badge ---\n');
{
  const bg = load();
  bg.install({ reason: 'install' });
  check('a fresh install clears any inherited badge state', bg.calls.some((c) => c[0] === 'text' && c[1] === ''), bg.calls);
}

console.log('\n--- background.js: an update also resets the badge, not just a first install ---\n');
{
  const bg = load();
  bg.install({ reason: 'update' });
  check('updateBadge(0) runs on every onInstalled reason, not only "install"', bg.calls.some((c) => c[0] === 'text' && c[1] === ''), bg.calls);
}

console.log('\n--- background.js: flow:get-install-id is the canonical generator ---\n');
(async () => {
  {
    const bg = load();
    const res = await bg.messageAsync({ type: 'flow:get-install-id' });
    check('responds ok with a real generated id', res && res.ok === true && typeof res.id === 'string' && res.id.length > 0, res);

    const res2 = await bg.messageAsync({ type: 'flow:get-install-id' });
    check('a second call returns the SAME id — proves it was actually persisted, not regenerated', res2.id === res.id, [res, res2]);
  }

  console.log('\n--- background.js: two concurrent flow:get-install-id calls never generate two different ids ---\n');
  {
    // Fresh install, nothing generated yet — fire both calls before either
    // has a chance to finish its own read-then-write of chrome.storage.local.
    // Before getInstallId() cached its own in-flight promise, both calls
    // would read "no id yet" and each generate + persist their own random
    // id, with whichever set() landed second silently winning — exactly
    // the duplicated-generator bug storage.js's own getInstallId was fixed
    // for one layer up (see storage-corpus.cjs), just inside this file's
    // own function this time.
    const bg = load();
    const [a, b] = await Promise.all([
      bg.messageAsync({ type: 'flow:get-install-id' }),
      bg.messageAsync({ type: 'flow:get-install-id' })
    ]);
    check('both concurrent callers receive the exact same id', a.ok && b.ok && a.id === b.id, [a, b]);
  }

  console.log('\nTOTAL FAILURES:', failures);
  process.exit(failures ? 1 : 0);
})();
