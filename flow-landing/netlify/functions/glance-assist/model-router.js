// Per-action model router for glance-assist.
//
// One Opus call used to serve every action. That is gone on purpose.
// Each action has its own order, and a provider that is down or unusable
// is skipped — the handler never invents a draft, a summary, or a class
// to paper over a miss.
//
//   summarize-attachment: slot C, then the faster healthy fast model, then
//     the other fast model, then a hard failure (no fabricated summary).
//   draft-reply: Haiku or Grok-fast, whichever has been faster while
//     healthy, then the other, then a hard failure.
//   classify: Sonnet, then Grok-strong, then silence { type: null }.
//     Slot C is never a candidate, even when it is the only configured key.
//   execute: Mistral Large, Llama-3-70B, Sonnet, Grok-strong, DeepSeek (EXECUTE_ORDER; the only action that uses slot D). Dormant.
//   ladder (the second reading, docs/ai-ladder.md): tier 'fast' = Haiku and Grok-fast; tier 'strong' = Sonnet and Grok-strong,
//     asked for only by ladder.js and only for Pro. The caller asks twice; cheapest-first is the order of the two calls.
//
// Slot A is Anthropic. Slot B is xAI. Slot C is Gemini Flash, and OpenAI's
// mini model only when Gemini's key is missing or Gemini's circuit is
// already open. A Gemini error on this request falls through to Haiku /
// Grok-fast; it does not promote OpenAI mid-flight.
//
// Local judgment runs before any of that, for classify only. The chip's
// own pass is FlowIntent.classify (judgment.js's scorer plus the silence
// gates). A quiet decision — noise, hedge, family, calibration, a
// Google/Drive silence, or a low-confidence catch-all — is silence here
// too. The router does not get a vote. A real local hit is returned as-is
// and no provider is called. Only a miss (type null, no quiet reason)
// is allowed onto Sonnet.
//
// Every provider receives privacyShield.mask() output. The token map stays
// in this process and is not attached to the request. If an email, phone
// number, or money figure is still present after that mask, nothing is
// sent.

const { FLOW_DOMAINS } = require('../../../../flow-trial-extension/core/domains.js');
const { FlowExtract } = require('../../../../flow-trial-extension/core/extract.js');
const { FlowGoogleCloses } = require('../../../../flow-trial-extension/core/google-closes.js');
const { FlowJudgment } = require('../../../../flow-trial-extension/core/judgment.js');
const { FlowCloseFamilies } = require('../../../../flow-trial-extension/core/close-families.js');
// intent.js reads these as globals while its script initializes, the same
// way the extension's content script does. They have to be in place before
// that file is loaded.
global.FLOW_DOMAINS = FLOW_DOMAINS;
global.FlowExtract = FlowExtract;
global.FlowJudgment = FlowJudgment;
global.FlowGoogleCloses = FlowGoogleCloses;
global.FlowCloseFamilies = FlowCloseFamilies;
const { FlowIntent } = require('../../../../flow-trial-extension/core/intent.js');
const { FlowPrivacyShield } = require('../../../../flow-trial-extension/core/privacyShield.js');
const { FlowMaskIds } = require('../../../../flow-trial-extension/core/mask-ids.js');

const ENV_KEYS = ['ANTHROPIC_API_KEY', 'XAI_API_KEY', 'GEMINI_API_KEY', 'OPENAI_API_KEY', 'MISTRAL_API_KEY', 'DEEPSEEK_API_KEY', 'LLAMA_API_KEY'];

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const XAI_URL = 'https://api.x.ai/v1/chat/completions';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const MISTRAL_URL = 'https://api.mistral.ai/v1/chat/completions';
const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
// Llama-3-70B through a serverless OpenAI-compatible endpoint. Together AI by default; Groq (or any compatible host) by setting LLAMA_API_URL and
// LLAMA_MODEL. The key is LLAMA_API_KEY, so the route simply does not exist until someone sets it.
const LLAMA_DEFAULT_URL = 'https://api.together.xyz/v1/chat/completions';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent';

const OPEN_MS = 60 * 1000;
const FAILURES_TO_OPEN = 3;
const ATTEMPT_TIMEOUT_MS = 8000;

