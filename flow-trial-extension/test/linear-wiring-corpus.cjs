// Wiring of the Linear connector inside background.js: both switches default off and register nothing; with linearReadBack on the writer
// returns a ProofOfClose, Undo reads back, the learning event has no text, Disconnect forgets the ledger; with linearOAuth on the PKCE
// challenge matches the verifier sent to the relay, the state is checked, the team is resolved and the token stays on the device.
const vm = require('vm');
const crypto = require('crypto');
const { webcrypto } = crypto;
const { backgroundScript } = require('./load-background.cjs');

let failures = 0;
function check(name, cond, detail) { if (cond) console.log('PASS:', name); else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); } }
const res = (status, body, headers) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body), headers: { get: (k) => (headers && headers[k.toLowerCase()]) || null } });
const TEAM = 'a1b2c3d4-0000-4000-8000-000000000001';
const REDIRECT = 'https://dnjhplgmnkabbjogfpbhofjedlkehkai.chromiumapp.org/';
const notFound = () => res(200, { data: null, errors: [{ message: 'Entity not found: Issue', extensions: { code: 'INVALID_INPUT' } }] });

function load(opts) {
  const o = opts || {};
  const calls = []; const stored = JSON.parse(JSON.stringify(o.stored || {})); const issues = {};
  const sandbox = {
    console, setTimeout, clearTimeout, URL, URLSearchParams, crypto: webcrypto, TextEncoder, Uint8Array,
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'), atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    fetch: async (url, init) => {
      const method = (init && init.method) || 'GET'; const u = String(url);
      const body = init && typeof init.body === 'string' ? JSON.parse(init.body) : null;
      calls.push({ method, url: u, body, auth: init && init.headers && init.headers.Authorization });
      if (u.indexOf('token-relay') >= 0) return o.relay ? o.relay(body) : res(503, { error: 'vendor_not_configured' });
      if (u !== 'https://api.linear.app/graphql') return res(500, { error: 'unrouted ' + u });
      const q = body.query; const v = body.variables || {};
      if (q.indexOf('teams(first') >= 0) return res(200, { data: { teams: { nodes: o.teams || [{ id: TEAM, key: 'ENG', name: 'Engineering' }, { id: 'a1b2c3d4-0000-4000-8000-000000000002', key: 'OPS', name: 'Operations' }] } } });
      if (q.indexOf('issueCreate') >= 0) { const i = v.input; issues[i.id] = { id: i.id, identifier: 'ENG-1', title: i.title, url: 'https://linear.app/acme/issue/ENG-1', trashed: false, archivedAt: null, completedAt: null, canceledAt: null, team: { id: i.teamId } }; return res(200, { data: { issueCreate: { success: true, issue: issues[i.id] } } }); }
      if (q.indexOf('issueDelete') >= 0) { if (!issues[v.id]) return notFound(); issues[v.id].trashed = true; return res(200, { data: { issueDelete: { success: true } } }); }
      if (q.indexOf('issue(id:') >= 0) return issues[v.id] ? res(200, { data: { issue: issues[v.id] } }) : notFound();
      return res(500, { error: 'unrouted query' });
    },
    chrome: {
      runtime: { getManifest: () => ({ oauth2: { client_id: 'x' } }), onMessage: { addListener() {} }, onInstalled: { addListener() {} }, onStartup: { addListener() {} }, lastError: null, getURL: (s) => s, id: 'ext' },
      identity: { getAuthToken: (x, cb) => cb('t'), removeCachedAuthToken: (x, cb) => cb && cb(), getRedirectURL: () => REDIRECT, launchWebAuthFlow: async (d) => { calls.push({ method: 'AUTH', url: d.url }); return o.authResult ? o.authResult(d.url) : ''; } },
      storage: { local: { get: async (k) => (typeof k === 'string' ? { [k]: stored[k] } : Array.isArray(k) ? Object.fromEntries(k.map((x) => [x, stored[x]])) : stored), set: async (patch) => { Object.assign(stored, patch); }, remove: async (k) => { [].concat(k).forEach((x) => { delete stored[x]; }); } } },
      windows: { create: () => {}, onRemoved: { addListener() {} } }, tabs: { sendMessage: () => {} }, contextMenus: { create() {}, removeAll(cb) { if (cb) cb(); }, onClicked: { addListener() {} } }, alarms: { create: () => {}, onAlarm: { addListener() {} } }
    }
  };
  sandbox.self = sandbox; sandbox.globalThis = sandbox; vm.createContext(sandbox);
  let src = backgroundScript();
  (o.patch || []).forEach(([a, b]) => { if (src.indexOf(a) < 0) throw new Error('patch target missing: ' + a); src = src.replace(a, b); });
  vm.runInContext(src, sandbox, { filename: 'background.js' });
  return { calls, stored, issues, sandbox, fn: (n) => vm.runInContext(n, sandbox) };
}
const CONNECTED = { linearAuth: { token: 'linear_tok', refreshToken: 'linear_ref', teamId: TEAM, teamKey: 'ENG' } };
const PAYLOAD = { label: 'Send Dana the signed contract', facts: {}, messageId: 'm-1', threadUrl: 'https://mail.google.com/x' };
const ON = [['linearReadBack: false', 'linearReadBack: true']];
const OAUTH = [['linearOAuth: false', 'linearOAuth: true'], ["linearClientId: 'REPLACE_WITH_LINEAR_CLIENT_ID'", "linearClientId: 'cid-public'"]];
const goodRelay = () => res(200, { access_token: 'oauth_tok', refresh_token: 'oauth_ref' });
const goodAuth = (u) => REDIRECT + '?code=CODE1&state=' + new URL(u).searchParams.get('state');

