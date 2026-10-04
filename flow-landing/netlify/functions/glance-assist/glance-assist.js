// Masked-LLM backend for the Glance Chrome extension: Draft-It (Feature 2),
// Attachment X-ray (Feature 3), and — since this file's 'classify' action
// was added — a remote fallback for the passive "Do It" chip's own local
// classifier when it finds nothing.
//
// The extension's core/privacyShield.js masks names, companies, monetary
// amounts, and dates BEFORE any text reaches this function — this function
// (and the model it calls) only ever sees placeholder tokens like
// [CLIENT_NAME_1], never the real values. The token <-> real-value map never
// leaves the browser tab that built it, so a real name/amount/date is never
// reconstructed anywhere but the user's own device: this function receives
// masked text, the model drafts a reply, summary, or classification using
// the same masked tokens, and the extension's privacyShield.unmask()
// substitutes real values back in locally, after the round trip, using a
// map only it holds.
//
// judgment.js and extract.js (the free, always-on local classifier) still
// send nothing anywhere for every message they can classify on their own —
// most English business email. This function is what the passive chip
// reaches for only when that local pass returns no classification at all
// (see content-gmail.js's ensureRemoteClassification), not on every
// message. Even then it only ever sees masked placeholders, never raw PII.
// model-router.js picks the provider per action (Anthropic, xAI, Gemini;
// OpenAI mini only as Gemini's stand-in for summaries) and masks again
// before every call. Classify stays on Sonnet then Grok; it is never sent
// to Gemini or OpenAI. Unlike Flow (built for organizations handling
// regulated, sensitive data, where content never leaving the device is a
// hard guarantee), Glance has never made that same promise — this masked
// round trip is the deliberate, disclosed boundary for what it does send,
// not a departure from an existing one.
//
// Deliberately raw `fetch()` rather than a provider SDK: every function in
// this directory (see package.json — "type": "commonjs", zero dependencies)
// is intentionally dependency-free so Netlify's per-function bundling never
// needs a build step. Introducing the first npm dependency this directory
// has ever had is a real infrastructure decision for whoever owns the
// Netlify project, not something to do silently in a function nobody asked
// to add a build step for.

const crypto = require('crypto');
const { callRoutedLlm, silenceResult } = require('./model-router.js');
const license = require('../verify-license/license-core.js');
const { styleLine } = require('./style-hints.js');
const { FlowJsonEnforce } = require('../../../../flow-trial-extension/core/json-enforce.js');
const { createLadder } = require('./ladder.js');

const LOG_PREFIX = '[glance-assist]';

const LIMITS = { threadEntry: 6000, entries: 4, attachmentText: 20000 };

const RATE = new Map();
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX = 20; // higher than submit-waitlist's — this backs an interactive tool a user may retry/redraft several times in one session

function rateLimited(key, now) {
  const hits = (RATE.get(key) || []).filter((t) => now - t < RATE_WINDOW_MS);
  hits.push(now);
  RATE.set(key, hits);
  if (RATE.size > 5000) for (const [k, v] of RATE) if (!v.some((t) => now - t < RATE_WINDOW_MS)) RATE.delete(k);
  return hits.length > RATE_MAX;
}

function clean(value, max) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

// ---- Feature 2: Draft-It ---------------------------------------------------
//
// entries: [{ position: 'current'|'previous', maskedBody: string }], newest
// (current) first — the content script harvests the open message plus up to
// 3 prior messages in the thread, masks each independently, and sends them
// in that shape so this function never has to guess which one is the one
// actually being replied to.
const DRAFT_SYSTEM_EN =
  'You draft professional email replies for enterprise, legal, and insurance ' +
  'correspondence. You will be given an email thread where sensitive entities ' +
  '(names, companies, monetary amounts, dates, email addresses, phone numbers) have ' +
  'already been replaced with placeholder tokens like [CLIENT_NAME_1], [COMPANY_A], ' +
  '[CURRENCY_VAL_1], [DATE_1], [EMAIL_1], [PHONE_1]. ' +
  'Write a reply to the most recent message, using those exact placeholder tokens ' +
  'wherever the real entity would appear — never invent a name, amount, date, email ' +
  'address, or phone number; ' +
  'only ever reuse the tokens you were given. Match the register and phrasing of the ' +
  'thread. Output only the reply body text, no subject line, no signature block, no ' +
  'commentary about what you did.';

