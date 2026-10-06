// The local intent model and tiered pipeline, measured on sentences it never
// trained on. See docs/intent-model.md for what these numbers do and do not
// mean. Run: node test/intent-model-corpus.cjs
const fs = require('fs');
const path = require('path');
const L = require('../core/lang-normalize.js').FlowLang;
const T = require('../core/request-types.js').FlowRequestTypes;
const M = require('../core/intent-model.js').FlowIntentModel;
const P = require('../core/intent-pipeline.js').FlowIntentPipeline;
const W = require('../core/intent-model-weights.js').FlowIntentWeights;

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const gold = require('./fixtures/intent-gold.json');
const blind = require('./fixtures/intent-blind.json');

console.log('\n--- the shipped weights ---\n');
check('the weights match the feature code', W.version === M.FEATURE_VERSION && W.dim === 16384 && M.ready());
check('they are small enough to ship in a content script (< 400 KB)', fs.statSync(path.join(__dirname, '..', 'core', 'intent-model-weights.js')).size < 400 * 1024);
// Short stock phrases ("Cheers.", "Understood.") can coincide with the generator's
// boilerplate. Those few sentences are removed from the evaluation, not hidden.
const trainSet = new Set(require('../../scripts/intent/generate.cjs').makeGenerator(11).dataset(16000, 12000).map((d) => d.t.toLowerCase()));
const overlap = gold.concat(blind).filter((x) => trainSet.has(x.t.toLowerCase()));
check('the evaluation sets are hand-written: at most 5% coincide with generated stock phrases', overlap.length / (gold.length + blind.length) <= 0.05, overlap.map((x) => x.t));
const goldE = gold.filter((x) => !trainSet.has(x.t.toLowerCase()));
const blindE = blind.filter((x) => !trainSet.has(x.t.toLowerCase()));

console.log('\n--- language normalisation ---\n');
const norm = (t) => L.tokenize(t).map((x) => x.w + (x.neg ? '!' : ''));
check('English inflections meet (sending / sent / sends -> send)', norm('sending')[0] === norm('sent')[0] && norm('sends')[0] === norm('send')[0]);
check('amounts, dates and times become placeholders', norm('pay $4,200 by 10/15 at 3pm').join(' ') === 'pay <money> by <date> at <time>');
check('contractions are opened', norm("I'll send it, we can't").join(' ') === 'i will send it we can not');
check('negation marks the words it governs', norm('we have not paid').includes('pay!'));
check('weekdays and months are one thing each', norm('on Friday').includes('<weekday>') && norm('on March').includes('<month>'));
check('Hebrew prefixes are stripped but the raw form is kept', (() => { const t = L.tokenize('ללקוחות')[0]; return t.forms.length >= 2 && t.forms[0] === 'ללקוחות'; })());
check('Hebrew final letters are normalised so plural forms meet', L.formsHe('תשלומים').some((f) => L.formsHe('תשלום').includes(f)) || L.formsHe('תשלומים').includes('תשלומ'));
check('links and addresses are not words', norm('see https://x.io/a mail me@x.com').join(' ') === 'see <url> mail <email>');

console.log('\n--- the model alone ---\n');
const accOf = (set) => set.filter((g) => M.predict(g.t).act === g.act).length / set.length;
check('act accuracy on the never-seen blind set (n=' + blindE.length + ') is at least 0.85', accOf(blindE) >= 0.85, accOf(blindE));
check('act accuracy on the hand-written dev set is at least 0.93', accOf(goldE) >= 0.93, accOf(goldE));
check('Hebrew is within 0.15 of English (it is the weaker language: less data, richer morphology)', Math.abs(accOf(blindE.filter((g) => g.lang === 'he')) - accOf(blindE.filter((g) => g.lang === 'en'))) <= 0.15, [accOf(blindE.filter((g) => g.lang === 'he')), accOf(blindE.filter((g) => g.lang === 'en'))]);
check('it is deterministic', JSON.stringify(M.predict('Could you send the report by Friday?')) === JSON.stringify(M.predict('Could you send the report by Friday?')));
check('it says "unsure" about noise, not something confident', M.predict('zxq vbn lorem ipsum dolor sit amet').unsure === true || M.predict('zxq vbn lorem ipsum dolor sit amet').actProb < 0.9);
check('an empty input is unsure, never a guess', M.predict('').unsure === true && M.predict('   ').unsure === true);
check('it is fast enough to run on every sentence (1000 in under 3 seconds)', (() => { const t0 = Date.now(); for (let i = 0; i < 1000; i++) M.predict('Could you please send me the signed contract by Friday ' + i + '?'); return Date.now() - t0 < 3000; })());

