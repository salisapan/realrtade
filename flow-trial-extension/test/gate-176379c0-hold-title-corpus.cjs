// Live Gate on 176379c0 (Gmail, Hebrew UI, test account mailing itself), two
// follow-ups on the calendar hold, plus a silence-log check:
//  (a) "[G-Calendar] שיחת וידאו עם אופק על ה-onboarding" created an event titled
//      «שריין ג׳ 10:00» (the card label) instead of the meeting subject
//      «שיחת וידאו עם אופק על ה-onboarding».
//  (b) The event description contained the email-body line twice.
//  (c) content-gmail.js recordSilence must print «[Glance] silent: <reason>»
//      on every engine silence, including a past-date miss, with no body text.
// The bodies below are the exact Gate bodies. Run: node test/gate-176379c0-hold-title-corpus.cjs
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const EXT = path.join(__dirname, '..');
let failures = 0;
function expect(name, ok, detail) {
  if (ok) console.log('ok  ', name);
  else { failures++; console.error('FAIL', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const manifest = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
const gmailScripts = manifest.content_scripts.find((c) => c.matches.some((m) => m.indexOf('mail.google.com') >= 0)).js;
const sb = { console: { log() {}, warn() {}, error() {}, info() {}, debug() {} }, setTimeout, clearTimeout, TextEncoder, TextDecoder };
sb.globalThis = sb;
vm.createContext(sb);
for (const f of gmailScripts) {
  if (f.indexOf('core/') !== 0) continue;
  vm.runInContext(fs.readFileSync(path.join(EXT, f), 'utf8'), sb, { filename: f });
}
vm.runInContext(fs.readFileSync(path.join(EXT, 'core', 'google-calendar.js'), 'utf8'), sb, { filename: 'core/google-calendar.js' });
const g = (n) => vm.runInContext('typeof ' + n + ' !== "undefined" ? ' + n + ' : null', sb);
const Intent = g('FlowIntent');
const Actions = g('FlowActions');
const Judge = g('FlowIncomingJudge');
const Display = g('FlowDisplay');
const Cal = g('FlowGoogleCalendar');
const DEPS = { intent: Intent, actions: Actions, factReply: g('FlowFactReply'), fileAttach: g('FlowFileAttach'), resolution: g('FlowResolution'), quietMetrics: g('FlowQuietMetrics') };

const OWN = 'ai.local.flow@gmail.com';
const NOW = new Date('2026-11-13T11:00:00+02:00');
const CAL_SUBJECT = '[G-Calendar] שיחת וידאו עם אופק על ה-onboarding';
const CAL_TITLE = 'שיחת וידאו עם אופק על ה-onboarding';
const CAL_BODY = 'בוא נקבע שיחת וידאו ביום שלישי 17/11 בשעה 10:00 עד 10:30 על ה-onboarding של אופק. תשריין ביומן ותוסיף לינק ל-Meet.';

function gmailPlan(body, subject, self) {
  const prepared = Judge.prepareForJudge(body);
  const ctx = {
    now: NOW, subject: subject, senderEmail: self ? OWN : 'dana@example.com', senderName: self ? 'flow' : 'Dana',
    to: [OWN], cc: [], ownAddresses: [OWN], ownNames: ['Sali'], inbound: !self, threadUrl: 'https://mail.google.com/mail/u/0/#inbox/x'
  };
  const intent = Intent.classify(prepared, ctx);
  const process = intent && intent.type ? Actions.planFor(intent, { threadUrl: ctx.threadUrl, text: body, subject: subject }) : null;
  return { intent, process, steps: (process && process.steps) || [] };
}
function judged(body, subject, self, surface) {
  return Judge.judge({
    text: body, subject: subject, sender: { name: self ? 'flow' : 'Dana', email: self ? OWN : 'dana@example.com' }, now: NOW,
    threadUrl: 'https://mail.google.com/x', to: [OWN], cc: [], ownAddresses: [OWN], hasThreadAttachment: false, attachmentCount: 0,
    surface: surface || 'gmail', ownNames: ['Sali'], namesPending: false, namesWaitDone: true, inbound: !self
  }, DEPS);
}
const calendarStep = (steps) => steps.find((s) => s.kind === 'calendar') || null;

function eventOf(title, quote, extra) {
  return Cal.eventBody(Object.assign({
    dateIso: '2026-11-17', hour: 10, minute: 0, durationMinutes: 30,
    title: title, quote: quote, timeZone: 'Asia/Jerusalem'
  }, extra || {}));
}

function quoteCount(description, line) {
  const text = String(description || '');
  if (!line) return 0;
  let n = 0;
  let from = 0;
  while (from <= text.length) {
    const at = text.indexOf(line, from);
    if (at < 0) return n;
    n++;
    from = at + line.length;
  }
  return n;
}

// ---- (a) event title is the meeting subject, tags stripped; card label stays
for (const self of [true, false]) {
  const who = self ? 'self-mail' : 'inbound';
  const r = gmailPlan(CAL_BODY, CAL_SUBJECT, self);
  const cal = calendarStep(r.steps);
  expect(who + ': meeting mail still gets a calendar hold', Boolean(cal) && cal.params.dateIso === '2026-11-17' && cal.params.hour === 10 && cal.params.durationMinutes === 30, cal && cal.params);
  expect(who + ': event title is the subject without [G-Calendar]', cal && cal.params.title === CAL_TITLE, cal && cal.params.title);
  const card = Display.cardTitle('he', { process: r.process, intent: r.intent, glanceChain: 'calendar-hold', bodyText: CAL_BODY }, r.intent && r.intent.label);
  expect(who + ': card label stays שריין ג׳ 10:00', card === 'שריין ג׳ 10:00', card);
  const written = Display.artifactTitle('he', { process: r.process, intent: r.intent, glanceChain: 'calendar-hold', bodyText: CAL_BODY }, cal && cal.params.title);
  expect(who + ': artifact title keeps the subject, not the card label', written === CAL_TITLE, written);
  const ev = eventOf(written, cal && cal.params.quote);
  expect(who + ': calendar event summary is the subject', ev && ev.summary === CAL_TITLE, ev && ev.summary);
  for (const surface of ['gmail', 'outlook']) {
    const j = judged(CAL_BODY, CAL_SUBJECT, self, surface);
    const step = j.show && j.process ? (j.process.steps.find((s) => s.kind === 'calendar' || s.kind === 'outlookCalendar') || null) : null;
    expect(who + ' judge ' + surface + ': event title is the cleaned subject', step && step.params.title === CAL_TITLE, step && step.params.title);
  }
}

{
  const r = gmailPlan(CAL_BODY, 'Re: [G-Calendar] שיחת וידאו עם אופק על ה-onboarding', true);
  const cal = calendarStep(r.steps);
  expect('Re: [G-Calendar] still strips to the meeting subject', cal && cal.params.title === CAL_TITLE, cal && cal.params.title);
}

{
  const r = gmailPlan(CAL_BODY, '', true);
  const cal = calendarStep(r.steps);
  const fallback = cal && cal.params.title;
  expect('empty subject falls back to the meeting sentence, not the card label',
    Boolean(fallback) && fallback !== 'שריין ג׳ 10:00' && fallback !== 'Hold' && /שיחת וידאו|onboarding|אופק/.test(fallback),
    fallback);
  const card = Display.cardTitle('he', { process: r.process, intent: r.intent, glanceChain: 'calendar-hold', bodyText: CAL_BODY }, r.intent && r.intent.label);
  expect('empty subject: card label still שריין ג׳ 10:00', card === 'שריין ג׳ 10:00', card);
}

// ---- (b) description contains the body line once, never twice
{
  const r = gmailPlan(CAL_BODY, CAL_SUBJECT, true);
  const cal = calendarStep(r.steps);
  const ev = eventOf(cal.params.title, cal.params.quote);
  const line = cal.params.quote;
  expect('quote is the body sentence', Boolean(line) && line.indexOf('בוא נקבע שיחת וידאו') === 0, line);
  expect('description includes the body sentence once', ev && quoteCount(ev.description, line) === 1, ev && ev.description);
  const dup = eventOf('שריין ג׳ 10:00', line);
  expect('even if the title is the old card label, the body line is still once', dup && quoteCount(dup.description, line) === 1, dup && dup.description);
  const same = eventOf(line, line);
  expect('when title equals the quote, the line is not repeated in the description', same && quoteCount(same.description, line) === 0, same && same.description);
}

// ---- (c) every engine silence, including past-date, logs a reason and no body
{
  const src = fs.readFileSync(path.join(EXT, 'src', 'content-gmail.js'), 'utf8');
  const recStart = src.indexOf('function recordSilence(');
  const recEnd = src.indexOf('\n  function ', recStart + 1);
  const rec = recStart >= 0 && recEnd > recStart ? src.slice(recStart, recEnd) : '';
  expect('recordSilence prints [Glance] silent: reason and message id',
    rec.indexOf("console.log('[Glance] silent:', reason, messageId)") >= 0, rec.slice(0, 200));
  expect('recordSilence log does not include the body',
    rec.indexOf('bodyText') < 0 && rec.indexOf('ctx.text') < 0 && rec.indexOf('ctx.body') < 0, rec);
  const noProc = src.indexOf("logScanSkip(messageId, 'no-process')");
  const noProcSlice = noProc >= 0 ? src.slice(noProc, noProc + 280) : '';
  expect('no-process silence goes through recordSilence', noProcSlice.indexOf("recordSilence(messageId, 'no-process')") >= 0, noProcSlice);
  const helperStart = src.indexOf('function engineSilenceReason(');
  const helperEnd = src.indexOf('\n  function ', helperStart + 1);
  const helper = helperStart >= 0 && helperEnd > helperStart ? src.slice(helperStart, helperEnd) : '';
  expect('engineSilenceReason names a past-date miss', helper.indexOf("return 'past-date'") >= 0 && helper.indexOf('body') < 0, helper.slice(0, 240));
  const noChip = src.indexOf('const silenceReason = engineSilenceReason(intent, reason);');
  expect('the no-chip path records engineSilenceReason, including past-date',
    noChip >= 0 && src.slice(noChip, noChip + 280).indexOf('recordSilence(messageId, silenceReason') >= 0);
  const calWrite = src.slice(src.indexOf("if (action.kind === 'calendar')"), src.indexOf("if (action.kind === 'googleContactAnswer'"));
  expect('Do It does not copy the card label onto the calendar event',
    calWrite.indexOf('params.title = artifactTitleFor(ctx, params.title)') >= 0 &&
    calWrite.indexOf('params.title = renderedTitleFor(ctx, params.title)') < 0, calWrite.slice(0, 200));
}

if (failures) {
  console.error('\n' + failures + ' failed');
  process.exit(1);
}
console.log('\nall passed');
