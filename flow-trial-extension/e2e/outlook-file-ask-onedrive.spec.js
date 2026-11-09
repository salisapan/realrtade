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

async function openAsk(glance, conv, msg, extra, opts) {
  opts = opts || {};
  const subject = opts.subject || 'Vendor agreement';
  const fileName = opts.fileName || NAME;
  await glance.seedOutlook(opts.seed, opts.auth);
  await glance.setScenario(Object.assign({
    inboxFilterFails: true,
    inbox: [{
      id: msg, conversationId: conv, subject: subject, receivedDateTime: localIso(TD.y, TD.m, TD.d, 14, 1),
      from: { emailAddress: { name: 'flow', address: S.SENDER } }, hasAttachments: true,
      internetMessageId: '<' + msg + '@mail.test>'
    }],
    sent: [],
    messages: {},
    attachments: { [msg]: [{ id: 'att-va', name: fileName, contentType: 'application/pdf', size: 634, isInline: false }] },
    conversation: [],
    mailboxSettings: { timeFormat: 'HH:mm', timeZone: 'UTC' }
  }, extra || {}));
  return glance.openOutlook({
    confirmConversation: true,
    live: true,
    id: conv,
    subject: subject,
    senderEmail: S.SENDER,
    body: opts.body || 'Please save the attached PDF to OneDrive by Friday.',
    receivedLabel: TD.dmy + ' 14:01',
    attachments: [{ shownName: fileName, titleName: fileName, sizeLabel: '1 KB' }]
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

test('after Do It the card stays Handled across a reload and a reopen, never back to the proposed Do It', async ({ glance }) => {
  test.setTimeout(150000);
  const page = await openAsk(glance, 'AQQKGlanceE2EAskReload', 'AQMkGlanceE2EAskReload');
  const pane = page.locator(PANE);
  await expect(pane.locator('.flow-chip-host')).toBeVisible({ timeout: 30000 });
  await pane.locator('button.flow-chip').click();
  await expect(pane.locator('.flow-chip-handled')).toBeVisible({ timeout: 30000 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(pane.locator('.flow-chip-handled')).toBeVisible({ timeout: 30000 });
  await page.waitForTimeout(4000);
  await expect(pane.locator('.flow-chip-handled')).toBeVisible();
  await expect(pane.locator('button.flow-chip')).toHaveCount(0);
  expect((await fileCalls(glance)).puts).toHaveLength(1);
});

test('with a name already taken, the renamed file card is still Handled after a reload, with its View link', async ({ glance }) => {
  test.setTimeout(150000);
  const page = await openAsk(glance, 'AQQKGlanceE2EAskRen', 'AQMkGlanceE2EAskRen',
    { drivePreexisting: ['Glance/' + NAME] },
    { subject: 'Supplier contract \u2013 OneDrive', seed: { glanceUiLanguage: 'he' }, body: 'היי, נא לשמור את ה-PDF המצורף ב-OneDrive עד יום שישי.' });
  const pane = page.locator(PANE);
  await expect(pane.locator('.flow-chip-host')).toBeVisible({ timeout: 30000 });
  await pane.locator('button.flow-chip').click();
  await expect(pane.locator('.flow-chip-handled')).toBeVisible({ timeout: 30000 });
  const renamed = 'vendor-agreement-2026 (1).pdf';
  await expect(pane.locator('.flow-chip-host')).toContainText(renamed);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(pane.locator('.flow-chip-handled')).toBeVisible({ timeout: 30000 });
  await page.waitForTimeout(4000);
  await expect(pane.locator('.flow-chip-handled')).toBeVisible();
  await expect(pane.locator('button.flow-chip')).toHaveCount(0);
  // The same saved record paints the same receipt: the saved name, and a way to open it.
  await expect(pane.locator('.flow-chip-host')).toContainText(renamed);
  await expect(pane.locator('.flow-chip-host')).toContainText('טופל');
  const bag = await glance.storage();
  const rows = (bag.log || []).filter((e) => e.kind === 'written' && e.connectorId === 'onedriveFile');
  expect(rows).toHaveLength(1);
  expect(rows[0].receiptStatus).toBe('טופל.');
  // Activity says Handled (טופל) for the same record, never an ongoing label.
  const popup = await glance.openPopup();
  await popup.locator('button.tab[data-tab="log"]').click();
  const kind = popup.locator('#log-list .log-kind, .panel.active .log-kind');
  await expect(kind.first()).toHaveText('טופל');
  await expect(popup.locator('.panel.active')).not.toContainText('שוטף');
  expect((await fileCalls(glance)).puts).toHaveLength(1);
});


async function openOutlookPanel(glance) {
  const popup = await glance.openPopup();
  // A side panel's active tab is Outlook, not this harness's extension tab.
  await popup.addInitScript(() => {
    const query = chrome.tabs.query.bind(chrome.tabs);
    chrome.tabs.query = (q) => query(q.active && q.currentWindow ? { url: ['https://outlook.live.com/*'] } : q);
  });
  await popup.reload();
  await popup.locator('button.tab[data-tab="setup"]').click();
  return popup;
}

async function mockFilesConsent(glance, grant = true) {
  await glance.evaluateWorker((allow) => {
    const e = globalThis.__glanceE2e;
    e.flows = [];
    e.launchWebAuthFlow = async (details) => {
      e.flows.push(details);
      if (!allow) throw new Error('cancelled');
      const url = new URL(details.url);
      e.filesConsentScopes = url.searchParams.get('scope');
      return url.searchParams.get('redirect_uri') + '?code=files-test&state=' + url.searchParams.get('state');
    };
    const original = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      if (String(url).startsWith('https://login.microsoftonline.com/') && String(url).endsWith('/token')) {
        return new Response(JSON.stringify({ access_token: 'AT-files', refresh_token: 'RT-files', expires_in: 3600, scope: e.filesConsentScopes }), { status: 200 });
      }
      return original(url, init);
    };
  }, grant);
}

test('Supplier ask stays a file card with an explicit consent step on a mail-only connection', async ({ glance }) => {
  const page = await openAsk(glance, 'AQQKMailOnlyAsk', 'AQMkMailOnlyAsk', {}, {
    auth: { files: false, tasks: false }, subject: 'Supplier contract – OneDrive',
    body: 'Hi, Attached is the signed supplier contract for November. Please save it to OneDrive by Sunday. Thanks'
  });
  const pane = page.locator(PANE);
  await expect(pane.locator('.flow-chip-host')).toBeVisible({ timeout: 30000 });
  await expect(pane.locator('[data-glance-dest]').first()).toHaveText('OneDrive > Glance');
  await expect(pane.locator('[data-glance-consent="files"]')).toBeVisible();
  expect((await fileCalls(glance)).puts).toHaveLength(0);
  await mockFilesConsent(glance);
  await pane.locator('button.flow-chip').click();
  expect((await glance.flows()).length).toBe(0);
  expect((await fileCalls(glance)).puts).toHaveLength(0);
  await pane.locator('[data-glance-consent="files"] button').click();
  await expect.poll(async () => (await glance.storage()).outlookAuth.token.grantedScopes).toContain('Files.ReadWrite');
  await expect(pane.locator('[data-glance-consent="files"]')).toHaveCount(0);
  expect((await fileCalls(glance)).puts).toHaveLength(0);
  await expect(pane.locator('button.flow-chip')).toBeVisible();
});

test('Settings keeps selected OneDrive through refresh, opens Files consent and shows grant checked', async ({ glance }) => {
  await openAsk(glance, 'AQQKSettingsFiles', 'AQMkSettingsFiles', {}, { auth: { files: false, tasks: false } });
  await mockFilesConsent(glance);
  const popup = await openOutlookPanel(glance);
  const card = popup.locator('[data-glance-connect="microsoft"]').first();
  const box = card.locator('[data-glance-service="onedrive"]');
  await box.check();
  await glance.evaluateWorker(async () => {
    await chrome.storage.local.set({ outlookSync: { lastSyncAt: Date.now() } });
  });
  await popup.waitForTimeout(1000);
  await expect(box).toBeChecked();
  await card.locator('button').filter({ hasText: 'הוסף הרשאה' }).click();
  await expect.poll(async () => (await glance.flows()).length).toBe(1);
  const flow = (await glance.flows())[0];
  expect(flow.interactive).toBe(true);
  expect(new URL(flow.url).searchParams.get('scope').split(' ').sort()).toEqual(['offline_access', 'User.Read', 'Mail.Read', 'Mail.ReadWrite', 'Files.ReadWrite'].sort());
  await expect.poll(async () => (await glance.storage()).outlookAuth.token.grantedScopes).toContain('Files.ReadWrite');
  await expect(box).toBeChecked();
  expect((await fileCalls(glance)).puts).toHaveLength(0);
});

test('FYI do-not-save remains quiet with Files scope missing', async ({ glance }) => {
  const page = await openAsk(glance, 'AQQKMailOnlyFYI', 'AQMkMailOnlyFYI', {}, {
    auth: { files: false, tasks: false }, subject: 'Vendor agreement – FYI',
    body: "Hi, Please don't save the attachment, it's for reference only. Thanks"
  });
  await page.waitForTimeout(6000);
  await expect(page.locator(PANE + ' .flow-chip-host')).toHaveCount(0);
  expect((await fileCalls(glance)).puts).toHaveLength(0);
});


test('cancelling inline OneDrive consent keeps the ask visible and saves nothing', async ({ glance }) => {
  const page = await openAsk(glance, 'AQQKFilesCancel', 'AQMkFilesCancel', {}, { auth: { files: false } });
  const pane = page.locator(PANE);
  await expect(pane.locator('[data-glance-consent="files"]')).toBeVisible();
  await mockFilesConsent(glance, false);
  await pane.locator('[data-glance-consent="files"] button').click();
  await expect(pane.locator('[data-glance-consent="files"] button')).toBeEnabled();
  await expect(pane.locator('.flow-chip-host')).toContainText('No file was saved.');
  expect((await glance.storage()).outlookAuth.token.grantedScopes).not.toContain('Files.ReadWrite');
  expect((await fileCalls(glance)).puts).toHaveLength(0);
});

test('the primary Microsoft card visibly requests missing Outlook page access and explains denial', async ({ glance }) => {
  await openAsk(glance, 'AQQKPageAccess', 'AQMkPageAccess');
  const popup = await openOutlookPanel(glance);
  await popup.addInitScript(() => {
    const contains = chrome.permissions.contains.bind(chrome.permissions);
    chrome.permissions.contains = (p) => (p.origins || []).some((o) => o.includes('outlook.live.com')) ? Promise.resolve(false) : contains(p);
    chrome.permissions.request = async () => false;
  });
  await popup.reload();
  const card = popup.locator('[data-glance-connect="microsoft"]').first();
  const access = card.locator('[data-glance-outlook-access]');
  await expect(access).toBeVisible();
  await access.click();
  await expect(card.locator('.conn-err')).toContainText('צריך לאפשר גישה');
  await expect(access).toBeEnabled();
  expect((await fileCalls(glance)).puts).toHaveLength(0);
});

// Single-message mail-only fixtures already passed on the failed SHA. The missing
// boundary was the full-thread picker: a later, longer quiet signed-copy message
// replaced this save ask before decideFromText could count its attachment.
for (const filesGranted of [false, true]) {
  test('Supplier ask survives a longer quiet thread tail with OneDrive unchecked, Files grant ' + filesGranted, async ({ glance }) => {
    const conv = 'AQQKLiveSupplierTail';
    const msg = 'AQMkLiveSupplierEarlier';
    const tail = {
      id: 'AQMkLiveSupplierLater', conversationId: conv, subject: 'Supplier contract – OneDrive',
      from: { emailAddress: { name: 'moshe', address: S.SENDER } },
      toRecipients: [{ emailAddress: { address: 'glance.salisapan@outlook.com' } }],
      receivedDateTime: localIso(TD.y, TD.m, TD.d, 18, 12), hasAttachments: true,
      body: { contentType: 'text', content: 'Hi, Attached is the signed supplier contract for November. This is the final signed copy with all the signatures and the full agreement. Thanks' }
    };
    const page = await openAsk(glance, conv, msg, { conversation: [tail] }, {
      auth: { files: filesGranted, tasks: false }, subject: 'Supplier contract – OneDrive',
      fileName: 'supplier-contract-nov.pdf',
      body: 'Hi,\nPlease save the attached contract to OneDrive by Sunday.\nThanks'
    });
    const popup = await openOutlookPanel(glance);
    const box = popup.locator('[data-glance-connect="microsoft"] [data-glance-service="onedrive"]').first();
    await box.uncheck();
    await expect(box).not.toBeChecked();
    const pane = page.locator(PANE);
    const card = pane.locator('.flow-chip-host');
    await expect(pane.locator('[data-glance-dest]').first()).toHaveText('OneDrive > Glance');
    // Not merely any card: this is the earlier open ask, not the quiet tail.
    await expect(card).toHaveAttribute('data-glance-message', new RegExp(msg));
    await expect(pane.locator('.flow-step-list .act-check')).toHaveCount(1);
    await expect(pane.locator('[data-glance-consent="files"]')).toHaveCount(filesGranted ? 0 : 1);
    const calls = await glance.apiCalls();
    expect(calls.some((c) => c.method === 'GET' && c.url.includes('/messages/' + msg + '/attachments'))).toBe(true);
    expect(calls.some((c) => c.method === 'GET' && c.url.includes('/messages/' + tail.id + '/attachments'))).toBe(false);
    expect((await fileCalls(glance)).puts).toHaveLength(0);
    expect((await fileCalls(glance)).drafts).toHaveLength(0);
    expect(await glance.flows()).toHaveLength(0);
    if (!filesGranted) {
      await mockFilesConsent(glance);
      await pane.locator('[data-glance-consent="files"] button').click();
      await expect.poll(async () => (await glance.storage()).outlookAuth.token.grantedScopes).toContain('Files.ReadWrite');
      await expect(pane.locator('[data-glance-consent="files"]')).toHaveCount(0);
      await expect(pane.locator('button.flow-chip')).toBeVisible();
      expect((await fileCalls(glance)).puts).toHaveLength(0);
      expect((await fileCalls(glance)).drafts).toHaveLength(0);
    }
  });
}
