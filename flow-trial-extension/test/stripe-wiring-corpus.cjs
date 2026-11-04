// Wiring of the Stripe connector inside background.js: both switches default off and call nothing; with stripeReadBack on a linked invoice or payment is read (GET only) and
// the loop closes only when it is paid for real, the learning event carries no id or amount, release stops watching, a foreign sender is refused, the ledger holds ids only,
// Disconnect removes the token and the ledger; with stripeOAuth on only a read_only grant is kept (anything else is refused and not stored) and the token stays on the device.
const vm = require('vm');
const { webcrypto } = require('crypto');
const { backgroundScript } = require('./load-background.cjs');

let failures = 0;
function check(name, cond, detail) { if (cond) console.log('PASS:', name); else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); } }
const res = (status, body, headers) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body), headers: { get: (k) => (headers && headers[k.toLowerCase()]) || null } });
const REDIRECT = 'https://dnjhplgmnkabbjogfpbhofjedlkehkai.chromiumapp.org/';
const INV = 'in_1Abc2Def3Ghi4Jkl';
const PI = 'pi_3Mno4Pqr5Stu6Vwx';
const charge = (over) => Object.assign({ id: 'ch_1', object: 'charge', paid: true, refunded: false, amount_refunded: 0, disputed: false, status: 'succeeded' }, over || {});
const invoice = (over) => Object.assign({ id: INV, object: 'invoice', livemode: true, status: 'paid', currency: 'ils', amount_paid: 120000, amount_remaining: 0, customer_email: 'dana@example.com', payment_intent: { id: PI, object: 'payment_intent', latest_charge: charge() } }, over || {});

