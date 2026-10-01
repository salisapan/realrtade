// The five added dimensions, all local: expiry, meeting debrief, recurrence,
// person view, aging. Precision first: every "stay quiet" case matters.
// Run: node test/loop-dimensions-corpus.cjs
const { FlowExpiry: X } = require('../core/expiry.js');
const { FlowMeetingDebrief: M } = require('../core/meeting-debrief.js');
const { FlowRecurrence: R } = require('../core/recurrence.js');
const { FlowFollowUp: F } = require('../core/follow-up.js');
const { FlowStillOpen: S } = require('../core/still-open.js');
const { FlowExtract } = require('../core/extract.js');
const { FlowRequestTypes: T } = require('../core/request-types.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const NOW = new Date(2026, 9, 1, 12).getTime(); // Thu 1 Oct 2026
const det = (t) => X.detect(t, { now: NOW, extract: FlowExtract });

console.log('\n--- 1. things that run out ---\n');
const yes = [
  ['This quote is valid until October 31, 2026, after which pricing may change.', 'offer', '2026-10-31'],
  ['Your free trial ends on October 15 and your card will be charged.', 'trial', '2026-10-15'],
  ['The proposal expires on 20 October 2026 unless we hear back.', 'offer', '2026-10-20'],
  ['Your passport expires on December 3, 2026, so renew it before you travel.', 'document', '2026-12-03'],
  ['Your subscription renews on November 12, 2026 at the current rate.', 'renewal', '2026-11-12'],
  ['We are holding the reservation open until October 9, 2026 for you.', 'reservation', '2026-10-09'],
  ['ההצעה בתוקף עד 25 באוקטובר 2026 ולאחר מכן המחיר ישתנה.', 'offer', '2026-10-25']
];
for (const [text, noun, iso] of yes) {
  const r = det(text);
  check('expiry: ' + text.slice(0, 54), r && r.noun === noun && r.expiresIso === iso, r);
}
const no = [
  'Flash sale! 40% off everything, offer ends October 20, shop now.',
  'Newsletter: our webinar ends on October 15, unsubscribe any time here.',
  'Please send the signed contract no later than October 15 so we can start.',
  'The invoice is due by October 20, 2026.',
  'We met on October 3 and talked about pricing.',
  'The quote expires soon, so let me know what you think about it.',
  'Your offer expired on September 20, 2026.',
  'This coupon is valid until October 31, use it at checkout for a discount.'
];
for (const text of no) check('silent: ' + text.slice(0, 58), det(text) === null, det(text));
let r = det('Your free trial ends on October 15 and your card will be charged.');
check('look again three days before', r.warnIso === '2026-10-12', r);
r = det('The quote is valid until October 3, 2026 so please decide soon.');
check('when it ends in two days the look moves to tomorrow, never today', r && r.warnIso === '2026-10-02', r);
r = det('The hold on your table is valid until October 2, 2026 at noon sharp.');
check('and when it ends tomorrow, tomorrow', r && r.warnIso === '2026-10-02', r);
check('days left counts down and goes negative', X.daysLeft('2026-10-04', NOW) === 3 && X.daysLeft('2026-09-29', NOW) === -2);

console.log('\n--- 2. what came out of the meeting ---\n');
const parse = (t) => M.parse(t, { now: NOW, extract: FlowExtract, types: T });
let items = parse('Dana to send the contract by Friday\nI will share the deck with everyone\n- Yossi should review the budget\nGreat energy in the room\nLet us keep the momentum going');
check('three action items are found, the chatter is skipped', items.length === 3, items);
check('"Dana to ..." is hers, with her name and the date', items[0].direction === 'theirs' && items[0].owner === 'Dana' && items[0].deadlineIso === '2026-10-02', items[0]);
check('"I will ..." is mine', items[1].direction === 'mine' && items[1].owner === null, items[1]);
check('"Yossi should ..." is his', items[2].direction === 'theirs' && items[2].owner === 'Yossi', items[2]);
items = parse('Action: Noa will update the forecast;\n1. Gil needs to confirm the date\n* I\'ll schedule the follow-up call');
check('bullets, numbering, "Action:" and semicolons are all stripped', items.length === 3 && items[0].owner === 'Noa' && items[1].owner === 'Gil' && items[2].direction === 'mine', items);
items = parse('דנה תשלח את החוזה עד יום חמישי\nאני אשלח את המצגת\nיוסי יבדוק את התקציב\nפגישה מצוינת תודה');
check('Hebrew items: owner, mine, theirs, chatter skipped', items.length === 3 && items[0].direction === 'theirs' && items[0].owner === 'דנה' && items[1].direction === 'mine' && items[2].owner === 'יוסי', items);
check('a line with a name but no action is not an item', parse('Dana will be there on Tuesday').length === 0);
check('empty notes give nothing', parse('').length === 0 && parse('   \n  ').length === 0);
check('no lexicon, no items (silent)', M.parse('Dana to send the contract', { now: NOW, extract: FlowExtract }).length === 0);
check('a meeting is due the day after, for ten days', M.isDue({ dateIso: '2026-09-30' }, NOW) && M.isDue({ dateIso: '2026-09-21' }, NOW) && !M.isDue({ dateIso: '2026-10-01' }, NOW) && !M.isDue({ dateIso: '2026-09-20' }, NOW) && !M.isDue({ dateIso: '2026-10-05' }, NOW));
check('a debriefed meeting is not due again', !M.isDue({ dateIso: '2026-09-30', done: true }, NOW));

console.log('\n--- 3. things that come around again ---\n');
const mk = (open, who, over) => Object.assign({ counterpart: { email: who || 'dana@acme.com', name: 'Dana Cole' }, kind: 'payment', direction: 'theirs', subtype: 'pay', createdAt: new Date(open + 'T12:00:00').getTime() }, over || {});
let h = {};
['2026-07-01', '2026-08-01', '2026-09-01'].forEach((d) => { h = R.record(h, mk(d), NOW); });
const p = R.predict(h, NOW, {});
check('three monthly asks predict the next one (about 1 Oct)', p.length === 1 && p[0].nextIso === '2026-10-02' && /Dana/.test(p[0].label) && R.periodWords(p[0].periodDays) === 'about every month', p);
check('two occurrences are not a pattern', R.predict(R.record(R.record({}, mk('2026-08-01'), NOW), mk('2026-09-01'), NOW), NOW, {}).length === 0);
let irregular = {};
['2026-06-01', '2026-06-20', '2026-09-01'].forEach((d) => { irregular = R.record(irregular, mk(d), NOW); });
check('irregular gaps stay silent', R.predict(irregular, NOW, {}).length === 0);
check('a prediction already acknowledged is not shown again', R.predict(h, NOW, { [R.keyOf(mk('2026-09-01'))]: '2026-10-02' }).length === 0);
let far = {};
['2026-03-01', '2026-04-01', '2026-05-01'].forEach((d) => { far = R.record(far, mk(d), NOW); });
check('a prediction far in the past or future is not shown', R.predict(far, NOW, {}).length === 0);
check('the same day twice counts once', Object.values(R.record(R.record({}, mk('2026-09-01'), NOW), mk('2026-09-01'), NOW))[0].dates.length === 1);
check('different people and directions are different rhythms', R.keyOf(mk('2026-09-01', 'a@x.com')) !== R.keyOf(mk('2026-09-01', 'b@x.com')) && R.keyOf(mk('2026-09-01')) !== R.keyOf(mk('2026-09-01', null, { direction: 'mine' })));
check('a loop with no person is not recorded', Object.keys(R.record({}, { counterpart: {}, kind: 'reply', createdAt: NOW }, NOW)).length === 0);
let weekly = {};
['2026-09-03', '2026-09-10', '2026-09-17', '2026-09-24'].forEach((d) => { weekly = R.record(weekly, mk(d, 'z@z.com', { kind: 'reply', subtype: 'send:report' }), NOW); });
const wp = R.predict(weekly, NOW, {});
check('a weekly report is learned, next due Thursday 1 Oct', wp.length === 1 && wp[0].nextIso === '2026-10-01' && R.periodWords(wp[0].periodDays) === 'about every week', wp);
let many = {};
for (let i = 0; i < 50; i++) many = R.record(many, mk('2026-09-01', 'u' + i + '@x.com'), NOW);
check('history is capped', Object.keys(many).length <= 40);

console.log('\n--- 4. everything open with a person ---\n');
const ask = (text) => F.classifyOutgoing(text, { now: NOW, extract: FlowExtract, types: T });
const mkw = (id, who, text, extra) => Object.assign(F.buildWatch({ threadId: id, messageId: id, subject: id, counterpart: { email: who, name: who.split('@')[0] }, ask: ask(text), now: NOW }), extra || {});
const w1 = mkw('a', 'dana@acme.com', 'Hi, attached is invoice #1 for $4,200, due Oct 15. Please pay by then.');
const w2 = mkw('b', 'dana@acme.com', 'Could you send the signed contract by Monday so we can start?');
const w3 = mkw('c', 'yossi@y.com', 'Could you send the signed contract by Monday so we can start?', { chaseIso: '2026-09-28' });
const w4 = F.buildWatch({ threadId: 'd', messageId: 'd', subject: 'd', counterpart: { email: 'dana@acme.com', name: 'Dana' }, ask: F.classifyCommitment("I'll send you the numbers by Friday.", { now: NOW, extract: FlowExtract, types: T }), now: NOW });
const groups = F.groupByPerson([w1, w2, w3, w4, Object.assign({}, w2, { id: 'z', status: 'resolved' })], NOW);
check('open loops group by person, closed ones left out', groups.length === 2 && groups.reduce((n, g) => n + g.loops.length, 0) === 4, groups.map((g) => [g.name, g.loops.length]));
check('the person with something overdue comes first', groups[0].email === 'yossi@y.com' && groups[0].overdue === 1, groups[0]);
const dana = groups.find((g) => g.email === 'dana@acme.com');
check('Dana has three loops, both directions, with the money she owes', dana.loops.length === 3 && dana.youOwe === 1 && dana.money.length === 1 && dana.money[0].value === 4200, dana);
check('her loops are ordered by the day to look', dana.loops.every((x, i, a) => !i || a[i - 1].chaseIso <= x.chaseIso));

console.log('\n--- 5. how long it has been on you ---\n');
const day = (n) => NOW - n * 86400000;
check('today reads "On you since today", fresh', S.agingOf({ ts: NOW }, NOW).label === 'On you since today' && S.agingOf({ ts: NOW }, NOW).level === 'fresh');
check('two days is still fresh', S.agingOf({ ts: day(2) }, NOW).level === 'fresh' && S.agingOf({ ts: day(2) }, NOW).label === 'On you 2 days');
check('three days is stale', S.agingOf({ ts: day(3) }, NOW).level === 'stale');
check('a week is late', S.agingOf({ ts: day(7) }, NOW).level === 'late' && S.agingOf({ ts: day(1) }, NOW).label === 'On you 1 day');
check('no timestamp, no label', S.agingOf({}, NOW).label === '' && S.agingOf(null, NOW).level === 'fresh');

console.log('\nTOTAL FAILURES: ' + failures);
process.exit(failures ? 1 : 0);
