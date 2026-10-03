// Active question: one question, only when it is worth asking, and every answer is a label.
// Run: node test/active-question-corpus.cjs
const { FlowActiveQuestion: Q } = require('../core/active-question.js');
const { FlowIntentPipeline: P } = require('../core/intent-pipeline.js');
const { FlowIntentModel: M } = require('../core/intent-model.js');
M.load(require('../core/intent-model-weights.js').FlowIntentWeights);
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const DAY = 24 * 3600 * 1000;
const NOW = 1790000000000;
const mockModel = (table) => ({ ready: () => true, predict: (s) => { const p = table[s] || { ASK: 0, PROMISE: 0, INFORM: 1, ACK: 0 }; const act = Object.keys(p).sort((a, b) => p[b] - p[a])[0]; return { act, actProb: p[act], probs: p }; } });
const silent = { recognize: () => ({ act: 'INFORM', unsure: true }) };
const tracked = { recognize: () => ({ act: 'ASK', unsure: false }) };
const where = { threadId: 't1', messageId: 'm1', subject: 'Venue', counterpart: { name: 'Dana', email: 'dana@x.example' }, threadUrl: 'https://mail.google.com/x' };

console.log('\n--- which sentence is worth a question ---\n');
{
  const A = 'Wondering whether the venue has confirmed the hall yet.';
  const B = 'Might be worth a look at the lease addendum at some point soon.';
  const C = 'Thanks again for the lovely dinner last night with everybody.';
  const D = 'The shipment is already on its way and arrives on Monday.';
  const model = mockModel({
    [A]: { ASK: 0.5, PROMISE: 0.05, INFORM: 0.4, ACK: 0.05 },
    [B]: { ASK: 0.3, PROMISE: 0.02, INFORM: 0.63, ACK: 0.05 },
    [C]: { ASK: 0.01, PROMISE: 0.01, INFORM: 0.03, ACK: 0.95 },
    [D]: { ASK: 0.1, PROMISE: 0.05, INFORM: 0.8, ACK: 0.05 }
  });
  const list = Q.candidates([A, B, C, D].join(' '), { model, pipeline: silent });
  check('the most undecided sentence comes first', list.length >= 1 && list[0].sentence === A, list);
  check('a sentence the model is sure is thanks is never asked about', !list.some((c) => c.sentence === C));
  check('a sentence the model thinks is a plain statement is not asked about', !list.some((c) => c.sentence === D));
  check('a sentence the engine already tracks is not a question', Q.candidates(A, { model, pipeline: tracked }).length === 0);
  check('very short sentences are never asked about', Q.candidates('Sounds good to me.', { model: mockModel({ 'Sounds good to me.': { ASK: 0.5, PROMISE: 0, INFORM: 0.5, ACK: 0 } }), pipeline: silent }).length === 0);
  check('no model, no question', Q.candidates(A, { model: null, pipeline: silent }).length === 0);
  check('entropy peaks at a coin flip', Q.entropy(0.5) === 1 && Q.entropy(0.99) < 0.1 && Q.entropy(0) === 0 && Q.entropy(1) === 0);
}

console.log('\n--- the real engine: never a question about a clear ask or a clear thanks ---\n');
{
  const clear = 'Please send me the signed lease by Friday so we can release the deposit.';
  const thanks = 'Thank you so much for all of your help with this project.';
  const l1 = Q.candidates(clear + ' ' + thanks, { model: M, pipeline: P });
  check('a clear ask (already a loop) and a clear thanks give no candidate', l1.length === 0, l1);
}

