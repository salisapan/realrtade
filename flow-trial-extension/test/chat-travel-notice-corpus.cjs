// core/chat-travel-notice.js: a trip told to the person (flight, train, ride) becomes a day and a clock to hold, never anything else.
// The lines are invented and were written after the rules, not tuned to them. Run: node test/chat-travel-notice-corpus.cjs
const { FlowChatTravelNotice: A } = require('../core/chat-travel-notice.js');
const NOW = new Date(2026, 9, 23, 10, 0, 0); // Friday
let failures = 0;
function check(name, ok, detail) { if (ok) console.log('PASS: ' + name); else { failures++; console.log('FAIL: ' + name + (detail ? ' ' + JSON.stringify(detail) : '')); } }
const YES = [
  // A change that names the new time is the same trip at that time (owner-visible change of 2026-10-24: these were quiet before).
  ['Your flight has been delayed, now departs Sunday at 08:00', '2026-10-25', 8, 0],
  ['Your flight LY001 has been delayed, it now departs Sunday at 07:15', '2026-10-25', 7, 15],
  ['Your train has been rescheduled to depart tomorrow at 09:40', '2026-10-24', 9, 40],
  ['Your flight LY001 was delayed from Sunday at 06:30 and now departs Sunday at 08:45', '2026-10-25', 8, 45],
  ['הטיסה שלך נדחתה, היא תמריא ביום ראשון ב-07:15', '2026-10-25', 7, 15],
  ['הטיסה שלך התעכבה ותמריא ביום ראשון ב-08:00', '2026-10-25', 8, 0],
  ['Your flight LY001 departs Sunday at 06:30', '2026-10-25', 6, 30],
  ['Your flight to Paris is confirmed: it departs Sunday 25 Oct at 06:30', '2026-10-25', 6, 30],
  ['Your train leaves tomorrow at 08:15 from platform 4', '2026-10-24', 8, 15],
  ['Boarding for your flight starts Sunday at 05:45', '2026-10-25', 5, 45],
  ['Your ride is booked for tomorrow at 7:00 am', '2026-10-24', 7, 0],
  ['Your shuttle pick-up is Monday at 14:20', '2026-10-26', 14, 20],
  ['הטיסה שלך ממריאה ביום ראשון ב-06:30', '2026-10-25', 6, 30],
  ['הרכבת שלך יוצאת מחר ב-08:15', '2026-10-24', 8, 15],
  ['ההסעה שלך אושרה ליום שני בשעה 05:00', '2026-10-26', 5, 0],
  ['הטיסה שלך ל-פריז אושרה, ממריאה ביום ראשון ב־06:30', '2026-10-25', 6, 30]
];
for (const [text, day, h, m] of YES) { const r = A.recognize(text, NOW); check('trip: ' + text, r.kind === 'trip' && r.dateIso === day && r.hour === h && r.minute === m, r); }
const NO = [
  ['Your flight has been delayed', 'a delay with no new time'],
  ['הטיסה שלך עוכבה', 'a delay with no new time'],
  ['Unfortunately your flight is delayed and now departs Sunday at 07:15 instead', 'sorry / instead'],
  ['Your flight was cancelled and rebooked, it now departs Sunday at 07:15', 'cancelled'],
  ['Your flight departed Sunday at 06:30 and was delayed', 'look back'],
  ['Your flight departs Sunday', 'no clock'],
  ['Your flight departs at 06:30', 'no day'],
  ['Your flight was cancelled, it departed Sunday at 06:30', 'cancelled'],
  ['Flight deals departing Sunday at 06:30 - book now', 'promotion'],
  ['Did your flight depart Sunday at 06:30?', 'question'],
  ['The flight departs Sunday at 06:30', 'not yours'],
  ['Your flight landed yesterday at 06:30', 'look back'],
  ['Your flight departs on 2025-01-02 at 06:30', 'past'],
  ['Your train ticket costs 40 NIS, valid Sunday at 06:30', 'no departure verb'],
  ['הטיסה שלך בוטלה, היא הייתה ביום ראשון ב-06:30', 'cancelled'],
  ['מבצע טיסות ביום ראשון ב-06:30, הזמינו עכשיו', 'promotion'],
  ['הטיסה ממריאה ביום ראשון ב-06:30', 'not yours'],
  ['', 'empty'],
  ['x'.repeat(400), 'long']
];
for (const [text, why] of NO) check('not a trip (' + why + '): ' + text.slice(0, 50), A.recognize(text, NOW).kind === 'none', A.recognize(text, NOW));
check('no throw on junk', (() => { try { A.recognize(null, null); A.recognize(undefined, 'x'); return true; } catch (e) { return false; } })());
console.log(failures ? '\n' + failures + ' FAILED' : '\nAll chat-travel-notice checks passed');
process.exit(failures ? 1 : 0);
