// A pane links to one Graph message, or it stays unresolved.
// Run: node test/pane-link-corpus.cjs

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = { module: undefined, console };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'core', 'owa-parse.js'), 'utf8'), sandbox, { filename: 'owa-parse.js' });
const FlowOwaParse = vm.runInContext('FlowOwaParse', sandbox);

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const SEPT = '2026-09-30T14:01:00.000Z';
const OCT = '2026-10-08T09:12:00.000Z';
const V1 = '2026-10-02T11:00:00.000Z';
const V2 = '2026-10-07T16:40:00.000Z';

function msg(id, conv, when, files, subject) {
  return {
    id: id,
    conversationId: conv,
    internetMessageId: '<' + id + '@mail.test>',
    subject: subject,
    receivedDateTime: when,
    attachments: files
  };
}

function file(name, size) {
  return { name: name, size: size, contentType: 'application/pdf', isInline: false };
}

function pane(conv, when, files) {
  return { conversationId: conv, receivedDateTime: when, attachments: files };
}

const sept = msg('m-sept', 'AQQkSept', SEPT, [file('invoice-sept.pdf', 3072)], 'Invoice');
const oct = msg('m-oct', 'AQQkOct', OCT, [file('invoice-oct.pdf', 4096)], 'Invoice');
const linkedSept = FlowOwaParse.uniqueGraphMessage(pane('AQQkSept', SEPT, [file('invoice-sept.pdf', 3072)]), [oct, sept]);
check('September invoice links to invoice-sept, not the newer October file',
  linkedSept.message && linkedSept.message.id === 'm-sept' && !linkedSept.reason,
  linkedSept);

const v1 = msg('m-v1', 'AQQkContract', V1, [file('contract-v1.pdf', 2200)], 'Contract');
const v2 = msg('m-v2', 'AQQkContract', V2, [file('contract-v2.pdf', 2800)], 'Contract');
const linkedV1 = FlowOwaParse.uniqueGraphMessage(pane('AQQkContract', V1, [file('contract-v1.pdf', 2200)]), [v2, v1]);
check('contract v1 stays contract v1 when v2 is newer in the same conversation',
  linkedV1.message && linkedV1.message.id === 'm-v1', linkedV1);

const older = msg('m-old', 'AQQkThread', V1, [file('scope-v1.pdf', 3072)], 'RE: Scope');
const newer = msg('m-new', 'AQQkThread', V2, [file('scope-v2.pdf', 5120)], 'RE: Scope');
const linkedOld = FlowOwaParse.uniqueGraphMessage(pane('AQQkThread', V1, [file('scope-v1.pdf', 3072)]), [newer, older]);
check('an RE: thread keeps the open file, not the newer one',
  linkedOld.message && linkedOld.message.id === 'm-old', linkedOld);

const twinA = msg('m-a', 'AQQkTwin', V1, [file('scope-v1.pdf', 3072)], 'RE: Scope');
const twinB = msg('m-b', 'AQQkTwin', V1, [file('scope-v1.pdf', 3072)], 'RE: Scope');
const twins = FlowOwaParse.uniqueGraphMessage(pane('AQQkTwin', V1, [file('scope-v1.pdf', 3072)]), [twinA, twinB]);
check('two candidates with the same minute and file stay unresolved',
  !twins.message && twins.reason === 'suggest:unresolved');

const mismatch = FlowOwaParse.uniqueGraphMessage(pane('AQQkSept', SEPT, [file('invoice-oct.pdf', 4096)]), [sept, oct]);
check('a file that is not on the open pane stays unresolved',
  !mismatch.message && mismatch.reason === 'suggest:unresolved');

const subjectOnly = FlowOwaParse.uniqueGraphMessage(
  { subject: 'Invoice', senderEmail: 'a@b.com', receivedDateTime: SEPT, attachments: [file('invoice-sept.pdf', 3072)] },
  [oct, sept]
);
check('subject and sender alone do not link a message',
  !subjectOnly.message && subjectOnly.reason === 'suggest:unresolved');

const one = FlowOwaParse.uniqueGraphMessage(
  pane('AQQkGlanceE2ENorthwindConv', '2026-10-08T14:01:00.000Z', [file('northwind-agreement-signed.pdf', 3072)]),
  [msg('AQMkGlanceE2ENorthwindMsg', 'AQQkGlanceE2ENorthwindConv', '2026-10-08T14:01:00.000Z', [file('northwind-agreement-signed.pdf', 3072)], 'Northwind agreement - signed PDF')]
);
check('one real PDF that matches the pane is that message',
  one.message && one.message.id === 'AQMkGlanceE2ENorthwindMsg', one);

const labeled = FlowOwaParse.uniqueGraphMessage(
  { conversationId: 'AQQkSept', receivedDateTime: SEPT, attachments: [{ name: 'invoice-sept.pdf', sizeLabel: '3 KB' }] },
  [msg('m-sept', 'AQQkSept', SEPT, [file('invoice-sept.pdf', 3072)], 'Invoice'), oct]
);
check('a page that shows 3 KB links to the 3072-byte file',
  labeled.message && labeled.message.id === 'm-sept', labeled);

const labelMiss = FlowOwaParse.uniqueGraphMessage(
  { conversationId: 'AQQkSept', receivedDateTime: SEPT, attachments: [{ name: 'invoice-sept.pdf', sizeLabel: '9 KB' }] },
  [sept]
);
check('a displayed size that is not the file stays unresolved',
  !labelMiss.message && labelMiss.reason === 'suggest:unresolved');

const subHit = FlowOwaParse.matchEntryHow(
  { subject: 'Invoice', senderEmail: 'dana@acme.com', receivedDateTime: SEPT },
  [{ messageId: 'long', subject: 'Invoice October details', sender: { email: 'dana@acme.com' }, receivedDateTime: OCT }]
);
check('a subject substring is not a match', !subHit);

const many = FlowOwaParse.matchEntryHow(
  { subject: 'Invoice', senderEmail: 'dana@acme.com', receivedDateTime: SEPT },
  [
    { messageId: 'a', subject: 'Invoice', sender: { email: 'dana@acme.com' }, receivedDateTime: SEPT },
    { messageId: 'b', subject: 'Invoice', sender: { email: 'dana@acme.com' }, receivedDateTime: '2026-09-30T18:00:00.000Z' }
  ]
);
check('two exact subject hits are not the first one', !many);

const exact = FlowOwaParse.matchEntryHow(
  { subject: 'Pilot proposal', senderEmail: 'ai.local.flow@gmail.com', receivedDateTime: '2026-10-05T10:00:00Z' },
  [{ messageId: 'graph-AAA', subject: 'Pilot proposal', sender: { email: 'ai.local.flow@gmail.com' }, receivedDateTime: '2026-10-05T09:55:00Z' }]
);
check('one exact subject and sender still matches', exact && exact.entry && exact.entry.messageId === 'graph-AAA', exact);

console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
