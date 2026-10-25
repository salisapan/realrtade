// Teams web parser and judge input for the shared chat judge.
// Run: node test/teams-parse-corpus.cjs
'use strict';
const { JSDOM } = require('jsdom');
require('../src/group-word.js');
const { FlowTeamsParse: P } = require('../src/teams-parse.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail).slice(0, 400) : ''); }
}

function dom(html) {
  return new JSDOM('<body>' + html + '</body>').window.document.body.firstElementChild;
}

const EN = dom('<div role="main" data-glance-teams-thread="dm"><header><h2 data-glance-title>Dana Cohen</h2></header>' +
  '<div data-glance-message data-author="them" data-message-id="m1"><span dir="auto">Can you review the draft by Wednesday?</span></div></div>');
const HE = dom('<div role="main" data-glance-teams-thread="dm"><header><h2 data-glance-title>דנה כהן</h2></header>' +
  '<div data-glance-message data-author="them" data-message-id="m2"><span dir="auto">תוכל לשלוח לי את הקובץ עד יום חמישי?</span></div></div>');
const ATT = dom('<div role="main" data-glance-teams-thread="dm"><header><h2 data-glance-title>Dana Cohen</h2></header>' +
  '<div data-glance-message data-author="them" data-message-id="m3"><span dir="auto">Please sign the attached contract.</span>' +
  '<span data-glance-attachment="contract.pdf"></span></div></div>');

const rowsEn = P.messagesFromDom(EN);
const rowsHe = P.messagesFromDom(HE);
const rowsAtt = P.messagesFromDom(ATT);

check('English external sender is them', rowsEn[0].author === 'them' && /review the draft/.test(rowsEn[0].text), rowsEn[0]);
check('Hebrew external sender is them', rowsHe[0].author === 'them' && /קובץ/.test(rowsHe[0].text), rowsHe[0]);
check('attachment is listed', rowsAtt[0].attachments.length === 1 && rowsAtt[0].attachments[0].name === 'contract.pdf', rowsAtt[0]);

const party = { name: 'Dana Cohen' };
const inputEn = P.judgeInput(rowsEn[0], party, { key: 'k1' });
check('judge input channel is teams', inputEn.channel === 'teams' && inputEn.fromMe === false && inputEn.sender.name === 'Dana Cohen', inputEn);

check('judge input is one inbound ask the card stack already recognises', /review the draft by Wednesday/i.test(inputEn.text) && inputEn.oneToOne === true && inputEn.group === false);

const vague = P.judgeInput({ author: 'them', text: 'Thanks, got it!', id: 'v' }, party, { key: 'v' });
check('unsure line is still shaped for silence', vague.text === 'Thanks, got it!' && vague.fromMe === false);

check('chat id from Teams URL', P.chatIdFromHref('https://teams.microsoft.com/l/chat/19%3aabc%40thread.v2/conversations') === '19:abc@thread.v2');

if (failures) process.exit(1);
console.log('teams-parse-corpus: all passed');
