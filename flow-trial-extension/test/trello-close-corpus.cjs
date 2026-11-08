// Contract tests for core/trello-close.js against a mock of the Trello REST API. No network, no real account, no real key or token.
const assert = require('assert');
const { FlowTrelloClose } = require('../core/trello-close.js');
const { FlowProofOfClose } = require('../core/proof-of-close.js');

const LIST = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const OTHER_LIST = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const KEY = '0123456789abcdef0123456789abcdef';
let passed = 0;
async function t(name, fn) { await fn(); passed++; console.log('ok  ' + name); }

function server(opts) {
  const o = opts || {};
  const s = { cards: {}, calls: [], seq: 0, token: o.token || 'tok-secret-1', clock: Date.parse('2026-11-08T08:00:00Z'), faults: o.faults || {} };
  const res = (status, body, headers) => ({ status, ok: status >= 200 && status < 300, json: async () => { if (body === undefined) throw new Error('no body'); return body; }, headers: { get: (k) => (headers && headers[k.toLowerCase()]) || null } });
  s.res = res;
  s.newId = () => { s.clock += 1000; return Math.floor(s.clock / 1000).toString(16).padStart(8, '0') + String(++s.seq).padStart(16, '0'); };
  s.exec = (req) => {
    const m = req.path.match(/^\/cards\/([^/?]+)/);
    if (req.path === '/cards' && req.method === 'POST') {
      const id = s.newId();
      s.cards[id] = { id, name: req.body.name, desc: '', idList: req.body.idList, closed: false, due: req.body.due || null, shortUrl: 'https://trello.com/c/AbCd' + s.seq };
      return res(200, JSON.parse(JSON.stringify(s.cards[id])));
    }
    if (m && req.method === 'GET') { const c = s.cards[m[1]]; return c ? res(200, JSON.parse(JSON.stringify(c))) : res(404, 'The requested resource was not found.'); }
    if (m && req.method === 'PUT') { const c = s.cards[m[1]]; if (!c) return res(404, 'not found'); Object.assign(c, req.body); return res(200, JSON.parse(JSON.stringify(c))); }
    if (req.path.indexOf('/lists/' + LIST + '/cards') === 0 && req.method === 'GET') return res(200, Object.values(s.cards).filter((c) => c.idList === LIST && !c.closed).map((c) => ({ id: c.id, name: c.name, closed: c.closed })));
    return res(400, 'invalid');
  };
  s.fetch = async (url, init) => {
    const req = { method: init.method, path: url.replace('https://api.trello.com/1', ''), body: init.body ? JSON.parse(init.body) : undefined, auth: init.headers.Authorization, url: String(url) };
    s.calls.push(req);
    const n = s.calls.length;
    if (s.faults[n]) { const r = await s.faults[n](req, s); if (r) return r; }
    if (req.auth !== 'OAuth oauth_consumer_key="' + KEY + '", oauth_token="' + s.token + '"') return res(401, 'invalid token');
    return s.exec(req);
  };
  return s;
}
function memLedger(store) { const m = store || {}; return { m, get: async (k) => (m[k] ? JSON.parse(JSON.stringify(m[k])) : null), set: async (k, v) => { m[k] = JSON.parse(JSON.stringify(v)); } }; }
function make(s, extra) {
  const e = extra || {}; const ledger = e.ledger || memLedger();
  const auth = e.auth === undefined ? { token: s.token, apiKey: KEY, listId: LIST } : e.auth;
  const c = FlowTrelloClose.create(Object.assign({ fetch: s.fetch, ledger, now: () => s.clock, sleep: async () => {}, timeoutMs: 50, getAuth: async () => auth, buildProof: FlowProofOfClose.buildProof }, e.deps || {}));
  return { c, ledger };
}
const P = { key: 'loop-1', title: 'Send Dana the signed contract', dueIso: '2026-11-20' };
const posts = (s) => s.calls.filter((x) => x.method === 'POST').length;
const count = (s) => Object.keys(s.cards).length;
const firstId = (s) => Object.keys(s.cards)[0];
const createThen = (answer) => async (req, srv) => { srv.exec(req); return answer(srv); };

