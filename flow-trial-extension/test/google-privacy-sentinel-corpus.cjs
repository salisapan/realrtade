// Seeded Google Calendar / Tasks / Contacts data must not appear on assist,
// relay, classify-remote, or execute outbound bodies (any key, including maskedText).
// Full path: page plan -> chip -> Do It -> background.js.
// Run: node test/google-privacy-sentinel-corpus.cjs
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { webcrypto } = require('crypto');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const lb = require('./load-background.cjs');
const { FlowGoogleContacts: G } = require('../core/google-contacts.js');
const { FlowCloseChains: CC } = require('../core/close-chains.js');

const SENT_CAL_TITLE = 'GLN_PRIV_CAL_EVT_a91f02';
const SENT_CAL_NOTE = 'GLN_PRIV_CAL_NOTE_a91f02';
const SENT_TASK_TITLE = 'GLN_PRIV_TASK_TTL_a91f02';
const SENT_TASK_NOTE = 'GLN_PRIV_TASK_NOTE_a91f02';
const SENT_CONTACT_NAME = 'GLN_PRIV_CT_NAME_a91f02';
const SENT_CONTACT_EMAIL = 'gln-priv-ct-email-a91f02@example.invalid';
const SENTINELS = [SENT_CAL_TITLE, SENT_CAL_NOTE, SENT_TASK_TITLE, SENT_TASK_NOTE, SENT_CONTACT_NAME, SENT_CONTACT_EMAIL];

const OAUTH_SCOPES_EXACT = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/drive.file',
  'openid',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email'
];
const GRANTED = {
  version: OAUTH_SCOPES_EXACT.concat([
    'https://www.googleapis.com/auth/gmail.compose',
    'https://www.googleapis.com/auth/drive.readonly'
  ]).join('\n'),
  status: 'granted',
  source: 'chrome',
  at: 1
};
const SCOPE_GMAIL_COMPOSE = 'https://www.googleapis.com/auth/gmail.compose';
const SCOPE_DRIVE_READONLY = 'https://www.googleapis.com/auth/drive.readonly';
const GRANTED_NO_COMPOSE = {
  version: GRANTED.version.split('\n').filter((s) => s !== SCOPE_GMAIL_COMPOSE).join('\n'),
  status: 'granted',
  source: 'chrome',
  at: 1
};
const GRANTED_NO_DRIVE = {
  version: GRANTED.version.split('\n').filter((s) => s !== SCOPE_DRIVE_READONLY).join('\n'),
  status: 'granted',
  source: 'chrome',
  at: 1
};

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail).slice(0, 900) : ''); }
}

function res(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) };
}

function deepScan(value, hit) {
  if (value == null) return;
  if (typeof value === 'string') {
    for (const s of SENTINELS) if (value.indexOf(s) >= 0) hit.push(s);
    return;
  }
  if (typeof value === 'object') {
    if (Array.isArray(value)) value.forEach((v) => deepScan(v, hit));
    else Object.keys(value).forEach((k) => { deepScan(k, hit); deepScan(value[k], hit); });
  }
}

function assertNoSentinels(label, payloads) {
  const hit = [];
  payloads.forEach((p) => deepScan(p, hit));
  check(label + ': no sentinel in outbound payloads', hit.length === 0, hit.length ? { hit, sample: payloads[0] } : undefined);
}

function isCloudOutbound(url) {
  const u = String(url || '');
  return /glance-assist|token-relay|classify-remote|generativelanguage\.googleapis\.com/.test(u);
}

function loadGoogleLaneHost(sandbox) {
  const cores = [
    'google-account.js', 'google-calendar.js', 'google-tasks.js', 'google-drive.js',
    'google-docs.js', 'google-sheets.js', 'google-compose.js', 'google-drafts.js', 'google-proof.js',
    'extract.js', 'file-attach.js', 'proof-of-close.js',
    'google-contacts.js', 'event-call-link.js', 'meet-link.js', 'recurring-reminder.js', 'workspace-file.js',
    'google-closes.js', 'style-profile.js', 'full-document-close.js', 'google-task-close.js'
  ];
  for (const f of cores) {
    if (!sandbox.FlowGoogleTasks && f === 'google-tasks.js') { /* config already loaded */ }
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'core', f), 'utf8'), sandbox, { filename: f });
  }
  if (!sandbox.FlowGoogleLane) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'src', 'google-lane.js'), 'utf8'), sandbox, { filename: 'google-lane.js' });
  }
  const hostSrc = fs.readFileSync(path.join(ROOT, 'src', 'google-lane-host.js'), 'utf8').replace(/^import .*;$/gm, '');
  vm.runInContext(hostSrc, sandbox, { filename: 'google-lane-host.js' });
}

function createBackground(stored, routeFn, outbound, googleReads) {
  const listeners = [];
  let tokenSeq = 0;
  const reads = googleReads || [];
  const bag = JSON.parse(JSON.stringify(stored || {}));
  const sandbox = {
    console,
    fetch: async (url, options) => {
      const method = (options && options.method) || 'GET';
      const u = String(url);
      const body = options && options.body ? (() => { try { return JSON.parse(options.body); } catch (e) { return options.body; } })() : null;
      if (/tasks\.googleapis\.com|calendar\.googleapis\.com|www\.googleapis\.com\/calendar|people\.googleapis\.com/.test(u)) {
        reads.push({ url: u, method });
        outbound.push({ kind: 'google-api', url: u, method, body });
      }
      if (isCloudOutbound(u)) outbound.push({ kind: 'fetch', url: u, body });
      const routed = routeFn(u, method, body);
      if (routed) return routed;
      return res(500, { error: 'unrouted' });
    },
    chrome: {
      runtime: {
        getManifest: () => ({ oauth2: { client_id: 'real.apps.googleusercontent.com', scopes: OAUTH_SCOPES_EXACT.slice() }, version: '0.9.56' }),
        onMessage: { addListener: (fn) => listeners.push(fn) },
        onInstalled: { addListener() {} },
        onStartup: { addListener() {} },
        lastError: null,
        getURL: (s) => s,
        id: 'ext'
      },
      identity: {
        getAuthToken: (_o, cb) => cb('tok' + (++tokenSeq)),
        removeCachedAuthToken: (_o, cb) => cb(),
        launchWebAuthFlow: () => {}
      },
      storage: {
        local: {
          get: async (k) => (typeof k === 'string' ? { [k]: bag[k] } : bag),
          set: async (patch) => { Object.assign(bag, patch); }
        }
      },
      windows: { create: () => {}, onRemoved: { addListener() {} } },
      tabs: { sendMessage: () => {} },
      alarms: { create: () => {}, onAlarm: { addListener() {} } },
      contextMenus: { create() {}, onClicked: { addListener() {} } }
    },
    URLSearchParams,
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    crypto: webcrypto,
    TextEncoder,
    Uint8Array
  };
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(lb.GOOGLE_CONFIG_SRC, sandbox, { filename: 'google-config.js' });
  vm.runInContext(lb.backgroundScript(), sandbox, { filename: 'background.js' });
  vm.runInContext(lb.LANE_ACCOUNT_STUB, sandbox);
  loadGoogleLaneHost(sandbox);
  const send = (msg) => new Promise((resolve) => {
    let settled = false;
    const reply = (r) => {
      if (!settled) { settled = true; resolve(r); }
    };
    const sender = { id: 'ext' };
    for (let i = 0; i < listeners.length; i++) {
      try {
        if (listeners[i](msg, sender, reply) === true) return;
      } catch (e) {
        if (!settled) { settled = true; resolve({ ok: false, error: String(e) }); }
        return;
      }
    }
    setTimeout(() => { if (!settled) resolve(undefined); }, 2500);
  });
  const runtimeMessages = [];
  sandbox.chrome.runtime.sendMessage = function(msg, cb) {
    runtimeMessages.push(msg);
    if (typeof cb === 'function') cb(undefined);
  };
  return { send, sandbox, listeners, googleReads: reads, runtimeMessages };
}

