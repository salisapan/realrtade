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
check('the same subject with one matching minute and file links that file',
  subjectOnly.message && subjectOnly.message.id === 'm-sept' && !subjectOnly.reason, subjectOnly);

const noSplit = FlowOwaParse.uniqueGraphMessage(
  { subject: 'Invoice', senderEmail: 'a@b.com' },
  [oct, sept]
);
check('two mails with the same subject and no clock or file stay unresolved',
  !noSplit.message && noSplit.reason === 'suggest:unresolved' && /ambiguous|minute|file/.test(noSplit.detail || ''), noSplit);

const onlyNorth = FlowOwaParse.uniqueGraphMessage(
  { subject: 'Northwind agreement - signed PDF', senderEmail: 'flow@x.com' },
  [msg('m-nw', 'AQQkNw', '', [file('northwind-agreement-signed.pdf', 3072)], 'Northwind agreement - signed PDF')]
);
check('one subject with an empty chip and no id stays unresolved',
  !onlyNorth.message && onlyNorth.reason === 'suggest:unresolved' && /unconfirmed/.test(onlyNorth.detail || ''), onlyNorth);

const namedNorth = FlowOwaParse.uniqueGraphMessage(
  { subject: 'Northwind agreement - signed PDF', senderEmail: 'flow@x.com', attachments: [{ name: '…hwind-agreement-signed.pdf', sizeLabel: '3 KB' }] },
  [msg('m-nw', 'AQQkNw', '', [file('northwind-agreement-signed.pdf', 3072)], 'Northwind agreement - signed PDF')]
);
check('one subject links when the visible filename is on that message',
  namedNorth.message && namedNorth.message.id === 'm-nw', namedNorth);

const idNorth = FlowOwaParse.uniqueGraphMessage(
  { subject: 'Northwind agreement - signed PDF', senderEmail: 'flow@x.com', conversationId: 'AQQkNw' },
  [msg('m-nw', 'AQQkNw', '', [file('northwind-agreement-signed.pdf', 3072)], 'Northwind agreement - signed PDF')]
);
check('one subject links when the conversation id is on that message',
  idNorth.message && idNorth.message.id === 'm-nw', idNorth);

const unreadNorth = FlowOwaParse.uniqueGraphMessage(
  { subject: 'Northwind agreement - signed PDF', senderEmail: 'flow@x.com', attachments: [{ name: '…hwind-agreement-signed.pdf', sizeLabel: '3 KB' }] },
  [Object.assign(msg('m-nw', 'AQQkNw', '', [], 'Northwind agreement - signed PDF'), { attachmentsUnread: true })]
);
check('a failed attachment read stays unresolved',
  !unreadNorth.message && /attachments-unknown/.test(unreadNorth.detail || ''), unreadNorth);

const wrongOnly = FlowOwaParse.uniqueGraphMessage(
  { subject: 'Northwind agreement - signed PDF', senderEmail: 'flow@x.com', attachments: [file('other.pdf', 3072)] },
  [msg('m-nw', 'AQQkNw', SEPT, [file('northwind-agreement-signed.pdf', 3072)], 'Northwind agreement - signed PDF')]
);
check('one subject does not save a different file',
  !wrongOnly.message && wrongOnly.reason === 'suggest:unresolved', wrongOnly);

const alphaWhen = '2026-10-08T14:37:00.000Z';
const betaWhen = '2026-10-08T14:38:00.000Z';
const alpha = msg('m-alpha', 'AQQkQ3', alphaWhen, [file('statement-q3-alpha.pdf', 3072)], 'Q3 fund statement');
const beta = msg('m-beta', 'AQQkQ3', betaWhen, [file('statement-q3-beta.pdf', 4096)], 'Q3 fund statement');
const linkedAlpha = FlowOwaParse.uniqueGraphMessage(
  { subject: 'Q3 fund statement', receivedDateTime: alphaWhen, attachments: [{ name: '…t-q3-alpha.pdf', sizeLabel: '3 KB' }] },
  [beta, alpha]
);
const linkedBeta = FlowOwaParse.uniqueGraphMessage(
  { subject: 'Q3 fund statement', receivedDateTime: betaWhen, attachments: [{ name: '…nt-q3-beta.pdf', sizeLabel: '4 KB' }] },
  [alpha, beta]
);
check('14:37 and a truncated alpha chip link statement-q3-alpha',
  linkedAlpha.message && linkedAlpha.message.id === 'm-alpha', linkedAlpha);
check('14:38 and a truncated beta chip link statement-q3-beta',
  linkedBeta.message && linkedBeta.message.id === 'm-beta', linkedBeta);

const pm = FlowOwaParse.clockToIso('08/10/2026 3:05 PM');
const afternoon = FlowOwaParse.clockToIso('08/10/2026 15:05');
const morning = FlowOwaParse.clockToIso('08/10/2026 03:05');
const bare = FlowOwaParse.clockToIso('08/10/2026 3:05');
check('3:05 PM is 15:05, not 03:05', pm && pm === afternoon && pm !== morning, { pm: pm, afternoon: afternoon, morning: morning });
check('a one-digit hour with no marker is not a time', bare === '');
check('a two-digit 24-hour clock is that hour',
  FlowOwaParse.clockToIso('08/10/2026 14:01') &&
  FlowOwaParse.clockToIso('08/10/2026 12:53') &&
  FlowOwaParse.clockToIso('08/10/2026 00:46') &&
  FlowOwaParse.clockToIso('ה 08/10/2026 14:01') === FlowOwaParse.clockToIso('08/10/2026 14:01'));
