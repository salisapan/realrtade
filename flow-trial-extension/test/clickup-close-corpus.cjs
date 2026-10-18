// Contract tests for core/clickup-close.js against a mock of the ClickUp API. No network, no real account, no real key.
const assert = require('assert');
const { FlowClickUpClose } = require('../core/clickup-close.js');
const { FlowProofOfClose } = require('../core/proof-of-close.js');

const LIST = '901200000001';
const API = 'https://api.clickup.com/api/v2';
let passed = 0;
async function t(name, fn) { await fn(); passed++; console.log('ok  ' + name); }

function server(opts) {
  const o = opts || {};
  const s = { tasks: {}, calls: [], seq: 0, token: o.token || 'tok-1', clock: Date.parse('2026-10-18T08:00:00Z'), faults: o.faults || {} };
  const res = (status, body, headers) => ({ status, ok: status >= 200 && status < 300, json: async () => { if (body === undefined) throw new Error('no body'); return body; }, headers: { get: (k) => (headers && headers[k.toLowerCase()]) || null } });
  s.res = res;
  s.exec = (req) => {
    const m = req.path.match(/^\/task\/([^/?]+)/);
    const create = req.path.match(/^\/list\/(\d+)\/task$/);
    if (create && req.method === 'POST') {
      const id = '86c' + (100 + (++s.seq)); s.clock += 1000;
      s.tasks[id] = { id, name: req.body.name, status: { status: 'to do', type: 'open' }, date_created: String(s.clock), date_closed: null, archived: false, due_date: req.body.due_date ? String(req.body.due_date) : null, url: 'https://app.clickup.com/t/' + id, list: { id: create[1], name: 'Ops', access: true } };
      return res(200, s.tasks[id]);
    }
    if (m && req.method === 'GET') { const t = s.tasks[m[1]]; return t ? res(200, t) : res(404, { err: 'Task not found', ECODE: 'ITEM_015' }); }
    if (m && req.method === 'DELETE') { if (!s.tasks[m[1]]) return res(404, { err: 'Task not found', ECODE: 'ITEM_015' }); delete s.tasks[m[1]]; return res(204, undefined); }
    if (req.path.indexOf('/list/' + LIST + '/task?') === 0 && req.method === 'GET') {
      const since = Number(new URL('https://x' + req.path).searchParams.get('date_created_gt')) || 0;
      return res(200, { tasks: Object.values(s.tasks).filter((x) => Number(x.date_created) > since), last_page: true });
    }
    return res(400, { err: 'unrouted ' + req.method + ' ' + req.path });
  };
  s.fetch = async (url, init) => {
    const req = { method: init.method, path: url.replace(API, ''), body: init.body ? JSON.parse(init.body) : undefined, auth: init.headers.Authorization };
    s.calls.push(req);
    const n = s.calls.length;
    if (s.faults[n]) { const r = await s.faults[n](req, s); if (r) return r; }
    if (req.auth !== 'Bearer ' + s.token) return res(401, { err: 'Oauth token not found', ECODE: 'OAUTH_019' });
    return s.exec(req);
  };
  return s;
}
function memLedger(store) { const m = store || {}; return { m, get: async (k) => (m[k] ? JSON.parse(JSON.stringify(m[k])) : null), set: async (k, v) => { m[k] = JSON.parse(JSON.stringify(v)); } }; }
function make(s, extra) {
  const e = extra || {}; const ledger = e.ledger || memLedger();
  let auth = e.auth === undefined ? { token: s.token, refreshToken: null, listId: LIST } : e.auth; const saved = [];
  const c = FlowClickUpClose.create(Object.assign({ fetch: s.fetch, ledger, now: () => s.clock, sleep: async () => {}, timeoutMs: 50, getAuth: async () => auth, saveAuth: async (a) => { auth = a; saved.push(a); }, buildProof: FlowProofOfClose.buildProof }, e.deps || {}));
  return { c, ledger, saved };
}
const P = { key: 'loop-1', title: 'Send Dana the signed contract', dueIso: '2026-10-20' };
const posts = (s) => s.calls.filter((x) => x.method === 'POST').length;
const count = (s) => Object.keys(s.tasks).length;
const FIRST = '86c101';
const createThen = (answer) => async (req, srv) => { srv.exec(req); return answer(srv); };

