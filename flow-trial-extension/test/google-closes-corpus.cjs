// Corpus for Drive / Doc / Sheet closes (families B, C, I).
// Propose only when the target is clear. Silence when it is not.
// Chat is a slot checklist and opens only when more than four required
// slots are still empty. No template, no clear artifact, no blank doc.
//
// Run: node test/google-closes-corpus.cjs

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = { module: undefined, console };
vm.createContext(sandbox);
for (const f of ['domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'intent.js', 'actions.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'core', f), 'utf8'), sandbox, { filename: f });
}
const FlowIntent = vm.runInContext('FlowIntent', sandbox);
const FlowActions = vm.runInContext('FlowActions', sandbox);
const FlowGoogleCloses = vm.runInContext('FlowGoogleCloses', sandbox);
const FlowExtract = vm.runInContext('FlowExtract', sandbox);

const NOW = new Date('2026-09-17T12:00:00Z');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

function quoteTemplate(slots) {
  return {
    artifact: 'quote',
    kind: 'doc',
    name: 'Acme quote',
    logo: 'Acme',
    intro: 'Prepared from the Acme quote template.',
    slots: slots || ['party', 'amount', 'title']
  };
}

function classify(text, extra) {
  return FlowIntent.classify(text, Object.assign({
    senderEmail: 'dana@meridian.com',
    senderName: 'Dana Cole',
    now: NOW,
    calibration: null
  }, extra));
}

function plan(text, extra) {
  const intent = classify(text, extra);
  const process = intent && intent.type ? FlowActions.planFor(intent, { threadUrl: 'https://mail.google.com/x' }) : null;
  return { intent: intent, process: process };
}

const SIX = ['party', 'amount', 'date', 'title', 'what', 'reference'];

console.log('--- detail mode: chat only above 4 ---\n');
check('0 missing is ready', FlowGoogleCloses.detailMode(0) === 'ready');
check('1 missing is fields', FlowGoogleCloses.detailMode(1) === 'fields');
check('4 missing is fields', FlowGoogleCloses.detailMode(4) === 'fields');
check('5 missing is chat', FlowGoogleCloses.detailMode(5) === 'chat');

{
  const ready = FlowGoogleCloses.cardPlan({
    lang: 'en', cardLine: "Didn't find quote — draft from template", cardLineHe: 'x', missing: []
  });
  check('ready card has no chat and no fields', ready.mode === 'ready' && ready.chat === false && ready.fields.length === 0 && ready.chatLine === null);
}
{
  const fields = FlowGoogleCloses.cardPlan({
    lang: 'en', cardLine: 'line', cardLineHe: 'שורה', missing: ['party', 'title']
  });
  check('two missing slots stay on the card', fields.mode === 'fields' && fields.chat === false && JSON.stringify(fields.fields) === JSON.stringify(['party', 'title']) && fields.chatSlots.length === 0);
}
{
  const four = FlowGoogleCloses.cardPlan({
    lang: 'en', cardLine: 'line', cardLineHe: 'שורה', missing: ['party', 'amount', 'date', 'title']
  });
  check('exactly four slots stay on the card', four.mode === 'fields' && four.chat === false && four.fields.length === 4);
}
{
  const chat = FlowGoogleCloses.cardPlan({
    lang: 'en', cardLine: 'line', cardLineHe: 'שורה', missing: SIX
  });
  check('five-plus slots open the checklist', chat.mode === 'chat' && chat.chat === true && chat.fields.length === 0 && chat.chatSlots.length === 6);
  check('checklist names slots and does not invite a chat',
    chat.chatLine === 'Still needed: party, amount, date, title, what, reference' &&
    !/how can i help|ask glance|search|summar|rewrite|manage/i.test(chat.chatLine));
}

