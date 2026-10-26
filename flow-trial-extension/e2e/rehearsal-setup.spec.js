// Scenario rehearsal — a fresh install to the first proved close (paid-readiness-bar.md setup_minutes).
// Empty profile: open the panel, Connect Google (the one consent screen is the stubbed getAuthToken),
// open a mail with a dated ask, Do It, and wait for Handled after the task is read back. It counts the
// person's clicks in Glance, the consent screens, and the machine seconds. The machine seconds are not
// setup_minutes: a person reads, decides and passes Google's own screen. Only the owner's stopwatch
// with five people fills that value.
const { test, expect } = require('./support/harness');
const S = require('./support/sentences');

test('setup: a fresh install reaches a proved close with one consent screen', async ({ glance }, testInfo) => {
  const t0 = Date.now();
  let clicks = 0;
  const popup = await glance.openPopup();
  await popup.getByRole('button', { name: 'התחבר ל-Google' }).click();
  clicks += 1;
  await expect(popup.locator('#statusPill')).toHaveText('Google connected');
  const auth = await glance.authCalls();
  const flows = await glance.flows();
  const consentScreens = auth.filter((c) => c.interactive === true).length + flows.filter((f) => f.interactive !== false).length;
  expect(consentScreens).toBeLessThanOrEqual(1);
  const connected = await glance.storage();
  expect(connected.onboarded).toBe(true);

  await glance.evaluateWorker(() => { globalThis.__glanceE2e.tokenAccounts = { 'ya29.e2e': 'me@x.com' }; });
  const page = await glance.openGmail({
    messageId: 'm-setup-1',
    threadId: 't-setup-1',
    subject: 'Contract',
    senderEmail: S.SENDER,
    senderName: 'flow',
    body: S.HEBREW_TASK
  });
  await page.locator('div[role="main"] button.flow-chip').click({ timeout: 20000 });
  clicks += 1;
  await expect(page.locator('div[role="main"] .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  const calls = await glance.apiCalls();
  const post = calls.findIndex((c) => c.method === 'POST' && c.url.indexOf('tasks.googleapis.com') >= 0);
  expect(post).toBeGreaterThanOrEqual(0);
  expect(calls.slice(post + 1).some((c) => c.method === 'GET' && /\/tasks\/e2e-gtask-/.test(c.url))).toBe(true);
  const seconds = Math.round((Date.now() - t0) / 100) / 10;

  testInfo.annotations.push({ type: 'setup', description: 'clicks=' + clicks + ' consent_screens=' + consentScreens + ' machine_seconds=' + seconds });
  console.log('[rehearsal] setup clicks=' + clicks + ' consent_screens=' + consentScreens + ' machine_seconds=' + seconds);
  expect(clicks).toBeLessThanOrEqual(2);
});
