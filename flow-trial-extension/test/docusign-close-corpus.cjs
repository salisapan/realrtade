// Contract tests for core/docusign-close.js against a mock of the DocuSign eSignature API. No network, no real account, no real key.
// The connector is READ-ONLY: every call must be a GET of one envelope. "Signed" is only ever claimed from a read of status "completed".
const assert = require('assert');
const { FlowDocusignClose } = require('../core/docusign-close.js');
const { FlowProofOfClose } = require('../core/proof-of-close.js');

const ACCT = 'b1c2d3e4-1111-4222-8333-444455556666';
const BASE = 'https://na3.docusign.net';
const API = BASE + '/restapi/v2.1/accounts/' + ACCT;
const ENV1 = 'aaaaaaaa-1111-4222-8333-000000000001';
const ENV2 = 'aaaaaaaa-1111-4222-8333-000000000002';
let passed = 0;
async function t(name, fn) { await fn(); passed++; console.log('ok  ' + name); }

function server(opts) {
  const o = opts || {};
  const s = { envs: Object.assign({ [ENV1]: { status: 'sent' }, [ENV2]: { status: 'completed', completedDateTime: '2026-10-20T09:00:00Z' } }, o.envs || {}), calls: [], token: o.token || 'tok-1', clock: Date.parse('2026-10-20T08:00:00Z'), faults: o.faults || {} };
  const res = (status, body, headers) => ({ status, ok: status >= 200 && status < 300, json: async () => { if (body === undefined) throw new Error('no body'); return body; }, headers: { get: (k) => (headers && headers[k.toLowerCase()]) || null } });
  s.res = res;
  s.fetch = async (url, init) => {
    assert.strictEqual(init.method, 'GET', 'read-only: only GET');
    assert.ok(url.indexOf(API + '/envelopes/') === 0, 'only the envelope read: ' + url);
    assert.ok(/^\/envelopes\/[0-9a-f-]{36}$/.test(url.slice(API.length)), 'nothing after the envelope id (no recipients, documents, audit events): ' + url);
    const req = { url, auth: init.headers.Authorization, body: init.body }; assert.strictEqual(req.body, undefined);
    s.calls.push(req); const n = s.calls.length;
    if (s.faults[n]) { const r = await s.faults[n](req, s); if (r) return r; }
    if (req.auth !== 'Bearer ' + s.token) return res(401, { errorCode: 'USER_AUTHENTICATION_FAILED' });
    const id = url.slice(url.lastIndexOf('/') + 1); const e = s.envs[id];
    if (!e) return res(404, { errorCode: 'ENVELOPE_DOES_NOT_EXIST' });
    return res(200, Object.assign({ envelopeId: id }, e));
  };
  return s;
}
function memLedger(store) { const m = store || {}; return { m, get: async (k) => (m[k] ? JSON.parse(JSON.stringify(m[k])) : null), set: async (k, v) => { m[k] = JSON.parse(JSON.stringify(v)); } }; }
const AUTH = () => ({ token: 'tok-1', refreshToken: 'r-1', accountId: ACCT, baseUri: BASE });
function make(s, extra) {
  const e = extra || {}; const ledger = e.ledger || memLedger(); let auth = e.auth === undefined ? AUTH() : e.auth; const saved = [];
  const c = FlowDocusignClose.create(Object.assign({ fetch: s.fetch, ledger, now: () => s.clock, sleep: async () => {}, timeoutMs: 50, getAuth: async () => auth, saveAuth: async (a) => { auth = a; saved.push(a); }, buildProof: FlowProofOfClose.buildProof }, e.deps || {}));
  return { c, ledger, saved };
}
const L = (env) => ({ key: 'loop-1', envelope: env || ENV2 });

