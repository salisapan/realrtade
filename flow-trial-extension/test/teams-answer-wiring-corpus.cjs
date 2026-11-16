// Wiring of the Teams chat answer connector inside background.js: the switch defaults off and calls nothing; with teamsAnswerReadBack on, a linked chat is read
// (GET only, Chat.Read must be granted), the person's own answer is read back by id, the learning event carries no text or id, release stops watching, a foreign
// sender is refused, and the ledger holds ids only. Graph and the Outlook session are mocked inside the sandbox.
const vm = require('vm');
const { webcrypto } = require('crypto');
const { backgroundScript } = require('./load-background.cjs');

let failures = 0;
function check(name, cond, detail) { if (cond) console.log('PASS:', name); else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); } }
const CHAT = '19:abcdef0123456789abcdef0123456789@thread.v2';
const ME = '11111111-1111-1111-1111-111111111111';
const DANA = '22222222-2222-2222-2222-222222222222';
// The sandbox keeps the real clock, so every time is relative to now: the ask three hours ago.
const AT = (minutesAfterAsk) => new Date(Date.now() - 180 * 60000 + minutesAfterAsk * 60000).toISOString().replace(/\.\d{3}Z$/, 'Z');

function load(opts) {
  const o = opts || {};
  const listeners = []; const stored = JSON.parse(JSON.stringify(o.stored || {})); const calls = []; const msgs = [];
  const sandbox = {
    console, setTimeout, clearTimeout, URL, URLSearchParams, crypto: webcrypto, TextEncoder, Uint8Array, btoa: (s) => Buffer.from(s, 'binary').toString('base64'), atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    fetch: async () => ({ ok: false, status: 500, json: async () => ({}) }),
    chrome: {
      runtime: { getManifest: () => ({ oauth2: { client_id: 'x' } }), onMessage: { addListener: (fn) => listeners.push(fn) }, onInstalled: { addListener() {} }, onStartup: { addListener() {} }, lastError: null, getURL: (s) => s, id: 'ext' },
      identity: { getAuthToken: (x, cb) => cb('t'), removeCachedAuthToken: (x, cb) => cb && cb(), getRedirectURL: () => 'https://x.chromiumapp.org/', launchWebAuthFlow: async () => '' },
      storage: { local: { get: async (k) => (typeof k === 'string' ? { [k]: stored[k] } : Array.isArray(k) ? Object.fromEntries(k.map((x) => [x, stored[x]])) : (k && typeof k === 'object' ? Object.assign({}, k, stored) : stored)), set: async (patch) => { Object.assign(stored, patch); }, remove: async (k) => { [].concat(k).forEach((x) => { delete stored[x]; }); } } },
      windows: { create: () => {}, onRemoved: { addListener() {} } }, tabs: { sendMessage: () => {} }, contextMenus: { create() {}, removeAll(cb) { if (cb) cb(); }, onClicked: { addListener() {} } }, alarms: { create: () => {}, onAlarm: { addListener() {} } }
    }
  };
  sandbox.self = sandbox; sandbox.globalThis = sandbox; vm.createContext(sandbox);
  let src = backgroundScript();
  (o.patch || []).forEach(([a, b]) => { if (src.indexOf(a) < 0) throw new Error('patch target missing: ' + a); src = src.replace(a, b); });
  vm.runInContext(src, sandbox, { filename: 'background.js' });
  const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
  sandbox.__calls = calls; sandbox.__msgs = msgs; sandbox.__res = res; sandbox.__scopes = o.scopes || ['Mail.Read', 'Chat.Read'];
  vm.runInContext(`
    outlookSession = async () => ({ ok: true, token: { grantedScopes: __scopes } });
    outlookFetch = async (url, init) => { const method = String((init && init.method) || 'GET').toUpperCase(); __calls.push({ method, url: String(url) }); const p = String(url).replace('https://graph.microsoft.com/v1.0', '');
      if (p === '/me?$select=id') return __res(200, { id: '${ME}' });
      if (/\\/me\\/chats\\/[^/]+\\/messages\\?/.test(p)) return __res(200, { value: __msgs.slice().reverse() });
      const m = p.match(/\\/me\\/chats\\/[^/]+\\/messages\\/(\\d+)$/); if (m) { const x = __msgs.find((y) => y.id === m[1]); return x ? __res(200, x) : __res(404, {}); }
      return __res(400, {}); };`, sandbox);
  const send = (msg, sender) => new Promise((resolve) => { const l = listeners[listeners.length - 1]; const keep = l(msg, sender || { id: 'ext' }, resolve); if (keep !== true) resolve(undefined); });
  return { calls, stored, msgs, sandbox, send, fn: (n) => vm.runInContext(n, sandbox) };
}
const ON = [['teamsAnswerReadBack: false', 'teamsAnswerReadBack: true']];
const msg = (id, from, text, at) => ({ id, messageType: 'message', createdDateTime: at, deletedDateTime: null, chatId: CHAT, from: { user: { id: from } }, body: { contentType: 'html', content: '<p>' + text + '</p>' } });
const CHECK = (over) => ({ type: 'flow:teams-answer-check', payload: Object.assign({ key: 'loop-1', chatId: CHAT, askedAtIso: AT(0), direction: 'mine' }, over || {}) });
const graph = (env) => env.calls.filter((c) => /graph\.microsoft\.com/.test(c.url));

