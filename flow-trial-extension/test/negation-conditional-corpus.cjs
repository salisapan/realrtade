// Negation and conditional asks stay quiet unless a real live ask remains.
// The stream fixture is the attached rows. Two of them name a live meeting
// but the reader is only in Cc: that locked rule stays quiet.
// v2syn-1205, v2syn-1231, and v2syn-1237 are a past "we agreed to" the
// user sent themself. The title is the verb plus the object.
// v2syn-3328 is self-sent. The title is Send the tax form, a task, no draft.
// A call with no person uses the subject.
// A receipt silence is only a payment attestation, through the shared judge.
// A signed contract on Gmail is the file chain, not a reply.
// With no profile, an aria-label name is the known name. names-pending is
// not a quiet. After the wait, known names judge the greeting.
// Run: node test/negation-conditional-corpus.cjs
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const FIXTURE = path.join(__dirname, 'fixtures', 'negation-conditional-stream-fixture.jsonl');
const engine = { module: undefined, console };
vm.createContext(engine);
for (const f of ['domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'close-families.js', 'fact-reply.js', 'intent.js', 'actions.js', 'file-attach.js', 'resolution.js', 'draft-reply.js', 'incoming-judge.js', 'commitment-title.js', 'display-copy.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'core', f), 'utf8'), engine, { filename: f });
}
const J = vm.runInContext('FlowIncomingJudge', engine);
const Intent = vm.runInContext('FlowIntent', engine);
const Resolution = vm.runInContext('FlowResolution', engine);
const Families = vm.runInContext('FlowCloseFamilies', engine);

const OWN_GMAIL = 'ai.local.flow@gmail.com';
const OWN_OUTLOOK = 'glance.salisapan@outlook.com';
const NAMES = ['Sali', 'Sali Sapan', 'סאלי'];
const NOW = new Date('2026-10-16T12:00:00Z');
// The reader is only in Cc, and the mail does not greet them. The fixture
// marks these two as offer. The Cc rule stays.
const CC_ONLY_QUIET = {
  'v2syn-1641': true,
  'v2syn-1792': true
};

function fail(msg) {
  console.log('FAIL: ' + msg);
  process.exit(1);
}

function judgeRow(row) {
  const from = row.from || {};
  const sender = from.email ? from : { name: from.name || 'Dana Levi', email: 'dana@acme.io' };
  return J.judge({
    text: row.body,
    subject: row.subject || '',
    sender: sender,
    surface: row.surface || 'gmail',
    attachmentCount: row.attachmentCount || 0,
    to: row.to || [],
    cc: row.cc || [],
    ownAddresses: [OWN_GMAIL, OWN_OUTLOOK],
    userName: 'Sali',
    ownNames: NAMES,
    direction: 'inbound',
    inbound: true,
    now: NOW,
    threadUrl: 'https://example.invalid/t'
  });
}

function selfJudge(row) {
  const from = row.from;
  return J.judge({
    text: row.body,
    subject: row.subject || '',
    sender: from,
    surface: 'gmail',
    to: row.to,
    cc: [],
    ownAddresses: [OWN_GMAIL, OWN_OUTLOOK],
    userName: 'Sali',
    ownNames: NAMES,
    direction: 'self',
    inbound: false,
    now: NOW,
    threadUrl: 'https://example.invalid/t'
  });
}

