// Wiring of the Asana connector inside background.js: both switches default off and register nothing; with asanaReadBack on the
// writer returns a ProofOfClose, Undo reads back, the learning event has no text, Disconnect forgets the ledger; with asanaOAuth on
// the PKCE challenge matches the verifier sent to the relay, the state is checked, and the token stays on the device.
const vm = require('vm');
const crypto = require('crypto');
const { webcrypto } = crypto;
const { backgroundScript } = require('./load-background.cjs');

let failures = 0;
function check(name, cond, detail) { if (cond) console.log('PASS:', name); else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); } }
const res = (status, body, headers) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body), headers: { get: (k) => (headers && headers[k.toLowerCase()]) || null } });
const PROJECT = '1200000000000001';

function load(opts) {
  const o = opts || {};
  const calls = []; const stored = JSON.parse(JSON.stringify(o.stored || {})); const tasks = {}; let seq = 0;
  const sandbox = {
    console, setTimeout, clearTimeout, URL, URLSearchParams, crypto: webcrypto, TextEncoder, Uint8Array,
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'), atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    fetch: async (url, init) => {
      const method = (init && init.method) || 'GET'; const u = String(url);
      const body = init && typeof init.body === 'string' ? JSON.parse(init.body) : null;
      calls.push({ method, url: u, body, auth: init && init.headers && init.headers.Authorization });
      if (u.indexOf('token-relay') >= 0) return o.relay ? o.relay(body) : res(503, { error: 'vendor_not_configured' });
      const p = u.replace('https://app.asana.com/api/1.0', '');
      if (method === 'POST' && p === '/tasks') { const gid = String(1300000000000000 + (++seq)); tasks[gid] = { gid, name: body.data.name, completed: false, permalink_url: 'https://app.asana.com/0/' + PROJECT + '/' + gid, projects: body.data.projects.map((g) => ({ gid: g })) }; return res(201, { data: tasks[gid] }); }
      let m = p.match(/^\/tasks\/(\d+)/);
      if (m && method === 'GET') return tasks[m[1]] ? res(200, { data: tasks[m[1]] }) : res(404, {});
      if (m && method === 'DELETE') { delete tasks[m[1]]; return res(200, { data: {} }); }
      if (method === 'GET' && p.indexOf('/projects/' + PROJECT) === 0 && p.indexOf('/tasks') < 0) return res(200, { data: { gid: PROJECT, name: 'Ops' } });
      if (method === 'GET' && p.indexOf('/projects/' + PROJECT + '/tasks') === 0) return res(200, { data: Object.values(tasks) });
      return res(500, { error: 'unrouted ' + method + ' ' + u });
    },
    chrome: {
      runtime: { getManifest: () => ({ oauth2: { client_id: 'x' } }), onMessage: { addListener() {} }, onInstalled: { addListener() {} }, onStartup: { addListener() {} }, lastError: null, getURL: (s) => s, id: 'ext' },
      identity: { getAuthToken: (x, cb) => cb('t'), removeCachedAuthToken: (x, cb) => cb && cb(), getRedirectURL: () => 'https://dnjhplgmnkabbjogfpbhofjedlkehkai.chromiumapp.org/', launchWebAuthFlow: async (d) => { calls.push({ method: 'AUTH', url: d.url }); return o.authResult ? o.authResult(d.url) : ''; } },
      storage: { local: { get: async (k) => (typeof k === 'string' ? { [k]: stored[k] } : Array.isArray(k) ? Object.fromEntries(k.map((x) => [x, stored[x]])) : stored), set: async (patch) => { Object.assign(stored, patch); }, remove: async (k) => { [].concat(k).forEach((x) => { delete stored[x]; }); } } },
      windows: { create: () => {}, onRemoved: { addListener() {} } }, tabs: { sendMessage: () => {} }, contextMenus: { create() {}, removeAll(cb) { if (cb) cb(); }, onClicked: { addListener() {} } }, alarms: { create: () => {}, onAlarm: { addListener() {} } }
    }
  };
  sandbox.self = sandbox; sandbox.globalThis = sandbox; vm.createContext(sandbox);
  let src = backgroundScript();
  (o.patch || []).forEach(([a, b]) => { if (src.indexOf(a) < 0) throw new Error('patch target missing: ' + a); src = src.replace(a, b); });
  vm.runInContext(src, sandbox, { filename: 'background.js' });
  return { calls, stored, tasks, sandbox, fn: (n) => vm.runInContext(n, sandbox) };
}
const CONNECTED = { asanaAuth: { token: 'asana_tok', refreshToken: 'asana_ref', projectGid: PROJECT, projectName: 'Ops' } };
const PAYLOAD = { label: 'Send Dana the signed contract', facts: {}, messageId: 'm-1', threadUrl: 'https://mail.google.com/x' };
const ON = [['asanaReadBack: false', 'asanaReadBack: true']];
const OAUTH = [['asanaOAuth: false', 'asanaOAuth: true'], ["asanaClientId: 'REPLACE_WITH_ASANA_CLIENT_ID'", "asanaClientId: 'cid-public'"]];
const REDIRECT = 'https://dnjhplgmnkabbjogfpbhofjedlkehkai.chromiumapp.org/';

