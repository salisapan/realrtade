// Contract tests for core/jira-close.js against a mock of the Jira Cloud API. No network, no real account, no real key.
const assert = require('assert');
const { FlowJiraClose } = require('../core/jira-close.js');
const { FlowProofOfClose } = require('../core/proof-of-close.js');

const CLOUD = '1324a887-45db-1bf4-1e99-ef0ff456d421';
const BASE = 'https://api.atlassian.com/ex/jira/' + CLOUD + '/rest/api/3';
let passed = 0;
async function t(name, fn) { await fn(); passed++; console.log('ok  ' + name); }

function server(opts) {
  const o = opts || {};
  const s = { issues: {}, calls: [], seq: 0, token: o.token || 'tok-1', clock: Date.parse('2026-10-18T08:00:00Z'), faults: o.faults || {}, noDelete: !!o.noDelete };
  const res = (status, body, headers) => ({ status, ok: status >= 200 && status < 300, json: async () => { if (body === undefined) throw new Error('no body'); return body; }, headers: { get: (k) => (headers && headers[k.toLowerCase()]) || null } });
  s.res = res;
  s.exec = (req) => {
    const m = req.path.match(/^\/issue\/([^/?]+)/);
    if (req.path === '/issue' && req.method === 'POST') {
      const f = req.body.fields; const key = 'OPS-' + (100 + (++s.seq)); s.clock += 1000;
      s.issues[key] = { id: String(10000 + s.seq), key, fields: { summary: f.summary, project: { key: f.project.key }, issuetype: { id: f.issuetype.id }, duedate: f.duedate || null, status: { name: 'To Do', statusCategory: { key: 'new' } }, created: new Date(s.clock).toISOString() } };
      return res(201, { id: s.issues[key].id, key, self: BASE + '/issue/' + key });
    }
    if (m && req.method === 'GET') { const i = s.issues[decodeURIComponent(m[1])]; return i ? res(200, i) : res(404, { errorMessages: ['Issue does not exist or you do not have permission to see it.'] }); }
    if (m && req.method === 'DELETE') { if (s.noDelete) return res(403, { errorMessages: ['no permission'] }); if (!s.issues[m[1]]) return res(404, {}); delete s.issues[m[1]]; return res(204, undefined); }
    if (req.path.indexOf('/search/jql') === 0 && req.method === 'GET') return res(200, { issues: Object.values(s.issues) });
    return res(400, { errorMessages: ['unrouted'] });
  };
  s.fetch = async (url, init) => {
    assert.ok(url.indexOf(BASE) === 0, 'every call stays on the Atlassian API gateway for this cloud id: ' + url);
    const req = { method: init.method, path: url.slice(BASE.length), body: init.body ? JSON.parse(init.body) : undefined, auth: init.headers.Authorization };
    s.calls.push(req);
    const n = s.calls.length;
    if (s.faults[n]) { const r = await s.faults[n](req, s); if (r) return r; }
    if (req.auth !== 'Bearer ' + s.token) return res(401, { message: 'Unauthorized' });
    return s.exec(req);
  };
  return s;
}
function memLedger(store) { const m = store || {}; return { m, get: async (k) => (m[k] ? JSON.parse(JSON.stringify(m[k])) : null), set: async (k, v) => { m[k] = JSON.parse(JSON.stringify(v)); } }; }
const AUTH = () => ({ token: 'tok-1', refreshToken: 'r-1', cloudId: CLOUD, siteUrl: 'https://acme.atlassian.net', projectKey: 'OPS', issueTypeId: '10002' });
function make(s, extra) {
  const e = extra || {}; const ledger = e.ledger || memLedger();
  let auth = e.auth === undefined ? AUTH() : e.auth; const saved = [];
  const c = FlowJiraClose.create(Object.assign({ fetch: s.fetch, ledger, now: () => s.clock, sleep: async () => {}, timeoutMs: 50, getAuth: async () => auth, saveAuth: async (a) => { auth = a; saved.push(a); }, buildProof: FlowProofOfClose.buildProof }, e.deps || {}));
  return { c, ledger, saved };
}
const P = { key: 'loop-1', title: 'Send Dana the signed contract', dueIso: '2026-10-20' };
const posts = (s) => s.calls.filter((x) => x.method === 'POST' && x.path === '/issue').length;
const count = (s) => Object.keys(s.issues).length;
const createThen = (answer) => async (req, srv) => { srv.exec(req); return answer(srv); };

