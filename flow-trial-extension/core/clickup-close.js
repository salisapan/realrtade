// ClickUp: one task in the List the person chose is the close; reading that task back is the proof.
// docs/glance-ai/connectors/clickup.md. Portable: no chrome.*, no DOM; the network, the token store and the ledger are injected
// (src/background.js passes real ones, test/clickup-close-corpus.cjs passes a mock of the vendor).
//
// Contract:
//   write(params)  one POST /list/{id}/task, then GET /task/{id}. Handled (ok:true + proof) ONLY when the GET returned the same
//                  task, with the name we wrote, in the chosen List, not archived and not closed. Anything else is ok:false.
//   idempotent     a loop key maps to one task in a ledger. A second click or a retry re-reads that task; it never POSTs again.
//                  If a POST's outcome is unknown (5xx, timeout, 409, an id-less 200), the List's tasks created since the attempt
//                  began are read for the same name and that task is adopted instead of creating a twin.
//   undo(ref)      DELETE /task/{id}, then GET: the close is undone only when ClickUp answers 404 for it (read back).
//   verify(ref)    the same read-back on a fresh instance (after a reload).
// ClickUp OAuth has no scopes, no PKCE and (today) no refresh token: access is whatever Workspaces the person authorised, so the
// connector's least privilege is enforced here: only the task endpoints below, and one List id that comes from the person.
// Nothing in a title can change what is written: the title is one JSON string value; the List, the endpoint and the field names
// come only from stored ids and this file.
const FlowClickUpClose = (() => {
  const API = 'https://api.clickup.com/api/v2';
  const SYSTEM = 'clickup/task';
  const MAX_TITLE = 200;
  const MAX_ATTEMPTS = 3;
  const MAX_ADOPT_PAGES = 3;
  // 401 codes that mean "this Workspace was not authorised for this token" (the List is outside what the person shared),
  // as opposed to "the token is gone". Vendor page: developer.clickup.com/docs/common_errors.
  const TEAM_NOT_AUTHORIZED = /^OAUTH_(023|026|027|029|03\d|04[0-5])$/;

  function clipTitle(t) { return String(t == null ? '' : t).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE); }
  function validIsoDate(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s; }
  function listIdOk(g) { return typeof g === 'string' && /^\d{1,20}$/.test(g); }
  function taskIdOk(g) { return typeof g === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(g); }
  // A date with no time of day is sent at 12:00 UTC so it lands on the same calendar day in every time zone (verify live).
  function dueMs(iso) { return Date.parse(iso + 'T12:00:00Z'); }

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

    // Why a non-2xx answer failed, as a short reason. 401 needs the body: an unauthorised Workspace is not a lost token.
    async function failure(res) {
      const s = res.status;
      if (s === 401) {
        const b = await json(res);
        const code = b && typeof b.ECODE === 'string' ? b.ECODE : '';
        return TEAM_NOT_AUTHORIZED.test(code) ? 'project-not-shared' : 'not-connected';
      }
      if (s === 402 || s === 403) return 'scope-missing';
      if (s === 404) return 'project-not-shared';
      if (s === 429) return 'rate-limited';
      return 'http-' + s;
    }

    function waitFor429(res) {
      const h = (k) => (res.headers && typeof res.headers.get === 'function' ? res.headers.get(k) : null);
      const ra = Number(h('retry-after'));
      if (Number.isFinite(ra) && ra > 0) return Math.min(ra, 10) * 1000;
      let reset = Number(h('x-ratelimit-reset'));
      if (Number.isFinite(reset) && reset > 0) {
        if (reset < 1e12) reset *= 1000;
        const ms = reset - now();
        if (ms > 0) return Math.min(ms, 10000);
      }
      return 1000;
    }

    async function readBack(state, id, expectName) {
      const r = await call('GET', '/task/' + encodeURIComponent(id), undefined, state);
      if (r.error) return { ok: false, reason: r.error === 'not-connected' ? 'not-connected' : 'verify_failed' };
      if (r.res.status === 404) return { ok: false, gone: true, reason: 'verify_failed' };
      if (r.res.status === 401) return { ok: false, reason: 'not-connected' };
      if (!r.res.ok) return { ok: false, reason: 'verify_failed' };
      const t = await json(r.res);
      if (!t || typeof t !== 'object' || t.id !== id) return { ok: false, reason: 'verify_failed' };
      const st = t.status && typeof t.status === 'object' ? String(t.status.type || '').toLowerCase() : '';
      const completed = st === 'closed' || st === 'done' || (t.date_closed !== null && t.date_closed !== undefined && t.date_closed !== '');
      const inList = !!(t.list && String(t.list.id) === String(state.auth.listId));
      return { ok: true, task: t, completed: completed || t.archived === true, inList: inList, nameOk: expectName == null || t.name === expectName };
    }

    function proofFor(t) {
      if (typeof buildProof !== 'function') return null;
      return buildProof({ system: SYSTEM, externalId: t.id, url: typeof t.url === 'string' && t.url.indexOf('https://') === 0 ? t.url : undefined, fetchedBack: true, verifiedAt: new Date(now()).toISOString() });
    }

    // Newest tasks of the List created since `sinceMs`, bounded pages, for the same name: adopt, do not duplicate.
    async function findExisting(state, name, sinceMs) {
      for (let page = 0; page < MAX_ADOPT_PAGES; page++) {
        const q = '/list/' + encodeURIComponent(state.auth.listId) + '/task?order_by=created&reverse=true&date_created_gt=' + Math.max(0, Math.floor(sinceMs)) + '&page=' + page;
        const r = await call('GET', q, undefined, state);
        if (r.error || !r.res.ok) return null;
        const body = await json(r.res);
        const rows = body && Array.isArray(body.tasks) ? body.tasks : [];
        const hit = rows.find((x) => x && taskIdOk(x.id) && x.name === name && x.archived !== true);
        if (hit) return String(hit.id);
        if (!body || body.last_page !== false) return null;
      }
      return null;
    }

    async function finish(state, key, id, name) {
      const rb = await readBack(state, id, name);
      const ref = { taskId: id, externalId: id, key: key };
      const unverified = async () => { await ledger.set(key, { state: 'created-unverified', id: id, title: name, at: now() }); return { ok: false, reason: 'verify_failed', ref: ref, proof: null }; };
      if (!rb.ok) {
        if (rb.reason === 'not-connected') return { ok: false, reason: 'not-connected', ref: ref, proof: null };
        return unverified();
      }
      if (rb.completed || !rb.inList || !rb.nameOk) return unverified();
      const proof = proofFor(rb.task);
      if (!proof) return { ok: false, reason: 'proof_pending', ref: ref, proof: null };
      await ledger.set(key, { state: 'verified', id: id, title: name, at: now() });
      return { ok: true, where: 'ClickUp', ref: ref, proof: proof, url: proof.url || null };
    }

    // params: { key, title, dueIso? } — key is the loop's own id; it is never sent to ClickUp.
    async function write(params) {
      const p = params || {};
      const key = String(p.key || '');
      const title = clipTitle(p.title);
      if (!key || !title) return { ok: false, reason: 'bad-params' };
      const auth = await d.getAuth();
      if (!auth || !auth.token || !listIdOk(String(auth.listId || ''))) return { ok: false, reason: 'not-connected' };
      const state = { auth: auth };

      const prior = await ledger.get(key);
      if (prior && prior.id && prior.state !== 'undone') return finish(state, key, prior.id, prior.title != null ? prior.title : title);

      const startedAt = now();
      await ledger.set(key, { state: 'pending', title: title, at: startedAt });
      if (prior && prior.state === 'pending') {
        const adopted = await findExisting(state, title, (prior.at || startedAt) - 60000);
        if (adopted) return finish(state, key, adopted, title);
      }

      const body = { name: title };
      if (validIsoDate(p.dueIso)) { body.due_date = dueMs(p.dueIso); body.due_date_time = false; }
      const path = '/list/' + encodeURIComponent(String(state.auth.listId)) + '/task';

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const r = await call('POST', path, body, state);
        let ambiguous = false;
        if (r.error === 'not-connected') return { ok: false, reason: 'not-connected' };
        if (r.error === 'network') ambiguous = true;
        else if (r.res.ok) {
          const t = await json(r.res);
          if (!t || typeof t !== 'object' || !taskIdOk(t.id)) ambiguous = true;
          else return finish(state, key, t.id, title);
        } else if (r.res.status === 429) {
          if (attempt === MAX_ATTEMPTS) return { ok: false, reason: 'rate-limited' };
          await sleep(waitFor429(r.res));
          continue; // not processed: safe to resend
        } else if (r.res.status >= 500 || r.res.status === 409) ambiguous = true;
        else { await ledger.set(key, { state: 'failed', at: now() }); return { ok: false, reason: await failure(r.res) }; }

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
      const id = ref && (ref.taskId || ref.externalId);
      if (!taskIdOk(id)) return { ok: false, reason: 'bad-params' };
      const auth = await d.getAuth();
      if (!auth || !auth.token) return { ok: false, reason: 'not-connected' };
      const state = { auth: auth };
      const rec = ref.key ? await ledger.get(ref.key) : null;
      return finish(state, ref.key || ('verify:' + id), id, rec && rec.title != null ? rec.title : null);
    }

    async function undo(ref) {
      const id = ref && (ref.taskId || ref.externalId);
      if (!taskIdOk(id)) return { ok: false, reason: 'bad-params' };
      const auth = await d.getAuth();
      if (!auth || !auth.token) return { ok: false, reason: 'not-connected' };
      const state = { auth: auth };
      const r = await call('DELETE', '/task/' + encodeURIComponent(id), undefined, state);
      if (r.error) return { ok: false, reason: r.error };
      if (!r.res.ok && r.res.status !== 404) return { ok: false, reason: await failure(r.res) };
      if (ref.key) await ledger.set(ref.key, { state: 'undone', id: id, at: now() });
      if (r.res.status === 404) return { ok: true, readBack: false, written: 'Already gone from ClickUp.' };
      const rb = await readBack(state, id, null);
      if (rb.gone) return { ok: true, readBack: true, written: 'Removed from ClickUp.' };
      return { ok: false, reason: 'verify_failed' };
    }

    return { write: write, verify: verify, undo: undo };
  }

  return { SYSTEM: SYSTEM, API: API, create: create, clipTitle: clipTitle, listIdOk: listIdOk };
})();

if (typeof module !== 'undefined') module.exports = { FlowClickUpClose };
else if (typeof globalThis !== 'undefined') globalThis.FlowClickUpClose = FlowClickUpClose;
