// Contract tests for core/box-close.js against a mock of the Box API 2.0. No network, no real account, no real token.
const assert = require('assert');
const nodeCrypto = require('crypto');
const { FlowBoxClose } = require('../core/box-close.js');
const { FlowProofOfClose } = require('../core/proof-of-close.js');

let passed = 0;
async function t(name, fn) { await fn(); passed++; console.log('ok  ' + name); }
const sha1 = async (u8) => new Uint8Array(nodeCrypto.createHash('sha1').update(u8).digest());
const sha1hex = (buf) => nodeCrypto.createHash('sha1').update(buf).digest('hex');
const B = (s) => new Uint8Array(Buffer.from(s));
const FOLDER = '240000000001';
const OTHER_FOLDER = '250000000002';

// Parses the multipart body the engine sends: { attrs, file } or null when it is malformed.
function parseMultipart(body, ctype) {
  const m = /^multipart\/form-data; boundary=(.+)$/.exec(ctype || ''); if (!m) return null;
  const buf = Buffer.from(body); const b = '--' + m[1];
  const first = buf.indexOf(b); const second = buf.indexOf(b, first + b.length); const end = buf.indexOf(b + '--');
  if (first !== 0 || second < 0 || end < 0) return null;
  const p1 = buf.slice(first + b.length + 2, second - 2).toString('utf8'); const [h1, j] = p1.split('\r\n\r\n');
  const p2 = buf.slice(second + b.length + 2, end - 2); const sep = p2.indexOf('\r\n\r\n');
  if (!/name="attributes"/.test(h1)) return null; if (!/name="file"/.test(p2.slice(0, sep).toString())) return null;
  return { attrs: JSON.parse(j), file: p2.slice(sep + 4), order: [h1.indexOf('attributes'), p2.slice(0, sep).toString().indexOf('"file"')] };
}

