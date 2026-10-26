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
  // Hebrew booking verbs without a possessive, and service nouns (run 110)
  ['השולחן שלכם נשמר ליום שבת בשעה 20:00', '2026-10-24', 20, 0],
  ['הטיפול ברכב נקבע למחר בשעה 9:00', '2026-10-24', 9, 0],
  ['הבדיקה שלך נקבעה ליום רביעי בשעה 8:15', '2026-10-28', 8, 15],
  ['השולחן נשמר ליום חמישי בשעה 19:30', '2026-10-29', 19, 30],
  ['Your car service is scheduled for tomorrow at 9:00', '2026-10-24', 9, 0],
  ['Your haircut is booked for Thursday at 17:30', '2026-10-29', 17, 30],
  ['Your dental check-up is confirmed for Sunday at 8:30', '2026-10-25', 8, 30],
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
  ['הטיפול ברכב בוטל למחר בשעה 9:00', 'cancelled (Hebrew service)'],
  ['הטיפול נקבע ליום חמישי, אבל אולי אבטל', 'hedge'],
  ['Customer service is open until 17:00 on Thursday', 'opening hours, not a booking'],
  ['Your service is not scheduled yet, we will call you', 'not scheduled'],
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

// The cancellation reader: the day and clock of a booking that was cancelled, for removing the hold Glance made for it.
const GONE = [
  ['Your appointment on Sunday at 10:00 was cancelled', '2026-10-25', 10, 0],
  ['Unfortunately your appointment on Monday at 11:00 has been cancelled', '2026-10-26', 11, 0],
  ['Your table on Thursday at 8pm was cancelled', '2026-10-29', 20, 0],
  ['התור שלך ביום שני ב-11:00 בוטל', '2026-10-26', 11, 0],
  ['התור שלך ליום שלישי בשעה 09:30 בוטל, מצטערים', '2026-10-27', 9, 30]
];
for (const [text, day, h, m] of GONE) { const r = A.cancelled(text, NOW); check('cancelled: ' + text, r.kind === 'cancelled' && r.dateIso === day && r.hour === h && r.minute === m, r); }
const NOT_GONE = [
  ['Your appointment on Monday at 11:00 was cancelled. Click to rebook', 'a rebook link'],
  ['Your appointment on Monday at 11:00 has been moved to Tuesday at 9am', 'a move'],
  ['To cancel your appointment on Monday at 11:00 reply 1', 'an offer to cancel'],
  ['You can cancel your appointment on Monday at 11:00 for free', 'a policy line'],
  ['Was your appointment on Monday at 11:00 cancelled?', 'a question'],
  ['Your appointment was cancelled', 'no day or clock'],
  ['The meeting on Monday at 11:00 was cancelled', 'not a possessive booking'],
  ['Your appointment is confirmed for Monday at 11:00', 'a confirmation'],
  ['Your appointment on 2025-01-02 at 11:00 was cancelled', 'long past'],
  ['התור שלך נדחה ליום שלישי ב-09:00', 'a move']
];
for (const [text, why] of NOT_GONE) check('not a cancellation (' + why + '): ' + text.slice(0, 50), A.cancelled(text, NOW).kind === 'none', A.cancelled(text, NOW));

// The told length of an appointment (durationMinutes), read from words and clocks the person was given; null when nothing says so.
const LEN = [
  ['Your appointment is confirmed for Sunday from 10:00 to 11:30', 90],
  ['Your appointment on Sunday at 10:00-11:00 is confirmed', 60],
  ['Your appointment is confirmed for Sunday 2pm-3pm', 60],
  ['Your appointment is confirmed for Sunday at 10:00 for an hour and a half', 90],
  ['Your appointment is confirmed for Sunday at 10am for 45 minutes', 45],
  ['Your appointment is confirmed for Sunday at 10:00 for 2 hours', 120],
  ['Your appointment is confirmed for Sunday at 10:00 for an hour', 60],
  ['התור שלך נקבע ליום ראשון ב-10:00 למשך שעה', 60],
  ['התור שלך נקבע ליום ראשון ב-10:00 למשך שעה וחצי', 90],
  ['התור שלך נקבע ליום ראשון ב-10:00 למשך 45 דקות', 45],
  ['התור שלך נקבע ליום ראשון 10:00-11:00', 60]
];
for (const [text, n] of LEN) { const r = A.recognize(text, NOW); check('length ' + n + ': ' + text.slice(0, 60), r.kind === 'appointment' && r.durationMinutes === n, r); }
const NOLEN = [
  'Your appointment is confirmed for Sunday at 10:00',
  'Your appointment is confirmed for Sunday at 10:00, please arrive 10 minutes early',
  'Your appointment is confirmed for Sunday at 10:00, lunch 12:00-13:00',
  'Your appointment is confirmed for Sunday at 10:00 for 900 minutes',
  'התור שלך נקבע ליום ראשון ב-10:00, נא להגיע 10 דקות לפני'
];
for (const text of NOLEN) { const r = A.recognize(text, NOW); check('no told length: ' + text.slice(0, 60), r.kind === 'appointment' && r.durationMinutes === undefined, r); }
for (const [text, h, n] of [['Your appointment is confirmed for Sunday between 2 and 3pm', 14, 60], ['Your appointment is confirmed for Sunday between 14:00 and 15:30', 14, 90]]) { const r = A.recognize(text, NOW); check('between X and Y starts at X: ' + text.slice(0, 60), r.kind === 'appointment' && r.hour === h && r.durationMinutes === n, r); }
check('a range that starts at another clock is not its length', A.lengthOf('lunch 12:00-13:00', { hour: 10, minute: 0 }) === null);
check('the range start is the clock when the plain reader fails', (() => { const r = A.recognize('Your appointment is confirmed for Sunday from 10:00 to 11:30', NOW); return r.hour === 10 && r.minute === 0; })());

