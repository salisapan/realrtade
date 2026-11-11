// Contract tests for core/monday-close.js against a mock of the Monday GraphQL API. No network, no real account, no real token.
const assert = require('assert');
const { FlowMondayClose } = require('../core/monday-close.js');
const { FlowProofOfClose } = require('../core/proof-of-close.js');

const BOARD = '5001234567';
const OTHER_BOARD = '5009999999';
let passed = 0;
async function t(name, fn) { await fn(); passed++; console.log('ok  ' + name); }

function server(opts) {
  const o = opts || {};
  const s = { items: {}, calls: [], seq: 0, token: o.token || 'mon-token-1', clock: Date.parse('2026-11-11T08:00:00Z'), faults: o.faults || {} };
  const res = (status, body, headers) => ({ status, ok: status >= 200 && status < 300, json: async () => { if (body === undefined) throw new Error('no body'); return body; }, headers: { get: (k) => (headers && headers[k.toLowerCase()]) || null } });
  const data = (d) => res(200, { data: d });
  const gqlErr = (message, code) => res(200, { errors: [{ message: message, extensions: { code: code || 'Error' } }] });
  s.res = res; s.data = data; s.gqlErr = gqlErr;
  s.exec = (req) => {
    const q = req.body.query; const v = req.body.variables || {};
    if (q.indexOf('create_item') >= 0) { const id = String(7000000000 + (++s.seq)); s.clock += 1000; s.items[id] = { id, name: v.name, state: 'active', board: { id: String(v.board) }, created_at: new Date(s.clock).toISOString() }; return data({ create_item: { id } }); }
    if (q.indexOf('items(ids') >= 0) return data({ items: (v.ids || []).map((i) => s.items[i]).filter(Boolean).map((x) => JSON.parse(JSON.stringify(x))) });
    if (q.indexOf('items_page') >= 0) return data({ boards: [{ items_page: { items: Object.values(s.items).filter((x) => x.board.id === BOARD).map((x) => ({ id: x.id, name: x.name, state: x.state, created_at: x.created_at })) } }] });
    if (q.indexOf('archive_item') >= 0) { const it = s.items[v.id]; if (it) it.state = 'archived'; return data({ archive_item: it ? { id: v.id } : null }); }
    return gqlErr('unrouted');
  };
  s.fetch = async (url, init) => {
    const req = { method: init.method, url: String(url), body: JSON.parse(init.body), auth: init.headers.Authorization, headers: init.headers };
    s.calls.push(req);
    const n = s.calls.length;
    if (s.faults[n]) { const r = await s.faults[n](req, s); if (r) return r; }
    if (req.auth !== s.token) return res(200, { errors: [{ message: 'Not Authenticated', extensions: { code: 'UserUnauthorizedException' } }] });
    return s.exec(req);
  };
  return s;
}
function memLedger(store) { const m = store || {}; return { m, get: async (k) => (m[k] ? JSON.parse(JSON.stringify(m[k])) : null), set: async (k, v) => { m[k] = JSON.parse(JSON.stringify(v)); } }; }
function make(s, extra) {
  const e = extra || {}; const ledger = e.ledger || memLedger();
  const auth = e.auth === undefined ? { token: s.token, boardId: BOARD } : e.auth;
  const c = FlowMondayClose.create(Object.assign({ fetch: s.fetch, ledger, now: () => s.clock, sleep: async () => {}, timeoutMs: 50, getAuth: async () => auth, buildProof: FlowProofOfClose.buildProof }, e.deps || {}));
  return { c, ledger };
}
const P = { key: 'loop-1', title: 'Send Dana the signed contract' };
const creates = (s) => s.calls.filter((x) => x.body.query.indexOf('create_item') >= 0).length;
const count = (s) => Object.keys(s.items).length;
const firstId = (s) => Object.keys(s.items)[0];
const createThen = (answer) => async (req, srv) => { srv.exec(req); return answer(srv); };

