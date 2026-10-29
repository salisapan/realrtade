// Scenario rehearsal B — the receipt leaves (holistic-close-map.md §4, slice 3, catalog Y1).
// Gmail, Hebrew, against the local Google lane server. Glance finds the one receipt, drafts the
// reply with it and sends nothing. With no file and no payment it asks whether it was paid and
// drafts nothing. The approved send and its read-back do not exist yet (open-tasks row 53).
const { test, expect } = require('./support/harness');
const { startGoogleLaneServer } = require('./support/google-lane-server');
const { expectedMissing, SEND_URL } = require('./support/rehearsal');
const { bind: bindV1ScopeGates } = require('./support/v1-scope-gates');
const { testIfDriveReadonly, driveReadonlyInManifest } = bindV1ScopeGates(test);
const S = require('./support/sentences');

const ASK = 'תשלחי לי את הקבלה על 3,850 ₪.';
const RECEIPT = { id: 'rcpt-3850', name: 'קבלה 3850.pdf', mimeType: 'application/pdf' };
const CARD = '#flow-follow-host';

let server;
test.beforeAll(async () => { server = await startGoogleLaneServer(); });
test.afterAll(async () => { if (server) await server.close(); });
test.beforeEach(async ({ glance }) => {
  server.reset();
  server.setAccount('me@x.com');
  await glance.evaluateWorker((origin) => {
    globalThis.__glanceE2e.httpOrigin = origin;
    globalThis.__glanceE2e.tokenAccounts = { 'ya29.e2e': 'me@x.com' };
  }, server.origin);
});

async function open(glance, id, body, hits) {
  server.driveHits(hits || []);
  await glance.seedGmail({ googleConnectedAccount: { email: 'me@x.com', at: Date.now(), source: 'web' } });
  return glance.openGmail({ messageId: 'm-b-' + id, threadId: 't-b-' + id, subject: 'קבלה', senderEmail: S.SENDER, senderName: 'Dana', body: body });
}

const writes = () => server.calls.filter((c) => c.method !== 'GET');

test('v1 without drive.readonly: receipt follow card stays off even when Drive stub has a file', async ({ glance }) => {
  expect(driveReadonlyInManifest).toBe(false);
  const page = await open(glance, 'v1-off', ASK, [RECEIPT]);
  await page.waitForTimeout(7000);
  await expect(page.locator(CARD)).toHaveCount(0);
  expect(server.calls.some((c) => /\/drive\/v3\/files/.test(c.path))).toBe(false);
});

testIfDriveReadonly(
  'B1 one receipt in Drive: the card names it, the reply is drafted with it, nothing is sent or Handled',
  async ({ glance }, testInfo) => {
  const page = await open(glance, 'one', ASK, [RECEIPT]);
  const card = page.locator(CARD);
  await expect(card).toContainText('קבלה 3850.pdf', { timeout: 20000 });
  await expect(card).toContainText('לא נשלחה');
  await expect(card).toContainText('3,850 ₪');
  await expect(page.locator('div[role="main"] .flow-chip-host')).toHaveCount(0);
  await card.getByRole('button', { name: 'הכיני תשובה עם הקובץ' }).click();
  await expect.poll(() => server.calls.some((c) => c.method === 'POST' && c.path === '/gmail/v1/users/me/drafts'), { timeout: 20000 }).toBe(true);
  await expect(card).not.toContainText('Handled');
  expect(server.calls.some((c) => SEND_URL.test(c.path))).toBe(false);

  expectedMissing(testInfo, 'row 53 (Mail.Send preview), Y1', 'approve the send, read the sent message back with the receipt attached, then Handled');
  expectedMissing(testInfo, 'row 53, Y1', 'the receipt remounts after reload; Undo before approve deletes the draft');
  },
  async ({ glance }) => {
    expect(driveReadonlyInManifest).toBe(false);
    const page = await open(glance, 'one-off', ASK, [RECEIPT]);
    await page.waitForTimeout(7000);
    await expect(page.locator(CARD)).toHaveCount(0);
    expect(server.calls.some((c) => /\/drive\/v3\/files/.test(c.path))).toBe(false);
    expect(writes()).toHaveLength(0);
  }
);

testIfDriveReadonly(
  'B2 no file and no payment seen: the card asks whether it was paid and drafts nothing',
  async ({ glance }) => {
  const page = await open(glance, 'none', ASK, []);
  const card = page.locator(CARD);
  await expect(card).toContainText('האם שולם', { timeout: 20000 });
  await expect(card.getByRole('button', { name: 'כן, שולם' })).toBeVisible();
  await page.waitForTimeout(1500);
  expect(writes()).toHaveLength(0);
  },
  async ({ glance }) => {
    expect(driveReadonlyInManifest).toBe(false);
    const page = await open(glance, 'none-off', ASK, []);
    await page.waitForTimeout(7000);
    await expect(page.locator(CARD)).toHaveCount(0);
    expect(server.calls.some((c) => /\/drive\/v3\/files/.test(c.path))).toBe(false);
    expect(writes()).toHaveLength(0);
  }
);

test('B3 asking accounting to send the receipt shows no card and writes nothing', async ({ glance }) => {
  const page = await open(glance, 'third', 'Can you ask accounting to send the receipt?', [RECEIPT]);
  await page.waitForTimeout(7000);
  await expect(page.locator(CARD)).toHaveCount(0);
  await expect(page.locator('div[role="main"] .flow-chip-host')).toHaveCount(0);
  expect(writes()).toHaveLength(0);
});

// Known Gate failures. test.fail: the step fails today; when it is fixed the run turns red and the row is updated.
test('B4 Gate: two receipts with the same kind of name show no card', async ({ glance }) => {
  const page = await open(glance, 'two', ASK, [RECEIPT, { id: 'rcpt-3850-b', name: 'קבלה 3850 (1).pdf', mimeType: 'application/pdf' }]);
  await page.waitForTimeout(7000);
  await expect(page.locator(CARD)).toHaveCount(0, { timeout: 1000 });
});

testIfDriveReadonly(
  'B5 Gate: a Hebrew receipt card has no English buttons',
  async ({ glance }) => {
  const page = await open(glance, 'he', ASK, [RECEIPT]);
  const card = page.locator(CARD);
  await expect(card).toContainText('קבלה 3850.pdf', { timeout: 20000 });
  const labels = await card.locator('button').allInnerTexts();
  expect(labels.filter((l) => /[A-Za-z]/.test(l))).toEqual([]);
  },
  async ({ glance }) => {
    expect(driveReadonlyInManifest).toBe(false);
    const page = await open(glance, 'he-off', ASK, [RECEIPT]);
    await page.waitForTimeout(7000);
    await expect(page.locator(CARD)).toHaveCount(0);
    expect(server.calls.some((c) => /\/drive\/v3\/files/.test(c.path))).toBe(false);
  }
);
