// Still Open corpus — include / exclude / silence, the cap, and the
// local metrics fold. Classification goes through the real FlowIntent
// path (the same one the chip and the inbox scan use). Ranking is then
// FlowStillOpen.select, which is allowed to show fewer than the cap
// and must show nothing when the bar is missed.
//
// Run: node test/still-open-corpus.cjs

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const CORE = path.join(__dirname, '..', 'core');
const sandbox = { module: undefined, console };
vm.createContext(sandbox);
for (const file of ['domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'fact-reply.js', 'close-families.js', 'intent.js', 'actions.js', 'still-open.js']) {
  vm.runInContext(fs.readFileSync(path.join(CORE, file), 'utf8'), sandbox, { filename: file });
}
const FlowIntent = vm.runInContext('FlowIntent', sandbox);
const FlowActions = vm.runInContext('FlowActions', sandbox);
const FlowStillOpen = vm.runInContext('FlowStillOpen', sandbox);

let failures = 0;
function check(name, cond, detail) {
  if (cond) { console.log('PASS:', name); }
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

// 1 Sep 2026 — the September / October dates in the shared sentences
// are still ahead of this morning, and close enough that extract.js
// will resolve them instead of calling the year ambiguous.
const NOW_DATE = new Date(2026, 8, 1, 8, 0, 0);
const NOW = NOW_DATE.getTime();

function classify(text) {
  return FlowIntent.classify(text, { now: NOW_DATE });
}

function candidate(text, id) {
  const intent = classify(text);
  const process = intent && intent.type
    ? FlowActions.planFor(intent, { threadUrl: 'https://mail.google.com/mail/u/0/#all/' + id, hasThreadAttachment: false })
    : null;
  return {
    messageId: id,
    threadId: 't-' + id,
    threadUrl: 'https://mail.google.com/mail/u/0/#all/' + id,
    sender: { name: 'Dana', email: 'dana@example.com' },
    subject: text.slice(0, 80),
    text: text,
    ts: NOW,
    app: 'gmail',
    intent: intent,
    process: process
  };
}

// A stored snapshot that still claims a personal close. The morning list
// has to drop it when the current chip would stay silent — the tag is
// not newer than the silence bar.
function staleClose(text, id) {
  const row = candidate(text, id);
  const prior = row.intent && typeof row.intent === 'object' ? row.intent : {};
  row.intent = {
    type: prior.type || 'request',
    label: prior.label || 'Send it',
    confidence: 'high',
    personalClose: prior.personalClose || 'follow-up-ask',
    closeFamily: prior.closeFamily || null,
    facts: prior.facts || {},
    entities: Object.assign({ what: text, requestWhat: text }, prior.entities || {}),
    signals: prior.signals || { score: 80 }
  };
  if (!row.process || !row.process.steps || !row.process.steps.length) {
    row.process = { id: 'reply-track', steps: [{ id: 'task' }] };
  }
  return row;
}

function ids(list) {
  return list.map((item) => item.messageId);
}

console.log('--- still open: the three high-stakes closes are included ---\n');
{
  const dated = candidate('I will send you the signed contract by Friday, September 18.', 'dated');
  const ask = candidate('Please follow up with Dana about the invoice.', 'ask');
  const amount = candidate('Confirming the amount is $4,200 for the year.', 'amount');
  const promise = candidate('You agreed to send the invoice by Friday, September 18.', 'promise');
  check('a sender promise with a date is included', FlowStillOpen.select([dated], NOW).length === 1, FlowStillOpen.closeKind(dated.intent));
  check('an explicit follow-up is included', FlowStillOpen.select([ask], NOW).length === 1, FlowStillOpen.closeKind(ask.intent));
  check('a confirmed amount is included', FlowStillOpen.select([amount], NOW).length === 1, FlowStillOpen.closeKind(amount.intent));
  check('the reader’s own dated promise is included',
    FlowStillOpen.select([promise], NOW).length === 1 && FlowStillOpen.closeKind(promise.intent) === 'dated-commitment',
    { kind: FlowStillOpen.closeKind(promise.intent), type: promise.intent && promise.intent.type, conf: promise.intent && promise.intent.confidence });
  const picked = FlowStillOpen.select([dated, ask, amount, promise], NOW);
  check('four real closes still cap at 3', picked.length === FlowStillOpen.CAP, ids(picked));
}

console.log('\n--- still open: silence — meetings, triage, unread, soft asks ---\n');
{
  const meeting = candidate('Let’s do a call Friday, September 18 at 3pm to review the contract.', 'meet');
  const pitch = candidate('Could you take a look at our new pricing plan and let me know your thoughts?', 'pitch');
  const bump = candidate('Just bumping this — could you send the invoice?', 'bump');
  const unread = candidate('You have 47 unread messages in your inbox this morning.', 'unread');
  const vague = candidate('Please follow up when you can.', 'vague');
  const none = candidate('Just wanted to say hi and see how you have been doing lately!', 'hi');
  const picked = FlowStillOpen.select([meeting, pitch, bump, unread, vague, none], NOW);
  check('a meeting does not become a still-open card', ids(picked).indexOf('meet') === -1 && FlowStillOpen.scoreOf(meeting, NOW) === 0, { type: meeting.intent && meeting.intent.type, score: FlowStillOpen.scoreOf(meeting, NOW) });
  check('a pitch with no concrete ask stays off the list', ids(picked).indexOf('pitch') === -1, meeting.intent && pitch.intent && pitch.intent.type);
  check('a bump / circling nudge stays off the list', ids(picked).indexOf('bump') === -1, bump.intent && bump.intent.type);
  check('an unread count stays off the list', ids(picked).indexOf('unread') === -1);
  check('a follow-up that names nothing stays off the list', ids(picked).indexOf('vague') === -1, vague.intent && vague.intent.type);
  check('small talk stays off the list', ids(picked).indexOf('hi') === -1);
  check('when nothing clears the bar the list is empty', picked.length === 0, ids(picked));
}

console.log('\n--- still open: a soft label does not survive even if someone tagged it ---\n');
{
  const padded = {
    messageId: 'fyi',
    threadId: 't-fyi',
    subject: 'FYI — unread newsletter, no action needed',
    ts: NOW,
    intent: {
      type: 'request',
      label: 'Just bumping this',
      confidence: 'medium',
      personalClose: 'follow-up-ask',
      facts: {},
      entities: { what: 'Just bumping this' }
    },
    process: { id: 'reply-track', steps: [{ id: 'task' }] }
  };
  check('triage copy scores 0', FlowStillOpen.scoreOf(padded, NOW) === 0);
  check('and select drops it instead of padding the morning', FlowStillOpen.select([padded], NOW).length === 0);
}

console.log('\n--- still open: chip silence (soft, FYI, hedge, past, calendar) stays off the morning list ---\n');
{
  const silenced = [
    ['soft maybe', 'Could you maybe send the invoice when you have a moment?'],
    ['FYI dated agreement', 'FYI, we agreed to file the amendment by September 21.'],
    ['hedge once legal', 'I will send the signed contract by Friday once legal approves it.'],
    ['past payment', 'Confirming we paid the $4,200 on March 3, 2024.'],
    ['calendar accepted', 'Accepted: Weekly sync — Friday, September 18 at 3pm.'],
    ['low score-bar invoice', 'Please find invoice INV-2041 attached for $12,500. Payment is payable net 30, due October 14.']
  ];
  const rows = silenced.map(([id, text]) => candidate(text, id));
  const picked = FlowStillOpen.select(rows, NOW);
  check('silence cases produce an empty morning list', picked.length === 0, ids(picked));
  rows.forEach((row) => {
    check('scores 0: ' + row.messageId, FlowStillOpen.scoreOf(row, NOW) === 0, {
      type: row.intent && row.intent.type,
      confidence: row.intent && row.intent.confidence,
      score: FlowStillOpen.scoreOf(row, NOW)
    });
  });
  const kept = candidate('We agreed to deliver the countersigned amendment by October 2.', 'kept');
  const withReal = FlowStillOpen.select(rows.concat([kept]), NOW);
  check('a real dated commitment still shows beside the silenced rows', ids(withReal).indexOf('kept') !== -1 && withReal.length === 1, ids(withReal));
}

console.log('\n--- still open: fewer than the cap is the whole list, never padded ---\n');
{
  const one = candidate('Confirming the amount is $4,200 for the year.', 'only');
  const picked = FlowStillOpen.select([one], NOW);
  check('a single real close is shown as one card', picked.length === 1 && picked[0].messageId === 'only', picked.length);
  check('an empty input is an empty list', FlowStillOpen.select([], NOW).length === 0);
  check('a missing input is an empty list', FlowStillOpen.select(null, NOW).length === 0);
  check('a candidate with no process cannot be closed, so it is absent',
    FlowStillOpen.select([{ messageId: 'x', intent: one.intent, process: null }], NOW).length === 0);
}

console.log('\n--- still open: ranking is stakes × explicitness × deadline × confidence ---\n');
{
  function dated(id, iso) {
    return {
      messageId: id,
      threadId: 'thr-' + id,
      subject: 'Contract',
      ts: NOW,
      intent: {
        type: 'decision',
        label: 'Send the contract',
        confidence: 'high',
        personalClose: 'dated-commitment',
        facts: { date: { iso: iso } },
        entities: { what: 'I will send the signed contract by ' + iso }
      },
      process: { id: 'log-it', steps: [{ id: 'task' }] }
    };
  }
  const soon = dated('soon', '2026-09-02');
  const week = dated('week', '2026-09-08');
  const later = dated('later', '2026-09-20');
  const far = dated('far', '2026-11-15');
  const picked = FlowStillOpen.select([far, later, week, soon], NOW);
  check('the cap keeps three', picked.length === 3, ids(picked));
  check('the soonest deadline leads', picked[0].messageId === 'soon', ids(picked));
  check('a far deadline loses the last seat', ids(picked).indexOf('far') === -1, ids(picked));
  check('soon outranks a same-kind close that is only due next month',
    FlowStillOpen.scoreOf(soon, NOW) > FlowStillOpen.scoreOf(later, NOW),
    { soon: FlowStillOpen.scoreOf(soon, NOW), later: FlowStillOpen.scoreOf(later, NOW) });
}

console.log('\n--- still open: a deadline weeks overdue is silence, not a stale card ---\n');
{
  const stale = {
    messageId: 'old',
    threadId: 't-old',
    subject: 'Contract',
    ts: NOW - 40 * 86400000,
    intent: {
      type: 'decision',
      label: 'Send the contract',
      confidence: 'high',
      personalClose: 'dated-commitment',
      facts: { date: { iso: '2025-11-01' } },
      entities: { what: 'I will send the signed contract by November 1' }
    },
    process: { id: 'log-it', steps: [{ id: 'task' }] }
  };
  check('more than two weeks past the date scores 0', FlowStillOpen.scoreOf(stale, NOW) === 0, FlowStillOpen.scoreOf(stale, NOW));
  check('and it is not shown', FlowStillOpen.select([stale], NOW).length === 0);
}

console.log('\n--- still open: the why line is one sentence, Hebrew when the thread is ---\n');
{
  const en = candidate('I will send you the signed contract by Friday, September 18.', 'en');
  check('English why names the promise and the day',
    /^You promised this by /.test(FlowStillOpen.whyLine(en, NOW)), FlowStillOpen.whyLine(en, NOW));
  const he = candidate('אני אשלח לך את החוזה עד יום שישי.', 'he');
  const heWhy = FlowStillOpen.whyLine(he, NOW);
  check('Hebrew why is the Hebrew line', heWhy.indexOf('התחייבת') === 0 || heWhy.indexOf('התחייבות') === 0, heWhy);
}

console.log('\n--- still open: one morning notification line, never per item ---\n');
{
  check('zero cards produce no notification', FlowStillOpen.notificationText(0) === '');
  check('one card is the singular Hebrew line', FlowStillOpen.notificationText(1) === 'Glance: דבר אחד עדיין פתוח');
  check('two cards match the spec line', FlowStillOpen.notificationText(2) === 'Glance: 2 עדיין פתוחים');
  check('three stays one line, not three pings', FlowStillOpen.notificationText(3) === 'Glance: 3 עדיין פתוחים');
}

console.log('\n--- still open metrics: shown, Do It, undo, false-close ---\n');
{
  const start = FlowStillOpen.emptyMetrics();
  const frozen = JSON.stringify(start);
  const shown = FlowStillOpen.applyMetric(start, { kind: 'shown', messageId: 'm1', ts: 1 });
  check('applyMetric does not mutate its input', JSON.stringify(start) === frozen);
  check('showing a card counts once', shown.recorded && shown.recorded.kind === 'shown' && shown.state.shown === 1, shown.state);
  const shownAgain = FlowStillOpen.applyMetric(shown.state, { kind: 'shown', messageId: 'm1', ts: 2 });
  check('the same card shown again does not double-count', shownAgain.recorded === null && shownAgain.state.shown === 1);

  const did = FlowStillOpen.applyMetric(shownAgain.state, { kind: 'doIt', messageId: 'm1', ts: 3 });
  check('Do It counts once per message', did.recorded && did.state.doIt === 1, did.state);
  const didAgain = FlowStillOpen.applyMetric(did.state, { kind: 'doIt', messageId: 'm1', ts: 4 });
  check('a second Do It on the same message is not a second close', didAgain.state.doIt === 1);

  const undone = FlowStillOpen.applyMetric(didAgain.state, { kind: 'undo', messageId: 'm1', ts: 5 });
  check('undo counts as undo and as a false-close',
    undone.state.undo === 1 && undone.state.falseClose === 1 && undone.recorded && undone.recorded.reason === 'undo', undone.state);
  const undoneAgain = FlowStillOpen.applyMetric(undone.state, { kind: 'undo', messageId: 'm1', ts: 6 });
  check('a repeated undo does not inflate either counter', undoneAgain.state.undo === 1 && undoneAgain.state.falseClose === 1);

  const dismissed = FlowStillOpen.applyMetric(shownAgain.state, { kind: 'falseClose', messageId: 'm2', reason: 'dismiss', ts: 7 });
  check('dismissing a card is a false-close', dismissed.state.falseClose === 1 && dismissed.recorded.reason === 'dismiss', dismissed.state);
  const bad = FlowStillOpen.applyMetric(dismissed.state, { kind: 'falseClose', messageId: 'm3', reason: 'maybe', ts: 8 });
  check('a false-close without dismiss or undo is ignored', bad.recorded === null && bad.state.falseClose === 1);

  const nag = FlowStillOpen.applyMetric(bad.state, { kind: 'notifyDismiss', ts: 9 });
  const nagAgain = FlowStillOpen.applyMetric(nag.state, { kind: 'notifyDismiss', ts: 10 });
  check('the annoying-notification flag is recorded once', nag.state.notifyDismiss === 1 && nagAgain.state.notifyDismiss === 1 && nagAgain.recorded === null);

  const line = FlowStillOpen.activityLine(undone.state);
  check('the activity line names the four hooks',
    line.indexOf('shown 1') !== -1 && line.indexOf('Do It 1') !== -1 && line.indexOf('undo 1') !== -1 && line.indexOf('false-close 1') !== -1,
    line);
  check('a fresh install has no activity line', FlowStillOpen.activityLine(FlowStillOpen.emptyMetrics()) === '');
}

console.log('\n--- still open: same thread collapses to one card ---\n');
{
  const shared = {
    threadId: 'same',
    subject: 'Invoice',
    ts: NOW,
    intent: {
      type: 'decision',
      label: 'Confirm the amount',
      confidence: 'high',
      personalClose: 'confirmed-amount',
      facts: { money: { amount: 4200 } },
      entities: { what: 'Confirming the amount is $4,200', amount: '$4,200' }
    },
    process: { id: 'log-it', steps: [{ id: 'task' }] }
  };
  const a = Object.assign({}, shared, { messageId: 'a', ts: NOW - 1000 });
  const b = Object.assign({}, shared, {
    messageId: 'b',
    ts: NOW,
    intent: Object.assign({}, shared.intent, {
      personalClose: 'dated-commitment',
      facts: { date: { iso: '2026-09-02' }, money: { amount: 4200 } }
    })
  });
  const picked = FlowStillOpen.select([a, b], NOW);
  check('two closes in one thread become one card', picked.length === 1, ids(picked));
  check('the higher-ranked close is the one kept', picked[0].messageId === 'b', ids(picked));
}

console.log('\n--- still open: trust-finish silence (A–J) stays off the morning list ---\n');
{
  // The same classes the chip refuses after the trust finish: hedge,
  // more than one candidate, a weak / low / unsure score, an ask that
  // lives only in the quoted history, and newsletter noise. A stored
  // personalClose tag does not put them back.
  const kills = [
    ['hedge maybe', 'Maybe send the invoice if you feel like it.'],
    ['hedge might', 'I might send the contract by Friday, September 18.'],
    ['hedge he', 'אולי תשלח את החוזה מתישהו.'],
    ['newsletter', 'Hope this email finds you well. Could you send the invoice?'],
    ['bump', 'Just bumping this — could you send the invoice?'],
    ['fyi wrap', 'FYI, we agreed to file the amendment by September 21.'],
    ['two targets', 'Please send the invoice. Put it on the calendar and in the task note.'],
    ['doc comment', 'Please send the contract and leave a doc comment.'],
    ['quoted old ask', ['Sounds good, thanks!', '', 'On Mon, Sep 1, 2025 at 9:41 AM Dana Cole <dana@meridian.com> wrote:', '> Could you send the invoice?'].join('\n')],
    ['weak invoice', 'Please find invoice INV-2041 attached for $12,500. Payment is payable net 30, due October 14.'],
    ['two facts', "What's the renewal amount and the start date in the pricing sheet?"],
    ['hedge sheet', 'Maybe tell me the amount from the sheet if you have a minute.']
  ];
  const rows = kills.map(([id, text]) => staleClose(text, id));
  const picked = FlowStillOpen.select(rows, NOW);
  check('trust-finish silence produces an empty morning list', picked.length === 0, ids(picked));
  rows.forEach((row) => {
    check('stale tag still scores 0: ' + row.messageId, FlowStillOpen.scoreOf(row, NOW) === 0, {
      type: row.intent && row.intent.type,
      family: row.intent && row.intent.closeFamily,
      confidence: row.intent && row.intent.confidence,
      score: FlowStillOpen.scoreOf(row, NOW)
    });
  });

  const unsure = {
    messageId: 'unsure',
    threadId: 't-unsure',
    subject: 'Please send the invoice.',
    text: 'Please send the invoice.',
    ts: NOW,
    intent: {
      type: 'request',
      label: 'Send the invoice',
      confidence: 'unsure',
      personalClose: 'follow-up-ask',
      facts: {},
      entities: { what: 'Please send the invoice.', requestWhat: 'Please send the invoice.' }
    },
    process: { id: 'reply-track', steps: [{ id: 'task' }] }
  };
  const low = {
    messageId: 'low',
    threadId: 't-low',
    subject: 'Please send the invoice.',
    text: 'Please send the invoice.',
    ts: NOW,
    intent: {
      type: 'request',
      label: 'Send the invoice',
      confidence: 'low',
      personalClose: 'follow-up-ask',
      facts: {},
      entities: { what: 'Please send the invoice.', requestWhat: 'Please send the invoice.' }
    },
    process: { id: 'reply-track', steps: [{ id: 'task' }] }
  };
  check('unsure confidence is not a morning card', FlowStillOpen.scoreOf(unsure, NOW) === 0 && FlowStillOpen.select([unsure], NOW).length === 0);
  check('low confidence is not a morning card', FlowStillOpen.scoreOf(low, NOW) === 0 && FlowStillOpen.select([low], NOW).length === 0);

  // One fact from one Sheet chips in the open thread. The morning list
  // has no cell to check, so it stays off — same as the inbox scan.
  const fact = candidate("What's the renewal amount in the pricing sheet?", 'fact');
  if (!fact.process) fact.process = { id: 'reply-track', steps: [{ id: 'task' }] };
  check('a fact ask does not become a morning card', FlowStillOpen.select([fact], NOW).length === 0, {
    type: fact.intent && fact.intent.type,
    family: fact.intent && fact.intent.closeFamily,
    score: FlowStillOpen.scoreOf(fact, NOW)
  });

  const kept = [
    candidate('I will send you the signed contract by Friday, September 18.', 'dated'),
    candidate('Please follow up with Dana about the invoice.', 'ask'),
    candidate('Confirming the amount is $4,200 for the year.', 'amount'),
    candidate('Could you send the invoice?', 'file'),
    candidate('I will have the redline to you by September 24.', 'redline'),
    candidate('I will send the contract by Friday, September 18. I might also call.', 'aside'),
    candidate([
      'I will send you the signed contract by Friday, September 18.',
      '',
      'On Mon, Sep 1, 2025 at 9:41 AM Dana Cole <dana@meridian.com> wrote:',
      '> Could you send the invoice?'
    ].join('\n'), 'reply-on-quote')
  ];
  kept.forEach((row) => {
    const alone = FlowStillOpen.select([row], NOW);
    check('clear close still shows: ' + row.messageId, alone.length === 1 && alone[0].messageId === row.messageId, {
      type: row.intent && row.intent.type,
      kind: FlowStillOpen.closeKind(row.intent),
      score: FlowStillOpen.scoreOf(row, NOW)
    });
    const beside = FlowStillOpen.select(rows.concat([unsure, low, fact, row]), NOW);
    check('clear close survives beside silence: ' + row.messageId,
      ids(beside).indexOf(row.messageId) !== -1 && beside.length === 1,
      ids(beside));
  });
}

console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
