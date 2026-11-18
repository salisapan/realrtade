// Wiring of the Box connector inside background.js: both switches default off and call nothing; with boxReadBack on a file is saved and read back
// (id, size, content hash), the learning event carries no name or content, Undo removes it unless the person edited it, Disconnect revokes (best effort),
// removes the token and the ledger; with boxOAuth on the PKCE challenge matches the verifier sent straight to Box (no relay, no secret).
const vm = require('vm');
const crypto = require('crypto');
const { webcrypto } = crypto;
const { backgroundScript } = require('./load-background.cjs');

let failures = 0;
function check(name, cond, detail) { if (cond) console.log('PASS:', name); else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); } }
const res = (status, body, headers) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body), headers: { get: (k) => (headers && headers[k.toLowerCase()]) || null } });
const REDIRECT = 'https://dnjhplgmnkabbjogfpbhofjedlkehkai.chromiumapp.org/';
const sha1hex = (buf) => crypto.createHash('sha1').update(buf).digest('hex');
const FOLDER = '240000000001';

function load(opts) {
  const o = opts || {};
  const calls = []; const listeners = []; const stored = JSON.parse(JSON.stringify(o.stored || {})); const files = {}; let seq = 0;
  const out = (f) => ({ type: 'file', id: f.id, name: f.name, size: f.bytes.length, sha1: sha1hex(f.bytes), parent: { id: f.parent }, item_status: f.status || 'active' });
  const sandbox = {
    console, setTimeout, clearTimeout, URL, URLSearchParams, crypto: webcrypto, TextEncoder, Uint8Array,
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'), atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    fetch: async (url, init) => {
      const u = String(url); const method = (init && init.method) || 'GET';
      calls.push({ method, url: u, headers: init && init.headers, body: init && init.body });
      if (u.indexOf('token-relay') >= 0) { const b = JSON.parse(init.body); return o.relay ? o.relay(b) : res(200, { access_token: 'oauth_tok', refresh_token: 'oauth_ref', token_type: 'bearer' }); }
      if (u === 'https://upload.box.com/api/2.0/files/content') {
        const buf = Buffer.from(init.body); const bnd = '--' + /boundary=(.+)$/.exec(init.headers['Content-Type'])[1];
        const parts = buf.toString('latin1').split(bnd); const attrs = JSON.parse(parts[1].split('\r\n\r\n')[1].replace(/\r\n$/, ''));
        const start = buf.indexOf(Buffer.from('\r\n\r\n', 'latin1'), buf.indexOf(Buffer.from('name="file"'))) + 4; const end = buf.lastIndexOf(Buffer.from('\r\n' + bnd + '--'));
        if (Object.values(files).some((f) => f.parent === attrs.parent.id && f.name === attrs.name && f.status !== 'trashed')) return res(409, { code: 'item_name_in_use' });
        const id = String(1300000000000 + (++seq)); files[id] = { id, name: attrs.name, parent: attrs.parent.id, bytes: buf.slice(start, end), status: 'active' };
        return res(201, { total_count: 1, entries: [out(files[id])] });
      }
      let m = u.match(/^https:\/\/api\.box\.com\/2\.0\/files\/(\d+)/);
      if (m && method === 'GET') { const f = files[m[1]]; return f && f.status !== 'deleted' ? res(200, out(f)) : res(404, {}); }
      if (m && method === 'DELETE') { const f = files[m[1]]; if (!f) return res(404, {}); f.status = 'trashed'; return res(204, undefined); }
      m = u.match(/^https:\/\/api\.box\.com\/2\.0\/folders\/(\d+)\?/);
      if (m) return o.folder ? o.folder(m[1]) : res(200, { id: m[1], name: 'Signed contracts' });
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
const CONNECTED = { boxAuth: { token: 'box_tok', refreshToken: 'box_ref', folderId: FOLDER } };
const ON = [[' boxReadBack: false', ' boxReadBack: true']];
const OAUTH = [[' boxOAuth: false', ' boxOAuth: true'], ["boxClientId: 'REPLACE_WITH_BOX_CLIENT_ID'", "boxClientId: 'cid-1'"]];
const goodAuth = (u) => REDIRECT + '?code=CODE1&state=' + new URL(u).searchParams.get('state');
const bx = (env) => env.calls.filter((c) => /box\.com|token-relay/.test(c.url) || c.method === 'AUTH');
const b64 = (s) => Buffer.from(s).toString('base64');
const SAVE = (over) => ({ type: 'flow:box-save', payload: Object.assign({ key: 'loop-1', name: 'Contract-signed.pdf', base64: b64('the signed contract bytes') }, over || {}) });

(async () => {
  console.log('\n--- switches default off: nothing is called ---\n');
  {
    const env = load({ stored: CONNECTED });
    check('shipped config: both box switches are false', env.fn('CONNECTORS').boxReadBack === false && env.fn('CONNECTORS').boxOAuth === false);
    const r = await env.send(SAVE());
    check('off: save answers connector-not-live and calls nothing', r.ok === false && r.reason === 'connector-not-live' && bx(env).length === 0, r);
    check('off: undo answers connector-not-live', (await env.send({ type: 'flow:box-undo', payload: { ref: { fileId: '1300000000001' } } })).reason === 'connector-not-live');
    let threw = ''; try { await env.fn('connectBoxOAuth')(FOLDER); } catch (e) { threw = e.message; }
    check('off: Sign in with Box refuses and calls nothing', /not switched on/.test(threw) && bx(env).length === 0, threw);
    check('off: nothing stored', env.stored.connectorOutcomes === undefined && env.stored.boxLedger === undefined);
  }
  console.log('\n--- boxReadBack on ---\n');
  {
    const env = load({ stored: CONNECTED, patch: ON });
    const r = await env.send(SAVE());
    check('on: saved and read back, proof of box/file with the file id', r.ok === true && r.proof && r.proof.system === 'box/file' && r.proof.fetchedBack === true && /^13000000000\d\d$/.test(r.proof.externalId), r);
    check('on: FlowProofOfClose accepts it', env.fn('FlowProofOfClose').isProof(r.proof));
    check('on: one upload then one read, bytes exact, bearer token', bx(env).length === 2 && bx(env)[0].url.startsWith('https://upload.box.com/') && bx(env)[0].headers.Authorization === 'Bearer box_tok' && Object.values(env.files)[0].bytes.toString() === 'the signed contract bytes' && Object.values(env.files)[0].parent === FOLDER, bx(env).map((c) => c.method + c.url));
    const again = await env.send(SAVE());
    check('on: a second click uploads nothing more', again.ok === true && Object.keys(env.files).length === 1 && env.calls.filter((c) => c.method === 'POST' && /upload/.test(c.url)).length === 1);
    const ev = env.stored.connectorOutcomes || []; const dump = JSON.stringify(ev);
    check('on: events for box (approved, handled), closeType file, no name, id or content', ev.every((e) => e.connector === 'box' && e.closeType === 'file' && e.destinationSystem === 'box/file') && ev.some((e) => e.stage === 'handled') && !/Contract|signed|13000000|box_tok/.test(dump), dump);
    const un = await env.send({ type: 'flow:box-undo', payload: { ref: r.ref } });
    check('on: Undo trashes and reads back', un.ok === true && un.readBack === true && Object.values(env.files)[0].status === 'trashed', un);
    check('on: Undo is an event too', (env.stored.connectorOutcomes || []).some((e) => e.stage === 'undone' && e.closeType === 'file'));
    check('a foreign sender is refused', (await env.send(SAVE(), { id: 'someone-else' })).reason === 'foreign-sender');
    await env.fn('disconnectConnector')('box');
    check('Disconnect removes the token and the ledger', env.stored.boxAuth === undefined && env.stored.boxLedger === undefined, Object.keys(env.stored));
  }
  {
    const env = load({ stored: CONNECTED, patch: ON });
    const r = await env.send(SAVE()); Object.values(env.files)[0].bytes = Buffer.from('I changed this');
    const un = await env.send({ type: 'flow:box-undo', payload: { ref: r.ref } });
    check('on: Undo refuses a file the person edited and deletes nothing', un.ok === false && un.reason === 'edited-by-person' && Object.values(env.files)[0].status === 'active' && !env.calls.some((c) => c.method === 'DELETE'), un);
  }
  {
    const env = load({ stored: CONNECTED, patch: ON });
    for (const bad of [{ base64: '' }, { base64: '%%%not base64%%%' }, { name: '///' }, { key: '' }]) check('on: bad input ' + JSON.stringify(Object.keys(bad)) + ' is refused before any call', (await env.send(SAVE(bad))).ok === false && bx(env).length === 0);
    const huge = 'A'.repeat(Math.ceil(20 * 1024 * 1024 * 4 / 3) + 100);
    const t = await env.send(SAVE({ base64: huge })); check('on: a file over the cap is refused before it is decoded or sent', t.ok === false && t.reason === 'too-large' && bx(env).length === 0, t);
  }
  {
    const env = load({ stored: { boxAuth: { token: 'box_tok', refreshToken: 'box_ref' } }, patch: ON });
    const r = await env.send(SAVE());
    check('on: connected without a chosen folder -> not-connected, nothing sent', r.ok === false && r.reason === 'not-connected' && bx(env).length === 0, r);
  }
  {
    const env = load({ stored: CONNECTED, patch: ON });
    const sb = env.sandbox; const real = sb.fetch; sb.fetch = async (u, i) => ((i && i.method) === 'GET' && /\/files\/\d+/.test(String(u)) ? res(500, {}) : real(u, i));
    const r = await env.send(SAVE());
    check('read-back 500: not ok, no proof, readback_failed event, no handled event, one file exists', r.ok === false && r.proof === null && (env.stored.connectorOutcomes || []).some((e) => e.stage === 'readback_failed') && !(env.stored.connectorOutcomes || []).some((e) => e.stage === 'handled') && Object.keys(env.files).length === 1, r);
  }
  console.log('\n--- boxOAuth on ---\n');
  {
    const env = load({ patch: OAUTH, authResult: goodAuth });
    const r = await env.fn('connectBoxOAuth')('https://app.box.com/folder/' + FOLDER);
    const auth = env.calls.find((c) => c.method === 'AUTH'); const rel = env.calls.find((c) => c.url.indexOf('token-relay') >= 0); const q = new URL(auth.url); const sent = JSON.parse(rel.body);
    check('oauth: authorize URL has the client id, code flow, a state; no secret', q.origin + q.pathname === 'https://account.box.com/api/oauth2/authorize' && q.searchParams.get('client_id') === 'cid-1' && q.searchParams.get('response_type') === 'code' && q.searchParams.get('state') && !/secret/i.test(auth.url), auth.url);
    check('oauth: the code goes to the relay as vendor box with no secret in the request', sent.vendor === 'box' && sent.grant === 'code' && sent.code === 'CODE1' && !/secret/i.test(rel.body), rel.body);
    check('oauth: the chosen folder is verified and stored with the token on the device', env.stored.boxAuth.token === 'oauth_tok' && env.stored.boxAuth.refreshToken === 'oauth_ref' && env.stored.boxAuth.folderId === FOLDER && r.title === 'Signed contracts', env.stored.boxAuth);
  }
  {
    for (const bad of ['0', 'https://app.box.com/folder/0', 'https://evil.example/folder/' + FOLDER, 'folder', '', '12/../34', 'https://app.box.com.evil.example/folder/' + FOLDER]) {
      const env = load({ patch: OAUTH, authResult: goodAuth });
      let threw = ''; try { await env.fn('connectBoxOAuth')(bad); } catch (e) { threw = e.message; }
      check('oauth: folder input ' + JSON.stringify(bad) + ' is refused before any sign-in', /doesn’t look like a Box folder/.test(threw) && env.calls.length === 0, threw);
    }
  }
  {
    const env = load({ patch: OAUTH, authResult: () => REDIRECT + '?code=C&state=forged' });
    let threw = ''; try { await env.fn('connectBoxOAuth')(FOLDER); } catch (e) { threw = e.message; }
    check('oauth: forged state refused before any token request', /could not be verified/.test(threw) && !env.calls.some((c) => c.url.indexOf('token-relay') >= 0), threw);
  }
  {
    const env = load({ patch: [[' boxOAuth: false', ' boxOAuth: true']] });
    let threw = ''; try { await env.fn('connectBoxOAuth')(FOLDER); } catch (e) { threw = e.message; }
    check('oauth: no client id -> says so, asks nothing', /isn’t configured/.test(threw) && !env.calls.some((c) => c.method === 'AUTH'), threw);
  }
  {
    const env = load({ patch: OAUTH, authResult: goodAuth, relay: () => res(400, { error: 'relay-refused' }) });
    let threw = ''; try { await env.fn('connectBoxOAuth')(FOLDER); } catch (e) { threw = e.message; }
    check('oauth: the relay refusing the code stores nothing', /Box connection failed/.test(threw) && env.stored.boxAuth === undefined, threw);
  }
  {
    const env = load({ patch: OAUTH, authResult: goodAuth, folder: () => res(404, {}) });
    let threw = ''; try { await env.fn('connectBoxOAuth')(FOLDER); } catch (e) { threw = e.message; }
    check('oauth: a folder the person cannot open stores nothing', /cannot open that folder/.test(threw) && env.stored.boxAuth === undefined, threw);
  }
  {
    const env = load({ stored: { boxAuth: { token: 'OLD', refreshToken: 'r1', folderId: FOLDER } }, patch: ON.concat(OAUTH), relay: (b) => res(200, { access_token: 'NEW', refresh_token: 'r2' }) });
    const real = env.sandbox.fetch; env.sandbox.fetch = async (u, i) => ((i && i.headers && i.headers.Authorization === 'Bearer OLD') ? res(401, {}) : real(u, i));
    const r = await env.send(SAVE());
    check('401 -> one refresh through the relay; the rotated refresh token and the folder are kept', r.ok === true && env.stored.boxAuth.token === 'NEW' && env.stored.boxAuth.refreshToken === 'r2' && env.stored.boxAuth.folderId === FOLDER, env.stored.boxAuth);
  }
  console.log('\nTOTAL FAILURES: ' + failures);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