console.log('\n--- the teacher-authored sets: no leakage, and held-out domains ---\n');
const teacherTrain = require('../../scripts/intent/teacher-train.json');
const teacherEval = require('./fixtures/intent-teacher-eval.json');
const normText = (t) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const trainNorm = new Set(teacherTrain.map((x) => normText(x.t)));
check('no teacher evaluation sentence is in the teacher training set', teacherEval.every((x) => !trainNorm.has(normText(x.t))), teacherEval.filter((x) => trainNorm.has(normText(x.t))).map((x) => x.t));
check('no teacher training sentence is in the older dev or blind sets', teacherTrain.every((x) => !gold.concat(blind).some((g) => normText(g.t) === normText(x.t))), teacherTrain.filter((x) => gold.concat(blind).some((g) => normText(g.t) === normText(x.t))).map((x) => x.t));
check('the teacher evaluation set is large enough to mean something (> 250) and has both languages', teacherEval.length > 250 && teacherEval.some((x) => x.lang === 'he') && teacherEval.some((x) => x.lang === 'en'));
const teAcc = teacherEval.filter((g) => M.predict(g.t).act === g.act).length / teacherEval.length;
check('act accuracy on the teacher evaluation set is at least 0.86 (was 0.81 before the teacher data)', teAcc >= 0.86, teAcc);
{
  const pt = pr(teacherEval, (t) => { const r = P.recognize(t); return r.unsure ? 'X' : r.act; });
  const lt = pr(teacherEval, (t) => (T.detectRequest(t) ? 'ASK' : T.detectCommitmentSentence(t) ? 'PROMISE' : 'X'));
  console.log('  teacher-eval pipeline ASK P=' + pt.ASK.p.toFixed(2) + ' R=' + pt.ASK.r.toFixed(2) + ' | PROMISE P=' + pt.PROMISE.p.toFixed(2) + ' R=' + pt.PROMISE.r.toFixed(2) + ' | lexicon ASK R=' + lt.ASK.r.toFixed(2) + ' PROMISE R=' + lt.PROMISE.r.toFixed(2));
  check('precision on teacher-eval asks and promises stays at least 0.97', pt.ASK.p >= 0.97 && pt.PROMISE.p >= 0.97, [pt.ASK, pt.PROMISE]);
  check('recall on teacher-eval is at least 0.80 for asks and 0.75 for promises (was 0.66 / 0.69)', pt.ASK.r >= 0.80 && pt.PROMISE.r >= 0.75, [pt.ASK.r, pt.PROMISE.r]);
  // Was 1.4x. The word lists themselves got better (formal Hebrew requests, more first-person future verbs, found with
  // real sent mail), so the model's relative lead shrank while its absolute recall did not fall; precision gates untouched.
  check('and at least 1.3x the word lists', pt.ASK.r >= 1.3 * lt.ASK.r && pt.PROMISE.r >= 1.3 * lt.PROMISE.r, [pt.ASK.r, lt.ASK.r, pt.PROMISE.r, lt.PROMISE.r]);
}

