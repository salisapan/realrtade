'use strict';
// JS rule on the 22 spec corpus rows (24 cases: rows 13 and 14 on both surfaces). Exit 1 unless 22/22 rows pass.
const fs = require('fs'), path = require('path');
const S = require('./suggest-save.js');
const C = JSON.parse(fs.readFileSync(path.join(__dirname, 'corpus-22.json'), 'utf8'));
function check(out, e) {
  const bad = [];
  for (const k of ['suggest', 'reason', 'mode']) if (e[k] !== undefined && out[k] !== e[k]) bad.push(k + '=' + out[k]);
  if (e.target && out.target !== e.target) bad.push('target=' + out.target);
  if (e.count != null && (!out.chip || out.chip.count !== e.count)) bad.push('count');
  if (e.en && (!out.chip || out.chip.en !== e.en)) bad.push('en=' + (out.chip && out.chip.en));
  if (e.he && (!out.chip || out.chip.he !== e.he)) bad.push('he=' + (out.chip && out.chip.he));
  if (e.names && (!out.chip || JSON.stringify(out.chip.names) !== JSON.stringify(e.names))) bad.push('names');
  return bad;
}
const rows = {}; const outs = [];
for (const c of C) { const o = S.decide(c.input); const bad = check(o, c.expect); (rows[c.row] = rows[c.row] || []).push(bad); outs.push({ row: c.row, variant: c.variant, out: o });
  console.log((bad.length ? 'FAIL ' : 'ok   ') + String(c.row).padStart(2) + (c.variant ? '/' + c.variant : '') + '  ' + o.reason.padEnd(34) + (o.chip ? o.chip.en + ' | ' + o.chip.he : '') + (bad.length ? '  <- ' + bad.join(', ') : '')); }
const XS = JSON.parse(fs.readFileSync(path.join(__dirname, 'cases-extra.json'), 'utf8')); let xok = 0; const xouts = [];
for (const c of XS) { const o = S.decide(c.input); xouts.push(o); const ok = o.reason === c.expect.reason && (c.expect.count == null || (o.chip && o.chip.count === c.expect.count)); if (ok) xok++; else console.log('FAIL extra ' + c.desc + ' -> ' + o.reason); }
fs.writeFileSync(path.join(__dirname, 'out', 'extra-js.json'), JSON.stringify(xouts, null, 1));
console.log('extra edge cases: ' + xok + '/' + XS.length);
const pass = Object.values(rows).filter((b) => b.every((x) => !x.length)).length;
fs.writeFileSync(path.join(__dirname, 'out', 'corpus-js.json'), JSON.stringify(outs, null, 1));
console.log(JSON.stringify({ rowsPassed: pass + '/' + Object.keys(rows).length, cases: C.length }));
process.exit(pass === 22 && xok === XS.length ? 0 : 1);
