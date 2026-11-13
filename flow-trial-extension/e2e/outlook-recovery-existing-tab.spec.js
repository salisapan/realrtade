const { test, expect } = require('./support/harness');
const { testDay } = require('./support/fixtures');
const TD = testDay();
const conv = 'AQQKStartupSupplier';
const msg = 'AQMkStartupSupplier';
const file = 'supplier-contract-nov.pdf';
const subject = 'Supplier contract – OneDrive';
const body = 'Hi,\nPlease save the attached contract to OneDrive by Sunday.\nThanks';

async function openSupplier(glance) {
  await glance.seedOutlook({ glanceDebug: true }, { files: false, tasks: false });
  await glance.setScenario({
    inbox: [{ id: msg, conversationId: conv, subject, hasAttachments: true,
      receivedDateTime: new Date(TD.y, TD.m - 1, TD.d, 9, 44).toISOString(),
      from: { emailAddress: { name: 'moshe', address: 'moshe@example.test' } } }],
    attachments: { [msg]: [{ id: 'att-supplier', name: file, size: 986, isInline: false, contentType: 'application/pdf' }] },
    messages: {}, conversation: [], sent: []
  });
  return glance.openOutlook({ id: conv, live: true, subject, senderName: 'moshe', senderEmail: 'moshe@example.test',
    body, receivedLabel: TD.dmy + ' 09:44', attachments: [{ shownName: file, titleName: file, sizeLabel: '986 B' }] });
}
async function turnOn(glance) {
  const popup = await glance.openPopup();
  const result = await popup.evaluate(() => chrome.runtime.sendMessage({ type: 'flow:surface-enable', id: 'outlook' }));
  await popup.close();
  return result;
}
async function probe(glance, page) {
  const worker = await glance.evaluateWorker(async () => {
    const tabs = await chrome.tabs.query({ url: ['https://outlook.live.com/*'] });
    const tab = tabs[0];
    let ping = null;
    try { ping = await chrome.tabs.sendMessage(tab.id, { type: 'flow:outlook-ping' }); } catch (e) { ping = { error: String(e.message) }; }
    const bag = await chrome.storage.local.get(['glanceOutlookRefresh', 'outlookPageDiag']);
    return { ping, refreshFlag: Boolean(bag.glanceOutlookRefresh && bag.glanceOutlookRefresh[String(tab.id)]), pageDiag: bag.outlookPageDiag || [] };
  });
  return Object.assign(worker, await page.evaluate(() => ({ marker: document.documentElement.getAttribute('data-glance-outlook'),
    cards: document.querySelectorAll('.flow-chip-host').length,
    refresh: Array.from(document.querySelectorAll('[data-glance-refresh]')).map((e) => ({ text: e.textContent, visible: Boolean(e.getBoundingClientRect().height) })) })));
}

for (const orphanedDeclarations of [false, true]) {
  test('existing Outlook with dead reader recovers visibly; orphaned declarations ' + orphanedDeclarations, async ({ glance }) => {
    await glance.evaluateWorker(async () => {
      await chrome.scripting.unregisterContentScripts({ ids: ['flow-outlook'] });
      await chrome.storage.local.set({ surfaces: {} });
    });
    const page = await openSupplier(glance);
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-glance-outlook', '1');
      const draft = document.createElement('textarea');
      draft.id = 'unsent-draft'; draft.value = 'keep my unsent draft';
      document.querySelector('#ReadingPaneContainerId').appendChild(draft);
    });
    if (orphanedDeclarations) {
      await glance.evaluateWorker(async () => {
        const tabs = await chrome.tabs.query({ url: ['https://outlook.live.com/*'] });
        // A surviving/partially initialized isolated world: actual shipped core
        // declarations, but no content-outlook.js listener or scanner.
        const manifest = chrome.runtime.getManifest();
        const core = manifest.content_scripts[0].js.filter((f) => f.startsWith('core/'));
        await chrome.scripting.executeScript({ target: { tabId: tabs[0].id }, files: core });
      });
    }
    let navigations = 0;
    page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) navigations++; });
    console.log('RECOVERY before', JSON.stringify(await probe(glance, page)));
    console.log('RECOVERY enable', JSON.stringify(await turnOn(glance)));
    console.log('RECOVERY immediately after enable', JSON.stringify(await probe(glance, page)));
    await expect(page.locator('#ReadingPaneContainerId .flow-chip-host, #ReadingPaneContainerId [data-glance-refresh]').first()).toBeVisible({ timeout: 8000 });
    console.log('RECOVERY after', JSON.stringify(await probe(glance, page)));
    expect(navigations).toBe(0);
    await expect(page.locator('#unsent-draft')).toHaveValue('keep my unsent draft');
    if (orphanedDeclarations) {
      await expect(page.locator('[data-glance-refresh]')).toBeVisible();
      await expect(page.locator('.flow-chip-host')).toHaveCount(0);
      await turnOn(glance);
      await expect(page.locator('[data-glance-refresh]')).toHaveCount(1);
      await expect(page.locator('#unsent-draft')).toHaveValue('keep my unsent draft');
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(page.locator('[data-glance-refresh-btn]')).toBeInViewport();
      await page.screenshot({ path: test.info().outputPath('recovery-390.png') });
      await page.setViewportSize({ width: 1440, height: 900 });
      await expect(page.locator('[data-glance-refresh-btn]')).toBeInViewport();
      await page.screenshot({ path: test.info().outputPath('recovery-1440.png') });
      await page.locator('[data-glance-refresh-btn]').click();
    }
    await expect(page.locator('[data-glance-consent="files"]')).toBeVisible();
    const state = await probe(glance, page);
    expect(state.ping.ok).toBe(true);
    expect(state.pageDiag.some((d) => d.reason === 'shown')).toBe(true);
    const calls = await glance.apiCalls();
    expect(calls.filter((c) => c.method === 'PUT' && c.url.includes('/me/drive/'))).toHaveLength(0);
    expect(await glance.flows()).toHaveLength(0);
  });
}
