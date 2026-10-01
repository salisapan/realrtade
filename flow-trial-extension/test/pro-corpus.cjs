// Glance Pro corpus — the paid boundary in the extension.
//
// What is under test: the free product must never touch a licence, and the two
// paid features (Draft-It, attachment summaries — the ones that call a paid
// model) must be unreachable without one. Both ends are checked: the policy
// helpers the popup uses (core/entitlements.js) and the service worker that
// owns the network calls and the stored record (background.js).
//
// Run: node test/pro-corpus.cjs

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { webcrypto } = require('crypto');
const { FlowEntitlements } = require('../core/entitlements.js');
const serverCore = require('../../flow-landing/netlify/functions/verify-license/license-core.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const KEY = serverCore.deriveKey('s', 'sub_1');
const DAY = 24 * 60 * 60 * 1000;

function load(opts) {
  opts = opts || {};
  const calls = [];
  const stored = JSON.parse(JSON.stringify(opts.stored || {}));
  const listeners = [];
  const json = (status, data) => ({ ok: status < 400, status, json: async () => data });
  const sandbox = {
    console,
    fetch: async (url, o) => {
      url = String(url);
      const body = o && o.body ? JSON.parse(o.body) : null;
      calls.push({ url, body });
      if (opts.offline) throw new Error('offline');
      if (url.endsWith('/verify-license')) return opts.verify ? opts.verify(body) : json(200, { ok: true, valid: false });
      if (url.endsWith('/billing-portal')) return opts.portal ? opts.portal(body) : json(404, { ok: false, error: 'No subscription found for that key.' });
      if (url.endsWith('/glance-assist')) return opts.assist ? opts.assist(body) : json(200, { ok: true, draftText: 'Hi [CLIENT_NAME_1]' });
      return json(500, { error: 'unrouted ' + url });
    },
    chrome: {
      runtime: {
        getManifest: () => ({ oauth2: { client_id: 'real.apps.googleusercontent.com' } }),
        onMessage: { addListener: (fn) => listeners.push(fn) },
        onInstalled: { addListener() {} }, onStartup: { addListener() {} },
        lastError: null, getURL: (s) => s, id: 'ext'
      },
      identity: { getAuthToken: (o, cb) => cb('tok'), removeCachedAuthToken: (o, cb) => cb(), launchWebAuthFlow: () => {} },
      storage: {
        local: {
          get: async (k) => (typeof k === 'string' ? { [k]: stored[k] } : stored),
          set: async (patch) => { Object.assign(stored, patch); },
          remove: async (k) => { delete stored[k]; }
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
  sandbox.self = sandbox; sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(require('./load-background.cjs').backgroundScript(), sandbox, { filename: 'background.js' });
  const send = (msg) => new Promise((resolve) => { const l = listeners[listeners.length - 1]; const keep = l(msg, {}, resolve); if (keep !== true) resolve(undefined); });
  return { calls, stored, fn: (n) => vm.runInContext(n, sandbox), send, assistCalls: () => calls.filter((c) => c.url.endsWith('/glance-assist')) };
}

const liveRecord = (over) => Object.assign({ key: KEY, valid: true, status: 'active', plan: 'pro', interval: 'month', renewsAt: new Date(Date.now() + 20 * DAY).toISOString(), trialEnds: null, checkedAt: Date.now(), activeUntil: Date.now() + 7 * DAY }, over || {});

(async () => {
  // ------------------------------------------------------------ policy helpers
  const now = Date.now();
  check('a key with the right shape normalises', FlowEntitlements.normalizeKey(KEY.toLowerCase().replace(/-/g, ' ')) === KEY);
  check('garbage is not a key', FlowEntitlements.normalizeKey('hello') === null && FlowEntitlements.normalizeKey(null) === null);
  const sample = ['GLNC-5RST4-QAHHX-YNVFT-93Q2N', 'glnc5rst4qahhxynvft93q2n', 'GLNC-5RST4-QAHHX-YNVFT-93Q2', 'GLNC-5RST4-QAHHX-YNVFT-93Q2O', 'XXXX-5RST4-QAHHX-YNVFT-93Q2N', ''];
  check('the extension and the server agree on what a key is', sample.every((s) => FlowEntitlements.normalizeKey(s) === serverCore.normalizeKey(s)), sample.map((s) => [FlowEntitlements.normalizeKey(s), serverCore.normalizeKey(s)]));
  check('no record means free', !FlowEntitlements.isActive(null, now) && FlowEntitlements.describe(null, now).state === 'none');
  check('a live record is active', FlowEntitlements.isActive(liveRecord(), now));
  check('an invalid record is not active', !FlowEntitlements.isActive(liveRecord({ valid: false, activeUntil: 0 }), now));
  check('an expired offline grace ends access', !FlowEntitlements.isActive(liveRecord({ activeUntil: now - 1 }), now));
  check('a record without a key is not active', !FlowEntitlements.isActive(liveRecord({ key: '' }), now));
  check('a fresh check is not re-checked; a 13 hour old one is', !FlowEntitlements.needsRecheck(liveRecord({ checkedAt: now - 1000 }), now) && FlowEntitlements.needsRecheck(liveRecord({ checkedAt: now - 13 * 3600000 }), now));
  const rec = FlowEntitlements.recordFromVerification(KEY, { valid: true, status: 'trialing', trialEnds: '2026-10-15T00:00:00Z', plan: 'pro', interval: 'year' }, now);
  check('a verified key gets a 7 day offline window', rec.valid && rec.activeUntil === now + 7 * DAY && rec.status === 'trialing', rec);
  check('a rejected key gets no window', FlowEntitlements.recordFromVerification(KEY, { valid: false }, now).activeUntil === 0);
  check('describe: trial, pro, comp, lapsed',
    FlowEntitlements.describe(liveRecord({ status: 'trialing', trialEnds: new Date(now + 5 * DAY).toISOString() }), now).state === 'trial' &&
    FlowEntitlements.describe(liveRecord(), now).state === 'pro' &&
    FlowEntitlements.describe(liveRecord({ status: 'comp', renewsAt: null }), now).detail === 'Complimentary' &&
    FlowEntitlements.describe(liveRecord({ valid: false, activeUntil: 0 }), now).state === 'lapsed');
  const base = { checkoutOpen: true, pro: false, closes: 6, dismissedAt: 0 };
  check('the nudge appears only after real use, only when checkout is open, never to Pro', FlowEntitlements.shouldNudge(base, now) &&
    !FlowEntitlements.shouldNudge(Object.assign({}, base, { closes: 4 }), now) &&
    !FlowEntitlements.shouldNudge(Object.assign({}, base, { checkoutOpen: false }), now) &&
    !FlowEntitlements.shouldNudge(Object.assign({}, base, { pro: true }), now));
  check('a dismissed nudge stays quiet for 30 days, then may return', !FlowEntitlements.shouldNudge(Object.assign({}, base, { dismissedAt: now - 10 * DAY }), now) && FlowEntitlements.shouldNudge(Object.assign({}, base, { dismissedAt: now - 31 * DAY }), now));

  // ------------------------------------------------------------ service worker
  let w = load();
  check('the policy window and the service worker window are the same number', w.fn('PRO_OFFLINE_GRACE_MS') === FlowEntitlements.OFFLINE_GRACE_MS && w.fn('PRO_RECHECK_AFTER_MS') === FlowEntitlements.RECHECK_AFTER_MS);

  // the paid features are closed without a key, and nothing leaves the device
  let r = await w.send({ type: 'flow:draft-reply', payload: { lang: 'en', entries: [{ position: 'current', maskedBody: 'x' }] } });
  check('Draft-It without a key answers pro_required', r && r.ok === false && r.code === 'pro_required', r);
  check('and sent no request at all', w.calls.length === 0, w.calls);
  r = await w.send({ type: 'flow:summarize-attachment', payload: { maskedText: 'x' } });
  check('attachment summary without a key answers pro_required', r && r.code === 'pro_required' && w.calls.length === 0, { r, calls: w.calls });
  r = await w.send({ type: 'flow:classify-remote', payload: { lang: 'en', maskedText: 'x' } });
  check('remote classification is gated the same way', r && r.code === 'pro_required' && w.calls.length === 0, r);

  // activation
  r = await w.send({ type: 'flow:pro-activate', key: 'nope' });
  check('a malformed key is refused locally, without a request', r.ok === false && /GLNC/.test(r.error) && w.calls.length === 0, { r, calls: w.calls });

  w = load({ verify: () => ({ ok: true, status: 200, json: async () => ({ ok: true, valid: false, reason: 'unknown' }) }) });
  r = await w.send({ type: 'flow:pro-activate', key: KEY });
  check('a key the server does not know is refused and NOT stored', r.ok === false && !w.stored.proLicense, { r, stored: w.stored });

  w = load({ offline: true });
  r = await w.send({ type: 'flow:pro-activate', key: KEY });
  check('offline: a clear error, nothing stored', r.ok === false && /connection|reach/i.test(r.error) && !w.stored.proLicense, r);

  w = load({ verify: () => ({ ok: true, status: 200, json: async () => ({ ok: true, valid: true, status: 'trialing', plan: 'pro', interval: 'year', trialEnds: new Date(Date.now() + 14 * DAY).toISOString(), renewsAt: null }) }) });
  r = await w.send({ type: 'flow:pro-activate', key: KEY.toLowerCase() });
  check('a confirmed key is stored with a 7 day offline window', r.ok && w.stored.proLicense && w.stored.proLicense.key === KEY && w.stored.proLicense.valid && w.stored.proLicense.activeUntil > Date.now() + 6 * DAY, w.stored);
  check('activation sent the normalised key to verify-license only', w.calls.length === 1 && w.calls[0].url.endsWith('/verify-license') && w.calls[0].body.key === KEY, w.calls);
  r = await w.send({ type: 'flow:pro-status' });
  check('status reports active', r.ok && r.active === true && r.record.status === 'trialing', r);

  // AI calls with a live key
  w.calls.length = 0;
  r = await w.send({ type: 'flow:draft-reply', payload: { lang: 'en', entries: [{ position: 'current', maskedBody: 'hello' }] } });
  check('with a live key Draft-It goes through', r.ok && r.draftText === 'Hi [CLIENT_NAME_1]', r);
  check('the request carries the licence key, for the server to check again', w.assistCalls().length === 1 && w.assistCalls()[0].body.licenseKey === KEY && w.assistCalls()[0].body.action === 'draft-reply', w.assistCalls());

  // server says no (cancelled / refunded)
  w = load({ stored: { proLicense: liveRecord() }, assist: () => ({ ok: false, status: 402, json: async () => ({ ok: false, code: 'pro_required' }) }) });
  r = await w.send({ type: 'flow:draft-reply', payload: { lang: 'en', entries: [] } });
  check('a 402 from the server surfaces as pro_required', r.ok === false && r.code === 'pro_required', r);
  check('and the stored record stops being active immediately', w.stored.proLicense.valid === false && w.stored.proLicense.activeUntil === 0, w.stored.proLicense);
  w.calls.length = 0;
  await w.send({ type: 'flow:draft-reply', payload: { lang: 'en', entries: [] } });
  check('after that, no further paid requests are even attempted', w.assistCalls().length === 0, w.calls);

  // recheck behaviour
  w = load({ stored: { proLicense: liveRecord({ checkedAt: Date.now() - 20 * 3600000 }) }, offline: true });
  r = await w.send({ type: 'flow:pro-status' });
  check('stale record + offline: still active (the grace window covers a bad connection)', r.active === true, r);
  w = load({ stored: { proLicense: liveRecord({ checkedAt: Date.now() - 20 * 3600000 }) }, verify: () => ({ ok: true, status: 200, json: async () => ({ ok: true, valid: false, reason: 'inactive' }) }) });
  r = await w.send({ type: 'flow:pro-status' });
  check('stale record + server says cancelled: access ends', r.active === false && w.stored.proLicense.valid === false, r);
  w = load({ stored: { proLicense: liveRecord({ checkedAt: Date.now() - 1000 }) } });
  await w.send({ type: 'flow:pro-status' });
  check('a fresh record is not re-checked on every call', w.calls.length === 0, w.calls);
  w = load({ stored: { proLicense: liveRecord({ activeUntil: Date.now() - 1, checkedAt: Date.now() - 1000 }) } });
  r = await w.send({ type: 'flow:draft-reply', payload: { lang: 'en', entries: [] } });
  check('an expired offline window closes the feature', r.code === 'pro_required' && w.assistCalls().length === 0, r);

  // removal and billing
  w = load({ stored: { proLicense: liveRecord() } });
  await w.send({ type: 'flow:pro-deactivate' });
  check('removing the key deletes the stored licence', !w.stored.proLicense, w.stored);
  w = load();
  r = await w.send({ type: 'flow:pro-billing' });
  check('billing without a key says so, without a request', r.ok === false && w.calls.length === 0, r);
  w = load({ stored: { proLicense: liveRecord() }, portal: () => ({ ok: true, status: 200, json: async () => ({ ok: true, url: 'https://billing.stripe.com/p/x' }) }) });
  r = await w.send({ type: 'flow:pro-billing' });
  check('billing with a key returns the Stripe portal URL', r.ok && /^https:\/\/billing\.stripe\.com\//.test(r.url), r);

  // the free product never touches a licence
  const bgText = fs.readFileSync(path.join(__dirname, '..', 'src', 'background.js'), 'utf8');
  const writers = bgText.slice(bgText.indexOf('const WRITERS = {'), bgText.indexOf('const UNDOERS = {'));
  check('no write path (Calendar, Tasks, Gmail draft, Drive) mentions a licence', !/pro|licen/i.test(writers), writers.slice(0, 200));
  const gmail = fs.readFileSync(path.join(__dirname, '..', 'src', 'content-gmail.js'), 'utf8');
  check('remote classification is switched off in the Gmail script', /const REMOTE_CLASSIFY = false;/.test(gmail) && /REMOTE_CLASSIFY && !intent\.type/.test(gmail));
  check('the Gmail script mounts the sidebar only through the Pro check', !/^\s*mountSidebar\(\);/m.test(gmail.replace(/if \(active\) mountSidebar\(\);/, '')), 'a bare mountSidebar() call exists');

  console.log('\nTOTAL FAILURES: ' + failures);
  process.exit(failures ? 1 : 0);
})();
