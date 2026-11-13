'use strict';
// Store install = Labs locked. A Chrome Web Store install has update_url in its manifest (Chrome adds it; unpacked
// and e2e installs do not). There the popup shows no Labs section and every Labs switch reads off, even when storage
// says true, so no Labs path can ask for a permission or a scope. Dev/unpacked keeps Labs working.
// Run: node test/labs-store-lock-corpus.cjs   (jsdom for the popup rows)
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { FlowLabsSwitches: L } = require('../core/labs-switches.js');

let JSDOM = null;
try { ({ JSDOM } = require('jsdom')); } catch (e) { JSDOM = null; }
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const STORE = { manifest_version: 3, version: '0.9.56', update_url: 'https://clients2.google.com/service/update2/crx' };
const DEV = { manifest_version: 3, version: '0.9.56' };
const ALL_ON = L.all({}, true);

check('storeLocked: update_url locks Labs', L.storeLocked(STORE) === true);
check('storeLocked: no update_url (unpacked/dev) leaves Labs open', L.storeLocked(DEV) === false && L.storeLocked(null) === false);

// The worker and lane-host switch readers: every Labs id reads off in a store install even when storage says true.
function switchReader(file, fnName) {
  const src = read(file);
  const f = src.indexOf('async function ' + fnName + '(');
  const fEnd = src.indexOf('\n}\n', f) + 2;
  if (f < 0) return null;
  return (manifest) => {
    const ctx = vm.createContext({
      chrome: {
        runtime: { getManifest: () => manifest },
        storage: { local: { get: async () => ({ glanceSwitches: ALL_ON }) } }
      }
    });
    vm.runInContext(src.slice(f, fEnd) + '\nglobalThis.read = ' + fnName + ';', ctx);
    return ctx.read;
  };
}

(async () => {
  for (const [file, fn] of [['src/background.js', 'glanceSwitchOn'], ['src/google-lane-host.js', 'laneSwitchOn']]) {
    const make = switchReader(file, fn);
    check(file + ': ' + fn + ' found', Boolean(make));
    if (!make) continue;
    const store = make(STORE);
    const dev = make(DEV);
    const storeOn = [];
    const devOff = [];
    for (const id of L.IDS) {
      if (await store(id)) storeOn.push(id);
      if (!(await dev(id))) devOff.push(id);
    }
    check(file + ': store install, storage all true -> every Labs switch reads off', storeOn.length === 0, storeOn);
    check(file + ': dev install, storage all true -> every Labs switch reads on', devOff.length === 0, devOff);
  }

  // Every other file that reads glanceSwitches out of storage defines the same lock and uses it at each read.
  const readers = {
    'src/content-gmail.js': 4,
    'src/content-outlook.js': 8,
    'src/chat-task-card.js': 1,
    'popup/connect-3.js': 1
  };
  for (const [file, want] of Object.entries(readers)) {
    const src = read(file);
    const uses = (src.match(/glanceLabsLocked\(\)/g) || []).length - 1; // minus the definition
    check(file + ': defines glanceLabsLocked from manifest update_url', /function glanceLabsLocked\(\)\s*\{\s*try \{ return Boolean\(chrome\.runtime\.getManifest\(\)\.update_url\);/.test(src));
    check(file + ': every glanceSwitches read is behind the lock (' + want + ')', uses >= want, uses);
  }
  // No reader of glanceSwitches was missed: any src/popup/lane-chat file that reads the bag must be one of the guarded ones.
  const guarded = new Set(['src/background.js', 'src/google-lane-host.js', 'popup/popup.js'].concat(Object.keys(readers)));
  const stray = [];
  for (const dir of ['src', 'popup', 'lane-chat']) {
    for (const f of fs.readdirSync(path.join(ROOT, dir))) {
      if (!/\.js$/.test(f)) continue;
      const rel = dir + '/' + f;
      const src = read(rel);
      if (/get\(\{\s*glanceSwitches|\.glanceSwitches\b/.test(src.replace(/\/\/.*$/gm, '')) && !guarded.has(rel)) stray.push(rel);
    }
  }
  check('no unguarded glanceSwitches reader in shipped src/popup/lane-chat', stray.length === 0, stray);

  // Popup: store install renders no Labs section and no turn-on buttons; dev renders every row.
  if (!JSDOM) {
    check('jsdom is installed (popup Labs rows)', false);
  } else {
    const popupSrc = read('popup/popup.js');
    const elFn = popupSrc.slice(popupSrc.indexOf('function el(tag, cls, text)'), popupSrc.indexOf('async function refresh()'));
    const labsBlock = popupSrc.slice(popupSrc.indexOf('async function labsOptionalScopeAfterFlip'), popupSrc.indexOf('async function renderSurfaces'));
    const labsSrc = read('core/labs-switches.js').replace(/^if \(typeof module[\s\S]*$/m, 'globalThis.FlowLabsSwitches = FlowLabsSwitches;');
    async function render(manifest) {
      const dom = new JSDOM('<!doctype html><html><body><div class="block" id="labsBlock"><div id="labs-list"></div></div></body></html>', { runScripts: 'outside-only', url: 'chrome-extension://glance/popup.html' });
      const w = dom.window;
      const bag = { glanceSwitches: Object.assign({}, ALL_ON) };
      w.chrome = {
        runtime: { id: 'ext', getManifest: () => manifest, sendMessage: async () => ({ ok: true }) },
        storage: { local: { async get() { return { glanceSwitches: bag.glanceSwitches }; }, async set(p) { Object.assign(bag, p); } } }
      };
      const ctx = dom.getInternalVMContext();
      vm.runInContext(labsSrc, ctx);
      vm.runInContext(elFn + '\n' + labsBlock + '\nglobalThis.__renderLabs = renderLabs;', ctx);
      await vm.runInContext('__renderLabs()', ctx);
      return w.document;
    }
    const s = await render(STORE);
    const block = s.getElementById('labsBlock');
    check('store popup: Labs section hidden', block.hidden === true && block.style.display === 'none');
    check('store popup: no Labs rows and no buttons (no turn on, no turn all on)', s.querySelectorAll('#labs-list .wait-item').length === 0 && s.querySelectorAll('#labs-list button').length === 0);
    const d = await render(DEV);
    check('dev popup: Labs section shown', d.getElementById('labsBlock').hidden !== true);
    check('dev popup: every Labs row renders', d.querySelectorAll('#labs-list .wait-item').length === L.IDS.length, d.querySelectorAll('#labs-list .wait-item').length);
    check('dev popup: turn all on is there', [...d.querySelectorAll('#labs-list button')].some((b) => /הפעל הכל/.test(b.textContent || '')));
  }
  console.log(failures ? 'TOTAL FAILURES: ' + failures : 'TOTAL FAILURES: 0');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.log('FAIL: crashed', e && e.stack); process.exit(1); });