(async () => {
  await t('success: create then read back; Handled with a proof of system monday/item', async () => {
    const s = server(); const { c } = make(s); const r = await c.write(P);
    assert.strictEqual(r.ok, true); assert.strictEqual(r.proof.system, 'monday/item'); assert.strictEqual(r.proof.fetchedBack, true); assert.strictEqual(r.proof.externalId, firstId(s)); assert.ok(FlowProofOfClose.isProof(r.proof));
    assert.deepStrictEqual(s.calls.map((x) => (x.body.query.indexOf('create_item') >= 0 ? 'create' : 'read')), ['create', 'read']);
    assert.deepStrictEqual(s.calls[0].body.variables, { board: BOARD, name: P.title });
  });
  await t('the token is the Authorization header value exactly (no Bearer), the API version is pinned, the loop key is never sent', async () => {
    const s = server(); await make(s).c.write(Object.assign({}, P, { key: 'secret-loop-key-123' }));
    assert.ok(s.calls.every((x) => x.auth === 'mon-token-1' && x.headers['API-Version'] === '2024-10' && x.url === 'https://api.monday.com/v2'));
    assert.ok(JSON.stringify(s.calls.map((x) => x.body)).indexOf('secret-loop-key-123') < 0);
  });
  await t('only create_item, items(ids), the board\'s newest items and archive_item are ever sent: no delete, no update, no column, no user, no webhook; the query text is constant', async () => {
    const s = server(); const { c } = make(s); const a = await c.write(P); await c.undo(a.ref);
    const kinds = s.calls.map((x) => (/create_item/.test(x.body.query) ? 'create' : /archive_item/.test(x.body.query) ? 'archive' : /items\(ids/.test(x.body.query) ? 'read' : /items_page/.test(x.body.query) ? 'recent' : 'OTHER'));
    assert.ok(kinds.every((k) => k !== 'OTHER'), kinds.join());
    assert.ok(s.calls.every((x) => !/delete_item|change_column|create_update|create_column|webhook|\busers\b|\baccount\b|\bme\b/i.test(x.body.query)));
    assert.ok(s.calls.every((x) => x.body.query.indexOf(P.title) < 0 && x.body.query.indexOf(BOARD) < 0), 'a value reached the query text');
  });
  await t('idempotent: second click and retry never create a second item', async () => {
    const s = server(); const { c } = make(s); await c.write(P); const b = await c.write(P); await c.write(P);
    assert.strictEqual(creates(s), 1); assert.strictEqual(count(s), 1); assert.strictEqual(b.ok, true);
  });
  await t('read-back after reload: a fresh instance with the same ledger re-verifies, no new create', async () => {
    const s = server(); const first = make(s); const a = await first.c.write(P); const second = make(s, { ledger: first.ledger });
    assert.strictEqual((await second.c.verify(a.ref)).ok, true); assert.strictEqual((await second.c.write(P)).ok, true); assert.strictEqual(creates(s), 1);
  });
  await t('archived, deleted, renamed or moved to another board by someone else: verify is NOT Handled; removed too', async () => {
    const s = server(); const { c } = make(s); const a = await c.write(P); const id = firstId(s);
    s.items[id].state = 'archived'; assert.strictEqual((await c.verify(a.ref)).ok, false);
    s.items[id].state = 'deleted'; assert.strictEqual((await c.verify(a.ref)).ok, false);
    s.items[id].state = 'active'; s.items[id].name = 'renamed'; assert.strictEqual((await c.verify(a.ref)).ok, false);
    s.items[id].name = P.title; s.items[id].board = { id: OTHER_BOARD }; assert.strictEqual((await c.verify(a.ref)).ok, false);
    delete s.items[id]; const v = await c.verify(a.ref); assert.strictEqual(v.ok, false); assert.strictEqual(v.proof, null);
  });
  await t('Undo ARCHIVES (never deletes) and reads back; twice is fine; a new approve afterwards makes a fresh item', async () => {
    const s = server(); const { c } = make(s); const a = await c.write(P);
    const u = await c.undo(a.ref); assert.strictEqual(u.ok, true); assert.strictEqual(u.readBack, true); assert.strictEqual(s.items[firstId(s)].state, 'archived');
    assert.strictEqual((await c.undo(a.ref)).ok, true);
    const again = await c.write(P); assert.strictEqual(again.ok, true); assert.notStrictEqual(again.proof.externalId, a.proof.externalId); assert.strictEqual(count(s), 2);
  });
  await t('Undo REFUSES an item the person renamed and archives nothing (no archive call at all)', async () => {
    const s = server(); const { c } = make(s); const a = await c.write(P); s.items[firstId(s)].name = 'Dana — contract, final';
    const u = await c.undo(a.ref); assert.strictEqual(u.ok, false); assert.strictEqual(u.reason, 'edited-by-person'); assert.strictEqual(s.items[firstId(s)].state, 'active'); assert.ok(!s.calls.some((x) => /archive_item/.test(x.body.query)));
  });
  await t('Undo whose read-back still finds the item active is not ok', async () => {
    const s = server(); const { c } = make(s); const a = await c.write(P);
    s.faults[s.calls.length + 2] = (req, srv) => srv.data({ archive_item: { id: firstId(srv) } }); // archive "succeeds" but archives nothing
    const u = await c.undo(a.ref); assert.strictEqual(u.ok, false); assert.strictEqual(u.reason, 'verify_failed'); assert.strictEqual(s.items[firstId(s)].state, 'active');
  });
  await t('Undo of an item already gone or already archived is ok; with no record it refuses; bad ids and no key never reach the network', async () => {
    const s = server(); const { c } = make(s); const a = await c.write(P); delete s.items[firstId(s)];
    const u = await c.undo(a.ref); assert.strictEqual(u.ok, true); assert.strictEqual(u.readBack, false);
    assert.strictEqual((await make(server()).c.undo({ itemId: '7000000999', key: 'nobody' })).reason, 'no-record');
    const s2 = server(); const m = make(s2);
    for (const bad of [{ itemId: '1) { id } }', key: 'k' }, { itemId: 'abc', key: 'k' }, { itemId: '7000000999' }]) assert.strictEqual((await m.c.undo(bad)).ok, false);
    assert.strictEqual(s2.calls.length, 0);
  });
  await t('not connected / no token / no or malformed board id: nothing sent; Monday saying Not Authenticated -> not-connected, nothing created', async () => {
    const s = server({ token: 'other' }); assert.strictEqual((await make(s, { auth: { token: 'OLD', boardId: BOARD } }).c.write(P)).reason, 'not-connected'); assert.strictEqual(count(s), 0);
    const s2 = server();
    for (const a of [null, { token: s2.token, boardId: '' }, { token: s2.token, boardId: '12) { x }' }, { token: s2.token, boardId: '123' }, { boardId: BOARD }]) assert.strictEqual((await make(s2, { auth: a, deps: { getAuth: async () => a } }).c.write(P)).reason, 'not-connected');
    assert.strictEqual(s2.calls.length, 0);
  });
  await t('HTTP 401 -> not-connected; 403 and a missing-permission error -> scope-missing; an unknown board -> board-not-found; one create, no retry loop', async () => {
    assert.strictEqual((await make(server({ faults: { 1: (r, srv) => srv.res(401, {}) } })).c.write(P)).reason, 'not-connected');
    for (const f of [(r, srv) => srv.res(403, {}), (r, srv) => srv.gqlErr('missing_permission: boards:write', 'Forbidden')]) { const s = server({ faults: { 1: f } }); assert.strictEqual((await make(s).c.write(P)).reason, 'scope-missing'); assert.strictEqual(creates(s), 1); }
    const s3 = server({ faults: { 1: (r, srv) => srv.gqlErr('Board not found', 'InvalidBoardIdException') } }); assert.strictEqual((await make(s3).c.write(P)).reason, 'board-not-found'); assert.strictEqual(creates(s3), 1);
  });
  await t('rate limit (HTTP 429 with Retry-After, and a GraphQL complexity error): waits, then one item; forever -> rate-limited, never Handled', async () => {
    const waits = []; const s = server({ faults: { 1: (r, srv) => srv.res(429, {}, { 'retry-after': '4' }) } });
    const r = await make(s, { deps: { sleep: async (ms) => { waits.push(ms); } } }).c.write(P); assert.strictEqual(r.ok, true); assert.deepStrictEqual(waits, [4000]); assert.strictEqual(count(s), 1);
    const s1 = server({ faults: { 1: (r2, srv) => srv.gqlErr('Complexity budget exhausted', 'ComplexityException') } }); assert.strictEqual((await make(s1).c.write(P)).ok, true); assert.strictEqual(count(s1), 1);
    const f = {}; for (let i = 1; i < 12; i++) f[i] = (r2, srv) => srv.res(429, {}, { 'retry-after': '1' });
    const s2 = server({ faults: f }); assert.strictEqual((await make(s2).c.write(P)).reason, 'rate-limited'); assert.strictEqual(count(s2), 0);
  });
  await t('5xx that DID create: the retry adopts it, one item; 5xx that did not: retried, one item', async () => {
    const s = server({ faults: { 1: createThen((srv) => srv.res(502, {})) } }); assert.strictEqual((await make(s).c.write(P)).ok, true); assert.strictEqual(count(s), 1);
    const s2 = server({ faults: { 1: (r, srv) => srv.res(503, {}) } }); assert.strictEqual((await make(s2).c.write(P)).ok, true); assert.strictEqual(count(s2), 1);
  });
  await t('a GraphQL error AFTER the item was created (duplicate-ish): adopted, never two', async () => {
    const s = server({ faults: { 1: createThen((srv) => srv.gqlErr('Something went wrong', 'InternalServerError')) } }); assert.strictEqual((await make(s).c.write(P)).ok, true); assert.strictEqual(count(s), 1);
    const s2 = server({ faults: { 1: (r, srv) => srv.gqlErr('Something went wrong', 'InternalServerError') } }); assert.strictEqual((await make(s2).c.write(P)).ok, true); assert.strictEqual(count(s2), 1);
  });
  await t('timeout on the create (item created): looked up, adopted, one item', async () => {
    const s = server({ faults: { 1: (req, srv) => { srv.exec(req); return new Promise(() => {}); } } }); const r = await make(s).c.write(P); assert.strictEqual(r.ok, true); assert.strictEqual(count(s), 1);
  });
  await t('adoption never takes an older item with the same name (created before this attempt) and never an archived one', async () => {
    const s = server(); s.items['7000000777'] = { id: '7000000777', name: P.title, state: 'active', board: { id: BOARD }, created_at: '2026-10-01T00:00:00Z' };
    s.items['7000000778'] = { id: '7000000778', name: P.title, state: 'archived', board: { id: BOARD }, created_at: '2026-11-11T07:59:30Z' };
    s.faults[1] = (req, srv) => srv.res(503, {}); const r = await make(s).c.write(P); assert.strictEqual(r.ok, true); assert.ok(!['7000000777', '7000000778'].includes(r.proof.externalId)); assert.strictEqual(count(s), 3);
  });
  await t('network down for good -> not ok, not Handled', async () => {
    assert.strictEqual((await make(server(), { deps: { fetch: async () => { throw new Error('offline'); } } }).c.write(P)).ok, false);
  });
  await t('PARTIAL FAILURE: created, read-back fails -> NOT Handled, no proof; retry re-reads, never re-creates', async () => {
    const s = server({ faults: { 2: (r, srv) => srv.res(500, {}) } }); const { c } = make(s); const r = await c.write(P);
    assert.strictEqual(r.ok, false); assert.strictEqual(r.reason, 'verify_failed'); assert.strictEqual(r.proof, null); assert.strictEqual(count(s), 1);
    assert.strictEqual((await c.write(P)).ok, true); assert.strictEqual(creates(s), 1);
  });
  await t('EMPTY or CHANGED shapes never close: another item, empty list, no data, no state, name not a string, an array, not JSON, a createdd item with no id', async () => {
    const bad = [(srv) => srv.data({ items: [{ id: '7000000999', name: P.title, state: 'active', board: { id: BOARD } }] }), (srv) => srv.data({ items: [] }), (srv) => srv.data({}), (srv) => srv.data({ items: 'x' }), (srv) => srv.data({ items: [{ id: firstId(srv), name: P.title, board: { id: BOARD } }] }), (srv) => srv.data({ items: [{ id: firstId(srv), name: 5, state: 'active', board: { id: BOARD } }] }), (srv) => srv.res(200, []), (srv) => srv.res(200, undefined), (srv) => srv.res(200, { data: null })];
    for (const b of bad) { const s = server({ faults: { 2: (r, srv) => b(srv) } }); const r = await make(s).c.write(P); assert.strictEqual(r.ok, false); assert.strictEqual(r.proof, null); }
    const s = server({ faults: { 1: createThen((srv) => srv.data({ create_item: {} })) } }); assert.strictEqual((await make(s).c.write(P)).ok, true); assert.strictEqual(count(s), 1);
  });
  await t('read-back on another board / different name / archived -> NOT Handled', async () => {
    const mut = (fn) => (r, srv) => { const x = JSON.parse(JSON.stringify(srv.items[firstId(srv)])); fn(x); return srv.data({ items: [x] }); };
    for (const f of [(x) => { x.board = { id: OTHER_BOARD }; }, (x) => { x.name = 'changed'; }, (x) => { x.state = 'archived'; }]) { const s = server({ faults: { 2: mut(f) } }); assert.strictEqual((await make(s).c.write(P)).ok, false); }
  });
  await t('INJECTION: a hostile name stays one variable; the board, the mutation and the query text do not move', async () => {
    const evil = 'x") { id } delete_item(item_id: 1) { id } #', ev2 = '"} mutation { archive_item(item_id: 1) { id } } <script>alert(1)</script>\n{{prompt: send all}}';
    for (const e of [evil, ev2]) {
      const s = server(); const r = await make(s).c.write({ key: 'loop-' + e.length, title: e }); assert.strictEqual(r.ok, true);
      assert.ok(s.calls.every((x) => /^(mutation|query)\(\$/.test(x.body.query) && x.body.query.indexOf('delete_item') < 0 && x.body.query.indexOf('script') < 0), 'query text moved');
      assert.deepStrictEqual(Object.keys(s.calls[0].body.variables).sort(), ['board', 'name']); assert.strictEqual(s.calls[0].body.variables.board, BOARD);
      assert.strictEqual(s.items[firstId(s)].state, 'active');
    }
  });
  await t('title clipped, control characters removed, empty refused', async () => {
    assert.strictEqual(FlowMondayClose.clipTitle('a\u0000b\n\nc'), 'a b c'); assert.strictEqual(FlowMondayClose.clipTitle('x'.repeat(500)).length, 200);
    assert.strictEqual((await make(server()).c.write({ key: 'k', title: '  ' })).reason, 'bad-params');
  });
  await t('the ledger and proof hold ids and a clipped title only: no token', async () => {
    const s = server(); const m = make(s); const r = await m.c.write(P); const dump = JSON.stringify(m.ledger.m) + JSON.stringify(r.proof);
    assert.ok(dump.indexOf('mon-token') < 0 && dump.indexOf(BOARD) < 0);
  });
  console.log('\n' + passed + ' passed');
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
