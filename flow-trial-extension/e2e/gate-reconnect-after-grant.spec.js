// Gate e1695c85: after the person grants Google, the popup leaves
// «התחבר ל-Google». A reload whose first silent getAuthToken misses retries
// once and does not paint the connection as expired before that retry.
// Nothing is sent. Scopes stay the manifest set.
const { test, expect } = require('./support/harness');

test('after an interactive grant the popup is connected, not «התחבר ל-Google»', async ({ glance }) => {
  const page = await glance.openPopup();
  await page.getByRole('button', { name: 'התחבר ל-Google' }).click();
  await expect(page.locator('#statusPill')).toHaveText(/connected|מחובר/, { timeout: 20000 });
  await expect(page.getByRole('button', { name: 'התחבר ל-Google' })).toHaveCount(0);
  const bag = await glance.storage();
  expect(bag.googleTasksAuth).toBeTruthy();
  expect(bag.googleWebAuth && bag.googleWebAuth.accessToken).toBeTruthy();
  expect(bag.googleReconnect || null).toBeNull();
});

test('a reload whose first silent getAuthToken misses retries once and does not mark the grant expired', async ({ glance }) => {
  await glance.evaluateWorker(async () => {
    const e = globalThis.__glanceE2e;
    e.authCalls = [];
    e.silentMisses = 1;
    e.savedGoogleAuthToken = e.googleAuthToken;
    e.googleAuthToken = function (interactive) {
      e.authCalls.push({ interactive: Boolean(interactive), at: Date.now() });
      if (!interactive && e.silentMisses > 0) {
        e.silentMisses -= 1;
        return Promise.reject(new Error('The user is not signed in.'));
      }
      return Promise.resolve(e.identityToken || 'ya29.e2e');
    };
    await chrome.storage.local.set({
      googleTasksAuth: { taskListId: 'glance-list' },
      googleEverConnected: { connected: true },
      googleWebAuth: {
        accessToken: 'ya29.e2e',
        source: 'chrome',
        obtainedAt: Date.now(),
        expiresAt: Date.now() + 60 * 60 * 1000
      }
    });
    await chrome.storage.local.remove('googleReconnect');
  });
  const out = await glance.evaluateWorker(async () => {
    const session = await globalThis.FlowGoogleAccess.refreshSession();
    const bag = await new Promise((resolve) => chrome.storage.local.get(null, resolve));
    const e = globalThis.__glanceE2e;
    return {
      ok: session && session.ok,
      source: session && session.source,
      silent: (e.authCalls || []).filter((c) => c.interactive === false).length,
      interactive: (e.authCalls || []).filter((c) => c.interactive === true).length,
      reconnect: bag.googleReconnect || null
    };
  });
  expect(out.ok).toBe(true);
  expect(out.silent).toBeGreaterThanOrEqual(2);
  expect(out.interactive).toBe(0);
  expect(out.reconnect).toBeNull();
  const page = await glance.openPopup();
  await expect(page.locator('#statusPill')).toHaveText(/connected|מחובר/, { timeout: 20000 });
  await expect(page.getByRole('button', { name: 'התחבר ל-Google' })).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('החיבור ל-Google פג');
  await glance.evaluateWorker(() => {
    const e = globalThis.__glanceE2e;
    if (e.savedGoogleAuthToken) e.googleAuthToken = e.savedGoogleAuthToken;
    delete e.savedGoogleAuthToken;
    delete e.silentMisses;
  });
});
