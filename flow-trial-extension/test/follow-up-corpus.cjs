// Follow-up corpus — "waiting on". Precision first: every message Glance should
// stay quiet on is as important as every message it should track.
// Run: node test/follow-up-corpus.cjs
const { FlowFollowUp: F } = require('../core/follow-up.js');
const { FlowExtract } = require('../core/extract.js');
const { FlowRequestTypes } = require('../core/request-types.js');
const { FlowIntentPipeline } = require('../core/intent-pipeline.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

// Thursday 1 October 2026, noon local.
const NOW = new Date(2026, 9, 1, 12).getTime();
const classify = (t) => F.classifyOutgoing(t, { now: NOW, extract: FlowExtract, types: FlowRequestTypes, pipeline: FlowIntentPipeline });

console.log('\n--- asks that SHOULD be tracked ---\n');
const yes = [
  ['Hi Dana, could you send the signed lease by Friday? We need it to release the deposit.', 'reply'],
  ['Please confirm the final figure by Monday so I can book the vendor.', 'reply'],
  ['I am still waiting on your approval for the revised scope before we start.', 'reply'],
  ['Can you let me know by 10/09 whether the board accepted the proposal?', 'reply'],
  ['We need your signature on the attached agreement to proceed with the filing.', 'reply'],
  ['Hi, attached is invoice #3049 for $4,200, due Oct 15. Please pay by then.', 'payment'],
  ['Reminder: the balance of $1,850 is outstanding. Please wire it this week.', 'payment'],
  ['Payment of 12,500 ILS is due next Monday, per the agreement we signed.', 'payment'],
  ['Could you please send me the updated report with the Q3 numbers?', 'reply'],
  ['תוכל לשלוח לי את החוזה החתום עד יום חמישי? צריך אותו לפני הפגישה.', 'reply'],
  ['נא לאשר את ההצעה עד יום ראשון כדי שנוכל להתקדם עם הספק.', 'reply'],
  ['אנחנו ממתינים לאישור שלך על התקציב לפני שמתחילים בעבודה.', 'reply']
];
for (const [text, kind] of yes) {
  const r = classify(text);
  check('tracks (' + kind + '): ' + text.slice(0, 54), r && r.kind === kind, r);
}

console.log('\n--- silence: courtesy, hedges, thanks, receipts ---\n');
const no = [
  'Thanks so much for the call today, it was really helpful. Let me know if you have any questions.',
  'Hope this helps! Feel free to reach out if anything is unclear.',
  'Sounds good, talk soon.',
  'No rush at all, whenever you get a chance to look at it.',
  'Attached is the deck from this morning. Looking forward to hearing your thoughts.',
  'Thank you for your payment of $4,200, receipt attached. Have a great week.',
  'Payment received, thanks! Everything is settled on our side.',
  'FYI, the invoice for $900 was sent to accounting yesterday.',
  'Great, see you at 3pm on Tuesday.',
  'Ok',
  'Can you confirm?',
  'Just checking in.',
  'תודה רבה על הפגישה היום, אם יש שאלות אל תהססו לפנות אליי.',
  'מעולה, נתראה ביום שלישי בבוקר.',
  'התשלום התקבל, תודה רבה על העסקה.',
  "I'll send you the revised contract by Friday, promise.",
  'Please find attached the signed agreement for your records.',
  'Will you be at the offsite meeting next Tuesday afternoon?',
  'The invoice for $300 was settled last week, so we are all good here.',
  'Congrats on the launch, I can see how much work went into this one!',
  'Here is the summary of what we agreed: price $3,900, signing Monday.',
  'Out of office until Monday the 12th, I will reply when I am back.'
];
for (const text of no) {
  const r = classify(text);
  check('silent: ' + text.slice(0, 58), r === null, r);
}

console.log('\n--- what is extracted ---\n');
let r = classify('Please confirm the final figure by Monday so I can book the vendor.');
check('a stated deadline is the chase day (Mon 5 Oct)', r && r.deadlineIso === '2026-10-05' && r.chaseIso === '2026-10-05', r);
r = classify('Could you please send me the updated report with the Q3 numbers?');
check('no deadline: two business days after sending (Thu -> Mon)', r && r.deadlineIso === null && r.chaseIso === '2026-10-05', r);
r = classify('Hi, attached is invoice #3049 for $4,200, due next Monday. Please pay by then.');
check('payment: chase the day AFTER it is due (Tue 13 Oct)', r && r.kind === 'payment' && r.chaseIso === '2026-10-13' && r.amount && r.amount.value === 4200 && r.amount.currency === 'USD', r);
r = classify('Reminder: the balance of $1,850 is outstanding. Please wire it this week.');
check('payment with no date: a week out', r && r.kind === 'payment' && r.chaseIso === '2026-10-08', r);
r = classify('Please confirm the final figure by Monday so I can book the vendor.');
check('the tracked sentence is the ask, not the whole email', r && /confirm the final figure/.test(r.what) && r.what.length <= 140, r);
r = classify('נא לאשר את ההצעה עד יום ראשון כדי שנוכל להתקדם עם הספק.');
check('Hebrew asks are tagged he', r && r.lang === 'he', r);
check('a past deadline is not trusted', (() => { const x = F.chaseDate('reply', '2026-09-20', NOW); return x === '2026-10-05'; })());
check('a deadline of today moves the chase to the next business day', F.chaseDate('reply', '2026-10-01', NOW) === '2026-10-02');
check('weekends are skipped (Fri + 2 business days = Tue)', (() => { const fri = new Date(2026, 9, 2, 12).getTime(); return F.chaseDate('reply', null, fri) === '2026-10-06'; })());

console.log('\n--- watches ---\n');
const ask = classify('Please confirm the final figure by Monday so I can book the vendor.');
const w = F.buildWatch({ threadId: 't1', messageId: 'm1', subject: 'Vendor booking', counterpart: { email: 'dana@acme.com', name: 'Dana Cole' }, ask, now: NOW });
check('a watch starts waiting', w.status === 'waiting' && w.id === 't1' && w.counterpart.email === 'dana@acme.com', w);
check('and is not overdue before its chase day', F.watchState(w, NOW) === 'waiting');
check('it is overdue the day after', F.watchState(w, new Date(2026, 9, 6, 9).getTime()) === 'overdue');
check('but not ON the chase day itself', F.watchState(w, new Date(2026, 9, 5, 9).getTime()) === 'waiting');
check('someone else writing last settles it', F.repliedSince(w, { isOwn: false, messageId: 'm2' }) === true);
check('my own message being last does not', F.repliedSince(w, { isOwn: true, messageId: 'm1' }) === false);
check('an out-of-office reply does not settle it', F.repliedSince(w, { isOwn: false, text: 'I am out of the office until Oct 12 with limited access to email.', email: 'dana@acme.com' }) === false);
check('nor does a no-reply sender', F.repliedSince(w, { isOwn: false, text: 'Your message was received.', email: 'noreply@acme.com' }) === false);
check('a human reply does', F.repliedSince(w, { isOwn: false, text: 'Confirmed, the figure is $4,200. Sending the PO now.', email: 'dana@acme.com' }) === true);
check('a Hebrew auto-reply does not settle it', F.repliedSince(w, { isOwn: false, text: 'אני מחוץ למשרד עד סוף השבוע ואחזור אליך בהקדם.', email: 'dana@acme.com' }) === false);
check('a settled watch is never settled twice', F.repliedSince(Object.assign({}, w, { status: 'resolved' }), { isOwn: false }) === false);
check('a stopped watch has its own state', F.watchState(Object.assign({}, w, { status: 'stopped' }), NOW) === 'stopped');

console.log('\n--- the money view ---\n');
const pay1 = F.buildWatch({ threadId: 'p1', messageId: 'a', subject: 'Invoice 3049', counterpart: { email: 'ap@x.com', name: 'X Corp' }, ask: classify('Hi, attached is invoice #3049 for $4,200, due next Monday. Please pay by then.'), now: NOW });
const pay2 = F.buildWatch({ threadId: 'p2', messageId: 'b', subject: 'Balance', counterpart: { email: 'y@y.com' }, ask: classify('Reminder: the balance of $1,850 is outstanding. Please wire it this week.'), now: NOW });
const pay3 = F.buildWatch({ threadId: 'p3', messageId: 'c', subject: 'Retainer', counterpart: { email: 'z@z.com' }, ask: classify('Payment of 12,500 ILS is due next Monday, per the agreement we signed.'), now: NOW });
const stopped = Object.assign({}, pay2, { id: 'p9', status: 'stopped' });
const resolved = Object.assign({}, pay1, { id: 'p8', status: 'resolved' });
const sum = F.summarize([w, pay1, pay2, pay3, stopped, resolved], NOW);
check('active count ignores resolved and stopped', sum.active === 4, sum);
check('money owed is summed per currency, never mixed', JSON.stringify(sum.moneyOwed) === JSON.stringify([{ currency: 'ILS', value: 12500 }, { currency: 'USD', value: 6050 }]), sum.moneyOwed);
check('a plain reply chase adds no money', !sum.moneyOwed.some((m) => m.value === 0));
check('overdue counts only past chase days', F.summarize([pay2], new Date(2026, 9, 9, 9).getTime()).overdue === 1 && F.summarize([pay2], NOW).overdue === 0);
check('amounts format with a symbol', F.formatMoney({ currency: 'USD', value: 6050 }) === '$6,050' && F.formatMoney({ currency: 'ILS', value: 12500 }) === '₪12,500');

console.log('\n--- nudge text and task title ---\n');
check('the task names who and what', /^Chase reply from Dana — Vendor booking$/.test(F.taskTitle(w)), F.taskTitle(w));
check('a payment task carries the amount', /^Chase payment from X \$4,200 — Invoice 3049$/.test(F.taskTitle(pay1)), F.taskTitle(pay1));
const nudge = F.nudgeText(w);
check('a reply nudge greets by first name and restates the ask', /^Hi Dana,/.test(nudge) && /confirm the final figure/.test(nudge), nudge);
check('a payment nudge is a friendly reminder with the amount', /friendly reminder/.test(F.nudgeText(pay1)) && /\$4,200/.test(F.nudgeText(pay1)), F.nudgeText(pay1));
check('with no name it falls back to the address, or plainly "Hi,"', /^Hi,/.test(F.nudgeText(Object.assign({}, w, { counterpart: { email: null, name: null } }))) && /^Hi Ap,/.test(F.nudgeText(Object.assign({}, pay1, { counterpart: { email: 'ap@x.com', name: null } }))));
const heWatch = F.buildWatch({ threadId: 'h1', subject: 'חוזה', counterpart: { email: 'a@b.co', name: 'דנה כהן' }, ask: classify('נא לאשר את ההצעה עד יום ראשון כדי שנוכל להתקדם עם הספק.'), now: NOW });
check('a Hebrew watch gets a Hebrew nudge', /^היי דנה,/.test(F.nudgeText(heWatch)), F.nudgeText(heWatch));

console.log('\n--- closure intelligence: what a reply really does ---\n');
const replyW = F.buildWatch({ threadId: 'r1', messageId: 'm', subject: 'Figure', counterpart: { email: 'dana@acme.com', name: 'Dana' }, ask: classify('Please confirm the final figure by Monday so I can book the vendor.'), now: NOW });
const payW = pay1;
const cr = (text, w, extra) => F.classifyReply(text, w, Object.assign({ now: NOW, extract: FlowExtract }, extra || {}));
const outcome = (text, w, extra) => cr(text, w, extra).outcome;

console.log('  request for a reply:');
check('an out-of-office is ignored', outcome('I am out of the office until Oct 12 with limited access to email.', replyW) === 'auto');
check('a no-reply sender is ignored', outcome('Your message was received.', replyW, { email: 'noreply@acme.com' }) === 'auto');
check('"Got it, thanks!" does not close it', outcome('Got it, thanks!', replyW) === 'ack');
check('a greeting does not make an acknowledgement into content', outcome('Hi Dana,\n\nThanks, got it.', replyW) === 'ack');
check('"Will look into it" does not close it', outcome('Will look into it.', replyW) === 'ack');
check('Hebrew acknowledgement does not close it', outcome('קיבלתי, אבדוק ואחזור אליך', replyW) === 'ack');
check('a dated promise keeps it open and moves the day', (() => { const r = cr("Thanks, I'll get back to you by Friday.", replyW); return r.outcome === 'promised' && r.promisedIso === '2026-10-02'; })(), cr("Thanks, I'll get back to you by Friday.", replyW));
check('"tomorrow" is a date', (() => { const r = cr('I will send it over tomorrow morning, sorry for the delay.', replyW); return r.outcome === 'promised' && r.promisedIso === '2026-10-02'; })(), cr('I will send it over tomorrow morning, sorry for the delay.', replyW));
check('a promise with no date still keeps it open', (() => { const r = cr("I'll look at it later this week and revert.", replyW); return r.outcome === 'promised' && r.promisedIso === null; })());
check('"not yet, still working on it" is a stall, not an answer', (() => { const r = cr('Not yet, still working on it with the team.', replyW); return r.outcome === 'promised' && r.promisedIso === null; })(), cr('Not yet, still working on it with the team.', replyW));
check('the substance closes it', outcome('Confirmed, the figure is $4,200. Sending the PO now.', replyW) === 'closed');
check('"Yes, approved." closes it', outcome('Yes, approved.', replyW) === 'closed');
check('an attachment-only reply closes it', outcome('', replyW) === 'closed');
check('a delivered answer that mentions next week still closes it', outcome('Approved, attached the signed copy. We start next week.', replyW) === 'closed');
check('a long thoughtful reply closes it', outcome('We reviewed the numbers with finance and the vendor can be booked at the lower rate, so go ahead on your side.', replyW) === 'closed');
check('Hebrew confirmation closes it', outcome('אישרתי, מצורפת החתימה', replyW) === 'closed');
check('a short thanks that argues is not an acknowledgement', outcome('Thanks, but the figure is wrong and needs a rework.', replyW) === 'closed');

check('"forwarded to my colleague" is a hand-off, the loop stays open', (() => { const r = cr('I forwarded this to my colleague Sam, he will respond today.', replyW); return r.outcome === 'promised'; })(), cr('I forwarded this to my colleague Sam, he will respond today.', replyW));
check('"passed it to accounting" on a payment is not paid', outcome('העברתי את זה לחשבות והם יטפלו בזה', payW) !== 'paid');
check('"much appreciated" is an acknowledgement', outcome('Much appreciated!', replyW) === 'ack');
check('"thanks for sending" is an acknowledgement', outcome('Thanks for sending this over.', replyW) === 'ack');
check('a refusal is still an answer (it closes the loop as declined, you know where you stand)', outcome('Unfortunately we decided not to go ahead with the vendor.', replyW) === 'declined');
console.log('  payment:');
check('"payment sent" closes a payment loop as paid', outcome('Payment sent today, confirmation attached.', payW) === 'paid');
check('"I paid yesterday" is paid', outcome('I paid yesterday, should reach you shortly.', payW) === 'paid');
check('a month-and-day in your own message does not break classification', (() => { const r = classify('Please confirm the final figure by October 12 so I can book the vendor.'); return r && r.deadlineIso === '2026-10-12'; })(), classify('Please confirm the final figure by October 12 so I can book the vendor.'));
check('a Hebrew "העברתי" is paid', outcome('העברתי היום, אשמח לאישור קבלה', payW) === 'paid');
check('"will pay" is a promise, not a payment', (() => { const r = cr('We will pay on October 15, accounting is processing it.', payW); return r.outcome === 'promised' && r.promisedIso === '2026-10-15'; })(), cr('We will pay on October 15, accounting is processing it.', payW));
check('"not paid yet" does not close it', outcome('We have not paid yet, waiting for the PO to be approved on our side.', payW) !== 'paid');
check('"once it is paid" is hypothetical', outcome('I will let you know once it is paid.', payW) !== 'paid');
check('"payment was not sent" is not paid', outcome('The payment was not sent yet, still waiting for approval.', payW) !== 'paid');
check('Hebrew "לא שולם" is not paid', outcome('עדיין לא שולם, ממתינים לאישור', payW) !== 'paid');
check('a reply that never says it was paid asks the question', outcome('I was told the invoice is with accounting, will check.', payW) === 'answered');
check('a bare thanks on a payment thread is silent', outcome('Thanks, received.', payW) === 'ack');
check('a payment thread attachment-only reply proves nothing', outcome('', payW) === 'answered');
check('a Hebrew payment promise keeps it open', (() => { const r = cr('נעביר בשבוע הבא', payW); return r.outcome === 'promised'; })());

console.log('\n--- what a reply does to the loop ---\n');
const t1 = new Date(2026, 9, 1, 15).getTime();
let a = F.applyReply(replyW, { outcome: 'auto' }, t1);
check('an auto-reply changes nothing', a.none === true);
a = F.applyReply(replyW, { outcome: 'ack' }, t1);
check('an acknowledgement only notes that they answered', !a.close && a.patch.lastReplyAt === t1 && a.patch.status === undefined, a);
a = F.applyReply(replyW, { outcome: 'closed' }, t1);
check('a real answer closes it as replied', a.close === true && a.patch.status === 'resolved' && a.patch.closedAs === 'replied' && a.patch.resolvedAt === t1, a);
a = F.applyReply(payW, { outcome: 'paid' }, t1);
check('a payment confirmation closes it as paid', a.close === true && a.patch.closedAs === 'paid', a);
a = F.applyReply(payW, { outcome: 'answered' }, t1);
check('an unconfirmed reply on a payment asks, never closes', a.confirm === true && !a.close && a.patch.status === undefined, a);
a = F.applyReply(replyW, { outcome: 'promised', promisedIso: '2026-10-08' }, t1);
check('a promised day becomes the chase day (reply: that day)', a.rescheduled === true && a.patch.stage === 'promised' && a.patch.chaseIso === '2026-10-08' && a.patch.promisedIso === '2026-10-08', a);
a = F.applyReply(payW, { outcome: 'promised', promisedIso: '2026-10-15' }, t1);
check('a promised payment day chases the day AFTER', a.patch.chaseIso === '2026-10-16', a);
a = F.applyReply(payW, { outcome: 'promised', promisedIso: null }, t1);
check('a payment promise with no day chases in three days', a.patch.chaseIso === '2026-10-04', a);
a = F.applyReply(replyW, { outcome: 'promised', promisedIso: null }, t1);
check('a reply promise with no day chases in two business days', a.patch.chaseIso === '2026-10-05', a);
a = F.applyReply(Object.assign({}, replyW, { status: 'resolved' }), { outcome: 'closed' }, t1);
check('a closed loop is never closed twice', a.none === true);

console.log('\n--- chasing and the stage of a loop ---\n');
check('a fresh loop is "waiting"', F.stageOf(replyW) === 'waiting');
check('your own chase is recognised', F.looksLikeChase('Hi Dana, just following up on the figures. Any update on your side?') === true);
check('the nudge Glance drafts is recognised as a chase', F.looksLikeChase(F.nudgeText(replyW, 1)) && F.looksLikeChase(F.nudgeText(replyW, 2)) && F.looksLikeChase(F.nudgeText(replyW, 3)) && F.looksLikeChase(F.nudgeText(payW, 3)));
check('an ordinary message of yours is not a chase', F.looksLikeChase('Great, thanks Dana. See you on Tuesday at the office.') === false);
check('a Hebrew chase is recognised', F.looksLikeChase('היי דנה, חוזר אלייך לגבי האישור שביקשתי קודם') === true);
check('too short to be a chase', F.looksLikeChase('Following up?') === false);
let np = F.recordNudge(replyW, t1);
check('a nudge moves a reply chase out two business days (Thu -> Mon)', np.stage === 'nudged' && np.nudges === 1 && np.chaseIso === '2026-10-05' && np.nudgedAt === t1, np);
np = F.recordNudge(payW, t1);
check('a nudge moves a payment chase out three days', np.chaseIso === '2026-10-04', np);
const nudged1 = Object.assign({}, replyW, F.recordNudge(replyW, t1));
const nudged3 = Object.assign({}, replyW, { nudges: 3 });
check('the stage reads back as nudged', F.stageOf(nudged1) === 'nudged');
check('an older stored loop with nudges but no stage reads as nudged', F.stageOf({ status: 'waiting', nudges: 2 }) === 'nudged');
check('the next nudge is firmer, to a cap of 3', F.nextNudgeLevel(replyW) === 1 && F.nextNudgeLevel(nudged1) === 2 && F.nextNudgeLevel(nudged3) === 3 && F.nextNudgeLevel(Object.assign({}, replyW, { nudges: 9 })) === 3);
const later = new Date(2026, 9, 11, 9).getTime();
check('days open is counted from creation', F.daysOpen(replyW, later) === 10 && F.daysOpen(replyW, NOW) === 0);
check('level 2 is firmer than level 1, level 3 asks for an answer today', /again/.test(F.nudgeText(replyW, 2)) && /yes, a no, or a date/.test(F.nudgeText(replyW, 3)) && !/again/.test(F.nudgeText(replyW, 1)));
check('a payment nudge carries the days it has been open', /open for 10 days/.test(F.nudgeText(payW, 2, later)) && /after 10 days/.test(F.nudgeText(payW, 3, later)) && /\$4,200/.test(F.nudgeText(payW, 3, later)), F.nudgeText(payW, 2, later));
check('no day count on the first day', !/days/.test(F.nudgeText(payW, 3, NOW)));
check('with no level it picks the next one for the loop', F.nudgeText(nudged1) === F.nudgeText(nudged1, 2));
check('Hebrew nudges have three levels too', /שוב/.test(F.nudgeText(heWatch, 2)) && /פעם אחרונה/.test(F.nudgeText(heWatch, 3)) && /^היי דנה,/.test(F.nudgeText(heWatch, 3)));
check('a Hebrew nudge reads as a chase', F.looksLikeChase(F.nudgeText(heWatch, 2)) && F.looksLikeChase(F.nudgeText(heWatch, 3)));

console.log('\n--- reopening ---\n');
const closed = Object.assign({}, nudged1, { status: 'resolved', resolvedAt: t1, resolvedBy: 'reply', closedAs: 'replied' });
const rp = F.reopenPatch(closed, later);
check('only a closed loop can be reopened', F.canReopen(closed) && !F.canReopen(replyW) && !F.canReopen(Object.assign({}, replyW, { status: 'stopped' })));
check('reopening makes it live again with a fresh chase day', rp.status === 'waiting' && rp.resolvedAt === null && rp.closedAs === null && rp.stage === 'nudged' && rp.chaseIso === '2026-10-13' && rp.reopenedAt === later, rp);
check('a reopened loop is counted as active again', F.isActive(Object.assign({}, closed, rp)));

console.log('\n--- the month so far ---\n');
const nowM = new Date(2026, 9, 20, 9).getTime();
const closedPaid = Object.assign({}, pay1, { id: 'c1', status: 'resolved', resolvedAt: new Date(2026, 9, 12).getTime(), closedAs: 'paid' });
const closedPaidOld = Object.assign({}, pay2, { id: 'c2', status: 'resolved', resolvedAt: new Date(2026, 7, 28).getTime(), closedAs: 'paid' });
const closedReply = Object.assign({}, w, { id: 'c3', status: 'resolved', resolvedAt: new Date(2026, 9, 3).getTime(), closedAs: 'replied' });
const promisedW = Object.assign({}, pay3, { id: 'c4', stage: 'promised' });
const sm = F.summarize([w, closedPaid, closedPaidOld, closedReply, promisedW, Object.assign({}, nudged1, { id: 'c5' })], nowM);
check('closed this month ignores last month', sm.closedThisMonth === 2, sm);
check('paid this month sums only paid, per currency', JSON.stringify(sm.paidThisMonth) === JSON.stringify([{ currency: 'USD', value: 4200 }]), sm.paidThisMonth);
check('stages are counted', sm.nudged === 1 && sm.promised === 1, sm);
check('the oldest open loop is reported in days', sm.oldestOpenDays === 19, sm);
const rc = F.recentlyClosed([closedPaid, closedPaidOld, closedReply, w], nowM, 5);
check('recently closed is newest first and within a month', rc.length === 2 && rc[0].id === 'c1' && rc[1].id === 'c3', rc.map((x) => x.id));

console.log('\n--- a reminder ticked done in Google Tasks ---\n');
{
  const w = { id: 't1', status: 'waiting', direction: 'theirs', taskRef: { taskId: 'T1' } };
  const p = F.closeFromTask(w, NOW);
  check('it closes the loop as the person\'s own close, never as Glance\'s', p.status === 'resolved' && p.resolvedBy === 'task' && p.closedAs === 'manual', p);
  check('on your own promise it is "kept"', F.closeFromTask(Object.assign({}, w, { direction: 'mine' }), NOW).closedAs === 'kept');
  check('only waiting loops with a reminder are asked about, and not again within ten minutes', F.taskRefsToCheck([w, { id: 'x', status: 'waiting' }, { id: 'y', status: 'resolved', taskRef: { taskId: 'Y' } }], NOW, {}).length === 1 && F.taskRefsToCheck([w], NOW, { t1: NOW - 60000 }).length === 0 && F.taskRefsToCheck([w], NOW, { t1: NOW - 11 * 60000 }).length === 1);
}

console.log('\nTOTAL FAILURES: ' + failures);
process.exit(failures ? 1 : 0);
