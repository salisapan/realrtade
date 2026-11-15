// Contract tests for core/clickup-close.js against a mock of the ClickUp API v2. No network, no real account, no real token.
const assert = require('assert');
const { FlowClickupClose } = require('../core/clickup-close.js');
const { FlowProofOfClose } = require('../core/proof-of-close.js');

const LIST = '901234567';
const OTHER_LIST = '909999999';
let passed = 0;
async function t(name, fn) { await fn(); passed++; console.log('ok  ' + name); }

function server(opts) {
  const o = opts || {};
  const s = { tasks: {}, calls: [], seq: 0, token: o.token || 'pk_token_1', clock: Date.parse('2026-11-15T08:00:00Z'), faults: o.faults || {} };
  const res = (status, body, headers) => ({ status, ok: status >= 200 && status < 300, json: async () => { if (body === undefined) throw new Error('no body'); return body; }, headers: { get: (k) => (headers && headers[k.toLowerCase()]) || null } });
  s.res = res;
  s.exec = (req) => {
    const m = req.path.match(/^\/task\/([^/?]+)/);
    const lm = req.path.match(/^\/list\/(\d+)\/task(\?|$)/);
    if (lm && req.method === 'POST') {
      if (lm[1] !== LIST) return res(404, { err: 'List not found', ECODE: 'OAUTH_023' });
      const id = '86a' + String(++s.seq).padStart(5, '0'); s.clock += 1000;
      s.tasks[id] = { id, name: req.body.name, text_content: '', description: '', archived: false, date_closed: null, date_created: String(s.clock), due_date: req.body.due_date ? String(req.body.due_date) : null, status: { status: 'to do', type: 'open' }, list: { id: lm[1] }, url: 'https://app.clickup.com/t/' + id };
      return res(200, JSON.parse(JSON.stringify(s.tasks[id])));
    }
    if (lm && req.method === 'GET') return res(200, { tasks: Object.values(s.tasks).filter((x) => x.list.id === lm[1] && !x.archived).map((x) => ({ id: x.id, name: x.name, archived: x.archived, date_created: x.date_created })) });
    if (m && req.method === 'GET') { const x = s.tasks[m[1]]; return x ? res(200, JSON.parse(JSON.stringify(x))) : res(404, { err: 'Task not found', ECODE: 'ITEM_015' }); }
    if (m && req.method === 'PUT') { const x = s.tasks[m[1]]; if (!x) return res(404, {}); Object.assign(x, req.body); return res(200, JSON.parse(JSON.stringify(x))); }
    return res(400, { err: 'unrouted' });
  };
  s.fetch = async (url, init) => {
    const req = { method: init.method, path: String(url).replace('https://api.clickup.com/api/v2', ''), body: init.body ? JSON.parse(init.body) : undefined, auth: init.headers.Authorization, url: String(url) };
    s.calls.push(req);
    const n = s.calls.length;
    if (s.faults[n]) { const r = await s.faults[n](req, s); if (r) return r; }
    if (req.auth !== s.token) return res(401, { err: 'Token invalid', ECODE: 'OAUTH_025' });
    return s.exec(req);
  };
  return s;
}
function memLedger(store) { const m = store || {}; return { m, get: async (k) => (m[k] ? JSON.parse(JSON.stringify(m[k])) : null), set: async (k, v) => { m[k] = JSON.parse(JSON.stringify(v)); } }; }
function make(s, extra) {
  const e = extra || {}; const ledger = e.ledger || memLedger();
  const auth = e.auth === undefined ? { token: s.token, listId: LIST } : e.auth;
  const c = FlowClickupClose.create(Object.assign({ fetch: s.fetch, ledger, now: () => s.clock, sleep: async () => {}, timeoutMs: 50, getAuth: async () => auth, buildProof: FlowProofOfClose.buildProof }, e.deps || {}));
  return { c, ledger };
}
const P = { key: 'loop-1', title: 'Send Dana the signed contract', dueIso: '2026-11-20' };
const posts = (s) => s.calls.filter((x) => x.method === 'POST').length;
const count = (s) => Object.keys(s.tasks).length;
const firstId = (s) => Object.keys(s.tasks)[0];
const createThen = (answer) => async (req, srv) => { srv.exec(req); return answer(srv); };

