// Outside signals: a loop closes when reality moved somewhere other than the thread.
// Precision first: every doubtful case must leave the loop open.
// Run: node test/outside-signals-corpus.cjs
const { FlowOutsideSignals: S } = require('../core/outside-signals.js');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const NOW = new Date(2026, 9, 3, 12).getTime();
const DAY = 24 * 3600 * 1000;
const payLoop = (over) => Object.assign({ id: 't1', status: 'waiting', kind: 'payment', direction: 'theirs', amount: { value: 3850, currency: 'ILS', raw: '₪3,850' }, counterpart: { name: 'Dana Cohen', email: 'dana@acme.example' }, createdAt: NOW - 5 * DAY, lang: 'en', subtype: 'pay' }, over || {});

console.log('\n--- payment evidence from an opened email ---\n');
{
  const paypal = S.paymentEvidence('You have received ₪3,850.00 from Dana Cohen. The money is now in your PayPal balance.', 'service@paypal.com');
  check('a payment provider saying money arrived is evidence, with the amount and a trusted sender', paypal && paypal.amount.value === 3850 && paypal.amount.currency === 'ILS' && paypal.trusted, paypal);
  const he = S.paymentEvidence('התקבל תשלום בסך 3,850 ש"ח מדנה כהן לחשבונך.', 'noreply@bankhapoalim.co.il');
  check('Hebrew bank wording works the same way', he && he.amount.value === 3850 && he.trusted, he);
  check('money going OUT is not evidence', S.paymentEvidence('You paid $3,850 to Acme Ltd. Thank you for using PayPal.', 'service@paypal.com') === null);
  check('a refund is not evidence', S.paymentEvidence('Your refund of $3,850 has been processed and credited to your card.', 'service@paypal.com') === null);
  check('a payment reminder or failure is not evidence', S.paymentEvidence('Payment failed: we could not collect $3,850. Please update your card.', 'billing@stripe.com') === null);
  check('two different amounts in the receipt lines: say nothing', S.paymentEvidence('You have received $3,850. You have received $120 earlier.', 'service@paypal.com') === null);
  check('no amount: nothing', S.paymentEvidence('You have received a payment from Dana.', 'service@paypal.com') === null);
  check('an unrelated newsletter is nothing', S.paymentEvidence('Our October offers are here. Save 20% on everything.', 'news@shop.example') === null);
  const untrusted = S.paymentEvidence('Hi, I sent you $3,850 this morning, you have received the payment.', 'dana@acme.example');
  check('a message from the client is evidence only as untrusted (it is a reply, the question stays on)', untrusted && !untrusted.trusted, untrusted);
  check('trusted sender matching is by domain, including subdomains, never by display name', S.trustedSender('Alerts <alerts@mail.paypal.com>') && !S.trustedSender('"PayPal" <x@paypal.com.evil.example>') && !S.trustedSender('paypal@gmail.com'));
}

console.log('\n--- matching evidence to ONE payment loop ---\n');
{
  const ev = S.paymentEvidence('You have received ₪3,850.00 from Dana Cohen.', 'service@paypal.com');
  const m = S.matchPayment([payLoop()], ev, NOW);
  check('trusted sender + exact amount + the person\'s name: strong (closes with a receipt and Reopen)', m && m.strength === 'strong' && m.watchId === 't1', m);
  const noName = S.matchPayment([payLoop()], S.paymentEvidence('You have received ₪3,850.00. Reference 4471.', 'service@paypal.com'), NOW);
  check('exact amount, trusted sender, no name: only asks', noName && noName.strength === 'ask', noName);
  const unt = S.matchPayment([payLoop()], S.paymentEvidence('Hi, you have received ₪3,850.00 from Dana Cohen', 'x@gmail.com'), NOW);
  check('exact amount and name from an untrusted sender: only asks', unt && unt.strength === 'ask', unt);
  check('a different amount does not match', S.matchPayment([payLoop({ amount: { value: 4200, currency: 'ILS' } })], ev, NOW) === null);
  check('a different currency does not match', S.matchPayment([payLoop({ amount: { value: 3850, currency: 'USD' } })], ev, NOW) === null);
  check('two loops for the same amount: no guess', S.matchPayment([payLoop(), payLoop({ id: 't2', counterpart: { name: 'Omer', email: 'o@x.example' } })], ev, NOW) === null);
  check('a loop that is already closed is ignored', S.matchPayment([payLoop({ status: 'resolved' })], ev, NOW) === null);
  check('a debt of YOURS is never settled by money arriving', S.matchPayment([payLoop({ direction: 'mine' })], ev, NOW) === null);
  check('a reply loop is not a payment loop', S.matchPayment([payLoop({ kind: 'reply', amount: null })], ev, NOW) === null);
  check('evidence older than the loop cannot settle it (loop opened in the future of the email)', S.matchPayment([payLoop({ createdAt: NOW + DAY })], ev, NOW) === null);
  check('a dismissed proposal is not asked twice', S.matchPayment([payLoop({ signalDismissed: ['payment'] })], ev, NOW) === null);
  check('amount tolerance is tiny: 0.5%', S.matchPayment([payLoop({ amount: { value: 3860, currency: 'ILS' } })], ev, NOW) !== null && S.matchPayment([payLoop({ amount: { value: 3900, currency: 'ILS' } })], ev, NOW) === null);
}

