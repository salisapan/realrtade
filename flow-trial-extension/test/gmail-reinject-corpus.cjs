// After an update or a browser start, already-open Gmail tabs get the
// content scripts again. A live copy is left alone. An orphaned copy's
// chips are removed. The tab is not reloaded.
// Run: node test/gmail-reinject-corpus.cjs

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const EXT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(EXT, 'src', 'gmail-reinject.js'), 'utf8');
const background = fs.readFileSync(path.join(EXT, 'src', 'background.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
const gmail = fs.readFileSync(path.join(EXT, 'src', 'content-gmail.js'), 'utf8');

check('install, update, and startup inject open Gmail tabs', /onInstalled\.addListener\(\(details\) => \{\s*const reason = details && details\.reason;\s*if \(reason !== 'install' && reason !== 'update'\) return;\s*injectOpenGmailTabs\(\);/.test(background) && /onStartup\.addListener\(\(\) => \{\s*injectOpenGmailTabs\(\);/.test(background));
check('injectSurfaceIntoOpenTabs sends Gmail through the no-reload reinject', /id === 'gmail'/.test(background) && /mail\.google\.com/.test(background) && /injectSurfaceIntoOpenTabs\('gmail'/.test(background) && /reload:\s*false/.test(background));
const surfaceFn = background.slice(background.indexOf('async function injectSurfaceIntoOpenTabs'), background.indexOf('async function readSurfaces'));
check('the Gmail branch returns before any tab reload', surfaceFn.indexOf("id === 'gmail'") >= 0 && surfaceFn.indexOf('reinjectGmailTabs') >= 0 && surfaceFn.indexOf('reinjectGmailTabs') < surfaceFn.indexOf('tabs.reload'));
check('reinject does not reload the tab', src.indexOf('tabs.reload') < 0 && src.indexOf('chrome.tabs.reload') < 0 && src.indexOf('executeScript') > 0);
check('the Gmail watcher guards against a second injection', gmail.indexOf('__glanceGmailGuard') > 0 && gmail.indexOf('globalThis.__glanceGmailGuard === true') > 0);
check('the orphan checks chrome.runtime.id and disconnects', gmail.indexOf('chrome.runtime.id') > 0 && gmail.indexOf('observer.disconnect') > 0 && gmail.indexOf('Extension context invalidated') > 0);
check('the calendar payload reads the stored zone', gmail.indexOf('glanceTimeZone') > 0 && gmail.indexOf('glanceUserTimeZone') > 0);

const hosts = [{ removed: false, remove() { this.removed = true; } }];
const injected = [];
const sandbox = {
  console,
  document: { querySelectorAll: (sel) => (sel === '.flow-chip-host' ? hosts.filter((h) => !h.removed) : []) },
  chrome: {
    runtime: {
      id: 'ext',
      getManifest: () => manifest
    },
    tabs: { query: async () => [{ id: 7 }] },
    scripting: {
      insertCSS: async () => {},
      executeScript: async (opts) => {
        if (opts.files) {
          injected.push(opts.files);
          sandbox.__glanceGmailGuard = true;
          hosts.forEach((h) => { h.removed = true; });
          return [];
        }
        return [{ result: opts.func() }];
      }
    }
  }
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename: 'gmail-reinject.js' });

function bootOrphan() {
  let touches = 0;
  const observers = [];
  const timers = [];
  let timerSeq = 1;
  let now = 0;
  const liveChrome = {
    runtime: {
      id: 'ext',
      sendMessage() { touches += 1; },
      lastError: null,
      onMessage: { addListener() {} }
    },
    storage: {
      local: {
        get() { touches += 1; return Promise.resolve({}); },
        set() { touches += 1; return Promise.resolve(); },
        remove() { touches += 1; return Promise.resolve(); }
      },
      onChanged: { addListener() { touches += 1; } }
    },
    i18n: { getUILanguage: () => 'en' }
  };
  const page = {
    console,
    document: {
      body: {},
      querySelector() { return null; },
      querySelectorAll() { return []; }
    },
    MutationObserver: function MutationObserver(cb) {
      this.cb = cb;
      this.connected = false;
      observers.push(this);
    },
    setTimeout(fn, ms) {
      const id = timerSeq++;
      timers.push({ id, fn, at: now + (ms || 0) });
      return id;
    },
    clearTimeout(id) {
      const i = timers.findIndex((t) => t.id === id);
      if (i >= 0) timers.splice(i, 1);
    },
    FlowStorage: { get() { return Promise.resolve({ onboarded: false }); } },
    navigator: { language: 'en' },
    Intl,
    Date,
    chrome: liveChrome
  };
  page.MutationObserver.prototype.observe = function () { this.connected = true; };
  page.MutationObserver.prototype.disconnect = function () { this.connected = false; };
  page.MutationObserver.prototype.takeRecords = function () { return []; };
  page.globalThis = page;
  vm.createContext(page);
  vm.runInContext(gmail, page, { filename: 'content-gmail.js' });
  return {
    page,
    observers,
    flush(ms) {
      now += ms;
      const due = timers.filter((t) => t.at <= now);
      due.forEach((t) => {
        const i = timers.indexOf(t);
        if (i >= 0) timers.splice(i, 1);
      });
      due.forEach((t) => t.fn());
    },
    mutate() {
      observers.forEach((o) => { if (o.connected) o.cb([]); });
    },
    kill() {
      touches = 0;
      page.chrome = new Proxy({}, {
        get() {
          touches += 1;
          throw new Error('Extension context invalidated');
        }
      });
    },
    touches() { return touches; }
  };
}

sandbox.reinjectGmailTabs().then((first) => {
  check('an orphaned Gmail tab is reinjected once and its chips are removed', first === 1 && injected.length === 1 && hosts[0].removed === true && injected[0].indexOf('src/content-gmail.js') >= 0, { first, injected: injected.length, removed: hosts[0].removed });
  return sandbox.reinjectGmailTabs();
}).then((second) => {
  check('a live guard skips a second injection', second === 0 && injected.length === 1, { second, injected: injected.length });
  return new Promise((resolve) => setImmediate(resolve));
}).then(() => {
  const orphan = bootOrphan();
  return new Promise((resolve) => setImmediate(resolve)).then(() => {
    orphan.flush(500);
    orphan.kill();
    orphan.mutate();
    orphan.flush(500);
    const after = orphan.touches();
    const disconnected = orphan.observers.length > 0 && orphan.observers.every((o) => o.connected === false);
    check('an invalidated Gmail copy makes one chrome call and tears down', after === 1 && disconnected, { touches: after, observers: orphan.observers.length, disconnected });
    orphan.mutate();
    orphan.flush(500);
    check('a later mutation does not touch chrome again', orphan.touches() === 1, orphan.touches());
  });
}).then(() => {
  if (failures) {
    console.log('\n' + failures + ' failed');
    process.exit(1);
  }
  console.log('\nall passed');
}).catch((e) => {
  console.log('FAIL: reinject threw', e);
  process.exit(1);
});
