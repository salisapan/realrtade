#!/usr/bin/env node
// Scores one model's raw answers with the REAL on-device-model code and the rule written down BEFORE any number was seen
// (docs/lm-fallback-evaluation-plan.md section 3).
//   node scripts/intent/lm/score.cjs /tmp/fixed /tmp/raw.json [--out result.json]
// The raw answers are replayed through core/local-lm.js: its parser, its two-asking agreement rule, its self-test and its propose().
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..', 'flow-trial-extension');
const [dir, rawPath] = process.argv.slice(2, 4);
const outIx = process.argv.indexOf('--out');
const outPath = outIx > 0 ? process.argv[outIx + 1] : null;
if (!dir || !rawPath) { console.error('usage: score.cjs <dir> <raw.json> [--out file]'); process.exit(1); }
const { FlowLocalLM: L } = require(path.join(ROOT, 'core', 'local-lm.js'));
const { FlowLocalLMAudit: AUDIT } = require(path.join(ROOT, 'core', 'local-lm-audit.js'));
const P = require(path.join(ROOT, 'core', 'intent-pipeline.js')).FlowIntentPipeline;
const M = require(path.join(ROOT, 'core', 'intent-model.js')).FlowIntentModel;
M.load(require(path.join(ROOT, 'core', 'intent-model-weights.js')).FlowIntentWeights);
const corpus = JSON.parse(fs.readFileSync(path.join(dir, 'corpus.json'), 'utf8')).filter((r) => r.set !== 'human');
const raw = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
const NOW = Date.UTC(2026, 9, 4);
const shapeFree = (pl) => ({ recognize: (t) => pl.recognize(t), shapedAsk: () => ({ shapeFree: true }), shapedPromise: () => ({ shapeFree: true }) });
const POOLED = ['blind', 'te2', 'chat'];     // never used to choose anything; there is no threshold to choose in this experiment
const MIN_PRECISION = 0.97;
let missing = 0;
const session = { prompt: async (text) => { const r = raw.results[text]; if (!r) { missing++; throw new Error('no recorded answer'); } return r.text; } };

const prf = (rows, decide, cls) => ({
  tp: rows.filter((r) => decide(r) === cls && r.gold === cls).length,
  fp: rows.filter((r) => decide(r) === cls && r.gold !== cls).length,
  fn: rows.filter((r) => decide(r) !== cls && r.gold === cls).length
});
function both(rows, decide) {
  let tp = 0, fp = 0, fn = 0;
  for (const cls of ['ASK', 'PROMISE']) { const x = prf(rows, decide, cls); tp += x.tp; fp += x.fp; fn += x.fn; }
  return { tp, fp, fn, precision: Math.round(tp / Math.max(tp + fp, 1) * 1000) / 1000, recall: Math.round(tp / Math.max(tp + fn, 1) * 1000) / 1000 };
}

