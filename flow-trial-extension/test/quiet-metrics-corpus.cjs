// Regression corpus for core/quiet-metrics.js — trusted closes per week
// and silence-by-reason. The fold is pure. A second sandbox checks that
// the chip path's existing silence still stays silent and now carries a
// coarse reason code. No mail body is stored.
//
// Run: node test/quiet-metrics-corpus.cjs

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = { module: undefined, console };
vm.createContext(sandbox);
for (const f of ['pmf-metrics.js', 'close-quality-metrics.js', 'quiet-metrics.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'core', f), 'utf8'), sandbox, { filename: f });
}
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'receipt-copy.js'), 'utf8'), sandbox, { filename: 'receipt-copy.js' });
const FlowQuietMetrics = vm.runInContext('FlowQuietMetrics', sandbox);
const FlowPmfMetrics = vm.runInContext('FlowPmfMetrics', sandbox);
const FlowCloseQuality = vm.runInContext('FlowCloseQuality', sandbox);
const FlowReceipt = vm.runInContext('FlowReceipt', sandbox);

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const NOW = new Date(2026, 8, 28, 15, 0, 0);
const THIS_TS = NOW.getTime();
const LAST_TS = THIS_TS - (8 * 24 * 60 * 60 * 1000);

console.log('--- week key matches the habit metric ---\n');
{
  check('weekKey agrees with FlowPmfMetrics for this instant',
    FlowQuietMetrics.weekKey(NOW) === FlowPmfMetrics.weekKey(NOW),
    { quiet: FlowQuietMetrics.weekKey(NOW), pmf: FlowPmfMetrics.weekKey(NOW) });
  check('a date eight days earlier is a different bucket',
    FlowQuietMetrics.weekKey(new Date(LAST_TS)) !== FlowQuietMetrics.weekKey(NOW));
  const midnight = new Date(2026, 8, 12);
  check('weekKey agrees with FlowPmfMetrics on a local midnight',
    FlowQuietMetrics.weekKey(midnight) === FlowPmfMetrics.weekKey(midnight),
    { quiet: FlowQuietMetrics.weekKey(midnight), pmf: FlowPmfMetrics.weekKey(midnight) });
}

console.log('\n--- trusted close is Handled and not Undone ---\n');
{
  check('Handled. is the full write this count uses',
    FlowReceipt.confirmation({ succeeded: 2, total: 2, priorCloses: 9 }).full === true &&
    FlowReceipt.confirmation({ succeeded: 2, total: 2, priorCloses: 9 }).status === 'Handled.' &&
    FlowCloseQuality.isFullWrite(2, 2) === true);
  check('Partly handled is not a full write',
    FlowReceipt.confirmation({ succeeded: 1, total: 2, priorCloses: 0 }).full === false &&
    FlowReceipt.confirmation({ succeeded: 1, total: 2 }).status === 'Partly handled.' &&
    FlowCloseQuality.isFullWrite(2, 1) === false);

  const start = FlowQuietMetrics.emptyState();
  const frozen = JSON.stringify(start);
  const one = FlowQuietMetrics.noteHandled(start, freeGmailGoogle({ messageId: 'm1' }));
  check('noteHandled does not mutate the state it was given', JSON.stringify(start) === frozen);
  const week = FlowQuietMetrics.trustedWeek(one, THIS_TS);
  check('one full write this week is one trusted close and zero Undo',
    week.trusted === 1 && week.handled === 1 && week.undone === 0 && week.undoRate === 0, week);

  const again = FlowQuietMetrics.noteHandled(one, freeGmailGoogle({ messageId: 'm1', ts: THIS_TS + 1 }));
  check('the same message is not a second trusted close',
    FlowQuietMetrics.trustedWeek(again, THIS_TS).handled === 1);

  const undone = FlowQuietMetrics.noteUndo(again, { messageId: 'm1' });
  const afterUndo = FlowQuietMetrics.trustedWeek(undone, THIS_TS);
  check('Undo removes it from trusted and keeps it in handled',
    afterUndo.trusted === 0 && afterUndo.handled === 1 && afterUndo.undone === 1 && afterUndo.undoRate === 1, afterUndo);
  const undoneAgain = FlowQuietMetrics.noteUndo(undone, { messageId: 'm1' });
  check('a second Undo does not count twice',
    FlowQuietMetrics.trustedWeek(undoneAgain, THIS_TS).undone === 1);

  const partialUndo = FlowQuietMetrics.noteUndo(start, { messageId: 'never-handled' });
  check('Undo of a write that was not Handled is not a trusted-close event',
    FlowQuietMetrics.trustedWeek(partialUndo, THIS_TS).handled === 0 &&
    FlowQuietMetrics.trustedWeek(partialUndo, THIS_TS).undoRate === null);

  const older = FlowQuietMetrics.noteHandled(start, freeGmailGoogle({ messageId: 'old', ts: LAST_TS }));
  const thisWeek = FlowQuietMetrics.trustedWeek(older, THIS_TS);
  const lastWeek = FlowQuietMetrics.trustedWeek(older, LAST_TS);
  check('a full write last week is not this week\'s trusted count',
    thisWeek.trusted === 0 && lastWeek.trusted === 1, { thisWeek, lastWeek });
  const undoLater = FlowQuietMetrics.noteUndo(older, { messageId: 'old' });
  check('an Undo this week corrects the week of the write',
    FlowQuietMetrics.trustedWeek(undoLater, LAST_TS).trusted === 0 &&
    FlowQuietMetrics.trustedWeek(undoLater, LAST_TS).undone === 1 &&
    FlowQuietMetrics.trustedWeek(undoLater, THIS_TS).undone === 0);

  const blank = FlowQuietMetrics.noteHandled(start, freeGmailGoogle({ messageId: '  ' }));
  const body = FlowQuietMetrics.noteHandled(start, freeGmailGoogle({ messageId: 'Please send the invoice to dana@x.com' }));
  check('a blank id or a body-shaped id is not stored',
    blank.handled.length === 0 && body.handled.length === 0 &&
    JSON.stringify(body).indexOf('dana@') === -1);
}

