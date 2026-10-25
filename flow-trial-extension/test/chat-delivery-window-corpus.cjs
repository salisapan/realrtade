// core/chat-delivery-window.js: a delivery with a day and a window, told to the person in a chat or a mail, becomes a day, a first
// clock and (for a window) a last clock, and never anything else. The lines are invented and were written after the rules, not tuned to them.
// Run: node test/chat-delivery-window-corpus.cjs
const { FlowChatDeliveryWindow: A } = require('../core/chat-delivery-window.js');
const NOW = new Date(2026, 9, 25, 10, 0, 0); // Sunday
let failures = 0;
function check(name, ok, detail) { if (ok) console.log('PASS: ' + name); else { failures++; console.log('FAIL: ' + name + (detail ? ' ' + JSON.stringify(detail) : '')); } }
const YES = [
  ['Your package will be delivered tomorrow between 14:00 and 18:00', '2026-10-26', 14, 0, 18, 0],
  ['The courier will arrive Monday 10:00-12:00', '2026-10-26', 10, 0, 12, 0],
  ['Your order arrives tomorrow between 2pm and 6pm', '2026-10-26', 14, 0, 18, 0],
  ['Your parcel is scheduled to arrive Tuesday between 2 and 6pm', '2026-10-27', 14, 0, 18, 0],
  ['Your order arrives tomorrow between 11am and 1pm', '2026-10-26', 11, 0, 13, 0],
  ['Your order will arrive tomorrow at 15:30', '2026-10-26', 15, 30, null, null],
  ['Your package will be delivered on Thursday between 14:00 and 18:00', '2026-10-29', 14, 0, 18, 0],
  ['Your package will be delivered tomorrow between 14:00 and 18:00. Track it here', '2026-10-26', 14, 0, 18, 0],
  ['השליח יגיע מחר בין 14:00 ל-18:00', '2026-10-26', 14, 0, 18, 0],
  ['המשלוח שלך יגיע ביום שני בין השעות 10:00-12:00', '2026-10-26', 10, 0, 12, 0],
  ['החבילה שלך תגיע מחר בין 10 ל-12', '2026-10-26', 10, 0, 12, 0],
  ['ההזמנה שלך תגיע ביום שלישי בשעה 16:30', '2026-10-27', 16, 30, null, null]
];
for (const [text, day, h, m, eh, em] of YES) { const r = A.recognize(text, NOW); check('delivery: ' + text, r.kind === 'delivery' && r.dateIso === day && r.hour === h && r.minute === m && r.endHour === eh && r.endMinute === em, r); }
const NO = [
  ['Your package was delivered tomorrow between 14:00 and 18:00', 'a look back'],
  ['Your package was delivered yesterday at 14:00', 'delivered'],
  ['Your order is ready for pickup tomorrow between 14:00 and 18:00', 'a pickup'],
  ['Your package will arrive tomorrow', 'no clock'],
  ['Your package arrives between 14:00 and 18:00', 'no day'],
  ['The courier will arrive tomorrow between 4 and 6', 'an hour too ambiguous to hold'],
  ['Unfortunately your delivery tomorrow between 14:00 and 18:00 failed', 'failed'],
  ['Your delivery tomorrow between 14:00 and 18:00 was cancelled', 'cancelled'],
  ['Your delivery has been delayed, it will arrive tomorrow between 14:00 and 18:00', 'a delay'],
  ['Will your package arrive tomorrow between 14:00 and 18:00?', 'a question'],
  ['Get 20% off, delivery tomorrow between 14:00 and 18:00 - coupon inside', 'a promotion'],
  ['The lecture will be delivered tomorrow between 14:00 and 18:00', 'not a package'],
  ['Your package will arrive on 2025-01-02 between 14:00 and 18:00', 'long past'],
  ['הזמנתך נמסרה אתמול בין 14:00 ל-18:00', 'delivered'],
  ['השליח יגיע מחר', 'no clock'],
  ['המשלוח שלך בוטל, היה אמור להגיע מחר בין 14:00 ל-18:00', 'cancelled'],
  ['ההזמנה שלך מוכנה לאיסוף מחר בין 14:00 ל-18:00', 'a pickup'],
  ['', 'empty']
];
for (const [text, why] of NO) check('not a delivery (' + why + '): ' + text.slice(0, 50), A.recognize(text, NOW).kind === 'none', A.recognize(text, NOW));
check('a window already over today is not held', A.recognize('Your package will arrive today between 08:00 and 09:00', NOW).kind === 'none');
check('a window still open today is held', A.recognize('Your package will arrive today between 08:00 and 18:00', NOW).kind === 'delivery');
check('no throw on junk', (() => { try { A.recognize(null, null); A.recognize(undefined, 'x'); return true; } catch (e) { return false; } })());
console.log(failures ? '\n' + failures + ' FAILED' : '\nAll chat-delivery-window checks passed');
process.exit(failures ? 1 : 0);
