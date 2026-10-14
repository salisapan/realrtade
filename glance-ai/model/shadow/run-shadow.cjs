'use strict';
// Shadow harness: teacher (0.9.34 engine) vs the in-house model, offline. Nothing is surfaced.
// Usage: node run-shadow.cjs [v1|v1c ...]   -> shadow/out/report.md + report.json + per-row predictions
const fs = require('fs'), path = require('path');
const { make } = require('../runtime/glance-close.cjs');
const DS = path.join(__dirname, '..', 'dataset', 'out');
const OUT = path.join(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });
const read = (f) => fs.readFileSync(path.join(DS, f), 'utf8').trim().split('\n').map(JSON.parse);
const variants = process.argv.slice(2).length ? process.argv.slice(2) : ['v1', 'v1c'];
const test = read('test.jsonl'), gold = read('gold22.jsonl'), adv = read('adversarial.jsonl');
const trainBodies = read('train.jsonl').map((r) => r.body);
const step = (l) => (l && l !== 'SILENT' ? l.split('|')[1] : 'SILENT');
const pct = (a, b) => (b ? (100 * a / b).toFixed(2) + '%' : 'n/a');
const MODES = ['teacherV2', 'model', 'modelVeto', 'modelVetoV2'];

// vs-teacher metrics (teacher = reference)
function vsTeacher(rows, mode) {
  let n = 0, agree = 0, showAgree = 0, tSil = 0, wdi = 0, tShow = 0, miss = 0, bothShow = 0, wrongAct = 0, freeSil = 0, freeWdi = 0;
  for (const r of rows) {
    const t = r.d.teacher, p = r.d[mode]; n++;
    if (t === p) agree++;
    if ((t === 'SILENT') === (p === 'SILENT')) showAgree++;
    if (t === 'SILENT') { tSil++; if (p !== 'SILENT') wdi++; if (!r.d.veto.base) { freeSil++; if (p !== 'SILENT') freeWdi++; } }
    else { tShow++; if (p === 'SILENT') miss++; else { bothShow++; if (step(p) !== step(t)) wrongAct++; } }
  }
  return { n, agree: pct(agree, n), showSilenceAgree: pct(showAgree, n), wrongDoIt: pct(wdi, tSil), wrongDoItN: wdi + '/' + tSil,
    wrongDoItModelFreeRegion: pct(freeWdi, freeSil) + ' (' + freeWdi + '/' + freeSil + ')', missedClose: pct(miss, tShow), missedN: miss + '/' + tShow,
    wrongActionWhenBothShow: pct(wrongAct, bothShow) };
}
function byGroup(rows, mode, keyFn) {
  const g = {};
  for (const r of rows) { const k = keyFn(r); (g[k] = g[k] || []).push(r); }
  const out = {};
  for (const [k, rs] of Object.entries(g).sort()) out[k] = vsTeacher(rs, mode);
  return out;
}
// vs M0 binary gold (model-labeled, not owner-verified)
function vsGold(rows, mode, which) {
  let tp = 0, fp = 0, fn = 0, tn = 0, wdT = 0, wd = 0;
  for (const r of rows) {
    const p = r[which][mode] !== 'SILENT' ? 'ASK' : 'SILENT', y = r.m0Label;
    if (p === 'ASK' && y === 'ASK') tp++; else if (p === 'ASK') fp++; else if (y === 'ASK') fn++; else tn++;
    if (r.wrongDoIt) { wdT++; if (p === 'ASK') wd++; }
  }
  return { doItPrecision: pct(tp, tp + fp), silenceRecall: pct(tn, tn + fp), askRecall: pct(tp, tp + fn), wrongDoIt: pct(wd, wdT) + ' (' + wd + '/' + wdT + ')' };
}
function advScore(rows, mode) {
  let ok = 0, n = 0; const fails = [];
  for (const r of rows) {
    if (r.expect === 'AMBIGUOUS') continue; n++;
    const got = step(mode === 'teacher' ? r.d.teacher : r.d[mode]);
    if (got === r.expect) ok++; else fails.push(r.id.replace('adv-', '') + '(' + got + ')');
  }
  return { correct: ok + '/' + n, fails };
}

