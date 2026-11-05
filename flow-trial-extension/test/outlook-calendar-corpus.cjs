// Outlook Family B calendar hold. The sentence is the Gmail Path A gate.
// The write body is pure. Calendars.ReadWrite is required. The Calendar
// checkbox on the one Connect screen asks for it. Mail-only sign-in does not.
// Run: node test/outlook-calendar-corpus.cjs

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = { module: undefined, console };
vm.createContext(sandbox);
for (const f of ['domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'intent.js', 'actions.js', 'outlook-calendar.js', 'outlook-config.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'core', f), 'utf8'), sandbox, { filename: f });
}
const Cal = vm.runInContext('FlowOutlookCalendar', sandbox);
const Cfg = vm.runInContext('FlowOutlookConfig', sandbox);

// A number, not an outer Date: classify runs in a vm, and instanceof Date
// fails across that boundary. The day is tomorrow on the run clock, so a
// later calendar day cannot mark the gate as past.
const noon = new Date();
noon.setHours(12, 0, 0, 0);
const GATE_NOW = noon.getTime();
const tomorrow = new Date(noon.getTime());
tomorrow.setDate(tomorrow.getDate() + 1);
function isoDay(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
const TOMORROW = isoDay(tomorrow);
const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const HE_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
const EN_WHEN = EN_MONTHS[tomorrow.getMonth()] + ' ' + tomorrow.getDate() + ', ' + tomorrow.getFullYear();
const HE_WHEN = tomorrow.getDate() + ' ב' + HE_MONTHS[tomorrow.getMonth()] + ' ' + tomorrow.getFullYear();
const EN = 'Put the glance-pricing-q4.pdf file on my calendar tomorrow (' + EN_WHEN + ') at 10:00.';
const HE = 'שים את glance-pricing-q4.pdf ביומן מחר (' + HE_WHEN + ') בשעה 10:00.';
const FILE = { id: 'f1', name: 'glance-pricing-q4.pdf', url: 'https://drive.google.com/file/d/f1/view' };

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

function decide(text, extra) {
  return Cal.decide(Object.assign({ text: text, now: GATE_NOW, senderEmail: 'me@outlook.com' }, extra || {}));
}

console.log('\n--- the gate sentence is a calendar hold, or silence ---\n');
{
  const wait = decide(EN);
  check('without a Drive answer the gate waits on the file name', wait.move === 'wait' && wait.fileTerm === 'glance-pricing-q4.pdf', wait);
  const hold = decide(EN, { fileMatch: 'one' });
  check('one Drive file is a file-on-hold calendar step',
    hold.move === 'hold' && hold.process && hold.process.id === 'file-on-hold' &&
    hold.process.steps.length === 1 && hold.process.steps[0].kind === 'calendar' &&
    hold.params.dateIso === TOMORROW && hold.params.hour === 10 && hold.params.minute === 0 &&
    hold.params.fileTerm === 'glance-pricing-q4.pdf' && hold.params.requireTime === true,
    hold);
  const he = decide(HE, { fileMatch: 'one' });
  check('Hebrew ביומן is the same hold', he.move === 'hold' && he.fileTerm === 'glance-pricing-q4.pdf' && he.params && he.params.dateIso === TOMORROW, he);
  check('a hedge stays silent', decide('Maybe put the glance-pricing-q4.pdf file on my calendar tomorrow (' + EN_WHEN + ') at 10:00.', { fileMatch: 'one' }).move === 'silent');
  check('zero files stay silent', decide(EN, { fileMatch: 'none' }).move === 'silent');
  check('two files stay silent', decide(EN, { fileMatch: 'many' }).move === 'silent');
  check('a generic file stays silent', decide('Put the file on my calendar tomorrow (' + EN_WHEN + ') at 10:00.', { fileMatch: 'one' }).move !== 'hold');
  const FULL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  check('no clock stays silent', decide('Put the glance-pricing-q4.pdf file on my calendar on ' + FULL_MONTHS[tomorrow.getMonth()] + ' ' + tomorrow.getDate() + ', ' + tomorrow.getFullYear() + '.', { fileMatch: 'one' }).move === 'silent');
  check('a meeting with no file is not this close', decide('Can we meet tomorrow at 10:00 to go over the rollout?').move === 'ignore');
  check('a file asked before a meeting is not this close', decide("Could you send me the Q4 pricing sheet (glance-pricing-q4) before tomorrow's meeting?").move === 'ignore');
}

console.log('\n--- the event body carries the file link and invites nobody ---\n');
{
  const body = Cal.eventBody({
    dateIso: TOMORROW, hour: 10, minute: 0, timeZone: 'UTC',
    fileName: FILE.name, fileUrl: FILE.url, quote: EN
  });
  check('subject is the file, start is 10:00, end is 30 minutes later',
    body && body.subject === 'glance-pricing-q4.pdf' &&
    body.start.dateTime === TOMORROW + 'T10:00:00' && body.start.timeZone === 'UTC' &&
    body.end.dateTime === TOMORROW + 'T10:30:00', body);
  check('the description has the sentence and the file link',
    body && body.body.contentType === 'Text' && body.body.content.indexOf(EN) === 0 &&
    body.body.content.indexOf('File: glance-pricing-q4.pdf') > 0 &&
    body.body.content.indexOf(FILE.url) > 0, body && body.body);
  check('Graph body.content contains the https file URL and attendees length is 0',
    body && body.body.content.indexOf('https://drive.google.com/file/d/f1/view') > 0 &&
    Array.isArray(body.attendees) && body.attendees.length === 0 &&
    body.isOnlineMeeting !== true, body && { attendees: body.attendees, online: body.isOnlineMeeting });
  check('a missing link is not an event', Cal.eventBody({ dateIso: TOMORROW, hour: 10, minute: 0, fileName: FILE.name }) === null);
  check('an http link is not an event', Cal.eventBody({ dateIso: TOMORROW, hour: 10, minute: 0, fileName: FILE.name, fileUrl: 'http://drive.google.com/file/d/f1/view' }) === null);
  check('a missing clock is not an event', Cal.eventBody({ dateIso: TOMORROW, fileName: FILE.name, fileUrl: FILE.url }) === null);
  const undo = Cal.undoRequest('AAMkAG-ev1');
  check('undo deletes that one event', undo && undo.method === 'DELETE' && undo.path === '/me/events/AAMkAG-ev1', undo);
  check('undo refuses a path', Cal.undoRequest('ev/1') === null && Cal.undoRequest('') === null);
}

console.log('\n--- Calendars.ReadWrite is the Calendar checkbox, not the default sign-in ---\n');
{
  check('Calendars.Read cannot write', Cal.hasWriteScope(['Calendars.Read']) === false);
  check('an empty grant cannot write', Cal.hasWriteScope([]) === false && Cal.hasWriteScope(null) === false);
  check('ReadWrite.Shared is not this scope', Cal.hasWriteScope(['Calendars.ReadWrite.Shared']) === false);
  check('Calendars.ReadWrite can write', Cal.hasWriteScope(['offline_access', 'Calendars.ReadWrite']) === true);
  check('the Graph URL form of that same scope can write', Cal.hasWriteScope(['https://graph.microsoft.com/Calendars.ReadWrite']) === true);
  check('unknown is missing, in any spelling',
    Cal.hasWriteScope('unknown') === false && Cal.hasWriteScope(['unknown']) === false &&
    Cal.hasWriteScope('UNKNOWN') === false && Cal.holdConsentAsk('unknown', null) === true &&
    Cal.holdConsentAsk('missing', { mode: 'always' }) === true);
  check('only a short name or the Graph audience is Calendars.ReadWrite',
    Cal.hasWriteScope('Calendars.ReadWrite') === true &&
    Cal.hasWriteScope('https://graph.microsoft.com/Calendars.ReadWrite') === true &&
    Cal.hasWriteScope('api://foo/Calendars.ReadWrite') === false &&
    Cal.hasWriteScope('https://outlook.office.com/Calendars.ReadWrite') === false);
  function msJwt(scp) {
    const enc = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
    return enc({ alg: 'none', typ: 'JWT' }) + '.' + enc({ scp: scp }) + '.sig';
  }
  const liveMissing = {
    accessToken: msJwt('Mail.ReadWrite Tasks.ReadWrite User.Read email'),
    scope: 'unknown',
    grantedScopes: 'https://graph.microsoft.com/Mail.ReadWrite, https://graph.microsoft.com/Tasks.ReadWrite https://graph.microsoft.com/Calendars.ReadWrite openid profile offline_access'
  };
  check('a real token trusts scp over a stale cache and an unknown scope field',
    Cal.hasWriteScope(Cal.scopesFromToken(liveMissing)) === false &&
    Cal.scopesFromToken(liveMissing).indexOf('Calendars.ReadWrite') < 0, Cal.scopesFromToken(liveMissing));
  const liveGranted = {
    accessToken: msJwt('Mail.ReadWrite Calendars.ReadWrite'),
    scope: 'HTTPS://GRAPH.MICROSOFT.COM/Calendars.ReadWrite,openid,offline_access,profile'
  };
  check('a real token grants calendar from scp and from a comma-separated Graph URI',
    Cal.hasWriteScope(Cal.scopesFromToken(liveGranted)) === true &&
    Cal.hasWriteScope(Cal.normalizeDelegatedScopes(liveGranted.scope)) === true);
  const fromEndpoint = Cal.grantedScopesFromResponse({
    access_token: msJwt('Mail.ReadWrite Tasks.ReadWrite'),
    scope: 'unknown'
  }, { grantedScopes: ['Calendars.ReadWrite', 'Mail.ReadWrite'] });
  check('a token response of unknown does not keep a stale calendar grant',
    fromEndpoint && fromEndpoint.indexOf('Calendars.ReadWrite') < 0 && fromEndpoint.indexOf('Tasks.ReadWrite') >= 0, fromEndpoint);
  const mailOnly = Cfg.scopesFor(Cfg.defaultConnectIds());
  check('mail-only sign-in does not ask Calendars.ReadWrite', mailOnly.indexOf('Calendars.ReadWrite') < 0 && mailOnly.indexOf('Mail.Send') < 0, mailOnly);
  const asked = Cfg.scopesFor(['mail', 'calendar']);
  check('the calendar checkbox asks Calendars.ReadWrite and never Mail.Send',
    asked.indexOf('Calendars.ReadWrite') >= 0 && asked.indexOf('Calendars.ReadWrite.Shared') < 0 && asked.indexOf('Mail.Send') < 0, asked);
  const every = Cfg.scopesFor((Cfg.CONNECT_SERVICES || []).map((s) => s.id));
  const ids = (Cfg.CONNECT_SERVICES || []).map((s) => s.id);
  check('one screen still lists Mail, To Do, Calendar, OneDrive, Contacts and Teams',
    ['mail', 'todo', 'calendar', 'onedrive', 'contacts', 'teams'].every((id) => ids.indexOf(id) >= 0), ids);
  check('Select all adds To Do, the calendar write, OneDrive write, and the other optional reads',
    ['Tasks.ReadWrite', 'Calendars.ReadWrite', 'Files.ReadWrite', 'Contacts.Read', 'Chat.Read'].every((s) => every.indexOf(s) >= 0) && every.indexOf('Files.Read') < 0 && every.indexOf('Mail.Send') < 0 && !every.some((s) => /send/i.test(s)), every);
  const bg = fs.readFileSync(path.join(__dirname, '..', 'src', 'background.js'), 'utf8');
  check('the worker posts /me/events for this connector and deletes that event',
    /outlookCalendar: outlookCalendarWrite/.test(bg) &&
    /function outlookCalendarWrite/.test(bg) &&
    /OUTLOOK_GRAPH \+ '\/me\/events'/.test(bg) &&
    /JSON\.stringify\(body\)/.test(bg) &&
    /body\.attendees\.length/.test(bg) &&
    /outlookCalendar: outlookCalendarUndo/.test(bg));
  check('the worker still refuses a send', /function outlookAssertNotSend/.test(bg) && /outlookAssertNotSend\(url\)/.test(bg));
  const popup = fs.readFileSync(path.join(__dirname, '..', 'popup', 'popup.js'), 'utf8');
  const display = fs.readFileSync(path.join(__dirname, '..', 'core', 'display-copy.js'), 'utf8');
  check('Activity undo does not treat every Outlook row as a draft',
    popup.indexOf("e.connectorId === 'outlookDraft' || e.app === 'outlook'") < 0 &&
    /markOutlookCalendarUndone/.test(popup) &&
    /פתח אירוע/.test(display) &&
    /openEvent/.test(popup));
  check('Connect is still one screen with Select all',
    /data-glance-connect', 'microsoft'/.test(popup) && /data-glance-select-all/.test(popup));
  check('Settings names Always and Revoke in Hebrew',
    popup.indexOf('הרשאת יומן: תמיד') >= 0 &&
    popup.indexOf('בטל הרשאת יומן') >= 0 &&
    popup.indexOf('הרשאת יומן בוטלה') >= 0 &&
    popup.indexOf('Calendar permission: Always') < 0 &&
    popup.indexOf('Revoke calendar permission') < 0 &&
    popup.indexOf('Calendar permission revoked') < 0);
  const storage = fs.readFileSync(path.join(__dirname, '..', 'src', 'storage.js'), 'utf8');
  check('a calendar undo flips that written row and does not invent a draft',
    /function markOutlookCalendarUndone/.test(storage) && /Calendar event removed\./.test(storage));
  check('missing calendar scope asks, Once asks again, Always does not',
    Cal.holdConsentAsk(false, null) === true &&
    Cal.holdConsentAsk(true, { mode: 'once' }) === true &&
    Cal.holdConsentAsk(true, { mode: 'always' }) === false &&
    Cal.holdConsentAsk(true, { revoked: true }) === true &&
    Cal.holdConsentAsk(true, null) === false);
  const added = Cfg.incrementalConsentScopes(['Mail.Read', 'Mail.ReadWrite', 'Tasks.ReadWrite'], 'Calendars.ReadWrite');
  check('incremental consent adds only Calendars.ReadWrite to scopes already granted',
    added.indexOf('Calendars.ReadWrite') >= 0 && added.indexOf('Tasks.ReadWrite') >= 0 &&
    added.indexOf('Mail.Send') < 0 && Cfg.incrementalConsentScopes(added, 'Files.ReadWrite') == null, added);
  const fromUris = Cfg.incrementalConsentScopes('unknown https://graph.microsoft.com/Mail.ReadWrite,openid', 'Calendars.ReadWrite');
  check('incremental consent folds a real scope string and drops unknown',
    fromUris.indexOf('Calendars.ReadWrite') >= 0 && fromUris.indexOf('Mail.ReadWrite') >= 0 &&
    fromUris.indexOf('unknown') < 0 && fromUris.indexOf('openid') >= 0, fromUris);
  const page = fs.readFileSync(path.join(__dirname, '..', 'src', 'content-outlook.js'), 'utf8');
  check('Hold asks in one line with the Hebrew quiet choices',
    /צריך הרשאה ליומן/.test(page) &&
    page.indexOf('Calendar needs Calendars.ReadWrite') < 0 &&
    /אפשר פעם אחת/.test(page) && /אפשר תמיד/.test(page) && /לא עכשיו/.test(page) &&
    /capture-secondary/.test(page) &&
    /data-glance-consent-choice', pair\[1\]/.test(page) &&
    page.indexOf("['Once', 'once']") < 0 && page.indexOf("['Not now', 'not-now']") < 0);
}

const now = Date.now();
const mailToken = { accessToken: 'AT', expiresAt: now + 3600e3, grantedScopes: ['Mail.ReadWrite', 'Tasks.ReadWrite'] };
check('a live mail token is valid', Cal.microsoftConnection({ token: mailToken }, {}, now) === 'valid');
check('a past expiry is expired', Cal.microsoftConnection({ token: Object.assign({}, mailToken, { expiresAt: now - 1 }) }, {}, now) === 'expired');
check('needsSignIn is expired', Cal.microsoftConnection({ token: mailToken }, { needsSignIn: true }, now) === 'expired');
check('mail missing from the token is missing-scope', Cal.microsoftConnection({ token: { accessToken: 'AT', expiresAt: now + 1000, grantedScopes: ['Tasks.ReadWrite'] } }, {}, now) === 'missing-scope');
check('no token is missing', Cal.microsoftConnection(null, {}, now) === 'missing');

vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'core', 'close-families.js'), 'utf8'), sandbox, { filename: 'close-families.js' });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'core', 'incoming-judge.js'), 'utf8'), sandbox, { filename: 'incoming-judge.js' });
const heHold = vm.runInContext(`
  const now = new Date(2026, 9, 15, 12, 0, 0);
  const TEXT = 'פגישה ביום חמישי 22/10 בשעה 14:00';
  const QUIET = 'פגישה ביום ראשון 22/10 בשעה 14:00';
  const facts = FlowExtract.extract(TEXT, { now: now });
  const classified = FlowIntent.classify(TEXT, { now: now, senderName: 'flow' });
  const plan = FlowActions.planFor(classified, {});
  const quiet = FlowIntent.classify(QUIET, { now: now, senderName: 'flow' });
  const quietPlan = FlowActions.planFor(quiet, {});
  const judged = FlowIncomingJudge.judge({
    text: TEXT,
    subject: '',
    surface: 'outlook',
    sender: { name: 'flow', email: 'flow@example.com' },
    now: now,
    inbound: true
  });
  const body = FlowOutlookCalendar.meetingBody({
    dateIso: '2026-10-22', hour: 14, minute: 0, title: 'פגישה', quote: TEXT, timeZone: 'Asia/Jerusalem'
  });
  const read = {
    subject: 'פגישה',
    body: { contentType: 'Text', content: TEXT },
    start: { dateTime: '2026-10-22T14:00:00', timeZone: 'Asia/Jerusalem' },
    end: { dateTime: '2026-10-22T14:30:00', timeZone: 'Asia/Jerusalem' }
  };
  const readClock = String(read.start.dateTime).slice(11, 16);
  ({
    date: facts.date,
    time: facts.time,
    type: classified && classified.type,
    personalClose: classified && classified.personalClose,
    explicitHold: classified && classified.explicitHold,
    planId: plan && plan.id,
    steps: plan && plan.steps && plan.steps.map((s) => s.kind),
    quietType: quiet && quiet.type,
    quiet: quiet && quiet.quiet,
    quietPlan: quietPlan && quietPlan.id,
    quietNeeds: quietPlan && quietPlan.needsDateChoice,
    quietIso: quiet && quiet.entities && quiet.entities.dateIso,
    quietChoices: quietPlan && quietPlan.dateChoices,
    readBack: readClock,
    readZone: read.start.timeZone,
    readHash: FlowOutlookCalendar.contentHash(read) === FlowOutlookCalendar.contentHash(read),
    show: judged && judged.show,
    reason: judged && judged.reason,
    judgedId: judged && judged.process && judged.process.id,
    body: body
  });
`, sandbox);
check('weekday and 22/10 and בשעה 14:00 is Thu 22 Oct 2026 at 14:00',
  heHold.date && heHold.date.iso === '2026-10-22' && heHold.date.statedWeekday === true &&
  heHold.time && heHold.time.hour === 14 && heHold.time.minute === 0, heHold.date);
