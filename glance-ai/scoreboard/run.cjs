'use strict';
// Glance model scoreboard (Phase 0 of docs/glance-ai/model-upgrade-plan.md), v2 (2026-11-11): scores models on the FROZEN label set, joined by TEXT.
//
//   node scoreboard/run.cjs --models v2=model/v2x/fz-v2/v2.extra-preds.jsonl,v26=model/v2x/fz-v26/v26.extra-preds.jsonl
//        [--judged name=file.jsonl,...] [--gate-base v2] [--json out.json] [--md out.md]
//
// WHY v2: the first scoreboard joined label files to the dataset's test split by row id, and the ids are positional (a new template renumbers
// the rows), so labels were scored against the wrong text. The frozen set (labeling/frozen-eval.jsonl, built by model/train/export-frozen.cjs)
// carries each text with its labels, and train-v2.py `--extra` predicts exactly those rows. Nothing here reads out-v2/test.jsonl.
//
// Label sources (never mixed): owner-verified (none yet), two-pass agreement (NOT owner-verified), single blind pass (Claude), and the
// owner-convention overlay (labeling/owner-convention-overlay.jsonl: rows decided by an owner convention, step derived by a rule). The
// generator's own reference is a training target, not a source. Seven metrics: 1 wrong Do It, 2 missed closes, 3 wrong action, 4 proof rate,
// 5 calibration, 6 Hebrew-English gap, 7 cost and latency. 4 and 7 print n/a until real use / a measured run supplies them.
// The engine row ("engine-only") is the rules engine of this repository (tip) with the lab veto and no model behind it.
const fs = require('fs'), path = require('path');
const G = path.join(__dirname, '..');
const gate = require(path.join(G, 'oss', 'finetune', 'promote_gate.cjs'));
const read = (p) => fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const pairs = (s) => String(s || '').split(',').filter(Boolean).map((x) => { const i = x.indexOf('='); return [x.slice(0, i), x.slice(i + 1)]; });
const MODELS = pairs(arg('models')), JUDGED = pairs(arg('judged'));
if (!MODELS.length && !JUDGED.length) { console.error('usage: node scoreboard/run.cjs --models name=extra-preds.jsonl,... [--judged name=file.jsonl,...] [--gate-base name] [--json out] [--md out]'); process.exit(2); }

function wilson(k, n) { if (!n) return [0, 0]; const z = 1.96, p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)); return [Math.max(0, (c - h) / d), Math.min(1, (c + h) / d)]; }
const pct = (x) => (100 * x).toFixed(1) + '%';
const rate = (k, n) => (n ? pct(k / n) + ' [' + wilson(k, n).map(pct).join('–') + '] ' + k + '/' + n : 'n/a (0 rows)');
const STEPS = new Set(['SILENT', 'task', 'calendar', 'draft', 'file_save']);
const FAM = { task: 'task', calendar: 'calendar', draft: 'reply', file_save: 'file' };
const judge = (s) => (s === 'SILENT' ? { decision: 'silent' } : { decision: 'act', family: FAM[s] });
const stepOfLabel = (l) => (!l || l === 'SILENT' ? 'SILENT' : String(l).split('|').pop());

const frozen = read(path.join(G, 'labeling', 'frozen-eval.jsonl'));
const overlayFile = path.join(G, 'labeling', 'owner-convention-overlay.jsonl');
const overlay = fs.existsSync(overlayFile) ? Object.fromEntries(read(overlayFile).map((r) => [r.id, r])) : {};
const lang = (r) => (r.lang === 'he' ? 'he' : 'en');
// label sources: id -> {step, undated}
const src = { 'owner-verified': {}, 'two-pass agreement (NOT owner-verified)': {}, 'single blind pass (Claude, NOT owner-verified)': {}, 'owner-convention, rule-derived (C-4: an undated ask gets a Do It; NOT agreement, NOT owner-verified)': {} };
const [S_OWN, S_AG, S_ONE, S_OV] = Object.keys(src);
for (const r of frozen) {
  if (overlay[r.id]) { src[S_OV][r.id] = { step: overlay[r.id].step, undated: false }; continue; }
  if (r.agreed && STEPS.has(r.agreed)) src[S_AG][r.id] = { step: r.agreed, undated: r.undatedAsk };
  else if (r.pass1 && STEPS.has(r.pass1)) src[S_ONE][r.id] = { step: r.pass1, undated: r.undatedAsk };
}
const byId = Object.fromEntries(frozen.map((r) => [r.id, r]));

