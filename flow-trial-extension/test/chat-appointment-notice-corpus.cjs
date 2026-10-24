// core/chat-appointment-notice.js: an appointment confirmed to the person in a chat becomes a day and a clock to hold, never anything else.
// The lines are invented and were written after the rules, not tuned to them. Run: node test/chat-appointment-notice-corpus.cjs
const { FlowChatAppointmentNotice: A } = require('../core/chat-appointment-notice.js');
const NOW = new Date(2026, 9, 23, 10, 0, 0); // Friday
let failures = 0;
function check(name, ok, detail) { if (ok) console.log('PASS: ' + name); else { failures++; console.log('FAIL: ' + name + (detail ? ' ' + JSON.stringify(detail) : '')); } }
const YES = [
  ['Your appointment has been moved to Monday at 11:00', '2026-10-26', 11, 0],
  ['Your appointment was rescheduled from Sunday at 10:00 to Tuesday at 9am', '2026-10-27', 9, 0],
  ['התור שלך הועבר ליום שני בשעה 11:00', '2026-10-26', 11, 0],
  ['התור שלך נדחה ליום שלישי ב-09:00', '2026-10-27', 9, 0],
  ['Your appointment is confirmed for Sunday at 10:00', '2026-10-25', 10, 0],
  ['Reminder: your table is booked Thursday at 8pm', '2026-10-29', 20, 0],
  ['Hi, your haircut appointment is scheduled for tomorrow at 14:30', '2026-10-24', 14, 30],
  ['Your reservation has been confirmed. See you Monday at 7:30pm', '2026-10-26', 19, 30],
  ['התור שלך נקבע ליום ראשון בשעה 10:00', '2026-10-25', 10, 0],
  ['תזכורת: ההזמנה שלך ביום חמישי ב-20:00', '2026-10-29', 20, 0],
  ['שלום, נקבע לך תור למחר ב-16:15', '2026-10-24', 16, 15],
  ['הטיפול שלך אושר ליום שלישי בשעה 09:00', '2026-10-27', 9, 0],
  ['תזכורת: יש לך תור מחר בשעה 10:00 אצל ד"ר כהן', '2026-10-24', 10, 0],
  ['תזכורת לתור שלך מחר ב-16:30', '2026-10-24', 16, 30],
  ['שלום, קבענו לך תור למחר ב-9:00', '2026-10-24', 9, 0],
  ['שריינו לכם שולחן ביום שישי ב-20:00', '2026-10-30', 20, 0],
  ['אישור הזמנה: שולחן ל-4 ביום שישי ב-20:00', '2026-10-30', 20, 0],
  ['Appointment reminder: tomorrow at 10:00 with Dr. Cohen', '2026-10-24', 10, 0],
  ['Reminder: you have an appointment tomorrow at 10:00', '2026-10-24', 10, 0],
  ['Reservation confirmed - Sunday 8pm for 4 people', '2026-10-25', 20, 0]
];
for (const [text, day, h, m] of YES) { const r = A.recognize(text, NOW); check('appointment: ' + text, r.kind === 'appointment' && r.dateIso === day && r.hour === h && r.minute === m, r); }
const NO = [
  ['Unfortunately your appointment has been moved to Monday at 11:00 instead', 'sorry / instead'],
  ['Your appointment on Sunday at 10:00 was cancelled', 'cancelled'],
  ['Your appointment was moved, sorry for the change', 'no new day'],
  ['The meeting was moved to Monday at 11:00', 'not a possessive booking'],
  ['Your package was moved to the depot on Monday at 11:00', 'not an appointment'],
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
  ['Do you have an appointment tomorrow at 10:00?', 'question'],
  ['You have an appointment request pending for Sunday at 10:00 - click to confirm', 'pending request'],
  ['Reminder: you have unread messages tomorrow at 10:00', 'not an appointment'],
  ['Book your appointment now, you have 3 slots on Sunday at 10:00', 'offer'],
  ['יש לך תור ביום ראשון? ב-10:00', 'question'],
  ['', 'empty'],
  ['x'.repeat(400), 'long']
];
for (const [text, why] of NO) check('not an appointment (' + why + '): ' + text.slice(0, 50), A.recognize(text, NOW).kind === 'none', A.recognize(text, NOW));
check('a clock already past today is not held', A.recognize('Your appointment is confirmed for today at 08:00', NOW).kind === 'none');
check('no throw on junk', (() => { try { A.recognize(null, null); A.recognize(undefined, 'x'); return true; } catch (e) { return false; } })());
console.log(failures ? '\n' + failures + ' FAILED' : '\nAll chat-appointment-notice checks passed');
process.exit(failures ? 1 : 0);
