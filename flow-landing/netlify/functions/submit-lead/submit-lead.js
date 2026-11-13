// Enterprise enquiries from contact.html.
//
// This exists because the enterprise path used to end in a mailto: link. On a
// managed corporate desktop — which is most of the buyers Flow sells to — a
// mailto: often opens nothing at all, and when it does the visitor has to
// compose a cold email from scratch. Every lead that did arrive came with no
// qualification, no attribution, and no analytics event, so there was no way to
// tell which page produced it.
//
// An enquiry has two ways to reach a person: a row in Supabase (public.leads)
// and a notification email to the owner. Either channel is enough. If the
// write fails or Supabase is not configured, the email still goes out, the
// visitor still gets success, and that email says the lead was NOT stored in
// the database so someone can record it by hand, with every submitted field
// in the body. If the write succeeds and the email fails, the visitor still
// gets success and the failure is logged. The visitor gets an error, pointing
// at hello@theflow-ai.com, only when both channels fail.
const crypto = require('crypto');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FROM = 'Flow <hello@theflow-ai.com>';
const OWNER_EMAIL = 'ai.local.flow@gmail.com';
const SB_URL = 'https://zjquktirlrhbqcnkfaok.supabase.co';
const LOG_PREFIX = '[submit-lead]';
const HAND_BLANK = '(not provided)';

// Bounded so a single field cannot be used to push megabytes into the database
// or into the notification email.
const LIMITS = { email: 200, name: 120, company: 160, role: 120, seats: 40, deployment: 40, timeline: 40, message: 4000 };

// Free-text is rejected on these rather than trusted, so the columns stay
// analysable and a caller cannot smuggle arbitrary content through them.
const SEATS = ['1-10', '11-25', '26-50', '51-200', '200+'];
const DEPLOYMENT = ['masked-cloud', 'flow-edge', 'not-sure'];
const TIMELINE = ['now', 'this-quarter', 'this-year', 'exploring'];

// In-memory, per-container rate limiting. Netlify may run several containers,
// so this is a speed bump rather than a guarantee — but it turns a trivial
// scripted flood into something that needs real effort, which is the honest
// description of what it buys. A durable limit belongs at the edge.
const RATE = new Map();
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX = 5;

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

// The notification is HTML, and the values in it are attacker-supplied.
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// A gateway that echoes the bearer token must not land that token in the logs.
function scrub(value) {
  const secrets = [process.env.SUPABASE_SERVICE_ROLE_KEY, process.env.RESEND_API_KEY].filter(Boolean);
  if (typeof value === 'string') {
    return secrets.reduce((text, secret) => text.split(secret).join('[redacted]'), value);
  }
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === 'object') {
    const copy = {};
    for (const [k, v] of Object.entries(value)) copy[k] = scrub(v);
    return copy;
  }
  return value;
}

// Same columns, same order as the notification that goes out after a stored
// lead. Empty values stay omitted on that path.
const STORED_FIELDS = [
  ['Email', 'email'], ['Name', 'name'], ['Company', 'company'], ['Role', 'role'],
  ['Seats', 'seats'], ['Deployment', 'deployment'], ['Timeline', 'timeline'],
  ['Source', 'source'], ['Message', 'message'],
];

// Language is part of the submitted row. The stored-path email has never
// included it; the hand-record email does, because that message is the only copy.
const HAND_FIELDS = STORED_FIELDS.concat([['Language', 'lang']]);

function emailSubject(lead, stored) {
  const who = String(lead.company || lead.email).replace(/[\r\n]+/g, ' ');
  if (stored) return 'Enterprise enquiry: ' + who;
  return 'NOT stored in the database: Enterprise enquiry: ' + who;
}

function emailHtml(lead, stored) {
  const pairs = stored
    ? STORED_FIELDS.map(([label, key]) => [label, lead[key]]).filter(([, v]) => v)
    : HAND_FIELDS.map(([label, key]) => [label, lead[key] || HAND_BLANK]);
  const rows = pairs
    .map(([k, v]) => '<tr><td style="padding:4px 12px 4px 0; color:#667; vertical-align:top;">' + k + '</td><td style="padding:4px 0;"><b>' + esc(v) + '</b></td></tr>')
    .join('');
  const intro = stored
    ? '<p>New enterprise enquiry from the Flow contact form:</p>'
    : '<p><b>This lead was NOT stored in the database.</b> Record it by hand. This email is the only copy.</p>' +
      '<p>New enterprise enquiry from the Flow contact form:</p>';
  return '<div style="font-family:Arial,Helvetica,sans-serif; font-size:14px; color:#232B44;">' +
    intro +
    '<table role="presentation" cellpadding="0" cellspacing="0">' + rows + '</table></div>';
}