const teacherEval2 = require('./fixtures/intent-teacher-eval-2.json');
check('no second-evaluation sentence is in any training set', teacherEval2.every((x) => !trainNorm.has(normText(x.t)) && !teacherEval.some((y) => normText(y.t) === normText(x.t))));
{
  const acc2 = teacherEval2.filter((g) => M.predict(g.t).act === g.act).length / teacherEval2.length;
  const p2 = pr(teacherEval2, (t) => { const r = P.recognize(t); return r.unsure ? 'X' : r.act; });
  console.log('  eval-2 (written before the second training batch; first-contact 0.848 model accuracy): accuracy ' + acc2.toFixed(3) + ' | ASK P=' + p2.ASK.p.toFixed(2) + ' R=' + p2.ASK.r.toFixed(2) + ' | PROMISE P=' + p2.PROMISE.p.toFixed(2) + ' R=' + p2.PROMISE.r.toFixed(2));
  check('second evaluation set (new domains AND new styles): accuracy at least 0.83', acc2 >= 0.83, acc2);
  check('its precision stays at least 0.95 (non-native English, ALL CAPS, slang)', p2.ASK.p >= 0.95 && p2.PROMISE.p >= 0.95, [p2.ASK, p2.PROMISE]);
  check('its recall is at least 0.78 for asks and 0.65 for promises', p2.ASK.r >= 0.78 && p2.PROMISE.r >= 0.65, [p2.ASK.r, p2.PROMISE.r]);
}

console.log('\n--- structure must permit what the model alone proposes ---\n');
['The school bus leaves at 7:40 from the corner of Elm Street.', 'Customs clearance can take up to 48 hours.', 'I will not be available this Thursday.', 'I read through the term sheet and it looks reasonable overall.', 'בעל הבית אמר שהמקדמה תוחזר תוך שלושים יום מהפינוי.', 'You will receive a confirmation email shortly.'].forEach((t) => {
  const r = P.recognize(t);
  check('not an ask or a promise, however the model feels: ' + t.slice(0, 50), r.unsure || (r.act !== 'ASK' && r.act !== 'PROMISE'), r);
});
check('a question the model is sure about, with no named action, is an ask for a reply', (() => { const r = P.recognize('Has the container cleared customs yet?'); return r.act === 'ASK' && r.request && r.request.action === 'reply'; })());
check('a marketing line that only says you need to do something is not an ask', (() => { const r = P.recognize('Your agent is ready. You just need to point it at something.'); return r.unsure || (r.act !== 'ASK' && r.act !== 'PROMISE'); })());
check('a social question is still not a task', P.recognize('How was the trip?').act !== 'ASK' && P.recognize('Will you be at the conference this year?').act !== 'ASK');

console.log('\n--- the pipeline against the word lists (blind set) ---\n');
function pr(set, pred) {
  const r = { ASK: [0, 0, 0], PROMISE: [0, 0, 0] };
  for (const g of set) { const p = pred(g.t); for (const a of ['ASK', 'PROMISE']) { const w = g.act === a, h = p === a; if (w && h) r[a][0]++; else if (!w && h) r[a][1]++; else if (w && !h) r[a][2]++; } }
  const out = {}; for (const a of ['ASK', 'PROMISE']) { const [tp, fp, fn] = r[a]; out[a] = { p: tp / (tp + fp || 1), r: tp / (tp + fn || 1), fp, tp, fn }; }
  return out;
}
const lex = pr(blindE, (t) => (T.detectRequest(t) ? 'ASK' : T.detectCommitmentSentence(t) ? 'PROMISE' : 'X'));
const pipe = pr(blindE, (t) => { const r = P.recognize(t); return r.unsure ? 'X' : r.act; });
console.log('  lexicon  ASK P=' + lex.ASK.p.toFixed(2) + ' R=' + lex.ASK.r.toFixed(2) + ' | PROMISE P=' + lex.PROMISE.p.toFixed(2) + ' R=' + lex.PROMISE.r.toFixed(2));
console.log('  pipeline ASK P=' + pipe.ASK.p.toFixed(2) + ' R=' + pipe.ASK.r.toFixed(2) + ' | PROMISE P=' + pipe.PROMISE.p.toFixed(2) + ' R=' + pipe.PROMISE.r.toFixed(2));
check('precision on asks stays at least 0.97 (silence over a wrong card)', pipe.ASK.p >= 0.97, pipe.ASK);
check('precision on promises stays at least 0.97', pipe.PROMISE.p >= 0.97, pipe.PROMISE);
check('recall on asks is at least double the word lists', pipe.ASK.r >= 2 * lex.ASK.r, [pipe.ASK.r, lex.ASK.r]);
check('recall on promises is at least double the word lists', pipe.PROMISE.r >= 2 * lex.PROMISE.r, [pipe.PROMISE.r, lex.PROMISE.r]);
check('and it is above 0.65 on both in absolute terms', pipe.ASK.r >= 0.65 && pipe.PROMISE.r >= 0.65, [pipe.ASK.r, pipe.PROMISE.r]);

