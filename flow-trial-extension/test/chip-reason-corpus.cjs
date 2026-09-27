// One scorer reason on the chip, and the same sentence in Activity.
//
// judgment.js already names every signal. The chip and the Activity tab used
// to throw that name away: classify() kept a flags object, the chip rendered
// only the closing sentence, and renderLog dropped every `shown` row — the
// only row that could have carried a reason. This file locks the contract
// those surfaces now share: one sentence, the highest-weight positive signal,
// never the whole vector.
//
// Run: node test/chip-reason-corpus.cjs

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = { module: undefined, console };
vm.createContext(sandbox);
for (const f of ['domains.js', 'extract.js', 'judgment.js', 'intent.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'core', f), 'utf8'), sandbox, { filename: f });
}
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'storage.js'), 'utf8'), sandbox, { filename: 'storage.js' });

const FlowJudgment = vm.runInContext('FlowJudgment', sandbox);
const FlowIntent = vm.runInContext('FlowIntent', sandbox);
const FlowExtract = vm.runInContext('FlowExtract', sandbox);
const FlowStorage = vm.runInContext('FlowStorage', sandbox);
const FLOW_DOMAINS = vm.runInContext('FLOW_DOMAINS', sandbox);

const NOW = new Date('2026-09-06T12:00:00Z');
const LEASE = "We're good at $3,900/mo for the 14th floor, signing Monday.";

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

console.log('--- topPositiveWhy ---\n');

check('null and non-arrays yield no reason',
  FlowJudgment.topPositiveWhy(null) === null &&
  FlowJudgment.topPositiveWhy(undefined) === null &&
  FlowJudgment.topPositiveWhy('States a figure') === null);

check('empty list and non-positive weights yield no reason',
  FlowJudgment.topPositiveWhy([]) === null &&
  FlowJudgment.topPositiveWhy([{ id: 'too-short', weight: -25, why: 'Too little text to judge' }]) === null &&
  FlowJudgment.topPositiveWhy([{ id: 'zero', weight: 0, why: 'Nothing' }]) === null);

check('blank reasons are skipped',
  FlowJudgment.topPositiveWhy([{ id: 'money', weight: 34, why: '   ' }]) === null);

check('the highest positive weight wins, negatives do not',
  FlowJudgment.topPositiveWhy([
    { id: 'too-short', weight: -25, why: 'Too little text to judge' },
    { id: 'date', weight: 12, why: 'Names a date: Monday' },
    { id: 'money', weight: 34, why: 'States a figure: $3,900' },
    { id: 'commitment', weight: 30, why: 'Someone committed to something' }
  ]) === 'States a figure: $3,900');

check('a tie keeps the earlier signal',
  FlowJudgment.topPositiveWhy([
    { id: 'a', weight: 10, why: 'First reason' },
    { id: 'b', weight: 10, why: 'Second reason' }
  ]) === 'First reason');

console.log('\n--- lease example (scores above 50, one sentence) ---\n');

const example = FlowJudgment.activityExample({ now: NOW });
check('fresh install produces the lease example', !!example, example);
check('the example quotes the lease sentence', example && example.quote === LEASE, example && example.quote);
check('the example reason is the money sentence', example && example.why === 'States a figure: $3,900', example && example.why);
check('the example reason is a single line', example && !/[\r\n]/.test(example.why));

const silenced = FlowJudgment.activityExample({
  now: NOW,
  calibration: { clicks: 0, dismissals: 6, ts: NOW.getTime() }
});
check('a silenced threshold does not invent an example', silenced === null, silenced);

const scored = FlowJudgment.score(
  FlowJudgment.newContent(LEASE),
  FLOW_DOMAINS[0],
  FlowExtract.extract(LEASE, { now: NOW })
);
check('lease score clears 50', scored.total >= 50, scored.total);
check('example why matches the top positive signal, not a second sentence',
  example && example.why === FlowJudgment.topPositiveWhy(scored.signals) &&
  example.why.indexOf('Someone committed') === -1);

const intent = FlowIntent.classify(LEASE, { senderEmail: 'dana@meridian.com', now: NOW, calibration: null });
check('the lease sentence would actually show a chip', intent && intent.type != null, intent && intent.type);
check('classify keeps the flags object and adds one why string beside it',
  intent && !Array.isArray(intent.signals) && typeof intent.signals.score === 'number' && intent.why === 'States a figure: $3,900',
  intent && { why: intent.why, score: intent.signals && intent.signals.score });

console.log('\n--- Activity rows ---\n');

check('a missing log is an empty Activity list',
  JSON.stringify(FlowStorage.activityRows(null)) === '[]' &&
  JSON.stringify(FlowStorage.activityRows(undefined)) === '[]');

const shownOnly = [{ kind: 'shown', messageId: 'm1', label: 'Log $3,900', why: 'States a figure: $3,900' }];
check('a shown row is kept when it is the only record of the reason',
  FlowStorage.activityRows(shownOnly).length === 1 &&
  FlowStorage.activityRows(shownOnly)[0].kind === 'shown');

const clicked = { kind: 'clicked', messageId: 'm1', label: 'Log $3,900' };
const shown = { kind: 'shown', messageId: 'm1', label: 'Log $3,900', why: 'States a figure: $3,900', signals: { score: 51 } };
const joined = FlowStorage.activityRows([clicked, shown]);
check('an outcome row replaces shown and inherits its reason',
  joined.length === 1 && joined[0].kind === 'clicked' && joined[0].why === 'States a figure: $3,900', joined);
check('inheriting a reason does not rewrite the stored row', clicked.why === undefined);

const own = { kind: 'written', messageId: 'm1', why: 'Someone authorised something outright' };
const kept = FlowStorage.activityRows([own, shown]);
check('a reason already on the outcome row is kept',
  kept.length === 1 && kept[0].why === 'Someone authorised something outright');

const other = FlowStorage.activityRows([
  { kind: 'clicked', messageId: 'm2', label: 'Other' },
  { kind: 'shown', messageId: 'm1', why: 'States a figure: $3,900' }
]);
check('a shown row for a different message stays',
  other.length === 2 && other.some((e) => e.kind === 'shown' && e.messageId === 'm1'));

console.log('\n--- wiring ---\n');

const gmail = fs.readFileSync(path.join(__dirname, '..', 'src', 'content-gmail.js'), 'utf8');
const inject = gmail.slice(gmail.indexOf('function injectChip'));
const textAt = inject.indexOf("el('p', 'flow-chip-text')");
const whyAt = inject.indexOf('flow-chip-why');
const mainAt = inject.indexOf('flow-chip-main-row');
check('the chip renders one reason under the closing sentence and above Do It',
  textAt > 0 && whyAt > textAt && mainAt > whyAt, { textAt, whyAt, mainAt });
check('shown, clicked, written, and dismissed rows can carry why',
  ['kind: \'shown\'', 'kind: \'clicked\'', 'kind: \'written\'', 'kind: \'dismissed\''].every((k) => {
    const at = gmail.indexOf(k);
    return at > 0 && gmail.slice(at, at + 500).includes('reasonField');
  }));

const popup = fs.readFileSync(path.join(__dirname, '..', 'popup', 'popup.js'), 'utf8');
check('Activity uses activityRows and prints the reason',
  popup.includes('FlowStorage.activityRows') && popup.includes('log-why'));
check('the empty Activity hint is the scorer example, not a chip',
  popup.includes('FlowJudgment.activityExample') && popup.includes('log-example') &&
  !gmail.includes('activityExample'));

console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