const rows = fs.readFileSync(FIXTURE, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
if (rows.length !== 135) fail('fixture rows ' + rows.length);

const fixed = {};
let ccHeld = 0;
for (const row of rows) {
  const out = judgeRow(row);
  const shown = Boolean(out && out.show === true);
  const wantOffer = row.expected === 'offer' && !CC_ONLY_QUIET[row.id];
  if (CC_ONLY_QUIET[row.id]) {
    ccHeld += 1;
    if (shown) fail(row.id + ' is only in Cc and offered ' + (out.intent && out.intent.label));
    continue;
  }
  if (wantOffer !== shown) {
    const reason = shown ? ('offer ' + (out.intent && out.intent.type) + ' ' + (out.intent && out.intent.label)) : (out && out.reason);
    fail(row.id + ' ' + row.category + ' wanted ' + row.expected + ' got ' + reason);
  }
  fixed[row.category] = (fixed[row.category] || 0) + 1;
}

if (ccHeld !== 2) fail('cc-only count ' + ccHeld);
if (typeof Families.commitmentHeldBack !== 'function') fail('commitmentHeldBack missing');
if (Families.commitmentHeldBack('Do not pay the $89 invoice until we confirm.') !== true) fail('hold did not stay back');
if (Families.commitmentHeldBack('Please pay the 1,200 ILS invoice by Sunday.') !== false) fail('live pay was held');
if (Families.commitmentHeldBack('We confirmed it, so please pay the 1,200 ILS invoice by Sunday.') !== false) fail('confirmed pay was held');
if (Families.commitmentHeldBack('If you can, send me the signed contract today.') !== false) fail('if you can was held');

const AGREED = [
  { id: 'v2syn-1205', subject: 'FW: Note to self', body: 'We agreed to book the venue by Wednesday, October 14. Thanks!', from: { name: 'Sali Sapan', email: OWN_GMAIL }, to: [OWN_GMAIL], label: 'Book the venue' },
  { id: 'v2syn-1231', subject: 'Note to self', body: 'We agreed to renew the passport application by Wednesday, October 14.\n\nThank you,\nSali', from: { name: 'Sali Sapan', email: OWN_GMAIL }, to: [OWN_GMAIL], label: 'Renew the passport application' },
  { id: 'v2syn-1237', subject: 'todo', body: 'We agreed to file the tax return by Wednesday, October 14. Regards', from: { name: 'Sali Sapan', email: OWN_GMAIL }, to: [OWN_GMAIL], label: 'File tax return' }
];
for (const row of AGREED) {
  const out = selfJudge(row);
  const label = out && out.intent && out.intent.label;
  if (!out || out.show !== true || label !== row.label) fail(row.id + ' label ' + label + ' ' + (out && out.reason));
}

const future = selfJudge({
  subject: 'Re: Re: todo',
  body: 'We agreed to call the bank by Thursday. Regards, Sali',
  from: { name: 'Sali Sapan', email: OWN_GMAIL },
  to: [OWN_GMAIL]
});
const futureSteps = ((future && future.process && future.process.steps) || []).map((s) => s.kind);
if (!future || future.show !== true || !future.intent || future.intent.label !== 'Call the bank' || futureSteps.join(',') !== 'googleTask') {
  fail('v2syn-1216 self-sent we agreed is a task, got ' + (future && future.intent && future.intent.type) + ' ' + (future && future.intent && future.intent.label) + ' ' + futureSteps.join(','));
}

const tax = selfJudge({
  subject: 'Need the signed contract',
  body: 'Following up on our call.\n\nPlease reply with the tax form attached by Friday.\n\nMany thanks,\nSali',
  from: { name: 'Sali Sapan', email: OWN_GMAIL },
  to: [OWN_GMAIL]
});
const taxSteps = ((tax && tax.process && tax.process.steps) || []).map((s) => s.kind);
if (!tax || tax.show !== true || !tax.intent || tax.intent.label !== 'Send the tax form' || taxSteps.join(',') !== 'googleTask') {
  fail('3328 label ' + (tax && tax.intent && tax.intent.label) + ' ' + taxSteps.join(','));
}

const call = selfJudge({
  subject: 'Re: the Q4 plan',
  body: 'Need to call tomorrow.',
  from: { name: 'Sali Sapan', email: OWN_GMAIL },
  to: [OWN_GMAIL]
});
if (!call || call.show !== true || !call.intent || call.intent.label !== 'Call about the Q4 plan') {
  fail('call about subject ' + (call && call.intent && call.intent.label) + ' ' + (call && call.reason));
}
const callNamed = selfJudge({
  subject: 'Reminder',
  body: 'Need to call the bank tomorrow.',
  from: { name: 'Sali Sapan', email: OWN_GMAIL },
  to: [OWN_GMAIL]
});
if (!callNamed || !callNamed.intent || callNamed.intent.label !== 'Call the bank') {
  fail('call the bank ' + (callNamed && callNamed.intent && callNamed.intent.label));
}
const heCall = selfJudge({
  subject: 'בהמשך לקליטת העובד החדש',
  body: 'אשמח אם תוכלי להחזיר לי טלפון ביום רביעי הבא?',
  from: { name: 'Sali Sapan', email: OWN_GMAIL },
  to: [OWN_GMAIL]
});
if (!heCall || !heCall.intent || heCall.intent.label !== 'שיחה בנושא קליטת העובד החדש') {
  fail('hebrew call subject ' + (heCall && heCall.intent && heCall.intent.label));
}

if (Resolution.attestsPayment('receipt') !== true || Resolution.attestsPayment('transfer') !== true) fail('payment attestation');
if (Resolution.attestsPayment('contract') !== false || Resolution.attestsPayment('quote') !== false || Resolution.attestsPayment('signed-copy') !== false) fail('deliverable is not a receipt');
if (J.silencesReceipt('Please send the receipt.') !== true) fail('receipt silence');
if (J.silencesReceipt('If you can, send me the signed contract today.') !== false) fail('contract was silenced as a receipt');

const ariaNames = Intent.readerNamesFrom({ profile: null, displayName: '', knownNames: ['Sali Sapan'] });
if (ariaNames.indexOf('Sali Sapan') === -1) fail('aria name missing ' + ariaNames.join(','));
const hiSali = Intent.classify('Hi Sali, please send the SOW by Friday.', {
  senderEmail: 'dana@acme.io',
  senderName: 'Dana Levi',
  subject: 'SOW',
  to: [OWN_GMAIL],
  cc: [],
  ownAddresses: [OWN_GMAIL, OWN_OUTLOOK],
  userName: '',
  ownNames: ariaNames,
  namesPending: false,
  now: NOW
});
if (!hiSali || !hiSali.type) fail('Hi Sali with an aria name stayed quiet');
const pending = Intent.classify('Hi Sali, please send the SOW by Friday.', {
  senderEmail: 'dana@acme.io',
  senderName: 'Dana Levi',
  subject: 'SOW',
  to: [OWN_GMAIL],
  ownAddresses: [OWN_GMAIL],
  userName: 'Glance',
  ownNames: [],
  namesPending: true,
  now: NOW
});
if (!pending || pending.namesPending !== true || pending.quiet) fail('names pending became a quiet');
const waited = Intent.classify('Hi Dana, please send the SOW by Friday.', {
  senderEmail: 'rachel@acme.io',
  senderName: 'Rachel',
  subject: 'SOW',
  to: [OWN_GMAIL],
  ownAddresses: [OWN_GMAIL],
  userName: '',
  ownNames: [],
  namesPending: false,
  namesWaitDone: true,
  now: NOW
});
if (!waited || waited.namesPending || waited.type) fail('names wait should judge Dana as not the reader');

const gmail = fs.readFileSync(path.join(ROOT, 'src', 'content-gmail.js'), 'utf8');
if (/FlowResolution\.owns\(/.test(gmail)) fail('content-gmail still classifies a receipt on its own');
if (!/FlowIncomingJudge\.silencesReceipt\(/.test(gmail)) fail('content-gmail does not ask the shared judge');

console.log('ok negation-conditional ' + rows.length + ' cc-only-quiet ' + ccHeld);
console.log(JSON.stringify(fixed));
