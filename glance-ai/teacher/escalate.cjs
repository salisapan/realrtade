// Escalation of teacher disagreements to a stronger model (plan 2, Phase D on CPU).
//   node teacher/escalate.cjs select --labels small.jsonl --meta sample.meta.jsonl --cases sample.cases.jsonl --out esc.cases.jsonl
//        rows where the small teacher's step differs from the reference step (and is not CONTEXT, which is an abstention, not a disagreement) or is UNSURE
//   node teacher/escalate.cjs merge --labels small.jsonl --strong strong.jsonl --out teacher-labels-final.jsonl
//        final label = the strong model's where the row was escalated, else the small model's; prints the confusion counts
'use strict';
const fs = require('fs');
const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : []);
const arg = (k) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : undefined; };
const mode = process.argv[2];
const refStep = (l) => (!l || l === 'SILENT' ? 'SILENT' : String(l).split('|').pop());
const FAM = { draft: 'draft', task: 'task', calendar: 'calendar', file_save: 'file_save', SILENT: 'SILENT' };
if (mode === 'select') {
  const small = Object.fromEntries(read(arg('labels')).map((r) => [r.id, r])), meta = Object.fromEntries(read(arg('meta')).map((r) => [r.id, r]));
  const cases = Object.fromEntries(read(arg('cases')).map((r) => [r.id, r]));
  const esc = [];
  for (const id in small) {
    const s = small[id].step; if (s === 'CONTEXT') continue;
    if (s === 'UNSURE' || refStep(meta[id] && meta[id].ref) !== s) esc.push(cases[id]);
  }
  fs.writeFileSync(arg('out'), esc.map((r) => JSON.stringify(r)).join('\n') + (esc.length ? '\n' : ''));
  console.log(JSON.stringify({ labelled: Object.keys(small).length, escalate: esc.length, share: +(esc.length / Math.max(1, Object.keys(small).length)).toFixed(3) }));
} else if (mode === 'merge') {
  const small = read(arg('labels')), strong = Object.fromEntries(read(arg('strong')).map((r) => [r.id, r]));
  const out = [], conf = {};
  for (const r of small) { const s = strong[r.id]; const fin = s ? s.step : r.step; if (s) { const k = r.step + '->' + s.step; conf[k] = (conf[k] || 0) + 1; } out.push({ id: r.id, step: fin, undatedAsk: s ? s.undatedAsk : r.undatedAsk, teacher: s ? s.model : r.model, escalated: Boolean(s) }); }
  fs.writeFileSync(arg('out'), out.map((r) => JSON.stringify(r)).join('\n') + '\n');
  const c = {}; for (const r of out) c[r.step] = (c[r.step] || 0) + 1;
  console.log(JSON.stringify({ rows: out.length, escalated: Object.keys(strong).length, finalSteps: c, smallToStrong: conf }));
} else { console.error('usage: escalate.cjs select|merge ...'); process.exit(2); }