(async () => {
  await t('success: POST then GET back; Handled with a proof of system clickup/task', async () => {
    const s = server(); const { c } = make(s); const r = await c.write(P);
    assert.strictEqual(r.ok, true); assert.strictEqual(r.proof.system, 'clickup/task'); assert.strictEqual(r.proof.fetchedBack, true);
    assert.strictEqual(r.proof.externalId, FIRST); assert.strictEqual(r.proof.url, 'https://app.clickup.com/t/' + FIRST);
    assert.ok(FlowProofOfClose.isProof(r.proof));
    assert.deepStrictEqual(s.calls.map((x) => x.method + ' ' + x.path), ['POST /list/' + LIST + '/task', 'GET /task/' + FIRST]);
    assert.deepStrictEqual(s.calls[0].body, { name: P.title, due_date: Date.parse('2026-10-20T12:00:00Z'), due_date_time: false });
    assert.strictEqual(s.calls[0].auth, 'Bearer tok-1');
  });
  await t('no due date: the body is the name alone', async () => {
    const s = server(); await make(s).c.write({ key: 'k', title: 'Call Dana' }); assert.deepStrictEqual(s.calls[0].body, { name: 'Call Dana' });
  });
  await t('only the task endpoints used for a close: no spaces, folders, teams, users, comments, webhooks, search', async () => {
    const s = server(); const { c } = make(s); const a = await c.write(P); await c.undo(a.ref);
    assert.ok(s.calls.every((x) => /^\/(task\/[A-Za-z0-9]+|list\/\d+\/task)$/.test(x.path)), s.calls.map((x) => x.path).join());
  });
  await t('idempotent: second click and retry never create a second task', async () => {
    const s = server(); const { c } = make(s); await c.write(P); const b = await c.write(P); await c.write(P);
    assert.strictEqual(posts(s), 1); assert.strictEqual(count(s), 1); assert.strictEqual(b.ok, true);
  });
  await t('read-back after reload: a fresh instance with the same ledger re-verifies, no new POST', async () => {
    const s = server(); const first = make(s); const a = await first.c.write(P); const second = make(s, { ledger: first.ledger });
    assert.strictEqual((await second.c.verify(a.ref)).ok, true); assert.strictEqual((await second.c.write(P)).ok, true); assert.strictEqual(posts(s), 1);
  });
  await t('completed, archived or removed by someone else: verify is NOT Handled', async () => {
    const s = server(); const { c } = make(s); const a = await c.write(P);
    s.tasks[FIRST].status = { status: 'complete', type: 'closed' }; assert.strictEqual((await c.verify(a.ref)).ok, false);
    s.tasks[FIRST].status = { status: 'to do', type: 'open' }; s.tasks[FIRST].date_closed = '1760000000000'; assert.strictEqual((await c.verify(a.ref)).ok, false);
    s.tasks[FIRST].date_closed = null; s.tasks[FIRST].archived = true; assert.strictEqual((await c.verify(a.ref)).ok, false);
    delete s.tasks[FIRST]; const v = await c.verify(a.ref); assert.strictEqual(v.ok, false); assert.strictEqual(v.proof, null);
  });
  await t('Undo deletes and reads back a 404; twice is fine; a new approve afterwards makes a fresh task', async () => {
    const s = server(); const { c } = make(s); const a = await c.write(P);
    const u = await c.undo(a.ref); assert.strictEqual(u.ok, true); assert.strictEqual(u.readBack, true); assert.strictEqual(count(s), 0);
    assert.strictEqual((await c.undo(a.ref)).ok, true);
    const again = await c.write(P); assert.strictEqual(again.ok, true); assert.strictEqual(again.proof.externalId, '86c102');
  });
  await t('Undo whose read-back still finds the task is not ok', async () => {
    const s = server(); const { c } = make(s); const a = await c.write(P);
    s.faults[s.calls.length + 1] = (req, srv) => srv.res(204, undefined); // DELETE answers 204, deletes nothing
    const u = await c.undo(a.ref); assert.strictEqual(u.ok, false); assert.strictEqual(u.reason, 'verify_failed');
  });
  await t('Undo of a task that is already gone is ok without claiming a read-back', async () => {
    const s = server(); const { c } = make(s); const u = await c.undo({ taskId: 'zzz', key: 'k' });
    assert.strictEqual(u.ok, true); assert.strictEqual(u.readBack, false);
  });
  await t('Undo rejects an id that could escape the path (no path injection)', async () => {
    const s = server(); const { c } = make(s);
    for (const bad of ['1/../team', '../user', 'a b', 'x?y=1', '']) { const u = await c.undo({ taskId: bad, key: 'k' }); assert.strictEqual(u.ok, false, bad); }
    assert.strictEqual(s.calls.length, 0);
  });
  await t('Undo: 403 and 401 are not ok and do not claim a removal', async () => {
    const s = server({ faults: { 1: (r, srv) => srv.res(403, { err: 'no', ECODE: 'ACCESS_001' }) } });
    assert.strictEqual((await make(s).c.undo({ taskId: FIRST, key: 'k' })).reason, 'scope-missing');
    const s2 = server({ token: 'other' }); assert.strictEqual((await make(s2, { auth: { token: 'old', listId: LIST } }).c.undo({ taskId: FIRST, key: 'k' })).reason, 'not-connected');
  });
  await t('401 with a refresh token (a future ClickUp change) -> one refresh -> retried; new token saved', async () => {
    const s = server({ token: 'tok-2' }); let n = 0;
    const { c, saved } = make(s, { auth: { token: 'OLD', refreshToken: 'r-1', listId: LIST }, deps: { refresh: async () => { n++; return { token: 'tok-2', refreshToken: 'r-2' }; } } });
    assert.strictEqual((await c.write(P)).ok, true); assert.strictEqual(n, 1); assert.strictEqual(saved[0].refreshToken, 'r-2');
  });
  await t('401 today (no refresh token, token revoked) -> not-connected, nothing written, no loop', async () => {
    const s = server({ token: 'tok-2' });
    const r = await make(s, { auth: { token: 'OLD', refreshToken: null, listId: LIST } }).c.write(P);
    assert.strictEqual(r.reason, 'not-connected'); assert.strictEqual(count(s), 0); assert.strictEqual(s.calls.length, 1);
  });
  await t('401 and the refresh itself fails -> not-connected', async () => {
    const s = server({ token: 'tok-2' });
    assert.strictEqual((await make(s, { auth: { token: 'OLD', refreshToken: 'r', listId: LIST }, deps: { refresh: async () => null } }).c.write(P)).reason, 'not-connected');
    assert.strictEqual((await make(s, { auth: { token: 'OLD', refreshToken: 'r', listId: LIST }, deps: { refresh: async () => { throw new Error('x'); } } }).c.write(P)).reason, 'not-connected');
  });
  await t('401 "Team not authorized" (OAUTH_027) -> project-not-shared, not a lost token', async () => {
    const s = server({ faults: { 1: (r, srv) => srv.res(401, { err: 'Team not authorized', ECODE: 'OAUTH_027' }) } });
    assert.strictEqual((await make(s).c.write(P)).reason, 'project-not-shared');
  });
  await t('403 -> scope-missing, one POST, no retry loop', async () => {
    const s = server({ faults: { 1: (r, srv) => srv.res(403, { err: 'forbidden', ECODE: 'ACCESS_001' }) } });
    const r = await make(s).c.write(P); assert.strictEqual(r.reason, 'scope-missing'); assert.strictEqual(posts(s), 1);
  });
  await t('404 on the List -> project-not-shared', async () => {
    const s = server({ faults: { 1: (r, srv) => srv.res(404, { err: 'List not found', ECODE: 'LIST_001' }) } }); assert.strictEqual((await make(s).c.write(P)).reason, 'project-not-shared');
  });
  await t('429 with X-RateLimit-Reset (unix seconds): waits until the reset, then one task', async () => {
    const waits = []; const s = server();
    const reset = String(Math.floor(s.clock / 1000) + 4);
    s.faults[1] = (r, srv) => srv.res(429, { err: 'Rate limit reached', ECODE: 'APP_002' }, { 'x-ratelimit-reset': reset, 'x-ratelimit-remaining': '0', 'x-ratelimit-limit': '100' });
    const r = await make(s, { deps: { sleep: async (ms) => { waits.push(ms); } } }).c.write(P);
    assert.strictEqual(r.ok, true); assert.deepStrictEqual(waits, [4000]); assert.strictEqual(count(s), 1);
  });
  await t('429 with Retry-After is honoured; a reset far away is capped at 10 s', async () => {
    const waits = []; const s = server({ faults: { 1: (r, srv) => srv.res(429, {}, { 'retry-after': '3' }) } });
    assert.strictEqual((await make(s, { deps: { sleep: async (ms) => { waits.push(ms); } } }).c.write(P)).ok, true); assert.deepStrictEqual(waits, [3000]);
    const w2 = []; const s2 = server(); s2.faults[1] = (r, srv) => srv.res(429, {}, { 'x-ratelimit-reset': String(Math.floor(s2.clock / 1000) + 55) });
    assert.strictEqual((await make(s2, { deps: { sleep: async (ms) => { w2.push(ms); } } }).c.write(P)).ok, true); assert.deepStrictEqual(w2, [10000]);
  });
  await t('429 forever -> rate-limited, never Handled', async () => {
    const f = {}; for (let i = 1; i < 10; i++) f[i] = (r, srv) => srv.res(429, {}, { 'x-ratelimit-reset': String(Math.floor(srv.clock / 1000) + 1) });
    const s = server({ faults: f }); const r = await make(s).c.write(P); assert.strictEqual(r.reason, 'rate-limited'); assert.strictEqual(count(s), 0);
  });
  await t('5xx that DID create: the retry adopts it, one task', async () => {
    const s = server({ faults: { 1: createThen((srv) => srv.res(502, {})) } }); const r = await make(s).c.write(P);
    assert.strictEqual(r.ok, true); assert.strictEqual(count(s), 1);
  });
  await t('5xx that did NOT create: retried, one task', async () => {
    const s = server({ faults: { 1: (r, srv) => srv.res(503, {}) } }); const r = await make(s).c.write(P); assert.strictEqual(r.ok, true); assert.strictEqual(count(s), 1);
  });
  await t('5xx forever -> not ok, not Handled, nothing invented', async () => {
    const f = {}; for (let i = 1; i < 12; i++) f[i] = (r, srv) => srv.res(500, {});
    const s = server({ faults: f }); const r = await make(s).c.write(P); assert.strictEqual(r.ok, false); assert.strictEqual(r.reason, 'http-500'); assert.strictEqual(count(s), 0);
  });
  await t('409 conflict: adopted if it landed, else retried; never two', async () => {
    const s = server({ faults: { 1: createThen((srv) => srv.res(409, {})) } }); assert.strictEqual((await make(s).c.write(P)).ok, true); assert.strictEqual(count(s), 1);
    const s2 = server({ faults: { 1: (r, srv) => srv.res(409, {}) } }); assert.strictEqual((await make(s2).c.write(P)).ok, true); assert.strictEqual(count(s2), 1);
  });
  await t('timeout on the POST (task created): looked up, adopted, one task', async () => {
    const s = server({ faults: { 1: (req, srv) => { srv.exec(req); return new Promise(() => {}); } } }); const r = await make(s).c.write(P);
    assert.strictEqual(r.ok, true); assert.strictEqual(count(s), 1);
  });
  await t('timeout on the POST (task not created): retried, one task', async () => {
    const s = server({ faults: { 1: () => new Promise(() => {}) } }); const r = await make(s).c.write(P); assert.strictEqual(r.ok, true); assert.strictEqual(count(s), 1);
  });
  await t('network down for good -> not ok, not Handled', async () => {
    const s = server(); const r = await make(s, { deps: { fetch: async () => { throw new Error('offline'); } } }).c.write(P); assert.strictEqual(r.ok, false); assert.strictEqual(r.reason, 'network');
  });
  await t('PARTIAL FAILURE: created, read-back fails -> NOT Handled, no proof; retry re-reads, never re-POSTs', async () => {
    const s = server({ faults: { 2: (r, srv) => srv.res(500, {}) } }); const { c } = make(s); const r = await c.write(P);
    assert.strictEqual(r.ok, false); assert.strictEqual(r.reason, 'verify_failed'); assert.strictEqual(r.proof, null); assert.strictEqual(count(s), 1);
    assert.strictEqual((await c.write(P)).ok, true); assert.strictEqual(posts(s), 1);
  });
  await t('read-back times out / is unreadable -> NOT Handled', async () => {
    const s = server({ faults: { 2: () => new Promise(() => {}) } }); const r = await make(s).c.write(P); assert.strictEqual(r.ok, false); assert.strictEqual(r.proof, null);
    const s2 = server({ faults: { 2: (q, srv) => srv.res(200, undefined) } }); assert.strictEqual((await make(s2).c.write(P)).ok, false);
  });
  await t('read-back answers another task / empty / changed shape -> NOT Handled', async () => {
    for (const bad of [(srv) => srv.res(200, { id: 'other', name: P.title, list: { id: LIST } }), (srv) => srv.res(200, {}), (srv) => srv.res(200, undefined), (srv) => srv.res(200, []), (srv) => srv.res(200, { tasks: [] })]) {
      const s = server({ faults: { 2: (r, srv) => bad(srv) } }); const r = await make(s).c.write(P); assert.strictEqual(r.ok, false); assert.strictEqual(r.proof, null);
    }
  });
  await t('read-back in another List / different name / already closed -> NOT Handled', async () => {
    const mut = (fn) => (r, srv) => { const t = JSON.parse(JSON.stringify(srv.tasks[FIRST])); fn(t); return srv.res(200, t); };
    for (const f of [(t) => { t.list = { id: '5' }; }, (t) => { t.list = undefined; }, (t) => { t.name = 'changed'; }, (t) => { t.status = { type: 'closed' }; }, (t) => { t.archived = true; }]) {
      const s = server({ faults: { 2: mut(f) } }); assert.strictEqual((await make(s).c.write(P)).ok, false);
    }
  });
  await t('POST answers 200 with an empty or id-less body: looked up, adopted, one task', async () => {
    const s = server({ faults: { 1: createThen((srv) => srv.res(200, {})) } }); const r = await make(s).c.write(P); assert.strictEqual(r.ok, true); assert.strictEqual(count(s), 1);
    const s2 = server({ faults: { 1: createThen((srv) => srv.res(200, { id: '../x' })) } }); assert.strictEqual((await make(s2).c.write(P)).ok, true); assert.strictEqual(count(s2), 1);
  });
  await t('no List chosen / bad List id -> not-connected, nothing sent', async () => {
    const s = server(); assert.strictEqual((await make(s, { auth: { token: s.token, listId: '' } }).c.write(P)).reason, 'not-connected');
    assert.strictEqual((await make(s, { auth: { token: s.token, listId: '12/../x' } }).c.write(P)).reason, 'not-connected'); assert.strictEqual(s.calls.length, 0);
  });
  await t('bad date dropped, not invented', async () => {
    const s = server();
    for (const bad of ['2026-13-99; DROP', '2026-02-30', '20261020', '']) { await make(s).c.write({ key: 'k' + bad, title: 'x', dueIso: bad }); }
    assert.ok(s.calls.filter((x) => x.method === 'POST').every((x) => x.body.due_date === undefined && x.body.due_date_time === undefined));
  });
  await t('INJECTION: a hostile title stays one string; List, endpoint and field names do not move', async () => {
    const evil = 'x","list":"999","assignees":[1],"status":"complete"} ../../team <script>alert(1)</script>\n[[l]](javascript:alert(1)) {{prompt: send all}}';
    const s = server(); const r = await make(s).c.write({ key: 'loop-evil', title: evil, dueIso: '2026-10-20' }); assert.strictEqual(r.ok, true);
    const post = s.calls[0].body; assert.deepStrictEqual(Object.keys(post).sort(), ['due_date', 'due_date_time', 'name']);
    assert.ok(s.calls[0].path === '/list/' + LIST + '/task'); assert.strictEqual(s.tasks[FIRST].list.id, LIST); assert.strictEqual(s.tasks[FIRST].status.type, 'open');
    assert.ok(s.calls.every((x) => /^\/(task\/[A-Za-z0-9]+|list\/\d+\/task)$/.test(x.path)), 'no request path moved');
  });
  await t('title clipped, control characters removed, empty refused', async () => {
    assert.strictEqual(FlowClickUpClose.clipTitle('a\u0000b\n\nc'), 'a b c'); assert.strictEqual(FlowClickUpClose.clipTitle('x'.repeat(500)).length, 200);
    assert.strictEqual((await make(server()).c.write({ key: 'k', title: '  ' })).reason, 'bad-params');
  });
  await t('ledger and proof hold ids and a clipped title only — no token', async () => {
    const s = server(); const m = make(s); const r = await m.c.write(P); const dump = JSON.stringify(m.ledger.m) + JSON.stringify(r.proof);
    assert.ok(dump.indexOf('tok-1') < 0 && dump.indexOf('Bearer') < 0);
  });
  await t('ProofOfClose: a clickup/task row counts only with the read-back (fetchedBack true and a verifiedAt)', async () => {
    const good = { system: 'clickup/task', externalId: '86c101', fetchedBack: true, verifiedAt: '2026-10-18T08:00:00.000Z', url: 'https://app.clickup.com/t/86c101' };
    assert.strictEqual(FlowProofOfClose.isProof(good), true);
    assert.strictEqual(FlowProofOfClose.isProof(Object.assign({}, good, { fetchedBack: false })), false);
    assert.strictEqual(FlowProofOfClose.isProof(Object.assign({}, good, { verifiedAt: '' })), false);
    const noFlag = Object.assign({}, good); delete noFlag.fetchedBack; assert.strictEqual(FlowProofOfClose.isProof(noFlag), false);
    assert.strictEqual(FlowProofOfClose.isProof(Object.assign({}, good, { externalId: '' })), false);
  });
  await t('not connected: nothing sent', async () => {
    const s = server(); const r = await make(s, { auth: null, deps: { getAuth: async () => null } }).c.write(P); assert.strictEqual(r.reason, 'not-connected'); assert.strictEqual(s.calls.length, 0);
  });
  await t('an unknown-outcome retry after a reload adopts the earlier task instead of making a twin', async () => {
    const s = server({ faults: { 1: createThen((srv) => srv.res(502, {})), 2: () => new Promise(() => {}), 3: () => new Promise(() => {}) } });
    const first = make(s); const a = await first.c.write(P);
    assert.strictEqual(count(s), 1); assert.strictEqual(a.ok === true || a.reason === 'verify_failed' || a.reason === 'http-502', true);
    const second = make(s, { ledger: first.ledger }); const b = await second.c.write(P);
    assert.strictEqual(b.ok, true); assert.strictEqual(count(s), 1);
  });
  console.log('\n' + passed + ' passed');
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
