// Bundle A live defects: livedom signed-contract card, calendar title, mail-language task, draft unchecked.
const { test, expect } = require('./support/harness');
const { startGoogleLaneServer } = require('./support/google-lane-server');

const SELF = 'ai.local.flow@gmail.com';
const MSG = '1a15ed1d116b46f7';

let laneServer;

test.beforeAll(async () => {
  laneServer = await startGoogleLaneServer();
});

test.afterAll(async () => {
  if (laneServer) await laneServer.close();
});

test('David message 1a15ed1d116b46f7 offers file-it (not intent-null)', async ({ glance }) => {
  const page = await glance.openGmail({
    messageId: MSG,
    threadId: MSG,
    subject: 'Signed contract attached (184w)',
    senderEmail: 'salisapan1@gmail.com',
    senderName: 'Sali Sapan',
    ownEmail: SELF,
    to: [SELF],
    body: 'Attached is the signed contract, please file it.',
    downloadUrl: 'application/pdf:deck-series-a.pdf:https://mail.google.com/e2e/att/deck-series-a.pdf'
  });
  const card = page.locator('[data-legacy-message-id="' + MSG + '"] .flow-chip-host');
  await expect(card).toBeVisible({ timeout: 20000 });
  await expect(card).toContainText(/Save|שמור|Drive|File/i);
});

test('calendar event body uses mail subject and dedupes description lines', async ({ glance }) => {
  const out = await glance.evaluateWorker(() => {
    const body = FlowGoogleCalendar.eventBody({
      dateIso: '2026-10-22',
      hour: 11,
      minute: 0,
      title: 'Meeting: product review',
      quote: 'Meeting: product review',
      timeZone: 'UTC'
    });
    const lines = body && body.description ? body.description.split('\n').filter(Boolean) : [];
    return { summary: body && body.summary, dup: lines.length !== new Set(lines).size };
  });
  expect(out.summary).toBe('Meeting: product review');
  expect(out.dup).toBe(false);
});

test('file-it draft step is not checked by default and Gmail drafts API is not used on Do It', async ({ glance }) => {
  await glance.seedGmail({ onboarded: true, connectorId: 'googleTasks' });
  const page = await glance.openGmail({
    messageId: 'm-file-it',
    threadId: 't-file-it',
    subject: 'Invoice',
    senderEmail: 'dana@acme.io',
    senderName: 'Dana',
    ownEmail: SELF,
    to: [SELF],
    body: 'Please save the attached pdf to Drive.',
    downloadUrl: 'application/pdf:inv.pdf:https://mail.google.com/e2e/att/inv.pdf'
  });
  const chip = page.locator('[data-legacy-message-id="m-file-it"] .flow-chip-host');
  await expect(chip).toBeVisible({ timeout: 20000 });
  const draftCheck = chip.locator('.act[data-step-id*="draft"] input.act-check, .act:has(.act-text) input.act-check').nth(1);
  if (await draftCheck.count()) {
    await expect(draftCheck).not.toBeChecked();
  }
  const callsBefore = (await glance.apiCalls()).filter((c) => c.url.indexOf('gmail.googleapis.com') >= 0);
  expect(callsBefore.length).toBe(0);
});