console.log('\n--- family I: clear artifact, no file, template ---\n');
{
  const row = plan(
    'Please prepare a quote for Dana Cole at $3,900, titled "14th floor".',
    { companyTemplate: quoteTemplate(), fileMatch: 'none' }
  );
  check('EN quote is create-missing', row.intent.personalClose === 'create-missing' && row.intent.googleClose.family === 'I', row.intent.personalClose);
  check('EN quote card is the one line', row.intent.googleClose.cardLine === "Didn't find quote — draft from template");
  check('EN quote does not open chat', row.intent.googleClose.chat === false && row.intent.googleClose.missing.length <= 4, row.intent.googleClose.missing);
  check('EN quote process creates a doc then a draft link',
    row.process && row.process.id === 'create-missing' &&
    row.process.steps[0].kind === 'driveDoc' &&
    row.process.steps[1].kind === 'gmailDraft' &&
    row.process.steps[1].dependsOn === 'doc' &&
    row.process.steps[1].params.shareLink === true &&
    !row.process.steps[1].params.requestedObjectTerm);
  check('a quote create still needs a template body', FlowGoogleCloses.needsArtifactBody(row.intent.googleClose) === true);
  const body = FlowGoogleCloses.artifactBody(row.intent.googleClose, {});
  check('doc body contains the template, the logo, and the amount',
    body && body.blank === false && /Acme quote/.test(body.html) && /Acme/.test(body.html) && /\$3,900|3,900/.test(body.html),
    body && body.html);
  check('doc body does not invent a figure that was not in the thread', !/9,999/.test(body.html));
}

{
  const row = plan(
    'נא להכין הצעת מחיר עבור דנה כהן על 3,900$, כותרת: קומה 14.',
    { companyTemplate: quoteTemplate(), fileMatch: 'none' }
  );
  check('HE quote is create-missing', row.intent && row.intent.googleClose && row.intent.googleClose.family === 'I' && row.intent.googleClose.lang === 'he', row.intent && row.intent.googleClose);
  check('HE quote card line', row.intent && row.intent.googleClose && row.intent.googleClose.cardLineHe === 'לא נמצא הצעת מחיר — טיוטה מהתבנית');
}

{
  const row = plan('Please prepare a quote for Dana Cole at $3,900, titled "14th floor".', {
    companyTemplate: quoteTemplate(),
    fileMatch: 'none'
  });
  // Drop extracted title by using a template that also requires date, what, reference — filled party+amount+title, missing 3 if we use SIX and text fills some.
}

{
  const wide = quoteTemplate(SIX);
  const row = plan('Please prepare a quote for Dana Cole at $3,900, titled "14th floor".', {
    companyTemplate: wide,
    fileMatch: 'none'
  });
  const missing = row.intent.googleClose.missing;
  check('party amount and title came from the thread', missing.indexOf('party') === -1 && missing.indexOf('amount') === -1 && missing.indexOf('title') === -1, missing);
  check('three remaining slots stay fields, not chat', missing.length === 3 && row.intent.googleClose.chat === false && FlowGoogleCloses.cardPlan(row.intent.googleClose).mode === 'fields', missing);
  const body = FlowGoogleCloses.artifactBody(row.intent.googleClose, {});
  check('unfilled required slots refuse a blank doc', body.blank === true);
  const filled = FlowGoogleCloses.artifactBody(row.intent.googleClose, {
    date: 'Sep 21', what: '14th floor lease', reference: 'MT-14'
  });
  check('filled slots produce a doc and do not invent extra money',
    filled.blank === false && /Sep 21/.test(filled.html) && /MT-14/.test(filled.html) && !/8,888/.test(filled.html));
}

