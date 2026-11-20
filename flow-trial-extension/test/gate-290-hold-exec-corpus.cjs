// Gate #290(a) / 65267001: «שריין ג׳ 10:00» is next Tuesday 10:00 in
// Asia/Jerusalem, one calendar insert, verified by events.get even when
// Google reads the instant back as wall time. A known grant without
// calendar.events does not insert. A failure is not a silent unconfirmed.
// Run: node test/gate-290-hold-exec-corpus.cjs

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const ROOT = path.join(__dirname, '..');
const sandbox = { module: undefined, console, Date, URL, URLSearchParams, setTimeout, clearTimeout };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const f of ['proof-of-close.js', 'google-config.js', 'google-calendar.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'core', f), 'utf8'), sandbox, { filename: f });
}
const Cal = vm.runInContext('FlowGoogleCalendar', sandbox);
const Cfg = vm.runInContext('FlowGoogleConfig', sandbox);

const NOW = Date.parse('2026-11-20T10:00:00Z'); // Friday, Asia/Jerusalem is still Friday
const ZONE = 'Asia/Jerusalem';
const SCOPES = Cfg.oauthScopeSetExact();

check('ג׳ is Tuesday', Cal.hebrewWeekdayIndex('שריין ביום ג׳ 10:00') === 2);
check('a geresh U+05F3 is the same Tuesday', Cal.hebrewWeekdayIndex('יום ג\u05F3 10:00') === 2);
check('next Tuesday from Friday 20 Nov 2026 in Asia/Jerusalem is 24 Nov', Cal.nextWeekdayIso(2, ZONE, NOW) === '2026-11-24');

const body = Cal.eventBody({
  dateIso: '2026-11-24',
  hour: 10,
  minute: 0,
  title: 'שיחת וידאו עם רוני על התקציב 2',
  timeZone: ZONE
});
check('10:00 Asia/Jerusalem in November is 08:00Z', body && body.start.dateTime === '2026-11-24T08:00:00Z' && body.start.timeZone === ZONE, body && body.start);

function scripted(steps) {
  const calls = [];
  let i = 0;
  async function http(req) {
    calls.push({ method: req.method, url: req.url, body: req.body ? JSON.parse(req.body) : null });
    const step = steps[i++] || { status: 500, ok: false, json: null };
    return step;
  }
  return { http, calls };
}

(async () => {
  const sent = body;
  const wall = {
    id: 'evt-tue',
    status: 'confirmed',
    summary: sent.summary,
    description: sent.description,
    start: { dateTime: '2026-11-24T10:00:00', timeZone: ZONE },
    end: { dateTime: '2026-11-24T10:30:00', timeZone: ZONE },
    htmlLink: 'https://calendar.google.com/calendar/event?eid=evt-tue',
    organizer: { email: 'flow@example.com' }
  };
  const run = scripted([
    { status: 200, ok: true, json: Object.assign({ id: 'evt-tue', status: 'confirmed', htmlLink: wall.htmlLink }, sent) },
    { status: 200, ok: true, json: wall }
  ]);
  const result = await Cal.write({
    dateIso: '2026-11-20',
    hour: 10,
    minute: 0,
    title: sent.summary,
    timeZone: ZONE,
    callText: 'נקבע שיחת וידאו ביום ג׳ הקרוב ב-10:00, תשריין ביומן.',
    nowMs: NOW,
    scopes: SCOPES,
    calendarId: 'primary',
    expectAccount: 'flow@example.com'
  }, run.http, '2026-11-20T10:00:00.000Z');
  const post = run.calls.find((c) => c.method === 'POST');
  const get = run.calls.find((c) => c.method === 'GET');
  check('a wrong weekday on the payload is rewritten to next Tuesday before insert', post && post.body.start.dateTime === '2026-11-24T08:00:00Z', post && post.body.start);
  check('insert and verify use the same primary calendar', post && post.url.indexOf('/calendars/primary/events?') > 0 && get && get.url.indexOf('/calendars/primary/events/evt-tue') > 0, run.calls.map((c) => c.method + ' ' + c.url));
  check('wall-clock read-back is a verified close, not unconfirmed', result && result.ok === true && result.proof && result.proof.fetchedBack === true && result.ref && result.ref.calendarId === 'primary' && result.reason !== 'unconfirmed', result && { ok: result.ok, reason: result.reason, proof: result.proof && result.proof.fetchedBack });
  check('nothing was deleted', !run.calls.some((c) => c.method === 'DELETE'));

  const denied = scripted([]);
  const blocked = await Cal.write({
    dateIso: '2026-11-24', hour: 10, minute: 0, title: 'שיחה', timeZone: ZONE,
    scopes: SCOPES.filter((s) => s.indexOf('calendar') < 0)
  }, denied.http, '2026-11-20T10:00:00.000Z');
  check('a grant without calendar.events does not insert', blocked && blocked.ok === false && blocked.reason === 'calendar-not-granted' && denied.calls.length === 0, blocked);

  const undone = scripted([
    { status: 200, ok: true, json: wall },
    { status: 204, ok: true, json: null }
  ]);
  const undo = await Cal.undo({ eventId: 'evt-tue', externalId: 'evt-tue', calendarId: 'primary', contentHash: Cal.contentHash(wall) }, undone.http);
  check('Undo deletes that event on the same calendar', undo && undo.ok === true && undone.calls[1] && undone.calls[1].method === 'DELETE' && undone.calls[1].url.indexOf('/calendars/primary/events/evt-tue') >= 0, undone.calls);

  const gmail = fs.readFileSync(path.join(ROOT, 'src', 'content-gmail.js'), 'utf8');
  const view = fs.readFileSync(path.join(ROOT, 'src', 'step-list-view.js'), 'utf8');
  check('the Hebrew hold failure does not fall through to the English unconfirmed banner', gmail.indexOf("result: 'failed',\n        reason: 'unverified'") > 0 || gmail.indexOf("reason: 'unverified'") > 0);
  check('the Hebrew step banner does not use the English unconfirmed title', view.indexOf("עדיין פתוח · השלב לא אומת") > 0 && view.indexOf("title: n === 1 ? 'Still open · 1 step unconfirmed'") < 0);

  if (failures) {
    console.log('\n' + failures + ' failed');
    process.exit(1);
  }
  console.log('\nall passed');
})().catch((e) => {
  console.log('FAIL: threw', e);
  process.exit(1);
});
