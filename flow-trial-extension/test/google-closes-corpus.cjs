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

console.log('\n' + (failures ? failures + ' FAILED' : 'All passed'));
process.exit(failures ? 1 : 0);