const DRAFT_SYSTEM_HE =
  'אתה מנסח תשובות מקצועיות למיילים בתחומי עסקים, משפט וביטוח. תקבל שרשור מייל שבו ' +
  'ישויות רגישות (שמות, חברות, סכומי כסף, תאריכים, כתובות מייל, מספרי טלפון) כבר הוחלפו ' +
  'באסימונים כמו [CLIENT_NAME_1], [COMPANY_A], [CURRENCY_VAL_1], [DATE_1], [EMAIL_1], ' +
  '[PHONE_1]. כתוב תשובה להודעה ' +
  'האחרונה תוך שימוש באותם אסימונים בדיוק במקום שבו הייתה מופיעה הישות האמיתית — לעולם ' +
  'אל תמציא שם, סכום, תאריך, כתובת מייל או מספר טלפון; השתמש רק באסימונים שקיבלת. התאם את הרישום והניסוח ' +
  'לשרשור. פלט רק את גוף התשובה, בלי כותרת נושא, בלי חתימה, בלי הערות על מה שעשית.';

async function draftReply(payload) {
  const lang = payload.lang === 'he' ? 'he' : 'en';
  const entries = Array.isArray(payload.entries) ? payload.entries.slice(0, LIMITS.entries) : [];
  if (!entries.length) throw badRequest('No thread content provided.');

  const threadText = entries
    .map((e, i) => {
      const label = e.position === 'current' ? 'Most recent message (reply to this one)' : 'Earlier message ' + (i + 1);
      return '--- ' + label + ' ---\n' + clean(e.maskedBody, LIMITS.threadEntry);
    })
    .join('\n\n');

  const system = (lang === 'he' ? DRAFT_SYSTEM_HE : DRAFT_SYSTEM_EN) + styleLine(payload.style, lang);
  const out = await callRoutedLlm({ action: 'draft-reply', system, userText: threadText, maxTokens: 1200 });
  return { draftText: out.text, route: out.route };
}

// ---- Feature 3: attachment summarization -----------------------------------

const SUMMARY_SYSTEM =
  'You triage business documents (contracts, invoices, agreements) so someone can ' +
  'decide whether to open the full attachment. You will be given text already ' +
  'extracted from one document, with sensitive entities replaced by placeholder ' +
  'tokens like [CLIENT_NAME_1], [COMPANY_A], [CURRENCY_VAL_1], [DATE_1], [EMAIL_1], [PHONE_1]. Respond with ' +
  'ONLY a JSON object, no other text, shaped exactly like: ' +
  '{"summary": "one sentence, e.g. \'Updated Lease Agreement – Opposing counsel deleted the indemnification clause.\'", ' +
  '"entities": {"counterparty": "...", "effectiveDate": "...", "financialValue": "...", "governingLaw": "..."}}. ' +
  'Use the placeholder tokens verbatim wherever a real entity would appear — never invent one. ' +
  'Use an empty string for any entity field the document does not state.';

function safeParseJson(text) {
  try { return JSON.parse(text); } catch (e) { /* fall through to brace-extraction below */ }
  const match = text.match(/\{[\s\S]*\}/);
  if (match) { try { return JSON.parse(match[0]); } catch (e2) { /* give up below */ } }
  return null;
}

