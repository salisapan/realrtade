#!/usr/bin/env node
// The FIXED corpus for the encoder-as-fallback experiment (docs/encoder-evaluation-plan.md). Writes, per sentence, what the shipped engine
// does (the full pipeline: lexicon + learned model + gates), so the experiment can ask one question: when the engine is SILENT, would a
// small multilingual encoder have been right to speak?
//   node scripts/intent/dump-fixed-corpus.cjs <outDir>
// Sets: dev (odd rows of intent-gold: the ONLY set used to pick a threshold), blind, te, te2, chat (strict-register chat sentences) and,
// when this machine has it, human (the owner's own sent mail, masked, gitignored; it is written only to <outDir>, never to the repo).
// Also writes replies.json: the reply sets with the shipped reply model's class probabilities, for the "is this reply an answer" task.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..', 'flow-trial-extension');
const out = process.argv[2];
if (!out) { console.error('usage: dump-fixed-corpus.cjs <outDir>'); process.exit(1); }
fs.mkdirSync(out, { recursive: true });
const M = require(path.join(ROOT, 'core', 'intent-model.js')).FlowIntentModel;
const W = require(path.join(ROOT, 'core', 'intent-model-weights.js')).FlowIntentWeights;
const P = require(path.join(ROOT, 'core', 'intent-pipeline.js')).FlowIntentPipeline;
const R = require(path.join(ROOT, 'core', 'reply-model.js')).FlowReplyModel;
M.load(W);
const fx = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'test', 'fixtures', f), 'utf8'));
const gold = (a) => (a === 'ASK' || a === 'PROMISE' ? a : 'OTHER');
const sets = { dev: fx('intent-gold.json').filter((_, i) => i % 2 === 1), blind: fx('intent-blind.json'), te: fx('intent-teacher-eval.json'), te2: fx('intent-teacher-eval-2.json'), chat: fx('chat-gold.json') };
const priv = path.join(ROOT, 'test', 'fixtures', 'private');
const human = [];
for (const f of ['human-eval.tsv', 'human-blind.tsv']) {
  const p = path.join(priv, f);
  if (!fs.existsSync(p)) continue;
  for (const l of fs.readFileSync(p, 'utf8').split('\n').filter(Boolean)) { const [act, conf, lang, t] = l.split('\t'); human.push({ t, act, lang, conf }); }
}
if (human.length) sets.human = human;
const rows = [];
for (const [set, list] of Object.entries(sets)) {
  for (const r of list) {
    const lang = r.lang || (/[֐-׿]/.test(r.t) ? 'he' : 'en');
    const rec = P.recognize(r.t);
    const pipe = rec.unsure ? 'X' : (rec.act === 'ASK' || rec.act === 'PROMISE' ? rec.act : 'X');
    rows.push({ set, lang, t: r.t, gold: gold(r.act), pipe, shapedAsk: Boolean(P.shapedAsk(r.t)), shapedPromise: Boolean(P.shapedPromise(r.t)), strict: set === 'chat' });
  }
}
fs.writeFileSync(path.join(out, 'corpus.json'), JSON.stringify(rows));
const replies = [];
for (const f of ['replies-eval', 'replies-eval2']) {
  for (const r of JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'reply', f + '.json'), 'utf8'))) {
    const p = R.predict(r.t);
    replies.push({ set: f, lang: r.lang, t: r.t, cls: r.c, shipped: p ? p.probs : null });
  }
}
fs.writeFileSync(path.join(out, 'replies.json'), JSON.stringify({ classes: R.CLASSES, rows: replies }));
const count = {};
for (const r of rows) { const k = r.set + '/' + r.lang; count[k] = (count[k] || 0) + 1; }
console.log('fixed corpus:', rows.length, 'intent rows', JSON.stringify(count), '|', replies.length, 'reply rows', human.length ? '(includes the private human set: stays in ' + out + ')' : '(no private human set on this machine)');
