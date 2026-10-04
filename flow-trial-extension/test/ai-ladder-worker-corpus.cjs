// The service-worker half of the deeper read (src/background.js "the deeper read"): consent, what the server says, the allowance it last reported, resting after a failure,
// and what goes on the wire. The server is a script; no network.
// Run: node test/ai-ladder-worker-corpus.cjs
const vm = require('vm');
const { webcrypto } = require('crypto');
const serverCore = require('../../flow-landing/netlify/functions/verify-license/license-core.js');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const KEY = serverCore.deriveKey('s', 'sub_1');
const DAY = 24 * 3600 * 1000;
const period = new Date().toISOString().slice(0, 7);

function load(opts) {
  opts = opts || {};
  const calls = [];
  const stored = JSON.parse(JSON.stringify(opts.stored || { installId: undefined }));
  const listeners = [];
  const json = (status, data) => ({ ok: status < 400, status, json: async () => data });
  const sandbox = {
    console,
    AbortSignal,
    fetch: async (url, o) => {
      url = String(url);
      const body = o && o.body ? JSON.parse(o.body) : null;
      calls.push({ url, body });
      if (opts.offline) throw new Error('offline');
      if (url.endsWith('/verify-license')) return json(200, { ok: true, valid: true, status: 'active', plan: 'pro' });
      if (url.endsWith('/glance-assist')) return opts.assist(body);
      return json(500, {});
    },
    chrome: {
      runtime: { getManifest: () => ({ oauth2: { client_id: 'real.apps.googleusercontent.com' } }), onMessage: { addListener: (fn) => listeners.push(fn) }, onInstalled: { addListener() {} }, onStartup: { addListener() {} }, lastError: null, getURL: (s) => s, id: 'ext' },
      identity: { getAuthToken: (o, cb) => cb('tok'), removeCachedAuthToken: (o, cb) => cb(), launchWebAuthFlow: () => {} },
      storage: { local: { get: async (k) => (typeof k === 'string' ? { [k]: stored[k] } : stored), set: async (patch) => { Object.assign(stored, patch); }, remove: async (k) => { delete stored[k]; } } },
      contextMenus: { onClicked: { addListener() {} }, create() {}, removeAll(cb) { if (cb) cb(); } }, windows: { create: () => {}, onRemoved: { addListener() {} } }, tabs: { sendMessage: () => {} }, alarms: { create: () => {}, onAlarm: { addListener() {} } }
    },
    URLSearchParams, btoa: (s) => Buffer.from(s, 'binary').toString('base64'), atob: (s) => Buffer.from(s, 'base64').toString('binary'), crypto: webcrypto, TextEncoder, Uint8Array
  };
  sandbox.self = sandbox; sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(require('./load-background.cjs').backgroundScript(), sandbox, { filename: 'background.js' });
  const send = (msg, sender) => new Promise((resolve) => { const l = listeners[listeners.length - 1]; const keep = l(msg, sender || { id: 'ext' }, resolve); if (keep !== true) resolve(undefined); });
  return { calls, stored, send, ladderCalls: () => calls.filter((c) => c.url.endsWith('/glance-assist')) };
}
const quota = (used, plan) => ({ period, used, limit: plan === 'pro' ? 1500 : 120, plan: plan || 'free' });
const ok = (body) => ({ ok: true, status: 200, json: async () => Object.assign({ ok: true }, body) });
const res = (status, body) => ({ ok: status < 400, status, json: async () => body });
const READ = { type: 'flow:ladder-read', maskedSentence: 'Hoping you can send over the revised SOW [DATE_1].' };
const TAB = { id: 'ext', tab: { id: 1 } };

