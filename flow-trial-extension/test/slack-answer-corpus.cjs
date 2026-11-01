// A request pointing at one Slack DM becomes one watch-only Do It, behind SLACK_ANSWER (off). Hebrew and English, positive and negative.
// Pure recognition and plan: nothing is called. Run: node test/slack-answer-corpus.cjs
'use strict';
const { FlowSlackAnswer: Z } = require('../core/slack-answer.js');
const { FlowSlackAnswerClose: C } = require('../core/slack-answer-close.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const ON = { SLACK_ANSWER: true };
const DM = 'D0123ABCDEF';
const LINK = 'https://acme.slack.com/archives/' + DM + '/p1760000000123456';
const OTHER = 'https://acme.slack.com/archives/D0999ZZZZZZ/p1760000000999999';
const CHANNEL = 'https://acme.slack.com/archives/C0123ABCDEF/p1760000000123456';

console.log('\n--- a request that points at one Slack DM ---\n');
const yes = [
  ['Please reply to me here: ' + LINK, 'mine'],
  ['Can you let me know in the Slack DM? ' + LINK, 'mine'],
  ['Get back to me on Slack about the contract. ' + LINK, 'mine'],
  ['Confirm in this thread when the invoice is sent ' + LINK, 'mine'],
  ['תענה לי בסלאק: ' + LINK, 'mine'],
  ['תחזור אליי בסלאק עם התשובה ' + LINK, 'mine'],
  ['I asked Dana to let me know in the Slack DM. ' + LINK, 'theirs'],
  ['ביקשתי ממנו שיעדכן אותי. ' + LINK + ' תעדכן אותי בסלאק', 'theirs']
];
for (const [text, dir] of yes) {
  const r = Z.recognize(text, dir);
  check('clear (' + dir + '): ' + text.slice(0, 50), r.kind === 'clear' && r.conversation === DM && r.direction === dir, r);
}

console.log('\n--- silence, with the reason ---\n');
const no = [
  ['Please reply to me here: ' + LINK + ' or ' + OTHER, 'several-chats', 'mine'],
  ['Please reply to me here: ' + CHANNEL, 'not-a-dm-link', 'mine'],
  ['Please reply to me here: https://acme.slack.com/team/U0123ABCDEF', 'not-a-dm-link', 'mine'],
  ['Maybe reply to me here if you want ' + LINK, 'hedge', 'mine'],
  ['אולי תענה לי בסלאק ' + LINK, 'hedge', 'mine'],
  ['No need to reply here ' + LINK, 'negation', 'mine'],
  ['אין צורך לענות בסלאק ' + LINK, 'negation', 'mine'],
  ['FYI the thread is here, reply here if needed ' + LINK, 'fyi', 'mine'],
  ['Ask Dana to reply here ' + LINK, 'third-party', 'mine'],
  ['The notes are in this DM ' + LINK, 'no-ask', 'mine'],
  ['Please reply to me here: ' + LINK, 'no-direction', undefined],
  ['Please reply to me here: ' + LINK, 'no-direction', 'both']
];
for (const [text, why, dir] of no) {
  const r = Z.recognize(text, dir);
  check('silent (' + why + '): ' + text.slice(0, 55), r.kind === 'block' && r.reason === why, r);
}
check('no Slack link at all is ignored (a DM is never guessed from a name)', Z.recognize('Please reply in the Slack DM with Dana', 'mine').kind === 'ignore' && Z.plan({ flags: ON, text: 'Please reply in the Slack DM with Dana', direction: 'mine' }).action === 'silence');
check('empty and null are ignored', Z.recognize('', 'mine').kind === 'ignore' && Z.recognize(null, 'mine').kind === 'ignore');
check('direction comes from the host, never from the words', Z.recognize('I will reply here: ' + LINK + ' let me know in the chat', 'mine').direction === 'mine');

console.log('\n--- the switch and the plan ---\n');
check('off by default', Z.SWITCH_DEFAULT === false && Z.plan({ text: yes[0][0], direction: 'mine' }).action === 'off');
const p = Z.plan({ flags: ON, text: yes[0][0], direction: 'mine' });
check('one Do It that only watches one DM; the answer step is the person\'s', p.action === 'offer' && p.approval === 'DoIt' && p.conversation === DM && p.steps.length === 2 && p.steps[0].kind === 'watch' && p.steps[0].proof === 'slack/message' && p.steps[1].kind === 'manual', p);
check('nothing in the plan says post, send or write as an action', !p.steps.some((s) => /post|send|write/i.test(s.kind)) && /does not write or send/.test(p.steps[1].label), p.steps);
const ph = Z.plan({ flags: ON, text: yes[4][0], direction: 'mine' });
check('Hebrew plan: Hebrew line and steps', ph.lang === 'he' && /[֐-׿]/.test(ph.line) && /[֐-׿]/.test(ph.steps[0].label), ph);
const pt = Z.plan({ flags: ON, text: yes[6][0], direction: 'theirs' });
check('theirs: the offer says an answer will be reported, the person decides if it settles it', pt.direction === 'theirs' && /answer arrives/.test(pt.line) && /You decide/.test(pt.steps[1].label), pt);
check('a silent ask has no plan', Z.plan({ flags: ON, text: no[0][0], direction: 'mine' }).action === 'silence');
check('the conversation id the recognizer returns is one the engine accepts', C.parseConversation(p.conversation) === DM && Z.SYSTEM === C.SYSTEM);

console.log('\nTOTAL FAILURES: ' + failures);
process.exit(failures ? 1 : 0);
