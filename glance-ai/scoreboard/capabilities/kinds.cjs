'use strict';
// The product's close kinds, read from docs/glance-ai/holistic-close-map.md (the one list of what Glance must close, with the live state of each), and set
// against the lab model's label space (4 families / 4 exact actions) and the engine probe (run.cjs). Lab only. usage: node kinds.cjs [--json out.json] [--md out.md]
// The doc stays the source: this file parses its tables and adds only two columns of its own, `model` (what the lab model's labels can say about the kind) and
// `probe` (the probe-set kinds that exercise it). Nothing here changes what the product does.
const fs = require('fs'), path = require('path');
const DOC = path.join(__dirname, '..', '..', '..', 'docs', 'glance-ai', 'holistic-close-map.md');
const rows = [];
for (const line of fs.readFileSync(DOC, 'utf8').split('\n')) {
  const c = line.split('|').map((x) => x.trim());
  if (c.length > 8 && /^[A-Z][0-9]+[a-z]?$/.test(c[1])) rows.push({ id: c[1], loop: c[2], example: c[3].replace(/^"|"$/g, ''), now: c[4], action: c[5], path: c[6], proof: c[7], undo: c[8], approval: c[10] });
}
// model: 'exact' = the lab label IS this close (task / calendar hold / reply draft / save attachment); 'family' = same family, different action (move, cancel, chase, find);
// 'none' = no label for it (create a file, write a row, a chat, a form, a contact, money, a page). probe: probe-set kinds that exercise the kind.
const M = {
  E1: ['exact', 'task.reminder task.deadline task.work task.callback'], E2: ['exact', 'commit.sender commit.reader'], E3: ['exact', 'reply.ask reply.questions'], E4: ['exact', 'file.save'],
  E5: ['exact', 'file.save'], E6: ['exact', 'file.save'], E7: ['family', ''], E8: ['family', ''], E9: ['none', ''], E10: ['none', 'reply.fyi'],
  C1: ['exact', 'cal.hold cal.video'], C2: ['family', 'cal.move'], C3: ['family', 'cal.cancel'], C4: ['family', ''], C5: ['none', ''], C6: ['none', ''], C7: ['family', ''],
  D1: ['family', ''], D2: ['none', 'doc.create sheet.create slides.create form.create'], D3: ['none', ''], D4: ['none', 'sheet.row'], D5: ['none', 'slides.create'], D6: ['none', 'word.create excel.create'],
  F1: ['family', 'file.find'], F2: ['family', ''], F3: ['none', ''], F4: ['exact', ''], T1: ['family', 'cal.recurring'], T2: ['none', ''],
  M1: ['none', ''], M2: ['none', ''], M3: ['none', ''], M4: ['none', ''], M5: ['none', ''], M6: ['none', ''], M7: ['none', ''],
  Y1: ['family', 'file.receipt'], Y2: ['none', ''], Y3: ['exact', ''], Y4: ['none', ''], Y5: ['exact', 'pay.ask pay.invoice pay.bankchange pay.confirmed'], Y6: ['none', ''], Y7: ['family', ''],
  G1: ['none', ''], G2: ['exact', ''], G3: ['family', ''], R1: ['exact', 'cal.booking'], R2: ['none', ''], R3: ['family', ''], S1: ['none', ''], S2: ['exact', ''],
  P1: ['none', ''], P2: ['none', ''], P3: ['none', ''], P4: ['none', ''], U1: ['none', ''], U2: ['none', ''], U3: ['none', ''], X1: ['family', ''], X2: ['none', ''], X3: ['family', ''], X4: ['none', ''],
  // notice.system (a deadline notice) is an E1-shaped task
};
M.E1[1] += ' notice.system';
for (const r of rows) { const m = M[r.id] || ['none', '']; r.model = m[0]; r.probe = m[1].split(' ').filter(Boolean); }
const by = (k) => rows.reduce((a, r) => { a[r[k]] = (a[r[k]] || 0) + 1; return a; }, {});
const cross = {};
for (const r of rows) { const k = r.now + ' / model ' + r.model; cross[k] = (cross[k] || 0) + 1; }
const out = { total: rows.length, byState: by('now'), byModel: by('model'), cross, withProbe: rows.filter((r) => r.probe.length).length, rows };
const arg = (k) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : null; };
if (arg('json')) fs.writeFileSync(arg('json'), JSON.stringify(out, null, 1) + '\n');
const md = ['| id | loop | state now | lab model can say | probe kinds |', '|---|---|---|---|---|'].concat(rows.map((r) => `| ${r.id} | ${r.loop} | ${r.now} | ${r.model} | ${r.probe.join(', ') || '—'} |`)).join('\n');
if (arg('md')) fs.writeFileSync(arg('md'), md + '\n');
console.log(JSON.stringify({ total: out.total, byState: out.byState, byModel: out.byModel, withProbe: out.withProbe }, null, 1));
console.log(Object.entries(cross).sort().map(([k, v]) => k + ': ' + v).join('\n'));
