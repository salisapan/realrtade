// A deadline that already passed is never dropped silently. The ask still cards, the original day rides on the
// intent and the task's due date, and the card line reads "Overdue" (Hebrew: עבר המועד) with that day.
// Run: node test/overdue-card-corpus.cjs
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const sandbox = { module: undefined, console };
vm.createContext(sandbox);
for (const f of ['domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'close-families.js', 'intent.js', 'actions.js', 'display-copy.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'core', f), 'utf8'), sandbox, { filename: f });
}
const FlowIntent = vm.runInContext('FlowIntent', sandbox);
const FlowDisplay = vm.runInContext('FlowDisplay', sandbox);
let failed = 0;
function check(name, ok, extra) { if (!ok) { failed++; console.log('FAIL: ' + name + (extra ? ' ' + JSON.stringify(extra) : '')); } else console.log('ok: ' + name); }

const NOW = new Date(2026, 10, 4, 12, 0, 0);
const ctx = { now: NOW, senderEmail: 'tom@reedco.com', senderName: 'Tom Reed', ownEmail: 'me@example.com', to: ['me@example.com'], cc: [] };
const cases = [
  { text: 'Please send the form by 1 October 2026.', iso: '2026-10-01' },
  { text: 'תשלח לי את הטופס עד 1 באוקטובר 2026', iso: '2026-10-01' }
];
cases.forEach((c) => {
  const intent = FlowIntent.classify(c.text, ctx);
  check('past deadline still cards: ' + c.text, Boolean(intent && intent.type), intent && intent.type);
  if (!intent || !intent.type) return;
  check('  original day kept as overdueIso', intent.entities.overdueIso === c.iso, intent.entities);
  check('  no task due date from a past day', intent.entities.dateIso == null, intent.entities);
  const clock = FlowDisplay.holdClockFrom({ intent });
  check('  card clock is the original day, marked overdue', clock && clock.dateIso === c.iso && clock.overdue === true, clock);
  check('  old day stays out of the title', !/2026|October|אוקטובר/.test(String(intent.label || '')), intent.label);
});
const future = FlowIntent.classify('Please send the form by 1 October 2999.', ctx);
check('a future day is not overdue', future && future.entities && !future.entities.overdueIso);

check('card line en: overdue + day', /^Overdue · /.test(FlowDisplay.overdueDateLine('2020-01-01', 'en')), FlowDisplay.overdueDateLine('2020-01-01', 'en'));
check('card line he: עבר המועד + day', /^עבר המועד · /.test(FlowDisplay.overdueDateLine('2020-01-01', 'he')), FlowDisplay.overdueDateLine('2020-01-01', 'he'));
check('card line en: a future day reads until', /^until /.test(FlowDisplay.cardDateLine('2999-01-01', 'en')));
check('card line he: a future day reads עד', /^עד /.test(FlowDisplay.cardDateLine('2999-01-01', 'he')));
if (failed) { console.log(failed + ' failed'); process.exit(1); }
console.log('overdue card corpus: all ok');