function server(opts) {
  const o = opts || {};
  const s = { files: {}, calls: [], seq: 0, token: o.token || 'tok-1', faults: o.faults || {} };
  const res = (status, body, headers) => ({ status, ok: status >= 200 && status < 300, json: async () => { if (body === undefined) throw new Error('no body'); return body; }, headers: { get: (k) => (headers && headers[k.toLowerCase()]) || null } });
  s.res = res;
  const out = (f) => ({ type: 'file', id: f.id, name: f.name, size: f.bytes.length, sha1: sha1hex(f.bytes), parent: { id: f.parent }, item_status: f.status || 'active' });
  s.exec = (req) => {
    if (req.method === 'POST' && req.url === 'https://upload.box.com/api/2.0/files/content') {
      const mp = parseMultipart(req.body, req.ctype); if (!mp) return res(400, { code: 'bad_request' });
      const dup = Object.values(s.files).find((f) => f.parent === mp.attrs.parent.id && f.name === mp.attrs.name && f.status !== 'trashed');
      if (dup) return res(409, { code: 'item_name_in_use', context_info: { conflicts: { id: dup.id, type: 'file', name: dup.name } } });
      const id = String(1300000000000 + (++s.seq)); s.files[id] = { id, name: mp.attrs.name, parent: mp.attrs.parent.id, bytes: Buffer.from(mp.file), status: 'active', attrs: mp.attrs };
      return res(201, { total_count: 1, entries: [out(s.files[id])] });
    }
    let m = req.url.match(/^https:\/\/api\.box\.com\/2\.0\/files\/(\d+)(\?.*)?$/);
    if (m && req.method === 'GET') { const f = s.files[m[1]]; return f && f.status !== 'deleted' ? res(200, out(f)) : res(404, { code: 'not_found' }); }
    if (m && req.method === 'DELETE') { const f = s.files[m[1]]; if (!f) return res(404, {}); f.status = 'trashed'; return res(204, undefined); }
    m = req.url.match(/^https:\/\/api\.box\.com\/2\.0\/folders\/(\d+)\/items\?/);
    if (m && req.method === 'GET') return res(200, { total_count: 0, entries: Object.values(s.files).filter((f) => f.parent === m[1] && f.status === 'active').map((f) => ({ type: 'file', id: f.id, name: f.name })) });
    return res(400, { code: 'unrouted' });
  };
  s.fetch = async (url, init) => {
    const req = { method: init.method, url: String(url), auth: init.headers.Authorization, body: init.body, ctype: init.headers['Content-Type'] };
    s.calls.push(req); const n = s.calls.length;
    assert.ok(/^https:\/\/(upload|api)\.box\.com\/2\.0\/|^https:\/\/upload\.box\.com\/api\/2\.0\//.test(req.url), 'only Box hosts: ' + req.url);
    if (s.faults[n]) { const r = await s.faults[n](req, s); if (r) return r; }
    if (req.auth !== 'Bearer ' + s.token) return res(401, { code: 'unauthorized' });
    return s.exec(req);
  };
  return s;
}
function memLedger(store) { const m = store || {}; return { m, get: async (k) => (m[k] ? JSON.parse(JSON.stringify(m[k])) : null), set: async (k, v) => { m[k] = JSON.parse(JSON.stringify(v)); } }; }
function make(s, extra) {
  const e = extra || {}; const ledger = e.ledger || memLedger(); let auth = e.auth === undefined ? { token: 'tok-1', refreshToken: 'r-1', folderId: FOLDER } : e.auth; const saved = [];
  const c = FlowBoxClose.create(Object.assign({ fetch: s.fetch, ledger, now: () => 1000, sleep: async () => {}, timeoutMs: 50, sha1: sha1, getAuth: async () => auth, saveAuth: async (a) => { auth = a; saved.push(a); }, buildProof: FlowProofOfClose.buildProof }, e.deps || {}));
  return { c, ledger, saved };
}
const F = (over) => Object.assign({ key: 'loop-1', name: 'Contract-signed.pdf', bytes: B('PDF-1.7 the signed contract') }, over || {});
const uploads = (s) => s.calls.filter((x) => x.method === 'POST').length;
const count = (s) => Object.keys(s.files).length;
const firstId = (s) => Object.keys(s.files)[0];
const uploadThen = (answer) => async (req, srv) => { srv.exec(req); return answer(srv); };

(async () => {
  await t('success: upload then an independent GET; Handled only on matching id, size and SHA-1 in the chosen folder; proof system box/file', async () => {
    const s = server(); const r = await make(s).c.save(F());
    assert.strictEqual(r.ok, true); assert.strictEqual(r.proof.system, 'box/file'); assert.strictEqual(r.proof.fetchedBack, true); assert.strictEqual(r.proof.externalId, firstId(s)); assert.ok(FlowProofOfClose.isProof(r.proof));
    assert.deepStrictEqual(s.calls.map((x) => x.method + ' ' + x.url.replace(/\/\d{6,}/, '/ID').replace(/\?.*/, '')), ['POST https://upload.box.com/api/2.0/files/content', 'GET https://api.box.com/2.0/files/ID']);
  });
  await t('the upload is one multipart body: attributes first (name and the chosen parent), then the exact bytes; the boundary is not in the bytes', async () => {
    const s = server(); await make(s).c.save(F()); const mp = parseMultipart(s.calls[0].body, s.calls[0].ctype);
    assert.deepStrictEqual(mp.attrs, { name: 'Contract-signed.pdf', parent: { id: FOLDER } }); assert.strictEqual(Buffer.from(mp.file).toString(), 'PDF-1.7 the signed contract'); assert.ok(mp.order[0] >= 0);
    const tricky = B('xx----GlanceBoxAAAA'); const s2 = server(); const r = await make(s2, { deps: { randomHex: (() => { let n = 0; return (k) => (n++ === 0 ? 'AAAA'.padEnd(k, 'A') : 'b'.repeat(k)); })() } }).c.save(F({ bytes: B('xx----GlanceBoxAAAAAAAAAAAAAAAAAAAAAAAA yy') })); assert.strictEqual(r.ok, true);
    assert.strictEqual(Buffer.from(parseMultipart(s2.calls[0].body, s2.calls[0].ctype).file).toString(), 'xx----GlanceBoxAAAAAAAAAAAAAAAAAAAAAAAA yy');
  });
  await t('NEVER OVERWRITES: only a plain upload is ever sent (no /content version endpoint, no PUT, no conflict-resolution flag); only the five file calls and one folder read are used', async () => {
    const s = server(); const m = make(s); const a = await m.c.save(F()); await m.c.undo(a.ref);
    assert.ok(s.calls.every((x) => /^(POST https:\/\/upload\.box\.com\/api\/2\.0\/files\/content|GET https:\/\/api\.box\.com\/2\.0\/files\/\d+\?fields=[a-z0-9_,]+|DELETE https:\/\/api\.box\.com\/2\.0\/files\/\d+)$/.test(x.method + ' ' + x.url)), s.calls.map((x) => x.method + x.url).join('\n'));
    assert.ok(s.calls.every((x) => x.url.indexOf('/content') < 0 || x.method === 'POST'));
  });
  await t('Hebrew and spaced names survive in the attributes; separators, traversal, control characters and quotes are cleaned out of the name', async () => {
    const s = server(); const r = await make(s).c.save(F({ name: 'חוזה חתום 2026.pdf' })); assert.strictEqual(r.ok, true); assert.strictEqual(parseMultipart(s.calls[0].body, s.calls[0].ctype).attrs.name, 'חוזה חתום 2026.pdf');
    for (const [bad, ok] of [['../../etc/passwd', 'etc passwd'], ['a/b\\c.pdf', 'a b c.pdf'], ['x"y\r\nz.pdf', 'x y z.pdf'], ['  ..hidden.pdf ', 'hidden.pdf']]) assert.strictEqual(FlowBoxClose.cleanName(bad), ok, bad);
    assert.strictEqual(FlowBoxClose.cleanName('a'.repeat(300) + '.pdf').length, 180); assert.ok(FlowBoxClose.cleanName('a'.repeat(300) + '.pdf').endsWith('.pdf'));
  });
  await t('idempotent: second click and retry never upload twice; reload with the same ledger re-verifies', async () => {
    const s = server(); const first = make(s); const a = await first.c.save(F()); await first.c.save(F()); const b = await make(s, { ledger: first.ledger }).c.save(F());
    assert.strictEqual(uploads(s), 1); assert.strictEqual(count(s), 1); assert.strictEqual(b.ok, true); assert.strictEqual((await make(s, { ledger: first.ledger }).c.verify(a.ref)).ok, true);
  });
  await t('a file edited after the save (a new version, so another SHA-1), trashed, moved to another folder or removed: verify is NOT Handled', async () => {
    const s = server(); const { c } = make(s); const a = await c.save(F()); const id = firstId(s); const orig = s.files[id].bytes;
    s.files[id].bytes = Buffer.from('edited by the person'); assert.strictEqual((await c.verify(a.ref)).ok, false);
    s.files[id].bytes = orig; s.files[id].status = 'trashed'; assert.strictEqual((await c.verify(a.ref)).ok, false);
    s.files[id].status = 'active'; s.files[id].parent = OTHER_FOLDER; assert.strictEqual((await c.verify(a.ref)).ok, false);
    delete s.files[id]; const v = await c.verify(a.ref); assert.strictEqual(v.ok, false); assert.strictEqual(v.proof, null);
  });
  await t('name already in the folder with DIFFERENT content: reported (name-taken), nothing written, the other file untouched', async () => {
    const s = server(); s.files['1399999999999'] = { id: '1399999999999', name: 'Contract-signed.pdf', parent: FOLDER, bytes: Buffer.from('someone else'), status: 'active' };
    const r = await make(s).c.save(F()); assert.strictEqual(r.ok, false); assert.strictEqual(r.reason, 'name-taken'); assert.strictEqual(count(s), 1); assert.strictEqual(s.files['1399999999999'].bytes.toString(), 'someone else');
  });
  await t('name already in the folder with the SAME content (an earlier unrecorded upload): adopted and proved, never duplicated', async () => {
    const s = server(); s.files['1399999999998'] = { id: '1399999999998', name: 'Contract-signed.pdf', parent: FOLDER, bytes: Buffer.from(F().bytes), status: 'active' };
    const r = await make(s).c.save(F()); assert.strictEqual(r.ok, true); assert.strictEqual(r.proof.externalId, '1399999999998'); assert.strictEqual(count(s), 1);
  });
  await t('Undo trashes (restorable) and reads back trashed; twice is fine; a new approve afterwards makes a fresh file', async () => {
    const s = server(); const { c } = make(s); const a = await c.save(F()); const u = await c.undo(a.ref);
    assert.strictEqual(u.ok, true); assert.strictEqual(u.readBack, true); assert.strictEqual(s.files[firstId(s)].status, 'trashed');
    assert.strictEqual((await c.undo(a.ref)).ok, true);
    const again = await c.save(F()); assert.strictEqual(again.ok, true); assert.notStrictEqual(again.proof.externalId, a.proof.externalId);
  });
  await t('Undo REFUSES a file the person changed (a new version) and sends no DELETE at all', async () => {
    const s = server(); const { c } = make(s); const a = await c.save(F()); s.files[firstId(s)].bytes = Buffer.from('my own version');
    const u = await c.undo(a.ref); assert.strictEqual(u.ok, false); assert.strictEqual(u.reason, 'edited-by-person'); assert.strictEqual(s.files[firstId(s)].status, 'active'); assert.ok(!s.calls.some((x) => x.method === 'DELETE'));
  });
  await t('Undo whose read-back still finds the file active is not ok; with no ledger record it refuses; bad ids never reach the network', async () => {
    const s = server(); const { c } = make(s); const a = await c.save(F());
    s.faults[s.calls.length + 2] = (req, srv) => srv.res(204, undefined); // the DELETE answers 204 but trashes nothing: skip the real exec
    const u = await c.undo(a.ref); assert.strictEqual(u.ok, false); assert.strictEqual(u.reason, 'verify_failed');
    const s2 = server(); s2.files['1399999999000'] = { id: '1399999999000', name: 'x.pdf', parent: FOLDER, bytes: Buffer.from('not glance'), status: 'active' }; const m = make(s2); const nr = await m.c.undo({ fileId: '1399999999000', key: 'nobody' }); assert.strictEqual(nr.ok, false); assert.strictEqual(nr.reason, 'edited-by-person'); assert.ok(!s2.calls.some((x) => x.method === 'DELETE')); assert.strictEqual(s2.files['1399999999000'].status, 'active');
    const s3 = server(); const m3 = make(s3); for (const bad of [{ fileId: '12/../x' }, { fileId: 'abc' }, { fileId: '0' }, {}]) assert.strictEqual((await m3.c.undo(bad)).ok, false); assert.strictEqual(s3.calls.length, 0);
  });
  await t('Undo of a file already gone is ok without claiming a read-back', async () => {
    const s = server(); const { c } = make(s); const a = await c.save(F()); delete s.files[firstId(s)];
    const u = await c.undo(a.ref); assert.strictEqual(u.ok, true); assert.strictEqual(u.readBack, false);
  });
  await t('not connected: no token, no folder, the root folder (0), a malformed folder id, empty or non-bytes input are refused before any call', async () => {
    const s = server();
    for (const a of [null, { token: 't' }, { token: 't', folderId: '0' }, { token: 't', folderId: '12/../x' }, { folderId: FOLDER }]) assert.strictEqual((await make(s, { auth: a, deps: { getAuth: async () => a } }).c.save(F())).reason, 'not-connected');
    for (const bad of [{ bytes: new Uint8Array(0) }, { bytes: 'text' }, { name: '///' }, { key: '' }]) assert.strictEqual((await make(s).c.save(F(bad))).reason, 'bad-params');
    assert.strictEqual((await make(s).c.save(F({ bytes: { length: 21 * 1024 * 1024 } instanceof Uint8Array ? null : new Uint8Array(21 * 1024 * 1024) }))).reason, 'too-large');
    assert.strictEqual(s.calls.length, 0);
  });
  await t('401 -> one refresh -> retried and the new token saved; refresh fails or no refresh token -> not-connected, nothing written', async () => {
    const s = server({ token: 'tok-2' }); let n = 0;
    const { c, saved } = make(s, { auth: { token: 'OLD', refreshToken: 'r-1', folderId: FOLDER }, deps: { refresh: async () => { n++; return { token: 'tok-2', refreshToken: 'r-2' }; } } });
    assert.strictEqual((await c.save(F())).ok, true); assert.strictEqual(n, 1); assert.strictEqual(saved[0].refreshToken, 'r-2'); assert.strictEqual(saved[0].folderId, FOLDER);
    assert.strictEqual((await make(server({ token: 'tok-2' }), { auth: { token: 'OLD', refreshToken: 'r', folderId: FOLDER }, deps: { refresh: async () => null } }).c.save(F())).reason, 'not-connected');
    const s3 = server({ token: 'tok-2' }); assert.strictEqual((await make(s3, { auth: { token: 'OLD', folderId: FOLDER } }).c.save(F())).reason, 'not-connected'); assert.strictEqual(count(s3), 0);
  });
  await t('403 -> scope-missing; 404 on the folder is not a close; 507 -> no-space; 400 -> rejected; one upload each, no retry loop', async () => {
    for (const [st, why] of [[403, 'scope-missing'], [507, 'no-space'], [400, 'rejected']]) { const s = server({ faults: { 1: (r, srv) => srv.res(st, { code: 'x' }) } }); const r = await make(s).c.save(F()); assert.strictEqual(r.reason, why, String(st)); assert.strictEqual(uploads(s), 1); }
    const s = server({ faults: { 1: (r, srv) => srv.res(404, { code: 'not_found' }) } }); const r = await make(s).c.save(F()); assert.strictEqual(r.ok, false); assert.strictEqual(count(s), 0);
  });
  await t('429 with Retry-After: waits that long, then one file; 429 forever -> rate-limited, never Handled', async () => {
    const waits = []; const s = server({ faults: { 1: (r, srv) => srv.res(429, {}, { 'retry-after': '4' }) } });
    const r = await make(s, { deps: { sleep: async (ms) => { waits.push(ms); } } }).c.save(F()); assert.strictEqual(r.ok, true); assert.deepStrictEqual(waits, [4000]); assert.strictEqual(count(s), 1);
    const f = {}; for (let i = 1; i < 10; i++) f[i] = (r2, srv) => srv.res(429, {}, { 'retry-after': '1' });
    const s2 = server({ faults: f }); assert.strictEqual((await make(s2).c.save(F())).reason, 'rate-limited'); assert.strictEqual(count(s2), 0);
  });
  await t('5xx that DID store the file: the retry finds and adopts it, one file; 5xx that did not: retried, one file; 409 after a real store is adopted', async () => {
    const s = server({ faults: { 1: uploadThen((srv) => srv.res(502, {})) } }); assert.strictEqual((await make(s).c.save(F())).ok, true); assert.strictEqual(count(s), 1);
    const s2 = server({ faults: { 1: (r, srv) => srv.res(503, {}) } }); assert.strictEqual((await make(s2).c.save(F())).ok, true); assert.strictEqual(count(s2), 1);
    const s3 = server({ faults: { 1: uploadThen((srv) => srv.res(409, { code: 'item_name_in_use', context_info: { conflicts: { id: firstId(srv) } } })) } }); assert.strictEqual((await make(s3).c.save(F())).ok, true); assert.strictEqual(count(s3), 1);
  });
  await t('timeout on the upload (file stored): looked up, adopted, one file; network down for good -> not ok', async () => {
    const s = server({ faults: { 1: (req, srv) => { srv.exec(req); return new Promise(() => {}); } } }); const r = await make(s).c.save(F()); assert.strictEqual(r.ok, true); assert.strictEqual(count(s), 1);
    assert.strictEqual((await make(server(), { deps: { fetch: async () => { throw new Error('offline'); } } }).c.save(F())).ok, false);
  });
  await t('PARTIAL FAILURE: stored, read-back fails -> NOT Handled, no proof; retry re-reads, never re-uploads', async () => {
    const s = server({ faults: { 2: (r, srv) => srv.res(500, {}) } }); const { c } = make(s); const r = await c.save(F());
    assert.strictEqual(r.ok, false); assert.strictEqual(r.reason, 'verify_failed'); assert.strictEqual(r.proof, null); assert.strictEqual(count(s), 1);
    assert.strictEqual((await c.save(F())).ok, true); assert.strictEqual(uploads(s), 1);
  });
  await t('read-back that is a folder, another id, no sha1 or a malformed one, no size, no parent, no status, an array or not JSON: NOT Handled', async () => {
    const good = (srv) => { const f = srv.files[firstId(srv)]; return { type: 'file', id: f.id, name: f.name, size: f.bytes.length, sha1: sha1hex(f.bytes), parent: { id: FOLDER }, item_status: 'active' }; };
    const bad = [(srv) => Object.assign(good(srv), { type: 'folder' }), (srv) => Object.assign(good(srv), { id: '1399999990000' }), (srv) => Object.assign(good(srv), { sha1: undefined }), (srv) => Object.assign(good(srv), { sha1: 'abc' }), (srv) => Object.assign(good(srv), { size: undefined }), (srv) => Object.assign(good(srv), { parent: undefined }), (srv) => Object.assign(good(srv), { item_status: undefined }), (srv) => Object.assign(good(srv), { size: 5 }), (srv) => Object.assign(good(srv), { sha1: '0'.repeat(40) })];
    for (const b of bad) { const s = server({ faults: { 2: (r, srv) => srv.res(200, b(srv)) } }); const r = await make(s).c.save(F()); assert.strictEqual(r.ok, false); assert.strictEqual(r.proof, null); }
    for (const b of [[], undefined, null, {}]) { const s = server({ faults: { 2: (r, srv) => srv.res(200, b) } }); assert.strictEqual((await make(s).c.save(F())).ok, false); }
  });
  await t('an upload answer with no entries or no id: the folder is searched, the file adopted, one file', async () => {
    const s = server({ faults: { 1: uploadThen((srv) => srv.res(201, { total_count: 0, entries: [] })) } }); assert.strictEqual((await make(s).c.save(F())).ok, true); assert.strictEqual(count(s), 1);
    const s2 = server({ faults: { 1: uploadThen((srv) => srv.res(201, {})) } }); assert.strictEqual((await make(s2).c.save(F())).ok, true); assert.strictEqual(count(s2), 1);
  });
  await t('INJECTION: a hostile name stays one JSON string in the attributes; the folder, the endpoint and the conflict behaviour do not move', async () => {
    const evil = 'x","parent":{"id":"' + OTHER_FOLDER + '"},"content_created_at":"2000-01-01"} ../../folders/0 <script>alert(1)</script>.pdf';
    const s = server(); const r = await make(s).c.save(F({ name: evil })); assert.strictEqual(r.ok, true); const mp = parseMultipart(s.calls[0].body, s.calls[0].ctype);
    assert.deepStrictEqual(Object.keys(mp.attrs).sort(), ['name', 'parent']); assert.deepStrictEqual(mp.attrs.parent, { id: FOLDER }); assert.strictEqual(s.files[firstId(s)].parent, FOLDER);
    assert.ok(s.calls.every((x) => /^https:\/\/(upload\.box\.com\/api\/2\.0\/files\/content|api\.box\.com\/2\.0\/files\/\d+(\?fields=[a-z0-9_,]+)?)$/.test(x.url)));
  });
  await t('the file is too large (over 20 MB) refused before any call; the ledger and proof hold ids, name and hash only: no token, no bytes', async () => {
    const s = new (class {})(); const big = new Uint8Array(20 * 1024 * 1024 + 1); const s2 = server(); assert.strictEqual((await make(s2).c.save(F({ bytes: big }))).reason, 'too-large'); assert.strictEqual(s2.calls.length, 0);
    const s3 = server(); const m = make(s3); const r = await m.c.save(F()); const dump = JSON.stringify(m.ledger.m) + JSON.stringify(r.proof);
    assert.ok(dump.indexOf('tok-1') < 0 && dump.indexOf('r-1') < 0 && dump.indexOf('Bearer') < 0 && dump.indexOf('PDF-1.7') < 0);
  });
  console.log('\n' + passed + ' passed');
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