{
  const row = plan('Please prepare a quote.', {
    companyTemplate: quoteTemplate(SIX),
    fileMatch: 'none'
  });
  check('six missing slots open chat', row.intent && row.intent.googleClose && row.intent.googleClose.chat === true && row.intent.googleClose.missing.length === 6, row.intent && row.intent.googleClose && row.intent.googleClose.missing);
  const planCard = FlowGoogleCloses.cardPlan(row.intent.googleClose);
  check('chat card has no field row', planCard.fields.length === 0 && planCard.chatSlots.length === 6);
  const turn = FlowGoogleCloses.acceptTurn(row.intent.googleClose, 'party: Dana Cole\namount: $3900\ndate: Sep 21\ntitle: Floor 14\nwhat: lease\nreference: MT-14', 0);
  check('one labeled reply can finish the checklist', turn.mode === 'ready' && turn.missing.length === 0, turn);
  const prose = FlowGoogleCloses.acceptTurn(row.intent.googleClose, 'Could you also make it warmer and search my Drive for a nicer logo?', 0);
  check('unlabeled advice is silence, not a create', prose.silence === true);
  const half = FlowGoogleCloses.acceptTurn(row.intent.googleClose, 'party: Dana Cole', 0);
  check('one slot still leaves chat open', half.mode === 'chat' && half.turns === 1, half);
  const stalled = FlowGoogleCloses.acceptTurn(Object.assign({}, row.intent.googleClose, { filled: half.filled, missing: half.missing }), 'let me think about the tone', 1);
  check('second reply that does not finish goes silent', stalled.silence === true);
  const down = FlowGoogleCloses.acceptTurn(row.intent.googleClose, 'party: Dana Cole\namount: $3900', 0);
  check('dropping to four slots closes chat and returns fields', down.mode === 'fields' && down.missing.length === 4, down);
  for (const line of ['how can I help?', 'Please rewrite this warmer', 'summarize the thread', 'search my Drive', 'manage my files']) {
    const refused = FlowGoogleCloses.acceptTurn(row.intent.googleClose, line, 0);
    check('assistant line stays silence: ' + line, refused.silence === true, refused);
  }
  const heChat = FlowGoogleCloses.cardPlan({ lang: 'he', cardLine: 'line', cardLineHe: 'שורה', missing: SIX });
  check('Hebrew checklist names slots only', heChat.chat === true && heChat.chatLine === 'חסר: party, amount, date, title, what, reference');
}

console.log('\n--- silence ---\n');
{
  const noTpl = plan('Please prepare a quote for Dana Cole at $3,900, titled "14th floor".', { fileMatch: 'none' });
  check('no company template stays silent', !noTpl.intent.type && noTpl.intent.googleSilence === true, noTpl.intent);
  const unclear = plan('Please prepare the document when you can.', { companyTemplate: quoteTemplate(), fileMatch: 'none' });
  check('unclear artifact stays silent', !unclear.intent.googleClose, unclear.intent && unclear.intent.personalClose);
  const found = plan('Please prepare a quote for Dana Cole at $3,900, titled "14th floor".', { companyTemplate: quoteTemplate(), fileMatch: 'one' });
  check('a safe Drive match is not a second create', !found.intent.googleClose && found.intent.googleSilence === true);
  const many = plan('Please prepare a quote for Dana Cole at $3,900, titled "14th floor".', { companyTemplate: quoteTemplate(), fileMatch: 'many' });
  check('several Drive matches stay silent', many.intent.googleSilence === true && !many.intent.googleClose);
  const hedge = plan('Maybe prepare a quote for Dana Cole at $3,900.', { companyTemplate: quoteTemplate(), fileMatch: 'none' });
  check('a hedge stays silent', hedge.intent.googleSilence === true);
  const send = plan('Please send the invoice when you get a chance.', { companyTemplate: quoteTemplate(), fileMatch: 'none' });
  check('send-the-file stays a follow-up, not a Drive create', send.intent.personalClose === 'follow-up-ask' && !send.intent.googleClose, send.intent.personalClose);
  const blankAsk = plan('Please open a blank doc for me.', { companyTemplate: quoteTemplate(), fileMatch: 'none' });
  check('open a blank doc is not a close', !blankAsk.intent.googleClose);
}