// A Free Gmail→Google Do It that the receipt called Handled. The same
// full-write test the chip already uses, plus the six Google writers.
// Anything else must not move this week's trusted count.
function freeGmailGoogle(over) {
  over = over || {};
  const kinds = over.kinds != null ? over.kinds : ['googleTask'];
  const proposed = over.proposed != null ? over.proposed : (Array.isArray(kinds) && kinds.length ? kinds.length : 1);
  const succeeded = over.succeeded != null ? over.succeeded : proposed;
  const total = over.total != null ? over.total : proposed;
  const receipt = FlowReceipt.confirmation({
    succeeded: succeeded,
    total: total,
    priorCloses: 4,
    lang: over.lang
  });
  const fullWrite = FlowCloseQuality.isFullWrite(proposed, succeeded);
  const event = {
    messageId: over.messageId || 'gg1',
    ts: over.ts != null ? over.ts : THIS_TS,
    app: over.app != null ? over.app : 'gmail',
    product: over.product != null ? over.product : 'free',
    proposed: proposed,
    succeeded: succeeded,
    kinds: kinds,
    receiptFull: over.receiptFull != null ? over.receiptFull : (receipt.full === true && fullWrite),
    receiptStatus: over.receiptStatus != null ? over.receiptStatus : receipt.status
  };
  return event;
}