check('Hebrew אחה"צ is PM and לפנה"צ is AM',
  FlowOwaParse.clockToIso('08/10/2026 3:05 אחה"צ') === afternoon &&
  FlowOwaParse.clockToIso('08/10/2026 3:05 לפנה"צ') === morning);
check('both meridians are not a time', FlowOwaParse.clockToIso('08/10/2026 3:05 AM PM') === '');

const ten = '2026-10-08T10:05:00.000Z';
const twentyTwo = '2026-10-08T22:05:00.000Z';
const pairTen = FlowOwaParse.clockPair('08/10/2026 10:05');
check('an unmarked 10:05 is ambiguous and names the other hour',
  pairTen.ambiguous === true && pairTen.iso && pairTen.altIso && pairTen.iso !== pairTen.altIso, pairTen);
check('14:01, 00:46, 12:53, and 3:05 PM are not an ambiguous hour',
  FlowOwaParse.clockPair('08/10/2026 14:01').ambiguous === false &&
  FlowOwaParse.clockPair('08/10/2026 00:46').ambiguous === false &&
  FlowOwaParse.clockPair('08/10/2026 12:53').ambiguous === false &&
  FlowOwaParse.clockPair('08/10/2026 3:05 PM').ambiguous === false);
check('a page with 14:01 proves a 24-hour clock, and 03:50 PM does not',
  FlowOwaParse.pageProves24h({ body: { textContent: 'ה 08/10/2026 14:01' } }) === true &&
  FlowOwaParse.pageProves24h({ body: { textContent: 'Last checked 03:50 PM' } }) === false);

function hourPane(extra) {
  return Object.assign({
    subject: 'Northwind agreement - signed PDF',
    senderEmail: 'flow@x.com',
    receivedDateTime: ten,
    clockAmbiguous: true,
    clockAlt: twentyTwo,
    attachments: [{ name: '…hwind-agreement-signed.pdf', sizeLabel: '3 KB' }]
  }, extra || {});
}
const m10 = msg('m-10', 'c10', ten, [file('northwind-agreement-signed.pdf', 3072)], 'Northwind agreement - signed PDF');
const m22 = msg('m-22', 'c22', twentyTwo, [file('northwind-agreement-signed.pdf', 3072)], 'Northwind agreement - signed PDF');
const bothHours = FlowOwaParse.uniqueGraphMessage(hourPane(), [m10, m22]);
check('10:05 and 22:05 both present stay unresolved without a 24-hour proof',
  !bothHours.message && /hour-ambiguous/.test(bothHours.detail || ''), bothHours);
const onlyTen = FlowOwaParse.uniqueGraphMessage(hourPane(), [m10]);
check('only 10:05 present may link that file', onlyTen.message && onlyTen.message.id === 'm-10', onlyTen);
const onlyTwentyTwo = FlowOwaParse.uniqueGraphMessage(hourPane(), [m22]);
check('only 22:05 present may link that hour', onlyTwentyTwo.message && onlyTwentyTwo.message.id === 'm-22', onlyTwentyTwo);
const provedFormat = FlowOwaParse.uniqueGraphMessage(hourPane({ timeFormat: 'HH:mm' }), [m22, m10]);
check('mailboxSettings HH:mm links the literal 10:05', provedFormat.message && provedFormat.message.id === 'm-10', provedFormat);
const provedCycle = FlowOwaParse.uniqueGraphMessage(hourPane({ hourCycle: 'h23' }), [m22, m10]);
check('hourCycle h23 links the literal 10:05', provedCycle.message && provedCycle.message.id === 'm-10', provedCycle);
const provedPage = FlowOwaParse.uniqueGraphMessage(hourPane({ pageHour24: true }), [m22, m10]);
check('another hour of 13 or more on the page links the literal 10:05', provedPage.message && provedPage.message.id === 'm-10', provedPage);
const late = FlowOwaParse.uniqueGraphMessage(
  { subject: 'Northwind agreement - signed PDF', senderEmail: 'flow@x.com', receivedDateTime: '2026-10-08T14:01:00.000Z', attachments: [{ name: '…hwind-agreement-signed.pdf', sizeLabel: '3 KB' }] },
  [msg('m-14', 'c14', '2026-10-08T14:01:00.000Z', [file('northwind-agreement-signed.pdf', 3072)], 'Northwind agreement - signed PDF')]
);
check('an unmarked hour of 14 links that mail', late.message && late.message.id === 'm-14', late);

const outlookSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'content-outlook.js'), 'utf8');
check('newest-by-subject is not a file link',
  outlookSrc.indexOf('function messageBySubject') < 0 && outlookSrc.indexOf('inbox-subject') < 0 && outlookSrc.indexOf('function recentInbox') < 0 && outlookSrc.indexOf('uniqueGraphMessage') > 0);
check('the mailbox match stops at 200', /MAILBOX_MATCH_CEILING\s*=\s*200/.test(outlookSrc));
check('a failed attachment read is kept', outlookSrc.indexOf('attachmentsUnread') > 0);

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