console.log('\n--- family C: create is the ask ---\n');
{
  const sheetTpl = { artifact: 'amount-sheet', kind: 'sheet', name: 'Acme ledger', slots: ['amount', 'date'] };
  const row = plan('Please log $4,200 confirmed on September 21 in a new spreadsheet.', {
    companyTemplate: sheetTpl
  });
  check('EN new sheet is a sheet create', row.intent && row.intent.googleClose && row.intent.googleClose.artifact === 'amount-sheet' && row.intent.googleClose.kind === 'sheet', row.intent && row.intent.googleClose);
  check('sheet process is the sheet then the draft', row.process && row.process.steps[0].kind === 'driveSheet' && row.process.steps[1].dependsOn === 'sheet');
  const body = FlowGoogleCloses.artifactBody(row.intent.googleClose, {});
  check('sheet is a real row, not an empty workbook', body.blank === false && /4,200|4200/.test(body.csv) && /Sep 21|2026-09-21/.test(body.csv), body.csv);
}
{
  const he = plan('תרשום בגיליון חדש 4,200$ שאושר ל-21 בספטמבר.', {
    companyTemplate: { artifact: 'amount-sheet', kind: 'sheet', name: 'פנקס', slots: ['amount', 'date'] }
  });
  check('HE new sheet is a sheet create', he.intent && he.intent.googleClose && he.intent.googleClose.lang === 'he' && he.intent.googleClose.kind === 'sheet', he.intent && he.intent.googleClose);
}
{
  const existing = plan('Please update the budget spreadsheet with $4,200.', {
    companyTemplate: { artifact: 'amount-sheet', kind: 'sheet', name: 'Acme ledger', slots: ['amount'] }
  });
  check('an existing spreadsheet stays silent', existing.intent.googleSilence === true && !existing.intent.googleClose);
  const noTpl = plan('Please log $4,200 confirmed on September 21 in a new spreadsheet.', {});
  check('a new sheet without a template stays silent', noTpl.intent.googleSilence === true);
}
{
  const logTpl = { artifact: 'decision-log', kind: 'doc', name: 'Acme decision log', slots: ['what'] };
  const row = plan('Please write a decision log: we agreed the 14th floor at $3,900.', {
    companyTemplate: logTpl,
    fileMatch: 'none'
  });
  check('decision log uses the template and the agreed sentence', row.intent && row.intent.googleClose && row.intent.googleClose.artifact === 'decision-log');
  const body = FlowGoogleCloses.artifactBody(row.intent.googleClose, {});
  check('decision log is not blank and quotes the agreement', body.blank === false && /agreed/i.test(body.html) && /Acme decision log/.test(body.html), body.html);
}
{
  const saved = plan('Please save the attached pdf to Drive.', { attachmentCount: 1 });
  check('one attachment saved to Drive needs no template', saved.intent && saved.intent.personalClose === 'drive-file' && saved.process && saved.process.steps[0].kind === 'driveFile');
  check('the draft depends on that file', saved.process.steps[1].dependsOn === 'file' && saved.process.steps[1].params.shareLink === true);
  const two = plan('Please save the attached pdf to Drive.', { attachmentCount: 2 });
  check('two attachments are not one file', two.intent.googleSilence === true);
  const none = plan('Please save the attached pdf to Drive.', { attachmentCount: 0 });
  check('no attachment is not a Drive save', none.intent.googleSilence === true);
  const refused = [
    "Please don't save the attachment to Drive.",
    'Do not save the attached file to Drive.',
    'No need to save the attachment to Drive.',
    'Never mind, do not save the attached file to Drive.'
  ];
  refused.forEach((text) => {
    const row = plan(text, { attachmentCount: 1 });
    check('a refusal to save stays silent: ' + text,
      row.intent && !row.intent.type && row.intent.googleSilence === true && row.intent.personalClose !== 'drive-file',
      row.intent && { type: row.intent.type, quiet: row.intent.quiet, personal: row.intent.personalClose });
  });
  const still = plan('No need to call. Please save the attached file to Drive.', { attachmentCount: 1 });
  check('a different no-need does not hide a real save',
    still.intent && still.intent.personalClose === 'drive-file', still.intent && still.intent.personalClose);
}

