'use strict';
// JS (drop-in package) vs Python decisions on the v2 held-out test (eval-data/v2-heldout-test.jsonl, n=6,982).
//  (a) feature parity: package x2 / x21 == runtime/pipeline-v2 / pipeline-v21 feature lists (bit-identical FNV indices)
//  (b) decision parity vs Python: package label == artifacts/{v2,v21}.test-preds.jsonl `pred` (float LR in sklearn)
//  (c) decision parity vs the existing Node runtime (dense JSON weights): runtime/glance-close-v2 / -v21
//  Gate: (a) 100%, (b) >= 99.9% (spec §4 parity gate), (c) 100%. Writes test/out/parity.json. Exit 1 on failure.
const fs = require('fs'), path = require('path');
const M = path.join(__dirname, '..', '..');
const { EVAL } = require(path.join(M, '..', 'paths.cjs'));
const P = require('../src/gs-prepare.js'), MD = require('../src/gs-model.js');
const { loadCore, optsFor } = require('./core-loader.cjs');
const core = loadCore();
const man = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'weights', 'manifest.json'), 'utf8'));
const W = (k) => fs.readFileSync(path.join(__dirname, '..', man.models[k].file));
const m2 = MD.load(W('v2'), 'v2', man.models.v2.sha256.slice(0, 8)), m21 = MD.load(W('v21'), 'v21', man.models.v21.sha256.slice(0, 8));
const { normalizeInput } = require(M + '/runtime/normalize-v21.cjs');
const PV2 = require(M + '/runtime/pipeline-v2.cjs'), PV21 = require(M + '/runtime/pipeline-v21.cjs');
const V2 = require(M + '/runtime/glance-close-v2.cjs').make('v2'), V21 = require(M + '/runtime/glance-close-v21.cjs').make('v21');
const preds = (t) => {
  const p = path.join(M, 'artifacts', t + '.test-preds.jsonl');
  if (!fs.existsSync(p)) return null;
  return new Map(fs.readFileSync(p, 'utf8').trim().split('\n').map((l) => { const r = JSON.parse(l); return [r.id, r]; }));
};
const py2 = preds('v2'), py21 = preds('v21');
const pySkipped = !py2 || !py21;
const LIMIT = Number(process.env.PARITY_LIMIT || 0);
let rows = fs.readFileSync(EVAL.v2Test(), 'utf8').trim().split('\n').map(JSON.parse);
if (LIMIT) rows = rows.slice(0, LIMIT);
const R = { n: rows.length, feat: { v2: 0, v21: 0 }, py: { v2: { n: 0, same: 0, diffs: [] }, v21: { n: 0, same: 0, diffs: [] } }, js: { v2: 0, v21: 0, diffs: [] }, maxDp: { v2: 0, v21: 0 },
  masked: {}, records: 0 };
const conf = { v2: { wdi: 0, sil: 0, show: 0, missed: 0 }, v21: { wdi: 0, sil: 0, show: 0, missed: 0 } };
const t0 = Date.now();
for (const r of rows) {
  const si = P.prepare(r, optsFor(r, core));
  const n = normalizeInput(r);
  if (JSON.stringify(si.x2) === JSON.stringify(PV2.prepare(n).x)) R.feat.v2++;
  if (JSON.stringify(si.x21) === JSON.stringify(PV21.prepare(n).x)) R.feat.v21++;
  const d2 = MD.decide(m2, si), d21 = MD.decide(m21, si);
  const j2 = V2.decide(n), j21 = V21.decide(r);
  if (d2.label === j2.label) R.js.v2++; else if (R.js.diffs.length < 10) R.js.diffs.push({ id: r.id, m: 'v2', pkg: d2.label, js: j2.label });
  if (d21.label === j21.label) R.js.v21++; else if (R.js.diffs.length < 10) R.js.diffs.push({ id: r.id, m: 'v21', pkg: d21.label, js: j21.label });
  for (const [k, d, py] of [['v2', d2, py2 && py2.get(r.id)], ['v21', d21, py21 && py21.get(r.id)]]) {
    if (!py) continue;
    R.py[k].n++;
    if (d.label === py.pred) R.py[k].same++; else if (R.py[k].diffs.length < 10) R.py[k].diffs.push({ id: r.id, pkg: d.label, py: py.pred, pPkg: +d.pShow.toFixed(4), pPy: py.p, tau: d.tau });
    R.maxDp[k] = Math.max(R.maxDp[k], Math.abs(d.pShow - py.p));
    const y = r.reference.label;
    if (!r.reference.unsure) { if (y === 'SILENT') { conf[k].sil++; if (d.label !== 'SILENT') conf[k].wdi++; } else { conf[k].show++; if (d.label === 'SILENT') conf[k].missed++; } }
  }
}
for (const k of ['v2', 'v21']) {
  R.py[k].rate = R.py[k].n ? +(R.py[k].same / R.py[k].n).toFixed(5) : null;
  R.masked[k] = conf[k].sil ? { wrongDoItPct: +(100 * conf[k].wdi / conf[k].sil).toFixed(2), wrongDoIt: conf[k].wdi, missedPct: +(100 * conf[k].missed / conf[k].show).toFixed(2) } : null;
  R.maxDp[k] = +R.maxDp[k].toFixed(5);
}
R.secs = (Date.now() - t0) / 1000;
R.pySkipped = pySkipped ? 'artifacts/v2.test-preds.jsonl and artifacts/v21.test-preds.jsonl are missing. Feature parity and JS dense parity still run.' : null;
// Locked to the checked-in sklearn preds. 6,977/6,982 and 6,976/6,982 are both above the 99.9% spec gate.
const pyExact = pySkipped || LIMIT > 0 || (R.py.v2.same === 6977 && R.py.v2.n === 6982 && R.py.v21.same === 6976 && R.py.v21.n === 6982);
R.pass = R.feat.v2 === R.n && R.feat.v21 === R.n && R.js.v2 === R.n && R.js.v21 === R.n && (pySkipped || (R.py.v2.rate >= 0.999 && R.py.v21.rate >= 0.999 && pyExact));
fs.writeFileSync(path.join(__dirname, 'out', 'parity.json'), JSON.stringify(R, null, 1));
console.log(JSON.stringify({ n: R.n, featV2: R.feat.v2, featV21: R.feat.v21, pyV2: R.py.v2.same + '/' + R.py.v2.n + ' (' + R.py.v2.rate + ')', pyV21: R.py.v21.same + '/' + R.py.v21.n + ' (' + R.py.v21.rate + ')',
  jsDenseV2: R.js.v2, jsDenseV21: R.js.v21, maxDp: R.maxDp, masked: R.masked, pass: R.pass, secs: R.secs }));
process.exit(R.pass ? 0 : 1);
