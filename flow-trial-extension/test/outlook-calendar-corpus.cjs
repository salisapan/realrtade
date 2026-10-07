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

const GATE_NOW = new Date(2026, 9, 7, 12, 0, 0);
const EN = 'Put the glance-pricing-q4.pdf file on my calendar tomorrow (Oct 8, 2026) at 10:00.';
const HE = 'שים את glance-pricing-q4.pdf ביומן מחר (8 באוקטובר 2026) בשעה 10:00.';
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
    hold.params.dateIso === '2026-10-08' && hold.params.hour === 10 && hold.params.minute === 0 &&
    hold.params.fileTerm === 'glance-pricing-q4.pdf' && hold.params.requireTime === true,
    hold);
  const he = decide(HE, { fileMatch: 'one' });
  check('Hebrew ביומן is the same hold', he.move === 'hold' && he.fileTerm === 'glance-pricing-q4.pdf', he);
  check('a hedge stays silent', decide('Maybe put the glance-pricing-q4.pdf file on my calendar tomorrow (Oct 8, 2026) at 10:00.', { fileMatch: 'one' }).move === 'silent');
  check('zero files stay silent', decide(EN, { fileMatch: 'none' }).move === 'silent');
  check('two files stay silent', decide(EN, { fileMatch: 'many' }).move === 'silent');
  check('a generic file stays silent', decide('Put the file on my calendar tomorrow (Oct 8, 2026) at 10:00.', { fileMatch: 'one' }).move !== 'hold');
  check('no clock stays silent', decide('Put the glance-pricing-q4.pdf file on my calendar on October 8, 2026.', { fileMatch: 'one' }).move === 'silent');
  check('a meeting with no file is not this close', decide('Can we meet tomorrow at 10:00 to go over the rollout?').move === 'ignore');
  check('a file asked before a meeting is not this close', decide("Could you send me the Q4 pricing sheet (glance-pricing-q4) before tomorrow's meeting?").move === 'ignore');
}

console.log('\n--- the event body carries the file link and invites nobody ---\n');
{
  const body = Cal.eventBody({
    dateIso: '2026-10-08', hour: 10, minute: 0, timeZone: 'UTC',
    fileName: FILE.name, fileUrl: FILE.url, quote: EN
  });
  check('subject is the file, start is 10:00, end is 30 minutes later',
    body && body.subject === 'glance-pricing-q4.pdf' &&
    body.start.dateTime === '2026-10-08T10:00:00' && body.start.timeZone === 'UTC' &&
    body.end.dateTime === '2026-10-08T10:30:00', body);
  check('the description has the sentence and the file link',
    body && body.body.contentType === 'Text' && body.body.content.indexOf(EN) === 0 &&
    body.body.content.indexOf('File: glance-pricing-q4.pdf') > 0 &&
    body.body.content.indexOf(FILE.url) > 0, body && body.body);
  check('Graph body.content contains the https file URL and attendees length is 0',
    body && body.body.content.indexOf('https://drive.google.com/file/d/f1/view') > 0 &&
    Array.isArray(body.attendees) && body.attendees.length === 0 &&
    body.isOnlineMeeting !== true, body && { attendees: body.attendees, online: body.isOnlineMeeting });
  check('a missing link is not an event', Cal.eventBody({ dateIso: '2026-10-08', hour: 10, minute: 0, fileName: FILE.name }) === null);
  check('an http link is not an event', Cal.eventBody({ dateIso: '2026-10-08', hour: 10, minute: 0, fileName: FILE.name, fileUrl: 'http://drive.google.com/file/d/f1/view' }) === null);
  check('a missing clock is not an event', Cal.eventBody({ dateIso: '2026-10-08', fileName: FILE.name, fileUrl: FILE.url }) === null);
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
  const mailOnly = Cfg.scopesFor(Cfg.defaultConnectIds());
  check('mail-only sign-in does not ask Calendars.ReadWrite', mailOnly.indexOf('Calendars.ReadWrite') < 0 && mailOnly.indexOf('Mail.Send') < 0, mailOnly);
  const asked = Cfg.scopesFor(['mail', 'calendar']);
  check('the calendar checkbox asks Calendars.ReadWrite and never Mail.Send',
    asked.indexOf('Calendars.ReadWrite') >= 0 && asked.indexOf('Calendars.ReadWrite.Shared') < 0 && asked.indexOf('Mail.Send') < 0, asked);
  const every = Cfg.scopesFor((Cfg.CONNECT_SERVICES || []).map((s) => s.id));
  const ids = (Cfg.CONNECT_SERVICES || []).map((s) => s.id);
  check('one screen still lists Mail, Calendar, OneDrive, Contacts and Teams',
    ['mail', 'calendar', 'onedrive', 'contacts', 'teams'].every((id) => ids.indexOf(id) >= 0), ids);
  check('Select all adds the calendar write and the other optional reads',
    ['Calendars.ReadWrite', 'Files.Read', 'Contacts.Read', 'Chat.Read'].every((s) => every.indexOf(s) >= 0) && !every.some((s) => /send/i.test(s)), every);
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
  check('Activity undo does not treat every Outlook row as a draft',
    popup.indexOf("e.connectorId === 'outlookDraft' || e.app === 'outlook'") < 0 &&
    /markOutlookCalendarUndone/.test(popup) &&
    /Open event/.test(popup));
  check('Connect is still one screen with Select all',
    /data-glance-connect', 'microsoft'/.test(popup) && /data-glance-select-all/.test(popup));
  const storage = fs.readFileSync(path.join(__dirname, '..', 'src', 'storage.js'), 'utf8');
  check('a calendar undo flips that written row and does not invent a draft',
    /function markOutlookCalendarUndone/.test(storage) && /Calendar event removed\./.test(storage));
}

console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