console.log('\n--- OneDrive wording is the same save; shared files are not ---\n');
{
  const fires = [
    'Please save the attachment to OneDrive.',
    'Please store the attached file on OneDrive.',
    'Please upload the attachment to OneDrive.'
  ];
  fires.forEach((text) => {
    const row = plan(text, { attachmentCount: 1 });
    check('one file to OneDrive is a drive-file save: ' + text,
      row.intent && row.intent.personalClose === 'drive-file' && row.intent.googleClose && row.intent.googleClose.target === 'onedrive' &&
      row.process && row.process.steps[0].kind === 'driveFile' && row.process.steps[0].label === 'OneDrive',
      row.intent && { type: row.intent.type, personal: row.intent.personalClose, quiet: row.intent.quiet, target: row.intent.googleClose && row.intent.googleClose.target });
  });
  const heNo = [
    'אל תשמור את הקובץ המצורף בדרייב.',
    'לא צריך לשמור את הקובץ בדרייב.',
    'אין צורך לשמור את הקובץ המצורף בדרייב.',
    'לא לשמור את הקובץ בדרייב.'
  ];
  heNo.forEach((text) => {
    const row = plan(text, { attachmentCount: 1 });
    check('a Hebrew refusal to save stays silent: ' + text,
      row.intent && !row.intent.type && row.intent.googleSilence === true && row.intent.personalClose !== 'drive-file',
      row.intent && { type: row.intent.type, quiet: row.intent.quiet, personal: row.intent.personalClose });
  });
  const forget = plan("Don't forget to save the attached file to OneDrive.", { attachmentCount: 1 });
  check('don\'t forget to save still names OneDrive',
    forget.intent && forget.intent.personalClose === 'drive-file' && forget.intent.googleClose && forget.intent.googleClose.target === 'onedrive',
    forget.intent && { type: forget.intent.type, personal: forget.intent.personalClose, target: forget.intent.googleClose && forget.intent.googleClose.target });
  const zero = plan('Please save the attachment to OneDrive.', { attachmentCount: 0 });
  const two = plan('Please save the attachment to OneDrive.', { attachmentCount: 2 });
  check('zero or two OneDrive files stay silent',
    zero.intent && zero.intent.googleSilence === true && !zero.intent.type &&
    two.intent && two.intent.googleSilence === true && !two.intent.type);
  const hedge = plan('Maybe save the attachment to OneDrive.', { attachmentCount: 1 });
  check('a hedged OneDrive save stays silent', hedge.intent && hedge.intent.googleSilence === true && !hedge.intent.type, hedge.intent);
  const fyi = plan('FYI, please save the attachment to OneDrive.', { attachmentCount: 1 });
  check('FYI stays noise, not a save', fyi.intent && !fyi.intent.type && fyi.intent.quiet === 'noise' && fyi.intent.personalClose !== 'drive-file', fyi.intent);
  const shared = plan('Hi, Attached is the signed NDA. Please save it to our shared files by Friday, October 9. Thanks, Flow Gate', { attachmentCount: 1 });
  check('save it to our shared files stays an ordinary miss',
    shared.intent && !shared.intent.type && !shared.intent.quiet && shared.intent.personalClose !== 'drive-file',
    shared.intent && { type: shared.intent.type, quiet: shared.intent.quiet, personal: shared.intent.personalClose });
  check('shared files do not ask for an attachment count',
    FlowGoogleCloses.needsOneAttachment('Please save it to our shared files by Friday, October 9.') === false &&
    FlowGoogleCloses.needsOneAttachment('Please save the attachment to OneDrive.') === true);
}

console.log('\n--- family B: one file, one target ---\n');
{
  const row = plan('Please add the agenda to the calendar for the call on Friday, September 18 at 3pm.', { fileMatch: 'one' });
  check('EN file on the hold', row.intent && row.intent.personalClose === 'file-on-hold' && row.intent.googleClose.fileTerm === 'agenda', row.intent && row.intent.googleClose);
  check('hold step searches by that one term', row.process && row.process.steps.length === 1 && row.process.steps[0].params.fileTerm === 'agenda' && row.process.steps[0].params.requireTime === true);
}
{
  const row = plan('תוסיף את סדר היום ליומן לפגישה ביום שישי 18 בספטמבר בשעה 15:00.', { fileMatch: 'one' });
  check('HE file on the hold', row.intent && row.intent.personalClose === 'file-on-hold' && row.intent.googleClose.lang === 'he', row.intent && row.intent.googleClose);
}
{
  const row = plan('Please note the invoice on the reminder we agreed for October 2.', { fileMatch: 'one' });
  check('EN file on the task', row.intent && row.intent.personalClose === 'file-on-task' && row.process.steps[0].params.fileTerm === 'invoice', row.intent && row.intent.personalClose);
}
{
  const many = plan('Please add the agenda to the calendar for the call on Friday, September 18 at 3pm.', { fileMatch: 'many' });
  check('two agendas are not placed', many.intent.googleSilence === true);
  const both = plan('Please add the agenda to the calendar and the task for Friday, September 18 at 3pm.', { fileMatch: 'one' });
  check('two destinations stay silent', both.intent.googleSilence === true);
  const plural = plan('Please add the files to the calendar for the call on Friday, September 18 at 3pm.', { fileMatch: 'one' });
  check('plural files stay silent', plural.intent.googleSilence === true);
  const comment = plan('Please comment on the doc that we agreed $4,200.', {
    companyTemplate: quoteTemplate(),
    fileMatch: 'one'
  });
  check('a Docs comment is not proposed', comment.intent.googleSilence === true && !comment.intent.googleClose);
}
{
  const row = plan('Please add the quote to the calendar for the call on Friday, September 18 at 3pm.', {
    companyTemplate: quoteTemplate(['party', 'amount', 'title']),
    fileMatch: 'none'
  });
  // Thread does not name party/amount/title. Quote template slots will be missing.
  check('missing quote on a hold becomes a template create', row.intent && row.intent.googleClose && row.intent.googleClose.family === 'I' && row.intent.googleClose.destination === 'calendar', row.intent && row.intent.googleClose);
}

