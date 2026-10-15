// Contract tests for core/asana-close.js against a mock of the Asana API. No network, no real account, no real key.
const assert = require('assert');
const { FlowAsanaClose } = require('../core/asana-close.js');
const { FlowProofOfClose } = require('../core/proof-of-close.js');

const PROJECT = '1200000000000001';
let passed = 0;
async function t(name, fn) { await fn(); passed++; console.log('ok  ' + name); }

function server(opts) {
  const o = opts || {};
  const s = { tasks: {}, calls: [], seq: 0, token: o.token || 'tok-1', clock: Date.parse('2026-10-15T08:00:00Z'), faults: o.faults || {}, raw: {} };
  const res = (status, body, headers) => ({ status, ok: status >= 200 && status < 300, json: async () => { if (body === undefined) throw new Error('no body'); return body; }, headers: { get: (k) => (headers && headers[k.toLowerCase()]) || null } });
  s.res = res;
  s.exec = (req) => {
    const m = req.path.match(/^\/tasks\/([^/?]+)/);
    if (req.path === '/tasks' && req.method === 'POST') {
      const gid = String(1300000000000000 + (++s.seq)); s.clock += 1000;
      s.tasks[gid] = { gid, name: req.body.data.name, completed: false, due_on: req.body.data.due_on || null, permalink_url: 'https://app.asana.com/0/' + PROJECT + '/' + gid, created_at: new Date(s.clock).toISOString(), projects: req.body.data.projects.map((g) => ({ gid: g })) };
      return res(201, { data: s.tasks[gid] });
    }
    if (m && req.method === 'GET') { const t = s.tasks[m[1]]; return t ? res(200, { data: t }) : res(404, { errors: [{ message: 'task: Unknown object' }] }); }
    if (m && req.method === 'DELETE') { if (!s.tasks[m[1]]) return res(404, {}); delete s.tasks[m[1]]; return res(200, { data: {} }); }
    if (req.path.indexOf('/projects/' + PROJECT + '/tasks') === 0 && req.method === 'GET') return res(200, { data: Object.values(s.tasks) });
    return res(400, { errors: [{ message: 'unrouted' }] });
  };
  s.fetch = async (url, init) => {
    const req = { method: init.method, path: url.replace('https://app.asana.com/api/1.0', ''), body: init.body ? JSON.parse(init.body) : undefined, auth: init.headers.Authorization };
    s.calls.push(req);
    const n = s.calls.length;
    if (s.faults[n]) { const r = await s.faults[n](req, s); if (r) return r; }
    if (req.auth !== 'Bearer ' + s.token) return res(401, { errors: [{ message: 'Not Authorized' }] });
    return s.exec(req);
  };
  return s;
}
function memLedger(store) { const m = store || {}; return { m, get: async (k) => (m[k] ? JSON.parse(JSON.stringify(m[k])) : null), set: async (k, v) => { m[k] = JSON.parse(JSON.stringify(v)); } }; }
function make(s, extra) {
  const e = extra || {}; const ledger = e.ledger || memLedger();
  let auth = e.auth === undefined ? { token: s.token, refreshToken: 'r-1', projectGid: PROJECT } : e.auth; const saved = [];
  const c = FlowAsanaClose.create(Object.assign({ fetch: s.fetch, ledger, now: () => s.clock, sleep: async () => {}, timeoutMs: 50, getAuth: async () => auth, saveAuth: async (a) => { auth = a; saved.push(a); }, buildProof: FlowProofOfClose.buildProof }, e.deps || {}));
  return { c, ledger, saved };
}
const P = { key: 'loop-1', title: 'Send Dana the signed contract', dueIso: '2026-10-20' };
const posts = (s) => s.calls.filter((x) => x.method === 'POST' && x.path === '/tasks').length;
const count = (s) => Object.keys(s.tasks).length;
// a fault that runs the real POST (the task IS created) and then answers with something else
const createThen = (answer) => async (req, srv) => { srv.exec(req); return answer(srv); };