// Haiku is the mid Anthropic model (fast, not Opus). Sonnet is the
// classify primary. Neither id is an Opus model; Opus is not routed.
const MODELS = {
  haiku: { id: 'claude-haiku-4-5', slot: 'A', provider: 'anthropic', env: 'ANTHROPIC_API_KEY', preference: 0 },
  sonnet: { id: 'claude-sonnet-5', slot: 'A', provider: 'anthropic', env: 'ANTHROPIC_API_KEY', preference: 1 },
  grokFast: { id: 'grok-4-fast-non-reasoning', slot: 'B', provider: 'xai', env: 'XAI_API_KEY', preference: 1 },
  grokStrong: { id: 'grok-4.6', slot: 'B', provider: 'xai', env: 'XAI_API_KEY', preference: 2 },
  gemini: { id: 'gemini-3.8-flash', slot: 'C', provider: 'gemini', env: 'GEMINI_API_KEY', preference: 0 },
  openaiMini: { id: 'gpt-5.4-mini', slot: 'C', provider: 'openai', env: 'OPENAI_API_KEY', preference: 1 },
  // Slot D: used by 'execute' only (the strict-JSON Do It proposal), never by draft, summary or classify. Both are OpenAI-compatible HTTP APIs
  // and both are asked for JSON mode. The ids are the providers' documented aliases and are UNVERIFIED from this environment: check them in
  // each provider's console before setting the key. A provider with no key configured is never called.
  mistralLarge: { id: 'mistral-large-latest', slot: 'D', provider: 'mistral', env: 'MISTRAL_API_KEY', preference: 0 },
  llama70b: { id: 'meta-llama/Meta-Llama-3-70B-Instruct', slot: 'D', provider: 'llama', env: 'LLAMA_API_KEY', preference: 1 },
  // 'deepseek-chat' is the retired alias and answers 400; the current id is deepseek-v4-pro (owner's 2026 spec, not verifiable from here).
  deepseek: { id: 'deepseek-v4-pro', slot: 'D', provider: 'deepseek', env: 'DEEPSEEK_API_KEY', preference: 2 }
};

// The strict order for 'execute', in one place. A provider with no key, or an open circuit, is skipped; the rest keep this order.
const EXECUTE_ORDER = ['mistralLarge', 'llama70b', 'sonnet', 'grokStrong', 'deepseek'];

const EMAIL_LEAK = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE_LEAK = /\+\d{1,3}[-.\s]?\(?\d{1,4}\)?(?:[-.\s]?\d{2,4}){1,4}|(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/;
const MONEY_LEAK = /(?:\$|€|£|₪|₹)\s?\d|\b\d[\d.,]*\s?(?:USD|EUR|GBP|ILS|NIS)\b|\b(?:USD|EUR|GBP|ILS|NIS)\s?\d/i;
const ISO_LEAK = /\b\d{4}-\d{2}-\d{2}\b/;
const MONTH_LEAK = /\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}\b/i;

function silenceResult() {
  return { type: null, who: '', what: '', when: '', dateIso: null, amount: '', requestWhat: '' };
}

function envGet(name) {
  try {
    if (typeof Netlify !== 'undefined' && Netlify.env && typeof Netlify.env.get === 'function') {
      const fromNetlify = Netlify.env.get(name);
      if (fromNetlify) return fromNetlify;
    }
  } catch (err) { /* unit tests run outside the Netlify runtime */ }
  return process.env[name] || '';
}

function readEnv(overrides) {
  const out = {};
  for (const name of ENV_KEYS.concat(['LLAMA_API_URL', 'LLAMA_MODEL'])) {
    let value = '';
    if (overrides && Object.prototype.hasOwnProperty.call(overrides, name)) value = overrides[name];
    else value = envGet(name);
    out[name] = String(value || '').trim();
  }
  return out;
}

function createState() {
  return { models: Object.create(null) };
}

let sharedState = createState();

function resetState() {
  sharedState = createState();
}

function modelRow(state, id) {
  if (!state.models[id]) state.models[id] = { failures: 0, openUntil: 0, latencyMs: null };
  return state.models[id];
}

function circuitOpen(model, state, now) {
  const row = state.models && state.models[model.id];
  return Boolean(row && row.openUntil && now < row.openUntil);
}

function available(model, env, state, now) {
  if (!env[model.env]) return false;
  if (circuitOpen(model, state, now)) return false;
  return true;
}

function noteFailure(state, id, now, status) {
  const row = modelRow(state, id);
  row.failures += 1;
  const code = Number(status) || 0;
  const clock = Number.isFinite(now) ? now : Date.now();
  if (code === 401 || code === 403 || code === 429 || row.failures >= FAILURES_TO_OPEN) {
    row.openUntil = clock + OPEN_MS;
  }
}

