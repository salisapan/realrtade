// The refund lane (core/refund-lane.js): the wiring that carries a refund end to end on any mail surface, behind REFUND_LOOP and
// REFUND_CHASE (both off). Pinned: switches off = no read, no write, no draft; a sent request opens one loop; a later message to
// the merchant (same thread or same order) is a reminder whatever its words, counted once; the merchant's reply moves the stage;
// a credit closes ONLY after the host read it back by the same id; a part is counted; an unnamed credit asks once; Do It writes
// a draft and never sends, and a draft is not a reminder; release, reopen; arm A of the A/B counts but shows nothing.
// Run: node test/refund-lane-corpus.cjs
const { FlowRefundLane: Lane } = require('../core/refund-lane.js');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
function mkHost(opts) {
  const o = opts || {};
  const h = { store: [], calls: { load: 0, save: 0, readBack: 0, draft: 0 }, events: [], drafts: [], clock: new Date('2026-11-02T10:00:00').getTime(), readOk: true, readId: null };
  h.switches = () => (o.switches || { REFUND_LOOP: true, REFUND_CHASE: true });
  h.load = async () => { h.calls.load++; return JSON.parse(JSON.stringify(h.store)); };
  h.save = async (l) => { h.calls.save++; h.store = JSON.parse(JSON.stringify(l)); };
  h.readBack = async (id) => { h.calls.readBack++; return h.readOk ? { ok: true, message: { id: h.readId || id } } : { ok: false }; };
  h.writeDraft = async (d) => { h.calls.draft++; h.drafts.push(d); return { ok: true, id: 'draft-' + h.drafts.length }; };
  h.now = () => h.clock;
  if (o.variant) h.ab = { variant: o.variant, emit: (e) => h.events.push(e) };
  h.at = (d) => { h.clock = new Date(d + 'T10:00:00').getTime(); };
  return h;
}
const ask = { id: 's1', threadId: 'T1', to: 'service@shop.co.il', toName: 'שופ', text: 'שלום, חויבתי פעמיים על הזמנה 4471. אבקש להחזיר לי את החיוב הכפול על סך 189 ₪.' };
const credit = { id: 'n1', fromEmail: 'alerts@isracard.co.il', authPass: true, text: 'זיכוי בסך 189 ₪ מבית העסק שופ בע"מ נקלט בכרטיסך.' };

