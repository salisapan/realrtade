// A payment to a new bank account, and the credential-harvest shapes, stay quiet BEFORE the task and payment readers of core/incoming-judge.js (switches
// TASK_ASK and PAYMENT_ASK). Found by the capability probe on 2026-11-14: with PAYMENT_ASK on, "our bank details have changed, please pay the invoice to the new
// account by Friday" was offered as the task "Pay ... to the new account", because the reader ran before the veto that the reply path already had. All mails
// are written for this file. Run: node test/payment-veto-corpus.cjs
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const FILES = ['domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'close-families.js', 'intent.js', 'actions.js', 'file-attach.js', 'fact-reply.js',
  'quiet-metrics.js', 'resolution.js', 'commitment-title.js', 'graph-mail.js', 'chat-payment-ask.js', 'day-words.js', 'incoming-judge.js', 'draft-reply.js'];
const NOW = new Date('2026-10-07T12:00:00+03:00').getTime();
const sb = { module: undefined, console: { log() {}, warn() {}, error() {}, info() {}, debug() {} }, TextEncoder, atob, btoa };
vm.createContext(sb);
vm.runInContext('(function (N) { var D = Date; function F() { var a = Array.prototype.slice.call(arguments); return a.length ? new (Function.prototype.bind.apply(D, [null].concat(a)))() : new D(N); } F.prototype = D.prototype; F.now = function () { return N; }; F.UTC = D.UTC; F.parse = D.parse; Date = F; })(' + NOW + ')', sb);
for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'core', f), 'utf8'), sb, { filename: f });
const J = vm.runInContext('FlowIncomingJudge', sb);
const I = vm.runInContext('FlowIntent', sb);
const DEPS = { intent: I, actions: vm.runInContext('FlowActions', sb), factReply: vm.runInContext('FlowFactReply', sb), fileAttach: vm.runInContext('FlowFileAttach', sb),
  resolution: vm.runInContext('FlowResolution', sb), quietMetrics: vm.runInContext('FlowQuietMetrics', sb) };
const OWN = 'ai.local.flow@gmail.com';
function judge(text, extra) {
  return J.judge(Object.assign({ text, subject: 'Invoice', sender: { name: 'Dana Levi', email: 'dana@acme.io' }, now: new Date(NOW), threadUrl: 'https://mail.google.com/x', hasThreadAttachment: false,
    attachmentCount: 0, surface: 'gmail', to: [OWN], cc: [], ownAddresses: [OWN], ownNames: ['Sali', 'Sali Sapan', 'סאלי'], userName: 'Sali', direction: 'inbound', inbound: true, namesWaitDone: true,
    taskAskOn: true, paymentAskOn: true }, extra || {}), DEPS);
}
const shown = (r) => (r.show ? r.process.id + ':' + r.process.steps.map((s) => s.kind).join('+') : 'SILENT(' + r.reason + ')');

console.log('\n--- a changed bank stays quiet, with the readers on ---\n');
const BANK_EN = 'Hi Sali, our bank details have changed. Please pay the ₪4,000 invoice to the new account by Friday.';
const BANK_HE = 'היי סאלי, פרטי החשבון שלנו השתנו. אנא העבר 4,000 ₪ לחשבון החדש עד יום שישי.';
check('EN: bank details changed + pay by Friday is silent with both readers on', !judge(BANK_EN).show, shown(judge(BANK_EN)));
check('HE: פרטי החשבון השתנו + העבר לחשבון החדש is silent with both readers on', !judge(BANK_HE).show, shown(judge(BANK_HE)));
check('EN: silent with only PAYMENT_ASK on', !judge(BANK_EN, { taskAskOn: false }).show);
check('EN: silent with only TASK_ASK on', !judge(BANK_EN, { paymentAskOn: false }).show);
check('the vetoed mail names a quiet, not a missing reader', judge(BANK_EN).reason === 'quiet:family', judge(BANK_EN).reason);
check('intent.phishingOrNegative reads the Hebrew bank change', I.phishingOrNegative(BANK_HE) === true);
check('intent.phishingOrNegative reads "bank details have changed" without "new account"', I.phishingOrNegative('Our bank details have changed, please wire the balance by Friday.') === true);

console.log('\n--- the ordinary payment ask still works ---\n');
const PAY_EN = 'Hi Sali, please transfer 500 NIS to my account by Sunday.';
const PAY_HE = 'היי סאלי, תעביר לי 500 שקל עד יום ראשון.';
const INV_EN = 'Hi Sali, please pay the ₪1,200 invoice by Friday.';
check('EN: transfer 500 NIS by Sunday is still the payment task', shown(judge(PAY_EN)) === 'log-it:googleTask', shown(judge(PAY_EN)));
check('HE: תעביר לי 500 שקל עד יום ראשון is still the payment task', shown(judge(PAY_HE)) === 'log-it:googleTask', shown(judge(PAY_HE)));
check('EN: a dated invoice with no new account is still the ask', shown(judge(INV_EN)) === 'log-it:googleTask', shown(judge(INV_EN)));
check('HE: a payment ask that does not mention a new account is not vetoed', I.phishingOrNegative(PAY_HE) === false);
check('EN: an own-sent mail is not touched by the veto', judge(BANK_EN, { senderIsUser: true }).reason !== 'quiet:family');

console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
