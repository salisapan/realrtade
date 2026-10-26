// Jira Cloud: one issue in the project the person chose is the close; reading that issue back is the proof.
// docs/glance-ai/connectors/jira.md. Portable: no chrome.*, no DOM; the network, the token store and the ledger are injected
// (src/background.js passes real ones, test/jira-close-corpus.cjs passes a mock of the vendor).
//
// Contract:
//   write(params)  one POST /issue (into the chosen project, chosen issue type), then GET /issue/{key}. Handled (ok:true + proof) ONLY
//                  when the GET returned the same issue, with the summary we wrote, in the chosen project, not in a done status.
//   idempotent     a loop key maps to one issue in a ledger. A second click or a retry re-reads that issue; it never POSTs again.
//                  If a POST's outcome is unknown (5xx, timeout, 409, a key-less 201) the project's issues created in the last few
//                  minutes are read for the same summary and that issue is adopted instead of creating a twin.
//   undo(ref)      DELETE /issue/{key}, then GET: undone only when Jira answers 404. If the person's Jira role may not delete issues
//                  (403) Undo says so and the issue stays: Undo is never claimed without the read-back.
//   verify(ref)    the same read-back on a fresh instance (after a reload).
// Nothing in a title can change what is written: the summary is one JSON string; the project key, issue type, cloud id and endpoint
// come only from stored values that are checked against a strict shape before they enter a URL or a query. The title is never put
// into a JQL query: the adopt query uses only the project key and a time window, and the summary is compared in code.
const FlowJiraClose = (() => {
  const SYSTEM = 'jira/issue';
  const MAX_TITLE = 200;
  const MAX_ATTEMPTS = 3;
  const READ_FIELDS = 'summary,project,status,duedate';

  function clipTitle(t) { return String(t == null ? '' : t).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE); }
  function validIsoDate(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)); }
  function projectKeyOk(k) { return typeof k === 'string' && /^[A-Z][A-Z0-9_]{1,9}$/.test(k); }
  function issueKeyOk(k) { return typeof k === 'string' && /^[A-Z][A-Z0-9_]{1,9}-\d{1,9}$/.test(k); }
  function cloudIdOk(c) { return typeof c === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(c); }
  function typeIdOk(t) { return typeof t === 'string' && /^\d{1,12}$/.test(t); }
  function siteUrlOk(u) { return typeof u === 'string' && /^https:\/\/[a-z0-9-]+\.atlassian\.net\/?$/.test(u); }
  function apiBase(auth) { return 'https://api.atlassian.com/ex/jira/' + auth.cloudId + '/rest/api/3'; }
  function authOk(a) { return !!(a && a.token && cloudIdOk(a.cloudId) && projectKeyOk(a.projectKey) && typeIdOk(String(a.issueTypeId || ''))); }

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
            d.fetch(apiBase(auth) + path, {
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
          // Atlassian rotates the refresh token on every refresh: the new one must be saved or the next refresh fails.
          state.auth = Object.assign({}, auth, fresh);
          if (typeof d.saveAuth === 'function') { try { await d.saveAuth(state.auth); } catch (e) { /* this session still has it */ } }
          continue;
        }
        return { res: res };
      }
      return { error: 'not-connected' };
    }

    async function json(res) { try { return await res.json(); } catch (e) { return null; } }

    function mapFailure(status) {
      if (status === 401) return 'not-connected';
      if (status === 403) return 'scope-missing';
      if (status === 404) return 'project-not-found';
      if (status === 400) return 'rejected';
      if (status === 429) return 'rate-limited';
      return 'http-' + status;
    }

    async function readBack(state, key, expectSummary) {
      const r = await call('GET', '/issue/' + encodeURIComponent(key) + '?fields=' + READ_FIELDS, undefined, state);
      if (r.error) return { ok: false, reason: r.error === 'not-connected' ? 'not-connected' : 'verify_failed' };
      if (r.res.status === 404) return { ok: false, gone: true, reason: 'verify_failed' };
      if (!r.res.ok) return { ok: false, reason: 'verify_failed' };
      const i = await json(r.res);
      if (!i || String(i.key) !== String(key) || !i.fields || typeof i.fields !== 'object') return { ok: false, reason: 'verify_failed' };
      const f = i.fields;
      const inProject = !!(f.project && f.project.key === state.auth.projectKey);
      const done = !!(f.status && f.status.statusCategory && f.status.statusCategory.key === 'done');
      return { ok: true, issue: i, inProject: inProject, done: done, nameOk: expectSummary == null || f.summary === expectSummary };
    }

    function proofFor(i, state) {
      if (typeof buildProof !== 'function') return null;
      const site = state.auth.siteUrl && siteUrlOk(state.auth.siteUrl) ? state.auth.siteUrl.replace(/\/$/, '') : '';
      return buildProof({ system: SYSTEM, externalId: String(i.key), url: site ? site + '/browse/' + i.key : undefined, fetchedBack: true, verifiedAt: new Date(now()).toISOString() });
    }

    // Recently created issues of the project (project key + time window only, never the title) with the same summary: adopt.
    async function findExisting(state, summary, sinceMs) {
      const jql = 'project = "' + state.auth.projectKey + '" AND created >= -10m ORDER BY created DESC';
      const r = await call('GET', '/search/jql?jql=' + encodeURIComponent(jql) + '&fields=summary,created,status&maxResults=50', undefined, state);
      if (r.error || !r.res.ok) return null;
      const body = await json(r.res);
      const rows = body && Array.isArray(body.issues) ? body.issues : [];
      const hit = rows.find((x) => x && issueKeyOk(String(x.key)) && x.fields && x.fields.summary === summary
        && !(x.fields.status && x.fields.status.statusCategory && x.fields.status.statusCategory.key === 'done')
        && (!x.fields.created || Date.parse(x.fields.created) >= sinceMs));
      return hit ? String(hit.key) : null;
    }

    async function finish(state, key, issueKey, summary) {
      const rb = await readBack(state, issueKey, summary);
      const ref = { issueKey: issueKey, externalId: issueKey, key: key };
      const unverified = async () => { await ledger.set(key, { state: 'created-unverified', issueKey: issueKey, title: summary, at: now() }); return { ok: false, reason: 'verify_failed', ref: ref, proof: null }; };
      if (!rb.ok) {
        if (rb.reason === 'not-connected') return { ok: false, reason: 'not-connected', ref: ref, proof: null };
        return unverified();
      }
      if (rb.done || !rb.inProject || !rb.nameOk) return unverified();
      const proof = proofFor(rb.issue, state);
      if (!proof) return { ok: false, reason: 'proof_pending', ref: ref, proof: null };
      await ledger.set(key, { state: 'verified', issueKey: issueKey, title: summary, at: now() });
      return { ok: true, where: 'Jira', ref: ref, proof: proof, url: proof.url || null };
    }

    // params: { key, title, dueIso? } — key is the loop's own id; it is never sent to Jira.
    async function write(params) {
      const p = params || {};
      const key = String(p.key || '');
      const title = clipTitle(p.title);
      if (!key || !title) return { ok: false, reason: 'bad-params' };
      const auth = await d.getAuth();
      if (!authOk(auth)) return { ok: false, reason: 'not-connected' };
      const state = { auth: auth };

      const prior = await ledger.get(key);
      if (prior && prior.issueKey && prior.state !== 'undone') return finish(state, key, prior.issueKey, prior.title != null ? prior.title : title);

      const startedAt = now();
      await ledger.set(key, { state: 'pending', title: title, at: startedAt });
      if (prior && prior.state === 'pending') {
        const adopted = await findExisting(state, title, (prior.at || startedAt) - 60000);
        if (adopted) return finish(state, key, adopted, title);
      }

      const fields = { project: { key: state.auth.projectKey }, issuetype: { id: String(state.auth.issueTypeId) }, summary: title };
      if (validIsoDate(p.dueIso)) fields.duedate = p.dueIso;
      const body = { fields: fields };

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const r = await call('POST', '/issue', body, state);
        let ambiguous = false;
        if (r.error === 'not-connected') return { ok: false, reason: 'not-connected' };
        if (r.error === 'network') ambiguous = true;
        else if (r.res.ok) {
          const i = await json(r.res);
          if (!i || !issueKeyOk(String(i.key))) ambiguous = true;
          else return finish(state, key, String(i.key), title);
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
      const issueKey = ref && (ref.issueKey || ref.externalId);
      if (!issueKeyOk(String(issueKey || ''))) return { ok: false, reason: 'bad-params' };
      const auth = await d.getAuth();
      if (!authOk(auth)) return { ok: false, reason: 'not-connected' };
      const state = { auth: auth };
      const rec = ref.key ? await ledger.get(ref.key) : null;
      return finish(state, ref.key || ('verify:' + issueKey), String(issueKey), rec && rec.title != null ? rec.title : null);
    }

    async function undo(ref) {
      const issueKey = ref && (ref.issueKey || ref.externalId);
      if (!issueKeyOk(String(issueKey || ''))) return { ok: false, reason: 'bad-params' };
      const auth = await d.getAuth();
      if (!authOk(auth)) return { ok: false, reason: 'not-connected' };
      const state = { auth: auth };
      const r = await call('DELETE', '/issue/' + encodeURIComponent(issueKey), undefined, state);
      if (r.error) return { ok: false, reason: r.error };
      if (r.res.status === 403) return { ok: false, reason: 'delete-not-permitted' };
      if (!r.res.ok && r.res.status !== 404) return { ok: false, reason: mapFailure(r.res.status) };
      if (ref.key) await ledger.set(ref.key, { state: 'undone', issueKey: String(issueKey), at: now() });
      if (r.res.status === 404) return { ok: true, readBack: false, written: 'Already gone from Jira.' };
      const rb = await readBack(state, String(issueKey), null);
      if (rb.gone) return { ok: true, readBack: true, written: 'Removed from Jira.' };
      return { ok: false, reason: 'verify_failed' };
    }

    return { write: write, verify: verify, undo: undo };
  }

  return { SYSTEM: SYSTEM, create: create, clipTitle: clipTitle, projectKeyOk: projectKeyOk, cloudIdOk: cloudIdOk };
})();

if (typeof module !== 'undefined') module.exports = { FlowJiraClose };
else if (typeof globalThis !== 'undefined') globalThis.FlowJiraClose = FlowJiraClose;
