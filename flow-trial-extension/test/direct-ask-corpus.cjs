// The direct-ask second read (core/incoming-judge.js, off unless the host passes directAskOn) and the Google Calendar notice quiet.
// Shapes found on the owner's real mailbox on 2026-11-12. No third party's text is here: the mails are written for this file, except the
// bare-imperative sentence, which is one of the owner's own Gate test sentences.
// Run: node test/direct-ask-corpus.cjs
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const FILES = ['domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'close-families.js', 'intent.js', 'actions.js', 'file-attach.js', 'fact-reply.js',
  'quiet-metrics.js', 'resolution.js', 'commitment-title.js', 'graph-mail.js', 'incoming-judge.js', 'draft-reply.js'];
const NOW = new Date('2026-10-07T12:00:00+03:00').getTime();
const sb = { module: undefined, console: { log() {}, warn() {}, error() {}, info() {}, debug() {} }, TextEncoder, atob, btoa };
vm.createContext(sb);
vm.runInContext('(function (N) { var D = Date; function F() { var a = Array.prototype.slice.call(arguments); return a.length ? new (Function.prototype.bind.apply(D, [null].concat(a)))() : new D(N); } F.prototype = D.prototype; F.now = function () { return N; }; F.UTC = D.UTC; F.parse = D.parse; Date = F; })(' + NOW + ')', sb);
for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'core', f), 'utf8'), sb, { filename: f });
const J = vm.runInContext('FlowIncomingJudge', sb);
const X = vm.runInContext('FlowExtract', sb);
const DEPS = { intent: vm.runInContext('FlowIntent', sb), actions: vm.runInContext('FlowActions', sb), factReply: vm.runInContext('FlowFactReply', sb), fileAttach: vm.runInContext('FlowFileAttach', sb),
  resolution: vm.runInContext('FlowResolution', sb), quietMetrics: vm.runInContext('FlowQuietMetrics', sb) };
const OWN = 'ai.local.flow@gmail.com';
function judge(text, extra) {
  return J.judge(Object.assign({ text, subject: 'Quote', sender: { name: 'Dana Levi', email: 'dana@acme.io' }, now: new Date(NOW), threadUrl: 'https://mail.google.com/x', hasThreadAttachment: false,
    attachmentCount: 0, surface: 'gmail', to: [OWN], cc: [], ownAddresses: [OWN], ownNames: ['Sali', 'Sali Sapan', 'סאלי'], userName: 'Sali', direction: 'inbound', inbound: true, namesWaitDone: true, directAskOn: true }, extra || {}), DEPS);
}
const kinds = (r) => (r.show ? r.process.steps.map((s) => s.kind).join('+') : 'SILENT(' + r.reason + ')');
const QUOTE_HE = 'סאלי היי,\n\nשאלה לגבי ההצעה:\n\n  1. מה ההבדלים בין ענן מאובטח למחשב העובד ?\n  2. האם תהיה התקנה בכל מחשב ?\n  3. ומה המחיר של שרת מקומי?\n\nתודה,\nדנה';
const QUOTE_EN = 'Hi Sali,\n\nTwo questions about the proposal:\n1. What is the difference between the cloud plan and the on-prem plan?\n2. How many seats does the base price include?\n\nThanks,\nDana';

console.log('\n--- off by default ---\n');
check('without directAskOn the questions mail stays as the engine left it', kinds(judge(QUOTE_HE, { directAskOn: false })).startsWith('SILENT'), kinds(judge(QUOTE_HE, { directAskOn: false })));
check('without directAskOn the bare Hebrew imperative stays as the engine left it', kinds(judge('שלום, מלא את הטופס, חתום והחזר עד מחר. תודה, דנה', { directAskOn: false })).startsWith('SILENT'));

console.log('\n--- plain questions from a person ---\n');
let r = judge(QUOTE_HE);
check('HE: numbered questions about a quote become one reply draft', kinds(r) === 'gmailDraft' && r.intent.directAsk === true && r.intent.questions === 3, [kinds(r), r.intent && r.intent.questions]);
check('HE: no date in the words, so no task and no date is invented', r.process.steps.length === 1 && !r.intent.entities.dateIso);
check('HE: the quoted ask is the first question, as written', /מה ההבדלים/.test(r.intent.entities.what), r.intent.entities.what);
r = judge(QUOTE_EN);
check('EN: two questions become one reply draft', kinds(r) === 'gmailDraft' && r.intent.questions === 2, kinds(r));
r = judge('Hi Sali,\n\nWhat is the price for ten seats?\n\nThanks, Dana');
check('one question in a mail that greets the reader by name is a reply', kinds(r) === 'gmailDraft', kinds(r));
r = judge('What is the price for ten seats?\n\nThanks, Dana');
check('one question with no greeting by name stays quiet', kinds(r).startsWith('SILENT'), kinds(r));