(async () => {
  console.log('\n--- the switch defaults off: nothing is called ---\n');
  {
    const env = load({});
    check('shipped config: teamsAnswerReadBack is false', env.fn('CONNECTORS').teamsAnswerReadBack === false);
    env.msgs.push(msg('1760000000001', ME, 'I sent the signed contract to Dana this morning', AT(60)));
    const r = await env.send(CHECK());
    check('off: check answers connector-not-live and calls nothing', r.ok === false && r.reason === 'connector-not-live' && graph(env).length === 0, r);
    check('off: release answers connector-not-live', (await env.send({ type: 'flow:teams-answer-release', payload: { key: 'loop-1' } })).reason === 'connector-not-live');
    check('off: nothing stored', env.stored.connectorOutcomes === undefined && env.stored.teamsAnswerLedger === undefined);
    check('off: no writer or undoer is registered for teams', env.fn('WRITERS').teams === undefined && env.fn('UNDOERS').teams === undefined);
  }
  console.log('\n--- teamsAnswerReadBack on ---\n');
  {
    const env = load({ patch: ON });
    env.msgs.push(msg('1760000000001', DANA, 'Can you send me the signed contract today', AT(5)));
    const waiting = await env.send(CHECK());
    check('on: nobody has answered yet: waiting, not closed, no event, no proof', waiting.ok === true && waiting.closed === false && waiting.proof === null && !(env.stored.connectorOutcomes || []).length, waiting);
    env.msgs.push(msg('1760000000002', ME, 'ok', AT(30)));
    check('on: an "ok" is held open', (await env.send(CHECK())).heldOpen === 'short-reply');
    env.msgs.push(msg('1760000000003', ME, 'I sent the signed contract to Dana this morning', AT(60)));
    const r = await env.send(CHECK());
    check('on: the answer is read back by id, with a proof of teams/chat-message', r.ok === true && r.closed === true && r.proof && r.proof.system === 'teams/chat-message' && r.proof.fetchedBack === true && r.proof.externalId === '1760000000003', r);
    check('on: FlowProofOfClose accepts it', env.fn('FlowProofOfClose').isProof(r.proof));
    check('on: every Graph call is a GET to /me or /me/chats/<chat>/messages: nothing is sent, posted or deleted', graph(env).every((c) => c.method === 'GET' && /\/v1\.0\/me(\?\$select=id|\/chats\/[^/]+\/messages(\?|\/\d+))/.test(c.url) && !/send|reply|forward|softDelete/i.test(c.url)), graph(env).map((c) => c.method + c.url));
    const ev = env.stored.connectorOutcomes || []; const dump = JSON.stringify(ev);
    check('on: events for teams (handled) with closeType answer; no text, message id, chat id or name', ev.some((e) => e.connector === 'teams' && e.closeType === 'answer' && e.stage === 'handled' && e.destinationSystem === 'teams/chat-message') && !/signed contract|Dana|1760000|19:abc|thread\.v2/.test(dump), dump);
    check('on: the ledger holds ids and times only (no message text)', !/contract|Dana/.test(JSON.stringify(env.stored.teamsAnswerLedger)));
    check('a foreign sender is refused', (await env.send(CHECK(), { id: 'someone-else' })).reason === 'foreign-sender');
    const rel = await env.send({ type: 'flow:teams-answer-release', payload: { key: 'loop-1' } });
    check('on: release stops watching and writes nothing to Teams', rel.ok === true && graph(env).every((c) => c.method === 'GET') && (env.stored.connectorOutcomes || []).some((e) => e.stage === 'undone' && e.closeType === 'answer'), rel);
  }
  {
    const env = load({ patch: ON, scopes: ['Mail.Read', 'Calendars.ReadWrite'] });
    env.msgs.push(msg('1760000000003', ME, 'I sent the signed contract to Dana this morning', AT(60)));
    const r = await env.send(CHECK());
    check('on, Chat.Read not granted: says so and reads nothing', r.ok === false && r.reason === 'chat-not-granted' && graph(env).length === 0, r);
  }
  {
    const env = load({ patch: ON });
    env.msgs.push(msg('1760000000004', DANA, 'Here is the file you asked for with the final numbers', AT(60)));
    const r = await env.send(CHECK({ direction: 'theirs' }));
    check('on, theirs: an answer from the other side is reported and never closes; no handled event', r.answerArrived === true && r.closed === false && !(env.stored.connectorOutcomes || []).some((e) => e.stage === 'handled'), r);
  }
  {
    const env = load({ patch: ON });
    for (const bad of [{ chatId: 'https://evil.example/l/chat/x' }, { key: '' }, { direction: 'x' }, { askedAtIso: 'yesterday' }]) check('on: bad input ' + JSON.stringify(Object.keys(bad)) + ' is refused before any call', (await env.send(CHECK(bad))).ok === false && graph(env).length === 0);
  }
  {
    const env = load({ patch: ON });
    env.msgs.push(msg('1760000000005', ME, 'I sent the signed contract to Dana this morning', AT(60)));
    env.sandbox.outlookFetch = async (url, init) => { env.calls.push({ method: String((init && init.method) || 'GET'), url: String(url) }); return /messages\/\d+$/.test(String(url)) ? { ok: false, status: 500, json: async () => ({}) } : (String(url).endsWith('/me?$select=id') ? { ok: true, status: 200, json: async () => ({ id: ME }) } : { ok: true, status: 200, json: async () => ({ value: env.msgs }) }); };
    const r = await env.send(CHECK());
    check('on: listed but the read-back fails: not ok, no proof, a readback_failed event, no handled event', r.ok === false && r.proof === null && (env.stored.connectorOutcomes || []).some((e) => e.stage === 'readback_failed') && !(env.stored.connectorOutcomes || []).some((e) => e.stage === 'handled'), r);
  }
  console.log('\nTOTAL FAILURES: ' + failures);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
