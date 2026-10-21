// P0: web-flow Connect (gstvm1) must write with the stored token, not hsd2u2 getAuthToken.
const { test, expect } = require('./support/harness');
const { startGoogleLaneServer } = require('./support/google-lane-server');
const S = require('./support/sentences');

const SELF = 'ai.local.flow@gmail.com';
const V1_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/tasks'
].sort().join('\n');

const TASK = 'Could you review the deck and reply with your comments?';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEK = new Date(Date.now() + 7 * 24 * 3600 * 1000);
const HOLD = 'Put the glance-pricing-q4.pdf file on my calendar on ' + MONTHS[WEEK.getMonth()] + ' ' + WEEK.getDate() + ', ' + WEEK.getFullYear() + ' at 10:00.';

let laneServer;

test.beforeAll(async () => {
  laneServer = await startGoogleLaneServer();
});

test.afterAll(async () => {
  if (laneServer) await laneServer.close();
});

async function seedWebOnly(glance) {
  await glance.setAuthFail(true);
  await glance.evaluateWorker((email) => {
    globalThis.__glanceE2e.identityToken = 'ya29.chrome-stale';
    globalThis.__glanceE2e.tokenAccounts = { 'ya29.web-v1': email };
  }, SELF);
  await glance.seedGmail({
    googleWebAuth: {
      accessToken: 'ya29.web-v1',
      source: 'web',
      expiresAt: Date.now() + 60 * 60 * 1000,
      loginHint: SELF
    },
    googleGrantedScopes: { version: V1_SCOPES, status: 'granted', source: 'web', at: Date.now() },
    googleConnectedAccount: { email: SELF, source: 'web', at: Date.now() }
  });
}

test('web-only grant: Tasks Do It succeeds with ProofOfClose and no Reconnect', async ({ glance }) => {
  await seedWebOnly(glance);
  const page = await glance.openGmail({
    messageId: 'm-task-web',
    threadId: 't-task-web',
    subject: 'Deck',
    senderEmail: S.SENDER,
    senderName: 'flow',
    ownEmail: SELF,
    to: [SELF],
    body: TASK
  });
  const chip = page.locator('div[role="main"] button.flow-chip');
  await expect(chip).toBeVisible({ timeout: 20000 });
  await chip.click();
  await expect(page.locator('div[role="main"] .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  const bag = await glance.storage();
  expect(bag.googleReconnect).toBeFalsy();
  const calls = await glance.apiCalls();
  expect(calls.some((c) => c.url.indexOf('tasks.googleapis.com') >= 0 && c.method === 'POST')).toBe(true);
});

test('web-only grant: Calendar event create returns ProofOfClose and no Reconnect', async ({ glance }) => {
  laneServer.reset();
  laneServer.setAccount(SELF);
  await glance.evaluateWorker((origin) => {
    globalThis.__glanceE2e.httpOrigin = origin;
  }, laneServer.origin);
  await seedWebOnly(glance);
  const dateIso = WEEK.getFullYear() + '-' + String(WEEK.getMonth() + 1).padStart(2, '0') + '-' + String(WEEK.getDate()).padStart(2, '0');
  const out = await glance.evaluateWorker(async (holdDate) => {
    const C = globalThis.FlowGoogleConfig;
    const res = await globalThis.FlowGoogleLane.write('googleHold', {
      dateIso: holdDate,
      hour: 10,
      minute: 0,
      fileUrl: 'https://drive.google.com/file/d/pricing-pdf/view',
      fileName: 'glance-pricing-q4.pdf',
      fileTerm: 'glance-pricing-q4.pdf',
      scopes: [C.SCOPE_CALENDAR, C.SCOPE_DRIVE_FILE, C.SCOPE_TASKS]
    });
    const bag = await chrome.storage.local.get('googleReconnect');
    return { res, reconnect: bag.googleReconnect };
  }, dateIso);
  expect(out.res && out.res.ok).toBe(true);
  expect(out.res.proof && out.res.proof.fetchedBack).toBe(true);
  expect(out.reconnect).toBeFalsy();
  expect(laneServer.calls.some((c) => c.method === 'POST' && c.path.indexOf('/calendar/v3/calendars/primary/events') >= 0)).toBe(true);
  expect(laneServer.calls.some((c) => c.method === 'GET' && c.path.indexOf('/events/') >= 0)).toBe(true);
});

test('a PDF attachment still gets a Reply card under the six v1 scopes', async ({ glance }) => {
  await seedWebOnly(glance);
  const page = await glance.openGmail({
    messageId: 'm-pdf',
    threadId: 't-pdf',
    subject: 'Board pack',
    senderEmail: 'dana@acme.io',
    senderName: 'Dana',
    ownEmail: SELF,
    to: [SELF],
    body: 'Please save the attached pdf to Drive.',
    downloadUrl: 'application/pdf:board.pdf:https://mail.google.com/e2e/att/board.pdf'
  });
  const card = page.locator('[data-legacy-message-id="m-pdf"] .flow-chip-host');
  await expect(card).toBeVisible({ timeout: 20000 });
  await expect(card.locator('.gs-intent')).toContainText(/Reply|Save|Drive/i);
});