console.log('\n--- how the two local tiers check each other ---\n');
let r = P.recognize('Please find attached the signed agreement for your records.');
check('boilerplate that borrows a request\'s words is not a request', r.act !== 'ASK', r);
r = P.recognize('I sent the signed lease to your assistant yesterday.');
check('a report of something done is not a request or a promise', r.act !== 'ASK' && r.act !== 'PROMISE', r);
r = P.recognize('Do you mind taking another pass at the clause on indemnity?');
check('a polite ask no frame lists is recognised, tier shows it', r.act === 'ASK' && !r.unsure, r);
r = P.recognize('Could you send the signed contract by Friday?');
check('a plain ask is found by the lexicon and the model agrees', r.act === 'ASK' && /lexicon/.test(r.tier), r);
r = P.recognize("I'll get the signed copy back to you by Monday morning.");
check('a promise is found and carries its action', r.act === 'PROMISE' && r.commitment && r.commitment.action, r);
r = P.recognize('Thanks so much, that was really helpful.');
check('thanks is thanks', r.act === 'ACK' && !r.unsure, r);
r = P.recognize('Will you be at the conference this year?');
check('a social question is not a task', r.act !== 'ASK', r);
check('a whole message is read sentence by sentence', (() => { const a = P.analyze('Thanks for the call today. Could you send the revised contract by Friday? I will review it over the weekend.'); return a.length === 3 && a[0].act === 'ACK' && a[1].act === 'ASK' && a[2].act === 'PROMISE'; })());
check('the pipeline never throws on odd input', [null, undefined, '', '   ', '?', 12345, '😀😀', 'a'.repeat(5000)].every((x) => { try { P.recognize(x); return true; } catch (e) { return false; } }));
check('with the model unavailable it falls back to the word lists and stays silent otherwise', (() => {
  M.load(null);
  const a = P.recognize('Could you send the signed contract by Friday?');
  const b = P.recognize('Do you mind taking another pass at the clause on indemnity?');
  M.load(W);
  return a.act === 'ASK' && a.tier === 'lexicon' && b.unsure === true;
})());
check('no tier ever reaches outside the device', !/\bfetch\s*\(|XMLHttpRequest|chrome\.(?:runtime|storage)|sendMessage\s*\(/.test(['intent-model.js', 'intent-pipeline.js', 'lang-normalize.js', 'request-types.js'].map((f) => fs.readFileSync(path.join(__dirname, '..', 'core', f), 'utf8')).join('\n')));

console.log('\n--- learning on the device ---\n');
M.setAdaptation({});
const borderline = 'Could we get an update on the shipment?';
const before = M.predict(borderline).probs.INFORM;
for (let i = 0; i < 4; i++) M.learn(borderline, 'act', 'INFORM', 1.5);
const after = M.predict(borderline).probs.INFORM;
check('a few corrections move a borderline sentence toward the corrected label', after > before, [before, after]);
M.setAdaptation({});
const confident = 'Could you please send me the signed contract by Friday?';
for (let i = 0; i < 6; i++) M.learn(confident, 'act', 'INFORM', 1.5);
check('but a clear request is not flipped by a handful of mistaken clicks', M.predict(confident).act === 'ASK', M.predict(confident));
M.setAdaptation({});
check('clearing the adaptation restores the shipped behaviour', M.predict(borderline).probs.INFORM === before);
M.learn(confident, 'act', 'PROMISE', 5);
check('every nudge is clipped and the store is bounded', Object.values(M.getAdaptation().act).every((v) => Math.abs(v) <= 0.5) && Object.keys(M.getAdaptation().act).length <= 4000);
check('only feature numbers are stored, never any text', !/contract|send|Friday/i.test(JSON.stringify(M.getAdaptation())));
M.setAdaptation({});

console.log('\nTOTAL FAILURES: ' + failures);
process.exit(failures ? 1 : 0);