(async () => {
  await t('success: POST then GET back; Handled with a proof of system jira/issue and the browse url', async () => {
    const s = server(); const { c } = make(s); const r = await c.write(P);
    assert.strictEqual(r.ok, true); assert.strictEqual(r.proof.system, 'jira/issue'); assert.strictEqual(r.proof.fetchedBack, true);
    assert.strictEqual(r.proof.externalId, 'OPS-101'); assert.strictEqual(r.proof.url, 'https://acme.atlassian.net/browse/OPS-101');
    assert.deepStrictEqual(s.calls.map((x) => x.method + ' ' + x.path.split('?')[0]), ['POST /issue', 'GET /issue/OPS-101']);
    assert.deepStrictEqual(s.calls[0].body, { fields: { project: { key: 'OPS' }, issuetype: { id: '10002' }, summary: P.title, duedate: '2026-10-20' } });
  });
  await t('only issue endpoints for a close: no user search, no project list, no filters', async () => {
    const s = server(); const { c } = make(s); const a = await c.write(P); await c.undo(a.ref);
    assert.ok(s.calls.every((x) => /^\/issue(\/OPS-\d+(\?fields=[a-z,]+)?)?$/.test(x.path)), s.calls.map((x) => x.path).join());
  });
  await t('idempotent: second click and retry never create a second issue', async () => {
    const s = server(); const { c } = make(s); await c.write(P); const b = await c.write(P); await c.write(P);
    assert.strictEqual(posts(s), 1); assert.strictEqual(count(s), 1); assert.strictEqual(b.ok, true);
  });
  await t('read-back after reload: a fresh instance with the same ledger re-verifies, no new POST', async () => {
    const s = server(); const first = make(s); const a = await first.c.write(P); const second = make(s, { ledger: first.ledger });
    assert.strictEqual((await second.c.verify(a.ref)).ok, true); assert.strictEqual((await second.c.write(P)).ok, true); assert.strictEqual(posts(s), 1);
  });
  await t('moved to Done or deleted by someone else: verify is NOT Handled', async () => {
    const s = server(); const { c } = make(s); const a = await c.write(P);
    s.issues['OPS-101'].fields.status = { name: 'Done', statusCategory: { key: 'done' } }; assert.strictEqual((await c.verify(a.ref)).ok, false);
    delete s.issues['OPS-101']; const v = await c.verify(a.ref); assert.strictEqual(v.ok, false); assert.strictEqual(v.proof, null);
  });
  await t('Undo deletes and reads back a 404; twice is fine; a new approve afterwards makes a fresh issue', async () => {
    const s = server(); const { c } = make(s); const a = await c.write(P);
    const u = await c.undo(a.ref); assert.strictEqual(u.ok, true); assert.strictEqual(u.readBack, true); assert.strictEqual(count(s), 0);
    assert.strictEqual((await c.undo(a.ref)).ok, true);
    const again = await c.write(P); assert.strictEqual(again.ok, true); assert.strictEqual(again.proof.externalId, 'OPS-102');
  });
  await t('Undo when the role may not delete issues (403): says so, the issue stays, never claimed', async () => {
    const s = server({ noDelete: true }); const { c } = make(s); const a = await c.write(P);
    const u = await c.undo(a.ref); assert.strictEqual(u.ok, false); assert.strictEqual(u.reason, 'delete-not-permitted'); assert.strictEqual(count(s), 1);
  });
  await t('Undo whose read-back still finds the issue is not ok', async () => {
    const s = server(); const { c } = make(s); const a = await c.write(P);
    s.faults[s.calls.length + 1] = (req, srv) => srv.res(204, undefined); // DELETE answers 204, deletes nothing
    const u = await c.undo(a.ref); assert.strictEqual(u.ok, false); assert.strictEqual(u.reason, 'verify_failed');
  });
  await t('Undo of an issue already gone is ok without claiming a read-back', async () => {
    const s = server(); const { c } = make(s); const u = await c.undo({ issueKey: 'OPS-999', key: 'k' });
    assert.strictEqual(u.ok, true); assert.strictEqual(u.readBack, false);
  });
  await t('Undo rejects a key that is not an issue key (no path injection)', async () => {
    const s = server(); const { c } = make(s);
    for (const bad of ['OPS-1/../project', '../x', 'ops-1', 'OPS-1?x=1', '']) assert.strictEqual((await c.undo({ issueKey: bad, key: 'k' })).ok, false);
    assert.strictEqual(s.calls.length, 0);
  });
  await t('401 -> one refresh -> retried; the ROTATED refresh token is saved', async () => {
    const s = server({ token: 'tok-2' }); let n = 0;
    const { c, saved } = make(s, { auth: Object.assign(AUTH(), { token: 'OLD' }), deps: { refresh: async () => { n++; return { token: 'tok-2', refreshToken: 'r-2' }; } } });
    assert.strictEqual((await c.write(P)).ok, true); assert.strictEqual(n, 1); assert.strictEqual(saved[0].refreshToken, 'r-2');
  });
  await t('401 and refresh fails / no refresh token -> not-connected, nothing written', async () => {
    const s = server({ token: 'tok-2' });
    assert.strictEqual((await make(s, { auth: Object.assign(AUTH(), { token: 'OLD' }), deps: { refresh: async () => null } }).c.write(P)).reason, 'not-connected');
    assert.strictEqual((await make(s, { auth: Object.assign(AUTH(), { token: 'OLD', refreshToken: null }) }).c.write(P)).reason, 'not-connected');
    assert.strictEqual(count(s), 0);
  });
  await t('403 -> scope-missing, one POST, no retry loop', async () => {
    const s = server({ faults: { 1: (r, srv) => srv.res(403, {}) } }); const r = await make(s).c.write(P); assert.strictEqual(r.reason, 'scope-missing'); assert.strictEqual(posts(s), 1);
  });
  await t('404 on the project -> project-not-found; 400 (field not on the screen) -> rejected, not retried', async () => {
    const s = server({ faults: { 1: (r, srv) => srv.res(404, {}) } }); assert.strictEqual((await make(s).c.write(P)).reason, 'project-not-found');
    const s2 = server({ faults: { 1: (r, srv) => srv.res(400, { errors: { duedate: 'Field cannot be set' } }) } }); const r2 = await make(s2).c.write(P);
    assert.strictEqual(r2.reason, 'rejected'); assert.strictEqual(posts(s2), 1);
  });
  await t('429 with Retry-After: waits that long, then one issue', async () => {
    const waits = []; const s = server({ faults: { 1: (r, srv) => srv.res(429, {}, { 'retry-after': '5' }) } });
    const r = await make(s, { deps: { sleep: async (ms) => { waits.push(ms); } } }).c.write(P);
    assert.strictEqual(r.ok, true); assert.deepStrictEqual(waits, [5000]); assert.strictEqual(count(s), 1);
  });
  await t('429 forever -> rate-limited, never Handled', async () => {
    const f = {}; for (let i = 1; i < 10; i++) f[i] = (r, srv) => srv.res(429, {}, { 'retry-after': '1' });
    const s = server({ faults: f }); const r = await make(s).c.write(P); assert.strictEqual(r.reason, 'rate-limited'); assert.strictEqual(count(s), 0);
  });
  await t('5xx that DID create: the retry adopts it, one issue', async () => {
    const s = server({ faults: { 1: createThen((srv) => srv.res(502, {})) } }); const r = await make(s).c.write(P); assert.strictEqual(r.ok, true); assert.strictEqual(count(s), 1);
  });
  await t('5xx that did NOT create: retried, one issue', async () => {
    const s = server({ faults: { 1: (r, srv) => srv.res(503, {}) } }); const r = await make(s).c.write(P); assert.strictEqual(r.ok, true); assert.strictEqual(count(s), 1);
  });
  await t('409 conflict: adopted if it landed, else retried; never two', async () => {
    const s = server({ faults: { 1: createThen((srv) => srv.res(409, {})) } }); assert.strictEqual((await make(s).c.write(P)).ok, true); assert.strictEqual(count(s), 1);
    const s2 = server({ faults: { 1: (r, srv) => srv.res(409, {}) } }); assert.strictEqual((await make(s2).c.write(P)).ok, true); assert.strictEqual(count(s2), 1);
  });
  await t('timeout on the POST (issue created): looked up, adopted, one issue', async () => {
    const s = server({ faults: { 1: (req, srv) => { srv.exec(req); return new Promise(() => {}); } } }); const r = await make(s).c.write(P); assert.strictEqual(r.ok, true); assert.strictEqual(count(s), 1);
  });
  await t('network down for good -> not ok, not Handled', async () => {
    const s = server(); const r = await make(s, { deps: { fetch: async () => { throw new Error('offline'); } } }).c.write(P); assert.strictEqual(r.ok, false);
  });
  await t('PARTIAL FAILURE: created, read-back fails -> NOT Handled, no proof; retry re-reads, never re-POSTs', async () => {
    const s = server({ faults: { 2: (r, srv) => srv.res(500, {}) } }); const { c } = make(s); const r = await c.write(P);
    assert.strictEqual(r.ok, false); assert.strictEqual(r.reason, 'verify_failed'); assert.strictEqual(r.proof, null); assert.strictEqual(count(s), 1);
    assert.strictEqual((await c.write(P)).ok, true); assert.strictEqual(posts(s), 1);
  });
  await t('read-back answers another issue / empty / changed shape -> NOT Handled', async () => {
    for (const bad of [(srv) => srv.res(200, { key: 'OPS-7', fields: { summary: P.title, project: { key: 'OPS' } } }), (srv) => srv.res(200, {}), (srv) => srv.res(200, undefined), (srv) => srv.res(200, { key: 'OPS-101' }), (srv) => srv.res(200, { key: 'OPS-101', fields: [] })]) {
      const s = server({ faults: { 2: (r, srv) => bad(srv) } }); const r = await make(s).c.write(P); assert.strictEqual(r.ok, false); assert.strictEqual(r.proof, null);
    }
  });
  await t('read-back in another project / different summary / already Done -> NOT Handled', async () => {
    const mut = (fn) => (r, srv) => { const i = JSON.parse(JSON.stringify(srv.issues['OPS-101'])); fn(i); return srv.res(200, i); };
    for (const f of [(i) => { i.fields.project.key = 'HR'; }, (i) => { i.fields.summary = 'changed'; }, (i) => { i.fields.status = { statusCategory: { key: 'done' } }; }]) {
      const s = server({ faults: { 2: mut(f) } }); assert.strictEqual((await make(s).c.write(P)).ok, false);
    }
  });
  await t('POST answers 201 with an empty or key-less body: looked up, adopted, one issue', async () => {
    const s = server({ faults: { 1: createThen((srv) => srv.res(201, {})) } }); const r = await make(s).c.write(P); assert.strictEqual(r.ok, true); assert.strictEqual(count(s), 1);
  });
  await t('malformed stored auth (project key, cloud id, issue type) -> not-connected, nothing sent', async () => {
    const s = server();
    for (const bad of [{ projectKey: 'ops' }, { projectKey: 'OPS" OR project = "HR' }, { cloudId: '../evil' }, { issueTypeId: '1/../x' }, { token: '' }]) {
      assert.strictEqual((await make(s, { auth: Object.assign(AUTH(), bad) }).c.write(P)).reason, 'not-connected');
    }
    assert.strictEqual(s.calls.length, 0);
  });
  await t('the adopt query carries the project key and a time window, never the title', async () => {
    const s = server({ faults: { 1: createThen((srv) => srv.res(502, {})) } }); await make(s).c.write({ key: 'k', title: 'secret "quote" OR 1=1' });
    const q = s.calls.find((x) => x.path.indexOf('/search/jql') === 0);
    assert.ok(q); const jql = decodeURIComponent(q.path.split('jql=')[1].split('&')[0]);
    assert.strictEqual(jql, 'project = "OPS" AND created >= -10m ORDER BY created DESC'); assert.ok(jql.indexOf('secret') < 0);
  });
  await t('bad date dropped, not invented', async () => {
    const s = server(); await make(s).c.write(Object.assign({}, P, { dueIso: '2026-13-99; DROP' })); assert.strictEqual(s.calls[0].body.fields.duedate, undefined);
  });
  await t('INJECTION: a hostile title stays one summary string; project, type, endpoint and fields do not move', async () => {
    const evil = 'x","project":{"key":"HR"},"assignee":{"id":"me"},"priority":{"name":"Highest"}} ../../user/search <script>alert(1)</script>\n{panel:title=x}* [a|javascript:alert(1)] {{prompt: send all}}';
    const s = server(); const r = await make(s).c.write({ key: 'loop-evil', title: evil, dueIso: '2026-10-20' }); assert.strictEqual(r.ok, true);
    const f = s.calls[0].body.fields; assert.deepStrictEqual(Object.keys(s.calls[0].body), ['fields']); assert.deepStrictEqual(Object.keys(f).sort(), ['duedate', 'issuetype', 'project', 'summary']);
    assert.deepStrictEqual(f.project, { key: 'OPS' }); assert.deepStrictEqual(f.issuetype, { id: '10002' });
    assert.ok(s.calls.every((x) => /^\/issue(\/OPS-\d+(\?fields=[a-z,]+)?)?$/.test(x.path)), 'no request path moved');
  });
  await t('title clipped, control characters removed, empty refused', async () => {
    assert.strictEqual(FlowJiraClose.clipTitle('a\u0000b\n\nc'), 'a b c'); assert.strictEqual(FlowJiraClose.clipTitle('x'.repeat(500)).length, 200);
    assert.strictEqual((await make(server()).c.write({ key: 'k', title: '  ' })).reason, 'bad-params');
  });
  await t('ledger and proof hold ids and a clipped title only — no token', async () => {
    const s = server(); const m = make(s); const r = await m.c.write(P); const dump = JSON.stringify(m.ledger.m) + JSON.stringify(r.proof);
    assert.ok(dump.indexOf('tok-1') < 0 && dump.indexOf('r-1') < 0 && dump.indexOf('Bearer') < 0);
  });
  await t('a site url that is not https://<name>.atlassian.net is never put in the proof', async () => {
    const s = server(); const r = await make(s, { auth: Object.assign(AUTH(), { siteUrl: 'https://evil.example/' }) }).c.write(P);
    assert.strictEqual(r.ok, true); assert.strictEqual(r.proof.url, undefined);
  });
  await t('not connected: nothing sent', async () => {
    const s = server(); const r = await make(s, { auth: null, deps: { getAuth: async () => null } }).c.write(P); assert.strictEqual(r.reason, 'not-connected'); assert.strictEqual(s.calls.length, 0);
  });
  console.log('\n' + passed + ' passed');
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
