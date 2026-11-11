// Wiring of the Monday read-back writer inside background.js: the switch defaults off and the earlier mondayWrite / mondayUndo stay registered unchanged; with mondayReadBack on the
// writer returns a ProofOfClose, uses the Monday connection the person already made, Undo ARCHIVES and reads back (never deletes, refuses a renamed item), the learning event has
// no text, and Disconnect forgets the ledger. No new sign-in, no relay.
const vm = require('vm');
const { webcrypto } = require('crypto');
const { backgroundScript } = require('./load-background.cjs');

let failures = 0;
function check(name, cond, detail) { if (cond) console.log('PASS:', name); else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); } }
const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body), headers: { get: () => null } });
const BOARD = '5001234567';

function load(opts) {
  const o = opts || {};
  const calls = []; const stored = JSON.parse(JSON.stringify(o.stored || {})); const items = {}; let seq = 0;
  const sandbox = {
    console, setTimeout, clearTimeout, URL, URLSearchParams, crypto: webcrypto, TextEncoder, Uint8Array,
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'), atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    fetch: async (url, init) => {
      const u = String(url); const body = init && typeof init.body === 'string' ? JSON.parse(init.body) : null;
      calls.push({ method: (init && init.method) || 'GET', url: u, body, auth: init && init.headers && init.headers.Authorization });
      if (u.indexOf('token-relay') >= 0) return res(500, { error: 'the relay must not be used for Monday' });
      if (u !== 'https://api.monday.com/v2') return res(500, { error: 'unrouted ' + u });
      if (init.headers.Authorization !== 'mon_oauth_tok') return res(200, { errors: [{ message: 'Not Authenticated', extensions: { code: 'UserUnauthorizedException' } }] });
      const q = body.query; const v = body.variables || {};
      if (q.indexOf('create_item') >= 0) { const id = String(7000000000 + (++seq)); items[id] = { id, name: v.name, state: 'active', board: { id: String(v.board) }, created_at: new Date().toISOString() }; return res(200, { data: { create_item: { id } } }); }
      if (q.indexOf('items(ids') >= 0) return res(200, { data: { items: (v.ids || []).map((i) => items[i]).filter(Boolean) } });
      if (q.indexOf('items_page') >= 0) return res(200, { data: { boards: [{ items_page: { items: Object.values(items) } }] } });
      if (q.indexOf('archive_item') >= 0) { if (items[v.id]) items[v.id].state = 'archived'; return res(200, { data: { archive_item: { id: v.id } } }); }
      if (q.indexOf('delete_item') >= 0) { delete items[v.item]; return res(200, { data: { delete_item: { id: v.item } } }); }
      if (q.indexOf('create_update') >= 0) return res(200, { data: { create_update: { id: '1' } } });
      return res(200, { errors: [{ message: 'unrouted' }] });
    },
    chrome: {
      runtime: { getManifest: () => ({ oauth2: { client_id: 'x' } }), onMessage: { addListener() {} }, onInstalled: { addListener() {} }, onStartup: { addListener() {} }, lastError: null, getURL: (s) => s, id: 'ext' },
      identity: { getAuthToken: (x, cb) => cb('t'), removeCachedAuthToken: (x, cb) => cb && cb(), getRedirectURL: () => 'https://x.chromiumapp.org/', launchWebAuthFlow: async () => '' },
      storage: { local: { get: async (k) => (typeof k === 'string' ? { [k]: stored[k] } : Array.isArray(k) ? Object.fromEntries(k.map((x) => [x, stored[x]])) : stored), set: async (patch) => { Object.assign(stored, patch); }, remove: async (k) => { [].concat(k).forEach((x) => { delete stored[x]; }); } } },
      windows: { create: () => {}, onRemoved: { addListener() {} } }, tabs: { sendMessage: () => {} }, contextMenus: { create() {}, removeAll(cb) { if (cb) cb(); }, onClicked: { addListener() {} } }, alarms: { create: () => {}, onAlarm: { addListener() {} } }
    }
  };
  sandbox.self = sandbox; sandbox.globalThis = sandbox; vm.createContext(sandbox);
  let src = backgroundScript();
  (o.patch || []).forEach(([a, b]) => { if (src.indexOf(a) < 0) throw new Error('patch target missing: ' + a); src = src.replace(a, b); });
  vm.runInContext(src, sandbox, { filename: 'background.js' });
  return { calls, stored, items, sandbox, fn: (n) => vm.runInContext(n, sandbox) };
}
const CONNECTED = { mondayAuth: { access_token: 'mon_oauth_tok', refresh_token: 'r', boardId: BOARD } };
const PAYLOAD = { label: 'Send Dana the signed contract', facts: {}, messageId: 'm-1', threadUrl: 'https://mail.google.com/x' };
const ON = [['mondayReadBack: false', 'mondayReadBack: true']];
const monday = (env) => env.calls.filter((c) => /monday\.com/.test(c.url));

