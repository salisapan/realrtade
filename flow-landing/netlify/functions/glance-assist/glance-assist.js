// Masked-LLM backend for the Glance Chrome extension's Draft-It (Feature 2)
// and Attachment X-ray (Feature 3) sidebar tools.
//
// The extension's src/privacyShield.js masks names, companies, monetary
// amounts, and dates BEFORE any text reaches this function — this function
// (and the model it calls) only ever sees placeholder tokens like
// [CLIENT_NAME_1], never the real values. The token <-> real-value map never
// leaves the browser tab that built it, so a real name/amount/date is never
// reconstructed anywhere but the user's own device: this function receives
// masked text, the model drafts a reply or summary using the same masked
// tokens, and the extension's privacyShield.unmask() substitutes real values
// back in locally, after the round trip, using a map only it holds.
//
// This is a deliberate, visible change to how this product describes itself:
// judgment.js and extract.js (the free, always-on part of the extension)
// still send nothing anywhere. This function is opt-in — the Draft-It and
// attachment-preview buttons in the sidebar, not the passive "Do It" chip —
// and even then, only ever sees masked placeholders, never raw PII. Anthropic
// (api.anthropic.com) is the only third party this data reaches; see the
// project's README for how this is described to users.
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
