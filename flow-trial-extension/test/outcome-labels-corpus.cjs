// Learning from outcomes (core/outcome-labels.js): which earlier sentence was the ask the engine
// missed, when NOT to label, and what a label does to the on-device model. Run:
//   node test/outcome-labels-corpus.cjs
const fs = require('fs'), path = require('path');
const { FlowOutcomeLabels: L } = require('../core/outcome-labels.js');
const { FlowFollowUp: F } = require('../core/follow-up.js');
const { FlowIntentModel: M } = require('../core/intent-model.js');
const { FlowExtract } = require('../core/extract.js');
const { FlowIntentPipeline: P } = require('../core/intent-pipeline.js');
const PIPE = { extract: FlowExtract, pipeline: P };

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
M.setAdaptation({});

console.log('\n--- which sentence was the missed ask ---');
const SERVER = 'Could use a heads-up on whether the courier collected the crate. Nothing shows on mine.';
const LICENCE = 'Would be great to know whether the venue has confirmed the hall. It is due Friday.';
check('the fixtures really are asks the engine stays silent on (otherwise nothing was "missed")', [SERVER, LICENCE].every((t) => F.classifyOutgoing(t, Object.assign({ now: Date.now() }, PIPE)) === null), [SERVER, LICENCE].map((t) => F.classifyOutgoing(t, Object.assign({ now: Date.now() }, PIPE))));
check('the ask-like sentence is picked out of a message with chatter', (() => { const p = L.pickMissedAsk('Thanks for your time yesterday. ' + SERVER + ' Best regards, Alex', M); return p && /courier collected/.test(p.sentence); })());
check('a message that is only thanks earns no label', L.pickMissedAsk('Thanks so much for the quick reply, really appreciate it.', M) === null);
check('a long letter earns no label', L.pickMissedAsk(Array.from({ length: 12 }, (_, i) => 'This is sentence number ' + i + ' about the weather.').join(' '), M) === null);
check('no model, no label', L.pickMissedAsk(SERVER, null) === null && L.pickMissedAsk(SERVER, { ready: () => false }) === null);
check('an empty message earns no label', L.pickMissedAsk('', M) === null);

console.log('\n--- when the thread says an ask was missed ---');
{
  const ctx = Object.assign({ now: Date.now() }, PIPE);
  const own = (...texts) => texts.map((t, i) => ({ text: t, key: 'm' + i }));
  const hit = F.missedAskIn(own(SERVER), ctx);
  check('one silent earlier message: its ask is the label', hit && /courier collected/.test(hit.sentence) && hit.key === 'm0', hit);
  check('the nearest message with an ask-like sentence wins', (() => { const h = F.missedAskIn(own(SERVER, LICENCE), ctx); return h && /courier collected/.test(h.sentence) && h.key === 'm0'; })());
  check('a nearer message with nothing ask-like is skipped, not blamed', (() => { const h = F.missedAskIn(own('Sounds good, talk soon then.', SERVER), ctx); return h && /courier collected/.test(h.sentence) && h.key === 'm1'; })());
  check('if an earlier message of yours WAS recognised, nothing was missed', F.missedAskIn(own(SERVER, 'Please confirm the final figure by Monday so I can book the vendor.'), ctx) === null);
  check('no earlier message of yours, nothing to learn', F.missedAskIn([], ctx) === null);
  check('a courtesy-only earlier message teaches nothing', F.missedAskIn(own('Thanks for the call today, talk soon.'), ctx) === null);
}

console.log('\n--- the mirror: a promise the engine missed ---');
{
  const ctx = Object.assign({ now: Date.now() }, PIPE);
  const LETTER = 'I write the letter this weekend and upload it';
  check('the fixture is a promise the engine stays silent on', F.classifyCommitment(LETTER, ctx) === null && F.classifyOutgoing(LETTER, ctx) === null);
  const hit = F.missedPromiseIn([{ text: LETTER, key: 'm3' }], ctx);
  check('delivering later labels the earlier promise sentence', hit && /write the letter/.test(hit.sentence) && hit.key === 'm3', hit);
  check('if an earlier promise WAS recognised, nothing was missed', F.missedPromiseIn([{ text: LETTER, key: 'a' }, { text: 'I will send you the signed contract by Friday.', key: 'b' }], ctx) === null);
  check('a message with no promise-like sentence earns nothing', F.missedPromiseIn([{ text: 'Thanks for the call today, talk soon.', key: 'x' }], ctx) === null);
  check('a model that is not ready earns nothing', L.pickMissedPromise(LETTER, { ready: () => false }) === null && L.pickMissedPromise(LETTER, null) === null);
}

