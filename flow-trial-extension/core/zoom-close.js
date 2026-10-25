// Zoom: one scheduled meeting on the person's own account is the close; reading that meeting back is the proof.
// docs/glance-ai/connectors/zoom.md. Portable: no chrome.*, no DOM; the network, the token store and the ledger are injected
// (src/background.js passes real ones, test/zoom-close-corpus.cjs passes a mock of the vendor).
//
// Contract:
//   write(params)   one POST /users/me/meetings (a scheduled meeting, no invitees, nobody is emailed), then GET /meetings/{id}.
//                   Handled (ok:true + proof) ONLY when the GET returned the same meeting: same id, the topic and start we wrote,
//                   and a join link on a zoom.us host. Anything else is ok:false.
//   idempotent      a loop key maps to one meeting in a ledger. A second click or a retry re-reads that meeting; it never POSTs again.
//                   If a POST's outcome is unknown (5xx, timeout, 409, an id-less 2xx), the person's upcoming meetings are read for the
//                   same topic and start created since the attempt began and that meeting is adopted instead of creating a twin.
//   undo(ref)       refuses a meeting the person changed (topic or start differs from what Glance wrote), else DELETE /meetings/{id},
//                   then GET: the close is undone only when Zoom answers 404 for it (read back).
//   verify(ref)     the same read-back on a fresh instance (after a reload).
// The host start link (start_url) and the passcode are never read into a result, a proof, a ledger or a log: only the join link is a
// proof url. Nothing in a topic can change what is written: the topic is one JSON string value; the endpoint and the field names come
// only from stored ids and this file.
const FlowZoomClose = (() => {
  const API = 'https://api.zoom.us/v2';
  const SYSTEM = 'zoom/meeting';
  const MAX_TOPIC = 200;
  const MAX_ATTEMPTS = 3;
  const MIN_DURATION = 15;
  const MAX_DURATION = 480;
  const DEFAULT_DURATION = 30;
  const START_SLACK_MS = 60 * 1000;

  function clipTopic(t) { return String(t == null ? '' : t).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_TOPIC); }
  function idOk(g) { return typeof g === 'string' && /^\d{6,16}$/.test(g); }
  // A start we can write: an ISO instant with Z or an offset. Returns epoch ms or null. A start that has no zone is refused, never guessed.
  function startMs(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(s)) return null;
    const ms = Date.parse(s);
    return Number.isNaN(ms) ? null : ms;
  }
  function utcIso(ms) { return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z'); }
  function joinOk(u) { try { const x = new URL(u); return x.protocol === 'https:' && /(^|\.)zoom\.us$/.test(x.hostname) && /^\/j\/\d+/.test(x.pathname); } catch (e) { return false; } }

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

    function mapFailure(status) {
      if (status === 401) return 'not-connected';
      if (status === 403) return 'scope-missing';
      if (status === 400 || status === 422) return 'bad-params';
      if (status === 404) return 'not-found';
      if (status === 429) return 'rate-limited';
      return 'http-' + status;
    }

    // The one read of a meeting. Only the fields the proof needs are kept (never start_url, password, or the invitee list).
    async function readBack(state, id) {
      const r = await call('GET', '/meetings/' + encodeURIComponent(id), undefined, state);
      if (r.error) return { ok: false, reason: r.error === 'not-connected' ? 'not-connected' : 'verify_failed' };
      if (r.res.status === 404) return { ok: false, gone: true, reason: 'verify_failed' };
      if (!r.res.ok) return { ok: false, reason: 'verify_failed' };
      const m = await json(r.res);
      if (!m || String(m.id) !== String(id)) return { ok: false, reason: 'verify_failed' };
      return { ok: true, meeting: { id: String(m.id), topic: typeof m.topic === 'string' ? m.topic : '', startMs: Date.parse(m.start_time), joinUrl: typeof m.join_url === 'string' ? m.join_url : '' } };
    }

    function sameStart(a, b) { return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < START_SLACK_MS; }

    function proofFor(m) {
      if (typeof buildProof !== 'function') return null;
      return buildProof({ system: SYSTEM, externalId: m.id, url: m.joinUrl, fetchedBack: true, verifiedAt: new Date(now()).toISOString() });
    }

    // The person's upcoming meetings (one bounded page) for the same topic and start created since `sinceMs`: adopt, do not duplicate.
    async function findExisting(state, topic, atMs, sinceMs) {
      const r = await call('GET', '/users/me/meetings?type=upcoming&page_size=100', undefined, state);
      if (r.error || !r.res.ok) return null;
      const body = await json(r.res);
      const rows = body && Array.isArray(body.meetings) ? body.meetings : [];
      const hit = rows.find((x) => x && idOk(String(x.id)) && x.topic === topic && sameStart(Date.parse(x.start_time), atMs) && (!x.created_at || Date.parse(x.created_at) >= sinceMs));
      return hit ? String(hit.id) : null;
    }

    async function finish(state, key, id, topic, atMs) {
      const rb = await readBack(state, id);
      const ref = { meetingId: id, externalId: id, key: key };
      const unverified = async () => { await ledger.set(key, { state: 'created-unverified', id: id, topic: topic, startMs: atMs, at: now() }); return { ok: false, reason: 'verify_failed', ref: ref, proof: null }; };
      if (!rb.ok) {
        if (rb.reason === 'not-connected') return { ok: false, reason: 'not-connected', ref: ref, proof: null };
        return unverified();
      }
      const m = rb.meeting;
      if (m.topic !== topic || !sameStart(m.startMs, atMs) || !joinOk(m.joinUrl)) return unverified();
      const proof = proofFor(m);
      if (!proof) return { ok: false, reason: 'proof_pending', ref: ref, proof: null };
      await ledger.set(key, { state: 'verified', id: id, topic: topic, startMs: atMs, at: now() });
      return { ok: true, where: 'Zoom', ref: ref, proof: proof, url: m.joinUrl };
    }

    // params: { key, topic, startIso, durationMin? } — key is the loop's own id; it is never sent to Zoom.
    async function write(params) {
      const p = params || {};
      const key = String(p.key || '');
      const topic = clipTopic(p.topic);
      const atMs = startMs(p.startIso);
      if (!key || !topic || atMs === null) return { ok: false, reason: 'bad-params' };
      const t0 = now();
      if (atMs < t0 - START_SLACK_MS) return { ok: false, reason: 'start-in-past' };
      let duration = DEFAULT_DURATION;
      if (p.durationMin !== undefined && p.durationMin !== null) {
        duration = Number(p.durationMin);
        if (!Number.isInteger(duration) || duration < MIN_DURATION || duration > MAX_DURATION) return { ok: false, reason: 'bad-params' };
      }
      const auth = await d.getAuth();
      if (!auth || !auth.token) return { ok: false, reason: 'not-connected' };
      const state = { auth: auth };

      const prior = await ledger.get(key);
      if (prior && prior.id && prior.state !== 'undone') return finish(state, key, prior.id, prior.topic != null ? prior.topic : topic, prior.startMs != null ? prior.startMs : atMs);

      const startedAt = now();
      await ledger.set(key, { state: 'pending', topic: topic, startMs: atMs, at: startedAt });
      if (prior && prior.state === 'pending') {
        const adopted = await findExisting(state, topic, atMs, (prior.at || startedAt) - 60000);
        if (adopted) return finish(state, key, adopted, topic, atMs);
      }

      // No invitees, no registration, a waiting room, and the host must be there first: creating it contacts nobody.
      const body = { topic: topic, type: 2, start_time: utcIso(atMs), timezone: 'UTC', duration: duration, settings: { join_before_host: false, waiting_room: true, host_video: false, participant_video: false } };

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const r = await call('POST', '/users/me/meetings', body, state);
        let ambiguous = false;
        if (r.error === 'not-connected') return { ok: false, reason: 'not-connected' };
        if (r.error === 'network') ambiguous = true;
        else if (r.res.ok) {
          const m = await json(r.res);
          if (!m || !idOk(String(m.id))) ambiguous = true;
          else return finish(state, key, String(m.id), topic, atMs);
        } else if (r.res.status === 429) {
          const ra = Number(r.res.headers && r.res.headers.get && r.res.headers.get('retry-after'));
          if (attempt === MAX_ATTEMPTS) return { ok: false, reason: 'rate-limited' };
          await sleep(Number.isFinite(ra) && ra > 0 ? Math.min(ra, 10) * 1000 : 1000);
          continue; // not processed: safe to resend
        } else if (r.res.status >= 500 || r.res.status === 409) ambiguous = true;
        else { await ledger.set(key, { state: 'failed', at: now() }); return { ok: false, reason: mapFailure(r.res.status) }; }

        if (ambiguous) {
          const found = await findExisting(state, topic, atMs, startedAt - 60000);
          if (found) return finish(state, key, found, topic, atMs);
          if (attempt === MAX_ATTEMPTS) return { ok: false, reason: r.error === 'network' ? 'network' : 'http-' + (r.res ? r.res.status : 0) };
          await sleep(500 * attempt);
        }
      }
      return { ok: false, reason: 'unknown' };
    }

    async function verify(ref) {
      const id = ref && (ref.meetingId || ref.externalId);
      if (!id || !idOk(String(id))) return { ok: false, reason: 'bad-params' };
      const auth = await d.getAuth();
      if (!auth || !auth.token) return { ok: false, reason: 'not-connected' };
      const state = { auth: auth };
      const rec = ref.key ? await ledger.get(ref.key) : null;
      if (!rec || rec.topic == null || rec.startMs == null) return { ok: false, reason: 'no-record' };
      return finish(state, ref.key, String(id), rec.topic, rec.startMs);
    }

    async function undo(ref) {
      const id = ref && (ref.meetingId || ref.externalId);
      if (!id || !idOk(String(id)) || !ref.key) return { ok: false, reason: 'bad-params' };
      const auth = await d.getAuth();
      if (!auth || !auth.token) return { ok: false, reason: 'not-connected' };
      const state = { auth: auth };
      const rec = await ledger.get(ref.key);
      if (rec && rec.state === 'undone') return { ok: true, readBack: false, written: 'Already removed from Zoom.' };
      if (!rec || rec.topic == null || rec.startMs == null) return { ok: false, reason: 'no-record' };
      // Never remove a meeting the person has changed: Glance did not make that version.
      const before = await readBack(state, String(id));
      if (before.gone) { await ledger.set(ref.key, { state: 'undone', id: String(id), at: now() }); return { ok: true, readBack: false, written: 'Already gone from Zoom.' }; }
      if (!before.ok) return { ok: false, reason: before.reason === 'not-connected' ? 'not-connected' : 'verify_failed' };
      if (before.meeting.topic !== rec.topic || !sameStart(before.meeting.startMs, rec.startMs)) return { ok: false, reason: 'edited-by-person' };
      const r = await call('DELETE', '/meetings/' + encodeURIComponent(id) + '?schedule_for_reminder=false', undefined, state);
      if (r.error) return { ok: false, reason: r.error };
      if (!r.res.ok && r.res.status !== 404) return { ok: false, reason: mapFailure(r.res.status) };
      const after = await readBack(state, String(id));
      if (after.gone) { await ledger.set(ref.key, { state: 'undone', id: String(id), at: now() }); return { ok: true, readBack: true, written: 'Removed from Zoom.' }; }
      return { ok: false, reason: 'verify_failed' };
    }

    return { write: write, verify: verify, undo: undo };
  }

  return { SYSTEM: SYSTEM, API: API, create: create, clipTopic: clipTopic };
})();

if (typeof module !== 'undefined') module.exports = { FlowZoomClose };
else if (typeof globalThis !== 'undefined') globalThis.FlowZoomClose = FlowZoomClose;
