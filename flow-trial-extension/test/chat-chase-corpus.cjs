// core/chat-chase.js: a "Waiting on Dana: ..." task whose day has passed is chased with a short, polite reminder the person may put in the
// open chat's box. Parses the task title, counts overdue days, writes the words, picks one task and never the same one twice in three
// days. Nothing here sends or closes anything. Run: node test/chat-chase-corpus.cjs
'use strict';
const { FlowChatChase: C } = require('../core/chat-chase.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const NOW = new Date(2026, 9, 26, 10, 0, 0); // Monday 2026-10-26

console.log('\n--- the title of a waiting task ---\n');
const TITLES = [
  ['Waiting on Dana: Payment 500 NIS', { name: 'Dana', he: false, pay: ['500', 'NIS'] }],
  ['Waiting on Dana Levi: Payment 1200.50 USD', { name: 'Dana Levi', he: false, pay: ['1200.50', 'USD'] }],
  ['Waiting on Dana: the signed contract', { name: 'Dana', he: false, pay: null }],
  ['מחכים ל-Dana: תשלום 500 NIS', { name: 'Dana', he: true, pay: ['500', 'NIS'] }],
  ['מחכים לדנה: החוזה החתום', { name: 'דנה', he: true, pay: null }]
];
for (const [t, want] of TITLES) {
  const r = C.parseWaiting(t);
  check('parsed: ' + t, r && r.name === want.name && r.he === want.he && (want.pay ? r.payment && r.payment.amount === want.pay[0] && r.payment.currency === want.pay[1] : r.payment === null), r);
}
for (const t of ['Pay 500 NIS', 'Call back · Dana', 'Waiting on Dana', 'Waiting on : x', 'מחכים', 'Hold Mon 10:00', '', null]) {
  check('not a waiting task: ' + String(t), C.parseWaiting(t) === null);
}

console.log('\n--- overdue days ---\n');
check('yesterday is 1', C.daysOverdue('2026-10-25', NOW) === 1);
check('today is 0, not chased', C.daysOverdue('2026-10-26', NOW) === 0);
check('tomorrow is -1', C.daysOverdue('2026-10-27', NOW) === -1);
check('a week back is 7', C.daysOverdue('2026-10-19', NOW) === 7);
check('a bad day is null', C.daysOverdue('soon', NOW) === null && C.daysOverdue('', NOW) === null);

console.log('\n--- the words ---\n');
let d = C.draft({ title: 'Waiting on Dana: Payment 500 NIS', dueIso: '2026-10-22' }, NOW);
check('English payment reminder names the person, the amount and the due day', /^Hi Dana,/.test(d) && /the 500 NIS payment/.test(d) && /due Thursday/.test(d) && /Thanks!$/.test(d) && d.length < 220, d);
d = C.draft({ title: 'Waiting on Dana: the signed contract', dueIso: '2026-10-22' }, NOW);
check('English reminder for a document quotes the request', /about "the signed contract"/.test(d) && /due Thursday/.test(d) && /Thanks!$/.test(d), d);
d = C.draft({ title: 'Waiting on Dana: Send me the signed contract', dueIso: '2026-10-22' }, NOW);
check('an imperative request stays grammatical because it is quoted', /about "Send me the signed contract" \(it was due Thursday\)/.test(d), d);
d = C.draft({ title: 'מחכים ל-Dana: תשלום 500 NIS', dueIso: '2026-10-22' }, NOW);
check('Hebrew payment reminder', /^היי Dana,/.test(d) && /לתשלום של 500 NIS/.test(d) && /יום חמישי/.test(d) && /תודה!$/.test(d), d);
d = C.draft({ title: 'מחכים לדנה: החוזה החתום', dueIso: '2026-10-22' }, NOW);
check('Hebrew reminder for a document quotes the request', /^היי דנה,/.test(d) && /לגבי הבקשה "החוזה החתום"/.test(d), d);
check('no draft for a task that is not waiting or has no day', C.draft({ title: 'Pay 500 NIS', dueIso: '2026-10-22' }, NOW) === '' && C.draft({ title: 'Waiting on Dana: x y z', dueIso: 'soon' }, NOW) === '');
check('the draft never asks for money to be sent to an account or makes a threat', !/account|IBAN|bank|legal|court|penalt|fine|interest/i.test(C.draft({ title: 'Waiting on Dana: Payment 500 NIS', dueIso: '2026-10-22' }, NOW)));

console.log('\n--- which task, and not twice ---\n');
const T = (title, dueIso, last) => ({ title: title, dueIso: dueIso, lastNudgeAt: last });
check('overdue by a day is chased', C.pick([T('Waiting on Dana: Payment 500 NIS', '2026-10-25')], NOW) !== null);
check('due today is not chased yet', C.pick([T('Waiting on Dana: Payment 500 NIS', '2026-10-26')], NOW) === null);
check('due tomorrow is not chased', C.pick([T('Waiting on Dana: Payment 500 NIS', '2026-10-27')], NOW) === null);
check('older than three weeks is not a nudge', C.pick([T('Waiting on Dana: Payment 500 NIS', '2026-09-20')], NOW) === null);
check('exactly three weeks is still chased', C.pick([T('Waiting on Dana: Payment 500 NIS', '2026-10-05')], NOW) !== null);
check('nudged yesterday: not again', C.pick([T('Waiting on Dana: Payment 500 NIS', '2026-10-20', NOW.getTime() - 86400000)], NOW) === null);
check('nudged four days ago: again', C.pick([T('Waiting on Dana: Payment 500 NIS', '2026-10-20', NOW.getTime() - 4 * 86400000)], NOW) !== null);
const two = C.pick([T('Waiting on Dana: the signed contract', '2026-10-24', NOW.getTime() - 86400000), T('Waiting on Dana: Payment 500 NIS', '2026-10-20')], NOW);
check('the first task that is due for a nudge wins', two && /Payment/.test(two.title), two);
check('junk is safe', C.pick(null, NOW) === null && C.pick([null, {}, { title: 5 }], NOW) === null);

console.log('\n--- the switch ---\n');
check('off by default', C.SWITCH_DEFAULT === false && C.enabled() === false && C.enabled({}) === false && C.enabled({ CHAT_CHASE_DRAFT: true }) === true);

console.log('\n' + (failures ? failures + ' FAILED' : 'All chat-chase checks passed'));
process.exit(failures ? 1 : 0);