console.log('\n--- trusted closes/week is a Free Gmail→Google handled receipt ---\n');
{
  const task = freeGmailGoogle({ messageId: 'gg-task' });
  check('the English receipt for a full Google write says Handled.',
    task.receiptFull === true && task.receiptStatus === 'Handled.' &&
    FlowReceipt.confirmation({ succeeded: 1, total: 1, priorCloses: 4 }).status === 'Handled.');
  const he = freeGmailGoogle({ messageId: 'gg-he', lang: 'he', kinds: ['calendar'] });
  check('the Hebrew receipt for that same full write says טופל.',
    he.receiptFull === true && he.receiptStatus === 'טופל.');

  const start = FlowQuietMetrics.emptyState();
  const frozen = JSON.stringify(start);
  const one = FlowQuietMetrics.noteHandled(start, task);
  check('a Free Gmail Google Task Do It with Handled does not mutate the prior state',
    JSON.stringify(start) === frozen);
  const week = FlowQuietMetrics.trustedWeek(one, THIS_TS);
  check('that close is one trusted close this week',
    week.trusted === 1 && week.handled === 1 && week.undone === 0 && week.path === 'free-gmail-google', week);
  check('the week store keeps the id, not the step kind or the receipt words',
    JSON.stringify(one).indexOf('googleTask') === -1 && JSON.stringify(one).indexOf('Handled') === -1);

  const chain = freeGmailGoogle({
    messageId: 'gg-chain',
    proposed: 3,
    succeeded: 3,
    kinds: ['driveDoc', 'calendar', 'gmailDraft']
  });
  const three = FlowQuietMetrics.noteHandled(one, chain);
  check('a Doc, Calendar, and draft chain is one close, not three',
    FlowQuietMetrics.trustedWeek(three, THIS_TS).trusted === 2, FlowQuietMetrics.trustedWeek(three, THIS_TS));

  const sheet = FlowQuietMetrics.noteHandled(three, freeGmailGoogle({
    messageId: 'gg-sheet', kinds: ['driveSheet', 'gmailDraft']
  }));
  const file = FlowQuietMetrics.noteHandled(sheet, freeGmailGoogle({
    messageId: 'gg-file', kinds: ['driveFile', 'gmailDraft']
  }));
  check('Sheet and Drive-file closes count on the same week',
    FlowQuietMetrics.trustedWeek(file, THIS_TS).trusted === 4);

  const hebrew = FlowQuietMetrics.noteHandled(file, he);
  check('a Hebrew Handled receipt counts the same way',
    FlowQuietMetrics.trustedWeek(hebrew, THIS_TS).trusted === 5);

  const again = FlowQuietMetrics.noteHandled(hebrew, freeGmailGoogle({ messageId: 'gg-task', ts: THIS_TS + 5 }));
  check('the same Gmail message is not a second trusted close',
    FlowQuietMetrics.trustedWeek(again, THIS_TS).handled === 5);

  const undone = FlowQuietMetrics.noteUndo(again, { messageId: 'gg-task' });
  const afterUndo = FlowQuietMetrics.trustedWeek(undone, THIS_TS);
  check('Undo of that receipt removes it from trusted and does not add a close',
    afterUndo.trusted === 4 && afterUndo.handled === 5 && afterUndo.undone === 1, afterUndo);
  const undoneAgain = FlowQuietMetrics.noteUndo(undone, { messageId: 'gg-task' });
  check('a second Undo does not inflate the Undo count',
    FlowQuietMetrics.trustedWeek(undoneAgain, THIS_TS).undone === 1 &&
    FlowQuietMetrics.trustedWeek(undoneAgain, THIS_TS).trusted === 4);

  const partialEvent = freeGmailGoogle({
    messageId: 'gg-partial', proposed: 2, succeeded: 1, total: 2, kinds: ['googleTask', 'gmailDraft']
  });
  const partial = FlowQuietMetrics.noteHandled(start, partialEvent);
  check('Partly handled is not a trusted close',
    partialEvent.receiptStatus === 'Partly handled.' && partialEvent.receiptFull === false &&
    FlowQuietMetrics.trustedWeek(partial, THIS_TS).trusted === 0 &&
    FlowQuietMetrics.trustedWeek(partial, THIS_TS).handled === 0, partialEvent.receiptStatus);

  const shortened = freeGmailGoogle({
    messageId: 'gg-short', proposed: 2, succeeded: 1, total: 1, kinds: ['calendar']
  });
  const shortNoted = FlowQuietMetrics.noteHandled(start, shortened);
  check('Handled on a shortened chain is not a full write and does not count',
    FlowReceipt.confirmation({ succeeded: 1, total: 1, priorCloses: 0 }).status === 'Handled.' &&
    FlowCloseQuality.isFullWrite(2, 1) === false &&
    shortened.receiptFull === false &&
    FlowQuietMetrics.trustedWeek(shortNoted, THIS_TS).trusted === 0);

  const clickOnly = FlowQuietMetrics.noteHandled(start, {
    messageId: 'gg-click', ts: THIS_TS, app: 'gmail', product: 'free', kinds: ['googleTask']
  });
  check('a Do It click with no handled receipt does not count',
    FlowQuietMetrics.trustedWeek(clickOnly, THIS_TS).trusted === 0 &&
    FlowQuietMetrics.trustedWeek(clickOnly, THIS_TS).handled === 0);

  const notion = FlowQuietMetrics.noteHandled(start, freeGmailGoogle({
    messageId: 'gg-notion', kinds: ['notion']
  }));
  const mixed = FlowQuietMetrics.noteHandled(start, freeGmailGoogle({
    messageId: 'gg-mixed', proposed: 2, succeeded: 2, kinds: ['googleTask', 'slack']
  }));
  const outlook = FlowQuietMetrics.noteHandled(start, freeGmailGoogle({
    messageId: 'gg-outlook', app: 'outlook'
  }));
  const pro = FlowQuietMetrics.noteHandled(start, freeGmailGoogle({
    messageId: 'gg-pro', product: 'pro'
  }));
  const bare = FlowQuietMetrics.noteHandled(start, { messageId: 'gg-bare', ts: THIS_TS });
  check('Notion, a mixed Slack step, Outlook, Pro, and a bare id do not inflate trusted closes',
    FlowQuietMetrics.trustedWeek(notion, THIS_TS).trusted === 0 &&
    FlowQuietMetrics.trustedWeek(mixed, THIS_TS).trusted === 0 &&
    FlowQuietMetrics.trustedWeek(outlook, THIS_TS).trusted === 0 &&
    FlowQuietMetrics.trustedWeek(pro, THIS_TS).trusted === 0 &&
    FlowQuietMetrics.trustedWeek(bare, THIS_TS).trusted === 0,
    {
      notion: FlowQuietMetrics.trustedWeek(notion, THIS_TS).trusted,
      mixed: FlowQuietMetrics.trustedWeek(mixed, THIS_TS).trusted,
      outlook: FlowQuietMetrics.trustedWeek(outlook, THIS_TS).trusted,
      pro: FlowQuietMetrics.trustedWeek(pro, THIS_TS).trusted,
      bare: FlowQuietMetrics.trustedWeek(bare, THIS_TS).trusted
    });

  const undoStranger = FlowQuietMetrics.noteUndo(start, { messageId: 'gg-notion' });
  check('Undo of a close that was never trusted does not invent a handled row',
    FlowQuietMetrics.trustedWeek(undoStranger, THIS_TS).handled === 0 &&
    FlowQuietMetrics.trustedWeek(undoStranger, THIS_TS).undone === 0 &&
    FlowQuietMetrics.trustedWeek(undoStranger, THIS_TS).undoRate === null);

  const quiet = FlowQuietMetrics.noteSilence(one, { messageId: 'gg-silent', reason: 'google', ts: THIS_TS });
  const dismissShaped = FlowQuietMetrics.noteHandled(quiet, freeGmailGoogle({
    messageId: 'gg-dismiss', receiptFull: false, receiptStatus: null, kinds: []
  }));
  check('silence and a dismiss do not add a trusted close',
    FlowQuietMetrics.trustedWeek(dismissShaped, THIS_TS).trusted === 1 &&
    FlowQuietMetrics.snapshot(dismissShaped, THIS_TS).silenceWeek.byReason.google === 1);

  const noKinds = freeGmailGoogle({ messageId: 'gg-nokinds' });
  noKinds.kinds = [];
  const badKind = FlowQuietMetrics.noteHandled(start, noKinds);
  const stringKinds = FlowQuietMetrics.noteHandled(start, freeGmailGoogle({ messageId: 'gg-string', kinds: 'googleTask' }));
  check('empty kinds or a kinds string is not a Google close',
    FlowQuietMetrics.trustedWeek(badKind, THIS_TS).trusted === 0 &&
    FlowQuietMetrics.trustedWeek(stringKinds, THIS_TS).trusted === 0);

  const lying = FlowQuietMetrics.noteHandled(start, freeGmailGoogle({
    messageId: 'gg-lie',
    receiptFull: true,
    receiptStatus: 'Partly handled.'
  }));
  check('a full flag with a partial status does not count',
    FlowQuietMetrics.trustedWeek(lying, THIS_TS).trusted === 0);

  const early = FlowQuietMetrics.noteHandled(start, freeGmailGoogle({
    messageId: 'gg-early',
    receiptStatus: 'Nothing else to open, nothing else to check — that’s handled.'
  }));
  check('the early-close sentence is not the Handled status',
    FlowQuietMetrics.trustedWeek(early, THIS_TS).trusted === 0);

  const lastWeekOnly = FlowQuietMetrics.noteHandled(start, freeGmailGoogle({ messageId: 'gg-old', ts: LAST_TS }));
  check('a Gmail Google close last week is not this week',
    FlowQuietMetrics.trustedWeek(lastWeekOnly, THIS_TS).trusted === 0 &&
    FlowQuietMetrics.trustedWeek(lastWeekOnly, LAST_TS).trusted === 1);

  const line = FlowQuietMetrics.activityLine(FlowQuietMetrics.snapshot(one, THIS_TS));
  check('the week line is the trusted count and Undo, not the message or the step',
    line === 'Trusted closes 1 this week · Undo 0' && line.indexOf('gg-task') === -1 && line.indexOf('googleTask') === -1, line);
}

