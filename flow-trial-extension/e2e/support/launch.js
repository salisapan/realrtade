const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('@playwright/test');
const { ME } = require('./sentences');
const { gmailHtml, outlookHtml, outlookUrl, gmailUrl } = require('./fixtures');

const EXT_ROOT = path.resolve(__dirname, '../..');
const SKIP_DIRS = new Set(['node_modules', 'e2e', 'e2e-report', 'test-results', 'playwright-report', 'test']);

function copyExtension() {
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'glance-ext-'));
  fs.cpSync(EXT_ROOT, dest, {
    recursive: true,
    filter: (src) => {
      const rel = path.relative(EXT_ROOT, src);
      if (!rel) return true;
      const top = rel.split(path.sep)[0];
      return !SKIP_DIRS.has(top);
    }
  });
  const manifestPath = path.join(dest, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const extra = [
    'https://outlook.live.com/*',
    'https://outlook.office.com/*',
    'https://outlook.office365.com/*',
    'https://graph.microsoft.com/*',
    'https://login.microsoftonline.com/*'
  ];
  manifest.host_permissions = Array.from(new Set((manifest.host_permissions || []).concat(extra)));
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return dest;
}

function outlookAuth(opts) {
  const o = opts || {};
  const scopes = ['offline_access', 'User.Read', 'Mail.Read', 'Mail.ReadWrite'];
  if (o.tasks !== false) scopes.push('Tasks.ReadWrite');
  if (o.files !== false) scopes.push('Files.ReadWrite');
  const now = Date.now();
  return {
    token: {
      accessToken: 'AT-e2e',
      refreshToken: 'RT-e2e',
      expiresAt: now + 60 * 60 * 1000,
      rtIssuedAt: now,
      grantedScopes: scopes.slice(),
      scopes: scopes.slice(),
      scope: scopes.join(' ')
    },
    account: { address: ME, name: 'Glance', mail: ME, userPrincipalName: ME },
    ownAddresses: [ME],
    profile: { mail: ME, userPrincipalName: ME, displayName: 'Glance' },
    requestedScopes: scopes.slice()
  };
}

