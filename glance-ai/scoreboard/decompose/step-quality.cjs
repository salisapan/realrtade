'use strict';
// Step quality, the part that existing labels can measure (definition: glance-ai/scoreboard/decompose/README.md).
// For each intent the engine finds with the right step: is the DAY right, and is the WHAT (the quoted ask) the labelled one?
// Labels: eval-data/shadow-combined-cases.jsonl, set `oss`, rows whose gold carries a step and a due day (teacher or hand labels,
// generated mail, NOT owner-verified). No existing label says who acts, the clock, the amount, the step SEQUENCE or the real closure,
// so those four are printed as "no labels" and never scored.
const fs = require('fs'), path = require('path');
const G = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const E = require(path.join(G, 'model', 'teacher', 'engine.cjs')).makeEngine('tip');
const rows = read(path.join(G, 'eval-data', 'shadow-combined-cases.jsonl')).filter((r) => r.set === 'oss' && r.gold && r.gold.due && ['draft', 'task', 'calendar'].includes(r.gold.step));
const norm = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const st = { n: rows.length, found: 0, stepRight: 0, dueRight: 0, dueMissing: 0, dueWrong: 0, whatOverlap: 0, closureNamed: 0, he: 0, heStepRight: 0, heDueRight: 0 }; const bad = [];
for (const r of rows) {
  const c = { surface: r.surface || 'gmail', direction: r.direction || 'inbound', from: { name: 'Dana Levi', email: 'dana@acme.io' }, to: [r.surface === 'outlook' ? 'glance.salisapan@outlook.com' : 'ai.local.flow@gmail.com'], cc: [],
    ownNames: ['Sali', 'Sali Sapan', 'סאלי'], subject: r.subject || '', body: r.own || r.core || '', attachmentCount: r.attachmentCount || 0 };
  const d = E.decompose(c); if (r.lang === 'he') st.he++;
  if (!d.intentions.length) continue; st.found++;
  const x = d.intentions.find((i) => i.anchor === r.gold.step); if (!x) continue; st.stepRight++; if (r.lang === 'he') st.heStepRight++;
  const due = x.due && x.due.dateIso;
  if (due === r.gold.due) { st.dueRight++; if (r.lang === 'he') st.heDueRight++; } else { if (!due) st.dueMissing++; else st.dueWrong++; bad.push(r.id + ' gold ' + r.gold.due + ' got ' + due + ' | ' + c.body.replace(/\s+/g, ' ').slice(0, 110)); }
  const a = norm(x.what), b = norm(r.gold.title); if (a && b && (a.includes(b) || b.includes(a))) st.whatOverlap++;
  if (x.doneWhen && x.doneWhen.kind) st.closureNamed++;
}
const pct = (k, n) => (n ? (100 * k / n).toFixed(1) + '% (' + k + '/' + n + ')' : 'n/a');
console.log(`rows with a labelled step and day: ${st.n} (Hebrew ${st.he})`);
console.log(`found: ${pct(st.found, st.n)}; right step: ${pct(st.stepRight, st.n)} (Hebrew ${pct(st.heStepRight, st.he)})`);
console.log(`of the right-step intents: right day ${pct(st.dueRight, st.stepRight)} (no day read ${st.dueMissing}, a different day ${st.dueWrong})`);
console.log('the WHAT is not scored: the labelled titles are whole sentences and the engine\'s `what` is a cleaned span, so their overlap is not a quality measure.');
console.log(`a closure condition is named for ${pct(st.closureNamed, st.stepRight)} of them; whether it is the RIGHT one: no labels. Who acts, clock, amount, step sequence: no labels.`);
if (process.argv.includes('--list')) console.log(bad.join('\n'));
