// Reply-with-facts corpus. Pass cases are one concrete Sheet/Doc fact.
// Kill cases are silence: summaries, rewrites, file sends, hedges, a second
// candidate, a quoted older ask. The judgment threshold is not involved.
//
// Run: node test/fact-reply-corpus.cjs

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = { module: undefined, console };
vm.createContext(sandbox);
for (const f of ['domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'fact-reply.js', 'intent.js', 'actions.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'core', f), 'utf8'), sandbox, { filename: f });
}
const FlowFactReply = vm.runInContext('FlowFactReply', sandbox);
const FlowIntent = vm.runInContext('FlowIntent', sandbox);
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

const BUDGET_CSV = 'Item,Value\nQ3 total,12400\nTax,80\n';
const HE_CSV = 'שדה,ערך\nסכום,4800\n';
const DOC = 'The Q3 total is $12,400.\n\nRenewal is discussed in the appendix.\n';

console.log('\n--- detect: one fact ask, HE + EN ---\n');

const passAsks = [
  ['EN what\'s the X in the sheet', "What's the Q3 total in the budget sheet?", 'en', 'sheet', 'Q3 total', 'budget'],
  ['EN could you tell me', 'Could you tell me the balance in the Acme receivables spreadsheet?', 'en', 'sheet', 'balance', 'Acme receivables'],
  ['EN how much', 'How much is the retainer in the pricing sheet?', 'en', 'sheet', 'retainer', 'pricing'],
  ['EN doc', "What's the invoice number in the signed contract doc?", 'en', 'doc', 'invoice number', 'signed contract'],
  ['HE amount in the sheet', 'מה הסכום בגיליון?', 'he', 'sheet', 'סכום', null],
  ['HE balance in a named sheet', 'מה היתרה בגיליון התקציב?', 'he', 'sheet', 'יתרה', 'תקציב'],
  ['HE fee in a doc', 'כמה העמלה במסמך ההסכם?', 'he', 'doc', 'עמלה', 'הסכם']
];
for (const [name, text, lang, kind, label, source] of passAsks) {
  const ask = FlowFactReply.detect(text);
  check(name + ' detects', !!ask && ask.lang === lang && ask.sourceKind === kind, ask);
  check(name + ' fact label', ask && ask.factLabel === label, ask && ask.factLabel);
  check(name + ' source', ask && ask.sourceName === source, ask && ask.sourceName);
}

console.log('\n--- detect: kill cases stay silent ---\n');

const kills = [
  ['summarize the sheet', 'Can you summarize the budget sheet?'],
  ['summarize the fact', "Please summarize the Q3 total in the budget sheet."],
  ['rewrite', 'Please rewrite this email so it sounds friendlier.'],
  ['draft a reply', "Please draft a reply with the amount from the budget sheet."],
  ['how can I help', 'How can I help with the numbers in the sheet?'],
  ['thoughts', 'Let me know your thoughts on the numbers in the sheet.'],
  ['send the file', 'Could you send me the spreadsheet?'],
  ['two facts', "What's the total and the date in the budget sheet?"],
  ['hedge', "Maybe you could check the amount in the sheet?"],
  ['negation', "Don't tell me the amount in the budget sheet."],
  ['vague', "What's the vibe in the doc?"],
  ['fyi', "FYI — what's the Q3 total in the budget sheet?"],
  ['no ask', 'Thanks for the update, talk soon.'],
  ['HE summarize', 'תסכם לי את הגיליון בבקשה.'],
  ['HE help', 'איך אפשר לעזור עם הסכום בגיליון?'],
  ['HE send file', 'תשלח לי את הגיליון.']
];
for (const [name, text] of kills) {
  check('silence: ' + name, FlowFactReply.detect(text) === null, FlowFactReply.detect(text));
}

{
  const quoted = [
    'Thanks for the note.',
    '',
    'On Tue, Sep 1, 2026 at 3:00 PM Dana wrote:',
    "What's the Q3 total in the budget sheet?"
  ].join('\n');
  check('a quoted older fact ask does not reopen', FlowFactReply.detect(quoted) === null, FlowFactReply.detect(quoted));
}
{
  const head = [
    "What's the Q3 total in the budget sheet?",
    '',
    'On Tue, Sep 1, 2026 at 3:00 PM Dana wrote:',
    "What's the old total in the archive sheet?"
  ].join('\n');
  const ask = FlowFactReply.detect(head);
  check('the new ask wins over the quoted one', ask && ask.factLabel === 'Q3 total' && ask.sourceName === 'budget', ask);
}

