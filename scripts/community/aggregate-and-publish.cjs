#!/usr/bin/env node
// Owner-run (or scheduled) step: aggregate one round of noisy sketches, run the canary, sign, publish.
//   SUPABASE_SERVICE_ROLE_KEY=... COMMUNITY_PRIVATE_KEY_PEM="$(cat key.pem)" node scripts/community/aggregate-and-publish.cjs --round 202641 [--dry-run] [--boost 10]
// Nothing is published unless: enough devices took part (k-anonymity), at least one coordinate is many noise
// deviations above zero, and the canary shows the delta does no harm on the fixed audit sets.
const fs = require('fs');
const path = require('path');
const { buildRelease, signRelease } = require('./lib.cjs');
const ROOT = path.join(__dirname, '..', '..', 'flow-trial-extension');
const M = require(path.join(ROOT, 'core', 'intent-model.js')).FlowIntentModel;
const P = require(path.join(ROOT, 'core', 'intent-pipeline.js')).FlowIntentPipeline;
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > -1 ? process.argv[i + 1] : d; };
const SB = process.env.SUPABASE_URL || 'https://zjquktirlrhbqcnkfaok.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PEM = process.env.COMMUNITY_PRIVATE_KEY_PEM;
(async () => {
  const round = Number(arg('round', 0));
  if (!round || !KEY) { console.error('usage: --round N, and SUPABASE_SERVICE_ROLE_KEY in the environment'); process.exit(2); }
  const rows = [];
  for (let off = 0; ; off += 1000) {
    const r = await fetch(SB + '/rest/v1/community_sketches?select=sigma,sketch&round=eq.' + round + '&order=id&limit=1000&offset=' + off, { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY } });
    if (!r.ok) { console.error('read failed', r.status); process.exit(1); }
    const page = await r.json();
    rows.push.apply(rows, page);
    if (page.length < 1000) break;
  }
  const fx = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'test', 'fixtures', f), 'utf8'));
  const gold = fx('intent-gold.json');
  const sets = { dev: gold.filter((_, i) => i % 2 === 1), blind: fx('intent-blind.json'), teacherEval: fx('intent-teacher-eval.json'), teacherEval2: fx('intent-teacher-eval-2.json') };
  const res = buildRelease(rows, { common: M.isCommon, model: M, pipeline: P, sets, round, boost: Number(arg('boost', 10)) });
  console.log(JSON.stringify({ ok: res.ok, reason: res.reason, report: res.report }, null, 1));
  if (!res.ok || process.argv.includes('--dry-run')) process.exit(res.ok ? 0 : 3);
  if (!PEM) { console.error('COMMUNITY_PRIVATE_KEY_PEM is required to publish'); process.exit(2); }
  const sig = signRelease(res.release.payload, PEM);
  const w = await fetch(SB + '/rest/v1/community_published', { method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ round, payload: res.release.payload, sig }) });
  if (!w.ok) { console.error('publish failed', w.status); process.exit(1); }
  console.log('published round', round);
})();
