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

function judge(text, surface) {
  return J.judge({
    text,
    subject: '',
    sender: { name: 'Dana Levi', email: 'dana@meridian.com' },
    to: [OWN],
    ownAddresses: [OWN],
    userName: 'Sali',
    ownNames: ['Sali', 'Sali Sapan'],
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
  ['en nda after greeting', 'Hi Dana, great meeting today. Please remember to send me the signed NDA by Friday.'],
  ['en payment after thanks', 'Thanks for the update. Please remember to transfer the payment by Sunday.'],
  ['he send after greeting', 'שלום דנה,\n\nתודה על העדכון.\nאל תשכח לשלוח את החוזה החתום עד יום שישי.'],
  ['he transfer after greeting', 'היי,\n\nתזכור להעביר את התשלום עד יום ראשון.']
];
for (const [name, body] of SHOW) {
  for (const surface of ['gmail', 'outlook']) {
    const out = judge(body, surface);
    check(name + ' shows on ' + surface, shown(out), { reason: out.reason, id: planId(out) });
  }
}

console.log('\n--- buried remember-to: relay to a third party stays quiet ---\n');
const QUIET = [
  ['en remind sarah', 'Thanks for the update. Please remember to remind Sarah to send the NDA.'],
  ['he remind yossi', 'תודה על העדכון. תזכור להזכיר ליוסי לשלוח את החוזה.']
];
for (const [name, body] of QUIET) {
  for (const surface of ['gmail', 'outlook']) {
    const out = judge(body, surface);
    check(name + ' quiet on ' + surface, !out.show && /relay/.test(String(out.reason || '')), out.reason);
  }
}

console.log('\n--- inbound meeting: statement schedules, coordinating holds ---\n');
const HOLD = [
  ['he coordinate', 'פגישה ביום חמישי? מתאים לך'],
  ['en coordinate', 'The review meeting is on Thursday, can you make it?']
];
const SCHEDULE = [
  ['he statement', 'פגישה ביום חמישי 22/10'],
  ['en statement', 'The review meeting is on Thursday.']
];
for (const [name, body] of HOLD) {
  for (const surface of ['gmail', 'outlook']) {
    const out = judge(body, surface);
    check(name + ' hold on ' + surface, shown(out) && planId(out) === 'hold', { id: planId(out), reason: out.reason });
  }
}
for (const [name, body] of SCHEDULE) {
  for (const surface of ['gmail', 'outlook']) {
    const out = judge(body, surface);
    check(name + ' schedule on ' + surface, shown(out) && planId(out) === 'schedule', { id: planId(out), reason: out.reason });
  }
}

console.log('\nFAILURES: ' + failures);
process.exit(failures ? 1 : 0);