check('the meeting plan is a hold with no file step, and it is not an explicit hold',
  heHold.type === 'event' && heHold.personalClose !== 'calendar-hold' && heHold.explicitHold !== true &&
  heHold.planId === 'hold' && heHold.steps && heHold.steps.length === 1 && heHold.steps[0] === 'calendar', heHold);
check('Outlook shows a hold for a timed inbound statement',
  heHold.show === true && heHold.judgedId === 'hold', heHold);
check('a weekday that contradicts 22/10 stays a schedule and does not book one day',
  heHold.quietType === 'event' && heHold.quietPlan === 'schedule' && heHold.quietNeeds !== true &&
  heHold.quietIso == null, heHold);
check('14:00 Asia/Jerusalem is local 14:00 with no Z, no attendees, and no file',
  heHold.body && heHold.body.start.dateTime === '2026-10-22T14:00:00' &&
  heHold.body.end.dateTime === '2026-10-22T14:30:00' &&
  !/Z$/i.test(heHold.body.start.dateTime) &&
  heHold.body.start.timeZone === 'Asia/Jerusalem' &&
  Array.isArray(heHold.body.attendees) && heHold.body.attendees.length === 0 &&
  heHold.body.subject === 'פגישה' && !/File:/.test(heHold.body.body.content || ''), heHold.body);
