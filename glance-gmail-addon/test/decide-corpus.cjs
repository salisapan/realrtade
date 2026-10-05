// Parity: the add-on decision is the Chrome plan, restricted to Calendar,
// Task, and Gmail draft. Run from the repo root:
//   node glance-gmail-addon/test/decide-corpus.cjs

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repo = path.join(__dirname, '..', '..');
const core = path.join(repo, 'flow-trial-extension', 'core');
const addon = path.join(__dirname, '..');

const SOURCE_ORDER = [
  path.join(core, 'domains.js'),
  path.join(core, 'extract.js'),
  path.join(core, 'judgment.js'),
  path.join(core, 'google-closes.js'),
  path.join(core, 'close-families.js'),
  path.join(core, 'fact-reply.js'),
  path.join(core, 'file-attach.js'),
  path.join(core, 'intent.js'),
  path.join(core, 'actions.js'),
  path.join(repo, 'flow-trial-extension', 'src', 'receipt-copy.js'),
  path.join(addon, 'src', 'payloads.js'),
  path.join(addon, 'src', 'decide.js')
];

function load() {
  const sandbox = { module: undefined, console };
  vm.createContext(sandbox);
  for (const file of SOURCE_ORDER) {
    vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
  }
  return {
    decide: vm.runInContext('GlanceDecide.decide', sandbox),
    planFor: vm.runInContext('FlowActions.planFor', sandbox),
    classify: vm.runInContext('FlowIntent.classify', sandbox),
    payloads: vm.runInContext('GlancePayloads', sandbox),
    receipt: vm.runInContext('FlowReceipt', sandbox)
  };
}

const NOW = new Date('2026-09-17T12:00:00Z');
const api = load();
let failures = 0;

function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else {
    failures++;
    console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : '');
  }
}

function kinds(decision) {
  return (decision.steps || []).map((step) => step.kind);
}

function chromeKinds(text) {
  const intent = api.classify(text, { senderEmail: 'dana@meridian.com', now: NOW, calibration: null });
  const plan = api.planFor(intent, { threadUrl: 'https://mail.google.com/mail/u/0/#all/thread', hasThreadAttachment: false });
  return {
    type: intent && intent.type,
    id: plan && plan.id,
    kinds: plan && plan.steps ? plan.steps.map((step) => step.kind) : []
  };
}

function judge(text) {
  return api.decide(text, { senderEmail: 'dana@meridian.com', senderName: 'Dana Meridian', now: NOW, threadUrl: 'https://mail.google.com/mail/u/0/#all/thread' });
}

const meeting = 'Let’s do a call Friday, September 18 at 3pm to review the contract.';
const confirm = meeting + ' Could you please confirm you can make it?';
const approved = 'Approved, go ahead.';
const sendFile = 'Could you please send the signed contract?';
const fact = 'What is the balance in the Acme sheet?';
const noise = 'Hope you are well. Just wanted to say hello and see how things are going.';

{
  const chrome = chromeKinds(meeting);
  const decision = judge(meeting);
  check('meeting speaks', decision.speak === true, decision);
  check('meeting matches the Chrome process id', decision.processId === chrome.id && chrome.id === 'schedule', { decision: decision.processId, chrome: chrome.id });
  check('meeting matches the Chrome step kinds', JSON.stringify(kinds(decision)) === JSON.stringify(chrome.kinds), { decision: kinds(decision), chrome: chrome.kinds });
  check('meeting is calendar then task', JSON.stringify(kinds(decision)) === JSON.stringify(['calendar', 'googleTask']), kinds(decision));
  check('every step refuses send', decision.steps.every((step) => step.params && step.params.send === false), decision.steps);
}

{
  const chrome = chromeKinds(confirm);
  const decision = judge(confirm);
  check('confirm speaks', decision.speak === true, decision);
  check('confirm is schedule-confirm', decision.processId === 'schedule-confirm' && decision.processId === chrome.id, decision.processId);
  check('confirm kinds match Chrome', JSON.stringify(kinds(decision)) === JSON.stringify(['calendar', 'gmailDraft', 'googleTask']), kinds(decision));
  const draft = decision.steps.find((step) => step.kind === 'gmailDraft');
  check('draft addresses the confirm ask', draft && /confirm/i.test(draft.params.what), draft && draft.params.what);
}

{
  const chrome = chromeKinds(approved);
  const decision = judge(approved);
  check('approval speaks', decision.speak === true, decision);
  check('approval is the log-it task', decision.processId === 'log-it' && JSON.stringify(kinds(decision)) === JSON.stringify(chrome.kinds) && kinds(decision)[0] === 'googleTask', { decision: kinds(decision), chrome: chrome.kinds });
}

