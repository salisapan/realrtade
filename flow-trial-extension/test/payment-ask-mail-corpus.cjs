'use strict';
// Payment asks in mail (Outlook first): "Please transfer 500 NIS to my account by Sunday" becomes a task "Pay 500 NIS" due that day,
// only when the host passes paymentAskOn (glanceSwitches.PAYMENT_ASK, off). Glance pays nothing. The lines are invented.
// Run: node test/payment-ask-mail-corpus.cjs
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const ROOT = path.join(__dirname, '..');
const CORE = ['domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'close-families.js', 'fact-reply.js', 'file-attach.js', 'intent.js', 'actions.js', 'resolution.js', 'system-notice.js', 'chat-payment-ask.js', 'incoming-judge.js'];
const box = { module: undefined, console };
vm.createContext(box);
for (const f of CORE) vm.runInContext(fs.readFileSync(path.join(ROOT, 'core', f), 'utf8'), box, { filename: f });
const J = vm.runInContext('FlowIncomingJudge', box);
const NOW = new Date(2026, 9, 23, 10, 0, 0); // Friday
const judge = (text, extra) => J.judge(Object.assign({ text, subject: 'Payment', sender: { name: 'Dana Levi', email: 'dana@example.com' }, now: NOW, surface: 'outlook', inbound: true, paymentAskOn: true }, extra || {}));

const YES = [
  ['Hi Sali, please transfer 500 NIS to my account by Sunday. Thanks!', '2026-10-25', /^Pay 500 NIS · Dana Levi$/],
  ['Can you pay the 1,200 ₪ invoice before Thursday?', '2026-10-29', /^Pay 1200 NIS · Dana Levi$/],
  ['שלום, תעביר לי 500 שקל עד יום ראשון', '2026-10-25', /^לשלם 500 NIS · Dana Levi$/],
  ['אפשר שתעביר 1,500 ₪ ביום חמישי?', '2026-10-29', /^לשלם 1500 NIS · Dana Levi$/]
];
for (const [text, day, titleRe] of YES) {
  const r = judge(text);
  const st = r.show && r.process.steps[0];
  check('payment mail offers one task: ' + text.slice(0, 50), r.show && r.process.steps.length === 1 && st.kind === 'outlookTask' && st.params.dateIso === day && titleRe.test(st.params.title), r);
}
check('the same ask on Gmail keeps the Google task step', judge(YES[0][0], { surface: 'gmail' }).process.steps[0].kind === 'googleTask');
for (const [text] of YES) check('switch off: no payment card: ' + text.slice(0, 40), !(judge(text, { paymentAskOn: false }).intent || {}).paymentAsk);
check("the person's own mail is never a payment ask", !(judge(YES[0][0], { senderIsUser: true }).intent || {}).paymentAsk);
check('a mail that is not inbound is never a payment ask', !(judge(YES[0][0], { inbound: false }).intent || {}).paymentAsk);
const QUIET = [
  'Please transfer the money by Sunday', 'Please transfer 500 NIS', "I'll transfer 500 NIS by Sunday", 'I already paid 500 NIS on Sunday',
  'Maybe pay 500 NIS by Sunday', "Don't pay 500 NIS before Sunday", 'The price is 500 NIS by Sunday', 'Please pay 500 NIS or 600 NIS by Sunday',
  'העברתי לך 500 שקל אתמול', 'תעביר לי את הכסף עד יום ראשון'
];
for (const text of QUIET) check('no payment card for: ' + text.slice(0, 50), !(judge(text).intent || {}).paymentAsk, judge(text).reason);
const LONGPAY = 'Hi Sali,\n\nThanks again for the great work last month. Just a small admin note: please transfer 500 NIS to my account by Sunday so I can close the books, the details are the same as on the previous invoice.\n\nThank you!\nDana Levi\nFreelance designer | 054-1234567 | dana@example.com';
{ const r = judge(LONGPAY); check('a long mail still finds its one payment line', r.show && r.process.paymentAsk === true && r.process.steps[0].params.dateIso === '2026-10-25' && /^Pay 500 NIS/.test(r.process.steps[0].params.title), r); }
check('a long mail that only mentions money stays quiet', !(judge('Hi,\n\nThe workshop costs 500 NIS and takes place on Sunday. Seats are limited so please register early.\n\nBest,\nDana').intent || {}).paymentAsk);
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const js = manifest.content_scripts[0].js;
check('manifest loads the payment reader before the judge', js.indexOf('core/chat-payment-ask.js') > -1 && js.indexOf('core/chat-payment-ask.js') < js.indexOf('core/incoming-judge.js'));
const ol = fs.readFileSync(path.join(ROOT, 'src', 'content-outlook.js'), 'utf8');
check('Outlook reads glanceSwitches.PAYMENT_ASK and passes paymentAskOn', /PAYMENT_ASK === true/.test(ol) && /paymentAskOn: paymentAskSwitch === true/.test(ol));
console.log(failures ? '\n' + failures + ' FAILED' : '\nAll payment-ask-mail checks passed');
process.exit(failures ? 1 : 0);
