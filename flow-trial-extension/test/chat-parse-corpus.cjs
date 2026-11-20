// Slack and Telegram Web parsing: the rules that decide which conversations Glance may read at all. Run: node test/chat-parse-corpus.cjs
const { FlowSlackParse: S } = require('../src/slack-parse.js');
const { FlowTelegramParse: T } = require('../src/telegram-parse.js');
let failures = 0;
function check(name, cond, detail) { if (cond) console.log('PASS:', name); else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); } }

console.log('--- Slack: only a one-to-one direct message is read ---');
check('a direct message (D…) is one-to-one', S.parseUrl('https://app.slack.com/client/T01ABC/D02XYZ').oneToOne === true);
check('a channel (C…) is not', S.parseUrl('https://app.slack.com/client/T01ABC/C09CHAN').oneToOne === false);
check('a group direct message or private channel (G…) is not', S.parseUrl('https://app.slack.com/client/T01ABC/G09GRP').oneToOne === false);
check('a thread inside a direct message is flagged and left alone', S.parseUrl('https://app.slack.com/client/T01ABC/D02XYZ/thread/D02XYZ-1790800001.000100').inThread === true);
check('another site is never read', S.parseUrl('https://evil.example.com/client/T01ABC/D02XYZ') === null && S.parseUrl('https://slack.com.evil.io/client/T01/D02') === null);
check('a non-conversation page is not a conversation', S.parseUrl('https://app.slack.com/client/T01ABC') === null && S.parseUrl('nonsense') === null);
check('the thread id carries the workspace and the conversation', S.threadIdFor('https://app.slack.com/client/T01ABC/D02XYZ') === 'slack:T01ABC:D02XYZ');
check('a channel has no thread id (nothing is stored for it)', S.threadIdFor('https://app.slack.com/client/T01ABC/C09CHAN') === null);
check('a message timestamp is read as milliseconds', S.parseTs('1790800001.000100').ms === 1790800001000 && S.parseTs('abc') === null);
const filled = S.fillSenders([{ sender: 'Sali' }, { sender: '' }, { sender: 'Dana' }, { sender: null }]);
check('a missing sender takes the one before it', filled.map((r) => r.sender).join('|') === 'Sali|Sali|Dana|Dana');
check('the other person in the title is them, anyone else is me', S.isOwn('Dana Cole', 'Dana Cole') === false && S.isOwn('Sali Sapan', 'Dana Cole') === true);
check('an unknown sender or title is "cannot tell" (the reader stays silent)', S.isOwn('', 'Dana') === null && S.isOwn('Dana', '') === null);
check('invisible marks in a name do not break the match', S.isOwn('Dana​ Cole', 'Dana Cole') === false);

console.log('\n--- Telegram: only a chat with a person is read ---');
check('a positive peer id is a person', T.parseHash('https://web.telegram.org/a/#777000123').oneToOne === true);
check('a negative id (group, supergroup, channel) is not', T.parseHash('https://web.telegram.org/a/#-1001234567890').oneToOne === false && T.parseHash('https://web.telegram.org/k/#-98765432').oneToOne === false);
check('an @username could be a bot or a channel, so it is not read', T.parseHash('https://web.telegram.org/a/#@someone').oneToOne === false);
check('another site is never read', T.parseHash('https://web.telegram.org.evil.io/a/#777000123') === null);
check('the thread id names the peer; a group has none', T.threadIdFor('https://web.telegram.org/a/#777000123') === 'tg:777000123' && T.threadIdFor('https://web.telegram.org/a/#-100123456') === null);
check('a message id is read from "message-N" or a bare number', T.messageId('message-4242') === '4242' && T.messageId('4242') === '4242' && T.messageId('x') === null);
check('a quoted message is not part of the text', T.joinText([{ text: 'quoted', quoted: true }, { text: ' my   ask ' }]) === 'my ask');

