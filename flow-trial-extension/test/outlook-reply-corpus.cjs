// Outlook reply draft body: greeting, no em dash, both asks with placeholder.
// Run: node test/outlook-reply-corpus.cjs
const { FlowOutlookReply: R } = require('../core/outlook-reply.js');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const LIVE = 'Hi Sali,\n\nCould you review the attached pilot proposal and confirm by Wednesday whether we can start next week? Also, please send me the name of the person on your side who will own onboarding.\n\nThanks,\nFlow team';

console.log('\n--- greeting ---\n');
{
  check('skips display name equal to local-part (flow)', R.greetingName('flow', 'ai.local.flow@gmail.com', LIVE) == null);
  check('signature Flow team is group -> no personal greeting name', R.greetingName('flow', 'ai.local.flow@gmail.com', LIVE) == null);
  check('greeting line is Hi, when no good name', R.greetingLine('flow', 'ai.local.flow@gmail.com', LIVE) === 'Hi,');
  check('real first name is kept', R.greetingName('Dana Cole', 'dana@acme.com', 'Hi\n\nPlease send the lease.\n\nThanks,\nDana') === 'Dana');
}

console.log('\n--- live body ---\n');
{
  const body = R.buildBody({
    intent: { type: 'request', entities: { when: 'Wednesday', what: 'confirm by Wednesday' }, facts: { date: { raw: 'Wednesday', iso: '2026-10-07' } } },
    text: LIVE,
    subject: 'Could you review the pilot proposal and confirm by Wednesday?',
    senderName: 'flow',
    senderEmail: 'ai.local.flow@gmail.com'
  });
  check('starts with Hi,', /^Hi,/.test(body), body);
  check('no em dash', body.indexOf('\u2014') === -1 && body.indexOf('—') === -1, body);
  check('mentions pilot / review', /pilot proposal/i.test(body) && /review/i.test(body), body);
  check('mentions Wednesday or confirm', /Wednesday|confirm/i.test(body), body);
  check('onboarding owner placeholder', /onboarding owner[\s\S]*\[name\]/i.test(body), body);
}

console.log('\n' + (failures ? 'FAILED: ' + failures : 'All passed'));
process.exit(failures ? 1 : 0);