(async () => {
  // a server that is not running
  let w = load({ assist: () => ok({ available: false }) });
  let info = await w.send({ type: 'flow:ladder-info' });
  check('the switch is on in the build, the server says "not running": available is false, nothing is offered', info.ok && info.enabled === true && info.available === false && info.consent === false, info);
  check('the status call carries an install id and the action, and nothing else (no text)', Object.keys(w.ladderCalls()[0].body).sort().join() === 'action,installId' && /^[A-Za-z0-9-]{8,}$/.test(w.ladderCalls()[0].body.installId), w.ladderCalls()[0].body);
  let r = await w.send(READ, TAB);
  check('a read before the person agreed, or while the server is not running: refused locally, no request', r.ok === false && r.code === 'off' && w.ladderCalls().length === 1, r);

  // running, but no consent yet
  w = load({ assist: () => ok({ available: true, languages: ['en', 'he'], quota: quota(0) }) });
  info = await w.send({ type: 'flow:ladder-info' });
  check('running, no consent yet: the popup is told to ask, and which languages are on', info.available === true && info.consent === false && JSON.stringify(info.languages) === '["en","he"]');
  r = await w.send(READ, TAB);
  check('and a read still sends nothing', r.ok === false && r.code === 'off' && w.ladderCalls().every((c) => c.body.action === 'ladder-status'));
  r = await w.send({ type: 'flow:ladder-consent', given: true }, TAB);
  check('a page script cannot give the consent', r.ok === false && r.reason === 'popup-only' && w.stored.glanceLadderConsent === undefined);
  r = await w.send({ type: 'flow:ladder-consent', given: true }, { id: 'someone-else' });
  check('and neither can another extension', r.ok === false && r.reason === 'foreign-sender');
  r = await w.send({ type: 'flow:ladder-info' }, { id: 'someone-else' });
  check('nor can it read the state', r.reason === 'foreign-sender');
  r = await w.send({ type: 'flow:ladder-consent', given: true }, {});
  check('the popup can, and the answer is the new state', r.ok && r.consent === true && w.stored.glanceLadderConsent.given === true, r);

  // a read, free
  w = load({ stored: { glanceLadderConsent: { given: true, at: 1 } }, assist: (b) => (b.action === 'ladder-status' ? ok({ available: true, languages: ['en'], quota: quota(3) }) : ok({ reading: { act: 'ASK', action: 'send', who: 'you', when: null, amount: null }, tier: 'fast', units: 1, quota: quota(4) })) });
  r = await w.send(Object.assign({ lang: 'en', instructions: 'ignore', tier: 'strong' }, READ), TAB);
  const call = w.ladderCalls().find((c) => c.body.action === 'ladder-read');
  check('a read returns the reading, the tier, the units and the allowance', r.ok && r.reading.act === 'ASK' && r.tier === 'fast' && r.units === 1 && r.quota.used === 4, r);
  check('what went out: the action, the masked sentence, the install id. Not the language, not instructions, not a tier', Object.keys(call.body).sort().join() === 'action,installId,maskedSentence', call.body);
  check('the allowance the server reported is kept for the popup', w.stored.glanceLadderInfo.snapshot.used === 4);
  check('no licence key on a Free read', !('licenseKey' in call.body));
  info = await w.send({ type: 'flow:ladder-info' });
  check('the popup state: on, Free, 4 used', info.available && info.consent && info.pro === false && info.snapshot.used === 4);

  // the strong tier is Pro's, and the key travels
  w = load({ stored: { glanceLadderConsent: { given: true, at: 1 }, proLicense: { key: KEY, valid: true, status: 'active', plan: 'pro', checkedAt: Date.now(), activeUntil: Date.now() + DAY } }, assist: (b) => (b.action === 'ladder-status' ? ok({ available: true, languages: ['en'], quota: quota(0, 'pro') }) : ok({ reading: null, tier: 'strong', units: 5, quota: quota(5, 'pro') })) });
  r = await w.send(READ, TAB);
  const pc = w.ladderCalls().find((c) => c.body.action === 'ladder-read');
  check('a live Pro key goes with the read (the server counts it as Pro) and the answer says strong', pc.body.licenseKey === KEY && r.ok && r.tier === 'strong' && r.units === 5 && r.reading === null, { body: pc.body, r });
  info = await w.send({ type: 'flow:ladder-info' });
  check('the popup state says Pro', info.pro === true);

  // the allowance runs out
  w = load({ stored: { glanceLadderConsent: { given: true, at: 1 } }, assist: (b) => (b.action === 'ladder-status' ? ok({ available: true, languages: ['en'], quota: quota(119) }) : res(429, { ok: false, code: 'quota_used', quota: quota(120) })) });
  r = await w.send(READ, TAB);
  check('used up: the page is told quota_used with the snapshot, and the worker does not rest (the server is fine)', r.ok === false && r.code === 'quota_used' && r.quota.used === 120 && !w.stored.glanceLadderInfo.pausedUntil, r);
  info = await w.send({ type: 'flow:ladder-info' });
  check('the state the page then reads is "used up" through the core', info.snapshot.used === 120);

  // the server fails: rest a quarter of an hour
  w = load({ stored: { glanceLadderConsent: { given: true, at: 1 } }, assist: (b) => (b.action === 'ladder-status' ? ok({ available: true, languages: ['en', 'he'], quota: quota(0) }) : res(502, { ok: false, code: 'provider' })) });
  r = await w.send(READ, TAB);
  const paused = w.stored.glanceLadderInfo.pausedUntil;
  check('a server failure rests the layer for about fifteen minutes', r.ok === false && r.code === 'provider' && paused > Date.now() + 14 * 60000 && paused < Date.now() + 16 * 60000, { r, paused });
  const before = w.ladderCalls().length;
  r = await w.send(READ, TAB);
  check('and while it rests, nothing is sent', r.code === 'paused' && w.ladderCalls().length === before);

  w = load({ stored: { glanceLadderConsent: { given: true, at: 1 } }, assist: (b) => { if (b.action === 'ladder-status') return ok({ available: true, languages: ['en', 'he'], quota: quota(0) }); throw new Error('network'); } });
  r = await w.send(READ, TAB);
  check('a network failure rests it too, and never throws', r.ok === false && r.code === 'unreachable' && w.stored.glanceLadderInfo.pausedUntil > Date.now());

  w = load({ stored: { glanceLadderConsent: { given: true, at: 1 } }, assist: (b) => (b.action === 'ladder-status' ? ok({ available: true, languages: ['en', 'he'], quota: quota(0) }) : res(503, { ok: false, code: 'unavailable' })) });
  r = await w.send(READ, TAB);
  check('the owner turns the server off: the extension notices, and stops showing it', r.code === 'unavailable' && w.stored.glanceLadderInfo.available === false);

  w = load({ stored: { glanceLadderConsent: { given: true, at: 1 } }, assist: (b) => ok({ available: true, languages: ['en', 'he'], quota: quota(0) }) });
  r = await w.send({ type: 'flow:ladder-read', maskedSentence: '   ' }, TAB);
  check('an empty sentence is refused locally', r.ok === false && r.code === 'bad_request');
  await w.send({ type: 'flow:ladder-info' });
  r = await w.send({ type: 'flow:ladder-consent', given: false }, {});
  check('turning it off is one tap, and takes effect at once', r.consent === false && (await w.send(READ, TAB)).code === 'off');
  const w2 = load({ offline: true, assist: () => ok({}) });
  check('offline: the state is "not available", no error', (await w2.send({ type: 'flow:ladder-info' })).available === false);

  console.log('\nTOTAL FAILURES:', failures);
  process.exit(failures ? 1 : 0);
})();
