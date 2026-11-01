// Wiring of the Slack DM answer connector inside background.js: both switches default off and call nothing; with slackAnswerReadBack on a linked DM is read (GET only),
// the person's own answer is read back by timestamp, the learning event carries no text or ids, release stops watching, a foreign sender is refused, the ledger holds ids only,
// Disconnect removes the token and the ledger; with slackAnswerOAuth on the token comes from authed_user through the relay, a token with any write scope is refused and not stored.
const vm = require('vm');
const { webcrypto } = require('crypto');
const { backgroundScript } = require('./load-background.cjs');

let failures = 0;
function check(name, cond, detail) { if (cond) console.log('PASS:', name); else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); } }
const res = (status, body, headers) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body), headers: { get: (k) => (headers && headers[k.toLowerCase()]) || null } });
const REDIRECT = 'https://dnjhplgmnkabbjogfpbhofjedlkehkai.chromiumapp.org/';
const DM = 'D0123ABCDEF';
const ME = 'U0000ME0001';
const DANA = 'U0000DANA01';
// The sandbox keeps the real clock, so every time is relative to now: the ask three hours ago.
const AT = (minutesAfterAsk) => new Date(Date.now() - 180 * 60000 + minutesAfterAsk * 60000).toISOString().replace(/\.\d{3}Z$/, 'Z');
const tsOf = (minutes, n) => (Math.floor((Date.now() - 180 * 60000 + minutes * 60000) / 1000)).toString() + '.' + String(n).padStart(6, '0');