function noteSuccess(state, id, latencyMs) {
  const row = modelRow(state, id);
  row.failures = 0;
  row.openUntil = 0;
  row.latencyMs = latencyMs;
}

function latencyOf(state, id) {
  const row = state.models && state.models[id];
  if (!row || row.latencyMs == null) return Infinity;
  return row.latencyMs;
}

function bySpeed(state) {
  return (a, b) => {
    const delta = latencyOf(state, a.id) - latencyOf(state, b.id);
    if (delta !== 0) return delta;
    return a.preference - b.preference;
  };
}

function fastPair(env, state, now) {
  return [MODELS.haiku, MODELS.grokFast].filter((model) => available(model, env, state, now)).sort(bySpeed(state));
}

// OpenAI stands in for Gemini only when Gemini cannot be selected at plan
// time. A later HTTP failure of Gemini does not rebuild the plan.
function chooseSlotC(env, state, now) {
  if (available(MODELS.gemini, env, state, now)) return MODELS.gemini;
  const missing = !env.GEMINI_API_KEY;
  const open = circuitOpen(MODELS.gemini, state, now);
  if ((missing || open) && available(MODELS.openaiMini, env, state, now)) return MODELS.openaiMini;
  return null;
}

function describe(model) {
  return { id: model.id, model: model.id, slot: model.slot, provider: model.provider };
}

function planRoute(action, opts) {
  opts = opts || {};
  const env = readEnv(opts.env);
  const state = opts.state || sharedState;
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  let models = [];
  if (action === 'summarize-attachment') {
    const slotC = chooseSlotC(env, state, now);
    models = (slotC ? [slotC] : []).concat(fastPair(env, state, now));
  } else if (action === 'draft-reply') {
    models = fastPair(env, state, now);
  } else if (action === 'classify') {
    models = [MODELS.sonnet, MODELS.grokStrong].filter((model) => available(model, env, state, now));
  } else if (action === 'ladder') {
    // The deeper read (core/ai-ladder.js): the fast pair for every plan; the strong pair only when the caller asks for the strong tier, which glance-assist's
    // ladder handler does for Pro alone. Cheapest-first is the order of the two calls, not of this list.
    models = (opts.tier === 'strong' ? [MODELS.sonnet, MODELS.grokStrong].filter((model) => available(model, env, state, now)) : fastPair(env, state, now));
  } else if (action === 'execute') {
    // The owner's order for the strict-JSON proposal (EXECUTE_ORDER): Mistral Large, Llama-3-70B (serverless), Sonnet, Grok-strong, DeepSeek as the backup. Each is skipped when it has no key or its circuit is open. Cheapest-first routing is a separate owner decision (open-tasks row 29).
    models = EXECUTE_ORDER.map((key) => MODELS[key]).filter((model) => available(model, env, state, now));
  }
  // Classify and draft never keep slot C, including when it is the only
  // configured provider. Summarize is the only action allowed to use it.
  if (action !== 'summarize-attachment') models = models.filter((model) => model.slot !== 'C');
  if (action !== 'execute') models = models.filter((model) => model.slot !== 'D');
  return models.map(describe);
}

function containsContactLeak(text) {
  const value = String(text || '');
  return EMAIL_LEAK.test(value) || PHONE_LEAK.test(value);
}

function containsMoneyLeak(text) {
  return MONEY_LEAK.test(String(text || ''));
}

function containsDateLeak(text) {
  const value = String(text || '');
  return ISO_LEAK.test(value) || MONTH_LEAK.test(value);
}

// Outbound user text: any of these means the mask missed, so we do not send.
// Classify model output may carry an ISO dateIso and a phrased "when";
// drafts and summaries may not carry a raw date, amount, email, or phone.
function leaksPii(text, where) {
  if (containsContactLeak(text) || containsMoneyLeak(text)) return true;
  if (where === 'outbound' || where === 'draft' || where === 'summary') return containsDateLeak(text);
  return false;
}

function scrubField(value, max) {
  const masked = FlowPrivacyShield.mask(String(value == null ? '' : value)).maskedText;
  if (containsContactLeak(masked)) return '';
  return masked.slice(0, max);
}

