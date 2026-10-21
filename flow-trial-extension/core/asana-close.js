// Asana: one task in the project the person chose is the close; reading that task back is the proof.
// docs/glance-ai/connectors/asana.md. Portable: no chrome.*, no DOM; the network, the token store and the ledger are injected
// (src/background.js passes real ones, test/asana-close-corpus.cjs passes a mock of the vendor).
//
// Contract:
//   write(params)  one POST /tasks (into the chosen project), then GET /tasks/{gid}. Handled (ok:true + proof) ONLY when the GET
//                  returned the same task, with the name we wrote, not completed, in the chosen project. Anything else is ok:false.
//   idempotent     a loop key maps to one task in a ledger. A second click or a retry re-reads that task; it never POSTs again.
//                  If a POST's outcome is unknown (5xx, timeout, 409, a gid-less 200), the project's newest tasks are read for the
//                  same name created since the attempt began and that task is adopted instead of creating a twin.
//   undo(ref)      DELETE /tasks/{gid}, then GET: the close is undone only when Asana answers 404 for it (read back). Asana keeps a
//                  deleted task in the person's trash for 30 days (vendor behaviour, unverified here).
//   verify(ref)    the same read-back on a fresh instance (after a reload).
// Nothing in a title can change what is written: the title is one JSON string value; the project, the endpoint and the field
// names come only from stored ids and this file.
const FlowAsanaClose = (() => {
  const API = 'https://app.asana.com/api/1.0';
  const SYSTEM = 'asana/task';
  const MAX_TITLE = 200;
  const MAX_ATTEMPTS = 3;
  const MAX_ADOPT_PAGES = 3;
  const TASK_FIELDS = 'name,completed,due_on,permalink_url,projects.gid,created_at';

  function clipTitle(t) { return String(t == null ? '' : t).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE); }
  function validIsoDate(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)); }
  function gidOk(g) { return typeof g === 'string' && /^\d{1,30}$/.test(g); }

  function create(deps) {
    const d = deps || {};
    const now = d.now || (() => Date.now());
    const sleep = d.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
    const timeoutMs = d.timeoutMs || 15000;
    const ledger = d.ledger;
    const buildProof = d.buildProof;

    async function call(method, path, body, state) {
      for (let pass = 0; pass < 2; pass++) {
        const auth = state.auth;
        let res;
        try {
          res = await Promise.race([
            d.fetch(API + path, {
              method: method,
              headers: { Authorization: 'Bearer ' + auth.token, Accept: 'application/json', 'Content-Type': 'application/json' },
              body: body === undefined ? undefined : JSON.stringify(body)
            }),
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
        return { res: res };
      }
      return { error: 'not-connected' };
    }

    async function json(res) { try { return await res.json(); } catch (e) { return null; } }
    function taskOf(body) { return body && body.data && typeof body.data === 'object' ? body.data : null; }

    function mapFailure(status) {
      if (status === 401) return 'not-connected';
      if (status === 402 || status === 403) return 'scope-missing';
      if (status === 404) return 'project-not-shared';
      if (status === 429) return 'rate-limited';
      return 'http-' + status;
    }

    async function readBack(state, gid, expectName) {
      const r = await call('GET', '/tasks/' + encodeURIComponent(gid) + '?opt_fields=' + TASK_FIELDS, undefined, state);
      if (r.error) return { ok: false, reason: r.error === 'not-connected' ? 'not-connected' : 'verify_failed' };
      if (r.res.status === 404) return { ok: false, gone: true, reason: 'verify_failed' };
      if (!r.res.ok) return { ok: false, reason: 'verify_failed' };
      const t = taskOf(await json(r.res));
      if (!t || String(t.gid) !== String(gid)) return { ok: false, reason: 'verify_failed' };
      const inProject = Array.isArray(t.projects) && t.projects.some((p) => p && String(p.gid) === String(state.auth.projectGid));
      return { ok: true, task: t, completed: t.completed === true, inProject: inProject, nameOk: expectName == null || t.name === expectName };
    }

    function proofFor(t) {
      if (typeof buildProof !== 'function') return null;
      return buildProof({ system: SYSTEM, externalId: String(t.gid), url: typeof t.permalink_url === 'string' && t.permalink_url.indexOf('https://') === 0 ? t.permalink_url : undefined, fetchedBack: true, verifiedAt: new Date(now()).toISOString() });
    }

    // Newest tasks of the project (bounded pages) for the same name created since `sinceMs`: adopt, do not duplicate.
    async function findExisting(state, name, sinceMs) {
      let offset = '';
      for (let page = 0; page < MAX_ADOPT_PAGES; page++) {
        const q = '/projects/' + encodeURIComponent(state.auth.projectGid) + '/tasks?limit=100&opt_fields=name,created_at,completed' + (offset ? '&offset=' + encodeURIComponent(offset) : '');
        const r = await call('GET', q, undefined, state);
        if (r.error || !r.res.ok) return null;
        const body = await json(r.res);
        const rows = body && Array.isArray(body.data) ? body.data : [];
        const hit = rows.find((x) => x && gidOk(String(x.gid)) && x.name === name && x.completed !== true && (!x.created_at || Date.parse(x.created_at) >= sinceMs));
        if (hit) return String(hit.gid);
        offset = body && body.next_page && body.next_page.offset;
        if (!offset) return null;
      }
      return null;
    }

    async function finish(state, key, gid, name) {
      const rb = await readBack(state, gid, name);
      const ref = { taskGid: gid, externalId: gid, key: key };
      const unverified = async () => { await ledger.set(key, { state: 'created-unverified', gid: gid, title: name, at: now() }); return { ok: false, reason: 'verify_failed', ref: ref, proof: null }; };
      if (!rb.ok) {
        if (rb.reason === 'not-connected') return { ok: false, reason: 'not-connected', ref: ref, proof: null };
        return unverified();
      }
      if (rb.completed || !rb.inProject || !rb.nameOk) return unverified();
      const proof = proofFor(rb.task);
      if (!proof) return { ok: false, reason: 'proof_pending', ref: ref, proof: null };
      await ledger.set(key, { state: 'verified', gid: gid, title: name, at: now() });
      return { ok: true, where: 'Asana', ref: ref, proof: proof, url: proof.url || null };
    }

    // params: { key, title, dueIso? } — key is the loop's own id; it is never sent to Asana.
    async function write(params) {
      const p = params || {};
      const key = String(p.key || '');
      const title = clipTitle(p.title);
      if (!key || !title) return { ok: false, reason: 'bad-params' };
      const auth = await d.getAuth();
      if (!auth || !auth.token || !gidOk(String(auth.projectGid || ''))) return { ok: false, reason: 'not-connected' };
      const state = { auth: auth };

      const prior = await ledger.get(key);
      if (prior && prior.gid && prior.state !== 'undone') return finish(state, key, prior.gid, prior.title != null ? prior.title : title);

      const startedAt = now();
      await ledger.set(key, { state: 'pending', title: title, at: startedAt });
      if (prior && prior.state === 'pending') {
        const adopted = await findExisting(state, title, (prior.at || startedAt) - 60000);
        if (adopted) return finish(state, key, adopted, title);
      }

      const data = { name: title, projects: [String(state.auth.projectGid)] };
      if (validIsoDate(p.dueIso)) data.due_on = p.dueIso;
      const body = { data: data };

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const r = await call('POST', '/tasks', body, state);
        let ambiguous = false;
        if (r.error === 'not-connected') return { ok: false, reason: 'not-connected' };
        if (r.error === 'network') ambiguous = true;
        else if (r.res.ok) {
          const t = taskOf(await json(r.res));
          if (!t || !gidOk(String(t.gid))) ambiguous = true;
          else return finish(state, key, String(t.gid), title);
        } else if (r.res.status === 429) {
          const ra = Number(r.res.headers && r.res.headers.get && r.res.headers.get('retry-after'));
          if (attempt === MAX_ATTEMPTS) return { ok: false, reason: 'rate-limited' };
          await sleep(Number.isFinite(ra) && ra > 0 ? Math.min(ra, 10) * 1000 : 1000);
          continue; // not processed: safe to resend
        } else if (r.res.status >= 500 || r.res.status === 409) ambiguous = true;
        else { await ledger.set(key, { state: 'failed', at: now() }); return { ok: false, reason: mapFailure(r.res.status) }; }

        if (ambiguous) {
          const found = await findExisting(state, title, startedAt - 60000);
          if (found) return finish(state, key, found, title);
          if (attempt === MAX_ATTEMPTS) return { ok: false, reason: r.error === 'network' ? 'network' : 'http-' + (r.res ? r.res.status : 0) };
          await sleep(500 * attempt);
        }
      }
      return { ok: false, reason: 'unknown' };
    }

    async function verify(ref) {
      const gid = ref && (ref.taskGid || ref.externalId);
      if (!gid) return { ok: false, reason: 'bad-params' };
      const auth = await d.getAuth();
      if (!auth || !auth.token) return { ok: false, reason: 'not-connected' };
      const state = { auth: auth };
      const rec = ref.key ? await ledger.get(ref.key) : null;
      return finish(state, ref.key || ('verify:' + gid), String(gid), rec && rec.title != null ? rec.title : null);
    }

    async function undo(ref) {
      const gid = ref && (ref.taskGid || ref.externalId);
      if (!gid || !gidOk(String(gid))) return { ok: false, reason: 'bad-params' };
      const auth = await d.getAuth();
      if (!auth || !auth.token) return { ok: false, reason: 'not-connected' };
      const state = { auth: auth };
      const r = await call('DELETE', '/tasks/' + encodeURIComponent(gid), undefined, state);
      if (r.error) return { ok: false, reason: r.error };
      if (!r.res.ok && r.res.status !== 404) return { ok: false, reason: mapFailure(r.res.status) };
      if (ref.key) await ledger.set(ref.key, { state: 'undone', gid: String(gid), at: now() });
      if (r.res.status === 404) return { ok: true, readBack: false, written: 'Already gone from Asana.' };
      const rb = await readBack(state, String(gid), null);
      if (rb.gone) return { ok: true, readBack: true, written: 'Removed from Asana.' };
      return { ok: false, reason: 'verify_failed' };
    }

    return { write: write, verify: verify, undo: undo };
  }

  return { SYSTEM: SYSTEM, API: API, create: create, clipTitle: clipTitle };
})();

if (typeof module !== 'undefined') module.exports = { FlowAsanaClose };
else if (typeof globalThis !== 'undefined') globalThis.FlowAsanaClose = FlowAsanaClose;
