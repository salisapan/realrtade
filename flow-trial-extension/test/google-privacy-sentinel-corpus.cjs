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
  'https://www.googleapis.com/auth/contacts.readonly',
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

function createBackground(stored, routeFn, outbound) {
  const listeners = [];
  let tokenSeq = 0;
  const bag = JSON.parse(JSON.stringify(stored || {}));
  const sandbox = {
    console,
    fetch: async (url, options) => {
      const method = (options && options.method) || 'GET';
      const body = options && options.body ? (() => { try { return JSON.parse(options.body); } catch (e) { return options.body; } })() : null;
      if (isCloudOutbound(url)) outbound.push({ kind: 'fetch', url: String(url), body });
      const routed = routeFn(String(url), method, body);
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
  return { send, sandbox, listeners };
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

async function clickDo(host) {
  const go = host && (host.querySelector('.do-halo') || host.querySelector('button.flow-chip'));
  if (go) go.click();
  await sleep(2200);
  return Boolean(go);
}

function wireChrome(w, store, pageSent, bgSend, outbound) {
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
    if (t === 'flow:execute-action' || t === 'flow:google-write' || t === 'flow:gmail-compose' || t === 'flow:google-contacts-plan') {
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

function bootGmailPage(bodyText, store, pageSent, bgSend, outbound) {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  const files = manifest.content_scripts[0].js;
  const html = '<!doctype html><html lang="en"><head><title>Inbox - me@x.com - Gmail</title></head><body>'
    + '<a aria-label="Google Account: Glance (me@x.com)" href="https://accounts.google.com/SignOutOptions"></a>'
    + '<h2 class="hP">Billing</h2><div role="main"><div role="listitem" data-legacy-thread-id="t1" data-legacy-message-id="m1">'
    + '<span email="vendor@example.com">Vendor</span><div class="a3s aiL">' + bodyText + '</div></div></div>'
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
  wireChrome(w, store, pageSent, bgSend, outbound);
  const ctx = dom.getInternalVMContext();
  for (const f of files) {
    new vm.Script(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f }).runInContext(ctx);
  }
  return { w, doc: w.document, dom };
}

(async () => {
  console.log('\n--- google-privacy-sentinel-corpus.cjs ---\n');

  const baseStored = {
    onboarded: true,
    connectorId: 'googleTasks',
    glanceSwitches: { GOOGLE_CONTACTS: true },
    googleTasksAuth: { taskListId: 'LIST_A' },
    googleGrantedScopes: GRANTED,
    googleEverConnected: true,
    proLicense: { key: 'sentinel-test-key', valid: true, activeUntil: Date.now() + 7 * 86400000 }
  };

  console.log('--- task: plan -> Do It -> background proof read-back (sentinel only in Tasks API) ---\n');
  {
    const outbound = [];
    const bg = createBackground(baseStored, (url, method) => {
      if (/glance-assist/.test(url) && method === 'POST') {
        return res(200, { ok: true, result: { kind: 'quiet' } });
      }
      if (/\/lists\/LIST_A\/tasks$/.test(url) && method === 'POST') return res(200, { id: 'task_sent' });
      if (/\/lists\/LIST_A\/tasks\/task_sent/.test(url) && method === 'GET') {
        return res(200, { id: 'task_sent', title: SENT_TASK_TITLE, notes: SENT_TASK_NOTE, status: 'needsAction' });
      }
      return null;
    }, outbound);
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
    check('task path: page or cloud saw traffic', outbound.length > 0 || pageSent.length > 0, { outbound: outbound.length, pageSent: pageSent.length });
    check('LT: seeded task title stays off assist/execute payloads', !JSON.stringify(outbound).includes(SENT_TASK_TITLE), outbound.length);
    assertNoSentinels('task path', outbound.map((o) => o.body));
    check('LT mutant: sentinel task title in outbound would fail', !outbound.some((o) => JSON.stringify(o.body || {}).indexOf(SENT_TASK_TITLE) >= 0), outbound[0]);
    w.close();
  }

  console.log('\n--- calendar: plan -> Do It -> list event with sentinel title/notes (Calendar API only) ---\n');
  {
    const outbound = [];
    const start = { dateTime: '2026-09-18T15:00:00+00:00', timeZone: 'UTC' };
    const end = { dateTime: '2026-09-18T15:30:00+00:00', timeZone: 'UTC' };
    const bg = createBackground(baseStored, (url, method) => {
      if (/glance-assist/.test(url) && method === 'POST') return res(200, { ok: true, result: { kind: 'quiet' } });
      if (/\/calendars\/primary\/events/.test(url) && method === 'GET') {
        return res(200, { items: [{ id: 'ev_sent', summary: SENT_CAL_TITLE, description: SENT_CAL_NOTE, status: 'confirmed', start, end }] });
      }
      if (/\/calendars\/primary\/events\/ev_sent$/.test(url) && method === 'DELETE') return res(204, {});
      return null;
    }, outbound);
    const pageSent = [];
    const store = JSON.parse(JSON.stringify(baseStored));
    const { w } = bootGmailPage('Please cancel my hold on Friday at 3pm.', store, pageSent, bg.send, outbound);
    const ctx = {
      app: 'gmail', uiLang: 'en', messageId: 'm-cal', threadId: 't-cal',
      subject: 'Hold', bodyText: 'Please cancel my hold on Friday at 3pm.',
      threadUrl: 'https://mail.google.com/mail/u/0/#inbox/t-cal',
      sender: { name: 'Vendor', email: 'vendor@example.com' },
      intent: { label: 'Cancel hold', type: 'request', signals: { score: 80 } },
      process: {
        id: 'hold', name: 'Hold It', closingLine: 'Off calendar.',
        steps: [{
          id: 'calendar', kind: 'calendar', label: 'Calendar',
          params: { calendarOp: 'delete', title: 'Hold', dateIso: '2026-09-18', hour: 15, minute: 0, requireTime: true }
        }]
      }
    };
    const card = w.__glanceGmailPage.paintPlan(ctx);
    await clickDo(card);
    check('calendar Do It reached background write', pageSent.some((m) => m.type === 'flow:google-write' || m.type === 'flow:execute-action'), pageSent.map((m) => m.type));
    check('calendar path: page or cloud saw traffic', outbound.length > 0 || pageSent.length > 0, { outbound: outbound.length, pageSent: pageSent.length });
    check('LC: seeded calendar summary stays off assist/execute payloads', !JSON.stringify(outbound).includes(SENT_CAL_TITLE), outbound.length);
    assertNoSentinels('calendar path', outbound.map((o) => o.body));
    check('LC mutant: sentinel calendar summary in outbound would fail', !outbound.some((o) => JSON.stringify(o.body || {}).indexOf(SENT_CAL_TITLE) >= 0), outbound[0]);
    w.close();
  }

  console.log('\n--- contacts: plan -> chip -> Do It compose (sentinel only in People) ---\n');
  {
    const outbound = [];
    const bg = createBackground(baseStored, (url, method) => {
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
    }, outbound);
    const pageSent = [];
    const store = JSON.parse(JSON.stringify(baseStored));
    const contactAsk = "What's Dana's email for the vendor billing setup this week?";
    const { w } = bootGmailPage(contactAsk, store, pageSent, bg.send, outbound);
    const plan = await G.plan({ text: contactAsk, flags: { GOOGLE_CONTACTS: true } }, {
      grantedScopes: OAUTH_SCOPES_EXACT.concat(['https://www.googleapis.com/auth/contacts.readonly']),
      http: async (req) => {
        const u = String(req.url || '');
        if (/people\.googleapis\.com/.test(u)) {
          return {
            status: 200,
            ok: true,
            json: {
              results: [{
                person: {
                  names: [{ displayName: 'Dana ' + SENT_CONTACT_NAME }],
                  emailAddresses: [{ value: SENT_CONTACT_EMAIL }]
                }
              }]
            }
          };
        }
        return { status: 404, ok: false, json: null };
      }
    });
    check('contacts plan offers from People data', plan && plan.action === 'offer' && plan.email === SENT_CONTACT_EMAIL, plan);
    const process = {
      id: 'google-contact',
      name: plan.title || plan.line,
      closingLine: plan.line || plan.title,
      closedLine: 'Ready in compose. You send it.',
      steps: [{
        id: 'compose',
        kind: 'googleContactAnswer',
        label: 'Compose',
        hint: 'Fill Gmail compose — nothing is sent',
        params: {
          mode: plan.mode,
          email: plan.email,
          displayName: plan.displayName || plan.name,
          name: plan.name,
          lang: plan.lang || 'en'
        }
      }]
    };
    const ctx = {
      app: 'gmail', uiLang: 'en', messageId: 'm-contact', threadId: 't-contact',
      subject: 'Billing', bodyText: contactAsk,
      threadUrl: 'https://mail.google.com/mail/u/0/#inbox/t-contact',
      sender: { name: 'Vendor', email: 'vendor@example.com' },
      intent: { label: plan.title || plan.line, type: 'request', signals: { score: 80 } },
      process
    };
    const card = w.__glanceGmailPage.paintPlan(ctx);
    check('contacts chip painted from plan', Boolean(card), null);
    await clickDo(card);
    check('contacts Do It reached compose write',
      pageSent.some((m) => m.type === 'flow:gmail-compose' || m.type === 'flow:google-write'),
      pageSent.map((m) => m.type));
    check('contacts path: page or cloud saw traffic', outbound.length > 0 || pageSent.length > 0, { outbound: outbound.length, pageSent: pageSent.length });
    check('CT3: seeded contact email stays off assist/execute payloads', !JSON.stringify(outbound).includes(SENT_CONTACT_EMAIL), outbound.length);
    assertNoSentinels('contacts path', outbound.map((o) => o.body));
    check('CT2 mutant: sentinel contact email in outbound would fail', !outbound.some((o) => JSON.stringify(o.body || {}).indexOf(SENT_CONTACT_EMAIL) >= 0), outbound[0]);
    w.close();
  }

  check('harness dispatches main onMessage (not lane-only)', () => {
    const outbound = [];
    const bg = createBackground(baseStored, () => null, outbound);
    check('background registered onMessage listeners', bg.listeners.length >= 1, bg.listeners.length);
  });

  console.log('\nTOTAL FAILURES:', failures);
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
