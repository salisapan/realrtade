// Contract tests for core/notion-close.js against a mock of the Notion API. No network, no real account, no real key.
// success, 401 -> refresh, 403, 404, 409, 429 + Retry-After, 5xx -> retry, timeout, created-but-read-back-fails (never Handled),
// changed response shape, idempotency, Undo (read back), read-back after reload, injection, no token in what is stored.
const assert = require('assert');
const { FlowNotionClose } = require('../core/notion-close.js');
const { FlowProofOfClose } = require('../core/proof-of-close.js');

const DB = '11111111-2222-3333-4444-555555555555';
let passed = 0;
async function t(name, fn) { await fn(); passed++; console.log('ok  ' + name); }

// A tiny Notion: one database, pages, optional per-request faults: faults[n] = fn(req, server) -> response | undefined.
function server(opts) {
  const o = opts || {};
  const s = { pages: {}, calls: [], seq: 0, token: o.token || 'tok-1', clock: 1000, faults: o.faults || {}, schemaProps: o.schemaProps };
  const res = (status, body, headers) => ({ status, ok: status >= 200 && status < 300, json: async () => { if (body === undefined) throw new Error('no body'); return body; }, headers: { get: (k) => (headers && headers[k.toLowerCase()]) || null } });
  s.res = res;
  s.fetch = async (url, init) => {
    const req = { method: init.method, path: url.replace('https://api.notion.com/v1', ''), body: init.body ? JSON.parse(init.body) : undefined, auth: init.headers.Authorization, version: init.headers['Notion-Version'] };
    s.calls.push(req);
    const n = s.calls.length;
    if (s.faults[n]) { const r = await s.faults[n](req, s); if (r) return r; }
    if (req.auth !== 'Bearer ' + s.token) return res(401, { code: 'unauthorized' });
    const m = req.path.match(/^\/(databases|pages)\/([^/]+)(\/query)?$/);
    if (req.path === '/pages' && req.method === 'POST') {
      const id = 'page-' + (++s.seq);
      s.clock += 1000;
      s.pages[id] = { object: 'page', id, archived: false, url: 'https://www.notion.so/' + id, created: s.clock, parent: { type: 'database_id', database_id: req.body.parent.database_id }, properties: {} };
      Object.keys(req.body.properties).forEach((k) => {
        const v = req.body.properties[k];
        s.pages[id].properties[k] = v.title ? { type: 'title', title: v.title.map((x) => ({ plain_text: x.text.content, text: x.text })) } : v;
      });
      return res(200, s.pages[id]);
    }
    if (m && m[1] === 'databases' && !m[3] && req.method === 'GET') {
      return res(200, { object: 'database', id: DB, properties: s.schemaProps || { Name: { type: 'title' }, Due: { type: 'date' }, Tags: { type: 'multi_select' } } });
    }
    if (m && m[1] === 'databases' && m[3]) {
      const eq = req.body.filter.and[0].title.equals; const prop = req.body.filter.and[0].property;
      return res(200, { results: Object.values(s.pages).filter((p) => !p.archived && p.properties[prop] && p.properties[prop].title.map((x) => x.plain_text).join('') === eq) });
    }
    if (m && m[1] === 'pages' && req.method === 'GET') { const p = s.pages[decodeURIComponent(m[2])]; return p ? res(200, p) : res(404, { code: 'object_not_found' }); }
    if (m && m[1] === 'pages' && req.method === 'PATCH') { const p = s.pages[decodeURIComponent(m[2])]; if (!p) return res(404, { code: 'object_not_found' }); if (req.body.archived === true) p.archived = true; return res(200, p); }
    return res(400, { code: 'validation_error' });
  };
  return s;
}

