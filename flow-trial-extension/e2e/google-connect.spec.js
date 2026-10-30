const { test, expect } = require('./support/harness');

// Disconnect evicts the cached token (one interactive:false call) and must
// not open a window. A getAuthToken failure that is a user cancel does not
// fall through to launchWebAuthFlow (0.9.39, open-tasks row 50).

async function connectButton(page) {
  return page.getByRole('button', { name: 'התחבר ל-Google' });
}

test('Disconnect does not silently reconnect until Connect is clicked', async ({ glance }) => {
  const page = await glance.openPopup();
  await (await connectButton(page)).click();
  await expect(page.locator('#statusPill')).toHaveText('Google connected');
  const bagOn = await glance.storage();
  expect(bagOn.googleTasksAuth && bagOn.googleTasksAuth.taskListId).toBe('glance-list');

  const pagesBefore = glance.context.pages().length;
  await page.getByRole('button', { name: 'Disconnect' }).click();
  await expect(await connectButton(page)).toBeVisible();
  const stamp = await glance.now();
  await expect.poll(async () => {
    const bag = await glance.storage();
    const calls = await glance.authCalls();
    const flows = await glance.flows();
    const lateToken = calls.some((c) => c.at > stamp && c.interactive === false && !c.removeCached);
    const lateFlow = flows.some((c) => c.at > stamp);
    const pages = glance.context.pages().length;
    if (bag.googleTasksAuth) return 'reconnected';
    if (lateToken) return 'late-token';
    if (lateFlow) return 'late-flow';
    if (pages > pagesBefore) return 'popup';
    return 'quiet';
  }).toBe('quiet');

  await (await connectButton(page)).click();
  await expect(page.locator('#statusPill')).toHaveText('Google connected');
  const again = await glance.storage();
  expect(again.googleTasksAuth && again.googleTasksAuth.taskListId).toBe('glance-list');
  expect(again.googleWebAuth && again.googleWebAuth.accessToken).toBeTruthy();
  await expect(page.locator('[data-provider="google"]')).toHaveCount(1);
  await expect(page.locator('[data-provider="meta"]')).toHaveCount(1);

  await glance.seed({ googleReconnect: { needed: true, reason: '401' } });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-provider="google"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Reconnect Google' }).click();
  await expect(page.locator('#statusPill')).toHaveText('Google connected');
  await expect(page.locator('[data-provider="google"]')).toHaveCount(1);
  await expect(page.locator('[data-provider="meta"]')).toHaveCount(1);
  const kept = await glance.storage();
  expect(kept.googleWebAuth && kept.googleWebAuth.accessToken).toBeTruthy();
  expect(kept.googleReconnect || null).toBe(null);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#statusPill')).toHaveText('Google connected');
  await expect(page.locator('[data-provider="google"]')).toHaveCount(1);
  await expect(page.locator('[data-provider="meta"]')).toHaveCount(1);
});

test('an expired implicit token tries prompt=none before Reconnect', async ({ glance }) => {
  const out = await glance.evaluateWorker(async () => {
    const e = globalThis.__glanceE2e;
    e.authCalls = [];
    e.flows = [];
    e.authFail = true;
    await chrome.storage.local.set({
      googleTasksAuth: { taskListId: 'glance-list' },
      googleEverConnected: { connected: true },
      googleWebAuth: {
        accessToken: 'ya29.expired',
        source: 'web',
        expiresAt: Date.now() - 5000,
        loginHint: 'ai.local.flow@gmail.com'
      }
    });
    await chrome.storage.local.remove('googleReconnect');
    const session = await globalThis.FlowGoogleAccess.refreshSession();
    const bag = await new Promise((resolve) => chrome.storage.local.get(null, resolve));
    return {
      session: session,
      flows: e.flows.slice(),
      calls: e.authCalls.slice(),
      log: bag.glanceAuthLog || [],
      reconnect: bag.googleReconnect || null
    };
  });
  expect(out.session && out.session.ok).toBe(false);
  expect(out.calls.some((c) => c.interactive === false)).toBe(true);
  expect(out.calls.some((c) => c.interactive === true)).toBe(false);
  expect(out.flows.length).toBe(1);
  const url = new URL(out.flows[0].url);
  expect(url.searchParams.get('prompt')).toBe('none');
  expect(out.flows[0].interactive).toBe(false);
  expect(url.searchParams.get('login_hint')).toBe('ai.local.flow@gmail.com');
  expect(url.searchParams.get('scope')).toContain('https://www.googleapis.com/auth/tasks');
  expect(out.reconnect && out.reconnect.needed).toBe(true);
  expect(out.log.some((line) => line.indexOf('"call":"launchWebAuthFlow"') >= 0 && line.indexOf('"prompt":"none"') >= 0)).toBe(true);
  expect(out.log.some((line) => line.indexOf('"state":"reconnect"') >= 0)).toBe(true);
});

test('meta.connected=true does not change the status pill; Google and Outlook rows stay', async ({ glance }) => {
  await glance.seed({
    onboarded: true,
    connectorId: 'googleTasks',
    googleTasksAuth: { taskListId: 'glance-list' },
    googleWebAuth: { accessToken: 'ya29.e2e', expiresAt: Date.now() + 60 * 60 * 1000 },
    googleConnectedAccount: { email: 'me@x.com', at: Date.now(), source: 'web' },
    googleGrantedScopes: { version: 'openid\nhttps://www.googleapis.com/auth/tasks', status: 'granted', source: 'chrome', at: Date.now() },
    outlookAuth: { token: { accessToken: 'AT-e2e', expiresAt: Date.now() + 3600000 }, account: { address: 'me@x.com' } },
    meta: { connected: true }
  });
  const page = await glance.openPopup();
  await expect(page.locator('#statusPill')).toHaveText('Google connected');
  await expect(page.locator('[data-provider="google"]')).toHaveCount(1);
  await expect(page.locator('[data-provider="meta"]')).toHaveCount(1);
  await expect(page.locator('.conn').filter({ has: page.locator('b', { hasText: 'Outlook' }) })).toHaveCount(1);
  await expect(page.locator('[data-provider="meta"] .badge')).not.toHaveClass(/\bon\b/);
});

test('getAuthToken failure leaves Google disconnected and does not open a window', async ({ glance }) => {
  await glance.setAuthFail(true);
  const page = await glance.openPopup();
  const pagesBefore = glance.context.pages().length;
  await (await connectButton(page)).click();
  await expect(page.locator('.conn-err')).toBeVisible();
  const bag = await glance.storage();
  expect(bag.googleTasksAuth || null).toBe(null);
  const flows = await glance.flows();
  expect(flows.length).toBe(0);
  expect(glance.context.pages().length).toBe(pagesBefore);
  await expect(page.locator('#statusPill')).toHaveText('לא מחובר');
});
