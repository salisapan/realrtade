// core/day-words.js: Hebrew weekday abbreviations (יום ה׳), the maqaf (ב־20:00), dotted dates (עד 28.10) and relative spans
// (בעוד יומיים, "in 3 days") are rewritten so the readers find their one day, and prices, versions and decimals are not
// taken for dates. The lines are invented and were written after the rules, not tuned to them. Run: node test/day-words-corpus.cjs
const { FlowDayWords: D } = require('../core/day-words.js');
const M = {
  appt: require('../core/chat-appointment-notice.js').FlowChatAppointmentNotice,
  inv: require('../core/chat-invitation-notice.js').FlowChatInvitationNotice,
  pay: require('../core/chat-payment-ask.js').FlowChatPaymentAsk,
  dl: require('../core/chat-deadline-ask.js').FlowChatDeadlineAsk,
  rem: require('../core/chat-reminder.js').FlowChatReminder,
  cb: require('../core/chat-callback-ask.js').FlowChatCallbackAsk,
  pick: require('../core/chat-pickup-notice.js').FlowChatPickupNotice,
  note: require('../core/chat-self-note.js').FlowChatSelfNote
};
const NOW = new Date(2026, 9, 23, 10, 0, 0); // Friday
let failures = 0;
function check(name, ok, detail) { if (ok) console.log('PASS: ' + name); else { failures++; console.log('FAIL: ' + name + (detail ? ' ' + JSON.stringify(detail) : '')); } }

// The rewriter itself.
const REW = [
  ['ביום ה׳ בשעה 10:00', 'ביום חמישי בשעה 10:00'], ['ליום א׳', 'ליום ראשון'], ["ביום ו' ב-20:00", 'ביום שישי ב-20:00'],
  ['ב־10:00', 'ב-10:00'], ['עד 28.10', 'עד 2026-10-28'], ['ב-5.11 בשעה 19:30', 'ב-2026-11-05 בשעה 19:30'], ['by 28.10', 'by 2026-10-28'], ['עד 1.3', 'עד 2027-03-01'], ['on 15.10.27', 'on 2027-10-15'],
  ['בעוד יומיים', '2026-10-25'], ['בעוד שלושה ימים', '2026-10-26'], ['בעוד 5 ימים', '2026-10-28'], ['בעוד שבוע', '2026-10-30'],
  ['in 3 days', '2026-10-26'], ['in two days', '2026-10-25'], ['in a week', '2026-10-30']
];
for (const [from, to] of REW) check('rewrites ' + from, D.normalize(from, NOW) === to, D.normalize(from, NOW));
const KEEP = ['12.50 ש"ח', 'גרסה 2.10 של התוכנה', 'המחיר 3.5 דולר', 'version 2.10.1', 'עד 45.13', 'עד 31.2', 'בעוד כמה ימים', 'in several days', ''];
for (const t of KEEP) check('leaves alone: ' + t, D.normalize(t, NOW) === t, D.normalize(t, NOW));
check('no throw on junk', (() => { try { D.normalize(null, null); D.normalize(undefined, 'x'); return true; } catch (e) { return false; } })());

// Through the readers.
const YES = [
  ['appt', 'התור שלך נקבע ליום א׳ בשעה 10:00', '2026-10-25'],
  ['appt', 'התור שלך נקבע ליום ראשון ב־10:00', '2026-10-25'],
  ['appt', 'התור שלך נקבע ל-28.10 בשעה 10:00', '2026-10-28'],
  ['inv', 'מוזמן ליום ההולדת שלי ביום ו׳ ב־20:00', '2026-10-30'],
  ['inv', 'מוזמנים לחתונה ב-5.11 בשעה 19:30', '2026-11-05'],
  ['pay', 'תעביר לי 500 ש״ח עד 28.10', '2026-10-28'],
  ['pay', 'Please pay 500 NIS by 28.10', '2026-10-28'],
  ['dl', 'תחתום על החוזה עד יום ה׳', '2026-10-29'],
  ['dl', 'Sign the lease by 28.10', '2026-10-28'],
  ['rem', 'אל תשכח להביא את הטופס ביום ב׳', '2026-10-26'],
  ['rem', 'אל תשכח להביא את הטופס בעוד יומיים', '2026-10-25'],
  ['rem', 'Remember to call the bank in 3 days', '2026-10-26'],
  ['cb', 'תתקשר אליי ביום ג׳', '2026-10-27'],
  ['pick', 'ההזמנה שלך מוכנה לאיסוף עד יום ה׳', '2026-10-29'],
  ['note', 'לעצמי: לחדש דרכון עד 29.10', '2026-10-29']
];
for (const [k, t, day] of YES) {
  const r = M[k].recognize(t, NOW);
  check(k + ' finds its day: ' + t, r.dateIso === day, r);
}
// A price, a version or a decimal must not become a day.
const NO = [
  ['pay', 'Please pay 12.50 NIS'], ['pay', 'תעביר לי 12.50 ש"ח'], ['dl', 'Sign the document version 2.10'], ['rem', 'Remember to update to version 2.10'],
  ['cb', 'תתקשר אליי כשיש לך 2.5 דקות'], ['pick', 'ההזמנה שלך מוכנה לאיסוף, המחיר 3.50']
];
for (const [k, t] of NO) check(k + ' takes no day from a decimal: ' + t, M[k].recognize(t, NOW).kind === 'none', M[k].recognize(t, NOW));
console.log(failures ? '\n' + failures + ' FAILED' : '\nAll day-words checks passed');
process.exit(failures ? 1 : 0);
