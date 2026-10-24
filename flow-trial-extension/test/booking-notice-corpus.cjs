'use strict';
// Booking notices in mail (Outlook first): "Your appointment is confirmed for Sunday at 10:00" becomes a calendar hold and
// "Your order is ready for pickup until Friday" a task due that day, only when the host passes bookingNoticeOn
// (glanceSwitches.BOOKING_NOTICE, off). The lines are invented. Run: node test/booking-notice-corpus.cjs
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const ROOT = path.join(__dirname, '..');
const CORE = ['domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'close-families.js', 'fact-reply.js', 'file-attach.js', 'intent.js', 'actions.js', 'resolution.js', 'system-notice.js', 'day-words.js', 'chat-appointment-notice.js', 'chat-pickup-notice.js', 'chat-invitation-notice.js', 'incoming-judge.js'];
const box = { module: undefined, console };
vm.createContext(box);
for (const f of CORE) vm.runInContext(fs.readFileSync(path.join(ROOT, 'core', f), 'utf8'), box, { filename: f });
const J = vm.runInContext('FlowIncomingJudge', box);
const NOW = new Date(2026, 9, 23, 10, 0, 0); // Friday
const judge = (text, extra) => J.judge(Object.assign({ text, subject: 'Your booking', sender: { name: 'Studio Nofar', email: 'hello@nofar.example' }, now: NOW, surface: 'outlook', inbound: true, bookingNoticeOn: true }, extra || {}));

const APPT = [
  ['Hi Sali, your appointment is confirmed for Sunday at 10:00. See you then.', '2026-10-25', 10, 0],
  ['Reminder: your table is booked Thursday at 8pm', '2026-10-29', 20, 0],
  ['שלום, התור שלך נקבע ליום ראשון בשעה 10:00', '2026-10-25', 10, 0],
  ['תזכורת: ההזמנה שלך ביום חמישי ב-20:00', '2026-10-29', 20, 0]
];
for (const [text, day, h, m] of APPT) {
  const r = judge(text);
  const st = r.show && r.process.steps[0];
  check('appointment mail offers one calendar hold: ' + text.slice(0, 50), r.show && r.process.steps.length === 1 && st.kind === 'calendar' && st.params.dateIso === day && st.params.hour === h && st.params.minute === m && st.params.meeting === true && /^(Appointment|תור) · Studio Nofar$/.test(st.params.title), r);
}
const INVITE = [
  ["You're invited to our product launch on Thursday at 19:00", '2026-10-29', 19, 0],
  ['Join us for the opening on Sunday at 6:30pm', '2026-10-25', 18, 30],
  ['מוזמן לאירוע ההשקה שלנו ביום חמישי בשעה 19:00', '2026-10-29', 19, 0]
];
for (const [text, day, h, m] of INVITE) {
  const r = judge(text);
  const st = r.show && r.process.steps[0];
  check('invitation mail offers one calendar hold: ' + text.slice(0, 50), r.show && r.process.steps.length === 1 && st.kind === 'calendar' && st.params.dateIso === day && st.params.hour === h && st.params.minute === m && /^(Invitation|הזמנה) · Studio Nofar$/.test(st.params.title), r);
}
const PICK = [
  ['Hi, your order is ready for pickup until Friday', '2026-10-30'],
  ['ההזמנה שלך מוכנה לאיסוף עד יום חמישי', '2026-10-29']
];
for (const [text, day] of PICK) {
  const r = judge(text);
  const st = r.show && r.process.steps[0];
  check('pickup mail offers one task: ' + text, r.show && r.process.steps.length === 1 && st.kind === 'outlookTask' && st.params.dateIso === day && /^(Pick up the order|לאסוף הזמנה) · Studio Nofar$/.test(st.params.title), r);
}
check('the same pickup on Gmail keeps the Google task step', judge(PICK[0][0], { surface: 'gmail' }).process.steps[0].kind === 'googleTask');

// Off: nothing changes. Not for the person's own mail either.
for (const [text] of APPT.concat(PICK, INVITE)) {
  const off = judge(text, { bookingNoticeOn: false });
  check('switch off: no booking card: ' + text.slice(0, 40), !(off.show && off.intent && off.intent.bookingNotice), off && off.reason);
}
check('the person\'s own mail is never a booking notice', !(judge(APPT[0][0], { senderIsUser: true }).intent || {}).bookingNotice);
check('a mail that is not inbound is never a booking notice', !(judge(APPT[0][0], { inbound: false }).intent || {}).bookingNotice);

// Quiet: cancellations, offers, deliveries, no clock, no deadline.
const QUIET = [
  'Join our webinar on Thursday at 19:00, register now', 'Thank you for the invitation to the party on Saturday at 8pm', "You're invited to the launch on Thursday",
  'Your appointment has been cancelled, it was Sunday at 10:00', 'Available slots: Sunday at 10:00 or Monday at 11:00. Click to choose',
  'Your appointment is confirmed for Sunday', 'Your package will arrive on Monday', 'Your order is ready for pickup',
  'Your order was picked up yesterday', 'התור שלך בוטל, היה ביום ראשון ב-10:00', 'החבילה שלך תגיע ביום שני'
];
for (const text of QUIET) check('no booking card for: ' + text.slice(0, 50), !(judge(text).intent || {}).bookingNotice, judge(text).reason);

// A real mail is long: greeting, the line that matters, directions, signature. The readers see sentences, not the whole body.
const LONG = [
  ['Hi Sali,\n\nHope you are well. Quick note from the studio: your appointment is confirmed for Sunday at 10:00 at our Tel Aviv branch, please arrive ten minutes early and bring your ID card with you. If anything changes we will let you know.\n\nBest regards,\nStudio Nofar\nwww.nofar.example | 03-1234567 | Rothschild 1, Tel Aviv', 'calendar', '2026-10-25'],
  ['שלום סלי,\n\nמקווים שהכול טוב. רצינו לעדכן שהתור שלך נקבע ליום ראשון בשעה 10:00 בסניף תל אביב, נא להגיע עשר דקות לפני ולהביא תעודת זהות. אם יהיה שינוי נעדכן אותך.\n\nבברכה,\nסטודיו נופר\nwww.nofar.example | 03-1234567', 'calendar', '2026-10-25'],
  ['Dear customer,\n\nThank you for shopping with us. Your order is ready for pickup until Friday at our store on Dizengoff 10, open Sunday to Thursday 9:00-18:00. Please bring the order number from your confirmation message.\n\nKind regards,\nThe Shop Team\nUnsubscribe anytime', 'googleTask', '2026-10-30']
];
for (const [text, kind, day] of LONG) {
  const r = judge(text);
  const st = r.show && r.process.steps[0];
  check('a long mail still finds its one line: ' + text.slice(0, 40).replace(/\n/g, ' '), r.show && r.process.bookingNotice === true && st.params.dateIso === day && (kind === 'calendar' ? st.kind === 'calendar' : st.kind === 'outlookTask'), r);
}
const LONG_QUIET = [
  'Hi,\n\nWe are sorry to tell you that your appointment has been cancelled. It was on Sunday at 10:00. You can book a new one on our site.\n\nRegards,\nStudio',
  'Hello,\n\nHere is our weekly newsletter. This Sunday at 10:00 we open the new studio, join our webinar on Thursday at 19:00, register now. Thank you for reading and have a lovely week.\n\nUnsubscribe'
];
for (const text of LONG_QUIET) check('a long mail with no booking stays quiet: ' + text.slice(0, 40).replace(/\n/g, ' '), !(judge(text).intent || {}).bookingNotice, judge(text).reason);

// Wiring.
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const js = manifest.content_scripts[0].js;
check('manifest loads both readers before the judge', ['core/chat-appointment-notice.js', 'core/chat-pickup-notice.js', 'core/chat-invitation-notice.js'].every((f) => js.indexOf(f) > -1 && js.indexOf(f) < js.indexOf('core/incoming-judge.js')));
const ol = fs.readFileSync(path.join(ROOT, 'src', 'content-outlook.js'), 'utf8');
check('Outlook reads glanceSwitches.BOOKING_NOTICE and passes bookingNoticeOn', /BOOKING_NOTICE === true/.test(ol) && /bookingNoticeOn: bookingNoticeSwitch === true/.test(ol));
const gm = fs.readFileSync(path.join(ROOT, 'src', 'content-gmail.js'), 'utf8');
check('Gmail asks the same readers through the judge helpers behind both switches', /FlowIncomingJudge\.bookingNotice/.test(gm) && /FlowIncomingJudge\.paymentAsk/.test(gm) && /BOOKING_NOTICE === true/.test(gm) && /PAYMENT_ASK === true/.test(gm) && /intent\.plannedProcess/.test(gm));
console.log(failures ? '\n' + failures + ' FAILED' : '\nAll booking-notice checks passed');
process.exit(failures ? 1 : 0);
