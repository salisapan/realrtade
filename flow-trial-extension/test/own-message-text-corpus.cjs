'use strict';
/**
 * ownMessageText contract in content-gmail.js.
 *
 * Prefer div.a3s. Cut .gmail_quote. Run stripGmailReadingChrome only when
 * .a3s is missing. A clock the sender wrote in the body stays.
 *
 * Run: node test/own-message-text-corpus.cjs
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'content-gmail.js'), 'utf8');
const start = src.indexOf('const QUOTE_CONTAINER_SELECTOR');
const end = src.indexOf('function ownEmailFromThread');
if (start < 0 || end <= start) {
  console.error('could not slice ownMessageText from content-gmail.js');
  process.exit(1);
}

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(
  src.slice(start, end) + '\nthis.ownMessageText = ownMessageText;\nthis.stripGmailReadingChrome = stripGmailReadingChrome;',
  sandbox
);
const ownMessageText = sandbox.ownMessageText;
const stripGmailReadingChrome = sandbox.stripGmailReadingChrome;

function node(spec) {
  const a3s = spec.a3s ? {
    innerText: spec.a3s.text,
    querySelector(sel) {
      if (sel === '.gmail_quote' && spec.a3s.quote) return { innerText: spec.a3s.quote };
      return null;
    }
  } : null;
  return {
    innerText: spec.text || '',
    querySelector(sel) {
      if (sel === 'div.a3s') return a3s;
      if (sel === '.gmail_quote' && spec.quote) return { innerText: spec.quote };
      return null;
    }
  };
}

const BODY = 'Can we meet this Thursday, October 8, at 10:00 for 30 minutes about the launch checklist?';
let fail = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else {
    fail++;
    console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : '');
  }
}

const writtenClock = '12:05\n' + BODY;
const fromBody = ownMessageText(node({ text: 'LISTITEM CHROME SHOULD NOT BE READ', a3s: { text: writtenClock } }));
check('strip helper would remove a bare leading clock', stripGmailReadingChrome(writtenClock).indexOf('12:05') === -1);
check('.a3s keeps a clock the sender wrote', fromBody.indexOf('12:05') === 0 && fromBody.indexOf('10:00') !== -1, fromBody);

const bodyOnly = ownMessageText(node({
  text: 'Sali <a@b.com>\n12:05 (0 minutes ago)\nto me\n\n' + BODY,
  a3s: { text: BODY }
}));
check('.a3s ignores the listitem received time', bodyOnly.indexOf('12:05') === -1 && bodyOnly.indexOf('10:00') !== -1, bodyOnly);

const inviteInBody = BODY + '\n\nThu, Oct 8, 10:00 AM – 10:30 AM (IDT)';
const keptInvite = ownMessageText(node({ text: 'chrome', a3s: { text: inviteInBody } }));
check('.a3s is not stripped when it contains an invite line', keptInvite.indexOf('10:30') !== -1, keptInvite);

const fallback = ownMessageText(node({
  text: 'Sali Sapan <salisapan1@gmail.com>\n12:05 (0 minutes ago)\nto me\n\n' + BODY +
    '\n\nThu, Oct 8, 10:00 AM – 10:30 AM (IDT)\nYes, that works for me.'
}));
check('listitem fallback drops received 12:05', fallback.indexOf('12:05') === -1, fallback);
check('listitem fallback keeps the meeting 10:00', fallback.indexOf('10:00') !== -1, fallback);
check('listitem fallback drops the invite chip', fallback.indexOf('10:30') === -1 && fallback.indexOf('IDT') === -1, fallback);
check('listitem fallback drops the smart reply', fallback.indexOf('Yes, that works') === -1, fallback);

const quoted = ownMessageText(node({
  text: 'listitem',
  a3s: {
    text: BODY + '\n\nOn Mon, Oct 5, 2026 at 9:15 AM Sali wrote:\nolder 9:15 note',
    quote: 'On Mon, Oct 5, 2026 at 9:15 AM Sali wrote:\nolder 9:15 note'
  }
}));
check('.a3s still cuts .gmail_quote', quoted.indexOf('9:15') === -1 && quoted.indexOf('10:00') !== -1, quoted);

check('a missing node is empty', ownMessageText(null) === '');

console.log('failures: ' + fail);
process.exit(fail ? 1 : 0);
