// An empty Word or Excel file on the ONE SharePoint site a mail names (switch SHAREPOINT_NEW_FILE, off; the SharePoint box on the
// Connect screen, Sites.ReadWrite.All). Unpacked extension, Graph stand-in. Switch off or scope missing: no card. With both: the card
// names the file and the site, Do It writes it into the site's Glance folder, reads it back by id, Undo deletes it unless the person
// edited it. A site that is not found or is ambiguous, a name already taken, and an ask to write the content get no write. Nothing is
// shared or sent.
const { test, expect } = require('./support/harness');
const S = require('./support/sentences');

const PANE = '#ReadingPaneContainerId';
const ASK = 'Could you create a Word document called Q4 plan on the Marketing SharePoint site?';
const ASK_HE = 'תפתח מסמך בשם תוכנית רבעון באתר Marketing ב-SharePoint, בבקשה';

let n = 0;
async function mail(glance, switches, body, auth) {
  await glance.seedOutlook(switches ? { glanceSwitches: switches } : {}, auth || { sharepoint: true });
  n += 1;
  return glance.openOutlook({ id: 'AQMk-sp-' + n, subject: 'Marketing', senderEmail: S.SENDER, senderName: 'flow', body: body });
}
const items = (glance) => glance.evaluateWorker(() => ({ items: Object.values(globalThis.__glanceE2e.driveItems), puts: globalThis.__glanceE2e.drivePuts || [] }));
const spItems = async (glance) => (await items(glance)).items.filter((i) => i.__site);

test('SHAREPOINT_NEW_FILE off: the ask gets no SharePoint card and nothing is made', async ({ glance }) => {
  const page = await mail(glance, null, ASK);
  await page.waitForTimeout(3000);
  await expect(page.locator(PANE + ' .flow-chip-host[data-glance-chain="sharepoint-file"]')).toHaveCount(0);
  expect(await spItems(glance)).toHaveLength(0);
});

test('SHAREPOINT_NEW_FILE on, SharePoint box not ticked: no card', async ({ glance }) => {
  const page = await mail(glance, { SHAREPOINT_NEW_FILE: true }, ASK, { sharepoint: false });
  await page.waitForTimeout(3000);
  await expect(page.locator(PANE + ' .flow-chip-host[data-glance-chain="sharepoint-file"]')).toHaveCount(0);
  expect(await spItems(glance)).toHaveLength(0);
});