console.log('\n--- how well is the closing going (and what it does about it) ---');
{
  check('no closes, no rate, not strict', (() => { const q = L.closureQuality({}); return q.errorRate === 0 && q.strict === false; })());
  check('a few closes are never enough to turn strict', L.closureQuality({ autoClosed: 4, reopened: 4 }).strict === false);
  check('few corrections: not strict', L.closureQuality({ autoClosed: 20, reopened: 2 }).strict === false);
  const q = L.closureQuality({ autoClosed: 12, reopened: 4 });
  check('a third of eight-plus closes corrected: strict, and the rate is reported', q.strict === true && q.errorRate === 0.333, q);
  check('the boundary is exactly 25% of at least 8', L.closureQuality({ autoClosed: 8, reopened: 2 }).strict === true && L.closureQuality({ autoClosed: 8, reopened: 1 }).strict === false);
}

console.log('\n--- what a label does to the model ---');
{
  M.setAdaptation({});
  const before = M.predict(SERVER).probs.ASK;
  M.learn(SERVER, 'act', 'ASK', L.RATE_MISSED);
  const after = M.predict(SERVER).probs.ASK;
  check('the missed ask becomes more ask-like', after > before, [before, after]);
  const near = 'Is the printer back up? Nothing prints on my side.';
  M.setAdaptation({});
  const nb = M.predict(near).probs.ASK; M.learn(SERVER, 'act', 'ASK', L.RATE_MISSED);
  check('and so do sentences that share its phrasing', M.predict(near).probs.ASK >= nb, [nb, M.predict(near).probs.ASK]);
  check('only feature numbers are stored: no word of the sentence', !/courier|crate|heads-up|nothing/i.test(JSON.stringify(M.getAdaptation())));
  check('every nudge is clipped', Object.values(M.getAdaptation().act).every((v) => Math.abs(v) <= 0.5));
  M.setAdaptation({});
  const clear = 'Could you please send me the signed contract by Friday?';
  for (let i = 0; i < 6; i++) M.learn(clear, 'act', 'INFORM', 1.5);
  M.setAdaptation({});
  check('labels are gentle: a clear ask is not flipped by one mistaken label', (() => { M.learn(clear, 'act', 'INFORM', L.RATE_MISSED); return M.predict(clear).act === 'ASK'; })());
  M.setAdaptation({});
}

console.log('\n--- recognition tier is remembered, so only model-alone loops are confirmed ---');
{
  const now = new Date('2026-10-05T12:00:00').getTime();
  const lex = F.classifyOutgoing('Please confirm the final figure by Monday so I can book the vendor.', Object.assign({ now }, PIPE));
  check('a word-list loop is tier "rule"/lexicon, never "model"', lex.tier !== 'model', lex.tier);
  const model = F.classifyOutgoing('Do you mind taking another pass at the clause on indemnity before Friday? Legal wants it tight.', Object.assign({ now }, PIPE));
  check('a loop only the model found says so', model && model.tier === 'model', model && model.tier);
  check('the watch carries it', F.buildWatch({ threadId: 't', messageId: 'm', subject: 's', counterpart: { email: 'a@x.com' }, ask: model, now }).tier === 'model');
}

console.log('\n--- no external reach ---');
check('outcome-labels.js never reaches outside the device', !/\bfetch\s*\(|XMLHttpRequest|chrome\.(?:runtime|storage)|sendMessage\s*\(|\bdocument\.\w|\bwindow\.\w/.test(fs.readFileSync(path.join(__dirname, '..', 'core', 'outcome-labels.js'), 'utf8')));

console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
