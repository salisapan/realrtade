// The capability probe (glance-ai/scoreboard/capabilities): one hand-written row per KIND of close, through the product's recognition union (kind-specific readers
// first, then the shared judge, every Labs switch on). This corpus pins the result so a change cannot silently drop a kind or add a wrong Do It, and so a fixed gap
// has to be removed from DECLARED_GAPS on purpose. The rows are written for this lab; no real mail. Run: node test/capability-probe-corpus.cjs
const path = require('path');
const { spawnSync } = require('child_process');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const run = spawnSync(process.execPath, [path.join(__dirname, '..', '..', 'glance-ai', 'scoreboard', 'capabilities', 'run.cjs'), '--json'], { encoding: 'utf8', maxBuffer: 1 << 26 });
check('the probe runs', run.status === 0, run.stderr && run.stderr.slice(0, 300));
const j = JSON.parse(run.stdout || '{"out":{},"detail":[],"tot":{}}');
const SAME = { video_link: ['calendar'], file_find: ['draft', 'file_save'], slides_create: ['doc_create'], form_create: ['doc_create'], excel_create: ['word_create', 'sheet_create'], word_create: ['doc_create'], sheet_row: ['task'], doc_append: ['task'], pay: ['task'] };
const ok = (want, got) => (want === 'none' ? got === 'none' : got !== 'none' && (got === want || (SAME[want] || []).indexOf(got) >= 0));
const misses = j.detail.filter((d) => !ok(d[3], d[4])).map((d) => d[0] + ' ' + d[1] + ' ' + d[2]);
// Gaps the probe found on 2026-11-14 and that stay open on purpose (each is in docs/glance-ai/model-capability-map-2026-11-14.md). Fix one, then delete its line here.
const DECLARED_GAPS = [
  'cal.move en outlook', 'cal.move he outlook', 'cal.cancel en outlook', 'cal.cancel he outlook', // Gmail reads them with CALENDAR_CHANGE on (test/calendar-change-corpus.cjs); Outlook has no calendar update or delete writer (judge reason no-draft-close)
  'form.create en gmail',                                                    // an imperative with no "please" and no name is not enough (precision); the named ask works
  'reply.ask he gmail', 'reply.ask he outlook',                              // «תוכל לאשר לי עד חמישי אם אתה מגיע לישיבה?»: since ישיבה joined the meeting nouns (2026-11-18) a confirm-attendance ask reads as a meeting task, like the same ask with פגישה or "the meeting"; a reply draft is the better close (open, see docs/open-tasks.md)
  'doc.append he gmail', 'doc.append en gmail'                               // "add this paragraph to the Q4 doc": no recognizer reads it; Hebrew falls to a reply draft
];
const unexpected = misses.filter((m) => DECLARED_GAPS.indexOf(m) < 0);
const fixed = DECLARED_GAPS.filter((m) => misses.indexOf(m) < 0);
check('no new miss and no new wrong Do It beyond the declared gaps', unexpected.length === 0, unexpected);
check('every declared gap is still a gap (a fixed one is removed from the list on purpose)', fixed.length === 0, fixed);
check('no negative row is offered (a wrong Do It would show here)', j.detail.filter((d) => d[3] === 'none' && d[4] !== 'none').length === 0, j.detail.filter((d) => d[3] === 'none' && d[4] !== 'none'));
check('a payment to a new bank account stays quiet with the payment and task readers on', j.detail.filter((d) => /^pay\.bankchange/.test(d[0])).every((d) => d[4] === 'none'));
check('the probe covers at least 25 kinds', Object.keys(j.out).length >= 25, Object.keys(j.out).length);
check('at least 107 of the scored rows are right', j.tot.right >= 107, j.tot);
console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
