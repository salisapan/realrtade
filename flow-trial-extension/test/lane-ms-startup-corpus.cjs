// The lane hook must not change default startup. getManifest, Outlook script
// registration, and onMessage.addListener stay the functions background.js
// was given. The host may add its own listener; that listener ignores every
// message that is not one of its connector ids.
// Run: node test/lane-ms-startup-corpus.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { webcrypto } = require('crypto');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

function backgroundSource(stripHook) {
  const real = fs.readFileSync;
  if (!stripHook) return require('./load-background.cjs').backgroundScript();
  fs.readFileSync = function (file, enc) {
    const out = real.call(fs, file, enc);
    if (String(file).replace(/\\/g, '/').endsWith('/src/background.js')) {
      return String(out).replace(/^import '\.\.\/core\/lane-ms-host\.js';[^\n]*\r?\n/m, '');
    }
    return out;
  };
  try {
    return require('./load-background.cjs').backgroundScript();
  } finally {
    fs.readFileSync = real;
  }
}

function boot(stripHook) {
  const log = [];
  const listeners = [];
  let registered = [];
  const stored = { surfaces: { outlook: { enabled: true } } };
  const manifest = () => ({
    version: '0.9.56',
    oauth2: { client_id: 'x' },
    content_scripts: [{ js: ['core/domains.js', 'src/storage.js', 'src/content-gmail.js', 'src/follow.js'] }]
  });
  const registerContentScripts = async (list) => {
    list.forEach((x) => {
      if (registered.some((r) => r.id === x.id)) throw new Error('Duplicate script ID ' + x.id);
      registered.push(JSON.parse(JSON.stringify(x)));
      log.push('register ' + x.id + ' ' + x.js.join(','));
    });
  };
  const addListener = (fn) => { listeners.push(fn); };
  const chrome = {
    runtime: {
      getManifest: manifest,
      onMessage: { addListener: addListener },
      onInstalled: { addListener() {} },
      onStartup: { addListener() {} },
      lastError: null,
      getURL: (s) => 'chrome-extension://ext/' + (s || ''),
      id: 'ext'
    },
    identity: { getAuthToken: (x, cb) => cb(null), removeCachedAuthToken: (x, cb) => cb(), getRedirectURL: () => 'https://ext.chromiumapp.org/', launchWebAuthFlow: () => {} },
    storage: {
      local: {
        get: async (k) => {
          const s = JSON.parse(JSON.stringify(stored));
          if (typeof k === 'string') return { [k]: s[k] };
          if (Array.isArray(k)) { const r = {}; k.forEach((x) => { r[x] = s[x]; }); return r; }
          if (k && typeof k === 'object') return Object.assign({}, k, s);
          return s;
        },
        set: async (p) => { Object.assign(stored, p); },
        remove: async () => {}
      },
      onChanged: { addListener() {} }
    },
    permissions: { contains: async () => true, remove: async () => true },
    scripting: {
      getRegisteredContentScripts: async (f) => registered.filter((r) => !f || !f.ids || f.ids.indexOf(r.id) >= 0),
      registerContentScripts: registerContentScripts,
      unregisterContentScripts: async (f) => {
        registered = registered.filter((r) => f.ids.indexOf(r.id) < 0);
        log.push('unregister ' + f.ids.join(','));
      },
      executeScript: async (d) => {
        if (d.func) return [{ result: { globals: false, alive: false, stamp: '' } }];
        log.push('inject ' + d.target.tabId);
        return [{}];
      },
      insertCSS: async () => {}
    },
    tabs: { query: async () => [], sendMessage: () => {}, reload: async () => {} },
    windows: { create: () => {}, onRemoved: { addListener() {} } },
    alarms: { create: () => {}, onAlarm: { addListener() {} } },
    contextMenus: { create: () => {}, removeAll: (cb) => cb && cb(), onClicked: { addListener() {} } }
  };
  const sandbox = {
    console: { log() {}, info() {}, warn() {}, error() {} },
    URLSearchParams, URL, TextEncoder, Uint8Array, crypto: webcrypto,
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    fetch: async () => ({ ok: false, status: 500, json: async () => ({}), text: async () => '' }),
    chrome: chrome
  };
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(backgroundSource(stripHook), sandbox, { filename: 'background.js' });
  return {
    log: log,
    listeners: listeners,
    registered: () => registered,
    manifest: manifest,
    registerContentScripts: registerContentScripts,
    addListener: addListener,
    chrome: chrome,
    settle: () => new Promise((r) => setTimeout(r, 50))
  };
}

