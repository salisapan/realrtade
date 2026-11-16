'use strict';
// Score models against every blind label set, the model alone and in the product order (the rules engine of this repository + the
// lab veto first, the model only where the engine is silent). CONTEXT and UNSURE labels are left out; an undated ask labelled
// silent counts as silent. Steps are compared (task, calendar, draft, file_save).
// usage (from glance-ai): node labeling/score-batches.cjs --models v2=model/v23/base/base.test-preds.jsonl,v23=model/artifacts/v23.test-preds.jsonl
//   [--sets batch-003=labeling/batch-003.claude-labels.jsonl,...] [--json out.json]
//   needs model/dataset/out-v2/test.jsonl and the engine environment of model/V23.md (GLANCE_NOW; the tip engine is this repo).
const fs = require('fs'), path = require('path');
const G = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const pairs = (s) => s.split(',').filter(Boolean).map((x) => x.split('='));
const defaultSets = fs.readdirSync(__dirname).filter((f) => /^batch-\d{3}\.claude-labels\.jsonl$/.test(f)).sort()
  .map((f) => f.replace('.claude-labels.jsonl', '') + '=labeling/' + f).concat(['agreement-gold=labeling/agreement-gold.jsonl']).join(',');
const SETS = pairs(arg('sets', defaultSets)).map(([n, p]) => [n, read(path.join(G, p))]);
const MODELS = pairs(arg('models', '')).map(([n, p]) => [n, Object.fromEntries(read(path.join(G, p)).map((r) => [r.id, r]))]);
const test = Object.fromEntries(read(path.join(G, 'model', 'dataset', 'out-v2', 'test.jsonl')).map((r) => [r.id, r]));
const eng = require(path.join(G, 'model', 'teacher', 'engine.cjs')).makeEngine('tip');
const step = (label) => (!label || label === 'SILENT' ? 'SILENT' : String(label).split('|').pop());
const tipCache = {};
function tip(id) {
  if (id in tipCache) return tipCache[id];
  const r = test[id]; if (!r) return (tipCache[id] = null);
  return (tipCache[id] = step(eng.teach(Object.assign({}, r, { body: r.cleanBody || r.body })).label));
}
const anyModel = MODELS.length ? MODELS[0][1] : {};
const veto = (id) => { const x = anyModel[id]; return !!(x && (x.vb || x.vp)); };
const blank = () => ({ n: 0, silent: 0, act: 0, wrongDoIt: 0, undatedWrongDoIt: 0, missed: 0, wrongAction: 0 });
function score(set, pick) {
  const out = { all: blank(), he: blank(), en: blank() };
  for (const l of set) {
    if (!l.step || l.step === 'CONTEXT' || l.step === 'UNSURE' || !test[l.id]) continue;
    const got = pick(l.id);
    for (const k of ['all', l.lang]) {
      const m = out[k]; m.n++;
      if (l.step === 'SILENT') { m.silent++; if (got !== 'SILENT') { m.wrongDoIt++; if (l.undatedAsk) m.undatedWrongDoIt++; } }
      else { m.act++; if (got === 'SILENT') m.missed++; else if (got !== l.step) m.wrongAction++; }
    }
  }
  return out;
}
const engineAlone = (id) => (veto(id) ? 'SILENT' : tip(id) || 'SILENT');
const systems = [['reference', (id) => step(test[id] && test[id].reference && !test[id].reference.unsure ? test[id].reference.label : 'SILENT')], ['engine (tip) + veto', engineAlone]];
for (const [n, P] of MODELS) {
  systems.push([n + ' alone', (id) => step(P[id] ? P[id].pred : 'SILENT')]);
  systems.push(['engine + veto, then ' + n, (id) => { const e = engineAlone(id); return e !== 'SILENT' ? e : step(P[id] ? P[id].pred : 'SILENT'); }]);
}
const res = {};
for (const [sn, set] of SETS) {
  res[sn] = {};
  console.log('\n## ' + sn);
  console.log('| system | wrong Do It | of which undated | missed | HE missed | EN missed | HE wrong Do It | EN wrong Do It | wrong action |');
  console.log('|---|---|---|---|---|---|---|---|---|');
  for (const [name, pick] of systems) {
    const s = score(set, pick); res[sn][name] = s;
    const a = s.all;
    console.log(`| ${name} | ${a.wrongDoIt} / ${a.silent} | ${a.undatedWrongDoIt} | ${a.missed} / ${a.act} | ${s.he.missed} / ${s.he.act} | ${s.en.missed} / ${s.en.act} | ${s.he.wrongDoIt} / ${s.he.silent} | ${s.en.wrongDoIt} / ${s.en.silent} | ${a.wrongAction} |`);
  }
}
if (arg('json')) fs.writeFileSync(arg('json'), JSON.stringify(res, null, 1) + '\n');
