// The chat fallback readers (reminder, deadline, callback, payment, appointment, pickup, invitation, self note) must stay silent on
// ordinary chat. These lines are everyday messages that contain a day, a clock, a number or a request word but are none of
// the seven things. Written after the rules, not tuned to them. Run: node test/chat-fallbacks-silence-corpus.cjs
const R = {
  reminder: require('../core/chat-reminder.js').FlowChatReminder,
  deadline: require('../core/chat-deadline-ask.js').FlowChatDeadlineAsk,
  callback: require('../core/chat-callback-ask.js').FlowChatCallbackAsk,
  payment: require('../core/chat-payment-ask.js').FlowChatPaymentAsk,
  appointment: require('../core/chat-appointment-notice.js').FlowChatAppointmentNotice,
  pickup: require('../core/chat-pickup-notice.js').FlowChatPickupNotice,
  invitation: require('../core/chat-invitation-notice.js').FlowChatInvitationNotice,
  selfNote: require('../core/chat-self-note.js').FlowChatSelfNote
};
const NOW = new Date(2026, 9, 23, 10, 0, 0);
let failures = 0;
function check(name, ok, detail) { if (ok) console.log('PASS: ' + name); else { failures++; console.log('FAIL: ' + name + (detail ? ' ' + JSON.stringify(detail) : '')); } }
const CHATTER = [
  'Thanks, see you on Thursday', 'Good morning! How was your weekend?', 'I was at the gym until 9pm on Monday',
  'The meeting on Tuesday was great', 'Haha that is so funny', 'Did you see the match last Saturday?',
  'It costs 500 NIS at the store', 'I paid 300 NIS yesterday for the tickets', 'The train leaves at 18:15 on Friday',
  'What time is dinner on Sunday?', 'Happy birthday! Have a great day', 'I will be late tomorrow, sorry',
  'We talked about it on Monday', 'My flight lands Thursday at 7pm', 'Call you later', 'The doctor said rest until Wednesday',
  'I need a coffee', 'We need to talk', 'My package arrived on Monday', 'The order was great, thanks',
  'Remember when we went to Eilat?', 'He said he will call me back tomorrow', 'Pay attention to the road',
  'The class is on Tuesday at 6pm', 'Rent is 4,000 NIS a month', 'Send my regards to your mom',
  'תודה, נתראה ביום חמישי', 'בוקר טוב, מה שלומך?', 'הייתי בחדר כושר עד 21:00 ביום שני', 'הפגישה אתמול הייתה מצוינת',
  'זה עולה 500 שקל בחנות', 'שילמתי 300 ש"ח אתמול על הכרטיסים', 'הרכבת יוצאת ב-18:15 ביום שישי', 'מה השעה של ארוחת הערב ביום ראשון?',
  'מזל טוב ליום ההולדת!', 'אאחר מחר, סליחה', 'דיברנו על זה ביום שני', 'הטיסה שלי נוחתת ביום חמישי ב-19:00',
  'אני צריך קפה', 'צריך לדבר', 'החבילה הגיעה ביום שני', 'זוכר כשנסענו לאילת?', 'הוא אמר שיתקשר מחר',
  'השכירות היא 4,000 שקל בחודש', 'תמסורד"ש לאמא שלך', 'נתראה ביום ה׳', 'הייתי בקורס ביום ג׳ ב־18:00', 'היא נולדה ב-5.11 לפני שנתיים', 'המחיר 12.50 ש"ח בלבד', 'I will be in Haifa in 3 days', 'עדכון גרסה 2.10 בעוד שבוע'
];
for (const text of CHATTER) {
  for (const [name, mod] of Object.entries(R)) {
    const r = mod.recognize(text, NOW);
    check(name + ' stays silent on: ' + text, r.kind === 'none', r);
  }
}
console.log(failures ? '\n' + failures + ' FAILED' : '\nAll chat-fallbacks-silence checks passed');
process.exit(failures ? 1 : 0);
