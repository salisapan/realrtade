// Family A find+attach, and the handoff into create-when-missing.
// One high-confidence file attaches. Two plausible files stay silent.
// A clear ask with no safe file hands off only when exactly one template
// exists. More than four missing facts is a named-slot checklist, never
// a free prompt. Unclear asks and "I don't know" do not create.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', 'core');
const sandbox = { console, module: undefined, FlowJudgment: { newContent: (text) => String(text || '').split('\n').filter((line) => !/^\s*>/.test(line)).join('\n') } };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'file-attach.js'), 'utf8'), sandbox, { filename: 'file-attach.js' });
const FlowFileAttach = vm.runInContext('FlowFileAttach', sandbox);

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

function file(id, name, extra) {
  return Object.assign({ id, name, mimeType: 'application/pdf', size: '1200' }, extra || {});
}

const ASKS = [
  ['EN receipt', 'Could you please send me the receipt for the March payment?'],
  ['EN invoice', 'Could you send me the invoice when you get a chance?'],
  ['EN tax invoice', 'Please send the tax invoice for the Meridian retainer.'],
  ['EN quote', 'Would you mind sending the quotation for the renovation?'],
  ['EN proposal', 'Can you forward me the proposal before Friday?'],
  ['EN contract', 'Please attach the signed contract.'],
  ['EN letter', 'Could you send the letter we discussed?'],
  ['EN brief', 'Please share the brief for the launch.'],
  ['EN statement', 'Can you send the statement for that account?'],
  ['EN passport', 'Could you send a scan of the passport?'],
  ['EN ID', 'Please send a copy of the ID.'],
  ['EN insurance', 'Could you attach the insurance certificate?'],
  ['EN W-9', 'Please send the W-9 when you have it.'],
  ['EN PO', 'Could you forward the purchase order?'],
  ['EN deck', 'Please send the deck from last week.'],
  ['EN logo', 'Can you send the logo as a file?'],
  ['EN transfer', 'Please send the transfer confirmation.'],
  ['EN report', 'Could you share the report with me?'],
  ['EN signed pdf', 'Please send the signed PDF.'],
  ['HE receipt', 'שלום, אבקש לקבל ממך את הקבלה על דמי התיווך ששילמנו. תודה.'],
  ['HE invoice', 'תוכל בבקשה לשלוח לי את החשבונית?'],
  ['HE tax invoice', 'אשמח לקבל את חשבונית המס עבור התשלום.'],
  ['HE quote', 'אפשר לקבל את הצעת המחיר המעודכנת?'],
  ['HE contract', 'תשלח לי בבקשה את החוזה החתום.'],
  ['HE ID', 'תצרף בבקשה צילום של תעודת הזהות.'],
  ['HE transfer', 'נשמח לקבל את אישור ההעברה.'],
  ['HE report', 'תוכלי לשלוח לי את הדוח העדכני?'],
  ['HE insurance', 'אבקש לקבל את פוליסת הביטוח.']
];

console.log('\n--- file-attach: clear ask, one object, HE+EN ---\n');
for (const [name, text] of ASKS) {
  const gated = FlowFileAttach.gate(text);
  check(name + ' is a clear file ask', gated.kind === 'clear' && gated.ask && gated.ask.query, gated);
}

console.log('\n--- file-attach: unclear, hedge, multi, negation, already-sent stay quiet ---\n');
const BLOCKS = [
  ['hedge', 'Maybe send the invoice if you feel like it.'],
  ['maybe he', 'אולי תשלח את החשבונית אם בא לך.'],
  ['two objects', 'Could you please send the invoice and the contract?'],
  ['two objects he', 'תשלח לי את החשבונית וגם את החוזה.'],
  ['negation', "Please don't send the invoice, we already have it."],
  ['negation he', 'אין צורך לשלוח את הקבלה.'],
  ['fyi', 'FYI, the invoice is in the folder. No action needed.']
];
for (const [name, text] of BLOCKS) {
  const gated = FlowFileAttach.gate(text);
  check(name + ' does not become a file chip', gated.kind === 'block', gated);
}
check('already sent is not an ask', FlowFileAttach.gate('I attached the invoice for your records. Thanks!').kind === 'ignore');
check('vague send-that is not an ask', FlowFileAttach.gate('Can you send that over when you get a chance?').kind === 'ignore');
check('a quoted ask under thanks is not an ask', FlowFileAttach.gate('Thanks!\n> Could you please send the invoice?').kind === 'ignore');
check('confirm-by-Friday is not a file ask', FlowFileAttach.gate('Could you please confirm by Friday, September 18?').kind === 'ignore');

