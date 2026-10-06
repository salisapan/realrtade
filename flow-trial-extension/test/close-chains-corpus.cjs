'use strict';
// One close chain, many task types. An invoice is not a special case: the same function derives the
// requirement, reads the sources the host already fetched, prepares a draft when one honest find
// exists, and says what is missing when every connected source was checked. A loop closes only on
// real completion. Nothing is sent. A template is not a find. An invoicing system is not a source.
// Run: node test/close-chains-corpus.cjs
const fs = require('fs');
const path = require('path');
const { FlowCloseChains: C } = require('../core/close-chains.js');
const { FlowFollowUp: F } = require('../core/follow-up.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const NOW = Date.parse('2026-10-05T09:00:00Z');
const ROOT = path.join(__dirname, '..');

function ev(over) {
  const base = {
    driveScope: 'account',
    connected: { drive: true, thread: true, gmail: false, outlook: false, docs: false, sheets: false, calendar: false },
    driveFiles: [],
    threadFiles: []
  };
  const extra = over || {};
  return Object.assign({}, base, extra, {
    connected: Object.assign({}, base.connected, extra.connected || {})
  });
}

function go(text, evidence, extra) {
  return C.resolve(Object.assign({ text, origin: 'gmail', now: NOW, evidence: evidence == null ? ev() : evidence }, extra || {}));
}

function shape(name, r) {
  check(name + ' never sends', r && r.sends === false, r && r.sends);
  check(name + ' resolver does not create', r && r.creates === false, r && r.creates);
}

function file(id, name) { return { id, name, mimeType: 'application/pdf' }; }

console.log('--- a file requirement: found, missing, conflict, unverified ---');
const invoice = 'Please send the invoice by Thursday.';
const found = go(invoice, ev({ driveFiles: [file('f1', 'Invoice 204.pdf')] }));
shape('invoice found', found);
check('one invoice in Drive prepares a draft and does not close', found.move === 'prepare' && found.close === false && found.show === true && found.hit && found.hit.file && found.hit.file.id === 'f1' && found.requirement.kind === 'file' && found.requirement.object === 'invoice', found);

const missing = go(invoice, ev());
shape('invoice missing', missing);
check('no invoice is a needs-you card, not a close', missing.move === 'needs-you' && missing.close === false && missing.show === true && missing.reason === 'not-found', missing.move);
check('the card names the invoice, Drive, this thread, and the sources not connected', missing.card && /invoice/.test(missing.card.line) && /Google Drive/.test(missing.card.searched) && /this thread/.test(missing.card.searched) && /Gmail attachments/.test(missing.card.skipped), missing.card);
check('the holding reply does not claim a file is attached', missing.holding && missing.holding.claimsFile === false && missing.holding.text === "I'll send it by Thursday." && !/attach/i.test(missing.holding.text), missing.holding);
check('the holding reply opens a promise, not a close', missing.promise && missing.promise.ask && missing.promise.ask.direction === 'mine' && missing.promise.ask.subtype === 'file', missing.promise);

const onlyTemplate = go(invoice, ev({ driveFiles: [file('t1', 'Invoice template.docx')] }));
shape('template', onlyTemplate);
check('a template is not a found invoice', onlyTemplate.move === 'needs-you' && onlyTemplate.close === false && !onlyTemplate.hit, onlyTemplate.move);

const conflict = go(invoice, ev({ driveFiles: [file('a', 'Invoice A.pdf'), file('b', 'Invoice B.pdf')] }));
shape('conflict', conflict);
check('two invoices stay silent and do not close', conflict.move === 'silence' && conflict.reason === 'conflict' && conflict.close === false && conflict.show === false, conflict);

const unchecked = go(invoice, ev({ driveFiles: null }));
shape('unverified', unchecked);
check('a connected source that was not checked is not "not found"', unchecked.move === 'silence' && unchecked.reason === 'unverified' && unchecked.show === false && unchecked.close === false, unchecked);

const fromMail = go(invoice, ev({
  connected: { gmail: true },
  gmailFiles: [file('g1', 'Invoice 204.pdf')]
}));
shape('gmail file', fromMail);
check('a file already in Gmail prepares a draft and does not close the ask', fromMail.move === 'prepare' && fromMail.close === false && fromMail.hit && fromMail.hit.source === 'gmail-mail', fromMail.hit);

const sameTwice = go(invoice, ev({
  connected: { gmail: true },
  driveFiles: [file('f1', 'Invoice 204.pdf')],
  gmailFiles: [file('g1', 'Invoice 204.pdf')]
}));
check('the same invoice in two sources is one find', sameTwice.move === 'prepare' && sameTwice.reason !== 'conflict' && sameTwice.close === false, sameTwice.reason);

const billed = go(invoice, ev({ invoicing: [file('b1', 'Invoice 204.pdf')], billing: [file('b2', 'Invoice 204.pdf')] }));
check('an invoicing system is not searched and not a find', billed.move === 'needs-you' && billed.close === false && !billed.hit, billed.move);

console.log('--- watch, then the file appears, then a real send ---');
const waiting = { requirement: missing.requirement };
const still = go(invoice, ev(), { watching: waiting });
shape('still watching', still);
check('while the file is still missing the chain keeps watching and does not close', still.move === 'watch' && still.close === false && still.card && still.holding, still.move);
const later = go(invoice, ev({ driveFiles: [file('f2', 'Invoice 204.pdf')] }), { watching: waiting });
shape('file appeared', later);
check('when the invoice appears the chain resumes at prepare and still does not close', later.move === 'prepare' && later.close === false && later.hit && later.hit.file.name === 'Invoice 204.pdf', later.move);

const sent = go(invoice, ev(), { completion: { sent: { direction: 'out', isDraft: false, text: 'Invoice attached.', attachments: [{ filename: 'Invoice 204.pdf' }] } } });
shape('sent file', sent);
check('a sent message that carries the invoice closes', sent.move === 'close' && sent.close && sent.close.reason === 'sent-with-file' && sent.sends === false, sent.close);
const drafted = go(invoice, ev(), { completion: { sent: { direction: 'out', isDraft: true, text: 'Invoice attached.', attachments: [{ filename: 'Invoice 204.pdf' }] } } });
check('a draft with the invoice attached does not close', drafted.close === false && drafted.move !== 'close', drafted.move);
const bare = go(invoice, ev(), { completion: { sent: { direction: 'out', isDraft: false, text: "I'll send it by Thursday.", attachments: [] } } });
check('a sent holding reply with no file does not close', bare.close === false && bare.move !== 'close', bare.move);

console.log('--- contract, price quote, signed form: the same chain ---');
[
  ['contract', 'Please send the contract.', 'Contract - Dana.pdf', 'contract'],
  ['price quote', 'Please send the price quote.', 'Price quote 2026.pdf', 'quote'],
  ['signed form', 'Please send the signed form.', 'Signed form.pdf', 'signed-copy']
].forEach(([label, text, name, objectId]) => {
  const hit = go(text, ev({ driveFiles: [file('x', name)] }));
  shape(label + ' found', hit);
  check(label + ' found prepares and does not close', hit.move === 'prepare' && hit.close === false && hit.requirement.object === objectId, { move: hit.move, object: hit.requirement && hit.requirement.object });
  const none = go(text, ev());
  shape(label + ' missing', none);
  check(label + ' missing is needs-you and does not close', none.move === 'needs-you' && none.close === false && none.card && none.card.line.indexOf(hit.requirement.label) >= 0, none.card && none.card.line);
});

console.log('--- a date: prepare a hold, close only when they accept ---');
const meet = 'Can we meet Thursday at 10am?';
const openCal = go(meet, ev({ connected: { calendar: true }, events: [] }));
shape('schedule', openCal);
check('a named day and a clock with an empty calendar prepares a hold and does not close', openCal.move === 'prepare' && openCal.reason === 'schedule' && openCal.close === false && openCal.hit && openCal.hit.create === true && openCal.requirement.iso === '2026-10-08' && openCal.creates === false, { iso: openCal.requirement && openCal.requirement.iso, move: openCal.move, reason: openCal.reason });
const held = go(meet, ev({ connected: { calendar: true }, events: [{ id: 'e1', startIso: '2026-10-08T10:00:00Z', accepted: false, status: 'confirmed' }] }));
check('an event that exists and is not accepted does not close', held.move === 'prepare' && held.close === false && held.hit && held.hit.accepted === false && held.reason === 'found', held);
const accepted = go(meet, ev({ connected: { calendar: true }, events: [] }), { completion: { event: { id: 'e1', accepted: true, status: 'confirmed' } } });
check('an accepted event closes', accepted.move === 'close' && accepted.close && accepted.close.reason === 'accepted' && accepted.sends === false, accepted.close);
const unaccepted = go(meet, ev({ connected: { calendar: true }, events: [] }), { completion: { event: { id: 'e1', accepted: false, status: 'confirmed' } } });
check('creating or holding an event does not close', unaccepted.close === false, unaccepted.move);
const noCal = go(meet, ev());
check('a calendar that is not connected is not "no meeting"', noCal.reason === 'unverified' && noCal.show === false && noCal.close === false, noCal.reason);

console.log('--- a fact, an approval, an answer ---');
const factText = "What's the Q3 total in the budget sheet?";
const factHit = go(factText, ev({ connected: { sheets: true }, facts: [{ value: '4200', source: 'sheets', name: 'Budget', id: 'cell1' }] }));
shape('fact found', factHit);
check('one fact prepares a draft and does not close', factHit.move === 'prepare' && factHit.close === false && factHit.requirement.kind === 'fact' && factHit.requirement.value === '4200', factHit.requirement);
const factTwo = go(factText, ev({ connected: { sheets: true }, facts: [{ value: '4200', source: 'sheets' }, { value: '4300', source: 'sheets' }] }));
check('two facts stay silent', factTwo.reason === 'conflict' && factTwo.close === false, factTwo.reason);
const factNone = go(factText, ev({ connected: { sheets: true }, facts: [] }));
check('no fact is needs-you', factNone.move === 'needs-you' && factNone.close === false && factNone.card && /Q3 total/.test(factNone.card.line), factNone.card && factNone.card.line);
const factSent = go(factText, ev({ connected: { sheets: true }, facts: [] }), { completion: { value: '4200', sent: { direction: 'out', isDraft: false, text: 'The Q3 total is 4200.' } } });
check('a sent reply that carries the fact closes', factSent.move === 'close' && factSent.close && factSent.close.reason === 'sent-fact', factSent.close);
const factHeld = go(factText, ev({ connected: { sheets: true }, facts: [] }), { completion: { value: '4200', sent: { direction: 'out', isDraft: false, text: "I'll send it by Thursday. The figure is 4200." } } });
check('a holding line that mentions the fact does not close', factHeld.close === false, factHeld.move);
const factUnchecked = go(factText, ev({ connected: { sheets: true }, facts: null }));
check('a sheet that was not checked is not "no fact"', factUnchecked.reason === 'unverified' && factUnchecked.close === false, factUnchecked.reason);

const approve = 'Please approve the budget.';
const approveHit = go(approve, ev({ connected: { gmail: true }, replies: [{ source: 'gmail', isDraft: false, text: 'Yes, approved' }] }));
shape('approval found', approveHit);
check('a sent approval in the mailbox prepares and does not itself close', approveHit.move === 'prepare' && approveHit.close === false && approveHit.requirement.kind === 'approval', approveHit.move);
const approveDone = go(approve, ev({ connected: { gmail: true }, replies: [] }), { completion: { sent: { direction: 'out', isDraft: false, text: 'Yes, approved' } } });
check('an approval that was actually sent closes', approveDone.move === 'close' && approveDone.close && approveDone.close.reason === 'approved', approveDone.close);
const approveDraft = go(approve, ev({ connected: { gmail: true }, replies: [] }), { completion: { sent: { direction: 'out', isDraft: true, text: 'Yes, approved' } } });
check('an approval draft does not close', approveDraft.close === false, approveDraft.move);
const approveNone = go(approve, ev({ connected: { gmail: true }, replies: [{ source: 'gmail', isDraft: false, text: 'Got it, thanks' }] }));
check('a reply that is not an approval is needs-you', approveNone.move === 'needs-you' && approveNone.close === false, approveNone.move);

const answer = 'Please confirm who will own the rollout.';
const answerHit = go(answer, ev({ connected: { outlook: true }, replies: [{ source: 'outlook', isDraft: false, text: 'Dana will own the rollout.' }] }));
shape('answer found', answerHit);
check('one real answer prepares and does not close', answerHit.move === 'prepare' && answerHit.close === false && answerHit.requirement.kind === 'answer', answerHit.move);
const answerSent = go(answer, ev({ connected: { outlook: true }, replies: [] }), { completion: { sent: { direction: 'out', isDraft: false, text: 'Dana will own the rollout.' } } });
check('a sent answer closes', answerSent.move === 'close' && answerSent.close && answerSent.close.reason === 'sent-answer', answerSent.close);
const answerHold = go(answer, ev({ connected: { outlook: true }, replies: [] }), { completion: { sent: { direction: 'out', isDraft: false, text: "I'll send it by Thursday." } } });
check('a holding reply is not the answer', answerHold.close === false, answerHold.move);
const answerShort = go(answer, ev({ connected: { outlook: true }, replies: [] }), { completion: { sent: { direction: 'out', isDraft: false, text: 'Yes' } } });
check('a short reply does not close an answer loop', answerShort.close === false, answerShort.move);
const answerNone = go(answer, ev({ connected: { outlook: true }, replies: [] }));
check('no answer is needs-you', answerNone.move === 'needs-you' && answerNone.close === false && answerNone.card && /answer/.test(answerNone.card.line), answerNone.move);

console.log('--- Hebrew, the same five steps ---');
const heInvoice = go('בבקשה תשלח לי את החשבונית', ev());
check('Hebrew invoice missing is needs-you', heInvoice.requirement && heInvoice.requirement.object === 'invoice' && heInvoice.requirement.lang === 'he' && heInvoice.move === 'needs-you' && heInvoice.close === false && heInvoice.card && /חשבונית/.test(heInvoice.card.line) && /לא סגרתי/.test(heInvoice.card.why), heInvoice.card && heInvoice.card.line);
const heInvoiceFound = go('בבקשה תשלח לי את החשבונית', ev({ driveFiles: [file('hf', 'חשבונית 204.pdf')] }));
check('Hebrew invoice found prepares and does not close', heInvoiceFound.move === 'prepare' && heInvoiceFound.close === false, heInvoiceFound.move);
[
  ['Hebrew contract', 'בבקשה תשלח את החוזה', 'contract'],
  ['Hebrew price quote', 'בבקשה תשלח את הצעת המחיר', 'quote'],
  ['Hebrew signed form', 'בבקשה תשלח טופס חתום', 'signed-copy']
].forEach(([name, text, objectId]) => {
  const r = go(text, ev());
  check(name + ' is a file requirement and needs you', r.requirement && r.requirement.object === objectId && r.move === 'needs-you' && r.close === false, r.requirement && r.requirement.object);
});
const heMeet = go('אפשר לקבוע פגישה ביום חמישי בשעה 10', ev({ connected: { calendar: true }, events: [] }));
check('Hebrew meeting prepares a hold on Thursday and does not close', heMeet.requirement && heMeet.requirement.kind === 'date' && heMeet.requirement.iso === '2026-10-08' && heMeet.move === 'prepare' && heMeet.close === false && heMeet.hit && heMeet.hit.create === true, { iso: heMeet.requirement && heMeet.requirement.iso, move: heMeet.move });
const heFact = go('מה הסכום בגיליון התקציב', ev({ connected: { sheets: true }, facts: [{ value: '3850', source: 'sheets' }] }));
check('Hebrew fact prepares and does not close', heFact.move === 'prepare' && heFact.close === false && heFact.requirement.kind === 'fact' && heFact.requirement.value === '3850', heFact.requirement);
const heApprove = go('נא לאשר את התקציב', ev({ connected: { gmail: true }, replies: [] }));
check('Hebrew approval missing is needs-you', heApprove.requirement && heApprove.requirement.kind === 'approval' && heApprove.move === 'needs-you' && heApprove.close === false, heApprove.requirement && heApprove.requirement.kind);
const heAnswer = go('תעדכן מי מטפל בחשבון הזה', ev({ connected: { gmail: true }, replies: [] }));
check('Hebrew answer missing is needs-you', heAnswer.requirement && heAnswer.requirement.kind === 'answer' && heAnswer.move === 'needs-you' && heAnswer.close === false, heAnswer.requirement && heAnswer.requirement.kind);

console.log('--- silence, quote cutting, both origins, the holding reply itself ---');
const chatter = go('Thanks for the update yesterday, hope you are well.');
check('no requirement stays silent and does not close', chatter.reason === 'no-requirement' && chatter.close === false && chatter.show === false, chatter.reason);
const both = go('Please send the invoice and the contract.');
check('two files are unclear, not a guess', both.reason === 'unclear' && both.close === false && both.show === false, both.reason);
const quoted = go("Please send the invoice\n\n---------- הודעה שהועברה ----------\nPlease send the contract", ev({ driveFiles: [file('f1', 'Invoice 204.pdf')] }));
check('a forwarded contract is not the requirement', quoted.requirement && quoted.requirement.object === 'invoice' && quoted.move === 'prepare' && quoted.close === false, quoted.requirement && quoted.requirement.object);
const fromOutlook = C.resolve({ text: invoice, origin: 'outlook', now: NOW, evidence: ev() });
check('the same missing invoice from Outlook is the same needs-you card', fromOutlook.move === 'needs-you' && fromOutlook.close === false && fromOutlook.card.line === missing.card.line && fromOutlook.sends === false, fromOutlook.move);

const holdEn = C.holdingText({ lang: 'en' }, 'Thursday');
const holdHe = C.holdingText({ lang: 'he' }, 'יום חמישי');
const watch = { kind: 'reply', status: 'waiting', direction: 'theirs' };
const enReply = F.classifyReply(holdEn, watch, { now: NOW });
const heReply = F.classifyReply(holdHe, watch, { now: NOW });
check('the English holding reply does not close a loop', enReply.outcome !== 'closed' && enReply.outcome !== 'paid', enReply.outcome);
check('the Hebrew holding reply does not close a loop', heReply.outcome !== 'closed' && heReply.outcome !== 'paid', heReply.outcome);

console.log('--- the host uses the one resolver and does not invent an invoice path ---');
const chainSrc = fs.readFileSync(path.join(ROOT, 'core/close-chains.js'), 'utf8');
const gmailSrc = fs.readFileSync(path.join(ROOT, 'src/content-gmail.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const popup = fs.readFileSync(path.join(ROOT, 'popup/popup.html'), 'utf8');
const scripts = manifest.content_scripts[0].js;
check('the resolver has no per-object branch', !/===\s*'invoice'|kind === 'invoice'|id === 'invoice'|iCount|Green Invoice/.test(chainSrc));
check('the Gmail card calls the shared resolver', gmailSrc.indexOf('FlowCloseChains.resolve') >= 0 && gmailSrc.indexOf('injectNeedsYou') >= 0);
const needsYouSrc = gmailSrc.slice(gmailSrc.indexOf('function injectNeedsYou'), gmailSrc.indexOf('function injectCreateCard'));
check('the needs-you chip drafts a holding reply and does not say Do It', /Draft a holding reply/.test(needsYouSrc) && /טיוטת תשובת ביניים/.test(needsYouSrc) && !/flow-chip-do-label', 'Do It'/.test(needsYouSrc) && /type: 'flow:follow-draft'/.test(gmailSrc) && /Draft ready\. Not sent\./.test(gmailSrc));
check('the close chip stays Do It', /function injectChip[\s\S]*flow-chip-do-label', 'Do It'/.test(gmailSrc));
check('manifest loads the shared text cut and the close chain', scripts.indexOf('core/source-text.js') > scripts.indexOf('core/judgment.js') && scripts.indexOf('core/close-chains.js') > scripts.indexOf('core/resolution.js'));
check('popup loads both', popup.indexOf('core/source-text.js') > popup.indexOf('core/judgment.js') && popup.indexOf('core/close-chains.js') > popup.indexOf('core/file-attach.js'));

console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
