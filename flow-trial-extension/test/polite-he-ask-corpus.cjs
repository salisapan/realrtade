// «האם תוכל לשלוח...?» and «האם אפשר לקבל...?» are the polite ask, the same as the forms without «האם»; "Would it be possible to get...?"
// likewise. Other «האם» questions (a status check, may I send you) stay quiet, and a note to oneself keeps its own reading.
// Run: node test/polite-he-ask-corpus.cjs
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const CORE = ['domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'close-families.js', 'fact-reply.js', 'file-attach.js', 'intent.js'];
const sb = { console }; vm.createContext(sb);
for (const f of CORE) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'core', f), 'utf8'), sb, { filename: f });
const classify = vm.runInContext('FlowIntent.classify', sb);
const ctx = { now: new Date('2026-10-26T10:00:00+02:00'), senderEmail: 'dana@firm.example', sender: { email: 'dana@firm.example', name: 'Dana' }, to: ['me@example.com'], ownAddresses: ['me@example.com'], userName: 'Sali', surface: 'outlook' };
let failures = 0;
function check(name, cond) { if (cond) console.log('PASS:', name); else { failures++; console.log('FAIL:', name); } }
const type = (t, c) => (classify(t, c || ctx) || {}).type;
for (const t of ['האם תוכל לשלוח לי את הקובץ?', 'האם אפשר לקבל את הלוגו בפורמט וקטורי?', 'האם אפשר לקבל מידע נוסף על המוצר שלכם?', 'Would it be possible to get the logo in vector format?']) {
  check('asks: ' + t, type(t) === 'request');
}
for (const t of ['האם שלחת את החשבונית?', 'האם אפשר לשלוח לך את החוזה מחר?', 'האם תוכל לפרסם את זה בלי לשאול אותי?']) {
  check('stays quiet: ' + t, type(t) !== 'request');
}
console.log(failures ? failures + ' FAILED' : 'All polite-he-ask checks passed');
process.exit(failures ? 1 : 0);
