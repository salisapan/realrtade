// Glance Pro licensing, shared by verify-license, stripe-webhook,
// billing-portal and glance-assist.
//
// Design rules this file enforces:
//   - A licence key is DERIVED, not stored. key = HMAC(LICENSE_SECRET, subscription id)
//     rendered as GLNC-XXXXX-XXXXX-XXXXX-XXXXX. The database keeps only its
//     SHA-256 hash, so a leaked table does not leak usable keys, and the buyer's
//     key can still be re-displayed (welcome page, "resend my key") by
//     recomputing it from the subscription id.
//   - Entitlement lives in Stripe's subscription status, mirrored into
//     `licenses` by the webhook. Nothing here trusts the client.
//   - Fail closed. If the database or secret is missing, nobody is entitled.
const crypto = require('crypto');

const SB_URL = 'https://zjquktirlrhbqcnkfaok.supabase.co';
const KEY_PREFIX = 'GLNC';
// Crockford-style alphabet: no 0/O/1/I/L so a key read aloud or typed from an
// email survives transcription.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const GROUPS = 4;
const GROUP_LEN = 5;
const PAST_DUE_GRACE_MS = 3 * 24 * 60 * 60 * 1000;
const NETWORK_TIMEOUT_MS = 6000;
const KEY_RE = new RegExp('^' + KEY_PREFIX + '(-[' + ALPHABET + ']{' + GROUP_LEN + '}){' + GROUPS + '}$');

function deriveKey(secret, subscriptionId) {
  if (!secret || !subscriptionId) throw new Error('licence secret and subscription id are required');
  const digest = crypto.createHmac('sha256', secret).update('glance-pro|' + subscriptionId).digest();
  const chars = [];
  for (let i = 0; i < GROUPS * GROUP_LEN; i++) chars.push(ALPHABET[digest[i] % ALPHABET.length]);
  const groups = [];
  for (let g = 0; g < GROUPS; g++) groups.push(chars.slice(g * GROUP_LEN, (g + 1) * GROUP_LEN).join(''));
  return KEY_PREFIX + '-' + groups.join('-');
}

// Accepts what people actually paste: lower case, spaces, missing dashes.
function normalizeKey(raw) {
  const compact = String(raw == null ? '' : raw).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (compact.length !== KEY_PREFIX.length + GROUPS * GROUP_LEN || !compact.startsWith(KEY_PREFIX)) return null;
  const body = compact.slice(KEY_PREFIX.length);
  const groups = [];
  for (let g = 0; g < GROUPS; g++) groups.push(body.slice(g * GROUP_LEN, (g + 1) * GROUP_LEN));
  const key = KEY_PREFIX + '-' + groups.join('-');
  return KEY_RE.test(key) ? key : null;
}

function hashKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

// `comp` = a licence the owner issued by hand (testers, press, partners).
function isEntitled(row, now) {
  if (!row) return false;
  const t = typeof now === 'number' ? now : Date.now();
  if (row.status === 'active' || row.status === 'trialing' || row.status === 'comp') return true;
  if (row.status === 'past_due' && row.current_period_end) {
    return t < new Date(row.current_period_end).getTime() + PAST_DUE_GRACE_MS;
  }
  return false;
}

function withTimeout(factory) {
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = setTimeout(() => { if (ctl) ctl.abort(); }, NETWORK_TIMEOUT_MS);
  return factory(ctl ? ctl.signal : undefined).finally(() => clearTimeout(timer));
}

function sbHeaders(serviceKey, extra) {
  return Object.assign({ apikey: serviceKey, Authorization: 'Bearer ' + serviceKey, 'Content-Type': 'application/json' }, extra || {});
}

