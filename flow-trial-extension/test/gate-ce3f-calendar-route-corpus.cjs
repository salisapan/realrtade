// Live Gate on #319 @ce3fb6a4: a self-sent שיחה/פגישה plus a clock plus
// «שריין / תשריין ביומן» was filed as a Google Task («שיחה בנושא …») because
// the weekday letter had no word יום, and שריין was not adjacent to ביומן.
// The card's decision is FlowIntent.classify then FlowActions.planFor.
// The painted card, בצע, and בטל are e2e/gate-65267001-hold-exec.spec.js.
// Run: node test/gate-ce3f-calendar-route-corpus.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = { module: undefined, console, Date };
vm.createContext(sandbox);
for (const f of ['domains.js', 'extract.js', 'judgment.js', 'close-families.js', 'day-words.js', 'intent.js', 'actions.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'core', f), 'utf8'), sandbox, { filename: f });
}
const FlowIntent = vm.runInContext('FlowIntent', sandbox);
const FlowActions = vm.runInContext('FlowActions', sandbox);

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const SELF = {
  senderEmail: 'ai.local.flow@gmail.com',
  userEmail: 'ai.local.flow@gmail.com',
  ownAddresses: ['ai.local.flow@gmail.com'],
  to: ['ai.local.flow@gmail.com'],
  senderIsUser: true
};

function decide(body, subject, now) {
  const ctx = Object.assign({ now: now, subject: subject }, SELF);
  const intent = FlowIntent.classify(body, ctx);
  const plan = FlowActions.planFor(intent, { text: body, now: now, subject: subject, lang: 'he' });
  const step = plan && plan.steps && plan.steps[0];
  return { intent: intent, plan: plan, step: step };
}

const FRI = new Date('2026-11-20T08:00:00Z');
const mail1 = decide(
  'נקבע שיחה. שריין ג׳ 10:00 ביומן בבקשה.',
  '[G-Calendar] שיחה עם רוני ce3f',
  FRI
);
check('mail 1 is a calendar hold, not a task', mail1.intent && mail1.intent.personalClose === 'calendar-hold' && mail1.intent.selfHold === true && !mail1.intent.selfTask, mail1.intent && mail1.intent.label);
check('mail 1 is Tuesday 24 Nov 2026 at 10:00', mail1.intent && mail1.intent.entities && mail1.intent.entities.dateIso === '2026-11-24' && mail1.intent.entities.hour === 10 && mail1.intent.entities.minute === 0);
check('mail 1 plan is the hold, titled without the [G-Calendar] tag', mail1.plan && mail1.plan.id === 'hold' && mail1.step && mail1.step.kind === 'calendar' && mail1.step.params && mail1.step.params.title === 'שיחה עם רוני ce3f' && mail1.step.params.dateIso === '2026-11-24' && mail1.step.params.hour === 10, mail1.step && mail1.step.params);

const BEFORE = new Date('2026-11-01T08:00:00Z');
const mail2 = decide(
  'נקבעה פגישה ב-18/11 בשעה 10:00, תשריין ביומן.',
  'פגישה עם דנה',
  BEFORE
);
check('mail 2 is a calendar hold when 18/11 is still ahead', mail2.intent && mail2.intent.personalClose === 'calendar-hold' && mail2.intent.selfHold === true && !mail2.intent.selfTask, mail2.intent && { type: mail2.intent.type, label: mail2.intent.label, selfTask: mail2.intent.selfTask });
check('mail 2 is 18 Nov 2026 at 10:00', mail2.plan && mail2.plan.id === 'hold' && mail2.step && mail2.step.kind === 'calendar' && mail2.step.params && mail2.step.params.dateIso === '2026-11-18' && mail2.step.params.hour === 10 && mail2.step.params.title === 'פגישה עם דנה', mail2.step && mail2.step.params);

const still = decide(
  'נקבע שיחת וידאו ביום ג׳ הקרוב ב-10:00, תשריין ביומן.',
  '[G-Calendar] שיחת וידאו עם רוני על התקציב 2',
  FRI
);
check('the adjacent תשריין hold is unchanged', still.plan && still.plan.id === 'hold' && still.step && still.step.params && still.step.params.dateIso === '2026-11-24' && still.step.params.title === 'שיחת וידאו עם רוני על התקציב 2');

if (failures) {
  console.log('\nTOTAL FAILURES:', failures);
  process.exit(1);
}
console.log('\nTOTAL FAILURES: 0');
