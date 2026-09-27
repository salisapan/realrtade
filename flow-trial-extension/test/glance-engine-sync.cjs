// The public demo runs flow-landing/assets/glance-engine.js, which is a
// concatenation of core/domains.js, core/extract.js, and core/judgment.js.
// scripts/build-glance-engine.sh is the only update path. These cases are
// the ones that drift silently: a date the extension files and a score the
// demo still computes from an older copy.
//
// Run: node test/glance-engine-sync.cjs

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function load(files) {
  const sandbox = { module: undefined, console };
  vm.createContext(sandbox);
  for (const file of files) {
    vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: path.basename(file) });
  }
  return {
    extract: vm.runInContext('FlowExtract', sandbox),
    judgment: vm.runInContext('FlowJudgment', sandbox)
  };
}

const coreDir = path.join(__dirname, '..', 'core');
const core = load([
  path.join(coreDir, 'domains.js'),
  path.join(coreDir, 'extract.js'),
  path.join(coreDir, 'judgment.js')
]);
const demo = load([path.join(__dirname, '..', '..', 'flow-landing', 'assets', 'glance-engine.js')]);

const NOW = new Date('2026-09-18T10:00:00Z');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const dates = [
  'Let us do a call next Friday at 3pm.',
  'פגישה ביום שני הבא בשעה 15:00',
  'ביום שני הבאנו את החוזה',
  'פגישה ב-21 בספטמבר בשעה 15:00',
  'the invoice is due tomorrow',
  'scope document today'
];
for (const text of dates) {
  const a = core.extract.parseDate(text, NOW);
  const b = demo.extract.parseDate(text, NOW);
  check('demo date matches extension: ' + text, JSON.stringify(a) === JSON.stringify(b), { extension: a, demo: b });
}

const scored = 'Confirming we are agreed at $3,900 for the year. Countersigned copy attached, effective Sep 7.';
const ctx = { subject: 'Re: Meridian agreement', senderEmail: 'dana@meridian.com', now: NOW, calibration: null };
const a = core.judgment.evaluate(scored, 'sales', ctx);
const b = demo.judgment.evaluate(scored, 'sales', ctx);
check('demo score matches extension on a signed contract',
  !!a && !!b && a.score === b.score && a.label === b.label,
  { extension: a && { score: a.score, label: a.label }, demo: b && { score: b.score, label: b.label } });

const quiet = 'Our quote is $12,500 for the work described below in the attached scope document today.';
const quietCtx = { senderEmail: 'dana@meridian.com', now: NOW, calibration: null };
const aq = core.judgment.evaluate(quiet, 'sales', quietCtx);
const bq = demo.judgment.evaluate(quiet, 'sales', quietCtx);
check('demo stays as quiet as the extension on a bare quote',
  !aq && !bq, { extension: aq && aq.score, demo: bq && bq.score });

console.log('\nTOTAL FAILURES:', failures);
if (failures) console.log('Regenerate with: scripts/build-glance-engine.sh');
process.exit(failures ? 1 : 0);
