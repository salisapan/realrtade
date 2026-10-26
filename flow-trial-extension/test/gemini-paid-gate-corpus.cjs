// Extension wiring for GEMINI_PAID_TIER silent attachment gate.
// Run: node test/gemini-paid-gate-corpus.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { webcrypto } = require('crypto');
const serverCore = require('../../flow-landing/netlify/functions/verify-license/license-core.js');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const KEY = serverCore.deriveKey('s', 'sub_gate');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail).slice(0, 400) : ''); }
}

const gmail = read('src/content-gmail.js');
const bg = read('src/background.js');

check('Gmail sends contentSource google on summarize', /flow:summarize-attachment[\s\S]{0,120}contentSource:\s*'google'/.test(gmail));
check('gemini-gate cache returns without showing a card', /cached === 'gemini-gate'/.test(gmail) && /if \(cached === 'gemini-gate'\)[\s\S]{0,80}return;/.test(gmail));
check('ready cache requires summary object', /typeof cached === 'object' && cached\.summary/.test(gmail));
check('no loading flash before summarize path', !/onAttachmentHover[\s\S]{0,900}state:\s*'loading'/.test(gmail));
check('silent gate hides card', /gemini_paid_gate/.test(gmail) && /hideFloatingCard/.test(gmail));
check('background passes gemini_paid_gate through callGlanceAssist', /data\.code === 'gemini_paid_gate'/.test(bg));
check('summarizeAttachmentViaBackend returns silent gate', /summarizeAttachmentViaBackend[\s\S]{0,400}gemini_paid_gate/.test(bg));
check('background defaults missing contentSource to google', /contentSource: payload\.contentSource \|\| 'google'/.test(bg));

function loadWorker() {
  const stored = { proLicense: { key: KEY, valid: true, activeUntil: Date.now() + 1e7, checkedAt: Date.now() } };
  const listeners = [];
  const sandbox = {
    console,
    fetch: async (url, o) => {
      const body = o && o.body ? JSON.parse(o.body) : null;
      if (String(url).endsWith('/verify-license')) {
        return { ok: true, status: 200, json: async () => ({ ok: true, valid: true, status: 'active', plan: 'pro' }) };
      }
      if (String(url).endsWith('/glance-assist')) {
        return { ok: true, status: 200, json: async () => ({ ok: false, code: 'gemini_paid_gate', silent: true }) };
      }
      return { ok: false, status: 500, json: async () => ({}) };
    },
    chrome: {
      runtime: {
        getManifest: () => ({ oauth2: { client_id: 'x.apps.googleusercontent.com' } }),
        onMessage: { addListener: (fn) => listeners.push(fn) },
        onInstalled: { addListener() {} }, onStartup: { addListener() {} },
        lastError: null, getURL: (s) => s, id: 'ext'
      },
      identity: { getAuthToken: (o, cb) => cb('tok'), removeCachedAuthToken: (o, cb) => cb(), launchWebAuthFlow: () => {} },
      storage: {
        local: {
          get: async (k) => (typeof k === 'string' ? { [k]: stored[k] } : stored),
          set: async (patch) => { Object.assign(stored, patch); }
        }
      },
      windows: { create: () => {}, onRemoved: { addListener() {} } },
      tabs: { sendMessage: () => {} },
      alarms: { create: () => {}, onAlarm: { addListener() {} } }
    },
    URLSearchParams,
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    crypto: webcrypto, TextEncoder, Uint8Array
  };
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(require('./load-background.cjs').backgroundScript(), sandbox, { filename: 'background.js' });
  const send = (msg) => new Promise((resolve) => {
    const l = listeners[listeners.length - 1];
    const keep = l(msg, { id: 'ext' }, resolve);
    if (keep !== true) resolve(undefined);
  });
  return { send, stored };
}

(async () => {
  const w = loadWorker();
  const res = await w.send({ type: 'flow:summarize-attachment', payload: { maskedText: 'x' } });
  check('worker returns silent gemini_paid_gate to page', res && res.ok === false && res.code === 'gemini_paid_gate' && res.silent === true, res);
  const res2 = await w.send({ type: 'flow:summarize-attachment', payload: { maskedText: 'y', contentSource: 'dropbox' } });
  check('explicit dropbox contentSource is forwarded', res2 && (res2.code === 'gemini_paid_gate' || res2.ok === false || res2.ok === true), res2);

  console.log(failures ? '\n' + failures + ' FAILED' : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
