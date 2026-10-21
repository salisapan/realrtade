// Contract tests for core/dropbox-close.js against a mock of the Dropbox API v2. No network, no real account, no real key.
const assert = require('assert');
const nodeCrypto = require('crypto');
const { FlowDropboxClose } = require('../core/dropbox-close.js');
const { FlowProofOfClose } = require('../core/proof-of-close.js');

let passed = 0;
async function t(name, fn) { await fn(); passed++; console.log('ok  ' + name); }
const sha = async (u8) => new Uint8Array(nodeCrypto.createHash('sha256').update(u8).digest());
const dbxHash = (buf) => { const blocks = []; for (let o = 0; o < buf.length; o += 4 * 1024 * 1024) blocks.push(nodeCrypto.createHash('sha256').update(buf.subarray(o, o + 4 * 1024 * 1024)).digest()); return nodeCrypto.createHash('sha256').update(Buffer.concat(blocks)).digest('hex'); };
const B = (s) => new Uint8Array(Buffer.from(s));

function server(opts) {
  const o = opts || {};
  const s = { files: {}, calls: [], seq: 0, token: o.token || 'tok-1', faults: o.faults || {} };
  const res = (status, body, headers) => ({ status, ok: status >= 200 && status < 300, json: async () => { if (body === undefined) throw new Error('no body'); return body; }, headers: { get: (k) => (headers && headers[k.toLowerCase()]) || null } });
  s.res = res;
  const find = (p) => { if (/^id:/.test(p)) return Object.values(s.files).find((f) => f.id === p); return s.files[String(p).toLowerCase()]; };
  const out = (f) => ({ '.tag': 'file', name: f.name, path_lower: f.key, path_display: '/' + f.name, id: f.id, size: f.bytes.length, content_hash: dbxHash(Buffer.from(f.bytes)), rev: 'r1' });
  s.exec = (req) => {
    if (req.url === 'https://content.dropboxapi.com/2/files/upload') {
      const arg = JSON.parse(req.arg); const key = arg.path.toLowerCase();
      if (s.files[key]) return res(409, { error_summary: 'path/conflict/file/.', error: { '.tag': 'path' } });
      s.files[key] = { key, name: arg.path.slice(1), id: 'id:file' + (++s.seq) + 'abcdef', bytes: Buffer.from(req.body) };
      return res(200, out(s.files[key]));
    }
    if (req.url === 'https://api.dropboxapi.com/2/files/get_metadata') { const f = find(JSON.parse(req.body).path); return f ? res(200, out(f)) : res(409, { error_summary: 'path/not_found/.', error: { '.tag': 'path' } }); }
    if (req.url === 'https://api.dropboxapi.com/2/files/delete_v2') { const f = find(JSON.parse(req.body).path); if (!f) return res(409, { error_summary: 'path_lookup/not_found/.' }); delete s.files[f.key]; return res(200, { metadata: out(f) }); }
    return res(400, { error_summary: 'unrouted' });
  };
  s.fetch = async (url, init) => {
    assert.strictEqual(init.method, 'POST');
    assert.ok(/^https:\/\/(content|api)\.dropboxapi\.com\/2\/files\/(upload|get_metadata|delete_v2)$/.test(url), 'only the three file endpoints: ' + url);
    const arg = init.headers['Dropbox-API-Arg'];
    if (arg !== undefined) assert.ok(/^[\x20-\x7e]*$/.test(arg), 'the API-Arg header is pure ASCII: ' + arg);
    const req = { url, auth: init.headers.Authorization, arg, body: init.body, ctype: init.headers['Content-Type'] };
    s.calls.push(req); const n = s.calls.length;
    if (s.faults[n]) { const r = await s.faults[n](req, s); if (r) return r; }
    if (req.auth !== 'Bearer ' + s.token) return res(401, { error_summary: 'expired_access_token/.', error: { '.tag': 'expired_access_token' } });
    return s.exec(req);
  };
  return s;
}
function memLedger(store) { const m = store || {}; return { m, get: async (k) => (m[k] ? JSON.parse(JSON.stringify(m[k])) : null), set: async (k, v) => { m[k] = JSON.parse(JSON.stringify(v)); } }; }
function make(s, extra) {
  const e = extra || {}; const ledger = e.ledger || memLedger(); let auth = e.auth === undefined ? { token: 'tok-1', refreshToken: 'r-1' } : e.auth; const saved = [];
  const c = FlowDropboxClose.create(Object.assign({ fetch: s.fetch, ledger, now: () => 1000, sleep: async () => {}, timeoutMs: 50, sha256: sha, getAuth: async () => auth, saveAuth: async (a) => { auth = a; saved.push(a); }, buildProof: FlowProofOfClose.buildProof }, e.deps || {}));
  return { c, ledger, saved };
}
const F = (over) => Object.assign({ key: 'loop-1', name: 'Contract-signed.pdf', bytes: B('PDF-1.7 the signed contract') }, over || {});
const uploads = (s) => s.calls.filter((x) => x.url.indexOf('/upload') > 0).length;
const count = (s) => Object.keys(s.files).length;
const uploadThen = (answer) => async (req, srv) => { srv.exec(req); return answer(srv); };