async function findByHash(serviceKey, keyHash) {
  const url = SB_URL + '/rest/v1/licenses?select=*&key_hash=eq.' + encodeURIComponent(keyHash) + '&limit=1';
  const res = await withTimeout((signal) => fetch(url, { signal, headers: sbHeaders(serviceKey) }));
  if (!res.ok) throw new Error('licence lookup failed: HTTP ' + res.status);
  const rows = await res.json();
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function findBy(serviceKey, column, value) {
  const url = SB_URL + '/rest/v1/licenses?select=*&' + column + '=eq.' + encodeURIComponent(value) + '&order=created_at.desc&limit=5';
  const res = await withTimeout((signal) => fetch(url, { signal, headers: sbHeaders(serviceKey) }));
  if (!res.ok) throw new Error('licence lookup failed: HTTP ' + res.status);
  const rows = await res.json();
  return Array.isArray(rows) ? rows : [];
}

// Stripe signs `${timestamp}.${rawBody}` with HMAC-SHA256 and sends
// `t=...,v1=...[,v1=...]`. Constant-time compare, replay window enforced.
function verifyStripeSignature(rawBody, header, secret, now, toleranceSec) {
  if (!rawBody || !header || !secret) return false;
  const parts = String(header).split(',').map((p) => p.trim());
  const t = (parts.find((p) => p.startsWith('t=')) || '').slice(2);
  const sigs = parts.filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
  if (!t || !sigs.length || !/^\d+$/.test(t)) return false;
  const tolerance = typeof toleranceSec === 'number' ? toleranceSec : 300;
  const nowSec = Math.floor((typeof now === 'number' ? now : Date.now()) / 1000);
  if (Math.abs(nowSec - Number(t)) > tolerance) return false;
  const expected = crypto.createHmac('sha256', secret).update(t + '.' + rawBody).digest('hex');
  const expectedBuf = Buffer.from(expected, 'utf8');
  return sigs.some((sig) => {
    const sigBuf = Buffer.from(sig, 'utf8');
    return sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf);
  });
}


const SITE_URL = 'https://theflow-ai.com';
const FROM_GLANCE = 'Glance <hello@theflow-ai.com>';

async function sendMail(apiKey, opts) {
  const res = await withTimeout((signal) => fetch('https://api.resend.com/emails', {
    method: 'POST',
    signal,
    headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(opts),
  }));
  return { ok: res.ok, status: res.status };
}

function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// The one email a buyer needs to keep: the key and how to use it.
function licenseEmail(key, opts) {
  const o = opts || {};
  const trialLine = o.trialEnds
    ? '<p style="margin:0 0 16px;color:#44506b">Your free trial runs until <b>' + esc(new Date(o.trialEnds).toDateString()) + '</b>. You can cancel any time before then and you will not be charged.</p>'
    : '';
  return {
    subject: 'Your Glance Pro key',
    html:
      '<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#101a33">' +
      '<h2 style="margin:0 0 12px">You\'re on Glance Pro.</h2>' +
      trialLine +
      '<p style="margin:0 0 8px;color:#44506b">Your licence key:</p>' +
      '<p style="margin:0 0 20px;font:700 20px/1.3 Consolas,Menlo,monospace;letter-spacing:.04em;background:#eef2ff;border-radius:10px;padding:14px 16px">' + esc(key) + '</p>' +
      '<ol style="margin:0 0 20px;padding-left:20px;color:#44506b;line-height:1.6">' +
      '<li>Open the Glance panel in Chrome.</li>' +
      '<li>Under <b>Glance Pro</b>, paste the key and press <b>Activate</b>.</li>' +
      '</ol>' +
      '<p style="margin:0 0 6px;color:#44506b">Manage or cancel your subscription any time from the same panel, or reply to this email and we will do it for you.</p>' +
      '<p style="margin:16px 0 0;color:#7a85a0;font-size:12px">Glance &middot; <a href="' + SITE_URL + '" style="color:#7a85a0">theflow-ai.com</a></p>' +
      '</div>',
  };
}

// Small cache so a burst of Draft-It / classify calls does not hit the
// database each time. 60 s is short enough that a cancellation bites quickly.
const CACHE = new Map();
const CACHE_MS = 60 * 1000;

async function checkLicense(rawKey, env, now) {
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return { configured: false, valid: false };
  const key = normalizeKey(rawKey);
  if (!key) return { configured: true, valid: false, reason: 'format' };
  const t = typeof now === 'number' ? now : Date.now();
  const hit = CACHE.get(key);
  if (hit && t - hit.at < CACHE_MS) return hit.value;
  const row = await findByHash(serviceKey, hashKey(key));
  const value = row && isEntitled(row, t)
    ? { configured: true, valid: true, status: row.status, plan: row.plan, interval: row.interval || null, renewsAt: row.current_period_end || null, trialEnds: row.trial_end || null }
    : { configured: true, valid: false, reason: row ? 'inactive' : 'unknown', status: row ? row.status : null };
  CACHE.set(key, { at: t, value });
  if (CACHE.size > 2000) CACHE.clear();
  return value;
}

module.exports = {
  SB_URL, KEY_PREFIX, deriveKey, normalizeKey, hashKey, isEntitled,
  SITE_URL, FROM_GLANCE, sendMail, licenseEmail, esc,
  findByHash, findBy, verifyStripeSignature, checkLicense, withTimeout, sbHeaders,
  _cache: CACHE,
};