function load(opts) {
  const o = opts || {};
  const calls = []; const listeners = []; const stored = JSON.parse(JSON.stringify(o.stored || {})); const msgs = [];
  const sandbox = {
    console, setTimeout, clearTimeout, URL, URLSearchParams, crypto: webcrypto, TextEncoder, Uint8Array, btoa: (s) => Buffer.from(s, 'binary').toString('base64'), atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    fetch: async (url, init) => {
      const u = String(url); const method = (init && init.method) || 'GET';
      let body = null; try { body = init && init.body ? JSON.parse(init.body) : null; } catch (e) { body = null; }
      calls.push({ method, url: u, body, auth: init && init.headers && init.headers.Authorization });
      if (u.indexOf('token-relay') >= 0) return o.relay ? o.relay(body) : res(503, { error: 'vendor_not_configured' });
      if (u.indexOf('https://slack.com/api/') !== 0) return res(500, { error: 'unrouted ' + u });
      if (!init.headers || init.headers.Authorization !== 'Bearer ' + (o.token || 'xoxp-tok')) return res(200, { ok: false, error: 'invalid_auth' });
      const url2 = new URL(u);
      if (url2.pathname === '/api/auth.test') return res(200, { ok: true, user_id: ME });
      if (url2.pathname === '/api/conversations.history') {
        const oldest = Number(url2.searchParams.get('oldest') || 0); const latest = url2.searchParams.get('latest') ? Number(url2.searchParams.get('latest')) : Infinity;
        return res(200, { ok: true, messages: msgs.filter((m) => Number(m.ts) >= oldest && Number(m.ts) <= latest).sort((a, b) => Number(b.ts) - Number(a.ts)) });
      }
      return res(200, { ok: false, error: 'unknown_method' });
    },
    chrome: {
      runtime: { getManifest: () => ({ oauth2: { client_id: 'x' } }), onMessage: { addListener: (fn) => listeners.push(fn) }, onInstalled: { addListener() {} }, onStartup: { addListener() {} }, lastError: null, getURL: (s) => s, id: 'ext' },
      identity: { getAuthToken: (x, cb) => cb('t'), removeCachedAuthToken: (x, cb) => cb && cb(), getRedirectURL: () => REDIRECT, launchWebAuthFlow: async (d) => { calls.push({ method: 'AUTH', url: d.url }); return o.authResult ? o.authResult(d.url) : ''; } },
      storage: { local: { get: async (k) => (typeof k === 'string' ? { [k]: stored[k] } : Array.isArray(k) ? Object.fromEntries(k.map((x) => [x, stored[x]])) : (k && typeof k === 'object' ? Object.assign({}, k, stored) : stored)), set: async (patch) => { Object.assign(stored, patch); }, remove: async (k) => { [].concat(k).forEach((x) => { delete stored[x]; }); } } },
      windows: { create: () => {}, onRemoved: { addListener() {} } }, tabs: { sendMessage: () => {} }, contextMenus: { create() {}, removeAll(cb) { if (cb) cb(); }, onClicked: { addListener() {} } }, alarms: { create: () => {}, onAlarm: { addListener() {} } }
    }
  };
  sandbox.self = sandbox; sandbox.globalThis = sandbox; vm.createContext(sandbox);
  let src = backgroundScript();
  (o.patch || []).forEach(([a, b]) => { if (src.indexOf(a) < 0) throw new Error('patch target missing: ' + a); src = src.replace(a, b); });
  vm.runInContext(src, sandbox, { filename: 'background.js' });
  const send = (msg, sender) => new Promise((resolve) => { const l = listeners[listeners.length - 1]; const keep = l(msg, sender || { id: 'ext' }, resolve); if (keep !== true) resolve(undefined); });
  return { calls, stored, msgs, sandbox, send, fn: (n) => vm.runInContext(n, sandbox) };
}
const CONNECTED = { slackAnswerAuth: { token: 'xoxp-tok', refreshToken: null } };
const ON = [['slackAnswerReadBack: false', 'slackAnswerReadBack: true']];
const OAUTH = [['slackAnswerOAuth: false', 'slackAnswerOAuth: true'], ["slackClientId: 'REPLACE_WITH_SLACK_CLIENT_ID'", "slackClientId: 'cid-public'"]];
const goodAuth = (u) => REDIRECT + '?code=CODE1&state=' + new URL(u).searchParams.get('state');
const msg = (minutes, n, user, text, extra) => Object.assign({ type: 'message', user, text, ts: tsOf(minutes, n) }, extra || {});
const CHECK = (over) => ({ type: 'flow:slack-answer-check', payload: Object.assign({ key: 'loop-1', conversation: DM, askedAtIso: AT(0), direction: 'mine' }, over || {}) });
const slack = (env) => env.calls.filter((c) => /slack\.com\/api\//.test(c.url));

(async () => {
  console.log('\n--- switches default off: nothing is called ---\n');
  {
    const env = load({ stored: CONNECTED });
    check('shipped config: both slack answer switches are false', env.fn('CONNECTORS').slackAnswerReadBack === false && env.fn('CONNECTORS').slackAnswerOAuth === false);
    env.msgs.push(msg(60, 1, ME, 'I sent the signed contract to Dana this morning'));
    const r = await env.send(CHECK());
    check('off: check answers connector-not-live and calls nothing', r.ok === false && r.reason === 'connector-not-live' && slack(env).length === 0, r);
    check('off: release answers connector-not-live', (await env.send({ type: 'flow:slack-answer-release', payload: { key: 'loop-1' } })).reason === 'connector-not-live');
    let threw = ''; try { await env.fn('connectSlackAnswerOAuth')(); } catch (e) { threw = e.message; }
    check('off: sign-in refuses and calls nothing', /not switched on/.test(threw) && env.calls.length === 0, threw);
    check('off: nothing stored', env.stored.connectorOutcomes === undefined && env.stored.slackAnswerLedger === undefined);
    check('off: the older channel-post Slack writer is untouched', typeof env.fn('slackWrite') === 'function' && env.fn('WRITERS').slack === env.fn('slackWrite'));
  }
  console.log('\n--- slackAnswerReadBack on ---\n');
  {
    const env = load({ stored: CONNECTED, patch: ON });
    env.msgs.push(msg(5, 1, DANA, 'Can you send me the signed contract today'));
    const waiting = await env.send(CHECK());
    check('on: nobody has answered yet: waiting, not closed, no event, no proof', waiting.ok === true && waiting.closed === false && waiting.proof === null && !(env.stored.connectorOutcomes || []).length, waiting);
    env.msgs.push(msg(30, 2, ME, 'ok'));
    check('on: an "ok" is held open', (await env.send(CHECK())).heldOpen === 'short-reply');
    env.msgs.push(msg(60, 3, ME, 'I sent the signed contract to Dana this morning'));
    const r = await env.send(CHECK());
    check('on: the answer is read back by timestamp, with a proof of slack/message', r.ok === true && r.closed === true && r.proof && r.proof.system === 'slack/message' && r.proof.fetchedBack === true && r.proof.externalId === DM + '/' + tsOf(60, 3), r);
    check('on: FlowProofOfClose accepts it', env.fn('FlowProofOfClose').isProof(r.proof));
    check('on: every Slack call is a GET to auth.test or conversations.history of the one DM; bearer token; nothing is posted or deleted', slack(env).every((c) => c.method === 'GET' && /\/api\/(auth\.test|conversations\.history\?channel=D0123ABCDEF&)/.test(c.url) && c.auth === 'Bearer xoxp-tok') && !slack(env).some((c) => /chat\.|reactions|files\./.test(c.url)), slack(env).map((c) => c.method + c.url));
    const ev = env.stored.connectorOutcomes || []; const dump = JSON.stringify(ev);
    check('on: events for slack (handled), closeType answer; no text, timestamp, DM id or name', ev.some((e) => e.connector === 'slack' && e.closeType === 'answer' && e.stage === 'handled' && e.destinationSystem === 'slack/message') && !/signed contract|Dana|D0123|1[0-9]{9}\.|xoxp/.test(dump), dump);
    check('on: the ledger holds ids and times only (no message text)', !/contract|Dana|xoxp/.test(JSON.stringify(env.stored.slackAnswerLedger)));
    check('a foreign sender is refused', (await env.send(CHECK(), { id: 'someone-else' })).reason === 'foreign-sender');
    const rel = await env.send({ type: 'flow:slack-answer-release', payload: { key: 'loop-1' } });
    check('on: release stops watching and writes nothing to Slack', rel.ok === true && slack(env).every((c) => c.method === 'GET') && (env.stored.connectorOutcomes || []).some((e) => e.stage === 'undone' && e.closeType === 'answer'), rel);
    await env.fn('disconnectConnector')('slackAnswer');
    check('Disconnect removes the token and the ledger, and leaves the older Slack writer\'s token alone', env.stored.slackAnswerAuth === undefined && env.stored.slackAnswerLedger === undefined);
  }
  {
    const env = load({ stored: Object.assign({ slackAuth: { access_token: 'bot', channelId: 'C1' } }, CONNECTED), patch: ON });
    await env.fn('disconnectConnector')('slackAnswer');
    check('Disconnect of the answer connector keeps the channel-post Slack connection', env.stored.slackAuth && env.stored.slackAuth.access_token === 'bot');
  }
  {
    const env = load({ stored: CONNECTED, patch: ON });
    env.msgs.push(msg(40, 4, DANA, 'Here is the file you asked for with the final numbers'));
    const r = await env.send(CHECK({ direction: 'theirs' }));
    check('on, theirs: an answer from the other side is reported and never closes; no handled event', r.answerArrived === true && r.closed === false && !(env.stored.connectorOutcomes || []).some((e) => e.stage === 'handled'), r);
  }
  {
    const env = load({ stored: CONNECTED, patch: ON });
    for (const bad of [{ conversation: 'C0123ABCDEF' }, { conversation: 'https://evil.example/archives/D0123ABCDEF' }, { key: '' }, { direction: 'x' }, { askedAtIso: 'yesterday' }]) check('on: bad input ' + JSON.stringify(Object.keys(bad)) + ' is refused before any call', (await env.send(CHECK(bad))).ok === false && slack(env).length === 0);
    const none = load({ patch: ON });
    check('on, not connected: says so and calls nothing', (await none.send(CHECK())).reason === 'not-connected' && slack(none).length === 0);
  }
  {
    const env = load({ stored: CONNECTED, patch: ON });
    env.msgs.push(msg(60, 5, ME, 'I sent the signed contract to Dana this morning'));
    const real = env.sandbox.fetch; env.sandbox.fetch = async (u, i) => (/latest=/.test(String(u)) ? res(500, {}) : real(u, i));
    const r = await env.send(CHECK());
    check('on: listed but the read-back fails: not ok, no proof, a readback_failed event, no handled event', r.ok === false && r.proof === null && (env.stored.connectorOutcomes || []).some((e) => e.stage === 'readback_failed') && !(env.stored.connectorOutcomes || []).some((e) => e.stage === 'handled'), r);
  }
  console.log('\n--- slackAnswerOAuth on ---\n');
  {
    const env = load({ patch: OAUTH, relay: () => res(200, { ok: true, authed_user: { id: ME, access_token: 'xoxp-new', refresh_token: 'xoxe-r', scope: 'im:history,im:read', token_type: 'user' } }), authResult: goodAuth });
    const r = await env.fn('connectSlackAnswerOAuth')();
    const auth = env.calls.find((c) => c.method === 'AUTH'); const relay = env.calls.find((c) => c.url.indexOf('token-relay') >= 0); const q = new URL(auth.url).searchParams;
    check('oauth: authorize URL has the public client id, only the two user scopes, no bot scope, a state, no secret', new URL(auth.url).origin + new URL(auth.url).pathname === 'https://slack.com/oauth/v2/authorize' && q.get('client_id') === 'cid-public' && q.get('user_scope') === 'im:history,im:read' && !q.get('scope') && /^[0-9a-f]{32}$/.test(q.get('state')) && !/secret/i.test(auth.url), auth.url);
    check('oauth: relay body is exactly vendor, grant, code, redirect, install id (Slack has no PKCE)', relay.body.vendor === 'slack' && relay.body.grant === 'code' && relay.body.code === 'CODE1' && Object.keys(relay.body).sort().join() === 'code,grant,install_id,redirect_uri,vendor', relay.body);
    check('oauth: the user token is stored on the device only, from authed_user', env.stored.slackAnswerAuth.token === 'xoxp-new' && env.stored.slackAnswerAuth.refreshToken === 'xoxe-r' && r.title === 'Slack' && !env.calls.some((c) => /slack\.com\/api\/oauth/.test(c.url)));
  }
  {
    const env = load({ patch: OAUTH, relay: () => res(200, { ok: true, authed_user: { access_token: 'xoxp-new', scope: 'im:history,im:read,chat:write' } }), authResult: goodAuth });
    let threw = ''; try { await env.fn('connectSlackAnswerOAuth')(); } catch (e) { threw = e.message; }
    check('oauth: a token that carries any other (write) scope is refused and not stored', /different set of permissions/.test(threw) && env.stored.slackAnswerAuth === undefined, threw);
    const env2 = load({ patch: OAUTH, relay: () => res(200, { ok: true, authed_user: { access_token: 'xoxp-new', scope: 'im:read' } }), authResult: goodAuth });
    let t2 = ''; try { await env2.fn('connectSlackAnswerOAuth')(); } catch (e) { t2 = e.message; }
    check('oauth: a token without im:history is refused and not stored', /different set of permissions/.test(t2) && env2.stored.slackAnswerAuth === undefined, t2);
  }
  {
    const env = load({ patch: OAUTH, relay: () => res(200, { ok: true }), authResult: goodAuth });
    let threw = ''; try { await env.fn('connectSlackAnswerOAuth')(); } catch (e) { threw = e.message; }
    check('oauth: an answer with no user token stores nothing', /connection failed/.test(threw) && env.stored.slackAnswerAuth === undefined, threw);
    const env2 = load({ patch: OAUTH, relay: () => res(200, { ok: false, error: 'invalid_code' }), authResult: goodAuth });
    let t2 = ''; try { await env2.fn('connectSlackAnswerOAuth')(); } catch (e) { t2 = e.message; }
    check('oauth: Slack refusing the code (HTTP 200, ok false) stores nothing and says why', /invalid_code/.test(t2) && env2.stored.slackAnswerAuth === undefined, t2);
  }
  {
    const env = load({ patch: OAUTH, relay: () => res(200, { ok: true }), authResult: () => REDIRECT + '?code=C&state=forged' });
    let threw = ''; try { await env.fn('connectSlackAnswerOAuth')(); } catch (e) { threw = e.message; }
    check('oauth: forged state refused before the relay', /could not be verified/.test(threw) && !env.calls.some((c) => c.url.indexOf('token-relay') >= 0), threw);
    const env2 = load({ patch: [['slackAnswerOAuth: false', 'slackAnswerOAuth: true']] });
    let t2 = ''; try { await env2.fn('connectSlackAnswerOAuth')(); } catch (e) { t2 = e.message; }
    check('oauth: no client id -> says so, asks nothing', /isn’t configured/.test(t2) && !env2.calls.some((c) => c.method === 'AUTH'), t2);
  }
  console.log('\nTOTAL FAILURES: ' + failures);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
