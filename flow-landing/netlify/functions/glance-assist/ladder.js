// The server side of the deeper read (docs/ai-ladder.md). The extension sends ONE masked sentence; this file decides whether it may be answered, what it costs, which
// model reads it, and returns a reading, never a model's own words.
//
//   who      Pro (a live licence key) or Free (a random per-install id; never an e-mail, never a Google account)
//   limit    a monthly allowance per person, a daily cap per network address, and a daily cap for everyone together. All three are counted in one store, atomically.
//   tiers    the fast pair (Haiku / Grok-fast) is asked twice, in two wordings, at the same time. They must agree (core/local-lm.js agree()). A Pro reading that was
//            torn (disagreement, an unreadable answer, an ask with no nameable action) goes once to the strong pair (Sonnet / Grok-strong), asked the same way.
//            A fast pair that AGREES that a sentence is a statement or thanks is believed: silence costs nothing more.
//   switch   GLANCE_AI_LADDER = the languages that passed the measurement (en, he, or en,he). A language not listed is refused before anything is charged or asked.
//   returns  { reading: { act, action, who, when, amount } | null, tier, units, quota }. No model text, no provider name, no prompt.
//
// Fails closed: no switch (GLANCE_AI_LADDER=en,he), no counter, no provider key, an unreadable identity, text that still looks like a contact detail or an amount: nothing
// is asked and nothing is charged. A charge is refunded when no provider answered. The prompts are built here from core/local-lm.js; the client supplies the sentence only.
//
// What is stored: a hash of the person's id and a number per period. Never a sentence, never an answer.
const crypto = require('crypto');
const { FlowAiLadder } = require('../../../../flow-trial-extension/core/ai-ladder.js');
const { FlowLocalLM } = require('../../../../flow-trial-extension/core/local-lm.js');
const license = require('../verify-license/license-core.js');
const router = require('./model-router.js');

const MAX_SENTENCE_CHARS = 800;                    // 40 words is the client's limit; this is the same gate with room for placeholders
const DEFAULT_IP_DAILY_UNITS = 300;
const DEFAULT_GLOBAL_DAILY_UNITS = 3000;
const ID_RE = /^[A-Za-z0-9_-]{8,80}$/;           // the extension's random install id is 12 hex characters (src/background.js getInstallId)
const FAST_TOKENS = 120;

function sha(prefix, value) {
  return crypto.createHash('sha256').update(prefix + '|' + value).digest('hex');
}

