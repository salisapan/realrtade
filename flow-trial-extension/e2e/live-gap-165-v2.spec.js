// Parity round on 9425cef. Each case is a live path the first fix missed:
// a single 401 keeps the token, a lagging read-back leaves nothing in Google
// that cannot be undone, a write goes to the account of the tab, a mail the
// person is only copied on never gets a card of any kind, and a reply draft
// finds its thread from the real Gmail header. Headless Chromium, a local
// server that behaves like the API, fixtures only.
const { test, expect } = require('./support/harness');
const { startGoogleLaneServer } = require('./support/google-lane-server');

const SELF = 'ai.local.flow@gmail.com';
const OTHER = 'sali.profile@gmail.com';
const CALL = "Let's have a call Tuesday at 15:00 about the pilot";
let server;

test.beforeAll(async () => { server = await startGoogleLaneServer(); });
test.afterAll(async () => { if (server) await server.close(); });
test.beforeEach(async ({ glance }) => {
  server.reset();
  await glance.evaluateWorker((origin) => {
    globalThis.__glanceE2e.httpOrigin = origin;
    globalThis.__glanceE2e.identityToken = '';
    globalThis.__glanceE2e.webFlowError = '';
    globalThis.__glanceE2e.authFail = false;
    if (globalThis.FlowGoogleLaneAccount && globalThis.FlowGoogleLaneAccount.forget) globalThis.FlowGoogleLaneAccount.forget();
    const id = chrome.identity;
    if (id && !id.__v2Stub) {
      const stub = function (details, cb) {
        const token = globalThis.__glanceE2e.identityToken;
        try { chrome.runtime.lastError = token ? undefined : { message: 'The user is not signed in.' }; } catch (e) { /* native lastError */ }
        if (typeof cb === 'function') cb(token || undefined);
      };
      try { Object.defineProperty(id, 'getAuthToken', { configurable: true, writable: true, value: stub }); id.__v2Stub = true; } catch (e) { /* real identity stays */ }
    }
  }, server.origin);
});

test.afterEach(async ({ glance }) => {
  await glance.evaluateWorker(() => {
    globalThis.__glanceE2e.identityToken = '';
    globalThis.__glanceE2e.webFlowError = '';
    globalThis.__glanceE2e.authFail = false;
    delete globalThis.__glanceE2e.httpOrigin;
  });
});

const opts = (id, lang, extra) => Object.assign({
  messageId: 'm-' + id, threadId: 't-' + id, subject: 'the pilot',
  senderEmail: 'dana@acme.io', senderName: 'Dana', ownEmail: SELF, to: [SELF], lang: lang || 'en', body: CALL
}, extra || {});

const main = (page) => page.locator('div[role="main"]');
const chip = (page) => page.locator('div[role="main"] button.flow-chip');
const eventIds = () => Object.keys(server.events());
const taskIds = () => Object.keys(server.tasks());

async function click(page) {
  await chip(page).click();
}

