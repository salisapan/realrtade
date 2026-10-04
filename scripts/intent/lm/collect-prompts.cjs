#!/usr/bin/env node
// Which prompts would the SHIPPED code actually send to a language model? (docs/lm-fallback-evaluation-plan.md)
//   node scripts/intent/dump-fixed-corpus.cjs /tmp/fixed
//   node scripts/intent/lm/collect-prompts.cjs /tmp/fixed        # writes /tmp/fixed/prompts.json
// It runs the real core/local-lm.js (selfTest on the audit set, propose on every fixed-corpus sentence) against a session that
// only RECORDS what it is asked, so nothing about eligibility, wording or the two-asking rule is re-implemented in the experiment.
// The private human set is never part of this experiment.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..', 'flow-trial-extension');
const dir = process.argv[2];
if (!dir) { console.error('usage: collect-prompts.cjs <dir>'); process.exit(1); }
const { FlowLocalLM: L } = require(path.join(ROOT, 'core', 'local-lm.js'));
const { FlowLocalLMAudit: AUDIT } = require(path.join(ROOT, 'core', 'local-lm-audit.js'));
const P = require(path.join(ROOT, 'core', 'intent-pipeline.js')).FlowIntentPipeline;
const M = require(path.join(ROOT, 'core', 'intent-model.js')).FlowIntentModel;
M.load(require(path.join(ROOT, 'core', 'intent-model-weights.js')).FlowIntentWeights);
const corpus = JSON.parse(fs.readFileSync(path.join(dir, 'corpus.json'), 'utf8')).filter((r) => r.set !== 'human');
const NOW = Date.UTC(2026, 9, 4);
// The same pipeline with the structural shape gate (shapedAsk / shapedPromise) switched off: the SECONDARY question of the experiment.
const shapeFree = (pl) => ({ recognize: (t) => pl.recognize(t), shapedAsk: () => ({ shapeFree: true }), shapedPromise: () => ({ shapeFree: true }) });
const asked = { audit: new Set(), fallback: new Set() };
let bucket = 'audit';
const recorder = { prompt: async (text) => { asked[bucket].add(text); return '{"act":"ASK","action":"reply","who":"you","when":null,"amount":null}'; } };
(async () => {
  await L.selfTest(recorder, AUDIT, { now: NOW });
  bucket = 'fallback';
  const status = { en: { ok: true }, he: { ok: true }, checkedAt: NOW };
  for (const pipeline of [P, shapeFree(P)]) for (const r of corpus) await L.propose(r.t, { session: recorder, pipeline, model: M, status, now: NOW });
  const all = Array.from(new Set([...asked.audit, ...asked.fallback]));
  fs.writeFileSync(path.join(dir, 'prompts.json'), JSON.stringify({ prompts: all, counts: { audit: asked.audit.size, fallback: asked.fallback.size, total: all.length } }));
  console.log('prompts the shipped code would send:', all.length, '(audit', asked.audit.size, ', fallback on engine-silent sentences', asked.fallback.size, ')');
})();
