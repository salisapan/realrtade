// Task title from the sentence that fired the intent. Subject is not a title.
// No clean verb and object stays empty so the writer keeps neutralTitle.
// Run: node test/commitment-title-corpus.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const { FlowCommitmentTitle: T } = require('../core/commitment-title.js');

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
