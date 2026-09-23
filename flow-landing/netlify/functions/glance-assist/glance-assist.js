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
// Anthropic (api.anthropic.com) is the only third party this data reaches.
// Unlike Flow (built for organizations handling regulated, sensitive data,
// where content never leaving the device is a hard guarantee), Glance has
// never made that same promise — this masked round trip is the deliberate,
// disclosed boundary for what it does send, not a departure from an
// existing one.
//
// Deliberately raw `fetch()` rather than @anthropic-ai/sdk: every function in
// this directory (see package.json — "type": "commonjs", zero dependencies)
// is intentionally dependency-free so Netlify's per-function bundling never
// needs a build step. Introducing the first npm dependency this directory
// has ever had is a real infrastructure decision for whoever owns the
// Netlify project, not something to do silently in a function nobody asked
// to add a build step for.

const crypto = require('crypto');

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
// TODO(owner): pick the model this feature should actually run in production.
// claude-opus-5 is used here as the safe, most-capable default; for a
// synchronous, click-and-wait sidebar action, a faster/cheaper model
// (e.g. a Sonnet-tier model) may be the better tradeoff once this is live —
// swap the string below, nothing else in this file depends on which model it is.
const MODEL = 'claude-opus-5';
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

async function callClaude(system, userText, maxTokens) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const err = new Error('ANTHROPIC_API_KEY not configured');
    err.configMissing = true;
    throw err;
  }

  const res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      // Low effort: this drafts a short reply or summarizes one attachment
      // from already-masked, already-extracted text — not a multi-step
      // reasoning task — and it backs a synchronous "wait for it" sidebar
      // action where latency matters more than depth here.
      output_config: { effort: 'low' },
      system,
      messages: [{ role: 'user', content: userText }]
    })
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    const err = new Error('Anthropic API error ' + res.status + (detail ? ': ' + detail.slice(0, 300) : ''));
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  if (data.stop_reason === 'refusal') {
    const err = new Error('The model declined to complete this request.');
    err.refusal = true;
    throw err;
  }
  const textBlock = (data.content || []).find((b) => b.type === 'text');
  if (!textBlock) throw new Error('No text in model response');
  return textBlock.text.trim();
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

  const system = lang === 'he' ? DRAFT_SYSTEM_HE : DRAFT_SYSTEM_EN;
  const draftText = await callClaude(system, threadText, 1200);
  return { draftText };
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

  const raw = await callClaude(SUMMARY_SYSTEM, text, 500);
  const parsed = safeParseJson(raw);
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
  return { summary: parsed.summary, entities };
}

// ---- Feature 0: remote classification fallback -----------------------------
//
// core/judgment.js + core/intent.js are the free, always-on, fully local
// path — a fixed regex/keyword corpus, not real language understanding. It
// stays the default for every message (no network call, no latency, no
// cost) because most English business email already clears it reliably.
// This action exists for the messages it can't reach: content-gmail.js
// calls it only as a fallback, when the local classifier returns
// { type: null }, and only for masked text — same privacy contract as
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
  const raw = await callClaude(system, (lang === 'he' ? '[Hebrew email]\n' : '') + text, 300);
  const result = safeParseClassification(raw);
  if (!result) {
    const err = new Error('Could not parse a classification from the model response.');
    err.status = 502;
    throw err;
  }
  return result;
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

  const action = payload.action;
  try {
    if (action === 'draft-reply') {
      const result = await draftReply(payload);
      log('draft generated', { entries: (payload.entries || []).length, lang: payload.lang });
      return { statusCode: 200, body: JSON.stringify({ ok: true, draftText: result.draftText }) };
    }
    if (action === 'summarize-attachment') {
      const result = await summarizeAttachment(payload);
      log('attachment summarized');
      return { statusCode: 200, body: JSON.stringify({ ok: true, summary: result.summary, entities: result.entities }) };
    }
    if (action === 'classify') {
      const result = await classify(payload);
      log('classified', { lang: payload.lang, type: result.type });
      return { statusCode: 200, body: JSON.stringify({ ok: true, result }) };
    }
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid action' }) };
  } catch (err) {
    if (err.configMissing) {
      logErr('ANTHROPIC_API_KEY not configured');
      return { statusCode: 500, body: JSON.stringify({ error: 'This feature is not configured yet. Please email hello@theflow-ai.com.' }) };
    }
    if (err.refusal) {
      logErr('model refused');
      return { statusCode: 422, body: JSON.stringify({ error: 'Could not complete that request.' }) };
    }
    logErr(action + ' failed', String(err.message || err));
    return { statusCode: err.status || 502, body: JSON.stringify({ error: err.status === 400 ? err.message : 'We could not complete that. Please try again.' }) };
  }
};