(async () => {
  const contacts = fs.readFileSync(path.join(__dirname, '../core/outlook-contacts.js'), 'utf8');
  const host = fs.readFileSync(path.join(__dirname, '../core/lane-ms-host.js'), 'utf8');
  check('contacts does not touch manifest, registration, or listeners',
    contacts.indexOf('getManifest') < 0 && contacts.indexOf('registerContentScripts') < 0 && contacts.indexOf('addListener') < 0);
  check('the host adds its own listener and does not replace startup',
    host.indexOf('runtime.getManifest') < 0 && host.indexOf('registerContentScripts') < 0 &&
    host.indexOf('.addListener =') < 0 && host.indexOf('onMessage.addListener(laneListener)') > 0);

  const withHook = boot(false);
  const without = boot(true);
  await withHook.settle();
  await without.settle();

  const withJs = (withHook.registered().find((r) => r.id === 'flow-outlook') || {}).js;
  const withoutJs = (without.registered().find((r) => r.id === 'flow-outlook') || {}).js;
  check('both startups registered the Outlook scripts',
    Array.isArray(withJs) && withJs.length > 0 && withJs[withJs.length - 1] === 'src/content-outlook.js', withJs);
  check('the Outlook script list is the same with and without the hook',
    JSON.stringify(withHook.registered()) === JSON.stringify(without.registered()), { with: withJs, without: withoutJs });
  check('registration does not splice in the lane page',
    withJs.indexOf('src/lane-ms-page.js') < 0 && withJs.indexOf('core/outlook-word.js') < 0);
  check('register and unregister logs match',
    JSON.stringify(withHook.log) === JSON.stringify(without.log), { with: withHook.log, without: without.log });
  check('getManifest is still the startup function',
    withHook.chrome.runtime.getManifest === withHook.manifest && without.chrome.runtime.getManifest === without.manifest);
  check('registerContentScripts is still the startup function',
    withHook.chrome.scripting.registerContentScripts === withHook.registerContentScripts &&
    without.chrome.scripting.registerContentScripts === without.registerContentScripts);
  check('addListener is still the startup function',
    withHook.chrome.runtime.onMessage.addListener === withHook.addListener &&
    without.chrome.runtime.onMessage.addListener === without.addListener);
  check('the hook adds one listener and nothing else',
    withHook.listeners.length === without.listeners.length + 1, { with: withHook.listeners.length, without: without.listeners.length });

  const lane = withHook.listeners[0];
  const replies = [];
  const ignored = lane({ type: 'flow:execute-action', payload: { connectorId: 'googleTasks' } }, {}, (r) => replies.push(r));
  const claimed = lane({ type: 'flow:execute-action', payload: { connectorId: 'outlookWord' } }, {}, (r) => replies.push(r));
  const undoClaimed = lane({ type: 'flow:undo-action', connectorId: 'outlookExcel' }, {}, (r) => replies.push(r));
  const foreign = lane({ type: 'flow:build-stamp' }, {}, (r) => replies.push(r));
  check('a listener for another connector is left alone', ignored === undefined && foreign === undefined && replies.length === 0, replies);
  check('the lane listener claims only its own message types', claimed === true && undoClaimed === true);

  if (failures) process.exit(1);
  console.log('lane-ms-startup-corpus: all passed');
})().catch((err) => { console.error(err); process.exit(1); });
