// A meeting named by its verb or by a scheduling assertion («Let's talk tomorrow at 15:00», «נתראה ביום חמישי ב-15:00», «The closing will take place on Thursday at 14:00»), and the two
// shapes that must not be a calendar event: a meeting that already happened and a slot the sender declines. Written for this file (dev probes, 2026-11-18); the held-out sets are not read.
// An unmarked 12:00 stays unresolved by design (noon or midnight), so no probe uses it.
// Run: node test/calendar-verb-corpus.cjs
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

const POS = [
  "Let's talk tomorrow at 15:00.", "I've booked us for Thursday at 3pm.", 'The closing will take place on Thursday at 14:00.', 'We will meet on Tuesday at 16:00 at the office.', 'See you Thursday at 3pm.',
  'The hearing is scheduled for Monday at 09:30.', 'Our meeting is confirmed for Monday at 09:30.',
  'בוא נדבר מחר ב-15:00.', 'נתראה ביום חמישי ב-15:00.', 'נפגש מחר ב-15:00 במשרד.', 'מתאים לך ביום שני ב-11:00?', 'הישיבה תתקיים ביום חמישי בשעה 15:00.', 'הדיון יתקיים ביום חמישי בשעה 15:00.',
  'אשמח להיפגש ביום שלישי ב-15:00.', 'קבענו להיפגש מחר ב-17:00.', 'הדיון בבית המשפט נקבע ליום שלישי 15.12 בשעה 10:30.'
];
const NEG = [
  'We had a meeting on Thursday at 3pm and it went well.', 'The meeting on Thursday at 3pm was cancelled.', "I can't make Thursday at 3pm.", 'Please send the contract by Thursday at 3pm.', 'The filing deadline is set for Thursday at 15:00.',
  'לא נוכל להיפגש ביום שני ב-11:00.', 'הפגישה ביום חמישי ב-15:00 בוטלה.', 'הדיון נדחה ליום ראשון ב-10:00.', 'תודה על הפגישה אתמול ב-10:00.', 'נא לשלוח את המסמך עד יום חמישי ב-15:00.', 'מועד ההגשה נקבע ליום חמישי בשעה 15:00.'
];
for (const t of POS) { const r = judge(t); check('a calendar event is offered: ' + t.slice(0, 48), r.show && /calendar/i.test(kinds(r)), kinds(r)); }
for (const t of NEG) { const r = judge(t); check('no calendar event: ' + t.slice(0, 48), !(r.show && /calendar/i.test(kinds(r))), kinds(r)); }
console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
