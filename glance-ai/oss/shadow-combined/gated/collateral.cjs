'use strict';
// Collateral check: how often each propose-gate text rule fires on rows whose gold IS a close (would cost a recovery if the LLM proposed it),
// vs on gold-SILENT rows. Over the 796 shadow cases and the full v2 test split (6,982 rows, reference labels). Pure text rules, no LLM.
const fs = require('fs'); const PG = require('../../veto/propose-gate.cjs');
const { EVAL } = require('../../../paths.cjs');
const read = (p) => fs.readFileSync(p, 'utf8').trim().split('\n').map(JSON.parse);
const step = (l) => (l && l !== 'SILENT' ? l.split('|')[1] : 'SILENT');
function tally(rows, txt, gold) {
  const t = { rows: rows.length, show: 0, silent: 0, fire: {} };
  const add = (k, g, id) => { t.fire[k] = t.fire[k] || { onClose: 0, onSilent: 0, closeIds: [] }; if (g === 'SILENT') t.fire[k].onSilent++; else { t.fire[k].onClose++; if (t.fire[k].closeIds.length < 8) t.fire[k].closeIds.push(id); } };
  for (const r of rows) { const g = gold(r); if (!g || g === 'AMBIGUOUS') continue; g === 'SILENT' ? t.silent++ : t.show++; const x = txt(r);
    const uk = PG.unsupportedKind(x); if (uk) add(uk, g, r.id); if (PG.offerAcceptance(x)) add('gate:money-offer-acceptance', g, r.id);
    if (['task', 'draft', 'calendar'].includes(g) && !PG.hasDeadline(x)) add('no-deadline-cue (would need a future engine date)', g, r.id); }
  return t;
}
const cases = read(EVAL.shadowCases());
const v2 = read(EVAL.v2Test());
const out = { shadow796: tally(cases, (c) => c.own, (c) => c.gold.step), v2test6982: tally(v2, (r) => r.cleanBody || r.body, (r) => step(r.reference.label)) };
fs.writeFileSync(__dirname + '/collateral.json', JSON.stringify(out, null, 1));
for (const [k, v] of Object.entries(out)) { console.log(k, 'rows', v.rows, 'goldClose', v.show, 'goldSilent', v.silent); for (const [r, f] of Object.entries(v.fire)) console.log('  ', r, 'onClose', f.onClose, 'onSilent', f.onSilent, f.closeIds.slice(0, 5).join(' ')); }
