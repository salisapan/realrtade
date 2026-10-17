// A have-a-call topic comes from the body, then a clean subject.
// A Hebrew UI translates the topic. A brand stays as written.
// A self-sent negation, including לא נעשה, stays quiet.
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

const q4 = classify("Let's have a call Tuesday at 15:00 about the Q4 budget.", { subject: 'Hello', senderName: 'Dana' });
check('Hello plus about the Q4 budget uses the body', q4 && q4.type && q4.label === 'Call about the Q4 budget' && q4.selfTask !== true, q4 && q4.label);
const q4Steps = planKinds(q4, "Let's have a call Tuesday at 15:00 about the Q4 budget.");
check('Q4 budget keeps the calendar and the task', q4Steps.indexOf('calendar') >= 0 && q4Steps.indexOf('googleTask') >= 0, q4Steps);

const pilot = classify(CALL, { subject: 'the pilot' });
check('the pilot is Call about the pilot', pilot && pilot.label === 'Call about the pilot', pilot && pilot.label);
check('a trailing comma is not part of the call title', classify(CALL, { subject: 'the pilot,' }).label === 'Call about the pilot');

const heSubject = classify("Let's have a call Tuesday at 15:00", { subject: 'תקציב הרבעון', senderName: 'Dana' });
check('a clean Hebrew subject is the topic when the body has none', heSubject && heSubject.label === 'Call about תקציב הרבעון', heSubject && heSubject.label);
check('Hebrew UI translates a whole phrase and keeps a brand',
  FlowDisplay.localizeHeading('he', 'Call about the campaign') === 'שיחה בנושא הקמפיין' &&
  FlowDisplay.localizeHeading('he', 'Call about the pilot') === 'שיחה בנושא הפיילוט' &&
  FlowDisplay.localizeHeading('he', 'Call about Q4 budget') === 'שיחה בנושא תקציב Q4' &&
  FlowDisplay.localizeHeading('he', 'Call about Globex renewal') === 'שיחה בנושא חידוש Globex' &&
  FlowDisplay.localizeHeading('he', 'Call about the new pricing plan') === 'שיחה בנושא תוכנית התמחור החדשה' &&
  FlowDisplay.localizeHeading('he', "Call about Dana's contract renewal") === 'שיחה בנושא חידוש החוזה של Dana' &&
  FlowDisplay.localizeHeading('he', 'Call about תקציב הרבעון') === 'שיחה בנושא תקציב הרבעון' &&
  FlowDisplay.localizeHeading('he', 'Call with Dana') === 'שיחה עם Dana');
check('an unknown topic falls back to the sender, with no mixed title',
  FlowDisplay.localizeHeading('he', 'Call about security audit', { senderName: 'Dana' }) === 'שיחה עם Dana' &&
  FlowDisplay.localizeHeading('he', 'Call about security audit').indexOf('שיחה בנושא') < 0);
check('a call verb is להתקשר, and a Latin name takes a hyphen',
  FlowDisplay.localizeHeading('he', 'Call the bank') === 'להתקשר לבנק' &&
  FlowDisplay.localizeHeading('he', 'Call the accountant') === 'להתקשר לרואה החשבון' &&
  FlowDisplay.localizeHeading('he', 'Call Yossi') === 'להתקשר ל-Yossi' &&
  FlowDisplay.localizeHeading('he', 'Call the bak') === 'Call the bak' &&
  FlowDisplay.localizeHeading('he', 'Call you') === 'Call you' &&
  FlowDisplay.localizeHeading('he', 'Call Thursday 14:30') === 'שיחה יום חמישי 14:30' &&
  FlowDisplay.localizeHeading('he', 'Call Monday 3pm') === 'שיחה יום שני 15:00');
check('a topic stops at the comma', classify("Let's have a call Tuesday at 15:00 about the pilot, please confirm", { subject: 'Hello', senderName: 'Dana' }).label === 'Call about the pilot');
check('a pronoun is not a topic', classify("Let's have a call Tuesday at 15:00 about it", { subject: 'Re: Fwd: Q4 budget!!', senderName: 'Dana' }).label === 'Call about Q4 budget');
const meetingAsk = classify('Would next Monday at 3pm work for a quick call?', { subject: 'Meeting request', senderEmail: ME, to: [ME], inbound: false });
check('Meeting request is not a topic on a self note', meetingAsk && meetingAsk.selfTask === true && meetingAsk.label === 'Call Monday 3pm', meetingAsk && meetingAsk.label);
const hop = classify('Shall we hop on a call tomorrow at 10:00', { subject: 'Meeting request', senderEmail: ME, to: [ME], inbound: false });
check('a generic subject with a time is Call plus the time', hop && hop.label === 'Call tomorrow 10:00', hop && hop.label);
check('Schedule & Confirm does not take the call label',
  FlowDisplay.cardFace({ id: 'schedule-confirm', name: 'Schedule & Confirm' }, { label: 'Call about the pilot,' }, {}).title === 'Schedule & Confirm');
