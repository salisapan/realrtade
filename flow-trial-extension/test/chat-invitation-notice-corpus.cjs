// core/chat-invitation-notice.js: an invitation sent to the person in a chat becomes a day and a clock to hold, never an RSVP.
// The lines are invented and were written after the rules, not tuned to them. Run: node test/chat-invitation-notice-corpus.cjs
const { FlowChatInvitationNotice: A } = require('../core/chat-invitation-notice.js');
const NOW = new Date(2026, 9, 23, 10, 0, 0); // Friday
let failures = 0;
function check(name, ok, detail) { if (ok) console.log('PASS: ' + name); else { failures++; console.log('FAIL: ' + name + (detail ? ' ' + JSON.stringify(detail) : '')); } }
const YES = [
  ["You're invited to my birthday on Saturday at 8pm", '2026-10-24', 20, 0],
  ['Join us for the opening on Thursday at 19:00', '2026-10-29', 19, 0],
  ["We'd love to invite you to our housewarming Sunday at 6:30pm", '2026-10-25', 18, 30],
  ['Save the date: the reunion is Monday at 18:00', '2026-10-26', 18, 0],
  ['מוזמן ליום ההולדת שלי ביום שישי ב-20:00', '2026-10-30', 20, 0],
  ['מזמינים אתכם לחתונה ביום חמישי בשעה 19:30', '2026-10-29', 19, 30],
  ['נשמח לראות אותך מחר ב-18:00', '2026-10-24', 18, 0],
  ['הצטרפו אלינו לערב פתיחה ביום רביעי ב-20:30', '2026-10-28', 20, 30]
];
for (const [text, day, h, m] of YES) { const r = A.recognize(text, NOW); check('invitation: ' + text, r.kind === 'invitation' && r.dateIso === day && r.hour === h && r.minute === m, r); }
const NO = [
  ["You're invited to my birthday on Saturday", 'no clock'],
  ["You're invited to my birthday at 8pm", 'no day'],
  ["Are you coming to my birthday on Saturday at 8pm? You're invited", 'question'],
  ['Join our webinar on Thursday at 19:00, register now', 'promotion'],
  ['Join us for the sale on Thursday at 19:00, 30% discount', 'promotion'],
  ['Thank you for the invitation to the party on Saturday at 8pm', 'thanks'],
  ["Unfortunately the party you're invited to on Saturday at 8pm is cancelled", 'cancelled'],
  ["You're invited to the party that was Saturday at 8pm last week", 'look back'],
  ["You're invited on 2025-01-02 at 8pm", 'past'],
  ['Maybe join us Saturday at 8pm', 'hedge'],
  ['מוזמן ליום ההולדת שלי', 'no day or clock'],
  ['מזמינים אתכם לוובינר ביום חמישי בשעה 19:00, הירשמו עכשיו', 'promotion'],
  ['תודה על ההזמנה לחתונה ביום חמישי בשעה 19:30', 'thanks'],
  ['האירוע בוטל, מזמינים אתכם ביום חמישי ב-19:00', 'cancelled'],
  ['', 'empty'],
  ['x'.repeat(400), 'long']
];
for (const [text, why] of NO) check('not an invitation (' + why + '): ' + text.slice(0, 50), A.recognize(text, NOW).kind === 'none', A.recognize(text, NOW));
check('no throw on junk', (() => { try { A.recognize(null, null); A.recognize(undefined, 'x'); return true; } catch (e) { return false; } })());
console.log(failures ? '\n' + failures + ' FAILED' : '\nAll chat-invitation-notice checks passed');
process.exit(failures ? 1 : 0);
