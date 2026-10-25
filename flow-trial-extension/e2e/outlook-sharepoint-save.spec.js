// The mail's own attachment saved, unchanged, on the ONE SharePoint site the mail names (switch SHAREPOINT_SAVE_FILE, off; the SharePoint
// box on the Connect screen, Sites.ReadWrite.All). Unpacked extension, Graph stand-in. Switch off or scope missing: no card. With both:
// the card names the attachment and the site, Do It writes it into the site's Glance folder, reads it back by id (name, a file, the
// same size), Undo deletes it unless the person edited it. Two attachments and no name, a site that is not found or is ambiguous, a name
// already taken, and an ask that also sends get no write. Nothing is shared or sent.
const { test, expect } = require('./support/harness');
const S = require('./support/sentences');

const PANE = '#ReadingPaneContainerId';
const ASK = 'Please save the attached contract on the Marketing SharePoint site.';
const ASK_HE = 'תשמור את הקובץ המצורף באתר Marketing ב-SharePoint, בבקשה';
const contract = () => [{ id: 'att-contract', name: 'contract.pdf', contentType: 'application/pdf', size: 7, isInline: false, contentBytes: 'ZTJlLXBkZg==' }];

let n = 0;
async function mail(glance, switches, body, files, auth, scenarioExtra, subject) {
  await glance.seedOutlook(switches ? { glanceSwitches: switches } : {}, auth || { sharepoint: true });
  n += 1;
  const id = 'AQMk-sps-' + n;
  await glance.setScenario(Object.assign({ inbox: [], sent: [], messages: {}, attachments: { [id]: files || contract() }, conversation: [] }, scenarioExtra || {}));
  return glance.openOutlook({ id: id, subject: subject || 'Contract', senderEmail: S.SENDER, senderName: 'flow', body: body });
}
const items = (glance) => glance.evaluateWorker(() => Object.values(globalThis.__glanceE2e.driveItems));
const spItems = async (glance) => (await items(glance)).filter((i) => i.__site);
const CARD = PANE + ' .flow-chip-host[data-glance-chain="sharepoint-save"]';

test('SHAREPOINT_SAVE_FILE off: the ask gets no SharePoint save card and nothing is written', async ({ glance }) => {
  const page = await mail(glance, null, ASK);
  await page.waitForTimeout(3000);
  await expect(page.locator(CARD)).toHaveCount(0);
  expect(await spItems(glance)).toHaveLength(0);
});

test('SHAREPOINT_SAVE_FILE on, SharePoint box not ticked: no card', async ({ glance }) => {
  const page = await mail(glance, { SHAREPOINT_SAVE_FILE: true }, ASK, null, { sharepoint: false });
  await page.waitForTimeout(3000);
  await expect(page.locator(CARD)).toHaveCount(0);
  expect(await spItems(glance)).toHaveLength(0);
});