console.log('\n--- file-attach: one name match among hundreds attaches; a tie is silence ---\n');
{
  const ask = FlowFileAttach.gate('Could you send me the invoice 1042 for Meridian?').ask;
  const files = [];
  for (let i = 0; i < 300; i++) files.push(file('n' + i, 'Notes-' + i + '.txt', { mimeType: 'text/plain' }));
  files.push(file('inv', 'Invoice-1042-Meridian.pdf'));
  files.push(file('other', 'Receipt-March.pdf'));
  const decision = FlowFileAttach.decide(ask, files, {}, 'Could you send me the invoice 1042 for Meridian?');
  check('the one named invoice wins over hundreds of other files', decision.action === 'attach' && decision.file.id === 'inv', decision);
}
{
  const ask = FlowFileAttach.gate('Could you please send the invoice?').ask;
  const files = [file('a', 'Invoice-March.pdf'), file('b', 'Invoice-April.pdf')];
  const decision = FlowFileAttach.decide(ask, files, {}, 'Could you please send the invoice?');
  check('two invoices and no distinguisher is silence, not a guess', decision.action === 'silence' && decision.reason === 'conflict', decision);
}
{
  const ask = FlowFileAttach.gate('Please send the signed contract.').ask;
  const files = [file('plain', 'Contract.pdf'), file('signed', 'Contract-Signed.pdf')];
  const decision = FlowFileAttach.decide(ask, files, {}, 'Please send the signed contract.');
  check('signed in the ask picks the signed file and not the other contract', decision.action === 'attach' && decision.file.id === 'signed', decision);
}
{
  const ask = FlowFileAttach.gate('Could you send the passport scan?').ask;
  const files = [file('big', 'Passport-Scan.pdf', { size: String(50 * 1024 * 1024) }), file('ok', 'Passport.pdf')];
  const decision = FlowFileAttach.decide(ask, files, {}, 'Could you send the passport scan?');
  check('an oversized namesake is not a candidate, so the one attachable file wins', decision.action === 'attach' && decision.file.id === 'ok', decision);
}
{
  const ask = FlowFileAttach.gate('Please send the invoice.').ask;
  const files = [file('doc', 'Invoice', { mimeType: 'application/vnd.google-apps.document', size: null })];
  const decision = FlowFileAttach.decide(ask, files, {}, 'Please send the invoice.');
  check('a Google Doc whose name is the invoice is the one match', decision.action === 'attach' && decision.file.id === 'doc', decision);
}

console.log('\n--- file-attach: no safe match hands off only when one template exists ---\n');
{
  const text = 'Could you please send the invoice for the retainer?';
  const ask = FlowFileAttach.gate(text).ask;
  const none = FlowFileAttach.decide(ask, [], { senderName: 'Dana' }, text);
  check('no file and no template is silence', none.action === 'silence' && none.reason === 'none', none);
  const many = FlowFileAttach.decide(ask, [
    file('t1', 'Invoice Template.pdf'),
    file('t2', 'Invoice Template EU.pdf')
  ], {}, text);
  check('two templates is silence, not a picker', many.action === 'silence', many);
  const conflict = FlowFileAttach.decide(ask, [
    file('a', 'Invoice-A.pdf'),
    file('b', 'Invoice-B.pdf'),
    file('t', 'Invoice Template.pdf')
  ], {}, text);
  check('a conflict does not fall through to create', conflict.action === 'silence' && conflict.reason === 'conflict', conflict);
  const real = FlowFileAttach.decide(ask, [
    file('real', 'Invoice-1042.pdf'),
    file('t', 'Invoice Template.pdf')
  ], {}, text);
  check('a real invoice is attached even when a template is also there', real.action === 'attach' && real.file.id === 'real', real);
  const handoff = FlowFileAttach.decide(ask, [file('t', 'Invoice Template', { mimeType: 'application/vnd.google-apps.document' })], {
    senderName: 'Dana', amount: '$1,200', when: 'Sep 18'
  }, text);
  check('one template and a clear invoice ask hands off to create', handoff.action === 'create' && handoff.template.id === 't', handoff);
  check('known sender, amount, and date leave at most four fields', handoff.present.mode === 'card' && handoff.present.slots.length <= 4 && handoff.present.slots.length === 2, handoff.present);
  check('the handoff is not a free prompt', handoff.freePrompt === false && handoff.present.freePrompt === false, handoff.present);
  check('the card line names the miss and the template', handoff.line === "Didn't find invoice — draft from template", handoff.line);
}
{
  const text = 'תוכל בבקשה לשלוח לי את החשבונית?';
  const ask = FlowFileAttach.gate(text).ask;
  const handoff = FlowFileAttach.decide(ask, [file('t', 'תבנית חשבונית', { mimeType: 'application/vnd.google-apps.document' })], {}, text);
  check('Hebrew miss with one template uses the Hebrew line', handoff.action === 'create' && handoff.line.indexOf('לא מצאתי') === 0, handoff);
}
{
  const text = 'Could you send a scan of the passport?';
  const ask = FlowFileAttach.gate(text).ask;
  const decision = FlowFileAttach.decide(ask, [file('t', 'Passport Template.pdf')], {}, text);
  check('a passport with no scan does not become a created document', decision.action === 'silence' && decision.reason === 'none', decision);
}

