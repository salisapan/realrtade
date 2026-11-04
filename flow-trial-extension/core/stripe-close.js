// Stripe: the close is "the payment the person is waiting for has ARRIVED", and reading that invoice or payment back from Stripe is the proof.
// docs/glance-ai/connectors/stripe.md. Portable: no chrome.*, no DOM; the network, the token store and the ledger are injected
// (src/background.js passes real ones, test/stripe-close-corpus.cjs passes a mock of Stripe).
//
// THIS CONNECTOR IS READ-ONLY AND NEVER MOVES MONEY. It never creates, finalizes, sends, pays, voids or refunds an invoice, a payment
// intent or a charge, and never creates a payment link: asking someone for money is a message to another person, and Glance never sends on
// the person's behalf. The person links ONE invoice (in_…) or ONE payment (pi_…) they are waiting on to one loop. Every request is a GET
// of that one object (asserted in the tests). Contract:
//   check(link)   link = { key, objectId, expect? }. Closed (ok:true, closed:true + proof) ONLY when the GET returned that same object, paid
//                 for real: an invoice with status "paid", nothing remaining and a positive amount paid; a payment intent with status
//                 "succeeded" and a positive amount received. A charge that is refunded, partly refunded or disputed never closes it.
//                 Open, draft, uncollectible, processing, requires-action and canceled are waiting; void is shown as void and never closes;
//                 an unreadable or changed answer is ok:false and never closed. When the person gave an expected amount and currency, a
//                 payment of less, or in another currency, never closes it (amount-mismatch). Test-mode objects never close a live loop.
//   one object    a loop key is bound to the first object linked to it; another is refused until the person releases the first.
//   verify(ref)   the same read on a fresh instance (after a reload). A cached "closed" is never trusted without the read.
//   release(key)  the person's deliberate release: the loop is no longer watched. Nothing in Stripe changes (Glance wrote nothing).
// No customer name, email, description or paid amount is returned, stored in the ledger or put in a proof: the ledger holds the object id, its kind,
// the state and the expected amount and currency the person gave (on this device only, so a reload still checks the same thing).
const FlowStripeClose = (() => {
  const API = 'https://api.stripe.com/v1';
  const SYSTEM = 'stripe/payment';
  const API_VERSION = '2024-06-20';
  const MAX_ATTEMPTS = 3;

  function invoiceIdOk(i) { return typeof i === 'string' && /^in_[A-Za-z0-9]{8,64}$/.test(i); }
  function intentIdOk(i) { return typeof i === 'string' && /^pi_[A-Za-z0-9]{8,64}$/.test(i); }
  function kindOf(id) { return invoiceIdOk(id) ? 'invoice' : intentIdOk(id) ? 'payment_intent' : ''; }
  function cleanExpect(e) {
    if (e == null) return null;
    if (typeof e !== 'object') return false;
    const amount = e.amount;
    const currency = typeof e.currency === 'string' ? e.currency.toLowerCase() : '';
    if (!Number.isInteger(amount) || amount <= 0 || amount > 99999999999 || !/^[a-z]{3}$/.test(currency)) return false;
    return { amount: amount, currency: currency };
  }

  // An invoice id, a payment id, or a Stripe dashboard link that carries one (…/invoices/in_…, …/payments/pi_…).
  function parseObjectId(input) {
    const t = String(input == null ? '' : input).trim();
    if (kindOf(t)) return t;
    let u = null;
    try { u = new URL(t); } catch (e) { return null; }
    if (u.protocol !== 'https:' || !/^dashboard\.stripe\.com$/.test(u.hostname)) return null;
    const m = u.pathname.match(/\/(?:invoices|payments)\/((?:in|pi)_[A-Za-z0-9]{8,64})(?:\/|$)/);
    return m ? m[1] : null;
  }

  function create(deps) {
    const d = deps || {};
    const now = d.now || (() => Date.now());
    const sleep = d.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
    const timeoutMs = d.timeoutMs || 15000;
    const ledger = d.ledger;
    const buildProof = d.buildProof;

    // One authorised GET. Handles the timeout, one token refresh on 401, the wait a rate limit asks for, and a 5xx retry.
    async function get(path, state) {
      let last = { error: 'network' };
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        let res;
        try {
          res = await Promise.race([
            d.fetch(API + path, { method: 'GET', headers: { Authorization: 'Bearer ' + state.auth.token, Accept: 'application/json', 'Stripe-Version': API_VERSION } }),
            new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs))
          ]);
        } catch (e) { last = { error: 'network' }; if (attempt < MAX_ATTEMPTS) await sleep(300 * attempt); continue; }
        if (res.status === 401 && state.auth.refreshToken && typeof d.refresh === 'function' && !state.refreshed) {
          state.refreshed = true;
          let fresh = null;
          try { fresh = await d.refresh(state.auth); } catch (e) { fresh = null; }
          if (!fresh || !fresh.token) return { error: 'not-connected' };
          state.auth = Object.assign({}, state.auth, fresh);
          if (typeof d.saveAuth === 'function') { try { await d.saveAuth(state.auth); } catch (e) { /* this session still has it */ } }
          attempt--; continue;
        }
        if (res.status === 401) return { error: 'not-connected' };
        if (res.status === 403) return { error: 'scope-missing' };
        if (res.status === 404) return { notFound: true };
        if (res.status === 429) {
          const ra = Number(res.headers && res.headers.get && res.headers.get('retry-after'));
          last = { error: 'rate-limited' };
          if (attempt < MAX_ATTEMPTS) await sleep(Number.isFinite(ra) && ra > 0 ? Math.min(ra, 10) * 1000 : 1000);
          continue;
        }
        if (res.status >= 500) { last = { error: 'http-' + res.status }; if (attempt < MAX_ATTEMPTS) await sleep(300 * attempt); continue; }
        if (!res.ok) return { error: 'http-' + res.status };
        let body = null;
        try { body = await res.json(); } catch (e) { body = null; }
        if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'verify_failed' };
        return { json: body };
      }
      return last;
    }

    function proofFor(id) {
      if (typeof buildProof !== 'function') return null;
      return buildProof({ system: SYSTEM, externalId: id, fetchedBack: true, verifiedAt: new Date(now()).toISOString() });
    }

    const posInt = (n) => Number.isInteger(n) && n > 0;
    // A charge that was refunded, partly refunded or disputed is not a payment that arrived. null = the charge was not expanded (unknown).
    function chargeProblem(c) {
      if (!c || typeof c !== 'object') return null;
      if (c.refunded === true || (Number.isInteger(c.amount_refunded) && c.amount_refunded > 0)) return 'refunded';
      if (c.disputed === true) return 'disputed';
      if (c.paid === false || c.status === 'failed') return 'failed';
      return null;
    }

    // Decide from one object. Returns { state: 'paid' | 'waiting' | 'void' | 'canceled' | 'refunded' | 'disputed' | 'amount-mismatch' | 'mode-mismatch' | 'bad-shape', ... }.
    function judge(kind, id, o, expect, testMode) {
      if (String(o.id) !== id || o.object !== (kind === 'invoice' ? 'invoice' : 'payment_intent')) return { state: 'bad-shape' };
      if (typeof o.livemode !== 'boolean') return { state: 'bad-shape' };
      if (o.livemode === testMode) return { state: 'mode-mismatch' };
      let paid = 0;
      let currency = typeof o.currency === 'string' ? o.currency.toLowerCase() : '';
      let charge = null;
      if (kind === 'invoice') {
        if (typeof o.status !== 'string') return { state: 'bad-shape' };
        if (o.status === 'void') return { state: 'void' };
        if (o.status !== 'paid') return { state: 'waiting' };
        if (!posInt(o.amount_paid) || o.amount_remaining !== 0) return { state: 'bad-shape' };
        paid = o.amount_paid;
        const pi = o.payment_intent;
        if (pi && typeof pi === 'object' && pi.latest_charge && typeof pi.latest_charge === 'object') charge = pi.latest_charge;
      } else {
        if (typeof o.status !== 'string') return { state: 'bad-shape' };
        if (o.status === 'canceled') return { state: 'canceled' };
        if (o.status !== 'succeeded') return { state: 'waiting' };
        if (!posInt(o.amount_received)) return { state: 'bad-shape' };
        if (!o.latest_charge || typeof o.latest_charge !== 'object') return { state: 'bad-shape' }; // the refund/dispute state must be readable
        paid = o.amount_received;
        charge = o.latest_charge;
      }
      if (!/^[a-z]{3}$/.test(currency)) return { state: 'bad-shape' };
      const problem = chargeProblem(charge);
      if (problem) return { state: problem };
      if (expect && (expect.currency !== currency || paid < expect.amount)) return { state: 'amount-mismatch' };
      return { state: 'paid' };
    }

    async function evaluate(state, key, id, expect, testMode) {
      const kind = kindOf(id);
      const path = kind === 'invoice' ? '/invoices/' + encodeURIComponent(id) + '?expand[]=payment_intent.latest_charge' : '/payment_intents/' + encodeURIComponent(id) + '?expand[]=latest_charge';
      const r = await get(path, state);
      if (r.error === 'not-connected' || r.error === 'scope-missing') return { ok: false, reason: r.error };
      if (r.notFound) return { ok: false, reason: 'not-found' };
      if (r.error) return { ok: false, reason: r.error === 'rate-limited' ? 'rate-limited' : r.error === 'verify_failed' ? 'verify_failed' : r.error };
      const j = judge(kind, id, r.json, expect, testMode);
      if (j.state === 'bad-shape') return { ok: false, reason: 'verify_failed', proof: null };
      if (j.state === 'mode-mismatch') return { ok: false, reason: 'mode-mismatch', proof: null };
      if (j.state !== 'paid') {
        await ledger.set(key, { state: j.state, objectId: id, kind: kind, expect: expect || undefined, at: now() });
        const out = { ok: true, closed: false, proof: null };
        if (j.state === 'waiting') out.waiting = true; else out.heldOpen = j.state;
        return out;
      }
      const proof = proofFor(id);
      if (!proof) return { ok: false, reason: 'proof_pending', proof: null };
      await ledger.set(key, { state: 'closed', objectId: id, kind: kind, expect: expect || undefined, at: now() });
      return { ok: true, closed: true, where: 'Stripe', ref: { key: key, objectId: id, externalId: id }, proof: proof };
    }

    async function withAuth() {
      const auth = await d.getAuth();
      return auth && auth.token ? { auth: auth } : null;
    }

    // link: { key, objectId (an in_… / pi_… id or a dashboard link), expect?: { amount (minor units), currency } }
    async function check(link) {
      const l = link || {};
      const key = String(l.key || '');
      const id = parseObjectId(l.objectId);
      const expect = cleanExpect(l.expect);
      if (!key || !id || expect === false) return { ok: false, reason: 'bad-params' };
      const state = await withAuth();
      if (!state) return { ok: false, reason: 'not-connected' };
      const prior = await ledger.get(key);
      if (prior && prior.state !== 'released' && prior.objectId && prior.objectId !== id) return { ok: false, reason: 'another-object-linked' };
      return evaluate(state, key, id, expect, state.auth.testMode === true);
    }

    async function verify(ref) {
      const key = ref && String(ref.key || '');
      if (!key) return { ok: false, reason: 'bad-params' };
      const rec = await ledger.get(key);
      if (!rec || !rec.objectId || rec.state === 'released') return { ok: false, reason: 'no-record' };
      const state = await withAuth();
      if (!state) return { ok: false, reason: 'not-connected' };
      return evaluate(state, key, rec.objectId, cleanExpect(rec.expect) || null, state.auth.testMode === true);
    }

    async function release(key) {
      const k = String(key || '');
      if (!k) return { ok: false, reason: 'bad-params' };
      const rec = await ledger.get(k);
      if (!rec) return { ok: true, nothingWatched: true };
      await ledger.set(k, { state: 'released', at: now() });
      return { ok: true };
    }

    return { check: check, verify: verify, release: release };
  }

  return { SYSTEM: SYSTEM, API: API, create: create, parseObjectId: parseObjectId, kindOf: kindOf };
})();

if (typeof module !== 'undefined') module.exports = { FlowStripeClose };
else if (typeof globalThis !== 'undefined') globalThis.FlowStripeClose = FlowStripeClose;
