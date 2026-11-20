// A separate lane for what the product reads as a promise in a SENT mail (FlowFollowUp.classifyCommitment). It never touches the ask metrics (real-eval.cjs).
//   node commitment-eval.cjs [--show] [--json]
// Gold: private/commitments/labels.jsonl (Claude's labels, NOT owner-verified; one line per sent row of dev2, dev3, personal-dev, personal-heldout). Input text: private/commitments/input.jsonl.
// Prints per set: rows, labelled promises, predicted promises, hits (true positives), false commitments, missed, precision, recall, and how many predictions the ask lane already fires on.
// Held-out sets print aggregates only (--show never lists their rows). This is a measurement, not a product change.
process.env.GLANCE_SHIPPED = process.env.GLANCE_SHIPPED || 'wave2';
const fs = require('fs'), path = require('path');
const { g } = require('../capabilities/union.cjs');
const F = g('FlowFollowUp'), NOW = new Date('2026-11-17T10:00:00+02:00').getTime();
const D = path.join(process.env.GLANCE_PRIVATE || path.join(__dirname, 'private'), 'commitments');
const show = process.argv.includes('--show'), json = process.argv.includes('--json');
const rd = (f) => (fs.existsSync(path.join(D, f)) ? fs.readFileSync(path.join(D, f), 'utf8').split('\n').filter(Boolean).map(JSON.parse) : []);
const text = Object.fromEntries(rd('input.jsonl').concat(rd('input2.jsonl')).map((r) => [r.set + '|' + r.id, r.body]));
const HELD = (s) => /heldout/.test(s);
const S = {}, miss = [], fals = [];
for (const l of rd('labels.jsonl').concat(rd('labels2.jsonl'))) {
  const body = text[l.set + '|' + l.id]; if (body == null) continue;
  const cx = { now: NOW, lang: /[֐-׿]/.test(body) ? 'he' : 'en', commitmentRecall: process.env.GLANCE_COMMIT_RECALL === '1' };
  let c = null, a = null; try { c = F.classifyCommitment(body, cx); } catch (e) {} try { a = F.classifyOutgoing(body, cx); } catch (e) {}
  const s = S[l.set] = S[l.set] || { n: 0, gold: 0, pred: 0, tp: 0, fp: 0, fn: 0, unsureGold: 0, predAlsoAsk: 0 };
  s.n++; if (l.commitment) s.gold++; if (l.commitment && l.unsure) s.unsureGold++;
  if (c) { s.pred++; if (a) s.predAlsoAsk++; if (l.commitment) s.tp++; else { s.fp++; if (!HELD(l.set)) fals.push([l.set, l.id, body]); } }
  else if (l.commitment) { s.fn++; if (!HELD(l.set)) miss.push([l.set, l.id, body, l.kind]); }
}
const rows = Object.entries(S).map(([k, s]) => ({ set: k + (HELD(k) ? ' (held-out, measured only)' : ' (Claude labels, unverified)'), rows: s.n, promises: s.gold, predicted: s.pred, hit: s.tp, falseCommitments: s.fp, missed: s.fn, precision: s.pred ? Math.round(100 * s.tp / s.pred) + '%' : '-', recall: s.gold ? Math.round(100 * s.tp / s.gold) + '%' : '-', predictedAlsoOnAskLane: s.predAlsoAsk }));
if (json) { console.log(JSON.stringify(rows)); process.exit(0); }
console.log('commitment lane (classifyCommitment on SENT mail; ask metrics are separate)');
for (const r of rows) console.log(r.set.padEnd(46), 'rows', String(r.rows).padStart(3), '| promises', String(r.promises).padStart(3), '| predicted', String(r.predicted).padStart(3), '| hit', String(r.hit).padStart(3), '| FALSE', String(r.falseCommitments).padStart(3), '| missed', String(r.missed).padStart(3), '| precision', r.precision, '| recall', r.recall, '| also on ask lane', r.predictedAlsoOnAskLane);
if (show) { for (const [s, id, b] of fals) console.log('FALSE', s, id, '|', String(b).replace(/\n/g, ' / ').slice(0, 220)); for (const [s, id, b, k] of miss) console.log('MISS ', s, id, k, '|', String(b).replace(/\n/g, ' / ').slice(0, 220)); }