(async () => {
  console.log('\n--- switches default off, nothing registered ---\n');
  {
    const env = load({ stored: CONNECTED });
    check('shipped config: linear switches are false', env.fn('CONNECTORS').linearReadBack === false && env.fn('CONNECTORS').linearOAuth === false);
    check('off: no linear writer or undoer exists', env.fn('WRITERS').linear === undefined && env.fn('UNDOERS').linear === undefined);
    let threw = ''; try { await env.fn('connectLinearOAuth')('ENG'); } catch (e) { threw = e.message; }
    check('off: Sign in with Linear refuses and calls nothing', /not switched on/.test(threw) && env.calls.length === 0, threw);
    check('off: nothing stored', env.stored.connectorOutcomes === undefined && env.stored.linearLedger === undefined);
  }
  console.log('\n--- linearReadBack on ---\n');
  {
    const env = load({ stored: CONNECTED, patch: ON });
    check('on: writer and undoer registered under "linear"', env.fn('WRITERS').linear === env.fn('linearReadBackWrite') && env.fn('UNDOERS').linear === env.fn('linearReadBackUndo'));
    const out = await env.fn('WRITERS').linear(PAYLOAD);
    check('on: Handled with a read-back proof of linear/issue and the issue url', out.ok === true && out.proof && out.proof.system === 'linear/issue' && out.proof.fetchedBack === true && out.proof.url === 'https://linear.app/acme/issue/ENG-1', out);
    check('on: the issue id was chosen on the device (crypto.randomUUID) and is the proof id', /^[0-9a-f-]{36}$/.test(out.proof.externalId) && env.calls.find((c) => c.body && c.body.query.indexOf('issueCreate') >= 0).body.variables.input.id === out.proof.externalId);
    check('on: FlowProofOfClose accepts it', env.fn('FlowProofOfClose').isProof(out.proof));
    const again = await env.fn('WRITERS').linear(PAYLOAD);
    check('on: a second click creates no second issue', Object.keys(env.issues).length === 1 && again.ok === true);
    const ev = env.stored.connectorOutcomes || []; const dump = JSON.stringify(ev);
    check('on: events for linear (approved, handled), no text', ev.every((e) => e.connector === 'linear' && e.destinationSystem === 'linear/issue') && ev.some((e) => e.stage === 'approved') && ev.some((e) => e.stage === 'handled') && !/Dana|contract|mail\.google|linear_tok|ENG-/.test(dump), dump);
    const un = await env.fn('UNDOERS').linear(out.ref);
    check('on: Undo deletes and reads back', un.ok === true && un.readBack === true && Object.values(env.issues)[0].trashed === true, un);
    check('on: Undo is an event too', (env.stored.connectorOutcomes || []).some((e) => e.stage === 'undone' && e.connector === 'linear'));
    await env.fn('disconnectConnector')('linear');
    check('Disconnect removes the token and the ledger', env.stored.linearAuth === undefined && env.stored.linearLedger === undefined, Object.keys(env.stored));
  }
  {
    const env = load({ stored: CONNECTED, patch: ON });
    const sb = env.sandbox; const real = sb.fetch;
    sb.fetch = async (url, init) => { const b = init && typeof init.body === 'string' ? JSON.parse(init.body) : {}; if (b.query && b.query.indexOf('issue(id:') >= 0 && b.query.indexOf('issueCreate') < 0) return res(500, {}); return real(url, init); };
    const out = await env.fn('WRITERS').linear(PAYLOAD);
    check('read-back 500: ok false, no proof, verify_failed', out.ok === false && out.proof === null && out.reason === 'verify_failed', out);
    check('read-back 500: readback_failed event, no handled event', (env.stored.connectorOutcomes || []).some((e) => e.stage === 'readback_failed') && !(env.stored.connectorOutcomes || []).some((e) => e.stage === 'handled'));
    check('read-back 500: one issue exists', Object.keys(env.issues).length === 1);
  }
  {
    const env = load({ stored: CONNECTED, patch: ON.concat([['jiraReadBack: false', 'jiraReadBack: true'], ['asanaReadBack: false', 'asanaReadBack: true'], ['notionReadBack: false', 'notionReadBack: true']]) });
    check('all four connectors on: each has its own writer', ['linear', 'jira', 'asana', 'notion'].every((k) => env.fn('WRITERS')[k] === env.fn(k + 'ReadBackWrite')));
  }
  console.log('\n--- linearOAuth on ---\n');
  {
    const env = load({ patch: OAUTH, relay: goodRelay, authResult: goodAuth });
    const r = await env.fn('connectLinearOAuth')('https://linear.app/acme/team/ENG/active');
    const auth = env.calls.find((c) => c.method === 'AUTH'); const relay = env.calls.find((c) => c.url.indexOf('token-relay') >= 0);
    const q = new URL(auth.url).searchParams;
    check('oauth: authorize URL has the public client id, S256 PKCE, read+write scope, a state, no secret', q.get('client_id') === 'cid-public' && q.get('code_challenge_method') === 'S256' && q.get('scope') === 'read,write' && /^[0-9a-f]{32}$/.test(q.get('state')) && !/secret/i.test(auth.url), auth.url);
    check('oauth: the verifier sent to the relay hashes to the challenge', crypto.createHash('sha256').update(relay.body.code_verifier).digest('base64url') === q.get('code_challenge'));
    check('oauth: relay body is exactly vendor, grant, code, verifier, redirect, install id', relay.body.vendor === 'linear' && relay.body.grant === 'code' && relay.body.code === 'CODE1' && Object.keys(relay.body).sort().join() === 'code,code_verifier,grant,install_id,redirect_uri,vendor', relay.body);
    const a = env.stored.linearAuth;
    check('oauth: token on device; the team id resolved from its key', a.token === 'oauth_tok' && a.refreshToken === 'oauth_ref' && a.teamId === TEAM && a.teamKey === 'ENG' && r.title === 'Engineering', a);
  }
  {
    const env = load({ patch: OAUTH, relay: goodRelay, authResult: goodAuth });
    let threw = ''; try { await env.fn('connectLinearOAuth')('NOPE'); } catch (e) { threw = e.message; }
    check('oauth: a team the person is not in -> says so, stores nothing', /no team with the key NOPE/.test(threw) && env.stored.linearAuth === undefined, threw);
  }
  {
    const env = load({ patch: OAUTH, relay: goodRelay, authResult: goodAuth, teams: [{ id: 'not-a-uuid', key: 'ENG', name: 'x' }] });
    let threw = ''; try { await env.fn('connectLinearOAuth')('ENG'); } catch (e) { threw = e.message; }
    check('oauth: a team whose id is not a UUID is never used', /no team with the key/.test(threw) && env.stored.linearAuth === undefined, threw);
  }
  {
    const env = load({ patch: OAUTH, relay: goodRelay, authResult: () => REDIRECT + '?code=C&state=forged' });
    let threw = ''; try { await env.fn('connectLinearOAuth')('ENG'); } catch (e) { threw = e.message; }
    check('oauth: forged state refused before the relay', /could not be verified/.test(threw) && !env.calls.some((c) => c.url.indexOf('token-relay') >= 0), threw);
  }
  {
    const env = load({ patch: [['linearOAuth: false', 'linearOAuth: true']] });
    let threw = ''; try { await env.fn('connectLinearOAuth')('ENG'); } catch (e) { threw = e.message; }
    check('oauth: no client id -> says so, asks nothing', /isn’t configured/.test(threw) && !env.calls.some((c) => c.method === 'AUTH'), threw);
  }
  {
    const env = load({ patch: OAUTH, relay: () => res(502, { error: 'invalid_grant' }), authResult: goodAuth });
    let threw = ''; try { await env.fn('connectLinearOAuth')('ENG'); } catch (e) { threw = e.message; }
    check('oauth: relay refusing the code stores nothing', /invalid_grant/.test(threw) && env.stored.linearAuth === undefined, threw);
    let t2 = ''; try { await env.fn('connectLinearOAuth')('eng; DROP'); } catch (e) { t2 = e.message; }
    check('oauth: a non-team input is refused before any sign-in', /team key/.test(t2));
  }
  {
    const f = load({}).fn('parseLinearTeamKey');
    check('team parsing', f('ENG') === 'ENG' && f('https://linear.app/acme/team/ENG/active') === 'ENG' && f('https://evil.example/team/ENG') === null && f('eng') === null && f('ENG" OR 1=1') === null && f('ABCDEFGHIJ') === null);
  }
  console.log('\nTOTAL FAILURES: ' + failures);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