test.describe('1. a single 401 on a write', () => {
  test('one 401 on the Calendar write: one silent refresh, one retry, the event is written and the token stays', async ({ glance }) => {
    await glance.seedGmail({});
    server.rejectOnce('/calendar/v3/calendars/primary/events');
    const page = await glance.openGmail(opts('post401', 'en'));
    await click(page);
    await expect(page.locator('div[role="main"] .flow-chip-handled')).toBeVisible({ timeout: 25000 });
    expect(eventIds()).toHaveLength(1);
    const posts = server.calls.filter((c) => c.method === 'POST' && c.path === '/calendar/v3/calendars/primary/events');
    expect(posts).toHaveLength(2);
    const stored = await glance.storage();
    expect(stored.googleWebAuth && stored.googleWebAuth.accessToken).toBeTruthy();
    expect(stored.googleReconnect).toBeFalsy();
  });

  test('a 401 whose refresh fails for a reason other than revocation keeps the token', async ({ glance }) => {
    await glance.seedGmail({});
    server.rejectAuth('/calendar/v3/calendars/primary/events');
    const page = await glance.openGmail(opts('post401-keep', 'en'));
    await click(page);
    await expect(main(page)).toContainText(/Not closed|not signed|Reconnect/i, { timeout: 25000 });
    const stored = await glance.storage();
    expect(stored.googleWebAuth && stored.googleWebAuth.accessToken).toBeTruthy();
    const posts = server.calls.filter((c) => c.method === 'POST' && c.path === '/calendar/v3/calendars/primary/events');
    expect(posts).toHaveLength(2);
  });

  test('when consent is dropped, a Chrome token does not write and the flow stops at Reconnect', async ({ glance }) => {
    await glance.seedGmail({ googleConnectedAccount: { email: SELF, at: Date.now(), source: 'web' } });
    server.registerToken('ya29.chrome', SELF);
    await glance.evaluateWorker(() => {
      globalThis.__glanceE2e.identityToken = 'ya29.chrome';
      globalThis.__glanceE2e.webFlowError = 'Google sign-in failed (invalid_grant).';
    });
    server.rejectAuth('/calendar/v3/calendars/primary/events');
    const page = await glance.openGmail(opts('revoked-chrome', 'en'));
    await click(page);
    await expect(main(page)).toContainText(/Reconnect|Not closed|not signed/i, { timeout: 25000 });
    await expect(page.locator('div[role="main"] .flow-chip-done-icon')).toHaveCount(0);
    expect(eventIds()).toHaveLength(0);
    expect(taskIds()).toHaveLength(0);
    const stored = await glance.storage();
    expect(stored.googleReconnect && stored.googleReconnect.needed).toBe(true);
  });

  test('a refresh that fails with invalid_grant drops the consent', async ({ glance }) => {
    await glance.seedGmail({});
    await glance.evaluateWorker(() => { globalThis.__glanceE2e.webFlowError = 'Google sign-in failed (invalid_grant).'; });
    server.rejectAuth('/calendar/v3/calendars/primary/events');
    const page = await glance.openGmail(opts('post401-revoked', 'en'));
    await click(page);
    await expect(main(page)).toContainText(/Reconnect|Not closed/i, { timeout: 25000 });
    await expect.poll(async () => { const s = await glance.storage(); return !!(s.googleWebAuth && s.googleWebAuth.accessToken); }).toBe(false);
    const stored = await glance.storage();
    expect(stored.googleReconnect && stored.googleReconnect.needed).toBe(true);
  });
});

