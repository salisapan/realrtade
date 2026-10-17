// A have-a-call title is Call about the full subject. Hebrew translates
// the frame only. A self-sent won't stays quiet. The page title is not
// an own address.
// Run: node test/call-about-subject-corpus.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const { FlowDisplay } = require(path.join(ROOT, 'core/display-copy.js'));
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail).slice(0, 900) : ''); }
}

const core = { module: undefined, console, Date, URL, URLSearchParams, Intl };
core.globalThis = core;
vm.createContext(core);
for (const f of ['domains.js', 'extract.js', 'judgment.js', 'source-text.js', 'google-closes.js', 'close-families.js', 'fact-reply.js', 'intent.js', 'actions.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'core', f), 'utf8'), core, { filename: f });
}
const FlowIntent = vm.runInContext('FlowIntent', core);
const FlowActions = vm.runInContext('FlowActions', core);
const NOW = new Date('2026-10-17T09:00:00+03:00');
const ME = 'ai.local.flow@gmail.com';
const CALL = "Let's have a call Tuesday at 15:00 about the pilot";

function classify(text, extra) {
  return FlowIntent.classify(text, Object.assign({
    now: NOW,
    senderEmail: 'dana@acme.io',
    ownAddresses: [ME],
    to: [ME],
    inbound: true
  }, extra || {}));
}

function planKinds(intent, text) {
  const plan = intent && intent.type ? FlowActions.planFor(intent, { text: text }) : null;
  return ((plan && plan.steps) || []).map((step) => step.kind);
}

const q4 = classify("Let's have a call Tuesday at 15:00 about the Q4 budget.", { subject: 'Q4 budget' });
check('Q4 budget is Call about the full subject', q4 && q4.type && q4.label === 'Call about Q4 budget' && q4.selfTask !== true, q4 && q4.label);
const q4Steps = planKinds(q4, "Let's have a call Tuesday at 15:00 about the Q4 budget.");
check('Q4 budget keeps the calendar and the task', q4Steps.indexOf('calendar') >= 0 && q4Steps.indexOf('googleTask') >= 0, q4Steps);

const pilot = classify(CALL, { subject: 'the pilot' });
check('the pilot is Call about the pilot', pilot && pilot.label === 'Call about the pilot', pilot && pilot.label);
check('a trailing comma is not part of the call title', classify(CALL, { subject: 'the pilot,' }).label === 'Call about the pilot');

const heSubject = classify(CALL, { subject: 'תקציב הרבעון' });
check('a Hebrew subject stays in the English frame', heSubject && heSubject.label === 'Call about תקציב הרבעון', heSubject && heSubject.label);
check('Hebrew UI translates the frame and leaves the phrase',
  FlowDisplay.localizeHeading('he', 'Call about Q4 budget') === 'שיחה בנושא Q4 budget' &&
  FlowDisplay.localizeHeading('he', 'Call about the pilot') === 'שיחה בנושא the pilot' &&
  FlowDisplay.localizeHeading('he', 'Call about תקציב הרבעון') === 'שיחה בנושא תקציב הרבעון' &&
  FlowDisplay.localizeHeading('he', 'Call about the pilot') !== 'שיחה בנושא הפילוט');
check('Schedule & Confirm does not take the call label',
  FlowDisplay.cardFace({ id: 'schedule-confirm', name: 'Schedule & Confirm' }, { label: 'Call about the pilot,' }, {}).title === 'Schedule & Confirm');
check('a schedule card drops a trailing comma from the call label',
  FlowDisplay.cardFace({ id: 'schedule', name: 'Schedule It' }, { label: 'Call about the pilot,' }, {}).title === 'Call about the pilot');

const selfCall = classify(CALL, { subject: 'the pilot', senderEmail: ME, inbound: false });
check('a self-sent have-a-call is Call about the subject', selfCall && selfCall.label === 'Call about the pilot' && selfCall.selfTask === true, selfCall && { label: selfCall.label, selfTask: selfCall.selfTask, type: selfCall.type });

const wont = classify("We won't have a call Tuesday at 15:00", { subject: 'the pilot', senderEmail: ME, inbound: false });
check('self plus negation stays quiet', !wont.type && wont.selfTask !== true, wont);

const forget = classify("Don't forget to renew the domain on Friday", { subject: 'Reminder', senderEmail: ME, inbound: false });
check("don't forget is still the task", forget && forget.type && forget.selfTask === true && forget.label !== "Don't forget to renew the domain on Friday", forget && forget.label);

const supplier = classify('I will book the venue tomorrow', {
  subject: 'Invoice from billing@vendor.io',
  senderEmail: 'billing@vendor.io',
  ownAddresses: [ME],
  to: [ME],
  inbound: true
});
check('an inbound supplier mail is not a self task', supplier && supplier.selfTask !== true, supplier && { type: supplier.type, selfTask: supplier.selfTask, label: supplier.label });

const gmail = fs.readFileSync(path.join(ROOT, 'src/content-gmail.js'), 'utf8');
check('the page title is not an own-address source', gmail.indexOf('function ownEmailFromTitle') < 0 && gmail.indexOf('document.title') < 0, gmail.indexOf('document.title'));

console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
