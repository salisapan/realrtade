// Serves the latest SIGNED community delta (docs/community-learning.md). The file is public by design: it contains
// only aggregated numeric nudges to the on-device model, signed by the owner's key so a device can refuse anything
// else. DORMANT: 503 until COMMUNITY_ENABLED=1; 204 until a delta has been published.
const SB_URL = process.env.SUPABASE_URL || 'https://zjquktirlrhbqcnkfaok.supabase.co';

exports.handler = async function (event) {
  if (process.env.COMMUNITY_ENABLED !== '1') return { statusCode: 503, body: JSON.stringify({ ok: false, reason: 'disabled' }) };
  if (event.httpMethod !== 'GET') return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return { statusCode: 503, body: JSON.stringify({ ok: false, reason: 'not-configured' }) };
  let res;
  try {
    res = await fetch(SB_URL + '/rest/v1/community_published?select=round,payload,sig&order=round.desc&limit=1', { headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey } });
  } catch (e) { return { statusCode: 502, body: JSON.stringify({ ok: false }) }; }
  if (!res.ok) return { statusCode: 502, body: JSON.stringify({ ok: false }) };
  const rows = await res.json();
  if (!Array.isArray(rows) || !rows.length) return { statusCode: 204, body: '' };
  return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' }, body: JSON.stringify({ payload: rows[0].payload, sig: rows[0].sig }) };
};