test.describe('2. a read-back that lags', () => {
  const tick = (page) => page.locator('div[role="main"] .flow-chip-done-icon');

  test('a read that is late by two answers is retried and the event is verified', async ({ glance }) => {
    await glance.seedGmail({});
    server.lagGets('/calendar/v3/calendars/primary/events/', 2);
    const page = await glance.openGmail(opts('lag-short', 'en'));
    await click(page);
    await expect(page.locator('div[role="main"] .flow-chip-handled')).toBeVisible({ timeout: 25000 });
    await expect(tick(page)).toHaveCount(1);
    expect(eventIds()).toHaveLength(1);
    expect(server.calls.filter((c) => c.method === 'GET' && c.path.indexOf('/events/') >= 0).length).toBeGreaterThanOrEqual(3);
  });

  test('a read that never answers in time: no checkmark, "Not verified", the id is kept and Undo deletes by it', async ({ glance }) => {
    await glance.seedGmail({});
    server.lagGets('/calendar/v3/calendars/primary/events/', 6);
    const page = await glance.openGmail(opts('lag-long', 'en'));
    await click(page);
    await expect(main(page)).toContainText('Not verified', { timeout: 30000 });
    await expect(tick(page)).toHaveCount(0);
    await expect(main(page)).not.toContainText(/could not find the event/i);
    expect(eventIds()).toHaveLength(1);
    const id = eventIds()[0];
    const stored = await glance.storage();
    const rows = Object.values(stored.glanceLaneUndo || {});
    expect(rows.length).toBeGreaterThan(0);
    expect(JSON.stringify(rows)).toContain(id);
    await page.locator('div[role="main"] button.flow-chip-undo').click();
    await expect.poll(() => eventIds().length + taskIds().length, { timeout: 15000 }).toBe(0);
    expect(server.calls.some((c) => c.method === 'DELETE' && c.path.indexOf('/events/' + id) >= 0)).toBe(true);
  });

  test('when read-backs stay 404 forever, Undo still DELETEs by id and does not claim removal without DELETE', async ({ glance }) => {
    await glance.seedGmail({});
    server.lagGets('/calendar/v3/calendars/primary/events/', 20);
    const page = await glance.openGmail(opts('lag-forever', 'en'));
    await click(page);
    await expect(main(page)).toContainText('Not verified', { timeout: 30000 });
    const id = eventIds()[0];
    expect(id).toBeTruthy();
    const getsBefore = server.calls.filter((c) => c.method === 'GET' && c.path.indexOf('/events/' + id) >= 0).length;
    await page.locator('div[role="main"] button.flow-chip-undo').click();
    await expect.poll(() => eventIds().length, { timeout: 15000 }).toBe(0);
    const deletes = server.calls.filter((c) => c.method === 'DELETE' && c.path.indexOf('/events/' + id) >= 0);
    expect(deletes.length).toBeGreaterThan(0);
    expect(getsBefore).toBeGreaterThan(0);
  });

  test('the same in the Hebrew UI says לא אומת, and a reopen reads Google again and then verifies', async ({ glance }) => {
    await glance.seedGmail({ glanceUiLanguage: 'he' });
    server.lagGets('/calendar/v3/calendars/primary/events/', 6);
    const page = await glance.openGmail(opts('lag-he', 'he'));
    await click(page);
    await expect(main(page)).toContainText('לא אומת', { timeout: 30000 });
    await expect(tick(page)).toHaveCount(0);
    expect(eventIds()).toHaveLength(1);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(tick(page)).toHaveCount(1, { timeout: 15000 });
    expect(eventIds()).toHaveLength(1);
  });
});

