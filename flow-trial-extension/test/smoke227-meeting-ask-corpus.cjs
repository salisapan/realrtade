'use strict';
// Smoke #227: Hebrew explicit meeting asks and the CTO status-meeting mail (both mailbox TZ offsets).
// Run: node test/smoke227-meeting-ask-corpus.cjs
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail).slice(0, 400) : ''); }
}

const sandbox = { module: undefined, console };
vm.createContext(sandbox);
for (const f of ['domains.js', 'extract.js', 'judgment.js', 'close-families.js', 'intent.js', 'incoming-judge.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, 'core', f), 'utf8'), sandbox, { filename: f });
}
const FlowIntent = vm.runInContext('FlowIntent', sandbox);
const FlowIncomingJudge = vm.runInContext('FlowIncomingJudge', sandbox);

const STATUS_BODY = 'אפשר לקבוע פגישת סטטוס ביום שישי 30/10 בשעה 10:00 לחצי שעה?';

function classify(text, nowIso) {
  return FlowIntent.classify(text, { now: new Date(nowIso) });
}

function judged(text, nowIso) {
  const intent = classify(text, nowIso);
  return FlowIncomingJudge.judge({
    text: text,
    subject: '',
    surface: 'outlook',
    sender: { name: 'flow', email: 'ai.local.flow@gmail.com' },
    now: new Date(nowIso),
    inbound: true,
    intent: intent
  });
}

const variants = [
  ['base אפשר לקבוע פגישה', 'אפשר לקבוע פגישה ביום שישי 30/10 בשעה 10:00'],
  ['base אפשר לתאם שיחה', 'אפשר לתאם שיחה ביום שישי 30/10 בשעה 10:00'],
  ['base ל היפגש', 'נוכל להיפגש ביום שישי 30/10 בשעה 10:00?'],
  ['227 verb gap לקבוע', 'אפשר לקבוע פגישת סטטוס ביום שישי 30/10 בשעה 10:00'],
  ['construct פגישת', STATUS_BODY]
];

for (const tz of ['2026-10-28T10:00:00+02:00', '2026-10-28T08:00:00Z']) {
  console.log('\n--- TZ ' + tz + ' ---\n');
  for (const [label, text] of variants) {
    const intent = classify(text, tz);
    check(label + ' explicitHold', intent.explicitHold === true, { explicitHold: intent.explicitHold, personalClose: intent.personalClose });
  }
  const intent = classify(STATUS_BODY, tz);
  check('CTO mail explicit calendar hold', intent.explicitHold === true && intent.personalClose === 'calendar-hold', intent);
}

if (failures) process.exit(1);
console.log('\nAll smoke227 meeting-ask checks passed.\n');