console.log('\n--- self-chat, FYI, and the draft ---');
check('Slack (you) is a self chat', S.isSelfTitle('Sali Sapan (you)') === true && S.isSelfTitle('Message yourself') === true);
check('Telegram Saved Messages is a self chat', T.isSelfTitle('Saved Messages') === true && T.isSelfTitle('הודעות שמורות') === true);
check('another person is not a self chat', S.isSelfTitle('Dana Cole') === false && T.isSelfTitle('Dana Cole') === false);
check('an ask is an ask', S.isAsk('Can you send the invoice by Friday?') === true && T.isAsk('תוכל לשלוח לי את הקובץ עד יום חמישי?') === true);
check('FYI is not an ask', S.isAsk('fyi, no action needed') === false && S.isFyi('fyi, no action needed') === true && T.isFyi('לידיעתך') === true && T.isAsk('לידיעתך') === false);
check('the draft is the ask without the question, and it is not a send', S.selfDraft('Can you send the invoice by Friday?') === 'Send the invoice by Friday.' && T.selfDraft('תוכל לשלוח לי את הקובץ עד יום חמישי?') === 'לשלוח לי את הקובץ עד יום חמישי.');
check('a /D address is still a direct message', S.parseUrl('https://app.slack.com/client/T01ABC/D0C9BS6UD9A').oneToOne === true && S.threadIdFor('https://app.slack.com/client/T01ABC/D0C9BS6UD9A') === 'slack:T01ABC:D0C9BS6UD9A');
check('the DMs view needs the open conversation from the page', S.parseUrl('https://app.slack.com/client/T01ABC/dms').needsDom === true && S.parseUrl('https://app.slack.com/client/T01ABC/DMs').needsDom === true);
const dms = S.resolveConversation(S.parseUrl('https://app.slack.com/client/T01ABC/dms'), 'D0C9BS6UD9A');
check('the DMs view takes a D id from the DOM and ignores a channel id', dms && dms.oneToOne === true && dms.conversation === 'D0C9BS6UD9A' && S.threadIdFor(dms) === 'slack:T01ABC:D0C9BS6UD9A' && S.conversationIdFrom(['C09CHAN', 'D0C9BS6UD9A']) === 'D0C9BS6UD9A');
check('the DMs view stays unresolved until a DM id is on the page', S.resolveConversation(S.parseUrl('https://app.slack.com/client/T01ABC/dms'), '').unresolved === true);
const cfg = JSON.stringify({ teams: { T01ABC: { user_id: 'UFLOW123', token: 'xoxc-secret' } } });
check('the signed-in id comes from localConfig and the token does not', S.selfIdFromStore(cfg, 'T01ABC') === 'UFLOW123' && S.selfIdFromStore(cfg, 'T01ABC').indexOf('xoxc') < 0);
check('self is the same user id, not the display name', S.isSelfDm({ selfId: 'UFLOW123', counterpartId: 'UFLOW123', titleBlob: 'Flow Message to Flow' }) === true);
check('the same display name with another user id is not self', S.isSelfDm({ selfId: 'UFLOW123', counterpartId: 'UDANA456', titleBlob: 'Flow' }) === false);
check('a (you) title is only the backup signal', S.isSelfDm({ titleBlob: 'Sali Sapan (you)' }) === true);
const fs = require('fs');
const path = require('path');
const bg = fs.readFileSync(path.join(__dirname, '../src/background.js'), 'utf8');
const popup = fs.readFileSync(path.join(__dirname, '../popup/popup.js'), 'utf8');
const popupHtml = fs.readFileSync(path.join(__dirname, '../popup/popup.html'), 'utf8');
check('the worker repeats slack and telegram why-not lines', bg.indexOf("msg.type === 'flow:slack-trace'") >= 0 && bg.indexOf("msg.type === 'flow:telegram-trace'") >= 0 && bg.indexOf("line.indexOf('[Glance] slack ')") >= 0 && bg.indexOf("line.indexOf('[Glance] telegram ')") >= 0);
check('the panel asks for the open Slack or Telegram chat when the host is not granted', popup.indexOf('renderChatPageGrant') >= 0 && popupHtml.indexOf('id="chat-page-grant"') >= 0);

console.log('\nTOTAL FAILURES: ' + failures);
process.exit(failures ? 1 : 0);
