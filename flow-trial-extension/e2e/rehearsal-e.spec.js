// Scenario rehearsal E — the contract, and the invoice that waits (holistic-close-map.md §4, catalog X1/F1/U3/Y2).
// Gmail against the local Google lane server. The mail asks for the signed הסכם and Drive holds one PDF.
// Glance finds it and drafts nothing until asked, sends nothing, and says the contract closes only on the
// sent file. "Needs a signature", the reply preview with an approved send, and the Friday follow-up as one
// chain do not exist yet. In the same sitting, "תוציאי חשבונית מס" opens nothing and writes nothing (Y2 on hold).
const { test, expect } = require('./support/harness');
const { startGoogleLaneServer } = require('./support/google-lane-server');
const { expectedMissing, SEND_URL } = require('./support/rehearsal');
const S = require('./support/sentences');

const ASK = 'שלחי לי בבקשה את ההסכם החתום.';
const CONTRACT = { id: 'hskm-dana', name: 'הסכם.pdf', mimeType: 'application/pdf' };
const CARD = '#flow-follow-host';
const MAIN = 'div[role="main"]';

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
  return glance.openGmail({ messageId: 'm-e-' + id, threadId: 't-e-' + id, subject: 'הסכם', senderEmail: S.SENDER, senderName: 'Dana', body: body });
}

test('E1 the contract: found in Drive, not sent, done only when it is sent as a real file', async ({ glance }, testInfo) => {
  const page = await open(glance, 'contract', ASK, [CONTRACT]);
  const card = page.locator(CARD);
  await expect(card).toContainText('הסכם.pdf', { timeout: 20000 });
  await expect(card).toContainText('לא נשלחה');
  await expect(card).toContainText('כקובץ אמיתי');
  await page.waitForTimeout(1500);
  expect(server.calls.filter((c) => c.method !== 'GET')).toHaveLength(0);
  expect(server.calls.some((c) => SEND_URL.test(c.path))).toBe(false);

  expectedMissing(testInfo, 'U3', 'the steps list says the found PDF needs a signature; the person signs on their machine; Glance does not sign');
  expectedMissing(testInfo, 'row 53, X1', 'the reply is a preview; the person approves; the close is the sent attachment, read back');
  expectedMissing(testInfo, 'X1, C1', 'a Friday follow-up event on the same steps list, with its own GET');
});

test('E2 "תוציאי חשבונית מס" in the same sitting: no card, no write, nothing Handled', async ({ glance }) => {
  const page = await open(glance, 'invoice', 'תוציאי חשבונית מס על הריטיינר.', []);
  await page.waitForTimeout(7000);
  await expect(page.locator(MAIN + ' .flow-chip-host')).toHaveCount(0);
  await expect(page.locator(CARD)).toHaveCount(0);
  expect(server.calls.filter((c) => c.method !== 'GET')).toHaveLength(0);
  const calls = await glance.apiCalls();
  expect(calls.some((c) => /morning|greeninvoice/i.test(c.url))).toBe(false);
});

test('E3 Gate: the contract mail has one offer, and nothing calls a draft plus a task closed', async ({ glance }) => {
  test.fail(true, 'Today the same mail shows the resolution card AND the Reply & Track chip (src/content-gmail.js file-ask branch does not step aside for FlowResolution.owns). The chip Do It writes a draft and a task and says "Handled … Closed — set a reminder", while the card says done only when the file is sent.');
  const page = await open(glance, 'one', ASK, [CONTRACT]);
  await expect(page.locator(CARD)).toContainText('הסכם.pdf', { timeout: 20000 });
  await page.waitForTimeout(2000);
  await expect(page.locator(MAIN + ' .flow-chip-host')).toHaveCount(0, { timeout: 1000 });
});