console.log('\n--- rationing ---\n');
{
  const cands = [{ sentence: 'Wondering whether the venue has confirmed the hall yet.', kind: 'ask', p: 0.5, score: 1, lang: 'en' }];
  let s = Q.offer(Q.emptyState(), cands, where, NOW);
  check('the best candidate waits as the one pending question, with its thread', s.pending && s.pending.threadId === 't1' && s.pending.counterpart.email === 'dana@x.example', s);
  check('nothing is offered without a thread to attach it to', Q.offer(Q.emptyState(), cands, {}, NOW).pending === null);
  check('only one question waits at a time', Q.offer(s, [Object.assign({}, cands[0], { sentence: 'Another sentence about the other thing entirely here.' })], where, NOW + 1000).pending.sentence === s.pending.sentence);
  check('an unanswered question expires after a week and can be replaced', Q.offer(s, [Object.assign({}, cands[0], { sentence: 'A fresh sentence about the new venue booking here.' })], where, NOW + 8 * DAY).pending.sentence.startsWith('A fresh'));
  const yes = Q.answer(s, 'yes', NOW + 1000);
  check('yes opens the loop and teaches ASK at the strongest rate', yes.openLoop && yes.teach.label === 'ASK' && yes.teach.rate === Q.RATE_YES && yes.state.pending === null, yes);
  const no = Q.answer(s, 'no', NOW + 1000);
  check('no teaches INFORM gently and opens nothing', !no.openLoop && no.teach.label === 'INFORM' && no.teach.rate === Q.RATE_NO, no);
  const promise = Q.answer(Q.offer(Q.emptyState(), [Object.assign({}, cands[0], { kind: 'promise' })], where, NOW), 'yes', NOW);
  check('a promise answered yes teaches PROMISE', promise.teach.label === 'PROMISE');
  check('after an answer, nothing more is asked for a day', !Q.mayAsk(yes.state, NOW + 3600 * 1000) && Q.mayAsk(yes.state, NOW + DAY + 1000));
  let st = Q.emptyState();
  for (let i = 0; i < 3; i++) { st = Q.offer(st, cands, where, NOW + i * 2 * DAY); st = Q.answer(st, 'yes', NOW + i * 2 * DAY + 1000).state; }
  check('three a week at most', !Q.mayAsk(st, NOW + 5 * DAY) && Q.mayAsk(st, NOW + 8 * DAY));
  let sk = Q.emptyState();
  for (let i = 0; i < 2; i++) { sk = Q.offer(sk, cands, where, NOW + i * 2 * DAY); sk = Q.answer(sk, 'skip', NOW + i * 2 * DAY + 1000).state; }
  check('two skips in a row pause questions for two weeks', sk.pausedUntil > NOW + 10 * DAY && !Q.mayAsk(sk, NOW + 10 * DAY) && Q.mayAsk(sk, NOW + 20 * DAY), sk);
  check('a skip teaches nothing', Q.answer(s, 'skip', NOW).teach === null && !Q.answer(s, 'skip', NOW).openLoop);
  check('answering with nothing pending does nothing', Q.answer(Q.emptyState(), 'yes', NOW).teach === null);
  check('an answer after a skip resets the skip count', Q.answer(Object.assign({}, s, { skips: 1 }), 'yes', NOW).state.skips === 0);
}

console.log('\n--- what the answer turns into ---\n');
{
  const base = { sentence: 'Wondering whether the venue has confirmed the hall yet.', kind: 'ask', lang: 'en' };
  const a = Q.askFor(base, '2026-10-06');
  check('a confirmed ask becomes a reply loop waiting on them, on the model tier', a.direction === 'theirs' && a.kind === 'reply' && a.tier === 'model' && a.chaseIso === '2026-10-06');
  const m = Q.askFor(Object.assign({}, base, { kind: 'promise' }), '2026-10-06');
  check('a confirmed promise becomes a loop of yours', m.direction === 'mine' && /^owe:/.test(m.subtype));
  const { FlowFollowUp: F } = require('../core/follow-up.js');
  const w = F.buildWatch({ ask: a, threadId: 't1', messageId: 'm1', subject: 'Venue', counterpart: { name: 'Dana', email: 'dana@x.example' }, now: NOW });
  check('buildWatch accepts it and the loop is waiting', w.status === 'waiting' && w.direction === 'theirs' && w.id === 't1', w);
  check('the question is plain loop language', !/\bAI\b|smart|intelligen|learn|understand/i.test(Q.questionText({ kind: 'ask', lang: 'en' }) + Q.questionText({ kind: 'promise', lang: 'en' })));
  check('Hebrew wording exists', /[א-ת]/.test(Q.questionText({ kind: 'ask', lang: 'he' })));
}

console.log('\n' + (failures ? 'FAILED: ' + failures : 'All passed'));
console.log('TOTAL FAILURES: ' + failures);
process.exit(failures ? 1 : 0);
