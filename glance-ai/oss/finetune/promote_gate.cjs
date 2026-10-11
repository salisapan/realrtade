'use strict';
// The promotion gate for Glance's own model: a new model (candidate) replaces the current one (base) only when, on the SAME cases,
//   1. it makes no more wrong Do Its (acting where the right answer is silence) than the base, in total and in Hebrew and in English;
//   2. it picks no more wrong actions (a Do It of the wrong kind);
//   3. it misses no more closes in either language, and misses fewer in total;
//   4. the labels it is judged on include at least MIN_OWNER (200) owner-verified rows. Until then the verdict is at most
//      "better on spec labels" and promote is false: spec labels are generated, and a generator can be wrong (SFT v3 audit, 2026-10-11).
// Silence beats a wrong Do It: a candidate that closes more but also acts wrongly once more is held.
//
// Predictions: JSONL rows { id, pred } where pred is either the judge format { decision, family, ... } (SFT v1/v2, cached OSS runs) or
// an Understanding { relevant, state, needs, intentions } (SFT v3). An Understanding goes through the same validator and proposal()
// the extension runs (flow-trial-extension/core/understanding.js), so the score is what the person would see, not what the model said.
//
// usage: node promote_gate.cjs --base <pred.jsonl> --cand <pred.jsonl> [--cases <cases.jsonl>] [--labels <id,step jsonl>]
//                              [--understanding <understanding.js>] [--strict]
//   --cases   default glance-ai/eval-data/shadow-combined-cases.jsonl (gold.step; AMBIGUOUS / ANY rows are left out)
//   --labels  rows { id, step, ownerVerified } that override the case gold; ownerVerified rows count toward MIN_OWNER
//   --strict  exit 1 unless promote is true (for CI)
// No model is run; nothing leaves the machine.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const MIN_OWNER = 200;
const FAM_STEP = { task: 'task', calendar: 'calendar', reply: 'draft', file: 'file_save' };
const HEB = /[֐-׿]/;
const read = (p) => fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);

let U = null;
function understandingModule(p) {
  if (U) return U;
  const file = p || path.join(ROOT, 'flow-trial-extension/core/understanding.js');
  if (!fs.existsSync(file)) return null;
  U = require(path.resolve(file)).FlowUnderstanding;
  return U;
}

function stepOf(pred, c, uPath) {
  if (!pred || typeof pred !== 'object') return 'SILENT';
  if (Array.isArray(pred.intentions)) {
    const M = understandingModule(uPath);
    if (!M) throw new Error('an Understanding prediction needs understanding.js (pass --understanding)');
    const v = M.validate(JSON.stringify(pred), c.body, { today: c.today || undefined });
    if (!v.ok) return 'SILENT';
    return M.proposal(v.understanding, { attachmentCount: c.attachmentCount || 0 }).step;
  }
  if (pred.decision !== 'act') return 'SILENT';
  return FAM_STEP[pred.family] || 'SILENT';
}

function blank() { return { n: 0, wrongDoIt: 0, silentGold: 0, wrongAction: 0, missed: 0, actGold: 0, right: 0 }; }
// Scored on the cases the BASE has a prediction for (a cached run covers only the cases that reach the model); a candidate missing one
// of those is a reason to hold.
function score(preds, cases, labels, uPath, only) {
  const P = Object.fromEntries(preds.map((r) => [r.id, r.pred]));
  const out = { all: blank(), he: blank(), en: blank(), missingPred: 0 };
  for (const c of cases) {
    const gold = labels[c.id] ? labels[c.id].step : c.gold;
    if (!gold || gold === 'AMBIGUOUS' || gold === 'ANY') continue;
    if (only && !only.has(c.id)) continue;
    if (!(c.id in P)) { out.missingPred++; continue; }
    const got = stepOf(P[c.id], c, uPath);
    for (const k of ['all', c.lang]) {
      const m = out[k]; m.n++;
      if (gold === 'SILENT') { m.silentGold++; if (got !== 'SILENT') m.wrongDoIt++; else m.right++; }
      else { m.actGold++; if (got === 'SILENT') m.missed++; else if (got !== gold) m.wrongAction++; else m.right++; }
    }
  }
  return out;
}

