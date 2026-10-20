'use strict';
// A mail that asks the reader for a time ("אשמח לתאם שיחה ... מתי נוח לכם?", "we would love to set up a call,
// when does it work?") is a request: the card offers a reply draft that proposes times. The lines are invented.
// Marketing, newsletters and a withdrawn ask stay quiet.
// Run: node test/scheduling-ask-corpus.cjs
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const ROOT = path.join(__dirname, '..');
const sandbox = { module: undefined, console };
vm.createContext(sandbox);
for (const f of ['domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'close-families.js', 'fact-reply.js', 'intent.js', 'actions.js', 'file-attach.js', 'resolution.js', 'incoming-judge.js']) {
  const p = path.join(ROOT, 'core', f);
  if (fs.existsSync(p)) vm.runInContext(fs.readFileSync(p, 'utf8'), sandbox, { filename: f });
}
const J = sandbox.FlowIncomingJudge;
const { FlowDraftReply } = require(path.join(ROOT, 'core', 'draft-reply.js'));
const own = ['me@example.com'];

function judge(text, subject, from) {
  return J.judge({
    text, subject: subject || 'Re: demo', sender: { email: from || 'dana@firm.example', name: 'Dana Levi' },
    to: own, ownAddresses: own, now: new Date('2026-10-20T12:00:00+03:00'), surface: 'gmail', userName: 'Sam', ownNames: ['Sam']
  }, {});
}

const heAsk = 'היי,\nהצגתי בהדמיה, ובסך הכול נראה מאוד מבטיח.\nאשמח לתאם שיחה קצרה השבוע, בעיקר כדי להבין איך התהליך עובד בפועל.\nמתי נוח לכם?\nדנה';
const enAsk = 'Hi,\nThe demo looked promising. We would love to set up a call this week to understand how it works.\nWhen does it work for you?\nDana';

const he = judge(heAsk);
check('Hebrew ask for a time is offered', he.show === true && he.process && he.process.id === 'reply-track', he);
const en = judge(enAsk);
check('English ask for a time is offered', en.show === true && en.process && en.process.id === 'reply-track', en);

const heDraft = FlowDraftReply.draftBodyText({ senderName: 'Dana Levi', senderEmail: 'dana@firm.example', params: { lang: 'he', askText: heAsk } });
check('Hebrew draft offers two slots to fill, with no invented time', /\[מועד 1\]/.test(heDraft) && /\[מועד 2\]/.test(heDraft) && !/\d{1,2}:\d{2}/.test(heDraft), heDraft);
const enDraft = FlowDraftReply.draftBodyText({ senderName: 'Dana Levi', senderEmail: 'dana@firm.example', params: { askText: enAsk } });
check('English draft offers two slots to fill, with no invented time', /\[time 1\]/.test(enDraft) && /\[time 2\]/.test(enDraft) && !/\d{1,2}:\d{2}/.test(enDraft), enDraft);

const quiet = [
  ['newsletter with a call to action', 'נשמח לתאם שיחה איתכם. להסרה מרשימת התפוצה לחצו כאן.', 'news@vendor.example'],
  ['marketing footer', 'We would love to set up a demo. You are receiving this because you subscribed. Unsubscribe here.', 'marketing@vendor.example'],
  ['a call that already happened', 'Hi,\nThanks for the call this morning, it was great to meet everyone.\nDana', 'dana@firm.example'],
  ['asked for nothing', 'Hi,\nJust sharing the notes from the demo, no action needed.\nDana', 'dana@firm.example']
];
for (const [label, text, from] of quiet) {
  const r = judge(text, 'Update', from);
  check('quiet: ' + label, r.show !== true, r);
}

process.exit(failures ? 1 : 0);
