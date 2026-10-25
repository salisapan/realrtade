// An event is 30 minutes unless the card names a length (a delivery window): both calendar writers take durationMinutes as a whole number
// from 5 to 720 and fall back to 30 for anything else; the delivery reader names the length of its window.
// Run: node test/hold-duration-corpus.cjs
const Google = require('../core/google-calendar.js').FlowGoogleCalendar || require('../core/google-calendar.js');
const Outlook = require('../core/outlook-calendar.js').FlowOutlookCalendar || require('../core/outlook-calendar.js');
const { FlowChatDeliveryWindow: Delivery } = require('../core/chat-delivery-window.js');
let failures = 0;
function check(name, ok, detail) { if (ok) console.log('PASS: ' + name); else { failures++; console.log('FAIL: ' + name + (detail ? ' ' + JSON.stringify(detail) : '')); } }
const minutes = (a, b) => (new Date(b).getTime() - new Date(a).getTime()) / 60000;
const OUT = { dateIso: '2026-10-26', hour: 14, minute: 0, title: 'Delivery 14:00–18:00', timeZone: 'Asia/Jerusalem' };
const GOO = { dateIso: '2026-10-26', hour: 14, minute: 0, title: 'Delivery 14:00–18:00', timeZone: 'Asia/Jerusalem' };
for (const [named, want] of [[240, 240], ['240', 240], [5, 5], [720, 720], [4, 30], [721, 30], [0, 30], [-60, 30], [30.5, 30], ['abc', 30], [null, 30], [undefined, 30], ['1e3', 30]]) {
  const o = Outlook.meetingBody(Object.assign({}, OUT, { durationMinutes: named }));
  check('outlook duration ' + JSON.stringify(named) + ' is ' + want, !!o && minutes(o.start.dateTime.replace(/\.0+$/, ''), o.end.dateTime.replace(/\.0+$/, '')) === want, o && [o.start, o.end]);
  const g = Google.eventBody(Object.assign({}, GOO, { durationMinutes: named }));
  check('google duration ' + JSON.stringify(named) + ' is ' + want, !!g && minutes(g.start.dateTime, g.end.dateTime) === want, g && [g.start, g.end]);
}
check('outlook default stays 30', minutes(Outlook.meetingBody(OUT).start.dateTime.replace(/\.0+$/, ''), Outlook.meetingBody(OUT).end.dateTime.replace(/\.0+$/, '')) === 30);
check('google default stays 30', minutes(Google.eventBody(GOO).start.dateTime, Google.eventBody(GOO).end.dateTime) === 30);
check('nobody is invited with a length either', (Outlook.meetingBody(Object.assign({}, OUT, { durationMinutes: 240 })).attendees || []).length === 0 && (Google.eventBody(Object.assign({}, GOO, { durationMinutes: 240 })).attendees || []).length === 0);
const NOW = new Date(2026, 9, 25, 10, 0, 0);
const w = Delivery.recognize('Your package will be delivered tomorrow between 14:00 and 18:00', NOW);
check('the delivery window names its length', w.kind === 'delivery' && w.durationMinutes === 240, w);
const w2 = Delivery.recognize('המשלוח שלך יגיע ביום שני בין השעות 10:00-12:30', NOW);
check('a Hebrew window names its length', w2.kind === 'delivery' && w2.durationMinutes === 150, w2);
const one = Delivery.recognize('Your order will arrive tomorrow at 15:30', NOW);
check('a single clock has no length', one.kind === 'delivery' && one.durationMinutes === null, one);
console.log(failures ? '\n' + failures + ' FAILED' : '\nAll hold-duration checks passed');
process.exit(failures ? 1 : 0);
