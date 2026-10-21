// DocuSign: the close is "the envelope the person is waiting on is COMPLETED", and reading that envelope back is the proof.
// docs/glance-ai/connectors/docusign.md. Portable: no chrome.*, no DOM; the network, the token store and the ledger are injected
// (src/background.js passes real ones, test/docusign-close-corpus.cjs passes a mock of the vendor).
//
// THIS CONNECTOR IS READ-ONLY. It never creates, sends, corrects, voids or downloads anything: a signature request is a message to
// another person, and Glance never sends on the person's behalf. The person links one envelope they already sent to one loop; Glance
// reads that envelope's status. Contract:
//   check(link)    one GET of the envelope. Closed (ok:true, closed:true + proof) ONLY when the GET returned the same envelope with status
//                  "completed". "sent", "delivered", "signed" are waiting; "declined" and "voided" are shown as such and never close
//                  the loop; an unreadable or changed answer is ok:false and never closed.
//   one envelope   a loop key is bound to the first envelope linked to it; another envelope for the same loop is refused until the
//                  person releases the first (one object per loop).
//   verify(ref)    the same read on a fresh instance (after a reload). A cached "completed" is never trusted without the read.
//   release(key)   the person's deliberate release: the loop is no longer watched. Nothing in DocuSign changes (there is nothing to undo
//                  there: Glance wrote nothing).
// Every id is checked against a strict shape before it enters a URL; the API host must be a *.docusign.net host.
const FlowDocusignClose = (() => {
  const SYSTEM = 'docusign/envelope';
  const MAX_ATTEMPTS = 3;
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const WAITING = { created: 1, sent: 1, delivered: 1, signed: 1 };

  function uuidOk(u) { return typeof u === 'string' && UUID.test(u); }
  function baseOk(b) { return typeof b === 'string' && /^https:\/\/[a-z0-9-]+\.docusign\.net$/.test(b); }
  function authOk(a) { return !!(a && a.token && uuidOk(a.accountId) && baseOk(a.baseUri)); }

  // A bare envelope id, or a link on a docusign.com / docusign.net host that carries one (in the path or in an envelopeId parameter).
  function parseEnvelopeId(input) {
    const t = String(input == null ? '' : input).trim();
    if (uuidOk(t.toLowerCase())) return t.toLowerCase();
    let u = null;
    try { u = new URL(t); } catch (e) { return null; }
    if (u.protocol !== 'https:' || !/(^|\.)docusign\.(com|net)$/.test(u.hostname)) return null;
    const q = u.searchParams.get('envelopeId') || u.searchParams.get('envelope_id') || u.searchParams.get('EnvelopeId');
    if (q && uuidOk(q.toLowerCase())) return q.toLowerCase();
    const m = u.pathname.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
    return m ? m[0].toLowerCase() : null;
  }

  function create(deps) {
    const d = deps || {};
    const now = d.now || (() => Date.now());
    const sleep = d.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
    const timeoutMs = d.timeoutMs || 15000;
    const ledger = d.ledger;
    const buildProof = d.buildProof;

    // One authorised GET. Handles the timeout, one token refresh on 401, and the wait a rate limit asks for.
    async function get(path, state) {
      for (let pass = 0; pass < 2; pass++) {
        const auth = state.auth;
        let res;
        try {
          res = await Promise.race([
            d.fetch(auth.baseUri + '/restapi/v2.1/accounts/' + auth.accountId + path, { method: 'GET', headers: { Authorization: 'Bearer ' + auth.token, Accept: 'application/json' } }),
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

    function waitMs(res) {
      const h = (k) => (res.headers && res.headers.get && res.headers.get(k));
      const ra = Number(h('retry-after'));
      if (Number.isFinite(ra) && ra > 0) return Math.min(ra, 10) * 1000;
      const reset = Number(h('x-ratelimit-reset')); // epoch seconds (vendor behaviour unverified)
      if (Number.isFinite(reset) && reset > 0) return Math.max(1000, Math.min(reset * 1000 - now(), 10000));
      return 1000;
    }

    async function body(res) { try { return await res.json(); } catch (e) { return null; } }

    // The read. Returns { error } | { status, completed, closed } with the reason when it is not a clean read.
    async function readEnvelope(envelopeId, state) {
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const r = await get('/envelopes/' + envelopeId, state);
        if (r.error === 'not-connected') return { ok: false, reason: 'not-connected' };
        let retry = false; let hold = 500 * attempt;
        if (r.error === 'network') retry = true;
        else if (r.res.status === 429) { retry = true; hold = waitMs(r.res); if (attempt === MAX_ATTEMPTS) return { ok: false, reason: 'rate-limited' }; }
        else if (r.res.status >= 500) retry = true;
        else if (r.res.status === 401) return { ok: false, reason: 'not-connected' };
        else if (r.res.status === 403) return { ok: false, reason: 'no-access' };
        else if (r.res.status === 404) return { ok: false, reason: 'envelope-not-found' };
        else if (!r.res.ok) {
          const b = await body(r.res);
          if (b && /DOES_NOT_EXIST|NOT_FOUND/i.test(String(b.errorCode || ''))) return { ok: false, reason: 'envelope-not-found' };
          return { ok: false, reason: 'rejected' };
        } else {
          const b = await body(r.res);
          if (!b || typeof b !== 'object' || typeof b.status !== 'string' || typeof b.envelopeId !== 'string' || b.envelopeId.toLowerCase() !== envelopeId) return { ok: false, reason: 'verify_failed' };
          const status = b.status.toLowerCase();
          return { ok: true, status: status, completedAt: typeof b.completedDateTime === 'string' ? b.completedDateTime : null };
        }
        if (retry) {
          if (attempt === MAX_ATTEMPTS) return { ok: false, reason: r.error === 'network' ? 'network' : 'http-5xx' };
          await sleep(hold);
        }
      }
      return { ok: false, reason: 'unknown' };
    }

    function proofFor(envelopeId) {
      if (typeof buildProof !== 'function') return null;
      return buildProof({ system: SYSTEM, externalId: envelopeId, fetchedBack: true, verifiedAt: new Date(now()).toISOString() });
    }

    async function run(key, envelopeId, state) {
      const rd = await readEnvelope(envelopeId, state);
      const ref = { envelopeId: envelopeId, externalId: envelopeId, key: key };
      if (!rd.ok) return { ok: false, closed: false, reason: rd.reason, ref: ref, proof: null };
      if (rd.status === 'completed') {
        const proof = proofFor(envelopeId);
        if (!proof) return { ok: false, closed: false, reason: 'proof_pending', ref: ref, proof: null };
        await ledger.set(key, { state: 'completed', envelopeId: envelopeId, at: now() });
        return { ok: true, closed: true, status: 'completed', where: 'DocuSign', ref: ref, proof: proof };
      }
      const label = rd.status === 'declined' ? 'declined' : rd.status === 'voided' ? 'voided' : (WAITING[rd.status] ? 'waiting' : 'unknown-status');
      await ledger.set(key, { state: 'watching', envelopeId: envelopeId, lastStatus: rd.status, at: now() });
      return { ok: true, closed: false, status: rd.status, label: label, where: 'DocuSign', ref: ref, proof: null };
    }

    // link: { key, envelope } where envelope is an id or a DocuSign link; key is the loop's own id (never sent to DocuSign).
    async function check(link) {
      const l = link || {};
      const key = String(l.key || '');
      const envelopeId = parseEnvelopeId(l.envelope);
      if (!key || !envelopeId) return { ok: false, closed: false, reason: 'bad-params' };
      const auth = await d.getAuth();
      if (!authOk(auth)) return { ok: false, closed: false, reason: 'not-connected' };
      const prior = await ledger.get(key);
      if (prior && prior.envelopeId && prior.envelopeId !== envelopeId && prior.state !== 'released') return { ok: false, closed: false, reason: 'already-linked' };
      return run(key, envelopeId, { auth: auth });
    }

    async function verify(ref) {
      const envelopeId = ref && parseEnvelopeId(ref.envelopeId || ref.externalId);
      if (!envelopeId) return { ok: false, closed: false, reason: 'bad-params' };
      const auth = await d.getAuth();
      if (!authOk(auth)) return { ok: false, closed: false, reason: 'not-connected' };
      return run(ref.key || ('verify:' + envelopeId), envelopeId, { auth: auth });
    }

    async function release(key) {
      const k = String(key || '');
      if (!k) return { ok: false, reason: 'bad-params' };
      const prior = await ledger.get(k);
      if (!prior) return { ok: true, written: 'Nothing was being watched.' };
      await ledger.set(k, { state: 'released', at: now() });
      return { ok: true, written: 'Stopped watching. Nothing in DocuSign changed.' };
    }

    return { check: check, verify: verify, release: release };
  }

  return { SYSTEM: SYSTEM, create: create, parseEnvelopeId: parseEnvelopeId, uuidOk: uuidOk };
})();

if (typeof module !== 'undefined') module.exports = { FlowDocusignClose };
else if (typeof globalThis !== 'undefined') globalThis.FlowDocusignClose = FlowDocusignClose;
