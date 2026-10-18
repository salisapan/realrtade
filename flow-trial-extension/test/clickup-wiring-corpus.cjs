// Wiring of the ClickUp connector inside background.js: both switches default off and register nothing; with clickupReadBack on the
// writer returns a ProofOfClose, Undo reads back, the learning event has no text, Disconnect forgets the ledger; with clickupOAuth on
// the state is checked before the code leaves, no PKCE or secret is sent, and the token stays on the device.
const vm = require('vm');
const { webcrypto } = require('crypto');
const { backgroundScript } = require('./load-background.cjs');

let failures = 0;
function check(name, cond, detail) { if (cond) console.log('PASS:', name); else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); } }
const res = (status, body, headers) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body), headers: { get: (k) => (headers && headers[k.toLowerCase()]) || null } });
const LIST = '901200000001';
const API = 'https://api.clickup.com/api/v2';

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
      const p = u.replace(API, '');
      const mk = p.match(/^\/list\/(\d+)\/task$/);
      if (method === 'POST' && mk) { const id = '86c' + (100 + (++seq)); tasks[id] = { id, name: body.name, status: { type: 'open' }, date_closed: null, archived: false, url: 'https://app.clickup.com/t/' + id, list: { id: mk[1] } }; return res(200, tasks[id]); }
      const m = p.match(/^\/task\/([A-Za-z0-9]+)$/);
      if (m && method === 'GET') return tasks[m[1]] ? res(200, tasks[m[1]]) : res(404, {});
      if (m && method === 'DELETE') { delete tasks[m[1]]; return res(204, undefined); }
      if (method === 'GET' && p === '/list/' + LIST) return res(200, { id: LIST, name: 'Ops' });
      if (method === 'GET' && p.indexOf('/list/' + LIST + '/task?') === 0) return res(200, { tasks: Object.values(tasks), last_page: true });
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
const CONNECTED = { clickupAuth: { token: 'cu_tok', refreshToken: null, listId: LIST, listName: 'Ops' } };
const PAYLOAD = { label: 'Send Dana the signed contract', facts: {}, messageId: 'm-1', threadUrl: 'https://mail.google.com/x' };
const ON = [['clickupReadBack: false', 'clickupReadBack: true']];
const OAUTH = [['clickupOAuth: false', 'clickupOAuth: true'], ["clickupClientId: 'REPLACE_WITH_CLICKUP_CLIENT_ID'", "clickupClientId: 'cid-public'"]];
const REDIRECT = 'https://dnjhplgmnkabbjogfpbhofjedlkehkai.chromiumapp.org/';
const LINK = 'https://app.clickup.com/9000001/v/li/' + LIST;

