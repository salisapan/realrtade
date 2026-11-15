// ClickUp: one task in the list the person chose is the close; reading that task back is the proof.
// docs/glance-ai/connectors/clickup.md. Portable: no chrome.*, no DOM; the network, the token store and the ledger are injected
// (src/background.js passes real ones, test/clickup-close-corpus.cjs passes a mock of the vendor).
//
// Contract:
//   write(params)  one POST /list/{id}/task (into the chosen list), then GET /task/{id}. Handled (ok:true + proof) ONLY when the GET returned the
//                  same task, with the name we wrote, in the chosen list, not archived and not closed. Anything else is ok:false.
//   idempotent     a loop key maps to one task in a ledger. A second click or a retry re-reads that task; it never POSTs again. If a POST's outcome
//                  is unknown (5xx, timeout, 409, an id-less answer), the list's newest open tasks are read for the same name created since the
//                  attempt began and that task is adopted instead of creating a twin.
//   undo(ref)      refuses a task the person changed (name differs, a description was added, or the due date moved → edited-by-person), else ARCHIVES it
//                  (PUT archived=true: ClickUp keeps an archived task and the person can restore it; Glance never deletes), then GET: undone only when
//                  the task reads back archived (or gone).
//   verify(ref)    the same read-back on a fresh instance (after a reload).
// The token is the person's own and is the Authorization header value exactly (ClickUp takes no "Bearer" prefix). Nothing in a title can change what is
// written: the title is one JSON string value; the list, the endpoint and the field names come only from stored ids and this file. Glance writes only
// the name and (when it is a clean date) the due date: no description, assignee, tag, priority, status, checklist, attachment or comment.
const FlowClickupClose = (() => {
  const API = 'https://api.clickup.com/api/v2';
  const SYSTEM = 'clickup/task';
  const MAX_TITLE = 200;
  const MAX_ATTEMPTS = 3;

  function clipTitle(t) { return String(t == null ? '' : t).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE); }
  function validIsoDate(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)); }
  function taskIdOk(g) { return typeof g === 'string' && /^[A-Za-z0-9]{5,16}$/.test(g); }
  function listIdOk(g) { return typeof g === 'string' && /^\d{5,15}$/.test(g); }
  // Noon UTC (in ms) keeps the same calendar day in nearly every timezone.
  function dueFor(iso) { return validIsoDate(iso) ? Date.parse(iso + 'T12:00:00.000Z') : null; }
  function sameDue(a, b) { const x = a == null || a === '' ? null : Number(a); const y = b == null || b === '' ? null : Number(b); if (x === null && y === null) return true; if (x === null || y === null) return false; return Math.abs(x - y) < 1000; }

  function create(deps) {
    const d = deps || {};
    const now = d.now || (() => Date.now());
    const sleep = d.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
    const timeoutMs = d.timeoutMs || 15000;
    const ledger = d.ledger;
    const buildProof = d.buildProof;

    async function call(method, path, body, state) {
      let res;
      try {
        res = await Promise.race([
          d.fetch(API + path, { method: method, headers: { Authorization: state.auth.token, Accept: 'application/json', 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs))
        ]);
      } catch (e) { return { error: 'network' }; }
      return { res: res };
    }

    async function json(res) { try { return await res.json(); } catch (e) { return null; } }

    function mapFailure(status) {
      if (status === 401) return 'not-connected';
      if (status === 403) return 'scope-missing';
      if (status === 400) return 'bad-params';
      if (status === 404) return 'list-not-found';
      if (status === 429) return 'rate-limited';
      return 'http-' + status;
    }

    async function readBack(state, id) {
      const r = await call('GET', '/task/' + encodeURIComponent(id), undefined, state);
      if (r.error) return { ok: false, reason: 'verify_failed' };
      if (r.res.status === 401) return { ok: false, reason: 'not-connected' };
      if (r.res.status === 404) return { ok: false, gone: true, reason: 'verify_failed' };
      if (!r.res.ok) return { ok: false, reason: 'verify_failed' };
      const t = await json(r.res);
      if (!t || typeof t !== 'object' || Array.isArray(t) || String(t.id) !== String(id) || typeof t.name !== 'string' || !t.list || typeof t.list !== 'object' || typeof t.archived !== 'boolean') return { ok: false, reason: 'verify_failed' };
      return { ok: true, task: t };
    }

    function proofFor(id, t) {
      if (typeof buildProof !== 'function') return null;
      return buildProof({ system: SYSTEM, externalId: id, url: typeof t.url === 'string' && /^https:\/\/app\.clickup\.com\/t\/[A-Za-z0-9]+/.test(t.url) ? t.url : undefined, fetchedBack: true, verifiedAt: new Date(now()).toISOString() });
    }

    function closedTask(t) { return !!(t.date_closed) || (t.status && typeof t.status === 'object' && t.status.type === 'closed'); }

    // The list's newest open tasks for the same name created since `sinceMs`: adopt, do not duplicate.
    async function findExisting(state, name, sinceMs) {
      const r = await call('GET', '/list/' + encodeURIComponent(state.auth.listId) + '/task?archived=false&include_closed=false&order_by=created&reverse=true&page=0', undefined, state);
      if (r.error || !r.res.ok) return null;
      const body = await json(r.res);
      const rows = body && Array.isArray(body.tasks) ? body.tasks : null;
      if (!rows) return null;
      const hit = rows.find((x) => x && taskIdOk(x.id) && x.name === name && x.archived !== true && Number(x.date_created) >= sinceMs);
      return hit ? String(hit.id) : null;
    }

    async function finish(state, key, id, name, due) {
      const rb = await readBack(state, id);
      const ref = { taskId: id, externalId: id, key: key };
      const unverified = async () => { await ledger.set(key, { state: 'created-unverified', id: id, title: name, due: due, at: now() }); return { ok: false, reason: 'verify_failed', ref: ref, proof: null }; };
      if (!rb.ok) {
        if (rb.reason === 'not-connected') return { ok: false, reason: 'not-connected', ref: ref, proof: null };
        return unverified();
      }
      const t = rb.task;
      if (t.archived || closedTask(t) || String(t.list.id) !== String(state.auth.listId) || t.name !== name) return unverified();
      const proof = proofFor(id, t);
      if (!proof) return { ok: false, reason: 'proof_pending', ref: ref, proof: null };
      await ledger.set(key, { state: 'verified', id: id, title: name, due: due, at: now() });
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
      const due = dueFor(p.dueIso);

      const prior = await ledger.get(key);
      if (prior && prior.id && prior.state !== 'undone') return finish(state, key, prior.id, prior.title != null ? prior.title : title, prior.due !== undefined ? prior.due : due);

      const startedAt = now();
      await ledger.set(key, { state: 'pending', title: title, due: due, at: startedAt });
      if (prior && prior.state === 'pending') {
        const adopted = await findExisting(state, title, (prior.at || startedAt) - 60000);
        if (adopted) return finish(state, key, adopted, title, due);
      }

      const body = { name: title };
      if (due !== null) { body.due_date = due; body.due_date_time = false; }

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const r = await call('POST', '/list/' + encodeURIComponent(auth.listId) + '/task', body, state);
        let ambiguous = false;
        if (r.error === 'network') ambiguous = true;
        else if (r.res.ok) {
          const t = await json(r.res);
          if (!t || !taskIdOk(t.id)) ambiguous = true;
          else return finish(state, key, String(t.id), title, due);
        } else if (r.res.status === 401) return { ok: false, reason: 'not-connected' };
        else if (r.res.status === 429) {
          const ra = Number(r.res.headers && r.res.headers.get && r.res.headers.get('retry-after'));
          if (attempt === MAX_ATTEMPTS) return { ok: false, reason: 'rate-limited' };
          await sleep(Number.isFinite(ra) && ra > 0 ? Math.min(ra, 10) * 1000 : 1000);
          continue; // not processed: safe to resend
        } else if (r.res.status >= 500 || r.res.status === 409) ambiguous = true;
        else { await ledger.set(key, { state: 'failed', at: now() }); return { ok: false, reason: mapFailure(r.res.status) }; }

        if (ambiguous) {
          const found = await findExisting(state, title, startedAt - 60000);
          if (found) return finish(state, key, found, title, due);
          if (attempt === MAX_ATTEMPTS) return { ok: false, reason: r.error === 'network' ? 'network' : 'http-' + (r.res ? r.res.status : 0) };
          await sleep(500 * attempt);
        }
      }
      return { ok: false, reason: 'unknown' };
    }

    async function verify(ref) {
      const id = ref && (ref.taskId || ref.externalId);
      if (!id || !taskIdOk(String(id))) return { ok: false, reason: 'bad-params' };
      const auth = await d.getAuth();
      if (!auth || !auth.token || !listIdOk(String(auth.listId || ''))) return { ok: false, reason: 'not-connected' };
      const rec = ref.key ? await ledger.get(ref.key) : null;
      if (!rec || rec.title == null) return { ok: false, reason: 'no-record' };
      return finish({ auth: auth }, ref.key, String(id), rec.title, rec.due !== undefined ? rec.due : null);
    }

    async function undo(ref) {
      const id = ref && (ref.taskId || ref.externalId);
      if (!id || !taskIdOk(String(id)) || !ref.key) return { ok: false, reason: 'bad-params' };
      const auth = await d.getAuth();
      if (!auth || !auth.token || !listIdOk(String(auth.listId || ''))) return { ok: false, reason: 'not-connected' };
      const state = { auth: auth };
      const rec = await ledger.get(ref.key);
      if (rec && rec.state === 'undone') return { ok: true, readBack: false, written: 'Already archived in ClickUp.' };
      if (!rec || rec.title == null) return { ok: false, reason: 'no-record' };
      const before = await readBack(state, String(id));
      if (before.gone) { await ledger.set(ref.key, { state: 'undone', id: String(id), at: now() }); return { ok: true, readBack: false, written: 'Already gone from ClickUp.' }; }
      if (!before.ok) return { ok: false, reason: before.reason === 'not-connected' ? 'not-connected' : 'verify_failed' };
      const t = before.task;
      if (t.archived === true) { await ledger.set(ref.key, { state: 'undone', id: String(id), at: now() }); return { ok: true, readBack: true, written: 'Already archived in ClickUp.' }; }
      // Never archive a task the person changed: Glance did not make that version.
      const hasText = [t.text_content, t.description].some((v) => typeof v === 'string' && v.trim().length > 0);
      if (t.name !== rec.title || hasText || !sameDue(t.due_date, rec.due)) return { ok: false, reason: 'edited-by-person' };
      const r = await call('PUT', '/task/' + encodeURIComponent(id), { archived: true }, state);
      if (r.error) return { ok: false, reason: r.error };
      if (r.res.status === 401) return { ok: false, reason: 'not-connected' };
      if (!r.res.ok && r.res.status !== 404) return { ok: false, reason: mapFailure(r.res.status) };
      const after = await readBack(state, String(id));
      if ((after.ok && after.task.archived === true) || after.gone) { await ledger.set(ref.key, { state: 'undone', id: String(id), at: now() }); return { ok: true, readBack: true, written: 'Archived in ClickUp.' }; }
      return { ok: false, reason: 'verify_failed' };
    }

    return { write: write, verify: verify, undo: undo };
  }

  return { SYSTEM: SYSTEM, API: API, create: create, clipTitle: clipTitle };
})();

if (typeof module !== 'undefined') module.exports = { FlowClickupClose };
else if (typeof globalThis !== 'undefined') globalThis.FlowClickupClose = FlowClickupClose;
