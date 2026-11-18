// Box: one file saved into the folder the person chose is the close; reading its metadata back and comparing size and SHA-1 is the proof.
// docs/glance-ai/connectors/box.md. Portable: no chrome.*, no DOM; the network, the token store, the ledger and the SHA-1 are injected
// (src/background.js passes real ones, test/box-close-corpus.cjs passes a mock of the vendor).
//
// Contract:
//   save(file)    one multipart upload into the chosen folder (a plain upload never overwrites: a name already in the folder answers 409 item_name_in_use,
//                 and a new version is a different endpoint this file never calls), then a separate GET of that file. Handled (ok:true + proof) ONLY when the
//                 GET returns the same file id, a file (not a folder), active (not trashed), in the chosen folder, with the same size and a SHA-1 equal to the
//                 one we computed from the bytes ourselves. A name taken by DIFFERENT content is reported (name-taken) and nothing is written.
//   idempotent    a loop key maps to one saved file (name and SHA-1) in a ledger. A second click or a retry re-reads it and never uploads twice. If an upload's
//                 outcome is unknown (5xx, timeout, 409), the folder is read for that name: the same content is adopted, different content is name-taken.
//   undo(ref)     refuses if the person changed the file since (its SHA-1 no longer matches what Glance saved: they uploaded a new version), else DELETE (Box moves
//                 the file to the trash, which the person can restore), then a read that must say trashed or not found.
//   verify(ref)   the same read-back on a fresh instance (after a reload).
// The bytes are the person's own file going to the person's own Box; they never go anywhere else. The file name is sanitised; the multipart attributes are one JSON
// value; nothing the caller supplies can change the endpoint, the folder or the conflict behaviour. The parent folder is one the person chose (never the root).
const FlowBoxClose = (() => {
  const SYSTEM = 'box/file';
  const UPLOAD = 'https://upload.box.com/api/2.0/files/content';
  const API = 'https://api.box.com/2.0';
  const MAX_BYTES = 20 * 1024 * 1024;
  const MAX_NAME = 180;
  const MAX_ATTEMPTS = 3;
  const FIELDS = 'id,name,size,sha1,parent,item_status';

  const idOk = (v) => typeof v === 'string' && /^[1-9]\d{3,17}$/.test(v);
  const sha1Ok = (v) => typeof v === 'string' && /^[0-9a-f]{40}$/.test(v);

  // A name that is a single segment: no separators, no control characters, no leading dot or space, no trailing dot or space.
  function cleanName(n) {
    let s = String(n == null ? '' : n).replace(/[\u0000-\u001f\u007f\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
    s = s.replace(/(^| )\.{2,}(?= |$)/g, ' ').replace(/\s+/g, ' ').trim();
    s = s.replace(/^[. ]+/, '').replace(/[. ]+$/, '');
    if (s.length > MAX_NAME) {
      const dot = s.lastIndexOf('.');
      const ext = dot > 0 && s.length - dot <= 12 ? s.slice(dot) : '';
      s = s.slice(0, MAX_NAME - ext.length) + ext;
    }
    return s;
  }
  function hex(bytes) { let s = ''; for (let i = 0; i < bytes.length; i++) s += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16); return s; }
  function contains(hay, needle) {
    const n = needle.length;
    outer: for (let i = 0; i + n <= hay.length; i++) { if (hay[i] !== needle[0]) continue; for (let j = 1; j < n; j++) if (hay[i + j] !== needle[j]) continue outer; return true; }
    return false;
  }

  function create(deps) {
    const d = deps || {};
    const now = d.now || (() => Date.now());
    const sleep = d.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
    const timeoutMs = d.timeoutMs || 30000;
    const ledger = d.ledger;
    const buildProof = d.buildProof;
    const sha1 = d.sha1; // async (Uint8Array) -> Uint8Array(20)
    const randomHex = d.randomHex || ((n) => { let s = ''; for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 16).toString(16); return s; });
    const enc = new TextEncoder();

    // The multipart body: the attributes part first (Box requires it before the file), then the file bytes. The boundary never occurs inside the bytes.
    function multipart(attrs, name, bytes) {
      let boundary = '';
      for (let tries = 0; tries < 5; tries++) {
        boundary = '----GlanceBox' + randomHex(24);
        if (!contains(bytes, enc.encode(boundary))) break;
        boundary = '';
      }
      if (!boundary) return null;
      const head = enc.encode('--' + boundary + '\r\nContent-Disposition: form-data; name="attributes"\r\n\r\n' + JSON.stringify(attrs) + '\r\n--' + boundary + '\r\nContent-Disposition: form-data; name="file"; filename="file"\r\nContent-Type: application/octet-stream\r\n\r\n');
      const tail = enc.encode('\r\n--' + boundary + '--\r\n');
      const out = new Uint8Array(head.length + bytes.length + tail.length);
      out.set(head, 0); out.set(bytes, head.length); out.set(tail, head.length + bytes.length);
      return { body: out, type: 'multipart/form-data; boundary=' + boundary };
    }

    async function send(method, url, init, state) {
      for (let pass = 0; pass < 2; pass++) {
        const auth = state.auth;
        const headers = Object.assign({ Authorization: 'Bearer ' + auth.token }, init.headers || {});
        let res;
        try {
          res = await Promise.race([
            d.fetch(url, { method: method, headers: headers, body: init.body }),
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
        const ra = Number(res.headers && res.headers.get && res.headers.get('retry-after'));
        return { status: res.status, ok: res.ok, body: body, retryMs: Number.isFinite(ra) && ra > 0 ? Math.min(ra, 10) * 1000 : 0 };
      }
      return { error: 'not-connected' };
    }

    function classify(r) {
      if (r.error) return r.error;
      if (r.status === 401) return 'not-connected';
      if (r.status === 429) return 'rate-limited';
      if (r.status === 403) return 'scope-missing';
      if (r.status === 507) return 'no-space';
      if (r.status >= 500) return 'http-5xx';
      if (r.status === 404) return 'not-found';
      if (r.status === 409) return 'conflict';
      if (!r.ok) return 'rejected';
      return 'ok';
    }

    // Reads one file and decides whether it is the file Glance saved.
    async function readBack(state, id, expect) {
      const r = await send('GET', API + '/files/' + encodeURIComponent(id) + '?fields=' + FIELDS, {}, state);
      const c = classify(r);
      if (c === 'not-connected') return { ok: false, reason: 'not-connected' };
      if (c === 'not-found') return { ok: false, gone: true, reason: 'verify_failed' };
      if (c !== 'ok') return { ok: false, reason: 'verify_failed' };
      const m = r.body;
      if (!m || typeof m !== 'object' || m.type !== 'file' || String(m.id) !== String(id) || !sha1Ok(m.sha1) || typeof m.size !== 'number' || typeof m.item_status !== 'string' || !m.parent || typeof m.parent !== 'object') return { ok: false, reason: 'verify_failed' };
      if (m.item_status !== 'active') return { ok: false, gone: m.item_status === 'trashed' || m.item_status === 'deleted', trashed: true, reason: 'verify_failed' };
      const inFolder = String(m.parent.id) === String(state.auth.folderId);
      const same = !expect || (inFolder && m.size === expect.size && m.sha1 === expect.hash);
      return { ok: true, meta: m, same: same, inFolder: inFolder };
    }

    function proofFor(m) {
      if (typeof buildProof !== 'function') return null;
      return buildProof({ system: SYSTEM, externalId: String(m.id), fetchedBack: true, verifiedAt: new Date(now()).toISOString() });
    }

    async function finish(state, key, id, expect, name) {
      const rb = await readBack(state, id, expect);
      const ref = { fileId: id, externalId: id, key: key };
      const unverified = async () => { await ledger.set(key, { state: 'saved-unverified', fileId: id, hash: expect.hash, size: expect.size, name: name, at: now() }); return { ok: false, reason: 'verify_failed', ref: ref, proof: null }; };
      if (!rb.ok) {
        if (rb.reason === 'not-connected') return { ok: false, reason: 'not-connected', ref: ref, proof: null };
        return unverified();
      }
      if (!rb.same) return unverified();
      const proof = proofFor(rb.meta);
      if (!proof) return { ok: false, reason: 'proof_pending', ref: ref, proof: null };
      await ledger.set(key, { state: 'verified', fileId: id, hash: expect.hash, size: expect.size, name: name, at: now() });
      return { ok: true, where: 'Box', ref: ref, proof: proof };
    }

    // The file with this name in the chosen folder, if any: { id } from the conflict answer, else a read of the folder's items.
    async function findByName(state, name, conflictBody) {
      const cid = conflictBody && conflictBody.context_info && conflictBody.context_info.conflicts && conflictBody.context_info.conflicts.id;
      if (idOk(String(cid || ''))) return String(cid);
      const r = await send('GET', API + '/folders/' + encodeURIComponent(state.auth.folderId) + '/items?fields=id,name,type&limit=1000', {}, state);
      if (classify(r) !== 'ok' || !r.body || !Array.isArray(r.body.entries)) return null;
      const hit = r.body.entries.find((x) => x && x.type === 'file' && x.name === name && idOk(String(x.id)));
      return hit ? String(hit.id) : null;
    }

    // file: { key, name, bytes: Uint8Array } — key is the loop's own id (never sent to Box).
    async function save(file) {
      const f = file || {};
      const key = String(f.key || '');
      const name = cleanName(f.name);
      const bytes = f.bytes;
      if (!key || !name || !(bytes instanceof Uint8Array) || bytes.length < 1) return { ok: false, reason: 'bad-params' };
      if (bytes.length > MAX_BYTES) return { ok: false, reason: 'too-large' };
      const auth = await d.getAuth();
      if (!auth || !auth.token || !idOk(String(auth.folderId || ''))) return { ok: false, reason: 'not-connected' };
      const state = { auth: auth };
      const expect = { size: bytes.length, hash: hex(await sha1(bytes)) };

      const prior = await ledger.get(key);
      if (prior && prior.fileId && prior.name === name && prior.hash === expect.hash && prior.state !== 'undone') return finish(state, key, prior.fileId, expect, name);

      await ledger.set(key, { state: 'pending', hash: expect.hash, size: expect.size, name: name, at: now() });
      const mp = multipart({ name: name, parent: { id: String(auth.folderId) } }, name, bytes);
      if (!mp) return { ok: false, reason: 'bad-params' };

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const r = await send('POST', UPLOAD, { headers: { 'Content-Type': mp.type }, body: mp.body }, state);
        const c = classify(r);
        if (c === 'ok') {
          const e = r.body && Array.isArray(r.body.entries) ? r.body.entries[0] : null;
          if (e && idOk(String(e.id))) return finish(state, key, String(e.id), expect, name);
        }
        if (c === 'not-connected') return { ok: false, reason: 'not-connected' };
        if (c === 'rate-limited') {
          if (attempt === MAX_ATTEMPTS) return { ok: false, reason: 'rate-limited' };
          await sleep(r.retryMs || 1000);
          continue;
        }
        if (c === 'ok' || c === 'conflict' || c === 'network' || c === 'http-5xx') {
          // Something may already be in the folder under this name (our own earlier upload, or someone else's file). Look; never overwrite.
          const existing = await findByName(state, name, c === 'conflict' ? r.body : null);
          if (existing) {
            const there = await readBack(state, existing, expect);
            if (there.ok && there.same) return finish(state, key, existing, expect, name);
            if (there.ok && !there.same) { await ledger.set(key, { state: 'failed', at: now() }); return { ok: false, reason: 'name-taken' }; }
          }
          if (c === 'conflict') { await ledger.set(key, { state: 'failed', at: now() }); return { ok: false, reason: 'name-taken' }; }
          if (attempt === MAX_ATTEMPTS) return { ok: false, reason: c === 'network' ? 'network' : c === 'ok' ? 'verify_failed' : 'http-5xx' };
          await sleep(500 * attempt);
          continue;
        }
        await ledger.set(key, { state: 'failed', at: now() });
        return { ok: false, reason: c };
      }
      return { ok: false, reason: 'unknown' };
    }

    async function verify(ref) {
      const id = ref && (ref.fileId || ref.externalId);
      if (!idOk(String(id || ''))) return { ok: false, reason: 'bad-params' };
      const auth = await d.getAuth();
      if (!auth || !auth.token || !idOk(String(auth.folderId || ''))) return { ok: false, reason: 'not-connected' };
      const rec = ref.key ? await ledger.get(ref.key) : null;
      if (!rec || !rec.hash) return { ok: false, reason: 'verify_failed', proof: null };
      return finish({ auth: auth }, ref.key, String(id), { size: rec.size, hash: rec.hash }, rec.name);
    }

    async function undo(ref) {
      const id = ref && (ref.fileId || ref.externalId);
      if (!idOk(String(id || ''))) return { ok: false, reason: 'bad-params' };
      const auth = await d.getAuth();
      if (!auth || !auth.token || !idOk(String(auth.folderId || ''))) return { ok: false, reason: 'not-connected' };
      const state = { auth: auth };
      const rec = ref.key ? await ledger.get(ref.key) : null;
      const before = await readBack(state, String(id), null);
      if (before.gone) { if (ref.key) await ledger.set(ref.key, { state: 'undone', at: now() }); return { ok: true, readBack: false, written: 'Already gone from Box.' }; }
      if (!before.ok) return { ok: false, reason: before.reason === 'not-connected' ? 'not-connected' : 'verify_failed' };
      // Never trash a file the person has changed since Glance saved it.
      if (!rec || !rec.hash || before.meta.sha1 !== rec.hash) return { ok: false, reason: 'edited-by-person' };
      const del = await send('DELETE', API + '/files/' + encodeURIComponent(id), {}, state);
      const c = classify(del);
      if (c !== 'ok' && c !== 'not-found') return { ok: false, reason: c };
      const after = await readBack(state, String(id), null);
      if (after.gone) { if (ref.key) await ledger.set(ref.key, { state: 'undone', at: now() }); return { ok: true, readBack: true, written: 'Moved to the Box trash.' }; }
      return { ok: false, reason: 'verify_failed' };
    }

    return { save: save, verify: verify, undo: undo };
  }

  return { SYSTEM: SYSTEM, MAX_BYTES: MAX_BYTES, create: create, cleanName: cleanName };
})();

if (typeof module !== 'undefined') module.exports = { FlowBoxClose };
else if (typeof globalThis !== 'undefined') globalThis.FlowBoxClose = FlowBoxClose;