console.log('\n--- calendar ---\n');
{
  const sched = (over) => Object.assign({ id: 'c1', status: 'waiting', kind: 'reply', direction: 'theirs', subtype: 'schedule:meeting', counterpart: { name: 'Dana', email: 'Dana@Acme.example' }, createdAt: NOW - 3 * DAY, lang: 'en' }, over || {});
  const ev = (over) => Object.assign({ id: 'e1', startIso: new Date(NOW + 2 * DAY).toISOString(), createdMs: NOW - DAY, organizer: 'me@x.example', attendees: [{ email: 'dana@acme.example', response: 'accepted' }, { email: 'me@x.example', response: 'accepted' }], status: 'confirmed' }, over || {});
  const m = S.matchCalendar(sched(), [ev()], NOW);
  check('a new event the person ACCEPTED settles a "pick a time" loop (email compared case-insensitively)', m && m.strength === 'strong' && m.eventId === 'e1', m);
  check('an event created BEFORE the loop does not count', S.matchCalendar(sched(), [ev({ createdMs: NOW - 10 * DAY })], NOW) === null);
  check('an event without the person on the invite does not count', S.matchCalendar(sched(), [ev({ attendees: [{ email: 'someone@else.example', response: 'accepted' }] })], NOW) === null);
  check('an event YOU created and invited them to, not yet accepted, is preparation and does not close it', S.matchCalendar(sched(), [ev({ attendees: [{ email: 'dana@acme.example', response: 'needsAction' }] })], NOW) === null && S.matchCalendar(sched(), [ev({ attendees: [{ email: 'dana@acme.example', response: 'tentative' }] })], NOW) === null && S.matchCalendar(sched(), [ev({ attendees: [{ email: 'dana@acme.example', response: 'declined' }] })], NOW) === null);
  check('an event THEY organised counts: they proposed it', (S.matchCalendar(sched(), [ev({ organizer: 'dana@acme.example', attendees: [{ email: 'me@x.example', response: 'needsAction' }] })], NOW) || {}).eventId === 'e1');
  check('a cancelled event does not count', S.matchCalendar(sched(), [ev({ status: 'cancelled' })], NOW) === null);
  check('two matching events: no guess', S.matchCalendar(sched(), [ev(), ev({ id: 'e2' })], NOW) === null);
  check('a loop that is not about scheduling is left alone', S.matchCalendar(sched({ subtype: 'send:document' }), [ev()], NOW) === null);
  check('a loop with no address is left alone', S.matchCalendar(sched({ counterpart: { name: 'Dana', email: null } }), [ev()], NOW) === null);
  check('wantsCalendar is the cheap pre-check', S.wantsCalendar(sched()) && !S.wantsCalendar(sched({ subtype: 'pay' })) && !S.wantsCalendar(sched({ status: 'resolved' })));
}

console.log('\n--- drive ---\n');
{
  const mine = (over) => Object.assign({ id: 'd1', status: 'waiting', kind: 'reply', direction: 'mine', subtype: 'send:quote', counterpart: { name: 'Dana', email: 'dana@acme.example' }, createdAt: NOW - 2 * DAY, lang: 'en' }, over || {});
  const file = (over) => Object.assign({ id: 'f1', name: 'Acme quote v2', modifiedMs: NOW - DAY, sharedWith: ['dana@acme.example'] }, over || {});
  const m = S.matchDrive(mine(), [file()]);
  check('a file named for the promised thing, shared with that person since the promise: asks, never closes alone', m && m.strength === 'ask' && m.fileId === 'f1', m);
  check('a file changed before the promise does not count', S.matchDrive(mine(), [file({ modifiedMs: NOW - 9 * DAY })]) === null);
  check('a file not shared with that person does not count', S.matchDrive(mine(), [file({ sharedWith: ['x@else.example'] })]) === null);
  check('a file named for something else does not count', S.matchDrive(mine(), [file({ name: 'Holiday photos' })]) === null);
  check('two candidate files: no guess', S.matchDrive(mine(), [file(), file({ id: 'f2', name: 'Acme quote v3' })]) === null);
  check('a loop that is only "send a file" is too generic to name', S.matchDrive(mine({ subtype: 'send:document' }), [file({ name: 'document' })]) === null);
  check('a request made OF someone is not settled by your files', S.matchDrive(mine({ direction: 'theirs' }), [file()]) === null);
  check('wantsDrive is the cheap pre-check', S.wantsDrive(mine()) && !S.wantsDrive(mine({ subtype: 'send:details' })) && !S.wantsDrive(mine({ direction: 'theirs' })));
}

console.log('\n--- what is shown and what is written ---\n');
{
  const w = payLoop();
  const sig = { kind: 'payment', watchId: 't1', strength: 'strong' };
  const p = S.proposal(w, sig, NOW, { amountLabel: '₪3,850' });
  check('a payment proposal says what it saw in plain words and names no AI', /Looks paid/.test(p.question) && !/\bAI\b|smart|intelligen|learn/i.test(p.question + p.receipt), p);
  check('a yes writes a resolved loop with the signal as the reason, so reopened closes are measurable', p.patch.status === 'resolved' && p.patch.resolvedBy === 'signal' && p.patch.closedAs === 'paid');
  check('nothing from the email is stored on the loop', !/PayPal|Cohen|received/.test(JSON.stringify(p.patch)));
  const he = S.proposal(payLoop({ lang: 'he' }), sig, NOW, { amountLabel: '₪3,850' });
  check('Hebrew copy', /[א-ת]/.test(he.question) && /[א-ת]/.test(he.yes));
  check('dismiss is remembered per kind', JSON.stringify(S.dismissPatch(w, 'payment').signalDismissed) === '["payment"]' && S.dismissPatch(Object.assign({}, w, { signalDismissed: ['payment'] }), 'payment').signalDismissed.length === 1 && S.dismissPatch(Object.assign({}, w, { signalDismissed: ['payment'] }), 'drive').signalDismissed.length === 2);
}

console.log('\n' + (failures ? 'FAILED: ' + failures : 'All passed'));
console.log('TOTAL FAILURES: ' + failures);
process.exit(failures ? 1 : 0);
