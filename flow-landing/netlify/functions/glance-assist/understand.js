// The server side of Glance cloud reading (docs/glance-ai/ai-product.md §3, milestone M3). The extension's Router v2 (core/understanding-router.js) sends ONE
// masked message here when the device could not settle it; this file decides whether it may be read, what it costs, asks Glance's own model, and returns a
// validated Understanding, never the model's own words.
//
//   switch   GLANCE_AI_PRIMARY = the languages that passed the measurement (en, he, or en,he). Unset or anything else: off, nothing asked, nothing charged.
//   who      Pro (a live licence key) or Free (the random per-install id); the same identity as the deeper read (ladder.js).
//   limits   a monthly allowance per person (GLANCE_AI_PRIMARY_FREE / _PRO reads), and the owner's monthly SPEND CAP for everyone together
//            (GLANCE_AI_SPEND_CAP_USD, counted in micro-dollars at GLANCE_AI_CALL_MICROUSD per read). No cap set: off. At the cap: 429, and the extension
//            carries on on the device.
//   model    an injected provider. 'mock' answers from a fixture (tests and the lab). 'openai-compatible' posts to GLANCE_MODEL_URL with GLANCE_MODEL_KEY (the
//            endpoint that serves Glance's own model; any OpenAI-compatible server). Which host serves it is the owner's decision (§7 row 2): nothing here picks one.
//   checks   the text must already be masked (model-router.js leaksPii refuses a contact detail, an amount or a date), and the answer must ground every claim in that
//            same masked text (core/understanding.js validate, run here AND again on the device).
//   returns  { understanding, drops, quota } or an error code. No model text, no provider name, no prompt.
//
// Fails closed. A read whose model never answered is refunded; a read the model answered (even badly) is charged, because it cost money.
// What is stored: a hash of the person's id and numbers per period. Never a message, never an answer.
const crypto = require('crypto');
const { FlowUnderstanding: U } = require('../../../../flow-trial-extension/core/understanding.js');
const license = require('../verify-license/license-core.js');
const router = require('./model-router.js');
const { memoryStore, supabaseStore } = require('./ladder.js');

const MAX_TEXT_CHARS = 6000;
const MAX_OUT_TOKENS = 400;
const DEFAULT_FREE_READS = 300;      // a month; placeholder until the owner sets the allowance from the M6 numbers (§7 row 5)
const DEFAULT_PRO_READS = 3000;
const DEFAULT_CALL_MICROUSD = 400;   // conservative per-read estimate (glance-ai/oss/cost/cost-tables.md is $0.0001-0.0004)
const ID_RE = /^[A-Za-z0-9_-]{8,80}$/;
const TIMEOUT_MS = 20000;

function sha(prefix, value) { return crypto.createHash('sha256').update(prefix + '|' + value).digest('hex'); }
function envNumber(env, name, fallback) { const n = Number(env && env[name]); return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback; }
function monthOf(now) { return new Date(now).toISOString().slice(0, 7); }
function result(status, body) { return { status, body: Object.assign({ ok: status === 200 }, body) }; }

// ---- providers -----------------------------------------------------------------------------------------------------------------------------------------
// provider({ system, user, maxTokens }) -> Promise<string>. Throwing means "no answer" (refunded).
function mockProvider(answerFor) {
  return async ({ user }) => {
    const a = typeof answerFor === 'function' ? answerFor(user) : answerFor;
    if (a instanceof Error) throw a;
    return typeof a === 'string' ? a : JSON.stringify(a);
  };
}
function openAiCompatibleProvider(env, fetchImpl) {
  const url = env && env.GLANCE_MODEL_URL, key = env && env.GLANCE_MODEL_KEY, model = (env && env.GLANCE_MODEL_NAME) || 'glance';
  if (!url || !key || !/^https:\/\//.test(url)) return null;
  const doFetch = fetchImpl || fetch;
  return async ({ system, user, maxTokens }) => {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      const res = await doFetch(url, { method: 'POST', signal: ctl.signal, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
        body: JSON.stringify({ model, temperature: 0, max_tokens: maxTokens, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }) });
      if (!res.ok) throw new Error('provider-' + res.status);
      const j = await res.json();
      const text = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
      if (typeof text !== 'string') throw new Error('provider-empty');
      return text;
    } finally { clearTimeout(t); }
  };
}

