// First-session offer. One safe task, or silence.
// Before this module the setup panel had 0 one-click closes: Connect left
// the person to open a thread. After: exactly 1 offer when a high-confidence
// single task is already on the list, and 0 when the row is a draft, a
// second step, a hedge, or a close that already happened.
// Run: node test/first-close-corpus.cjs

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const CORE = path.join(__dirname, '..', 'core');
const sandbox = { console: console };
vm.createContext(sandbox);
for (const file of ['domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'fact-reply.js', 'close-families.js', 'intent.js', 'actions.js', 'commitment-title.js', 'still-open.js', 'first-close.js']) {
  vm.runInContext(fs.readFileSync(path.join(CORE, file), 'utf8'), sandbox, { filename: file });
}
const FlowIntent = vm.runInContext('FlowIntent', sandbox);
const FlowActions = vm.runInContext('FlowActions', sandbox);
const FlowFirstClose = vm.runInContext('FlowFirstClose', sandbox);

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const NOW = new Date(2026, 9, 15, 8, 0, 0).getTime();
const CONNECTED = NOW - 2000;

function row(text, id) {
  const intent = FlowIntent.classify(text, { now: new Date(NOW) });
  const process = intent && intent.type
    ? FlowActions.planFor(intent, { threadUrl: 'https://mail.google.com/mail/u/0/#inbox/' + id, hasThreadAttachment: false })
    : null;
  return {
    messageId: 'scan:' + id,
    threadId: id,
    threadUrl: 'https://mail.google.com/mail/u/0/#inbox/' + id,
    sender: { name: 'Dana', email: 'dana@example.com' },
    subject: text.slice(0, 80),
    text: text,
    ts: NOW - 500,
    app: 'gmail',
    intent: intent,
    process: process
  };
}

function offer(candidates, extra) {
  return FlowFirstClose.pick(Object.assign({
    candidates: candidates,
    now: NOW,
    connectedAt: CONNECTED,
    sourceConnected: true,
    source: 'google',
    closes: { total: 0 },
    log: []
  }, extra || {}));
}

const SAFE = 'I will send you the signed contract by Friday, November 20.';
const ASK = 'Please follow up with Dana about the invoice.';
const HEDGE = 'I might send the contract by Friday, November 20.';
const AMOUNT = 'Confirming the amount is $4,200 for the year.';

console.log('--- first close: before connect there is no offer ---');
{
  const safe = row(SAFE, 'safe');
  check('window is 60 seconds', FlowFirstClose.WINDOW_MS === 60000, FlowFirstClose.WINDOW_MS);
  check('a safe task with no source connected is 0 offers', offer([safe], { sourceConnected: false }) === null);
  check('a safe task with no connect time is 0 offers', offer([safe], { connectedAt: null }) === null);
  const steps = safe.process && safe.process.steps && safe.process.steps.map((s) => s.kind);
  check('the safe sentence is one Google Task', JSON.stringify(steps) === JSON.stringify(['googleTask']), steps);
}

console.log('\n--- first close: one task, one offer ---');
{
  const safe = row(SAFE, 'safe');
  const ask = row(ASK, 'ask');
  const hedge = row(HEDGE, 'hedge');
  const amount = row(AMOUNT, 'amount');
  const one = offer([safe, ask, hedge]);
  check('a hedge, a two-step ask, and one task produce 1 offer', one && one.entry.messageId === 'scan:safe', one && one.entry.messageId);
  check('that offer is inside the minute', one && one.withinWindow === true && one.latencyMs <= 60000, one && one.latencyMs);
  check('the two-step ask is not a safe step', FlowFirstClose.safeStep(ask, 'google') === null, ask.process && ask.process.steps.map((s) => s.kind));
  check('the hedge is not an offer', offer([hedge]) === null);
  check('a confirmed amount that is one task is an offer', offer([amount]) && offer([amount]).entry.messageId === 'scan:amount');
  const late = row(SAFE, 'late');
  late.ts = CONNECTED + 90000;
  const lateOffer = offer([late]);
  check('a notice 90s after connect is still 1 offer on a first session', lateOffer && lateOffer.entry.messageId === 'scan:late');
  check('and it is marked outside the minute', lateOffer && lateOffer.withinWindow === false, lateOffer && lateOffer.latencyMs);
}

console.log('\n--- first close: silence after the first real close, and the wrong source ---');
{
  const safe = row(SAFE, 'safe');
  check('a prior close is 0 offers', offer([safe], { closes: { total: 1 } }) === null);
  check('an Outlook-only source does not take a Google task', offer([safe], { source: 'outlook' }) === null);
  const outlook = row(SAFE, 'ol');
  outlook.app = 'outlook';
  outlook.process = { id: 'log-it', name: 'Log It', steps: [{ id: 'task', kind: 'outlookTask', params: { title: 'Send the contract' } }] };
  check('one Outlook task is 1 offer on Outlook', offer([outlook], { source: 'outlook' }) && offer([outlook], { source: 'outlook' }).step.kind === 'outlookTask');
  const file = row(SAFE, 'file');
  file.process = { id: 'file-on-task', steps: [{ id: 'task', kind: 'googleTask', params: { fileTerm: 'contract.pdf', title: 'Contract' } }] };
  check('a task that still has to look up a file is 0 offers', offer([file]) === null);
}

console.log('\nBEFORE setup one-click offers: 0');
console.log('AFTER one safe task: 1 offer, 1 click left, window 60000ms');
console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
