// Official Meta webhook and the one send the person approved.
// Off unless GLANCE_META_OFFICIAL is exactly "1". No Meta app is registered here.
// The page token and app secret stay in the environment. They are never written to a log.
const { FlowMetaOfficial: M } = require('../../../../flow-trial-extension/core/meta-official-messaging.js');

const seen = new Map();

function header(event, name) {
  const headers = (event && event.headers) || {};
  const want = String(name || '').toLowerCase();
  const keys = Object.keys(headers);
  for (let i = 0; i < keys.length; i++) {
    if (keys[i].toLowerCase() === want) return headers[keys[i]];
  }
  return '';
}

function rawBody(event) {
  const body = event && event.body ? event.body : '';
  if (event && event.isBase64Encoded) return Buffer.from(body, 'base64');
  return Buffer.from(String(body), 'utf8');
}

function json(status, body) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body)
  };
}

function relayOk(given, expected) {
  const crypto = require('crypto');
  const a = Buffer.from(String(given || ''), 'utf8');
  const b = Buffer.from(String(expected || ''), 'utf8');
  if (!expected || String(expected).length < 16 || a.length !== b.length) {
    if (b.length) crypto.timingSafeEqual(b, b);
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

function pageToken(env, channel) {
  if (channel === 'instagram' && env.META_INSTAGRAM_PAGE_TOKEN) return String(env.META_INSTAGRAM_PAGE_TOKEN);
  return String(env.META_PAGE_ACCESS_TOKEN || '');
}

async function defaultHttp(url, init) {
  const res = await fetch(url, {
    method: init.method,
    headers: init.headers,
    body: init.body,
    redirect: 'error'
  });
  let parsed = null;
  try { parsed = await res.json(); } catch (e) { parsed = null; }
  return { ok: res.ok === true, status: res.status, json: parsed };
}

async function onChallenge(event, env) {
  const result = M.verifyChallenge(event.queryStringParameters || {}, env.META_VERIFY_TOKEN || '');
  if (!result.ok) return { statusCode: 403, body: '' };
  return { statusCode: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body: result.challenge };
}

async function onWebhook(event, env, deps) {
  const raw = rawBody(event);
  if (raw.length > 100000) return { statusCode: 413, body: '' };
  if (!M.verifySignature(raw, header(event, 'x-hub-signature-256'), env.META_APP_SECRET || '')) {
    return { statusCode: 403, body: '' };
  }
  const parsed = M.parseWebhook(raw);
  if (!parsed.ok) return { statusCode: 400, body: '' };
  if (deps && typeof deps.onAccepted === 'function') deps.onAccepted(parsed.items);
  return json(200, { ok: true });
}

async function onSend(event, env, deps) {
  if (!relayOk(header(event, 'x-glance-meta-relay'), env.GLANCE_META_READ_SECRET || '')) {
    return json(401, { ok: false, reason: 'not-authorized' });
  }
  let body;
  try { body = JSON.parse(rawBody(event).toString('utf8') || '{}'); }
  catch (e) { return json(400, { ok: false, reason: 'json' }); }
  const channel = body && body.channel;
  const token = pageToken(env, channel);
  const http = (deps && deps.http) || defaultHttp;
  const result = await M.sendApproved({
    approved: body && body.approved === true,
    enabled: true,
    channel: channel,
    pageId: body && body.pageId,
    recipientId: body && body.recipientId,
    text: body && body.text,
    timestamp: body && body.timestamp,
    messageId: body && body.messageId,
    token: token,
    version: env.META_GRAPH_VERSION || M.DEFAULT_VERSION
  }, http, { now: deps && deps.now, seen: (deps && deps.seen) || seen });
  if (!result.ok) return json(200, { ok: false, reason: result.reason || 'unverified' });
  return json(200, { ok: true, proof: result.proof });
}

async function handle(event, deps) {
  const env = (deps && deps.env) || process.env;
  if (!M.serverOn(env)) return { statusCode: 404, body: '' };
  const method = String((event && event.httpMethod) || 'GET').toUpperCase();
  if (method === 'GET') return onChallenge(event, env);
  if (method !== 'POST') return { statusCode: 405, body: '' };
  const action = String(header(event, 'x-glance-meta-action') || '');
  if (action === 'send') return onSend(event, env, deps || {});
  if (action) return json(400, { ok: false, reason: 'action' });
  return onWebhook(event, env, deps || {});
}

exports.handler = (event) => handle(event);
exports.handle = handle;
