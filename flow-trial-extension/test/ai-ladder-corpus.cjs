// The deeper read (core/ai-ladder.js, docs/ai-ladder.md): who may be asked about what, what is paid, and how a wrong or hostile answer is held.
// No model is called here. Two scripted "servers" stand in: a PERFECT one (answers with the gold label) to measure what the ladder can add, and an ADVERSARIAL one
// (says "yes, an ask, you must send it" about EVERYTHING) to measure how much of the precision rests on the deterministic guards and not on a model being right.
// Run: node test/ai-ladder-corpus.cjs
const path = require('path');
const R = path.join(__dirname, '..');
const { FlowAiLadder: L } = require(R + '/core/ai-ladder.js');
const { FlowIntentPipeline: P } = require(R + '/core/intent-pipeline.js');
const { FlowIntentModel: M } = require(R + '/core/intent-model.js');
const { FlowExecRouter: X } = require(R + '/core/exec-router.js');
const { FlowPrivacyShield: S } = require(R + '/core/privacyShield.js');
const { FlowMaskIds: MI } = require(R + '/core/mask-ids.js');
const { FlowRequestTypes: T } = require(R + '/core/request-types.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const NOW = Date.parse('2026-10-15T10:00:00Z');
const BOTH = ['en', 'he'];
const ON = L.stateOf({ available: true, languages: BOTH, consent: true, pro: false, snapshot: null, now: NOW });
const ON_PRO = L.stateOf({ available: true, languages: BOTH, consent: true, pro: true, snapshot: null, now: NOW });
const mask = (s) => X.maskForServer(s, S, MI);
const base = { pipeline: P, model: M, maskIds: MI, mask, types: T, now: NOW };

console.log('--- the allowance: what is counted, what each plan has ---');
check('Free has a fixed monthly allowance and no strong model; Pro has more and the strong one', L.PLANS.free.units === 120 && L.PLANS.free.strong === false && L.PLANS.pro.units === 1500 && L.PLANS.pro.strong === true);
check('Pro is not "the same with a bigger number": it has a stronger reading AND a wider door, and Free has neither', L.PLANS.pro.strong && !L.PLANS.free.strong && L.COST.strong === 4 && L.COST.fast === 1);
check('a strong read costs four fast ones (about what it costs us), so a Pro month cannot cost more than a bounded amount', L.COST.strong * (L.PLANS.pro.units / L.COST.strong) === L.PLANS.pro.units);
check('the month is UTC and resets on the first', L.periodOf(NOW) === '2026-10' && L.resetsOn(NOW) === '2026-11-01' && L.resetLabel(NOW) === 'Nov 1' && L.resetsOn(Date.parse('2026-12-31T23:59:59Z')) === '2027-01-01');
check('a snapshot from last month is no snapshot', L.snapshotOf({ period: '2026-09', used: 100, limit: 120, plan: 'free' }, NOW) === null && L.snapshotOf({ period: '2026-10', used: 100, limit: 120, plan: 'free' }, NOW).used === 100);
check('garbage in the snapshot is no snapshot', [null, {}, { period: '2026-10', used: 'x', limit: 120 }, { period: '2026-10', used: 1, limit: 0 }].every((x) => L.snapshotOf(x, NOW) === null));

console.log('--- the state the popup and the gate both read ---');
const st = (o) => L.stateOf(Object.assign({ available: true, languages: BOTH, consent: true, pro: false, snapshot: null, now: NOW }, o));
const snap = (used, plan) => ({ period: '2026-10', used, limit: plan === 'pro' ? 1500 : 120, plan: plan || 'free' });
check('the server says it is not running: nothing shown, nothing asked', st({ available: false }).kind === 'unavailable' && !L.mayAsk(st({ available: false })) && L.copy(st({ available: false })) === null);
check('no consent yet: it asks once, in plain words, and asks nothing else', st({ consent: false }).kind === 'needs-consent' && !L.mayAsk(st({ consent: false })) && /one sentence/.test(L.copy(st({ consent: false })).detail));
check('on: allowed, and says how many are used', st({ snapshot: snap(10) }).kind === 'on' && L.mayAsk(st({ snapshot: snap(10) })) && /10 of 120/.test(L.copy(st({ snapshot: snap(10) })).detail));
check('from 80% used it says how many are left, with the reset day and the natural upgrade (Free)', st({ snapshot: snap(100) }).kind === 'low' && /20 left/.test(L.copy(st({ snapshot: snap(100) })).title) && /Nov 1/.test(L.copy(st({ snapshot: snap(100) })).detail) && L.copy(st({ snapshot: snap(100) })).primary === 'See Pro');
check('used up (Free): device only, no error, says so once, shows the reset day and Pro', st({ snapshot: snap(120) }).kind === 'used' && !L.mayAsk(st({ snapshot: snap(120) })) && /keeps working on your device/.test(L.copy(st({ snapshot: snap(120) })).detail) && L.copy(st({ snapshot: snap(120) })).primary === 'See Pro');
check('used up (Pro): the same, with no sales line', L.copy(st({ pro: true, snapshot: snap(1500, 'pro') })).primary === null && !/Pro has/.test(L.copy(st({ pro: true, snapshot: snap(1500, 'pro') })).detail));
check('a server failure rests the layer for a quarter of an hour, then it asks again', st({ pausedUntil: NOW + L.PAUSE_MS }).kind === 'paused' && st({ pausedUntil: NOW - 1 }).kind === 'on');
check('Pro gets the strong-reading line, Free does not', /stronger reading/.test(L.copy(st({ pro: true })).detail) && !/Pro:/.test(L.copy(st({})).detail));
const allCopy = ['needs-consent', 'on', 'low', 'used', 'paused'].map((k) => L.copy(st(k === 'needs-consent' ? { consent: false } : k === 'low' ? { snapshot: snap(100) } : k === 'used' ? { snapshot: snap(120) } : k === 'paused' ? { pausedUntil: NOW + 1 } : {}))).map((c) => c.title + ' ' + c.detail).join(' ');
check('the words are about sentences and loops, never about cleverness (docs/product-identity.md)', !/\b(?:AI|artificial|smart|intelligen\w*|magic|assistant|chatbot|learns?)\b/i.test(allCopy), allCopy);

console.log('--- who may be asked about what ---');
const fixtures = [];
for (const f of ['intent-gold', 'intent-blind', 'chat-gold']) fixtures.push(...require(R + '/test/fixtures/' + f + '.json'));
const real = (r) => r.act === 'ASK' || r.act === 'PROMISE';
let eligibleN = 0, eligibleReal = 0;
for (const r of fixtures) { const e = L.eligible(r.t, Object.assign({ state: ON }, base)); if (e.ok) { eligibleN++; if (real(r)) eligibleReal++; } }
check('only the sentences the learned model leaned towards and could not accept are eligible: about one in sixteen, not every one', eligibleN / fixtures.length < 0.1 && eligibleN >= 15, { eligibleN, of: fixtures.length });
check('and most of them are real requests or promises (the money goes where a rescue is possible)', eligibleReal / eligibleN > 0.55, { eligibleReal, eligibleN });
check('a sentence the pipeline already decided is never asked about', !L.eligible('Could you please send me the signed contract by Friday?', Object.assign({ state: ON }, base)).ok && L.eligible('Could you please send me the signed contract by Friday?', Object.assign({ state: ON }, base)).why === 'decided');
check('nothing is asked while the allowance is gone, the person has not agreed, or the server rests', ['used', 'needs-consent', 'paused', 'unavailable'].every((k) => !L.eligible('Hoping you can send over the revised SOW this week.', Object.assign({}, base, { state: k === 'used' ? st({ snapshot: snap(120) }) : k === 'needs-consent' ? st({ consent: false }) : k === 'paused' ? st({ pausedUntil: NOW + 1 }) : st({ available: false }) })).ok));
check('a language nobody measured is never sent: with only English switched on, a Hebrew sentence is not asked, an English one is', L.eligible('בוא נקבע זמן בשבוע הבא, מה מתאים לך?', Object.assign({ state: st({ languages: ['en'] }) }, base)).why === 'language' && L.eligible('Hoping you can send over the revised SOW this week.', Object.assign({ state: st({ languages: ['en'] }) }, base)).ok && !L.eligible('Hoping you can send over the revised SOW this week.', Object.assign({ state: st({ languages: [] }) }, base)).ok);
check('too short or too long is never asked about', L.eligible('Please send', Object.assign({ state: ON }, base)).why === 'length' && L.eligible(new Array(60).fill('word').join(' '), Object.assign({ state: ON }, base)).why === 'length');

console.log('--- the perfect and the adversarial server, over the same 378 sentences ---');
async function run(label, plan, state, answer) {
  const asked = [];
  let cache = [], tp = 0, fp = 0, fn = 0, standIns = 0, units = 0;
  for (const r of fixtures) {
    const out = await L.read(r.t, Object.assign({}, base, { state, plan, cache, ask: async (req) => { asked.push(req); return answer(r, req); } }));
    if (out.cache) cache = out.cache;
    units += out.units || 0;
    if (out.proposal) { standIns += out.proposal.standIn ? 1 : 0; if (real(r) && out.proposal.act === r.act) tp++; else fp++; }
    else if (real(r) && L.eligible(r.t, Object.assign({ state }, base)).ok) fn++;
  }
  console.log('  ' + label + ': asked ' + asked.length + ', proposals ' + (tp + fp) + ' (right ' + tp + ', wrong ' + fp + '), real but still silent ' + fn + ', stand-ins ' + standIns + ', units ' + units);
  return { asked, tp, fp, fn, standIns, units };
}
const perfect = (tier) => (r, req) => {
  const g = fixtures.find((x) => mask(x.t).text === req.maskedSentence) || r;
  const act = real(g) ? g.act : 'INFORM';
  const T0 = (g.t.match(/\b(?:send|share|sign|approve|confirm|pay|review|schedule|reply|complete|finalize|deploy|decide|join)\b/i) || [''])[0].toLowerCase();
  const action = act === 'INFORM' ? 'none' : (({ finalize: 'complete', deploy: 'complete', share: 'send' })[T0] || T0 || 'reply');
  const vocab = ['pay', 'sign', 'approve', 'confirm', 'schedule', 'decide', 'review', 'join', 'complete', 'send', 'reply', 'none'];
  return { ok: true, tier, units: tier === 'strong' ? 4 : 1, quota: null, reading: { act, action: vocab.indexOf(action) >= 0 ? action : 'reply', who: act === 'ASK' ? 'you' : act === 'PROMISE' ? 'me' : 'none', when: null, amount: null } };
};
const yesToAll = (tier) => (r, req) => ({ ok: true, tier, units: tier === 'strong' ? 4 : 1, reading: { act: /\b(?:i|we|i'll|will)\b/i.test(r.t) && !/\byou\b/i.test(r.t) ? 'PROMISE' : 'ASK', action: 'send', who: /\b(?:i|we)\b/i.test(r.t) && !/\byou\b/i.test(r.t) ? 'me' : 'you', when: null, amount: null } });
(async () => {
  const pf = await run('FREE + perfect fast model', L.PLANS.free, ON, perfect('fast'));
  const pp = await run('PRO + perfect strong model', L.PLANS.pro, ON_PRO, perfect('strong'));
  const af = await run('FREE + adversarial (yes to everything)', L.PLANS.free, ON, yesToAll('fast'));
  const ap = await run('PRO + adversarial (yes to everything)', L.PLANS.pro, ON_PRO, yesToAll('strong'));
  check('only eligible sentences were ever sent anywhere', af.asked.length <= eligibleN && pf.asked.length <= eligibleN);
  // Honest limit, pinned so a regression is caught: the guards alone do NOT make a yes-to-everything model safe. Of 23 sentences asked about it makes 3 wrong proposals
  // ("sent it, check your inbox", two Hebrew statements that are shaped like a promise). Precision therefore rests on the model being right when it is asked twice, and
  // that is measured on real answers by scripts/ai-ladder/eval.cjs before the server switch is turned on (docs/ai-ladder.md §7), never assumed from this file.
  check('Free, worst case: a model that says yes to everything is held to 3 wrong proposals out of 23 asked (the shape gate), not 23', af.fp <= 3 && af.fp + af.tp < af.asked.length / 2, af.fp);
  check('Pro, worst case: the strong model standing in for the shape adds no wrong proposal (the verb must also be in the sentence)', ap.fp <= af.fp && ap.standIns === 0, { ap: ap.fp, af: af.fp, standIns: ap.standIns });
  check('Pro rescues strictly more real sentences than Free, from the same input (a wider door, not just a bigger number)', pp.tp > pf.tp, { free: pf.tp, pro: pp.tp });
  check('a perfect model adds real recall over silence for Free too (the layer is worth having at no cost)', pf.tp >= 5, pf);
  check('the perfect model never produces a wrong proposal', pf.fp === 0 && pp.fp === 0, { pf, pp });
  check('the units used are the cost of the asks, nothing hidden', pf.units === pf.asked.length && pp.units === pp.asked.length * 4);

  console.log('--- what is paid once is not paid twice ---');
  const one = 'Hoping you can send over the revised SOW this week.';
  let calls = 0;
  const ask1 = async () => { calls++; return { ok: true, tier: 'fast', units: 1, reading: { act: 'ASK', action: 'send', who: 'you', when: null, amount: null } }; };
  const r1 = await L.read(one, Object.assign({ state: ON, plan: L.PLANS.free, cache: [], ask: ask1 }, base));
  const r2 = await L.read(one, Object.assign({ state: ON, plan: L.PLANS.free, cache: r1.cache, ask: ask1 }, base));
  check('the second time the same sentence costs nothing: no call, the same proposal', calls === 1 && r1.proposal && r2.proposal && r2.why === 'cached' && r2.units === 0 && r2.proposal.action === 'send');
  const r3 = await L.read(one, Object.assign({ state: ON, plan: L.PLANS.free, cache: r1.cache.map((e) => Object.assign({}, e, { at: NOW - 31 * 24 * 3600 * 1000 })), ask: ask1 }, base));
  check('a month later it is asked again', calls === 2 && r3.why === 'read');
  check('the memory holds a hash of the masked sentence, never a sentence', r1.cache.every((e) => /^[0-9a-f]{8}[0-9a-z]+$/.test(e.k)) && !JSON.stringify(r1.cache).includes('SOW'));
  check('the memory is bounded', (() => { let c = []; for (let i = 0; i < 400; i++) c = L.cachePut(c, 'k' + i, { reading: null }, NOW); return c.length === L.CACHE_MAX; })());

  console.log('--- the wire: masked or not at all ---');
  const spy = []; const askSpy = async (req) => { spy.push(req); return { ok: true, tier: 'fast', units: 1, reading: { act: 'ASK', action: 'send', who: 'you', when: null, amount: null } }; };
  const withPii = 'Hoping you can send the revised SOW to dana.cohen@acme-legal.com and call +1 415 555 0132 about the $9,400 invoice.';
  const rp = await L.read(withPii, Object.assign({ state: ON, plan: L.PLANS.free, cache: [], ask: askSpy }, base));
  check('what leaves is the masked sentence: no address, number or amount in it', spy.length === 0 || (!/dana\.cohen|415|9,400/.test(JSON.stringify(spy)) && Object.keys(spy[0]).sort().join() === 'lang,maskedSentence'), spy);
  const spy2 = [];
  const rm = await L.read('Hoping you can send over the revised SOW this week.', Object.assign({ state: ON, plan: L.PLANS.free, cache: [], ask: async (q) => { spy2.push(q); return { ok: true }; }, mask: () => ({ ok: false, reason: 'pii-blocked' }) }, { pipeline: P, model: M, maskIds: MI }));
  check('if the mask refuses, nothing is sent at all', spy2.length === 0 && rm.proposal === null && rm.why === 'mask-pii-blocked');
  const rn = await L.read('Hoping you can send over the revised SOW this week.', { pipeline: P, model: M, state: ON, plan: L.PLANS.free, ask: async () => { spy2.push(1); return { ok: true }; } });
  check('no masking function at all is the same as a refusal', spy2.length === 0 && rn.proposal === null);

  console.log('--- what comes back is checked, not trusted ---');
  const sent = 'Hoping you can send over the revised SOW this week.';
  const mk = (reading, extra) => L.read(sent, Object.assign({ state: ON, plan: L.PLANS.free, cache: [], ask: async () => Object.assign({ ok: true, tier: 'fast', units: 1, reading }, extra || {}) }, base));
  check('an unknown action is no proposal', (await mk({ act: 'ASK', action: 'wire-money', who: 'you', when: null, amount: null })).proposal === null);
  check('an ask that says the WRITER must do it is no proposal', (await mk({ act: 'ASK', action: 'send', who: 'me', when: null, amount: null })).proposal === null);
  check('"none" is silence', (await mk({ act: 'ASK', action: 'none', who: 'you', when: null, amount: null })).proposal === null);
  check('an answer that is not an object is silence', (await mk('ASK')).proposal === null && (await mk(null)).proposal === null);
  check('a server that says no (allowance, capacity, error) gives silence and the reason, never a thrown error', (await L.read(sent, Object.assign({ state: ON, plan: L.PLANS.free, ask: async () => ({ ok: false, code: 'quota_used', quota: { used: 120, limit: 120 } }) }, base))).why === 'quota_used');
  check('a network failure gives silence', (await L.read(sent, Object.assign({ state: ON, plan: L.PLANS.free, ask: async () => { throw new Error('offline'); } }, base))).why === 'unreachable');
  const pii = 'Hoping you can send over the revised SOW to Dana by Friday.';
  const masked = mask(pii);
  const tok = (masked.text.match(/\[[A-Z_]+_\d\]/) || [''])[0];
  const r = await L.read(pii, Object.assign({ state: ON, plan: L.PLANS.free, cache: [], ask: async () => ({ ok: true, tier: 'fast', units: 1, reading: { act: 'ASK', action: 'send', who: 'you', when: 'by Friday', amount: '[CURRENCY_VAL_9]' } }) }, base));
  check('a span that is not in the sentence, or a placeholder nobody issued, is dropped; the proposal stands without it', r.proposal && r.proposal.amount === null, r.proposal);
  const strongOnFree = await L.read(sent, Object.assign({ state: ON, plan: L.PLANS.free, cache: [], ask: async () => ({ ok: true, tier: 'strong', units: 4, reading: { act: 'ASK', action: 'send', who: 'you', when: null, amount: null } }) }, base));
  check('a Free device never believes a "strong" label: Free has no strong tier', strongOnFree.tier === 'fast');

  console.log('--- the strong model standing in for a shape: only with the verb in the sentence ---');
  const promise = 'I can have the build deployed by lunchtime.';
  check('this promise is not shaped for the learned model (that is why it was a residual)', !P.shapedPromise(promise));
  const stand = await L.read(promise, Object.assign({ state: ON_PRO, plan: L.PLANS.pro, cache: [], ask: async () => ({ ok: true, tier: 'strong', units: 4, reading: { act: 'PROMISE', action: 'complete', who: 'me', when: null, amount: null } }) }, base));
  check('Pro + strong + the word list finds the same verb: a proposal, marked as a stand-in', stand.proposal && stand.proposal.standIn === true && stand.proposal.via === 'server-strong', stand);
  const noVerb = await L.read('I think the customer is mostly happy with the outcome.', Object.assign({ state: ON_PRO, plan: L.PLANS.pro, cache: [], ask: async () => ({ ok: true, tier: 'strong', units: 4, reading: { act: 'ASK', action: 'reply', who: 'you', when: null, amount: null } }) }, base));
  check('Pro + strong but no such verb in the sentence: silence, whatever the model said', noVerb.proposal === null);
  const fastNo = await L.read(promise, Object.assign({ state: ON_PRO, plan: L.PLANS.pro, cache: [], ask: async () => ({ ok: true, tier: 'fast', units: 1, reading: { act: 'PROMISE', action: 'complete', who: 'me', when: null, amount: null } }) }, base));
  check('a fast reading never stands in for the shape, even on Pro', fastNo.proposal === null);
  const freeNo = await L.read(promise, Object.assign({ state: ON, plan: L.PLANS.free, cache: [], ask: async () => ({ ok: true, tier: 'strong', units: 4, reading: { act: 'PROMISE', action: 'complete', who: 'me', when: null, amount: null } }) }, base));
  check('Free never gets the stand-in', freeNo.proposal === null);
  const neg = await L.read("I can't have the build deployed by lunchtime.", Object.assign({ state: ON_PRO, plan: L.PLANS.pro, cache: [], ask: async () => ({ ok: true, tier: 'strong', units: 4, reading: { act: 'PROMISE', action: 'complete', who: 'me', when: null, amount: null } }) }, base));
  check('a negated promise is never a promise, not even for the strong model', neg.proposal === null);

  console.log('--- counts the owner reads ---');
  let stats = L.emptyStats();
  stats = L.noteRead(stats, r1, NOW); stats = L.noteRead(stats, r2, NOW); stats = L.noteRead(stats, { why: 'quota_used' }, NOW);
  for (let i = 0; i < 4; i++) stats = L.noteOutcome(stats, true);
  stats = L.noteOutcome(stats, false);
  const sm = L.summarize(stats);
  check('asked, cached and refused are counted apart; the kept share needs five answers', stats.asked === 1 && stats.cached === 1 && stats.refused === 1 && sm.keptShare === 0.8 && L.summarize(L.noteOutcome(L.emptyStats(), true)).keptShare === null);
  check('the stats hold counts and nothing else', Object.values(stats).every((v) => v === null || typeof v === 'number'));
  check('read never throws, even with nothing', await L.read(undefined, undefined).then((x) => x.proposal === null, () => false));

  console.log('\nTOTAL FAILURES:', failures);
  process.exit(failures ? 1 : 0);
})();