test.describe('3. the write goes to the account of the Gmail tab', () => {
  const posts = () => server.calls.filter((c) => c.method !== 'GET' && !/^\/(token|e2e)/.test(c.path));

  test('no account recorded and the only sign-in is another account: nothing is written, both addresses are named', async ({ glance }) => {
    await glance.seedGmail({});
    server.registerToken('ya29.e2e', OTHER);
    const page = await glance.openGmail(opts('acct-other', 'en'));
    await click(page);
    await expect(main(page)).toContainText(SELF, { timeout: 25000 });
    await expect(main(page)).toContainText(OTHER);
    expect(eventIds()).toHaveLength(0);
    expect(taskIds()).toHaveLength(0);
    expect(posts()).toHaveLength(0);
    await expect(page.locator('div[role="main"] .flow-chip-done-icon')).toHaveCount(0);
    const stored = await glance.storage();
    expect(stored.googleReconnect && stored.googleReconnect.reason).toBe('wrong-account');
    expect(stored.googleReconnect.account).toBe(SELF);
    expect(stored.googleConnectedAccount).toBeFalsy();
  });

  test('the same refusal in the Hebrew UI is Hebrew and names both accounts', async ({ glance }) => {
    await glance.seedGmail({ glanceUiLanguage: 'he' });
    server.registerToken('ya29.e2e', OTHER);
    const page = await glance.openGmail(opts('acct-other-he', 'he'));
    await click(page);
    await expect(main(page)).toContainText('לא כתבתי', { timeout: 25000 });
    await expect(main(page)).toContainText(SELF);
    await expect(main(page)).toContainText(OTHER);
    await expect(main(page)).not.toContainText('Nothing was written');
    expect(posts()).toHaveLength(0);
  });

  test('a Chrome sign-in for the tab account is used even when the stored Connect token is another account', async ({ glance }) => {
    await glance.seedGmail({});
    server.registerToken('ya29.e2e', OTHER);
    server.registerToken('ya29.chrome', SELF);
    await glance.evaluateWorker(() => { globalThis.__glanceE2e.identityToken = 'ya29.chrome'; });
    const page = await glance.openGmail(opts('acct-chrome', 'en'));
    await click(page);
    await expect(page.locator('div[role="main"] .flow-chip-handled')).toBeVisible({ timeout: 25000 });
    expect(eventIds()).toHaveLength(1);
    const writes = server.calls.filter((c) => c.method === 'POST' && c.path === '/calendar/v3/calendars/primary/events');
    expect(writes.length).toBeGreaterThan(0);
    writes.forEach((w) => expect(w.bearer).toBe('ya29.chrome'));
  });

  test('a recorded other account does not outrank the tab: the tab account decides', async ({ glance }) => {
    await glance.seedGmail({ googleConnectedAccount: { email: OTHER, at: Date.now(), source: 'web' } });
    server.registerToken('ya29.e2e', OTHER);
    const page = await glance.openGmail(opts('acct-recorded', 'en'));
    await click(page);
    await expect(main(page)).toContainText(SELF, { timeout: 25000 });
    expect(posts()).toHaveLength(0);
  });

  test('a recorded other account and a Chrome sign-in for the tab: every call of the write uses the tab token', async ({ glance }) => {
    await glance.seedGmail({ googleConnectedAccount: { email: OTHER, at: Date.now(), source: 'web' } });
    server.registerToken('ya29.e2e', OTHER);
    server.registerToken('ya29.chrome', SELF);
    await glance.evaluateWorker(() => { globalThis.__glanceE2e.identityToken = 'ya29.chrome'; });
    const page = await glance.openGmail(opts('acct-mixed', 'en'));
    await click(page);
    await expect(page.locator('div[role="main"] .flow-chip-handled')).toBeVisible({ timeout: 25000 });
    const written = server.calls.filter((c) => c.method !== 'GET' || c.path.indexOf('/events/') >= 0 || c.path.indexOf('/tasks/') >= 0);
    expect(written.length).toBeGreaterThan(0);
    written.forEach((w) => expect(w.bearer).toBe('ya29.chrome'));
  });

  test('a readable mismatch also puts a Reconnect button for the tab account on the card', async ({ glance }) => {
    await glance.seedGmail({});
    server.registerToken('ya29.e2e', OTHER);
    const page = await glance.openGmail(opts('acct-mismatch-btn', 'en'));
    await click(page);
    await expect(main(page)).toContainText(OTHER, { timeout: 25000 });
    const btn = page.locator('div[role="main"] button.flow-chip-reconnect');
    await expect(btn).toHaveCount(1);
    await expect(btn).toHaveText('Reconnect Google');
    await expect(btn).toHaveAttribute('data-glance-reconnect-account', SELF);
    expect(posts()).toHaveLength(0);
  });

  test('Reconnect after a wrong-account refusal asks Google for the tab account', async ({ glance }) => {
    await glance.seedGmail({});
    server.registerToken('ya29.e2e', OTHER);
    const page = await glance.openGmail(opts('acct-hint', 'en'));
    await click(page);
    await expect(main(page)).toContainText(SELF, { timeout: 25000 });
    const flows = await glance.evaluateWorker(async (other) => {
      const e = globalThis.__glanceE2e;
      e.flows = [];
      e.authFail = true;
      const flag = (await chrome.storage.local.get('googleReconnect')).googleReconnect;
      await chrome.storage.local.set({ googleWebAuth: { accessToken: 'ya29.old', source: 'web', expiresAt: Date.now() - 5000, loginHint: other } });
      await globalThis.FlowGoogleAccess.refreshSession();
      e.authFail = false;
      return { flag: flag, urls: e.flows.map((f) => f.url) };
    }, OTHER);
    expect(flows.flag && flows.flag.account).toBe(SELF);
    expect(flows.urls.length).toBeGreaterThan(0);
    expect(flows.urls.join(' ')).toContain(encodeURIComponent(SELF));
  });
});

