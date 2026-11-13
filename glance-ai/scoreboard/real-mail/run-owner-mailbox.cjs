'use strict';
// The owner's connected mailbox, read on his say (2026-11-12): masked rows in real-mail/private/ (gitignored, eval only, never a training
// row). Prints aggregates only; --list prints row ids, buckets and decisions, never text. Gold: one pass by Claude in session, written
// before the engine ran, NOT owner-verified. Automated mail is judged on Gmail's preview (about 200 characters) unless the row says full.
// --features <file>: write the lab model's features for the rows (into private/), for train/predict-set.py; --model <preds.jsonl>: add the
// product order (engine first, the model only where the engine is silent and not hard-quiet).
// usage: node scoreboard/real-mail/run-owner-mailbox.cjs [--file private/owner-mailbox-2026-11-12.jsonl] [--list] [--features f] [--model preds]
const fs = require('fs'), path = require('path');
const G = path.join(__dirname, '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const file = path.join(__dirname, arg('file', path.join('private', 'owner-mailbox-2026-11-12.jsonl')));
if (!fs.existsSync(file)) { console.log('no private file here (it is gitignored and lives only where it was built): ' + path.relative(G, file)); process.exit(0); }
const E = require(path.join(G, 'model', 'teacher', 'engine.cjs')).makeEngine('tip');
const rows = fs.readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse);
const OWN = ['Sali', 'Sali Sapan', 'סאלי'];
if (arg('features')) {
  const { prepare } = require(path.join(G, 'model', 'runtime', 'pipeline-v2.cjs'));
  const feats = rows.map((r) => { const row = Object.assign({}, r, { cleanBody: r.body, ownNames: OWN }); const P = prepare(row); return { id: r.id, x: P.x, y: 'SILENT', lang: r.lang, vb: P.veto.base, vp: P.veto.product, vc: P.veto.cap, eng: P.eng.label }; });
  fs.writeFileSync(arg('features'), feats.map((x) => JSON.stringify(x)).join('\n') + '\n'); console.log('features written: ' + feats.length); process.exit(0);
}
const HQ = require(path.join(G, 'model', 'runtime', 'hard-quiets.cjs')); const HARD = HQ.A;
const MP = arg('model') ? Object.fromEntries(fs.readFileSync(arg('model'), 'utf8').trim().split('\n').map(JSON.parse).map((x) => [x.id, x])) : null;
const stepOf = (l) => (!l || l === 'SILENT' ? 'SILENT' : String(l).split('|').pop());
const B = {}; const list = [];
for (const r of rows) {
  const c = Object.assign({}, r, { ownNames: OWN });
  const t = E.teach(c); const whole = t.show ? [t.primaryStep] : [];
  const d = E.decompose(c); const dec = d.intentions.map((x) => x.anchor);
  const b = B[r.bucket] = B[r.bucket] || { n: 0, unsure: 0, silent: 0, act: 0, whole: { wdi: 0, miss: 0, wa: 0, right: 0 }, dec: { wdi: 0, miss: 0, wa: 0, right: 0, extra: 0 }, reasons: {} };
  b.n++; if (r.unsure) { b.unsure++; list.push([r.id, r.bucket, 'UNSURE', whole.join('+') || 'SILENT(' + t.reason + ')', dec.join('+') || 'SILENT']); continue; }
  const ok = new Set(r.gold.concat(r.alsoOk || []));
  if (!r.gold.length) b.silent++; else b.act++;
  if (MP) { const x = MP[r.id]; const m = whole.length ? whole : (HARD.has(t.reason) || !x || stepOf(x.pred) === 'SILENT' ? [] : [stepOf(x.pred)]); b.model = b.model || { wdi: 0, miss: 0, wa: 0, right: 0 }; r._m = m; }
  for (const [k, pred] of [['whole', whole], ['dec', dec]].concat(MP ? [['model', r._m]] : [])) {
    const a = b[k];
    if (!r.gold.length) { if (pred.some((s) => !ok.has(s))) a.wdi++; }
    else if (!pred.length) a.miss++;
    else if (pred.some((s) => ok.has(s))) { a.right++; if (k === 'dec' && pred.some((s) => !ok.has(s))) a.extra++; }
    else a.wa++;
  }
  if (!t.show) b.reasons[t.reason] = (b.reasons[t.reason] || 0) + 1;
  list.push([r.id, r.bucket, r.gold.join('+') || 'SILENT', whole.join('+') || 'SILENT(' + t.reason + ')', dec.join('+') || 'SILENT'].concat(MP ? ['engine+model: ' + (r._m.join('+') || 'SILENT')] : []));
}
console.log('| bucket | mails | nothing to close | something to close | wrong Do It (whole / decomposed) | missed | wrong action | right |'); console.log('|---|---|---|---|---|---|---|---|');
for (const [k, b] of Object.entries(B)) console.log(`| ${k} | ${b.n} (${b.unsure} undecided) | ${b.silent} | ${b.act} | ${b.whole.wdi} / ${b.dec.wdi} | ${b.whole.miss} / ${b.dec.miss} | ${b.whole.wa} / ${b.dec.wa} | ${b.whole.right} / ${b.dec.right} |`);
if (MP) for (const [k, b] of Object.entries(B)) if (b.model) console.log(`engine + model, ${k}: wrong Do It ${b.model.wdi}, missed ${b.model.miss}, wrong action ${b.model.wa}, right ${b.model.right}`);
for (const [k, b] of Object.entries(B)) console.log(k + ' silence reasons: ' + JSON.stringify(b.reasons));
if (process.argv.includes('--list')) for (const x of list) console.log(x.join(' | '));
