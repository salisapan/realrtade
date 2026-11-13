// Live Gate on f2e6f3ee (Gmail, Hebrew UI, test account mailing itself), two misses:
//  1. "[G-Calendar] שיחת וידאו עם אופק על ה-onboarding" asked to book a call 10:00–10:30 and to put it on the calendar,
//     and the card offered a Google Task «בוא נקבע שיחת וידאו» instead of a calendar hold.
//  2. "[G-Tasks] דוח מע"מ לנובמבר": the card showed «עד 22 בנוב׳», Do It wrote the task with no due date and said טופל.
// The bodies below are the exact Gate bodies. Run: node test/gate-f2e6f3ee-corpus.cjs
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const EXT = path.join(__dirname, '..');
let failures = 0;
function expect(name, ok, detail) {
  if (ok) console.log('ok  ', name);
  else { failures++; console.error('FAIL', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

// ---- engine: the Gmail content script's own core files, in manifest order
const manifest = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
const gmailScripts = manifest.content_scripts.find((c) => c.matches.some((m) => m.indexOf('mail.google.com') >= 0)).js;
const sb = { console: { log() {}, warn() {}, error() {}, info() {}, debug() {} }, setTimeout, clearTimeout, TextEncoder, TextDecoder };
sb.globalThis = sb;
vm.createContext(sb);
for (const f of gmailScripts) {
  if (f.indexOf('core/') !== 0) continue;
  vm.runInContext(fs.readFileSync(path.join(EXT, f), 'utf8'), sb, { filename: f });
}
const g = (n) => vm.runInContext('typeof ' + n + ' !== "undefined" ? ' + n + ' : null', sb);
const Intent = g('FlowIntent');
const Actions = g('FlowActions');
const Judge = g('FlowIncomingJudge');
const DEPS = { intent: Intent, actions: Actions, factReply: g('FlowFactReply'), fileAttach: g('FlowFileAttach'), resolution: g('FlowResolution'), quietMetrics: g('FlowQuietMetrics') };

const OWN = 'ai.local.flow@gmail.com';
const NOW = new Date('2026-11-13T11:00:00+02:00');
const CAL_SUBJECT = '[G-Calendar] שיחת וידאו עם אופק על ה-onboarding';
const CAL_BODY = 'בוא נקבע שיחת וידאו ביום שלישי 17/11 בשעה 10:00 עד 10:30 על ה-onboarding של אופק. תשריין ביומן ותוסיף לינק ל-Meet.';
const TASK_SUBJECT = '[G-Tasks] דוח מע"מ לנובמבר';
const TASK_BODY = 'תזכורת: צריך להגיש את דוח המע"מ עד יום ראשון 22/11.';

// The Gmail page's own path (content-gmail.js classifyForChip -> planOpenMail): a self-mail carries To = own address.
function gmailPlan(body, subject, self) {
  const prepared = Judge.prepareForJudge(body);
  const ctx = {
    now: NOW, subject: subject, senderEmail: self ? OWN : 'dana@example.com', senderName: self ? 'flow' : 'Dana',
    to: [OWN], cc: [], ownAddresses: [OWN], ownNames: ['Sali'], inbound: !self, threadUrl: 'https://mail.google.com/mail/u/0/#inbox/x'
  };
  const intent = Intent.classify(prepared, ctx);
  const process = intent && intent.type ? Actions.planFor(intent, { threadUrl: ctx.threadUrl, text: body }) : null;
  return { intent, steps: (process && process.steps) || [] };
}
// The shared judge (Outlook, the add-on, the Gmail second read) on the same mail.
function judged(body, subject, self, surface) {
  return Judge.judge({
    text: body, subject: subject, sender: { name: self ? 'flow' : 'Dana', email: self ? OWN : 'dana@example.com' }, now: NOW,
    threadUrl: 'https://mail.google.com/x', to: [OWN], cc: [], ownAddresses: [OWN], hasThreadAttachment: false, attachmentCount: 0,
    surface: surface || 'gmail', ownNames: ['Sali'], namesPending: false, namesWaitDone: true, inbound: !self
  }, DEPS);
}
const calendarStep = (steps) => steps.find((s) => s.kind === 'calendar') || null;
const taskStep = (steps) => steps.find((s) => s.kind === 'googleTask' || s.kind === 'googleTasks') || null;

// ---- 1. the meeting mail is a calendar hold, Tue 17/11 10:00-10:30, self-sent and inbound alike
for (const self of [true, false]) {
  const who = self ? 'self-mail' : 'inbound';
  const r = gmailPlan(CAL_BODY, CAL_SUBJECT, self);
  const cal = calendarStep(r.steps);
  expect(who + ': meeting mail is not a task', !taskStep(r.steps) && !(r.intent && r.intent.selfTask), { kinds: r.steps.map((s) => s.kind), selfTask: r.intent && r.intent.selfTask });
  expect(who + ': meeting mail gets a calendar step', Boolean(cal), r.steps.map((s) => s.kind));
  if (cal) {
    const p = cal.params;
    expect(who + ': hold on Tue 2026-11-17 at 10:00', p.dateIso === '2026-11-17' && p.hour === 10 && p.minute === 0, p);
    expect(who + ': hold ends 10:30 (30 minutes)', p.durationMinutes === 30, p.durationMinutes);
    expect(who + ': hold needs its clock', p.requireTime === true, p.requireTime);
    expect(who + ': hold is not a mutate', p.calendarOp == null, p.calendarOp);
  }
  expect(who + ': card label is not the task title', r.intent && r.intent.label !== 'בוא נקבע שיחת וידאו', r.intent && r.intent.label);
  // The card copy never promises Meet: nothing in the plan names Meet (MEET_LINK is a Labs switch, off by default).
  expect(who + ': plan names no Meet link', !/meet\.google|Meet link|לינק ל-?Meet/i.test(JSON.stringify(r.steps.map((s) => ({ label: s.label, hint: s.hint })))), r.steps.map((s) => s.hint));
  for (const surface of ['gmail', 'outlook']) {
    const j = judged(CAL_BODY, CAL_SUBJECT, self, surface);
    const kinds = j.show && j.process ? j.process.steps.map((s) => s.kind) : [];
    expect(who + ' judge ' + surface + ': shows a hold, not a task', j.show && kinds.some((k) => k === 'calendar' || k === 'outlookCalendar') && !kinds.some((k) => /task|todo/i.test(k)), { reason: j.reason, kinds });
  }
}

// A stated range is the hold's length; no range keeps the writer's default.
{
  const longer = gmailPlan('בוא נקבע שיחה ביום שלישי 17/11 בשעה 10:00 עד 11:15 על התקציב. תשריין ביומן.', 'שיחה על התקציב', true);
  const c = calendarStep(longer.steps);
  expect('range 10:00 עד 11:15 is 75 minutes', c && c.params.durationMinutes === 75, c && c.params);
  const plain = gmailPlan('בוא נקבע שיחה ביום שלישי 17/11 בשעה 10:00 על התקציב. תשריין ביומן.', 'שיחה על התקציב', true);
  const p = calendarStep(plain.steps);
  expect('no range: no durationMinutes (writer default)', p && p.params.durationMinutes === undefined, p && p.params);
  const en = gmailPlan('Can we meet on Tuesday 17/11 at 10:00-10:45 to go over onboarding with Ofek? Please put it on my calendar.', 'Ofek onboarding', true);
  const e = calendarStep(en.steps);
  expect('English self-note "put it on my calendar" with 10:00-10:45 is a 45-minute hold', e && e.params.durationMinutes === 45 && !taskStep(en.steps), { kinds: en.steps.map((s) => s.kind), params: e && e.params });
}

// A self-note that does not ask for the calendar stays the task it always was; a negated ask too.
{
  const note = gmailPlan('שיחה עם אופק ביום שלישי 17/11 בשעה 10:00 על ה-onboarding.', 'אופק', true);
  expect('self-note with no calendar ask stays a task', !calendarStep(note.steps) || Boolean(taskStep(note.steps)) || note.steps.length === 0, note.steps.map((s) => s.kind));
  const neg = gmailPlan('פגישה עם אופק ביום שלישי 17/11 בשעה 10:00. אל תשריין ביומן עדיין.', 'אופק', true);
  expect('"אל תשריין ביומן" is not a hold', !calendarStep(neg.steps), neg.steps.map((s) => s.kind));
  const past = gmailPlan('בוא נקבע שיחת וידאו ביום שלישי 10/11 בשעה 10:00 עד 10:30. תשריין ביומן.', 'אופק', true);
  expect('a past day is not a hold', !calendarStep(past.steps), past.steps.map((s) => s.kind));
}

// ---- 2. the task mail: the task step carries the due day the card shows
{
  const r = gmailPlan(TASK_BODY, TASK_SUBJECT, true);
  const t = taskStep(r.steps);
  expect('VAT reminder is a task', Boolean(t), r.steps.map((s) => s.kind));
  expect('VAT task step carries due 2026-11-22', t && t.params.dateIso === '2026-11-22', t && t.params);
  const j = judged(TASK_BODY, TASK_SUBJECT, true, 'gmail');
  const jt = j.show && j.process ? taskStep(j.process.steps) : null;
  expect('judge: VAT task step carries due 2026-11-22', jt && jt.params.dateIso === '2026-11-22', { reason: j.reason, params: jt && jt.params });
}

// ---- 2b. the lane: a payload whose step has no date still writes the card's day; the read-back must return it
const laneSb = {
  module: undefined, console: { log() {}, warn() {}, error() {}, info() {}, debug() {} }, atob: (s) => Buffer.from(s, 'base64').toString('binary'),
  TextEncoder, Uint8Array, Date, setTimeout, clearTimeout, AbortController, URL,
  fetch: async () => ({ ok: false, status: 0, text: async () => '' }),
  chrome: {
    identity: { getAuthToken: (d, cb) => cb && cb('') },
    runtime: { onMessage: { addListener() {} }, lastError: null },
    i18n: { getUILanguage: () => 'he' },
    storage: { local: { get: async () => ({ googleTasksAuth: { taskListId: 'glance-list' } }), set: async () => {}, remove: async () => {} } }
  }
};
laneSb.globalThis = laneSb;
vm.createContext(laneSb);
for (const f of ['google-config.js', 'google-account.js', 'google-calendar.js', 'google-tasks.js', 'google-proof.js']) {
  vm.runInContext(fs.readFileSync(path.join(EXT, 'core', f), 'utf8'), laneSb, { filename: f });
}
vm.runInContext(fs.readFileSync(path.join(EXT, 'src', 'google-lane.js'), 'utf8'), laneSb, { filename: 'google-lane.js' });
vm.runInContext(fs.readFileSync(path.join(EXT, 'src', 'google-lane-host.js'), 'utf8').replace(/^import .*;$/gm, ''), laneSb, { filename: 'google-lane-host.js' });
const prepareWrite = vm.runInContext('prepareWrite', laneSb);
const Tasks = vm.runInContext('FlowGoogleTasks', laneSb);
const ahead = new Date(Date.now() + 9 * 86400000);
const pad = (v) => String(v).padStart(2, '0');
const AHEAD = ahead.getFullYear() + '-' + pad(ahead.getMonth() + 1) + '-' + pad(ahead.getDate());

(async () => {
  // content-gmail.js buildActionPayload for googleTask: params.dateIso from the step, facts from the intent.
  const fromFacts = await prepareWrite('googleLaneTask', { label: 'להגיש את דוח המע"מ', params: { dateIso: null, what: 'להגיש את דוח המע"מ' }, facts: { date: { iso: AHEAD } } }, null);
  expect('lane: step with no date writes the facts day the card showed', fromFacts.dueIso === AHEAD, fromFacts);
  const fromStep = await prepareWrite('googleLaneTask', { label: 'x', params: { dateIso: AHEAD }, facts: { date: { iso: '2001-01-01' } } }, null);
  expect('lane: the step date wins over facts', fromStep.dueIso === AHEAD, fromStep);
  const pastFacts = await prepareWrite('googleLaneTask', { label: 'x', params: {}, facts: { date: { iso: '2001-01-01' } } }, null);
  expect('lane: a facts day behind today is no due date', pastFacts.dueIso === null, pastFacts);

  // FlowGoogleTasks.write posts due as RFC3339 midnight UTC and claims Handled only when the read-back has that day.
  function fakeTasks(dropDue) {
    const posted = [];
    let saved = null;
    const http = async (req) => {
      if (req.method === 'GET' && /\/users\/@me\/lists\//.test(req.url)) return { status: 200, ok: true, json: { id: 'glance-list', title: 'Glance' } };
      if (req.method === 'POST') {
        const b = JSON.parse(req.body);
        posted.push(b);
        saved = Object.assign({ id: 't1', selfLink: 'https://tasks.googleapis.com/tasks/v1/lists/glance-list/tasks/t1' }, b);
        if (dropDue) delete saved.due;
        return { status: 200, ok: true, json: { id: 't1' } };
      }
      if (req.method === 'GET') return { status: 200, ok: true, json: saved };
      if (req.method === 'DELETE') { saved = null; return { status: 204, ok: true, json: null }; }
      return { status: 400, ok: false, json: null };
    };
    return { http, posted };
  }
  const good = fakeTasks(false);
  const okRes = await Tasks.write({ title: 'להגיש את דוח המע"מ', taskListId: 'glance-list', dueIso: '2026-11-22', scopes: null, readBackDelays: [] }, good.http);
  expect('Tasks.write posts due 2026-11-22T00:00:00.000Z', good.posted[0] && good.posted[0].due === '2026-11-22T00:00:00.000Z', good.posted[0]);
  expect('Tasks.write with due read back is Handled', okRes.ok === true, okRes);
  const bad = fakeTasks(true);
  const badRes = await Tasks.write({ title: 'להגיש את דוח המע"מ', taskListId: 'glance-list', dueIso: '2026-11-22', scopes: null, readBackDelays: [] }, bad.http);
  expect('Tasks.write whose read-back lost the due is not Handled', badRes.ok !== true && badRes.reason === 'verify_failed', badRes);

  // ---- 3. one console line per engine silence: the reason and the message id only
  const gmail = fs.readFileSync(path.join(EXT, 'src', 'content-gmail.js'), 'utf8');
  const rs = gmail.slice(gmail.indexOf('function recordSilence(messageId, reason, detail) {'), gmail.indexOf('function recordSilence(messageId, reason, detail) {') + 400);
  expect('recordSilence logs [Glance] silent: reason, messageId', rs.indexOf("console.log('[Glance] silent:', reason, messageId);") > 0, rs.slice(0, 200));

  if (failures) { console.error(failures + ' failure(s)'); process.exit(1); }
  console.log('gate-f2e6f3ee-corpus: all passed');
})().catch((e) => { console.error(e); process.exit(1); });
