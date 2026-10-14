'use strict';
// Shadow v2.1: v1 / v2 / v2.1 (+veto) and engines side by side. NEW in v2.1: the minimal normalizer (runtime/normalize-v21.cjs:
// CRLF, nbsp, zero-width, bidi) runs in FRONT of every system (engines and models); "engine-0.9.35 raw" is kept for reference.
// Sets: (1) v2 held-out test (identical rows/labels to the v2 report; masked + STRICT)  (2) v2.1 new-shape test slice (bare /
// subject-only renders and v21 short-ask frames from held-out frames, v2.1 dataset labels)  (3) adversarial-v21 (v2's 74 + 40 bare
// probes; spec labels)  (4) OSS worker eval (binary). Offline only; nothing surfaces a Do It. Output: shadow/out-v21/.
const fs = require('fs'), path = require('path');
const { makeEngine } = require('../teacher/engine.cjs');
const { normalizeInput } = require('../runtime/normalize-v21.cjs');
const V1 = require('../runtime/glance-close.cjs'), V2 = require('../runtime/glance-close-v2.cjs'), V21 = require('../runtime/glance-close-v21.cjs');
const OUT = path.join(__dirname, 'out-v21'); fs.mkdirSync(OUT, { recursive: true });
const rd = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8').trim().split('\n').map(JSON.parse);
const engines = { '0.9.34': makeEngine('0.9.34'), '0.9.35': makeEngine('0.9.35'), r35p: makeEngine('r35p') };
const v1 = V1.make('v1'), v2 = V2.make('v2'), v21 = V21.make(process.env.V21_TAG || 'v21');
const SYS = ['engine-0.9.35 raw', 'engine-0.9.34+norm', 'engine-0.9.35+norm', 'engine-r35p+norm', 'v1+veto', 'v2+veto', 'v2.1-model-alone', 'v2.1+veto', 'v2.1+veto no-floor'];
function run(r) {
  const n = normalizeInput(r), o = {};
  o['engine-0.9.35 raw'] = engines['0.9.35'].teach(r).label;
  for (const k of ['0.9.34', '0.9.35', 'r35p']) o['engine-' + k + '+norm'] = engines[k].teach(n).label;
  o['v1+veto'] = v1.decide(n).modelVetoV2;
  o['v2+veto'] = v2.decide(n).label;
  const d = v21.decide(r); o['v2.1+veto'] = d.label; o['v2.1-model-alone'] = d.modelAlone;
  o['v2.1+veto no-floor'] = d.floorBlocked && !d.veto ? d.top : d.label; delete d.x; o._v21 = d;
  return o;
}
const step = (l) => (l && l !== 'SILENT' ? l.split('|')[1] : 'SILENT');
const pc = (a, b) => (b ? +(100 * a / b).toFixed(2) : null);
function score(rows, preds, masked) {
  const res = {};
  for (const s of SYS) {
    const m = { n: 0, sil: 0, show: 0, wdi: 0, missed: 0, wa: 0, ws: 0, L: { he: { show: 0, missed: 0 }, en: { show: 0, missed: 0 } }, uS: 0, sW: 0, sS: 0 };
    rows.forEach((r, i) => {
      const y = r.reference.label, p = preds[i][s], L = r.lang === 'he' ? 'he' : 'en';
      if (y === 'SILENT') { m.sS++; if (p !== 'SILENT') m.sW++; }
      if (masked && r.reference.unsure) { if (p !== 'SILENT') m.uS++; return; }
      m.n++;
      if (y === 'SILENT') { m.sil++; if (p !== 'SILENT') m.wdi++; }
      else { m.show++; m.L[L].show++; if (p === 'SILENT') { m.missed++; m.L[L].missed++; } else if (p !== y) { m.wa++; if (step(p) !== step(y)) m.ws++; } }
    });
    res[s] = { n: m.n, wrongDoItPct: pc(m.wdi, m.sil), wrongDoIt: m.wdi, strictPct: pc(m.sW, m.sS), unsureShown: m.uS, missedPct: pc(m.missed, m.show), missedHePct: pc(m.L.he.missed, m.L.he.show),
      missedEnPct: pc(m.L.en.missed, m.L.en.show), wrongAction: m.wa, wrongActionPct: pc(m.wa, m.show), wrongStep: m.ws };
  }
  return res;
}
function slice(rows, preds, keyFn) { const g = {}; rows.forEach((r, i) => { const k = keyFn(r); if (k == null) return; (g[k] = g[k] || { r: [], p: [] }).r.push(r); g[k].p.push(preds[i]); }); const o = {}; for (const [k, v] of Object.entries(g)) o[k] = score(v.r, v.p, true); return o; }
const t0 = Date.now(); const R = { builtAt: new Date().toISOString(), v21Tag: process.env.V21_TAG || 'v21' };
// (1) v2 held-out test
const test = rd('dataset/out-v2/test.jsonl'); const tp = test.map(run);
R.test = { masked: score(test, tp, true), byLang: slice(test, tp, (r) => r.lang),
  bySource: slice(test, tp, (r) => (r.provenance === 'synthetic-v2' ? 'synthetic:' + r.frameOrigin : r.provenance.split(':')[0])),
  formatSensitive: slice(test, tp, (r) => (r.formatSensitive ? 'formatSensitive' : null)).formatSensitive,
  byRule: slice(test, tp, (r) => (r.reference.ruleCorrected.filter((x) => x !== 'typo-invariant')[0] || null)) };