console.log('\n--- pickOneFile ---\n');
{
  const files = [
    { id: '1', name: 'Acme quote.pdf' },
    { id: '2', name: 'Notes.txt' }
  ];
  check('one token match is kept', FlowGoogleCloses.pickOneFile(files, 'quote').id === '1');
  check('two token matches are refused', FlowGoogleCloses.pickOneFile([
    { id: '1', name: 'Quote final.pdf' },
    { id: '2', name: 'Old quote.pdf' }
  ], 'quote') === null);
  check('a trashed file is not the match', FlowGoogleCloses.pickOneFile([
    { id: '1', name: 'quote.pdf', trashed: true },
    { id: '2', name: 'other.pdf' }
  ], 'quote') === null);
  check('quotation is not the word quote', FlowGoogleCloses.pickOneFile([{ id: '1', name: 'quotation-backup.pdf' }], 'quote') === null);
  check('a two-word name still counts as one file', FlowGoogleCloses.pickOneFile([{ id: '1', name: 'Acme decision log.pdf' }], 'decision log').id === '1');
}

console.log('\n--- Path A gate: named pdf on my calendar, file lives in Drive ---\n');
{
  const OWN = 'ai.local.flow@gmail.com';
  // Wednesday 7 Oct 2026, the day the gate mail calls Oct 8 "tomorrow".
  const GATE_NOW = new Date(2026, 9, 7, 12, 0, 0);
  // After that day, "tomorrow" would be the wrong slot. The written date stays.
  const AFTER = new Date(2026, 9, 9, 12, 0, 0);
  const EN = 'Put the glance-pricing-q4.pdf file on my calendar tomorrow (Oct 8, 2026) at 10:00.';
  const HE = 'שים את glance-pricing-q4.pdf ביומן מחר (8 באוקטובר 2026) בשעה 10:00.';
  const HE_FILE = 'שים את קובץ glance-pricing-q4.pdf ביומן מחר בשעה 10:00.';
  function gate(text, extra) {
    return plan(text, Object.assign({ now: GATE_NOW, senderEmail: OWN, attachmentCount: 0 }, extra));
  }
  const dated = FlowExtract.parseDate(EN, AFTER);
  check('Oct 8, 2026 wins over tomorrow', dated && dated.iso === '2026-10-08', dated);
  check('maybe 3 is not a month', FlowExtract.parseDate('maybe 3 people', GATE_NOW) === null);

  const row = gate(EN, { fileMatch: 'one' });
  check('EN gate is file-on-hold for glance-pricing-q4.pdf',
    row.intent && row.intent.personalClose === 'file-on-hold' &&
    row.intent.googleClose && row.intent.googleClose.family === 'B' &&
    row.intent.googleClose.fileTerm === 'glance-pricing-q4.pdf' &&
    row.intent.googleClose.destination === 'calendar' &&
    row.intent.entities.dateIso === '2026-10-08' &&
    row.intent.entities.hour === 10 && row.intent.entities.minute === 0,
    row.intent && { personal: row.intent.personalClose, g: row.intent.googleClose, e: row.intent.entities });
  check('EN gate calendar step carries the file term and the clock',
    row.process && row.process.id === 'file-on-hold' && row.process.steps.length === 1 &&
    row.process.steps[0].kind === 'calendar' &&
    row.process.steps[0].params.fileTerm === 'glance-pricing-q4.pdf' &&
    row.process.steps[0].params.requireTime === true &&
    row.process.steps[0].params.dateIso === '2026-10-08' &&
    row.process.steps[0].params.hour === 10 &&
    row.process.steps[0].params.minute === 0,
    row.process && row.process.steps && row.process.steps[0]);
  // artifactBody is blank here on purpose: there is no template. Do It must
  // not treat that blank as "stop". The 0.9.23 live gate clicked Do It and
  // the card never left Hold it because it did.
  check('file-on-hold does not need a template body',
    row.intent && FlowGoogleCloses.needsArtifactBody(row.intent.googleClose) === false);
  check('file-on-task does not need a template body',
    FlowGoogleCloses.needsArtifactBody({ personalClose: 'file-on-task', copyAttachment: false, templateName: null, kind: null }) === false);
  check('file-on-hold artifact body stays blank (not a Doc to create)',
    row.intent && FlowGoogleCloses.artifactBody(row.intent.googleClose, {}).blank === true);
  check('Drive-only: no attachment is still the hold',
    row.intent && row.intent.personalClose === 'file-on-hold' && row.intent.googleClose.copyAttachment === false);

  const waiting = gate(EN, {});
  check('unclear Drive match waits on that file name',
    waiting.intent && waiting.intent.googleWait && waiting.intent.googleWait.fileTerm === 'glance-pricing-q4.pdf' && !waiting.intent.type,
    waiting.intent);
  const missing = gate(EN, { fileMatch: 'none' });
  check('no Drive file stays silent (not a blank create)',
    missing.intent && missing.intent.googleSilence === true && !missing.intent.type && !missing.intent.googleClose,
    missing.intent);
  const many = gate(EN, { fileMatch: 'many' });
  check('two Drive files stay silent', many.intent && many.intent.googleSilence === true && !many.intent.type);
  const hedge = gate('Maybe put the glance-pricing-q4.pdf file on my calendar tomorrow (Oct 8, 2026) at 10:00.', { fileMatch: 'one' });
  check('a hedged calendar file stays silent', hedge.intent && hedge.intent.googleSilence === true && !hedge.intent.type);
  const generic = gate('Put the file on my calendar tomorrow (Oct 8, 2026) at 10:00.', { fileMatch: 'one' });
  check('a generic file stays silent', generic.intent && (generic.intent.googleSilence === true || !generic.intent.type) && generic.intent.personalClose !== 'file-on-hold', generic.intent);

  const he = gate(HE, { fileMatch: 'one' });
  check('HE שים את … ביומן is file-on-hold',
    he.intent && he.intent.personalClose === 'file-on-hold' &&
    he.intent.googleClose.lang === 'he' &&
    he.intent.googleClose.fileTerm === 'glance-pricing-q4.pdf' &&
    he.intent.entities.dateIso === '2026-10-08' &&
    he.intent.entities.hour === 10,
    he.intent && { g: he.intent.googleClose, e: he.intent.entities });
  const heFile = gate(HE_FILE, { fileMatch: 'one' });
  check('HE קובץ plus the Latin name is that file, not the word קובץ',
    heFile.intent && heFile.intent.personalClose === 'file-on-hold' &&
    heFile.intent.googleClose.fileTerm === 'glance-pricing-q4.pdf' &&
    heFile.process && heFile.process.steps[0].params.fileTerm === 'glance-pricing-q4.pdf',
    heFile.intent && heFile.intent.googleClose);
  const heGeneric = gate('שים את הקובץ ביומן מחר בשעה 10:00.', { fileMatch: 'one' });
  check('HE generic הקובץ stays silent',
    heGeneric.intent && heGeneric.intent.personalClose !== 'file-on-hold' && !heGeneric.intent.type,
    heGeneric.intent);

  check('one Drive pdf matches the gate name',
    FlowGoogleCloses.pickOneFile([{ id: '1', name: 'glance-pricing-q4.pdf' }], 'glance-pricing-q4.pdf').id === '1');
  check('a second pdf with the same name is not one file',
    FlowGoogleCloses.pickOneFile([
      { id: '1', name: 'glance-pricing-q4.pdf' },
      { id: '2', name: 'copy-glance-pricing-q4.pdf' }
    ], 'glance-pricing-q4.pdf') === null);

  check('a self-mail is the message to judge',
    FlowGoogleCloses.messageToJudge([[OWN, OWN]], OWN) === 0);
  check('own mail to someone else stays quiet',
    FlowGoogleCloses.messageToJudge([[OWN, 'dana@meridian.com']], OWN) === -1);
  check('an incoming message still wins over a later reply of yours',
    FlowGoogleCloses.messageToJudge([['dana@meridian.com', OWN], [OWN, 'dana@meridian.com']], OWN) === 0);
  check('no own address stays quiet',
    FlowGoogleCloses.messageToJudge([[OWN, OWN]], '') === -1);
}