test.describe('3b. no write without a positive match of the token account', () => {
  const posts = () => server.calls.filter((c) => c.method !== 'GET' && !/^\/(token|e2e)/.test(c.path));
  const noTick = (page) => expect(page.locator('div[role="main"] .flow-chip-done-icon, div[role="main"] .flow-chip-handled')).toHaveCount(0);
  const refused = async (page, glance, text, btnText) => {
    await expect(main(page)).toContainText(text, { timeout: 25000 });
    const btn = page.locator('div[role="main"] button.flow-chip-reconnect');
    await expect(btn).toHaveCount(1);
    await expect(btn).toHaveText(btnText);
    await noTick(page);
    expect(eventIds()).toHaveLength(0);
    expect(taskIds()).toHaveLength(0);
    expect(posts()).toHaveLength(0);
  };
  const noAccount = { omitAccount: true };
  const profileOnly = { googleProfile: { email: SELF } };

  test('no account record and no tab account to compare with: nothing is written, Hebrew UI, Reconnect button', async ({ glance }) => {
    await glance.seedGmail(Object.assign({ glanceUiLanguage: 'he' }, profileOnly));
    const page = await glance.openGmail(opts('v-none-he', 'he', noAccount));
    await click(page);
    await refused(page, glance, 'לא הצלחתי לאמת את החשבון — יש להתחבר מחדש', 'חבר מחדש את Google');
    const stored = await glance.storage();
    expect(stored.googleConnectedAccount).toBeFalsy();
  });

  test('the same, English UI', async ({ glance }) => {
    await glance.seedGmail(profileOnly);
    const page = await glance.openGmail(opts('v-none-en', 'en', noAccount));
    await click(page);
    await refused(page, glance, "Couldn't verify the account — reconnect Google", 'Reconnect Google');
    expect((await glance.storage()).googleConnectedAccount).toBeFalsy();
  });

  test('a recorded account but the profile cannot be read: nothing is written, Hebrew UI', async ({ glance }) => {
    await glance.seedGmail({ glanceUiLanguage: 'he', googleConnectedAccount: { email: SELF, at: Date.now(), source: 'web' } });
    server.failGet('/oauth2/v3/userinfo');
    const page = await glance.openGmail(opts('v-unread-he', 'he'));
    await click(page);
    await refused(page, glance, 'לא הצלחתי לאמת את החשבון — יש להתחבר מחדש', 'חבר מחדש את Google');
    const flag = (await glance.storage()).googleReconnect;
    expect(flag && flag.reason).toBe('account-unverified');
    expect(flag.account).toBe(SELF);
  });

  test('profile unreadable with no record at all, English UI', async ({ glance }) => {
    await glance.seedGmail({});
    server.failGet('/oauth2/v3/userinfo');
    const page = await glance.openGmail(opts('v-unread-en', 'en'));
    await click(page);
    await refused(page, glance, "Couldn't verify the account — reconnect Google", 'Reconnect Google');
    expect((await glance.storage()).googleConnectedAccount).toBeFalsy();
  });

  test('a readable mismatch against the recorded account: refused with both addresses, Hebrew', async ({ glance }) => {
    await glance.seedGmail({ glanceUiLanguage: 'he', googleConnectedAccount: { email: SELF, at: Date.now(), source: 'web' } });
    server.registerToken('ya29.e2e', OTHER);
    const page = await glance.openGmail(opts('v-mismatch-he', 'he'));
    await click(page);
    await refused(page, glance, OTHER, 'חבר מחדש את Google');
    await expect(main(page)).toContainText(SELF);
  });

  test('a match: the write goes out on that token, with a tick', async ({ glance }) => {
    await glance.seedGmail({ googleConnectedAccount: { email: SELF, at: Date.now(), source: 'web' } });
    const page = await glance.openGmail(opts('v-match', 'en'));
    await click(page);
    await expect(page.locator('div[role="main"] .flow-chip-handled')).toBeVisible({ timeout: 25000 });
    await expect(page.locator('div[role="main"] button.flow-chip-reconnect')).toHaveCount(0);
    expect(eventIds()).toHaveLength(1);
  });

  test('no record yet but the tab account matches the token: the write goes out and the match is recorded', async ({ glance }) => {
    await glance.seedGmail({});
    await glance.evaluateWorker(() => chrome.storage.local.remove('googleConnectedAccount'));
    const page = await glance.openGmail(opts('v-match-adopt', 'en'));
    await click(page);
    await expect(page.locator('div[role="main"] .flow-chip-handled')).toBeVisible({ timeout: 25000 });
    expect(eventIds()).toHaveLength(1);
    await expect.poll(async () => { const s = await glance.storage(); return s.googleConnectedAccount && s.googleConnectedAccount.email; }).toBe(SELF);
  });

  test('Handled banner never appears when account verification fails', async ({ glance }) => {
    await glance.seedGmail({});
    server.failGet('/oauth2/v3/userinfo');
    const page = await glance.openGmail(opts('v-no-handled', 'en'));
    await click(page);
    await expect(main(page)).not.toContainText(/Handled/i, { timeout: 25000 });
    await expect(page.locator('div[role="main"] .flow-chip-handled')).toHaveCount(0);
    expect(posts()).toHaveLength(0);
  });

  test('the Reconnect button asks Google for the tab account (login_hint, interactive) and writes nothing', async ({ glance }) => {
    await glance.seedGmail({});
    server.failGet('/oauth2/v3/userinfo');
    await glance.evaluateWorker(() => { globalThis.__glanceE2e.flows = []; });
    const page = await glance.openGmail(opts('v-btn-flow', 'en'));
    await click(page);
    const btn = page.locator('div[role="main"] button.flow-chip-reconnect');
    await expect(btn).toHaveCount(1, { timeout: 25000 });
    await btn.click();
    await expect.poll(() => glance.evaluateWorker(() => globalThis.__glanceE2e.flows.length), { timeout: 15000 }).toBeGreaterThan(0);
    const urls = await glance.evaluateWorker(() => globalThis.__glanceE2e.flows.map((f) => ({ url: f.url, interactive: f.interactive })));
    const last = urls[urls.length - 1];
    expect(last.interactive).toBe(true);
    expect(last.url).toContain('login_hint=' + encodeURIComponent(SELF));
    await expect(btn).toBeEnabled({ timeout: 15000 });
    expect(posts()).toHaveLength(0);
  });
});

