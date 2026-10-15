// Weekday + day-first date + בשעה HH:MM is one clock. A contradicting
// weekday stays quiet. The calendar refusal does not say "file".
// Run in UTC and Asia/Jerusalem: node test/hebrew-hold-corpus.cjs

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const ROOT = path.join(__dirname, '..');
const sandbox = { module: undefined, console, Date, URL, URLSearchParams };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const f of ['domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'close-families.js', 'intent.js', 'actions.js', 'google-config.js', 'google-calendar.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'core', f), 'utf8'), sandbox, { filename: f });
}
const FlowExtract = vm.runInContext('FlowExtract', sandbox);
const FlowIntent = vm.runInContext('FlowIntent', sandbox);
const FlowActions = vm.runInContext('FlowActions', sandbox);
const Cal = vm.runInContext('FlowGoogleCalendar', sandbox);

const TEXT = 'פגישה ביום חמישי 22/10 בשעה 14:00';
const QUIET = 'פגישה ביום ראשון 22/10 בשעה 14:00';
const now = new Date(2026, 9, 15, 12, 0, 0);

const facts = FlowExtract.extract(TEXT, { now: now });
check('weekday and 22/10 and בשעה 14:00 is Thu 22 Oct 2026 at 14:00', facts && facts.date && facts.date.iso === '2026-10-22' && facts.time && facts.time.hour === 14 && facts.time.minute === 0, facts && { date: facts.date, time: facts.time });

const classified = FlowIntent.classify(TEXT, { now: now, senderName: 'flow' });
check('the meeting is a scheduled event with that clock', classified && classified.type && classified.entities && classified.entities.dateIso === '2026-10-22' && classified.entities.hour === 14 && classified.entities.minute === 0, classified && { type: classified.type, entities: classified.entities, quiet: classified.quiet });
const plan = FlowActions.planFor(classified, {});
const calendar = plan && plan.steps && plan.steps.find((step) => step.kind === 'calendar');
check('the plan writes a calendar hold', !!(calendar && calendar.params && calendar.params.dateIso === '2026-10-22' && calendar.params.hour === 14), plan && plan.steps && plan.steps.map((s) => s.kind));

const quiet = FlowIntent.classify(QUIET, { now: now, senderName: 'flow' });
check('a weekday that contradicts the date stays quiet', quiet && quiet.type == null && quiet.quiet === 'date', quiet && { type: quiet.type, quiet: quiet.quiet });

const body = Cal.eventBody({
  dateIso: '2026-10-22',
  hour: 14,
  minute: 0,
  title: 'פגישה',
  quote: TEXT,
  timeZone: 'Asia/Jerusalem'
});
check('the hold is 14:00 in Asia/Jerusalem and names no file', body && body.start.dateTime === '2026-10-22T14:00:00' && body.start.timeZone === 'Asia/Jerusalem' && body.summary === 'פגישה' && !/File:/.test(body.description || ''), body);

const missing = Cal.eventBody({ title: 'פגישה' });
check('a hold with no clock is refused without the word file', missing === null);
const src = fs.readFileSync(path.join(ROOT, 'core', 'google-calendar.js'), 'utf8');
check('the calendar refusal does not say file', src.indexOf('No single time for this event.') > 0 && src.indexOf('No single file and time') < 0);

const posted = [];
const http = async (req) => {
  posted.push(req);
  const sent = req.body ? JSON.parse(req.body) : null;
  if (req.method === 'POST') {
    return { status: 200, ok: true, json: Object.assign({ id: 'evt-he', status: 'confirmed', htmlLink: 'https://calendar.google.com/calendar/event?eid=evt-he' }, sent) };
  }
  return { status: 200, ok: true, json: Object.assign({ id: 'evt-he', status: 'confirmed' }, posted[0] && JSON.parse(posted[0].body)) };
};
Cal.write({
  dateIso: '2026-10-22',
  hour: 14,
  minute: 0,
  title: 'פגישה',
  quote: TEXT,
  timeZone: 'Asia/Jerusalem'
}, http, '2026-10-15T12:00:00.000Z').then((result) => {
  const start = posted[0] && JSON.parse(posted[0].body).start;
  check('the calendar write reads the event back and proves it', result && result.ok === true && result.proof && result.proof.fetchedBack === true && result.ref && result.ref.contentHash && posted.some((r) => r.method === 'GET') && start && start.dateTime === '2026-10-22T14:00:00' && start.timeZone === 'Asia/Jerusalem', { result: result && { ok: result.ok, reason: result.reason }, start });
  if (failures) {
    console.log('\n' + failures + ' failed');
    process.exit(1);
  }
  console.log('\nall passed');
}).catch((e) => {
  console.log('FAIL: write threw', e);
  process.exit(1);
});