const list = (rows, preds, s, f) => rows.map((r, i) => ({ r, p: preds[i] })).filter(({ r, p }) => f(r, p[s])).map(({ r, p }) => ({ id: r.id, lang: r.lang, ref: r.reference.label, pred: p[s], pShow: +p._v21.pShow.toFixed(3), body: String(r.body).slice(0, 200) }));
R.test.wrongDoIts = { 'v2.1+veto': list(test, tp, 'v2.1+veto', (r, p) => !r.reference.unsure && r.reference.label === 'SILENT' && p !== 'SILENT'), 'v2+veto': list(test, tp, 'v2+veto', (r, p) => !r.reference.unsure && r.reference.label === 'SILENT' && p !== 'SILENT') };
R.test.wrongActions = list(test, tp, 'v2.1+veto', (r, p) => !r.reference.unsure && r.reference.label !== 'SILENT' && p !== 'SILENT' && p !== r.reference.label);
console.error('test done', (Date.now() - t0) / 1000);
// (2) v2.1 new-shape slice (held-out frames only)
const t21 = rd('dataset/out-v21/test.jsonl').filter((r) => r.render && (r.render.style === 'bare' || r.render.style === 'subject-only' || r.frameOrigin === 'v21-frame'));
const p21 = t21.map(run);
R.newShapes = { all: score(t21, p21, true), byStyle: slice(t21, p21, (r) => r.render.style + (r.frameOrigin === 'v21-frame' ? ':v21-frame' : ':v1v2-frame')), byLang: slice(t21, p21, (r) => r.lang) };
R.newShapes.wrongDoIts = list(t21, p21, 'v2.1+veto', (r, p) => !r.reference.unsure && r.reference.label === 'SILENT' && p !== 'SILENT');
console.error('new shapes done', (Date.now() - t0) / 1000);
// (3) adversarial
const adv = rd('dataset/out-v21/adversarial-v21.jsonl'); const ap = adv.map(run);
R.adversarial = { bySet: {}, rows: adv.map((r, i) => ({ id: r.id, set: r.set, kind: r.kind, expect: r.expect, ...Object.fromEntries(SYS.map((s) => [s, step(ap[i][s])])), v21p: +ap[i]._v21.pShow.toFixed(3), v21veto: ap[i]._v21.veto })) };
for (const set of [['v1+v2 (72)', (r) => r.set !== 'v21'], ['v21 bare (37)', (r) => r.set === 'v21'], ['all', () => true]]) {
  R.adversarial.bySet[set[0]] = {};
  for (const s of SYS) { let ok = 0, n = 0, w = 0; adv.forEach((r, i) => { if (!set[1](r) || r.expect === 'AMBIGUOUS') return; n++; const g = step(ap[i][s]); if (g === r.expect) ok++; else if (r.expect === 'SILENT') w++; }); R.adversarial.bySet[set[0]][s] = { correct: ok, n, wrongDoIt: w }; }
}
// (4) OSS
const oss = rd('dataset/out-v2/oss-eval.jsonl'); const op = oss.map(run); R.oss = {};
for (const s of SYS) { let a = 0, si = 0, w = 0, mi = 0, ha = 0, hm = 0; oss.forEach((r, i) => { const sh = op[i][s] !== 'SILENT'; if (r.gold === 'act') { a++; if (!sh) mi++; if (r.lang === 'he') { ha++; if (!sh) hm++; } } else { si++; if (sh) w++; } }); R.oss[s] = { wrongDoIt: w + '/' + si, missedPct: pc(mi, a), missedHePct: pc(hm, ha) }; }
R.elapsedSec = (Date.now() - t0) / 1000;
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(R, null, 1));
fs.writeFileSync(path.join(OUT, 'test-preds.jsonl'), test.map((r, i) => JSON.stringify({ id: r.id, ref: r.reference.label, unsure: Boolean(r.reference.unsure), ...Object.fromEntries(SYS.map((s) => [s, tp[i][s]])), v21: tp[i]._v21 })).join('\n') + '\n');
// markdown
const MC = [['wrong-Do-It % (masked)', 'wrongDoItPct'], ['n', 'wrongDoIt'], ['STRICT %', 'strictPct'], ['missed %', 'missedPct'], ['HE missed %', 'missedHePct'], ['EN missed %', 'missedEnPct'], ['wrong action n', 'wrongAction'], ['wrong action % of ref shows', 'wrongActionPct'], ['wrong step n', 'wrongStep']];
const T = (title, res, cols) => { cols = cols || MC; let s = `\n### ${title}\n\n| system | ${cols.map((c) => c[0]).join(' | ')} |\n|---|${cols.map(() => '---').join('|')}|\n`; for (const k of SYS) if (res[k]) s += `| ${k} | ${cols.map((c) => res[k][c[1]]).join(' | ')} |\n`; return s; };
let md = `# Shadow v2.1 report\n\nBuilt ${R.builtAt}. Labels: product-correct reference (engine 0.9.35 clean render + rule overrides), NOT owner-verified. Minimal normalizer in front of every system (except "engine-0.9.35 raw"). Masked = unsure engine-recall-gap rows excluded; STRICT counts them as silences.\n`;
md += T('(1) v2 held-out test (same rows and labels as the v2 report)', R.test.masked);
for (const [k, v] of Object.entries(R.test.bySource)) md += T('v2 test, source=' + k, v);
for (const [k, v] of Object.entries(R.test.byLang)) md += T('v2 test, lang=' + k, v);
if (R.test.formatSensitive) md += T('v2 test, format-sensitive rows', R.test.formatSensitive);
md += '\n### v2 test, rule-corrected slices: wrong-Do-It %\n\n| rule | ' + SYS.join(' | ') + ' |\n|---|' + SYS.map(() => '---').join('|') + '|\n';
for (const [k, v] of Object.entries(R.test.byRule)) md += `| ${k} | ${SYS.map((s) => (v[s].wrongDoItPct != null ? v[s].wrongDoItPct : 'miss ' + v[s].missedPct)).join(' | ')} |\n`;
md += T(`(2) v2.1 new-shape slice (${t21.length} rows from held-out frames)`, R.newShapes.all);
for (const [k, v] of Object.entries(R.newShapes.byStyle)) md += T('new shapes, ' + k, v);
md += '\n### (3) Adversarial (spec labels; AMBIGUOUS excluded)\n\n| system | ' + Object.keys(R.adversarial.bySet).map((k) => k + ' correct | wDI').join(' | ') + ' |\n|---|' + Object.keys(R.adversarial.bySet).map(() => '---|---').join('|') + '|\n';
for (const s of SYS) md += `| ${s} | ${Object.values(R.adversarial.bySet).map((v) => v[s].correct + '/' + v[s].n + ' | ' + v[s].wrongDoIt).join(' | ')} |\n`;
md += '\n| case | expect | ' + SYS.join(' | ') + ' |\n|---|---|' + SYS.map(() => '---').join('|') + '|\n';
for (const a of R.adversarial.rows) if (a.set === 'v21' || SYS.some((s) => s.startsWith('v2') && a[s] !== a.expect)) md += `| ${a.id} | ${a.expect} | ${SYS.map((s) => (a[s] === a.expect ? a[s] : '**' + a[s] + '**')).join(' | ')} |\n`;
md += '\n### (4) OSS-worker eval (275, binary)\n\n| system | wrong-Do-It | missed % | HE missed % |\n|---|---|---|---|\n'; for (const s of SYS) md += `| ${s} | ${R.oss[s].wrongDoIt} | ${R.oss[s].missedPct} | ${R.oss[s].missedHePct} |\n`;
const L = (t, l) => `\n### ${t} (${l.length})\n\n` + l.map((w) => `- \`${w.id}\` [${w.lang}] ref=${w.ref} pred=${w.pred} p=${w.pShow} — ${JSON.stringify(w.body)}`).join('\n') + '\n';
md += '\n## Lists\n' + L('v2.1+veto wrong-Do-Its, v2 test (masked)', R.test.wrongDoIts['v2.1+veto']) + L('v2+veto wrong-Do-Its, v2 test (masked; minimal-normalized input)', R.test.wrongDoIts['v2+veto']) + L('v2.1+veto wrong-Do-Its, new-shape slice', R.newShapes.wrongDoIts) + L('v2.1+veto wrong actions, v2 test', R.test.wrongActions);
fs.writeFileSync(path.join(OUT, 'report.md'), md);
console.log(JSON.stringify({ test: R.test.masked, newShapes: R.newShapes.all, adv: R.adversarial.bySet, oss: R.oss, sec: R.elapsedSec }, null, 0));
