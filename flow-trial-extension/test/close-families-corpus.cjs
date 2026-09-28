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

console.log('\n--- H multi-signal: latest explicit ask, or silence ---\n');
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
  const positives = [
    ['H en instead', 'Could you send the invoice? Please send the contract instead.', /contract/i, 'A', 'reply-track'],
    ['H en later file', 'Could you send the invoice? Please send the contract.', /contract/i, 'A', 'reply-track'],
    ['H he instead', 'אפשר לשלוח את החשבונית? תשלח את החוזה במקום.', /חוזה/, 'A', 'reply-track'],
    ['H he later file', 'צריך את החשבונית. תעביר לי את החוזה במקום.', /חוזה/, 'A', 'reply-track'],
    ['H hedge then clear', 'Maybe send the invoice. Please send the contract.', /contract/i, 'A', 'reply-track'],
    ['H he hedge then clear', 'אולי תשלח את החשבונית. בבקשה תשלח את החוזה.', /חוזה/, 'A', 'reply-track'],
    ['H neg then clear', "Please don't send the invoice. Please send the contract.", /contract/i, 'A', 'reply-track'],
    ['H past then clear', 'I already sent the invoice yesterday. Please send the contract.', /contract/i, 'A', 'reply-track'],
    ['H chase then file', 'Please chase the vendor about the invoice. Please send the contract instead.', /contract/i, 'A', 'reply-track'],
    ['H quote then file', 'You wrote "Could you send the invoice?" Please send the contract instead.', /contract/i, 'A', 'reply-track'],
    ['H he quote then file', 'כתבת "אפשר לשלוח את החשבונית?" תשלח את החוזה במקום.', /חוזה/, 'A', 'reply-track']
  ];
  for (const [name, text, whatRe, family, proc] of positives) {
    const row = plan(text);
    const what = (row.intent.entities && row.intent.entities.what) || '';
    check(name + ' chips the later ask',
      row.show && row.intent.closeFamily === family && whatRe.test(what) && row.process && row.process.id === proc,
      { type: row.intent.type, family: row.intent.closeFamily, what: what, proc: row.process && row.process.id });
    check(name + ' does not keep the older object', !/invoice|חשבונית/.test(row.intent.entities && row.intent.entities.requestedObjectTerm || ''),
      row.intent.entities && row.intent.entities.requestedObjectTerm);
  }
  const money = plan('Could you send the invoice? Confirming the fee is $8,750.');
  check('H later amount is one task, not a draft of the invoice',
    money.show && money.intent.closeFamily === 'E' && money.intent.personalClose === 'confirmed-amount' &&
      money.intent.type === 'decision' && money.process && money.process.id === 'log-it' &&
      kinds(money.process).indexOf('gmailDraft') === -1 && /8,750|8750/.test((money.intent.entities && money.intent.entities.what) || ''),
    { type: money.intent.type, family: money.intent.closeFamily, close: money.intent.personalClose, proc: money.process && money.process.id, what: money.intent.entities && money.intent.entities.what });
  const fileAfterMoney = plan('Confirming the fee is $8,750. Could you send the invoice?');
  check('H later file ask is a draft, not the earlier amount',
    fileAfterMoney.show && fileAfterMoney.intent.closeFamily === 'A' && fileAfterMoney.process && fileAfterMoney.process.id === 'reply-track' &&
      /invoice/i.test((fileAfterMoney.intent.entities && fileAfterMoney.intent.entities.what) || ''),
    { family: fileAfterMoney.intent.closeFamily, proc: fileAfterMoney.process && fileAfterMoney.process.id, what: fileAfterMoney.intent.entities && fileAfterMoney.intent.entities.what });
  const promise = plan('Could you send the invoice? I will have the redline to you by September 24.');
  check('H later dated promise is the task',
    promise.show && promise.intent.closeFamily === 'D' && promise.intent.personalClose === 'dated-commitment' &&
      promise.process && promise.process.id === 'log-it',
    { family: promise.intent.closeFamily, close: promise.intent.personalClose, proc: promise.process && promise.process.id });
  const aside = plan('Could you send the invoice? I might also call Dana tomorrow.');
  check('H an unrelated aside leaves the explicit ask',
    aside.show && aside.intent.closeFamily === 'A' && /invoice/i.test((aside.intent.entities && aside.intent.entities.what) || ''),
    aside.intent.entities && aside.intent.entities.what);

  const hKills = [
    ['inline quote', 'You wrote "Could you send the invoice?"'],
    ['he inline quote', 'כתבת "אפשר לשלוח את החשבונית?"'],
    ['he quoted confirm', 'כתבת "אאשר את החוזה עד יום חמישי."'],
    ['quoted confirm', 'Dana wrote "Confirming the fee is $8,750."'],
    ['or files', 'Please send the invoice or the contract.'],
    ['both files', 'Please send both the invoice and the contract.'],
    ['and files', 'Please send the invoice and the receipt.'],
    ['or sentences', 'Could you send the invoice? Or could you send the contract?'],
    ['he or', 'תשלח את החשבונית או את החוזה.'],
    ['he and', 'תשלח את החשבונית ואת החוזה.'],
    ['maybe instead', 'Could you send the invoice? Maybe send the contract instead.'],
    ['he maybe instead', 'בבקשה תשלח את החשבונית. אולי תשלח את החוזה במקום.'],
    ['maybe not', 'Could you send the invoice? Maybe not.'],
    ['please dont', "Could you send the invoice? Please don't."],
    ['dont send it', "Could you send the invoice? Please don't send it."],
    ['already sent it', 'Could you send the invoice? I already sent it yesterday.'],
    ['already sent same', 'Could you send the invoice? I already sent the invoice yesterday.'],
    ['actually never mind', 'Could you send the invoice? Actually, never mind.'],
    ['he never mind', 'בבקשה תשלח את החשבונית.\nלא משנה.'],
    ['two clocks', 'Got 20 minutes Thursday at 11am? Or Friday at 4pm?'],
    ['two clocks he', 'יש לך רבע שעה ביום חמישי בשעה 16:00 או ביום שישי בשעה 10:00?'],
    ['reschedule or leave', 'Can we reschedule the Friday, September 18 at 3pm sync to Thursday, September 24 at 4pm? Or leave it?'],
    ['quote header', ['Thanks.', '', 'On Mon, Sep 1, 2025 at 9:41 AM Dana Cole <dana@meridian.com> wrote:', '> Could you send the invoice?'].join('\n')]
  ];
  for (const [name, text] of hKills) {
    const row = plan(text);
    check('H silence: ' + name, row.show === false, { type: row.intent.type, family: row.intent.closeFamily, what: row.intent.entities && row.intent.entities.what, proc: row.process && row.process.id });
  }

  const nouns = [
    ['the invoice', 'the contract'],
    ['the receipt', 'the quote'],
    ['the passport scan', 'the signed PDF'],
    ['the proposal', 'the W-9'],
    ['the insurance form', 'the tax document']
  ];
  const hePairs = [
    ['החשבונית', 'החוזה'],
    ['הקבלה', 'הדוח'],
    ['הצעת המחיר', 'הלוגו'],
    ['תעודת הזהות', 'אישור ההעברה']
  ];
  let hPos = 0, hPosFail = 0, hNeg = 0, hNegFail = 0;
  function failHPos(text, intent) {
    hPosFail++;
    if (hPosFail <= 8) console.log('FAIL H chip', text, intent && intent.closeFamily, intent && intent.entities && intent.entities.what);
  }
  function failHNeg(text, intent) {
    hNegFail++;
    if (hNegFail <= 8) console.log('FAIL H silence', text, intent && intent.type, intent && intent.closeFamily, intent && intent.entities && intent.entities.what);
  }
  for (const [older, newer] of nouns) {
    const frames = [
      `Could you send ${older}? Please send ${newer} instead.`,
      `Please forward ${older}. Please send ${newer} instead.`,
      `I need ${older} for the file. Can you attach ${newer} instead?`
    ];
    for (const text of frames) {
      const row = plan(text);
      const what = (row.intent.entities && row.intent.entities.what) || '';
      if (row.show && row.intent.closeFamily === 'A' && what.toLowerCase().indexOf(newer.toLowerCase()) !== -1) hPos++;
      else failHPos(text, row.intent);
    }
    const kills = [
      `Please send ${older} or ${newer}.`,
      `Please send both ${older} and ${newer}.`,
      `Could you send ${older}? Or could you send ${newer}?`,
      `Could you send ${older}? Maybe send ${newer} instead.`,
      `Could you send ${older}? Actually, never mind.`,
      `Could you send ${older}? I already sent it yesterday.`,
      `You wrote "Could you send ${older}?"`
    ];
    for (const text of kills) {
      const row = plan(text);
      if (!row.show) hNeg++;
      else failHNeg(text, row.intent);
    }
  }
  for (const [older, newer] of hePairs) {
    const text = `אפשר לשלוח את ${older}? תשלח את ${newer} במקום.`;
    const row = plan(text);
    const what = (row.intent.entities && row.intent.entities.what) || '';
    if (row.show && row.intent.closeFamily === 'A' && what.indexOf(newer.replace(/^ה/, '')) !== -1) hPos++;
    else failHPos(text, row.intent);
    const kills = [
      `תשלח את ${older} או את ${newer}.`,
      `בבקשה תשלח את ${older}. אולי תשלח את ${newer} במקום.`,
      `כתבת "אפשר לשלוח את ${older}?"`,
      `בבקשה תשלח את ${older}.\nלא משנה.`
    ];
    for (const kill of kills) {
      const quiet = plan(kill);
      if (!quiet.show) hNeg++;
      else failHNeg(kill, quiet.intent);
    }
  }
  check('H generated latest asks chip the newer file (' + hPos + ')', hPosFail === 0 && hPos >= 15, { hPos, hPosFail });
  check('H generated choices, quotes, hedges, and withdrawals stay quiet (' + hNeg + ')', hNegFail === 0 && hNeg >= 40, { hNeg, hNegFail });
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
  const notApproval = [
    ['E nothing confirmed yet', 'Nothing is confirmed yet on the $3,900 proposal, and the team is still reviewing the draft with legal before anyone signs.'],
    ['E not yet confirmed', 'The $4,800 annual fee is not yet confirmed, and legal is still reading the draft.']
  ];
  for (const [name, text] of notApproval) {
    const row = plan(text);
    check(name + ' stays quiet', !row.show, { type: row.intent.type, family: row.intent.closeFamily, close: row.intent.personalClose });
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
  const nouns = ['the receipt', 'the invoice', 'the quote', 'the quotation', 'the contract', 'the signed PDF', 'the passport scan', 'the insurance form', 'the insurance certificate', 'the tax document', 'the tax form', 'the proposal', 'the deck', 'the slides', 'the logo', 'the brief', 'the statement', 'the report', 'the purchase order', 'the W-9', 'the transfer confirmation', 'the ID'];
  const frames = [
    (n) => `Could you send ${n}?`,
    (n) => `Please forward ${n} when you get a chance.`,
    (n) => `I need ${n} for the file.`,
    (n) => `Can you attach ${n}?`,
    (n) => `Mind sending ${n}?`,
    (n) => `We need ${n} back today.`,
    (n) => `Kindly send ${n}.`,
    (n) => `Please provide ${n}.`,
    (n) => `Could you email me ${n}?`,
    (n) => `We still need ${n}.`,
    (n) => `Would you mind forwarding ${n}?`
  ];
  const heNouns = ['החשבונית', 'הקבלה', 'החוזה', 'תעודת הזהות', 'אישור ההעברה', 'הדוח', 'הצעת המחיר', 'הלוגו', 'המצגת', 'הבריף', 'הדרכון'];
  const heFrames = [
    (n) => `אפשר לשלוח את ${n}?`,
    (n) => `בבקשה תשלח את ${n}.`,
    (n) => `צריך את ${n}.`,
    (n) => `תעביר לי את ${n}.`,
    (n) => `תוכל לשלוח את ${n}?`,
    (n) => `נשמח לקבל את ${n}.`,
    (n) => `אבקש לקבל את ${n}.`
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

console.log('\n--- A densify: real need language chips; unclear, plural, and multi-file stay quiet ---\n');
{
  function plan(text) {
    const intent = classify(text);
    return {
      intent,
      show: FlowIntent.shouldShowChip(intent),
      process: FlowActions.planFor(intent, {
        threadUrl: 'x',
        hasThreadAttachment: false,
        attachFile: { id: 'file-1', name: 'Receipt-March.pdf', mimeType: 'application/pdf' }
      })
    };
  }
  const positives = [
    ['A kindly', 'Kindly send the receipt for the March payment.', /receipt/i],
    ['A provide w9', 'Please provide the W-9.', /W-?9/i],
    ['A can I get', 'Can I get a copy of the invoice?', /invoice/i],
    ['A still need', 'We still need the signed PDF.', /signed PDF/i],
    ['A quotation', 'Would you send the quotation?', /quotation/i],
    ['A mind forward', 'Would you mind forwarding the quote?', /quote/i],
    ['A drivers', "Please attach a scan of the driver's license.", /licen[cs]e/i],
    ['A insurance cert', 'Please send the insurance certificate.', /insurance certificate/i],
    ['A tax form', 'Please send the tax form.', /tax form/i],
    ['A transfer', 'Could you attach the transfer confirmation?', /transfer confirmation/i],
    ['A signed of', 'Please send the signed PDF of the contract.', /signed PDF/i],
    ['A report', 'Could you share the report with me?', /report/i],
    ['A appreciate', "I'd appreciate it if you could send the contract.", /contract/i],
    ['A proof', 'Can you pass along the proof of payment?', /proof of payment/i],
    ['A slides', 'Could you send the slides from last week?', /slides/i],
    ['A id', 'Please send a copy of the ID.', /\bID\b/],
    ['A instead', 'No invoice on file. Please send the receipt instead.', /receipt/i],
    ['A he tuchal', 'תוכל בבקשה לשלוח לי את החשבונית?', /חשבונית/],
    ['A he tatzrifi', 'תצרפי את הלוגו בבקשה.', /לוגו/],
    ['A he nismach', 'נשמח לקבל את אישור ההעברה.', /אישור ההעברה/],
    ['A he efshar', 'אפשר לקבל את הצעת המחיר המעודכנת?', /הצעת המחיר/],
    ['A he taaviri', 'תעבירי לי את אישור ההעברה.', /אישור ההעברה/],
    ['A he shilchi', 'שלחי לי בבקשה את החוזה החתום.', /חוזה/],
    ['A he policy', 'אבקש לקבל את פוליסת הביטוח.', /ביטוח/],
    ['A he tzrichim', 'צריכים את חשבונית המס עבור התשלום.', /חשבונית/],
    ['A he darkon', 'אשמח לקבל צילום של הדרכון.', /דרכון/],
    ['A he mas', 'נא לשלוח את טופס המס.', /טופס המס/],
    ['A he brief', 'תשלח לי בבקשה את הבריף.', /בריף/],
    ['A he doch', 'תוכל לשלוח את הדו״ח?', /דו/],
    ['A he letzaref', 'אפשר לצרף את המצגת למייל?', /מצגת/]
  ];
  for (const [name, text, term] of positives) {
    const row = plan(text);
    const what = (row.intent.entities && row.intent.entities.what) || '';
    check(name + ' chips as A',
      row.show && row.intent.closeFamily === 'A' && row.intent.personalClose === 'follow-up-ask' && !row.intent.createWhenMissing && term.test(what),
      { type: row.intent.type, family: row.intent.closeFamily, what });
  }
  const quiet = [
    ['any chance', 'Any chance you can send the proposal?'],
    ['not sure which', 'Not sure which invoice — please send the March one.'],
    ['plural', 'Please send the invoices.'],
    ['or', 'Could you send the invoice or the receipt?'],
    ['both', 'Please send both the contract and the NDA.'],
    ['and', 'Could you send the proposal and the brief?'],
    ['he or', 'תשלח את החשבונית או את הקבלה.'],
    ['he vegam', 'בבקשה תשלח את הדוח וגם את הלוגו.'],
    ['he which', 'לא בטוח איזו חשבונית, תשלח אחת.'],
    ['vent', "The invoice is a mess, just venting."],
    ['shoot', 'Can you shoot me the logo?'],
    ['drop', 'Could you drop the logo on the email?'],
    ['bare policy', 'אשמח לקבל את הפוליסה.'],
    ['no verb', 'היי, אפשר את המצגת?'],
    ['he plural', 'תשלח את החשבוניות.'],
    ['promise', "I'll send the contract."],
    ['promise he', 'אשלח את החוזה.']
  ];
  for (const [name, text] of quiet) {
    const row = plan(text);
    check('A silence: ' + name, row.show === false && row.intent.closeFamily !== 'I', {
      type: row.intent.type, family: row.intent.closeFamily
    });
  }
  const vagueDocs = plan('Please send the documents when you can.');
  check('unclear documents are not family A and not a create',
    vagueDocs.intent.closeFamily !== 'A' && vagueDocs.intent.closeFamily !== 'I' && !vagueDocs.intent.createWhenMissing,
    { type: vagueDocs.intent.type, family: vagueDocs.intent.closeFamily });
  const dated = plan("I'll send the contract by Friday.");
  check('A does not steal a dated promise', dated.show && dated.intent.closeFamily === 'D' && dated.intent.personalClose === 'dated-commitment', dated.intent.closeFamily);
  const chase = plan('Please chase the vendor about the report.');
  check('A does not steal a chase', chase.show && chase.intent.closeFamily === 'F', chase.intent.closeFamily);
  const created = plan('Please draft the contract from our company template and send it to Dana.');
  check('A does not steal a template create', created.show && created.intent.closeFamily === 'I' && created.intent.createWhenMissing === true, created.intent.closeFamily);
  const found = plan('Kindly send the receipt.');
  const drafts = (found.process && found.process.steps || []).filter((step) => step.kind === 'gmailDraft');
  check('A is one draft carrying the one file',
    found.show && found.process && found.process.id === 'reply-track' && drafts.length === 1 &&
      drafts[0].params.includeAttachment === true && drafts[0].params.attachSource === 'found' &&
      drafts[0].params.driveFileName === 'Receipt-March.pdf' && drafts[0].params.driveFileId === 'file-1',
    drafts.map((step) => step.params));
  const lines = FlowActions.receiptWrittenLines([
    { response: { ok: true, written: 'Gmail draft · Kindly send the receipt.' } },
    { response: { ok: false, written: 'Gmail draft · should not appear' } },
    { response: { ok: true, written: 'Google Task · Send the receipt' } }
  ]);
  check('A receipt names the draft that landed',
    lines.length === 2 && lines[0].indexOf('Gmail draft') === 0 && lines[1].indexOf('Google Task') === 0,
    lines);
  check('A undo is the draft write', drafts[0].kind === 'gmailDraft', drafts[0].kind);
}

console.log('\n--- D: a clear clock is one calendar hold; a clear day is one task ---\n');
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
  const holds = [
    ['D tomorrow 15:00', 'tomorrow 15:00', '2026-09-18', 15],
    ['D he tomorrow 15:00', 'מחר ב-15:00', '2026-09-18', 15],
    ['D en let us meet', 'Let us meet Tuesday at 3pm.', '2026-09-22', 15],
    ['D en lets sync', "Let's sync Thursday at 10:00am.", '2026-09-24', 10],
    ['D he abbrev word hour', 'נקבע ליום ג בשעה שלוש.', '2026-09-22', 15],
    ['D he abbrev 24h', 'נקבע ליום ג׳ בשעה 15:00.', '2026-09-22', 15],
    ['D he morning word', 'נקבע ליום ג בשעה שלוש בבוקר.', '2026-09-22', 3],
    ['D en pencil', 'Pencil a slot Tuesday at 4pm.', '2026-09-22', 16]
  ];
  for (const [name, text, iso, hour] of holds) {
    const row = plan(text);
    const step = row.process && row.process.steps && row.process.steps[0];
    check(name + ' is one calendar hold',
      row.show && row.intent.closeFamily === 'D' && row.intent.personalClose === 'calendar-hold' &&
        row.intent.entities && row.intent.entities.dateIso === iso && row.intent.entities.hour === hour &&
        row.process && row.process.id === 'hold' && kinds(row.process).join(',') === 'calendar' &&
        step && step.params.requireTime === true && step.params.hour === hour && step.params.dateIso === iso,
      { family: row.intent.closeFamily, close: row.intent.personalClose, date: row.intent.entities && row.intent.entities.dateIso, hour: row.intent.entities && row.intent.entities.hour, proc: row.process && row.process.id, kinds: kinds(row.process) });
  }
  const tasks = [
    ['D en by Friday', "I'll send the contract by Friday.", '2026-09-18'],
    ['D en next Friday', "I'll send the redline next Friday.", '2026-09-25'],
    ['D he by Friday', 'אשלח את החוזה עד יום שישי.', '2026-09-18'],
    ['D he abbrev day', 'אעביר את הדוח עד יום ג.', '2026-09-22']
  ];
  for (const [name, text, iso] of tasks) {
    const row = plan(text);
    const step = row.process && row.process.steps && row.process.steps[0];
    check(name + ' is one task on that day',
      row.show && row.intent.closeFamily === 'D' && row.intent.personalClose === 'dated-commitment' &&
        row.intent.entities && row.intent.entities.dateIso === iso && row.intent.entities.hour == null &&
        row.process && row.process.id === 'log-it' && kinds(row.process).join(',') === 'googleTask' &&
        step && step.params.dateIso === iso,
      { family: row.intent.closeFamily, close: row.intent.personalClose, date: row.intent.entities && row.intent.entities.dateIso, hour: row.intent.entities && row.intent.entities.hour, proc: row.process && row.process.id, kinds: kinds(row.process) });
  }
  const quiet = [
    ['bare day', 'by Friday'],
    ['bare he day', 'עד יום שישי.'],
    ['next week span', "I'll send it next week."],
    ['he next week span', 'אשלח את זה בשבוע הבא.'],
    ['maybe day', 'maybe Tuesday'],
    ['maybe meet', "Maybe let's meet Tuesday at 3pm."],
    ['he hedge', 'נראה לי מחר.'],
    ['he hedge hold', 'נראה לי נקבע מחר ב-15:00.'],
    ['find a time', 'Can we find a time on Thursday?'],
    ['find a time he', 'בוא נמצא זמן ביום חמישי.'],
    ['ambiguous hour', "Let's meet Tuesday at 3."],
    ['past promise', "I'll send it by March 3, 2024."],
    ['two clocks', "Let's meet Tuesday at 3pm or Thursday at 4pm."],
    ['two clocks he', 'נקבע ליום ג בשעה שלוש או ליום ה בשעה ארבע.']
  ];
  for (const [name, text] of quiet) {
    const row = plan(text);
    check('D silence: ' + name, row.show === false, { type: row.intent.type, family: row.intent.closeFamily, hour: row.intent.entities && row.intent.entities.hour });
  }
  const bareDigit = plan('נקבע פגישה ביום שני בשעה 3 לסקירת החוזה וההסכם.');
  check('D a bare digit hour is not written as 03:00',
    bareDigit.intent.entities && bareDigit.intent.entities.hour == null && bareDigit.intent.personalClose !== 'calendar-hold',
    bareDigit.intent.entities);
  const cancel = plan('Please cancel the Friday, September 18 at 3pm sync.');
  check('D does not steal a G cancel',
    cancel.show && cancel.intent.closeFamily === 'G' && cancel.intent.personalClose === 'calendar-cancel' && cancel.process && cancel.process.id === 'clear-it',
    { family: cancel.intent.closeFamily, close: cancel.intent.personalClose });
  const moved = plan('Can we reschedule the Friday, September 18 at 3pm sync to Thursday, September 24 at 4pm?');
  check('D does not steal a G move',
    moved.show && moved.intent.closeFamily === 'G' && moved.intent.personalClose === 'calendar-move' && moved.process && moved.process.id === 'move-it',
    { family: moved.intent.closeFamily, close: moved.intent.personalClose });
  const announced = plan("Let's do a call Friday, September 18 at 3pm to review the contract.");
  check('D leaves a bare announcement on the schedule path',
    announced.show && announced.intent.personalClose !== 'calendar-hold' && announced.process && announced.process.id === 'schedule',
    { close: announced.intent.personalClose, proc: announced.process && announced.process.id });

  const lines = FlowActions.receiptWrittenLines([
    { response: { ok: true, written: 'Calendar · Let us meet Tuesday at 3pm. · Sep 22 15:00' } },
    { response: { ok: false, written: 'Calendar · should not appear · Sep 22 15:00' } },
    { response: { ok: true, written: 'Google Task · due Sep 18' } }
  ]);
  check('D receipt names the calendar hold and the task that landed',
    lines.length === 2 && lines[0].indexOf('Calendar') === 0 && lines[1].indexOf('Google Task') === 0,
    lines);
  const holdStep = plan("Let's meet Tuesday at 3pm.").process.steps[0];
  const taskStep = plan("I'll send the contract by Friday.").process.steps[0];
  check('D undo reverses the calendar write, not a second step', holdStep.kind === 'calendar' && holdStep.params.calendarOp == null, holdStep.kind);
  check('D undo reverses the task write', taskStep.kind === 'googleTask' && taskStep.params.dateIso === '2026-09-18', taskStep.params);

  const days = ['Tuesday', 'Thursday', 'tomorrow'];
  const clocks = ['3pm', '10:00am', '4pm'];
  const frames = [
    (day, clock) => `Let's meet ${day} at ${clock}.`,
    (day, clock) => `Let us sync ${day} at ${clock}.`,
    (day, clock) => `Can we meet ${day} at ${clock}?`
  ];
  const heDays = [
    ['שלישי', '2026-09-22'],
    ['חמישי', '2026-09-24'],
    ['שישי', '2026-09-18']
  ];
  let pos = 0, posFail = 0, neg = 0, negFail = 0;
  function failPos(text, row) {
    posFail++;
    if (posFail <= 8) console.log('FAIL D chip', text, row.intent && row.intent.closeFamily, row.intent && row.intent.personalClose, row.intent && row.intent.entities && row.intent.entities.hour);
  }
  function failNeg(text, row) {
    negFail++;
    if (negFail <= 8) console.log('FAIL D silence', text, row.intent && row.intent.type, row.intent && row.intent.closeFamily);
  }
  for (const day of days) {
    for (const clock of clocks) {
      for (const frame of frames) {
        const text = frame(day, clock);
        const row = plan(text);
        const hour = row.intent.entities && row.intent.entities.hour;
        if (row.show && row.intent.closeFamily === 'D' && row.intent.personalClose === 'calendar-hold' &&
            row.process && row.process.id === 'hold' && Number.isInteger(hour) && hour !== 3) pos++;
        else failPos(text, row);
      }
    }
  }
  for (const [day, iso] of heDays) {
    const text = `נקבע ליום ${day} בשעה 16:00.`;
    const row = plan(text);
    if (row.show && row.intent.personalClose === 'calendar-hold' && row.intent.entities.dateIso === iso && row.intent.entities.hour === 16 && row.process.id === 'hold') pos++;
    else failPos(text, row);
    const word = `ניפגש ביום ${day} בשעה ארבע.`;
    const spoken = plan(word);
    if (spoken.show && spoken.intent.personalClose === 'calendar-hold' && spoken.intent.entities.hour === 16 && spoken.process.id === 'hold') pos++;
    else failPos(word, spoken);
  }
  const things = ['contract', 'redline', 'invoice'];
  for (const thing of things) {
    const by = plan(`I'll send the ${thing} by Friday.`);
    if (by.show && by.intent.personalClose === 'dated-commitment' && by.intent.entities.dateIso === '2026-09-18' && by.process.id === 'log-it') pos++;
    else failPos(`I'll send the ${thing} by Friday.`, by);
    const next = plan(`I'll deliver the ${thing} next Friday.`);
    if (next.show && next.intent.personalClose === 'dated-commitment' && next.intent.entities.dateIso === '2026-09-25' && next.process.id === 'log-it') pos++;
    else failPos(`I'll deliver the ${thing} next Friday.`, next);
  }
  const heThings = ['החוזה', 'הדוח', 'החשבונית'];
  for (const thing of heThings) {
    const text = `אשלח את ${thing} עד יום שישי.`;
    const row = plan(text);
    if (row.show && row.intent.personalClose === 'dated-commitment' && row.intent.entities.dateIso === '2026-09-18' && row.process.id === 'log-it') pos++;
    else failPos(text, row);
  }
  const kills = [];
  for (const day of days) {
    kills.push(`Maybe let's meet ${day} at 3pm.`);
    kills.push(`Can we find a time on ${day}?`);
    kills.push(`Let's meet ${day} at 3.`);
  }
  kills.push("I'll send it next week.", 'נראה לי מחר.', 'עד יום שישי.', 'by Friday', "I'll send it by March 3, 2024.");
  kills.push('נקבע ליום ג בשעה שלוש או ליום ה בשעה ארבע.');
  for (const text of kills) {
    const row = plan(text);
    if (!row.show) neg++;
    else failNeg(text, row);
  }
  check('D generated timed meets and dated promises chip (' + pos + ')', posFail === 0 && pos >= 30, { pos, posFail });
  check('D generated hedges, find-a-time, ambiguous hours, and spans stay quiet (' + neg + ')', negFail === 0 && neg >= 12, { neg, negFail });
}

console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
