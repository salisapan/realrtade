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
check('v2 hash chat id', P.chatIdFromHref('https://teams.live.com/v2/#/l/chat/19%3Aabc%40thread.v2/conversations') === '19:abc@thread.v2');
check('v2 self notes id', P.chatIdFromHref('https://teams.live.com/v2/#/conversations/48:notes') === '48:notes');

const selfHtml = '<div role="main" data-tid="chat-pane-main"><div data-tid="chat-header"><h2 data-tid="chat-title" role="heading" aria-level="2" aria-label="sali sapan (You)">sali sapan (You)</h2></div>' +
  '<div data-tid="message-pane-list"><div data-tid="message-author-name">You</div>' +
  '<div data-tid="chat-pane-message" id="m-self" role="group" aria-label="You"><div data-tid="message-body"><p dir="auto">תוכל לשלוח לי את הסיכום עד מחר?</p></div></div></div></div>';
const self = dom(selfHtml);
const selfRows = P.messagesFromDom(self);
const selfId = P.identify('https://teams.live.com/v2/', self);
check('v2 self header is the chat', selfId.id === 'teams:title:sali sapan (you)' && selfId.signals.self === true && selfId.signals.title === 'sali sapan (You)', selfId);
check('v2 self bubble is read', selfRows.length === 1 && selfRows[0].author === 'me' && /סיכום/.test(selfRows[0].text), selfRows[0]);

const dm = dom('<div role="main" data-tid="chat-pane-main" data-conversation-id="19:dana@thread.v2"><div data-tid="chat-header" aria-label="Dana Cohen"><span data-tid="chat-header-title">Dana Cohen</span></div>' +
  '<div data-tid="message-author-name">Dana Cohen</div><div data-tid="chat-pane-message" id="m-dm"><div data-tid="message-body-content" dir="auto">Can you review the draft by Wednesday?</div></div></div>');
const dmRows = P.messagesFromDom(dm);
const dmId = P.identify('https://teams.live.com/v2/', dm);
check('v2 one-to-one uses the header and the dom id', dmId.signals.domChatId === '19:dana@thread.v2' && dmId.signals.self === false && dmId.signals.title === 'Dana Cohen', dmId);
check('v2 one-to-one bubble is them', dmRows.length === 1 && dmRows[0].author === 'them' && /review the draft/.test(dmRows[0].text), dmRows[0]);

const blank = dom('<div role="main" data-tid="chat-pane-main"></div>');
const missed = P.identify('https://teams.live.com/v2/', blank);
check('a shell with no header is not a chat', missed.id === '');
check('a miss names the missing signals and not the message', P.missingSignals(missed.signals) === 'urlChatId=missing domChatId=missing title=missing headerAria=missing' && P.missingSignals(missed.signals).indexOf('סיכום') < 0);

const bare = dom('<div role="main" data-tid="chat-pane-main"><div data-tid="chat-header"><span>sali sapan (You)</span><button type="button">Call</button></div>' +
  '<div data-tid="message-author-name">You</div><div data-tid="chat-pane-message" id="m-bare"><div data-tid="message-body"><p dir="auto">תוכל לשלוח לי את הסיכום עד מחר?</p></div></div></div>');
const bareId = P.identify('https://teams.live.com/v2/', bare);
const bareRows = P.messagesFromDom(bare);
check('v2 header text without a heading is the self-chat', bareId.id === 'teams:title:sali sapan (you)' && bareId.signals.self === true && bareId.signals.title === 'sali sapan (You)', bareId);
check('v2 self sender stays me', bareRows.length === 1 && bareRows[0].author === 'me', bareRows[0]);

const said = dom('<div role="main" data-tid="chat-pane-main"><div data-tid="chat-header"><span>Dana Cohen</span></div>' +
  '<div data-tid="chat-pane-message" id="m-said" aria-label="Dana Cohen said: Can you review the draft by Wednesday?"><div data-tid="message-body"><p dir="auto">Can you review the draft by Wednesday?</p></div></div></div>');
const saidId = P.identify('https://teams.live.com/v2/', said);
const saidRows = P.messagesFromDom(said);
check('v2 header span names the one-to-one', saidId.signals.self === false && saidId.signals.title === 'Dana Cohen' && saidId.id === 'teams:title:dana cohen', saidId);
check('v2 sender is read from the said label', saidRows.length === 1 && saidRows[0].author === 'them' && /review the draft/.test(saidRows[0].text), saidRows[0]);

const user = dom('<div role="main"><div data-tid="message-username">Dana Cohen</div><div data-tid="chat-pane-message" id="m-user"><p dir="auto">Can you review the draft by Wednesday?</p></div></div>');
check('v2 message-username is the sender', P.messagesFromDom(user)[0].author === 'them');

const replyHead = dom('<div role="main"><div data-tid="reply-message-header"><span class="fui-StyledText">Dana Cohen</span><span>10:32</span></div>' +
  '<div data-tid="chat-pane-message" id="m-reply"><div data-tid="message-body"><p dir="auto">Can you review the draft by Wednesday?</p></div></div></div>');
check('v2 reply header span is the sender', P.messagesFromDom(replyHead)[0].author === 'them');

check('window title is the chat when the DOM header is empty', P.titleFromDocument('Chat | sali sapan (You) | Microsoft Teams') === 'sali sapan (You)');
check('a fixture title is not a chat', P.titleFromDocument('Glance Teams fixture') === '');
const titled = P.identify('https://teams.live.com/v2/', blank, 'Chat | Dana Cohen | Microsoft Teams');
check('v2 window title identifies the open chat', titled.id === 'teams:title:dana cohen' && titled.signals.self === false && titled.signals.title === 'Dana Cohen', titled);
const titledSelf = P.identify('https://teams.live.com/v2/', blank, 'Chat | sali sapan (You) | Microsoft Teams');
check('v2 window title identifies a self-chat', titledSelf.signals.self === true && titledSelf.id === 'teams:title:sali sapan (you)', titledSelf);

const parent = 'https://teams.live.com/v2/#/conversations/19%3Aabc%40thread.v2?ctx=chat';
check('the parent frame hash is the open chat', P.bestHref('https://teams.live.com/v2/', parent) === parent);
check('the parent frame id is 19:', P.chatIdFromHref(P.bestHref('https://teams.live.com/v2/', parent)) === '19:abc@thread.v2');
check('a frame that already has an id keeps it', P.bestHref('https://teams.microsoft.com/v2/#/l/chat/19%3Adana%40thread.v2', parent) === 'https://teams.microsoft.com/v2/#/l/chat/19%3Adana%40thread.v2');
check('a foreign parent is ignored', P.bestHref('https://teams.live.com/v2/', 'https://mail.google.com/mail/u/0/#inbox') === 'https://teams.live.com/v2/');

if (failures) process.exit(1);
console.log('teams-parse-corpus: all passed');