function decide(base, cand, ownerN) {
  const reasons = [];
  for (const k of ['all', 'he', 'en']) {
    if (cand[k].wrongDoIt > base[k].wrongDoIt) reasons.push(`more wrong Do Its (${k}: ${base[k].wrongDoIt} -> ${cand[k].wrongDoIt})`);
    if (cand[k].missed > base[k].missed) reasons.push(`more missed closes (${k}: ${base[k].missed} -> ${cand[k].missed})`);
  }
  if (cand.all.wrongAction > base.all.wrongAction) reasons.push(`more wrong actions (${base.all.wrongAction} -> ${cand.all.wrongAction})`);
  if (cand.missingPred > 0) reasons.push(`${cand.missingPred} cases have no candidate prediction`);
  const better = !reasons.length && cand.all.missed < base.all.missed;
  if (!reasons.length && !better) reasons.push('no fewer missed closes than the base');
  const ownerOk = ownerN >= MIN_OWNER;
  const verdict = !better ? 'HOLD' : ownerOk ? 'PROMOTE' : 'BETTER ON SPEC LABELS (needs ' + MIN_OWNER + ' owner-verified labels to promote; has ' + ownerN + ')';
  return { promote: better && ownerOk, verdict, reasons };
}

function run(o) {
  const raw = read(o.cases || path.join(ROOT, 'glance-ai/eval-data/shadow-combined-cases.jsonl'));
  const cases = raw.map((c) => ({ id: c.id, lang: c.lang === 'he' || HEB.test((c.prompt && c.prompt.body) || '') ? 'he' : 'en', gold: c.gold && c.gold.step,
    body: (c.prompt && c.prompt.body) || c.own || c.body || '', today: c.today || null, attachmentCount: c.attachmentCount || 0 }));
  const labels = {}; let ownerN = 0;
  if (o.labels) read(o.labels).forEach((l) => { labels[l.id] = l; if (l.ownerVerified === true) ownerN++; });
  const basePreds = read(o.base), only = new Set(basePreds.map((r) => r.id));
  const base = score(basePreds, cases, labels, o.understanding, only);
  const cand = score(read(o.cand), cases, labels, o.understanding, only);
  return Object.assign({ base, cand, ownerVerified: ownerN }, decide(base, cand, ownerN));
}

if (require.main === module) {
  const a = process.argv.slice(2), get = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : undefined; };
  if (!get('--base') || !get('--cand')) { console.error('usage: node promote_gate.cjs --base <pred.jsonl> --cand <pred.jsonl> [--cases f] [--labels f] [--understanding f] [--strict]'); process.exit(2); }
  const r = run({ base: get('--base'), cand: get('--cand'), cases: get('--cases'), labels: get('--labels'), understanding: get('--understanding') });
  const row = (n, m) => `| ${n} | ${m.all.n} | ${m.all.wrongDoIt}/${m.all.silentGold} | ${m.all.wrongAction} | ${m.all.missed}/${m.all.actGold} | ${m.he.missed}/${m.he.actGold} | ${m.en.missed}/${m.en.actGold} |`;
  console.log('| model | n | wrong Do It | wrong action | missed | HE missed | EN missed |\n|---|---|---|---|---|---|---|\n' + row('base', r.base) + '\n' + row('candidate', r.cand));
  console.log('\nverdict: ' + r.verdict + (r.reasons.length ? '\n- ' + r.reasons.join('\n- ') : ''));
  if (a.indexOf('--strict') >= 0 && !r.promote) process.exit(1);
}
module.exports = { run, score, decide, stepOf, MIN_OWNER };
