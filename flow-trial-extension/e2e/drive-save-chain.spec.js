// The whole "Save the file?" chain, end to end, on a local Google server.
// Step 1 fetches the attachment through the service worker, which follows
// Gmail's redirect. The file lands in a Glance folder. The draft in the open
// reply carries the Drive link. Undo trashes the file and leaves the folder.
// Headless Chromium, mocks only.
const { test, expect } = require('./support/harness');
const { startGoogleLaneServer } = require('./support/google-lane-server');

const SELF = 'ai.local.flow@gmail.com';
const ASK = 'Please save the attached pdf to Drive.';
const BOARD = 'application/pdf:board.pdf:https://mail.google.com/e2e/att/board.pdf';
const SIGNIN = 'application/pdf:board.pdf:https://mail.google.com/e2e/att/signin.pdf';
const GONE = 'application/pdf:board.pdf:https://mail.google.com/e2e/att/gone.pdf';
let server;

test.beforeAll(async () => { server = await startGoogleLaneServer(); });
test.afterAll(async () => { if (server) await server.close(); });
test.beforeEach(async ({ glance }) => {
  server.reset();
  await glance.evaluateWorker((origin) => { globalThis.__glanceE2e.httpOrigin = origin; }, server.origin);
});

async function run(glance, id, download) {
  // The page itself must never be the one that reads the attachment.
  await glance.context.route('https://mail.google.com/e2e/**', (r) => r.fulfill({ status: 404, contentType: 'text/plain', body: 'page fetch' }));
  await glance.seedGmail({});
  const page = await glance.openGmail({
    messageId: 'm-' + id, threadId: 't-' + id, subject: 'Board pack',
    senderEmail: 'dana@acme.io', senderName: 'Dana', ownEmail: SELF, to: [SELF],
    body: ASK, downloadUrl: download, composeReply: true, composeTo: 'dana@acme.io', composeSubject: 'Re: Board pack'
  });
  const chip = page.locator('div[role="main"] button.flow-chip');
  await expect(chip).toBeVisible({ timeout: 20000 });
  await chip.click();
  return page;
}

const uploads = () => server.calls.filter((c) => c.method === 'POST' && c.path.indexOf('/upload/drive/v3/files') >= 0);
const folderMakes = () => server.calls.filter((c) => c.method === 'POST' && c.path === '/drive/v3/files' && c.body && c.body.mimeType === 'application/vnd.google-apps.folder');

test('the attachment is fetched through a redirect, saved in a Glance folder, and linked in the draft', async ({ glance }) => {
  const page = await run(glance, 'ch-ok', BOARD);
  await expect(page.locator('div[role="main"] .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  expect(folderMakes()).toHaveLength(1);
  expect(folderMakes()[0].body.name).toBe('Glance');
  expect(uploads()).toHaveLength(1);
  const id = server.last.file;
  const folder = Object.keys(server.files()).map((k) => server.files()[k]).find((f) => f.name === 'Glance');
  expect(folder).toBeTruthy();
  expect(server.file(id).parents).toEqual([folder.id]);
  const body = await page.locator('[aria-label="Message Body"]').innerText();
  expect(body).toContain('https://drive.google.com/file/d/' + id + '/view');
});

test('a second save reuses the Glance folder', async ({ glance }) => {
  const first = await run(glance, 'ch-one', BOARD);
  await expect(first.locator('div[role="main"] .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  const second = await run(glance, 'ch-two', BOARD);
  await expect(second.locator('div[role="main"] .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  expect(folderMakes()).toHaveLength(1);
  expect(uploads()).toHaveLength(2);
});

test('Undo trashes the saved file and leaves the folder', async ({ glance }) => {
  const page = await run(glance, 'ch-undo', BOARD);
  await expect(page.locator('div[role="main"] .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  const id = server.last.file;
  await page.locator('div[role="main"] button.flow-chip-undo').click();
  await expect.poll(() => server.file(id).trashed, { timeout: 15000 }).toBe(true);
  const folder = Object.keys(server.files()).map((k) => server.files()[k]).find((f) => f.name === 'Glance');
  expect(folder.trashed).toBe(false);
});

test('the Activity row names the save, not a decision', async ({ glance }) => {
  const page = await run(glance, 'ch-act', BOARD);
  await expect(page.locator('div[role="main"] .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  const bag = await glance.storage();
  const rows = (bag.log || []).filter((r) => r && r.kind === 'written' && r.messageId === 'm-ch-act');
  expect(rows.length).toBeGreaterThan(0);
  rows.forEach((r) => {
    expect(r.label).not.toMatch(/Log this decision/i);
    expect(r.label).toMatch(/file|Drive/i);
  });
});

test('a step 1 that cannot read the file is an honest error and writes nothing', async ({ glance }) => {
  const page = await run(glance, 'ch-gone', GONE);
  await expect(page.locator('li[data-step-id="file"]')).toContainText('Could not read the attachment from Gmail', { timeout: 15000 });
  expect(uploads()).toHaveLength(0);
  expect(folderMakes()).toHaveLength(0);
});

test('a sign-in page in place of the file is not saved as the file', async ({ glance }) => {
  const page = await run(glance, 'ch-signin', SIGNIN);
  await expect(page.locator('li[data-step-id="file"]')).toContainText('Could not read the attachment from Gmail', { timeout: 15000 });
  expect(uploads()).toHaveLength(0);
});
