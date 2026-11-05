'use strict';
// Round-2 classifier readers, run with every labs switch OFF (the default): a do-it ask with a named day is a Log It, a question or a
// "can you confirm" with its day is a Reply & Track, a call proposed with day and clock is a Hold It, and the asks that name no day,
// or a day already gone, stay as they were. Run: node test/gate-round2-corpus.cjs
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail).slice(0, 400) : ''); }
}
const ROOT = path.join(__dirname, '..');
const CORE = ['domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'close-families.js', 'fact-reply.js', 'file-attach.js', 'intent.js', 'actions.js', 'resolution.js', 'system-notice.js', 'day-words.js', 'chat-reminder.js', 'chat-deadline-ask.js', 'chat-callback-ask.js', 'incoming-judge.js'];
const box = { module: undefined, console };
vm.createContext(box);
for (const f of CORE) vm.runInContext(fs.readFileSync(path.join(ROOT, 'core', f), 'utf8'), box, { filename: f });
const J = vm.runInContext('FlowIncomingJudge', box);
const NOW = new Date(2026, 10, 4, 12, 0, 0); // Wednesday
const ME = 'sali@mine.example';
const judge = (text, extra) => J.judge(Object.assign({ text, subject: 'Quick one', sender: { name: 'Dana Levi', email: 'dana@example.com' }, senderEmail: 'dana@example.com', now: NOW, surface: 'outlook', inbound: true, to: [ME], cc: [], ownAddresses: [ME] }, extra || {}));
const kinds = (r) => ((r.process && r.process.steps) || []).map((s) => s.kind.replace(/^(gmail|outlook|google)/, '').toLowerCase()).join('+');

const YES = [
  ['Please fill in the vendor onboarding form by Friday so we can pay you.', 'log-it', '2026-11-06'],
  ['Hi, can you upload your 106 form to the portal by the 15th of next month?', 'log-it', '2000-01-01'],
  ['תחדש בבקשה את המנוי לתוכנה עד סוף השבוע', 'log-it', '2026-11-05'],
  ["What's the address for Sunday's offsite? Need it today.", 'reply-track', '2026-11-04'],
  ['See below. Can you confirm by end of week whether we renew?', 'reply-track', '2026-11-06'],
  ['מצורפת המצגת, תעבור עליה ותגיד לי עד יום ראשון אם זה בסדר', 'reply-track', '2026-11-08'],
  ['מצורף החוזה המעודכן. תחתום ותחזיר לי עד יום חמישי בבקשה.', 'reply-track', '2026-11-05'],
  ['קיבלת את הצעת המחיר?', 'reply-track', '2000-01-01'],
  ['נדבר מחר ב-16:00? אני אתקשר', 'hold', '2026-11-05'],
  ["Let's do the interview next Thursday at 14:30 on Zoom. Does that work?", 'hold|schedule', '2026-11-12']
];
for (const [text, proc, day] of YES) {
  for (const surface of ['gmail', 'outlook']) {
    const r = judge(text, { surface, attachmentCount: /החוזה המעודכן/.test(text) ? 1 : 0, hasThreadAttachment: /החוזה המעודכן/.test(text) });
    check(surface + ' ' + proc + ': ' + text.slice(0, 50), r.show && proc.split('|').indexOf(r.process.id) >= 0 && (!day || day === '2000-01-01' || (r.intent.entities && r.intent.entities.dateIso === day) || (r.process.steps.some((s) => s.params && s.params.dateIso === day))), { show: r.show, reason: r.reason, id: r.process && r.process.id, k: kinds(r) });
  }
}
// Not a card: no named day, a day already gone, a reminder with no day, a decision on an offer, a note to self.
const NO = [
  'Please upload the CV to the portal by EOD',
  "Don't forget to bring the form",
  "Don't forget to bring the signed form tomorrow.",
  "Don't forget to send the final logo files next week.",
  'Remember to call on 2025-01-02',
  'I forgot to send it on Monday',
  'Please let me know when you can.'
];
for (const text of NO) {
  const r = judge(text, { subject: 'Hello' });
  check('no log-it/hold card: ' + text, !(r.show && r.intent && (r.intent.doItAsk || r.intent.holdProposal || r.intent.answerAsk)), { show: r.show, reason: r.reason });
}
check('the person\'s own mail is never a do-it ask', !(judge(YES[0][0], { senderIsUser: true }).intent || {}).doItAsk);
check('a note already done stays quiet by name', (() => { const r = judge('Thanks, all signed and sent. Nothing else needed.'); return !r.show; })());
if (failures) { console.log('FAILURES: ' + failures); process.exit(1); }
console.log('All gate-round2 checks passed');
