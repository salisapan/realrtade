// Wiring of the Dropbox connector inside background.js: both switches default off and call nothing; with dropboxReadBack on a file is saved and read back
// (id, size, content hash), the learning event carries no name or content, Undo removes it unless the person edited it, Disconnect revokes (best effort),
// removes the token and the ledger; with dropboxOAuth on the PKCE challenge matches the verifier sent straight to Dropbox (no relay, no secret).
const vm = require('vm');
const crypto = require('crypto');
const { webcrypto } = crypto;
const { backgroundScript } = require('./load-background.cjs');

let failures = 0;
function check(name, cond, detail) { if (cond) console.log('PASS:', name); else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); } }
const res = (status, body, headers) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body), headers: { get: (k) => (headers && headers[k.toLowerCase()]) || null } });
const REDIRECT = 'https://dnjhplgmnkabbjogfpbhofjedlkehkai.chromiumapp.org/';
const dbxHash = (buf) => crypto.createHash('sha256').update(crypto.createHash('sha256').update(buf).digest()).digest('hex');

function load(opts) {
  const o = opts || {};
  const calls = []; const listeners = []; const stored = JSON.parse(JSON.stringify(o.stored || {})); const files = {}; let seq = 0;
  const out = (f) => ({ '.tag': 'file', name: f.name, id: f.id, size: f.bytes.length, content_hash: dbxHash(f.bytes) });
  const sandbox = {
    console, setTimeout, clearTimeout, URL, URLSearchParams, crypto: webcrypto, TextEncoder, Uint8Array,
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'), atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    fetch: async (url, init) => {
      const u = String(url); const method = (init && init.method) || 'GET';
      calls.push({ method, url: u, headers: init && init.headers, body: init && init.body });
      if (u.indexOf('token-relay') >= 0) return res(500, { error: 'the relay must not be used for Dropbox' });
      if (u === 'https://api.dropboxapi.com/oauth2/token') { const f = new URLSearchParams(init.body); return o.token ? o.token(f) : res(200, { access_token: 'oauth_tok', refresh_token: 'oauth_ref', token_type: 'bearer' }); }
      if (u === 'https://api.dropboxapi.com/2/auth/token/revoke') return res(200, {});
      if (u === 'https://content.dropboxapi.com/2/files/upload') { const arg = JSON.parse(init.headers['Dropbox-API-Arg']); const k = arg.path.toLowerCase(); if (files[k]) return res(409, { error_summary: 'path/conflict/file/.' }); files[k] = { key: k, name: arg.path.slice(1), id: 'id:file' + (++seq) + 'abcdef', bytes: Buffer.from(init.body) }; return res(200, out(files[k])); }
      const find = (p) => (/^id:/.test(p) ? Object.values(files).find((f) => f.id === p) : files[p.toLowerCase()]);
      if (u === 'https://api.dropboxapi.com/2/files/get_metadata') { const f = find(JSON.parse(init.body).path); return f ? res(200, out(f)) : res(409, { error_summary: 'path/not_found/.' }); }
      if (u === 'https://api.dropboxapi.com/2/files/delete_v2') { const f = find(JSON.parse(init.body).path); if (!f) return res(409, { error_summary: 'path_lookup/not_found/.' }); delete files[f.key]; return res(200, { metadata: out(f) }); }
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
  return { calls, stored, files, sandbox, send, fn: (n) => vm.runInContext(n, sandbox) };
}
const CONNECTED = { dropboxAuth: { token: 'dbx_tok', refreshToken: 'dbx_ref' } };
const ON = [['dropboxReadBack: false', 'dropboxReadBack: true']];
const OAUTH = [['dropboxOAuth: false', 'dropboxOAuth: true'], ["dropboxAppKey: 'fxsss86nh3anm2i'", "dropboxAppKey: 'app-key'"]];
const goodAuth = (u) => REDIRECT + '?code=CODE1&state=' + new URL(u).searchParams.get('state');
const dbx = (env) => env.calls.filter((c) => /dropboxapi\.com|dropbox\.com|token-relay/.test(c.url) || c.method === 'AUTH');
const b64 = (s) => Buffer.from(s).toString('base64');
const SAVE = (over) => ({ type: 'flow:dropbox-save', payload: Object.assign({ key: 'loop-1', name: 'Contract-signed.pdf', base64: b64('the signed contract bytes') }, over || {}) });

(async () => {
  console.log('\n--- switches default off: nothing is called ---\n');
  {
    const env = load({ stored: CONNECTED });
    check('shipped config: both dropbox switches are false', env.fn('CONNECTORS').dropboxReadBack === false && env.fn('CONNECTORS').dropboxOAuth === false);
    const r = await env.send(SAVE());
    check('off: save answers connector-not-live and calls nothing', r.ok === false && r.reason === 'connector-not-live' && dbx(env).length === 0, r);
    check('off: undo answers connector-not-live', (await env.send({ type: 'flow:dropbox-undo', payload: { ref: { fileId: 'id:abcdef12345' } } })).reason === 'connector-not-live');
    let threw = ''; try { await env.fn('connectDropboxOAuth')(); } catch (e) { threw = e.message; }
    check('off: Sign in with Dropbox refuses and calls nothing', /not switched on/.test(threw) && dbx(env).length === 0, threw);
    check('off: nothing stored', env.stored.connectorOutcomes === undefined && env.stored.dropboxLedger === undefined);
  }
  console.log('\n--- dropboxReadBack on ---\n');
  {
    const env = load({ stored: CONNECTED, patch: ON });
    const r = await env.send(SAVE());
    check('on: saved and read back, with a proof of dropbox/file', r.ok === true && r.proof && r.proof.system === 'dropbox/file' && r.proof.fetchedBack === true && /^id:file1/.test(r.proof.externalId), r);
    check('on: FlowProofOfClose accepts it', env.fn('FlowProofOfClose').isProof(r.proof));
    check('on: one upload (add, no autorename) then one metadata read, bytes exact, bearer token', dbx(env).length === 2 && dbx(env)[0].url.endsWith('/files/upload') && JSON.parse(dbx(env)[0].headers['Dropbox-API-Arg']).autorename === false && Buffer.from(dbx(env)[0].body).toString() === 'the signed contract bytes' && dbx(env)[1].url.endsWith('/files/get_metadata') && dbx(env)[0].headers.Authorization === 'Bearer dbx_tok', dbx(env).map((c) => c.url));
    const again = await env.send(SAVE());
    check('on: a second click uploads nothing more', again.ok === true && Object.keys(env.files).length === 1 && env.calls.filter((c) => c.url.endsWith('/upload')).length === 1);
    const ev = env.stored.connectorOutcomes || []; const dump = JSON.stringify(ev);
    check('on: events for dropbox (approved, handled), closeType file, no name, id or content', ev.every((e) => e.connector === 'dropbox' && e.closeType === 'file' && e.destinationSystem === 'dropbox/file') && ev.some((e) => e.stage === 'handled') && !/Contract|signed|id:file|dbx_tok/.test(dump), dump);
    const un = await env.send({ type: 'flow:dropbox-undo', payload: { ref: r.ref } });
    check('on: Undo deletes and reads back', un.ok === true && un.readBack === true && Object.keys(env.files).length === 0, un);
    check('on: Undo is an event too', (env.stored.connectorOutcomes || []).some((e) => e.stage === 'undone' && e.closeType === 'file'));
    check('a foreign sender is refused', (await env.send(SAVE(), { id: 'someone-else' })).reason === 'foreign-sender');
    await env.fn('disconnectConnector')('dropbox');
    check('Disconnect revokes (best effort), removes the token and the ledger', env.calls.some((c) => c.url === 'https://api.dropboxapi.com/2/auth/token/revoke') && env.stored.dropboxAuth === undefined && env.stored.dropboxLedger === undefined, Object.keys(env.stored));
  }
  {
    const env = load({ stored: CONNECTED, patch: ON });
    const r = await env.send(SAVE()); Object.values(env.files)[0].bytes = Buffer.from('I changed this');
    const un = await env.send({ type: 'flow:dropbox-undo', payload: { ref: r.ref } });
    check('on: Undo refuses a file the person edited and deletes nothing', un.ok === false && un.reason === 'edited-by-person' && Object.keys(env.files).length === 1 && !env.calls.some((c) => c.url.endsWith('delete_v2')), un);
  }
  {
    const env = load({ stored: CONNECTED, patch: ON });
    for (const bad of [{ base64: '' }, { base64: '%%%not base64%%%' }, { name: '///' }, { key: '' }]) check('on: bad input ' + JSON.stringify(Object.keys(bad)) + ' is refused before any call', (await env.send(SAVE(bad))).ok === false && dbx(env).length === 0);
    const huge = 'A'.repeat(Math.ceil(20 * 1024 * 1024 * 4 / 3) + 100);
    const t = await env.send(SAVE({ base64: huge })); check('on: a file over the cap is refused before it is decoded or sent', t.ok === false && t.reason === 'too-large' && dbx(env).length === 0, t);
  }
  {
    const env = load({ stored: CONNECTED, patch: ON });
    const sb = env.sandbox; const real = sb.fetch; sb.fetch = async (u, i) => (String(u).endsWith('/files/get_metadata') ? res(500, {}) : real(u, i));
    const r = await env.send(SAVE());
    check('read-back 500: not ok, no proof, a readback_failed event and no handled event, one file exists', r.ok === false && r.proof === null && (env.stored.connectorOutcomes || []).some((e) => e.stage === 'readback_failed') && !(env.stored.connectorOutcomes || []).some((e) => e.stage === 'handled') && Object.keys(env.files).length === 1, r);
  }
  console.log('\n--- dropboxOAuth on ---\n');
  {
    const env = load({ patch: OAUTH, authResult: goodAuth });
    const r = await env.fn('connectDropboxOAuth')();
    const auth = env.calls.find((c) => c.method === 'AUTH'); const tok = env.calls.find((c) => c.url === 'https://api.dropboxapi.com/oauth2/token'); const q = new URL(auth.url);
    const form = new URLSearchParams(tok.body);
    check('oauth: authorize URL has the app key, offline access, the two file scopes, S256 PKCE, a state; no secret', q.origin + q.pathname === 'https://www.dropbox.com/oauth2/authorize' && q.searchParams.get('client_id') === 'app-key' && q.searchParams.get('token_access_type') === 'offline' && q.searchParams.get('scope') === 'files.content.write files.metadata.read' && q.searchParams.get('code_challenge_method') === 'S256' && /^[0-9a-f]{32}$/.test(q.searchParams.get('state')) && !/secret/i.test(auth.url), auth.url);
    check('oauth: the verifier sent to Dropbox hashes to the challenge', crypto.createHash('sha256').update(form.get('code_verifier')).digest('base64url') === q.searchParams.get('code_challenge'));
    check('oauth: the token request goes straight to Dropbox with no secret; nothing goes to the relay', form.get('grant_type') === 'authorization_code' && form.get('code') === 'CODE1' && form.get('client_id') === 'app-key' && !form.has('client_secret') && !env.calls.some((c) => c.url.indexOf('token-relay') >= 0));
    check('oauth: token and refresh token stored on the device', env.stored.dropboxAuth.token === 'oauth_tok' && env.stored.dropboxAuth.refreshToken === 'oauth_ref' && r.title === 'Dropbox');
  }
  {
    const env = load({ patch: OAUTH, authResult: () => REDIRECT + '?code=C&state=forged' });
    let threw = ''; try { await env.fn('connectDropboxOAuth')(); } catch (e) { threw = e.message; }
    check('oauth: forged state refused before any token request', /could not be verified/.test(threw) && !env.calls.some((c) => c.url.indexOf('oauth2/token') >= 0), threw);
  }
  {
    const env = load({ patch: [['dropboxOAuth: false', 'dropboxOAuth: true']] });
    let threw = ''; try { await env.fn('connectDropboxOAuth')(); } catch (e) { threw = e.message; }
    check('oauth: no app key -> says so, asks nothing', /isn’t configured/.test(threw) && !env.calls.some((c) => c.method === 'AUTH'), threw);
  }
  {
    const env = load({ patch: OAUTH, authResult: goodAuth, token: () => res(400, { error: 'invalid_grant' }) });
    let threw = ''; try { await env.fn('connectDropboxOAuth')(); } catch (e) { threw = e.message; }
    check('oauth: Dropbox refusing the code stores nothing', /invalid_grant/.test(threw) && env.stored.dropboxAuth === undefined, threw);
  }
  console.log('\nTOTAL FAILURES: ' + failures);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
