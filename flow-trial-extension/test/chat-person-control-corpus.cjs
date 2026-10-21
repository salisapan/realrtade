// Messenger and Instagram: a one-to-one chat whose Block or Mute control carries the same
// words in its aria-label and in its visible text ("Block Dana" twice) drafts. open-tasks
// row 71 listed this as a miss; on these fixtures it is not (measured 2026-10-21), so this
// corpus pins the behavior. A control for another person, a group title, a members list and
// a bare Mute still keep the draft quiet. Nothing here can send.
// Run: node test/chat-person-control-corpus.cjs
const { JSDOM } = require('jsdom');
require('../src/group-word.js');
const { FlowMessengerParse } = require('../src/messenger-parse.js');
const { FlowInstagramParse } = require('../src/instagram-parse.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail).slice(0, 500) : ''); }
}
function chatEl(html) {
  return new JSDOM('<body>' + html + '</body>').window.document.body.firstElementChild;
}
const msInfo = '<a aria-label="Conversation information">Conversation information</a>';
const igInfo = '<button type="button" aria-label="Chat details">Chat details</button>';
function header(title, extra, control) {
  return chatEl('<div role="main"><header><img alt="" src="data:,"><h2>' + title + '</h2>' + (extra || '') + control + '</header></div>');
}
const both = (el) => [FlowMessengerParse.isOneToOne(el), FlowInstagramParse.isOneToOne(el)];

console.log('\n--- the same words in the label and the text ---\n');
const link = '';
const twice = header('Dana', link + '<button type="button" aria-label="Block Dana">Block Dana</button>', msInfo);
check('Block Dana in the label and in the text drafts (Messenger)', FlowMessengerParse.isOneToOne(twice) === true);
const twiceIg = header('Dana', link + '<button type="button" aria-label="Block Dana">Block Dana</button>', igInfo);
check('Block Dana in the label and in the text drafts (Instagram)', FlowInstagramParse.isOneToOne(twiceIg) === true);
const mute = header('Dana', link + '<button type="button" aria-label="Mute Dana">Mute Dana</button>', msInfo);
check('Mute Dana twice drafts', FlowMessengerParse.isOneToOne(mute) === true);
const he = header('דנה', '<a href="/100012345678/" role="link">דנה</a><button type="button" aria-label="חסום דנה">חסום דנה</button>', msInfo);
check('Hebrew label and text both חסום דנה draft', both(he).every(Boolean) , both(he));
const labelOnly = header('Dana', link + '<button type="button" aria-label="Block Dana"><span>x</span></button>', msInfo);
check('only the label names Dana: drafts', FlowMessengerParse.isOneToOne(labelOnly) === true);
const textOnly = header('Dana', link + '<button type="button">Block Dana</button>', msInfo);
check('only the text names Dana: drafts (as before)', FlowMessengerParse.isOneToOne(textOnly) === true);

console.log('\n--- what stays quiet ---\n');
const other = header('Dana', link + '<button type="button" aria-label="Block Noa">Block Noa</button>', msInfo);
check('the control names someone else: quiet', both(other).every((v) => v === false), both(other));
const bare = header('Chat 2', '<a href="/100012345678/" role="link">Chat 2</a><button type="button" aria-label="Mute">Mute</button>', msInfo);
check('a bare Mute is no signal', both(bare).every((v) => v === false), both(bare));
const groupTitle = header('Dana, Noa', '<a href="/100012345678/" role="link">Dana, Noa</a><button type="button" aria-label="Block Dana, Noa">Block Dana, Noa</button>', msInfo);
check('a two-name title is a group even with the same words twice', both(groupTitle).every((v) => v === false), both(groupTitle));
const members = header('Dana', link + '<button type="button" aria-label="Block Dana">Block Dana</button><span>5 members</span>', msInfo);
check('a members list vetoes it', FlowMessengerParse.isOneToOne(members) === false && FlowMessengerParse.classify(members).kind === 'group');
const family = header('Family', '<a href="/100012345678/" role="link">Family</a><button type="button" aria-label="Block Family">Block Family</button>', msInfo);
check('a group word title stays quiet', FlowMessengerParse.isOneToOne(family) === false);

console.log(failures ? '\n' + failures + ' FAILED' : '\nALL PASS');
process.exit(failures ? 1 : 0);