(async () => {
  await t('success: upload then an independent get_metadata; Handled only on matching id, size and CONTENT HASH; proof system dropbox/file', async () => {
    const s = server(); const r = await make(s).c.save(F());
    assert.strictEqual(r.ok, true); assert.strictEqual(r.proof.system, 'dropbox/file'); assert.strictEqual(r.proof.fetchedBack, true); assert.ok(/^id:file1/.test(r.proof.externalId));
    assert.deepStrictEqual(s.calls.map((x) => x.url.split('/').pop()), ['upload', 'get_metadata']);
    assert.deepStrictEqual(JSON.parse(s.calls[0].arg), { path: '/Contract-signed.pdf', mode: 'add', autorename: false, mute: true, strict_conflict: true }); assert.strictEqual(s.calls[0].ctype, 'application/octet-stream');
  });
  await t('the bytes uploaded are exactly the bytes given; nothing else is sent anywhere', async () => {
    const s = server(); const f = F(); await make(s).c.save(f); assert.deepStrictEqual(Buffer.from(s.calls[0].body), Buffer.from(f.bytes)); assert.ok(s.calls.every((x) => x.url.indexOf('dropboxapi.com') > 0));
  });
  await t('mode add, autorename OFF: it can never overwrite and never creates "name (1)"', async () => {
    const s = server(); await make(s).c.save(F()); const a = JSON.parse(s.calls[0].arg); assert.strictEqual(a.mode, 'add'); assert.strictEqual(a.autorename, false);
  });
  await t('Hebrew and unicode names survive: the header is ASCII-escaped and the file name round-trips', async () => {
    const s = server(); const r = await make(s).c.save(F({ name: 'חוזה חתום – דנה.pdf' })); assert.strictEqual(r.ok, true);
    assert.strictEqual(JSON.parse(s.calls[0].arg).path, '/חוזה חתום – דנה.pdf'); assert.ok(Object.values(s.files)[0].name === 'חוזה חתום – דנה.pdf');
  });
  await t('idempotent: a second click and a retry never upload twice', async () => {
    const s = server(); const { c } = make(s); await c.save(F()); const b = await c.save(F()); await c.save(F()); assert.strictEqual(uploads(s), 1); assert.strictEqual(count(s), 1); assert.strictEqual(b.ok, true);
  });
  await t('read-back after reload: a fresh instance with the same ledger re-verifies, no new upload', async () => {
    const s = server(); const first = make(s); const a = await first.c.save(F()); const second = make(s, { ledger: first.ledger });
    assert.strictEqual((await second.c.verify(a.ref)).ok, true); assert.strictEqual((await second.c.save(F())).ok, true); assert.strictEqual(uploads(s), 1);
  });
  await t('the person edited the file after the save: verify is NOT Handled', async () => {
    const s = server(); const m = make(s); const a = await m.c.save(F()); Object.values(s.files)[0].bytes = Buffer.from('edited by the person');
    const v = await m.c.verify(a.ref); assert.strictEqual(v.ok, false); assert.strictEqual(v.proof, null);
  });
  await t('NAME TAKEN BY DIFFERENT CONTENT: nothing is written or overwritten, the result says name-taken', async () => {
    const s = server(); s.files['/contract-signed.pdf'] = { key: '/contract-signed.pdf', name: 'Contract-signed.pdf', id: 'id:theirs123456', bytes: Buffer.from('someone else\'s file') };
    const r = await make(s).c.save(F()); assert.strictEqual(r.ok, false); assert.strictEqual(r.reason, 'name-taken'); assert.strictEqual(r.proof, undefined);
    assert.strictEqual(s.files['/contract-signed.pdf'].bytes.toString(), 'someone else\'s file');
  });
  await t('the same file is already there (earlier upload that was not recorded): adopted, not duplicated, still read back', async () => {
    const s = server(); const f = F(); s.files['/contract-signed.pdf'] = { key: '/contract-signed.pdf', name: 'Contract-signed.pdf', id: 'id:mine1234567', bytes: Buffer.from(f.bytes) };
    const r = await make(s).c.save(f); assert.strictEqual(r.ok, true); assert.strictEqual(r.proof.externalId, 'id:mine1234567'); assert.strictEqual(count(s), 1);
  });
  await t('Undo deletes by file id and reads back "not found"; twice is fine; a later save of the same loop uploads again', async () => {
    const s = server(); const { c } = make(s); const a = await c.save(F());
    const u = await c.undo(a.ref); assert.strictEqual(u.ok, true); assert.strictEqual(u.readBack, true); assert.strictEqual(count(s), 0);
    assert.strictEqual((await c.undo(a.ref)).ok, true);
    const again = await c.save(F()); assert.strictEqual(again.ok, true); assert.strictEqual(uploads(s), 2);
  });
  await t('UNDO REFUSES a file the person edited: it is not deleted', async () => {
    const s = server(); const { c } = make(s); const a = await c.save(F()); Object.values(s.files)[0].bytes = Buffer.from('my own changes');
    const u = await c.undo(a.ref); assert.strictEqual(u.ok, false); assert.strictEqual(u.reason, 'edited-by-person'); assert.strictEqual(count(s), 1);
    assert.ok(!s.calls.some((x) => x.url.endsWith('delete_v2')), 'no delete call was made');
  });
  await t('Undo whose delete did nothing is not ok (the read-back still finds the file)', async () => {
    const s = server(); const { c } = make(s); const a = await c.save(F()); s.faults[s.calls.length + 2] = (req, srv) => srv.res(200, { metadata: {} });
    const u = await c.undo(a.ref); assert.strictEqual(u.ok, false); assert.strictEqual(u.reason, 'verify_failed');
  });
  await t('Undo of a file already gone is ok without claiming a read-back; ids that are not file ids are refused before any call', async () => {
    const s = server(); const { c } = make(s); const u = await c.undo({ fileId: 'id:nothere12345', key: 'k' }); assert.strictEqual(u.ok, true); assert.strictEqual(u.readBack, false);
    s.calls.length = 0; for (const bad of ['/etc/passwd', '../x', 'id:', 'id:a b', '']) assert.strictEqual((await c.undo({ fileId: bad, key: 'k' })).ok, false); assert.strictEqual(s.calls.length, 0);
  });
  await t('401 -> one refresh -> retried; the new tokens are saved', async () => {
    const s = server({ token: 'tok-2' }); let n = 0;
    const { c, saved } = make(s, { auth: { token: 'OLD', refreshToken: 'r-1' }, deps: { refresh: async () => { n++; return { token: 'tok-2', refreshToken: 'r-1' }; } } });
    assert.strictEqual((await c.save(F())).ok, true); assert.strictEqual(n, 1); assert.strictEqual(saved[0].token, 'tok-2');
  });
  await t('401 and refresh fails / no refresh token -> not-connected, nothing written', async () => {
    const s = server({ token: 'tok-2' });
    assert.strictEqual((await make(s, { auth: { token: 'OLD', refreshToken: 'r' }, deps: { refresh: async () => null } }).c.save(F())).reason, 'not-connected');
    assert.strictEqual((await make(s, { auth: { token: 'OLD' } }).c.save(F())).reason, 'not-connected'); assert.strictEqual(count(s), 0);
  });
  await t('403 (missing scope) -> scope-missing, one upload, no retry loop', async () => {
    const s = server({ faults: { 1: (r, srv) => srv.res(403, { error_summary: 'missing_scope/.' }) } }); const r = await make(s).c.save(F()); assert.strictEqual(r.reason, 'scope-missing'); assert.strictEqual(uploads(s), 1);
  });
  await t('400 (bad request) -> rejected, not retried; out of space -> no-space', async () => {
    const s = server({ faults: { 1: (r, srv) => srv.res(400, 'Error in call to API function') } }); assert.strictEqual((await make(s).c.save(F())).reason, 'rejected'); assert.strictEqual(uploads(s), 1);
    const s2 = server({ faults: { 1: (r, srv) => srv.res(409, { error_summary: 'insufficient_space/.' }) } }); assert.strictEqual((await make(s2).c.save(F())).reason, 'no-space');
  });
  await t('429 with Retry-After: waits that long, then one file', async () => {
    const waits = []; const s = server({ faults: { 1: (r, srv) => srv.res(429, { error_summary: 'too_many_requests/.' }, { 'retry-after': '5' }) } });
    const r = await make(s, { deps: { sleep: async (ms) => { waits.push(ms); } } }).c.save(F()); assert.strictEqual(r.ok, true); assert.deepStrictEqual(waits, [5000]); assert.strictEqual(count(s), 1);
  });
  await t('429 forever -> rate-limited, never Handled', async () => {
    const f = {}; for (let i = 1; i < 10; i++) f[i] = (r, srv) => srv.res(429, {}, { 'retry-after': '1' });
    const s = server({ faults: f }); const r = await make(s).c.save(F()); assert.strictEqual(r.reason, 'rate-limited'); assert.strictEqual(count(s), 0);
  });
  await t('5xx that DID store the file: the retry looks, finds identical content, adopts it; one file', async () => {
    const s = server({ faults: { 1: uploadThen((srv) => srv.res(502, {})) } }); const r = await make(s).c.save(F()); assert.strictEqual(r.ok, true); assert.strictEqual(count(s), 1); assert.strictEqual(uploads(s), 1);
  });
  await t('5xx that did NOT store it: retried, one file', async () => {
    const s = server({ faults: { 1: (r, srv) => srv.res(503, {}) } }); const r = await make(s).c.save(F()); assert.strictEqual(r.ok, true); assert.strictEqual(count(s), 1);
  });
  await t('timeout on the upload (file stored): looked up, adopted, one file', async () => {
    const s = server({ faults: { 1: (req, srv) => { srv.exec(req); return new Promise(() => {}); } } }); const r = await make(s).c.save(F()); assert.strictEqual(r.ok, true); assert.strictEqual(count(s), 1);
  });
  await t('network down for good -> not ok, not Handled', async () => {
    const r = await make(server(), { deps: { fetch: async () => { throw new Error('offline'); } } }).c.save(F()); assert.strictEqual(r.ok, false);
  });
  await t('PARTIAL FAILURE: stored, read-back fails -> NOT Handled, no proof; a retry re-reads and never uploads again', async () => {
    const s = server({ faults: { 2: (r, srv) => srv.res(500, {}) } }); const { c } = make(s); const r = await c.save(F());
    assert.strictEqual(r.ok, false); assert.strictEqual(r.reason, 'verify_failed'); assert.strictEqual(r.proof, null); assert.strictEqual(count(s), 1);
    assert.strictEqual((await c.save(F())).ok, true); assert.strictEqual(uploads(s), 1);
  });
  await t('read-back answers a folder / empty / no hash / no id / changed shape -> NOT Handled', async () => {
    for (const bad of [(srv) => srv.res(200, { '.tag': 'folder', id: 'id:folder1234567', name: 'x' }), (srv) => srv.res(200, {}), (srv) => srv.res(200, undefined), (srv) => srv.res(200, { id: 'id:file1abcdef', size: 27 }), (srv) => srv.res(200, { id: 'nope', size: 27, content_hash: 'x' })]) {
      const s = server({ faults: { 2: (r, srv) => bad(srv) } }); const r = await make(s).c.save(F()); assert.strictEqual(r.ok, false); assert.strictEqual(r.proof, null);
    }
  });
  await t('read-back with the right id but a DIFFERENT size or content hash -> NOT Handled', async () => {
    for (const mut of [(m) => { m.size = 5; }, (m) => { m.content_hash = '0'.repeat(64); }]) {
      const s = server(); const orig = s.fetch;
      s.fetch = async (u, i) => { const r = await orig(u, i); if (u.endsWith('get_metadata') && r.ok) { const body = await r.json(); mut(body); return s.res(200, body); } return r; };
      const r = await make(s).c.save(F()); assert.strictEqual(r.ok, false); assert.strictEqual(r.proof, null);
    }
  });
  await t('files over the cap, empty files and non-bytes are refused before any call', async () => {
    const s = server(); const { c } = make(s);
    assert.strictEqual((await c.save(F({ bytes: new Uint8Array(0) }))).reason, 'bad-params'); assert.strictEqual((await c.save(F({ bytes: 'text' }))).reason, 'bad-params'); assert.strictEqual((await c.save(F({ bytes: { length: 5 } }))).reason, 'bad-params');
    assert.strictEqual((await c.save(F({ bytes: new Uint8Array(FlowDropboxClose.MAX_BYTES + 1) }))).reason, 'too-large'); assert.strictEqual(s.calls.length, 0);
  });
  await t('content hash over several 4 MiB blocks matches the block-hash algorithm', async () => {
    const big = new Uint8Array(9 * 1024 * 1024).map((_, i) => i % 251); const { c } = make(server()); assert.strictEqual(await c.contentHash(big), dbxHash(Buffer.from(big)));
    assert.strictEqual(await c.contentHash(B('abc')), dbxHash(Buffer.from('abc')));
  });
  await t('INJECTION through the name: separators, traversal, control characters and header tricks cannot change the path, mode or endpoint', async () => {
    const evil = '../../Secrets/..\\x"},"mode":"overwrite","autorename":true,"path":"/etc\r\nAuthorization: Bearer x\u0000.pdf';
    const s = server(); const r = await make(s).c.save(F({ name: evil })); assert.strictEqual(r.ok, true);
    const arg = JSON.parse(s.calls[0].arg); assert.strictEqual(arg.mode, 'add'); assert.strictEqual(arg.autorename, false); assert.ok(arg.path.indexOf('/', 1) < 0, 'one path segment: ' + arg.path); assert.ok(!/[\\"\r\n\u0000]/.test(arg.path.slice(1)));
    assert.deepStrictEqual(Object.keys(arg).sort(), ['autorename', 'mode', 'mute', 'path', 'strict_conflict']); assert.ok(!/[\r\n]/.test(s.calls[0].arg));
  });
  await t('names are cleaned: separators and reserved characters removed, leading dots and trailing dots/spaces trimmed, long names keep their extension', async () => {
    const C = FlowDropboxClose.cleanName;
    assert.strictEqual(C('a/b\\c:d*e?f"g<h>i|j.pdf'), 'a b c d e f g h i j.pdf'); assert.strictEqual(C('  ..hidden.txt.. '), 'hidden.txt'); assert.strictEqual(C(''), ''); assert.strictEqual(C('///'), '');
    const long = C('x'.repeat(400) + '.pdf'); assert.ok(long.length <= 180 && long.endsWith('.pdf'));
    assert.strictEqual((await make(server()).c.save(F({ name: '///' }))).reason, 'bad-params');
  });
  await t('ledger and proof hold ids, a path, a hash and a size — no token, no file content', async () => {
    const s = server(); const m = make(s); const r = await m.c.save(F()); const dump = JSON.stringify(m.ledger.m) + JSON.stringify(r);
    assert.ok(dump.indexOf('tok-1') < 0 && dump.indexOf('r-1') < 0 && dump.indexOf('Bearer') < 0 && dump.indexOf('signed contract') < 0);
  });
  await t('not connected: nothing sent', async () => {
    const s = server(); const r = await make(s, { auth: null, deps: { getAuth: async () => null } }).c.save(F()); assert.strictEqual(r.reason, 'not-connected'); assert.strictEqual(s.calls.length, 0);
  });
  console.log('\n' + passed + ' passed');
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
