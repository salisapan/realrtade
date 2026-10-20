// The judge reads "now" to decide whether a dated mail is in the past. A Date
// built in another realm (a vm sandbox, an iframe, the eval harness) fails
// `instanceof Date`; the old check then fell back to the real clock, so every
// dated mail became a past date and went silent. The tag check keeps the clock
// the caller passed. Run: node test/judge-clock-realm-corpus.cjs
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const sandbox = { console };
vm.createContext(sandbox);
['domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'close-families.js', 'intent.js', 'actions.js', 'incoming-judge.js'].forEach((f) => {
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'core', f), 'utf8'), sandbox, { filename: f });
});
const Judge = sandbox.FlowIncomingJudge;

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail).slice(0, 600) : ''); }
}

// 2020 is always behind the real clock, so a fallback to Date.now() always shows.
const OUTER_NOW = new Date('2020-01-06T09:00:00Z');
const NUMERIC_NOW = OUTER_NOW.getTime();
const INNER_NOW = vm.runInContext("new Date('2020-01-06T09:00:00Z')", sandbox);
const InnerDate = vm.runInContext('Date', sandbox);
check('the outer Date really is another realm', !(OUTER_NOW instanceof InnerDate) && INNER_NOW instanceof InnerDate);

function judge(text, now) {
  return Judge.judge({
    text, subject: '', sender: { email: 'david@partner.example', name: 'David' },
    now, surface: 'gmail', ownNames: ['Sali'], namesWaitDone: true
  });
}
const FUTURE = "Let's have a meeting on January 13 at 3pm to go over the budget.";
const PAST = "Let's have a meeting on December 16 at 3pm to go over the budget.";

for (const [label, now] of [['another-realm Date', OUTER_NOW], ['same-realm Date', INNER_NOW], ['epoch number', NUMERIC_NOW]]) {
  const a = judge(FUTURE, now);
  check('a dated meeting after now is offered (' + label + ')', a.show === true && a.intent && a.intent.type === 'event', { show: a.show, reason: a.reason });
  const b = judge(PAST, now);
  check('a date already before now stays silent (' + label + ')', b.show === false, { show: b.show, reason: b.reason });
}

const stamp = Judge.judge({ text: FUTURE, subject: '', sender: { email: 'david@partner.example', name: 'David' }, now: OUTER_NOW, surface: 'gmail', ownNames: ['Sali'], namesWaitDone: true });
check('the date the card carries is the one after the passed clock', stamp.intent && stamp.intent.entities && stamp.intent.entities.dateIso === '2020-01-13', stamp.intent && stamp.intent.entities);

console.log(failures ? '\nTOTAL FAILURES: ' + failures : '\nAll passed.');
process.exit(failures ? 1 : 0);
