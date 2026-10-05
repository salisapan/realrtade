// background.js: the Outlook-on-the-web scripts are registered at runtime (optional permission), so the registration has
// to survive an update from an older version, must not churn on every worker wake-up, and must reach tabs that were
// already open (Chrome injects registered scripts only into pages loaded after registration).
// Run: node test/surface-register-corpus.cjs
const vm = require('vm');
const { webcrypto } = require('crypto');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

function load(opts) {
  const o = opts || {};
  const log = [];
  let registered = (o.registered || []).map((x) => JSON.parse(JSON.stringify(x)));
  const stored = Object.assign({ surfaces: { outlook: { enabled: true } } }, o.stored || {});
  const sandbox = {
    console: { log() {}, info: (...a) => log.push('info ' + a.join(' ')), warn: (...a) => log.push('warn ' + a.join(' ')), error: (...a) => log.push('error ' + a.join(' ')) },
    URLSearchParams, URL, TextEncoder, Uint8Array, crypto: webcrypto, btoa: (s) => Buffer.from(s, 'binary').toString('base64'), atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    fetch: async () => ({ ok: false, status: 500, json: async () => ({}) }),
    chrome: {
      runtime: { getManifest: () => ({ version: '0.9.15', oauth2: { client_id: 'x' }, content_scripts: [{ js: ['core/domains.js', 'src/storage.js', 'src/content-gmail.js', 'src/follow.js'] }] }), onMessage: { addListener() {} }, onInstalled: { addListener() {} }, onStartup: { addListener() {} }, lastError: null, getURL: (s) => s, id: 'ext' },
      identity: { getAuthToken: (x, cb) => cb(null), removeCachedAuthToken: (x, cb) => cb(), getRedirectURL: () => 'https://ext.chromiumapp.org/', launchWebAuthFlow: () => {} },
      storage: { local: { get: async (k) => { const s = JSON.parse(JSON.stringify(stored)); if (typeof k === 'string') return { [k]: s[k] }; if (Array.isArray(k)) { const r = {}; k.forEach((x) => { r[x] = s[x]; }); return r; } if (k && typeof k === 'object') return Object.assign({}, k, s); return s; }, set: async (p) => { Object.assign(stored, p); }, remove: async () => {} }, onChanged: { addListener() {} } },
      permissions: { contains: async () => o.granted !== false, remove: async () => true },
      scripting: {
        getRegisteredContentScripts: async (f) => registered.filter((r) => !f || !f.ids || f.ids.indexOf(r.id) >= 0),
        registerContentScripts: async (list) => { list.forEach((x) => { if (registered.some((r) => r.id === x.id)) throw new Error('Duplicate script ID ' + x.id); registered.push(JSON.parse(JSON.stringify(x))); log.push('register ' + x.id); }); },
        unregisterContentScripts: async (f) => { registered = registered.filter((r) => f.ids.indexOf(r.id) < 0); log.push('unregister ' + f.ids.join(',')); },
        executeScript: async (d) => {
          if (d.func) {
            const tab = (o.tabs || []).find((t) => t.id === d.target.tabId);
            const src = String(d.func);
            if (/rescan/.test(src)) { log.push('rescan ' + d.target.tabId); return [{ result: null }]; }
            return [{ result: { globals: Boolean(tab && tab.globals), alive: Boolean(tab && tab.alive) } }];
          }
          log.push('inject ' + d.target.tabId + ' ' + d.files.length + ' files'); return [{}];
        },
        insertCSS: async (d) => { log.push('css ' + d.target.tabId); }
      },
      tabs: { query: async (q) => (o.tabs || []).filter((t) => (q.url || []).some((p) => t.url.indexOf(p.replace('/*', '')) === 0)), sendMessage: () => {} },
      windows: { create: () => {}, onRemoved: { addListener() {} } },
      alarms: { create: () => {}, onAlarm: { addListener() {} } },
      contextMenus: { create: () => {}, removeAll: (cb) => cb && cb(), onClicked: { addListener() {} } }
    }
  };
  sandbox.self = sandbox; sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(require('./load-background.cjs').backgroundScript(), sandbox, { filename: 'background.js' });
  return { log, fn: (n) => vm.runInContext(n, sandbox), registered: () => registered, settle: () => new Promise((r) => setTimeout(r, 30)) };
}

(async () => {
  console.log('\n--- registration ---\n');
  {
    const env = load({ registered: [{ id: 'flow-outlook', js: ['core/old.js', 'src/content-outlook.js'], css: ['src/chip.css'], matches: ['https://outlook.live.com/*'] }] });
    await env.settle(); // the worker restores enabled surfaces on start
    const r = env.registered().find((x) => x.id === 'flow-outlook');
    const want = env.fn('surfaceScripts')('outlook');
    check('a stale list left by an older version is replaced by this version\'s list', r && JSON.stringify(r.js) === JSON.stringify(want), r && r.js);
    check('the Gmail-only page scripts are not in it, the Outlook page script is last', want.indexOf('src/content-gmail.js') < 0 && want[want.length - 1] === 'src/content-outlook.js', want);
    check('every Outlook address is matched (live, office, office365)', ['https://outlook.live.com/*', 'https://outlook.office.com/*', 'https://outlook.office365.com/*'].every((m) => r.matches.indexOf(m) >= 0), r.matches);
    const before = env.log.filter((l) => /^(un)?register/.test(l)).length;
    const again = await env.fn('registerSurface')('outlook');
    check('when the list is already right, a worker wake-up does not unregister and register again', again.ok && !again.registered && env.log.filter((l) => /^(un)?register/.test(l)).length === before, env.log);
    const [a, b] = await Promise.all([env.fn('registerSurface')('outlook'), env.fn('registerSurface')('outlook')]);
    check('two callers at once (install + start-up) share one registration, no "Duplicate script ID"', a.ok && b.ok && !env.log.some((l) => /Duplicate/.test(l)), env.log);
  }
  {
    const env = load({ granted: false });
    const r = await env.fn('registerSurface')('outlook');
    check('without the Outlook permission nothing is registered', !r.ok && r.reason === 'no-permission' && env.registered().length === 0);
  }

  console.log('\n--- tabs that were already open ---\n');
  {
    const env = load({ tabs: [
      { id: 1, url: 'https://outlook.live.com/mail/0/inbox/id/AQQk', globals: false },
      { id: 2, url: 'https://outlook.office.com/mail/', globals: true, alive: true },
      { id: 3, url: 'https://outlook.live.com/mail/0/', globals: true, alive: false },
      { id: 4, url: 'https://mail.google.com/mail/u/0/', globals: false }
    ] });
    await env.settle();
    check('an open Outlook tab with no Glance gets the CSS and every script', env.log.indexOf('css 1') >= 0 && env.log.some((l) => /^inject 1 \d+ files/.test(l)), env.log);
    check('a tab with a live copy is asked to look again, not injected twice', env.log.indexOf('rescan 2') >= 0 && !env.log.some((l) => /^inject 2/.test(l)), env.log);
    check('a tab with an old copy cut off by an update is left alone, with a hint to reload it', !env.log.some((l) => /^inject 3/.test(l)) && env.log.some((l) => /old copy; reload/.test(l)), env.log);
    check('other sites are never touched', !env.log.some((l) => / 4( |$)/.test(l)), env.log);
  }

  console.log('\nTOTAL FAILURES:', failures);
  process.exit(failures ? 1 : 0);
})();
