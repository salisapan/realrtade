'use strict';
// Glance model scoreboard (Phase 0 of docs/glance-ai/model-upgrade-plan.md): ONE command that prints the seven metrics, by label
// source, Hebrew and English apart, with n and a 95% Wilson interval, for any number of models. Lab only; nothing leaves the machine.
//
//   node scoreboard/run.cjs --models v2=model/v23/base/base.test-preds.jsonl,v26=model/v2x/v26/v26.test-preds.jsonl
//                           [--judged name=file.jsonl,...]   cached predictions already in judge format {id, pred:{decision,family}}
//                                                            (a frontier model run, an OSS run): scored as "alone" only, same labels
//                           [--json out.json] [--md out.md]
//   needs the engine environment of glance-ai/model/V23.md (GLANCE_TIP, GLANCE_V2_ENGINE, GLANCE_NOW, GLANCE_ENGINE_ROOTS).
//
// Label sources (never mixed): owner-verified (ownerVerified true), two-pass agreement (agreed, passes >= 2), single blind pass
// (batch-NNN.claude-labels, labelled by Claude, one pass). Spec labels (the generator's reference) are the model's own training
// target and are NOT a source here. The seven metrics: 1 wrong Do It, 2 missed closes, 3 wrong action, 4 proof rate, 5 calibration,
// 6 Hebrew-English gap, 7 cost and latency. 4 and 7 print "n/a" with the reason until real use / a measured run supplies them.
const fs = require('fs'), path = require('path'), cp = require('child_process'), os = require('os');
const G = path.join(__dirname, '..');
const gate = require(path.join(G, 'oss', 'finetune', 'promote_gate.cjs'));
const read = (p) => fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const pairs = (s) => String(s || '').split(',').filter(Boolean).map((x) => { const i = x.indexOf('='); return [x.slice(0, i), x.slice(i + 1)]; });
const MODELS = pairs(arg('models')), JUDGED = pairs(arg('judged'));
if (!MODELS.length && !JUDGED.length) { console.error('usage: node scoreboard/run.cjs --models name=pred.jsonl,... [--judged name=file.jsonl,...] [--json out] [--md out]'); process.exit(2); }

// 95% Wilson interval for k of n (the honest way to print a rate on a few hundred rows)
function wilson(k, n) {
  if (!n) return [0, 0];
  const z = 1.96, p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return [Math.max(0, (c - h) / d), Math.min(1, (c + h) / d)];
}
const pct = (x) => (100 * x).toFixed(1) + '%';
const rate = (k, n) => (n ? pct(k / n) + ' [' + wilson(k, n).map(pct).join('–') + '] ' + k + '/' + n : 'n/a (0 rows)');

// label sources, discovered from the files in labeling/ (never from the model's training reference)
const L = path.join(G, 'labeling');
const sources = [];
const agree = path.join(L, 'agreement-gold.jsonl');
const all = [];
for (const f of fs.readdirSync(L).filter((f) => /\.jsonl$/.test(f) && f !== 'owner-convention-overlay.jsonl')) {
  let rows; try { rows = read(path.join(L, f)); } catch (e) { continue; }
  if (!rows.length || !rows[0].id || !('step' in rows[0])) continue;
  rows.forEach((r) => all.push(Object.assign({ _file: f }, r)));
}
// owner decisions applied to labels (labeling/owner-convention-overlay.jsonl): a row decided by a convention (today C-4, an undated ask
// gets a Do It) leaves the source it came from and is reported on its own, because its step is derived by a rule, not blind-labelled.
const overlayFile = path.join(L, 'owner-convention-overlay.jsonl');
const overlay = fs.existsSync(overlayFile) ? read(overlayFile) : [];
const overlaid = new Set(overlay.map((r) => r.id));
const byId = (rows) => Object.fromEntries(rows.map((r) => [r.id, r]));
const free = all.filter((r) => !overlaid.has(r.id));
const owner = free.filter((r) => r.ownerVerified === true);
const agreed = free.filter((r) => r.ownerVerified !== true && r.agreed === true && (r.passes || 0) >= 2);
const single = free.filter((r) => r.ownerVerified !== true && !(r.agreed === true && (r.passes || 0) >= 2) && /claude-labels/.test(r._file));
sources.push(['owner-verified', owner], ['two-pass agreement (NOT owner-verified)', agreed], ['single blind pass (Claude, NOT owner-verified)', single],
  ['owner-convention, rule-derived (C-4: an undated ask gets a Do It; NOT agreement, NOT owner-verified)', overlay]);

// product order and alone predictions for v2-family test preds, through the existing gate-inputs (same engine, same veto)
function gateInputs(rows, models) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'scoreboard-'));
  const lf = path.join(tmp, 'labels.jsonl'); fs.writeFileSync(lf, Object.values(byId(rows)).map((r) => JSON.stringify(r)).join('\n') + '\n');
  const rel = path.relative(G, lf);
  cp.execFileSync('node', [path.join(L, 'gate-inputs.cjs'), '--out', tmp, '--labels', rel, '--models', models.map(([n, p]) => n + '=' + p).join(',')], { cwd: G, stdio: ['ignore', 'pipe', 'inherit'] });
  return tmp;
}
// the baseline every model is read against: the rules engine plus veto with no model behind it (an always-silent model file)
const emptyFile = path.join(os.tmpdir(), 'scoreboard-empty.jsonl'); fs.writeFileSync(emptyFile, '');
MODELS.unshift(['engine-only', path.relative(G, emptyFile)]);
const preds = {};
for (const [n, p] of MODELS) preds[n] = Object.fromEntries(read(path.join(G, p)).map((r) => [r.id, r]));

