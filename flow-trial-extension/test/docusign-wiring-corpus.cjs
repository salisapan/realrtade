// Wiring of the DocuSign connector inside background.js. READ-ONLY: with the switches off the message types answer connector-not-live and nothing is
// called; with docusignReadBack on, a completed envelope closes the loop with a read-back proof, a waiting one does not, the learning event carries no
// text, release stops watching, Disconnect forgets the ledger; with docusignOAuth on the code goes to the relay (never the secret), the state is
// checked, the account and API host are shape-checked, and the token stays on the device. Demo mode uses the demo hosts and the demo relay vendor.
const vm = require('vm');
const { webcrypto } = require('crypto');
const { backgroundScript } = require('./load-background.cjs');

let failures = 0;
function check(name, cond, detail) { if (cond) console.log('PASS:', name); else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); } }
const res = (status, body, headers) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body), headers: { get: (k) => (headers && headers[k.toLowerCase()]) || null } });
const ACCT = 'b1c2d3e4-1111-4222-8333-444455556666';
const ENV1 = 'aaaaaaaa-1111-4222-8333-000000000001';
const ENV2 = 'aaaaaaaa-1111-4222-8333-000000000002';
const REDIRECT = 'https://dnjhplgmnkabbjogfpbhofjedlkehkai.chromiumapp.org/';

function load(opts) {
  const o = opts || {};
  const calls = []; const listeners = []; const stored = JSON.parse(JSON.stringify(o.stored || {})); const envs = Object.assign({ [ENV1]: { status: 'sent' }, [ENV2]: { status: 'completed' } }, o.envs || {});
  const sandbox = {
    console, setTimeout, clearTimeout, URL, URLSearchParams, crypto: webcrypto, TextEncoder, Uint8Array,
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'), atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    fetch: async (url, init) => {
      const method = (init && init.method) || 'GET'; const u = String(url);
      const body = init && typeof init.body === 'string' ? JSON.parse(init.body) : null;
      calls.push({ method, url: u, body, auth: init && init.headers && init.headers.Authorization });
      if (u.indexOf('token-relay') >= 0) return o.relay ? o.relay(body) : res(503, { error: 'vendor_not_configured' });
      if (/^https:\/\/account(-d)?\.docusign\.com\/oauth\/userinfo$/.test(u)) return res(200, { accounts: o.accounts || [{ account_id: ACCT, is_default: true, account_name: 'Acme Ltd', base_uri: o.demoBase ? 'https://demo.docusign.net' : 'https://na3.docusign.net' }] });
      const m = u.match(/^https:\/\/[a-z0-9]+\.docusign\.net\/restapi\/v2\.1\/accounts\/[0-9a-f-]{36}\/envelopes\/([0-9a-f-]{36})$/);
      if (m && method === 'GET') return envs[m[1]] ? res(200, Object.assign({ envelopeId: m[1] }, envs[m[1]])) : res(404, {});
      return res(500, { error: 'unrouted ' + method + ' ' + u });
    },
    chrome: {
      runtime: { getManifest: () => ({ oauth2: { client_id: 'x' } }), onMessage: { addListener: (fn) => listeners.push(fn) }, onInstalled: { addListener() {} }, onStartup: { addListener() {} }, lastError: null, getURL: (s) => s, id: 'ext' },
      identity: { getAuthToken: (x, cb) => cb('t'), removeCachedAuthToken: (x, cb) => cb && cb(), getRedirectURL: () => REDIRECT, launchWebAuthFlow: async (d) => { calls.push({ method: 'AUTH', url: d.url }); return o.authResult ? o.authResult(d.url) : ''; } },
      storage: { local: { get: async (k) => (typeof k === 'string' ? { [k]: stored[k] } : Array.isArray(k) ? Object.fromEntries(k.map((x) => [x, stored[x]])) : stored), set: async (patch) => { Object.assign(stored, patch); }, remove: async (k) => { [].concat(k).forEach((x) => { delete stored[x]; }); } } },
      windows: { create: () => {}, onRemoved: { addListener() {} } }, tabs: { sendMessage: () => {} }, contextMenus: { create() {}, removeAll(cb) { if (cb) cb(); }, onClicked: { addListener() {} } }, alarms: { create: () => {}, onAlarm: { addListener() {} } }
    }
  };
  sandbox.self = sandbox; sandbox.globalThis = sandbox; vm.createContext(sandbox);
  let src = backgroundScript();
  (o.patch || []).forEach(([a, b]) => { if (src.indexOf(a) < 0) throw new Error('patch target missing: ' + a); src = src.replace(a, b); });
  vm.runInContext(src, sandbox, { filename: 'background.js' });
  const send = (msg, sender) => new Promise((resolve) => { const l = listeners[listeners.length - 1]; const keep = l(msg, sender || { id: 'ext' }, resolve); if (keep !== true) resolve(undefined); });
  return { calls, stored, envs, sandbox, send, fn: (n) => vm.runInContext(n, sandbox) };
}
const CONNECTED = { docusignAuth: { token: 'ds_tok', refreshToken: 'ds_ref', accountId: ACCT, baseUri: 'https://na3.docusign.net' } };
const ON = [['docusignReadBack: false', 'docusignReadBack: true']];
const OAUTH = [['docusignOAuth: false', 'docusignOAuth: true'], ["docusignClientId: 'REPLACE_WITH_DOCUSIGN_INTEGRATION_KEY'", "docusignClientId: 'integration-key'"]];
const goodRelay = () => res(200, { access_token: 'oauth_tok', refresh_token: 'oauth_ref' });
const goodAuth = (u) => REDIRECT + '?code=CODE1&state=' + new URL(u).searchParams.get('state');