test('SHAREPOINT_SAVE_FILE on: Do It saves the attachment on the site, read back by id, Undo deletes it', async ({ glance }) => {
  const page = await mail(glance, { SHAREPOINT_SAVE_FILE: true }, ASK);
  await expect(page.locator(PANE + ' button.flow-chip')).toBeVisible({ timeout: 20000 });
  await expect(page.locator(PANE)).toContainText('contract.pdf');
  await expect(page.locator(PANE)).toContainText('Marketing');
  await page.locator(PANE + ' button.flow-chip').click();
  await expect(page.locator(PANE + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  const made = await spItems(glance);
  expect(made).toHaveLength(1);
  expect(made[0].name).toBe('contract.pdf');
  expect(made[0].__key).toBe('contoso.sharepoint.com,s1,w1/Glance/contract.pdf');
  expect(made[0].size).toBe(7);
  const calls = await glance.apiCalls();
  expect(calls.some((c) => c.method === 'GET' && /\/sites\/[^/]+\/drive\/items\/e2e-spfile-/.test(c.url))).toBe(true);
  expect(calls.some((c) => /sendMail|\/send\b/.test(c.url))).toBe(false);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator(PANE + ' .flow-chip-handled')).toHaveCount(1);
  await page.locator(PANE + ' button.flow-chip-undo').click();
  await expect.poll(async () => (await spItems(glance)).length).toBe(0);
});

test('SHAREPOINT_SAVE_FILE on: a Hebrew ask gives a Hebrew card and the file', async ({ glance }) => {
  const page = await mail(glance, { SHAREPOINT_SAVE_FILE: true }, ASK_HE);
  await expect(page.locator(PANE + ' button.flow-chip')).toBeVisible({ timeout: 20000 });
  await expect(page.locator(PANE)).toContainText('SharePoint');
  await page.locator(PANE + ' button.flow-chip').click();
  await expect(page.locator(PANE + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  expect(await spItems(glance)).toHaveLength(1);
});

test('SHAREPOINT_SAVE_FILE on: Undo leaves a file the person edited', async ({ glance }) => {
  const page = await mail(glance, { SHAREPOINT_SAVE_FILE: true }, ASK);
  await expect(page.locator(PANE + ' button.flow-chip')).toBeVisible({ timeout: 20000 });
  await page.locator(PANE + ' button.flow-chip').click();
  await expect(page.locator(PANE + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  await glance.evaluateWorker(() => { Object.values(globalThis.__glanceE2e.driveItems).forEach((i) => { if (i.__site) { i.eTag = '"edited,2"'; i.lastModifiedDateTime = '2026-10-25T09:30:00Z'; } }); });
  await page.locator(PANE + ' button.flow-chip-undo').click();
  await page.waitForTimeout(2500);
  expect(await spItems(glance)).toHaveLength(1);
});

test('SHAREPOINT_SAVE_FILE on: a name already taken is refused and nothing is replaced', async ({ glance }) => {
  const page = await mail(glance, { SHAREPOINT_SAVE_FILE: true }, ASK);
  await expect(page.locator(PANE + ' button.flow-chip')).toBeVisible({ timeout: 20000 });
  await glance.evaluateWorker(() => {
    const e = globalThis.__glanceE2e;
    const key = 'contoso.sharepoint.com,s1,w1/Glance/contract.pdf';
    const item = { id: 'e2e-spfile-existing', name: 'contract.pdf', file: {}, size: 99, eTag: '"x"', lastModifiedDateTime: '2026-10-01T00:00:00Z', __key: key, __site: 'contoso.sharepoint.com,s1,w1' };
    e.driveItems['e2e-spfile-existing'] = item;
    e.driveByName[key] = item;
  });
  await page.locator(PANE + ' button.flow-chip').click();
  await page.waitForTimeout(3000);
  await expect(page.locator(CARD + ' .flow-chip-handled')).toHaveCount(0);
  const made = await spItems(glance);
  expect(made).toHaveLength(1);
  expect(made[0].id).toBe('e2e-spfile-existing');
});

test('SHAREPOINT_SAVE_FILE on: two attachments with no name, an unknown site, or an ask that also sends get no card', async ({ glance }) => {
  const two = [contract()[0], { id: 'att-invoice', name: 'invoice.pdf', contentType: 'application/pdf', size: 7, isInline: false, contentBytes: 'ZTJlLXBkZg==' }];
  let page = await mail(glance, { SHAREPOINT_SAVE_FILE: true }, 'Please save the attached on the Marketing SharePoint site.', two, null, null, 'Documents');
  await page.waitForTimeout(3000);
  await expect(page.locator(CARD)).toHaveCount(0);
  page = await mail(glance, { SHAREPOINT_SAVE_FILE: true }, 'Please save the attached contract on the Legal SharePoint site.');
  await page.waitForTimeout(3000);
  await expect(page.locator(CARD)).toHaveCount(0);
  page = await mail(glance, { SHAREPOINT_SAVE_FILE: true }, 'Please save the attached contract on the Marketing SharePoint site and send it to Dana.');
  await page.waitForTimeout(3000);
  await expect(page.locator(CARD)).toHaveCount(0);
  expect(await spItems(glance)).toHaveLength(0);
});