console.log('\n--- file-attach: ≤4 fields on the card; >4 is a named-slot checklist ---\n');
{
  const text = 'Could you please send the invoice?';
  const ask = FlowFileAttach.gate(text).ask;
  const bare = FlowFileAttach.decide(ask, [file('t', 'Invoice Template.pdf')], {}, text);
  check('five missing invoice facts use the slot checklist', bare.present.mode === 'slots' && bare.present.turnsLeft === 5 && bare.present.freePrompt === false, bare.present);
  check('the checklist names one slot, not a chat prompt', bare.present.slot && bare.present.slot.label === 'Bill to' && !bare.present.prompt, bare.present);
  const filled = FlowFileAttach.fillSlot(bare.fields, bare.present.slot.id, 'Dana Cole');
  check('once four or fewer slots remain they sit on the card, not in a checklist', filled.present && filled.present.mode === 'card' && filled.present.slots.length === 4 && filled.present.freePrompt === false, filled.present);
  const unsure = FlowFileAttach.fillSlot(bare.fields, bare.present.slot.id, "I don't know");
  check('unsure does not create', unsure.silence === true && unsure.create === false, unsure);
  const hebrewUnsure = FlowFileAttach.fillSlot(bare.fields, bare.present.slot.id, 'לא בטוח');
  check('Hebrew unsure does not create', hebrewUnsure.silence === true, hebrewUnsure);
  const chat = FlowFileAttach.fillSlot(bare.fields, bare.present.slot.id, 'How can I help rewrite this?');
  check('a free-assistant reply is silence, not a conversation', chat.silence === true && chat.create === false, chat);
  const blank = FlowFileAttach.fillSlot(bare.fields, bare.present.slot.id, '   ');
  check('an empty slot stays put', blank.stay === true && !blank.ready, blank);
  const declined = FlowFileAttach.decline();
  check('dismiss is silence and does not create', declined.silence === true && declined.create === false, declined);

  const first = FlowFileAttach.fillSlot(bare.fields, bare.present.slot.id, 'Dana');
  const doneSlots = FlowFileAttach.fillAll(first.fields, { amount: '$1,200', date: 'Sep 18', number: '1042', forWhat: 'Retainer' });
  const fields = doneSlots.fields;
  check('after the checklist and the card fields, one Do It is ready', doneSlots.ready === true && doneSlots.present.mode === 'ready', doneSlots.present);
  check('the copy title is the object plus the filled facts', FlowFileAttach.copyTitle(ask, fields).indexOf('invoice') === 0, FlowFileAttach.copyTitle(ask, fields));
}
{
  const text = 'Could you please send the invoice?';
  const ask = FlowFileAttach.gate(text).ask;
  const handoff = FlowFileAttach.decide(ask, [file('t', 'Invoice Template.pdf')], {
    senderName: 'Dana', amount: '$1,200', when: 'Sep 18'
  }, text);
  const done = FlowFileAttach.fillAll(handoff.fields, { number: '1042', forWhat: 'Retainer' });
  check('two card fields accept together and become ready', done.ready === true && done.present.mode === 'ready', done);
  const missing = FlowFileAttach.fillAll(handoff.fields, { number: '1042' });
  check('a card missing one required value does not create', missing.stay === true && !missing.ready, missing);
  const dodge = FlowFileAttach.fillAll(handoff.fields, { number: 'not sure', forWhat: 'Retainer' });
  check('unsure inside the card does not create', dodge.silence === true && dodge.create === false, dodge);
}

console.log('\n--- file-attach: Drive query escapes quotes and stays on the asked term ---\n');
{
  const q = FlowFileAttach.driveQuery("invoice's");
  check('a quote in the term is escaped', q.includes("invoice\\'s") && q.includes('trashed = false'), q);
}

console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