(async () => {
  console.log('\n--- the switch defaults off: the earlier writer is untouched ---\n');
  {
    const env = load({ stored: CONNECTED });
    check('shipped config: mondayReadBack is false', env.fn('CONNECTORS').mondayReadBack === false);
    check('off: WRITERS.monday and UNDOERS.monday are the earlier mondayWrite and mondayUndo', env.fn('WRITERS').monday === env.fn('mondayWrite') && env.fn('UNDOERS').monday === env.fn('mondayUndo'));
    const out = await env.fn('WRITERS').monday(PAYLOAD);
    check('off: the earlier writer still works exactly as before (an item and an update, no proof, no ledger, no learning event)', out.ok === true && !out.proof && env.calls.some((c) => c.body && /create_update/.test(c.body.query)) && env.stored.mondayLedger === undefined && env.stored.connectorOutcomes === undefined, out);
  }
  console.log('\n--- mondayReadBack on ---\n');
  {
    const env = load({ stored: CONNECTED, patch: ON });
    check('on: writer and undoer are the read-back versions', env.fn('WRITERS').monday === env.fn('mondayReadBackWrite') && env.fn('UNDOERS').monday === env.fn('mondayReadBackUndo'));
    const out = await env.fn('WRITERS').monday(PAYLOAD);
    check('on: Handled with a read-back proof of monday/item', out.ok === true && out.proof && out.proof.system === 'monday/item' && out.proof.fetchedBack === true, out);
    check('on: FlowProofOfClose accepts it', env.fn('FlowProofOfClose').isProof(out.proof));
    check('on: the existing connection\'s token is used as the header value, the board is the stored one, nothing goes to a relay; no update, no delete, no column', monday(env).every((c) => c.auth === 'mon_oauth_tok' && !/create_update|delete_item|change_column/.test(c.body.query)) && env.calls.find((c) => c.body && /create_item/.test(c.body.query)).body.variables.board === BOARD, monday(env).map((c) => c.body && c.body.query.slice(0, 30)));
    const again = await env.fn('WRITERS').monday(PAYLOAD);
    check('on: a second click creates no second item', Object.keys(env.items).length === 1 && again.ok === true, Object.keys(env.items));
    const ev = env.stored.connectorOutcomes || []; const dump = JSON.stringify(ev);
    check('on: events emitted for monday (approved, handled), no text', ev.every((e) => e.connector === 'monday') && ev.some((e) => e.stage === 'approved') && ev.some((e) => e.stage === 'handled') && !/Dana|contract|mail\.google|mon_oauth/.test(dump), dump);
    const un = await env.fn('UNDOERS').monday(out.ref);
    check('on: Undo ARCHIVES and reads back (the item still exists, archived)', un.ok === true && un.readBack === true && Object.values(env.items)[0].state === 'archived', un);
    check('on: Undo is an event too', (env.stored.connectorOutcomes || []).some((e) => e.stage === 'undone' && e.connector === 'monday'));
    await env.fn('disconnectConnector')('monday');
    check('Disconnect removes the token and the ledger', env.stored.mondayAuth === undefined && env.stored.mondayLedger === undefined, Object.keys(env.stored));
  }
  {
    const env = load({ stored: CONNECTED, patch: ON });
    const out = await env.fn('WRITERS').monday(PAYLOAD); Object.values(env.items)[0].name = 'Renamed by the person';
    const un = await env.fn('UNDOERS').monday(out.ref);
    check('on: Undo refuses an item the person renamed and archives nothing', un.ok === false && un.reason === 'edited-by-person' && Object.values(env.items)[0].state === 'active' && !env.calls.some((c) => c.body && /archive_item/.test(c.body.query)), un);
  }
  {
    const env = load({ stored: CONNECTED, patch: ON });
    const sb = env.sandbox; const real = sb.fetch;
    sb.fetch = async (url, init) => { if (init && /items\(ids/.test(init.body)) return res(500, {}); return real(url, init); };
    const out = await env.fn('WRITERS').monday(PAYLOAD);
    check('read-back 500: ok false, no proof, verify_failed', out.ok === false && out.proof === null && out.reason === 'verify_failed', out);
    check('read-back 500: readback_failed event, no handled event, one item exists', (env.stored.connectorOutcomes || []).some((e) => e.stage === 'readback_failed') && !(env.stored.connectorOutcomes || []).some((e) => e.stage === 'handled') && Object.keys(env.items).length === 1);
  }
  {
    const env = load({ patch: ON });
    const out = await env.fn('WRITERS').monday(PAYLOAD);
    check('on, not connected: says so and calls nothing', out.ok === false && out.reason === 'not-connected' && env.calls.length === 0, out);
    const env2 = load({ stored: { mondayAuth: { access_token: 'mon_oauth_tok' } }, patch: ON });
    check('on, connected without a board: not connected, calls nothing', (await env2.fn('WRITERS').monday(PAYLOAD)).reason === 'not-connected' && env2.calls.length === 0);
  }
  {
    const env = load({ stored: CONNECTED, patch: ON.concat([['notionReadBack: false', 'notionReadBack: true']]) });
    check('monday and notion read-back on together: each has its own writer', env.fn('WRITERS').monday === env.fn('mondayReadBackWrite') && env.fn('WRITERS').notion === env.fn('notionReadBackWrite'));
  }
  console.log('\nTOTAL FAILURES: ' + failures);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