const report = { generatedAt: new Date().toISOString(), sets: { test: test.length, gold22: gold.length, adversarial: adv.length }, variants: {} };
const md = ['# Glance shadow report', '', 'Generated ' + report.generatedAt + ' · teacher = 0.9.34 deterministic engine · offline only, nothing surfaced.', ''];
for (const v of variants) {
  const G = make(v);
  const T = test.map((r) => Object.assign({}, r, { d: G.decide(r, r.teacher) }));
  const GL = gold.map((r) => {
    const d = G.decide(r, r.teacher);
    const dt = G.decide(Object.assign({}, r, { direction: 'inbound', from: { name: 'Ext', email: 'ext@example.com' }, to: ['ai.local.flow@gmail.com'] }), r.teacherTextOnly);
    d.teacherMode = d.teacher; dt.teacherMode = dt.teacher;
    return Object.assign({}, r, { d, dt });
  });
  const AD = adv.map((r) => Object.assign({}, r, { d: G.decide(r, r.teacher), seenInTrain: trainBodies.some((b) => b.includes(r.body)) }));
  fs.writeFileSync(path.join(OUT, v + '.test-preds.jsonl'), T.map((r) => JSON.stringify({ id: r.id, prov: r.provenance, scenario: r.scenario, surface: r.surface, lang: r.lang, body: r.body.slice(0, 160), ...r.d })).join('\n') + '\n');
  const R = { tau: G.model.tau, overall: {}, bySource: {}, byScenario: {}, byTeacherLabel: {}, byLang: {}, gold22: {}, adversarial: {} };
  for (const mode of MODES) {
    R.overall[mode] = vsTeacher(T, mode);
    R.bySource[mode] = byGroup(T, mode, (r) => r.provenance.split(':')[0]);
    R.byLang[mode] = byGroup(T, mode, (r) => r.lang);
    R.byScenario[mode] = byGroup(T.filter((r) => r.provenance === 'synthetic'), mode, (r) => r.scenario);
    R.byTeacherLabel[mode] = byGroup(T, mode, (r) => r.d.teacher);
    R.gold22[mode] = { asDirection: vsGold(GL, mode === 'teacherV2' ? 'teacherV2' : mode, 'd'), textOnlyInbound: vsGold(GL, mode, 'dt') };
    R.adversarial[mode] = advScore(AD, mode);
  }
  R.gold22.teacher = { asDirection: vsGold(GL, 'teacherMode', 'd'), textOnlyInbound: vsGold(GL, 'teacherMode', 'dt') };
  R.adversarial.teacher = advScore(AD, 'teacher');
  R.adversarialRows = AD.map((r) => ({ id: r.id, kind: r.kind, expect: r.expect, teacher: r.d.teacher, model: r.d.model, modelVetoV2: r.d.modelVetoV2, veto: r.d.veto, pShow: +r.d.pShow.toFixed(3), seenInTrain: r.seenInTrain }));
  R.gold22Rows = GL.map((r) => ({ id: r.id, m0: r.m0Label, prior: r.modelLabelPrior, teacherTextOnly: r.dt.teacher, modelTextOnly: r.dt.model, modelVetoV2TextOnly: r.dt.modelVetoV2 }));
  // v2 rules cost: teacher shows that v2 would silence
  R.v2SilencedTeacherShows = T.filter((r) => r.d.teacher !== 'SILENT' && r.d.veto.v2).map((r) => ({ id: r.id, rule: r.d.veto.v2, teacher: r.d.teacher, body: r.body.slice(0, 120) }));
  // operating-point sweep (model + all vetoes) on held-out test
  R.tauSweep = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95].map((tau) => {
    let ts = 0, wd = 0, tsh = 0, miss = 0;
    for (const r of T) {
      const lab = r.d.pShow >= tau ? r.d.top : 'SILENT';
      const capped = require('../runtime/veto.cjs').capVeto(r, lab, require('../teacher/teacher.cjs').preprocess(r).own);
      const p = (r.d.veto.base || r.d.veto.v2 || capped) ? 'SILENT' : lab;
      if (r.d.teacher === 'SILENT') { ts++; if (p !== 'SILENT') wd++; } else { tsh++; if (p === 'SILENT') miss++; }
    }
    return { tau, wrongDoIt: pct(wd, ts) + ' (' + wd + ')', missedClose: pct(miss, tsh) };
  });
  R.wrongDoItRowsForOwnerReview = T.filter((r) => r.d.teacher === 'SILENT' && r.d.modelVetoV2 !== 'SILENT')
    .map((r) => ({ id: r.id, surface: r.surface, teacherReason: r.d.teacherReason, model: r.d.modelVetoV2, pShow: +r.d.pShow.toFixed(2), body: r.body.replace(/\n/g, ' ').slice(0, 140) }));
  report.variants[v] = R;

  md.push('## ' + v + '  (show threshold τ=' + G.model.tau + ')', '');
  md.push('### Held-out test (n=' + T.length + ') vs teacher', '', '| mode | agree (exact) | show/silence agree | **wrong-Do-It** | wrong-Do-It in model-free region | missed-close | wrong action when both show |', '|---|---|---|---|---|---|---|');
  for (const mode of MODES) { const o = R.overall[mode]; md.push(`| ${mode} | ${o.agree} | ${o.showSilenceAgree} | **${o.wrongDoIt}** (${o.wrongDoItN}) | ${o.wrongDoItModelFreeRegion} | ${o.missedClose} (${o.missedN}) | ${o.wrongActionWhenBothShow} |`); }
  md.push('', '### By source (modelVetoV2)', '', '| source | n | agree | wrong-Do-It | missed-close |', '|---|---|---|---|---|');
  for (const [k, o] of Object.entries(R.bySource.modelVetoV2)) md.push(`| ${k} | ${o.n} | ${o.agree} | ${o.wrongDoIt} (${o.wrongDoItN}) | ${o.missedClose} (${o.missedN}) |`);
  md.push('', '### By teacher label (modelVetoV2)', '', '| teacher label | n | agree | missed-close | wrong-Do-It |', '|---|---|---|---|---|');
  for (const [k, o] of Object.entries(R.byTeacherLabel.modelVetoV2)) md.push(`| ${k} | ${o.n} | ${o.agree} | ${o.missedClose} | ${o.wrongDoIt} |`);
  md.push('', '### By synthetic family (modelVetoV2)', '', '| scenario | n | agree | wrong-Do-It | missed-close |', '|---|---|---|---|---|');
  for (const [k, o] of Object.entries(R.byScenario.modelVetoV2)) md.push(`| ${k} | ${o.n} | ${o.agree} | ${o.wrongDoIt} | ${o.missedClose} |`);
  md.push('', '### gold22 (model-labeled, NOT owner-verified; M0 binary; text-only inbound view)', '', '| mode | Do It precision | silence recall | ASK recall | wrong-Do-It |', '|---|---|---|---|---|');
  for (const mode of ['teacher', ...MODES]) { const o = R.gold22[mode].textOnlyInbound; md.push(`| ${mode} | ${o.doItPrecision} | ${o.silenceRecall} | ${o.askRecall} | ${o.wrongDoIt} |`); }
  md.push('', '### Adversarial (spec labels, not owner-verified)', '', '| mode | correct | failures |', '|---|---|---|');
  for (const mode of ['teacher', ...MODES]) { const o = R.adversarial[mode]; md.push(`| ${mode} | ${o.correct} | ${o.fails.join(', ')} |`); }
  md.push('', '### Operating points (model + all vetoes, held-out test)', '', '| τ | wrong-Do-It vs teacher | missed-close |', '|---|---|---|');
  for (const o of R.tauSweep) md.push(`| ${o.tau} | ${o.wrongDoIt} | ${o.missedClose} |`);
  md.push('', '### Every wrong-Do-It (vs teacher) at the shipped τ — for owner adjudication', '');
  for (const o of R.wrongDoItRowsForOwnerReview) md.push(`- \`${o.id}\` ${o.surface} teacher=${o.teacherReason} model=${o.model} p=${o.pShow} — ${o.body}`);
  md.push('', 'v2 rules silenced ' + R.v2SilencedTeacherShows.length + ' teacher shows in test (cost/benefit list in report.json).', '');
}
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
fs.writeFileSync(path.join(OUT, 'report.md'), md.join('\n') + '\n');
console.log(md.join('\n'));