(async () => {
  console.log('\n--- switches default off, nothing registered ---\n');
  {
    const env = load({ stored: CONNECTED });
    const C = env.fn('CONNECTORS');
    check('shipped config: clickup switches are false', C.clickupReadBack === false && C.clickupOAuth === false, C);
    check('off: no clickup writer or undoer exists', env.fn('WRITERS').clickup === undefined && env.fn('UNDOERS').clickup === undefined);
    let threw = ''; try { await env.fn('connectClickUpOAuth')(LINK); } catch (e) { threw = e.message; }
    check('off: Sign in with ClickUp refuses and calls nothing', /not switched on/.test(threw) && env.calls.length === 0, threw);
    const st = await env.fn('connectorStatus')();
    check('off: the popup status says connected but not configured (no connect button works)', st.clickup.configured === false, st.clickup);
    check('off: nothing stored', env.stored.connectorOutcomes === undefined && env.stored.clickupLedger === undefined);
    const noEmit = await env.fn('noteConnectorOutcome')('approved', 0, { connector: 'clickup' });
    check('off: the learning hook emits nothing', noEmit === undefined && env.stored.connectorOutcomes === undefined);
  }
  console.log('\n--- clickupReadBack on ---\n');
  {
    const env = load({ stored: CONNECTED, patch: ON });
    check('on: writer and undoer registered under "clickup"', env.fn('WRITERS').clickup === env.fn('clickupReadBackWrite') && env.fn('UNDOERS').clickup === env.fn('clickupReadBackUndo'));
    check('on: Asana and Notion stay unregistered (their own switches are off)', env.fn('WRITERS').asana === undefined && env.fn('WRITERS').notion !== env.fn('clickupReadBackWrite'));
    const out = await env.fn('WRITERS').clickup(PAYLOAD);
    check('on: Handled with a read-back proof of clickup/task', out.ok === true && out.proof && out.proof.system === 'clickup/task' && out.proof.fetchedBack === true, out);
    check('on: FlowProofOfClose accepts it', env.fn('FlowProofOfClose').isProof(out.proof));
    check('on: the call carries the bearer token and goes only to api.clickup.com', env.calls.every((c) => c.url.indexOf(API) === 0 && c.auth === 'Bearer cu_tok'), env.calls.map((c) => c.url));
    const again = await env.fn('WRITERS').clickup(PAYLOAD);
    check('on: a second click creates no second task', Object.keys(env.tasks).length === 1 && again.ok === true, Object.keys(env.tasks));
    const ev = env.stored.connectorOutcomes || []; const dump = JSON.stringify(ev);
    check('on: events emitted for clickup (approved, handled), no text', ev.every((e) => e.connector === 'clickup' && e.destinationSystem === 'clickup/task') && ev.some((e) => e.stage === 'approved') && ev.some((e) => e.stage === 'handled') && !/Dana|contract|mail\.google|cu_tok/.test(dump), dump);
    const un = await env.fn('UNDOERS').clickup(out.ref);
    check('on: Undo deletes and reads back', un.ok === true && un.readBack === true && Object.keys(env.tasks).length === 0, un);
    check('on: Undo is an event too', (env.stored.connectorOutcomes || []).some((e) => e.stage === 'undone' && e.connector === 'clickup'));
    const st = await env.fn('connectorStatus')();
    check('on: status shows connected with the List name', st.clickup.connected === true && st.clickup.detail === 'Ops', st.clickup);
    await env.fn('disconnectConnector')('clickup');
    check('Disconnect removes the token and the ledger', env.stored.clickupAuth === undefined && env.stored.clickupLedger === undefined, Object.keys(env.stored));
  }
  {
    const env = load({ stored: CONNECTED, patch: ON });
    const n0 = env.calls.length; await env.fn('disconnectConnector')('clickup');
    const evBefore = (env.stored.connectorOutcomes || []).length;
    const out = await env.fn('WRITERS').clickup(PAYLOAD);
    check('Disconnect then Do It: ok false, zero requests, zero events', out.ok === false && out.reason === 'not-connected' && env.calls.length === n0 && (env.stored.connectorOutcomes || []).length === evBefore, out);
  }
  {
    const env = load({ stored: CONNECTED, patch: ON });
    const sb = env.sandbox; const real = sb.fetch;
    sb.fetch = async (url, init) => { if ((init && init.method) === 'GET' && /\/task\/[A-Za-z0-9]+$/.test(String(url))) return res(500, {}); return real(url, init); };
    const out = await env.fn('WRITERS').clickup(PAYLOAD);
    check('read-back 500: ok false, no proof, verify_failed', out.ok === false && out.proof === null && out.reason === 'verify_failed', out);
    check('read-back 500: readback_failed event, no handled event', (env.stored.connectorOutcomes || []).some((e) => e.stage === 'readback_failed') && !(env.stored.connectorOutcomes || []).some((e) => e.stage === 'handled'));
    check('read-back 500: one task exists, none duplicated', Object.keys(env.tasks).length === 1);
  }
  {
    const env = load({ stored: CONNECTED, patch: ON.concat([['notionReadBack: false', 'notionReadBack: true'], ['asanaReadBack: false', 'asanaReadBack: true']]) });
    check('all three connectors on: each has its own writer and undoer', env.fn('WRITERS').clickup === env.fn('clickupReadBackWrite') && env.fn('WRITERS').asana === env.fn('asanaReadBackWrite') && env.fn('WRITERS').notion === env.fn('notionReadBackWrite') && env.fn('UNDOERS').clickup === env.fn('clickupReadBackUndo'));
  }
  {
    const env = load({ stored: CONNECTED, patch: [['asanaReadBack: false', 'asanaReadBack: true']] });
    await env.fn('noteConnectorOutcome')('approved', 0, { connector: 'asana' });
    await env.fn('noteConnectorOutcome')('approved', 0, { connector: 'clickup' });
    check('the ClickUp switch does not leak: with only asana on, a clickup event is not recorded', (env.stored.connectorOutcomes || []).every((e) => e.connector === 'asana') && (env.stored.connectorOutcomes || []).length === 1, env.stored.connectorOutcomes);
  }
  console.log('\n--- clickupOAuth on ---\n');
  {
    const env = load({ patch: OAUTH, relay: () => res(200, { access_token: 'oauth_tok' }),
      authResult: (u) => REDIRECT + '?code=CODE1&state=' + new URL(u).searchParams.get('state') });
    const r = await env.fn('connectClickUpOAuth')(LINK);
    const auth = env.calls.find((c) => c.method === 'AUTH'); const relay = env.calls.find((c) => c.url.indexOf('token-relay') >= 0);
    const q = new URL(auth.url).searchParams;
    check('oauth: authorize URL is ClickUp\'s, has the public client id, a state, no secret, no PKCE', auth.url.indexOf('https://app.clickup.com/api?') === 0 && q.get('client_id') === 'cid-public' && /^[0-9a-f]{32}$/.test(q.get('state')) && !q.get('code_challenge') && !/secret/i.test(auth.url), auth.url);
    check('oauth: relay body is exactly vendor, grant, code, redirect, install id (no verifier, no secret)', relay.body.vendor === 'clickup' && relay.body.grant === 'code' && relay.body.code === 'CODE1' && Object.keys(relay.body).sort().join() === 'code,grant,install_id,redirect_uri,vendor', relay.body);
    check('oauth: token stored on device with no refresh token; List verified with it', env.stored.clickupAuth.token === 'oauth_tok' && env.stored.clickupAuth.refreshToken === null && env.stored.clickupAuth.listId === LIST && r.title === 'Ops' && env.calls.some((c) => c.url === API + '/list/' + LIST && c.auth === 'Bearer oauth_tok'), env.stored.clickupAuth);
    const st = await env.fn('connectorStatus')();
    check('oauth: popup status is configured and connected', st.clickup.configured === true && st.clickup.connected === true && st.clickup.detail === 'Ops', st.clickup);
  }
  {
    const env = load({ patch: OAUTH, relay: () => res(200, { access_token: 't' }), authResult: () => REDIRECT + '?code=C&state=forged' });
    let threw = ''; try { await env.fn('connectClickUpOAuth')(LIST); } catch (e) { threw = e.message; }
    check('oauth: forged state refused before the relay', /could not be verified/.test(threw) && !env.calls.some((c) => c.url.indexOf('token-relay') >= 0), threw);
  }
  {
    const env = load({ patch: [['clickupOAuth: false', 'clickupOAuth: true']] });
    let threw = ''; try { await env.fn('connectClickUpOAuth')(LIST); } catch (e) { threw = e.message; }
    check('oauth: no client id -> says so, asks nothing', /isn’t configured/.test(threw) && !env.calls.some((c) => c.method === 'AUTH'), threw);
  }
  {
    const env = load({ patch: OAUTH, relay: () => res(502, { error: 'vendor_rejected' }), authResult: (u) => REDIRECT + '?code=C&state=' + new URL(u).searchParams.get('state') });
    let threw = ''; try { await env.fn('connectClickUpOAuth')(LIST); } catch (e) { threw = e.message; }
    check('oauth: relay refusing the code stores nothing', /vendor_rejected/.test(threw) && env.stored.clickupAuth === undefined, threw);
    let t2 = ''; try { await env.fn('connectClickUpOAuth')('not a list'); } catch (e) { t2 = e.message; }
    check('oauth: a non-List link is refused before any sign-in', /List link/.test(t2));
  }
  {
    const env = load({ patch: OAUTH, relay: () => res(200, { access_token: 'oauth_tok' }), authResult: (u) => REDIRECT + '?code=C&state=' + new URL(u).searchParams.get('state') });
    const real = env.sandbox.fetch;
    env.sandbox.fetch = async (url, init) => (String(url) === API + '/list/' + LIST ? res(401, { err: 'Team not authorized', ECODE: 'OAUTH_027' }) : real(url, init));
    let threw = ''; try { await env.fn('connectClickUpOAuth')(LIST); } catch (e) { threw = e.message; }
    check('oauth: a List outside the authorised Workspaces is explained and nothing is stored', /cannot open that List/.test(threw) && env.stored.clickupAuth === undefined, threw);
  }
  {
    const env = load({});
    const f = env.fn('parseClickUpListId');
    check('List link parsing', f(LINK) === LIST && f(LINK + '/?pr=1') === LIST && f('https://app.clickup.com/9000001/v/li/' + LIST + '?pr=170') === LIST && f(LIST) === LIST && f('https://app.clickup.com/9000001/v/l/li/' + LIST) === LIST && f('https://evil.example/9000001/v/li/' + LIST) === null && f('https://app.clickup.com.evil.example/9/v/li/' + LIST) === null && f('12/../x') === null && f('https://app.clickup.com/t/86abc') === null);
  }
  console.log('\nTOTAL FAILURES: ' + failures);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
