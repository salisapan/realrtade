// Router v2 (M2): Tier 0 rules first, the device model next, Glance cloud last and only masked with consent; the floor on every model answer.
// Run: node test/understanding-router-corpus.cjs
const { FlowUnderstandingRouter: R } = require('../core/understanding-router.js');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const ON = { aiPrimary: true };
const today = '2026-10-07';
const TEXT = 'Hi Sali,\nCould you send me the signed lease by Friday? We need it for the bank.\nDana';
const MASKED = 'Hi [NAME_1],\nCould you send me the signed lease by [DATE_1]? We need it for the bank.\n[NAME_2]';
const good = { intentions: [{ kind: 'ask_of_me', ask_span: 'Could you send me the signed lease', evidence_span: 'We need it for the bank.', due: '2026-10-09', due_span: 'by Friday', confidence: 0.9 }] };
const goodMasked = { intentions: [{ kind: 'ask_of_me', ask_span: 'Could you send me the signed lease', evidence_span: 'We need it for the bank.', due: '2026-10-09', due_span: 'by [DATE_1]', confidence: 0.9 }] };
const input = (over) => Object.assign({ text: TEXT, today, attachmentCount: 0, direction: 'inbound', cloudConsent: true, tier0: { quiet: null, step: 'SILENT', possible: true } }, over || {});
const passGate = () => ({ pass: true });
const noVeto = () => null;
const mask = () => ({ ok: true, text: MASKED, unmask: (s) => s.replace('[DATE_1]', 'Friday') });
function spy(answer) { const f = (t) => { f.calls.push(t); return typeof answer === 'function' ? answer(t) : answer; }; f.calls = []; return f; }
const deps = (over) => Object.assign({ gate: passGate, veto: noVeto, mask }, over || {});

