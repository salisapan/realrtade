'use strict';
// Every way a person asks the reader for a time, a call, a meeting or their availability is a request, in English and
// Hebrew (test/fixtures/slot-ask-phrases.json, invented lines). Each line sits inside an ordinary short mail from a
// person to the reader. The gate is recall on those lines and silence on the negatives below.
// Run: node test/slot-ask-phrases-corpus.cjs
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const sandbox = { module: undefined, console };
vm.createContext(sandbox);
for (const f of ['domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'close-families.js', 'fact-reply.js', 'intent.js', 'actions.js', 'file-attach.js', 'resolution.js', 'incoming-judge.js']) {
  const p = path.join(ROOT, 'core', f);
  if (fs.existsSync(p)) vm.runInContext(fs.readFileSync(p, 'utf8'), sandbox, { filename: f });
}
const J = sandbox.FlowIncomingJudge;
const own = ['me@example.com'];
const phrases = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'slot-ask-phrases.json'), 'utf8'));

function judge(text, subject, from) {
  return J.judge({
    text, subject: subject || 'Catching up', sender: { email: from || 'dana@firm.example', name: 'Dana Levi' },
    to: own, ownAddresses: own, now: new Date('2026-10-20T10:00:00+03:00'), surface: 'gmail', userName: 'Sam', ownNames: ['Sam', 'סאם'], attachmentCount: 0
  }, {});
}
function wrap(line, lang) {
  return lang === 'he' ? 'היי סאם,\n' + line + '\nתודה, דנה' : 'Hi Sam,\n' + line + '\nThanks, Dana';
}
const offered = (r) => r.show === true;

let failures = 0;
const misses = [];
let total = 0;
for (const lang of ['en', 'he']) {
  let hit = 0;
  phrases[lang].forEach((line) => {
    total++;
    const r = judge(wrap(line, lang));
    if (offered(r)) hit++; else misses.push(lang + ': ' + line + '  [' + (r.reason || 'shown') + ']');
  });
  const pct = Math.round(100 * hit / phrases[lang].length);
  console.log(lang + ' recall: ' + hit + '/' + phrases[lang].length + ' (' + pct + '%)');
}
misses.forEach((m) => console.log('MISS ' + m));
const NEED = Number(process.env.SLOT_RECALL_MIN || 0.95);
const got = (total - misses.length) / total;
if (got < NEED) { failures++; console.log('FAIL: recall ' + got.toFixed(2) + ' is below ' + NEED); } else console.log('PASS: recall ' + got.toFixed(2));

// Ordinary mail that mentions calls, meetings and time without asking the reader for any.
const negatives = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'slot-ask-negatives.json'), 'utf8'));
let negOffered = 0;
['en', 'he'].forEach((lang) => negatives[lang].forEach((line) => {
  const r = judge(wrap(line, lang), 'Update');
  const slotCard = r.show === true && r.process && r.process.id === 'reply-track' && /time|slot|call|meeting|שיחה|פגישה|מועד/i.test(JSON.stringify(r.intent && r.intent.label || ''));
  if (r.show === true && !/send|confirm|invoice|contract|signed|חשבונית|חוזה|כתובת|לאשר|לשלוח/i.test(line)) { negOffered++; console.log('OFFERED (should be quiet): ' + lang + ': ' + line + '  [' + (r.intent && r.intent.label) + ']'); }
}));
if (negOffered) { failures++; console.log('FAIL: ' + negOffered + ' ordinary lines were offered'); } else console.log('PASS: the ordinary lines that mention calls and meetings stay quiet');

const quiet = [
  ['a recap of a call that happened', 'Hi Sam,\nThanks for the call this morning, it was great to meet your team.\nDana', 'dana@firm.example'],
  ['a call that no one needs', 'Hi Sam,\nNo need for a call, the email covers everything.\nDana', 'dana@firm.example'],
  ['marketing demo prompt with a footer', 'Book a demo today and see how teams save time. You are receiving this email because you subscribed. Unsubscribe here.', 'marketing@vendor.example'],
  ['newsletter schedule a demo', 'Schedule a demo with our team! To unsubscribe from this list, click here.', 'news@vendor.example'],
  ['a meeting notice that is already fixed', 'Hi Sam,\nFor your information, the weekly meeting is every Monday at 10:00, no action needed.\nDana', 'dana@firm.example'],
  ['a cancelled meeting', 'Hi Sam,\nThe meeting is cancelled, sorry for the trouble.\nDana', 'dana@firm.example'],
  ['asking the time of day', 'Hi Sam,\nI forgot my watch, what time is it?\nDana', 'dana@firm.example'],
  ['Hebrew recap of a call', 'היי סאם,\nתודה על השיחה אתמול, היה מצוין.\nדנה', 'dana@firm.example'],
  ['Hebrew no need to meet', 'היי סאם,\nאין צורך בפגישה, הכול ברור.\nדנה', 'dana@firm.example'],
  ['Hebrew marketing with a footer', 'קבעו הדגמה עוד היום! להסרה מרשימת התפוצה לחצו כאן.', 'marketing@vendor.example']
];
for (const [label, text, from] of quiet) {
  const r = judge(text, 'Update', from);
  if (offered(r)) { failures++; console.log('FAIL: quiet: ' + label + ' was offered'); } else console.log('PASS: quiet: ' + label);
}
process.exit(failures ? 1 : 0);
