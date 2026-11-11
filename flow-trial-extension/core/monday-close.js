// Monday: one item on the board the person chose is the close; reading that item back is the proof.
// docs/glance-ai/connectors/monday.md. Portable: no chrome.*, no DOM; the network, the token store and the ledger are injected
// (src/background.js passes real ones, test/monday-close-corpus.cjs passes a mock of the vendor).
//
// Contract:
//   write(params)  one create_item mutation (into the chosen board), then a read of that item by id. Handled (ok:true + proof) ONLY when the read
//                  returned the same item, with the name we wrote, on the chosen board, still active (not archived or deleted).
//   idempotent     a loop key maps to one item in a ledger. A second click or a retry re-reads that item; it never creates another. If a create's
//                  outcome is unknown (5xx, timeout, a GraphQL error after the fact, an id-less answer), the board's newest items are read for the
//                  same name created since the attempt began and that item is adopted instead of creating a twin.
//   undo(ref)      refuses an item the person renamed (name differs from what Glance wrote → edited-by-person), else ARCHIVES it (archive_item: Monday keeps an
//                  archived item and the person can restore it; Glance never deletes), then reads it: undone only when it reads back archived or deleted.
//   verify(ref)    the same read-back on a fresh instance (after a reload).
// Monday is GraphQL: every value goes in `variables`, never into the query text, so a name cannot change the query. The board id and item id
// come only from stored values checked against a strict shape (digits). Glance writes only the item's name: no column, no update, no file, no subscriber.
// Monday answers HTTP 200 with an `errors` array on most failures; both that and a plain HTTP status are mapped.
const FlowMondayClose = (() => {
  const API = 'https://api.monday.com/v2';
  const API_VERSION = '2024-10';
  const SYSTEM = 'monday/item';
  const MAX_TITLE = 200;
  const MAX_ATTEMPTS = 3;

  const Q_CREATE = 'mutation($board: ID!, $name: String!) { create_item(board_id: $board, item_name: $name) { id } }';
  const Q_READ = 'query($ids: [ID!]) { items(ids: $ids) { id name state board { id } } }';
  const Q_RECENT = 'query($board: [ID!]) { boards(ids: $board) { items_page(limit: 100, query_params: { order_by: [{ column_id: "__creation_log__", direction: desc }] }) { items { id name state created_at } } } }';
  const Q_ARCHIVE = 'mutation($id: ID!) { archive_item(item_id: $id) { id } }';

  function clipTitle(t) { return String(t == null ? '' : t).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE); }
  function idOk(g) { return typeof g === 'string' && /^\d{6,19}$/.test(g); }

  function create(deps) {
    const d = deps || {};
    const now = d.now || (() => Date.now());
    const sleep = d.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
    const timeoutMs = d.timeoutMs || 15000;
    const ledger = d.ledger;
    const buildProof = d.buildProof;

    // One GraphQL call. Returns { data } | { error }. A rate limit waits and retries (a request that was refused for rate was not processed).
    async function gql(query, variables, state) {
      let last = { error: 'network' };
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        let res;
        try {
          res = await Promise.race([
            d.fetch(API, { method: 'POST', headers: { Authorization: state.auth.token, 'Content-Type': 'application/json', 'API-Version': API_VERSION }, body: JSON.stringify({ query: query, variables: variables }) }),
            new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs))
          ]);
        } catch (e) { return { error: 'network', ambiguous: true }; }
        if (res.status === 401) return { error: 'not-connected' };
        if (res.status === 403) return { error: 'scope-missing' };
        if (res.status === 429) {
          const ra = Number(res.headers && res.headers.get && res.headers.get('retry-after'));
          last = { error: 'rate-limited' };
          if (attempt < MAX_ATTEMPTS) await sleep(Number.isFinite(ra) && ra > 0 ? Math.min(ra, 10) * 1000 : 1000);
          continue;
        }
        if (res.status >= 500) return { error: 'http-' + res.status, ambiguous: true };
        let body = null;
        try { body = await res.json(); } catch (e) { body = null; }
        if (!res.ok) return { error: 'http-' + res.status };
        if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'verify_failed', ambiguous: true };
        if (Array.isArray(body.errors) && body.errors.length) {
          const e = body.errors[0] || {};
          const code = String((e.extensions && e.extensions.code) || '') + ' ' + String(e.message || '');
          if (/Unauthori[sz]ed|not authenticated|invalid.?token/i.test(code)) return { error: 'not-connected' };
          if (/RATE_LIMIT|ComplexityException|rate limit/i.test(code)) { last = { error: 'rate-limited' }; if (attempt < MAX_ATTEMPTS) await sleep(1000); continue; }
          if (/missing_permission|Permission|scope|forbidden/i.test(code)) return { error: 'scope-missing' };
          if (/InvalidBoardId|ResourceNotFound|board.*(not found|does not exist)/i.test(code)) return { error: 'board-not-found' };
          return { error: 'monday-error', ambiguous: true };
        }
        if (typeof body.error_code === 'string' || typeof body.error_message === 'string') {
          if (/Unauthori[sz]ed|authenticat/i.test(String(body.error_code) + String(body.error_message))) return { error: 'not-connected' };
          return { error: 'monday-error', ambiguous: true };
        }
        if (!body.data || typeof body.data !== 'object') return { error: 'verify_failed', ambiguous: true };
        return { data: body.data };
      }
      return last;
    }

    async function readBack(state, id) {
      const r = await gql(Q_READ, { ids: [id] }, state);
      if (r.error === 'not-connected' || r.error === 'scope-missing') return { ok: false, reason: r.error };
      if (r.error) return { ok: false, reason: 'verify_failed' };
      const rows = r.data.items;
      if (!Array.isArray(rows)) return { ok: false, reason: 'verify_failed' };
      if (rows.length === 0) return { ok: false, gone: true, reason: 'verify_failed' };
      const it = rows[0];
      if (!it || String(it.id) !== String(id) || typeof it.name !== 'string' || typeof it.state !== 'string') return { ok: false, reason: 'verify_failed' };
      return { ok: true, item: it };
    }

    function proofFor(id) {
      if (typeof buildProof !== 'function') return null;
      return buildProof({ system: SYSTEM, externalId: id, fetchedBack: true, verifiedAt: new Date(now()).toISOString() });
    }

    // The board's newest items for the same name created since `sinceMs`: adopt, do not duplicate.
    async function findExisting(state, name, sinceMs) {
      const r = await gql(Q_RECENT, { board: [state.auth.boardId] }, state);
      if (r.error) return null;
      const boards = r.data.boards;
      const rows = Array.isArray(boards) && boards[0] && boards[0].items_page && Array.isArray(boards[0].items_page.items) ? boards[0].items_page.items : null;
      if (!rows) return null;
      const hit = rows.find((x) => x && idOk(String(x.id)) && x.name === name && x.state === 'active' && Date.parse(x.created_at) >= sinceMs);
      return hit ? String(hit.id) : null;
    }

    async function finish(state, key, id, name) {
      const rb = await readBack(state, id);
      const ref = { itemId: id, externalId: id, key: key };
      const unverified = async () => { await ledger.set(key, { state: 'created-unverified', id: id, title: name, at: now() }); return { ok: false, reason: 'verify_failed', ref: ref, proof: null }; };
      if (!rb.ok) {
        if (rb.reason === 'not-connected' || rb.reason === 'scope-missing') return { ok: false, reason: rb.reason, ref: ref, proof: null };
        return unverified();
      }
      const it = rb.item;
      const boardId = it.board && it.board.id != null ? String(it.board.id) : '';
      if (it.state !== 'active' || boardId !== String(state.auth.boardId) || it.name !== name) return unverified();
      const proof = proofFor(id);
      if (!proof) return { ok: false, reason: 'proof_pending', ref: ref, proof: null };
      await ledger.set(key, { state: 'verified', id: id, title: name, at: now() });
      return { ok: true, where: 'Monday', ref: ref, proof: proof, url: null };
    }

    // params: { key, title } — key is the loop's own id; it is never sent to Monday.
    async function write(params) {
      const p = params || {};
      const key = String(p.key || '');
      const title = clipTitle(p.title);
      if (!key || !title) return { ok: false, reason: 'bad-params' };
      const auth = await d.getAuth();
      if (!auth || !auth.token || !idOk(String(auth.boardId || ''))) return { ok: false, reason: 'not-connected' };
      const state = { auth: auth };

      const prior = await ledger.get(key);
      if (prior && prior.id && prior.state !== 'undone') return finish(state, key, prior.id, prior.title != null ? prior.title : title);

      const startedAt = now();
      await ledger.set(key, { state: 'pending', title: title, at: startedAt });
      if (prior && prior.state === 'pending') {
        const adopted = await findExisting(state, title, (prior.at || startedAt) - 60000);
        if (adopted) return finish(state, key, adopted, title);
      }

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const r = await gql(Q_CREATE, { board: String(auth.boardId), name: title }, state);
        if (r.data) {
          const created = r.data.create_item;
          if (created && idOk(String(created.id))) return finish(state, key, String(created.id), title);
          r.ambiguous = true;
        } else if (r.error === 'not-connected' || r.error === 'scope-missing' || r.error === 'board-not-found') {
          if (r.error !== 'not-connected') await ledger.set(key, { state: 'failed', at: now() });
          return { ok: false, reason: r.error };
        } else if (r.error === 'rate-limited') {
          return { ok: false, reason: 'rate-limited' }; // gql already waited and retried: still refused, so nothing was created
        }
        if (r.ambiguous || r.data) {
          const found = await findExisting(state, title, startedAt - 60000);
          if (found) return finish(state, key, found, title);
          if (attempt === MAX_ATTEMPTS) return { ok: false, reason: r.error === 'network' ? 'network' : (r.error || 'unknown') };
          await sleep(500 * attempt);
          continue;
        }
        await ledger.set(key, { state: 'failed', at: now() });
        return { ok: false, reason: r.error || 'unknown' };
      }
      return { ok: false, reason: 'unknown' };
    }

    async function verify(ref) {
      const id = ref && (ref.itemId || ref.externalId);
      if (!id || !idOk(String(id))) return { ok: false, reason: 'bad-params' };
      const auth = await d.getAuth();
      if (!auth || !auth.token || !idOk(String(auth.boardId || ''))) return { ok: false, reason: 'not-connected' };
      const state = { auth: auth };
      const rec = ref.key ? await ledger.get(ref.key) : null;
      if (!rec || rec.title == null) return { ok: false, reason: 'no-record' };
      return finish(state, ref.key, String(id), rec.title);
    }

    async function undo(ref) {
      const id = ref && (ref.itemId || ref.externalId);
      if (!id || !idOk(String(id)) || !ref.key) return { ok: false, reason: 'bad-params' };
      const auth = await d.getAuth();
      if (!auth || !auth.token || !idOk(String(auth.boardId || ''))) return { ok: false, reason: 'not-connected' };
      const state = { auth: auth };
      const rec = await ledger.get(ref.key);
      if (rec && rec.state === 'undone') return { ok: true, readBack: false, written: 'Already archived in Monday.' };
      if (!rec || rec.title == null) return { ok: false, reason: 'no-record' };
      const before = await readBack(state, String(id));
      if (before.gone) { await ledger.set(ref.key, { state: 'undone', id: String(id), at: now() }); return { ok: true, readBack: false, written: 'Already gone from Monday.' }; }
      if (!before.ok) return { ok: false, reason: before.reason === 'not-connected' || before.reason === 'scope-missing' ? before.reason : 'verify_failed' };
      if (before.item.state !== 'active') { await ledger.set(ref.key, { state: 'undone', id: String(id), at: now() }); return { ok: true, readBack: true, written: 'Already archived in Monday.' }; }
      // Never archive an item the person renamed: Glance did not make that version.
      if (before.item.name !== rec.title) return { ok: false, reason: 'edited-by-person' };
      const r = await gql(Q_ARCHIVE, { id: String(id) }, state);
      if (r.error && r.error !== 'monday-error') return { ok: false, reason: r.error };
      const after = await readBack(state, String(id));
      if ((after.ok && after.item.state !== 'active') || after.gone) { await ledger.set(ref.key, { state: 'undone', id: String(id), at: now() }); return { ok: true, readBack: true, written: 'Archived in Monday.' }; }
      return { ok: false, reason: 'verify_failed' };
    }

    return { write: write, verify: verify, undo: undo };
  }

  return { SYSTEM: SYSTEM, API: API, create: create, clipTitle: clipTitle };
})();

if (typeof module !== 'undefined') module.exports = { FlowMondayClose };
else if (typeof globalThis !== 'undefined') globalThis.FlowMondayClose = FlowMondayClose;
