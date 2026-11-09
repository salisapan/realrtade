// A tentative ask is not owed: no follow-up draft. "Can you send me the report? No pressure." and "תוכל לשלוח לי את הדוח? אם יסתדר."
// used to get a reply draft and a task, because softness was read on the ask sentence only and the Hebrew list missed common
// tentative words. A firm ask, and any ask with a resolved future date, still shows. Strings are written for this test.
// Run: node test/hedge-ask-corpus.cjs
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const sb = { module: undefined, console: { log() {}, warn() {}, error() {}, info() {}, debug() {} } };
vm.createContext(sb);
for (const f of ['domains.js', 'extract.js', 'judgment.js', 'source-text.js', 'google-closes.js', 'close-families.js', 'intent.js', 'actions.js',
  'file-attach.js', 'fact-reply.js', 'quiet-metrics.js', 'resolution.js', 'incoming-judge.js', 'draft-reply.js']) {
  const p = path.join(__dirname, '..', 'core', f);
  if (fs.existsSync(p)) vm.runInContext(fs.readFileSync(p, 'utf8'), sb, { filename: f });
}
const g = (n) => vm.runInContext('typeof ' + n + ' !== "undefined" ? ' + n + ' : null', sb);
const J = g('FlowIncomingJudge');
const DEPS = { intent: g('FlowIntent'), actions: g('FlowActions'), factReply: g('FlowFactReply'), fileAttach: g('FlowFileAttach'), resolution: g('FlowResolution'), quietMetrics: g('FlowQuietMetrics') };
const NOW = new Date('2026-11-09T12:00:00+02:00');
function judge(text, surface) {
  return J.judge({ text, subject: 'Update', sender: { name: 'Jamie P.', email: 'jamie@example.com' }, now: NOW, threadUrl: 'https://mail.google.com/x',
    hasThreadAttachment: false, attachmentCount: 0, surface: surface || 'gmail', ownNames: ['Sali', 'Sali Sapan', 'סאלי'], namesPending: false, namesWaitDone: true }, DEPS);
}
let failures = 0;
function expect(name, ok, detail) { if (!ok) { failures++; console.error('FAIL', name, detail || ''); } else console.log('ok  ', name); }
const kinds = (r) => (r.show && r.process && r.process.steps ? r.process.steps.map((s) => s.kind) : []);
// must stay quiet: tentative asks
const quiet = [
  'סאלי, תוכל לשלוח לי את הדוח? אם יסתדר.',
  'סאלי, אם יסתדר לך, תשלח לי את הדוח השבוע.',
  'סאלי, יכול להיות שתוכל לשלוח לי את הקובץ?',
  'סאלי, תוכל לחזור אליי לגבי ההצעה? אין לחץ.',
  'סאלי, אם נוח לך, תשלח לי את הפרטים.',
  'סאלי, אפשר לקבל את הדוח? אם לא, זה בסדר.',
  'סאלי, תוכל לשלוח את הדוח? לא בטוח שזה עדיין רלוונטי.',
  'Sali, can you send me the report? No pressure.',
  'Sali, can you get back to me about the proposal? I\'m not sure yet what we will do.',
  'Sali, can you send me the file? Only if you have time.',
  'Sali, would it make sense to chat sometime next week? No pressure.'
];
for (const surface of ['gmail', 'outlook']) for (const t of quiet) {
  const r = judge(t, surface);
  expect(surface + ' quiet: ' + t.slice(0, 50), !r.show, JSON.stringify({ reason: r.reason, kinds: kinds(r) }));
}
// must still be an ask: firm asks, softeners that are how a real ask is written, and dated asks with a softener
const shows = [
  'Sali, can you send me the report?',
  'Sali, when you get a chance, can you send me the report?',
  'Sali, can you review the draft and send comments?',
  'Sali, could you please send the proposal by Thursday?',
  'Sali, could you please send me the invoice by Thursday? No pressure if it slips a day.',
  'סאלי, תוכל לשלוח לי את הדוח?',
  'סאלי, תוכל לשלוח לי את הדוח עד מחר?',
  'סאלי, אם אפשר, תשלח לי את הדוח עד מחר.',
  'סאלי, בבקשה תשלח לי את הדוח עד יום חמישי.',
  'סאלי, תוכל לשלוח לי את ההצעה עד יום חמישי? אם יסתדר, מעולה.',
  // a softer word in another sentence that is not about the ask
  'Sali, can you send me the report? Not sure if I sent you the right link before.',
  'Sali, can you send me the report? Maybe we can also grab coffee later.',
  'Sali, can you send me the signed contract? If possible today.',
  'סאלי, תוכל לשלוח לי את הדוח? ייתכן שאאחר קצת לפגישה.',
  'סאלי, תוכל לשלוח לי את הדוח? רק אם יש לך את הגרסה הסופית.'
];
for (const surface of ['gmail', 'outlook']) for (const t of shows) {
  const r = judge(t, surface);
  // Outlook hands a send-me ask to the host's file chain first ('file-chain-not-run' here); that is still the ask, not a silence.
  const ask = r.show ? kinds(r).some((k) => /Draft$/.test(k)) : (r.reason === 'file' || r.reason === 'file-chain-not-run');
  expect(surface + ' still an ask: ' + t.slice(0, 50), ask, JSON.stringify({ reason: r.reason, kinds: kinds(r) }));
}
if (failures) { console.error(failures + ' failure(s)'); process.exit(1); }
console.log('hedge-ask-corpus: all passed');