(async () => {
  console.log('--- switches off: nothing is read, written or drafted ---');
  const off = mkHost({ switches: {} });
  const L0 = Lane.create(off);
  const r0 = [await L0.onSent(ask), await L0.onReply({ threadId: 'T1', fromEmail: 'service@shop.co.il', text: 'ההחזר אושר' }), await L0.onOpened(credit), await L0.today(), await L0.doIt('refund:T1'), await L0.release('refund:T1'), await L0.reopen('refund:T1'), await L0.answerAsk('refund:T1', true)];
  check('every hook returns nothing with both switches off', r0.every((x) => x === null || (Array.isArray(x) && x.length === 0)), r0);
  check('…and touches no storage, no read-back and no draft writer', off.calls.load === 0 && off.calls.save === 0 && off.calls.readBack === 0 && off.calls.draft === 0, off.calls);
  const chaseOff = mkHost({ switches: { REFUND_LOOP: true } });
  const Lc = Lane.create(chaseOff);
  await Lc.onSent(ask); chaseOff.at('2026-11-15');
  const tc = await Lc.today();
  check('REFUND_LOOP on, REFUND_CHASE off: the loop is carried, no move and no draft', tc.length === 1 && tc[0].move === null && (await Lc.doIt('refund:T1')) === null && chaseOff.calls.draft === 0);

  console.log('--- the journey ---');
  const h = mkHost();
  const L = Lane.create(h);
  const o1 = await L.onSent(ask);
  check('a sent refund request opens one loop', o1 && o1.kind === 'opened' && h.store.length === 1 && h.store[0].merchant === 'שופ' && h.store[0].amount === 189);
  check('the same sent message again opens nothing new', (await L.onSent(ask)) === null && h.store.length === 1);
  const st = await L.onReply({ id: 'r1', threadId: 'T1', fromEmail: 'service@shop.co.il', text: 'ההחזר אושר ויופיע בכרטיס תוך 7 ימי עסקים.' });
  check('the merchant\'s reply moves the stage, never closes', st && st.stage === 'approved' && h.store[0].status === 'open');
  check('a reply from someone else on the thread moves nothing', (await L.onReply({ threadId: 'T1', fromEmail: 'friend@gmail.com', text: 'ההחזר אושר' })) === null);
  h.at('2026-11-15');
  const t1 = await L.today();
  check('their day passed: the line carries a reminder move', t1.length === 1 && t1[0].move.step === 'remind-merchant');
  const d1 = await L.doIt('refund:T1');
  check('Do It writes the draft to the merchant and sends nothing', d1 && d1.kind === 'draft' && d1.to === 'service@shop.co.il' && h.drafts.length === 1 && /עד 11\/11/.test(h.drafts[0].body), d1);
  check('a draft is not a reminder', (h.store[0].reminders || 0) === 0 && h.store[0].status === 'open');
  const rem = await L.onSent({ id: 's2', threadId: 'T1', to: 'service@shop.co.il', text: 'רק מזכיר בבקשה, ההחזר עדיין לא הגיע.' });
  check('the person\'s sent message to the merchant on the thread is the reminder, whatever its words', rem && rem.kind === 'reminder' && h.store[0].reminders === 1);
  check('the same sent id is counted once', (await L.onSent({ id: 's2', threadId: 'T1', to: 'service@shop.co.il', text: 'x' })) === null || h.store[0].reminders === 1);
  h.at('2026-11-17');
  const c1 = await L.onOpened(credit);
  check('the credit closes only after read-back by the same id, with fetchedBack in the proof', c1 && c1.kind === 'closed' && h.store[0].proof.fetchedBack === true && h.store[0].proof.externalId === 'n1' && h.calls.readBack === 1);
  check('a closed loop leaves the Loops lines', (await L.today()).length === 0);
  check('reopen puts it back', (await L.reopen('refund:T1')).kind === 'reopened' && h.store[0].status === 'open');

  console.log('--- the read-back is the gate ---');
  const v = mkHost(); const Lv = Lane.create(v);
  await Lv.onSent(ask); v.readOk = false;
  check('a failed read-back leaves it open (verifying)', (await Lv.onOpened(credit)).kind === 'verifying' && v.store[0].status === 'open');
  v.readOk = true; v.readId = 'another-id';
  check('a read-back of a different id is not proof', (await Lv.onOpened(credit)).kind === 'verifying' && v.store[0].status === 'open');
  check('an unauthenticated notice is not even read back', (await Lv.onOpened(Object.assign({}, credit, { authPass: false }))) === null);

  console.log('--- parts, the one question, reminders by order number, two refunds ---');
  const p = mkHost(); const Lp = Lane.create(p);
  await Lp.onSent({ id: 's1', threadId: 'P', to: 'hello@makerspace.com', toName: 'Maker Space', text: 'Please refund the $49 I paid for the workshop.' });
  const part = await Lp.onOpened({ id: 'n1', fromEmail: 'service@paypal.com', authPass: true, text: "You've received a refund of $25.00 USD from Maker Space." });
  check('a part is counted, read back, and the loop stays open', part.kind === 'partial' && p.store[0].received === 25 && p.store[0].status === 'open');
  check('the rest closes it', (await Lp.onOpened({ id: 'n2', fromEmail: 'service@paypal.com', authPass: true, text: "You've received a refund of $24.00 USD from Maker Space." })).kind === 'closed');
  const q = mkHost(); const Lq = Lane.create(q);
  await Lq.onSent(ask);
  const a = await Lq.onOpened({ id: 'n9', fromEmail: 'alerts@isracard.co.il', authPass: true, text: 'זיכוי בסך 189 ₪ נקלט בכרטיסך.' });
  check('a credit with the amount and no merchant asks once', a.kind === 'ask' && q.store[0].pendingAsk.msgId === 'n9');
  check('"no" keeps it open', (await Lq.answerAsk('refund:T1', false)).kind === 'kept-open' && q.store[0].status === 'open' && !q.store[0].pendingAsk);
  await Lq.onOpened({ id: 'n9', fromEmail: 'alerts@isracard.co.il', authPass: true, text: 'זיכוי בסך 189 ₪ נקלט בכרטיסך.' });
  const yes = await Lq.answerAsk('refund:T1', true);
  check('"yes" closes it with that notice, read back again', yes.kind === 'closed' && q.store[0].proof.externalId === 'n9' && q.store[0].resolvedBy === 'person-confirmed');
  const o = mkHost(); const Lo = Lane.create(o);
  await Lo.onSent(ask); o.at('2026-11-12');
  check('a new thread to the merchant that names the order is a reminder', (await Lo.onSent({ id: 's5', threadId: 'T9', to: 'service@shop.co.il', text: 'בהמשך להזמנה 4471, ההחזר עדיין לא התקבל.' })).kind === 'reminder');
  check('…but another order to the same merchant opens its own loop', (await Lo.onSent({ id: 's6', threadId: 'T8', to: 'service@shop.co.il', toName: 'שופ', text: 'אבקש להחזיר לי 60 ₪ על הזמנה 5000.' })).kind === 'opened' && o.store.length === 2);
  const tw = mkHost(); const Lt = Lane.create(tw);
  await Lt.onSent({ id: 'a1', threadId: 'A1', to: 'service@shop.co.il', toName: 'שופ', text: 'אבקש להחזיר לי 189 ₪ על הזמנה 1001.' });
  await Lt.onSent({ id: 'a2', threadId: 'A2', to: 'service@shop.co.il', toName: 'שופ', text: 'אבקש להחזיר לי 189 ₪ על הזמנה 1002.' });
  check('two refunds of the same amount from one merchant, one credit: silence, both stay open', (await Lt.onOpened({ id: 'n7', fromEmail: 'alerts@isracard.co.il', authPass: true, text: 'זיכוי בסך 189 ₪ מבית העסק שופ.' })) === null && tw.store.length === 2 && tw.store.every((l) => l.status === 'open') && tw.calls.readBack === 0);
  check('a policy question opens nothing', (await Lane.create(mkHost()).onSent({ id: 'x', threadId: 'X', to: 'support@streamly.com', text: 'Do you offer refunds on annual plans?' })) === null);

  console.log('--- release, store credit, the escalation draft ---');
  const r = mkHost(); const Lr = Lane.create(r);
  await Lr.onSent(ask);
  await Lr.onReply({ threadId: 'T1', fromEmail: 'service@shop.co.il', text: 'נשמח לתת לך שובר בשווי 189 ₪' });
  check('store credit is a decision on the line, with no draft', (await Lr.today())[0].move.step === 'decide' && (await Lr.doIt('refund:T1')).kind === 'no-draft');
  check('release closes it as released', (await Lr.release('refund:T1', 'took the voucher')).kind === 'released' && r.store[0].closedAs === 'released');
  const e = mkHost(); const Le = Lane.create(e);
  await Le.onSent(ask);
  e.store[0] = Object.assign(e.store[0], { reminders: 2, lastReminderIso: '2026-11-03', paidWith: 'ישראכרט' });
  e.at('2026-11-15');
  const de = await Le.doIt('refund:T1');
  check('after two unanswered reminders, Do It drafts the card dispute with no address invented', de.kind === 'draft' && de.step === 'escalate-card' && de.to === null && de.toHint === 'ישראכרט');

  console.log('--- the real-user A/B: counts only ---');
  const ha = mkHost({ variant: 'A' }); const La = Lane.create(ha);
  await La.onSent(ask); ha.at('2026-11-15');
  check('arm A counts the ask but shows no line', ha.events.join() === 'refund_asked' && (await La.today()).length === 0);
  await La.onOpened(credit);
  check('arm A still counts the money back (the comparison needs both arms)', ha.events.indexOf('refund_money_back') >= 0);
  const hb = mkHost({ variant: 'B' }); const Lb = Lane.create(hb);
  await Lb.onSent(ask); await Lb.onReply({ threadId: 'T1', fromEmail: 'service@shop.co.il', text: 'ההחזר אושר ויופיע תוך 7 ימי עסקים' }); hb.at('2026-11-15');
  await Lb.today(); await Lb.today();
  check('arm B: shown and not-back are counted once each', hb.events.filter((x) => x === 'refund_loop_shown').length === 1 && hb.events.filter((x) => x === 'refund_not_back_by_day').length === 1, hb.events);
  check('events are names only, never text', hb.events.every((x) => /^refund_[a-z_]+$/.test(x)));

  console.log(failures ? '\n' + failures + ' FAILED' : '\nall refund-lane checks passed');
  process.exit(failures ? 1 : 0);
})();
