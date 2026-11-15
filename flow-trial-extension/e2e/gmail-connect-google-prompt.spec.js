// When Google is not connected and silent auto-connect fails, Gmail must still
// show the normal suggestion with a single Connect Google action — not drop
// the card. Outlook connected + no Google + authFail mirrors David's store
// Gate profile. Board pack is the save-to-Drive ask from that Gate.
const { test, expect } = require('./support/harness');
const { startGoogleLaneServer } = require('./support/google-lane-server');

const OWN = 'ai.local.flow@gmail.com';
const ASKER = 'salisapan1@gmail.com';
const ASK = 'Please save the attached pdf to Drive.';
const BOARD = 'application/pdf:board-pack.pdf:https://mail.google.com/e2e/att/board.pdf';
const ATT_URL = 'https://mail.google.com/e2e/att/board.pdf';

let server;

test.beforeAll(async () => { server = await startGoogleLaneServer(); });
test.afterAll(async () => { if (server) await server.close(); });
test.beforeEach(async ({ glance }) => {
  server.reset();
  await glance.evaluateWorker((origin) => { globalThis.__glanceE2e.httpOrigin = origin; }, server.origin);
});

async function openBoardNoGoogle(glance) {
  await glance.seedOutlook({ glanceUiLanguage: 'he' });
  await glance.setAuthFail(true);
  await glance.context.route('https://mail.google.com/e2e/**', (r) => r.fulfill({
    status: 200, contentType: 'application/pdf', body: Buffer.from('%PDF-e2e-board')
  }));
  const page = await glance.openGmail({
    messageId: 'm-board-connect',
    threadId: 't-board-connect',
    subject: 'Board pack',
    ownEmail: OWN,
    senderEmail: ASKER,
    senderName: 'Sali Sapan',
    to: [OWN],
    body: ASK,
    downloadUrl: BOARD,
    lang: 'he',
    composeReply: true,
    composeTo: ASKER,
    composeSubject: 'Re: Board pack'
  });
  return page;
}

function connectButton(page) {
  return page.locator('div[role="main"] .do-halo, div[role="main"] button.flow-chip').filter({
    hasText: /Connect Google|התחבר ל-Google/
  }).first();
}

test('Board pack offers Connect Google when silent Google connect fails', async ({ glance }) => {
  const page = await openBoardNoGoogle(glance);
  await expect(connectButton(page)).toBeVisible({ timeout: 20000 });
  const hosts = page.locator('div[role="main"] .flow-chip-host');
  await expect(hosts).toHaveCount(1);
  // The card is the suggestion, not a handled receipt — nothing auto-ran.
  await expect(page.locator('div[role="main"] .flow-chip-handled')).toHaveCount(0);
  const bag = await glance.storage();
  expect(bag.googleTasksAuth || null).toBe(null);
  expect(bag.connectorId || null).not.toBe('googleTasks');
});

test('Connect Google then Do It saves the Board pack after a clean connect', async ({ glance }) => {
  const page = await openBoardNoGoogle(glance);
  const btn = connectButton(page);
  await expect(btn).toBeVisible({ timeout: 20000 });

  await glance.setAuthFail(false);
  const stamp = await glance.now();
  await btn.click();

  await expect.poll(async () => {
    const calls = await glance.authCalls();
    return calls.some((c) => c.at > stamp && c.interactive === true);
  }, { timeout: 15000 }).toBe(true);

  await expect(page.locator('div[role="main"] .flow-chip-handled')).toBeVisible({ timeout: 25000 });
  const bag = await glance.storage();
  expect(bag.onboarded).toBe(true);
  expect(bag.connectorId).toBe('googleTasks');
  expect(bag.googleTasksAuth && bag.googleTasksAuth.taskListId).toBeTruthy();
  const uploads = server.calls.filter((c) => c.method === 'POST' && String(c.path || '').indexOf('/upload/drive/v3/files') >= 0);
  expect(uploads.length).toBeGreaterThanOrEqual(1);
});