(async () => {
  await t('completed: one GET; closed with a proof of system docusign/envelope, read back', async () => {
    const s = server(); const r = await make(s).c.check(L());
    assert.strictEqual(r.ok, true); assert.strictEqual(r.closed, true); assert.strictEqual(r.status, 'completed');
    assert.deepStrictEqual(Object.keys(r.proof).sort(), ['externalId', 'fetchedBack', 'system', 'verifiedAt']); assert.strictEqual(r.proof.system, 'docusign/envelope'); assert.strictEqual(r.proof.externalId, ENV2); assert.strictEqual(r.proof.fetchedBack, true);
    assert.strictEqual(s.calls.length, 1);
  });
  await t('waiting statuses (created, sent, delivered, signed) are NOT closed and carry no proof', async () => {
    for (const st of ['created', 'sent', 'delivered', 'signed']) {
      const s = server({ envs: { [ENV1]: { status: st } } }); const r = await make(s).c.check(L(ENV1));
      assert.strictEqual(r.ok, true); assert.strictEqual(r.closed, false); assert.strictEqual(r.proof, null); assert.strictEqual(r.label, 'waiting', st);
    }
  });
  await t('declined and voided are shown as such and NEVER close the loop', async () => {
    for (const st of ['declined', 'voided']) {
      const s = server({ envs: { [ENV1]: { status: st } } }); const r = await make(s).c.check(L(ENV1));
      assert.strictEqual(r.closed, false); assert.strictEqual(r.proof, null); assert.strictEqual(r.label, st);
    }
  });
  await t('an unknown status is not closed', async () => {
    const s = server({ envs: { [ENV1]: { status: 'something-new' } } }); const r = await make(s).c.check(L(ENV1)); assert.strictEqual(r.closed, false); assert.strictEqual(r.label, 'unknown-status');
  });
  await t('the status is compared case-insensitively but exactly: "Completed" closes, "completed-ish" does not', async () => {
    const s = server({ envs: { [ENV1]: { status: 'Completed' } } }); assert.strictEqual((await make(s).c.check(L(ENV1))).closed, true);
    const s2 = server({ envs: { [ENV1]: { status: 'completed-ish' } } }); assert.strictEqual((await make(s2).c.check(L(ENV1))).closed, false);
  });
  await t('idempotent: checking twice gives the same answer; the ledger holds one envelope for the loop', async () => {
    const s = server(); const m = make(s); const a = await m.c.check(L()); const b = await m.c.check(L());
    assert.strictEqual(a.closed, true); assert.strictEqual(b.closed, true); assert.deepStrictEqual(Object.keys(m.ledger.m), ['loop-1']); assert.strictEqual(m.ledger.m['loop-1'].envelopeId, ENV2);
  });
  await t('one envelope per loop: a different envelope for the same loop is refused until the person releases the first', async () => {
    const s = server(); const m = make(s); await m.c.check(L(ENV1));
    const r = await m.c.check(L(ENV2)); assert.strictEqual(r.ok, false); assert.strictEqual(r.reason, 'already-linked'); assert.strictEqual(s.calls.length, 1);
    await m.c.release('loop-1'); assert.strictEqual((await m.c.check(L(ENV2))).closed, true);
  });
  await t('read-back after a reload: a fresh instance with the same ledger re-reads; a cached "completed" is never trusted without the read', async () => {
    const s = server(); const first = make(s); const a = await first.c.check(L());
    const second = make(s, { ledger: first.ledger }); const v = await second.c.verify(a.ref); assert.strictEqual(v.closed, true);
    const down = make(server({ faults: { 1: (r, srv) => srv.res(500, {}), 2: (r, srv) => srv.res(500, {}), 3: (r, srv) => srv.res(500, {}) } }), { ledger: first.ledger });
    const v2 = await down.c.verify(a.ref); assert.strictEqual(v2.ok, false); assert.strictEqual(v2.closed, false); assert.strictEqual(v2.proof, null);
  });
  await t('verify after the status moved away from completed (corrected / voided) is NOT closed', async () => {
    const s = server(); const m = make(s); const a = await m.c.check(L()); s.envs[ENV2].status = 'voided';
    const v = await m.c.verify(a.ref); assert.strictEqual(v.closed, false); assert.strictEqual(v.proof, null);
  });
  await t('release stops watching and changes nothing in DocuSign (no call at all)', async () => {
    const s = server(); const m = make(s); await m.c.check(L()); const n = s.calls.length;
    const r = await m.c.release('loop-1'); assert.strictEqual(r.ok, true); assert.strictEqual(s.calls.length, n); assert.strictEqual(m.ledger.m['loop-1'].state, 'released');
    assert.strictEqual((await m.c.release('never-watched')).ok, true);
  });
  await t('401 -> one refresh -> retried; the new tokens are saved', async () => {
    const s = server({ token: 'tok-2' }); let n = 0;
    const { c, saved } = make(s, { auth: Object.assign(AUTH(), { token: 'OLD' }), deps: { refresh: async () => { n++; return { token: 'tok-2', refreshToken: 'r-2' }; } } });
    assert.strictEqual((await c.check(L())).closed, true); assert.strictEqual(n, 1); assert.strictEqual(saved[0].refreshToken, 'r-2');
  });
  await t('401 and refresh fails / no refresh token -> not-connected, not closed', async () => {
    const s = server({ token: 'tok-2' });
    assert.strictEqual((await make(s, { auth: Object.assign(AUTH(), { token: 'OLD' }), deps: { refresh: async () => null } }).c.check(L())).reason, 'not-connected');
    assert.strictEqual((await make(s, { auth: Object.assign(AUTH(), { token: 'OLD', refreshToken: null }) }).c.check(L())).reason, 'not-connected');
  });
  await t('403 -> no-access (an envelope the person cannot see is never closed), not retried', async () => {
    const s = server({ faults: { 1: (r, srv) => srv.res(403, { errorCode: 'USER_LACKS_PERMISSIONS' }) } }); const r = await make(s).c.check(L());
    assert.strictEqual(r.reason, 'no-access'); assert.strictEqual(r.closed, false); assert.strictEqual(s.calls.length, 1);
  });
  await t('404 and the vendor "does not exist" error code -> envelope-not-found', async () => {
    const s = server(); const r = await make(s).c.check(L('aaaaaaaa-1111-4222-8333-0000000000ff')); assert.strictEqual(r.reason, 'envelope-not-found');
    const s2 = server({ faults: { 1: (r2, srv) => srv.res(400, { errorCode: 'ENVELOPE_DOES_NOT_EXIST' }) } }); assert.strictEqual((await make(s2).c.check(L())).reason, 'envelope-not-found');
  });
  await t('a rejected request (400 other) -> rejected', async () => {
    const s = server({ faults: { 1: (r, srv) => srv.res(400, { errorCode: 'INVALID_REQUEST_BODY' }) } }); assert.strictEqual((await make(s).c.check(L())).reason, 'rejected');
  });
  await t('429 with Retry-After: waits that long, then answers', async () => {
    const waits = []; const s = server({ faults: { 1: (r, srv) => srv.res(429, { errorCode: 'HOURLY_APIINVOCATION_LIMIT_EXCEEDED' }, { 'retry-after': '3' }) } });
    const r = await make(s, { deps: { sleep: async (ms) => { waits.push(ms); } } }).c.check(L()); assert.strictEqual(r.closed, true); assert.deepStrictEqual(waits, [3000]);
  });
  await t('429 with only a reset time: waits until then (capped)', async () => {
    const waits = []; const s = server({ faults: { 1: (r, srv) => srv.res(429, {}, { 'x-ratelimit-reset': String(Math.floor(srv.clock / 1000) + 4) }) } });
    const r = await make(s, { deps: { sleep: async (ms) => { waits.push(ms); } } }).c.check(L()); assert.strictEqual(r.closed, true); assert.ok(waits[0] >= 1000 && waits[0] <= 10000, waits);
  });
  await t('429 forever -> rate-limited, never closed', async () => {
    const f = {}; for (let i = 1; i < 10; i++) f[i] = (r, srv) => srv.res(429, {}, { 'retry-after': '1' });
    const s = server({ faults: f }); const r = await make(s).c.check(L()); assert.strictEqual(r.reason, 'rate-limited'); assert.strictEqual(r.closed, false);
  });
  await t('5xx then OK: the read is retried (safe: it is a GET)', async () => {
    const s = server({ faults: { 1: (r, srv) => srv.res(503, {}) } }); const r = await make(s).c.check(L()); assert.strictEqual(r.closed, true); assert.strictEqual(s.calls.length, 2);
  });
  await t('5xx forever -> not closed', async () => {
    const f = {}; for (let i = 1; i < 10; i++) f[i] = (r, srv) => srv.res(502, {});
    const s = server({ faults: f }); const r = await make(s).c.check(L()); assert.strictEqual(r.ok, false); assert.strictEqual(r.closed, false); assert.strictEqual(r.proof, null);
  });
  await t('timeout then OK; network down for good -> not closed', async () => {
    const s = server({ faults: { 1: () => new Promise(() => {}) } }); assert.strictEqual((await make(s).c.check(L())).closed, true);
    const r = await make(server(), { deps: { fetch: async () => { throw new Error('offline'); } } }).c.check(L()); assert.strictEqual(r.ok, false); assert.strictEqual(r.closed, false);
  });
  await t('READ-BACK THAT CANNOT BE USED: empty / unreadable / changed shape / another envelope -> not closed, no proof', async () => {
    for (const bad of [(srv) => srv.res(200, {}), (srv) => srv.res(200, undefined), (srv) => srv.res(200, { envelopeId: ENV2 }), (srv) => srv.res(200, { status: 'completed' }), (srv) => srv.res(200, { envelopeId: ENV1, status: 'completed' }), (srv) => srv.res(200, { envelopeId: ENV2, status: 7 }), (srv) => srv.res(200, [])]) {
      const s = server({ faults: { 1: (r, srv) => bad(srv) } }); const r = await make(s).c.check(L()); assert.strictEqual(r.closed, false); assert.strictEqual(r.proof, null); assert.strictEqual(r.ok, false);
    }
  });
  await t('envelope input: bare id, DocuSign links (query and path) accepted; anything else refused before any call', async () => {
    const P = FlowDocusignClose.parseEnvelopeId;
    assert.strictEqual(P(ENV1.toUpperCase()), ENV1); assert.strictEqual(P('https://app.docusign.com/documents/details/' + ENV1), ENV1);
    assert.strictEqual(P('https://na3.docusign.net/Signing/EmailStart.aspx?a=x&envelopeId=' + ENV2.toUpperCase()), ENV2);
    for (const bad of ['', 'abc', 'https://evil.example/documents/details/' + ENV1, 'http://app.docusign.com/x/' + ENV1, 'https://docusign.com.evil.example/' + ENV1, ENV1 + '/../x', ENV1 + '?x', 'javascript:alert(1)', null, undefined]) assert.strictEqual(P(bad), null, String(bad));
    const s = server(); const m = make(s); for (const bad of ['../account', ENV1 + '/recipients', 'x']) assert.strictEqual((await m.c.check({ key: 'k', envelope: bad })).reason, 'bad-params'); assert.strictEqual(s.calls.length, 0);
  });
  await t('malformed stored auth (account id, API host, token) -> not-connected, nothing sent; a non-docusign host is never called', async () => {
    const s = server();
    for (const bad of [{ accountId: 'x/../y' }, { baseUri: 'https://evil.example' }, { baseUri: 'https://na3.docusign.net.evil.example' }, { baseUri: 'http://na3.docusign.net' }, { baseUri: BASE + '/path' }, { token: '' }]) assert.strictEqual((await make(s, { auth: Object.assign(AUTH(), bad) }).c.check(L())).reason, 'not-connected');
    assert.strictEqual(s.calls.length, 0);
  });
  await t('a different DocuSign region host is fine (na1, eu, au)', async () => {
    for (const host of ['https://na1.docusign.net', 'https://eu.docusign.net', 'https://demo.docusign.net']) {
      const calls = []; const fetch = async (url, init) => { calls.push(url); return { status: 200, ok: true, json: async () => ({ envelopeId: ENV2, status: 'completed' }), headers: { get: () => null } }; };
      const r = await make(server(), { auth: Object.assign(AUTH(), { baseUri: host }), deps: { fetch } }).c.check(L()); assert.strictEqual(r.closed, true); assert.ok(calls[0].indexOf(host + '/restapi/v2.1/accounts/') === 0);
    }
  });
  await t('never anything but a GET of the envelope: no create, send, correct, void, recipients, documents or audit calls (asserted on every call above)', async () => {
    const s = server(); const m = make(s); await m.c.check(L()); await m.c.verify({ envelopeId: ENV2, key: 'loop-1' }); await m.c.release('loop-1');
    assert.ok(s.calls.every((c) => /\/envelopes\/[0-9a-f-]{36}$/.test(c.url) && c.body === undefined));
  });
  await t('ledger and proof hold ids and a status only — no token, no subject, no recipient', async () => {
    const s = server({ envs: { [ENV2]: { status: 'completed', emailSubject: 'Contract for Dana', recipients: { signers: [{ email: 'dana@x.com' }] } } } }); const m = make(s); const r = await m.c.check(L());
    const dump = JSON.stringify(m.ledger.m) + JSON.stringify(r);
    assert.ok(dump.indexOf('tok-1') < 0 && dump.indexOf('r-1') < 0 && dump.indexOf('Bearer') < 0 && dump.indexOf('Dana') < 0 && dump.indexOf('dana@x.com') < 0);
  });
  await t('not connected: nothing sent', async () => {
    const s = server(); const r = await make(s, { auth: null, deps: { getAuth: async () => null } }).c.check(L()); assert.strictEqual(r.reason, 'not-connected'); assert.strictEqual(s.calls.length, 0);
  });
  console.log('\n' + passed + ' passed');
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
