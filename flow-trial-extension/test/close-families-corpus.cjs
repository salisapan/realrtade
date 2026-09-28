// Families A–I. Clear HE+EN paraphrases chip. Hedge, negation, past,
// noise, and a quoted older ask stay silent. Family I never promotes a
// weak score into fields or chat.
//
// Run: node test/close-families-corpus.cjs

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = { module: undefined, console };
vm.createContext(sandbox);
for (const f of ['domains.js', 'extract.js', 'judgment.js', 'close-families.js', 'intent.js', 'actions.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'core', f), 'utf8'), sandbox, { filename: f });
}
const FlowIntent = vm.runInContext('FlowIntent', sandbox);
const FlowCloseFamilies = vm.runInContext('FlowCloseFamilies', sandbox);
const FlowActions = vm.runInContext('FlowActions', sandbox);

const NOW = new Date('2026-09-17T12:00:00Z');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
function classify(text) {
  return FlowIntent.classify(text, { senderEmail: 'dana@meridian.com', now: NOW, calibration: null });
}
function chip(text) {
  const intent = classify(text);
  return { intent, show: FlowIntent.shouldShowChip(intent) };
}

console.log('--- A–I exemplars: one clear close chips; doubt stays quiet ---\n');

const exemplars = [
  ['A en send invoice', 'Could you send the invoice?', 'A', true],
  ['A en passport', 'I need the passport scan for the file.', 'A', true],
  ['A he contract', 'בבקשה תשלח את החוזה.', 'A', true],
  ['A he id', 'צריך את תעודת הזהות.', 'A', true],
  ['B calendar', 'Please send the invoice. Add it on the calendar for September 24 at 4pm.', 'B', true],
  ['B task', 'Please forward the receipt. Put it in the task note.', 'B', true],
  ['B he task', 'בבקשה תשלח את החשבונית. תוסיף אותה במשימה.', 'B', true],
  ['C en', 'Please draft a short document and send it to Dana today.', 'C', true],
  ['C he', 'תכין מסמך קצר ותשלח אותו לדנה.', 'C', true],
  ['D en clock', 'Got 20 minutes Thursday at 11am?', 'D', true],
  ['D en promise', 'I will have the redline to you by September 24.', 'D', true],
  ['D he clock', 'יש לך רבע שעה ביום חמישי בשעה 16:00?', 'D', true],
  ['D he promise', 'אני על זה, אחזיר לך את החוזה עד יום חמישי.', 'D', true],
  ['E en amount', 'Confirming the fee is $8,750.', 'E', true],
  ['E en ok', 'You have my OK to start the migration.', 'E', true],
  ['E he', 'אאשר את החוזה עד יום חמישי.', 'E', true],
  ['F en', 'Please chase the vendor about the invoice.', 'F', true],
  ['F he', 'תעקוב אחרי החשבונית מול הספק.', 'F', true],
  ['G en new slot', 'Can we reschedule the Friday, September 18 at 3pm sync to Thursday, September 24 at 4pm?', 'G', true],
  ['G he new slot', 'אפשר לדחות את הפגישה ליום חמישי בשעה 16:00?', 'G', true],
  ['I en template', 'Please draft the contract from our company template and send it to Dana.', 'I', true],
  ['I he template', 'אין חוזה בתיקייה. תכין אחד מהתבנית שלנו ותשלח לדנה.', 'I', true],
  ['I en quote from template', 'We don\'t have a quote for Acme. Draft one from our company template and send it to Dana.', 'I', true],
  ['I he invoice from template', 'לא מצאתי את החשבונית. תכין אחת מהתבנית שלנו ותשלח.', 'I', true]
];
for (const [name, text, family, wantChip] of exemplars) {
  const { intent, show } = chip(text);
  check(name + ' chips', show === wantChip, { type: intent.type, family: intent.closeFamily, conf: intent.confidence });
  check(name + ' family ' + family, intent.closeFamily === family, { family: intent.closeFamily, type: intent.type, what: intent.entities && intent.entities.what });
}

{
  const moved = classify('Can we reschedule the Friday, September 18 at 3pm sync to Thursday, September 24 at 4pm?');
  check('G files the new slot, not Friday',
    moved.entities && moved.entities.dateIso === '2026-09-24' && moved.entities.hour === 16,
    moved.entities);
  check('G moves the named event instead of holding a second one',
    moved.personalClose === 'calendar-move' && moved.type === 'event' &&
      moved.entities.calendarOp === 'update' &&
      moved.entities.fromDateIso === '2026-09-18' && moved.entities.fromHour === 15,
    moved.personalClose);
  const held = classify('אפשר לדחות את הפגישה ליום חמישי בשעה 16:00?');
  check('G with only a new slot stays one calendar hold',
    held.personalClose === 'calendar-hold' && held.entities && held.entities.dateIso === '2026-09-24' && held.entities.hour === 16 && !held.entities.calendarOp,
    held.personalClose);
  const created = classify('Please draft the contract from our company template and send it to Dana.');
  check('I is create-when-missing, not a found file', created.createWhenMissing === true && created.closeFamily === 'I', created.closeFamily);
  const found = classify('Could you send the invoice?');
  check('a file ask stays family A, not I', found.closeFamily === 'A' && !found.createWhenMissing, found.closeFamily);
  const missingOnly = classify('There is no proposal in the folder.');
  check('a missing asset with no template stays silence',
    !FlowIntent.shouldShowChip(missingOnly) && missingOnly.closeFamily !== 'I' && !missingOnly.createWhenMissing,
    { type: missingOnly.type, family: missingOnly.closeFamily });
  const noTemplate = classify('We don\'t have a quote for Acme. Please draft one and send it to Dana.');
  check('clear what and a missing file, without a template, stays silence',
    !FlowIntent.shouldShowChip(noTemplate) && !noTemplate.createWhenMissing,
    { type: noTemplate.type, family: noTemplate.closeFamily });
  const unclear = classify('Please draft something from our company template and send it to Dana.');
  check('a template with no clear asset stays silence',
    !FlowIntent.shouldShowChip(unclear) && unclear.closeFamily !== 'I',
    { type: unclear.type, family: unclear.closeFamily });
}

console.log('\n--- H and the other kill cases: silence, not a softer chip ---\n');
const kills = [
  ['hedge maybe', 'Maybe send the invoice if you feel like it.'],
  ['hedge he', 'אולי תשלח את החוזה מתישהו.'],
  ['negation', "Please don't send the invoice."],
  ['negation he', 'לא צריך לשלוח את החוזה.'],
  ['past', 'I already sent the invoice yesterday.'],
  ['past paid', 'Confirming we paid the $4,200 on March 3, 2024.'],
  ['past he', 'החשבונית שולמה אתמול.'],
  ['past he final mem', 'הסכום שולם אתמול, 4,200 ש״ח.'],
  ['status', 'Did you send the invoice?'],
  ['attached delivery', 'Please find the invoice attached for your records today.'],
  ['noise pitch', 'Hope this email finds you well. Could you send the invoice?'],
  ['noise bump', 'Just bumping this — could you send the invoice?'],
  ['fyi', 'FYI, we agreed to file the amendment by September 21.'],
  ['two targets', 'Please send the invoice. Put it on the calendar and in the task note.'],
  ['doc comment', 'Please send the contract and leave a doc comment.'],
  ['vague reschedule', 'Maybe we should reschedule sometime.'],
  ['maybe cancel named', 'Maybe cancel the Friday, September 18 at 3pm sync.'],
  ['dont cancel named', "Please don't cancel the Friday, September 18 at 3pm sync."],
  ['reschedule no new clock', 'Can we reschedule the Friday, September 18 at 3pm sync to a better week?'],
  ['find a time', "Let's find a time."],
  ['maybe chase later', 'Maybe chase the invoice later.'],
  ['chase nothing named', 'Please chase when you can.'],
  ['about amount', 'Confirming the fee is about $4,200.'],
  ['or amount', 'Confirming the amount is $4,200 or $5,000.'],
  ['already paid he', 'כבר שולם, 4,200 ש״ח.'],
  ['vent', "I'm so frustrated with this project, just venting about the invoice."],
  ['vague template', 'Maybe draft something from our template if you get a chance.'],
  ['vague quote', 'Maybe draft a quote if you get a chance.'],
  ['thoughts', 'Any thoughts on the template when you have a minute?'],
  ['thoughts proposal', 'Any thoughts on a proposal when you have a minute?'],
  ['pitch someday', 'Hope this email finds you well. We should have an invoice someday.'],
  ['missing quote no template', 'We don\'t have a quote for Acme. Please draft one and send it to Dana.'],
  ['invoice not on file no template', 'No invoice on file for this job. Create one and send it.'],
  ['letter no template', 'Please write a letter to Dana and send it.'],
  ['he quote no template', 'אין הצעת מחיר. תכין אחת ותשלח לדנה.'],
  ['unclear template', 'Please draft something from our company template and send it to Dana.'],
  ['ask glance', 'Hey Glance, can we chat about what to do with this thread?'],
  ['general chat', 'Let\'s chat and you can ask me whatever you need about the quote.'],
  ['weak invoice', 'Please find invoice INV-2041 attached for $12,500. Payment is payable net 30, due October 14.'],
  ['retract', 'Could you send the invoice?\nNever mind.'],
  ['quote', ['Sounds good, thanks!', '', 'On Mon, Sep 1, 2025 at 9:41 AM Dana Cole <dana@meridian.com> wrote:', '> Could you send the invoice?'].join('\n')]
];
for (const [name, text] of kills) {
  const { intent, show } = chip(text);
  check('silence: ' + name, show === false, { type: intent.type, family: intent.closeFamily, conf: intent.confidence });
}
{
  const latest = classify('Could you send the invoice? Please send the contract instead.');
  check('latest ask wins', latest.closeFamily === 'A' && /contract/i.test((latest.entities && latest.entities.what) || ''), latest.entities && latest.entities.what);
}

console.log('\n--- E F G: the close is a task, a draft plus a task, or one calendar change ---\n');
{
  function plan(text) {
    const intent = classify(text);
    return {
      intent,
      show: FlowIntent.shouldShowChip(intent),
      process: FlowActions.planFor(intent, { threadUrl: 'x', hasThreadAttachment: false })
    };
  }
  function kinds(process) {
    return (process && process.steps || []).map((s) => s.kind);
  }
  function googleOnly(process, allowed) {
    const got = kinds(process);
    return got.length > 0 && got.every((k) => allowed.indexOf(k) !== -1) &&
      !got.some((k) => /hubspot|salesforce|notion|slack|monday/i.test(k));
  }
  const money = [
    ['E he paid', 'החשבונית שולמה, 4,200 ש״ח.'],
    ['E he paid colon', 'הסכום שולם: 4,200 ש״ח.'],
    ['E en paid in full', 'The invoice is paid in full, $4,200.']
  ];
  for (const [name, text] of money) {
    const row = plan(text);
    check(name + ' chips as E', row.show && row.intent.closeFamily === 'E' && row.intent.personalClose === 'confirmed-amount', {
      type: row.intent.type, family: row.intent.closeFamily, close: row.intent.personalClose
    });
    check(name + ' is one task', row.process && row.process.id === 'log-it' && googleOnly(row.process, ['googleTask']), kinds(row.process));
  }
  const nudges = [
    ['F he remind', 'תזכיר לדנה לגבי החשבונית.'],
    ['F en chase up', 'Please chase up the vendor on the contract.'],
    ['F en reminder', 'Please send Dana a reminder about the contract.']
  ];
  for (const [name, text] of nudges) {
    const row = plan(text);
    check(name + ' chips as F', row.show && row.intent.closeFamily === 'F' && row.intent.personalClose === 'follow-up-ask', {
      type: row.intent.type, family: row.intent.closeFamily, close: row.intent.personalClose
    });
    check(name + ' is a draft and a task',
      row.process && row.process.id === 'reply-track' && googleOnly(row.process, ['gmailDraft', 'googleTask']) &&
        kinds(row.process).indexOf('gmailDraft') !== -1 && kinds(row.process).indexOf('googleTask') !== -1,
      kinds(row.process));
  }
  const cancel = plan('Please cancel the Friday, September 18 at 3pm sync.');
  check('G cancel removes Friday at 3pm',
    cancel.show && cancel.intent.closeFamily === 'G' && cancel.intent.personalClose === 'calendar-cancel' &&
      cancel.intent.entities.calendarOp === 'delete' && cancel.intent.entities.dateIso === '2026-09-18' && cancel.intent.entities.hour === 15,
    cancel.intent.entities);
  check('G cancel is one calendar delete',
    cancel.process && cancel.process.id === 'clear-it' && googleOnly(cancel.process, ['calendar']) &&
      cancel.process.steps[0].params.calendarOp === 'delete',
    cancel.process && cancel.process.id);
  const cancelHe = plan('בבקשה בטל את הפגישה ביום שישי בשעה 15:00.');
  check('G Hebrew cancel removes Friday at 15:00',
    cancelHe.show && cancelHe.intent.personalClose === 'calendar-cancel' &&
      cancelHe.intent.entities.dateIso === '2026-09-18' && cancelHe.intent.entities.hour === 15 &&
      cancelHe.process && cancelHe.process.id === 'clear-it',
    cancelHe.intent.entities);
  const sameDay = plan('Please move the call on Friday, September 18 at 3pm to 4pm.');
  check('G same-day move patches 3pm to 4pm',
    sameDay.show && sameDay.intent.personalClose === 'calendar-move' &&
      sameDay.intent.entities.dateIso === '2026-09-18' && sameDay.intent.entities.hour === 16 &&
      sameDay.intent.entities.fromDateIso === '2026-09-18' && sameDay.intent.entities.fromHour === 15 &&
      sameDay.process && sameDay.process.id === 'move-it' && sameDay.process.steps.length === 1 &&
      sameDay.process.steps[0].params.calendarOp === 'update',
    sameDay.intent.entities);
  const moveHe = plan('תזיזו את הפגישה מיום שישי בשעה 15:00 ליום שלישי בשעה 10:00.');
  check('G Hebrew move patches Friday 15:00 to Tuesday 10:00',
    moveHe.show && moveHe.intent.personalClose === 'calendar-move' &&
      moveHe.intent.entities.fromDateIso === '2026-09-18' && moveHe.intent.entities.fromHour === 15 &&
      moveHe.intent.entities.dateIso === '2026-09-22' && moveHe.intent.entities.hour === 10 &&
      moveHe.process && moveHe.process.id === 'move-it',
    moveHe.intent.entities);
}

console.log('\n--- generated paraphrases (A) and wrapped kills ---\n');
{
  const nouns = ['the receipt', 'the invoice', 'the quote', 'the contract', 'the signed PDF', 'the passport scan', 'the insurance form', 'the tax document', 'the proposal', 'the deck', 'the logo', 'the brief', 'the statement', 'the purchase order', 'the W-9'];
  const frames = [
    (n) => `Could you send ${n}?`,
    (n) => `Please forward ${n} when you get a chance.`,
    (n) => `I need ${n} for the file.`,
    (n) => `Can you attach ${n}?`,
    (n) => `Mind sending ${n}?`,
    (n) => `We need ${n} back today.`
  ];
  const heNouns = ['החשבונית', 'הקבלה', 'החוזה', 'תעודת הזהות', 'אישור ההעברה', 'הדוח', 'הצעת המחיר', 'הלוגו'];
  const heFrames = [
    (n) => `אפשר לשלוח את ${n}?`,
    (n) => `בבקשה תשלח את ${n}.`,
    (n) => `צריך את ${n}.`,
    (n) => `תעביר לי את ${n}.`
  ];
  let pos = 0, posFail = 0, neg = 0, negFail = 0;
  function failPos(text, intent) {
    posFail++;
    if (posFail <= 12) console.log('FAIL chip', text, intent && intent.type, intent && intent.closeFamily);
  }
  function failNeg(text, intent) {
    negFail++;
    if (negFail <= 12) console.log('FAIL silence', text, intent && intent.type, intent && intent.closeFamily, intent && intent.confidence);
  }
  for (const noun of nouns) {
    for (const frame of frames) {
      const text = frame(noun);
      const { intent, show } = chip(text);
      if (show && intent.closeFamily === 'A') pos++;
      else failPos(text, intent);
      const wrapped = [
        'Maybe ' + text,
        "Please don't " + text.replace(/^[A-Z]/, (c) => c.toLowerCase()),
        'Hope this email finds you well. ' + text,
        'I already sent ' + noun + ' yesterday.',
        'Did you send ' + noun + '?'
      ];
      for (const kill of wrapped) {
        const k = chip(kill);
        if (!k.show) neg++;
        else failNeg(kill, k.intent);
      }
    }
  }
  for (const noun of heNouns) {
    for (const frame of heFrames) {
      const text = frame(noun);
      const { intent, show } = chip(text);
      if (show && intent.closeFamily === 'A') pos++;
      else failPos(text, intent);
      const k = chip('אולי ' + text);
      if (!k.show) neg++;
      else failNeg('אולי ' + text, k.intent);
    }
  }
  check('generated clear file asks chip as A (' + pos + ')', posFail === 0 && pos >= 100, { pos, posFail });
  check('generated hedges, refusals, past, and pitches stay quiet (' + neg + ')', negFail === 0 && neg >= 400, { neg, negFail });
}

console.log('\n--- I is not a rescue for a weak judgment ---\n');
{
  const weak = classify('Please find invoice INV-2041 attached for $12,500. Payment is payable net 30, due October 14.');
  const eight = ['party', 'amount', 'date', 'scope', 'term', 'signatory', 'currency', 'notice'];
  const opened = FlowCloseFamilies.detailSurface(weak, eight, null);
  check('a low score with many empty slots stays silence', opened.surface === 'silence' && opened.slots.length === 0, opened);
  check('that invoice is not family I', weak.closeFamily !== 'I' && !FlowIntent.shouldShowChip(weak), weak.confidence);

  const clear = classify('Please draft the contract from our company template and send it to Dana.');
  const four = ['party', 'amount', 'date', 'scope'];
  const card = FlowCloseFamilies.detailSurface(clear, four, null);
  check('up to four missing fields are a card',
    card.surface === 'card' && card.slots.length === 4 && card.surface !== 'chat' && !card.chat && !card.prompt && !card.assistant,
    card);
  const two = FlowCloseFamilies.detailSurface(clear, ['party', 'amount'], null);
  check('two missing fields are a card',
    two.surface === 'card' && two.slots.length === 2 && two.surface !== 'chat' && !two.assistant,
    two);
  const one = FlowCloseFamilies.detailSurface(clear, ['amount'], null);
  check('a single missing field is a card',
    one.surface === 'card' && one.slots.length === 1 && one.slots[0] === 'amount' && one.surface !== 'chat',
    one);
  const five = ['party', 'amount', 'date', 'scope', 'term'];
  const chat = FlowCloseFamilies.detailSurface(clear, five, null);
  check('more than four missing fields are a scoped chat fill',
    chat.surface === 'chat' && chat.scope === 'critical-fields' && chat.slots.length === 5 &&
      !chat.assistant && !chat.prompt && chat.slots.every((s) => typeof s === 'string'),
    chat);
  const list = FlowCloseFamilies.detailSurface(clear, eight, null);
  check('eight missing fields stay a named chat fill',
    list.surface === 'chat' && list.scope === 'critical-fields' && list.slots.length === 8 && !list.assistant && !list.prompt,
    list);
  const still = FlowCloseFamilies.route(clear, five);
  check('more than four missing fields still route create-when-missing',
    still.closeFamily === 'I' && still.createWhenMissing === true && still.type === 'request' && FlowIntent.shouldShowChip(still), still);
  check('that route is not a general chat classification', still.type !== 'chat' && !still.chat, still);
  const classified = FlowIntent.classify(
    'Please draft the contract from our company template and send it to Dana.',
    { senderEmail: 'dana@meridian.com', now: NOW, calibration: null, missingSlots: five }
  );
  check('classify with more than four missing fields still routes create-when-missing',
    FlowIntent.shouldShowChip(classified) && classified.createWhenMissing === true && classified.closeFamily === 'I' && classified.type === 'request',
    { type: classified.type, family: classified.closeFamily });
  const ready = FlowCloseFamilies.detailSurface(clear, [], null);
  check('no missing slots is one Do It', ready.surface === 'doit', ready);
  const dismissed = FlowCloseFamilies.detailSurface(clear, eight, 'dismiss');
  const unsure = FlowCloseFamilies.detailSurface(clear, ['amount'], 'unsure');
  check('dismiss or unsure returns to silence', dismissed.surface === 'silence' && unsure.surface === 'silence', { dismissed, unsure });
  const other = classify('Could you send the invoice?');
  check('family A does not open the collector', FlowCloseFamilies.detailSurface(other, eight, null).surface === 'doit');
  const borderline = FlowCloseFamilies.detailSurface({ type: 'request', confidence: 'unsure', closeFamily: 'I', createWhenMissing: true }, eight, null);
  check('unsure confidence does not open fields or chat', borderline.surface === 'silence', borderline);
}

console.log('\n--- J reply-with-facts: one fact, one Sheet or Doc; else silence ---\n');
{
  const passes = [
    ['J en sheet amount', "What's the renewal amount in the pricing sheet?"],
    ['J en doc date', 'Please reply with the start date from the SOW doc.'],
    ['J en balance', 'How much is the open balance in the tracker spreadsheet?'],
    ['J he sheet amount', 'מה הסכום בגיליון התמחור?'],
    ['J he doc date', 'תשיב עם תאריך ההתחלה מהמסמך.']
  ];
  for (const [name, text] of passes) {
    const { intent, show } = chip(text);
    check(name + ' chips', show === true, { type: intent.type, family: intent.closeFamily, conf: intent.confidence });
    check(name + ' family J', intent.closeFamily === 'J' && intent.type === 'request', { type: intent.type, family: intent.closeFamily });
  }
  const quiet = [
    ['two sources', 'Is the renewal amount in the pricing sheet or in the contract doc?'],
    ['two facts', "What's the renewal amount and the start date in the pricing sheet?"],
    ['vague doc', 'Anything useful in the document?'],
    ['hedge sheet', 'Maybe tell me the amount from the sheet if you have a minute.'],
    ['he two sources', 'מה הסכום בגיליון או במסמך?'],
    ['he hedge', 'אולי תבדוק בגיליון מתישהו.'],
    ['ask glance sheet', 'Hey Glance, can we chat about the amount in the sheet?']
  ];
  for (const [name, text] of quiet) {
    const { intent, show } = chip(text);
    check('J silence: ' + name, show === false && intent.closeFamily !== 'J', { type: intent.type, family: intent.closeFamily, conf: intent.confidence });
  }
  const found = classify('Could you send the invoice?');
  check('a file ask stays family A, not J', found.closeFamily === 'A' && found.closeFamily !== 'J', found.closeFamily);
  const weak = classify('Please find invoice INV-2041 attached for $12,500. Payment is payable net 30, due October 14.');
  check('the weak invoice is not family J', weak.closeFamily !== 'J' && !FlowIntent.shouldShowChip(weak), weak.confidence);
}

console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
