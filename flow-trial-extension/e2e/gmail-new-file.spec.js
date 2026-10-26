// An empty Google Doc, Sheet or Slides deck from a request, on the real Gmail card, behind the owner's
// off switch WORKSPACE_FILE in glanceSwitches. Unpacked extension, real Gmail page flow, local Google
// lane server. Switch off: no card. On: the canonical Do It card with the step list, one native file
// made in Drive with the name asked, read back by id, a receipt, Undo trashing it only while it is unedited.
const { test, expect } = require('./support/harness');
const { startGoogleLaneServer } = require('./support/google-lane-server');
const S = require('./support/sentences');

const DOC = 'Can you create a shared doc called Q4 launch plan?';
const SHEET = 'Could you open a new spreadsheet named "Vendor payments"?';
const DECK = 'Can you create a slide deck called Board update Q4?';
const PLAIN = 'Please send me the Q4 numbers by Friday.';

let server;
test.beforeAll(async () => { server = await startGoogleLaneServer(); });
test.afterAll(async () => { if (server) await server.close(); });
test.beforeEach(async ({ glance }) => {
  server.reset();
  server.setAccount('me@x.com');
  await glance.evaluateWorker((origin) => { globalThis.__glanceE2e.httpOrigin = origin; }, server.origin);
});

async function open(glance, switches, body, id) {
  await glance.seedGmail(switches ? { glanceSwitches: switches } : {});
  return glance.openGmail({ messageId: 'm-' + id, threadId: 't-' + id, subject: 'Q4', senderEmail: S.SENDER, senderName: 'flow', body: body });
}
const created = () => server.calls.filter((c) => c.method === 'POST' && /\/drive\/v3\/files/.test(c.path));

test('WORKSPACE_FILE off: a request to create a doc shows no new-file card and writes nothing to Drive', async ({ glance }) => {
  const page = await open(glance, null, DOC, 'off');
  await page.waitForTimeout(5000);
  await expect(page.locator('div[role="main"]')).not.toContainText('empty doc');
  expect(created()).toHaveLength(0);
});

test('WORKSPACE_FILE on: the card offers an empty Doc, Do It creates it, reads it back, and Undo trashes it', async ({ glance }) => {
  const page = await open(glance, { WORKSPACE_FILE: true }, DOC, 'doc');
  const chip = page.locator('div[role="main"] button.flow-chip');
  await expect(chip).toBeVisible({ timeout: 20000 });
  await expect(page.locator('div[role="main"]')).toContainText('Q4 launch plan');
  await chip.click();
  await expect(page.locator('div[role="main"] .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  const posts = created();
  expect(posts).toHaveLength(1);
  expect(posts[0].body.name).toBe('Q4 launch plan');
  expect(posts[0].body.mimeType).toBe('application/vnd.google-apps.document');
  expect(Object.keys(posts[0].body).sort()).toEqual(['mimeType', 'name']);
  const id = server.last.file;
  expect(server.calls.some((c) => c.method === 'GET' && c.path.indexOf('/drive/v3/files/' + id) >= 0)).toBe(true);
  expect(server.calls.some((c) => /permissions|batchUpdate|values|spreadsheets/.test(c.path))).toBe(false);
  await page.locator('div[role="main"] button.flow-chip-undo').click();
  await expect.poll(() => server.calls.some((c) => c.method === 'PATCH' && c.path.indexOf('/drive/v3/files/' + id) >= 0 && c.body && c.body.trashed === true)).toBe(true);
});

test('WORKSPACE_FILE on: a named spreadsheet and a slide deck are native Sheets and Slides files', async ({ glance }) => {
  let page = await open(glance, { WORKSPACE_FILE: true }, SHEET, 'sheet');
  await page.locator('div[role="main"] button.flow-chip').click();
  await expect(page.locator('div[role="main"] .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  expect(created().pop().body.mimeType).toBe('application/vnd.google-apps.spreadsheet');
  server.reset();
  server.setAccount('me@x.com');
  page = await open(glance, { WORKSPACE_FILE: true }, DECK, 'deck');
  await page.locator('div[role="main"] button.flow-chip').click();
  await expect(page.locator('div[role="main"] .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  expect(created().pop().body.mimeType).toBe('application/vnd.google-apps.presentation');
});

test('WORKSPACE_FILE on: an ordinary mail is not a new-file card', async ({ glance }) => {
  const page = await open(glance, { WORKSPACE_FILE: true }, PLAIN, 'plain');
  await page.waitForTimeout(5000);
  expect(created()).toHaveLength(0);
});

test('WORKSPACE_FILE on: Undo refuses after the person edited the file, and the file stays', async ({ glance }) => {
  const page = await open(glance, { WORKSPACE_FILE: true }, DOC, 'edit');
  await page.locator('div[role="main"] button.flow-chip').click();
  await expect(page.locator('div[role="main"] .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  const id = server.last.file;
  server.editFile(id, { name: 'Q4 launch plan (draft 2)' });
  const before = server.calls.length;
  await page.locator('div[role="main"] button.flow-chip-undo').click();
  await expect(page.locator('div[role="main"]')).toContainText('You edited this. Undo left it alone.');
  expect(server.calls.slice(before).every((c) => c.method === 'GET')).toBe(true);
  expect(server.calls.some((c) => c.method === 'PATCH' && c.body && c.body.trashed === true)).toBe(false);
});

test('WORKSPACE_FILE on: after a reload the file already made is a receipt, not a second offer', async ({ glance }) => {
  const page = await open(glance, { WORKSPACE_FILE: true }, DOC, 'reload');
  await page.locator('div[role="main"] button.flow-chip').click();
  await expect(page.locator('div[role="main"] .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  await page.reload();
  await expect(page.locator('div[role="main"] .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  expect(created()).toHaveLength(1);
});
