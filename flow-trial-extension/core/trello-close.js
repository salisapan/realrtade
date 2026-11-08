// Trello: one card in the list the person chose is the close; reading that card back is the proof.
// docs/glance-ai/connectors/trello.md. Portable: no chrome.*, no DOM; the network, the token store and the ledger are injected
// (src/background.js passes real ones, test/trello-close-corpus.cjs passes a mock of the vendor).
//
// Contract:
//   write(params)  one POST /cards (into the chosen list), then GET /cards/{id}. Handled (ok:true + proof) ONLY when the GET returned the same
//                  card, with the name we wrote, still open (not archived), in the chosen list. Anything else is ok:false.
//   idempotent     a loop key maps to one card in a ledger. A second click or a retry re-reads that card; it never POSTs again. If a POST's
//                  outcome is unknown (5xx, timeout, 409, an id-less 200), the chosen list's open cards are read for the same name created
//                  since the attempt began (a Trello card id carries its creation time) and that card is adopted instead of creating a twin.
//   undo(ref)      refuses a card the person changed (name, description or due date differs from what Glance wrote → edited-by-person), else
//                  ARCHIVES it (PUT closed=true; a Trello archive is restorable, a delete is not), then GET: undone only when the card reads
//                  back archived. Glance never permanently deletes a card.
//   verify(ref)    the same read-back on a fresh instance (after a reload).
// The API key is the app's public Power-Up/app key; the token is the person's own and is sent in the Authorization header, never in a URL.
// Nothing in a title can change what is written: the title is one JSON string value; the list, the endpoint and the field names come only
// from stored ids and this file. Glance writes no description, label, member, checklist, attachment or comment.
const FlowTrelloClose = (() => {
  const API = 'https://api.trello.com/1';
  const SYSTEM = 'trello/card';
  const MAX_TITLE = 200;
  const MAX_ATTEMPTS = 3;
  const CARD_FIELDS = 'name,desc,idList,closed,due,shortUrl';

  function clipTitle(t) { return String(t == null ? '' : t).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE); }
  function validIsoDate(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)); }
  function idOk(g) { return typeof g === 'string' && /^[0-9a-f]{24}$/.test(g); }
  function keyOk(k) { return typeof k === 'string' && /^[0-9a-f]{32}$/.test(k); }
  // Noon UTC keeps the same calendar day in nearly every timezone.
  function dueFor(iso) { return validIsoDate(iso) ? iso + 'T12:00:00.000Z' : null; }
  function createdMs(id) { return idOk(id) ? parseInt(id.slice(0, 8), 16) * 1000 : NaN; }
  function sameDue(a, b) { if (!a && !b) return true; if (!a || !b) return false; return Math.abs(Date.parse(a) - Date.parse(b)) < 1000; }

  function create(deps) {
    const d = deps || {};
    const now = d.now || (() => Date.now());
    const sleep = d.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
    const timeoutMs = d.timeoutMs || 15000;
    const ledger = d.ledger;
    const buildProof = d.buildProof;

    async function call(method, path, body, state) {
      const auth = state.auth;
      let res;
      try {
        res = await Promise.race([
          d.fetch(API + path, {
            method: method,
            headers: { Authorization: 'OAuth oauth_consumer_key="' + auth.apiKey + '", oauth_token="' + auth.token + '"', Accept: 'application/json', 'Content-Type': 'application/json' },
            body: body === undefined ? undefined : JSON.stringify(body)
          }),
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
      const r = await call('GET', '/cards/' + encodeURIComponent(id) + '?fields=' + CARD_FIELDS, undefined, state);
      if (r.error) return { ok: false, reason: 'verify_failed' };
      if (r.res.status === 401) return { ok: false, reason: 'not-connected' };
      if (r.res.status === 404) return { ok: false, gone: true, reason: 'verify_failed' };
      if (!r.res.ok) return { ok: false, reason: 'verify_failed' };
      const c = await json(r.res);
      if (!c || typeof c !== 'object' || String(c.id || id) !== String(id) || typeof c.name !== 'string' || typeof c.closed !== 'boolean') return { ok: false, reason: 'verify_failed' };
      return { ok: true, card: c };
    }

    function proofFor(id, c) {
      if (typeof buildProof !== 'function') return null;
      return buildProof({ system: SYSTEM, externalId: id, url: typeof c.shortUrl === 'string' && /^https:\/\/trello\.com\/c\/[A-Za-z0-9]+/.test(c.shortUrl) ? c.shortUrl : undefined, fetchedBack: true, verifiedAt: new Date(now()).toISOString() });
    }

    // The chosen list's open cards for the same name created since `sinceMs`: adopt, do not duplicate.
    async function findExisting(state, name, sinceMs) {
      const r = await call('GET', '/lists/' + encodeURIComponent(state.auth.listId) + '/cards?fields=name,closed', undefined, state);
      if (r.error || !r.res.ok) return null;
      const rows = await json(r.res);
      if (!Array.isArray(rows)) return null;
      const hit = rows.find((x) => x && idOk(String(x.id)) && x.name === name && x.closed !== true && createdMs(String(x.id)) >= sinceMs);
      return hit ? String(hit.id) : null;
    }

    async function finish(state, key, id, name, due) {
      const rb = await readBack(state, id);
      const ref = { cardId: id, externalId: id, key: key };
      const unverified = async () => { await ledger.set(key, { state: 'created-unverified', id: id, title: name, due: due || null, at: now() }); return { ok: false, reason: 'verify_failed', ref: ref, proof: null }; };
      if (!rb.ok) {
        if (rb.reason === 'not-connected') return { ok: false, reason: 'not-connected', ref: ref, proof: null };
        return unverified();
      }
      const c = rb.card;
      if (c.closed || String(c.idList) !== String(state.auth.listId) || c.name !== name) return unverified();
      const proof = proofFor(id, c);
      if (!proof) return { ok: false, reason: 'proof_pending', ref: ref, proof: null };
      await ledger.set(key, { state: 'verified', id: id, title: name, due: due || null, at: now() });
      return { ok: true, where: 'Trello', ref: ref, proof: proof, url: proof.url || null };
    }

    // params: { key, title, dueIso? } — key is the loop's own id; it is never sent to Trello.
    async function write(params) {
      const p = params || {};
      const key = String(p.key || '');
      const title = clipTitle(p.title);
      if (!key || !title) return { ok: false, reason: 'bad-params' };
      const auth = await d.getAuth();
      if (!auth || !auth.token || !keyOk(String(auth.apiKey || '')) || !idOk(String(auth.listId || ''))) return { ok: false, reason: 'not-connected' };
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

      const body = { idList: String(auth.listId), name: title, pos: 'bottom' };
      if (due) body.due = due;

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const r = await call('POST', '/cards', body, state);
        let ambiguous = false;
        if (r.error === 'network') ambiguous = true;
        else if (r.res.ok) {
          const c = await json(r.res);
          if (!c || !idOk(String(c.id))) ambiguous = true;
          else return finish(state, key, String(c.id), title, due);
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
      const id = ref && (ref.cardId || ref.externalId);
      if (!id || !idOk(String(id))) return { ok: false, reason: 'bad-params' };
      const auth = await d.getAuth();
      if (!auth || !auth.token || !keyOk(String(auth.apiKey || ''))) return { ok: false, reason: 'not-connected' };
      const state = { auth: auth };
      const rec = ref.key ? await ledger.get(ref.key) : null;
      if (!rec || rec.title == null) return { ok: false, reason: 'no-record' };
      return finish(state, ref.key, String(id), rec.title, rec.due || null);
    }

    async function undo(ref) {
      const id = ref && (ref.cardId || ref.externalId);
      if (!id || !idOk(String(id)) || !ref.key) return { ok: false, reason: 'bad-params' };
      const auth = await d.getAuth();
      if (!auth || !auth.token || !keyOk(String(auth.apiKey || ''))) return { ok: false, reason: 'not-connected' };
      const state = { auth: auth };
      const rec = await ledger.get(ref.key);
      if (rec && rec.state === 'undone') return { ok: true, readBack: false, written: 'Already archived in Trello.' };
      if (!rec || rec.title == null) return { ok: false, reason: 'no-record' };
      const before = await readBack(state, String(id));
      if (before.gone) { await ledger.set(ref.key, { state: 'undone', id: String(id), at: now() }); return { ok: true, readBack: false, written: 'Already gone from Trello.' }; }
      if (!before.ok) return { ok: false, reason: before.reason === 'not-connected' ? 'not-connected' : 'verify_failed' };
      const c = before.card;
      if (c.closed === true) { await ledger.set(ref.key, { state: 'undone', id: String(id), at: now() }); return { ok: true, readBack: true, written: 'Already archived in Trello.' }; }
      // Never archive a card the person changed: Glance did not make that version.
      if (c.name !== rec.title || (typeof c.desc === 'string' && c.desc.length > 0) || !sameDue(c.due, rec.due)) return { ok: false, reason: 'edited-by-person' };
      const r = await call('PUT', '/cards/' + encodeURIComponent(id), { closed: true }, state);
      if (r.error) return { ok: false, reason: r.error };
      if (r.res.status === 401) return { ok: false, reason: 'not-connected' };
      if (!r.res.ok && r.res.status !== 404) return { ok: false, reason: mapFailure(r.res.status) };
      const after = await readBack(state, String(id));
      if (after.ok && after.card.closed === true) { await ledger.set(ref.key, { state: 'undone', id: String(id), at: now() }); return { ok: true, readBack: true, written: 'Archived in Trello.' }; }
      if (after.gone) { await ledger.set(ref.key, { state: 'undone', id: String(id), at: now() }); return { ok: true, readBack: true, written: 'Removed from Trello.' }; }
      return { ok: false, reason: 'verify_failed' };
    }

    return { write: write, verify: verify, undo: undo };
  }

  return { SYSTEM: SYSTEM, API: API, create: create, clipTitle: clipTitle };
})();

if (typeof module !== 'undefined') module.exports = { FlowTrelloClose };
else if (typeof globalThis !== 'undefined') globalThis.FlowTrelloClose = FlowTrelloClose;