console.log('\n--- silence is a reason code, once per message ---\n');
{
  const start = FlowQuietMetrics.emptyState();
  const hedge = FlowQuietMetrics.noteSilence(start, { messageId: 's1', reason: 'hedge', ts: THIS_TS });
  const again = FlowQuietMetrics.noteSilence(hedge, { messageId: 's1', reason: 'noise', ts: THIS_TS });
  const noise = FlowQuietMetrics.noteSilence(again, { messageId: 's2', reason: 'noise', ts: THIS_TS });
  const snap = FlowQuietMetrics.snapshot(noise, THIS_TS);
  check('two decisions this week, and a repeat does not change the reason',
    snap.silenceWeek.total === 2 && snap.silenceWeek.byReason.hedge === 1 && snap.silenceWeek.byReason.noise === 1, snap.silenceWeek);
  check('all-time matches this week when that is all there is',
    snap.silenceAll.total === 2 && snap.silenceAll.byReason.hedge === 1);

  const prose = FlowQuietMetrics.noteSilence(start, { messageId: 's3', reason: 'Please send the invoice', ts: THIS_TS });
  const mail = FlowQuietMetrics.noteSilence(start, { messageId: 'dana@x.com sent this', reason: 'hedge', ts: THIS_TS });
  check('a free-text reason or a body used as an id is dropped',
    prose.silenceIds.length === 0 && mail.silenceIds.length === 0 &&
    JSON.stringify(prose).indexOf('invoice') === -1);

  check('a shown chip is not a silence reason',
    FlowQuietMetrics.reasonFor({ type: 'decision', confidence: 'high', quiet: 'hedge' }) === null);
  check('remote confidence is not this bar',
    FlowQuietMetrics.reasonFor({ type: 'request', confidence: 'remote' }) === null);
  check('low confidence is the low bucket',
    FlowQuietMetrics.reasonFor({ type: 'followup', confidence: 'low' }) === 'low');
  check('an unnamed miss is not a silence decision',
    FlowQuietMetrics.reasonFor({ type: null, signals: {}, facts: {} }) === null);
  check('googleSilence is the google bucket when no finer code was set',
    FlowQuietMetrics.reasonFor({ type: null, googleSilence: true }) === 'google');
  check('an explicit code wins',
    FlowQuietMetrics.reasonFor({ type: null, quiet: 'family', googleSilence: true }) === 'family');
  const third = FlowQuietMetrics.noteSilence(start, { messageId: 's-third', reason: 'third-party', ts: THIS_TS });
  const noAttach = FlowQuietMetrics.noteSilence(third, { messageId: 's-outlook', reason: 'outlook-file-found-no-attach', ts: THIS_TS });
  const named = FlowQuietMetrics.snapshot(noAttach, THIS_TS);
  check('third-party and outlook-file-found-no-attach are silence reasons',
    named.silenceWeek.byReason['third-party'] === 1 && named.silenceWeek.byReason['outlook-file-found-no-attach'] === 1, named.silenceWeek.byReason);
  check('those reasons are on the activity line and a body is not',
    FlowQuietMetrics.activityLine(named).indexOf('third-party 1') !== -1 &&
    FlowQuietMetrics.activityLine(named).indexOf('outlook-file-found-no-attach 1') !== -1 &&
    FlowQuietMetrics.activityLine(named).indexOf('invoice') === -1);
  check('reasonFor names a third-party silence',
    FlowQuietMetrics.reasonFor({ type: null, quiet: 'third-party' }) === 'third-party');

  const line = FlowQuietMetrics.activityLine(snap);
  check('the activity line names the week counts and not a message',
    line.indexOf('Silence this week 2') !== -1 && line.indexOf('hedge 1') !== -1 &&
    line.indexOf('noise 1') !== -1 && line.indexOf('s1') === -1, line);
  check('an empty install has a blank line',
    FlowQuietMetrics.activityLine(FlowQuietMetrics.snapshot(start, THIS_TS)) === '');

  const trustedOnly = FlowQuietMetrics.snapshot(
    FlowQuietMetrics.noteHandled(start, freeGmailGoogle({ messageId: 'm9' })), THIS_TS);
  check('trusted line shows Undo 0 when nothing was taken back',
    FlowQuietMetrics.activityLine(trustedOnly) === 'Trusted closes 1 this week · Undo 0',
    FlowQuietMetrics.activityLine(trustedOnly));
}