(async () => {
  console.log('\n--- switches default off: nothing is called ---\n');
  {
    const env = load({ stored: CONNECTED });
    const C = env.fn('CONNECTORS');
    check('shipped config: all three docusign switches are false', C.docusignReadBack === false && C.docusignOAuth === false && C.docusignDemo === false, C);
    const r = await env.send({ type: 'flow:signature-check', payload: { key: 'k', envelope: ENV2 } });
    check('off: the check answers connector-not-live and calls nothing', r && r.ok === false && r.reason === 'connector-not-live' && env.calls.length === 0, r);
    const rel = await env.send({ type: 'flow:signature-release', payload: { key: 'k' } });
    check('off: release answers connector-not-live', rel && rel.reason === 'connector-not-live');
    let threw = ''; try { await env.fn('connectDocusignOAuth')(); } catch (e) { threw = e.message; }
    check('off: Sign in with DocuSign refuses and calls nothing', /not switched on/.test(threw) && env.calls.length === 0, threw);
    check('off: nothing stored', env.stored.connectorOutcomes === undefined && env.stored.docusignLedger === undefined);
  }
  console.log('\n--- docusignReadBack on ---\n');
  {
    const env = load({ stored: CONNECTED, patch: ON });
    const r = await env.send({ type: 'flow:signature-check', payload: { key: 'loop-1', envelope: 'https://app.docusign.com/documents/details/' + ENV2 } });
    check('on: a completed envelope closes the loop with a read-back proof of docusign/envelope', r.ok === true && r.closed === true && r.proof && r.proof.system === 'docusign/envelope' && r.proof.fetchedBack === true && r.proof.externalId === ENV2, r);
    check('on: FlowProofOfClose accepts it', env.fn('FlowProofOfClose').isProof(r.proof));
    check('on: exactly one GET, on the account host with the account id, nothing else', env.calls.length === 1 && env.calls[0].method === 'GET' && env.calls[0].url === 'https://na3.docusign.net/restapi/v2.1/accounts/' + ACCT + '/envelopes/' + ENV2 && env.calls[0].auth === 'Bearer ds_tok', env.calls);
    const w = await env.send({ type: 'flow:signature-check', payload: { key: 'loop-2', envelope: ENV1 } });
    check('on: a waiting envelope does NOT close the loop and carries no proof', w.ok === true && w.closed === false && w.proof === null && w.label === 'waiting', w);
    const ev = env.stored.connectorOutcomes || []; const dump = JSON.stringify(ev);
    check('on: one learning event (handled, closeType signature), none for the waiting one, no ids or text', ev.length === 1 && ev[0].stage === 'handled' && ev[0].closeType === 'signature' && ev[0].connector === 'docusign' && ev[0].destinationSystem === 'docusign/envelope' && dump.indexOf(ENV2) < 0 && dump.indexOf('ds_tok') < 0, dump);
    const x = await env.send({ type: 'flow:signature-check', payload: { key: 'loop-1', envelope: ENV1 } });
    check('on: a second envelope for the same loop is refused', x.ok === false && x.reason === 'already-linked');
    const rel = await env.send({ type: 'flow:signature-release', payload: { key: 'loop-1' } });
    check('on: release stops watching, makes no call, emits an undone event', rel.ok === true && env.calls.length === 2 && (env.stored.connectorOutcomes || []).some((e) => e.stage === 'undone'), rel);
    const f = await env.send({ type: 'flow:signature-check', payload: { key: 'loop-3', envelope: 'not-an-envelope' } });
    check('on: input that is not an envelope id or DocuSign link is refused before any call', f.ok === false && f.reason === 'bad-params' && env.calls.length === 2, f);
    check('a foreign sender is refused', (await env.send({ type: 'flow:signature-check', payload: { key: 'k', envelope: ENV2 } }, { id: 'someone-else' })).reason === 'foreign-sender');
    await env.fn('disconnectConnector')('docusign');
    check('Disconnect removes the token and the ledger', env.stored.docusignAuth === undefined && env.stored.docusignLedger === undefined, Object.keys(env.stored));
  }
  {
    const env = load({ stored: CONNECTED, patch: ON, envs: { [ENV2]: { status: 'declined' } } });
    const r = await env.send({ type: 'flow:signature-check', payload: { key: 'k', envelope: ENV2 } });
    check('on: a declined envelope is shown as declined and never closes', r.closed === false && r.label === 'declined' && r.proof === null);
  }
  {
    const env = load({ stored: CONNECTED, patch: ON });
    const sb = env.sandbox; const real = sb.fetch; sb.fetch = async (u, i) => (String(u).indexOf('/envelopes/') > 0 ? res(200, { status: 'completed' }) : real(u, i));
    const r = await env.send({ type: 'flow:signature-check', payload: { key: 'k', envelope: ENV2 } });
    check('an answer with no envelope id: not closed, no proof, a readback_failed event and no handled event', r.ok === false && r.closed === false && r.proof === null && (env.stored.connectorOutcomes || []).some((e) => e.stage === 'readback_failed') && !(env.stored.connectorOutcomes || []).some((e) => e.stage === 'handled'), r);
  }
  {
    const env = load({ stored: CONNECTED, patch: ON.concat([['linearReadBack: false', 'linearReadBack: true'], ['jiraReadBack: false', 'jiraReadBack: true']]) });
    check('other connectors on at the same time do not take the signature path', env.fn('WRITERS').docusign === undefined && env.fn('WRITERS').linear === env.fn('linearReadBackWrite'));
  }
  console.log('\n--- docusignOAuth on ---\n');
  {
    const env = load({ patch: OAUTH, relay: goodRelay, authResult: goodAuth });
    const r = await env.fn('connectDocusignOAuth')();
    const auth = env.calls.find((c) => c.method === 'AUTH'); const relay = env.calls.find((c) => c.url.indexOf('token-relay') >= 0);
    const q = new URL(auth.url);
    check('oauth: authorize URL is the production host with the integration key, scope signature, a state, no secret', q.origin + q.pathname === 'https://account.docusign.com/oauth/auth' && q.searchParams.get('client_id') === 'integration-key' && q.searchParams.get('scope') === 'signature' && /^[0-9a-f]{32}$/.test(q.searchParams.get('state')) && !/secret/i.test(auth.url), auth.url);
    check('oauth: relay body is exactly vendor docusign, grant, code, redirect, install id', relay.body.vendor === 'docusign' && relay.body.grant === 'code' && relay.body.code === 'CODE1' && Object.keys(relay.body).sort().join() === 'code,grant,install_id,redirect_uri,vendor', relay.body);
    const a = env.stored.docusignAuth;
    check('oauth: token on device; the default account and its API host resolved', a.token === 'oauth_tok' && a.refreshToken === 'oauth_ref' && a.accountId === ACCT && a.baseUri === 'https://na3.docusign.net' && a.demo === false && r.title === 'Acme Ltd', a);
  }
  {
    const env = load({ patch: OAUTH.concat([['docusignDemo: false', 'docusignDemo: true']]), relay: goodRelay, authResult: goodAuth, demoBase: true });
    await env.fn('connectDocusignOAuth')();
    const auth = env.calls.find((c) => c.method === 'AUTH'); const relay = env.calls.find((c) => c.url.indexOf('token-relay') >= 0);
    check('demo: the demo authorize host and the demo relay vendor are used; the account is marked demo', auth.url.indexOf('https://account-d.docusign.com/oauth/auth') === 0 && relay.body.vendor === 'docusign-demo' && env.stored.docusignAuth.demo === true && env.stored.docusignAuth.baseUri === 'https://demo.docusign.net');
  }
  {
    const bad = [{ account_id: ACCT, is_default: true, base_uri: 'https://evil.example' }, { account_id: '../x', is_default: true, base_uri: 'https://na3.docusign.net' }, { account_id: ACCT, base_uri: 'https://na3.docusign.net.evil.example' }];
    const env = load({ patch: OAUTH, relay: goodRelay, authResult: goodAuth, accounts: bad });
    let threw = ''; try { await env.fn('connectDocusignOAuth')(); } catch (e) { threw = e.message; }
    check('oauth: accounts with a non-DocuSign API host or a malformed id are never used', /no account Glance can read/.test(threw) && env.stored.docusignAuth === undefined, threw);
  }
  {
    const env = load({ patch: OAUTH, relay: goodRelay, authResult: () => REDIRECT + '?code=C&state=forged' });
    let threw = ''; try { await env.fn('connectDocusignOAuth')(); } catch (e) { threw = e.message; }
    check('oauth: forged state refused before the relay', /could not be verified/.test(threw) && !env.calls.some((c) => c.url.indexOf('token-relay') >= 0), threw);
  }
  {
    const env = load({ patch: [['docusignOAuth: false', 'docusignOAuth: true']] });
    let threw = ''; try { await env.fn('connectDocusignOAuth')(); } catch (e) { threw = e.message; }
    check('oauth: no integration key -> says so, asks nothing', /isn’t configured/.test(threw) && !env.calls.some((c) => c.method === 'AUTH'), threw);
  }
  {
    const env = load({ patch: OAUTH, relay: () => res(502, { error: 'invalid_grant' }), authResult: goodAuth });
    let threw = ''; try { await env.fn('connectDocusignOAuth')(); } catch (e) { threw = e.message; }
    check('oauth: relay refusing the code stores nothing', /invalid_grant/.test(threw) && env.stored.docusignAuth === undefined, threw);
  }
  console.log('\nTOTAL FAILURES: ' + failures);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