async function storeLead(lead, serviceKey, log, logErr) {
  if (!serviceKey) {
    logErr('SUPABASE_SERVICE_ROLE_KEY not configured — cannot store lead');
    return false;
  }
  try {
    const res = await fetch(SB_URL + '/rest/v1/leads', {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: 'Bearer ' + serviceKey,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(lead),
    });
    if (!res.ok) {
      const detail = await res.text();
      logErr('Supabase rejected the lead insert', { status: res.status, detail });
      return false;
    }
    log('lead stored', { company: lead.company, seats: lead.seats, deployment: lead.deployment });
    return true;
  } catch (err) {
    logErr('network error storing lead', String(err));
    return false;
  }
}

async function notifyOwner(lead, apiKey, stored, log, logErr) {
  if (!apiKey) {
    if (!stored) logErr('RESEND_API_KEY not configured — lead was not stored and owner was not notified');
    return false;
  }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM,
        to: [OWNER_EMAIL],
        reply_to: lead.email,
        subject: emailSubject(lead, stored),
        html: emailHtml(lead, stored),
      }),
    });
    if (!r.ok) {
      logErr('lead notification failed', { status: r.status, response: await r.text() });
      return false;
    }
    if (!stored) log('owner notified; lead was not stored', { company: lead.company, seats: lead.seats, deployment: lead.deployment });
    return true;
  } catch (err) {
    logErr('lead notification threw', String(err));
    return false;
  }
}

function failureResponse(serviceKey) {
  if (!serviceKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Lead capture is not configured. Please email hello@theflow-ai.com.' }) };
  }
  return { statusCode: 502, body: JSON.stringify({ error: 'We could not record that. Please email hello@theflow-ai.com.' }) };
}

exports.handler = async function (event) {
  const reqId = crypto.randomBytes(4).toString('hex');
  const log = (msg, extra) => console.log(LOG_PREFIX, '[' + reqId + ']', msg, extra !== undefined ? scrub(extra) : '');
  const logErr = (msg, extra) => console.error(LOG_PREFIX, '[' + reqId + ']', msg, extra !== undefined ? scrub(extra) : '');

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
  const ip = headers['x-nf-client-connection-ip'] || headers['x-forwarded-for'] || 'unknown';
  if (rateLimited(String(ip).split(',')[0].trim(), Date.now())) {
    logErr('rate limited');
    return { statusCode: 429, body: JSON.stringify({ error: 'Too many requests. Please try again shortly.' }) };
  }

  // Honeypot: a real person never fills a field they cannot see.
  if (clean(payload.website, 200)) {
    log('honeypot tripped — accepting without storing');
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  }

  const email = clean(payload.email, LIMITS.email);
  if (!EMAIL_RE.test(email)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Please enter a valid work email.' }) };
  }

  const lead = {
    email,
    name: clean(payload.name, LIMITS.name) || null,
    company: clean(payload.company, LIMITS.company) || null,
    role: clean(payload.role, LIMITS.role) || null,
    seats: SEATS.includes(payload.seats) ? payload.seats : null,
    deployment: DEPLOYMENT.includes(payload.deployment) ? payload.deployment : null,
    timeline: TIMELINE.includes(payload.timeline) ? payload.timeline : null,
    message: clean(payload.message, LIMITS.message) || null,
    source: clean(payload.source, 60) || 'contact',
    lang: payload.lang === 'he' ? 'he' : 'en',
  };

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const stored = await storeLead(lead, serviceKey, log, logErr);
  const mailed = await notifyOwner(lead, process.env.RESEND_API_KEY, stored, log, logErr);

  // One channel reaching a person is enough. Tell the visitor it failed
  // only when the row was not stored and the owner was not emailed.
  if (stored || mailed) {
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  }
  return failureResponse(serviceKey);
};
