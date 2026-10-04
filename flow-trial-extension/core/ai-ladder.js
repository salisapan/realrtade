// The deeper read: what Glance does with a sentence its own code could not place. Portable: no chrome.*, no DOM, no network of its own; every capability is injected.
// docs/ai-ladder.md. It is the fourth step of the recognition order, and it is allowed to exist only because every step before it stays in charge:
//
//   0  word lists and sentence frames        core/request-types.js                       on the device
//   1  the learned model                     core/intent-model.js, core/intent-pipeline.js   on the device
//   2  a model on this computer, if any      core/local-lm.js (the browser's own, or Ollama / LM Studio)
//   3  THIS FILE: one masked sentence to Glance's server, asked twice, a fast model first; for Pro a strong model when the fast one was torn
//   4  silence, or one question to the person                core/active-question.js
//
// What a deeper read is, and is not:
//   - It is asked about ONE sentence, only when steps 0-2 said "unsure" AND the learned model leaned to an ask or a promise it could not accept
//     (the pipeline's own "residual"): on the fixtures that is about 6% of sentences. Everything else never leaves the device.
//   - The sentence is masked first by the same function that guards every other send (FlowExecRouter.maskForServer); nothing is sent if it cannot be.
//   - The answer is a PROPOSAL. It becomes a loop only when the person taps, exactly like a proposal from step 2. It never closes, writes or sends.
//   - The answer is checked again here, field by field, and then held to the same structural gate the learned model needs (the sentence must be SHAPED like an ask
//     or a promise). A strong model may stand in for that shape only when the independent word list finds the very same verb in the sentence.
//   - It is metered. A read costs units (fast 1, strong 4), the plan has a monthly allowance, the server is the one that counts, and when the allowance is
//     gone Glance goes back to steps 0-2 and says so once, quietly, in the popup. Never a broken screen, never a banner in Gmail.
const FlowAiLadder = (() => {
  function sibling(globalValue, file, name) {
    if (globalValue) return globalValue;
    try { return typeof require !== 'undefined' ? require(file)[name] : null; } catch (e) { return null; }
  }
  const localLm = sibling(typeof FlowLocalLM !== 'undefined' ? FlowLocalLM : null, './local-lm.js', 'FlowLocalLM');
  const requestTypes = sibling(typeof FlowRequestTypes !== 'undefined' ? FlowRequestTypes : null, './request-types.js', 'FlowRequestTypes');
  const extractMod = sibling(typeof FlowExtract !== 'undefined' ? FlowExtract : null, './extract.js', 'FlowExtract');

  // ---- the plans. These numbers are the owner's to change (docs/ai-ladder.md §3); the server enforces them, the popup only shows them. ----------------------------
  // A "deeper read" is one sentence, asked twice. Units are what a read costs: the fast model is 1, the strong model 4 (about four times the price of a call).
  const PLANS = Object.freeze({
    free: Object.freeze({ id: 'free', label: 'Free', units: 120, strong: false }),
    pro: Object.freeze({ id: 'pro', label: 'Pro', units: 1500, strong: true })
  });
  const COST = Object.freeze({ fast: 1, strong: 4 });
  const LOW_SHARE = 0.8;                      // from here the popup says how many are left
  const MIN_WORDS = 5;
  const MAX_WORDS = 40;
  const SURE_NOT_ASK = 0.9;                   // the same bar core/local-lm.js uses: sure it is thanks or a statement
  const CACHE_MAX = 300;
  const CACHE_TTL_MS = 30 * 24 * 3600 * 1000;
  const PAUSE_MS = 15 * 60 * 1000;            // after a server failure: back to the device alone for a quarter of an hour

  function hasHebrew(t) { return /[֐-׿]/.test(String(t || '')); }
  function words(t) { return (String(t || '').match(/\S+/g) || []).length; }
  const planOf = (pro) => (pro ? PLANS.pro : PLANS.free);

  // ---- the calendar of the allowance (UTC, so the device and the server agree on when a month ends) -------------------------------------------------------------
  function periodOf(now) {
    const d = new Date(typeof now === 'number' ? now : Date.now());
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
  }
  function resetsOn(now) {
    const d = new Date(typeof now === 'number' ? now : Date.now());
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
  }
  function resetLabel(now) {
    const d = new Date(resetsOn(now) + 'T00:00:00Z');
    return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()] + ' ' + d.getUTCDate();
  }

  // What the server last said about this person's allowance: { period, used, limit, plan }. A snapshot from an earlier month is no snapshot.
  function snapshotOf(raw, now) {
    if (!raw || typeof raw !== 'object' || raw.period !== periodOf(now)) return null;
    const used = Math.max(0, Math.floor(Number(raw.used)));
    const limit = Math.max(0, Math.floor(Number(raw.limit)));
    if (!Number.isFinite(used) || !Number.isFinite(limit) || !limit) return null;
    return { period: raw.period, used, limit, plan: raw.plan === 'pro' ? 'pro' : 'free' };
  }

  // The one state the popup and the gate both read.
  //   unavailable   the server says the deeper read is not running (no keys, switched off, no counter): show nothing, ask nothing
  //   needs-consent the person has not said yes yet
  //   on / low      allowed (low: from 80% used)
  //   used          this month's allowance is spent: device only until the reset
  //   paused        the server just failed: device only for a quarter of an hour
  // input: { available, languages, consent, pro, snapshot, now, pausedUntil }   languages: the ones the owner measured and switched on at the server (docs/ai-ladder.md §7)
  function stateOf(input) {
    const i = input || {};
    const now = typeof i.now === 'number' ? i.now : Date.now();
    const plan = planOf(i.pro === true);
    const snap = snapshotOf(i.snapshot, now);
    const limit = snap ? snap.limit : plan.units;
    const used = snap ? Math.min(snap.used, limit) : 0;
    const base = { plan: plan.id, used, limit, left: Math.max(0, limit - used), resetsOn: resetsOn(now), resetLabel: resetLabel(now), languages: Array.isArray(i.languages) ? i.languages.filter((x) => x === 'en' || x === 'he') : [] };
    if (i.available !== true) return Object.assign({ kind: 'unavailable' }, base);
    if (i.consent !== true) return Object.assign({ kind: 'needs-consent' }, base);
    if (base.left <= 0) return Object.assign({ kind: 'used' }, base);
    if (typeof i.pausedUntil === 'number' && now < i.pausedUntil) return Object.assign({ kind: 'paused' }, base);
    return Object.assign({ kind: used >= Math.ceil(limit * LOW_SHARE) ? 'low' : 'on' }, base);
  }
  const mayAsk = (state) => Boolean(state && (state.kind === 'on' || state.kind === 'low'));

  // The words in the popup. About loops that are open and sentences Glance could not read, never about cleverness (docs/product-identity.md). null = show nothing.
  function copy(state) {
    if (!state) return null;
    const s = state;
    switch (s.kind) {
      case 'needs-consent':
        return { kind: s.kind, title: 'Second reading for sentences Glance cannot place', detail: 'Glance reads on your device first. For the few sentences it cannot place, it can send that one sentence to our server, with names, companies, amounts, dates and contact details replaced, and get a second reading. It only suggests: you still tap.', primary: 'Turn on', secondary: null };
      case 'on':
        return { kind: s.kind, title: 'Second reading is on', detail: s.plan === 'pro' ? 'Pro: about ' + s.limit + ' a month, and a stronger reading for the hard sentences.' : s.used + ' of ' + s.limit + ' used this month.', primary: null, secondary: 'Turn off' };
      case 'low':
        return { kind: s.kind, title: 'Second reading: ' + s.left + ' left this month', detail: s.plan === 'pro' ? 'It starts again on ' + s.resetLabel + '.' : 'It starts again on ' + s.resetLabel + '. Pro has about ' + Math.floor(PLANS.pro.units / PLANS.free.units) + ' times as many, and a stronger reading for the hard sentences.', primary: s.plan === 'pro' ? null : 'See Pro', secondary: 'Turn off' };
      case 'used':
        return { kind: s.kind, title: 'This month’s second readings are used up', detail: 'Glance keeps working on your device, as before. It starts again on ' + s.resetLabel + '.' + (s.plan === 'pro' ? '' : ' Pro has about ' + Math.floor(PLANS.pro.units / PLANS.free.units) + ' times as many.'), primary: s.plan === 'pro' ? null : 'See Pro', secondary: 'Turn off' };
      case 'paused':
        return { kind: s.kind, title: 'Second reading is resting', detail: 'Our server did not answer. Glance keeps working on your device and tries again shortly.', primary: null, secondary: 'Turn off' };
      default: return null;
    }
  }

  // ---- a small memory of what was already asked, so the same sentence is never paid for twice -----------------------------------------------------------------
  // Keyed by a hash of the MASKED sentence, so nothing readable is stored. An entry is the validated reading (or null: asked, and nothing there).
  function hash(text) {
    let h = 0x811c9dc5;
    const t = String(text);
    for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16).padStart(8, '0') + t.length.toString(36);
  }
  function cacheGet(cache, key, now) {
    const t = typeof now === 'number' ? now : Date.now();
    const e = (Array.isArray(cache) ? cache : []).find((x) => x && x.k === key && t - x.at < CACHE_TTL_MS);
    return e || null;
  }
  function cachePut(cache, key, entry, now) {
    const t = typeof now === 'number' ? now : Date.now();
    const kept = (Array.isArray(cache) ? cache : []).filter((x) => x && x.k !== key && t - x.at < CACHE_TTL_MS);
    kept.push({ k: key, at: t, reading: entry.reading || null, tier: entry.tier || 'fast' });
    return kept.slice(-CACHE_MAX);
  }

  // ---- may this sentence be asked about at all? -----------------------------------------------------------------------------------------------------------------
  // deps: { pipeline, model, state, now }. Everything below is decided on the device, before anything is masked or sent.
  function eligible(sentence, deps) {
    const d = deps || {};
    if (!mayAsk(d.state)) return { ok: false, why: 'off' };
    const n = words(sentence);
    if (n < MIN_WORDS || n > MAX_WORDS) return { ok: false, why: 'length' };
    if (d.state.languages.indexOf(hasHebrew(sentence) ? 'he' : 'en') < 0) return { ok: false, why: 'language' };     // a language nobody measured is never sent
    const r = d.pipeline ? d.pipeline.recognize(sentence) : null;
    if (!r || !r.unsure) return { ok: false, why: 'decided' };                  // the tiers above already decided
    if (!d.model || !d.model.ready || !d.model.ready()) return { ok: false, why: 'no-model' };
    const m = d.model.predict(sentence);
    if ((m.act === 'ACK' || m.act === 'INFORM') && m.actProb >= SURE_NOT_ASK) return { ok: false, why: 'sure-not-ask' };
    if (m.act !== 'ASK' && m.act !== 'PROMISE') return { ok: false, why: 'not-residual' };    // only what the learned model leaned towards, and could not accept
    return { ok: true };
  }

  // ---- what came back, checked again -----------------------------------------------------------------------------------------------------------------------
  // The server has already required two askings to agree. This file does not take its word for it: the vocabulary, the party, and every span are checked here.
  // A span must be literally in the MASKED sentence that was sent; placeholders are put back from the map that never left this device, and a placeholder
  // that was never issued is an invented one and drops the span.
  function cleanReading(raw, prepared, masker) {
    if (!localLm || !raw || typeof raw !== 'object') return null;
    const r = localLm.parse(JSON.stringify(raw));
    if (!r) return null;
    if (r.act === 'ASK' && r.who !== 'you') return null;
    if (r.act === 'PROMISE' && r.who !== 'me') return null;
    const TOKEN = /\[[A-Z][A-Z_]*_[A-Z0-9]+\]/g;
    const back = (span) => {
      const kept = localLm.verifySpan(prepared.text, span);
      if (!kept) return null;
      const tokens = kept.match(TOKEN) || [];
      if (tokens.some((t) => !Object.prototype.hasOwnProperty.call(prepared.tokenMap, t))) return null;
      return masker && typeof masker.unmask === 'function' ? masker.unmask(kept, prepared.tokenMap) : kept;
    };
    return { act: r.act, action: r.action, who: r.who, when: back(r.when), amount: back(r.amount) };
  }

  // A strong model may stand in for the sentence's SHAPE only when the independent word list finds the very same verb in the sentence, and the sentence is
  // not a negation. A sentence with no such verb ("I think the customer is mostly happy") never gets through that door, whatever a model says.
  function corroborated(sentence, reading, deps) {
    const types = (deps && deps.types) || requestTypes;
    if (!types || !types.lexHits || !reading || reading.action === 'none') return false;
    if (deps && deps.pipeline && typeof deps.pipeline.negated === 'function' && deps.pipeline.negated(sentence)) return false;
    return types.lexHits(sentence).actions.indexOf(reading.action) >= 0;
  }

  // reading + sentence -> a proposal in the shape core/follow-up.js builds loops from (the same one core/local-lm.js returns), or null.
  function decide(sentence, reading, tier, deps) {
    const d = deps || {};
    if (!reading || (reading.act !== 'ASK' && reading.act !== 'PROMISE') || reading.action === 'none' || !d.pipeline) return null;
    const shaped = reading.act === 'ASK' ? d.pipeline.shapedAsk(sentence) : d.pipeline.shapedPromise(sentence);
    const standIn = !shaped && tier === 'strong' && d.plan && d.plan.strong === true && corroborated(sentence, reading, d);
    if (!shaped && !standIn) return null;
    const ex = d.extract || extractMod;
    const now = typeof d.now === 'number' ? d.now : Date.now();
    const date = ex && ex.parseDate ? (ex.parseDate(sentence, new Date(now)) || (reading.when ? ex.parseDate(reading.when, new Date(now)) : null)) : null;
    const money = ex && ex.parseMoney ? (ex.parseMoney(sentence) || (reading.amount ? ex.parseMoney(reading.amount) : null)) : null;
    return {
      act: reading.act, action: reading.action, tier: 'lm', via: tier === 'strong' ? 'server-strong' : 'server-fast', standIn: Boolean(standIn),
      deadlineIso: date && date.iso ? date.iso : null,
      amount: money ? { value: money.value, currency: money.currency || null, raw: money.raw } : null,
      sentence: String(sentence).trim()
    };
  }

  // ---- one deeper read -------------------------------------------------------------------------------------------------------------------------------------
  // deps: { pipeline, model, state, plan, cache, now, mask(sentence) -> { ok, text, tokenMap } | { ok:false, reason }, maskIds, ask(request) -> Promise<response>, extract?, types? }
  //   ask({ maskedSentence, lang }) -> { ok:true, reading, tier:'fast'|'strong', units, quota } | { ok:false, code, quota? }       (the server's contract, docs/ai-ladder.md §6)
  // -> { proposal|null, why, tier?, units?, quota?, cache? }. Never throws.
  async function read(sentence, deps) {
    const d = deps || {};
    try {
      const e = eligible(sentence, d);
      if (!e.ok) return { proposal: null, why: e.why };
      const prepared = typeof d.mask === 'function' ? d.mask(sentence) : { ok: false, reason: 'mask-unavailable' };
      if (!prepared || !prepared.ok) return { proposal: null, why: 'mask-' + (prepared && prepared.reason || 'failed') };
      const key = hash(prepared.text);
      const hit = cacheGet(d.cache, key, d.now);
      if (hit) return { proposal: decide(sentence, hit.reading, hit.tier, d), why: 'cached', tier: hit.tier, units: 0 };
      let res;
      try { res = await d.ask({ maskedSentence: prepared.text, lang: hasHebrew(sentence) ? 'he' : 'en' }); }
      catch (err) { return { proposal: null, why: 'unreachable' }; }
      if (!res || res.ok !== true) return { proposal: null, why: (res && res.code) || 'refused', quota: res && res.quota || null };
      const tier = res.tier === 'strong' && d.plan && d.plan.strong === true ? 'strong' : 'fast';
      const reading = res.reading ? cleanReading(res.reading, prepared, d.maskIds) : null;
      const cache = cachePut(d.cache, key, { reading, tier }, d.now);
      return { proposal: decide(sentence, reading, tier, d), why: reading ? 'read' : 'nothing', tier, units: Math.max(0, Math.floor(Number(res.units) || 0)), quota: res.quota || null, cache };
    } catch (err) {
      return { proposal: null, why: 'internal' };
    }
  }

  // ---- counts only, on the device: how often it was asked, what it cost, what came of it ------------------------------------------------------------------------
  function emptyStats() { return { asked: 0, proposed: 0, nothing: 0, cached: 0, strong: 0, units: 0, refused: 0, accepted: 0, turnedDown: 0, since: null }; }
  function noteRead(stats, r, now) {
    const s = Object.assign(emptyStats(), stats || {});
    if (!s.since) s.since = typeof now === 'number' ? now : Date.now();
    if (!r) return s;
    if (r.why === 'cached') { s.cached++; if (r.proposal) s.proposed++; return s; }
    if (r.why === 'read') { s.asked++; s.proposed += r.proposal ? 1 : 0; s.units += r.units || 0; if (r.tier === 'strong') s.strong++; if (!r.proposal) s.nothing++; return s; }
    if (r.why === 'nothing') { s.asked++; s.nothing++; s.units += r.units || 0; if (r.tier === 'strong') s.strong++; return s; }
    if (r.why === 'quota_used' || r.why === 'capacity' || r.why === 'unreachable' || r.why === 'refused') s.refused++;
    return s;
  }
  // The person's tap on a proposal that came from a deeper read: the label that says whether the reading was right.
  function noteOutcome(stats, accepted) {
    const s = Object.assign(emptyStats(), stats || {});
    if (accepted) s.accepted++; else s.turnedDown++;
    return s;
  }
  // What the owner reads: how often a deeper read ends in a loop the person actually kept, and what each kept loop cost in units.
  function summarize(stats) {
    const s = Object.assign(emptyStats(), stats || {});
    const judged = s.accepted + s.turnedDown;
    return {
      asked: s.asked, cached: s.cached, proposed: s.proposed, strongShare: s.asked ? Math.round(s.strong / s.asked * 1000) / 1000 : null,
      keptShare: judged >= 5 ? Math.round(s.accepted / judged * 1000) / 1000 : null,        // fewer than five answers say nothing
      unitsPerKept: s.accepted ? Math.round(s.units / s.accepted * 10) / 10 : null
    };
  }

  return { PLANS, COST, LOW_SHARE, MIN_WORDS, MAX_WORDS, CACHE_MAX, PAUSE_MS, planOf, periodOf, resetsOn, resetLabel, snapshotOf, stateOf, mayAsk, copy, hash, cacheGet, cachePut, eligible, cleanReading, corroborated, decide, read, emptyStats, noteRead, noteOutcome, summarize };
})();

if (typeof module !== 'undefined') module.exports = { FlowAiLadder };
