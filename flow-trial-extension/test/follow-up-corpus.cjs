// Follow-up corpus — "waiting on". Precision first: every message Glance should
// stay quiet on is as important as every message it should track.
// Run: node test/follow-up-corpus.cjs
const { FlowFollowUp: F } = require('../core/follow-up.js');
const { FlowExtract } = require('../core/extract.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

// Thursday 1 October 2026, noon local.
const NOW = new Date(2026, 9, 1, 12).getTime();
const classify = (t) => F.classifyOutgoing(t, { now: NOW, extract: FlowExtract });

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

console.log('\nTOTAL FAILURES: ' + failures);
process.exit(failures ? 1 : 0);
