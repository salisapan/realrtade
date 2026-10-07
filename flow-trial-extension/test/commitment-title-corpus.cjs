// Task title from the sentence that fired the intent. Subject is not a title.
// No clean verb and object stays empty so the writer keeps neutralTitle.
// Run: node test/commitment-title-corpus.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const { FlowCommitmentTitle: T } = require('../core/commitment-title.js');
const { FlowGraphMail: Mail } = require('../core/graph-mail.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

check('renew the passport application, date stripped, imperative',
  T.titleFromBody('We agreed to renew the passport application by Friday.') === 'Renew the passport application');
check('send the signed contract, you and the date stripped',
  T.titleFromBody('I will send you the signed contract by Friday, October 10.') === 'Send the signed contract');
check('file the amendment, trailing please and the date stripped',
  T.titleFromBody('We agreed to file the amendment by October 21 please.') === 'File the amendment');
check('Hebrew promise keeps the source language',
  T.titleFromBody('אשלח לך את החוזה החתום עד יום שלישי') === 'לשלוח את החוזה החתום');
check('a date with no verb is not a title',
  T.titleFromBody('The deadline is Friday, October 10.') === '' && T.titleFromBody('by Friday') === '');

check('a subject line and a Hi greeting are not the title',
  T.fromPayload({
    subject: 'Gate 0.9.34 To Do title',
    text: 'Gate 0.9.34 To Do title\nHi, We agreed to renew the passport application by Friday. Thanks, Flow Gate'
  }) === 'Renew the passport application');
check('Hi, I will send you the signed contract drops the greeting, you, and the date',
  T.titleFromBody('Hi, I will send you the signed contract by Friday, October 10. Thanks') === 'Send the signed contract');
check('Hi Dana, we agreed to file the amendment drops the greeting and the date',
  T.titleFromBody('Hi Dana, we agreed to file the amendment by October 21 please.') === 'File the amendment');
check('a Hebrew greeting is not the title',
  T.titleFromBody('היי, אשלח לך את החוזה עד שלישי') === 'לשלוח את החוזה');
check('a greeting in the body wins over the subject field',
  T.fromPayload({
    subject: 'Gate 0.9.34 To Do title',
    bodyText: 'Hi, We agreed to renew the passport application by Friday.'
  }) === 'Renew the passport application');
const GATE_HTML = '<html><body><div dir="auto">Hi,<br/><br/>We agreed to renew the passport application by Friday.<br/><br/>Thanks, Flow Gate</div></body></html>';
const GATE_PLAIN = 'Hi,\n\nWe agreed to renew the passport application by Friday.\n\nThanks, Flow Gate';
function titled(raw) {
  return T.titleFromBody(Mail.ownText(Mail.htmlToText(raw)));
}
check('blank lines keep the greeting off the title', titled(GATE_PLAIN) === 'Renew the passport application');
check('a collapsed Hi label with the date already gone is still the commitment',
  T.titleFromBody('Hi, We agreed to renew the passport application') === 'Renew the passport application');
check('Gate HTML through htmlToText and ownText is the commitment', titled(GATE_HTML) === 'Renew the passport application');
check('CRLF blank lines are the same title', titled(GATE_PLAIN.replace(/\n/g, '\r\n')) === 'Renew the passport application');
check('a non-breaking space in the greeting is the same title',
  titled('Hi,\u00a0\n\nWe agreed to renew the passport application by Friday.\n\nThanks, Flow Gate') === 'Renew the passport application');
check('a zero-width mark inside the verb is the same title',
  titled('Hi,\n\nWe\u200b agreed to renew the passport\u200b application by Friday.\n\nThanks, Flow Gate') === 'Renew the passport application');
check('the r34 subject line plus the body is the commitment',
  titled('Gate 0.9.34 To Do title\nHi, We agreed to renew the passport application by Friday. Thanks, Flow Gate') === 'Renew the passport application');
check('the write payload is that plain text, not the HTML',
  T.fromPayload({ subject: 'Gate 0.9.35 To Do title', text: Mail.ownText(Mail.htmlToText(GATE_HTML)) }) === 'Renew the passport application');

check('the span is the firing sentence, not the one beside it',
  T.titleFromBody('Thanks for the note. We agreed to renew the passport application by Friday.') === 'Renew the passport application');
check('the subject is not the title',
  T.fromPayload({
    subject: 'Renew the passport application',
    text: 'See you next week.',
    label: 'Log commitment for Oct 9'
  }) === '');
check('a body span wins over the chip label and the sender name',
  T.fromPayload({
    subject: 'Passport',
    senderName: 'flow',
    label: 'Log commitment for Oct 9',
    text: 'We agreed to renew the passport application by Friday.'
  }) === 'Renew the passport application');
check('params.what is used only when the body is empty, and a fragment is not invented',
  T.fromPayload({ params: { what: 'file the amendment' }, label: 'File the amendment' }) === '');

const long = 'We agreed to renew the passport application and the supporting identity documents by Friday.';
const clipped = T.titleFromBody(long);
check('a long span stops at a word boundary inside 60 characters',
  clipped.length <= 60 && clipped.indexOf('documents') < 0 && /identity$/.test(clipped), clipped);

const judgment = fs.readFileSync(path.join(__dirname, '..', 'core', 'judgment.js'), 'utf8');
check('neutralTitle still names a dated chip from the date text',
  /return 'Log commitment for ' \+ facts\.dateText/.test(judgment));

if (failures) {
  console.log('\n' + failures + ' failed');
  process.exit(1);
}
console.log('\nall passed');
