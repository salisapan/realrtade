'use strict';
// Hand tests for propose-gate.cjs (EN+HE). Each row: text, LLM pred, surface, engine date, expected gate reason ('pass' or a gate:* code).
const PG = require('./propose-gate.cjs');
const P = (family, action) => ({ decision: 'act', family, action, title: 'x' });
const T = [
  ['Please create a new doc for the budget notes.', P('task', 'create_task'), 'gmail', null, 'gate:unsupported-kind:create-doc'],
  ['Sali, please make a spreadsheet tracking the migration by Friday.', P('task', 'create_task'), 'outlook', '2026-10-09', 'gate:unsupported-kind:create-doc'],
  ['בבקשה לפתוח מסמך חדש לסיכום הפיילוט.', P('task', 'create_task'), 'outlook', null, 'gate:unsupported-kind:create-doc'],
  ['תכין הצעת מחיר לנורת׳ווינד על 4,000 ₪ עד יום שני.', P('task', 'create_task'), 'gmail', '2026-10-12', 'gate:unsupported-kind:create-doc'],
  ['בבקשה לצרף את טופס 101 לזימון של הדמו ביום שני בשעה 9:00.', P('calendar', 'calendar_event'), 'gmail', '2026-10-12', 'gate:unsupported-kind:attach-to-invite'],
  ['Please attach the deck to the kickoff invite for Monday at 10:00.', P('calendar', 'calendar_event'), 'gmail', '2026-10-12', 'gate:unsupported-kind:attach-to-invite'],
  ['אתה מסכים להצעה על סך 3,900 שקל עד יום שני?', P('reply', 'draft_reply'), 'outlook', '2026-10-12', 'gate:money-offer-acceptance'],
  ['Do you agree to the $4,000 quote from Contoso by Friday?', P('reply', 'draft_reply'), 'gmail', '2026-10-09', 'gate:money-offer-acceptance'],
  ['Can you approve the pre-authorization request for the MRI?', P('reply', 'draft_reply'), 'gmail', null, 'gate:undated'],
  ['I need the serial number of the laptop, could you find it and send it?', P('task', 'create_task'), 'gmail', null, 'gate:undated'],
  ['Please book me a flight to Berlin.', P('foo', 'book_flight'), 'gmail', null, 'gate:unsupported-kind:book_flight'],
  ['Please store the attached file in the Drive.', P('file', 'save_to_drive'), 'gmail', null, 'gate:save-suggest:attachments-unread'],
  // contrast rows that must pass
  ['סאלי, אפשר את האישור שלך על התקציב עד יום חמישי?', P('reply', 'draft_reply'), 'gmail', '2026-10-08', 'pass'],
  ['עדכון קצר: אכין את החשבונית עד רביעי בבוקר.', P('task', 'create_task'), 'gmail', null, 'pass'],
  ['I will prepare the invoice by Friday.', P('task', 'create_task'), 'gmail', '2026-10-09', 'pass'],
  ['Can we meet Monday at 10:00 to go over the deck?', P('calendar', 'calendar_event'), 'gmail', '2026-10-12', 'pass'],
  ['Can you approve the travel budget by Friday?', P('reply', 'draft_reply'), 'gmail', '2026-10-09', 'pass'],
  ['Sali, can you prepare the deck before Sunday?', P('reply', 'draft_reply'), 'gmail', '2026-10-11', 'pass'],
];
let fail = 0;
for (const [t, p, surface, d, want] of T) {
  const g = PG.gate({ id: 't', body: t, subject: '', surface, direction: 'inbound', engineReason: 'intent-null' }, t, p, { dateIso: d, today: '2026-10-07' }, null);
  const ok = g.reason === want; if (!ok) fail++; console.log(ok ? 'PASS' : 'FAIL', want, ok ? '' : '(got ' + g.reason + ')', '::', t.slice(0, 60));
}
// save with real attachment data: suggest-save decides, target follows the host
const pdf = [{ id: 'a1', name: 'Q3-report.pdf', size: 240 * 1024, isInline: false, kind: 'file' }];
const S = [
  ['Please store the attached file in the Drive.', 'gmail', 'save_to_drive', pdf, 'pass'],
  ['Please save the attachment to OneDrive.', 'outlook', 'save_to_onedrive', pdf, 'pass'],
  ['Please save the attachment to OneDrive.', 'gmail', 'save_to_onedrive', pdf, 'gate:save-suggest:onedrive-target-on-gmail'],
  ['pls תשמור את הקובץ המצורף ב-Google Drive', 'outlook', 'save_to_drive', pdf, 'gate:save-suggest:drive-target-on-outlook'],
  ['סאלי, pls תשמור את הקובץ המצורף לדרייב', 'outlook', 'save_to_drive', pdf, 'gate:save-target-mismatch'],
  ['Please save the attachment to OneDrive.', 'outlook', 'save_to_onedrive', [{ id: 'i', name: 'image001.png', size: 8000, kind: 'file' }], 'gate:save-suggest:no-files'],
  ['Please save the attachment to OneDrive.', 'outlook', 'save_to_onedrive', [{ id: 'c', name: 'invite.ics', size: 3000, kind: 'file' }], 'gate:save-suggest:no-files'],
  ["Please don't save the attachment to OneDrive.", 'outlook', 'save_to_onedrive', pdf, 'gate:save-suggest:negated'],
];
for (const [t, surface, action, atts, want] of S) {
  const g = PG.gate({ id: 't', body: t, subject: '', surface, direction: 'inbound', engineReason: 'intent-null' }, t, P('file', action), { dateIso: null, today: '2026-10-07' }, { read: true, consent: true, attachments: atts });
  const ok = g.reason === want; if (!ok) fail++; console.log(ok ? 'PASS' : 'FAIL', want, ok ? '' : '(got ' + g.reason + ')', '::', surface, t.slice(0, 50), g.card ? '-> ' + g.card.target : '');
}
console.log(fail ? `${fail} FAIL` : 'ALL PASS'); process.exitCode = fail ? 1 : 0;
