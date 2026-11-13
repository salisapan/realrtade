// A request pointing at one Teams chat becomes one watch-only Do It, behind TEAMS_ANSWER (off). Hebrew and English, positive and negative.
// Pure recognition and plan: nothing is called. Run: node test/teams-answer-corpus.cjs
'use strict';
const { FlowTeamsAnswer: Z } = require('../core/teams-answer.js');
const { FlowTeamsAnswerClose: C } = require('../core/teams-answer-close.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const ON = { TEAMS_ANSWER: true };
const CHAT = '19:abcdef0123456789abcdef0123456789@thread.v2';
const LINK = 'https://teams.microsoft.com/l/chat/' + encodeURIComponent(CHAT) + '/0?tenantId=t';
const OTHER = 'https://teams.microsoft.com/l/chat/' + encodeURIComponent('19:ffffffffffffffffffffffffffffffff@thread.v2') + '/0';

console.log('\n--- a request that points at one Teams chat ---\n');
const yes = [
  ['Please reply to me here: ' + LINK, 'mine'],
  ['Can you let me know in the Teams chat? ' + LINK, 'mine'],
  ['Get back to me on Teams about the contract. ' + LINK, 'mine'],
  ['Confirm in this chat when the invoice is sent ' + LINK, 'mine'],
  ['תענה לי בצ\'אט הזה: ' + LINK, 'mine'],
  ['תחזור אליי בטימס עם התשובה ' + LINK, 'mine'],
  ['I asked Dana to let me know in the Teams chat. ' + LINK, 'theirs'],
  ['ביקשתי ממנו שיעדכן אותי בצ\'אט. ' + LINK + ' תעדכן אותי בצ\'אט', 'theirs']
];
for (const [text, dir] of yes) {
  const r = Z.recognize(text, dir);
  check('clear (' + dir + '): ' + text.slice(0, 50), r.kind === 'clear' && r.chatId === CHAT && r.direction === dir, r);
}

console.log('\n--- silence, with the reason ---\n');
const no = [
  ['Please reply to me here: ' + LINK + ' or ' + OTHER, 'several-chats', 'mine'],
  ['Please reply to me here: https://teams.microsoft.com/l/meetup-join/19%3ameeting_x%40thread.v2/0', 'not-a-chat-link', 'mine'],
  ['Please reply to me here: https://teams.microsoft.com/l/channel/19%3Axxxx%40thread.tacv2/General', 'not-a-chat-link', 'mine'],
  ['Maybe reply to me here if you want ' + LINK, 'hedge', 'mine'],
  ['אולי תענה לי בצ\'אט ' + LINK, 'hedge', 'mine'],
  ['No need to reply here ' + LINK, 'negation', 'mine'],
  ['אין צורך לענות בצ\'אט ' + LINK, 'negation', 'mine'],
  ['FYI the thread is here, reply here if needed ' + LINK, 'fyi', 'mine'],
  ['Ask Dana to reply here ' + LINK, 'third-party', 'mine'],
  ['The notes are in this chat ' + LINK, 'no-ask', 'mine'],
  ['Please reply to me here: ' + LINK, 'no-direction', undefined],
  ['Please reply to me here: ' + LINK, 'no-direction', 'both']
];
for (const [text, why, dir] of no) {
  const r = Z.recognize(text, dir);
  check('silent (' + why + '): ' + text.slice(0, 55), r.kind === 'block' && r.reason === why, r);
}
check('no Teams link at all is ignored (a chat is never guessed from a name)', Z.recognize('Please reply in the Teams chat with Dana', 'mine').kind === 'ignore' && Z.plan({ flags: ON, text: 'Please reply in the Teams chat with Dana', direction: 'mine' }).action === 'silence');
check('empty and null are ignored', Z.recognize('', 'mine').kind === 'ignore' && Z.recognize(null, 'mine').kind === 'ignore');
check('direction comes from the host, never from the words ("I will reply" does not make it theirs)', Z.recognize('I will reply here: ' + LINK + ' let me know in the chat', 'mine').direction === 'mine');

console.log('\n--- the switch and the plan ---\n');
check('off by default', Z.SWITCH_DEFAULT === false && Z.plan({ text: yes[0][0], direction: 'mine' }).action === 'off');
const p = Z.plan({ flags: ON, text: yes[0][0], direction: 'mine' });
check('one Do It that only watches one chat; the answer step is the person\'s', p.action === 'offer' && p.approval === 'DoIt' && p.chatId === CHAT && p.steps.length === 2 && p.steps[0].kind === 'watch' && p.steps[0].proof === 'teams/chat-message' && p.steps[1].kind === 'manual', p);
check('nothing in the plan says post, send or write as an action', !p.steps.some((s) => /post|send|write/i.test(s.kind)) && /does not write or send/.test(p.steps[1].label), p.steps);
const ph = Z.plan({ flags: ON, text: yes[4][0], direction: 'mine' });
check('Hebrew plan: Hebrew line and steps', ph.lang === 'he' && /[֐-׿]/.test(ph.line) && /[֐-׿]/.test(ph.steps[0].label), ph);
const pt = Z.plan({ flags: ON, text: yes[6][0], direction: 'theirs' });
check('theirs: the offer says an answer will be reported, the person decides if it settles it', pt.direction === 'theirs' && /answer arrives/.test(pt.line) && /You decide/.test(pt.steps[1].label), pt);
check('a silent ask has no plan', Z.plan({ flags: ON, text: no[0][0], direction: 'mine' }).action === 'silence');
check('the chat id the recognizer returns is one the engine accepts', C.parseChatId(p.chatId) === CHAT && Z.SYSTEM === C.SYSTEM);

console.log('\nTOTAL FAILURES: ' + failures);
process.exit(failures ? 1 : 0);
