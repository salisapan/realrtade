// KEEP-GOING copy of regress-144: records every failure and suppressed exit
// instead of stopping at the first miss (stock corpus exits early at ~514).
// Run: TZ=Asia/Jerusalem node test/regress-144-keep-going-corpus.cjs
const fs = require('fs');
const path = require('path');

process.env.TZ = process.env.TZ || 'Asia/Jerusalem';

const src = fs.readFileSync(path.join(__dirname, 'regress-144-corpus.cjs'), 'utf8');
const patched = src
  .replace(/process\.exit\(1\)/g, 'throw new Error("regress-144-keep-going")')
  .replace(/process\.exit\(fails\.length \? 1 : 0\)/g, 'if (fails.length) throw new Error("regress-144-keep-going"); else { /* done */ }');

const failures = [];
const suppressed = [];
const realExit = process.exit;
process.exit = function (code) {
  if (code) suppressed.push('process.exit(' + code + ')');
};
const realLog = console.log;
console.log = function (...args) {
  const line = args.map(String).join(' ');
  if (line.indexOf('FAIL:') === 0) failures.push(line);
  realLog.apply(console, args);
};

try {
  eval(patched);
} catch (e) {
  if (String(e && e.message) !== 'regress-144-keep-going') throw e;
}

let offer = 0;
let offerFail = 0;
let quiet = 0;
let quietFail = 0;
const FIXTURE = path.join(__dirname, 'fixtures', 'regress-144-all-rounds.jsonl');
const rows = fs.readFileSync(FIXTURE, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
for (const row of rows) {
  if (row.expected === 'offer') offer += 1;
  if (row.expected === 'quiet') quiet += 1;
}
for (const f of failures) {
  if (/\boffer\b/i.test(f) || /reply track|expectKind.*request/i.test(f)) offerFail += 1;
  else if (/\bquiet\b/i.test(f) || /probe-pgishat|attach-quiet/i.test(f)) quietFail += 1;
}

realLog('\n--- keep-going summary ---');
realLog('failures recorded:', failures.length);
realLog('suppressed exits:', suppressed.length);
realLog('offer rows', offer, 'offer-related failures', offerFail);
realLog('quiet rows', quiet, 'quiet-related failures', quietFail);
if (failures.length || suppressed.length) {
  realExit(1);
}
realExit(0);