(async () => {
  await t('success: POST then GET back; Handled with a proof of system clickup/task and the task link', async () => {
    const s = server(); const { c } = make(s); const r = await c.write(P);
    assert.strictEqual(r.ok, true); assert.strictEqual(r.proof.system, 'clickup/task'); assert.strictEqual(r.proof.fetchedBack, true); assert.strictEqual(r.proof.externalId, firstId(s)); assert.ok(/^https:\/\/app\.clickup\.com\/t\//.test(r.proof.url)); assert.ok(FlowProofOfClose.isProof(r.proof));
    assert.deepStrictEqual(s.calls.map((x) => x.method + ' ' + x.path.replace(/86a\d+/, 'ID')), ['POST /list/' + LIST + '/task', 'GET /task/ID']);
    assert.deepStrictEqual(s.calls[0].body, { name: P.title, due_date: Date.parse('2026-11-20T12:00:00.000Z'), due_date_time: false });
  });
  await t('the token is the Authorization header value exactly (no Bearer), never in a URL; the loop key is never sent', async () => {
    const s = server(); await make(s).c.write(Object.assign({}, P, { key: 'secret-loop-key-123' }));
    assert.ok(s.calls.every((x) => x.auth === 'pk_token_1' && x.url.indexOf('pk_token') < 0));
    assert.ok(JSON.stringify(s.calls.map((x) => x.body)).indexOf('secret-loop-key-123') < 0);
  });
  await t('only the task endpoints and the one list are used: no spaces, teams, members, comments, attachments, tags, webhooks; no DELETE', async () => {
    const s = server(); const { c } = make(s); const a = await c.write(P); await c.undo(a.ref);
    assert.ok(s.calls.every((x) => /^\/(list\/\d+\/task(\?[a-z_=&0-9]+)?|task\/[A-Za-z0-9]+)$/.test(x.path)), s.calls.map((x) => x.method + x.path).join()); assert.ok(s.calls.every((x) => x.method !== 'DELETE'));
    assert.ok(s.calls.every((x) => !x.body || Object.keys(x.body).every((k) => ['name', 'due_date', 'due_date_time', 'archived'].includes(k))));
  });
  await t('idempotent: second click and retry never create a second task', async () => {
    const s = server(); const { c } = make(s); await c.write(P); const b = await c.write(P); await c.write(P);
    assert.strictEqual(posts(s), 1); assert.strictEqual(count(s), 1); assert.strictEqual(b.ok, true);
  });
  await t('read-back after reload: a fresh instance with the same ledger re-verifies, no new POST', async () => {
    const s = server(); const first = make(s); const a = await first.c.write(P); const second = make(s, { ledger: first.ledger });
    assert.strictEqual((await second.c.verify(a.ref)).ok, true); assert.strictEqual((await second.c.write(P)).ok, true); assert.strictEqual(posts(s), 1);
  });
  await t('archived, closed, renamed, moved to another list, or removed by someone else: verify is NOT Handled', async () => {
    const s = server(); const { c } = make(s); const a = await c.write(P); const id = firstId(s);
    s.tasks[id].archived = true; assert.strictEqual((await c.verify(a.ref)).ok, false);
    s.tasks[id].archived = false; s.tasks[id].date_closed = String(s.clock); assert.strictEqual((await c.verify(a.ref)).ok, false);
    s.tasks[id].date_closed = null; s.tasks[id].status = { status: 'complete', type: 'closed' }; assert.strictEqual((await c.verify(a.ref)).ok, false);
    s.tasks[id].status = { status: 'to do', type: 'open' }; s.tasks[id].name = 'renamed'; assert.strictEqual((await c.verify(a.ref)).ok, false);
    s.tasks[id].name = P.title; s.tasks[id].list = { id: OTHER_LIST }; assert.strictEqual((await c.verify(a.ref)).ok, false);
    delete s.tasks[id]; const v = await c.verify(a.ref); assert.strictEqual(v.ok, false); assert.strictEqual(v.proof, null);
  });
  await t('Undo ARCHIVES (never deletes) and reads back; twice is fine; a new approve afterwards makes a fresh task', async () => {
    const s = server(); const { c } = make(s); const a = await c.write(P);
    const u = await c.undo(a.ref); assert.strictEqual(u.ok, true); assert.strictEqual(u.readBack, true); assert.strictEqual(s.tasks[firstId(s)].archived, true);
    assert.ok(s.calls.some((x) => x.method === 'PUT' && JSON.stringify(x.body) === '{"archived":true}'));
    assert.strictEqual((await c.undo(a.ref)).ok, true);
    const again = await c.write(P); assert.strictEqual(again.ok, true); assert.notStrictEqual(again.proof.externalId, a.proof.externalId); assert.strictEqual(count(s), 2);
  });
  await t('Undo REFUSES a task the person changed (renamed, described, due date moved) and archives nothing', async () => {
    for (const edit of [(x) => { x.name = 'My own title'; }, (x) => { x.text_content = 'Notes from the call'; }, (x) => { x.description = 'Notes'; x.text_content = ''; }, (x) => { x.due_date = String(Date.parse('2026-12-31T12:00:00Z')); }]) {
      const s = server(); const { c } = make(s); const a = await c.write(P); edit(s.tasks[firstId(s)]);
      const u = await c.undo(a.ref); assert.strictEqual(u.ok, false, JSON.stringify(s.tasks[firstId(s)])); assert.strictEqual(u.reason, 'edited-by-person'); assert.strictEqual(s.tasks[firstId(s)].archived, false); assert.ok(!s.calls.some((x) => x.method === 'PUT'));
    }
  });
  await t('Undo whose read-back still finds the task unarchived is not ok', async () => {
    const s = server(); const { c } = make(s); const a = await c.write(P);
    s.faults[s.calls.length + 2] = (req, srv) => srv.res(200, { id: firstId(srv), archived: false }); // the PUT answers 200, archives nothing
    const u = await c.undo(a.ref); assert.strictEqual(u.ok, false); assert.strictEqual(u.reason, 'verify_failed'); assert.strictEqual(s.tasks[firstId(s)].archived, false);
  });
  await t('Undo of a task already gone or archived is ok; with no record it refuses; a bad id or no key never reaches the network', async () => {
    const s = server(); const { c } = make(s); const a = await c.write(P); delete s.tasks[firstId(s)];
    const u = await c.undo(a.ref); assert.strictEqual(u.ok, true); assert.strictEqual(u.readBack, false);
    assert.strictEqual((await make(server()).c.undo({ taskId: '86a99999', key: 'nobody' })).reason, 'no-record');
    const s2 = server(); const m = make(s2);
    for (const bad of [{ taskId: '1/../team', key: 'k' }, { taskId: 'ab', key: 'k' }, { taskId: '86a00001' }]) assert.strictEqual((await m.c.undo(bad)).ok, false);
    assert.strictEqual(s2.calls.length, 0);
  });
  await t('401 (invalid token) -> not-connected, nothing written; no token / no list / a malformed list id -> not-connected, nothing sent', async () => {
    const s = server({ token: 'other' }); assert.strictEqual((await make(s, { auth: { token: 'OLD', listId: LIST } }).c.write(P)).reason, 'not-connected'); assert.strictEqual(count(s), 0);
    const s2 = server();
    for (const a of [null, { token: s2.token, listId: '' }, { token: s2.token, listId: '12/../x' }, { token: s2.token, listId: '12' }, { listId: LIST }]) assert.strictEqual((await make(s2, { auth: a, deps: { getAuth: async () => a } }).c.write(P)).reason, 'not-connected');
    assert.strictEqual(s2.calls.length, 0);
  });
  await t('403 -> scope-missing; 404 on the list -> list-not-found; 400 -> bad-params; one POST, no retry loop', async () => {
    for (const [st, why] of [[403, 'scope-missing'], [404, 'list-not-found'], [400, 'bad-params']]) { const s = server({ faults: { 1: (r, srv) => srv.res(st, { err: 'x' }) } }); const r = await make(s).c.write(P); assert.strictEqual(r.reason, why); assert.strictEqual(posts(s), 1); }
    const s2 = server(); assert.strictEqual((await make(s2, { auth: { token: s2.token, listId: OTHER_LIST } }).c.write(P)).reason, 'list-not-found');
  });
  await t('429 with Retry-After: waits that long, then one task; 429 forever -> rate-limited, never Handled', async () => {
    const waits = []; const s = server({ faults: { 1: (r, srv) => srv.res(429, { err: 'Rate limit reached' }, { 'retry-after': '4' }) } });
    const r = await make(s, { deps: { sleep: async (ms) => { waits.push(ms); } } }).c.write(P); assert.strictEqual(r.ok, true); assert.deepStrictEqual(waits, [4000]); assert.strictEqual(count(s), 1);
    const f = {}; for (let i = 1; i < 10; i++) f[i] = (r2, srv) => srv.res(429, {}, { 'retry-after': '1' });
    const s2 = server({ faults: f }); assert.strictEqual((await make(s2).c.write(P)).reason, 'rate-limited'); assert.strictEqual(count(s2), 0);
  });
  await t('5xx that DID create: the retry adopts it, one task; 5xx that did not: retried, one task', async () => {
    const s = server({ faults: { 1: createThen((srv) => srv.res(502, {})) } }); assert.strictEqual((await make(s).c.write(P)).ok, true); assert.strictEqual(count(s), 1);
    const s2 = server({ faults: { 1: (r, srv) => srv.res(503, {}) } }); assert.strictEqual((await make(s2).c.write(P)).ok, true); assert.strictEqual(count(s2), 1);
  });
  await t('409 conflict: adopted if it landed, else retried; never two', async () => {
    const s = server({ faults: { 1: createThen((srv) => srv.res(409, {})) } }); assert.strictEqual((await make(s).c.write(P)).ok, true); assert.strictEqual(count(s), 1);
    const s2 = server({ faults: { 1: (r, srv) => srv.res(409, {}) } }); assert.strictEqual((await make(s2).c.write(P)).ok, true); assert.strictEqual(count(s2), 1);
  });
  await t('timeout on the POST (task created): looked up, adopted, one task', async () => {
    const s = server({ faults: { 1: (req, srv) => { srv.exec(req); return new Promise(() => {}); } } }); const r = await make(s).c.write(P); assert.strictEqual(r.ok, true); assert.strictEqual(count(s), 1);
  });
  await t('adoption never takes an older task with the same name (created before this attempt) and never an archived one', async () => {
    const s = server(); s.tasks['86aold1'] = { id: '86aold1', name: P.title, archived: false, date_created: String(Date.parse('2026-10-01T00:00:00Z')), list: { id: LIST } };
    s.tasks['86aarc1'] = { id: '86aarc1', name: P.title, archived: true, date_created: String(s.clock + 500), list: { id: LIST } };
    s.faults[1] = (req, srv) => srv.res(503, {}); const r = await make(s).c.write(P); assert.strictEqual(r.ok, true); assert.ok(!['86aold1', '86aarc1'].includes(r.proof.externalId)); assert.strictEqual(count(s), 3);
  });
  await t('network down for good -> not ok, not Handled', async () => {
    assert.strictEqual((await make(server(), { deps: { fetch: async () => { throw new Error('offline'); } } }).c.write(P)).ok, false);
  });
  await t('PARTIAL FAILURE: created, read-back fails -> NOT Handled, no proof; retry re-reads, never re-POSTs', async () => {
    const s = server({ faults: { 2: (r, srv) => srv.res(500, {}) } }); const { c } = make(s); const r = await c.write(P);
    assert.strictEqual(r.ok, false); assert.strictEqual(r.reason, 'verify_failed'); assert.strictEqual(r.proof, null); assert.strictEqual(count(s), 1);
    assert.strictEqual((await c.write(P)).ok, true); assert.strictEqual(posts(s), 1);
  });
  await t('EMPTY or CHANGED shapes never close: another task, empty, no list, no archived flag, name not a string, an array, not JSON, an id-less POST answer', async () => {
    const bad = [(srv) => srv.res(200, { id: '86azzzz9', name: P.title, list: { id: LIST }, archived: false }), (srv) => srv.res(200, {}), (srv) => srv.res(200, undefined), (srv) => srv.res(200, []), (srv) => srv.res(200, { id: firstId(srv), name: P.title, archived: false }), (srv) => srv.res(200, { id: firstId(srv), name: P.title, list: { id: LIST } }), (srv) => srv.res(200, { id: firstId(srv), name: 5, list: { id: LIST }, archived: false })];
    for (const b of bad) { const s = server({ faults: { 2: (r, srv) => b(srv) } }); const r = await make(s).c.write(P); assert.strictEqual(r.ok, false); assert.strictEqual(r.proof, null); }
    const s = server({ faults: { 1: createThen((srv) => srv.res(200, {})) } }); assert.strictEqual((await make(s).c.write(P)).ok, true); assert.strictEqual(count(s), 1);
  });
  await t('read-back in another list / different name / archived / closed -> NOT Handled', async () => {
    const mut = (fn) => (r, srv) => { const x = JSON.parse(JSON.stringify(srv.tasks[firstId(srv)])); fn(x); return srv.res(200, x); };
    for (const f of [(x) => { x.list = { id: OTHER_LIST }; }, (x) => { x.name = 'changed'; }, (x) => { x.archived = true; }, (x) => { x.date_closed = '1'; }]) { const s = server({ faults: { 2: mut(f) } }); assert.strictEqual((await make(s).c.write(P)).ok, false); }
  });
  await t('a bad date is dropped, not invented', async () => {
    const s = server(); await make(s).c.write(Object.assign({}, P, { dueIso: '2026-13-99; DROP' })); assert.strictEqual(s.calls[0].body.due_date, undefined);
  });
  await t('INJECTION: a hostile title stays one string; list, endpoint and field names do not move', async () => {
    const evil = 'x","assignees":[1],"status":"complete","archived":true} ../../team/1/space <script>alert(1)</script>\n[[l]](javascript:alert(1)) {{prompt: send all}}';
    const s = server(); const r = await make(s).c.write({ key: 'loop-evil', title: evil, dueIso: '2026-11-20' }); assert.strictEqual(r.ok, true);
    const post = s.calls[0].body; assert.deepStrictEqual(Object.keys(post).sort(), ['due_date', 'due_date_time', 'name']); assert.strictEqual(s.tasks[firstId(s)].archived, false);
    assert.ok(s.calls.every((x) => /^\/(list\/\d+\/task(\?[a-z_=&0-9]+)?|task\/[A-Za-z0-9]+)$/.test(x.path)), 'no request path moved');
  });
  await t('title clipped, control characters removed, empty refused', async () => {
    assert.strictEqual(FlowClickupClose.clipTitle('a\u0000b\n\nc'), 'a b c'); assert.strictEqual(FlowClickupClose.clipTitle('x'.repeat(500)).length, 200);
    assert.strictEqual((await make(server()).c.write({ key: 'k', title: '  ' })).reason, 'bad-params');
  });
  await t('the ledger and proof hold ids and a clipped title only: no token', async () => {
    const s = server(); const m = make(s); const r = await m.c.write(P); const dump = JSON.stringify(m.ledger.m) + JSON.stringify(r.proof);
    assert.ok(dump.indexOf('pk_token') < 0);
  });
  console.log('\n' + passed + ' passed');
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