console.log('\n--- classify still stays quiet, and the reason is coarse ---\n');
{
  const brain = { module: undefined, console };
  vm.createContext(brain);
  for (const f of ['domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'fact-reply.js', 'close-families.js', 'intent.js', 'quiet-metrics.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'core', f), 'utf8'), brain, { filename: f });
  }
  const Intent = vm.runInContext('FlowIntent', brain);
  const Quiet = vm.runInContext('FlowQuietMetrics', brain);
  const Fact = vm.runInContext('FlowFactReply', brain);
  const when = new Date('2026-09-17T12:00:00Z');
  function classify(text, extra) {
    return Intent.classify(text, Object.assign({ senderEmail: 'dana@meridian.com', now: when, calibration: null }, extra || {}));
  }

  const shown = classify('We agreed to deliver the countersigned amendment by October 2.');
  check('a dated commitment still shows a chip and is not a silence code',
    Intent.shouldShowChip(shown) === true && Quiet.reasonFor(shown) === null, { type: shown.type, confidence: shown.confidence, quiet: shown.quiet });

  const low = classify('Please find invoice INV-2041 attached for $12,500. Payment is payable net 30, due October 14.');
  check('the score-bar follow-up stays low and off the chip',
    low.type === 'followup' && low.confidence === 'low' && Intent.shouldShowChip(low) === false && Quiet.reasonFor(low) === 'low', low.confidence);

  const two = classify('Please send the invoice. Put it on the calendar and in the task note.');
  check('two targets stay silent as family',
    !two.type && two.quiet === 'family' && Quiet.reasonFor(two) === 'family', { type: two.type, quiet: two.quiet });

  const fyi = classify('FYI, we agreed to file the amendment by September 21.');
  check('FYI stays silent as noise', !fyi.type && fyi.quiet === 'noise' && Quiet.reasonFor(fyi) === 'noise', fyi.quiet);

  const once = classify('I will send the signed contract by Friday once legal approves it.');
  check('a contingent send stays silent as hedge', !once.type && once.quiet === 'hedge', { type: once.type, quiet: once.quiet });

  const paid = classify('Confirming we paid the $4,200 on March 3, 2024.');
  check('an already-paid amount stays silent as hedge', !paid.type && paid.quiet === 'hedge', { type: paid.type, quiet: paid.quiet });

  const heavy = { decision: { clicks: 0, dismissals: 6, ts: when.getTime() } };
  const muted = classify('We agreed to file the amendment by September 21.', { calibrationByType: heavy });
  check('heavy dismissals still suppress, as calibrated',
    !muted.type && muted.quiet === 'calibrated' && Intent.shouldShowChip(muted) === false, { type: muted.type, quiet: muted.quiet });

  const noTpl = classify('Please prepare a quote for Dana Cole at $3,900, titled "14th floor".', { fileMatch: 'none' });
  check('a Drive create with no template stays silent as google',
    !noTpl.type && noTpl.googleSilence === true && Quiet.reasonFor(noTpl) === 'google', { type: noTpl.type, quiet: noTpl.quiet, googleSilence: noTpl.googleSilence });

  const thanks = classify('Thanks, talk soon.');
  check('an ordinary miss is not given a silence reason',
    !thanks.type && Quiet.reasonFor(thanks) === null, thanks.quiet);

  const factQuiet = Fact.apply(
    { type: 'request', confidence: 'medium', personalClose: 'follow-up-ask' },
    { factLabel: 'amount' },
    { connected: true, match: null }
  );
  check('no fact match stays type-null with reason fact',
    factQuiet.type === null && factQuiet.quiet === 'fact' && Quiet.reasonFor(factQuiet) === 'fact', factQuiet);

  const dumped = JSON.stringify(two) + JSON.stringify(fyi) + JSON.stringify(factQuiet);
  check('silence codes are the words of the bucket, not the mail',
    dumped.indexOf('invoice') === -1 && dumped.indexOf('Dana') === -1 && dumped.indexOf('amendment') === -1);
}

console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
