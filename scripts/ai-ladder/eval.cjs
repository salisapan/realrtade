#!/usr/bin/env node
// Measure the deeper read on REAL model answers before the server switch is turned on (docs/ai-ladder.md §7).
//
// A. THE GATE. Per plan and per language, the fixed audit sentences the on-device model must pass (core/local-lm-audit.js, 100 sentences) go through the real server path
//    (glance-assist/ladder.js, real providers, two askings that must agree, and for Pro the strong pair on a torn answer). Precision of what it proposes must be >= 0.97 with at
//    least 12 proposals and recall >= 0.4: the SAME bar core/local-lm.js selfTest() holds an on-device model to. A language that passes on both plans may go in GLANCE_AI_LADDER.
// B. THE PRODUCT PATH (informational). The gold sets, only the sentences the on-device tiers leave undecided, through the real client path (gate, mask, guards) and the real server path.
//    It shows what the ladder adds on top of the device and what the guards remove. It is a small set (about 23 sentences): it is a look, not a gate.
//
// The counter is in memory: nothing is written anywhere. It costs real money (about 2 provider calls per sentence, up to 4 for a Pro escalation: a few cents in all).
//
//   ANTHROPIC_API_KEY=... XAI_API_KEY=... node scripts/ai-ladder/eval.cjs [--write docs/ai-ladder-eval.json]
//
// It never lowers the bar to raise recall, and it prints counts only, never a sentence.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const EXT = path.join(ROOT, 'flow-trial-extension');
const { FlowAiLadder: L } = require(EXT + '/core/ai-ladder.js');
const { FlowIntentPipeline: P } = require(EXT + '/core/intent-pipeline.js');
const { FlowIntentModel: M } = require(EXT + '/core/intent-model.js');
const { FlowExecRouter: X } = require(EXT + '/core/exec-router.js');
const { FlowPrivacyShield: S } = require(EXT + '/core/privacyShield.js');
const { FlowMaskIds: MI } = require(EXT + '/core/mask-ids.js');
const { FlowRequestTypes: T } = require(EXT + '/core/request-types.js');
const { createLadder, memoryStore } = require(path.join(ROOT, 'flow-landing', 'netlify', 'functions', 'glance-assist', 'ladder.js'));

const { FlowLocalLM: LM } = require(EXT + '/core/local-lm.js');
const { FlowLocalLMAudit: AUDIT } = require(EXT + '/core/local-lm-audit.js');

const MIN_PRECISION = LM.TEST_MIN_PRECISION;      // 0.97
const MIN_PROPOSALS = LM.TEST_MIN_POSITIVES;      // 12
const MIN_RECALL = LM.TEST_MIN_RECALL;            // 0.4
const keys = ['ANTHROPIC_API_KEY', 'XAI_API_KEY'].filter((k) => process.env[k]);
if (!keys.length) {
  console.log('SKIPPED: set ANTHROPIC_API_KEY and/or XAI_API_KEY to measure the deeper read on real answers. Nothing is switched on by this script either way.');
  process.exit(0);
}
const writeAt = process.argv.indexOf('--write') > 0 ? process.argv[process.argv.indexOf('--write') + 1] : null;

const rows = [];
for (const f of ['intent-gold', 'intent-blind', 'chat-gold']) rows.push(...require(EXT + '/test/fixtures/' + f + '.json'));
const real = (r) => r.act === 'ASK' || r.act === 'PROMISE';
const now = Date.now();

function serverFor(planId) {
  const pro = planId === 'pro';
  const env = Object.assign({}, process.env, { GLANCE_AI_LADDER: 'en,he', GLANCE_AI_DAILY_UNITS: '100000', GLANCE_AI_IP_DAILY_UNITS: '100000' });
  const ladder = createLadder({ env, now, ip: 'eval', store: memoryStore(), license: async () => ({ configured: true, valid: pro }) });
  const ids = { installId: 'eval-' + planId + '-0000000000', licenseKey: pro ? 'GLNC-AAAAA-BBBBB-CCCCC-DDDDD' : undefined };
  return { pro, ask: async (maskedSentence) => { const res = await ladder.read(Object.assign({ action: 'ladder-read', maskedSentence }, ids)); return res.status === 200 ? res.body : { ok: false, code: res.body.code }; } };
}

