'use strict';
// Shadow v2: v1 (+veto) vs v2 (+veto, and model alone) vs engines 0.9.34 / 0.9.35 / r35p, on
//   (1) v2 held-out test (product-correct reference; metrics both MASKED = unsure engine-recall-gap rows excluded, and STRICT)
//   (2) adversarial-v2 (spec labels)   (3) OSS worker eval set (binary act/silence gold, read-only)
// Lists every wrong-Do-It. Offline only.
const fs = require('fs'), path = require('path');
const { makeEngine } = require('../teacher/engine.cjs');
const V1 = require('../runtime/glance-close.cjs');
const V2 = require('../runtime/glance-close-v2.cjs');
const OUT = path.join(__dirname, 'out-v2'); fs.mkdirSync(OUT, { recursive: true });
const D = path.join(__dirname, '..', 'dataset', 'out-v2');
const read = (f) => fs.readFileSync(path.join(D, f), 'utf8').trim().split('\n').map(JSON.parse);
const engines = { 'engine-0.9.34': makeEngine('0.9.34'), 'engine-0.9.35': makeEngine('0.9.35'), 'engine-r35p': makeEngine('r35p') };
const v1 = V1.make('v1'), v1c = V1.make('v1c'), v2 = V2.make('v2');
const SYS = ['engine-0.9.34', 'engine-0.9.35', 'engine-r35p', 'v1+veto', 'v1c+veto', 'v2-model-alone', 'v2+veto'];
function run(r) {
  const o = {};
  for (const [k, e] of Object.entries(engines)) o[k] = e.teach(r).label;
  const a = v1.decide(r), b = v1c.decide(r); o['v1+veto'] = a.modelVetoV2; o['v1c+veto'] = b.modelVetoV2; // v1 with its full veto incl. its proposed v2 rules (most generous to v1)
  const d = v2.decide(r); o['v2+veto'] = d.label; o['v2-model-alone'] = d.modelAlone; o._v2 = d;
  return o;
}
const step = (l) => (l && l !== 'SILENT' ? l.split('|')[1] : 'SILENT');
const fam = (l) => (l && l !== 'SILENT' ? l.split('|')[0] : 'SILENT');
function score(rows, preds, opt) {
  const res = {};
  for (const s of SYS) {
    const m = { n: 0, refSilent: 0, refShow: 0, wdi: 0, missed: 0, wrongAction: 0, he: { show: 0, missed: 0, silent: 0, wdi: 0 }, en: { show: 0, missed: 0, silent: 0, wdi: 0 }, unsureShown: 0, strictWdi: 0, strictSilent: 0 };
    rows.forEach((r, i) => {
      const y = r.reference.label, p = preds[i][s], L = r.lang === 'he' ? 'he' : 'en';
      if (y === 'SILENT') { m.strictSilent++; if (p !== 'SILENT') m.strictWdi++; }
      if (opt.masked && r.reference.unsure) { if (p !== 'SILENT') m.unsureShown++; return; }
      m.n++;
      if (y === 'SILENT') { m.refSilent++; m[L].silent++; if (p !== 'SILENT') { m.wdi++; m[L].wdi++; } }
      else { m.refShow++; m[L].show++; if (p === 'SILENT') { m.missed++; m[L].missed++; } else if (p !== y) m.wrongAction++; }
    });
    const pc = (a, b) => (b ? +(100 * a / b).toFixed(2) : null);
    res[s] = { n: m.n, wrongDoItPct: pc(m.wdi, m.refSilent), wrongDoIt: m.wdi, missedPct: pc(m.missed, m.refShow), missedHePct: pc(m.he.missed, m.he.show), missedEnPct: pc(m.en.missed, m.en.show),
      wrongDoItHePct: pc(m.he.wdi, m.he.silent), wrongDoItEnPct: pc(m.en.wdi, m.en.silent), wrongAction: m.wrongAction, wrongActionPct: pc(m.wrongAction, m.refShow), unsureShown: m.unsureShown, strictWrongDoItPct: pc(m.strictWdi, m.strictSilent) };
  }
  return res;
}
function slice(rows, preds, keyFn) {
  const g = {}; rows.forEach((r, i) => { const k = keyFn(r); if (k == null) return; (g[k] = g[k] || { rows: [], preds: [] }).rows.push(r); g[k].preds.push(preds[i]); });
  const o = {}; for (const [k, v] of Object.entries(g)) o[k] = score(v.rows, v.preds, { masked: true }); return o;
}
const t0 = Date.now();
// (1) test
const test = read('test.jsonl'); const tp = test.map(run);
const R = { builtAt: new Date().toISOString(), reference: 'product-correct (engine 0.9.35 clean render + rule overrides); unsure = engine-recall-gap rows', test: {}, adversarial: {}, oss: {} };
R.test.masked = score(test, tp, { masked: true });
R.test.byLang = slice(test, tp, (r) => r.lang);
R.test.bySource = slice(test, tp, (r) => (r.provenance === 'synthetic-v2' ? 'synthetic:' + r.frameOrigin : r.provenance.split(':')[0]));
R.test.byRefFamily = slice(test, tp, (r) => (r.reference.unsure ? null : fam(r.reference.label)));
R.test.byLangFamily = slice(test, tp, (r) => (r.reference.unsure || r.reference.label === 'SILENT' ? null : r.lang + ':' + fam(r.reference.label)));
R.test.byRule = slice(test, tp, (r) => (r.reference.ruleCorrected.filter((x) => x !== 'typo-invariant')[0] || null));
R.test.formatSensitive = slice(test, tp, (r) => (r.formatSensitive ? 'formatSensitive' : null));
R.test.typo = slice(test, tp, (r) => (r.augment === 'typo' ? 'typo' : null));
const wdiList = (rows, preds, sysName, isWrong) => rows.map((r, i) => ({ r, p: preds[i] })).filter(({ r, p }) => isWrong(r, p[sysName])).map(({ r, p }) => ({ id: r.id, lang: r.lang, surface: r.surface, scenario: r.scenario || r.kind, ref: r.reference ? r.reference.label : r.gold, pred: p[sysName], pShow: p._v2 && +p._v2.pShow.toFixed(3), engine35: p['engine-0.9.35'], unsure: Boolean(r.reference && r.reference.unsure), body: String(r.body).slice(0, 220) }));
R.test.wrongDoIts = {};
for (const s of ['v2+veto', 'v1+veto', 'engine-0.9.35', 'engine-r35p']) R.test.wrongDoIts[s] = wdiList(test, tp, s, (r, p) => !r.reference.unsure && r.reference.label === 'SILENT' && p !== 'SILENT');
R.test.v2UnsureShown = wdiList(test, tp, 'v2+veto', (r, p) => r.reference.unsure && p !== 'SILENT');
// (2) adversarial
const adv = read('adversarial-v2.jsonl'); const ap = adv.map(run);
const advScore = {}; const advRows = [];
for (const s of SYS) { let ok = 0, n = 0, wdi = 0; adv.forEach((r, i) => { if (r.expect === 'AMBIGUOUS') return; n++; const g = step(ap[i][s]); if (g === r.expect) ok++; else if (r.expect === 'SILENT') wdi++; }); advScore[s] = { correct: ok, n, wrongDoIt: wdi }; }
adv.forEach((r, i) => advRows.push({ id: r.id, kind: r.kind, expect: r.expect, ...Object.fromEntries(SYS.map((s) => [s, step(ap[i][s])])), v2pShow: +ap[i]._v2.pShow.toFixed(3), v2veto: ap[i]._v2.veto }));
R.adversarial = { score: advScore, bySet: { v1: {}, v2: {} }, rows: advRows };
for (const set of ['v1', 'v2']) for (const s of SYS) { let ok = 0, n = 0; adv.forEach((r, i) => { if (r.set !== set || r.expect === 'AMBIGUOUS') return; n++; if (step(ap[i][s]) === r.expect) ok++; }); R.adversarial.bySet[set][s] = ok + '/' + n; }
// (3) OSS eval (binary)
const oss = read('oss-eval.jsonl'); const op = oss.map(run);
for (const s of SYS) {
  const m = { n: oss.length, act: 0, silence: 0, wdi: 0, missed: 0, heAct: 0, heMissed: 0 };
  oss.forEach((r, i) => { const show = op[i][s] !== 'SILENT'; if (r.gold === 'act') { m.act++; if (!show) m.missed++; if (r.lang === 'he') { m.heAct++; if (!show) m.heMissed++; } } else { m.silence++; if (show) m.wdi++; } });
  R.oss[s] = { wrongDoIt: m.wdi + '/' + m.silence, wrongDoItPct: +(100 * m.wdi / m.silence).toFixed(2), missed: m.missed + '/' + m.act, missedPct: +(100 * m.missed / m.act).toFixed(2), missedHePct: +(100 * m.heMissed / Math.max(1, m.heAct)).toFixed(2) };
}
R.ossWrongDoIts = {}; for (const s of ['v2+veto', 'v1+veto', 'engine-0.9.35']) R.ossWrongDoIts[s] = oss.map((r, i) => ({ r, p: op[i] })).filter(({ r, p }) => r.gold === 'silence' && p[s] !== 'SILENT').map(({ r, p }) => ({ id: r.id, set: r.set, lang: r.lang, pred: p[s], goldSource: r.goldSource, body: String(r.body).slice(0, 200) }));
R.elapsedSec = (Date.now() - t0) / 1000;
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(R, null, 1));
fs.writeFileSync(path.join(OUT, 'test-preds.jsonl'), test.map((r, i) => JSON.stringify({ id: r.id, lang: r.lang, ref: r.reference.label, unsure: Boolean(r.reference.unsure), ...Object.fromEntries(SYS.map((s) => [s, tp[i][s]])), v2pShow: +tp[i]._v2.pShow.toFixed(4), v2veto: tp[i]._v2.veto })).join('\n') + '\n');
// markdown
const T = (title, res, cols) => { let s = `\n### ${title}\n\n| system | ${cols.map((c) => c[0]).join(' | ')} |\n|---|${cols.map(() => '---').join('|')}|\n`; for (const k of SYS) s += `| ${k} | ${cols.map((c) => (res[k] ? res[k][c[1]] : '')).join(' | ')} |\n`; return s; };
const MC = [['wrong-Do-It %', 'wrongDoItPct'], ['wrong-Do-It n', 'wrongDoIt'], ['missed-close %', 'missedPct'], ['HE missed %', 'missedHePct'], ['EN missed %', 'missedEnPct'], ['wrong action n', 'wrongAction'], ['unsure rows shown', 'unsureShown'], ['STRICT wrong-Do-It %', 'strictWrongDoItPct']];
let md = `# Shadow v2 report\n\nBuilt ${R.builtAt}. Reference = product-correct labels (engine 0.9.35 on the clean render + rule overrides; NOT owner-verified).\nMasked metrics exclude ${test.filter((r) => r.reference.unsure).length} test rows flagged *unsure* (engine said nothing = intent-null on an ask-shaped frame addressed to the user; owner must decide). STRICT counts every reference silence, including those.\nEngines are run on the live-shaped body (what production sees).\n`;
md += T('Held-out test (masked)', R.test.masked, MC);
for (const L of ['he', 'en']) md += T('Held-out test, lang=' + L, R.test.byLang[L], MC.slice(0, 6));
for (const k of Object.keys(R.test.bySource)) md += T('Held-out test, source=' + k, R.test.bySource[k], MC.slice(0, 6));
md += '\n### Missed-close % by reference family (masked)\n\n| family | ' + SYS.join(' | ') + ' |\n|---|' + SYS.map(() => '---').join('|') + '|\n';
for (const [f, v] of Object.entries(R.test.byRefFamily)) if (f !== 'SILENT') md += `| ${f} (n=${v['v2+veto'].n}) | ${SYS.map((s) => v[s].missedPct).join(' | ')} |\n`;
md += '\n### Missed-close % by lang:family (masked)\n\n| lang:family | ' + SYS.join(' | ') + ' |\n|---|' + SYS.map(() => '---').join('|') + '|\n';
for (const [f, v] of Object.entries(R.test.byLangFamily).sort()) md += `| ${f} (n=${v['v2+veto'].n}) | ${SYS.map((s) => v[s].missedPct).join(' | ')} |\n`;
md += '\n### Rule-corrected rows: wrong-Do-It % (these are the confirmed engine bugs)\n\n| rule | ' + SYS.join(' | ') + ' |\n|---|' + SYS.map(() => '---').join('|') + '|\n';
for (const [f, v] of Object.entries(R.test.byRule)) md += `| ${f} (n=${v['v2+veto'].n}) | ${SYS.map((s) => (v[s].wrongDoItPct != null ? v[s].wrongDoItPct : 'miss ' + v[s].missedPct)).join(' | ')} |\n`;
if (R.test.formatSensitive.formatSensitive) md += T('Format-sensitive rows (engine flips between clean and live render)', R.test.formatSensitive.formatSensitive, MC.slice(0, 6));
if (R.test.typo.typo) md += T('Typo rows', R.test.typo.typo, MC.slice(0, 6));
md += `\n### Adversarial-v2 (spec labels, never trained on; AMBIGUOUS excluded)\n\n| system | correct | wrong-Do-It | v1 set | v2 set |\n|---|---|---|---|---|\n`;
for (const s of SYS) md += `| ${s} | ${advScore[s].correct}/${advScore[s].n} | ${advScore[s].wrongDoIt} | ${R.adversarial.bySet.v1[s]} | ${R.adversarial.bySet.v2[s]} |\n`;
md += '\n| case | expect | ' + SYS.join(' | ') + ' |\n|---|---|' + SYS.map(() => '---').join('|') + '|\n';
for (const a of advRows) md += `| ${a.id} | ${a.expect} | ${SYS.map((s) => (a[s] === a.expect ? a[s] : '**' + a[s] + '**')).join(' | ')} |\n`;
md += `\n### OSS-worker eval set (275 rows, binary gold act/silence, external phrasing; gold partly teacher-derived)\n\n| system | wrong-Do-It | % | missed | % | HE missed % |\n|---|---|---|---|---|---|\n`;
for (const s of SYS) md += `| ${s} | ${R.oss[s].wrongDoIt} | ${R.oss[s].wrongDoItPct} | ${R.oss[s].missed} | ${R.oss[s].missedPct} | ${R.oss[s].missedHePct} |\n`;
const L = (title, list) => { let s = `\n### ${title} (${list.length})\n\n`; for (const w of list) s += `- \`${w.id}\` [${w.lang}/${w.surface || w.set}/${w.scenario || w.goldSource}] ref=${w.ref || 'silence'} pred=${w.pred}${w.pShow != null ? ' p=' + w.pShow : ''}${w.engine35 ? ' eng35=' + w.engine35 : ''} — ${JSON.stringify(w.body)}\n`; return s; };
md += '\n## All wrong-Do-Its\n' + L('v2+veto, held-out test (masked)', R.test.wrongDoIts['v2+veto']) + L('v1+veto, held-out test (masked)', R.test.wrongDoIts['v1+veto']);
md += L('v2+veto, OSS eval', R.ossWrongDoIts['v2+veto']) + L('v1+veto, OSS eval', R.ossWrongDoIts['v1+veto']) + L('engine 0.9.35, OSS eval', R.ossWrongDoIts['engine-0.9.35']);
md += `\n- engine-0.9.35 held-out wrong-Do-Its vs product reference: ${R.test.wrongDoIts['engine-0.9.35'].length} (all listed in report.json); engine-r35p: ${R.test.wrongDoIts['engine-r35p'].length}\n`;
md += L('v2+veto shows on UNSURE rows (not counted as wrong-Do-It in masked metrics; owner decides)', R.test.v2UnsureShown.slice(0, 40)) + (R.test.v2UnsureShown.length > 40 ? `\n…${R.test.v2UnsureShown.length - 40} more in report.json\n` : '');
fs.writeFileSync(path.join(OUT, 'report.md'), md);
console.log(JSON.stringify({ masked: R.test.masked, adversarial: advScore, oss: R.oss, elapsed: R.elapsedSec }, null, 1));
