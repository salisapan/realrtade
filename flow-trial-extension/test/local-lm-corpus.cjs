// On-device language model tier: it proposes only, only when the tiers above are silent, only when two askings agree,
// only with spans that are really in the sentence, and only on a device that passed the self-test.
// Run: node test/local-lm-corpus.cjs
const { FlowLocalLM: L } = require('../core/local-lm.js');
const { FlowLocalLMAudit: AUDIT } = require('../core/local-lm-audit.js');
const { FlowIntentPipeline: P } = require('../core/intent-pipeline.js');
const { FlowIntentModel: M } = require('../core/intent-model.js');
M.load(require('../core/intent-model-weights.js').FlowIntentWeights);
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const NOW = Date.now();
const sentenceOf = (prompt) => { const m = /Sentence: (".*")\s*$/s.exec(prompt); return m ? JSON.parse(m[1]) : ''; };
// A session that answers from a table of readings by sentence; `perVariant` can answer differently for B.
function session(table, perVariant) {
  return { prompt: async (text) => { const s = sentenceOf(text); const variant = /You read one sentence/.test(text) ? 'B' : 'A'; const r = (perVariant && perVariant[variant] && perVariant[variant](s)) || table(s); return r === undefined ? 'not json' : (typeof r === 'string' ? r : JSON.stringify(r)); } };
}
const goldTable = (s) => { const r = AUDIT.find((x) => x.t === s); if (!r) return { act: 'INFORM', action: 'none', who: 'none', when: null, amount: null };
  return r.act === 'ASK' ? { act: 'ASK', action: 'reply', who: 'you', when: null, amount: null } : r.act === 'PROMISE' ? { act: 'PROMISE', action: 'send', who: 'me', when: null, amount: null } : { act: r.act, action: 'none', who: 'none', when: null, amount: null }; };
const good = { en: { ok: true }, he: { ok: true }, checkedAt: NOW };

