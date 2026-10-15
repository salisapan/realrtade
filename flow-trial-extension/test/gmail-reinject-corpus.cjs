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

check('onInstalled and onStartup call reinjectGmailTabs', /onInstalled\.addListener\(\(\) => \{\s*const fn = globalThis\.reinjectGmailTabs;/.test(background) && /onStartup\.addListener\(\(\) => \{\s*const fn = globalThis\.reinjectGmailTabs;/.test(background));
check('reinject does not reload the tab', src.indexOf('tabs.reload') < 0 && src.indexOf('chrome.tabs.reload') < 0 && src.indexOf('executeScript') > 0);
check('the Gmail watcher guards against a second injection', gmail.indexOf('__glanceGmailGuard') > 0 && gmail.indexOf('globalThis.__glanceGmailGuard === true') > 0);

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

sandbox.reinjectGmailTabs().then((first) => {
  check('an orphaned Gmail tab is reinjected once and its chips are removed', first === 1 && injected.length === 1 && hosts[0].removed === true && injected[0].indexOf('src/content-gmail.js') >= 0, { first, injected: injected.length, removed: hosts[0].removed });
  return sandbox.reinjectGmailTabs();
}).then((second) => {
  check('a live guard skips a second injection', second === 0 && injected.length === 1, { second, injected: injected.length });
  if (failures) {
    console.log('\n' + failures + ' failed');
    process.exit(1);
  }
  console.log('\nall passed');
}).catch((e) => {
  console.log('FAIL: reinject threw', e);
  process.exit(1);
});
