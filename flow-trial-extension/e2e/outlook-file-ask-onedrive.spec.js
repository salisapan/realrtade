// Live Gate (Outlook, 0.9.56): a mail that ASKS to save the attached PDF to OneDrive by Friday.
// The card is a file-save card: one step (OneDrive > Glance), no reply draft. One Do It writes one
// file, one Handled row, and the card stays Handled. Undo deletes that exact file, and only then says so;
// when the delete cannot be confirmed Undo says so and the file is reported as still there.
// Headless Chromium, mocked Graph, fixtures only.
const { test, expect } = require('./support/harness');
const S = require('./support/sentences');
const { testDay } = require('./support/fixtures');
const TD = testDay();

const NAME = 'vendor-agreement-2026.pdf';
const PANE = '#ReadingPaneContainerId';

function localIso(y, month, day, hour, minute) {
  return new Date(y, month - 1, day, hour, minute, 0, 0).toISOString();
}

async function openAsk(glance, conv, msg, extra) {
  await glance.seedOutlook();
  await glance.setScenario(Object.assign({
    inboxFilterFails: true,
    inbox: [{
      id: msg, conversationId: conv, subject: 'Vendor agreement', receivedDateTime: localIso(TD.y, TD.m, TD.d, 14, 1),
      from: { emailAddress: { name: 'flow', address: S.SENDER } }, hasAttachments: true,
      internetMessageId: '<' + msg + '@mail.test>'
    }],
    sent: [],
    messages: {},
    attachments: { [msg]: [{ id: 'att-va', name: NAME, contentType: 'application/pdf', size: 634, isInline: false }] },
    conversation: [],
    mailboxSettings: { timeFormat: 'HH:mm', timeZone: 'UTC' }
  }, extra || {}));
  return glance.openOutlook({
    confirmConversation: true,
    live: true,
    id: conv,
    subject: 'Vendor agreement',
    senderEmail: S.SENDER,
    body: 'Please save the attached PDF to OneDrive by Friday.',
    receivedLabel: TD.dmy + ' 14:01',
    attachments: [{ shownName: NAME, titleName: NAME, sizeLabel: '1 KB' }]
  });
}