check('a read-back in Asia/Jerusalem is 14:00',
  heHold.readBack === '14:00' && heHold.readZone === 'Asia/Jerusalem');
check('an unknown zone is not written',
  Cal.meetingBody({ dateIso: '2026-10-22', hour: 14, minute: 0, title: 'פגישה', timeZone: 'Not/AZone' }) === null);
check('a meeting body hashes the subject, the text, and the start',
  Cal.contentHash(heHold.body) === Cal.contentHash(heHold.body) && Cal.contentHash(heHold.body) !== Cal.contentHash(Object.assign({}, heHold.body, { subject: 'other' })));

console.log('\n--- mailbox time zone, not the browser (fixed clock) ---\n');
{
  const FIXED = '2026-10-22';
  const browserNy = 'America/New_York';
  const mailboxIl = 'Israel Standard Time';
  const good = Cal.meetingBody({
    dateIso: FIXED, hour: 10, minute: 0, title: 'Review', mailboxTimeZone: mailboxIl
  });
  check('10:00 uses Graph mailbox Israel Standard Time when the browser is elsewhere',
    good && good.start.dateTime === FIXED + 'T10:00:00' && good.start.timeZone === mailboxIl &&
    good.end.dateTime === FIXED + 'T10:30:00', good);
  const reverse = Cal.meetingBody({
    dateIso: FIXED, hour: 10, minute: 0, title: 'Review', timeZone: browserNy, mailboxTimeZone: 'UTC'
  });
  check('explicit IANA zone wins over mailbox on the reverse pairing',
    reverse && reverse.start.timeZone === browserNy && reverse.start.dateTime === FIXED + 'T10:00:00', reverse);
  check('holdTimeZone uses mailbox when the hold names no explicit zone',
    Cal.holdTimeZone(null, mailboxIl) === mailboxIl && Cal.holdTimeZone('', mailboxIl) === mailboxIl);
  check('Bogus is not accepted as a hold zone', Cal.holdTimeZone('Bogus', mailboxIl) === '' && Cal.holdTimeZone('Bogus', '') === '');
  const noMailbox = Cal.meetingBody({ dateIso: FIXED, hour: 10, minute: 0, title: 'Review' });
  check('no mailbox zone and no explicit zone refuses the hold', noMailbox === null);
  const bg = fs.readFileSync(path.join(__dirname, '..', 'src', 'background.js'), 'utf8');
  check('the worker reads mailboxSettings.timeZone and sends Prefer outlook.timezone',
    /mailboxSettings\?\$select=timeZone/.test(bg) && /outlookPreferTimezone/.test(bg) &&
    /outlookCalendarTimeZone/.test(bg) && /outlook\.timezone=/.test(bg), bg.length);
  const popup = fs.readFileSync(path.join(__dirname, '..', 'popup', 'popup.js'), 'utf8');
  check('Connect uses connectServiceUi instead of ticking every granted scope on sign-in',
    popup.indexOf('connectServiceUi') >= 0 && popup.indexOf('has && granted.length') < 0, popup.length);
  check('initial authorize routes checked ids through connectIdsFromChecked',
    popup.indexOf('connectIdsFromChecked') >= 0, popup.length);
}

console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
