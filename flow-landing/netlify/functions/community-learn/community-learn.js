// Receives ONE noisy, clipped sketch from a device that opted in to community learning (docs/community-learning.md).
// DORMANT: returns 503 until the owner sets COMMUNITY_ENABLED=1 (and the product build switch is on).
//
// What it accepts: 2,048 numbers and the noise scale they were made with. What it never receives: mail, text,
// feature indexes, an install id, or an account. What it never stores: the caller's address (a rate-limit key is
// hashed, kept in memory only, and discarded). Each upload is stored as its own row so the aggregator can take a
// trimmed mean; the rows are meaningless without thousands of others because the noise was added on the device.
//
// The shared math lives in ./community.js, an exact copy of flow-trial-extension/core/community.js
// (test/community-sync.cjs fails if they drift).
const crypto = require('crypto');
const { FlowCommunity } = require('./community.js');

const LOG_PREFIX = '[community-learn]';
const SB_URL = process.env.SUPABASE_URL || 'https://zjquktirlrhbqcnkfaok.supabase.co';
const MAX_BODY = 64 * 1024;
const MIN_SIGMA = 0.6;                 // never accept an upload made with less noise than epsilon about 8
const PER_DAY = 2;                     // uploads per caller per day (a device uploads about weekly)
const hits = new Map();

function roundId(now) {
  const d = new Date(now);
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  return d.getUTCFullYear() * 100 + Math.floor((now - start) / (7 * 86400000));
}
function limited(key, now) {
  const day = Math.floor(now / 86400000);
  const rec = hits.get(key);
  if (!rec || rec.day !== day) { hits.set(key, { day, n: 1 }); if (hits.size > 5000) hits.clear(); return false; }
  rec.n++;
  return rec.n > PER_DAY;
}

exports.handler = async function (event) {
  if (process.env.COMMUNITY_ENABLED !== '1') return { statusCode: 503, body: JSON.stringify({ ok: false, reason: 'disabled' }) };
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  const raw = event.body || '';
  if (raw.length > MAX_BODY) return { statusCode: 413, body: JSON.stringify({ error: 'Too large' }) };
  let payload;
  try { payload = JSON.parse(raw); } catch (e) { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }
  const update = payload && payload.update;
  if (!FlowCommunity.validUpdate(update)) return { statusCode: 400, body: JSON.stringify({ error: 'Invalid update' }) };
  if (!(update.sigma >= MIN_SIGMA)) return { statusCode: 400, body: JSON.stringify({ error: 'Not enough noise' }) };

  const h = event.headers || {};
  const ip = String(h['x-nf-client-connection-ip'] || h['x-forwarded-for'] || 'unknown').split(',')[0].trim();
  const key = crypto.createHash('sha256').update('community|' + ip).digest('hex').slice(0, 16);
  const now = Date.now();
  if (limited(key, now)) return { statusCode: 429, body: JSON.stringify({ error: 'Too many requests' }) };

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) { console.error(LOG_PREFIX, 'SUPABASE_SERVICE_ROLE_KEY not configured'); return { statusCode: 503, body: JSON.stringify({ ok: false, reason: 'not-configured' }) }; }
  let res;
  try {
    res = await fetch(SB_URL + '/rest/v1/community_sketches', {
      method: 'POST',
      headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ round: roundId(now), sigma: update.sigma, sketch: update.sketch })
    });
  } catch (e) { console.error(LOG_PREFIX, 'store failed', e && e.message); return { statusCode: 502, body: JSON.stringify({ ok: false }) }; }
  if (!res.ok) { console.error(LOG_PREFIX, 'store rejected', res.status); return { statusCode: 502, body: JSON.stringify({ ok: false }) }; }
  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};
exports.roundId = roundId;