function pinDate(w) {
  const RealDate = w.Date;
  const fixed = new RealDate(2026, 9, 16, 12).getTime();
  function FixedDate(...a) {
    if (a.length === 0) return new RealDate(fixed);
    return new RealDate(...a);
  }
  FixedDate.now = () => fixed;
  FixedDate.parse = RealDate.parse;
  FixedDate.UTC = RealDate.UTC;
  FixedDate.prototype = RealDate.prototype;
  w.Date = FixedDate;
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function patchJsdomInnerText(doc) {
  doc.querySelectorAll('.a3s, .a3s.aiL').forEach((el) => {
    if (el.innerText) return;
    Object.defineProperty(el, 'innerText', {
      configurable: true,
      get() { return this.textContent || ''; }
    });
  });
}

async function clickDo(host) {
  const go = host && (host.querySelector('.do-halo') || host.querySelector('button.flow-chip'));
  if (go) go.click();
  await sleep(2200);
  return Boolean(go);
}

function readComposeValue(el) {
  if (!el) return '';
  if (el.isContentEditable) return el.textContent || '';
  return el.value != null ? String(el.value) : (el.textContent || '');
}

function wireChrome(w, store, pageSent, bgSend, outbound, hooks) {
  const h = hooks || {};
  function snapshotGet(k, cb) {
    const snap = JSON.parse(JSON.stringify(store));
    let r;
    if (typeof k === 'string') r = { [k]: snap[k] };
    else if (k && typeof k === 'object' && !Array.isArray(k)) r = Object.assign({}, k, snap);
    else r = snap;
    if (cb) cb(r);
    return Promise.resolve(r);
  }
  async function dispatch(msg) {
    pageSent.push(msg);
    const t = msg && msg.type;
    if (t === 'flow:classify-remote') {
      outbound.push({ kind: 'classify-remote', body: msg.payload });
      return bgSend(msg);
    }
    if (t === 'flow:search-drive') {
      if (typeof h.searchDrive === 'function') return h.searchDrive(msg);
      return { ok: true, files: [] };
    }
    if (t === 'flow:drive-find-one') {
      if (typeof h.driveFindOne === 'function') return h.driveFindOne(msg);
      return bgSend(msg);
    }
    if (t === 'flow:pro-status') return { ok: true, active: true, record: { key: 'k', valid: true, activeUntil: Date.now() + 1e9 } };
    if (t === 'flow:connector-status') return { googleTasks: { connected: true, configured: true } };
    if (t === 'flow:follow-task') return { ok: true, ref: { taskListId: 'LIST_A', taskId: 'T1' } };
    if (t === 'flow:gmail-compose') {
      return {
        ok: true,
        where: 'Gmail',
        written: 'Ready in compose. You send it.',
        ref: {
          to: SENT_CONTACT_EMAIL,
          draftId: 'dr_priv',
          externalId: 'dr_priv',
          contentHash: 'lane-host-empty-compose',
          before: { to: '', subject: '', body: '' }
        },
        proof: { system: 'gmail/drafts', externalId: 'dr_priv', fetchedBack: true }
      };
    }
    if (t === 'flow:execute-action' || t === 'flow:google-write' || t === 'flow:google-contacts-plan') {
      if (t === 'flow:execute-action') outbound.push({ kind: 'execute', body: msg.payload });
      return bgSend(msg);
    }
    return { ok: true };
  }
  w.chrome = {
    runtime: {
      id: 'ext', lastError: null, getURL: (s) => 'chrome-extension://x/' + s,
      getManifest: () => ({ version: '0.9.56' }),
      onMessage: { addListener() {} },
      sendMessage: (msg, cb) => {
        const p = dispatch(msg);
        p.then((r) => { if (cb) cb(r); }).catch((e) => { if (cb) cb({ ok: false, error: String(e) }); });
        return p;
      }
    },
    storage: {
      local: {
        get: (k, cb) => snapshotGet(k, cb),
        set: (obj, cb) => { Object.assign(store, JSON.parse(JSON.stringify(obj))); if (cb) setTimeout(cb, 1); },
        remove: (k, cb) => { [].concat(k).forEach((x) => { delete store[x]; }); if (cb) cb(); }
      },
      onChanged: { addListener() {} },
      sync: { get: (k, cb) => { if (cb) cb({}); return Promise.resolve({}); } }
    },
    i18n: { getUILanguage: () => 'en' },
    tabs: { query: () => Promise.resolve([]), sendMessage() {} }
  };
}

function bootGmailPage(bodyText, store, pageSent, bgSend, outbound, hooks) {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  const files = manifest.content_scripts[0].js;
  const html = '<!doctype html><html lang="en"><head><title>Inbox - me@x.com - Gmail</title></head><body>'
    + '<a aria-label="Google Account: Glance (me@x.com)" href="https://accounts.google.com/SignOutOptions"></a>'
    + '<h2 class="hP">Billing</h2><div role="main"><div role="listitem" data-legacy-thread-id="t1" data-legacy-message-id="m1">'
    + '<span email="vendor@example.com">Vendor</span><div class="a3s aiL">' + bodyText + '</div></div></div>'
    + '<textarea name="to"></textarea><input name="subjectbox" />'
    + '<div aria-label="Message Body" contenteditable="true" role="textbox"></div></body></html>';
  const dom = new JSDOM(html, { url: 'https://mail.google.com/mail/u/0/#inbox/t1', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  pinDate(w);
  w.TextEncoder = TextEncoder;
  w.TextDecoder = TextDecoder;
  if (!w.crypto || !w.crypto.subtle) Object.defineProperty(w, 'crypto', { value: webcrypto });
  w.fetch = async (url, o) => {
    if (isCloudOutbound(url)) {
      const body = o && o.body ? (() => { try { return JSON.parse(o.body); } catch (e) { return o.body; } })() : null;
      outbound.push({ kind: 'fetch', url: String(url), body });
    }
    return { ok: true, headers: { get: () => '4' }, arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer, blob: async () => ({}) };
  };
  wireChrome(w, store, pageSent, bgSend, outbound, hooks);
  const ctx = dom.getInternalVMContext();
  for (const f of files) {
    new vm.Script(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f }).runInContext(ctx);
  }
  patchJsdomInnerText(w.document);
  const activityLogRows = hookActivityLog(dom);
  return { w, doc: w.document, dom, activityLogRows };
}

function hookActivityLog(dom) {
  const ctx = dom.getInternalVMContext();
  vm.runInContext(`
    globalThis.__glancePrivacyActivityRows = [];
    if (typeof FlowStorage !== 'undefined' && typeof FlowStorage.appendLog === 'function') {
      const __origAppend = FlowStorage.appendLog.bind(FlowStorage);
      FlowStorage.appendLog = async function (entry) {
        globalThis.__glancePrivacyActivityRows.push(JSON.parse(JSON.stringify(entry)));
        return __origAppend(entry);
      };
    }
  `, ctx);
  return ctx.__glancePrivacyActivityRows || [];
}

function bootGmailThread(threadRows, store, pageSent, bgSend, outbound, hooks) {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  const files = manifest.content_scripts[0].js;
  const items = threadRows.map((row, i) => {
    const mid = row.messageId || ('m' + (i + 1));
    const tid = row.threadId || 't1';
    const from = row.fromEmail || 'vendor@example.com';
    const fromName = row.fromName || 'Vendor';
    return '<div role="listitem" data-legacy-thread-id="' + tid + '" data-legacy-message-id="' + mid + '">'
      + '<span email="' + from + '" name="' + fromName + '">' + fromName + '</span>'
      + '<div class="a3s aiL">' + (row.body || '') + '</div></div>';
  }).join('');
  const html = '<!doctype html><html lang="en"><head><title>Inbox - me@x.com - Gmail</title></head><body>'
    + '<a aria-label="Google Account: Glance (me@x.com)" href="https://accounts.google.com/SignOutOptions"></a>'
    + '<h2 class="hP">Vendor booking</h2><div role="main">' + items + '</div>'
    + '<textarea name="to"></textarea><input name="subjectbox" />'
    + '<div aria-label="Message Body" contenteditable="true" role="textbox"></div></body></html>';
  const dom = new JSDOM(html, { url: 'https://mail.google.com/mail/u/0/#inbox/t1', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  pinDate(w);
  w.TextEncoder = TextEncoder;
  w.TextDecoder = TextDecoder;
  if (!w.crypto || !w.crypto.subtle) Object.defineProperty(w, 'crypto', { value: webcrypto });
  w.fetch = async (url, o) => {
    if (isCloudOutbound(url)) {
      const body = o && o.body ? (() => { try { return JSON.parse(o.body); } catch (e) { return o.body; } })() : null;
      outbound.push({ kind: 'fetch', url: String(url), body });
    }
    return { ok: true, headers: { get: () => '4' }, arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer, blob: async () => ({}) };
  };
  wireChrome(w, store, pageSent, bgSend, outbound, hooks);
  const ctx = dom.getInternalVMContext();
  for (const f of files) {
    new vm.Script(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f }).runInContext(ctx);
  }
  patchJsdomInnerText(w.document);
  const activityLogRows = hookActivityLog(dom);
  return { w, doc: w.document, dom, activityLogRows };
}

function activityLogRefBehaviour(ref) {
  if (!ref || typeof ref !== 'object') return ref;
  const out = Object.assign({}, ref);
  delete out.to;
  delete out.target;
  delete out.body;
  delete out.subject;
  if (out.before && typeof out.before === 'object') {
    const before = Object.assign({}, out.before);
    delete before.to;
    delete before.body;
    delete before.subject;
    out.before = before;
  }
  if (out.proof && typeof out.proof === 'object') {
    const proof = Object.assign({}, out.proof);
    delete proof.target;
    out.proof = proof;
  }
  return out;
}

(async () => {
  console.log('\n--- google-privacy-sentinel-corpus.cjs ---\n');

  const baseStored = {
    onboarded: true,
    connectorId: 'googleTasks',
    glanceSwitches: { GOOGLE_CONTACTS: true },
    googleTasksAuth: { taskListId: 'LIST_A' },
    googleWebAuth: { accessToken: 'ya29.sentinel', expiresAt: Date.now() + 60 * 60 * 1000 },
    googleConnectedAccount: { email: 'me@x.com' },
    googleProfile: { mail: 'me@x.com' },
    googleGrantedScopes: GRANTED,
    googleEverConnected: true,
    proLicense: { key: 'sentinel-test-key', valid: true, activeUntil: Date.now() + 7 * 86400000 }
  };

  function assertLaneTraffic(label, outbound, googleReads) {
    check(label + ': Google API read-back traffic', googleReads.length > 0, googleReads.length);
    const lane = outbound.filter((o) => o.kind === 'google-api' || o.kind === 'fetch' || o.kind === 'execute' || o.kind === 'classify-remote');
    check(label + ': non-empty lane or cloud outbound', lane.length > 0, lane.length);
  }

  console.log('--- task: plan -> Do It -> background proof read-back (sentinel only in Tasks API) ---\n');
  {
    const outbound = [];
    const googleReads = [];
    const bg = createBackground(baseStored, (url, method) => {
      if (/oauth2\/v3\/userinfo/.test(url)) return res(200, { email: 'me@x.com' });
      if (/glance-assist/.test(url) && method === 'POST') {
        return res(200, { ok: true, result: { kind: 'quiet' } });
      }
      if (/\/lists\/LIST_A\/tasks$/.test(url) && method === 'POST') return res(200, { id: 'task_sent' });
      if (/\/lists\/LIST_A\/tasks\/task_sent/.test(url) && method === 'GET') {
        return res(200, { id: 'task_sent', title: SENT_TASK_TITLE, notes: SENT_TASK_NOTE, status: 'needsAction' });
      }
      if (/\/lists\/LIST_A\/tasks\?/.test(url) && method === 'GET') return res(200, { items: [] });
      if (/\/users\/@me\/lists/.test(url)) return res(200, { items: [{ id: 'LIST_A', title: 'Glance' }] });
      return null;
    }, outbound, googleReads);
    const pageSent = [];
    const store = JSON.parse(JSON.stringify(baseStored));
    const { w } = bootGmailPage('Please log the vendor agreement by Friday October 17.', store, pageSent, bg.send, outbound);
    const ctx = {
      app: 'gmail', uiLang: 'en', messageId: 'm-task', threadId: 't-task',
      subject: 'Vendor agreement', bodyText: 'Please log the vendor agreement by Friday October 17.',
      threadUrl: 'https://mail.google.com/mail/u/0/#inbox/t-task',
      sender: { name: 'Vendor', email: 'vendor@example.com' },
      intent: { label: 'Log agreement', type: 'request', signals: { score: 80 }, entities: { what: 'log the vendor agreement', dateIso: '2026-10-17' } },
      process: {
        id: 'log-it', name: 'Log It', closingLine: 'Logged.',
        steps: [{ id: 'task', kind: 'googleTask', label: 'Task', params: { title: 'Log vendor agreement', dateIso: '2026-10-17', what: 'log the vendor agreement' } }]
      }
    };
    const card = w.__glanceGmailPage.paintPlan(ctx);
    check('task card painted', Boolean(card), null);
    await clickDo(card);
    check('task Do It reached background write', pageSent.some((m) => m.type === 'flow:google-write' || m.type === 'flow:execute-action'), pageSent.map((m) => m.type));
    assertLaneTraffic('task path', outbound, googleReads);
    check('LT: seeded task title stays off assist/execute payloads', !JSON.stringify(outbound).includes(SENT_TASK_TITLE), outbound.length);
    assertNoSentinels('task path', outbound.map((o) => o.body));
    check('LT mutant: sentinel task title in outbound would fail', !outbound.some((o) => JSON.stringify(o.body || {}).indexOf(SENT_TASK_TITLE) >= 0), outbound[0]);
    w.close();
  }

  console.log('\n--- calendar: lane host lists events (sentinel only in Calendar API) ---\n');
  {
    const outbound = [];
    const googleReads = [];
    const calStored = JSON.parse(JSON.stringify(baseStored));
    calStored.glanceSwitches = Object.assign({}, calStored.glanceSwitches, { EVENT_CALL_LINK: true });
    const start = { dateTime: '2026-10-22T15:00:00+00:00', timeZone: 'UTC' };
    const end = { dateTime: '2026-10-22T15:30:00+00:00', timeZone: 'UTC' };
    const bg = createBackground(calStored, (url, method) => {
      if (/oauth2\/v3\/userinfo/.test(url)) return res(200, { email: 'me@x.com' });
      if (/glance-assist/.test(url) && method === 'POST') return res(200, { ok: true, result: { kind: 'quiet' } });
      if (/\/calendars\/primary\/events/.test(url) && method === 'GET') {
        return res(200, {
          items: [{
            id: 'ev_sent',
            summary: 'Thursday vendor sync',
            description: SENT_CAL_NOTE,
            status: 'confirmed',
            start,
            end,
            organizer: { self: true }
          }]
        });
      }
      return null;
    }, outbound, googleReads);
    const plan = await bg.send({
      type: 'flow:google-event-link-plan',
      text: 'Can you add a Meet link to the Thursday vendor sync?'
    });
    check('calendar event-link plan returns', plan && typeof plan.action === 'string', plan);
    check('calendar event-link plan is not switch-off', plan && plan.action !== 'off' && plan.reason !== 'switch-off', plan);
    assertLaneTraffic('calendar path', outbound, googleReads);
    check('LC: seeded calendar note stays off assist/execute payloads', !JSON.stringify(outbound).includes(SENT_CAL_NOTE), outbound.length);
    assertNoSentinels('calendar path', outbound.map((o) => o.body));
    check('LC mutant: sentinel calendar note in outbound would fail', !outbound.some((o) => JSON.stringify(o.body || {}).indexOf(SENT_CAL_NOTE) >= 0), outbound[0]);
  }

  console.log('\n--- contacts: plan -> chip -> Do It compose (sentinel only in People) ---\n');
  {
    const outbound = [];
    const googleReads = [];
    const bg = createBackground(baseStored, (url, method) => {
      if (/oauth2\/v3\/userinfo/.test(url)) return res(200, { email: 'me@x.com' });
      if (/glance-assist/.test(url) && method === 'POST') return res(200, { ok: true, result: { kind: 'quiet' } });
      if (/people\.googleapis\.com/.test(url) && method === 'GET') {
        return res(200, {
          results: [{
            person: {
              names: [{ displayName: SENT_CONTACT_NAME }],
              emailAddresses: [{ value: SENT_CONTACT_EMAIL }]
            }
          }]
        });
      }
      if (/\/users\/me\/threads\?/.test(url)) return res(200, { threads: [] });
      if (/\/users\/me\/drafts$/.test(url) && method === 'POST') return res(200, { id: 'dr_ct' });
      return null;
    }, outbound, googleReads);
    const pageSent = [];
    const store = JSON.parse(JSON.stringify(baseStored));
    const contactAsk = "What's Dana's email for the vendor billing setup this week?";
    const { w, activityLogRows } = bootGmailPage(contactAsk, store, pageSent, bg.send, outbound);
    const prefilledTo = w.document.querySelector('textarea[name="to"]');
    const prefilledSub = w.document.querySelector('input[name="subjectbox"]');
    if (prefilledTo) prefilledTo.value = SENT_CONTACT_EMAIL;
    if (prefilledSub) prefilledSub.value = SENT_TASK_TITLE;
    const stable = { messageIds: ['m1'], laneIds: ['m1'] };
    const card = await w.__glanceGmailPage.planContactsChip({
      messageId: 'm1', stable, legacyId: 'm1', threadId: 't1',
      sender: { name: 'Vendor', email: 'vendor@example.com' }, subject: 'Billing', text: contactAsk,
      intent: { label: 'Contact lookup', type: 'request', signals: { score: 80 } }
    });
    check('v1 without contacts.readonly: contacts chip is not painted', !card, null);
    check('v1 without contacts.readonly: flow:google-contacts-plan is not sent', !pageSent.some((m) => m.type === 'flow:google-contacts-plan'), pageSent.map((m) => m.type));
    if (card) {
      await clickDo(card);
    }
    check('v1 without contacts.readonly: compose write is not reached from contacts', !pageSent.some((m) => m.type === 'flow:gmail-compose' || m.type === 'flow:google-write'), pageSent.map((m) => m.type));
    check('v1 without contacts.readonly: People API is not read', !googleReads.some((r) => /people\.googleapis/.test(r.url)), googleReads.map((r) => r.url));
    assertNoSentinels('contacts path (v1 off)', outbound.map((o) => o.body));
    assertNoSentinels('contacts activity log (all rows)', activityLogRows);
    w.close();
  }

  console.log('\n--- R-merge: prefilled reply compose Undo restores To/Subject ---\n');
  {
    const outbound = [];
    const googleReads = [];
    const bg = createBackground(baseStored, (url, method) => {
      if (/oauth2\/v3\/userinfo/.test(url)) return res(200, { email: 'me@x.com' });
      if (/glance-assist/.test(url) && method === 'POST') return res(200, { ok: true, result: { kind: 'quiet' } });
      if (/people\.googleapis\.com/.test(url) && method === 'GET') {
        return res(200, { results: [{ person: { names: [{ displayName: SENT_CONTACT_NAME }], emailAddresses: [{ value: SENT_CONTACT_EMAIL }] } }] });
      }
      if (/\/users\/me\/drafts$/.test(url) && method === 'POST') return res(200, { id: 'dr_undo' });
      return null;
    }, outbound, googleReads);
    const pageSent = [];
    const store = JSON.parse(JSON.stringify(baseStored));
    const contactAsk = "What's Dana's email for the vendor billing setup this week?";
    const { w } = bootGmailPage(contactAsk, store, pageSent, bg.send, outbound);
    const vendorTo = 'vendor@example.com';
    const vendorSub = 'Re: Billing';
    const toEl = w.document.querySelector('textarea[name="to"]');
    const subEl = w.document.querySelector('input[name="subjectbox"]');
    if (toEl) toEl.value = vendorTo;
    if (subEl) subEl.value = vendorSub;
    const card = await w.__glanceGmailPage.planContactsChip({
      messageId: 'm1', stable: { messageIds: ['m1'], laneIds: ['m1'] }, legacyId: 'm1', threadId: 't1',
      sender: { name: 'Vendor', email: 'vendor@example.com' }, subject: 'Billing', text: contactAsk,
      intent: { label: 'Contact lookup', type: 'request', signals: { score: 80 } }
    });
    check('R-merge v1: contacts chip is not painted', !card, null);
    if (card) {
      await clickDo(card);
      const undoBtn = w.document.querySelector('.flow-chip-undo');
      check('R-merge: compose receipt offers Undo', Boolean(undoBtn), null);
      if (undoBtn) undoBtn.click();
      await sleep(600);
      check('R-merge: Undo restores prefilled To', toEl && readComposeValue(toEl) === vendorTo, toEl && readComposeValue(toEl));
      const bodyEl = w.document.querySelector('[aria-label="Message Body"]');
      check('R-merge: Undo cleared the filled body', bodyEl && bodyEl.textContent === '', bodyEl && bodyEl.textContent);
      check('R-merge: Undo restores prefilled Subject', subEl && readComposeValue(subEl) === vendorSub, subEl && readComposeValue(subEl));
    }
    w.close();
  }

  console.log('\n--- classify/execute: masked prompt must not carry Google read sentinels ---\n');
  {
    const outbound = [];
    const googleReads = [];
    const clsStored = JSON.parse(JSON.stringify(baseStored));
    clsStored.glanceSwitches = { GOOGLE_CONTACTS: true };
    const bg = createBackground(clsStored, (url, method) => {
      if (/oauth2\/v3\/userinfo/.test(url)) return res(200, { email: 'me@x.com' });
      if (/glance-assist/.test(url) && method === 'POST') {
        return res(200, { ok: true, result: { kind: 'quiet' } });
      }
      if (/classify-remote/.test(url)) {
        return res(200, { ok: true, label: 'request', entities: {} });
      }
      if (/people\.googleapis\.com/.test(url)) {
        return res(200, {
          results: [{
            person: {
              names: [{ displayName: SENT_CONTACT_NAME }],
              emailAddresses: [{ value: SENT_CONTACT_EMAIL }]
            }
          }]
        });
      }
      if (/calendar\.googleapis\.com/.test(url) && method === 'GET') {
        return res(200, { items: [{ id: 'cal-sent', summary: SENT_CAL_TITLE, description: SENT_CAL_NOTE }] });
      }
      if (/\/lists\/LIST_A\/tasks$/.test(url) && method === 'POST') return res(200, { id: 'task_cls' });
      if (/\/lists\/LIST_A\/tasks\/task_cls/.test(url) && method === 'GET') {
        return res(200, { id: 'task_cls', title: SENT_TASK_TITLE, notes: SENT_TASK_NOTE, status: 'needsAction' });
      }
      if (/\/users\/@me\/lists/.test(url)) return res(200, { items: [{ id: 'LIST_A', title: 'Glance' }] });
      return null;
    }, outbound, googleReads);
    const masked = 'Please confirm billing for vendor@example.com';
    const cls = await bg.send({
      type: 'flow:classify-remote',
      payload: { maskedPrompt: masked, lang: 'en', senderEmail: 'vendor@example.com' }
    });
    check('classify-remote returns', cls && cls.ok !== false, cls);
    const exec = await bg.send({
      type: 'flow:execute-action',
      payload: { maskedPrompt: masked, lang: 'en', action: 'task', title: 'Billing follow-up' }
    });
    check('execute-action returns', exec !== undefined, exec);
    const contactPlan = await bg.send({
      type: 'flow:google-contacts-plan',
      text: "What's Dana's email for the vendor billing setup this week?"
    });
    check('v1 contacts plan returns missing-scope without People read', contactPlan && contactPlan.action === 'silence' && contactPlan.reason === 'missing-scope', contactPlan);
    check('contacts plan without v1 scope does not touch People API', !googleReads.some((r) => /people\.googleapis/.test(r.url)), googleReads.map((r) => r.url));
    check('CT2: calendar sentinel stays off cloud outbound', !JSON.stringify(outbound).includes(SENT_CAL_TITLE), outbound.length);
    check('CT3: contact email and display name stay off cloud outbound',
      !JSON.stringify(outbound).includes(SENT_CONTACT_EMAIL) && !JSON.stringify(outbound).includes(SENT_CONTACT_NAME),
      outbound.length);
    check('J:M5: runtime relay does not carry contact sentinel', !bg.runtimeMessages.some((m) => JSON.stringify(m).includes(SENT_CONTACT_EMAIL)), bg.runtimeMessages.length);
    assertNoSentinels('classify path', outbound.map((o) => o.body));
    check('v1 contacts plan stays silent (missing-scope), never offers a chip off-device', contactPlan && contactPlan.action === 'silence' && contactPlan.reason === 'missing-scope', contactPlan);
  }

  console.log('\n--- G1: missing invoice needs-you only when gmail.compose is granted ---\n');
  {
    const invoiceAsk = 'Please send me the invoice by Thursday.';
    const searchDrive = () => ({ ok: true, files: [] });
    const outbound = [];
    const bg = createBackground(baseStored, (url) => (/oauth2\/v3\/userinfo/.test(url) ? res(200, { email: 'me@x.com' }) : null), outbound, []);
    const pageSent = [];
    const withCompose = JSON.parse(JSON.stringify(baseStored));
    const { w: wYes } = bootGmailPage(invoiceAsk, withCompose, pageSent, bg.send, outbound, { searchDrive });
    await wYes.__glanceGmailPage.rescan();
    await sleep(800);
    const needsYes = wYes.document.querySelector('.flow-chip-host[data-glance-chain="needs-you"]');
    check('G1: with gmail.compose a missing invoice shows needs-you', Boolean(needsYes), Boolean(needsYes));
    wYes.close();
    const noComposeStore = JSON.parse(JSON.stringify(baseStored));
    noComposeStore.googleGrantedScopes = GRANTED_NO_COMPOSE;
    const pageSent2 = [];
    const { w: wNo } = bootGmailPage(invoiceAsk, noComposeStore, pageSent2, bg.send, outbound, { searchDrive });
    await wNo.__glanceGmailPage.rescan();
    await sleep(800);
    const needsNo = wNo.document.querySelector('.flow-chip-host[data-glance-chain="needs-you"]');
    check('G1: without gmail.compose no needs-you card on the page', !needsNo, Boolean(needsNo));
    wNo.close();
  }

  console.log('\n--- G2/G3: follow receipt offers draft only when gmail.compose is granted ---\n');
  {
    const thread = [
      { messageId: 'm1', fromEmail: 'vendor@example.com', fromName: 'Vendor', body: 'Can you send the numbers for the vendor?' },
      { messageId: 'm2', fromEmail: 'me@x.com', fromName: 'Me', body: 'Please confirm the final figure by Monday so I can book the vendor.' },
      { messageId: 'm3', fromEmail: 'vendor@example.com', fromName: 'Vendor', body: 'Which vendor do you mean? We have two.' }
    ];
    const watch = {
      id: 't1', threadId: 't1', messageId: 'm2', subject: 'Vendor booking',
      counterpart: { email: 'vendor@example.com', name: 'Vendor' },
      status: 'waiting', taskRef: { taskListId: 'LIST_A', taskId: 'T9' },
      chaseIso: '2026-10-05', kind: 'reply', what: 'Please confirm the final figure by Monday', nudges: 0, lang: 'en',
      createdAt: Date.now()
    };
    const outbound = [];
    const bg = createBackground(baseStored, () => null, outbound, []);
    const withCompose = JSON.parse(JSON.stringify(baseStored));
    withCompose.followWatches = [watch];
    const pageSent = [];
    const { w: wYes } = bootGmailThread(thread, withCompose, pageSent, bg.send, outbound, { searchDrive: () => ({ ok: true, files: [] }) });
    await wYes.__glanceGmailPage.rescan();
    await sleep(1200);
    const cardYes = wYes.document.getElementById('flow-follow-host');
    check('G2: with gmail.compose the follow card offers Prepare my reply', cardYes && /Prepare my reply/.test(cardYes.textContent || ''), cardYes && cardYes.textContent);
    wYes.close();
    const noCompose = JSON.parse(JSON.stringify(baseStored));
    noCompose.googleGrantedScopes = GRANTED_NO_COMPOSE;
    noCompose.followWatches = [watch];
    const { w: wNo } = bootGmailThread(thread, noCompose, pageSent, bg.send, outbound, { searchDrive: () => ({ ok: true, files: [] }) });
    await wNo.__glanceGmailPage.rescan();
    await sleep(1200);
    const cardNo = wNo.document.getElementById('flow-follow-host');
    check('G3: without gmail.compose the follow card has no draft action', cardNo && !/Prepare my reply/.test(cardNo.textContent || ''), cardNo && cardNo.textContent);
    check('G3: without gmail.compose no flow:follow-draft is sent', !pageSent.some((m) => m.type === 'flow:follow-draft'), pageSent.map((m) => m.type));
    wNo.close();
  }

  console.log('\n--- I1/I2: drive-search-unavailable still closes the file chain honestly ---\n');
  {
    const outbound = [];
    const bg = createBackground(baseStored, () => null, outbound, []);
    const unavailable = { ok: false, reason: 'drive-search-unavailable' };
    const store = JSON.parse(JSON.stringify(baseStored));
    store.googleGrantedScopes = GRANTED_NO_DRIVE;
    const pageSent = [];
    const { w } = bootGmailPage('Please send me the invoice by Thursday.', store, pageSent, bg.send, outbound, { searchDrive: () => unavailable });
    await w.__glanceGmailPage.rescan();
    await sleep(800);
    check('I1: drive search unavailable — no needs-you card', !w.document.querySelector('[data-glance-chain="needs-you"]'), w.document.body.innerHTML.indexOf('needs-you'));
    const store2 = JSON.parse(JSON.stringify(baseStored));
    store2.googleGrantedScopes = GRANTED_NO_DRIVE;
    const pageSent2 = [];
    const { w: w2 } = bootGmailPage('Please send me the invoice.', store2, pageSent2, bg.send, outbound, {
      searchDrive: () => unavailable
    });
    await w2.__glanceGmailPage.rescan();
    await sleep(800);
    check('I2: drive search unavailable — no prepare Do It card', !w2.document.querySelector('[data-glance-chain="prepare"]'), w2.document.body.innerHTML.indexOf('prepare'));
    w.close();
    w2.close();
  }

  console.log('\n--- I2b: failed mailbox drive search stays quiet (no needs-you) ---\n');
  {
    const outbound = [];
    const bg = createBackground(baseStored, () => null, outbound, []);
    const store = JSON.parse(JSON.stringify(baseStored));
    const pageSent = [];
    const invoiceAsk = 'Please send me the invoice by Thursday.';
    const { w } = bootGmailPage(invoiceAsk, store, pageSent, bg.send, outbound, {
      searchDrive: () => ({ ok: false, reason: 'drive-search-failed' })
    });
    await w.__glanceGmailPage.rescan();
    await sleep(800);
    check('I2b: failed drive search — no needs-you card', !w.document.querySelector('[data-glance-chain="needs-you"]'), w.document.body.innerHTML.indexOf('needs-you'));
    w.close();
  }

  console.log('\n--- D1–D4: drive-search-unavailable quiet paths ---\n');
  {
    const unavailable = { ok: false, reason: 'drive-search-unavailable' };
    const outbound = [];
    const bg = createBackground(baseStored, () => null, outbound, []);
    const store = JSON.parse(JSON.stringify(baseStored));
    store.googleGrantedScopes = GRANTED_NO_DRIVE;
    const pageSent = [];
    let driveSearchCalls = 0;
    const invoiceAsk = 'Please send me the invoice by Thursday.';
    const { w: wD1 } = bootGmailPage(invoiceAsk, store, pageSent, bg.send, outbound, {
      searchDrive: () => { driveSearchCalls++; return unavailable; }
    });
    await wD1.__glanceGmailPage.rescan();
    await sleep(800);
    check('D1: drive unavailable — no needs-you and no prepare card',
      !wD1.document.querySelector('[data-glance-chain="needs-you"]') && !wD1.document.querySelector('[data-glance-chain="prepare"]'),
      wD1.document.body.innerHTML.slice(0, 200));
    wD1.close();

    const holdAsk = 'Put the glance-pricing-q4.pdf file on my calendar tomorrow (Oct 8, 2026) at 10:00.';
    const storeD3 = JSON.parse(JSON.stringify(baseStored));
    storeD3.googleGrantedScopes = GRANTED_NO_DRIVE;
    const pageSent3 = [];
    let findOneCalls = 0;
    const { w: wD3 } = bootGmailPage(holdAsk, storeD3, pageSent3, bg.send, outbound, {
      driveFindOne: () => {
        findOneCalls++;
        return { match: 'none', driveSearchUnavailable: true };
      }
    });
    await wD3.__glanceGmailPage.rescan();
    await sleep(800);
    check('D3: drive-find-one unavailable still offers a calendar hold chip', Boolean(wD3.document.querySelector('.flow-chip-host')), findOneCalls);
    check('D3: googleWait path called drive-find-one', findOneCalls >= 1, findOneCalls);
    wD3.close();

    const pageSentD3c = [];
    const { w: wD3c } = bootGmailPage(holdAsk, JSON.parse(JSON.stringify(baseStored)), pageSentD3c, bg.send, outbound, {
      driveFindOne: () => ({ match: 'one', file: { id: 'f1', name: 'glance-pricing-q4.pdf', mimeType: 'application/pdf' } })
    });
    await wD3c.__glanceGmailPage.rescan();
    await sleep(800);
    check('D3c: googleWait replan with one Drive match offers the calendar hold chip',
      Boolean(wD3c.document.querySelector('.flow-chip-host')),
      wD3c.document.body.innerHTML.slice(0, 200));
    wD3c.close();

    const noDriveStored = JSON.parse(JSON.stringify(baseStored));
    noDriveStored.googleGrantedScopes = GRANTED_NO_DRIVE;
    const bgD4 = createBackground(noDriveStored, () => null, outbound, []);
    const found = await bgD4.send({ type: 'flow:drive-find-one', term: 'invoice' });
    check('D4: background flags driveSearchUnavailable when mailbox search is off',
      found && found.match === 'none' && found.driveSearchUnavailable === true, found);

    const receiptAsk = 'Hi, could you send me the receipt for the ₪3,850 retainer payment?';
    const thread = [{ messageId: 'm1', fromEmail: 'vendor@example.com', fromName: 'Vendor', body: receiptAsk }];
    const pageSentF = [];
    let followDriveSearches = 0;
    const { w: wD2 } = bootGmailThread(thread, store, pageSentF, bg.send, outbound, {
      searchDrive: (msg) => {
        followDriveSearches++;
        return unavailable;
      }
    });
    await wD2.__glanceGmailPage.rescan();
    await sleep(1200);
    check('D2: follow resolution probe does not duplicate Drive search', followDriveSearches <= 1, followDriveSearches);
    {
      let okSearches = 0;
      const { w: wOk } = bootGmailThread(thread, JSON.parse(JSON.stringify(baseStored)), [], bg.send, outbound, {
        searchDrive: () => { okSearches++; return { ok: true, files: [] }; }
      });
      await wOk.__glanceGmailPage.rescan();
      await sleep(1200);
      check('D2b: granted Drive — follow resolution searches Drive exactly once', okSearches === 1, okSearches);
      wOk.close();
    }
    check('D2: unavailable Drive search leaves follow resolution quiet', !wD2.document.getElementById('flow-follow-host'), followDriveSearches);
    wD2.close();
  }

  console.log('\n--- P1/P3: activity log ref strips recipient fields (behaviour, not source grep) ---\n');
  {
    const gmail = fs.readFileSync(path.join(ROOT, 'src', 'content-gmail.js'), 'utf8');
    const slice = gmail.slice(gmail.indexOf('function activityLogRef'), gmail.indexOf('function sendExecuteAction'));
    const sandbox = { console };
    vm.createContext(sandbox);
    vm.runInContext(slice + '\nthis.out = activityLogRef({ to: "a@b.com", target: "a@b.com", draftId: "d1", proof: { target: "secret", fetchedBack: true } });', sandbox);
    const logged = sandbox.out;
    check('P1/P3: activityLogRef removes ref.to and target', logged && !logged.to && !logged.target && logged.draftId === 'd1', logged);
    check('P1/P3: activityLogRef removes proof.target', logged && logged.proof && !logged.proof.target && logged.proof.fetchedBack === true, logged && logged.proof);
    const mirrored = activityLogRefBehaviour({ to: 'x', target: 'y', proof: { target: 'z', system: 'gmail' } });
    check('P1/P3: mirrored strip matches page helper', !mirrored.to && !mirrored.target && !(mirrored.proof && mirrored.proof.target), mirrored);
  }

  console.log('\n--- R12: googleWait / file-chain / calendar pins (D3all, U1–U3, UNK, GC, CAL) ---\n');
  {
    const gmail = fs.readFileSync(path.join(ROOT, 'src', 'content-gmail.js'), 'utf8');
    const cal = fs.readFileSync(path.join(ROOT, 'core', 'google-calendar.js'), 'utf8');
    const waitSlice = gmail.slice(gmail.indexOf('intent.googleWait.fileTerm'), gmail.indexOf('intent.googleWait.fileTerm') + 900);
    check('D3all: driveSearchUnavailable replans with fileMatch none (no fake one)', /driveSearchUnavailable\)[\s\S]*fileMatch: 'none'/.test(waitSlice) && !/fileMatch: 'one'/.test(waitSlice));
    check('D3all: no silent return before replan when mailbox search is off', !/driveSearchUnavailable\) return \{ type: null \}/.test(waitSlice));
    check('UNK: unknown match is not re-planned as a found file', !/unresolved/.test(waitSlice));
    check('U1: no unresolved bypass flag', !/unresolved = false/.test(gmail));
    check('U2/U3: no one-then-none replan ladder in the wait slice', !/fileMatch: 'one'[\s\S]*fileMatch: 'none'/.test(waitSlice));
    check('GC: googleClose intents skip the file-attach chain', /!intent\.googleClose/.test(gmail));
    check('CAL: a resolved file URL needs a link and a name', /needsFileLink && \(!link \|\| !name\)/.test(cal));
    check('I1 product: unavailable Drive search does not fake ok', !/searched = \{ ok: true, files: \[\] \}/.test(gmail));
  }

  {
    const outbound = [];
    const googleReads = [];
    const bg = createBackground(baseStored, () => null, outbound, googleReads);
    check('background registered onMessage listeners', bg.listeners.length >= 1, bg.listeners.length);
    const stamp = await bg.send({ type: 'flow:build-stamp' });
    check('harness dispatches main onMessage (build-stamp)', Boolean(stamp && stamp.ok), stamp);
    const lane = await bg.send({ type: 'flow:google-write', connectorId: 'googleLaneTask', input: { title: 'x', listId: 'LIST_A' } });
    check('lane host handles flow:google-write', lane !== undefined, lane);
  }

  console.log('\n--- AV: verified Google account before lane write (live-gap-165-v2) ---\n');
  {
    const TAB = 'owner@ai.local.flow@gmail.com';
    const posts = [];
    const routeDeny = (u, method) => {
      if (String(u).indexOf('/oauth2/v3/userinfo') >= 0) return res(404, {});
      if (method === 'POST' && /tasks\.googleapis\.com/.test(u)) {
        posts.push(u);
        return res(200, { id: 'task-deny', title: 'x' });
      }
      if (method === 'GET' && /tasks\.googleapis\.com\/tasks\/v1\/users\/@me\/lists/.test(u)) {
        return res(200, { items: [{ id: 'LIST_A', title: 'Glance' }] });
      }
      return null;
    };
    const stored = {
      googleWebAuth: { accessToken: 'tok-deny', expiresAt: Date.now() + 3600000 },
      googleConnectedAccount: { email: TAB, at: 1, source: 'web' }
    };
    const bg = createBackground(stored, routeDeny, [], posts);
    const denied = await bg.send({
      type: 'flow:google-write',
      connectorId: 'googleLaneTask',
      tabAccount: TAB,
      lang: 'en',
      input: { title: 'x', taskListId: 'LIST_A' }
    });
    check('AV1: unreadable userinfo refuses lane write', denied && denied.ok === false && denied.reason === 'account-unverified', denied);
    check('AV2: no Google write POST when account is unverified', posts.length === 0, posts);
    check('AV3: refusal copy is not Handled', denied && !/\bHandled\b/i.test(String(denied.written || denied.error || '')), denied);
    const postsOk = [];
    const routeOk = (u, method) => {
      if (String(u).indexOf('/oauth2/v3/userinfo') >= 0) return res(200, { email: TAB });
      if (method === 'POST' && /tasks\.googleapis\.com/.test(u)) {
        postsOk.push(u);
        return res(200, { id: 'task-ok', title: 'x', status: 'needsAction' });
      }
      if (method === 'GET' && /tasks\.googleapis\.com\/tasks\/v1\/users\/@me\/lists/.test(u)) {
        return res(200, { items: [{ id: 'LIST_A', title: 'Glance' }] });
      }
      if (method === 'GET' && /tasks\.googleapis\.com\/tasks\/v1\/lists\/LIST_A\/tasks\/task-ok/.test(u)) {
        return res(200, { id: 'task-ok', title: 'x', status: 'needsAction' });
      }
      return null;
    };
    const bgOk = createBackground(stored, routeOk, [], postsOk);
    const allowed = await bgOk.send({
      type: 'flow:google-write',
      connectorId: 'googleLaneTask',
      tabAccount: TAB,
      lang: 'en',
      input: { title: 'x', taskListId: 'LIST_A' }
    });
    check('AV4: verified profile allows lane write', allowed && allowed.ok === true, allowed);
    check('AV5: verified path issues Tasks POST', postsOk.length >= 1, postsOk.length);
  }

  console.log('\nTOTAL FAILURES:', failures);
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