(async () => {
  const status = { en: { ok: true }, he: { ok: true }, checkedAt: NOW };     // the fallback is scored as if the device test passed; the test itself is scored on its own below
  const engine = (r) => r.pipe;
  const says = { shipped: new Map(), shapeFree: new Map() };
  for (const [name, pipeline] of [['shipped', P], ['shapeFree', shapeFree(P)]]) {
    for (const r of corpus) {
      if (r.pipe !== 'X') continue;
      const p = await L.propose(r.t, { session, pipeline, model: M, status, now: NOW });
      says[name].set(r, p ? p.act : null);
    }
  }
  const combinedFor = (name) => (r) => (r.pipe !== 'X' ? r.pipe : (says[name].get(r) || 'X'));
  const test = await L.selfTest(session, AUDIT, { now: NOW });
  const secs = Object.values(raw.results).map((x) => x.sec).sort((a, b) => a - b);
  const median = secs.length ? secs[Math.floor(secs.length / 2)] : null;
  const sizeQ4MB = raw.params ? Math.round(raw.params * 0.55 / 1e6) : null;    // ~4.4 bits per weight incl. scales: a rough estimate, labelled as one
  const result = { model: raw.model, params: raw.params, estimatedQ4MB: sizeQ4MB, medianSecPerCallOnCI: median, missingAnswers: 0, selfTest: test, ceiling: {}, variants: {}, checks: {} };

  const show = (name, rows, decide) => {
    const base = both(rows, engine), comb = both(rows, decide);
    const addedTP = comb.tp - base.tp, addedFP = comb.fp - base.fp;
    console.log(`${name.padEnd(12)} n=${String(rows.length).padStart(4)} | engine P ${base.precision.toFixed(3)} R ${base.recall.toFixed(3)} | + model P ${comb.precision.toFixed(3)} R ${comb.recall.toFixed(3)} | added TP ${addedTP >= 0 ? '+' : ''}${addedTP} FP ${addedFP >= 0 ? '+' : ''}${addedFP}`);
    return { n: rows.length, engine: base, combined: comb, addedTP, addedFP };
  };
  console.log(`model ${raw.model}${raw.params ? ` (${(raw.params / 1e9).toFixed(2)}B parameters, about ${sizeQ4MB} MB at 4-bit, rough)` : ''}; median ${median} s per call on this CPU\n`);
  console.log('--- the product\'s own device test (the audit set): the model is switched on for a language only if it passes ---');
  for (const lg of ['en', 'he']) { const t = test[lg]; console.log(`${lg}: ${t.ok ? 'PASSES' : 'FAILS '}  precision ${t.precision} recall ${t.recall}  (${t.tp} right, ${t.fp} wrong, ${t.fn} missed of ${t.n})`); }

  console.log('\n--- the ceiling: engine misses a model could still propose, even if it were perfect ---');
  for (const lg of ['en', 'he']) {
    const rows = corpus.filter((r) => POOLED.includes(r.set) && r.lang === lg);
    const misses = rows.filter((r) => (r.gold === 'ASK' || r.gold === 'PROMISE') && r.pipe !== r.gold);
    const open = (shapeless) => misses.filter((r) => L.eligible(r.t, { pipeline: P, model: M, status, now: NOW }) && (shapeless || (r.gold === 'ASK' ? r.shapedAsk : r.shapedPromise))).length;
    result.ceiling[lg] = { positives: rows.filter((r) => r.gold !== 'OTHER').length, engineMisses: misses.length, reachableUnderShippedGates: open(false), reachableWithoutShapeGate: open(true) };
    const c = result.ceiling[lg];
    console.log(`${lg}: ${c.engineMisses} engine misses of ${c.positives} real asks/promises; at most ${c.reachableUnderShippedGates} reachable under the shipped gates, ${c.reachableWithoutShapeGate} if the shape gate were off`);
  }

  for (const [vname, label] of [['shipped', 'PRIMARY INFORMATION: under the shipped gates (the shape gate stays on)'], ['shapeFree', 'DECIDING QUESTION: the model replaces the shape gate on silent sentences (needs the owner\'s decision to adopt)']]) {
    const decide = combinedFor(vname);
    result.variants[vname] = { sets: {}, pooled: {} };
    console.log(`\n=== ${label} ===`);
    for (const s of ['dev', 'blind', 'te', 'te2', 'chat']) for (const lg of ['en', 'he']) {
      const rows = corpus.filter((r) => r.set === s && r.lang === lg);
      if (rows.length) result.variants[vname].sets[`${s}/${lg}`] = show(`${s}/${lg}`, rows, decide);
    }
    console.log(`--- pooled over ${POOLED.join(', ')} ---`);
    for (const lg of ['en', 'he']) result.variants[vname].pooled[lg] = show('pooled/' + lg, corpus.filter((r) => POOLED.includes(r.set) && r.lang === lg), decide);
  }

  console.log('\n--- the rule fixed in advance (applied to the DECIDING QUESTION, per language) ---');
  const status2 = {};
  for (const lg of ['en', 'he']) {
    const p = result.variants.shapeFree.pooled[lg];
    const decide = combinedFor('shapeFree');
    const reach = result.ceiling[lg].reachableWithoutShapeGate;
    const provable = reach >= 10;       // B3 asks for 10 more correct proposals: impossible to prove where fewer than 10 are even reachable
    const c = {};
    c['A: passes the product\'s own device test'] = test[lg].ok === true;
    c['B1: pooled precision stays >= 0.97'] = p.combined.precision >= MIN_PRECISION;
    c['B4: at most 1 added wrong proposal per 20 added right ones'] = p.addedFP * 20 <= Math.max(p.addedTP, 0);
    if (provable) {
      c['B2: pooled recall rises by >= 5 points'] = p.combined.recall - p.engine.recall >= 0.05 - 1e-9;
      c['B3: at least 10 more correct proposals'] = p.addedTP >= 10;
      for (const s of ['blind', 'te2']) {
        const rows = corpus.filter((r) => r.set === s && r.lang === lg);
        const b = both(rows, engine), k = both(rows, decide);
        c[`B5: ${s} shows added correct proposals, precision not down more than 0.02`] = rows.length > 0 && k.tp - b.tp > 0 && k.precision >= b.precision - 0.02;
      }
    } else {
      c[`P: captures at least ${Math.max(3, Math.ceil(0.6 * reach))} of the ${reach} reachable misses (the set is too small to prove more)`] = p.addedTP >= Math.max(3, Math.ceil(0.6 * reach));
    }
    result.checks[lg] = c;
    for (const [k, v] of Object.entries(c)) console.log(`${v ? 'PASS' : 'FAIL'} ${lg}: ${k}`);
    const all = Object.values(c).every(Boolean);
    status2[lg] = all ? (provable ? 'WORTH A BUILD' : 'PROMISING, NOT PROVEN (needs a larger real set)') : 'NOT MET';
  }
  const worth = ['en', 'he'].filter((lg) => status2[lg] === 'WORTH A BUILD');
  result.status = status2;
  result.missingAnswers = missing;
  result.worthABuildFor = worth;
  console.log(`\nanswers missing from the recording: ${missing}${missing ? '  (THE RUN IS INCOMPLETE: do not read the numbers)' : ''}`);
  console.log('size and in-browser speed are NOT part of this rule (a CI CPU says nothing about a browser); they are measured only for a model that passes.');
  console.log('\nVERDICT: English:', status2.en, '| Hebrew:', status2.he);
  console.log(worth.length ? 'At least one language is worth a build.' : 'No language is proven worth a build: STOP, no integration of this model on this evidence.');
  if (outPath) fs.writeFileSync(outPath, JSON.stringify(result, null, 1));
})();