console.log('\n--- who and where ---\n');
check('an automated sender stays quiet', kinds(judge(QUOTE_EN, { sender: { name: 'Acme', email: 'no-reply@acme.io' } })).startsWith('SILENT'));
check('a mass-mail footer stays quiet', kinds(judge(QUOTE_EN + '\n\nYou are receiving this email because you subscribed. Unsubscribe', {})).startsWith('SILENT'));
check('the reader only on Cc stays quiet', kinds(judge(QUOTE_EN, { to: ['other@acme.io'], cc: [OWN] })).startsWith('SILENT'));
check('a mail to more than three people stays quiet', kinds(judge(QUOTE_EN, { to: [OWN, 'a@x.io', 'b@x.io', 'c@x.io'] })).startsWith('SILENT'));
check('an auto-reply subject stays quiet', kinds(judge(QUOTE_EN, { subject: 'Automatic reply: Quote' })).startsWith('SILENT') && kinds(judge(QUOTE_HE, { subject: 'מענה אוטומטי: הצעה' })).startsWith('SILENT'));
r = judge(QUOTE_EN, { sender: { name: 'Sali', email: OWN } });
check('the person\'s own mail is never a direct ask (a note to self keeps the engine\'s own rule)', !(r.show && r.intent.directAsk), kinds(r));
check('questions only inside the quoted history stay quiet', kinds(judge('Thanks, noted.\n\nFrom: Sali <' + OWN + '>\nSent: Monday\nSubject: Quote\n\nWhat is the price for ten seats? How many seats are included?')).startsWith('SILENT'));

console.log('\n--- sentences that are not asks ---\n');
check('security-notice questions are not asks', kinds(judge('Hi Sali,\n\nWas this you? Did you just log in on a new device?\n\nThe Team')).startsWith('SILENT'));
check('a greeting question is not an ask', kinds(judge('Hi Sali,\n\nHow are you? How\'s it going?\n\nDana')).startsWith('SILENT') && kinds(judge('סאלי היי,\n\nמה שלומך? מה נשמע?\n\nדנה')).startsWith('SILENT'));
check('a hedged question is skipped', kinds(judge('Hi Sali,\n\nWhat is the price, maybe? How many seats, whenever you get a chance?\n\nDana')).startsWith('SILENT'));
r = judge('בוקר טוב סאלי, יש מצב לתאם זום ביום שלישי בשעה 9:00? תודה! דנה');
check('a question that names a clock is a meeting proposal, never a direct-ask reply', !(r.show && r.intent.directAsk), kinds(r));

console.log('\n--- a Hebrew bare imperative with its day ---\n');
r = judge('שלום, מלא את הטופס, חתום והחזר עד מחר. תודה, דנה');
check('work with a day is a task due that day', kinds(r) === 'googleTask' && r.intent.directAsk === true && r.process.steps[0].params.dateIso === '2026-10-08', [kinds(r), r.show && r.process.steps[0].params]);
r = judge('היי סאלי, תשלם את החשבונית עד יום חמישי. תודה, דנה');
check('a payment back with a day is a reply with its task', kinds(r) === 'gmailDraft+googleTask' && r.intent.entities.dateIso === '2026-10-08', [kinds(r), r.show && r.intent.entities.dateIso]);
check('with no day it stays quiet', kinds(judge('שלום, מלא את הטופס, חתום והחזר. תודה, דנה')).startsWith('SILENT'));
check('negated, it stays quiet', kinds(judge('שלום, אל תשלם את החשבונית עד יום חמישי. תודה, דנה')).startsWith('SILENT'));
check('"already handled" stays quiet', kinds(judge('שלום, לא צריך, חתום והחזר כבר טופל. תודה, דנה')).startsWith('SILENT'));

console.log('\n--- Google Calendar notices ---\n');
check('calendar-notification@ is an automated sender', X.senderIsAutomated('calendar-notification@google.com', '') === true && X.senderIsAutomated('dana@acme.io', '') === false);
r = judge('Booked by Test Booking\nA 30-minute intro call with the team.\nJoin with Google Meet Meeting link https://meet.example/abc Test your setup at any time', { sender: { name: 'Google Calendar', email: 'calendar-notification@google.com' }, subject: 'Appointment booked: Intro @ Sun 1 Nov 2026 10am - 10:30am', directAskOn: false });
check('an "Appointment booked" notice from Google Calendar offers no reply draft', !(r.show && r.process.steps.some((s) => s.kind === 'gmailDraft')), kinds(r));

console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