async function summarizeAttachment(payload) {
  const text = clean(payload.maskedText, LIMITS.attachmentText);
  if (!text) throw badRequest('No attachment text provided.');

  // A response that is not the summary JSON is not a summary. The router
  // tries the next provider; if none produce one, this throws 502 rather
  // than returning the attachment text or a sentence we made up.
  const out = await callRoutedLlm({
    action: 'summarize-attachment',
    system: SUMMARY_SYSTEM,
    userText: text,
    maxTokens: 500,
    accept: (raw) => {
      const parsed = safeParseJson(raw);
      return Boolean(parsed && typeof parsed.summary === 'string' && parsed.summary.trim());
    }
  });
  const parsed = safeParseJson(out.text);
  if (!parsed || typeof parsed.summary !== 'string') {
    const err = new Error('Could not parse a summary from the model response.');
    err.status = 502;
    throw err;
  }
  const e = parsed.entities || {};
  const entities = [
    ['Counterparty', e.counterparty || '—'],
    ['Effective Date', e.effectiveDate || '—'],
    ['Financial Value', e.financialValue || '—'],
    ['Governing Law', e.governingLaw || '—']
  ];
  return { summary: parsed.summary, entities, route: out.route };
}

// ---- Feature 0: remote classification fallback -----------------------------
//
// core/judgment.js + core/intent.js are the free, always-on, fully local
// path — a fixed regex/keyword corpus, not real language understanding. It
// stays the default for every message (no network call, no latency, no
// cost) because most English business email already clears it reliably.
// This action exists for the messages it can't reach: content-gmail.js
// calls it only as a fallback, when the local classifier returns
// { type: null } and did not choose silence (a quiet reason, a low score,
// a Drive close that stayed quiet). The router runs that same local pass
// again and will not send a quiet message to a model. Masked text only —
// same privacy contract as
// Draft-It and attachment summarization above, not a new one. Glance (unlike
// Flow) has never promised email content stays on-device end to end; this
// is that boundary made concrete rather than assumed.
const CLASSIFY_TYPES = ['request', 'commitment', 'event', 'decision', 'followup', null];
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// {today} is substituted per-request — see classify() below. Without an
// anchor date, "next Tuesday" / "עד יום שלישי הבא" has no fixed point to
// resolve against, and the model has no other way to know what day it is.
const CLASSIFY_SYSTEM_TEMPLATE =
  'Today\'s date is {today} (YYYY-MM-DD). You classify a single business email into ' +
  'exactly one decision type, or none. ' +
  'You will be given text with sensitive entities already replaced by placeholder ' +
  'tokens like [CLIENT_NAME_1], [COMPANY_A], [CURRENCY_VAL_1], [DATE_1], [EMAIL_1], [PHONE_1]. ' +
  'Respond with ONLY a JSON object, no other text, shaped exactly like: ' +
  '{"type": "request"|"commitment"|"event"|"decision"|"followup"|null, ' +
  '"who": "...", "what": "...", "when": "...", "dateIso": "YYYY-MM-DD or empty string", ' +
  '"amount": "...", "requestWhat": "..."}. ' +
  'Definitions: "request" = someone is asking the reader to do something specific. ' +
  '"commitment" = the reader themselves committed to doing something. ' +
  '"event" = a specific meeting or scheduled event is being set or confirmed. ' +
  '"decision" = a decision, agreement, or figure was confirmed and should be logged. ' +
  '"followup" = a follow-up action is needed but does not fit the other four. ' +
  'Use null only when the email is informational, automated, a newsletter, a cold ' +
  'pitch, or otherwise does not call for any of the above. ' +
  '"when" is the date/deadline as the email itself phrases it (e.g. "next Tuesday", ' +
  '"עד יום שלישי"); "dateIso" is that same date resolved against today\'s date above, ' +
  'in YYYY-MM-DD form — empty string if the email states no date at all. ' +
  'Use the placeholder tokens verbatim wherever a real entity would appear in who/what/' +
  'requestWhat/amount — never invent a name, amount, date, or detail the email does not ' +
  'state. Use an empty string for any field the email does not give you.';

