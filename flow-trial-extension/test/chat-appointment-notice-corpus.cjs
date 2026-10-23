// core/chat-appointment-notice.js: an appointment confirmed to the person in a chat becomes a day and a clock to hold, never anything else.
// The lines are invented and were written after the rules, not tuned to them. Run: node test/chat-appointment-notice-corpus.cjs
const { FlowChatAppointmentNotice: A } = require('../core/chat-appointment-notice.js');
const NOW = new Date(2026, 9, 23, 10, 0, 0); // Friday
let failures = 0;
function check(name, ok, detail) { if (ok) console.log('PASS: ' + name); else { failures++; console.log('FAIL: ' + name + (detail ? ' ' + JSON.stringify(detail) : '')); } }
const YES = [
  ['Your appointment is confirmed for Sunday at 10:00', '2026-10-25', 10, 0],
  ['Reminder: your table is booked Thursday at 8pm', '2026-10-29', 20, 0],
  ['Hi, your haircut appointment is scheduled for tomorrow at 14:30', '2026-10-24', 14, 30],
  ['Your reservation has been confirmed. See you Monday at 7:30pm', '2026-10-26', 19, 30],
  ['התור שלך נקבע ליום ראשון בשעה 10:00', '2026-10-25', 10, 0],
  ['תזכורת: ההזמנה שלך ביום חמישי ב-20:00', '2026-10-29', 20, 0],
  ['שלום, נקבע לך תור למחר ב-16:15', '2026-10-24', 16, 15],
  ['הטיפול שלך אושר ליום שלישי בשעה 09:00', '2026-10-27', 9, 0]
];
for (const [text, day, h, m] of YES) { const r = A.recognize(text, NOW); check('appointment: ' + text, r.kind === 'appointment' && r.dateIso === day && r.hour === h && r.minute === m, r); }
const NO = [
  ['Your appointment is confirmed for Sunday', 'no clock'],
  ['Your appointment is confirmed at 10:00', 'no day'],
  ['Your appointment has been cancelled, it was Sunday at 10:00', 'cancelled'],
  ['Unfortunately your appointment on Sunday at 10:00 cannot go ahead', 'unable'],
  ['Would you like to book an appointment on Sunday at 10:00?', 'question'],
  ['Available slots: Sunday at 10:00 or Monday at 11:00. Click to choose', 'offer'],
  ['Thanks for your visit yesterday at 10:00', 'look back'],
  ['The appointment is on Sunday at 10:00', 'not yours'],
  ['Your appointment was Sunday at 10:00 last week', 'look back 2'],
  ['Your appointment is confirmed for 2025-01-02 at 10:00', 'past'],
  ['התור שלך בוטל, היה ביום ראשון ב-10:00', 'cancelled'],
  ['לקביעת תור לחץ כאן, ביום ראשון ב-10:00', 'offer'],
  ['התור שלך נקבע ליום ראשון', 'no clock'],
  ['הפגישה היתה מצוינת ביום ראשון ב-10:00', 'look back'],
  ['', 'empty'],
  ['x'.repeat(400), 'long']
];
for (const [text, why] of NO) check('not an appointment (' + why + '): ' + text.slice(0, 50), A.recognize(text, NOW).kind === 'none', A.recognize(text, NOW));
check('a clock already past today is not held', A.recognize('Your appointment is confirmed for today at 08:00', NOW).kind === 'none');
check('no throw on junk', (() => { try { A.recognize(null, null); A.recognize(undefined, 'x'); return true; } catch (e) { return false; } })());
console.log(failures ? '\n' + failures + ' FAILED' : '\nAll chat-appointment-notice checks passed');
process.exit(failures ? 1 : 0);
