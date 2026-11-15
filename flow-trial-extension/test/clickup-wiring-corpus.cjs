// Wiring of the ClickUp connector inside background.js: both switches default off and register nothing; with clickupReadBack on the writer returns a ProofOfClose, Undo ARCHIVES and reads
// back (never deletes, refuses a changed task), the learning event has no text, Disconnect forgets the ledger; with clickupOAuth on the state is checked, the token comes from the relay
// (the secret never reaches the device), the list is verified with the token, and the token stays on the device.
const vm = require('vm');
const { webcrypto } = require('crypto');
const { backgroundScript } = require('./load-background.cjs');

let failures = 0;
function check(name, cond, detail) { if (cond) console.log('PASS:', name); else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); } }
const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body), headers: { get: () => null } });
const LIST = '901234567';
const REDIRECT = 'https://dnjhplgmnkabbjogfpbhofjedlkehkai.chromiumapp.org/';

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
      const p = u.replace('https://api.clickup.com/api/v2', '');
      if (!init || !init.headers || init.headers.Authorization !== (o.token || 'pk_clickup_tok')) return res(401, { err: 'Token invalid' });
      if (method === 'POST' && p === '/list/' + LIST + '/task') { const id = '86a' + String(++seq).padStart(5, '0'); tasks[id] = { id, name: body.name, text_content: '', archived: false, date_closed: null, date_created: String(Date.now()), due_date: body.due_date ? String(body.due_date) : null, status: { status: 'to do', type: 'open' }, list: { id: LIST }, url: 'https://app.clickup.com/t/' + id }; return res(200, tasks[id]); }
      const m = p.match(/^\/task\/([A-Za-z0-9]+)/);
      if (m && method === 'GET') return tasks[m[1]] ? res(200, tasks[m[1]]) : res(404, {});
      if (m && method === 'PUT') { if (!tasks[m[1]]) return res(404, {}); Object.assign(tasks[m[1]], body); return res(200, tasks[m[1]]); }
      if (method === 'GET' && p === '/list/' + LIST) return o.list === 'forbidden' ? res(403, {}) : res(200, { id: LIST, name: 'Ops list' });
      if (method === 'GET' && p.indexOf('/list/' + LIST + '/task') === 0) return res(200, { tasks: Object.values(tasks) });
      return res(500, { error: 'unrouted ' + method + ' ' + u });
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
  return { calls, stored, tasks, sandbox, fn: (n) => vm.runInContext(n, sandbox) };
}
const CONNECTED = { clickupAuth: { token: 'pk_clickup_tok', listId: LIST, listName: 'Ops list' } };
const PAYLOAD = { label: 'Send Dana the signed contract', facts: {}, messageId: 'm-1', threadUrl: 'https://mail.google.com/x' };
const ON = [['clickupReadBack: false', 'clickupReadBack: true']];
const OAUTH = [['clickupOAuth: false', 'clickupOAuth: true'], ["clickupClientId: 'REPLACE_WITH_CLICKUP_CLIENT_ID'", "clickupClientId: 'cid-public'"]];
const goodAuth = (u) => REDIRECT + '?code=CODE1&state=' + new URL(u).searchParams.get('state');
const cu = (env) => env.calls.filter((c) => /clickup\.com/.test(c.url));

