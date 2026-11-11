// SEALED variant of export-frozen.cjs: batch-009 only (labeling/sealed/), written to labeling/sealed/frozen-sealed.jsonl and train/features-sealed/. Run ONCE, for the opening
// logged in labeling/sealed/README.md. The original header follows.
// Frozen label set (2026-11-11). FINDING: the label files (agreement-gold, batch claude-labels, overlay) are keyed by dataset row id ("v2syn-22856"),
// and those ids are POSITIONAL: any change to the generator (a new template) renumbers rows and moves the texts. After the 2026-11-08 rebuild only
// 172 of the 500 labelled texts exist in the dataset at all (165 under the same id, 7 under another), so every score computed by joining labels to
// `out-v2/test.jsonl` by id since then scored many labels against the WRONG text. The batch files carry the text with the label, so the label set is
// frozen here as text: labeling/frozen-eval.jsonl (text, metadata, labels per pass, agreement, undated-ask flag) and a feature export of the same
// rows (train/features-frozen/frozen.jsonl) that train-v2.py predicts with `--extra`. Rows are keyed `bNNN-<item>`; a text that appears in two
// batches is kept once (the earlier batch); a text that also appears in the current train or val split is dropped (contamination), and counted.
// usage: GLANCE_TIP=... GLANCE_V2_ENGINE=0.9.35 GLANCE_NOW=... node train/export-frozen.cjs
'use strict';
const fs = require('fs'), path = require('path');
const G = path.join(__dirname, '..', '..');
const L = path.join(G, 'labeling', 'sealed');
const LBASE = path.join(G, 'labeling');
const read = (p) => fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const { prepare } = require('../runtime/pipeline-v2.cjs');
const { makeEngine } = require('../teacher/engine.cjs');
const { merge } = require(path.join(LBASE, 'merge-passes.cjs'));
const { cid } = require(path.join(__dirname, '..', 'dataset', 'cid.cjs'));
const tip = makeEngine('tip');
const step = (l) => (!l || l === 'SILENT' ? 'SILENT' : String(l).split('|').pop());
const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const seen = new Set();
for (const f of ['train', 'val']) for (const r of read(path.join(G, 'model', 'dataset', 'out-v2', f + '.jsonl'))) { seen.add(norm(r.body)); seen.add(norm(r.cleanBody)); }
const frozen = [], feats = []; const stats = { rows: 0, dupText: 0, inTrainVal: 0, kept: 0 };
const taken = new Set();
for (const b of ['009'].filter((b) => fs.existsSync(path.join(L, `batch-${b}.pass2-labels.jsonl`)))) {
  const rows = JSON.parse(fs.readFileSync(path.join(L, `batch-${b}.json`), 'utf8'));
  const p1 = read(path.join(L, `batch-${b}.claude-labels.jsonl`)), p2 = read(path.join(L, `batch-${b}.pass2-labels.jsonl`));
  const by1 = Object.fromEntries(p1.map((x) => [x.item, x])), by2 = Object.fromEntries(p2.map((x) => [x.item, x]));
  const m = merge(p1, p2); const agreed = Object.fromEntries(m.agreed.map((x) => [x.item, x]));
  for (const r of rows) {
    stats.rows++;
    const t = norm(r.body);
    if (taken.has(t)) { stats.dupText++; continue; }
    if (seen.has(t)) { stats.inTrainVal++; continue; }
    taken.add(t);
    const id = `b${b}-${r.item}`;
    const l1 = by1[r.item] || {}, l2 = by2[r.item] || {}, ag = agreed[r.item] || null;
    const row = Object.assign({}, r, { cleanBody: r.body, ownNames: ['Sali', 'Sali Sapan', 'סאלי'], batch: b });
    const P = prepare(row);
    const tipOut = tip.teach(Object.assign({}, row, { body: row.body }));
    const tipStep = step(tipOut.label);
    frozen.push({ id, cid: cid(Object.assign({}, r, { cleanBody: r.body })), srcId: r.id, batch: b, item: r.item, lang: r.lang, scenario: r.scenario, surface: r.surface, direction: r.direction, from: r.from, to: r.to, cc: r.cc, subject: r.subject,
      attachmentCount: r.attachmentCount || 0, body: r.body, pass1: l1.step || null, pass2: l2.step || null, undatedAsk: Boolean(l1.undatedAsk || l2.undatedAsk),
      agreed: ag ? ag.step : null, tip: tipStep, tipReason: tipOut.reason });
    feats.push({ id, x: P.x, y: 'SILENT', ybin: 0, unsure: false, scenario: r.scenario || null, lang: r.lang, surface: r.surface, direction: r.direction, att: r.attachmentCount || 0,
      voc: P.voc, role: P.role, vb: P.veto.base, vp: P.veto.product, vc: P.veto.cap, eng: P.eng.label, prov: 'frozen', tip: tipStep });
    stats.kept++;
  }
}
fs.writeFileSync(path.join(L, 'frozen-sealed.jsonl'), frozen.map((x) => JSON.stringify(x)).join('\n') + '\n');
const D = path.join(__dirname, 'features-sealed'); fs.mkdirSync(D, { recursive: true }); fs.copyFileSync(path.join(__dirname, 'features-v2', 'meta.json'), path.join(D, 'meta.json'));
fs.writeFileSync(path.join(D, 'frozen.jsonl'), feats.map((x) => JSON.stringify(x)).join('\n') + '\n');
console.log(JSON.stringify(stats), 'agreed:', frozen.filter((x) => x.agreed).length, 'undatedAsk:', frozen.filter((x) => x.undatedAsk).length);
