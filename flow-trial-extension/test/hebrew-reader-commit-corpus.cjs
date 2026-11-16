'use strict';
// EN/HE parity for a REMINDER OF THE READER'S OWN COMMITMENT. "As agreed, you will send the invoice by Monday" is a commitment (a task); the Hebrew
// «סיכמנו שתשלח», «התחייבת להעביר», «הבטחת לשלוח», «לפי מה שאמרת» was read as an ask of the reader (a reply draft), because READER_COMMIT_HE only knew
// the long forms («את התחייבת», «כמו שהתחייבת»). Found 2026-11-11 on the frozen label set: 8 of the task->draft wrong actions were this.
// Run: node test/hebrew-reader-commit-corpus.cjs
const fs = require('fs'), path = require('path'), vm = require('vm');
let failures = 0;
function check(name, cond, detail) { if (cond) console.log('PASS:', name); else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); } }
const ROOT = path.join(__dirname, '..');
const sb = { module: undefined, console }; vm.createContext(sb);
for (const f of ['domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'close-families.js', 'fact-reply.js', 'intent.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, 'core', f), 'utf8'), sb, { filename: f });
const FlowIntent = vm.runInContext('FlowIntent', sb);
const NOW = new Date('2026-10-07T12:00:00+03:00');
const ctx = { now: NOW, namesWaitDone: true, ownNames: ['Sali', 'סאלי'], to: ['ai.local.flow@gmail.com'], cc: [], ownAddresses: ['ai.local.flow@gmail.com'], inbound: true, direction: 'inbound' };
const typeOf = (t) => { const i = FlowIntent.classify(t, ctx); return i && i.type ? i.type : null; };
const COMMIT = ['סיכמנו שתשלח את ה-SOW עד ה-15.10', 'התחייבת להעביר את החשבונית עד מחר בבוקר, נכון? תודה!', 'סיכמנו שתשלח את ה-PO ביום שלישי הבא תודה רבה', 'התחייבת להעביר את טופס המס עד 20/10',
  'רק תזכורת: הבטחת לשלוח את הדוח עד יום חמישי', 'לפי מה שאמרת, תחזור אליי עם תשובה עד 20/10', 'סוכם שתעביר את האישור עד יום שני'];
for (const t of COMMIT) check('a reminder of the reader\'s own commitment is a commitment: ' + t.slice(0, 36), typeOf(t) === 'commitment', typeOf(t));
check('the English original stays a commitment', typeOf('You committed to send the tax form by October 20.') === 'commitment');
const NOT = [['סיכמנו שאשלח את ה-SOW עד ה-15.10', 'my own promise (the sender'], ['לא התחייבת לשלוח את ה-SOW עד ה-15.10', 'a negation'], ['התחייבתי לשלוח לך את ה-SOW עד ה-15.10', 'I committed']];
for (const [t, why] of NOT) check('not a reader commitment (' + why + '): ' + t.slice(0, 30), typeOf(t) !== 'commitment', typeOf(t));
check('a third person is not the reader: «סיכמנו שהיא תשלח» is unchanged (not a commitment)', typeOf('סיכמנו שהיא תשלח את ה-SOW עד ה-15.10') !== 'commitment');
check('a plain Hebrew ask is still an ask, not a commitment', typeOf('תוכל לשלוח לי את התקציב עד יום חמישי?') !== 'commitment');
console.log(failures ? '\nFAILURES: ' + failures : '\nTOTAL FAILURES: 0'); process.exit(failures ? 1 : 0);