function localResult(intent) {
  const entities = (intent && intent.entities) || {};
  const dateIso = String(entities.dateIso || '').trim();
  return {
    type: intent.type,
    who: scrubField(entities.who, 200),
    what: scrubField(entities.what, 500),
    when: scrubField(entities.when, 100),
    dateIso: ISO_LEAK.test(dateIso) && /^\d{4}-\d{2}-\d{2}$/.test(dateIso) ? dateIso : null,
    amount: scrubField(entities.amount, 100),
    requestWhat: scrubField(entities.requestWhat, 300)
  };
}

function localPass(text, judgeNow) {
  let intent;
  try {
    intent = FlowIntent.classify(String(text || ''), { now: judgeNow || new Date() });
  } catch (err) {
    // A broken quiet check must not fall through to a model. The name only:
    // the message can echo the text that was being classified.
    console.error('[glance-assist] local classify failed closed', err && err.name);
    return { kind: 'quiet' };
  }
  if (!intent) return { kind: 'miss' };
  if (intent.quiet || intent.googleSilence) return { kind: 'quiet' };
  if (!intent.type) return { kind: 'miss' };
  if (!FlowIntent.shouldShowChip(intent)) return { kind: 'quiet' };
  return { kind: 'hit', result: localResult(intent) };
}

function refusalError() {
  const err = new Error('The model declined to complete this request.');
  err.refusal = true;
  return err;
}

function httpError(status) {
  const err = new Error('provider HTTP ' + status);
  err.status = status;
  return err;
}

function joinText(parts) {
  return parts.map((part) => {
    if (typeof part === 'string') return part;
    return (part && part.text) || '';
  }).join('').trim();
}

async function readBody(res) {
  try { return await res.text(); } catch (err) { return ''; }
}

function parseProvider(provider, raw) {
  let data;
  try { data = JSON.parse(raw); } catch (err) {
    throw httpError(502);
  }
  if (provider === 'anthropic') {
    if (data.stop_reason === 'refusal') throw refusalError();
    const text = joinText((data.content || []).filter((block) => block && block.type === 'text'));
    if (!text) throw httpError(502);
    return text;
  }
  if (provider === 'gemini') {
    const feedback = data.promptFeedback;
    if (feedback && feedback.blockReason) throw refusalError();
    const candidate = (data.candidates || [])[0];
    if (!candidate) throw httpError(502);
    if (candidate.finishReason === 'SAFETY' || candidate.finishReason === 'PROHIBITED_CONTENT' || candidate.finishReason === 'BLOCKLIST') {
      throw refusalError();
    }
    const text = joinText((candidate.content && candidate.content.parts) || []);
    if (!text) throw httpError(502);
    return text;
  }
  const choice = (data.choices || [])[0];
  if (!choice) throw httpError(502);
  if (choice.finish_reason === 'content_filter') throw refusalError();
  const text = joinText([choice.message && choice.message.content]);
  if (!text) throw httpError(502);
  return text;
}

function requestFor(model, env, system, userText, maxTokens) {
  if (model.provider === 'anthropic') {
    return {
      url: ANTHROPIC_URL,
      headers: {
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': ANTHROPIC_VERSION,
        'Content-Type': 'application/json'
      },
      body: { model: model.id, max_tokens: maxTokens, system, messages: [{ role: 'user', content: userText }] }
    };
  }
  if (model.provider === 'gemini') {
    return {
      url: GEMINI_URL,
      headers: { 'x-goog-api-key': env.GEMINI_API_KEY, 'Content-Type': 'application/json' },
      body: {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: userText }] }],
        generationConfig: { maxOutputTokens: maxTokens }
      }
    };
  }
  const llamaUrl = String(env.LLAMA_API_URL || '').trim() || LLAMA_DEFAULT_URL;
  const url = model.provider === 'openai' ? OPENAI_URL : model.provider === 'mistral' ? MISTRAL_URL : model.provider === 'deepseek' ? DEEPSEEK_URL : model.provider === 'llama' ? llamaUrl : XAI_URL;
  const key = env[model.env];
  const body = {
    model: model.id,
    messages: [{ role: 'system', content: system }, { role: 'user', content: userText }]
  };
  if (model.provider === 'llama' && String(env.LLAMA_MODEL || '').trim()) body.model = String(env.LLAMA_MODEL).trim();
  if (model.provider === 'openai') body.max_completion_tokens = maxTokens;
  else body.max_tokens = maxTokens;
  if (model.slot === 'D') { body.response_format = { type: 'json_object' }; body.temperature = 0; }
  return {
    url,
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body
  };
}