(async () => {
  console.log('\n--- switches default off, nothing registered ---\n');
  {
    const env = load({ stored: CONNECTED });
    const C = env.fn('CONNECTORS');
    check('shipped config: clickup switches are false', C.clickupReadBack === false && C.clickupOAuth === false, C);
    check('off: no clickup writer or undoer exists', env.fn('WRITERS').clickup === undefined && env.fn('UNDOERS').clickup === undefined);
    let threw = ''; try { await env.fn('connectClickupOAuth')('https://app.clickup.com/1/v/li/' + LIST); } catch (e) { threw = e.message; }
    check('off: Sign in with ClickUp refuses and calls nothing', /not switched on/.test(threw) && env.calls.length === 0, threw);
    check('off: nothing stored', env.stored.connectorOutcomes === undefined && env.stored.clickupLedger === undefined);
  }
  console.log('\n--- clickupReadBack on ---\n');
  {
    const env = load({ stored: CONNECTED, patch: ON });
    check('on: writer and undoer registered under "clickup"', env.fn('WRITERS').clickup === env.fn('clickupReadBackWrite') && env.fn('UNDOERS').clickup === env.fn('clickupReadBackUndo'));
    const out = await env.fn('WRITERS').clickup(PAYLOAD);
    check('on: Handled with a read-back proof of clickup/task', out.ok === true && out.proof && out.proof.system === 'clickup/task' && out.proof.fetchedBack === true, out);
    check('on: FlowProofOfClose accepts it', env.fn('FlowProofOfClose').isProof(out.proof));
    check('on: the token is the bare Authorization value, never in a URL; only task endpoints of the one list; no DELETE', cu(env).every((c) => c.auth === 'pk_clickup_tok' && c.url.indexOf('pk_clickup') < 0 && c.method !== 'DELETE' && /\/api\/v2\/(list\/\d+\/task|task\/)/.test(c.url)), cu(env).map((c) => c.method + c.url));
    const again = await env.fn('WRITERS').clickup(PAYLOAD);
    check('on: a second click creates no second task', Object.keys(env.tasks).length === 1 && again.ok === true, Object.keys(env.tasks));
    const ev = env.stored.connectorOutcomes || []; const dump = JSON.stringify(ev);
    check('on: events emitted for clickup (approved, handled), no text', ev.every((e) => e.connector === 'clickup') && ev.some((e) => e.stage === 'approved') && ev.some((e) => e.stage === 'handled') && !/Dana|contract|mail\.google|pk_clickup/.test(dump), dump);
    const un = await env.fn('UNDOERS').clickup(out.ref);
    check('on: Undo ARCHIVES and reads back (the task still exists, archived)', un.ok === true && un.readBack === true && Object.values(env.tasks)[0].archived === true, un);
    check('on: Undo is an event too', (env.stored.connectorOutcomes || []).some((e) => e.stage === 'undone' && e.connector === 'clickup'));
    await env.fn('disconnectConnector')('clickup');
    check('Disconnect removes the token and the ledger', env.stored.clickupAuth === undefined && env.stored.clickupLedger === undefined, Object.keys(env.stored));
  }
  {
    const env = load({ stored: CONNECTED, patch: ON });
    const out = await env.fn('WRITERS').clickup(PAYLOAD); Object.values(env.tasks)[0].text_content = 'my own notes';
    const un = await env.fn('UNDOERS').clickup(out.ref);
    check('on: Undo refuses a task the person changed and archives nothing', un.ok === false && un.reason === 'edited-by-person' && Object.values(env.tasks)[0].archived === false && !env.calls.some((c) => c.method === 'PUT'), un);
  }
  {
    const env = load({ stored: CONNECTED, patch: ON });
    const sb = env.sandbox; const real = sb.fetch;
    sb.fetch = async (url, init) => { if ((init && init.method) === 'GET' && /\/task\/[A-Za-z0-9]+$/.test(String(url))) return res(500, {}); return real(url, init); };
    const out = await env.fn('WRITERS').clickup(PAYLOAD);
    check('read-back 500: ok false, no proof, verify_failed', out.ok === false && out.proof === null && out.reason === 'verify_failed', out);
    check('read-back 500: readback_failed event, no handled event, one task exists', (env.stored.connectorOutcomes || []).some((e) => e.stage === 'readback_failed') && !(env.stored.connectorOutcomes || []).some((e) => e.stage === 'handled') && Object.keys(env.tasks).length === 1);
  }
  {
    const env = load({ stored: CONNECTED, patch: ON.concat([['asanaReadBack: false', 'asanaReadBack: true']]) });
    check('clickup and asana on together: each has its own writer', env.fn('WRITERS').clickup === env.fn('clickupReadBackWrite') && env.fn('WRITERS').asana === env.fn('asanaReadBackWrite'));
  }
  console.log('\n--- clickupOAuth on ---\n');
  {
    const env = load({ patch: OAUTH, relay: () => res(200, { access_token: 'pk_clickup_tok', token_type: 'Bearer' }), authResult: goodAuth });
    const r = await env.fn('connectClickupOAuth')('https://app.clickup.com/9001/v/li/' + LIST);
    const auth = env.calls.find((c) => c.method === 'AUTH'); const relay = env.calls.find((c) => c.url.indexOf('token-relay') >= 0); const q = new URL(auth.url).searchParams;
    check('oauth: authorize URL has the public client id and a state; no secret, no PKCE', new URL(auth.url).origin + new URL(auth.url).pathname === 'https://app.clickup.com/api' && q.get('client_id') === 'cid-public' && /^[0-9a-f]{32}$/.test(q.get('state')) && !q.get('code_challenge') && !/secret/i.test(auth.url), auth.url);
    check('oauth: relay body is exactly vendor, grant, code, redirect, install id', relay.body.vendor === 'clickup' && relay.body.grant === 'code' && relay.body.code === 'CODE1' && Object.keys(relay.body).sort().join() === 'code,grant,install_id,redirect_uri,vendor', relay.body);
    check('oauth: token stored on the device with the list verified by name', env.stored.clickupAuth.token === 'pk_clickup_tok' && env.stored.clickupAuth.listId === LIST && r.title === 'Ops list' && env.calls.some((c) => /\/list\/\d+$/.test(c.url) && c.auth === 'pk_clickup_tok'), env.stored.clickupAuth);
  }
  {
    const env = load({ patch: OAUTH, relay: () => res(200, { access_token: 't' }), authResult: () => REDIRECT + '?code=C&state=forged' });
    let threw = ''; try { await env.fn('connectClickupOAuth')(LIST); } catch (e) { threw = e.message; }
    check('oauth: forged state refused before the relay', /could not be verified/.test(threw) && !env.calls.some((c) => c.url.indexOf('token-relay') >= 0), threw);
    const env2 = load({ patch: [['clickupOAuth: false', 'clickupOAuth: true']] });
    let t2 = ''; try { await env2.fn('connectClickupOAuth')(LIST); } catch (e) { t2 = e.message; }
    check('oauth: no client id -> says so, asks nothing', /isn’t configured/.test(t2) && !env2.calls.some((c) => c.method === 'AUTH'), t2);
    const env3 = load({ patch: OAUTH, relay: () => res(502, { error: 'invalid_grant' }), authResult: goodAuth });
    let t3 = ''; try { await env3.fn('connectClickupOAuth')(LIST); } catch (e) { t3 = e.message; }
    check('oauth: relay refusing the code stores nothing', /invalid_grant/.test(t3) && env3.stored.clickupAuth === undefined, t3);
    const env4 = load({ patch: OAUTH, relay: () => res(200, { access_token: 'pk_clickup_tok' }), authResult: goodAuth, list: 'forbidden' });
    let t4 = ''; try { await env4.fn('connectClickupOAuth')(LIST); } catch (e) { t4 = e.message; }
    check('oauth: a list the person cannot open stores nothing', /cannot open that list/.test(t4) && env4.stored.clickupAuth === undefined, t4);
    let t5 = ''; try { await env3.fn('connectClickupOAuth')('not a list'); } catch (e) { t5 = e.message; }
    check('oauth: a non-list link is refused before any sign-in', /list link/.test(t5));
  }
  {
    const f = load({}).fn('parseClickupList');
    check('list link parsing', f('https://app.clickup.com/9001234/v/li/901234567') === '901234567' && f('https://app.clickup.com/9001234/v/l/6-901234567-1') === null && f('901234567') === '901234567' && f('https://evil.example/v/li/901234567') === null && f('12') === null && f('') === null && f(null) === null);
  }
  console.log('\nTOTAL FAILURES: ' + failures);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