(async () => {
  console.log('\n--- switches default off, nothing registered ---\n');
  {
    const env = load({ stored: CONNECTED });
    const C = env.fn('CONNECTORS');
    check('shipped config: asana switches are false', C.asanaReadBack === false && C.asanaOAuth === false, C);
    check('off: no asana writer or undoer exists', env.fn('WRITERS').asana === undefined && env.fn('UNDOERS').asana === undefined);
    let threw = ''; try { await env.fn('connectAsanaOAuth')('https://app.asana.com/0/' + PROJECT + '/list'); } catch (e) { threw = e.message; }
    check('off: Sign in with Asana refuses and calls nothing', /not switched on/.test(threw) && env.calls.length === 0, threw);
    check('off: nothing stored', env.stored.connectorOutcomes === undefined && env.stored.asanaLedger === undefined);
  }
  console.log('\n--- asanaReadBack on ---\n');
  {
    const env = load({ stored: CONNECTED, patch: ON });
    check('on: writer and undoer registered under "asana"', env.fn('WRITERS').asana === env.fn('asanaReadBackWrite') && env.fn('UNDOERS').asana === env.fn('asanaReadBackUndo'));
    const out = await env.fn('WRITERS').asana(PAYLOAD);
    check('on: Handled with a read-back proof of asana/task', out.ok === true && out.proof && out.proof.system === 'asana/task' && out.proof.fetchedBack === true, out);
    check('on: FlowProofOfClose accepts it', env.fn('FlowProofOfClose').isProof(out.proof));
    const again = await env.fn('WRITERS').asana(PAYLOAD);
    check('on: a second click creates no second task', Object.keys(env.tasks).length === 1 && again.ok === true, Object.keys(env.tasks));
    const ev = env.stored.connectorOutcomes || []; const dump = JSON.stringify(ev);
    check('on: events emitted for asana (approved, handled), no text', ev.every((e) => e.connector === 'asana') && ev.some((e) => e.stage === 'approved') && ev.some((e) => e.stage === 'handled') && !/Dana|contract|mail\.google|asana_tok/.test(dump), dump);
    const un = await env.fn('UNDOERS').asana(out.ref);
    check('on: Undo deletes and reads back', un.ok === true && un.readBack === true && Object.keys(env.tasks).length === 0, un);
    check('on: Undo is an event too', (env.stored.connectorOutcomes || []).some((e) => e.stage === 'undone' && e.connector === 'asana'));
    await env.fn('disconnectConnector')('asana');
    check('Disconnect removes the token and the ledger', env.stored.asanaAuth === undefined && env.stored.asanaLedger === undefined, Object.keys(env.stored));
  }
  {
    const env = load({ stored: CONNECTED, patch: ON });
    const sb = env.sandbox; const real = sb.fetch;
    sb.fetch = async (url, init) => { if ((init && init.method) === 'GET' && /\/tasks\/\d+\?/.test(String(url))) return res(500, {}); return real(url, init); };
    const out = await env.fn('WRITERS').asana(PAYLOAD);
    check('read-back 500: ok false, no proof, verify_failed', out.ok === false && out.proof === null && out.reason === 'verify_failed', out);
    check('read-back 500: readback_failed event, no handled event', (env.stored.connectorOutcomes || []).some((e) => e.stage === 'readback_failed') && !(env.stored.connectorOutcomes || []).some((e) => e.stage === 'handled'));
    check('read-back 500: one task exists, none duplicated', Object.keys(env.tasks).length === 1);
  }
  {
    const env = load({ stored: CONNECTED, patch: ON.concat([['notionReadBack: false', 'notionReadBack: true']]) });
    check('both connectors on: each has its own writer', env.fn('WRITERS').asana === env.fn('asanaReadBackWrite') && env.fn('WRITERS').notion === env.fn('notionReadBackWrite'));
  }
  console.log('\n--- asanaOAuth on ---\n');
  {
    const env = load({ patch: OAUTH, relay: () => res(200, { access_token: 'oauth_tok', refresh_token: 'oauth_ref' }),
      authResult: (u) => REDIRECT + '?code=CODE1&state=' + new URL(u).searchParams.get('state') });
    const r = await env.fn('connectAsanaOAuth')('https://app.asana.com/0/' + PROJECT + '/list');
    const auth = env.calls.find((c) => c.method === 'AUTH'); const relay = env.calls.find((c) => c.url.indexOf('token-relay') >= 0);
    const q = new URL(auth.url).searchParams;
    check('oauth: authorize URL has the public client id, S256 PKCE, a state, no secret', q.get('client_id') === 'cid-public' && q.get('code_challenge_method') === 'S256' && /^[A-Za-z0-9_-]{43}$/.test(q.get('code_challenge')) && /^[0-9a-f]{32}$/.test(q.get('state')) && !/secret/i.test(auth.url), auth.url);
    const expectChallenge = crypto.createHash('sha256').update(relay.body.code_verifier).digest('base64url');
    check('oauth: the verifier sent to the relay hashes to the challenge', expectChallenge === q.get('code_challenge'), { v: relay.body.code_verifier });
    check('oauth: relay body is exactly vendor, grant, code, verifier, redirect, install id', relay.body.vendor === 'asana' && relay.body.grant === 'code' && relay.body.code === 'CODE1' && Object.keys(relay.body).sort().join() === 'code,code_verifier,grant,install_id,redirect_uri,vendor', relay.body);
    check('oauth: token stored on device; project verified with it', env.stored.asanaAuth.token === 'oauth_tok' && env.stored.asanaAuth.refreshToken === 'oauth_ref' && env.stored.asanaAuth.projectGid === PROJECT && r.title === 'Ops' && env.calls.some((c) => /\/projects\/\d+/.test(c.url) && c.auth === 'Bearer oauth_tok'), env.stored.asanaAuth);
  }
  {
    const env = load({ patch: OAUTH, relay: () => res(200, { access_token: 't' }), authResult: () => REDIRECT + '?code=C&state=forged' });
    let threw = ''; try { await env.fn('connectAsanaOAuth')(PROJECT + '0000'); } catch (e) { threw = e.message; }
    check('oauth: forged state refused before the relay', /could not be verified/.test(threw) && !env.calls.some((c) => c.url.indexOf('token-relay') >= 0), threw);
  }
  {
    const env = load({ patch: [['asanaOAuth: false', 'asanaOAuth: true']] });
    let threw = ''; try { await env.fn('connectAsanaOAuth')(PROJECT); } catch (e) { threw = e.message; }
    check('oauth: no client id -> says so, asks nothing', /isn’t configured/.test(threw) && !env.calls.some((c) => c.method === 'AUTH'), threw);
  }
  {
    const env = load({ patch: OAUTH, relay: () => res(502, { error: 'invalid_grant' }), authResult: (u) => REDIRECT + '?code=C&state=' + new URL(u).searchParams.get('state') });
    let threw = ''; try { await env.fn('connectAsanaOAuth')(PROJECT); } catch (e) { threw = e.message; }
    check('oauth: relay refusing the code stores nothing', /invalid_grant/.test(threw) && env.stored.asanaAuth === undefined, threw);
    let t2 = ''; try { await env.fn('connectAsanaOAuth')('not a project'); } catch (e) { t2 = e.message; }
    check('oauth: a non-project link is refused before any sign-in', /project link/.test(t2));
  }
  {
    const env = load({});
    const f = env.fn('parseAsanaProjectGid');
    check('project link parsing', f('https://app.asana.com/0/1200000000000001/list') === '1200000000000001' && f('https://app.asana.com/1/123456789/project/1200000000000001/list/1') === '1200000000000001' && f('1200000000000001') === '1200000000000001' && f('https://evil.example/x') === null && f('12/../x') === null);
  }
  console.log('\nTOTAL FAILURES: ' + failures);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
