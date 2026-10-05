'use strict';
/**
 * Family H (ambiguousClocks) miss corpus.
 *
 * (a)(b) must FAIL on pristine (quiet H) and PASS patched (not H).
 * (c)(d)(e)(f) must stay SILENT (quiet H) on both pristine and patched.
 *
 * Override: CLOSE_FAMILIES_JS=core/close-families.pristine.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const closeOverride = process.env.CLOSE_FAMILIES_JS
  ? path.resolve(root, process.env.CLOSE_FAMILIES_JS)
  : path.join(root, 'core/close-families.js');

const sandbox = { module: undefined, console };
vm.createContext(sandbox);
for (const f of ['domains.js', 'extract.js', 'judgment.js']) {
  const p = path.join(root, 'core', f);
  if (fs.existsSync(p)) {
    vm.runInContext(fs.readFileSync(p, 'utf8'), sandbox, { filename: f });
  }
}
vm.runInContext(fs.readFileSync(closeOverride, 'utf8'), sandbox, { filename: path.basename(closeOverride) });
const FlowCloseFamilies = vm.runInContext('FlowCloseFamilies', sandbox);

const MEETING_SUBJECT = 'Meeting Thursday 10:00 about the launch checklist?';
const MEETING_BODY =
  'Hi — can we meet Thursday Oct 8 at 10:00 for 30 min about the launch checklist?\n' +
  'Also please send the updated pricing sheet by Wednesday.\n' +
  'Thanks,\nSali';

const cases = [
  {
    id: 'a',
    expect: 'chip',
    text: MEETING_SUBJECT + '\n\n' + MEETING_BODY,
    note: 'subject+body of the meeting email',
  },
  {
    id: 'b',
    expect: 'chip',
    text: MEETING_BODY + '\n\n10:00 AM – 10:30 AM',
    note: "body + invite chip '10:00 AM – 10:30 AM'",
  },
  {
    id: 'c',
    expect: 'silent',
    text: 'Can we meet at 3pm or 4pm?',
    note: '3pm or 4pm',
  },
  {
    id: 'd',
    expect: 'silent',
    text: 'Tuesday 10:00, Wednesday 14:00 — which works for you?',
    note: 'Tuesday 10:00, Wednesday 14:00 — which works for you?',
  },
  {
    id: 'e',
    expect: 'silent',
    text: 'Can we meet Thursday at 10:00 or 11:30?',
    note: 'Can we meet Thursday at 10:00 or 11:30?',
  },
  {
    id: 'f',
    expect: 'silent',
    text: 'אפשר ליישב ביום שלישי בשעה 10:00 או בשעה 14:00?',
    note: 'Hebrew two-slot with או',
  },
];

const mode = process.env.CLOSE_FAMILIES_JS ? 'pristine' : 'patched';
console.log('=== family-h-clock-miss-corpus (' + mode + ') ===');
console.log('close: ' + path.relative(root, closeOverride));

let fail = 0;
for (const c of cases) {
  const fam = FlowCloseFamilies.assess(c.text, {}, {});
  const isH = !!(fam && fam.suppress && fam.family === 'H');
  let ok;
  let status;
  if (c.expect === 'chip') {
    ok = !isH;
    status = isH ? 'QUIET(H)' : (fam && fam.suppress ? 'QUIET(' + fam.family + ')' : (fam && fam.family ? 'OPEN/' + fam.family : 'OPEN'));
  } else {
    ok = isH;
    status = isH ? 'QUIET(H)' : (fam && fam.suppress ? 'QUIET(' + fam.family + ')' : (fam && fam.family ? 'OPEN/' + fam.family : 'OPEN'));
  }
  const mark = ok ? 'PASS' : 'FAIL';
  if (!ok) fail++;
  console.log(mark + ' [' + c.id + '] expect=' + c.expect + ' got=' + status + ' — ' + c.note);
  if (fam) console.log('      suppress=' + fam.suppress + ' family=' + fam.family + ' personalClose=' + (fam.personalClose || ''));
}
console.log('failures: ' + fail + ' / ' + cases.length);
process.exit(fail ? 1 : 0);
