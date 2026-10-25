// Wiring of the Zoom connector inside background.js: both switches default off and call nothing; with zoomReadBack on a meeting is created and read back
// (id, topic, start, zoom.us join link), the learning event carries no topic, id or link, Undo removes it unless the person changed it, Disconnect removes the
// token and the ledger; with zoomOAuth on the PKCE challenge matches the verifier sent to the relay and the token stays on the device.
const vm = require('vm');
const crypto = require('crypto');
const { webcrypto } = crypto;
const { backgroundScript } = require('./load-background.cjs');

let failures = 0;
function check(name, cond, detail) { if (cond) console.log('PASS:', name); else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); } }
const res = (status, body, headers) => ({ ok: status >= 200 && status < 300, status, json: async () => { if (body === undefined) throw new Error('no body'); return body; }, text: async () => JSON.stringify(body), headers: { get: (k) => (headers && headers[k.toLowerCase()]) || null } });
const REDIRECT = 'https://dnjhplgmnkabbjogfpbhofjedlkehkai.chromiumapp.org/';

function load(opts) {
  const o = opts || {};
  const calls = []; const listeners = []; const stored = JSON.parse(JSON.stringify(o.stored || {})); const meetings = {}; let seq = 0;
  const sandbox = {
    console, setTimeout, clearTimeout, URL, URLSearchParams, crypto: webcrypto, TextEncoder, Uint8Array,
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'), atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    fetch: async (url, init) => {
      const u = String(url); const method = (init && init.method) || 'GET';
      let body = null; try { body = init && init.body ? JSON.parse(init.body) : null; } catch (e) { body = null; }
      calls.push({ method, url: u, body, auth: init && init.headers && init.headers.Authorization });
      if (u.indexOf('token-relay') >= 0) return o.relay ? o.relay(body) : res(503, { error: 'vendor_not_configured' });
      if (u.indexOf('https://api.zoom.us/v2') !== 0) return res(500, { error: 'unrouted ' + u });
      const path = u.replace('https://api.zoom.us/v2', '');
      if (path === '/users/me/meetings' && method === 'POST') { const id = String(81000000000 + (++seq)); meetings[id] = { id: Number(id), topic: body.topic, start_time: body.start_time, join_url: 'https://us02web.zoom.us/j/' + id + '?pwd=PWD', start_url: 'https://us02web.zoom.us/s/' + id + '?zak=HOST', created_at: new Date().toISOString() }; return res(201, meetings[id]); }
      const m = path.match(/^\/meetings\/(\d+)/);
      if (m && method === 'GET') return meetings[m[1]] ? res(200, meetings[m[1]]) : res(404, { code: 3001 });
      if (m && method === 'DELETE') { delete meetings[m[1]]; return res(204, undefined); }
      return res(500, { error: 'unrouted ' + method + ' ' + path });
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
  return { calls, stored, meetings, sandbox, send, fn: (n) => vm.runInContext(n, sandbox) };
}
const CONNECTED = { zoomAuth: { token: 'zm_tok', refreshToken: 'zm_ref' } };
const ON = [['zoomReadBack: false', 'zoomReadBack: true']];
const OAUTH = [['zoomOAuth: false', 'zoomOAuth: true'], ["zoomClientId: 'REPLACE_WITH_ZOOM_CLIENT_ID'", "zoomClientId: 'cid-public'"]];
const zm = (env) => env.calls.filter((c) => /zoom\.us|token-relay/.test(c.url) || c.method === 'AUTH');
const startIso = () => new Date(Date.now() + 3 * 86400000).toISOString().replace(/\.\d{3}Z$/, 'Z');
const CREATE = (over) => ({ type: 'flow:zoom-create', payload: Object.assign({ key: 'loop-1', topic: 'Zoom call with Dana', startIso: startIso(), durationMin: 30 }, over || {}) });

(async () => {
  console.log('\n--- switches default off: nothing is called ---\n');
  {
    const env = load({ stored: CONNECTED });
    check('shipped config: both zoom switches are false', env.fn('CONNECTORS').zoomReadBack === false && env.fn('CONNECTORS').zoomOAuth === false);
    const r = await env.send(CREATE());
    check('off: create answers connector-not-live and calls nothing', r.ok === false && r.reason === 'connector-not-live' && zm(env).length === 0, r);
    check('off: undo answers connector-not-live', (await env.send({ type: 'flow:zoom-undo', payload: { ref: { meetingId: '81000000001', key: 'k' } } })).reason === 'connector-not-live');
    let threw = ''; try { await env.fn('connectZoomOAuth')(); } catch (e) { threw = e.message; }
    check('off: Sign in with Zoom refuses and calls nothing', /not switched on/.test(threw) && zm(env).length === 0, threw);
    check('off: nothing stored', env.stored.connectorOutcomes === undefined && env.stored.zoomLedger === undefined);
    check('off: no Zoom writer is registered anywhere (it is a message type, not a task writer)', env.fn('WRITERS').zoom === undefined);
  }
  console.log('\n--- zoomReadBack on ---\n');
  {
    const env = load({ stored: CONNECTED, patch: ON });
    const r = await env.send(CREATE());
    check('on: created and read back, with a proof of zoom/meeting', r.ok === true && r.proof && r.proof.system === 'zoom/meeting' && r.proof.fetchedBack === true && r.proof.externalId === '81000000001', r);
    check('on: FlowProofOfClose accepts it', env.fn('FlowProofOfClose').isProof(r.proof));
    check('on: one POST then one GET, bearer token, nobody invited, type 2', zm(env).length === 2 && zm(env)[0].method === 'POST' && zm(env)[1].method === 'GET' && zm(env)[0].auth === 'Bearer zm_tok' && zm(env)[0].body.type === 2 && !JSON.stringify(zm(env)[0].body).includes('invitee'), zm(env).map((c) => c.method + c.url));
    check('on: the result carries the join link and never the host start link', /\/j\//.test(r.url) && !JSON.stringify(r).includes('/s/') && !JSON.stringify(r).includes('zak='));
    const again = await env.send(CREATE());
    check('on: a second click creates nothing more', again.ok === true && Object.keys(env.meetings).length === 1 && env.calls.filter((c) => c.method === 'POST').length === 1);
    const ev = env.stored.connectorOutcomes || []; const dump = JSON.stringify(ev);
    check('on: events for zoom (approved, handled), closeType meeting, no topic, id, link or token', ev.every((e) => e.connector === 'zoom' && e.closeType === 'meeting' && e.destinationSystem === 'zoom/meeting') && ev.some((e) => e.stage === 'handled') && !/Dana|8100000|zoom\.us|zm_tok|PWD/.test(dump), dump);
    check('on: the ledger holds ids, topic and start only: no link, no token', !/zoom\.us|zm_tok|PWD|zak/.test(JSON.stringify(env.stored.zoomLedger)), env.stored.zoomLedger);
    const un = await env.send({ type: 'flow:zoom-undo', payload: { ref: r.ref } });
    check('on: Undo deletes and reads back', un.ok === true && un.readBack === true && Object.keys(env.meetings).length === 0, un);
    check('on: Undo is an event too', (env.stored.connectorOutcomes || []).some((e) => e.stage === 'undone' && e.closeType === 'meeting'));
    check('a foreign sender is refused', (await env.send(CREATE(), { id: 'someone-else' })).reason === 'foreign-sender');
    await env.fn('disconnectConnector')('zoom');
    check('Disconnect removes the token and the ledger', env.stored.zoomAuth === undefined && env.stored.zoomLedger === undefined, Object.keys(env.stored));
  }
  {
    const env = load({ stored: CONNECTED, patch: ON });
    const r = await env.send(CREATE()); Object.values(env.meetings)[0].topic = 'Renamed by the person';
    const un = await env.send({ type: 'flow:zoom-undo', payload: { ref: r.ref } });
    check('on: Undo refuses a meeting the person changed and deletes nothing', un.ok === false && un.reason === 'edited-by-person' && Object.keys(env.meetings).length === 1 && !env.calls.some((c) => c.method === 'DELETE'), un);
  }
  {
    const env = load({ stored: CONNECTED, patch: ON });
    for (const bad of [{ topic: '' }, { key: '' }, { startIso: 'tomorrow' }, { startIso: '2026-01-01T10:00:00Z' }, { durationMin: 5 }]) check('on: bad input ' + JSON.stringify(Object.keys(bad)) + ' is refused before any call', (await env.send(CREATE(bad))).ok === false && zm(env).length === 0);
  }
  {
    const env = load({ stored: CONNECTED, patch: ON });
    const sb = env.sandbox; const real = sb.fetch; sb.fetch = async (u, i) => (/\/meetings\/\d+$/.test(String(u)) && (!i || !i.method || i.method === 'GET') ? res(500, {}) : real(u, i));
    const r = await env.send(CREATE());
    check('read-back 500: not ok, no proof, a readback_failed event and no handled event, one meeting exists', r.ok === false && r.proof === null && (env.stored.connectorOutcomes || []).some((e) => e.stage === 'readback_failed') && !(env.stored.connectorOutcomes || []).some((e) => e.stage === 'handled') && Object.keys(env.meetings).length === 1, r);
  }
  console.log('\n--- zoomOAuth on ---\n');
  {
    const env = load({ patch: OAUTH, relay: () => res(200, { access_token: 'oauth_tok', refresh_token: 'oauth_ref' }), authResult: (u) => REDIRECT + '?code=CODE1&state=' + new URL(u).searchParams.get('state') });
    const r = await env.fn('connectZoomOAuth')();
    const auth = env.calls.find((c) => c.method === 'AUTH'); const relay = env.calls.find((c) => c.url.indexOf('token-relay') >= 0);
    const q = new URL(auth.url);
    check('oauth: authorize URL has the public client id, the three meeting scopes, S256 PKCE, a state, no secret', q.origin + q.pathname === 'https://zoom.us/oauth/authorize' && q.searchParams.get('client_id') === 'cid-public' && q.searchParams.get('scope') === 'meeting:write:meeting meeting:read:meeting meeting:delete:meeting' && q.searchParams.get('code_challenge_method') === 'S256' && /^[0-9a-f]{32}$/.test(q.searchParams.get('state')) && !/secret/i.test(auth.url), auth.url);
    check('oauth: the verifier sent to the relay hashes to the challenge', crypto.createHash('sha256').update(relay.body.code_verifier).digest('base64url') === q.searchParams.get('code_challenge'));
    check('oauth: relay body is exactly vendor, grant, code, verifier, redirect, install id', relay.body.vendor === 'zoom' && relay.body.grant === 'code' && relay.body.code === 'CODE1' && Object.keys(relay.body).sort().join() === 'code,code_verifier,grant,install_id,redirect_uri,vendor', relay.body);
    check('oauth: token and refresh token stored on the device only', env.stored.zoomAuth.token === 'oauth_tok' && env.stored.zoomAuth.refreshToken === 'oauth_ref' && r.title === 'Zoom' && !env.calls.some((c) => /zoom\.us\/oauth\/token/.test(c.url)));
  }
  {
    const env = load({ patch: OAUTH, relay: () => res(200, { access_token: 't' }), authResult: () => REDIRECT + '?code=C&state=forged' });
    let threw = ''; try { await env.fn('connectZoomOAuth')(); } catch (e) { threw = e.message; }
    check('oauth: forged state refused before the relay', /could not be verified/.test(threw) && !env.calls.some((c) => c.url.indexOf('token-relay') >= 0), threw);
  }
  {
    const env = load({ patch: [['zoomOAuth: false', 'zoomOAuth: true']] });
    let threw = ''; try { await env.fn('connectZoomOAuth')(); } catch (e) { threw = e.message; }
    check('oauth: no client id -> says so, asks nothing', /isn’t configured/.test(threw) && !env.calls.some((c) => c.method === 'AUTH'), threw);
  }
  {
    const env = load({ patch: OAUTH, relay: () => res(502, { error: 'invalid_grant' }), authResult: (u) => REDIRECT + '?code=C&state=' + new URL(u).searchParams.get('state') });
    let threw = ''; try { await env.fn('connectZoomOAuth')(); } catch (e) { threw = e.message; }
    check('oauth: relay refusing the code stores nothing', /invalid_grant/.test(threw) && env.stored.zoomAuth === undefined, threw);
  }
  {
    // refresh: a 401 from Zoom triggers one relay refresh with the stored refresh token; the rotated token is saved
    const env = load({ stored: { zoomAuth: { token: 'OLD', refreshToken: 'r1' } }, patch: ON, relay: (b) => res(200, { access_token: 'NEW', refresh_token: 'r2' }) });
    const sb = env.sandbox; const real = sb.fetch; sb.fetch = async (u, i) => (String(u).startsWith('https://api.zoom.us') && i && i.headers && i.headers.Authorization === 'Bearer OLD' ? res(401, { code: 124 }) : real(u, i));
    const r = await env.send(CREATE());
    check('refresh: 401 -> one relay refresh -> create succeeds; the rotated refresh token is stored', r.ok === true && env.stored.zoomAuth.token === 'NEW' && env.stored.zoomAuth.refreshToken === 'r2' && env.calls.filter((c) => c.url.indexOf('token-relay') >= 0).length === 1 && env.calls.find((c) => c.url.indexOf('token-relay') >= 0).body.grant === 'refresh', r);
  }
  console.log('\nTOTAL FAILURES: ' + failures);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