// A. what the server's reading is worth on the audit sentences, per language
async function gate(planId) {
  const srv = serverFor(planId);
  const out = {};
  for (const lang of ['en', 'he']) {
    const list = AUDIT.filter((r) => (r.lang || (/[\u0590-\u05ff]/.test(r.t) ? 'he' : 'en')) === lang);
    let tp = 0, fp = 0, fn = 0, errors = 0, units = 0;
    for (const r of list) {
      const prepared = X.maskForServer(r.t, S, MI);
      if (!prepared.ok) { errors++; continue; }
      const res = await srv.ask(prepared.text);
      if (!res.ok) { errors++; continue; }
      units += res.units || 0;
      const read = res.reading && res.reading.action !== 'none' ? res.reading : null;
      const gold = r.act === 'ASK' || r.act === 'PROMISE';
      if (read && gold && read.act === r.act) tp++; else if (read) fp++; else if (gold) fn++;
    }
    const proposed = tp + fp;
    const precision = proposed ? tp / proposed : null;
    const recall = tp + fn ? tp / (tp + fn) : null;
    out[lang] = { n: list.length, errors, proposed, right: tp, wrong: fp, missed: fn, units,
      precision: precision === null ? null : Math.round(precision * 1000) / 1000, recall: recall === null ? null : Math.round(recall * 1000) / 1000,
      ok: errors <= Math.ceil(list.length * 0.05) && precision !== null && precision >= MIN_PRECISION && proposed >= MIN_PROPOSALS && recall !== null && recall >= MIN_RECALL };
  }
  return out;
}

// B. the product path, on the sentences the device leaves undecided
async function product(planId) {
  const srv = serverFor(planId);
  const state = L.stateOf({ available: true, languages: ['en', 'he'], consent: true, pro: srv.pro, snapshot: null, now });
  const plan = L.planOf(srv.pro);
  let cache = [], asked = 0, tp = 0, fp = 0, silentReal = 0, strong = 0, units = 0, standIns = 0;
  for (const r of rows) {
    if (!L.eligible(r.t, { state, pipeline: P, model: M }).ok) continue;
    const out = await L.read(r.t, { pipeline: P, model: M, state, plan, cache, now, types: T, maskIds: MI, mask: (x) => X.maskForServer(x, S, MI), ask: (req) => srv.ask(req.maskedSentence) });
    if (out.cache) cache = out.cache;
    if (out.why === 'read' || out.why === 'nothing') { asked++; units += out.units || 0; if (out.tier === 'strong') strong++; }
    if (out.proposal) { if (real(r) && out.proposal.act === r.act) tp++; else fp++; if (out.proposal.standIn) standIns++; }
    else if (real(r)) silentReal++;
  }
  return { asked, proposals: tp + fp, right: tp, wrong: fp, realStillSilent: silentReal, strongReads: strong, standIns, units };
}

(async () => {
  const results = {};
  for (const planId of ['free', 'pro']) results[planId] = { gate: await gate(planId), product: await product(planId) };
  console.log(JSON.stringify(results, null, 1));
  const passing = ['en', 'he'].filter((lang) => results.free.gate[lang].ok && results.pro.gate[lang].ok);
  if (passing.length) console.log('PASS for: ' + passing.join(', ') + '. It is reasonable to set GLANCE_AI_LADDER=' + passing.join(',') + '.' + (passing.length < 2 ? ' The other language did not pass and stays off.' : ''));
  else console.log('DO NOT TURN ON: no language reached precision >= ' + MIN_PRECISION + ' (with >= ' + MIN_PROPOSALS + ' proposals and recall >= ' + MIN_RECALL + ') on both plans. Leave GLANCE_AI_LADDER empty.');
  if (writeAt) fs.writeFileSync(path.resolve(ROOT, writeAt), JSON.stringify({ at: new Date(now).toISOString(), bar: { MIN_PRECISION, MIN_PROPOSALS, MIN_RECALL }, passing, results }, null, 1) + '\n');
  process.exit(passing.length ? 0 : 1);
})();