function envNumber(env, name, fallback) {
  const n = Number(env && env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

// ---- the counter ---------------------------------------------------------------------------------------------------------------------------------------
// charge(subject, period, units, limit) -> { allowed, used }. units may be negative (a refund) or 0 (a look). Atomic in the real store; the in-memory one is for tests and
// for a single warm instance. Neither is trusted to be exact under a race: the cap is a ceiling on cost, not a ledger for billing.
function memoryStore() {
  const rows = new Map();
  return {
    rows,
    async charge(subject, period, units, limit) {
      const key = subject + '|' + period;
      const cur = rows.get(key) || 0;
      if (units > 0 && cur + units > limit) return { allowed: false, used: cur };
      const next = Math.max(0, cur + units);
      rows.set(key, next);
      return { allowed: true, used: next };
    }
  };
}

// The Supabase counter: supabase/migrations/20261004000000_glance_ai_usage.sql (the function glance_ai_charge). Not applied from here: the project is paused.
function supabaseStore(env, fetchImpl) {
  const serviceKey = env && env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return null;
  const doFetch = fetchImpl || fetch;
  return {
    async charge(subject, period, units, limit) {
      const res = await license.withTimeout((signal) => doFetch(license.SB_URL + '/rest/v1/rpc/glance_ai_charge', {
        method: 'POST', signal, headers: license.sbHeaders(serviceKey),
        body: JSON.stringify({ p_subject: subject, p_period: period, p_units: units, p_limit: limit })
      }));
      if (!res.ok) throw new Error('counter failed: HTTP ' + res.status);
      const rows = await res.json();
      const row = Array.isArray(rows) ? rows[0] : rows;
      if (!row || typeof row.allowed !== 'boolean' || !Number.isFinite(Number(row.used))) throw new Error('counter answered nonsense');
      return { allowed: row.allowed, used: Number(row.used) };
    }
  };
}

function dayOf(now) { return new Date(now).toISOString().slice(0, 10); }

function result(status, body) { return { status, body: Object.assign({ ok: status === 200 }, body) }; }

// ---- the deeper read ---------------------------------------------------------------------------------------------------------------------------------------
// ctx: { env, now, store, ip, license?, routed?, plan? } — everything injectable so the tests need no network.
function createLadder(ctx) {
  const env = ctx.env || process.env;
  const now = typeof ctx.now === 'number' ? ctx.now : Date.now();
  const store = ctx.store === undefined ? supabaseStore(env, ctx.fetchImpl) : ctx.store;
  const routed = ctx.routed || router.callRoutedLlm;
  const plan = ctx.plan || router.planRoute;
  const checkLicense = ctx.license || license.checkLicense;

  // The owner's switch is the list of languages that passed scripts/ai-ladder/eval.cjs on real answers, e.g. GLANCE_AI_LADDER=en or en,he. Empty, or "1", or anything else: off.
  // A language that was not measured is never sent, exactly as the on-device model only runs in a language it passed its own test in.
  function languages() {
    return String(env.GLANCE_AI_LADDER || '').toLowerCase().split(',').map((x) => x.trim()).filter((x, i, a) => (x === 'en' || x === 'he') && a.indexOf(x) === i);
  }

  function ready() {
    if (!languages().length) return false;
    if (!store) return false;
    return plan('ladder', { env, tier: 'fast', now }).length > 0;
  }

  async function who(payload) {
    if (payload.licenseKey) {
      try {
        const e = await checkLicense(payload.licenseKey, env, now);
        if (e && e.configured && e.valid) return { pro: true, subject: 'pro:' + sha('glance-ai', license.normalizeKey(payload.licenseKey)) };
      } catch (err) { /* a licence check that fails never blocks the Free reading below */ }
    }
    const id = String(payload.installId || '');
    if (!ID_RE.test(id)) return null;
    return { pro: false, subject: 'free:' + sha('glance-ai', id) };
  }

  const quotaOf = (p, used) => ({ period: FlowAiLadder.periodOf(now), used, limit: FlowAiLadder.planOf(p).units, plan: p ? 'pro' : 'free' });

  async function status(payload) {
    if (!ready()) return result(200, { available: false, languages: [] });
    const me = await who(payload);
    if (!me) return result(200, { available: true, languages: languages(), quota: quotaOf(false, 0) });
    const look = await store.charge(me.subject, FlowAiLadder.periodOf(now), 0, FlowAiLadder.planOf(me.pro).units);
    return result(200, { available: true, languages: languages(), quota: quotaOf(me.pro, look.used) });
  }

  // Charge a subject; returns a function that gives the units back. Anything that throws here means the counter is down: the caller treats it as unavailable.
  async function charge(subject, period, units, limit, taken) {
    const r = await store.charge(subject, period, units, limit);
    if (r.allowed) taken.push({ subject, period, units });
    return r;
  }
  async function refund(taken) {
    for (const t of taken.splice(0)) { try { await store.charge(t.subject, t.period, -t.units, Number.MAX_SAFE_INTEGER); } catch (e) { /* a refund that fails costs the person a unit, never more */ } }
  }

  // Two askings, at the same time, differently worded -> { agreed } | { uncertain } | { failed }.
  // "Uncertain" is everything except a clean agreement: a disagreement, an unreadable answer, an ask that names the wrong party, an ask with no nameable action.
  // Two askings that agree the sentence is a statement or thanks ARE a clean agreement: that silence is believed and costs nothing more.
  async function askPair(sentence, tier) {
    const askOne = async (variant) => {
      const parts = FlowLocalLM.partsFor(sentence, variant);
      const out = await routed({ action: 'ladder', tier, system: parts.system, userText: parts.user, maxTokens: FAST_TOKENS, now, env, state: ctx.state, fetchImpl: ctx.fetchImpl, accept: (raw) => FlowLocalLM.parse(raw) !== null });
      return FlowLocalLM.parse(out.text);
    };
    const settled = await Promise.allSettled([askOne('A'), askOne('B')]);
    if (settled.every((s) => s.status === 'rejected')) return { failed: true };
    const answers = settled.map((s) => (s.status === 'fulfilled' ? s.value : null));
    const agreed = FlowLocalLM.agree(answers[0], answers[1], sentence);
    if (!agreed) return { uncertain: true };
    if ((agreed.act === 'ASK' || agreed.act === 'PROMISE') && agreed.action === 'none') return { uncertain: true };
    return { agreed };
  }

  async function read(payload) {
    if (!ready()) return result(503, { code: 'unavailable' });
    const sentence = typeof payload.maskedSentence === 'string' ? payload.maskedSentence.replace(/\s+/g, ' ').trim() : '';
    if (!sentence || sentence.length > MAX_SENTENCE_CHARS) return result(400, { code: 'bad_request' });
    if (router.leaksPii(sentence, 'outbound')) return result(422, { code: 'pii' });         // the masking missed something: nothing is asked, nothing is charged
    if (languages().indexOf(/[֐-׿]/.test(sentence) ? 'he' : 'en') < 0) return result(422, { code: 'language_off' });
    const me = await who(payload);
    if (!me) return result(400, { code: 'no_identity' });
    const p = FlowAiLadder.planOf(me.pro);
    const month = FlowAiLadder.periodOf(now);
    const day = dayOf(now);
    const globalCap = envNumber(env, 'GLANCE_AI_DAILY_UNITS', DEFAULT_GLOBAL_DAILY_UNITS);
    const netSubject = 'ip:' + sha('glance-ai-ip', ctx.ip || 'unknown');
    const netCap = envNumber(env, 'GLANCE_AI_IP_DAILY_UNITS', DEFAULT_IP_DAILY_UNITS);
    const taken = [];
    try {
      const mine = await charge(me.subject, month, FlowAiLadder.COST.fast, p.units, taken);
      if (!mine.allowed) return result(429, { code: 'quota_used', quota: quotaOf(me.pro, mine.used) });
      let used = mine.used;
      const net = await charge(netSubject, day, FlowAiLadder.COST.fast, netCap, taken);
      const all = net.allowed ? await charge('global', day, FlowAiLadder.COST.fast, globalCap, taken) : net;
      if (!net.allowed || !all.allowed) { await refund(taken); return result(429, { code: net.allowed ? 'capacity' : 'busy' }); }

      let tier = 'fast';
      let outcome = await askPair(sentence, 'fast');
      if (outcome.failed) { await refund(taken); return result(502, { code: 'provider' }); }

      if (outcome.uncertain && p.strong && plan('ladder', { env, tier: 'strong', now }).length > 0) {
        // Only the extra cost is charged, and only if the person's month and the day's cap can take it; otherwise the fast outcome (silence) stands.
        const extra = [];
        const more = await charge(me.subject, month, FlowAiLadder.COST.strong, p.units, extra);
        const moreAll = more.allowed ? await charge('global', day, FlowAiLadder.COST.strong, globalCap, extra) : more;
        if (more.allowed && moreAll.allowed) {
          const strong = await askPair(sentence, 'strong');
          if (strong.failed) await refund(extra);
          else { outcome = strong; tier = 'strong'; used = more.used; taken.push(...extra); }
        } else {
          await refund(extra);
        }
      }

      const units = taken.filter((t) => t.subject === me.subject).reduce((sum, t) => sum + t.units, 0);
      return result(200, { reading: outcome.agreed && (outcome.agreed.act === 'ASK' || outcome.agreed.act === 'PROMISE') ? outcome.agreed : null, tier, units, quota: quotaOf(me.pro, used) });
    } catch (err) {
      await refund(taken);
      if (err && (err.pii || err.refusal)) return result(422, { code: 'refused' });
      return result(503, { code: 'unavailable' });
    }
  }

  return { ready, status, read };
}

module.exports = { MAX_SENTENCE_CHARS, DEFAULT_IP_DAILY_UNITS, DEFAULT_GLOBAL_DAILY_UNITS, memoryStore, supabaseStore, createLadder };