function hostedHttps(url) {
  try { const u = new URL(url); return u.protocol === 'https:' && !/^(localhost|127\.|10\.|192\.168\.|169\.254\.)/.test(u.hostname); } catch (e) { return false; }
}

async function invoke(model, env, system, userText, maxTokens, fetchImpl) {
  const req = requestFor(model, env, system, userText, maxTokens);
  if (!hostedHttps(req.url)) throw httpError(400);                 // a mistyped LLAMA_API_URL must never send text to a local or plain-http address
  const res = await fetchImpl(req.url, {
    method: 'POST',
    headers: req.headers,
    body: JSON.stringify(req.body),
    signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS)
  });
  const raw = await readBody(res);
  if (!res.ok) throw httpError(res.status || 502);
  return parseProvider(model.provider, raw);
}

function piiError() {
  const err = new Error('Refusing to send unmasked contact details.');
  err.pii = true;
  err.status = 422;
  return err;
}

function configError() {
  const err = new Error('No LLM provider configured');
  err.configMissing = true;
  return err;
}

function exhaustedError(refusalsOnly) {
  if (refusalsOnly) return refusalError();
  const err = new Error('All providers failed');
  err.status = 502;
  err.exhausted = true;
  return err;
}

function outputWhere(action) {
  if (action === 'classify' || action === 'ladder') return 'classify';
  if (action === 'summarize-attachment') return 'summary';
  return 'draft';
}

async function callRoutedLlm(opts) {
  opts = opts || {};
  const action = opts.action;
  const clock = Number.isFinite(opts.now) ? opts.now : Date.now();
  const judgeNow = opts.judgeNow || new Date(clock);
  const state = opts.state || sharedState;
  const env = readEnv(opts.env);

  if (action === 'classify') {
    const judged = localPass(opts.judgeText != null ? opts.judgeText : opts.userText, judgeNow);
    if (judged.kind === 'quiet') return { silence: true, quiet: true, local: true, result: silenceResult() };
    if (judged.kind === 'hit') return { local: true, result: judged.result, route: { provider: 'local', model: 'judgment.js', slot: null } };
  }

  // The server masks again whatever it receives, so a client that skipped masking still cannot put a name, amount, date, contact detail or labelled
  // identifier in front of a provider. 'execute' also gets the identifier pass (the one the extension runs); the others keep the shield alone.
  const masked = (action === 'execute' || action === 'ladder' ? FlowMaskIds.maskAll(String(opts.userText || ''), FlowPrivacyShield) : FlowPrivacyShield.mask(String(opts.userText || ''))).maskedText;
  if (leaksPii(masked, 'outbound')) {
    if (action === 'classify') return { silence: true, local: true, result: silenceResult() };
    throw piiError();
  }

  const plan = planRoute(action, { env, state, now: clock, tier: opts.tier });
  if (!plan.length) {
    if (action === 'classify') return { silence: true, result: silenceResult() };
    throw configError();
  }

  const fetchImpl = opts.fetchImpl || fetch;
  const where = outputWhere(action);
  let refusals = 0;
  let failures = 0;
  for (const candidate of plan) {
    if (candidate.slot === 'C' && action !== 'summarize-attachment') continue;
    const model = Object.keys(MODELS).map((key) => MODELS[key]).find((item) => item.id === candidate.id);
    if (!model) continue;
    const started = Date.now();
    let text;
    try {
      text = await invoke(model, env, opts.system || '', masked, opts.maxTokens || 400, fetchImpl);
    } catch (err) {
      if (err && err.refusal) { refusals += 1; continue; }
      failures += 1;
      noteFailure(state, model.id, clock, err && err.status);
      continue;
    }
    if (leaksPii(text, where)) { failures += 1; continue; }
    let accepted = false;
    try {
      accepted = opts.accept ? opts.accept(text) === true : Boolean(String(text).trim());
    } catch (err) { accepted = false; }
    if (!accepted) { failures += 1; continue; }
    noteSuccess(state, model.id, Date.now() - started);
    return { text, route: candidate };
  }

  if (action === 'classify') return { silence: true, result: silenceResult() };
  throw exhaustedError(refusals > 0 && failures === 0);
}

module.exports = {
  ENV_KEYS,
  MODELS,
  OPEN_MS,
  FAILURES_TO_OPEN,
  callRoutedLlm,
  planRoute,
  createState,
  resetState,
  noteFailure,
  noteSuccess,
  silenceResult,
  leaksPii,
  localPass
};