test.describe('4. copied only: no card of any kind', () => {
  const ASKS = [
    ['Can you send me the report', 'en'],
    ['Can you send me the report by Friday?', 'en'],
    ['Please send the report', 'en'],
    ['אפשר לשלוח לי את הדוח', 'he'],
    ["Let's have a call Tuesday at 15:00 about the pilot", 'en'],
    ['Please remind me to call the supplier tomorrow', 'en']
  ];
  const detailed = (id, body, lang, over, userName) => opts(id, lang, Object.assign({
    body: body, to: undefined, userName: userName,
    detailsTable: Object.assign({ expanded: true, hebrew: lang === 'he', bidi: lang === 'he', to: ['noa@acme.io'], cc: [SELF] }, over || {})
  }));

  test('details open, Cc only, a report attached to the thread: no chip, no needs-you card, no save offer', async ({ glance }) => {
    await glance.seedGmail({});
    const page = await glance.openGmail(Object.assign(detailed('cc-att', 'Can you send me the report', 'en'), { attachments: [{ name: 'report.pdf' }] }));
    await page.waitForTimeout(3000);
    await expect(chip(page)).toHaveCount(0);
    await expect(main(page)).not.toContainText(/Glance|DETECTED INTENT|Save|needs you/i);
  });

  test('details open, Cc only, the report is in Drive: still no card, and no Drive read for it', async ({ glance }) => {
    await glance.seedGmail({});
    server.driveHits([{ id: 'rep-1', name: 'report.pdf', mimeType: 'application/pdf' }]);
    const page = await glance.openGmail(detailed('cc-drive', 'Can you send me the report', 'en'));
    await page.waitForTimeout(3000);
    await expect(chip(page)).toHaveCount(0);
    await expect(main(page)).not.toContainText(/Glance|DETECTED INTENT|report\.pdf/i);
  });

  test('the same mail addressed To the account is offered the file card', async ({ glance }) => {
    await glance.seedGmail({});
    server.driveHits([{ id: 'rep-1', name: 'report.pdf', mimeType: 'application/pdf' }]);
    const page = await glance.openGmail(detailed('to-drive', 'Can you send me the report', 'en', { to: [SELF], cc: ['noa@acme.io'] }));
    await expect(chip(page)).toBeVisible({ timeout: 15000 });
  });

  test('Gmail paints the recipients after the body: Cc only still ends with no card', async ({ glance }) => {
    await glance.seedGmail({});
    const page = await glance.openGmail(detailed('cc-late', 'Can you send me the report', 'en', { lateMs: 1500 }));
    await page.waitForTimeout(5000);
    await expect(main(page).locator('.glance-late-hdr table')).toHaveCount(1);
    await expect(chip(page)).toHaveCount(0);
    await expect(main(page)).not.toContainText(/DETECTED INTENT/);
  });

  test('Gmail paints the recipients after the body: addressed To the account keeps its card', async ({ glance }) => {
    await glance.seedGmail({});
    const page = await glance.openGmail(detailed('to-late', 'Can you send me the report', 'en', { lateMs: 1500, to: [SELF], cc: ['noa@acme.io'] }));
    await page.waitForTimeout(4000);
    await expect(main(page).locator('.glance-late-hdr table')).toHaveCount(1);
    await expect(chip(page)).toHaveCount(1);
  });

  test('details open with a collapsed To line and Cc only: the labelled table wins and no card is shown', async ({ glance }) => {
    await glance.seedGmail({});
    const page = await glance.openGmail(Object.assign(opts('cc-collapsed', 'en', {
      body: 'Can you send me the report',
      to: [SELF, 'yossi@acme.io'],
      cc: undefined
    }), {
      detailsTable: { expanded: true, hebrew: false, bidi: false, to: ['yossi@acme.io'], cc: [SELF] }
    }));
    await page.waitForTimeout(2500);
    await expect(chip(page)).toHaveCount(0);
  });

  ASKS.forEach(([body, lang], i) => {
    [['no name', undefined], ['named', 'Sali']].forEach(([label, name]) => {
      test('details open, Cc only, ' + label + ': "' + body + '" gets no chip', async ({ glance }) => {
        await glance.seedGmail(lang === 'he' ? { glanceUiLanguage: 'he' } : {});
        const page = await glance.openGmail(detailed('cc' + i + label.replace(/\W/g, ''), body, lang, null, name));
        await page.waitForTimeout(2500);
        await expect(chip(page)).toHaveCount(0);
        await expect(main(page).locator('.flow-chip, [class*="flow-card"], [data-flow-card]')).toHaveCount(0);
      });
    });
  });
});