function modelPreds(file) { return Object.fromEntries(read(path.join(G, file)).map((r) => [r.id, r])); }
const emptyModel = {}; // engine-only: no model behind the engine
const M = { 'engine-only': emptyModel }; for (const [n, f] of MODELS) M[n] = modelPreds(f);
const J = Object.fromEntries(JUDGED.map(([n, f]) => [n, Object.fromEntries(read(path.join(G, f)).map((r) => [r.id, r.pred]))]));

// a model's two orders on one frozen row
function product(id, m) { // engine (tip) first, unless the lab veto removes it; the model only where the engine is silent
  const row = byId[id], x = m[id];
  const eng = x && (x.vb || x.vp) ? 'SILENT' : row.tip;
  if (eng !== 'SILENT') return judge(eng);
  return judge(x ? stepOfLabel(x.pred) : 'SILENT');
}
function alone(id, m) { const x = m[id]; return judge(x ? stepOfLabel(x.predAlone) : 'SILENT'); }
const productJ = (id, name) => (J[name] ? (byId[id].tip !== 'SILENT' ? judge(byId[id].tip) : (J[name][id] || { decision: 'silent' })) : null);

function metrics(ids, getPred, srcMap) {
  const cases = ids.map((id) => ({ id, lang: lang(byId[id]), gold: srcMap[id].step, body: '' }));
  const preds = ids.map((id) => ({ id, pred: getPred(id) }));
  const s = gate.score(preds, cases, {}, undefined, null);
  const a = s.all, he = s.he, en = s.en;
  return { raw: s, n: a.n, silent: a.silentGold, act: a.actGold, wrongDoIt: a.wrongDoIt, missed: a.missed, wrongAction: a.wrongAction,
    he: { silent: he.silentGold, act: he.actGold, wrongDoIt: he.wrongDoIt, missed: he.missed }, en: { silent: en.silentGold, act: en.actGold, wrongDoIt: en.wrongDoIt, missed: en.missed } };
}
function calibration(m, srcMap) {
  const rows = []; for (const id in srcMap) { const x = m[id]; if (!x || typeof x.p !== 'number') continue; rows.push([x.p, srcMap[id].step === 'SILENT' ? 0 : 1]); }
  if (rows.length < 30) return { n: rows.length, ece: null, brier: null };
  const bins = Array.from({ length: 10 }, () => [0, 0, 0]); let br = 0;
  for (const [p, y] of rows) { const b = Math.min(9, Math.floor(p * 10)); bins[b][0]++; bins[b][1] += p; bins[b][2] += y; br += (p - y) ** 2; }
  return { n: rows.length, ece: +(bins.reduce((s, [n, sp, sy]) => s + (n ? Math.abs(sp - sy) : 0), 0) / rows.length).toFixed(3), brier: +(br / rows.length).toFixed(3) };
}

