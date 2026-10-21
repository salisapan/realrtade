// Dropbox: one file saved into the person's Dropbox app folder is the close; reading its metadata back and comparing size and CONTENT HASH is the proof.
// docs/glance-ai/connectors/dropbox.md. Portable: no chrome.*, no DOM; the network, the token store, the ledger and the SHA-256 are injected
// (src/background.js passes real ones, test/dropbox-close-corpus.cjs passes a mock of the vendor).
//
// Contract:
//   save(file)    one upload in mode "add" with autorename OFF (it can never overwrite and never creates "name (1)"), then a separate get_metadata.
//                 Handled (ok:true + proof) ONLY when that read returns the same file id, the same size, and a content_hash equal to the one we computed
//                 from the bytes ourselves. A name that is already taken by DIFFERENT content is reported (name-taken) and nothing is written.
//   idempotent    a loop key maps to one saved path in a ledger; the same bytes already at that path are adopted, never uploaded twice.
//   undo(ref)     refuses if the person edited the file since (its content hash no longer matches what Glance saved): an edited file is never deleted.
//                 Otherwise delete, then a read that must say "not found". Dropbox keeps a deleted file recoverable for a while (vendor behaviour, unverified).
//   verify(ref)   the same read-back on a fresh instance (after a reload).
// The bytes are the person's own file going to the person's own Dropbox; they never go anywhere else. The file name is sanitised; the API argument header is
// JSON-escaped to ASCII (Hebrew names survive); nothing the caller supplies can change the endpoint, the mode or the folder.
const FlowDropboxClose = (() => {
  const SYSTEM = 'dropbox/file';
  const RPC = 'https://api.dropboxapi.com/2';
  const CONTENT = 'https://content.dropboxapi.com/2';
  const MAX_BYTES = 20 * 1024 * 1024;
  const MAX_NAME = 180;
  const MAX_ATTEMPTS = 3;
  const BLOCK = 4 * 1024 * 1024;

  const FILE_ID = /^id:[A-Za-z0-9_\-]{6,60}$/;

  // A name that is a single path segment: no separators, no control characters, no leading dot or space, no trailing dot or space.
  function cleanName(n) {
    let s = String(n == null ? '' : n).replace(/[\u0000-\u001f\u007f\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
    s = s.replace(/^\.+/, '').replace(/[. ]+$/, '');
    if (s.length > MAX_NAME) {
      const dot = s.lastIndexOf('.');
      const ext = dot > 0 && s.length - dot <= 12 ? s.slice(dot) : '';
      s = s.slice(0, MAX_NAME - ext.length) + ext;
    }
    return s;
  }
  // Dropbox-API-Arg is an HTTP header: the JSON must be ASCII, so every other character is written as \uXXXX.
  function headerJson(obj) {
    return JSON.stringify(obj).replace(/[\u007f-￿]/g, (c) => '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4));
  }
  function hex(bytes) { let s = ''; for (let i = 0; i < bytes.length; i++) s += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16); return s; }

  function create(deps) {
    const d = deps || {};
    const now = d.now || (() => Date.now());
    const sleep = d.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
    const timeoutMs = d.timeoutMs || 30000;
    const ledger = d.ledger;
    const buildProof = d.buildProof;
    const sha256 = d.sha256; // async (Uint8Array) -> Uint8Array(32)

    // Dropbox's content hash: SHA-256 of the concatenated SHA-256 digests of each 4 MiB block (vendor algorithm: unverified, see the connector doc).
    async function contentHash(bytes) {
      const digests = [];
      for (let off = 0; off < bytes.length || off === 0; off += BLOCK) {
        digests.push(await sha256(bytes.subarray(off, Math.min(off + BLOCK, bytes.length))));
        if (bytes.length === 0) break;
      }
      const all = new Uint8Array(digests.length * 32);
      digests.forEach((dg, i) => all.set(dg, i * 32));
      return hex(await sha256(all));
    }

    async function send(url, init, state) {
      for (let pass = 0; pass < 2; pass++) {
        const auth = state.auth;
        const headers = Object.assign({ Authorization: 'Bearer ' + auth.token }, init.headers || {});
        let res;
        try {
          res = await Promise.race([
            d.fetch(url, { method: 'POST', headers: headers, body: init.body }),
            new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs))
          ]);
        } catch (e) { return { error: 'network' }; }
        if (res.status === 401 && pass === 0 && auth.refreshToken && typeof d.refresh === 'function') {
          let fresh = null;
          try { fresh = await d.refresh(auth); } catch (e) { fresh = null; }
          if (!fresh || !fresh.token) return { error: 'not-connected' };
          state.auth = Object.assign({}, auth, fresh);
          if (typeof d.saveAuth === 'function') { try { await d.saveAuth(state.auth); } catch (e) { /* this session still has it */ } }
          continue;
        }
        let body = null;
        try { body = await res.json(); } catch (e) { body = null; }
        const summary = body && typeof body.error_summary === 'string' ? body.error_summary : '';
        const ra = Number(res.headers && res.headers.get && res.headers.get('retry-after'));
        return { status: res.status, ok: res.ok, body: body, summary: summary, retryMs: Number.isFinite(ra) && ra > 0 ? Math.min(ra, 10) * 1000 : 0 };
      }
      return { error: 'not-connected' };
    }

    const meta = (path, state) => send(RPC + '/files/get_metadata', { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: path }) }, state);

    function classify(r) {
      if (r.error) return r.error;
      if (r.status === 401) return 'not-connected';
      if (r.status === 429) return 'rate-limited';
      if (r.status === 403) return 'scope-missing';
      if (r.status >= 500) return 'http-5xx';
      if (r.status === 409 && /not_found/.test(r.summary)) return 'not-found';
      if (r.status === 409 && /conflict/.test(r.summary)) return 'conflict';
      if (r.status === 409 && /insufficient_space/.test(r.summary)) return 'no-space';
      if (!r.ok) return 'rejected';
      return 'ok';
    }

    // Reads the file's metadata and decides whether it is the file Glance saved.
    async function readBack(state, target, expect) {
      const r = await meta(target, state);
      const c = classify(r);
      if (c === 'not-connected') return { ok: false, reason: 'not-connected' };
      if (c === 'not-found') return { ok: false, gone: true, reason: 'verify_failed' };
      if (c !== 'ok') return { ok: false, reason: 'verify_failed' };
      const m = r.body;
      if (!m || typeof m !== 'object' || m['.tag'] === 'folder' || !FILE_ID.test(String(m.id || '')) || typeof m.size !== 'number' || typeof m.content_hash !== 'string') return { ok: false, reason: 'verify_failed' };
      const same = !expect || (m.size === expect.size && m.content_hash === expect.hash);
      return { ok: true, meta: m, same: same };
    }

    function proofFor(m) {
      if (typeof buildProof !== 'function') return null;
      return buildProof({ system: SYSTEM, externalId: String(m.id), fetchedBack: true, verifiedAt: new Date(now()).toISOString() });
    }

    async function finish(state, key, target, expect, name) {
      const rb = await readBack(state, target, expect);
      const ref = { fileId: rb.ok ? String(rb.meta.id) : null, externalId: rb.ok ? String(rb.meta.id) : null, path: expect.path, key: key };
      if (!rb.ok) {
        if (rb.reason === 'not-connected') return { ok: false, reason: 'not-connected', ref: ref, proof: null };
        await ledger.set(key, { state: 'saved-unverified', path: expect.path, hash: expect.hash, size: expect.size, name: name, at: now() });
        return { ok: false, reason: 'verify_failed', ref: ref, proof: null };
      }
      if (!rb.same) {
        await ledger.set(key, { state: 'saved-unverified', path: expect.path, hash: expect.hash, size: expect.size, name: name, at: now() });
        return { ok: false, reason: 'verify_failed', ref: ref, proof: null };
      }
      const proof = proofFor(rb.meta);
      if (!proof) return { ok: false, reason: 'proof_pending', ref: ref, proof: null };
      await ledger.set(key, { state: 'verified', fileId: String(rb.meta.id), path: expect.path, hash: expect.hash, size: expect.size, name: name, at: now() });
      return { ok: true, where: 'Dropbox', ref: ref, proof: proof };
    }

    // file: { key, name, bytes: Uint8Array } — key is the loop's own id (never sent to Dropbox).
    async function save(file) {
      const f = file || {};
      const key = String(f.key || '');
      const name = cleanName(f.name);
      const bytes = f.bytes;
      if (!key || !name || !(bytes instanceof Uint8Array) || bytes.length < 1) return { ok: false, reason: 'bad-params' };
      if (bytes.length > MAX_BYTES) return { ok: false, reason: 'too-large' };
      const auth = await d.getAuth();
      if (!auth || !auth.token) return { ok: false, reason: 'not-connected' };
      const state = { auth: auth };
      const path = '/' + name;
      const expect = { path: path, size: bytes.length, hash: await contentHash(bytes) };

      const prior = await ledger.get(key);
      if (prior && prior.path === path && prior.hash === expect.hash && prior.state !== 'undone') return finish(state, key, path, expect, name);

      await ledger.set(key, { state: 'pending', path: path, hash: expect.hash, size: expect.size, name: name, at: now() });
      const arg = headerJson({ path: path, mode: 'add', autorename: false, mute: true, strict_conflict: true });

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const r = await send(CONTENT + '/files/upload', { headers: { 'Content-Type': 'application/octet-stream', 'Dropbox-API-Arg': arg }, body: bytes }, state);
        const c = classify(r);
        if (c === 'ok') return finish(state, key, path, expect, name);
        if (c === 'not-connected') return { ok: false, reason: 'not-connected' };
        if (c === 'rate-limited') {
          if (attempt === MAX_ATTEMPTS) return { ok: false, reason: 'rate-limited' };
          await sleep(r.retryMs || 1000);
          continue;
        }
        if (c === 'conflict' || c === 'network' || c === 'http-5xx') {
          // Something may already be at this path (our own earlier upload, or someone else's file). Look; never overwrite.
          const there = await readBack(state, path, expect);
          if (there.ok && there.same) return finish(state, key, path, expect, name);
          if (there.ok && !there.same) { await ledger.set(key, { state: 'failed', at: now() }); return { ok: false, reason: 'name-taken' }; }
          if (c === 'conflict') { await ledger.set(key, { state: 'failed', at: now() }); return { ok: false, reason: 'name-taken' }; }
          if (attempt === MAX_ATTEMPTS) return { ok: false, reason: c === 'network' ? 'network' : 'http-5xx' };
          await sleep(500 * attempt);
          continue;
        }
        await ledger.set(key, { state: 'failed', at: now() });
        return { ok: false, reason: c };
      }
      return { ok: false, reason: 'unknown' };
    }

    async function verify(ref) {
      const target = ref && (ref.fileId || ref.externalId);
      if (!FILE_ID.test(String(target || ''))) return { ok: false, reason: 'bad-params' };
      const auth = await d.getAuth();
      if (!auth || !auth.token) return { ok: false, reason: 'not-connected' };
      const rec = ref.key ? await ledger.get(ref.key) : null;
      if (!rec || !rec.hash) return { ok: false, reason: 'verify_failed', proof: null };
      return finish({ auth: auth }, ref.key, String(target), { path: rec.path, size: rec.size, hash: rec.hash }, rec.name);
    }

    async function undo(ref) {
      const target = ref && (ref.fileId || ref.externalId);
      if (!FILE_ID.test(String(target || ''))) return { ok: false, reason: 'bad-params' };
      const auth = await d.getAuth();
      if (!auth || !auth.token) return { ok: false, reason: 'not-connected' };
      const state = { auth: auth };
      const rec = ref.key ? await ledger.get(ref.key) : null;
      const before = await readBack(state, String(target), null);
      if (before.gone) { if (ref.key) await ledger.set(ref.key, { state: 'undone', at: now() }); return { ok: true, readBack: false, written: 'Already gone from Dropbox.' }; }
      if (!before.ok) return { ok: false, reason: before.reason === 'not-connected' ? 'not-connected' : 'verify_failed' };
      // Never delete a file the person has changed since Glance saved it.
      if (!rec || !rec.hash || before.meta.content_hash !== rec.hash) return { ok: false, reason: 'edited-by-person' };
      const del = await send(RPC + '/files/delete_v2', { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: String(target) }) }, state);
      const c = classify(del);
      if (c !== 'ok' && c !== 'not-found') return { ok: false, reason: c };
      const after = await readBack(state, String(target), null);
      if (after.gone) { if (ref.key) await ledger.set(ref.key, { state: 'undone', at: now() }); return { ok: true, readBack: true, written: 'Removed from Dropbox.' }; }
      return { ok: false, reason: 'verify_failed' };
    }

    return { save: save, verify: verify, undo: undo, contentHash: contentHash };
  }

  return { SYSTEM: SYSTEM, MAX_BYTES: MAX_BYTES, create: create, cleanName: cleanName, headerJson: headerJson };
})();

if (typeof module !== 'undefined') module.exports = { FlowDropboxClose };
else if (typeof globalThis !== 'undefined') globalThis.FlowDropboxClose = FlowDropboxClose;
