// Chat register: what a chat surface (WhatsApp) may act on is only what the WORD LISTS recognise, so they must understand how people
// actually write in chats. The sentences are model-written (docs/multi-platform.md says so): they measure the lists, not real chats.
// Precision is a hard gate; recall is a floor. Run: node test/chat-corpus.cjs
const fs = require('fs');
const path = require('path');
const P = require('../core/intent-pipeline.js').FlowIntentPipeline;
require('../core/intent-model.js').FlowIntentModel.load(require('../core/intent-model-weights.js').FlowIntentWeights);
const rows = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'chat-gold.json'), 'utf8'));
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
// What a chat surface acts on: a decided ask or promise that did NOT rest on the learned model alone (ctx.strict in src/follow.js).
const strict = (t) => { const r = P.recognize(t); return !r.unsure && (r.act === 'ASK' || r.act === 'PROMISE') && r.tier !== 'model' ? r.act : 'X'; };
function prf(cls) { let tp = 0, fp = 0, fn = 0; const bad = []; rows.forEach((r) => { const p = strict(r.t), g = r.act === cls; if (p === cls && g) tp++; else if (p === cls) { fp++; bad.push(['FP', r.t]); } else if (g) { fn++; bad.push(['FN', r.t]); } }); return { tp, fp, fn, p: tp + fp ? tp / (tp + fp) : 1, r: tp + fn ? tp / (tp + fn) : 0, bad }; }

check('the set covers both languages and all four kinds', ['en', 'he'].every((l) => ['ASK', 'PROMISE', 'INFORM', 'ACK'].every((a) => rows.some((r) => r.lang === l && r.act === a))) && rows.length >= 70);
const ask = prf('ASK'), pro = prf('PROMISE');
console.log('  strict ask P=' + ask.p.toFixed(2) + ' R=' + ask.r.toFixed(2) + ' | promise P=' + pro.p.toFixed(2) + ' R=' + pro.r.toFixed(2));
check('precision: nothing but a real ask is called an ask in strict mode (no false offers in a chat)', ask.fp === 0, ask.bad.filter((x) => x[0] === 'FP'));
check('precision: nothing but a real promise is called a promise in strict mode', pro.fp === 0, pro.bad.filter((x) => x[0] === 'FP'));
check('recall: the word lists alone catch at least 90% of chat asks (it was 28% before chat wording was added)', ask.r >= 0.9, ask.bad.filter((x) => x[0] === 'FN'));
check('recall: and at least 75% of chat promises', pro.r >= 0.75, pro.bad.filter((x) => x[0] === 'FN'));
check('thanks, news and small talk are never acted on', rows.filter((r) => r.act === 'INFORM' || r.act === 'ACK').every((r) => strict(r.t) === 'X'), rows.filter((r) => (r.act === 'INFORM' || r.act === 'ACK') && strict(r.t) !== 'X').map((r) => r.t));
console.log('\nTOTAL FAILURES: ' + failures);
process.exit(failures ? 1 : 0);