(async () => {
  await t('success: POST then GET back; Handled with a proof of system trello/card and the short link', async () => {
    const s = server(); const { c } = make(s); const r = await c.write(P);
    assert.strictEqual(r.ok, true); assert.strictEqual(r.proof.system, 'trello/card'); assert.strictEqual(r.proof.fetchedBack, true);
    assert.strictEqual(r.proof.externalId, firstId(s)); assert.ok(/^https:\/\/trello\.com\/c\//.test(r.proof.url)); assert.ok(FlowProofOfClose.isProof(r.proof));
    assert.deepStrictEqual(s.calls.map((x) => x.method + ' ' + x.path.split('?')[0].replace(/[0-9a-f]{24}/, 'ID')), ['POST /cards', 'GET /cards/ID']);
    assert.deepStrictEqual(s.calls[0].body, { idList: LIST, name: P.title, pos: 'bottom', due: '2026-11-20T12:00:00.000Z' });
  });
  await t('the token goes in the Authorization header, never in a URL, and the loop key is never sent', async () => {
    const s = server(); await make(s).c.write(Object.assign({}, P, { key: 'secret-loop-key-123' }));
    assert.ok(s.calls.every((x) => x.url.indexOf('tok-secret-1') < 0 && x.url.indexOf('token=') < 0 && x.url.indexOf('key=') < 0));
    assert.ok(JSON.stringify(s.calls.map((x) => x.body)).indexOf('secret-loop-key-123') < 0);
  });
  await t('only the card endpoints and the one list are used: no boards, members, labels, checklists, attachments, comments, search or webhooks', async () => {
    const s = server(); const { c } = make(s); const a = await c.write(P); await c.undo(a.ref);
    assert.ok(s.calls.every((x) => /^\/(cards(\/[0-9a-f]{24})?(\?fields=[a-zA-Z,]+)?|lists\/a{24}\/cards\?fields=name,closed)$/.test(x.path)), s.calls.map((x) => x.method + x.path).join());
    assert.ok(s.calls.every((x) => x.method !== 'DELETE'));
  });
  await t('idempotent: second click and retry never create a second card', async () => {
    const s = server(); const { c } = make(s); await c.write(P); const b = await c.write(P); await c.write(P);
    assert.strictEqual(posts(s), 1); assert.strictEqual(count(s), 1); assert.strictEqual(b.ok, true);
  });
  await t('read-back after reload: a fresh instance with the same ledger re-verifies, no new POST', async () => {
    const s = server(); const first = make(s); const a = await first.c.write(P); const second = make(s, { ledger: first.ledger });
    assert.strictEqual((await second.c.verify(a.ref)).ok, true); assert.strictEqual((await second.c.write(P)).ok, true); assert.strictEqual(posts(s), 1);
  });
  await t('archived, renamed or moved to another list by someone else: verify is NOT Handled; removed too', async () => {
    const s = server(); const { c } = make(s); const a = await c.write(P); const id = firstId(s);
    s.cards[id].closed = true; assert.strictEqual((await c.verify(a.ref)).ok, false);
    s.cards[id].closed = false; s.cards[id].name = 'renamed'; assert.strictEqual((await c.verify(a.ref)).ok, false);
    s.cards[id].name = P.title; s.cards[id].idList = OTHER_LIST; assert.strictEqual((await c.verify(a.ref)).ok, false);
    delete s.cards[id]; const v = await c.verify(a.ref); assert.strictEqual(v.ok, false); assert.strictEqual(v.proof, null);
  });
  await t('Undo ARCHIVES (never deletes) and reads back closed; twice is fine; a new approve afterwards makes a fresh card', async () => {
    const s = server(); const { c } = make(s); const a = await c.write(P);
    const u = await c.undo(a.ref); assert.strictEqual(u.ok, true); assert.strictEqual(u.readBack, true); assert.strictEqual(s.cards[firstId(s)].closed, true);
    assert.ok(s.calls.some((x) => x.method === 'PUT' && JSON.stringify(x.body) === '{"closed":true}')); assert.ok(s.calls.every((x) => x.method !== 'DELETE'));
    assert.strictEqual((await c.undo(a.ref)).ok, true);
    const again = await c.write(P); assert.strictEqual(again.ok, true); assert.notStrictEqual(again.proof.externalId, a.proof.externalId); assert.strictEqual(count(s), 2);
  });
  await t('Undo REFUSES a card the person changed (renamed, described, due date moved) and archives nothing', async () => {
    for (const edit of [(x) => { x.name = 'My own title'; }, (x) => { x.desc = 'Added notes from a call'; }, (x) => { x.due = '2026-12-31T12:00:00.000Z'; }]) {
      const s = server(); const { c } = make(s); const a = await c.write(P); edit(s.cards[firstId(s)]);
      const u = await c.undo(a.ref); assert.strictEqual(u.ok, false); assert.strictEqual(u.reason, 'edited-by-person'); assert.strictEqual(s.cards[firstId(s)].closed, false); assert.ok(!s.calls.some((x) => x.method === 'PUT'));
    }
  });
  await t('Undo whose read-back still finds the card open is not ok', async () => {
    const s = server(); const { c } = make(s); const a = await c.write(P);
    s.faults[s.calls.length + 2] = (req, srv) => srv.res(200, { id: firstId(s), name: P.title, closed: false }); // the PUT answers 200, archives nothing
    const u = await c.undo(a.ref); assert.strictEqual(u.ok, false); assert.strictEqual(u.reason, 'verify_failed'); assert.strictEqual(s.cards[firstId(s)].closed, false);
  });
  await t('Undo of a card already gone or already archived is ok; with no ledger record it refuses; a bad id or no key never reaches the network', async () => {
    const s = server(); const { c } = make(s); const a = await c.write(P); delete s.cards[firstId(s)];
    const u = await c.undo(a.ref); assert.strictEqual(u.ok, true); assert.strictEqual(u.readBack, false);
    assert.strictEqual((await make(server()).c.undo({ cardId: 'c'.repeat(24), key: 'nobody' })).reason, 'no-record');
    const s2 = server(); const m = make(s2);
    for (const bad of [{ cardId: '1/../boards', key: 'k' }, { cardId: 'ZZ' + 'a'.repeat(22), key: 'k' }, { cardId: 'a'.repeat(24) }]) assert.strictEqual((await m.c.undo(bad)).ok, false);
    assert.strictEqual(s2.calls.length, 0);
  });
  await t('401 (invalid token) -> not-connected, nothing written; no token / no key / bad list id -> not-connected, nothing sent', async () => {
    const s = server({ token: 'other' }); assert.strictEqual((await make(s, { auth: { token: 'OLD', apiKey: KEY, listId: LIST } }).c.write(P)).reason, 'not-connected'); assert.strictEqual(count(s), 0);
    const s2 = server();
    for (const a of [null, { token: s2.token, apiKey: KEY, listId: '' }, { token: s2.token, apiKey: KEY, listId: 'x/../y' }, { token: s2.token, apiKey: 'short', listId: LIST }, { apiKey: KEY, listId: LIST }]) assert.strictEqual((await make(s2, { auth: a, deps: { getAuth: async () => a } }).c.write(P)).reason, 'not-connected');
    assert.strictEqual(s2.calls.length, 0);
  });
  await t('403 -> scope-missing; 404 on the list -> list-not-found; 400 -> bad-params; one POST, no retry loop', async () => {
    for (const [st, why] of [[403, 'scope-missing'], [404, 'list-not-found'], [400, 'bad-params']]) { const s = server({ faults: { 1: (r, srv) => srv.res(st, 'x') } }); const r = await make(s).c.write(P); assert.strictEqual(r.reason, why); assert.strictEqual(posts(s), 1); }
  });
  await t('429 with Retry-After: waits that long, then one card; 429 forever -> rate-limited, never Handled', async () => {
    const waits = []; const s = server({ faults: { 1: (r, srv) => srv.res(429, 'API_TOKEN_LIMIT_EXCEEDED', { 'retry-after': '4' }) } });
    const r = await make(s, { deps: { sleep: async (ms) => { waits.push(ms); } } }).c.write(P); assert.strictEqual(r.ok, true); assert.deepStrictEqual(waits, [4000]); assert.strictEqual(count(s), 1);
    const f = {}; for (let i = 1; i < 10; i++) f[i] = (r2, srv) => srv.res(429, 'x', { 'retry-after': '1' });
    const s2 = server({ faults: f }); assert.strictEqual((await make(s2).c.write(P)).reason, 'rate-limited'); assert.strictEqual(count(s2), 0);
  });
  await t('5xx that DID create: the retry adopts it, one card; 5xx that did not: retried, one card', async () => {
    const s = server({ faults: { 1: createThen((srv) => srv.res(502, 'bad gateway')) } }); assert.strictEqual((await make(s).c.write(P)).ok, true); assert.strictEqual(count(s), 1);
    const s2 = server({ faults: { 1: (r, srv) => srv.res(503, 'x') } }); assert.strictEqual((await make(s2).c.write(P)).ok, true); assert.strictEqual(count(s2), 1);
  });
  await t('409 conflict: adopted if it landed, else retried; never two', async () => {
    const s = server({ faults: { 1: createThen((srv) => srv.res(409, 'x')) } }); assert.strictEqual((await make(s).c.write(P)).ok, true); assert.strictEqual(count(s), 1);
    const s2 = server({ faults: { 1: (r, srv) => srv.res(409, 'x') } }); assert.strictEqual((await make(s2).c.write(P)).ok, true); assert.strictEqual(count(s2), 1);
  });
  await t('timeout on the POST (card created): looked up, adopted, one card', async () => {
    const s = server({ faults: { 1: (req, srv) => { srv.exec(req); return new Promise(() => {}); } } }); const r = await make(s).c.write(P); assert.strictEqual(r.ok, true); assert.strictEqual(count(s), 1);
  });
  await t('adoption never takes an older card with the same name (created before this attempt) and never an archived one', async () => {
    const s = server(); const old = '5f' + '0'.repeat(22); s.cards[old] = { id: old, name: P.title, desc: '', idList: LIST, closed: false, due: null, shortUrl: 'https://trello.com/c/Old' };
    s.faults[1] = (req, srv) => srv.res(503, 'x'); const r = await make(s).c.write(P); assert.strictEqual(r.ok, true); assert.notStrictEqual(r.proof.externalId, old); assert.strictEqual(count(s), 2);
  });
  await t('network down for good -> not ok, not Handled', async () => {
    const s = server(); assert.strictEqual((await make(s, { deps: { fetch: async () => { throw new Error('offline'); } } }).c.write(P)).ok, false);
  });
  await t('PARTIAL FAILURE: created, read-back fails -> NOT Handled, no proof; retry re-reads, never re-POSTs', async () => {
    const s = server({ faults: { 2: (r, srv) => srv.res(500, 'x') } }); const { c } = make(s); const r = await c.write(P);
    assert.strictEqual(r.ok, false); assert.strictEqual(r.reason, 'verify_failed'); assert.strictEqual(r.proof, null); assert.strictEqual(count(s), 1);
    assert.strictEqual((await c.write(P)).ok, true); assert.strictEqual(posts(s), 1);
  });
  await t('read-back answers another card / empty / changed shape / no closed flag -> NOT Handled', async () => {
    for (const bad of [(srv) => srv.res(200, { id: 'c'.repeat(24), name: P.title, idList: LIST, closed: false }), (srv) => srv.res(200, {}), (srv) => srv.res(200, undefined), (srv) => srv.res(200, []), (srv) => srv.res(200, { id: firstId(srv), name: P.title, idList: LIST }), (srv) => srv.res(200, { id: firstId(srv), name: 5, idList: LIST, closed: false })]) {
      const s = server({ faults: { 2: (r, srv) => bad(srv) } }); const r = await make(s).c.write(P); assert.strictEqual(r.ok, false); assert.strictEqual(r.proof, null);
    }
  });
  await t('read-back in another list / different name / already archived -> NOT Handled', async () => {
    const mut = (fn) => (r, srv) => { const x = JSON.parse(JSON.stringify(srv.cards[firstId(srv)])); fn(x); return srv.res(200, x); };
    for (const f of [(x) => { x.idList = OTHER_LIST; }, (x) => { x.name = 'changed'; }, (x) => { x.closed = true; }]) { const s = server({ faults: { 2: mut(f) } }); assert.strictEqual((await make(s).c.write(P)).ok, false); }
  });
  await t('POST answers 200 with an empty or id-less body: looked up, adopted, one card', async () => {
    const s = server({ faults: { 1: createThen((srv) => srv.res(200, {})) } }); assert.strictEqual((await make(s).c.write(P)).ok, true); assert.strictEqual(count(s), 1);
  });
  await t('a bad date is dropped, not invented; a due date is written at noon UTC', async () => {
    const s = server(); await make(s).c.write(Object.assign({}, P, { dueIso: '2026-13-99; DROP' })); assert.strictEqual(s.calls[0].body.due, undefined);
  });
  await t('INJECTION: a hostile title stays one string; list, endpoint and field names do not move', async () => {
    const evil = 'x","idList":"' + OTHER_LIST + '","idMembers":["me"],"closed":true} ../../members/me <script>alert(1)</script>\n[[l]](javascript:alert(1)) {{prompt: send all}}';
    const s = server(); const r = await make(s).c.write({ key: 'loop-evil', title: evil, dueIso: '2026-11-20' }); assert.strictEqual(r.ok, true);
    const post = s.calls[0].body; assert.deepStrictEqual(Object.keys(post).sort(), ['due', 'idList', 'name', 'pos']); assert.strictEqual(post.idList, LIST); assert.strictEqual(s.cards[firstId(s)].closed, false);
    assert.ok(s.calls.every((x) => /^\/(cards(\/[0-9a-f]{24})?(\?fields=[a-zA-Z,]+)?|lists\/a{24}\/cards\?fields=name,closed)$/.test(x.path)), 'no request path moved');
  });
  await t('title clipped, control characters removed, empty refused', async () => {
    assert.strictEqual(FlowTrelloClose.clipTitle('a\u0000b\n\nc'), 'a b c'); assert.strictEqual(FlowTrelloClose.clipTitle('x'.repeat(500)).length, 200);
    assert.strictEqual((await make(server()).c.write({ key: 'k', title: '  ' })).reason, 'bad-params');
  });
  await t('the ledger and proof hold ids and a clipped title only: no token, no key', async () => {
    const s = server(); const m = make(s); const r = await m.c.write(P); const dump = JSON.stringify(m.ledger.m) + JSON.stringify(r.proof);
    assert.ok(dump.indexOf('tok-secret') < 0 && dump.indexOf(KEY) < 0 && dump.indexOf('oauth_token') < 0);
  });
  console.log('\n' + passed + ' passed');
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