test('SHAREPOINT_NEW_FILE on: Do It makes an empty .docx in the site, read back by id, Undo deletes it', async ({ glance }) => {
  const page = await mail(glance, { SHAREPOINT_NEW_FILE: true }, ASK);
  await expect(page.locator(PANE + ' button.flow-chip')).toBeVisible({ timeout: 20000 });
  await expect(page.locator(PANE)).toContainText('Q4 plan.docx');
  await page.locator(PANE + ' button.flow-chip').click();
  await expect(page.locator(PANE + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  const made = await spItems(glance);
  expect(made).toHaveLength(1);
  expect(made[0].name).toBe('Q4 plan.docx');
  expect(made[0].__key).toBe('contoso.sharepoint.com,s1,w1/Glance/Q4 plan.docx');
  const calls = await glance.apiCalls();
  expect(calls.some((c) => c.method === 'GET' && /\/sites\/[^/]+\/drive\/items\/e2e-spfile-/.test(c.url))).toBe(true);
  expect(calls.some((c) => /sendMail|\/send\b/.test(c.url))).toBe(false);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator(PANE + ' .flow-chip-handled')).toHaveCount(1);
  await page.locator(PANE + ' button.flow-chip-undo').click();
  await expect.poll(async () => (await spItems(glance)).length).toBe(0);
});

test('SHAREPOINT_NEW_FILE on: Hebrew ask gives a Hebrew card and the file', async ({ glance }) => {
  const page = await mail(glance, { SHAREPOINT_NEW_FILE: true }, ASK_HE);
  await expect(page.locator(PANE + ' button.flow-chip')).toBeVisible({ timeout: 20000 });
  await expect(page.locator(PANE)).toContainText('SharePoint');
  await page.locator(PANE + ' button.flow-chip').click();
  await expect(page.locator(PANE + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  const made = await spItems(glance);
  expect(made).toHaveLength(1);
  expect(made[0].name).toBe('תוכנית רבעון.docx');
});

test('SHAREPOINT_NEW_FILE on: Undo leaves a file the person edited', async ({ glance }) => {
  const page = await mail(glance, { SHAREPOINT_NEW_FILE: true }, ASK);
  await expect(page.locator(PANE + ' button.flow-chip')).toBeVisible({ timeout: 20000 });
  await page.locator(PANE + ' button.flow-chip').click();
  await expect(page.locator(PANE + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  await glance.evaluateWorker(() => { Object.values(globalThis.__glanceE2e.driveItems).forEach((i) => { if (i.__site) { i.eTag = '"edited,2"'; i.lastModifiedDateTime = '2026-10-25T09:30:00Z'; } }); });
  await page.locator(PANE + ' button.flow-chip-undo').click();
  await page.waitForTimeout(2500);
  expect(await spItems(glance)).toHaveLength(1);
});

test('SHAREPOINT_NEW_FILE on: a name already taken is refused and nothing is replaced', async ({ glance }) => {
  const page = await mail(glance, { SHAREPOINT_NEW_FILE: true }, ASK);
  await expect(page.locator(PANE + ' button.flow-chip')).toBeVisible({ timeout: 20000 });
  await glance.evaluateWorker(() => {
    const e = globalThis.__glanceE2e;
    const key = 'contoso.sharepoint.com,s1,w1/Glance/Q4 plan.docx';
    const item = { id: 'e2e-spfile-existing', name: 'Q4 plan.docx', file: {}, size: 10, eTag: '"x"', lastModifiedDateTime: '2026-10-01T00:00:00Z', __key: key, __site: 'contoso.sharepoint.com,s1,w1' };
    e.driveItems['e2e-spfile-existing'] = item;
    e.driveByName[key] = item;
  });
  await page.locator(PANE + ' button.flow-chip').click();
  await page.waitForTimeout(3000);
  await expect(page.locator(PANE + ' .flow-chip-host[data-glance-chain="sharepoint-file"] .flow-chip-handled')).toHaveCount(0);
  const made = await spItems(glance);
  expect(made).toHaveLength(1);
  expect(made[0].id).toBe('e2e-spfile-existing');
});

test('SHAREPOINT_NEW_FILE on: a site that is not found, or that two sites share, or an ask to write the content, gets no card', async ({ glance }) => {
  let page = await mail(glance, { SHAREPOINT_NEW_FILE: true }, 'Could you create a Word document called Q4 plan on the Legal SharePoint site?');
  await page.waitForTimeout(3000);
  await expect(page.locator(PANE + ' .flow-chip-host[data-glance-chain="sharepoint-file"]')).toHaveCount(0);
  await glance.setScenario({ inbox: [], sent: [], messages: {}, attachments: {}, conversation: [], sites: [{ id: 'a,1,1', displayName: 'Marketing', name: 'm1' }, { id: 'b,2,2', displayName: 'Marketing', name: 'm2' }] });
  page = await glance.openOutlook({ id: 'AQMk-sp-dup', subject: 'Marketing', senderEmail: S.SENDER, senderName: 'flow', body: ASK });
  await page.waitForTimeout(3000);
  await expect(page.locator(PANE + ' .flow-chip-host[data-glance-chain="sharepoint-file"]')).toHaveCount(0);
  page = await mail(glance, { SHAREPOINT_NEW_FILE: true }, 'Could you create a Word document called Q4 plan on the Marketing SharePoint site and write a summary?');
  await page.waitForTimeout(3000);
  await expect(page.locator(PANE + ' .flow-chip-host[data-glance-chain="sharepoint-file"]')).toHaveCount(0);
  expect(await spItems(glance)).toHaveLength(0);
});
