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

  const sandbox = {
    console,
    fetch: async () => ({ ok: false, status: 500, json: async () => ({}) }),
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
      storage: { local: { get: async () => ({}), set: async () => {}, remove: async () => {} } },
      windows: { create: () => {}, onRemoved: { addListener() {} } },
      tabs: { create: () => {}, sendMessage: () => {} },
      alarms: { create: () => {}, onAlarm: { addListener() {} } }
    }
  };
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'background.js'), 'utf8'), sandbox, { filename: 'background.js' });

  return {
    calls,
    message: (msg) => onMessageListener(msg, {}, () => {}),
    install: (details) => onInstalledListener(details)
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

console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