test.describe('4b. no tab account and no stored profile', () => {
  test('shows a Reconnect row instead of waiting for a name, and writes nothing', async ({ glance }) => {
    await glance.seedGmail({ glanceUiLanguage: 'he' });
    const page = await glance.openGmail(Object.assign(opts('norec-notab', 'he'), { omitAccount: true, titleEmail: 'Gmail' }));
    await page.waitForTimeout(3000);
    await expect(main(page)).toContainText('לא הצלחתי לאמת את החשבון — יש להתחבר מחדש');
    await expect(main(page)).not.toContainText('ממתין לשם');
    await expect(page.locator('button.flow-chip-reconnect')).toHaveCount(1);
    await expect(chip(page)).toHaveCount(0);
    expect(eventIds()).toHaveLength(0);
  });
});

test.describe('5. the reply draft finds its thread from the real Gmail header', () => {
  const BOARD = 'application/pdf:board.pdf:https://mail.google.com/e2e/att/board.pdf';
  const HEX = '18c0ffee12345678';
  const drafts = () => server.drafts;

  async function saveChain(glance, id, extra, lang, body) {
    await glance.context.route('https://mail.google.com/e2e/**', (r) => r.fulfill({ status: 404, contentType: 'text/plain', body: 'page fetch' }));
    await glance.seedGmail(lang === 'he' ? { glanceUiLanguage: 'he' } : {});
    const page = await glance.openGmail(Object.assign({
      messageId: 'm-' + id, threadId: HEX, subject: 'Board pack',
      senderEmail: 'dana@acme.io', senderName: 'Dana', ownEmail: SELF, to: [SELF], lang: lang || 'en',
      body: body || 'Please save the attached pdf to Drive.', downloadUrl: BOARD
    }, extra || {}));
    const c = chip(page);
    await expect(c).toBeVisible({ timeout: 20000 });
    return { page: page, chip: c };
  }

  test('the thread id only on h2.hP (hex): the draft is made in that thread', async ({ glance }) => {
    const { page, chip: c } = await saveChain(glance, 'hdr-hex', { threadIdOnHeader: true });
    await c.click();
    await expect(page.locator('div[role="main"] .flow-chip-handled')).toBeVisible({ timeout: 20000 });
    await expect.poll(() => Object.keys(drafts()).length, { timeout: 15000 }).toBe(1);
    expect(drafts()[Object.keys(drafts())[0]].message.threadId).toBe(HEX);
  });

  test('only the decimal data-thread-perm-id: it is converted to the hex thread id', async ({ glance }) => {
    const dec = '1234567890123456789';
    const { page, chip: c } = await saveChain(glance, 'hdr-dec', { threadIdOnHeader: true, threadPermId: dec });
    await c.click();
    await expect(page.locator('div[role="main"] .flow-chip-handled')).toBeVisible({ timeout: 20000 });
    await expect.poll(() => Object.keys(drafts()).length, { timeout: 15000 }).toBe(1);
    expect(drafts()[Object.keys(drafts())[0]].message.threadId).toBe(BigInt(dec).toString(16));
  });

  test('no thread id anywhere and no reply open: the draft step is not offered up front, and nothing says it was made', async ({ glance }) => {
    const { page, chip: c } = await saveChain(glance, 'hdr-none', { noThreadId: true });
    await expect(page.locator('div[role="main"]')).not.toContainText(/draft|reply/i);
    await c.click();
    await expect(page.locator('div[role="main"] .flow-chip-handled')).toBeVisible({ timeout: 20000 });
    expect(Object.keys(drafts())).toHaveLength(0);
    await expect(page.locator('div[role="main"]')).not.toContainText(/could not prepare a reply draft/i);
  });

  test('Undo of the Drive save also deletes the reply draft by its id', async ({ glance }) => {
    const { page, chip: c } = await saveChain(glance, 'undo-draft', { threadIdOnHeader: true });
    await c.click();
    await expect(page.locator('div[role="main"] .flow-chip-handled')).toBeVisible({ timeout: 20000 });
    await expect.poll(() => Object.keys(drafts()).length, { timeout: 15000 }).toBe(1);
    const draftId = Object.keys(drafts())[0];
    const fileId = server.last.file;
    await page.locator('div[role="main"] button.flow-chip-undo').click();
    await expect.poll(() => Object.keys(drafts()).length, { timeout: 15000 }).toBe(0);
    expect(server.calls.some((c2) => c2.method === 'DELETE' && c2.path.indexOf('/drafts/' + draftId) >= 0)).toBe(true);
    await expect.poll(() => server.file(fileId).trashed, { timeout: 15000 }).toBe(true);
  });

  test('the draft is in the language of the mail, whatever the UI language is', async ({ glance }) => {
    const { page, chip: c } = await saveChain(glance, 'draft-he', { threadIdOnHeader: true, senderName: 'דנה' }, 'en', 'מצורף ה-PO. נא לשמור אותו ב-Google Drive עד 20/10.');
    await c.click();
    await expect(page.locator('div[role="main"] .flow-chip-handled')).toBeVisible({ timeout: 20000 });
    await expect.poll(() => Object.keys(drafts()).length, { timeout: 15000 }).toBe(1);
    const msg = drafts()[Object.keys(drafts())[0]].message;
    expect(msg.body).toContain('היי דנה,');
    expect(msg.body).toContain('הקובץ מוכן.');
    expect(msg.body).not.toContain('The file is ready');
    expect(msg.body).not.toContain('Hi ');
  });
});
