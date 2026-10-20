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

console.log('\nTOTAL FAILURES: ' + failures);
process.exit(failures ? 1 : 0);