async function fileCalls(glance) {
  const calls = await glance.apiCalls();
  return {
    puts: calls.filter((c) => c.method === 'PUT' && /\/me\/drive\//.test(c.url)),
    deletes: calls.filter((c) => c.method === 'DELETE' && /\/me\/drive\/items\//.test(c.url)),
    drafts: calls.filter((c) => c.method === 'POST' && /createReply|\/me\/messages$/.test(c.url))
  };
}

test('an ask to save the attached PDF to OneDrive is a one-step file card with no draft step', async ({ glance }) => {
  test.setTimeout(90000);
  const page = await openAsk(glance, 'AQQKGlanceE2EAskCard', 'AQMkGlanceE2EAskCard');
  const pane = page.locator(PANE);
  await expect(pane.locator('.flow-chip-host')).toBeVisible({ timeout: 30000 });
  await expect(pane.locator('[data-glance-dest]').first()).toHaveText('OneDrive > Glance');
  await expect(pane.locator('.flow-step-list .act-check')).toHaveCount(1);
  await expect(pane.locator('.flow-step-list')).not.toContainText(/Draft|טיוטה/);
});

test('Do It on that card writes once, stays Handled with one Activity row, and Undo deletes the file', async ({ glance }) => {
  test.setTimeout(120000);
  const page = await openAsk(glance, 'AQQKGlanceE2EAskOnce', 'AQMkGlanceE2EAskOnce');
  const pane = page.locator(PANE);
  await expect(pane.locator('.flow-chip-host')).toBeVisible({ timeout: 30000 });
  await pane.locator('button.flow-chip').click();
  await expect(pane.locator('.flow-chip-handled')).toBeVisible({ timeout: 30000 });
  // Handled stays: the card does not come back to the queue.
  await page.waitForTimeout(6000);
  await expect(pane.locator('.flow-chip-handled')).toBeVisible();
  await expect(pane.locator('button.flow-chip')).toHaveCount(0);
  let c = await fileCalls(glance);
  expect(c.puts).toHaveLength(1);
  expect(c.drafts).toHaveLength(0);
  const bag = await glance.storage();
  const rows = (bag.log || []).filter((e) => e && e.kind === 'written' && e.connectorId === 'onedriveFile');
  expect(rows).toHaveLength(1);

  await pane.locator('button.flow-chip-undo').click();
  await expect.poll(async () => (await fileCalls(glance)).deletes.length).toBe(1);
  await expect(pane.locator('.flow-chip-handled')).toHaveCount(0);
  const after = await glance.storage();
  expect((after.log || []).filter((e) => e && e.connectorId === 'onedriveFile' && e.kind === 'written')).toHaveLength(0);
});

test('a file with that name already in OneDrive is never replaced: the copy is saved beside it and Undo removes only the copy', async ({ glance }) => {
  test.setTimeout(120000);
  const page = await openAsk(glance, 'AQQKGlanceE2EAskTaken', 'AQMkGlanceE2EAskTaken', { drivePreexisting: ['Glance/' + NAME] });
  const pane = page.locator(PANE);
  await expect(pane.locator('.flow-chip-host')).toBeVisible({ timeout: 30000 });
  await pane.locator('button.flow-chip').click();
  await expect(pane.locator('.flow-chip-handled')).toBeVisible({ timeout: 30000 });
  const c = await fileCalls(glance);
  expect(c.puts).toHaveLength(1);
  expect(c.puts[0].url).toContain('conflictBehavior=rename');
  await pane.locator('button.flow-chip-undo').click();
  await expect.poll(async () => (await fileCalls(glance)).deletes.length).toBe(1);
  // Two files were there after the save, and after Undo only the one the user had is left.
  await expect.poll(async () => (await glance.driveFiles()).length).toBe(1);
  const left = await glance.driveFiles();
  expect(left[0].name).toBe(NAME);
  expect(c.puts[0].url).not.toContain('(1)');
});

test('when OneDrive keeps the file after the delete, Undo does not say it was removed', async ({ glance }) => {
  test.setTimeout(120000);
  const page = await openAsk(glance, 'AQQKGlanceE2EAskStuck', 'AQMkGlanceE2EAskStuck', { driveKeepOnDelete: true });
  const pane = page.locator(PANE);
  await expect(pane.locator('.flow-chip-host')).toBeVisible({ timeout: 30000 });
  await pane.locator('button.flow-chip').click();
  await expect(pane.locator('.flow-chip-handled')).toBeVisible({ timeout: 30000 });
  await pane.locator('button.flow-chip-undo').click();
  await expect.poll(async () => (await fileCalls(glance)).deletes.length).toBeGreaterThanOrEqual(1);
  await page.waitForTimeout(2500);
  // Not cancelled: the Handled mark and the saved row stay, because the file is still in OneDrive.
  const bag = await glance.storage();
  expect((bag.log || []).filter((e) => e && e.connectorId === 'onedriveFile' && e.kind === 'written')).toHaveLength(1);
  expect((bag.log || []).filter((e) => e && /undone|cancel|ביטול/i.test(String(e.kind || '') + String(e.title || '')))).toHaveLength(0);
});

test('two quick clicks on Do It write one file', async ({ glance }) => {
  test.setTimeout(120000);
  const page = await openAsk(glance, 'AQQKGlanceE2EAskDbl', 'AQMkGlanceE2EAskDbl');
  const pane = page.locator(PANE);
  await expect(pane.locator('.flow-chip-host')).toBeVisible({ timeout: 30000 });
  await pane.locator('button.flow-chip').dblclick({ delay: 20 }).catch(() => {});
  await expect(pane.locator('.flow-chip-handled')).toBeVisible({ timeout: 30000 });
  await page.waitForTimeout(3000);
  expect((await fileCalls(glance)).puts).toHaveLength(1);
  const bag = await glance.storage();
  expect((bag.log || []).filter((e) => e && e.kind === 'written' && e.connectorId === 'onedriveFile')).toHaveLength(1);
});
