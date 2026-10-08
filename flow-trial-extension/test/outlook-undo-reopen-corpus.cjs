'use strict';
/**
 * After Undo on an Outlook draft, the loop is still owed (outlookReopen).
 * Popup Still Open (getPending) and the in-page card gate (hasTerminalOutcome)
 * must agree that the ask is eligible again.
 * Run: node test/outlook-undo-reopen-corpus.cjs
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const { FlowOwaParse } = require('../core/owa-parse.js');

let store = {};
const chromeStub = {
  storage: {
    local: {
      get: (keysWithDefaults, cb) => {
        const result = {};
        for (const k of Object.keys(keysWithDefaults)) {
          result[k] = Object.prototype.hasOwnProperty.call(store, k) ? store[k] : keysWithDefaults[k];
        }
        cb(result);
      },
      set: (patch, cb) => { Object.assign(store, patch); if (cb) cb(); }
    }
  },
  runtime: { sendMessage: (_msg, cb) => { if (cb) cb(undefined); } }
};

const sandbox = {
  module: undefined,
  console,
  chrome: chromeStub,
  crypto: { randomUUID: () => 'test-uuid' }
};
vm.createContext(sandbox);
for (const f of [
  'pmf-metrics.js',
  'classification-metrics.js',
  'close-quality-metrics.js',
  'quiet-metrics.js',
  'privacyShield.js',
  'learning-ledger.js',
  'still-open.js'
]) {
  const p = path.join(__dirname, '..', 'core', f);
  if (fs.existsSync(p)) {
    vm.runInContext(fs.readFileSync(p, 'utf8'), sandbox, { filename: f });
  }
}
vm.runInContext(
  fs.readFileSync(path.join(__dirname, '..', 'src', 'storage.js'), 'utf8'),
  sandbox,
  { filename: 'storage.js' }
);
const FlowStorage = vm.runInContext('FlowStorage', sandbox);

const proc = { id: 'reply', name: 'Reply', steps: [{ kind: 'outlookDraft', id: 'outlookDraft1' }] };
const intent = { type: 'request', label: 'Confirm the pilot by Wednesday' };

async function main() {
  store = {};
  await FlowStorage.appendLog({
    kind: 'shown',
    messageId: 'graph-AAA',
    label: intent.label,
    process: proc,
    intent,
    app: 'outlook',
    subject: 'Pilot proposal',
    sender: { email: 'ai.local.flow@gmail.com', name: 'flow' },
    outlookIncomingId: 'graph-AAA'
  });
  await FlowStorage.appendLog({
    kind: 'written',
    messageId: 'graph-AAA',
    label: 'Reply draft ready in Outlook Drafts. Not sent.',
    connectorId: 'outlookDraft',
    ref: 'draft-1',
    app: 'outlook',
    outlookReceipt: true,
    process: proc,
    intent
  });

  assert.strictEqual(await FlowStorage.hasTerminalOutcome('graph-AAA'), false, 'a draft write without fetchedBack is not a close');
  assert.strictEqual(FlowStorage.verifyGateFrom(await FlowStorage.get(), 'graph-AAA'), 'verifying', 'the read-back window holds the card');
  assert.ok(
    !(await FlowStorage.getPending()).some((e) => e.messageId === 'graph-AAA'),
    'pending stays empty while the write is verifying'
  );
  assert.strictEqual((await FlowStorage.getActiveOutlookReceipts()).length, 1, 'the draft receipt stays on the panel');

  await FlowStorage.markOutlookDraftUndone('graph-AAA', 'draft-1');

  assert.strictEqual(
    await FlowStorage.hasTerminalOutcome('graph-AAA'),
    false,
    'after undo, hasTerminalOutcome must be false (page card eligible)'
  );
  const pending = await FlowStorage.getPending();
  assert.ok(
    pending.some((e) => e.messageId === 'graph-AAA'),
    'after undo, getPending must list the ask (popup Still Open eligible)'
  );
  assert.strictEqual(
    FlowStorage.hasTerminalOutcomeFrom(await FlowStorage.get(), 'graph-AAA'),
    false,
    'hasTerminalOutcomeFrom agrees'
  );
  const receipts = await FlowStorage.getActiveOutlookReceipts();
  assert.strictEqual(receipts.length, 0, 'no active receipt after undo');

  // An older undone row has no outlookReopen flag. It still reopens.
  store = {};
  await FlowStorage.appendLog({ kind: 'shown', messageId: 'g1', label: 'x', process: proc });
  await FlowStorage.appendLog({ kind: 'written', messageId: 'g1', label: 'x', where: 'Google Tasks' });
  await FlowStorage.appendLog({ kind: 'undone', messageId: 'g1', label: 'x' });
  assert.strictEqual(await FlowStorage.hasTerminalOutcome('g1'), false, 'plain undone reopens');
  assert.ok((await FlowStorage.getPending()).some((e) => e.messageId === 'g1'));

  // appendLog fallback with outlookReopen must not permanently hide either surface
  store = {};
  await FlowStorage.appendLog({ kind: 'shown', messageId: 'fb1', label: intent.label, process: proc, app: 'outlook' });
  await FlowStorage.appendLog({
    kind: 'written',
    messageId: 'fb1',
    label: 'Reply draft ready',
    connectorId: 'outlookDraft',
    ref: 'd2',
    app: 'outlook'
  });
  await FlowStorage.appendLog({
    kind: 'undone',
    messageId: 'fb1',
    label: 'Reply draft removed. Not sent.',
    connectorId: 'outlookDraft',
    app: 'outlook',
    outlookReopen: true
  });
  assert.strictEqual(await FlowStorage.hasTerminalOutcome('fb1'), false, 'appendLog reopen: card eligible');
  assert.ok(
    (await FlowStorage.getPending()).some((e) => e.messageId === 'fb1'),
    'appendLog reopen: pending lists ask (written twin must not close it)'
  );

  // OWA URL id ≠ Graph id: subject+from (+ day) still matches
  const pane = {
    subject: 'Pilot proposal',
    senderEmail: 'ai.local.flow@gmail.com',
    itemId: 'owa-url-OTHER',
    receivedDateTime: '2026-10-05T10:00:00Z'
  };
  const entries = [
    {
      messageId: 'graph-AAA',
      subject: 'Pilot proposal',
      sender: { email: 'ai.local.flow@gmail.com' },
      receivedDateTime: '2026-10-05T09:55:00Z'
    }
  ];
  assert.strictEqual(FlowOwaParse.matchEntry(pane, entries).messageId, 'graph-AAA', 'subject+from+day match');

  const byInternet = FlowOwaParse.matchEntry(
    { subject: 'X', senderEmail: 'a@b.com', internetMessageId: '<mid@x>' },
    [{ messageId: 'g', internetMessageId: '<mid@x>', subject: 'X', sender: { email: 'a@b.com' } }]
  );
  assert.strictEqual(byInternet.messageId, 'g', 'internetMessageId match');

  // Activity: a calendar write is its own row. Draft undo must not relabel it.
  store = {};
  await FlowStorage.appendLog({
    kind: 'shown',
    messageId: 'cal-1',
    label: 'Hold the file',
    process: { id: 'file-on-hold', name: 'File on hold', steps: [{ kind: 'calendar', id: 'cal' }] },
    app: 'outlook'
  });
  await FlowStorage.appendLog({
    kind: 'written',
    messageId: 'cal-1',
    label: 'Calendar · glance-pricing-q4.pdf · 2026-10-08 10:00',
    connectorId: 'outlookCalendar',
    ref: { eventId: 'ev-hold-1' },
    where: 'Outlook Calendar',
    url: 'https://outlook.live.com/calendar/item/ev-hold-1',
    app: 'outlook',
    fetchedBack: true
  });
  assert.strictEqual(await FlowStorage.hasTerminalOutcome('cal-1'), true, 'calendar write is handled');
  const beforeDraftUndo = (await FlowStorage.get()).log.filter((e) => e.messageId === 'cal-1' && e.kind === 'written');
  await FlowStorage.markOutlookDraftUndone('cal-1', { eventId: 'ev-hold-1' });
  const afterDraftUndo = (await FlowStorage.get()).log.filter((e) => e.messageId === 'cal-1');
  assert.ok(afterDraftUndo.some((e) => e.kind === 'written' && e.connectorId === 'outlookCalendar'), 'draft undo leaves the calendar row');
  assert.ok(!afterDraftUndo.some((e) => e.connectorId === 'outlookDraft'), 'draft undo does not invent a draft row');
  assert.strictEqual(beforeDraftUndo.length, 1);
  await FlowStorage.markOutlookCalendarUndone('cal-1', { eventId: 'ev-hold-1' });
  const after = (await FlowStorage.get()).log.filter((e) => e.messageId === 'cal-1' && e.kind !== 'shown');
  assert.strictEqual(after.length, 1, 'one Activity row, not a second Handled');
  assert.strictEqual(after[0].kind, 'undone');
  assert.strictEqual(after[0].connectorId, 'outlookCalendar');
  assert.strictEqual(after[0].label, 'Calendar event removed.');
  assert.strictEqual(after[0].outlookReopen, true);
  assert.strictEqual(await FlowStorage.hasTerminalOutcome('cal-1'), false, 'calendar undo reopens the page card');
  const receiptsAfter = await FlowStorage.getActiveOutlookReceipts();
  assert.ok(!receiptsAfter.some((e) => e.messageId === 'cal-1'), 'a calendar close is not an Outlook draft receipt');

  console.log('PASS: outlook undo reopen — page card and popup still-open agree');
  console.log('outlook-undo-reopen-corpus: ok');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