function load(opts) {
  const o = opts || {};
  const calls = []; const listeners = []; const stored = JSON.parse(JSON.stringify(o.stored || {})); const objects = { [INV]: invoice() };
  const sandbox = {
    console, setTimeout, clearTimeout, URL, URLSearchParams, crypto: webcrypto, TextEncoder, Uint8Array, btoa: (s) => Buffer.from(s, 'binary').toString('base64'), atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    fetch: async (url, init) => {
      const u = String(url); const method = (init && init.method) || 'GET';
      let body = null; try { body = init && init.body ? JSON.parse(init.body) : null; } catch (e) { body = null; }
      calls.push({ method, url: u, body, auth: init && init.headers && init.headers.Authorization });
      if (u.indexOf('token-relay') >= 0) return o.relay ? o.relay(body) : res(503, { error: 'vendor_not_configured' });
      if (u.indexOf('https://api.stripe.com/v1/') !== 0) return res(500, { error: 'unrouted ' + u });
      if (!init.headers || init.headers.Authorization !== 'Bearer ' + (o.token || 'rk_live_tok')) return res(401, { error: { type: 'invalid_request_error' } });
      const m = u.replace('https://api.stripe.com/v1', '').match(/^\/(invoices|payment_intents)\/([^?]+)\?/);
      const x = m && objects[decodeURIComponent(m[2])];
      return x ? res(200, x) : res(404, { error: { code: 'resource_missing' } });
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
  return { calls, stored, objects, sandbox, send, fn: (n) => vm.runInContext(n, sandbox) };
}
const CONNECTED = { stripeAuth: { token: 'rk_live_tok', refreshToken: null, testMode: false } };
const ON = [['stripeReadBack: false', 'stripeReadBack: true']];
const OAUTH = [['stripeOAuth: false', 'stripeOAuth: true'], ["stripeClientId: 'REPLACE_WITH_STRIPE_CONNECT_CLIENT_ID'", "stripeClientId: 'ca_public'"]];
const goodAuth = (u) => REDIRECT + '?code=CODE1&state=' + new URL(u).searchParams.get('state');
const CHECK = (over) => ({ type: 'flow:payment-check', payload: Object.assign({ key: 'loop-1', objectId: INV }, over || {}) });
const stripe = (env) => env.calls.filter((c) => /stripe\.com/.test(c.url));

(async () => {
  console.log('\n--- switches default off: nothing is called ---\n');
  {
    const env = load({ stored: CONNECTED });
    check('shipped config: both stripe switches are false', env.fn('CONNECTORS').stripeReadBack === false && env.fn('CONNECTORS').stripeOAuth === false);
    const r = await env.send(CHECK());
    check('off: check answers connector-not-live and calls nothing', r.ok === false && r.reason === 'connector-not-live' && stripe(env).length === 0, r);
    check('off: release answers connector-not-live', (await env.send({ type: 'flow:payment-release', payload: { key: 'loop-1' } })).reason === 'connector-not-live');
    let threw = ''; try { await env.fn('connectStripeOAuth')(); } catch (e) { threw = e.message; }
    check('off: sign-in refuses and calls nothing', /not switched on/.test(threw) && env.calls.length === 0, threw);
    check('off: nothing stored', env.stored.connectorOutcomes === undefined && env.stored.stripeLedger === undefined);
    check('off: no writer or undoer is registered for stripe', env.fn('WRITERS').stripe === undefined && env.fn('UNDOERS').stripe === undefined);
  }
  console.log('\n--- stripeReadBack on ---\n');
  {
    const env = load({ stored: CONNECTED, patch: ON });
    env.objects[INV] = invoice({ status: 'open', amount_paid: 0, amount_remaining: 120000 });
    const waiting = await env.send(CHECK());
    check('on: not paid yet: waiting, not closed, no event, no proof', waiting.ok === true && waiting.closed === false && waiting.waiting === true && waiting.proof === null && !(env.stored.connectorOutcomes || []).length, waiting);
    env.objects[INV] = invoice();
    const r = await env.send(CHECK({ expect: { amount: 120000, currency: 'ils' } }));
    check('on: paid: closed with a proof of stripe/payment', r.ok === true && r.closed === true && r.proof && r.proof.system === 'stripe/payment' && r.proof.fetchedBack === true && r.proof.externalId === INV, r);
    check('on: FlowProofOfClose accepts it', env.fn('FlowProofOfClose').isProof(r.proof));
    check('on: every Stripe call is a GET of one invoice; bearer token; nothing is created, charged or refunded', stripe(env).every((c) => c.method === 'GET' && /\/v1\/invoices\/in_[A-Za-z0-9]+\?/.test(c.url) && c.auth === 'Bearer rk_live_tok') && !stripe(env).some((c) => /refund|charges\?|payment_links|invoices\/[^/]+\/(pay|send|finalize|void)/.test(c.url)), stripe(env).map((c) => c.method + c.url));
    const ev = env.stored.connectorOutcomes || []; const dump = JSON.stringify(ev);
    check('on: events for stripe (handled), closeType payment; no id, amount, customer or token', ev.some((e) => e.connector === 'stripe' && e.closeType === 'payment' && e.stage === 'handled' && e.destinationSystem === 'stripe/payment') && !/in_1Abc|120000|dana@|rk_live/.test(dump), dump);
    check('on: the ledger holds the id, kind, state and expectation only (no customer, no paid amount)', !/dana@|customer|rk_live/.test(JSON.stringify(env.stored.stripeLedger)));
    check('a foreign sender is refused', (await env.send(CHECK(), { id: 'someone-else' })).reason === 'foreign-sender');
    env.objects[INV] = invoice({ payment_intent: { id: PI, object: 'payment_intent', latest_charge: charge({ refunded: true, amount_refunded: 120000 }) } });
    const again = await env.send(CHECK({ expect: { amount: 120000, currency: 'ils' } }));
    check('on: refunded afterwards: not closed again, no new handled event', again.closed === false && again.heldOpen === 'refunded' && (env.stored.connectorOutcomes || []).filter((e) => e.stage === 'handled').length === 1, again);
    const rel = await env.send({ type: 'flow:payment-release', payload: { key: 'loop-1' } });
    check('on: release stops watching and writes nothing to Stripe', rel.ok === true && stripe(env).every((c) => c.method === 'GET') && (env.stored.connectorOutcomes || []).some((e) => e.stage === 'undone' && e.closeType === 'payment'), rel);
    await env.fn('disconnectConnector')('stripe');
    check('Disconnect removes the token and the ledger', env.stored.stripeAuth === undefined && env.stored.stripeLedger === undefined, Object.keys(env.stored));
  }
  {
    const env = load({ stored: CONNECTED, patch: ON });
    for (const bad of [{ objectId: 'ch_1Abc2Def3Ghi4Jkl' }, { objectId: 'sk_live_abcdefghijklmnop' }, { objectId: 'https://evil.example/invoices/' + INV }, { key: '' }, { expect: { amount: -1, currency: 'ils' } }]) check('on: bad input ' + JSON.stringify(Object.keys(bad)) + ' is refused before any call', (await env.send(CHECK(bad))).ok === false && stripe(env).length === 0);
    const none = load({ patch: ON });
    check('on, not connected: says so and calls nothing', (await none.send(CHECK())).reason === 'not-connected' && stripe(none).length === 0);
  }
  {
    const env = load({ stored: CONNECTED, patch: ON });
    env.objects[INV] = invoice({ livemode: false });
    const r = await env.send(CHECK());
    check('on: a test-mode invoice never closes a live connection', r.ok === false && r.reason === 'mode-mismatch' && !(env.stored.connectorOutcomes || []).some((e) => e.stage === 'handled'), r);
  }
  {
    const env = load({ stored: CONNECTED, patch: ON });
    const real = env.sandbox.fetch; env.sandbox.fetch = async (u, i) => res(200, { id: INV, object: 'invoice' });
    const r = await env.send(CHECK());
    check('on: a changed answer shape: not ok, no proof, a readback_failed event, no handled event', r.ok === false && r.proof === null && (env.stored.connectorOutcomes || []).some((e) => e.stage === 'readback_failed') && !(env.stored.connectorOutcomes || []).some((e) => e.stage === 'handled'), r);
  }
  console.log('\n--- stripeOAuth on ---\n');
  {
    const env = load({ patch: OAUTH, relay: () => res(200, { access_token: 'rk_live_new', refresh_token: 'rt_new', livemode: true, scope: 'read_only', stripe_user_id: 'acct_1' }), authResult: goodAuth });
    const r = await env.fn('connectStripeOAuth')();
    const auth = env.calls.find((c) => c.method === 'AUTH'); const relay = env.calls.find((c) => c.url.indexOf('token-relay') >= 0); const q = new URL(auth.url).searchParams;
    check('oauth: authorize URL has the public client id, scope read_only only, a state, no secret', new URL(auth.url).origin + new URL(auth.url).pathname === 'https://connect.stripe.com/oauth/authorize' && q.get('client_id') === 'ca_public' && q.get('scope') === 'read_only' && /^[0-9a-f]{32}$/.test(q.get('state')) && !/secret|sk_/i.test(auth.url), auth.url);
    check('oauth: relay body is exactly vendor, grant, code, redirect, install id', relay.body.vendor === 'stripe' && relay.body.grant === 'code' && relay.body.code === 'CODE1' && Object.keys(relay.body).sort().join() === 'code,grant,install_id,redirect_uri,vendor', relay.body);
    check('oauth: the token is stored on the device only; live mode', env.stored.stripeAuth.token === 'rk_live_new' && env.stored.stripeAuth.refreshToken === 'rt_new' && env.stored.stripeAuth.testMode === false && r.title === 'Stripe' && !env.calls.some((c) => /connect\.stripe\.com\/oauth\/token/.test(c.url)));
  }
  {
    const env = load({ patch: OAUTH, relay: () => res(200, { access_token: 'sk_test_new', livemode: false, scope: 'read_only' }), authResult: goodAuth });
    await env.fn('connectStripeOAuth')();
    check('oauth: a test-mode grant is stored as test mode', env.stored.stripeAuth.testMode === true);
  }
  {
    for (const [name, body] of [['read_write scope', { access_token: 't', livemode: true, scope: 'read_write' }], ['no scope', { access_token: 't', livemode: true }], ['no livemode', { access_token: 't', scope: 'read_only' }]]) {
      const env = load({ patch: OAUTH, relay: () => res(200, body), authResult: goodAuth });
      let threw = ''; try { await env.fn('connectStripeOAuth')(); } catch (e) { threw = e.message; }
      check('oauth: ' + name + ' is refused and not stored', /different permission/.test(threw) && env.stored.stripeAuth === undefined, threw);
    }
    const env = load({ patch: OAUTH, relay: () => res(502, { error: 'invalid_grant' }), authResult: goodAuth });
    let threw = ''; try { await env.fn('connectStripeOAuth')(); } catch (e) { threw = e.message; }
    check('oauth: relay refusing the code stores nothing and says why', /invalid_grant/.test(threw) && env.stored.stripeAuth === undefined, threw);
  }
  {
    const env = load({ patch: OAUTH, relay: () => res(200, { access_token: 't', livemode: true, scope: 'read_only' }), authResult: () => REDIRECT + '?code=C&state=forged' });
    let threw = ''; try { await env.fn('connectStripeOAuth')(); } catch (e) { threw = e.message; }
    check('oauth: forged state refused before the relay', /could not be verified/.test(threw) && !env.calls.some((c) => c.url.indexOf('token-relay') >= 0), threw);
    const env2 = load({ patch: [['stripeOAuth: false', 'stripeOAuth: true']] });
    let t2 = ''; try { await env2.fn('connectStripeOAuth')(); } catch (e) { t2 = e.message; }
    check('oauth: no client id -> says so, asks nothing', /isn’t configured/.test(t2) && !env2.calls.some((c) => c.method === 'AUTH'), t2);
  }
  {
    // refresh: a 401 from Stripe triggers one relay refresh; a refresh that does not return read_only is refused
    const env = load({ stored: { stripeAuth: { token: 'OLD', refreshToken: 'r1', testMode: false } }, token: 'rk_live_new', patch: ON, relay: () => res(200, { access_token: 'rk_live_new', refresh_token: 'r2', livemode: true, scope: 'read_only' }) });
    const r = await env.send(CHECK());
    check('refresh: 401 -> one relay refresh -> the read succeeds; the new tokens are stored', r.ok === true && r.closed === true && env.stored.stripeAuth.token === 'rk_live_new' && env.stored.stripeAuth.refreshToken === 'r2' && env.calls.filter((c) => c.url.indexOf('token-relay') >= 0).length === 1, r);
    const env2 = load({ stored: { stripeAuth: { token: 'OLD', refreshToken: 'r1', testMode: false } }, token: 'rk_live_new', patch: ON, relay: () => res(200, { access_token: 'rk_live_new', livemode: true, scope: 'read_write' }) });
    const r2 = await env2.send(CHECK());
    check('refresh: a refresh that is not read_only is refused: not connected, token not replaced', r2.reason === 'not-connected' && env2.stored.stripeAuth.token === 'OLD', r2);
  }
  console.log('\nTOTAL FAILURES: ' + failures);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
