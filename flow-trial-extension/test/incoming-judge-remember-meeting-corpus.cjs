'use strict';
// Shared judge: buried remember-to (reader close vs relay) and inbound meeting
// announcement vs coordinating hold. Gmail and Outlook use the same judge.
// Run: node test/incoming-judge-remember-meeting-corpus.cjs
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const ROOT = path.join(__dirname, '..');
const engine = { module: undefined, console };
vm.createContext(engine);
for (const f of ['domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'close-families.js', 'fact-reply.js', 'intent.js', 'actions.js', 'file-attach.js', 'resolution.js', 'incoming-judge.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'core', f), 'utf8'), engine, { filename: f });
}
const J = vm.runInContext('FlowIncomingJudge', engine);
const NOW = new Date('2026-10-15T12:00:00Z');
const OWN = 'ai.local.flow@gmail.com';

function judge(text, surface, reader) {
  reader = reader || { userName: 'Sali', ownNames: ['Sali', 'Sali Sapan'] };
  return J.judge({
    text,
    subject: '',
    sender: { name: 'Dana Levi', email: 'dana@meridian.com' },
    to: [OWN],
    ownAddresses: [OWN],
    userName: reader.userName,
    ownNames: reader.ownNames,
    now: NOW,
    surface: surface || 'gmail',
    attachmentCount: 0,
    inbound: true
  }, {});
}

function shown(out) { return Boolean(out && out.show && out.process && out.process.steps && out.process.steps.length); }
function planId(out) { return out && out.process && out.process.id; }

console.log('\n--- buried remember-to: reader close must show ---\n');
const SHOW = [
  ['en nda after greeting', 'Hi Dana, great meeting today. Please remember to send me the signed NDA by Friday.', { userName: 'Dana', ownNames: ['Dana', 'Dana Levi'] }],
  ['en payment after thanks', 'Thanks for the update. Please remember to transfer the payment by Sunday.'],
  ['he send after greeting', 'שלום,\n\nתודה על העדכון.\nאל תשכח לשלוח את החוזה החתום עד יום שישי.'],
  ['he transfer after greeting', 'היי,\n\nתזכור להעביר את התשלום עד יום ראשון.'],
  ['en remind me', 'Please remind me to call the client tomorrow'],
  ['he remind me', 'תזכיר לי לשלוח את הדוח מחר']
];
for (const row of SHOW) {
  const name = row[0];
  const body = row[1];
  const reader = row[2] || null;
  for (const surface of ['gmail', 'outlook']) {
    const out = judge(body, surface, reader);
    check(name + ' shows on ' + surface, shown(out), { reason: out.reason, id: planId(out) });
  }
}

console.log('\n--- buried remember-to: relay to a third party stays quiet ---\n');
const QUIET = [
  ['en remind sarah', 'Thanks for the update. Please remember to remind Sarah to send the NDA.'],
  ['he remind yossi', 'תודה על העדכון. תזכור להזכיר ליוסי לשלוח את החוזה.'],
  ['en remember to remind sarah', 'Please remember to remind Sarah to call the client tomorrow'],
  ['he remind yossi verb', 'תזכור להזכיר ליוסי להתקשר'],
  ['he tell dana', 'תודה על העדכון. תזכיר לדנה להתקשר ללקוח עד מחר.'],
  ['en dont forget remind sarah', "Don't forget to remind Sarah to call the client tomorrow"],
  ['he dont forget dana report', 'אל תשכח להזכיר לדנה לשלוח את הדוח'],
  ['he remember ask accountant', 'תזכור לשאול את רואה החשבון על הדוח'],
  ['en dont forget tell noa', "Don't forget to tell Noa that the meeting moved"]
];
for (const [name, body] of QUIET) {
  for (const surface of ['gmail', 'outlook']) {
    const out = judge(body, surface);
    check(name + ' quiet on ' + surface, !out.show && /relay/.test(String(out.reason || '')), out.reason);
  }
}

console.log('\n--- inbound meeting: statement schedules, coordinating logs ---\n');
const LOGIT_COORD = [
  ['he coordinate', 'פגישה ביום חמישי? מתאים לך'],
  ['en coordinate', 'The review meeting is on Thursday, can you make it?']
];
const STATEMENT_QUIET = [
  ['he statement no clock', 'פגישה ביום חמישי 22/10'],
  ['he wed conflict', 'פגישה ביום רביעי 22/10']
];
const STATEMENT_HOLD = [
  ['he statement timed', 'פגישה ביום חמישי 22/10 בשעה 14:00']
];
for (const [name, body] of LOGIT_COORD) {
  for (const surface of ['gmail', 'outlook']) {
    const out = judge(body, surface);
    check(name + ' log-it on ' + surface, shown(out) && planId(out) === 'log-it', { id: planId(out), reason: out.reason });
  }
}
for (const [name, body] of STATEMENT_QUIET) {
  for (const surface of ['gmail', 'outlook']) {
    const out = judge(body, surface);
    check(name + ' quiet on ' + surface, !out.show, { id: planId(out), reason: out.reason });
  }
}
for (const [name, body] of STATEMENT_HOLD) {
  for (const surface of ['gmail', 'outlook']) {
    const out = judge(body, surface);
    check(name + ' hold on ' + surface, shown(out) && planId(out) === 'hold', { id: planId(out), reason: out.reason });
  }
}
check('he remind me relay shows', shown(judge('תזכור להזכיר לי להתקשר מחר', 'gmail')), { reason: judge('תזכור להזכיר לי להתקשר מחר', 'gmail').reason });

console.log('\nFAILURES: ' + failures);
process.exit(failures ? 1 : 0);
