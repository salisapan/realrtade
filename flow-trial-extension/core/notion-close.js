// Notion: one row in the database the person picked is the close; reading that row back is the proof.
// docs/glance-ai/connectors/notion.md. Portable: no chrome.*, no DOM; the network, the token store and the ledger are injected
// (src/background.js passes real ones, test/notion-close-corpus.cjs passes a mock of the vendor).
//
// Contract:
//   write(params)  one POST /pages, then GET /pages/{id}. Handled (ok:true + proof) ONLY when the GET returned the same page,
//                  not archived, in the chosen database, with the title we wrote. Anything else is ok:false and never Handled.
//   idempotent     a loop key maps to one page in a ledger. A second click or a retry re-reads that page; it never POSTs again.
//                  If a POST's outcome is unknown (5xx, timeout, 409), the database is queried for the same title created since
//                  the attempt began and that row is adopted rather than creating a second one.
//   undo(ref)      PATCH archived:true, then GET and require archived:true. Notion has no hard delete; archiving is the trash button.
//   verify(ref)    the same read-back on a fresh instance (after a reload).
// Nothing in a title can change what is written: the title goes into one plain-text rich_text value, the parent, the property
// names and the endpoint are built only from stored ids and the database's own schema.
const FlowNotionClose = (() => {
  const API = 'https://api.notion.com/v1';
  const VERSION = '2022-06-28';
  const SYSTEM = 'notion/page';
  const MAX_TITLE = 200;
  const MAX_ATTEMPTS = 3;

  function normId(id) { return String(id || '').replace(/-/g, '').toLowerCase(); }
  function clipTitle(t) { return String(t == null ? '' : t).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE); }
  function validIsoDate(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)); }

  function create(deps) {
    const d = deps || {};
    const now = d.now || (() => Date.now());
    const sleep = d.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
    const timeoutMs = d.timeoutMs || 15000;
    const ledger = d.ledger; // { get(key) -> obj|null, set(key, obj) }
    const buildProof = d.buildProof;

    // One authorised call. Handles the timeout and a single token refresh on 401. Returns { res } or { error }.
    async function call(method, path, body, state) {
      for (let pass = 0; pass < 2; pass++) {
        const auth = state.auth;
        let res;
        try {
          res = await Promise.race([
            d.fetch(API + path, {
              method: method,
              headers: { Authorization: 'Bearer ' + auth.token, 'Notion-Version': VERSION, 'Content-Type': 'application/json' },
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
          if (typeof d.saveAuth === 'function') { try { await d.saveAuth(state.auth); } catch (e) { /* the call below still works this session */ } }
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
      if (status === 404) return 'database-not-shared';
      if (status === 429) return 'rate-limited';
      return 'http-' + status;
    }

    async function loadSchema(state) {
      const r = await call('GET', '/databases/' + encodeURIComponent(state.auth.databaseId), undefined, state);
      if (r.error) return { fail: r.error === 'network' ? 'network' : r.error };
      if (!r.res.ok) return { fail: mapFailure(r.res.status) };
      const db = await json(r.res);
      const props = db && db.properties;
      if (!props || typeof props !== 'object') return { fail: 'bad-shape' };
      let titleProp = '';
      let dateProp = '';
      Object.keys(props).forEach((k) => {
        const p = props[k];
        if (p && p.type === 'title' && !titleProp) titleProp = k;
        if (p && p.type === 'date' && !dateProp) dateProp = k;
      });
      if (!titleProp) return { fail: 'bad-shape' };
      return { titleProp: titleProp, dateProp: dateProp };
    }

    // GET the page and decide whether it is the close. Never trusts the POST response.
    async function readBack(state, pageId, expectTitle, titleProp) {
      const r = await call('GET', '/pages/' + encodeURIComponent(pageId), undefined, state);
      if (r.error) return { ok: false, reason: r.error === 'not-connected' ? 'not-connected' : 'verify_failed' };
      if (r.res.status === 404) return { ok: false, gone: true, reason: 'verify_failed' };
      if (!r.res.ok) return { ok: false, reason: 'verify_failed' };
      const page = await json(r.res);
      if (!page || normId(page.id) !== normId(pageId)) return { ok: false, reason: 'verify_failed' };
      return { ok: true, page: page, archived: page.archived === true, inDb: !!(page.parent && normId(page.parent.database_id) === normId(state.auth.databaseId)), titleOk: titleMatches(page, expectTitle, titleProp) };
    }

    function titleMatches(page, expectTitle, titleProp) {
      if (expectTitle == null) return true;
      const p = page.properties && titleProp && page.properties[titleProp];
      const arr = p && p.title;
      if (!Array.isArray(arr)) return false;
      const got = arr.map((x) => (x && x.plain_text) || (x && x.text && x.text.content) || '').join('');
      return got === expectTitle;
    }

    function proofFor(page) {
      if (typeof buildProof !== 'function') return null;
      return buildProof({ system: SYSTEM, externalId: page.id, url: typeof page.url === 'string' && page.url.indexOf('https://') === 0 ? page.url : undefined, fetchedBack: true, verifiedAt: new Date(now()).toISOString() });
    }

    // A row already in the database with this exact title created since `sinceIso`: adopt it, do not create a twin.
    async function findExisting(state, titleProp, title, sinceIso) {
      const r = await call('POST', '/databases/' + encodeURIComponent(state.auth.databaseId) + '/query', {
        filter: { and: [{ property: titleProp, title: { equals: title } }, { timestamp: 'created_time', created_time: { on_or_after: sinceIso } }] },
        page_size: 2
      }, state);
      if (r.error || !r.res.ok) return null;
      const out = await json(r.res);
      const hit = out && Array.isArray(out.results) ? out.results.find((x) => x && typeof x.id === 'string' && x.archived !== true) : null;
      return hit ? hit.id : null;
    }

    async function finish(state, key, pageId, title, titleProp) {
      const rb = await readBack(state, pageId, title, titleProp);
      const ref = { pageId: pageId, externalId: pageId, key: key };
      if (!rb.ok) {
        if (rb.reason === 'not-connected') return { ok: false, reason: 'not-connected', ref: ref, proof: null };
        await ledger.set(key, { state: 'created-unverified', pageId: pageId, title: title, titleProp: titleProp, at: now() });
        return { ok: false, reason: 'verify_failed', ref: ref, proof: null };
      }
      if (rb.archived || !rb.inDb || !rb.titleOk) {
        await ledger.set(key, { state: 'created-unverified', pageId: pageId, title: title, titleProp: titleProp, at: now() });
        return { ok: false, reason: 'verify_failed', ref: ref, proof: null };
      }
      const proof = proofFor(rb.page);
      if (!proof) return { ok: false, reason: 'proof_pending', ref: ref, proof: null };
      await ledger.set(key, { state: 'verified', pageId: pageId, title: title, titleProp: titleProp, at: now() });
      return { ok: true, where: 'Notion', ref: ref, proof: proof, url: proof.url || null };
    }

    // params: { key, title, dueIso? } — key is the loop's own id; it is never sent to Notion.
    async function write(params) {
      const p = params || {};
      const key = String(p.key || '');
      const title = clipTitle(p.title);
      if (!key || !title) return { ok: false, reason: 'bad-params' };
      const auth = await d.getAuth();
      if (!auth || !auth.token || !auth.databaseId) return { ok: false, reason: 'not-connected' };
      const state = { auth: auth };

      const prior = await ledger.get(key);
      if (prior && prior.pageId && prior.state !== 'undone') {
        // Already created for this loop (verified, or created but not yet verified): re-read it, never POST again.
        return finish(state, key, prior.pageId, prior.title != null ? prior.title : title, prior.titleProp);
      }

      const schema = await loadSchema(state);
      if (schema.fail) return { ok: false, reason: schema.fail === 'network' ? 'network' : schema.fail };

      const startedAt = now();
      const sinceIso = new Date(startedAt - 60000).toISOString();
      // Written BEFORE the POST: if the worker dies between the POST and the answer, the next attempt knows to look first.
      await ledger.set(key, { state: 'pending', title: title, titleProp: schema.titleProp, at: startedAt });
      if (prior && prior.state === 'pending') {
        const adopted = await findExisting(state, schema.titleProp, title, new Date((prior.at || startedAt) - 60000).toISOString());
        if (adopted) return finish(state, key, adopted, title, schema.titleProp);
      }

      const properties = {};
      properties[schema.titleProp] = { title: [{ type: 'text', text: { content: title } }] };
      if (schema.dateProp && validIsoDate(p.dueIso)) properties[schema.dateProp] = { date: { start: p.dueIso } };
      const body = { parent: { database_id: state.auth.databaseId }, properties: properties };

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const r = await call('POST', '/pages', body, state);
        let ambiguous = false;
        if (r.error === 'not-connected') return { ok: false, reason: 'not-connected' };
        if (r.error === 'network') ambiguous = true;
        else if (r.res.ok) {
          const page = await json(r.res);
          if (!page || typeof page.id !== 'string' || !page.id) { ambiguous = true; }
          else return finish(state, key, page.id, title, schema.titleProp);
        } else if (r.res.status === 429) {
          const ra = Number(r.res.headers && r.res.headers.get && r.res.headers.get('retry-after'));
          if (attempt === MAX_ATTEMPTS) return { ok: false, reason: 'rate-limited' };
          await sleep(Number.isFinite(ra) && ra > 0 ? Math.min(ra, 10) * 1000 : 1000);
          continue; // a 429 was not processed: safe to resend as is
        } else if (r.res.status >= 500 || r.res.status === 409) ambiguous = true;
        else { await ledger.set(key, { state: 'failed', at: now() }); return { ok: false, reason: mapFailure(r.res.status) }; }

        if (ambiguous) {
          const found = await findExisting(state, schema.titleProp, title, sinceIso);
          if (found) return finish(state, key, found, title, schema.titleProp);
          if (attempt === MAX_ATTEMPTS) return { ok: false, reason: r.error === 'network' ? 'network' : 'http-' + (r.res ? r.res.status : 0) };
          await sleep(500 * attempt);
        }
      }
      return { ok: false, reason: 'unknown' };
    }

    // Re-read a close after a reload. Same rules as write()'s read-back.
    async function verify(ref) {
      const pageId = ref && (ref.pageId || ref.externalId);
      if (!pageId) return { ok: false, reason: 'bad-params' };
      const auth = await d.getAuth();
      if (!auth || !auth.token) return { ok: false, reason: 'not-connected' };
      const state = { auth: auth };
      const rec = ref.key ? await ledger.get(ref.key) : null;
      return finish(state, ref.key || ('verify:' + pageId), pageId, rec && rec.title != null ? rec.title : null, rec && rec.titleProp);
    }

    async function undo(ref) {
      const pageId = ref && (ref.pageId || ref.externalId);
      if (!pageId) return { ok: false, reason: 'bad-params' };
      const auth = await d.getAuth();
      if (!auth || !auth.token) return { ok: false, reason: 'not-connected' };
      const state = { auth: auth };
      const r = await call('PATCH', '/pages/' + encodeURIComponent(pageId), { archived: true }, state);
      if (r.error) return { ok: false, reason: r.error };
      if (!r.res.ok && r.res.status !== 404) return { ok: false, reason: mapFailure(r.res.status) };
      if (ref.key) await ledger.set(ref.key, { state: 'undone', pageId: pageId, at: now() });
      if (r.res.status === 404) return { ok: true, readBack: false, written: 'Already gone from Notion.' };
      const rb = await readBack(state, pageId, null, null);
      if (!rb.ok && !rb.gone) return { ok: false, reason: 'verify_failed' };
      if (rb.ok && !rb.archived) return { ok: false, reason: 'verify_failed' };
      return { ok: true, readBack: true, written: 'Archived in Notion.' };
    }

    return { write: write, verify: verify, undo: undo };
  }

  return { SYSTEM: SYSTEM, API: API, VERSION: VERSION, create: create, clipTitle: clipTitle };
})();

if (typeof module !== 'undefined') module.exports = { FlowNotionClose };
else if (typeof globalThis !== 'undefined') globalThis.FlowNotionClose = FlowNotionClose;