check('file ask stays quiet', judge(sendFile).speak === false && judge(sendFile).reason === 'file', judge(sendFile));
check('sheet fact stays quiet', judge(fact).speak === false && judge(fact).reason === 'fact', judge(fact));
check('small talk stays quiet', judge(noise).speak === false, judge(noise));
check('empty stays quiet', api.decide('', { now: NOW }).speak === false && api.decide('', { now: NOW }).quiet === 'Nothing to close.', api.decide('', { now: NOW }));

{
  const he = api.decide('שלום, מה נשמע היום בלי שום בקשה ובלי תאריך.', { now: NOW });
  check('hebrew with no close stays quiet', he.speak === false, he);
  check('quiet hebrew line', he.quiet === 'אין מה לסגור.', he);
}

{
  const body = api.payloads.draftBody({ senderName: 'Dana Meridian', params: { what: 'Could you please confirm you can make it?' } });
  check('draft greets the sender', body.indexOf('Hi Dana,') === 0, body);
  check('draft quotes the ask and leaves a blank', /Following up on: Could you please confirm/.test(body) && body.indexOf('[Write your reply here]') !== -1, body);
  check('draft body is not a send', !/sent the|I have sent|mail\.send/i.test(body), body);
}

{
  const held = api.payloads.calendarPayload({
    timeZone: 'Asia/Jerusalem',
    params: { title: 'Hold', dateIso: '2026-09-18', requireTime: true, quote: 'Hold Friday at 3.' }
  });
  check('a hold with no clock is not an event', held.ok === false, held);
  const event = api.payloads.calendarPayload({
    timeZone: 'Asia/Jerusalem',
    threadUrl: 'https://mail.google.com/mail/u/0/#all/abc',
    params: { title: 'Meeting Sep 18', dateIso: '2026-09-18', hour: 15, minute: 0, quote: 'Review the contract' }
  });
  check('calendar event is 15:00 for 30 minutes', event.ok && event.body.start.dateTime === '2026-09-18T15:00:00' && event.body.end.dateTime === '2026-09-18T15:30:00' && event.body.start.timeZone === 'Asia/Jerusalem', event.body);
}

{
  const task = api.payloads.taskPayload({
    senderName: 'Dana',
    senderEmail: 'dana@meridian.com',
    subject: 'Contract',
    now: NOW,
    params: { title: 'Log this decision', dateIso: '2024-01-02', amount: '$10,000', what: 'Approved, go ahead.' }
  });
  check('a past day is not a due date', task.due === null, task);
  check('task title carries the sender', task.title === 'Dana — Log this decision', task.title);
  check('task notes quote the sentence', task.notes.indexOf('Approved, go ahead.') !== -1, task.notes);
}

{
  const manifest = JSON.parse(fs.readFileSync(path.join(addon, 'appsscript.json'), 'utf8'));
  const scopes = manifest.oauthScopes.slice().sort();
  const expected = [
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/gmail.addons.current.message.readonly',
    'https://www.googleapis.com/auth/gmail.compose',
    'https://www.googleapis.com/auth/tasks'
  ];
  check('scopes are the four allowed ones', JSON.stringify(scopes) === JSON.stringify(expected), scopes);
  check('contextual trigger is the open-message function', manifest.addOns.gmail.contextualTriggers[0].onTriggerFunction === 'onGmailMessageOpen');
  const host = fs.readFileSync(path.join(addon, 'Code.js'), 'utf8');
  check('host never calls send', !/gmail\.send|sendEmail|Drafts\.send|MailApp/.test(host), 'send path present');
  check('host creates a draft reply', host.indexOf('createDraftReply') !== -1);
}

{
  const built = fs.readFileSync(path.join(addon, 'CoreBundle.js'), 'utf8');
  const sandbox = { module: undefined, console };
  vm.createContext(sandbox);
  vm.runInContext(built, sandbox, { filename: 'CoreBundle.js' });
  const bundled = vm.runInContext('Glance.decide', sandbox);
  const direct = judge(meeting);
  const viaBundle = bundled(meeting, { senderEmail: 'dana@meridian.com', senderName: 'Dana Meridian', now: NOW });
  check('bundle matches the adapter on a meeting', viaBundle.speak === true && viaBundle.processId === direct.processId && JSON.stringify(viaBundle.steps.map((s) => s.kind)) === JSON.stringify(kinds(direct)), viaBundle);
  check('bundle exports the receipt', vm.runInContext('Glance.receipt.STATUS_HANDLED', sandbox) === 'Handled.');
}

if (failures) {
  console.error('\n' + failures + ' failed');
  process.exit(1);
}
console.log('\nAll checks passed');
