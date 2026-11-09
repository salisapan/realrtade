// "Save the file?" on Gmail for an incoming attachment with no ask. Click only: nothing is written until Do It.
// drive.file only, the file lands in the Glance folder and is read back, Undo trashes it. Mocks only.
const { test, expect } = require('./support/harness');
const { startGoogleLaneServer } = require('./support/google-lane-server');

const SELF = 'ai.local.flow@gmail.com';
const BODY = 'Attached is your October statement.';
const STATEMENT = 'application/pdf:statement-oct.pdf:https://mail.google.com/e2e/att/board.pdf';
let server;

test.beforeAll(async () => { server = await startGoogleLaneServer(); });
test.afterAll(async () => { if (server) await server.close(); });
test.beforeEach(async ({ glance }) => {
  server.reset();
  await glance.evaluateWorker((origin) => { globalThis.__glanceE2e.httpOrigin = origin; }, server.origin);
});

async function open(glance, id, body, download) {
  await glance.context.route('https://mail.google.com/e2e/**', (r) => r.fulfill({ status: 404, contentType: 'text/plain', body: 'page fetch' }));
  await glance.seedGmail({});
  return glance.openGmail({
    messageId: 'm-' + id, threadId: 't-' + id, subject: 'Statement',
    senderEmail: 'billing@acme.io', senderName: 'Acme Billing', ownEmail: SELF, to: [SELF], lang: 'en',
    body: body, downloadUrl: download
  });
}

const uploads = () => server.calls.filter((c) => c.method === 'POST' && c.path.indexOf('/upload/drive/v3/files') >= 0);

test('an attachment with no ask gets a Save the file? card that writes nothing until it is clicked', async ({ glance }) => {
  const page = await open(glance, 'ss-card', BODY, STATEMENT);
  const chip = page.locator('div[role="main"] button.flow-chip');
  await expect(chip).toBeVisible({ timeout: 20000 });
  await expect(page.locator('div[role="main"] .flow-chip-host')).toContainText('Save the file?');
  await expect(page.locator('div[role="main"] .flow-chip-host')).toContainText('statement-oct.pdf');
  expect(uploads()).toHaveLength(0);
  expect(server.calls.filter((c) => c.method !== 'GET')).toHaveLength(0);
});

test('Do It saves the file to the Glance folder, reads it back, and Undo trashes it', async ({ glance }) => {
  const page = await open(glance, 'ss-save', BODY, STATEMENT);
  const chip = page.locator('div[role="main"] button.flow-chip');
  await expect(chip).toBeVisible({ timeout: 20000 });
  await chip.click();
  await expect(page.locator('div[role="main"] .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  expect(uploads()).toHaveLength(1);
  const id = server.last.file;
  expect(server.file(id).name).toBe('statement-oct.pdf');
  expect(server.calls.some((c) => c.method === 'GET' && c.path.indexOf('/drive/v3/files/' + id) === 0)).toBe(true);
  // Nothing outside Drive: no mail, no draft, no calendar.
  expect(server.calls.filter((c) => /gmail|calendar|tasks/.test(c.path))).toHaveLength(0);
  await page.locator('div[role="main"] button.flow-chip-undo').click();
  await expect.poll(() => server.file(id).trashed, { timeout: 15000 }).toBe(true);
});

test('dismissing the card writes nothing', async ({ glance }) => {
  const page = await open(glance, 'ss-dismiss', BODY, STATEMENT);
  await expect(page.locator('div[role="main"] button.flow-chip')).toBeVisible({ timeout: 20000 });
  await page.locator('div[role="main"] .flow-chip-host button[aria-label], div[role="main"] .flow-chip-host .flow-chip-dismiss').first().click();
  await expect(page.locator('div[role="main"] .flow-chip-host')).toHaveCount(0);
  expect(uploads()).toHaveLength(0);
});

test('an attachment mail that asks for something else gets no Save the file? card', async ({ glance }) => {
  const page = await open(glance, 'ss-ask', 'Thanks, all signed. Nothing else needed. Attached for your records.', STATEMENT);
  await page.waitForTimeout(3000);
  await expect(page.locator('div[role="main"] .flow-chip-host')).toHaveCount(0);
  expect(uploads()).toHaveLength(0);
});