// A booking that repeats ("Your lesson is every Monday at 17:00"): the hold is the next one and the card marks it as repeating.
const MON_MORNING = new Date(2026, 9, 26, 10, 0, 0); // Monday 10:00
const MON_EVENING = new Date(2026, 9, 26, 18, 0, 0); // Monday 18:00
const REPEATS = [
  ['Your piano lesson is every Monday at 17:00', MON_MORNING, '2026-10-26'],
  ['Your piano lesson is every Monday at 17:00', MON_EVENING, '2026-11-02'],
  ['Hi, your weekly yoga class is every Tuesday at 18:30. See you!', MON_MORNING, '2026-10-27'],
  ['Your swimming lesson takes place every Thursday at 16:00', MON_MORNING, '2026-10-29'],
  ['השיעור שלך כל יום שני ב-17:00', MON_EVENING, '2026-11-02'],
  ['התור שלך כל יום ראשון ב-10:00', MON_MORNING, '2026-11-01']
];
for (const [text, now, day] of REPEATS) { const r = A.recognize(text, now); check('repeats: ' + text.slice(0, 50) + ' -> ' + day, r.kind === 'appointment' && r.repeats === true && r.dateIso === day, r); }
for (const text of ['The shop is open every Monday at 9:00', 'Our team meets every Monday at 10:30', 'Your lesson is every Monday', 'Your lesson was every Monday at 17:00 until it was cancelled', 'Does your lesson run every Monday at 17:00?']) { const r = A.recognize(text, MON_MORNING); check('not a repeating booking: ' + text.slice(0, 50), r.kind === 'none', r); }
check('a one-off booking is not marked as repeating', A.recognize('Your appointment is confirmed for Tuesday at 17:00', MON_MORNING).repeats === undefined);

// Plain reminders with no "confirmed": the possessive booking noun, "is", and a day or a clock ("Your appointment is tomorrow at 14:00").
const NOW2 = new Date(2026, 9, 26, 10, 0, 0); // Monday 10:00
const PLAIN = [
  ['Your appointment is tomorrow at 14:00', '2026-10-27', 14, 0],
  ['Your appointment is next Tuesday at 17:00', '2026-11-03', 17, 0],
  ['Your dentist appointment is in 3 days at 14:00', '2026-10-29', 14, 0],
  ['Your appointment is tomorrow at 9am', '2026-10-27', 9, 0],
  ['Your appointment at 17:00 on Tuesday, parking is available', '2026-10-27', 17, 0],
  ['Your table is tonight at 8pm', '2026-10-26', 20, 0],
  ['התור שלך מחר ב-14:00', '2026-10-27', 14, 0],
  ['התור שלך מחר בבוקר ב-9:00', '2026-10-27', 9, 0],
  ['התור שלך בעוד 3 ימים ב-14:00', '2026-10-29', 14, 0]
];
for (const [text, day, h, m] of PLAIN) { const r = A.recognize(text, NOW2); check('plain reminder: ' + text, r.kind === 'appointment' && r.dateIso === day && r.hour === h && r.minute === m, r); }
for (const text of ['Is your appointment tomorrow at 14:00?', 'Your last appointment was yesterday at 14:00', 'Your order is ready tomorrow at 14:00', 'Your invoice is due tomorrow at 14:00', 'The deadline for your appointment form is in 3 days at 14:00', 'Your appointment details are tomorrow at 14:00', 'Your appointment is tomorrow at 14:00 unless you cancel', 'Your flight is tomorrow at 14:00', 'Your meeting is tomorrow at 14:00']) check('not a booking: ' + text, A.recognize(text, NOW2).kind === 'none', A.recognize(text, NOW2));
console.log(failures ? '\n' + failures + ' FAILED' : '\nAll chat-appointment-notice checks passed');
process.exit(failures ? 1 : 0);
