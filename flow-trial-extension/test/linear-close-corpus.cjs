// Contract tests for core/linear-close.js against a mock of the Linear GraphQL API. No network, no real account, no real key.
const assert = require('assert');
const { FlowLinearClose } = require('../core/linear-close.js');
const { FlowProofOfClose } = require('../core/proof-of-close.js');

const TEAM = 'a1b2c3d4-0000-4000-8000-000000000001';
const URLBASE = 'https://linear.app/acme/issue/';
let passed = 0;
async function t(name, fn) { await fn(); passed++; console.log('ok  ' + name); }
const uuid = (n) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');

function server(opts) {
  const o = opts || {};
  const s = { issues: {}, calls: [], seq: 0, token: o.token || 'tok-1', clock: Date.parse('2026-10-19T08:00:00Z'), faults: o.faults || {}, ignoreClientId: !!o.ignoreClientId, hardDelete: !!o.hardDelete, noDelete: !!o.noDelete };
  const res = (status, body, headers) => ({ status, ok: status >= 200 && status < 300, json: async () => { if (body === undefined) throw new Error('no body'); return body; }, headers: { get: (k) => (headers && headers[k.toLowerCase()]) || null } });
  const notFound = () => res(200, { data: null, errors: [{ message: 'Entity not found: Issue - Could not find referenced Issue.', extensions: { type: 'invalid input', code: 'INVALID_INPUT', userError: true } }] });
  s.res = res;
  s.exec = (req) => {
    const q = req.body.query; const v = req.body.variables || {};
    if (q.indexOf('issueCreate') >= 0) {
      const inp = v.input; s.clock += 1000;
      const id = s.ignoreClientId ? uuid(900 + (++s.seq)) : inp.id;
      if (s.issues[id]) return res(200, { data: null, errors: [{ message: 'Duplicate id', extensions: { code: 'INVALID_INPUT' } }] });
      s.issues[id] = { id, identifier: 'ENG-' + (100 + (++s.seq)), title: inp.title, url: URLBASE + 'ENG-' + (100 + s.seq), dueDate: inp.dueDate || null, trashed: false, archivedAt: null, completedAt: null, canceledAt: null, team: { id: inp.teamId }, createdAt: new Date(s.clock).toISOString() };
      return res(200, { data: { issueCreate: { success: true, issue: s.issues[id] } } });
    }
    if (q.indexOf('issueDelete') >= 0) {
      if (s.noDelete) return res(200, { data: null, errors: [{ message: 'You do not have permission to delete this issue', extensions: { type: 'forbidden', code: 'FORBIDDEN' } }] });
      if (!s.issues[v.id]) return notFound();
      if (s.hardDelete) delete s.issues[v.id]; else s.issues[v.id].trashed = true;
      return res(200, { data: { issueDelete: { success: true } } });
    }
    if (q.indexOf('team(id:') >= 0) return res(200, { data: { team: { issues: { nodes: Object.values(s.issues) } } } });
    if (q.indexOf('issue(id:') >= 0) { const i = s.issues[v.id]; return i ? res(200, { data: { issue: i } }) : notFound(); }
    return res(400, { errors: [{ message: 'unrouted' }] });
  };
  s.fetch = async (url, init) => {
    assert.strictEqual(url, 'https://api.linear.app/graphql', 'every call goes to the one API endpoint');
    const req = { method: init.method, body: JSON.parse(init.body), auth: init.headers.Authorization };
    assert.strictEqual(req.method, 'POST');
    s.calls.push(req); const n = s.calls.length;
    if (s.faults[n]) { const r = await s.faults[n](req, s); if (r) return r; }
    if (req.auth !== 'Bearer ' + s.token) return res(401, { errors: [{ message: 'Authentication required', extensions: { type: 'authentication error' } }] });
    return s.exec(req);
  };
  return s;
}
function memLedger(store) { const m = store || {}; return { m, get: async (k) => (m[k] ? JSON.parse(JSON.stringify(m[k])) : null), set: async (k, v) => { m[k] = JSON.parse(JSON.stringify(v)); } }; }
const AUTH = () => ({ token: 'tok-1', refreshToken: 'r-1', teamId: TEAM, teamKey: 'ENG' });
function make(s, extra) {
  const e = extra || {}; const ledger = e.ledger || memLedger(); let seq = 0; const ids = e.ids || (() => uuid(++seq));
  let auth = e.auth === undefined ? AUTH() : e.auth; const saved = [];
  const c = FlowLinearClose.create(Object.assign({ fetch: s.fetch, ledger, now: () => s.clock, sleep: async () => {}, timeoutMs: 50, uuid: ids, getAuth: async () => auth, saveAuth: async (a) => { auth = a; saved.push(a); }, buildProof: FlowProofOfClose.buildProof }, e.deps || {}));
  return { c, ledger, saved };
}
const P = { key: 'loop-1', title: 'Send Dana the signed contract', dueIso: '2026-10-20' };
const kind = (r) => (r.body.query.match(/issueCreate|issueDelete|team\(id:|issue\(id:/) || ['?'])[0];
const creates = (s) => s.calls.filter((x) => kind(x) === 'issueCreate').length;
const count = (s) => Object.values(s.issues).filter((i) => !i.trashed).length;
const createThen = (answer) => async (req, srv) => { srv.exec(req); return answer(srv); };

(async () => {
  await t('success: create then read by id; Handled with a proof of system linear/issue and the issue url', async () => {
    const s = server(); const { c } = make(s); const r = await c.write(P);
    assert.strictEqual(r.ok, true); assert.strictEqual(r.proof.system, 'linear/issue'); assert.strictEqual(r.proof.fetchedBack, true); assert.strictEqual(r.proof.externalId, uuid(1));
    assert.strictEqual(r.proof.url, URLBASE + 'ENG-101'); assert.deepStrictEqual(s.calls.map(kind), ['issueCreate', 'issue(id:']);
    assert.deepStrictEqual(s.calls[0].body.variables, { input: { id: uuid(1), teamId: TEAM, title: P.title, dueDate: '2026-10-20' } });
  });
  await t('every value is a GraphQL variable: the query text is a constant that never contains the title, ids or team', async () => {
    const s = server(); const { c } = make(s); const a = await c.write(P); await c.undo(a.ref);
    for (const call of s.calls) { const q = call.body.query; assert.ok(q.indexOf(P.title) < 0 && q.indexOf(TEAM) < 0 && q.indexOf(uuid(1)) < 0, q); assert.ok(/^(mutation|query)\(\$/.test(q)); }
  });
  await t('only the three operations a close needs: issueCreate, issue read, issueDelete (no users, no comments, no search)', async () => {
    const s = server(); const { c } = make(s); const a = await c.write(P); await c.undo(a.ref);
    assert.ok(s.calls.every((x) => /^(issueCreate|issueDelete|issue\(id:)$/.test(kind(x))), s.calls.map(kind).join());
  });
  await t('idempotent: second click and retry never create a second issue', async () => {
    const s = server(); const { c } = make(s); await c.write(P); const b = await c.write(P); await c.write(P);
    assert.strictEqual(creates(s), 1); assert.strictEqual(count(s), 1); assert.strictEqual(b.ok, true);
  });
  await t('read-back after reload: a fresh instance with the same ledger re-verifies, no new create', async () => {
    const s = server(); const first = make(s); const a = await first.c.write(P); const second = make(s, { ledger: first.ledger });
    assert.strictEqual((await second.c.verify(a.ref)).ok, true); assert.strictEqual((await second.c.write(P)).ok, true); assert.strictEqual(creates(s), 1);
  });
  await t('completed, canceled, trashed or removed by someone else: verify is NOT Handled', async () => {
    const s = server(); const { c } = make(s); const a = await c.write(P); const i = s.issues[uuid(1)];
    i.completedAt = '2026-10-19T09:00:00Z'; assert.strictEqual((await c.verify(a.ref)).ok, false); i.completedAt = null;
    i.canceledAt = '2026-10-19T09:00:00Z'; assert.strictEqual((await c.verify(a.ref)).ok, false); i.canceledAt = null;
    i.trashed = true; assert.strictEqual((await c.verify(a.ref)).ok, false); i.trashed = false;
    delete s.issues[uuid(1)]; const v = await c.verify(a.ref); assert.strictEqual(v.ok, false); assert.strictEqual(v.proof, null);
  });
  await t('Undo deletes and reads back (trashed); twice is fine; a new approve afterwards makes a fresh issue', async () => {
    const s = server(); const { c } = make(s); const a = await c.write(P);
    const u = await c.undo(a.ref); assert.strictEqual(u.ok, true); assert.strictEqual(u.readBack, true); assert.strictEqual(s.issues[uuid(1)].trashed, true);
    assert.strictEqual((await c.undo(a.ref)).ok, true);
    const again = await c.write(P); assert.strictEqual(again.ok, true); assert.strictEqual(again.proof.externalId, uuid(2));
  });
  await t('Undo when Linear then answers "not found" (hard delete) is also confirmed', async () => {
    const s = server({ hardDelete: true }); const { c } = make(s); const a = await c.write(P); const u = await c.undo(a.ref);
    assert.strictEqual(u.ok, true); assert.strictEqual(u.readBack, true); assert.strictEqual(count(s), 0);
  });
  await t('Undo when the person may not delete (forbidden): says so, the issue stays, never claimed', async () => {
    const s = server({ noDelete: true }); const { c } = make(s); const a = await c.write(P);
    const u = await c.undo(a.ref); assert.strictEqual(u.ok, false); assert.strictEqual(u.reason, 'delete-not-permitted'); assert.strictEqual(count(s), 1);
  });
  await t('Undo whose read-back still finds a live issue is not ok and does not mark the loop undone (no duplicate on retry)', async () => {
    const s = server(); const { c, ledger } = make(s); const a = await c.write(P);
    s.faults[s.calls.length + 1] = (req, srv) => srv.res(200, { data: { issueDelete: { success: true } } }); // says success, deletes nothing
    const u = await c.undo(a.ref); assert.strictEqual(u.ok, false); assert.strictEqual(u.reason, 'verify_failed');
    assert.notStrictEqual((await ledger.get(P.key)).state, 'undone');
    assert.strictEqual((await c.write(P)).ok, true); assert.strictEqual(creates(s), 1);
  });
  await t('Undo of an issue already gone is ok without claiming a read-back; non-uuid ids are refused before any call', async () => {
    const s = server(); const { c } = make(s); const u = await c.undo({ issueId: uuid(77), key: 'k' }); assert.strictEqual(u.ok, true); assert.strictEqual(u.readBack, false);
    s.calls.length = 0; for (const bad of ['ENG-1', '../x', "x') { issueDelete", '']) assert.strictEqual((await c.undo({ issueId: bad, key: 'k' })).ok, false);
    assert.strictEqual(s.calls.length, 0);
  });
  await t('401 -> one refresh -> retried; the new token (and rotated refresh token) saved', async () => {
    const s = server({ token: 'tok-2' }); let n = 0;
    const { c, saved } = make(s, { auth: Object.assign(AUTH(), { token: 'OLD' }), deps: { refresh: async () => { n++; return { token: 'tok-2', refreshToken: 'r-2' }; } } });
    assert.strictEqual((await c.write(P)).ok, true); assert.strictEqual(n, 1); assert.strictEqual(saved[0].refreshToken, 'r-2');
  });
  await t('an authentication error inside an HTTP 200 body is treated as 401 too', async () => {
    const s = server({ faults: { 1: (r, srv) => srv.res(200, { data: null, errors: [{ message: 'Authentication required, not authenticated', extensions: { code: 'AUTHENTICATION_ERROR' } }] }) } });
    const r = await make(s, { deps: { refresh: async () => ({ token: 'tok-1', refreshToken: 'r-2' }) } }).c.write(P); assert.strictEqual(r.ok, true); assert.strictEqual(count(s), 1);
  });
  await t('401 and refresh fails / no refresh token -> not-connected, nothing written', async () => {
    const s = server({ token: 'tok-2' });
    assert.strictEqual((await make(s, { auth: Object.assign(AUTH(), { token: 'OLD' }), deps: { refresh: async () => null } }).c.write(P)).reason, 'not-connected');
    assert.strictEqual((await make(s, { auth: Object.assign(AUTH(), { token: 'OLD', refreshToken: null }) }).c.write(P)).reason, 'not-connected');
    assert.strictEqual(count(s), 0);
  });
  await t('403 / forbidden -> scope-missing, one create, no retry loop', async () => {
    const s = server({ faults: { 1: (r, srv) => srv.res(200, { data: null, errors: [{ message: 'Forbidden', extensions: { type: 'forbidden' } }] }) } });
    const r = await make(s).c.write(P); assert.strictEqual(r.reason, 'scope-missing'); assert.strictEqual(creates(s), 1);
  });
  await t('team not found -> team-not-found; a rejected input (validation) -> rejected, not retried', async () => {
    const s = server({ faults: { 1: (r, srv) => srv.res(200, { data: null, errors: [{ message: 'Entity not found: Team', extensions: { code: 'INVALID_INPUT' } }] }) } }); assert.strictEqual((await make(s).c.write(P)).reason, 'team-not-found');
    const s2 = server({ faults: { 1: (r, srv) => srv.res(400, { errors: [{ message: 'dueDate must be a date', extensions: { code: 'INVALID_INPUT' } }] }) } }); const r2 = await make(s2).c.write(P);
    assert.strictEqual(r2.reason, 'rejected'); assert.strictEqual(creates(s2), 1);
  });
  await t('rate limit (HTTP 429 or a RATELIMITED error) with Retry-After: waits, then one issue', async () => {
    const waits = []; const s = server({ faults: { 1: (r, srv) => srv.res(429, {}, { 'retry-after': '4' }) } });
    const r = await make(s, { deps: { sleep: async (ms) => { waits.push(ms); } } }).c.write(P); assert.strictEqual(r.ok, true); assert.deepStrictEqual(waits, [4000]); assert.strictEqual(count(s), 1);
    const s2 = server({ faults: { 1: (r2, srv) => srv.res(200, { data: null, errors: [{ message: 'Rate limit exceeded', extensions: { code: 'RATELIMITED' } }] }) } });
    assert.strictEqual((await make(s2).c.write(P)).ok, true); assert.strictEqual(count(s2), 1);
  });
  await t('rate limited forever -> rate-limited, never Handled', async () => {
    const f = {}; for (let i = 1; i < 10; i++) f[i] = (r, srv) => srv.res(429, {}, { 'retry-after': '1' });
    const s = server({ faults: f }); const r = await make(s).c.write(P); assert.strictEqual(r.reason, 'rate-limited'); assert.strictEqual(count(s), 0);
  });
  await t('5xx that DID create: the retry reads the SAME client id and adopts it, one issue', async () => {
    const s = server({ faults: { 1: createThen((srv) => srv.res(502, {})) } }); const r = await make(s).c.write(P); assert.strictEqual(r.ok, true); assert.strictEqual(count(s), 1); assert.strictEqual(creates(s), 1);
  });
  await t('5xx that did NOT create: retried with the same id, one issue', async () => {
    const s = server({ faults: { 1: (r, srv) => srv.res(503, {}) } }); const r = await make(s).c.write(P); assert.strictEqual(r.ok, true); assert.strictEqual(count(s), 1);
    const ids = s.calls.filter((x) => kind(x) === 'issueCreate').map((x) => x.body.variables.input.id); assert.strictEqual(new Set(ids).size, 1);
  });
  await t('a duplicate-id error (409-like) after a create that landed: adopted, never two', async () => {
    const s = server({ faults: { 1: createThen((srv) => srv.res(200, { data: null, errors: [{ message: 'conflict', extensions: { code: 'CONFLICT' } }] })) } });
    const r = await make(s).c.write(P); assert.strictEqual(r.ok, true); assert.strictEqual(count(s), 1);
  });
  await t('timeout on the create (issue created): read by id, adopted, one issue', async () => {
    const s = server({ faults: { 1: (req, srv) => { srv.exec(req); return new Promise(() => {}); } } }); const r = await make(s).c.write(P); assert.strictEqual(r.ok, true); assert.strictEqual(count(s), 1);
  });
  await t('network down for good -> not ok, not Handled', async () => {
    const s = server(); const r = await make(s, { deps: { fetch: async () => { throw new Error('offline'); } } }).c.write(P); assert.strictEqual(r.ok, false);
  });
  await t('crash between the create and its answer: the next attempt finds the stored id and adopts the issue', async () => {
    const s = server(); const m = make(s); await m.ledger.set(P.key, { state: 'pending', pendingId: uuid(1), title: P.title, at: s.clock });
    s.exec({ body: { query: 'issueCreate', variables: { input: { id: uuid(1), teamId: TEAM, title: P.title } } } }); // the create had landed
    const r = await m.c.write(P); assert.strictEqual(r.ok, true); assert.strictEqual(creates(s), 0); assert.strictEqual(count(s), 1);
  });
  await t('PARTIAL FAILURE: created, read-back fails -> NOT Handled, no proof; retry re-reads, never re-creates', async () => {
    const s = server({ faults: { 2: (r, srv) => srv.res(500, {}) } }); const { c } = make(s); const r = await c.write(P);
    assert.strictEqual(r.ok, false); assert.strictEqual(r.reason, 'verify_failed'); assert.strictEqual(r.proof, null); assert.strictEqual(count(s), 1);
    assert.strictEqual((await c.write(P)).ok, true); assert.strictEqual(creates(s), 1);
  });
  await t('read-back answers another issue / empty / null / changed shape -> NOT Handled', async () => {
    for (const bad of [(srv) => srv.res(200, { data: { issue: { id: uuid(50), title: P.title, team: { id: TEAM } } } }), (srv) => srv.res(200, {}), (srv) => srv.res(200, undefined), (srv) => srv.res(200, { data: { issue: null } }), (srv) => srv.res(200, { data: { issue: [] } })]) {
      const s = server({ faults: { 2: (r, srv) => bad(srv) } }); const r = await make(s).c.write(P); assert.strictEqual(r.ok, false); assert.strictEqual(r.proof, null);
    }
  });
  await t('read-back in another team / different title / already completed / trashed -> NOT Handled', async () => {
    const mut = (fn) => (r, srv) => { const i = JSON.parse(JSON.stringify(srv.issues[uuid(1)])); fn(i); return srv.res(200, { data: { issue: i } }); };
    for (const f of [(i) => { i.team = { id: uuid(99) }; }, (i) => { i.title = 'changed'; }, (i) => { i.completedAt = 'x'; }, (i) => { i.trashed = true; }]) {
      const s = server({ faults: { 2: mut(f) } }); assert.strictEqual((await make(s).c.write(P)).ok, false);
    }
  });
  await t('create answers success:false or an issue without an id: looked up by id, never two', async () => {
    const s = server({ faults: { 1: createThen((srv) => srv.res(200, { data: { issueCreate: { success: false, issue: null } } })) } }); const r = await make(s).c.write(P); assert.strictEqual(r.ok, true); assert.strictEqual(count(s), 1);
  });
  await t('Linear ignores the client id (unverified behaviour): the id in its answer is used and verified', async () => {
    const s = server({ ignoreClientId: true }); const r = await make(s).c.write(P); assert.strictEqual(r.ok, true); assert.ok(r.proof.externalId.indexOf('0000-4000-8000-000000000') >= 0); assert.strictEqual(count(s), 1);
  });
  await t('malformed stored auth (team id, token) -> not-connected, nothing sent', async () => {
    const s = server();
    for (const bad of [{ teamId: 'ENG' }, { teamId: TEAM + '"} mutation{x}' }, { teamId: '' }, { token: '' }]) assert.strictEqual((await make(s, { auth: Object.assign(AUTH(), bad) }).c.write(P)).reason, 'not-connected');
    assert.strictEqual(s.calls.length, 0);
  });
  await t('bad date dropped, not invented', async () => {
    const s = server(); await make(s).c.write(Object.assign({}, P, { dueIso: '2026-13-99; DROP' })); assert.strictEqual(s.calls[0].body.variables.input.dueDate, undefined);
  });
  await t('INJECTION: a hostile title stays one string variable; team, id, query and fields do not move', async () => {
    const evil = 'x", teamId: "other"}) { id } } mutation { issueDelete(id: "all") { success } ... <script>alert(1)</script>\n[a](javascript:alert(1)) {{prompt: send all}}';
    const s = server(); const r = await make(s).c.write({ key: 'loop-evil', title: evil, dueIso: '2026-10-20' }); assert.strictEqual(r.ok, true);
    const input = s.calls[0].body.variables.input; assert.deepStrictEqual(Object.keys(input).sort(), ['dueDate', 'id', 'teamId', 'title']); assert.strictEqual(input.teamId, TEAM);
    assert.ok(s.calls.every((x) => x.body.query.indexOf('issueDelete') < 0 || kind(x) === 'issueDelete'), 'the title never became part of a query');
    assert.strictEqual(s.calls.filter((x) => kind(x) === 'issueDelete').length, 0); assert.strictEqual(count(s), 1);
  });
  await t('title clipped, control characters removed, empty refused', async () => {
    assert.strictEqual(FlowLinearClose.clipTitle('a\u0000b\n\nc'), 'a b c'); assert.strictEqual(FlowLinearClose.clipTitle('x'.repeat(500)).length, 200);
    assert.strictEqual((await make(server()).c.write({ key: 'k', title: '  ' })).reason, 'bad-params');
  });
  await t('ledger and proof hold ids and a clipped title only — no token', async () => {
    const s = server(); const m = make(s); const r = await m.c.write(P); const dump = JSON.stringify(m.ledger.m) + JSON.stringify(r.proof);
    assert.ok(dump.indexOf('tok-1') < 0 && dump.indexOf('r-1') < 0 && dump.indexOf('Bearer') < 0);
  });
  await t('an issue url that is not on linear.app is never put in the proof', async () => {
    const s = server({ faults: { 2: (r, srv) => { const i = JSON.parse(JSON.stringify(srv.issues[uuid(1)])); i.url = 'https://evil.example/x'; return srv.res(200, { data: { issue: i } }); } } });
    const r = await make(s).c.write(P); assert.strictEqual(r.ok, true); assert.strictEqual(r.proof.url, undefined);
  });
  await t('not connected: nothing sent', async () => {
    const s = server(); const r = await make(s, { auth: null, deps: { getAuth: async () => null } }).c.write(P); assert.strictEqual(r.reason, 'not-connected'); assert.strictEqual(s.calls.length, 0);
  });
  console.log('\n' + passed + ' passed');
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