function safeParseClassification(text) {
  const parsed = safeParseJson(text);
  if (!parsed || typeof parsed !== 'object') return null;
  if (!CLASSIFY_TYPES.includes(parsed.type)) return null;
  const dateIso = clean(parsed.dateIso, 10);
  return {
    type: parsed.type,
    who: clean(parsed.who, 200),
    what: clean(parsed.what, 500),
    when: clean(parsed.when, 100),
    dateIso: ISO_DATE_RE.test(dateIso) ? dateIso : null,
    amount: clean(parsed.amount, 100),
    requestWhat: clean(parsed.requestWhat, 300)
  };
}

async function classify(payload) {
  const lang = payload.lang === 'he' ? 'he' : 'en';
  const text = clean(payload.maskedText, LIMITS.threadEntry);
  if (!text) throw badRequest('No message text provided.');

  const today = new Date().toISOString().slice(0, 10);
  const system = CLASSIFY_SYSTEM_TEMPLATE.replace('{today}', today);
  // judgeText is the message alone. The router runs local judgment on it
  // before any provider: a quiet decision comes back { type: null } and
  // Sonnet is not asked to overturn it. A miss that no provider can parse
  // is the same silence — never a type we invented to fill the gap.
  const out = await callRoutedLlm({
    action: 'classify',
    system,
    judgeText: text,
    userText: (lang === 'he' ? '[Hebrew email]\n' : '') + text,
    maxTokens: 300,
    accept: (raw) => safeParseClassification(raw) !== null
  });
  if (out.silence || out.local) return { result: out.result, route: out.route || null };
  const result = safeParseClassification(out.text);
  return { result: result || silenceResult(), route: out.route || null };
}

// ---- Tier 1 of the hybrid execution path: a strong model proposes ONE Do It action, as strict JSON -------------------------------------
// docs/hybrid-execution-architecture.md. The extension sends only masked text (core/exec-router.js refuses to send anything else, and the router
// below masks again). The system prompt is built HERE from the shared schema: the client's own "instructions" field is ignored, so a modified
// client cannot change what the model is told. The answer is validated against the same schema before it is returned, and returned as canonical
// JSON text; the extension parses and validates it again, restores the placeholders on the device, and shows it as a proposal.
async function execute(payload) {
  const maskedPrompt = clean(payload.maskedPrompt, LIMITS.threadEntry * 2);
  if (!maskedPrompt) throw badRequest('No text provided.');
  const system =
    'You propose exactly one action for an email assistant. The text you receive has had names, companies, amounts, dates, e-mail addresses, phone numbers and ' +
    'identifiers replaced with placeholder tokens like [CLIENT_NAME_1], [CURRENCY_VAL_1], [DATE_1], [ID_1]. Use those tokens exactly as given wherever the real value ' +
    'would appear; never invent a value. Dates are never written as dates: quote the words or the token (for example "by Friday" or "[DATE_1]").\n' +
    FlowJsonEnforce.instructions(FlowJsonEnforce.ACTION_SCHEMA, 'A');
  const out = await callRoutedLlm({
    action: 'execute',
    system,
    userText: maskedPrompt,
    maxTokens: 400,
    accept: (raw) => FlowJsonEnforce.parse(raw, FlowJsonEnforce.ACTION_SCHEMA).ok
  });
  const parsed = FlowJsonEnforce.parse(out.text, FlowJsonEnforce.ACTION_SCHEMA);
  if (!parsed.ok) throw Object.assign(new Error('The model did not return a valid action.'), { status: 502 });
  return { text: JSON.stringify(parsed.value), route: out.route || null };
}

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