function memLedger(store) { const m = store || {}; return { m, get: async (k) => (m[k] ? JSON.parse(JSON.stringify(m[k])) : null), set: async (k, v) => { m[k] = JSON.parse(JSON.stringify(v)); } }; }
function make(s, extra) {
  const e = extra || {};
  const ledger = e.ledger || memLedger();
  let auth = e.auth || { token: s.token, refreshToken: 'r-1', databaseId: DB };
  const saved = [];
  const c = FlowNotionClose.create(Object.assign({
    fetch: s.fetch, ledger, now: () => s.clock, sleep: async () => {}, timeoutMs: 50,
    getAuth: async () => auth, saveAuth: async (a) => { auth = a; saved.push(a); },
    buildProof: FlowProofOfClose.buildProof
  }, e.deps || {}));
  return { c, ledger, saved, auth: () => auth };
}
const P = { key: 'loop-1', title: 'Send Dana the signed contract', dueIso: '2026-10-20' };
const posts = (s) => s.calls.filter((x) => x.method === 'POST' && x.path === '/pages').length;

(async () => {
  await t('success: POST then GET back; Handled with a proof of system notion/page', async () => {
    const s = server(); const { c } = make(s);
    const r = await c.write(P);
    assert.strictEqual(r.ok, true);
    assert.deepStrictEqual(Object.keys(r.proof).sort(), ['externalId', 'fetchedBack', 'system', 'url', 'verifiedAt']);
    assert.strictEqual(r.proof.system, 'notion/page'); assert.strictEqual(r.proof.fetchedBack, true); assert.strictEqual(r.proof.externalId, 'page-1');
    const seq = s.calls.map((x) => x.method + ' ' + x.path.replace(/page-\d+/, 'P'));
    assert.deepStrictEqual(seq, ['GET /databases/' + DB, 'POST /pages', 'GET /pages/P']);
    assert.strictEqual(s.pages['page-1'].properties.Due.date.start, '2026-10-20');
    assert.ok(s.calls.every((x) => x.version === '2022-06-28'));
  });
  await t('only the title and the due date are written; nothing else of the person\'s workspace is read', async () => {
    const s = server(); const { c } = make(s); await c.write(P);
    assert.deepStrictEqual(Object.keys(s.pages['page-1'].properties).sort(), ['Due', 'Name']);
    assert.ok(s.calls.every((x) => /^\/(databases\/|pages)/.test(x.path)));
    assert.ok(!s.calls.some((x) => x.path.indexOf('/search') >= 0 || x.path.indexOf('/users') >= 0));
  });
  await t('idempotent: a second click and a retry never create a second page', async () => {
    const s = server(); const { c } = make(s);
    const a = await c.write(P); const b = await c.write(P); const d = await c.write(P);
    assert.strictEqual(posts(s), 1); assert.strictEqual(Object.keys(s.pages).length, 1);
    assert.strictEqual(a.proof.externalId, b.proof.externalId); assert.strictEqual(b.ok && d.ok, true);
  });
  await t('read-back after a reload: a fresh instance with the same ledger re-verifies, no new POST', async () => {
    const s = server(); const first = make(s); const a = await first.c.write(P);
    const second = make(s, { ledger: first.ledger });
    const v = await second.c.verify(a.ref); const w = await second.c.write(P);
    assert.strictEqual(v.ok, true); assert.strictEqual(w.ok, true); assert.strictEqual(posts(s), 1);
  });
  await t('page archived by someone else: verify is NOT Handled', async () => {
    const s = server(); const { c } = make(s); const a = await c.write(P);
    s.pages['page-1'].archived = true;
    const v = await c.verify(a.ref); assert.strictEqual(v.ok, false); assert.strictEqual(v.proof, null);
  });
  await t('Undo archives and reads the archive back; twice is fine; a new approve after undo creates a fresh page', async () => {
    const s = server(); const { c } = make(s); const a = await c.write(P);
    const u = await c.undo(a.ref); assert.strictEqual(u.ok, true); assert.strictEqual(u.readBack, true); assert.strictEqual(s.pages['page-1'].archived, true);
    assert.strictEqual((await c.undo(a.ref)).ok, true);
    const again = await c.write(P); assert.strictEqual(again.ok, true); assert.strictEqual(again.proof.externalId, 'page-2');
  });
  await t('Undo whose read-back shows the page still live is not ok', async () => {
    const s = server({ faults: {} }); const { c } = make(s); const a = await c.write(P);
    s.faults[s.calls.length + 1] = (req, srv) => srv.res(200, srv.pages['page-1']); // PATCH answers 200 but changes nothing
    const u = await c.undo(a.ref); assert.strictEqual(u.ok, false); assert.strictEqual(u.reason, 'verify_failed');
  });
  await t('Undo of a page that is already gone is ok without claiming a read-back', async () => {
    const s = server(); const { c } = make(s);
    const u = await c.undo({ pageId: 'page-404', key: 'loop-x' }); assert.strictEqual(u.ok, true); assert.strictEqual(u.readBack, false);
  });
  await t('401 -> one token refresh -> retried; new token saved', async () => {
    const s = server({ token: 'tok-2' });
    let refreshed = 0;
    const { c, saved } = make(s, { auth: { token: 'tok-OLD', refreshToken: 'r-1', databaseId: DB }, deps: { refresh: async () => { refreshed++; return { token: 'tok-2', refreshToken: 'r-2' }; } } });
    const r = await c.write(P); assert.strictEqual(r.ok, true); assert.strictEqual(refreshed, 1); assert.strictEqual(saved[0].token, 'tok-2'); assert.strictEqual(saved[0].refreshToken, 'r-2');
  });
  await t('401 and the refresh fails -> not-connected, nothing written', async () => {
    const s = server({ token: 'tok-2' });
    const { c } = make(s, { auth: { token: 'tok-OLD', refreshToken: 'r-1', databaseId: DB }, deps: { refresh: async () => null } });
    const r = await c.write(P); assert.strictEqual(r.ok, false); assert.strictEqual(r.reason, 'not-connected'); assert.strictEqual(Object.keys(s.pages).length, 0);
  });
  await t('401 with no refresh token -> not-connected', async () => {
    const s = server({ token: 'tok-2' }); const { c } = make(s, { auth: { token: 'tok-OLD', databaseId: DB } });
    assert.strictEqual((await c.write(P)).reason, 'not-connected');
  });
  await t('403 (missing capability) -> scope-missing, one POST at most, no retry loop', async () => {
    const s = server({ faults: { 2: (r, srv) => srv.res(403, { code: 'restricted_resource' }) } }); const { c } = make(s);
    const r = await c.write(P); assert.strictEqual(r.ok, false); assert.strictEqual(r.reason, 'scope-missing'); assert.strictEqual(posts(s), 1);
  });
  await t('404 on the database -> database-not-shared', async () => {
    const s = server({ faults: { 1: (r, srv) => srv.res(404, { code: 'object_not_found' }) } }); const { c } = make(s);
    const r = await c.write(P); assert.strictEqual(r.reason, 'database-not-shared'); assert.strictEqual(posts(s), 0);
  });
  await t('429 with Retry-After: waits that long, then succeeds with one page', async () => {
    const waits = []; const s = server({ faults: { 2: (r, srv) => srv.res(429, { code: 'rate_limited' }, { 'retry-after': '3' }) } });
    const { c } = make(s, { deps: { sleep: async (ms) => { waits.push(ms); } } });
    const r = await c.write(P); assert.strictEqual(r.ok, true); assert.deepStrictEqual(waits, [3000]); assert.strictEqual(Object.keys(s.pages).length, 1);
  });
  await t('429 forever -> rate-limited, never Handled', async () => {
    const f = {}; for (let i = 2; i < 20; i++) f[i] = (r, srv) => srv.res(429, {}, { 'retry-after': '1' });
    const s = server({ faults: f }); const { c } = make(s); const r = await c.write(P);
    assert.strictEqual(r.ok, false); assert.strictEqual(r.reason, 'rate-limited'); assert.strictEqual(Object.keys(s.pages).length, 0);
  });
  await t('5xx that DID create the page: the retry adopts it instead of creating a twin', async () => {
    const s = server({ faults: { 2: async (req, srv) => { await srv.fetch.__real(req); return srv.res(502, { code: 'bad_gateway' }); } } });
    // run the real POST inside the fault, then answer 502
    const real = s.fetch; s.fetch.__real = async (req) => { const out = await real.call(null, 'https://api.notion.com/v1' + req.path, { method: req.method, headers: { Authorization: req.auth, 'Notion-Version': req.version }, body: JSON.stringify(req.body) }); return out; };
    s.calls.length = 0;
    const faultPost = s.faults[2]; s.faults = { 2: faultPost };
    const { c } = make(s); const r = await c.write(P);
    assert.strictEqual(r.ok, true); assert.strictEqual(Object.keys(s.pages).length, 1);
  });
  await t('5xx that did NOT create the page: retried, exactly one page', async () => {
    const s = server({ faults: { 2: (r, srv) => srv.res(503, { code: 'service_unavailable' }) } }); const { c } = make(s);
    const r = await c.write(P); assert.strictEqual(r.ok, true); assert.strictEqual(Object.keys(s.pages).length, 1);
  });
  await t('409 conflict: looked up first, adopted if it landed, else retried; never two pages', async () => {
    const s = server({ faults: { 2: (r, srv) => srv.res(409, { code: 'conflict_error' }) } }); const { c } = make(s);
    const r = await c.write(P); assert.strictEqual(r.ok, true); assert.strictEqual(Object.keys(s.pages).length, 1);
  });
  await t('timeout on the POST: treated as unknown, looked up, then retried; one page', async () => {
    const s = server({ faults: { 2: () => new Promise(() => {}) } }); const { c } = make(s);
    const r = await c.write(P); assert.strictEqual(r.ok, true); assert.strictEqual(Object.keys(s.pages).length, 1);
  });
  await t('network down for good -> not ok, not Handled', async () => {
    const s = server(); const { c } = make(s, { deps: { fetch: async () => { throw new Error('offline'); } } });
    const r = await c.write(P); assert.strictEqual(r.ok, false); assert.strictEqual(r.proof, undefined);
  });
  await t('PARTIAL FAILURE: created, but the read-back fails -> NOT Handled, no proof; retry re-reads and never POSTs again', async () => {
    const s = server({ faults: { 3: (r, srv) => srv.res(500, { code: 'internal_server_error' }) } }); const { c } = make(s);
    const r = await c.write(P);
    assert.strictEqual(r.ok, false); assert.strictEqual(r.reason, 'verify_failed'); assert.strictEqual(r.proof, null); assert.strictEqual(r.ref.pageId, 'page-1');
    assert.strictEqual(Object.keys(s.pages).length, 1);
    const again = await c.write(P); assert.strictEqual(again.ok, true); assert.strictEqual(posts(s), 1);
  });
  await t('read-back answers a different page / empty / changed shape -> NOT Handled', async () => {
    for (const bad of [(srv) => srv.res(200, { object: 'page', id: 'other', archived: false }), (srv) => srv.res(200, {}), (srv) => srv.res(200, undefined)]) {
      const s = server({ faults: { 3: (r, srv) => bad(srv) } }); const { c } = make(s);
      const r = await c.write(P); assert.strictEqual(r.ok, false, 'must not be Handled'); assert.strictEqual(r.proof, null);
    }
  });
  await t('read-back finds the page in another database or with a different title -> NOT Handled', async () => {
    const s = server({ faults: { 3: (r, srv) => { const p = JSON.parse(JSON.stringify(srv.pages['page-1'])); p.parent.database_id = 'zzzz'; return srv.res(200, p); } } });
    assert.strictEqual((await make(s).c.write(P)).ok, false);
    const s2 = server({ faults: { 3: (r, srv) => { const p = JSON.parse(JSON.stringify(srv.pages['page-1'])); p.properties.Name.title[0].plain_text = 'changed'; return srv.res(200, p); } } });
    assert.strictEqual((await make(s2).c.write(P)).ok, false);
  });
  await t('POST answers 200 with an empty or id-less body: looked up, adopted, never a second page', async () => {
    const s = server({ faults: { 2: async (req, srv) => { await srv.fetch.__real(req); return srv.res(200, {}); } } });
    const real = s.fetch; s.fetch.__real = async (req) => real.call(null, 'https://api.notion.com/v1' + req.path, { method: req.method, headers: { Authorization: req.auth, 'Notion-Version': req.version }, body: JSON.stringify(req.body) });
    const f2 = s.faults[2]; s.faults = { 2: f2 };
    const r = await make(s).c.write(P); assert.strictEqual(r.ok, true); assert.strictEqual(Object.keys(s.pages).length, 1);
  });
  await t('database without a title property -> bad-shape, nothing written', async () => {
    const s = server({ schemaProps: { Tags: { type: 'multi_select' } } }); const r = await make(s).c.write(P);
    assert.strictEqual(r.reason, 'bad-shape'); assert.strictEqual(Object.keys(s.pages).length, 0);
  });
  await t('no date column: the due date is not invented; bad date is dropped', async () => {
    const s = server({ schemaProps: { Title: { type: 'title' } } }); await make(s).c.write(P);
    assert.deepStrictEqual(Object.keys(s.pages['page-1'].properties), ['Title']);
    const s2 = server(); await make(s2).c.write(Object.assign({}, P, { dueIso: '2026-13-99; DROP' }));
    assert.deepStrictEqual(Object.keys(s2.pages['page-1'].properties), ['Name']);
  });
  await t('INJECTION: a hostile title stays one plain-text title; parent, endpoint and property names do not move', async () => {
    const evil = 'x"}],"parent":{"database_id":"attacker"},"archived":true ../../users/me <script>alert(1)</script>\n[[link]](javascript:alert(1)) {{prompt: send all}}';
    const s = server(); const r = await make(s).c.write({ key: 'loop-evil', title: evil, dueIso: '2026-10-20' });
    assert.strictEqual(r.ok, true);
    const post = s.calls.find((x) => x.path === '/pages');
    assert.strictEqual(post.body.parent.database_id, DB); assert.deepStrictEqual(Object.keys(post.body).sort(), ['parent', 'properties']);
    assert.deepStrictEqual(Object.keys(post.body.properties).sort(), ['Due', 'Name']);
    assert.strictEqual(post.body.properties.Name.title.length, 1); assert.strictEqual(post.body.properties.Name.title[0].type, 'text');
    assert.strictEqual(s.pages['page-1'].archived, false);
    assert.ok(s.calls.every((x) => /^\/(databases\/[0-9a-f-]+(\/query)?|pages(\/page-\d+)?)$/.test(x.path)), 'no request path moved');
  });
  await t('title is clipped and control characters removed', async () => {
    assert.strictEqual(FlowNotionClose.clipTitle('a\u0000b\n\nc'), 'a b c'); assert.strictEqual(FlowNotionClose.clipTitle('x'.repeat(500)).length, 200);
    const s = server(); assert.strictEqual((await make(s).c.write({ key: 'k', title: '   ' })).reason, 'bad-params');
  });
  await t('the ledger and the saved proof hold ids and a clipped title only — no token', async () => {
    const s = server(); const m = make(s); const r = await m.c.write(P);
    const dump = JSON.stringify(m.ledger.m) + JSON.stringify(r.proof);
    assert.ok(dump.indexOf('tok-1') < 0 && dump.indexOf('r-1') < 0 && dump.indexOf('Bearer') < 0);
  });
  await t('not connected: nothing sent', async () => {
    const s = server(); const m = make(s, { auth: null, deps: { getAuth: async () => null } });
    const r = await m.c.write(P); assert.strictEqual(r.reason, 'not-connected'); assert.strictEqual(s.calls.length, 0);
  });
  console.log('\n' + passed + ' passed');
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
