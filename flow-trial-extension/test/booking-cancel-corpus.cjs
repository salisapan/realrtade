// Mail-side removal of a cancelled booking: the cancellation text read by the shared readers lands on the same day and clock as the
// hold the confirmation wrote, from the same sender, and nothing else. Pure; the Outlook card does the removal (e2e/outlook-booking-cancel.spec.js).
// Run: node test/booking-cancel-corpus.cjs
const { FlowChatAppointmentNotice: A } = require('../core/chat-appointment-notice.js');
const { FlowChatTravelNotice: T } = require('../core/chat-travel-notice.js');
const H = require('../core/held-hold.js');
const NOW = new Date(2026, 9, 23, 10, 0, 0); // Friday
let failures = 0;
function check(name, ok, detail) { if (ok) console.log('PASS: ' + name); else { failures++; console.log('FAIL: ' + name + (detail ? ' ' + JSON.stringify(detail) : '')); } }

function holdRow(text, sender) {
  const a = A.recognize(text, NOW);
  return { kind: 'written', messageId: 'o1', sender: { email: sender }, ref: { eventId: 'ev1' }, connectorId: 'outlookCalendar', intent: { personalClose: 'booking-notice', entities: { dateIso: a.dateIso, hour: a.hour, minute: a.minute } } };
}
const SENDER = 'studio@nofar.example';
const row = holdRow('Hi, your appointment is confirmed for Sunday at 10:00. See you then.', SENDER);
check('the hold row has a key', H.keyOf(row.intent) === '2026-10-25 10:00', H.keyOf(row.intent));

const YES = [
  'Hi, unfortunately your appointment on Sunday at 10:00 was cancelled.',
  'Your appointment on Sunday at 10:00 has been cancelled. We apologise.',
  'Hello, your appointment has been cancelled, it was Sunday at 10:00',
  'שלום, התור שלך ביום ראשון ב-10:00 בוטל'
];
for (const t of YES) {
  const g = A.cancelled(t, NOW);
  const f = g.kind === 'cancelled' ? H.find([row], SENDER, H.holdAt(g), []) : null;
  check('removes the hold: ' + t.slice(0, 55), !!f, g);
  check('another sender keeps it: ' + t.slice(0, 40), g.kind !== 'cancelled' || H.find([row], 'other@shop.example', H.holdAt(g), []) === null);
  check('already removed keeps it quiet: ' + t.slice(0, 40), g.kind !== 'cancelled' || H.find([{ kind: 'undone', messageId: 'o1' }, row], SENDER, H.holdAt(g), []) === null);
}
const OTHER = [
  'Hi, your appointment on Sunday at 11:00 was cancelled.',
  'Hi, your appointment on Monday at 10:00 was cancelled.'
];
for (const t of OTHER) {
  const g = A.cancelled(t, NOW);
  check('another clock or day finds no hold: ' + t.slice(0, 50), g.kind === 'cancelled' && H.find([row], SENDER, H.holdAt(g), []) === null, g);
}
const NOT = [
  'Your appointment on Sunday at 10:00 was moved to Monday at 11:00.',
  'If you need to cancel your appointment on Sunday at 10:00, reply to this mail.',
  'Our cancellation policy: an appointment on Sunday at 10:00 cancelled late is charged.',
  'Was your appointment on Sunday at 10:00 cancelled?',
  'Hi, your appointment is confirmed for Sunday at 10:00.'
];
for (const t of NOT) check('not a cancellation: ' + t.slice(0, 55), A.cancelled(t, NOW).kind === 'none', A.cancelled(t, NOW));
check('a trip cancellation reads too', T.cancelled('Your flight on Sunday at 10:00 was cancelled', NOW).kind === 'cancelled', T.cancelled('Your flight on Sunday at 10:00 was cancelled', NOW));
// A Gmail hold row (connector 'calendar', keyed by holdAt and holdSender) is found the same way; the Gmail card writes its own undone row.
const gmailRow = { kind: 'written', messageId: 'g1', holdSender: 'Studio@Nofar.example', holdAt: '2026-10-25 10:00', ref: { eventId: 'ge1' }, connectorId: 'calendar' };
const gg = A.cancelled('Hi, unfortunately your appointment on Sunday at 10:00 was cancelled.', NOW);
check('gmail hold row found by holdAt and sender', !!H.find([gmailRow], SENDER, H.holdAt(gg), []));
check('gmail hold row once removed is not offered again', H.find([{ kind: 'undone', messageId: 'g1' }, gmailRow], SENDER, H.holdAt(gg), []) === null);
console.log('TOTAL FAILURES: ' + failures);
process.exit(failures ? 1 : 0);