console.log('\n--- resolve: one cell or paragraph, else silence ---\n');

function src(kind, name, text) {
  return { id: 'f1', name, kind, text };
}

{
  const ask = FlowFactReply.detect("What's the Q3 total in the budget sheet?");
  const match = FlowFactReply.resolve(ask, [src('sheet', 'Acme Budget', BUDGET_CSV)]);
  check('one sheet cell matches', match && match.value === '12400' && match.kind === 'sheet', match);
  const intent = FlowFactReply.toIntent(ask, match);
  check('intent is a high-confidence fact, not a chat', intent && intent.type === 'fact' && intent.confidence === 'high' && !intent.personalClose, intent);
  check('the fact line is the cell, not the sheet', intent && intent.entities.factLine === 'Q3 total: 12400', intent && intent.entities);
  check('no file attach on the fact', intent && !intent.entities.requestedObjectTerm, intent && intent.entities);
  const process = FlowActions.planFor(intent, { threadUrl: 'x', hasThreadAttachment: true });
  check('one reply-fact process', process && process.id === 'reply-fact', process && process.id);
  check('one draft step', process && process.steps.length === 1 && process.steps[0].kind === 'gmailDraft', process && process.steps.map((s) => s.kind));
  const step = process.steps[0];
  check('Do It inserts the fact and does not attach', step.params.replyFact === true && step.params.factLine === 'Q3 total: 12400' && step.params.includeAttachment === false, step.params);
  check('chip would show', FlowIntent.shouldShowChip(intent) === true);
}

{
  const ask = FlowFactReply.detect('מה הסכום בגיליון?');
  const match = FlowFactReply.resolve(ask, [src('sheet', 'תקציב', HE_CSV)]);
  check('Hebrew sheet cell matches סכום', match && match.value === '4800', match);
}

{
  const ask = FlowFactReply.detect("What's the Q3 total in the budget doc?");
  const match = FlowFactReply.resolve(ask, [src('doc', 'Budget notes', DOC)]);
  check('one doc paragraph matches', match && match.value === '$12,400' && match.kind === 'doc', match);
}

{
  const ask = FlowFactReply.detect("What's the Q3 total in the budget sheet?");
  const twoRows = 'Item,Value\nQ3 total,12400\nQ3 total,900\n';
  check('two cells for the same fact stay silent', FlowFactReply.resolve(ask, [src('sheet', 'Budget', twoRows)]) === null);
  const twoParas = 'The Q3 total is $12,400.\n\nThe Q3 total is $900.\n';
  check('two paragraphs stay silent', FlowFactReply.resolve(ask, [src('doc', 'Budget', twoParas)]) === null);
  const twoNumbers = 'The Q3 total is $12,400 (was $11,000).';
  check('two numbers in one paragraph stay silent', FlowFactReply.resolve(ask, [src('doc', 'Budget', twoNumbers)]) === null);
  const other = src('sheet', 'Old Budget', BUDGET_CSV);
  const budget = src('sheet', 'Acme Budget', BUDGET_CSV);
  other.id = 'f2';
  check('two files that both match stay silent', FlowFactReply.resolve(ask, [other, budget]) === null);
  const unnamed = FlowFactReply.detect('מה הסכום בגיליון?');
  const second = src('sheet', 'אחר', HE_CSV);
  second.id = 'f3';
  check('two sheets and no file name stay silent', FlowFactReply.resolve(unnamed, [src('sheet', 'תקציב', HE_CSV), second]) === null);
  check('a truncated Drive list stays silent', FlowFactReply.resolve(ask, [budget], { truncated: true }) === null);
  check('the wrong kind of file stays silent', FlowFactReply.resolve(ask, [src('doc', 'Acme Budget', DOC)]) === null);
  check('a named source that is not in the list stays silent',
    FlowFactReply.resolve(ask, [src('sheet', 'Vacation photos', BUDGET_CSV)]) === null);
  const weak = 'Notes,Comment\nsee the long commentary,not a single cell\n';
  check('a sheet with no single cell stays silent', FlowFactReply.resolve(ask, [src('sheet', 'Budget', weak)]) === null);
}