check('a schedule card drops a trailing comma from the call label',
  FlowDisplay.cardFace({ id: 'schedule', name: 'Schedule It' }, { label: 'Call about the pilot,' }, {}).title === 'Call about the pilot');

const selfCall = classify(CALL, { subject: 'the pilot', senderEmail: ME, inbound: false });
check('a self-sent have-a-call is Call about the subject', selfCall && selfCall.label === 'Call about the pilot' && selfCall.selfTask === true, selfCall && { label: selfCall.label, selfTask: selfCall.selfTask, type: selfCall.type });

const wont = classify("We won't have a call Tuesday at 15:00", { subject: 'the pilot', senderEmail: ME, to: [ME], inbound: false });
check('self plus negation stays quiet', !wont.type && wont.selfTask !== true, wont);
const heWont = classify('לא נעשה שיחה ביום שלישי ב-15:00 על הפיילוט', { subject: 'הפיילוט', senderEmail: ME, to: [ME], inbound: false });
check('Hebrew self לא נעשה stays quiet', !heWont.type && heWont.selfTask !== true, heWont && { type: heWont.type, label: heWont.label });
const ifHe = classify('אם לא תהיה תשובה עד מחר, להתקשר לדנה', { subject: 'note', senderEmail: ME, to: [ME], inbound: false });
check('a negation only inside the if stays a task', ifHe && ifHe.type && ifHe.label.indexOf('דנה') >= 0, ifHe && ifHe.label);
const ifEn = classify("If we won't hear back by tomorrow, call Dana", { subject: 'note', senderEmail: ME, to: [ME], inbound: false });
check('an English if-clause stays Call Dana', ifEn && ifEn.type && ifEn.label === 'Call Dana', ifEn && ifEn.label);
const mainHe = classify('לא תהיה שיחה ביום שלישי, אם דנה תאשר', { subject: 'note', senderEmail: ME, to: [ME], inbound: false });
check('a negated main clause stays quiet', !mainHe.type, mainHe && mainHe.label);
const mainEn = classify("We won't have a call Tuesday, if Dana confirms", { subject: 'note', senderEmail: ME, to: [ME], inbound: false });
check('an English negated main clause stays quiet', !mainEn.type, mainEn && mainEn.label);
['לא נקיים שיחה מחר', 'לא תהיה שיחה ביום שלישי', 'השיחה בוטלה'].forEach(function (line) {
  const row = classify(line, { subject: 'הפיילוט', senderEmail: ME, to: [ME], inbound: false });
  check('Hebrew self negation stays quiet: ' + line, !row.type, row && row.label);
});

const hello = classify("Let's have a call Tuesday at 15:00 about the Q4 budget", { subject: 'Hello', senderName: 'Dana' });
check('a greeting subject does not become the topic', hello && hello.label === 'Call about the Q4 budget', hello && hello.label);
const invoice = classify("Let's have a call Tuesday at 15:00", { subject: 'Invoice from billing@vendor.io', senderName: 'Billing', senderEmail: 'billing@vendor.io' });
check('an address subject is Call with the sender', invoice && invoice.label === 'Call with Billing' && invoice.label.indexOf('billing@') < 0, invoice && invoice.label);
const lets = classify("Let's have a call Tuesday at 15:00", { subject: "Let's meet", senderName: 'Dana' });
check("Let's meet is not the topic", lets && lets.label === 'Call with Dana', lets && lets.label);
const selfBare = classify("Let's have a call Tuesday at 15:00", { subject: 'Hello', senderEmail: ME, to: [ME], inbound: false });
check('a self note with no topic is Call plus the time', selfBare && selfBare.selfTask === true && /^Call\b/.test(selfBare.label) && selfBare.label.indexOf('Hello') < 0 && /15:00/.test(selfBare.label), selfBare && selfBare.label);

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