exports.handler = async function (event) {
  const reqId = crypto.randomBytes(4).toString('hex');
  const log = (msg, extra) => console.log(LOG_PREFIX, '[' + reqId + ']', msg, extra !== undefined ? extra : '');
  const logErr = (msg, extra) => console.error(LOG_PREFIX, '[' + reqId + ']', msg, extra !== undefined ? extra : '');

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const headers = event.headers || {};
  const ip = String(headers['x-nf-client-connection-ip'] || headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
  if (rateLimited(ip, Date.now())) {
    logErr('rate limited');
    return { statusCode: 429, body: JSON.stringify({ error: 'Too many requests. Please try again shortly.' }) };
  }

  // The deeper read is the one action that is not Pro-only: a Free person has a small monthly allowance (docs/ai-ladder.md). It does its own identity and
  // counting (ladder.js), and it is off until the owner sets GLANCE_AI_LADDER to the languages that passed the measurement (en, he).
  if (payload.action === 'ladder-read' || payload.action === 'ladder-status') {
    const ladder = createLadder({ env: process.env, now: Date.now(), ip });
    try {
      const out = payload.action === 'ladder-read' ? await ladder.read(payload) : await ladder.status(payload);
      if (payload.action === 'ladder-read') log('deeper read', { status: out.status, code: out.body.code || null, tier: out.body.tier || null, units: out.body.units || 0 });
      return { statusCode: out.status, body: JSON.stringify(out.body) };
    } catch (err) {
      logErr('deeper read failed', String(err && err.message || err));
      return { statusCode: 503, body: JSON.stringify({ ok: false, code: 'unavailable' }) };
    }
  }

  // Every other action here calls a paid model, so every one of them needs a live Glance
  // Pro licence, checked on the server. The extension also checks locally to
  // avoid a pointless round trip, but this is the check that counts. It fails
  // closed: with licensing unavailable, nothing reaches the model.
  let entitlement;
  try {
    entitlement = await license.checkLicense(payload.licenseKey, process.env, Date.now());
  } catch (err) {
    logErr('licence check failed', String(err && err.message || err));
    return { statusCode: 503, body: JSON.stringify({ ok: false, code: 'license_unavailable', error: 'We could not check your Glance Pro licence just now. Please try again.' }) };
  }
  if (!entitlement.configured) {
    return { statusCode: 503, body: JSON.stringify({ ok: false, code: 'license_unavailable', error: 'Glance Pro is not available right now.' }) };
  }
  if (!entitlement.valid) {
    return { statusCode: 402, body: JSON.stringify({ ok: false, code: 'pro_required', error: 'This feature is part of Glance Pro.' }) };
  }

  const action = payload.action;
  try {
    if (action === 'draft-reply') {
      const result = await draftReply(payload);
      log('draft generated', { entries: (payload.entries || []).length, lang: payload.lang, provider: result.route && result.route.provider, model: result.route && result.route.model });
      return { statusCode: 200, body: JSON.stringify({ ok: true, draftText: result.draftText }) };
    }
    if (action === 'summarize-attachment') {
      const result = await summarizeAttachment(payload);
      log('attachment summarized', { provider: result.route && result.route.provider, model: result.route && result.route.model });
      return { statusCode: 200, body: JSON.stringify({ ok: true, summary: result.summary, entities: result.entities }) };
    }
    if (action === 'classify') {
      const result = await classify(payload);
      log('classified', { lang: payload.lang, type: result.result.type, provider: result.route && result.route.provider, model: result.route && result.route.model });
      return { statusCode: 200, body: JSON.stringify({ ok: true, result: result.result }) };
    }
    if (action === 'execute') {
      const result = await execute(payload);
      log('action proposed', { lang: payload.lang, provider: result.route && result.route.provider, model: result.route && result.route.model });
      return { statusCode: 200, body: JSON.stringify({ ok: true, text: result.text }) };
    }
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid action' }) };
  } catch (err) {
    if (err.configMissing) {
      logErr('no LLM provider configured');
      return { statusCode: 500, body: JSON.stringify({ error: 'This feature is not configured yet. Please email hello@theflow-ai.com.' }) };
    }
    if (err.pii || err.refusal) {
      logErr(err.pii ? 'blocked unmasked contact details' : 'model refused');
      return { statusCode: 422, body: JSON.stringify({ error: 'Could not complete that request.' }) };
    }
    logErr(action + ' failed', String(err.message || err));
    return { statusCode: err.status || 502, body: JSON.stringify({ error: err.status === 400 ? err.message : 'We could not complete that. Please try again.' }) };
  }
};