// ---- the reader ----------------------------------------------------------------------------------------------------------------------------------------
function createUnderstand(ctx) {
  ctx = ctx || {};
  const env = ctx.env || process.env;
  const now = typeof ctx.now === 'number' ? ctx.now : Date.now();
  const store = ctx.store === undefined ? supabaseStore(env, ctx.fetchImpl) : ctx.store;
  const provider = ctx.provider !== undefined ? ctx.provider : openAiCompatibleProvider(env, ctx.fetchImpl);
  const checkLicense = ctx.license || license.checkLicense;

  function languages() {
    return String(env.GLANCE_AI_PRIMARY || '').toLowerCase().split(',').map((x) => x.trim()).filter((x, i, a) => (x === 'en' || x === 'he') && a.indexOf(x) === i);
  }
  const capMicro = () => { const usd = Number(env.GLANCE_AI_SPEND_CAP_USD); return Number.isFinite(usd) && usd > 0 ? Math.floor(usd * 1e6) : 0; };
  const callMicro = () => envNumber(env, 'GLANCE_AI_CALL_MICROUSD', DEFAULT_CALL_MICROUSD);
  function ready() { return languages().length > 0 && !!store && typeof provider === 'function' && capMicro() > 0; }

  async function who(payload) {
    if (payload.licenseKey) {
      try {
        const e = await checkLicense(payload.licenseKey, env, now);
        if (e && e.configured && e.valid) return { pro: true, subject: 'u-pro:' + sha('glance-understand', license.normalizeKey(payload.licenseKey)) };
      } catch (err) { /* a licence check that fails falls back to Free */ }
    }
    const id = String(payload.installId || '');
    if (!ID_RE.test(id)) return null;
    return { pro: false, subject: 'u-free:' + sha('glance-understand', id) };
  }
  const allowance = (pro) => (pro ? envNumber(env, 'GLANCE_AI_PRIMARY_PRO', DEFAULT_PRO_READS) : envNumber(env, 'GLANCE_AI_PRIMARY_FREE', DEFAULT_FREE_READS));

  async function read(payload) {
    payload = payload || {};
    if (!ready()) return result(503, { code: 'unavailable' });
    const text = typeof payload.maskedText === 'string' ? payload.maskedText.trim() : '';
    if (!text || text.length > MAX_TEXT_CHARS) return result(400, { code: 'bad_request' });
    if (router.leaksPii(text, 'outbound')) return result(422, { code: 'pii' });                   // the mask missed something: nothing is asked, nothing charged
    if (languages().indexOf(/[֐-׿]/.test(text) ? 'he' : 'en') < 0) return result(422, { code: 'language_off' });
    const today = typeof payload.today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(payload.today) ? payload.today : new Date(now).toISOString().slice(0, 10);
    const me = await who(payload);
    if (!me) return result(400, { code: 'no_identity' });
    const month = monthOf(now);
    const taken = [];
    const refund = async () => { for (const t of taken.splice(0)) { try { await store.charge(t.subject, t.period, -t.units, Number.MAX_SAFE_INTEGER); } catch (e) { /* never more than one read */ } } };
    try {
      const mine = await store.charge(me.subject, month, 1, allowance(me.pro));
      if (!mine.allowed) return result(429, { code: 'quota_used', quota: { used: mine.used, limit: allowance(me.pro), plan: me.pro ? 'pro' : 'free' } });
      taken.push({ subject: me.subject, period: month, units: 1 });
      const spend = await store.charge('u-spend', month, callMicro(), capMicro());
      if (!spend.allowed) { await refund(); return result(429, { code: 'spend_cap' }); }
      taken.push({ subject: 'u-spend', period: month, units: callMicro() });

      let raw;
      try { raw = await provider({ system: U.instructions(), user: text, maxTokens: MAX_OUT_TOKENS }); }
      catch (e) { await refund(); return result(502, { code: 'provider' }); }

      const v = U.validate(raw, text, { today, placesOnly: true }); // grounds every claim; the device reads the values after restoring its placeholders
      const quota = { used: mine.used, limit: allowance(me.pro), plan: me.pro ? 'pro' : 'free' };
      if (!v.ok) return result(200, { understanding: null, invalid: v.reason, drops: v.drops.length, quota });
      return result(200, { understanding: v.understanding, drops: v.drops.length, quota });
    } catch (err) {
      await refund();
      return result(503, { code: 'unavailable' });
    }
  }

  async function status(payload) {
    if (!ready()) return result(200, { available: false, languages: [] });
    const me = await who(payload || {});
    const look = me ? await store.charge(me.subject, monthOf(now), 0, allowance(me.pro)) : { used: 0 };
    return result(200, { available: true, languages: languages(), quota: { used: look.used, limit: allowance(!!(me && me.pro)), plan: me && me.pro ? 'pro' : 'free' } });
  }

  return { ready, read, status };
}

module.exports = { MAX_TEXT_CHARS, DEFAULT_CALL_MICROUSD, createUnderstand, mockProvider, openAiCompatibleProvider, memoryStore };