console.log('\n--- Path A gate with close-families loaded, same order as Gmail ---\n');
{
  const live = { module: undefined, console };
  vm.createContext(live);
  for (const f of ['domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'close-families.js', 'intent.js', 'actions.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'core', f), 'utf8'), live, { filename: f });
  }
  const LiveIntent = vm.runInContext('FlowIntent', live);
  const LiveActions = vm.runInContext('FlowActions', live);
  const GATE_NOW = new Date(2026, 9, 7, 12, 0, 0);
  const EN = 'Put the glance-pricing-q4.pdf file on my calendar tomorrow (Oct 8, 2026) at 10:00.';
  const intent = LiveIntent.classify(EN, {
    senderEmail: 'ai.local.flow@gmail.com',
    now: GATE_NOW,
    fileMatch: 'one',
    attachmentCount: 0
  });
  const process = intent && intent.type ? LiveActions.planFor(intent, { threadUrl: 'https://mail.google.com/x' }) : null;
  check('live script order still files the pdf on the hold',
    intent && intent.personalClose === 'file-on-hold' && intent.googleClose &&
    intent.googleClose.fileTerm === 'glance-pricing-q4.pdf' &&
    intent.quiet !== 'family' &&
    process && process.id === 'file-on-hold' &&
    process.steps[0].params.dateIso === '2026-10-08' &&
    process.steps[0].params.hour === 10,
    { personal: intent && intent.personalClose, quiet: intent && intent.quiet, family: intent && intent.closeFamily, g: intent && intent.googleClose });
  const heIntent = LiveIntent.classify('שים את glance-pricing-q4.pdf ביומן מחר (8 באוקטובר 2026) בשעה 10:00.', {
    senderEmail: 'ai.local.flow@gmail.com',
    now: GATE_NOW,
    fileMatch: 'one',
    attachmentCount: 0
  });
  check('live script order keeps the Hebrew file on the hold',
    heIntent && heIntent.personalClose === 'file-on-hold' && heIntent.googleClose &&
    heIntent.googleClose.fileTerm === 'glance-pricing-q4.pdf' && heIntent.quiet !== 'family',
    heIntent && { personal: heIntent.personalClose, quiet: heIntent.quiet, family: heIntent.closeFamily, g: heIntent.googleClose });
}

console.log('\n--- Do It must not treat a file-on-hold as a blank template ---\n');
{
  const gmail = fs.readFileSync(path.join(__dirname, '..', 'src', 'content-gmail.js'), 'utf8');
  const gate = gmail.indexOf('FlowGoogleCloses.needsArtifactBody(ctx.intent.googleClose)');
  const body = gmail.indexOf('FlowGoogleCloses.artifactBody(ctx.intent.googleClose');
  check('Do It asks needsArtifactBody before it builds a template', gate !== -1 && body !== -1 && gate < body);
  check('the old unconditional googleClose body gate is gone',
    !/googleClose && !ctx\.intent\.googleClose\.copyAttachment && typeof FlowGoogleCloses/.test(gmail));
}

console.log('\n' + (failures ? failures + ' FAILED' : 'All passed'));
process.exit(failures ? 1 : 0);