(async () => {
  console.log('\n--- the off switch ---\n');
  {
    const t1 = spy(good), t2 = spy(goodMasked);
    const r = await R.route(input(), deps({ tier1: t1, tier2: t2 }), {});
    check('switch off: not used, and no tier is called', r.used === false && t1.calls.length === 0 && t2.calls.length === 0, r);
    check('the switch is named aiPrimary and defaults off', R.SWITCH === 'aiPrimary' && R.DEFAULTS.aiPrimary === false);
    check('a truthy non-true value does not turn it on', (await R.route(input(), deps({ tier2: t2 }), { aiPrimary: 'yes' })).used === false && t2.calls.length === 0);
  }

  console.log('\n--- tier 0 settles the clear half, no model call ---\n');
  {
    const t1 = spy(good), t2 = spy(goodMasked);
    const d = deps({ tier1: t1, tier2: t2 });
    const q = await R.route(input({ tier0: { quiet: 'newsletter', step: 'SILENT', possible: true } }), d, ON);
    check('a hard quiet is silence, whatever a model would say', q.step === 'SILENT' && q.tier === 0 && q.reason === 'quiet:newsletter');
    const e = await R.route(input({ tier0: { quiet: null, step: 'calendar', possible: true } }), d, ON);
    check('a clear engine decision stands, the model is not asked', e.step === 'calendar' && e.tier === 0);
    const n = await R.route(input({ tier0: { quiet: null, step: 'SILENT', possible: false } }), d, ON);
    check('no possible intention: silence, no call', n.step === 'SILENT' && n.reason === 'no-possible-intention');
    const o = await R.route(input({ direction: 'outbound' }), d, ON);
    check('outbound mail is never sent to a model', o.tier === 0);
    check('none of these called a model', t1.calls.length === 0 && t2.calls.length === 0);
  }

  console.log('\n--- tier 1, the device model ---\n');
  {
    const t1 = spy(good), t2 = spy(goodMasked);
    const r = await R.route(input(), deps({ tier1: t1, tier2: t2 }), ON);
    check('a grounded device answer proposes, and the cloud is not called', r.step === 'draft' && r.tier === 1 && t2.calls.length === 0 && r.calls.tier2 === false, r);
    check('the device model reads the original text (it never leaves the device)', t1.calls[0] === TEXT);
    check('the proposal never closes, writes or sends', r.proposal.proposalOnly === true && r.proposal.needsClick === true && r.proposal.closes === false);
    const t1s = spy({ relevant: 'no', intentions: [] });
    const s = await R.route(input(), deps({ tier1: t1s, tier2: t2 }), ON);
    check('a device answer "not relevant" is silence and does not escalate', s.step === 'SILENT' && s.reason === 'model:not-relevant' && t2.calls.length === 0, s);
    const t1bad = spy('not json');
    const b = await R.route(input(), deps({ tier1: t1bad, tier2: t2 }), ON);
    check('an invalid device answer escalates to the cloud', b.tier === 2 && t2.calls.length === 1 && b.step === 'draft', b);
    const t1empty = spy({ intentions: [{ kind: 'ask_of_me', ask_span: 'transfer the money now', evidence_span: 'urgent', confidence: 0.9 }] });
    const e = await R.route(input(), deps({ tier1: t1empty, tier2: spy(goodMasked) }), ON);
    check('a device answer whose only claim is ungrounded escalates', e.tier === 2 && e.step === 'draft', e.trace);
    const t1slow = spy(() => new Promise(() => {}));
    const sl = await R.route(input(), deps({ tier1: t1slow, tier2: spy(goodMasked), timeoutMs: 30 }), ON);
    check('a device model that hangs times out and escalates', sl.tier === 2 && sl.trace[0] === 'tier1:timeout', sl.trace);
    const t1throw = spy(() => { throw new Error('gpu lost'); });
    const th = await R.route(input(), deps({ tier1: t1throw, tier2: spy(goodMasked) }), ON);
    check('a device model that throws escalates, never crashes', th.tier === 2 && th.trace[0] === 'tier1:error');
  }

  console.log('\n--- tier 2, Glance cloud: consent, mask, placeholders ---\n');
  {
    const t2 = spy(goodMasked);
    const r = await R.route(input(), deps({ tier2: t2 }), ON);
    check('the cloud sees only the masked text', t2.calls.length === 1 && t2.calls[0] === MASKED, t2.calls);
    check('the device restores [DATE_1] and reads the date itself', r.step === 'draft' && r.proposal.due === '2026-10-09', r);
    const t2b = spy(goodMasked);
    const nc = await R.route(input({ cloudConsent: false }), deps({ tier2: t2b }), ON);
    check('no consent: silence, the cloud is never called', nc.step === 'SILENT' && nc.reason === 'no-consent' && t2b.calls.length === 0);
    const nc2 = await R.route(input({ cloudConsent: 'true' }), deps({ tier2: t2b }), ON);
    check('consent must be exactly true', nc2.reason === 'no-consent' && t2b.calls.length === 0);
    const nm = await R.route(input(), deps({ tier2: t2b, mask: undefined }), ON);
    check('no mask: silence, never send unmasked', nm.reason === 'mask-unavailable' && t2b.calls.length === 0);
    const mf = await R.route(input(), deps({ tier2: t2b, mask: () => ({ ok: false }) }), ON);
    check('a failed mask: silence', mf.reason === 'mask-failed' && t2b.calls.length === 0);
    const mt = await R.route(input(), deps({ tier2: t2b, mask: () => { throw new Error('x'); } }), ON);
    check('a mask that throws: silence', mt.reason === 'mask-failed' && t2b.calls.length === 0);
    const leak = await R.route(input(), deps({ tier2: t2b, mask: () => ({ ok: true, text: 'Call me at +972-54-1234567 or dana@example.com' }) }), ON);
    check('a phone or email that survived the mask blocks the call', leak.reason === 'pii-blocked' && t2b.calls.length === 0);
    const t2inv = spy({ intentions: [{ kind: 'ask_of_me', ask_span: 'Could you send me the signed lease', evidence_span: 'We need it for the bank.', due: '2026-10-09', due_span: 'by October 9', confidence: 0.9 }] });
    const inv = await R.route(input(), deps({ tier2: t2inv }), ON);
    check('a cloud claim that quotes words not in the masked text loses its date (ungrounded), so the ask stays silent', inv.step === 'SILENT' && inv.reason === 'model:ask-without-date', inv);
    const none = await R.route(input(), deps({}), ON);
    check('no model at all: silence (Free still works on tier 0)', none.step === 'SILENT' && none.reason === 'no-model');
  }

  console.log('\n--- the floor on every model answer ---\n');
  {
    const g = await R.route(input(), deps({ tier1: spy(good), gate: () => ({ pass: false, reason: 'gate:money-offer-acceptance' }) }), ON);
    check('the strict gate can stop a grounded proposal', g.step === 'SILENT' && g.reason === 'gate:money-offer-acceptance');
    const v = await R.route(input(), deps({ tier1: spy(good), veto: () => 'injection' }), ON);
    check('the veto can stop a grounded proposal', v.step === 'SILENT' && v.reason === 'veto:injection');
    const ng = await R.route(input(), deps({ tier1: spy(good), gate: undefined }), ON);
    check('no gate injected is silence, not a pass', ng.step === 'SILENT' && ng.reason === 'floor:missing');
    const ge = await R.route(input(), deps({ tier1: spy(good), gate: () => { throw new Error('x'); } }), ON);
    check('a gate that throws is silence', ge.step === 'SILENT' && ge.reason === 'gate:error');
    const gs = await R.route(input(), deps({ tier1: spy(good), gate: () => ({ pass: true, step: 'task' }) }), ON);
    check('the gate may narrow the step (it has the last word)', gs.step === 'task' && gs.proposal.step === 'task');
  }

  console.log('\n--- per-user relevance (M8): it may only silence ---\n');
  {
    const REL = { aiPrimary: true, aiRelevanceV1: true };
    const not = () => ({ relevance: 'not_relevant', reasons: ['does_not_answer_group'] });
    const t1 = spy(good), t2 = spy(goodMasked);
    const e = await R.route(input({ tier0: { quiet: null, step: 'draft', possible: true } }), deps({ tier1: t1, tier2: t2, relevance: not }), REL);
    check('not_relevant silences even a card today\'s engine would show', e.step === 'SILENT' && e.reason === 'profile:does_not_answer_group' && e.relevance === 'not_relevant', e);
    const m = await R.route(input(), deps({ tier1: t1, tier2: t2, relevance: not }), REL);
    check('not_relevant ends the route before any model call (no cloud cost)', m.step === 'SILENT' && t1.calls.length === 0 && t2.calls.length === 0);
    const rel = await R.route(input({ tier0: { quiet: null, step: 'SILENT', possible: false } }), deps({ relevance: () => ({ relevance: 'relevant', reasons: ['user_is_approver_for'] }) }), REL);
    check('relevant never adds a card the rules would not show', rel.step === 'SILENT' && rel.reason === 'no-possible-intention');
    const unk = await R.route(input({ tier0: { quiet: null, step: 'draft', possible: true } }), deps({ relevance: () => ({ relevance: 'unknown' }) }), REL);
    check('unknown keeps today\'s behaviour', unk.step === 'draft' && unk.reason === 'engine');
    const th = await R.route(input({ tier0: { quiet: null, step: 'draft', possible: true } }), deps({ relevance: () => { throw new Error('x'); } }), REL);
    check('a scorer that throws counts as unknown', th.step === 'draft');
    const off = await R.route(input({ tier0: { quiet: null, step: 'draft', possible: true } }), deps({ relevance: not }), ON);
    check('relevance switch off: the scorer is ignored', off.step === 'draft');
    const q = await R.route(input({ tier0: { quiet: 'newsletter', step: 'SILENT', possible: true } }), deps({ relevance: () => ({ relevance: 'relevant' }) }), REL);
    check('a hard quiet still wins over relevant', q.reason === 'quiet:newsletter');
    check('the relevance switch is named and defaults off', R.RELEVANCE_SWITCH === 'aiRelevanceV1' && R.DEFAULTS.aiRelevanceV1 === false);
  }

  console.log('\n--- portability ---\n');
  const src = require('fs').readFileSync(require('path').join(__dirname, '../core/understanding-router.js'), 'utf8').replace(/\/\/.*$/gm, '');
  check('no chrome.*, document or window', !/\bchrome\.|\bdocument\.|\bwindow\./.test(src));
  check('no network of its own', !/fetch\(|XMLHttpRequest|WebSocket/.test(src));

  console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})();
