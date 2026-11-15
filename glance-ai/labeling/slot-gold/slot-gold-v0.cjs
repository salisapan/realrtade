'use strict';
// Slot gold v0 (2026-11-15): hand-written, held out. The kind sets ask "did Glance see the close"; this one asks "did it write the RIGHT thing": the day, the clock, the amount
// and the title a Do It would put on the calendar or the task list. A right family with a wrong day is the worst error a closer can make, because ProofOfClose proves that
// something was written, not that it was the right thing. The lab clock is Wednesday 2026-10-07 12:00 (+03:00), so Thursday = 2026-10-08, Friday = 10-09, Sunday = 10-11,
// Monday = 10-12, Tuesday = 10-13, "tomorrow" = 10-08. RULES: never train on it, never tune an engine rule against a row of it; a row that exposes a fixable shape moves to
// glance-ai/scoreboard/capabilities/probe-set.cjs (with the gold below as its check) and a fresh row is written here. v0 first reading (before any fix): 4 of 37 offered rows wrote a wrong slot (a day taken from «by end of day Monday» = today, a kickoff filed on the Monday the sender is abroad, an overdue Monday taken over «pay it by Friday», a generic commitment title; then the «out of office» side note vetoing a real meeting); those five rows moved (and then, after a second reading, three holds phrased as a question: «can we talk on Sunday at 10:30?», «how about Monday at 9am?», «בוא נקבע לשני בשעה 9:00») to slot-dev-v0.cjs and were replaced here. Every text is written for this file (no real mail).
// Row: [kind, lang, text, gold]. gold: { date: 'YYYY-MM-DD'|null, hour, minute, amount, currency, has: [substrings of the title, lowercase], from: {date,hour,minute} } (omitted = not checked)
module.exports = [
  // --- hold a meeting: the day and the clock
  ['hold', 'en', 'Hi Sali, are you free for a catch-up on Tuesday at 16:00?', { date: '2026-10-13', hour: 16, minute: 0 }],
  ['hold', 'en', 'Hi Sali, let us meet tomorrow at 3pm to go over the plan.', { date: '2026-10-08', hour: 15, minute: 0 }],
  ['hold', 'en', 'Hi Sali, could we catch up on Tuesday at 17:30 about the offer?', { date: '2026-10-13', hour: 17, minute: 30 }],
  ['hold', 'en', 'Hi Sali, what about Friday at 8:30 for the retro?', { date: '2026-10-09', hour: 8, minute: 30 }],
  ['hold', 'en', 'Hi Sali, I booked us a call for Friday at 11:15.', { date: '2026-10-09', hour: 11, minute: 15 }],
  ['hold', 'he', 'סאלי שלום, מתאים לך להיפגש מחר בשעה 16:00?', { date: '2026-10-08', hour: 16, minute: 0 }],
  ['hold', 'he', 'היי סאלי, נוכל להיפגש ביום ראשון ב-10:30 לדבר על החוזה?', { date: '2026-10-11', hour: 10, minute: 30 }],
  ['hold', 'he', 'היי סאלי, בוא ניפגש בחמישי ב-17:00 לסיכום.', { date: '2026-10-08', hour: 17, minute: 0 }],
  ['hold', 'he', 'קבעתי לנו שיחה ביום שישי ב-11:15.', { date: '2026-10-09', hour: 11, minute: 15 }],
  // --- move / cancel: the old slot and the new one
  ['move', 'en', "Hi Sali, let's push Thursday's call at 10:00 to Friday at 11:00.", { date: '2026-10-09', hour: 11, minute: 0, from: { date: '2026-10-08', hour: 10, minute: 0 } }],
  ['move', 'en', 'Hi Sali, the Monday sync at 14:00 is moved to Tuesday at 15:30.', { date: '2026-10-13', hour: 15, minute: 30, from: { date: '2026-10-12', hour: 14, minute: 0 } }],
  ['move', 'he', 'היי סאלי, הפגישה ביום חמישי ב-10:00 נדחתה ליום שישי ב-11:00.', { date: '2026-10-09', hour: 11, minute: 0, from: { date: '2026-10-08', hour: 10, minute: 0 } }],
  ['cancel', 'en', 'Hi Sali, the meeting on Friday at 13:00 is cancelled.', { date: '2026-10-09', hour: 13, minute: 0 }],
  ['cancel', 'he', 'היי סאלי, הפגישה ביום ראשון ב-09:00 בוטלה.', { date: '2026-10-11', hour: 9, minute: 0 }],
  // --- deadlines: the day, the work in the title
  ['task', 'en', 'Sali, please send me the updated budget by Thursday.', { date: '2026-10-08', has: ['budget'] }],
  ['task', 'en', 'Hi Sali, I need the signed NDA by Friday.', { date: '2026-10-09', has: ['nda'] }],
  ['task', 'en', 'Please upload the final slides by EOD Thursday.', { date: '2026-10-08', has: ['slides'] }],
  ['task', 'en', 'Reminder: renew the parking permit by Sunday.', { date: '2026-10-11', has: ['permit'] }],
  ['task', 'en', 'Hi Sali, please call me back tomorrow about the offer.', { date: '2026-10-08' }],
  ['task', 'he', 'סאלי, אני צריכה את התקציב המעודכן עד יום חמישי.', { date: '2026-10-08', has: ['תקציב'] }],
  ['task', 'he', 'נא להגיש את דוח ההוצאות עד יום שני.', { date: '2026-10-12', has: ['דוח'] }],
  ['task', 'he', 'תחזור אליי מחר בנוגע לחוזה.', { date: '2026-10-08' }],
  ['task', 'he', 'תזכורת: לחדש את אישור החניה עד יום ראשון.', { date: '2026-10-11', has: ['חניה'] }],
  // --- own commitments
  ['commit', 'en', 'Hi Sali, I will email you the revised quote on Wednesday of next week. Noa', { date: '2026-10-14' }],
  ['commit', 'en', 'Hi Sali, per our call you will forward the final deck by Friday.', { date: '2026-10-09', has: ['deck'] }],
  ['commit', 'he', 'שלום סאלי, אשלח לך את ההצעה המעודכנת עד יום שישי. נועה', { date: '2026-10-09' }],
  // --- money: the amount, the currency, the day
  ['pay', 'en', 'Hi Sali, please transfer 500 NIS to my account by Sunday.', { date: '2026-10-11', amount: 500, currency: 'NIS' }],
  ['pay', 'en', 'Hi Sali, kindly wire 2,300 NIS to my account by Monday.', { date: '2026-10-12', amount: 2300, currency: 'NIS' }],
  ['pay', 'en', 'Please pay the $1,200 invoice by Friday.', { date: '2026-10-09', amount: 1200, currency: 'USD' }],
  ['pay', 'en', 'Please settle the ₪780 balance by Thursday.', { date: '2026-10-08', amount: 780, currency: 'NIS' }],
  ['pay', 'he', 'היי סאלי, תעביר לי 500 שקל עד יום ראשון.', { date: '2026-10-11', amount: 500, currency: 'NIS' }],
  ['pay', 'he', 'שלום סאלי, אנא שלם לי 1,450 ש"ח עד יום שלישי.', { date: '2026-10-13', amount: 1450, currency: 'NIS' }],
  // --- bookings told to the person
  ['booking', 'en', 'Your appointment is confirmed for Sunday at 10:00 at the clinic.', { date: '2026-10-11', hour: 10, minute: 0 }],
  ['booking', 'en', 'Reminder: your dental check-up is on Monday at 08:45.', { date: '2026-10-12', hour: 8, minute: 45 }],
  ['booking', 'he', 'התור שלך נקבע ליום ראשון בשעה 10:00 במרפאה.', { date: '2026-10-11', hour: 10, minute: 0 }],
  ['booking', 'he', 'השולחן שלכם נשמר ליום שבת בשעה 20:00.', { date: '2026-10-10', hour: 20, minute: 0 }],
  // --- traps for the day: a day is named, but not as the close's day
  ['task', 'en', 'Hi Sali, as we discussed last Friday, please send me the updated numbers by Thursday.', { date: '2026-10-08' }],
  ['task', 'en', 'Hi Sali, I sent the quote on Monday. Please confirm you received it by Thursday.', { date: '2026-10-08' }],
  ['hold', 'en', 'Hi Sali, the planning session is on Monday at 13:00. I am away on vacation on Friday.', { date: '2026-10-12', hour: 13, minute: 0 }],
  ['pay', 'en', 'Hi Sali, the retainer of $900 was due on Tuesday. Please settle it by Sunday.', { date: '2026-10-11', amount: 900, currency: 'USD' }]
];