(async () => {
  await t('success: POST then GET back; Handled with a proof of system asana/task', async () => {
    const s = server(); const { c } = make(s); const r = await c.write(P);
    assert.strictEqual(r.ok, true); assert.strictEqual(r.proof.system, 'asana/task'); assert.strictEqual(r.proof.fetchedBack, true);
    assert.strictEqual(r.proof.externalId, '1300000000000001'); assert.ok(/^https:\/\/app\.asana\.com\//.test(r.proof.url));
    assert.deepStrictEqual(s.calls.map((x) => x.method + ' ' + x.path.split('?')[0].replace(/\d{16}/, 'G')), ['POST /tasks', 'GET /tasks/G']);
    assert.deepStrictEqual(s.calls[0].body, { data: { name: P.title, projects: [PROJECT], due_on: '2026-10-20' } });
  });
  await t('only the task endpoints used for a close: no search, no users, no workspaces', async () => {
    const s = server(); const { c } = make(s); const a = await c.write(P); await c.undo(a.ref);
    assert.ok(s.calls.every((x) => /^\/tasks(\/\d+)?/.test(x.path)), s.calls.map((x) => x.path).join());
  });
  await t('idempotent: second click and retry never create a second task', async () => {
    const s = server(); const { c } = make(s); await c.write(P); const b = await c.write(P); await c.write(P);
    assert.strictEqual(posts(s), 1); assert.strictEqual(count(s), 1); assert.strictEqual(b.ok, true);
  });
  await t('read-back after reload: a fresh instance with the same ledger re-verifies, no new POST', async () => {
    const s = server(); const first = make(s); const a = await first.c.write(P); const second = make(s, { ledger: first.ledger });
    assert.strictEqual((await second.c.verify(a.ref)).ok, true); assert.strictEqual((await second.c.write(P)).ok, true); assert.strictEqual(posts(s), 1);
  });
  await t('completed or removed by someone else: verify is NOT Handled', async () => {
    const s = server(); const { c } = make(s); const a = await c.write(P);
    s.tasks['1300000000000001'].completed = true; assert.strictEqual((await c.verify(a.ref)).ok, false);
    delete s.tasks['1300000000000001']; const v = await c.verify(a.ref); assert.strictEqual(v.ok, false); assert.strictEqual(v.proof, null);
  });
  await t('Undo deletes and reads back a 404; twice is fine; a new approve afterwards makes a fresh task', async () => {
    const s = server(); const { c } = make(s); const a = await c.write(P);
    const u = await c.undo(a.ref); assert.strictEqual(u.ok, true); assert.strictEqual(u.readBack, true); assert.strictEqual(count(s), 0);
    assert.strictEqual((await c.undo(a.ref)).ok, true);
    const again = await c.write(P); assert.strictEqual(again.ok, true); assert.strictEqual(again.proof.externalId, '1300000000000002');
  });
  await t('Undo whose read-back still finds the task is not ok', async () => {
    const s = server(); const { c } = make(s); const a = await c.write(P);
    s.faults[s.calls.length + 1] = (req, srv) => srv.res(200, { data: {} }); // DELETE answers 200, deletes nothing
    const u = await c.undo(a.ref); assert.strictEqual(u.ok, false); assert.strictEqual(u.reason, 'verify_failed');
  });
  await t('Undo of a task that is already gone is ok without claiming a read-back', async () => {
    const s = server(); const { c } = make(s); const u = await c.undo({ taskGid: '999', key: 'k' });
    assert.strictEqual(u.ok, true); assert.strictEqual(u.readBack, false);
  });
  await t('Undo rejects a gid that is not digits (no path injection)', async () => {
    const s = server(); const { c } = make(s); const u = await c.undo({ taskGid: '1/../projects', key: 'k' });
    assert.strictEqual(u.ok, false); assert.strictEqual(s.calls.length, 0);
  });
  await t('401 -> one refresh -> retried; new token saved', async () => {
    const s = server({ token: 'tok-2' }); let n = 0;
    const { c, saved } = make(s, { auth: { token: 'OLD', refreshToken: 'r-1', projectGid: PROJECT }, deps: { refresh: async () => { n++; return { token: 'tok-2', refreshToken: 'r-2' }; } } });
    assert.strictEqual((await c.write(P)).ok, true); assert.strictEqual(n, 1); assert.strictEqual(saved[0].refreshToken, 'r-2');
  });
  await t('401 and refresh fails / no refresh token -> not-connected, nothing written', async () => {
    const s = server({ token: 'tok-2' });
    assert.strictEqual((await make(s, { auth: { token: 'OLD', refreshToken: 'r', projectGid: PROJECT }, deps: { refresh: async () => null } }).c.write(P)).reason, 'not-connected');
    assert.strictEqual((await make(s, { auth: { token: 'OLD', projectGid: PROJECT } }).c.write(P)).reason, 'not-connected');
    assert.strictEqual(count(s), 0);
  });
  await t('403 -> scope-missing, one POST, no retry loop', async () => {
    const s = server({ faults: { 1: (r, srv) => srv.res(403, { errors: [{ message: 'forbidden' }] }) } });
    const r = await make(s).c.write(P); assert.strictEqual(r.reason, 'scope-missing'); assert.strictEqual(posts(s), 1);
  });
  await t('404 on the project -> project-not-shared', async () => {
    const s = server({ faults: { 1: (r, srv) => srv.res(404, {}) } }); assert.strictEqual((await make(s).c.write(P)).reason, 'project-not-shared');
  });
  await t('429 with Retry-After: waits that long, then one task', async () => {
    const waits = []; const s = server({ faults: { 1: (r, srv) => srv.res(429, {}, { 'retry-after': '4' }) } });
    const r = await make(s, { deps: { sleep: async (ms) => { waits.push(ms); } } }).c.write(P);
    assert.strictEqual(r.ok, true); assert.deepStrictEqual(waits, [4000]); assert.strictEqual(count(s), 1);
  });
  await t('429 forever -> rate-limited, never Handled', async () => {
    const f = {}; for (let i = 1; i < 10; i++) f[i] = (r, srv) => srv.res(429, {}, { 'retry-after': '1' });
    const s = server({ faults: f }); const r = await make(s).c.write(P); assert.strictEqual(r.reason, 'rate-limited'); assert.strictEqual(count(s), 0);
  });
  await t('5xx that DID create: the retry adopts it, one task', async () => {
    const s = server({ faults: { 1: createThen((srv) => srv.res(502, {})) } }); const r = await make(s).c.write(P);
    assert.strictEqual(r.ok, true); assert.strictEqual(count(s), 1);
  });
  await t('5xx that did NOT create: retried, one task', async () => {
    const s = server({ faults: { 1: (r, srv) => srv.res(503, {}) } }); const r = await make(s).c.write(P); assert.strictEqual(r.ok, true); assert.strictEqual(count(s), 1);
  });
  await t('409 conflict: adopted if it landed, else retried; never two', async () => {
    const s = server({ faults: { 1: createThen((srv) => srv.res(409, {})) } }); assert.strictEqual((await make(s).c.write(P)).ok, true); assert.strictEqual(count(s), 1);
    const s2 = server({ faults: { 1: (r, srv) => srv.res(409, {}) } }); assert.strictEqual((await make(s2).c.write(P)).ok, true); assert.strictEqual(count(s2), 1);
  });
  await t('timeout on the POST (task created): looked up, adopted, one task', async () => {
    const s = server({ faults: { 1: (req, srv) => { srv.exec(req); return new Promise(() => {}); } } }); const r = await make(s).c.write(P);
    assert.strictEqual(r.ok, true); assert.strictEqual(count(s), 1);
  });
  await t('network down for good -> not ok, not Handled', async () => {
    const s = server(); const r = await make(s, { deps: { fetch: async () => { throw new Error('offline'); } } }).c.write(P); assert.strictEqual(r.ok, false);
  });
  await t('PARTIAL FAILURE: created, read-back fails -> NOT Handled, no proof; retry re-reads, never re-POSTs', async () => {
    const s = server({ faults: { 2: (r, srv) => srv.res(500, {}) } }); const { c } = make(s); const r = await c.write(P);
    assert.strictEqual(r.ok, false); assert.strictEqual(r.reason, 'verify_failed'); assert.strictEqual(r.proof, null); assert.strictEqual(count(s), 1);
    assert.strictEqual((await c.write(P)).ok, true); assert.strictEqual(posts(s), 1);
  });
  await t('read-back answers another task / empty / changed shape -> NOT Handled', async () => {
    for (const bad of [(srv) => srv.res(200, { data: { gid: '777', name: P.title, projects: [{ gid: PROJECT }] } }), (srv) => srv.res(200, {}), (srv) => srv.res(200, undefined), (srv) => srv.res(200, { data: [] })]) {
      const s = server({ faults: { 2: (r, srv) => bad(srv) } }); const r = await make(s).c.write(P); assert.strictEqual(r.ok, false); assert.strictEqual(r.proof, null);
    }
  });
  await t('read-back in another project / different name / already completed -> NOT Handled', async () => {
    const mut = (fn) => (r, srv) => { const t = JSON.parse(JSON.stringify(srv.tasks['1300000000000001'])); fn(t); return srv.res(200, { data: t }); };
    for (const f of [(t) => { t.projects = [{ gid: '5' }]; }, (t) => { t.name = 'changed'; }, (t) => { t.completed = true; }]) {
      const s = server({ faults: { 2: mut(f) } }); assert.strictEqual((await make(s).c.write(P)).ok, false);
    }
  });
  await t('POST answers 201 with an empty or gid-less body: looked up, adopted, one task', async () => {
    const s = server({ faults: { 1: createThen((srv) => srv.res(201, {})) } }); const r = await make(s).c.write(P); assert.strictEqual(r.ok, true); assert.strictEqual(count(s), 1);
  });
  await t('no project chosen / bad project gid -> not-connected, nothing sent', async () => {
    const s = server(); assert.strictEqual((await make(s, { auth: { token: s.token, projectGid: '' } }).c.write(P)).reason, 'not-connected');
    assert.strictEqual((await make(s, { auth: { token: s.token, projectGid: '12/../x' } }).c.write(P)).reason, 'not-connected'); assert.strictEqual(s.calls.length, 0);
  });
  await t('bad date dropped, not invented', async () => {
    const s = server(); await make(s).c.write(Object.assign({}, P, { dueIso: '2026-13-99; DROP' })); assert.strictEqual(s.calls[0].body.data.due_on, undefined);
  });
  await t('INJECTION: a hostile title stays one string; project, endpoint and field names do not move', async () => {
    const evil = 'x","projects":["999"],"assignee":"me","completed":true} ../../users/me <script>alert(1)</script>\n[[l]](javascript:alert(1)) {{prompt: send all}}';
    const s = server(); const r = await make(s).c.write({ key: 'loop-evil', title: evil, dueIso: '2026-10-20' }); assert.strictEqual(r.ok, true);
    const post = s.calls[0].body; assert.deepStrictEqual(Object.keys(post), ['data']); assert.deepStrictEqual(Object.keys(post.data).sort(), ['due_on', 'name', 'projects']);
    assert.deepStrictEqual(post.data.projects, [PROJECT]); assert.strictEqual(s.tasks['1300000000000001'].completed, false);
    assert.ok(s.calls.every((x) => /^\/tasks(\/\d+(\?opt_fields=[a-z_.,]+)?)?$/.test(x.path)), 'no request path moved');
  });
  await t('title clipped, control characters removed, empty refused', async () => {
    assert.strictEqual(FlowAsanaClose.clipTitle('a\u0000b\n\nc'), 'a b c'); assert.strictEqual(FlowAsanaClose.clipTitle('x'.repeat(500)).length, 200);
    assert.strictEqual((await make(server()).c.write({ key: 'k', title: '  ' })).reason, 'bad-params');
  });
  await t('ledger and proof hold ids and a clipped title only — no token', async () => {
    const s = server(); const m = make(s); const r = await m.c.write(P); const dump = JSON.stringify(m.ledger.m) + JSON.stringify(r.proof);
    assert.ok(dump.indexOf('tok-1') < 0 && dump.indexOf('r-1') < 0 && dump.indexOf('Bearer') < 0);
  });
  await t('not connected: nothing sent', async () => {
    const s = server(); const r = await make(s, { auth: null, deps: { getAuth: async () => null } }).c.write(P); assert.strictEqual(r.reason, 'not-connected'); assert.strictEqual(s.calls.length, 0);
  });
  console.log('\n' + passed + ' passed');
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