(async () => {
  console.log('\n--- the audit set ---\n');
  check('it is balanced and has both languages', AUDIT.length >= 90 && ['en', 'he'].every((l) => AUDIT.filter((r) => r.lang === l && (r.act === 'ASK' || r.act === 'PROMISE')).length >= 20 && AUDIT.filter((r) => r.lang === l && (r.act === 'INFORM' || r.act === 'ACK')).length >= 20));

  console.log('\n--- reading the reply ---\n');
  check('a valid reply is read', JSON.stringify(L.parse('{"act":"ASK","action":"send","who":"you","when":"Friday","amount":null}')) === '{"act":"ASK","action":"send","who":"you","when":"Friday","amount":null}');
  check('prose around the JSON is tolerated', L.parse('Sure! {"act":"INFORM","action":"none","who":"none","when":null,"amount":null} Hope that helps')?.act === 'INFORM');
  check('an act outside the vocabulary is a null, not a guess', L.parse('{"act":"MAYBE","action":"send","who":"you","when":null,"amount":null}') === null);
  check('an action outside the vocabulary is a null', L.parse('{"act":"ASK","action":"hack the planet","who":"you","when":null,"amount":null}') === null);
  check('garbage is a null', L.parse('I think this is a request') === null && L.parse('') === null && L.parse(null) === null);
  check('a span longer than 40 characters is dropped', L.parse('{"act":"ASK","action":"send","who":"you","when":"' + 'x'.repeat(41) + '","amount":null}').when === null);
  check('a span must be in the sentence', L.verifySpan('Please send it by Friday afternoon', 'friday afternoon') === 'friday afternoon' && L.verifySpan('Please send it soon', 'next Tuesday') === null && L.verifySpan('x', null) === null);

  console.log('\n--- two askings must agree ---\n');
  const s1 = 'Would be great to know whether the venue has confirmed the hall.';
  const askRead = { act: 'ASK', action: 'confirm', who: 'you', when: null, amount: null };
  check('the same reading twice is accepted', (await L.classify(session(() => askRead), s1))?.act === 'ASK');
  check('different acts in the two askings: silence', (await L.classify(session(() => askRead, { B: () => ({ act: 'INFORM', action: 'none', who: 'none', when: null, amount: null }) }), s1)) === null);
  check('different actions in the two askings: silence', (await L.classify(session(() => askRead, { B: () => Object.assign({}, askRead, { action: 'pay' }) }), s1)) === null);
  check('an ASK that says the WRITER does it is rejected', (await L.classify(session(() => Object.assign({}, askRead, { who: 'me' })), s1)) === null);
  check('a PROMISE that says the READER does it is rejected', (await L.classify(session(() => ({ act: 'PROMISE', action: 'send', who: 'you', when: null, amount: null })), 'I will send the numbers tomorrow morning for sure.')) === null);
  check('a model that throws or returns junk is silence', (await L.classify({ prompt: async () => { throw new Error('boom'); } }, s1)) === null && (await L.classify(session(() => undefined), s1)) === null && (await L.classify(null, s1)) === null);

  console.log('\n--- who may be asked ---\n');
  const silentSentence = 'Wondering whether the permit came through on your side.';
  check('a sentence the tiers above leave silent is eligible on a device that passed', L.eligible(silentSentence, { pipeline: P, model: M, status: good, now: NOW }));
  check('a sentence the tiers above already decided is not', !L.eligible('Please send me the signed lease by Friday so we can release the deposit.', { pipeline: P, model: M, status: good, now: NOW }));
  check('a clear thanks is not', !L.eligible('Thank you so much for all of your help with this project.', { pipeline: P, model: M, status: good, now: NOW }));
  check('too short is not', !L.eligible('Any news here?', { pipeline: P, model: M, status: good, now: NOW }));
  check('no self-test result, no model', !L.eligible(silentSentence, { pipeline: P, model: M, status: null, now: NOW }));
  check('a failed test for a language, no model for that language', !L.eligible(silentSentence, { pipeline: P, model: M, status: { en: { ok: false }, he: { ok: true }, checkedAt: NOW }, now: NOW }));
  check('a test older than 30 days has expired', !L.eligible(silentSentence, { pipeline: P, model: M, status: { en: { ok: true }, he: { ok: true }, checkedAt: NOW - 31 * 24 * 3600 * 1000 }, now: NOW }) && L.stale({ checkedAt: NOW - 31 * 24 * 3600 * 1000 }, NOW) && !L.stale(good, NOW));

  console.log('\n--- a proposal ---\n');
  {
    const sent = 'Wondering whether the permit came through on your side by Friday, around $1,200.';
    const p = await L.propose(sent, { session: session(() => ({ act: 'ASK', action: 'confirm', who: 'you', when: 'by Friday', amount: '$1,200' })), pipeline: P, model: M, status: good, now: NOW });
    check('an agreed, shaped ask becomes a proposal on the lm tier', p && p.act === 'ASK' && p.action === 'confirm' && p.tier === 'lm', p);
    check('the amount was read by code from the sentence, not supplied by the model', p && p.amount && p.amount.value === 1200, p);
    const lie = await L.propose('Wondering whether the permit came through on your side.', { session: session(() => ({ act: 'ASK', action: 'confirm', who: 'you', when: 'next Tuesday at 9', amount: '$9,999' })), pipeline: P, model: M, status: good, now: NOW });
    check('a date and an amount the model invented never become a deadline or a payment', lie && lie.deadlineIso === null && lie.amount === null, lie);
    check('action "none" is silence, like the tiers above', (await L.propose(silentSentence, { session: session(() => ({ act: 'ASK', action: 'none', who: 'you', when: null, amount: null })), pipeline: P, model: M, status: good, now: NOW })) === null);
    check('an INFORM reading is no proposal', (await L.propose(silentSentence, { session: session(() => ({ act: 'INFORM', action: 'none', who: 'none', when: null, amount: null })), pipeline: P, model: M, status: good, now: NOW })) === null);
    check('without a passed self-test nothing is asked at all', (await L.propose(silentSentence, { session: { prompt: async () => { throw new Error('must not be called'); } }, pipeline: P, model: M, status: null, now: NOW })) === null);
    const promiseSent = 'Not sure if I mentioned it, but the figures will reach your side before the board meeting.';
    const shapedNo = await L.propose('The weather report says that it will rain across the whole region tomorrow.', { session: session(() => ({ act: 'PROMISE', action: 'send', who: 'me', when: null, amount: null })), pipeline: P, model: M, status: good, now: NOW });
    check('the structural shape gate still applies to the model\'s proposals', shapedNo === null, shapedNo);
  }

  console.log('\n--- the self-test ---\n');
  {
    const ok = await L.selfTest(session(goldTable), AUDIT, { now: NOW });
    check('a model that reads the audit set right passes in both languages', ok.en.ok && ok.he.ok && ok.en.precision === 1, ok);
    const everything = await L.selfTest(session(() => ({ act: 'ASK', action: 'reply', who: 'you', when: null, amount: null })), AUDIT, { now: NOW });
    check('a model that calls everything a request fails (precision)', !everything.en.ok && !everything.he.ok && everything.en.precision < 0.97, everything);
    const nothing = await L.selfTest(session(() => ({ act: 'INFORM', action: 'none', who: 'none', when: null, amount: null })), AUDIT, { now: NOW });
    check('a model that never proposes fails (it would never help)', !nothing.en.ok && nothing.en.precision === null, nothing);
    const englishOnly = await L.selfTest(session((s) => (/[א-ת]/.test(s) ? { act: 'ASK', action: 'reply', who: 'you', when: null, amount: null } : goldTable(s))), AUDIT, { now: NOW });
    check('each language passes or fails on its own: English can be on while Hebrew stays off', englishOnly.en.ok && !englishOnly.he.ok, englishOnly);
    const flaky = await L.selfTest(session(goldTable, { B: (s) => (AUDIT.findIndex((x) => x.t === s) % 4 ? { act: 'INFORM', action: 'none', who: 'none', when: null, amount: null } : null) }), AUDIT, { now: NOW });
    check('a model whose two askings disagree three times in four is too quiet to help, so it stays off', !flaky.en.ok, flaky);
    check('no session, no pass', !(await L.selfTest(null, AUDIT, { now: NOW })).en.ok);
  }

  console.log('\n--- the loop it can become ---\n');
  {
    const { FlowFollowUp: F } = require('../core/follow-up.js');
    const ask = F.fromProposal({ act: 'ASK', action: 'confirm', tier: 'lm', deadlineIso: '2026-10-09', amount: null, sentence: 'Wondering whether the permit came through on your side.' }, NOW);
    check('an ask proposal becomes a reply loop waiting on them, tier lm', ask && ask.direction === 'theirs' && ask.kind === 'reply' && ask.tier === 'lm' && ask.deadlineIso === '2026-10-09' && ask.subtype === 'confirm', ask);
    const pay = F.fromProposal({ act: 'ASK', action: 'pay', tier: 'lm', deadlineIso: null, amount: { value: 1200, currency: 'USD', raw: '$1,200' }, sentence: 'Wondering whether the invoice has been settled yet on your side.' }, NOW);
    check('a payment ask becomes a payment loop with its amount', pay && pay.kind === 'payment' && pay.amount.value === 1200, pay);
    const mine = F.fromProposal({ act: 'PROMISE', action: 'send', tier: 'lm', deadlineIso: null, amount: { value: 5, currency: 'USD', raw: '$5' }, sentence: 'The figures will reach your side before the board meeting on Monday.' }, NOW);
    check('a promise becomes a loop of yours, with no amount', mine && mine.direction === 'mine' && mine.amount === null && /^owe:/.test(mine.subtype), mine);
    check('it builds a real watch', F.buildWatch({ ask, threadId: 't9', messageId: 'm9', subject: 'Permit', counterpart: { name: 'Dana', email: 'dana@x.example' }, now: NOW }).status === 'waiting');
    check('anything that is not an ask or a promise builds nothing', F.fromProposal({ act: 'INFORM', sentence: 'x y z a b c' }, NOW) === null && F.fromProposal(null, NOW) === null);
  }

  console.log('\n' + (failures ? 'FAILED: ' + failures : 'All passed'));
  console.log('TOTAL FAILURES: ' + failures);
  process.exit(failures ? 1 : 0);
})();
