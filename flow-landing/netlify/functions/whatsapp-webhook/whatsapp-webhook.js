// WhatsApp Cloud API inquiry webhook for Flow.
//
// Replies only to inbound user messages, and only inside the 24-hour
// customer-service window. Nothing is sent when WHATSAPP_BOT_ENABLED is off
// (the default) or when required secrets are missing: the function returns
// 200 and no-ops. Template / marketing / outbound sends are not implemented.
const { verifySignature } = require('./signature');
const { createMemoryStore } = require('./store');
const { step, STEPS } = require('./conversation');
const { sendSessionMessage, withinCustomerServiceWindow } = require('./graph');
const { createHandoffAdapter, buildSummary, chooseRoute } = require('./handoff');
const { isHandoffHours } = require('./hours');

const LOG_PREFIX = '[whatsapp-webhook]';

// Process-local store. Fine for tests. See store.js for the durable follow-up.
const defaultStore = createMemoryStore();

const REQUIRED_SECRETS = [
  'WHATSAPP_PHONE_NUMBER_ID',
  'WHATSAPP_ACCESS_TOKEN',
  'WHATSAPP_APP_SECRET',
  'WHATSAPP_VERIFY_TOKEN',
];

function envOf(event) {
  return (event && event._env) || process.env;
}

function isEnabled(env) {
  const v = String((env && env.WHATSAPP_BOT_ENABLED) || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function secretsReady(env) {
  return REQUIRED_SECRETS.every((key) => String((env && env[key]) || '').trim());
}

function rawBody(event) {
  if (event.body == null) return '';
  if (event.isBase64Encoded) {
    return Buffer.from(event.body, 'base64').toString('utf8');
  }
  return typeof event.body === 'string' ? event.body : JSON.stringify(event.body);
}

function header(event, name) {
  const headers = event.headers || {};
  const want = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (String(k).toLowerCase() === want) return v;
  }
  return '';
}

function query(event, name) {
  const q = event.queryStringParameters || {};
  if (q[name] != null) return q[name];
  // Some proxies flatten hub.mode to hub_mode.
  const flat = name.replace(/\./g, '_');
  if (q[flat] != null) return q[flat];
  return '';
}

function parseInbound(body) {
  const messages = [];
  if (!body || !Array.isArray(body.entry)) return messages;
  for (const entry of body.entry) {
    const changes = (entry && entry.changes) || [];
    for (const change of changes) {
      const value = (change && change.value) || {};
      const contacts = value.contacts || [];
      const profileName = contacts[0] && contacts[0].profile && contacts[0].profile.name;
      for (const msg of value.messages || []) {
        const interactive = msg.interactive || {};
        const button = interactive.button_reply || {};
        const list = interactive.list_reply || {};
        const ts = msg.timestamp ? Number(msg.timestamp) * 1000 : Date.now();
        messages.push({
          id: msg.id,
          from: msg.from,
          timestamp: Number.isFinite(ts) ? ts : Date.now(),
          type: msg.type,
          profileName: profileName || null,
          text: (msg.text && msg.text.body) || '',
          buttonId: button.id || null,
          buttonTitle: button.title || null,
          listId: list.id || null,
          listTitle: list.title || null,
        });
      }
    }
  }
  return messages;
}

function log(...args) {
  console.log(LOG_PREFIX, ...args);
}

async function handleGet(event, env) {
  // Off or unconfigured: 200 no-op, no challenge. Meta will not verify until
  // the flag is on and the verify token is set after an approved deploy.
  if (!isEnabled(env) || !secretsReady(env)) {
    return { statusCode: 200, body: '' };
  }
  const mode = query(event, 'hub.mode');
  const token = query(event, 'hub.verify_token');
  const challenge = query(event, 'hub.challenge');
  if (mode === 'subscribe' && token === env.WHATSAPP_VERIFY_TOKEN) {
    return { statusCode: 200, headers: { 'Content-Type': 'text/plain' }, body: String(challenge) };
  }
  return { statusCode: 403, body: 'Forbidden' };
}

async function processMessage(msg, deps) {
  const { store, env, fetchFn, now, hoursFn, logFn } = deps;
  if (await store.hasMessage(msg.id)) {
    logFn('idempotent skip', msg.id);
    return { sent: 0, skipped: 'idempotent' };
  }

  const prior = await store.getConversation(msg.from);
  const result = step(prior, msg, now, hoursFn);

  if (result.messages.length && !withinCustomerServiceWindow(msg.timestamp || now, now)) {
    logFn('outside 24h window, not sending');
    await store.markMessage(msg.id);
    await store.saveConversation(msg.from, result.state);
    return { sent: 0, skipped: 'window' };
  }

  for (const payload of result.messages) {
    await sendSessionMessage(env, Object.assign({ to: msg.from }, payload), fetchFn);
  }

  if (result.handoff) {
    const route = chooseRoute(result.state, msg.text || msg.buttonTitle || '');
    const summary = buildSummary(result.state, msg, route, result.handoff.reason);
    const adapter = createHandoffAdapter(env, fetchFn, logFn);
    try {
      await adapter.deliver(summary);
    } catch (err) {
      logFn('handoff deliver failed', String(err && err.message || err));
    }
  }

  await store.saveConversation(msg.from, result.state);
  await store.markMessage(msg.id);
  return { sent: result.messages.length, step: result.state.step };
}

async function handlePost(event, env, deps) {
  if (!isEnabled(env) || !secretsReady(env)) {
    return { statusCode: 200, body: JSON.stringify({ ok: true, noop: true }) };
  }

  const raw = rawBody(event);
  const sig = header(event, 'x-hub-signature-256');
  if (!verifySignature(raw, sig, env.WHATSAPP_APP_SECRET)) {
    return { statusCode: 403, body: 'Bad signature' };
  }

  let body;
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch (err) {
    return { statusCode: 400, body: 'Bad payload' };
  }

  const inbound = parseInbound(body);
  let sent = 0;
  try {
    for (const msg of inbound) {
      if (!msg.id || !msg.from) continue;
      const out = await processMessage(msg, deps);
      sent += out.sent || 0;
    }
  } catch (err) {
    log('processing failed', String(err && err.message || err));
    return { statusCode: 500, body: 'Processing failed' };
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true, sent }) };
}

function collectDeps(event, env) {
  return {
    store: (event && event._store) || defaultStore,
    env,
    fetchFn: (event && event._fetch) || fetch,
    now: (event && event._now) || Date.now(),
    hoursFn: (event && event._isHandoffHours) || isHandoffHours,
    logFn: (event && event._log) || log,
  };
}

exports.handler = async function (event) {
  const env = envOf(event);
  const method = (event.httpMethod || event.method || 'GET').toUpperCase();
  if (method === 'GET') return handleGet(event, env);
  if (method === 'POST') return handlePost(event, env, collectDeps(event, env));
  return { statusCode: 405, body: 'Method not allowed' };
};

exports._internal = {
  isEnabled,
  secretsReady,
  parseInbound,
  rawBody,
  STEPS,
};
