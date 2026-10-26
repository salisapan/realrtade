// Linear: one issue in the team the person chose is the close; reading that issue back is the proof.
// docs/glance-ai/connectors/linear.md. Portable: no chrome.*, no DOM; the network, the token store, the ledger and the id generator are
// injected (src/background.js passes real ones, test/linear-close-corpus.cjs passes a mock of the vendor).
//
// Contract:
//   write(params)  one issueCreate mutation with a CLIENT-CHOSEN id (generated once per loop and stored in the ledger BEFORE the call),
//                  then a read of that issue by id. Handled (ok:true + proof) ONLY when the read returned the same issue, with the
//                  title we wrote, in the chosen team, not trashed, archived, completed or canceled.
//   idempotent     the ledger holds the loop's issue id. A second click or a retry re-reads that issue; it never creates another.
//                  If a create's outcome is unknown (5xx, timeout, a rate-limit that may have landed, a GraphQL error after the fact) the
//                  issue is read by the SAME id: if it exists it is adopted, if not the create is retried with the same id, so two issues
//                  cannot result. (If Linear ignores a client id, the id in its answer is used and a time-window read of the team is the
//                  fallback: unverified, see the connector doc.)
//   undo(ref)      issueDelete, then a read: undone only when Linear no longer returns the issue, or returns it trashed or archived.
//   verify(ref)    the same read-back on a fresh instance (after a reload).
// Linear is GraphQL: every value goes in `variables`, never into the query text, so a title cannot change the query. The team id, issue id
// and API host come only from stored values checked against a strict shape.
const FlowLinearClose = (() => {
  const SYSTEM = 'linear/issue';
  const ENDPOINT = 'https://api.linear.app/graphql';
  const MAX_TITLE = 200;
  const MAX_ATTEMPTS = 3;

  const ISSUE_FIELDS = 'id identifier title url dueDate trashed archivedAt completedAt canceledAt team { id }';
  const Q_CREATE = 'mutation($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { ' + ISSUE_FIELDS + ' } } }';
  const Q_READ = 'query($id: String!) { issue(id: $id) { ' + ISSUE_FIELDS + ' } }';
  const Q_DELETE = 'mutation($id: String!) { issueDelete(id: $id) { success } }';
  const Q_RECENT = 'query($teamId: String!, $since: DateTimeOrDuration!) { team(id: $teamId) { issues(first: 50, orderBy: createdAt, filter: { createdAt: { gte: $since } }) { nodes { ' + ISSUE_FIELDS + ' } } } }';

  function clipTitle(t) { return String(t == null ? '' : t).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE); }
  function validIsoDate(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)); }
  function uuidOk(u) { return typeof u === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(u); }
  function authOk(a) { return !!(a && a.token && uuidOk(a.teamId)); }
  function urlOk(u) { return typeof u === 'string' && /^https:\/\/linear\.app\/[A-Za-z0-9_\-./]{1,200}$/.test(u); }
  // Not cryptographic: only used when no id generator is injected (the extension injects crypto.randomUUID).
  function fallbackUuid() {
    const h = '0123456789abcdef'; let s = '';
    for (let i = 0; i < 36; i++) s += (i === 8 || i === 13 || i === 18 || i === 23) ? '-' : (i === 14 ? '4' : (i === 19 ? h[8 + Math.floor(Math.random() * 4)] : h[Math.floor(Math.random() * 16)]));
    return s;
  }

  function create(deps) {
    const d = deps || {};
    const now = d.now || (() => Date.now());
    const sleep = d.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
    const timeoutMs = d.timeoutMs || 15000;
    const ledger = d.ledger;
    const buildProof = d.buildProof;
    const newId = d.uuid || fallbackUuid;

    // One GraphQL call. Returns { error } (network) or { status, data, errors, retryAfterMs } with the failure classified:
    //   kind: 'ok' | 'auth' | 'forbidden' | 'notfound' | 'ratelimited' | 'server' | 'rejected'
    async function call(query, variables, state) {
      for (let pass = 0; pass < 2; pass++) {
        const auth = state.auth;
        let res;
        try {
          res = await Promise.race([
            d.fetch(ENDPOINT, { method: 'POST', headers: { Authorization: 'Bearer ' + auth.token, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ query: query, variables: variables }) }),
            new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs))
          ]);
        } catch (e) { return { error: 'network' }; }
        let body = null;
        try { body = await res.json(); } catch (e) { body = null; }
        const errs = body && Array.isArray(body.errors) ? body.errors : [];
        const text = errs.map((e) => String((e && e.message) || '') + ' ' + String((e && e.extensions && (e.extensions.code || e.extensions.type)) || '')).join(' ');
        let kind = 'ok';
        if (res.status === 401 || /authenticat|unauthori/i.test(text)) kind = 'auth';
        else if (res.status === 429 || /ratelimit|rate limit/i.test(text)) kind = 'ratelimited';
        else if (res.status >= 500) kind = 'server';
        else if (res.status === 403 || /forbidden|not authorized|permission/i.test(text)) kind = 'forbidden';
        else if (/not found|entity not found/i.test(text)) kind = 'notfound';
        else if (res.status === 404) kind = 'notfound';
        else if (errs.length || !res.ok) kind = 'rejected';
        if (kind === 'auth' && pass === 0 && auth.refreshToken && typeof d.refresh === 'function') {
          let fresh = null;
          try { fresh = await d.refresh(auth); } catch (e) { fresh = null; }
          if (!fresh || !fresh.token) return { kind: 'auth', status: res.status, data: null };
          state.auth = Object.assign({}, auth, fresh);
          if (typeof d.saveAuth === 'function') { try { await d.saveAuth(state.auth); } catch (e) { /* this session still has it */ } }
          continue;
        }
        const ra = Number(res.headers && res.headers.get && res.headers.get('retry-after'));
        return { kind: kind, status: res.status, data: kind === 'ok' && body ? body.data : null, retryAfterMs: Number.isFinite(ra) && ra > 0 ? Math.min(ra, 10) * 1000 : 0 };
      }
      return { kind: 'auth', data: null };
    }

    function mapFailure(kind) {
      return { auth: 'not-connected', forbidden: 'scope-missing', notfound: 'team-not-found', ratelimited: 'rate-limited', rejected: 'rejected', server: 'http-5xx' }[kind] || 'unknown';
    }

    async function readBack(state, id, expectTitle) {
      const r = await call(Q_READ, { id: id }, state);
      if (r.error) return { ok: false, reason: 'verify_failed' };
      if (r.kind === 'auth') return { ok: false, reason: 'not-connected' };
      if (r.kind === 'notfound') return { ok: false, gone: true, reason: 'verify_failed' };
      if (r.kind !== 'ok') return { ok: false, reason: 'verify_failed' };
      const i = r.data && r.data.issue;
      if (!i || typeof i !== 'object' || String(i.id) !== String(id)) return { ok: false, reason: 'verify_failed' };
      const gone = !!(i.trashed === true || i.archivedAt);
      const finished = !!(i.completedAt || i.canceledAt);
      return { ok: true, issue: i, gone: gone, finished: finished, inTeam: !!(i.team && String(i.team.id) === String(state.auth.teamId)), nameOk: expectTitle == null || i.title === expectTitle };
    }

    function proofFor(i) {
      if (typeof buildProof !== 'function') return null;
      return buildProof({ system: SYSTEM, externalId: String(i.id), url: urlOk(i.url) ? i.url : undefined, fetchedBack: true, verifiedAt: new Date(now()).toISOString() });
    }

    async function recentMatch(state, title, sinceMs) {
      const r = await call(Q_RECENT, { teamId: state.auth.teamId, since: new Date(sinceMs).toISOString() }, state);
      if (r.error || r.kind !== 'ok') return null;
      const nodes = r.data && r.data.team && r.data.team.issues && Array.isArray(r.data.team.issues.nodes) ? r.data.team.issues.nodes : [];
      const hit = nodes.find((x) => x && uuidOk(String(x.id)) && x.title === title && !x.trashed && !x.archivedAt && !x.completedAt && !x.canceledAt);
      return hit ? String(hit.id) : null;
    }

    async function finish(state, key, id, title) {
      const rb = await readBack(state, id, title);
      const ref = { issueId: id, externalId: id, key: key };
      const unverified = async () => { await ledger.set(key, { state: 'created-unverified', issueId: id, title: title, at: now() }); return { ok: false, reason: 'verify_failed', ref: ref, proof: null }; };
      if (!rb.ok) return rb.reason === 'not-connected' ? { ok: false, reason: 'not-connected', ref: ref, proof: null } : unverified();
      if (rb.gone || rb.finished || !rb.inTeam || !rb.nameOk) return unverified();
      const proof = proofFor(rb.issue);
      if (!proof) return { ok: false, reason: 'proof_pending', ref: ref, proof: null };
      await ledger.set(key, { state: 'verified', issueId: id, title: title, at: now() });
      return { ok: true, where: 'Linear', ref: ref, proof: proof, url: proof.url || null };
    }

    // params: { key, title, dueIso? } — key is the loop's own id; it is never sent to Linear.
    async function write(params) {
      const p = params || {};
      const key = String(p.key || '');
      const title = clipTitle(p.title);
      if (!key || !title) return { ok: false, reason: 'bad-params' };
      const auth = await d.getAuth();
      if (!authOk(auth)) return { ok: false, reason: 'not-connected' };
      const state = { auth: auth };

      const prior = await ledger.get(key);
      if (prior && prior.issueId && prior.state !== 'undone') return finish(state, key, prior.issueId, prior.title != null ? prior.title : title);

      const startedAt = now();
      let id = prior && prior.state === 'pending' && uuidOk(prior.pendingId) ? prior.pendingId : newId();
      if (!uuidOk(id)) return { ok: false, reason: 'bad-id' };
      // Written BEFORE the call: a crash between the create and its answer leaves the id on the device, and the next attempt reads it.
      await ledger.set(key, { state: 'pending', pendingId: id, title: title, at: (prior && prior.state === 'pending' && prior.at) || startedAt });
      if (prior && prior.state === 'pending') {
        const hit = await readBack(state, id, null);
        if (hit.ok && !hit.gone) return finish(state, key, id, title);
      }

      const input = { id: id, teamId: state.auth.teamId, title: title };
      if (validIsoDate(p.dueIso)) input.dueDate = p.dueIso;

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const r = await call(Q_CREATE, { input: input }, state);
        let ambiguous = false;
        if (r.error === 'network') ambiguous = true;
        else if (r.kind === 'ok') {
          const c = r.data && r.data.issueCreate;
          const issue = c && c.success === true ? c.issue : null;
          if (!issue || !uuidOk(String(issue.id))) ambiguous = true;
          else return finish(state, key, String(issue.id), title);
        } else if (r.kind === 'auth') return { ok: false, reason: 'not-connected' };
        else if (r.kind === 'ratelimited') {
          if (attempt === MAX_ATTEMPTS) return { ok: false, reason: 'rate-limited' };
          await sleep(r.retryAfterMs || 1000);
          continue;
        } else if (r.kind === 'server') ambiguous = true;
        else {
          // A GraphQL error does not prove the mutation did not run: look for the issue by its id before reporting a failure.
          const landed = await readBack(state, id, null);
          if (landed.ok && !landed.gone) return finish(state, key, id, title);
          await ledger.set(key, { state: 'failed', at: now() });
          return { ok: false, reason: mapFailure(r.kind) };
        }

        if (ambiguous) {
          const byId = await readBack(state, id, null);
          if (byId.ok && !byId.gone) return finish(state, key, id, title);
          const byWindow = await recentMatch(state, title, startedAt - 60000);
          if (byWindow) return finish(state, key, byWindow, title);
          if (attempt === MAX_ATTEMPTS) return { ok: false, reason: r.error === 'network' ? 'network' : 'http-5xx' };
          await sleep(500 * attempt);
        }
      }
      return { ok: false, reason: 'unknown' };
    }

    async function verify(ref) {
      const id = ref && (ref.issueId || ref.externalId);
      if (!uuidOk(String(id || ''))) return { ok: false, reason: 'bad-params' };
      const auth = await d.getAuth();
      if (!authOk(auth)) return { ok: false, reason: 'not-connected' };
      const state = { auth: auth };
      const rec = ref.key ? await ledger.get(ref.key) : null;
      return finish(state, ref.key || ('verify:' + id), String(id), rec && rec.title != null ? rec.title : null);
    }

    async function undo(ref) {
      const id = ref && (ref.issueId || ref.externalId);
      if (!uuidOk(String(id || ''))) return { ok: false, reason: 'bad-params' };
      const auth = await d.getAuth();
      if (!authOk(auth)) return { ok: false, reason: 'not-connected' };
      const state = { auth: auth };
      const r = await call(Q_DELETE, { id: String(id) }, state);
      if (r.error) return { ok: false, reason: 'network' };
      if (r.kind === 'forbidden') return { ok: false, reason: 'delete-not-permitted' };
      if (r.kind === 'auth') return { ok: false, reason: 'not-connected' };
      if (r.kind === 'notfound') { if (ref.key) await ledger.set(ref.key, { state: 'undone', issueId: String(id), at: now() }); return { ok: true, readBack: false, written: 'Already gone from Linear.' }; }
      if (r.kind !== 'ok') return { ok: false, reason: mapFailure(r.kind) };
      const rb = await readBack(state, String(id), null);
      // The loop is marked undone only once the read-back confirms it, so a delete that did nothing never lets a retry make a second issue.
      if (rb.gone) { if (ref.key) await ledger.set(ref.key, { state: 'undone', issueId: String(id), at: now() }); return { ok: true, readBack: true, written: 'Removed from Linear.' }; }
      return { ok: false, reason: 'verify_failed' };
    }

    return { write: write, verify: verify, undo: undo };
  }

  return { SYSTEM: SYSTEM, ENDPOINT: ENDPOINT, create: create, clipTitle: clipTitle, uuidOk: uuidOk };
})();

if (typeof module !== 'undefined') module.exports = { FlowLinearClose };
else if (typeof globalThis !== 'undefined') globalThis.FlowLinearClose = FlowLinearClose;
