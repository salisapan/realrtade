// core/chat-pickup-notice.js: a pickup with a last day, told to the person in a chat, becomes a day, never anything else.
// The lines are invented and were written after the rules, not tuned to them. Run: node test/chat-pickup-notice-corpus.cjs
const { FlowChatPickupNotice: A } = require('../core/chat-pickup-notice.js');
const NOW = new Date(2026, 9, 23, 10, 0, 0); // Friday
let failures = 0;
function check(name, ok, detail) { if (ok) console.log('PASS: ' + name); else { failures++; console.log('FAIL: ' + name + (detail ? ' ' + JSON.stringify(detail) : '')); } }
const YES = [
  ['Your package arrived at the locker, pick it up within 3 days', '2026-10-26'],
  ['החבילה שלך הגיעה ללוקר, יש לאסוף תוך 3 ימים', '2026-10-26'],
  ['Your order is ready for pickup within 5 days', '2026-10-28'],
  ['Your prescription is ready, we hold it until Thursday', '2026-10-29'],
  ['התרופה שלך מוכנה, נשמור אותה עד יום חמישי', '2026-10-29'],
  ['התעודה שלך מוכנה לאיסוף עד יום שישי', '2026-10-30'],
  ['הצילומים שלך מוכנים לאיסוף עד יום חמישי', '2026-10-29'],
  ['הרישיון שלך מוכן לאיסוף עד יום רביעי', '2026-10-28'],
  ['Your order is ready for pickup until Friday', '2026-10-30'],
  ['Hi, your parcel is waiting at the post office. Please collect it by Tuesday', '2026-10-27'],
  ['Your glasses are ready for collection, available until Thursday', '2026-10-29'],
  ['Your prescription is ready to be collected before Monday', '2026-10-26'],
  ['ההזמנה שלך מוכנה לאיסוף עד יום חמישי', '2026-10-29'],
  ['החבילה שלך ממתינה בדואר, לאיסוף עד יום שלישי', '2026-10-27'],
  ['שלום, הרכב שלך מוכן, אפשר לאסוף עד מחר', '2026-10-24'],
  ['המרשם שלכם מוכן לאיסוף עד יום ראשון', '2026-10-25'],
  ['Your order pickup has been extended to Thursday', '2026-10-29'],
  ['The pickup deadline for your order was moved to Thursday', '2026-10-29'],
  ['Your parcel collection was postponed until Friday', '2026-10-30'],
  ['מועד האיסוף של ההזמנה שלך הוארך עד יום חמישי', '2026-10-29'],
  ['מועד האיסוף של ההזמנה שלך נדחה ליום חמישי', '2026-10-29']
];
for (const [text, day] of YES) { const r = A.recognize(text, NOW); check('pickup: ' + text, r.kind === 'pickup' && r.dateIso === day, r); }
const NO = [
  ['Your parcel will be delivered within 3 days', 'a delivery arrives by itself'],
  ['Your parcel is at the post office, collect it within 2 business days', 'business days are not counted'],
  ['Your order is ready for pickup within 60 days', 'out of range'],
  ['Did you pick up your package within 3 days?', 'a question'],
  ['Your order delivery was moved to Thursday', 'a delivery, not a pickup'],
  ['Your order pickup was cancelled, moved to Thursday', 'cancelled'],
  ['Sorry, your order pickup has been extended to Thursday', 'sorry'],
  ['The pickup was moved to Thursday', 'not yours'],
  ['Your order is ready for pickup', 'no deadline'],
  ['Your package will arrive on Monday', 'delivery arrives'],
  ['Your order is out for delivery, expected by Tuesday', 'delivery'],
  ['Your order was picked up yesterday', 'look back'],
  ['Your order has been cancelled, pickup until Friday is no longer possible', 'cancelled'],
  ['Would you like to collect your order until Friday?', 'question'],
  ['The order is ready for pickup until Friday', 'not yours'],
  ['Your order is ready for pickup until 2025-01-02', 'past'],
  ['Click here to choose a pickup point by Tuesday for your order', 'offer'],
  ['החבילה שלך תגיע ביום שני', 'delivery'],
  ['ההזמנה שלך נאספה אתמול', 'look back'],
  ['ההזמנה מוכנה לאיסוף עד יום חמישי', 'not yours'],
  ['ההזמנה שלך מוכנה לאיסוף', 'no deadline'],
  ['', 'empty'],
  ['x'.repeat(400), 'long']
];
for (const [text, why] of NO) check('not a pickup (' + why + '): ' + text.slice(0, 50), A.recognize(text, NOW).kind === 'none', A.recognize(text, NOW));
check('no throw on junk', (() => { try { A.recognize(null, null); A.recognize(undefined, 'x'); return true; } catch (e) { return false; } })());
console.log(failures ? '\n' + failures + ' FAILED' : '\nAll chat-pickup-notice checks passed');
process.exit(failures ? 1 : 0);