{
  const stripped = FlowFactReply.stripFactLine('Hi Dana,\n\nQ3 total: 12400\n', 'Q3 total: 12400');
  check('undo removes only the fact line', stripped.removed === true && stripped.body.indexOf('12400') === -1 && /Hi Dana/.test(stripped.body), stripped);
  const missing = FlowFactReply.stripFactLine('Hi Dana,\n\nThanks.\n', 'Q3 total: 12400');
  check('a draft that no longer has the fact is already clear', missing.removed === false && missing.body.indexOf('Thanks') !== -1, missing);
}

console.log('\n--- policy: do not steal a stronger close, do not loosen the scorer ---\n');

{
  const meeting = "Let's do a call Friday, September 18 at 3pm to review the contract. What's the Q3 total in the budget sheet?";
  const intent = classify(meeting);
  const ask = FlowFactReply.detect(meeting);
  check('a meeting still classifies as an event', intent.type === FlowIntent.TYPES.SCHEDULED_EVENT, intent.type);
  check('the fact ask yields to the meeting', FlowFactReply.yieldsTo(intent) === true && FlowFactReply.ownsClose(ask, intent, true) === false);
  check('apply leaves the meeting in place', FlowFactReply.apply(intent, ask, { connected: true, match: { value: '1', label: 'Q3 total', kind: 'sheet' } }).type === 'event');
  check('a meeting is still eligible for the morning list', FlowFactReply.blocksInbox(intent, meeting) === false);
}

{
  const ask = FlowFactReply.detect("What's the Q3 total in the budget sheet?");
  const created = { type: 'decision', googleClose: { family: 'C', personalClose: 'create-missing' }, personalClose: 'create-missing' };
  check('a create-and-share close is not taken over by a fact', FlowFactReply.yieldsTo(created) === true && FlowFactReply.ownsClose(ask, created, true) === false);
  check('apply leaves the create-and-share close in place', FlowFactReply.apply(created, ask, { connected: true, match: { value: '12400', label: 'Q3 total', kind: 'sheet' } }) === created);
  check('a create-and-share close stays eligible for the morning list', FlowFactReply.blocksInbox(created, "What's the Q3 total in the budget sheet?") === false);
  const quiet = { type: null, googleSilence: true };
  check('Drive silence is not reopened as a fact reply', FlowFactReply.yieldsTo(quiet) === true && FlowFactReply.ownsClose(ask, quiet, true) === false);
  const waiting = { type: null, googleWait: { fileTerm: 'invoice' } };
  check('a Drive lookup still in flight is not a fact reply', FlowFactReply.yieldsTo(waiting) === true && FlowFactReply.ownsClose(ask, waiting, true) === false);
}

{
  const text = 'Could you tell me the balance in the Acme receivables spreadsheet?';
  const intent = classify(text);
  const ask = FlowFactReply.detect(text);
  check('the fact ask is not a scored fact type', !intent || intent.type !== 'fact', intent && intent.type);
  check('connected with no cell is silence, not a reply-track chip',
    FlowFactReply.apply(intent, ask, { connected: true, match: null }).type === null);
  const kept = FlowFactReply.apply(intent, ask, { connected: false, match: null });
  check('not connected leaves the existing classification alone', kept === intent || (kept && kept.type === intent.type), kept && kept.type);
  const match = { value: '8800', label: 'balance', kind: 'sheet', fileName: 'Acme Receivables' };
  const next = FlowFactReply.apply(intent, ask, { connected: true, match });
  check('connected with one cell becomes reply-fact', next.type === 'fact' && next.entities.factValue === '8800', next);
  const process = FlowActions.planFor(next, {});
  check('that plan is not reply-track and has no task', process.id === 'reply-fact' && process.steps.length === 1, process && process.steps.map((s) => s.id));
}

{
  const quiet = classify('Just checking in, hope you are well.');
  check('a weak note is not a fact chip', !quiet || quiet.type !== 'fact', quiet && quiet.type);
  check('classify does not invent a fact chip for a vague doc ask', classify("What's the vibe in the doc?").type !== 'fact');
  check('detect does not fire on that weak note', FlowFactReply.detect('Just checking in, hope you are well.') === null);
  const askText = 'Could you tell me the balance in the Acme receivables spreadsheet?';
  check('a fact ask does not become a morning card', FlowFactReply.blocksInbox(classify(askText), askText) === true);
}

console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