// Installed inside the service worker. Inert unless this harness calls it.
// Network mocks live here because extension fetches do not always hit context.route.
function installE2EHooks() {
  if (globalThis.__glanceE2e && globalThis.__glanceE2e.installed) return { ok: true, already: true };
  const e2e = globalThis.__glanceE2e || {};
  e2e.installed = true;
  e2e.calls = e2e.calls || [];
  e2e.authCalls = e2e.authCalls || [];
  e2e.flows = e2e.flows || [];
  e2e.authFail = false;
  e2e.scenario = e2e.scenario || { inbox: [], sent: [], messages: {}, attachments: {}, conversation: [] };
  e2e.googleTasks = e2e.googleTasks || {};
  e2e.todoTasks = e2e.todoTasks || {};
  e2e.drafts = e2e.drafts || {};
  e2e.driveItems = e2e.driveItems || {};
  e2e.driveByName = e2e.driveByName || {};
  e2e.seq = e2e.seq || 1;
  globalThis.__glanceE2e = e2e;

  function json(status, body) {
    return new Response(JSON.stringify(body), {
      status: status,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  function empty(status) {
    return new Response(null, { status: status });
  }

  const origFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = function glanceE2EFetch(input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    let parsed;
    try { parsed = new URL(url); } catch (err) { return origFetch(input, init); }
    const host = parsed.hostname;
    const watched = host === 'graph.microsoft.com' || host === 'login.microsoftonline.com' ||
      host === 'tasks.googleapis.com' || host === 'gmail.googleapis.com' ||
      host === 'www.googleapis.com' || host === 'oauth2.googleapis.com' || host === 'theflow-ai.com';
    if (!watched) return origFetch(input, init);
    const method = String((init && init.method) || (typeof input !== 'string' && input && input.method) || 'GET').toUpperCase();
    e2e.calls.push({ url: url, method: method, at: Date.now() });
    const path = decodeURIComponent(parsed.pathname);
    const scenario = e2e.scenario || {};

    if (host === 'login.microsoftonline.com') return Promise.resolve(json(400, { error: 'e2e-no-login' }));
    if (host === 'theflow-ai.com' || host === 'gmail.googleapis.com' || host === 'oauth2.googleapis.com') {
      return Promise.resolve(json(200, {}));
    }
    if (host === 'www.googleapis.com') {
      if (path.indexOf('/oauth2/') >= 0 || path.indexOf('/drive/') >= 0 || path.indexOf('/calendar/') >= 0) {
        return Promise.resolve(json(200, { files: [], items: [] }));
      }
      return Promise.resolve(json(200, {}));
    }

    if (host === 'tasks.googleapis.com') {
      const one = path.match(/\/lists\/([^/]+)\/tasks\/([^/]+)$/);
      const col = path.match(/\/lists\/([^/]+)\/tasks$/);
      if (one) {
        const id = one[2];
        if (method === 'DELETE') {
          delete e2e.googleTasks[id];
          return Promise.resolve(empty(204));
        }
        const task = e2e.googleTasks[id];
        return Promise.resolve(task ? json(200, task) : json(404, { error: { message: 'missing' } }));
      }
      if (col && method === 'POST') {
        const id = 'e2e-gtask-' + (e2e.seq++);
        e2e.googleTasks[id] = { id: id, title: 'e2e', status: 'needsAction' };
        return Promise.resolve(json(200, e2e.googleTasks[id]));
      }
      if (path.indexOf('/users/') >= 0 && path.indexOf('/lists') >= 0) {
        return Promise.resolve(json(200, { items: [{ id: 'glance-list', title: 'Glance' }] }));
      }
      return Promise.resolve(json(404, { error: { message: 'e2e-unmocked', path: path } }));
    }

    if (host === 'graph.microsoft.com') {
      const attItem = path.match(/\/me\/messages\/([^/]+)\/attachments\/([^/]+)$/);
      if (attItem) {
        const messageId = attItem[1];
        const attachmentId = attItem[2];
        const list = (scenario.attachments && scenario.attachments[messageId]) || [];
        const row = list.find((a) => a && a.id === attachmentId) || { id: attachmentId, name: 'file.bin' };
        return Promise.resolve(json(200, {
          id: attachmentId,
          name: row.name || 'file.bin',
          contentType: row.contentType || 'application/octet-stream',
          size: row.size || 3,
          contentBytes: 'ZTJlLXBkZg=='
        }));
      }
      const att = path.match(/\/me\/messages\/([^/]+)\/attachments$/);
      if (att && method === 'GET') {
        const id = att[1];
        if (scenario.attachmentFailIds && scenario.attachmentFailIds.indexOf(id) >= 0) {
          return Promise.resolve(json(500, { error: { message: 'unread' } }));
        }
        const list = (scenario.attachments && scenario.attachments[id]) || [];
        return Promise.resolve(json(200, { value: list }));
      }
      if (att && method === 'POST') {
        return Promise.resolve(json(201, { id: 'e2e-att-' + (e2e.seq++) }));
      }
      const driveContent = path.match(/\/me\/drive\/root:\/(.+):\/content$/);
      if (driveContent && method === 'PUT') {
        const name = driveContent[1];
        const id = 'e2e-file-' + (e2e.seq++);
        const item = { id: id, name: name, webUrl: 'https://onedrive.live.com/file/' + id };
        e2e.driveItems[id] = item;
        e2e.driveByName[name] = item;
        return Promise.resolve(json(201, item));
      }
      const driveRoot = path.match(/\/me\/drive\/root:\/(.+)$/);
      if (driveRoot && method === 'GET') {
        const item = e2e.driveByName[driveRoot[1]];
        return Promise.resolve(item ? json(200, item) : json(404, { error: { code: 'itemNotFound' } }));
      }
      const driveItem = path.match(/\/me\/drive\/items\/([^/]+)$/);
      if (driveItem) {
        const id = driveItem[1];
        if (method === 'DELETE') {
          const gone = e2e.driveItems[id];
          if (gone && gone.name) delete e2e.driveByName[gone.name];
          delete e2e.driveItems[id];
          return Promise.resolve(empty(204));
        }
        const item = e2e.driveItems[id];
        return Promise.resolve(item ? json(200, item) : json(404, { error: { code: 'itemNotFound' } }));
      }
      const createdReply = path.match(/\/me\/messages\/([^/]+)\/createReply$/);
      if (createdReply && method === 'POST') {
        const id = 'e2e-draft-' + (e2e.seq++);
        e2e.drafts[id] = { id: id, isDraft: true };
        return Promise.resolve(json(201, e2e.drafts[id]));
      }
      const todoOne = path.match(/\/me\/todo\/lists\/([^/]+)\/tasks\/([^/]+)$/);
      const todoCol = path.match(/\/me\/todo\/lists\/([^/]+)\/tasks$/);
      if (todoOne) {
        const id = todoOne[2];
        if (method === 'DELETE') {
          delete e2e.todoTasks[id];
          return Promise.resolve(empty(204));
        }
        if (method === 'GET' && scenario.todoVerifyFail) {
          return Promise.resolve(json(404, { error: { message: 'verify-fail' } }));
        }
        const task = e2e.todoTasks[id];
        return Promise.resolve(task ? json(200, task) : json(404, { error: { message: 'missing' } }));
      }
      if (todoCol && method === 'POST') {
        const id = 'e2e-todo-' + (e2e.seq++);
        e2e.todoTasks[id] = { id: id, title: 'e2e' };
        return Promise.resolve(json(200, e2e.todoTasks[id]));
      }
      if (path === '/v1.0/me/todo/lists' || path.endsWith('/me/todo/lists')) {
        return Promise.resolve(json(200, { value: [{ id: 'todo-list', wellknownListName: 'defaultList', displayName: 'Tasks' }] }));
      }
      if (path.indexOf('/me/mailFolders/inbox/messages') >= 0) {
        const search = parsed.search || '';
        if (scenario.inboxFilterFails && /\$orderby=/.test(search) && /\$filter=/.test(search)) {
          return Promise.resolve(json(400, { error: { code: 'ErrorInvalidUrlQueryFilter', message: 'restriction or sort order too complex' } }));
        }
        return Promise.resolve(json(200, { value: scenario.inbox || [] }));
      }
      if (path.indexOf('/me/mailFolders/sentitems/messages') >= 0) {
        return Promise.resolve(json(200, { value: scenario.sent || [] }));
      }
      if (path.indexOf('/me/messages') >= 0 && parsed.search.indexOf('conversationId') >= 0) {
        return Promise.resolve(json(200, { value: scenario.conversation || [] }));
      }
      if (path.indexOf('/me/mailboxSettings') >= 0) {
        return Promise.resolve(json(200, scenario.mailboxSettings || { timeFormat: 'h:mm tt' }));
      }
      if (path.indexOf('/me/messages') >= 0 && (parsed.search.indexOf('$filter=') >= 0 || parsed.search.indexOf('%24filter') >= 0 || parsed.search.indexOf('$skip=') >= 0 || parsed.search.indexOf('$skiptoken') >= 0)) {
        if (scenario.mailboxOverflow) {
          const filler = [];
          for (let i = 0; i < 200; i++) {
            filler.push({ id: 'overflow-' + i, subject: 'overflow', conversationId: 'c-overflow', from: { emailAddress: { address: 'a@b.com' } }, receivedDateTime: '2026-10-08T10:00:00.000Z' });
          }
          return Promise.resolve(json(200, {
            value: filler,
            '@odata.nextLink': 'https://graph.microsoft.com/v1.0/me/messages?$skiptoken=more'
          }));
        }
        if (scenario.badNextLink) {
          return Promise.resolve(json(200, {
            value: (scenario.inbox || []).slice(0, 1),
            '@odata.nextLink': 'https://evil.example/me/messages?$skiptoken=x'
          }));
        }
        const search = decodeURIComponent(parsed.search || '');
        const matched = (scenario.mailbox || scenario.inbox || []).filter((m) => {
          if (!m) return false;
          const sub = String(m.subject || '');
          const from = String((m.from && m.from.emailAddress && m.from.emailAddress.address) || '');
          if (sub && search.indexOf(sub) < 0 && search.indexOf(sub.replace(/'/g, "''")) < 0) return false;
          if (from && search.toLowerCase().indexOf(from.toLowerCase()) < 0) return false;
          return true;
        });
        let top = 50;
        let skip = 0;
        const topM = search.match(/\$top=(\d+)/);
        const skipM = search.match(/\$skip=(\d+)/);
        if (topM) top = +topM[1];
        if (skipM) skip = +skipM[1];
        const slice = matched.slice(skip, skip + top);
        const body = { value: slice };
        if (skip + top < matched.length) {
          body['@odata.nextLink'] = 'https://graph.microsoft.com/v1.0/me/messages?$top=' + top + '&$skip=' + (skip + top) + '&$filter=' + encodeURIComponent('kept');
        }
        return Promise.resolve(json(200, body));
      }
      const msg = path.match(/\/me\/messages\/([^/]+)$/);
      if (msg) {
        const id = msg[1];
        if (e2e.drafts[id]) {
          if (method === 'DELETE') {
            delete e2e.drafts[id];
            return Promise.resolve(empty(204));
          }
          if (method === 'PATCH') return Promise.resolve(json(200, e2e.drafts[id]));
          return Promise.resolve(json(200, e2e.drafts[id]));
        }
        const row = scenario.messages && Object.prototype.hasOwnProperty.call(scenario.messages, id) ? scenario.messages[id] : null;
        if (row && row.id) return Promise.resolve(json(200, row));
        return Promise.resolve(json(404, { error: { code: 'ErrorItemNotFound' } }));
      }
      if (path === '/v1.0/me' || path.endsWith('/me')) {
        return Promise.resolve(json(200, { mail: 'glance.salisapan@outlook.com', userPrincipalName: 'glance.salisapan@outlook.com', displayName: 'Glance' }));
      }
      return Promise.resolve(json(404, { error: { message: 'e2e-unmocked', path: path } }));
    }
    return Promise.resolve(json(599, { error: 'e2e-unmocked' }));
  };

  e2e.googleAuthToken = function (interactive) {
    e2e.authCalls.push({ interactive: Boolean(interactive), at: Date.now() });
    if (e2e.authFail) return Promise.reject(new Error('The user did not approve access.'));
    return Promise.resolve('ya29.e2e');
  };

  const identity = chrome.identity;
  if (!identity) return { ok: true, authWritable: false, identity: false };
  const authStub = function (details, cb) {
    const interactive = Boolean(details && details.interactive);
    e2e.authCalls.push({ interactive: interactive, at: Date.now() });
    const done = typeof cb === 'function' ? cb : function () {};
    if (e2e.authFail) {
      try { chrome.runtime.lastError = { message: 'The user did not approve access.' }; } catch (err) { /* native lastError */ }
      done(undefined);
      return;
    }
    try { chrome.runtime.lastError = undefined; } catch (err2) { /* native lastError */ }
    done('ya29.e2e');
  };
  const flowStub = function (details, cb) {
    e2e.flows.push({
      url: details && details.url,
      interactive: details ? details.interactive : undefined,
      at: Date.now()
    });
    const done = typeof cb === 'function' ? cb : function () {};
    try { chrome.runtime.lastError = { message: 'e2e-no-window' }; } catch (err) { /* native */ }
    done(undefined);
  };
  const removeStub = function (details, cb) {
    e2e.authCalls.push({ removeCached: true, at: Date.now() });
    if (typeof cb === 'function') cb();
  };
  function force(obj, name, value) {
    if (!obj) return 'missing';
    try {
      obj[name] = value;
      if (obj[name] === value) return 'assigned';
    } catch (err) { /* try defineProperty */ }
    try {
      Object.defineProperty(obj, name, { configurable: true, writable: true, value: value });
      if (obj[name] === value) return 'defined';
    } catch (err) { return 'frozen'; }
    return 'unchanged';
  }
  const proto = Object.getPrototypeOf(identity);
  const authHow = force(identity, 'getAuthToken', authStub) + (proto ? '/' + force(proto, 'getAuthToken', authStub) : '');
  const flowHow = force(identity, 'launchWebAuthFlow', flowStub);
  const removeHow = force(identity, 'removeCachedAuthToken', removeStub);
  let desc = null;
  try {
    const d = Object.getOwnPropertyDescriptor(identity, 'getAuthToken') || Object.getOwnPropertyDescriptor(Object.getPrototypeOf(identity), 'getAuthToken');
    desc = d ? { writable: d.writable, configurable: d.configurable } : null;
  } catch (err) { desc = null; }
  e2e.authWritable = identity.getAuthToken === authStub;
  return { ok: true, authWritable: e2e.authWritable, authHow: authHow, flowHow: flowHow, removeHow: removeHow, desc: desc };
}

async function boot() {
  const extDir = copyExtension();
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'glance-profile-'));
  const context = await chromium.launchPersistentContext(userData, {
    headless: false,
    viewport: { width: 1280, height: 800 },
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [
      '--headless=new',
      '--disable-extensions-except=' + extDir,
      '--load-extension=' + extDir,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-dev-shm-usage'
    ]
  });

  const documents = new Map();
  await context.route(/https:\/\/(mail\.google\.com|outlook\.live\.com)\//, async (route) => {
    const req = route.request();
    const bare = req.url().split('#')[0];
    if (req.resourceType() === 'document' && documents.has(bare)) {
      await route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: documents.get(bare)
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'text/plain', body: '' });
  });

  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 30000 });
  context.on('serviceworker', (next) => { worker = next; });

  async function currentWorker() {
    const live = context.serviceWorkers();
    if (!live.length) worker = await context.waitForEvent('serviceworker', { timeout: 15000 });
    else if (!live.includes(worker)) worker = live[0];
    return worker;
  }

  const harness = {
    context,
    extDir,
    documents,
    worker: null,
    page: null,
    keepPopup: false
  };

  async function evalWorker(fn, arg) {
    const w = await currentWorker();
    harness.worker = w;
    return w.evaluate(fn, arg);
  }

  const hooked = await evalWorker(installE2EHooks);
  harness.identityHook = hooked;
  await evalWorker(() => { globalThis.__glanceE2e.authCalls = []; globalThis.__glanceE2e.calls = []; });

  const extensionId = worker.url().split('/')[2];
  harness.extensionId = extensionId;

  function popupUrl() {
    return 'chrome-extension://' + extensionId + '/popup/popup.html';
  }

  async function closeStrayPopups() {
    for (const p of context.pages()) {
      if (!harness.keepPopup && p.url().indexOf('popup/popup.html') >= 0) {
        await p.close().catch(() => {});
      }
    }
  }
  await closeStrayPopups();

  harness.seed = async function seed(data) {
    await evalWorker(async (bag) => { await chrome.storage.local.set(bag); }, data);
  };

  harness.storage = async function storage() {
    return evalWorker(() => new Promise((resolve) => chrome.storage.local.get(null, resolve)));
  };

  harness.apiCalls = async function apiCalls() {
    return evalWorker(() => (globalThis.__glanceE2e && globalThis.__glanceE2e.calls) || []);
  };

  harness.authCalls = async function authCalls() {
    return evalWorker(() => (globalThis.__glanceE2e && globalThis.__glanceE2e.authCalls) || []);
  };

  harness.flows = async function flows() {
    return evalWorker(() => (globalThis.__glanceE2e && globalThis.__glanceE2e.flows) || []);
  };

  harness.setAuthFail = async function setAuthFail(fail) {
    await evalWorker((on) => { globalThis.__glanceE2e.authFail = Boolean(on); }, fail);
  };

  harness.setScenario = async function setScenario(scenario) {
    await evalWorker((next) => { globalThis.__glanceE2e.scenario = next; }, scenario || {});
  };

  harness.now = async function now() {
    return evalWorker(() => Date.now());
  };

  // Runs in the service worker. Content-script globals live in the isolated
  // world, so a page.evaluate on the mail tab cannot see them.
  harness.evaluateWorker = function evaluateWorker(fn, arg) {
    return evalWorker(fn, arg);
  };

  harness.reset = async function reset() {
    harness.keepPopup = false;
    await evalWorker(installE2EHooks);
    await evalWorker(async () => {
      await chrome.storage.local.clear();
      const e = globalThis.__glanceE2e;
      e.calls = [];
      e.authCalls = [];
      e.flows = [];
      e.authFail = false;
      e.scenario = { inbox: [], sent: [], messages: {}, attachments: {}, conversation: [] };
      e.googleTasks = {};
      e.todoTasks = {};
      e.drafts = {};
      e.driveItems = {};
      e.driveByName = {};
      e.seq = 1;
    });
    for (const p of context.pages()) {
      const url = p.url();
      if (url.indexOf('popup/popup.html') >= 0 || url.indexOf('mail.google.com') >= 0 || url.indexOf('outlook.live.com') >= 0) {
        await p.close().catch(() => {});
      }
    }
    harness.page = null;
  };

  async function openDocument(url, html) {
    documents.set(url.split('#')[0], html);
    const page = await context.newPage();
    page.on('pageerror', () => {});
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    harness.page = page;
    return page;
  }

  harness.openOutlook = async function openOutlook(opts) {
    const o = opts || {};
    const id = o.id;
    const url = outlookUrl(id);
    return openDocument(url, outlookHtml(o));
  };

  harness.openGmail = async function openGmail(opts) {
    const o = opts || {};
    const url = gmailUrl(o.messageId);
    return openDocument(url, gmailHtml(o));
  };

  harness.seedOutlook = async function seedOutlook(extra, authOpts) {
    const bag = Object.assign({
      onboarded: true,
      outlookAuth: outlookAuth(authOpts)
    }, extra || {});
    await harness.seed(bag);
  };

  harness.seedGmail = async function seedGmail(extra) {
    await harness.seed(Object.assign({
      onboarded: true,
      connectorId: 'googleTasks',
      googleTasksAuth: { taskListId: 'glance-list' }
    }, extra || {}));
  };

  harness.openPopup = async function openPopup() {
    harness.keepPopup = true;
    const page = await context.newPage();
    await page.addInitScript(() => {
      const orig = chrome.runtime.sendMessage.bind(chrome.runtime);
      chrome.runtime.sendMessage = function (msg, cb) {
        if (msg && msg.type === 'flow:build-stamp' && typeof cb === 'function') {
          return orig(msg, (r) => {
            try { document.documentElement.setAttribute('data-glance-stamp', (r && r.build) || ''); } catch (e) { /* page gone */ }
            cb(r);
          });
        }
        return orig(msg, cb);
      };
    });
    await page.goto(popupUrl(), { waitUntil: 'domcontentloaded', timeout: 30000 });
    harness.page = page;
    return page;
  };

  const popup = await context.newPage();
  await popup.goto(popupUrl(), { waitUntil: 'commit', timeout: 30000 });
  const enabled = await popup.evaluate(() => new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'flow:surface-enable', id: 'outlook' }, (r) => {
      resolve(r || { ok: false, error: chrome.runtime.lastError && chrome.runtime.lastError.message });
    });
  }));
  await popup.close().catch(() => {});
  if (!enabled || !enabled.ok) throw new Error('OUTLOOK_SURFACE_FAILED:' + JSON.stringify(enabled));

  harness.close = async function close() {
    await context.close().catch(() => {});
    fs.rmSync(extDir, { recursive: true, force: true });
    fs.rmSync(userData, { recursive: true, force: true });
  };

  harness.outlookAuth = outlookAuth;
  return harness;
}

module.exports = { boot, outlookAuth, copyExtension };