const out = { generatedFrom: 'glance-ai/scoreboard/run.cjs (frozen set, text-bound)', frozenRows: frozen.length, sources: [] };
for (const [label, srcMap] of Object.entries(src)) {
  const ids = Object.keys(srcMap).filter((id) => srcMap[id].step !== 'CONTEXT' && srcMap[id].step !== 'UNSURE');
  const e = { source: label, n: ids.length, models: {} }; out.sources.push(e);
  if (!ids.length) continue;
  for (const [n, m] of Object.entries(M)) {
    const undated = ids.filter((id) => srcMap[id].step === 'SILENT' && srcMap[id].undated && product(id, m).decision === 'act').length;
    e.models[n] = { product: metrics(ids, (id) => product(id, m), srcMap), undatedWrongDoIt: undated };
    if (n !== 'engine-only') { e.models[n].alone = metrics(ids, (id) => alone(id, m), srcMap); e.models[n].calibration = calibration(m, srcMap); }
  }
  for (const n of Object.keys(J)) e.models[n] = { alone: metrics(ids, (id) => J[n][id] || { decision: 'silent' }, srcMap), product: metrics(ids, (id) => productJ(id, n), srcMap), undatedWrongDoIt: 0, calibration: { n: 0, ece: null, brier: null } };
}

const lines = []; const say = (s) => lines.push(s);
say('# Glance model scoreboard'); say('');
say('Lab only. Frozen label set, joined by text (' + frozen.length + ' rows). Labels are never owner-verified unless the first source says so. Rates: value [95% Wilson interval] k/n.');
for (const e of out.sources) {
  say(''); say('## ' + e.source + ' (n = ' + e.n + ')');
  if (!e.n) { say('No rows. Phase 0 needs path A (own-use labels with read-back proof) to fill this source.'); continue; }
  say(''); say('| model | order | 1 wrong Do It (of them undated asks) | 2 missed | 3 wrong action | HE missed | EN missed | 6 HE−EN missed gap | 5 ECE / Brier (gate) |'); say('|---|---|---|---|---|---|---|---|---|');
  for (const [n, m] of Object.entries(e.models)) for (const order of ['product', 'alone']) {
    const x = m[order]; if (!x) continue;
    const gap = x.he.act && x.en.act ? ((x.he.missed / x.he.act - x.en.missed / x.en.act) * 100).toFixed(1) + ' pts' : 'n/a';
    const cal = order === 'alone' && m.calibration && m.calibration.ece != null ? m.calibration.ece + ' / ' + m.calibration.brier : 'n/a';
    say(`| ${n} | ${order === 'product' ? 'engine+veto, then model' : 'model alone'} | ${rate(x.wrongDoIt, x.silent)}${order === 'product' && m.undatedWrongDoIt ? ' (' + m.undatedWrongDoIt + ' undated)' : ''} | ${rate(x.missed, x.act)} | ${x.wrongAction} | ${x.he.missed}/${x.he.act} | ${x.en.missed}/${x.en.act} | ${gap} | ${cal} |`);
  }
}
// promotion gate (product order) of each model against --gate-base, on the agreement source
const base = arg('gate-base');
if (base) {
  const ag = out.sources.find((s) => s.source === S_AG);
  say(''); say('## Promotion gate (`promote_gate.cjs` decide, product order, two-pass agreement labels) against ' + base); say('');
  for (const n of Object.keys(ag.models)) { if (n === base || n === 'engine-only') continue; const b = ag.models[base].product.raw, c = ag.models[n].product.raw;
    const v = gate.decide(b, c, 0, ag.n); say(`- ${n}: ${v.verdict}${v.reasons && v.reasons.length ? ' (' + v.reasons.join('; ') + ')' : ''}`); }
}
say(''); say('4 Proof rate: n/a. No own-use data with `fetchedBack` read-back is available to the lab yet (path A, `docs/glance-ai/learning-from-use.md`).');
say('7 Cost and latency: n/a. The device model runs in the extension runtime; cloud cost per close needs the M6 measurement (`docs/glance-ai/ai-product.md`).');
const md = lines.join('\n') + '\n'; console.log(md);
if (arg('md')) fs.writeFileSync(arg('md'), md);
if (arg('json')) { const strip = (o) => JSON.parse(JSON.stringify(o, (k, v) => (k === 'raw' ? undefined : v))); fs.writeFileSync(arg('json'), JSON.stringify(strip(out), null, 1)); }