const out = { generatedFrom: 'glance-ai/scoreboard/run.cjs', sources: [] };
function metrics(P, cases, labelMap) {
  const s = gate.score(P, cases, labelMap, undefined, null);
  const he = s.he, en = s.en, a = s.all;
  return { n: a.n, silent: a.silentGold, act: a.actGold, wrongDoIt: a.wrongDoIt, missed: a.missed, wrongAction: a.wrongAction,
    he: { silent: he.silentGold, act: he.actGold, wrongDoIt: he.wrongDoIt, missed: he.missed },
    en: { silent: en.silentGold, act: en.actGold, wrongDoIt: en.wrongDoIt, missed: en.missed } };
}
// calibration of the show gate (model alone): ECE over 10 bins and Brier, against "the gold says act"
function calibration(P, labelMap) {
  const rows = []; for (const id in labelMap) { const g = labelMap[id].step; const x = P[id]; if (!x || typeof x.p !== 'number' || g === 'CONTEXT' || g === 'UNSURE' || g === 'ANY') continue; rows.push([x.p, g === 'SILENT' ? 0 : 1]); }
  if (rows.length < 30) return { n: rows.length, ece: null, brier: null };
  const bins = Array.from({ length: 10 }, () => [0, 0, 0]); let br = 0;
  for (const [p, y] of rows) { const b = Math.min(9, Math.floor(p * 10)); bins[b][0]++; bins[b][1] += p; bins[b][2] += y; br += (p - y) ** 2; }
  const ece = bins.reduce((s, [n, sp, sy]) => s + (n ? Math.abs(sp / n - sy / n) * n : 0), 0) / rows.length;
  return { n: rows.length, ece: +ece.toFixed(3), brier: +(br / rows.length).toFixed(3) };
}

for (const [label, rows] of sources) {
  const entry = { source: label, n: Object.keys(byId(rows)).length, models: {} };
  out.sources.push(entry);
  if (!rows.length) continue;
  const labelMap = byId(rows);
  if (MODELS.length) {
    const tmp = gateInputs(rows, MODELS);
    const cases = read(path.join(tmp, 'cases.jsonl')).map((c) => ({ id: c.id, lang: c.lang === 'he' ? 'he' : 'en', gold: c.gold.step, body: '' }));
    for (const [n] of MODELS) {
      const undated = (file) => read(path.join(tmp, file)).filter((r) => labelMap[r.id] && labelMap[r.id].step === 'SILENT' && labelMap[r.id].undatedAsk && r.pred.decision === 'act').length;
      entry.models[n] = {
        undatedWrongDoIt: undated(n + '.product.jsonl'),
        product: metrics(read(path.join(tmp, n + '.product.jsonl')), cases, {}),
        alone: metrics(read(path.join(tmp, n + '.alone.jsonl')), cases, {}),
        calibration: calibration(preds[n], Object.fromEntries(cases.map((c) => [c.id, { step: c.gold }])))
      };
    }
  }
  for (const [n, f] of JUDGED) {
    const P = read(path.join(G, f)); const ids = new Set(P.map((r) => r.id));
    const cases = rows.filter((r) => ids.has(r.id)).map((r) => ({ id: r.id, lang: r.lang === 'he' ? 'he' : 'en', gold: r.step === 'CONTEXT' || r.step === 'UNSURE' ? 'AMBIGUOUS' : r.step, body: '' }));
    entry.models[n] = { alone: metrics(P, cases, {}), calibration: { n: 0, ece: null, brier: null } };
  }
}

// ---- print
const lines = [];
const say = (s) => lines.push(s);
say('# Glance model scoreboard');
say('');
say('Lab only. Labels are never owner-verified unless the first source below says so. Rates: value [95% Wilson interval] k/n.');
for (const e of out.sources) {
  say(''); say('## ' + e.source + ' (n = ' + e.n + ')');
  if (!e.n) { say('No rows. Phase 0 needs path A (own-use labels with read-back proof) to fill this source.'); continue; }
  say('');
  say('| model | order | 1 wrong Do It (of them undated asks) | 2 missed | 3 wrong action | HE missed | EN missed | 6 HE−EN missed gap | 5 ECE / Brier (gate) |');
  say('|---|---|---|---|---|---|---|---|---|');
  for (const [n, m] of Object.entries(e.models)) for (const order of ['product', 'alone']) {
    const x = m[order]; if (!x || (n === 'engine-only' && order === 'alone')) continue;
    const gap = x.he.act && x.en.act ? ((x.he.missed / x.he.act - x.en.missed / x.en.act) * 100).toFixed(1) + ' pts' : 'n/a';
    const cal = order === 'alone' && m.calibration.ece != null ? m.calibration.ece + ' / ' + m.calibration.brier : 'n/a';
    say(`| ${n} | ${order === 'product' ? 'engine+veto, then model' : 'model alone'} | ${rate(x.wrongDoIt, x.silent)}${order === 'product' ? ' (' + m.undatedWrongDoIt + ' undated)' : ''} | ${rate(x.missed, x.act)} | ${x.wrongAction} | ${x.he.missed}/${x.he.act} | ${x.en.missed}/${x.en.act} | ${gap} | ${cal} |`);
  }
}
say(''); say('4 Proof rate: n/a. No own-use data with `fetchedBack` read-back is available to the lab yet (path A, `docs/glance-ai/learning-from-use.md`).');
say('7 Cost and latency: n/a. The device model runs in the extension runtime; cloud cost per close needs the M6 measurement (`docs/glance-ai/ai-product.md`).');
const md = lines.join('\n') + '\n';
console.log(md);
if (arg('md')) fs.writeFileSync(arg('md'), md);
if (arg('json')) fs.writeFileSync(arg('json'), JSON.stringify(out, null, 1));
