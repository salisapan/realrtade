// M2: ONEDRIVE_FIND on the Outlook close map (F2). Graph stubbed; real-shape OWA fixture for one case.
// pre-C1 registry: modules injected by test (not production launch.js) — see m2-outlook-pre-c1-registry-4978.js.
const fs = require('fs');
const path = require('path');
const { test, expect } = require('./m2-outlook-onedrive-4978.harness');
const S = require('./support/sentences');
const { outlookHtml, outlookUrl } = require('./support/fixtures');

const PANE = '#ReadingPaneContainerId';
const ASK = 'Hi, could you send me the signed NDA for Acme?';
const DRIVE_NAME = 'NDA-Acme-signed.pdf';
const FIXTURE = path.join(__dirname, '../test/fixtures/owa-reading-pane-he.html');

async function seedDrive(glance) {
  await glance.evaluateWorker(() => {
    const e = globalThis.__glanceE2e;
    const content = '%PDF-1.7-nda-acme';
    const item = {
      id: 'e2e-m2-contract',
      name: 'NDA-Acme-signed.pdf',
      file: { mimeType: 'application/pdf' },
      size: content.length,
      __content: content,
      webUrl: 'https://onedrive.live.com/e2e-m2-contract'
    };
    e.driveItems = { 'e2e-m2-contract': item };
    e.driveByName = {};
  });
}

test('ONEDRIVE_FIND off: no onedrive-find close card', async ({ glance }) => {
  test.setTimeout(60000);
  await glance.seedOutlook();
  await seedDrive(glance);
  const page = await glance.openOutlook({
    id: 'AQMkM2FindOff',
    subject: 'Vendor contract',
    senderEmail: S.SENDER,
    body: ASK,
    attachments: []
  });
  await page.waitForTimeout(2500);
  await expect(page.locator(PANE + ' .flow-chip-host[data-glance-chain="onedrive-find"]')).toHaveCount(0);
});

test('ONEDRIVE_FIND on: real-shape Hebrew OWA fixture offers the find card', async ({ glance }) => {
  test.setTimeout(90000);
  await glance.seedOutlook({ glanceSwitches: { ONEDRIVE_FIND: true } });
  await seedDrive(glance);
  const html = fs.readFileSync(FIXTURE, 'utf8')
    .replace('Could you review the attached pilot proposal', ASK)
    .replace('Pilot proposal', 'Vendor contract');
  const page = await glance.openOutlookHtml(html, { messageId: 'AQMkM2RealShape' });
  await expect(page.locator(PANE + ' .flow-chip-host[data-glance-chain="onedrive-find"]')).toBeVisible({ timeout: 30000 });
  await expect(page.locator(PANE)).toContainText(DRIVE_NAME);
});

test('ONEDRIVE_FIND on: Do It attaches with Graph read-back (standard fixture)', async ({ glance }) => {
  test.setTimeout(120000);
  await glance.seedOutlook({ glanceSwitches: { ONEDRIVE_FIND: true } });
  await seedDrive(glance);
  const page = await glance.openOutlook({
    id: 'AQMkM2FindOn',
    subject: 'Vendor',
    senderEmail: S.SENDER,
    body: ASK,
    attachments: []
  });
  await expect(page.locator(PANE + ' .flow-chip-host[data-glance-chain="onedrive-find"]')).toBeVisible({ timeout: 30000 });
  const findCard = page.locator(PANE + ' .flow-chip-host[data-glance-chain="onedrive-find"]');
  await findCard.getByRole('button', { name: 'Do It' }).click();
  await expect.poll(async () => {
    const calls = await glance.apiCalls();
    return calls.some((c) => c.method === 'POST' && /\/attachments$/.test(c.url));
  }, { timeout: 45000 }).toBe(true);
  const calls = await glance.apiCalls();
  expect(calls.some((c) => c.method === 'GET' && /\/me\/drive\/root\/search/.test(c.url))).toBe(true);
  expect(calls.some((c) => c.method === 'GET' && /\/me\/drive\/items\/e2e-m2-contract/.test(c.url))).toBe(true);
  expect(calls.some((c) => /\/send\b/.test(c.url))).toBe(false);
});
