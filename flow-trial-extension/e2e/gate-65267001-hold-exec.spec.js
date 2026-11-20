// Gate 65267001 (a): a Hebrew note mailed to oneself that asks for the calendar
// («…ביום ג׳ הקרוב ב-10:00, תשריין ביומן.») is one Google Calendar insert when
// Do It is pressed, titled with the mail subject. When the write cannot land
// (the Google connection expired, the Calendar writer is not loaded, Google
// does not return the event) the card says so in Hebrew, in full, with
// Reconnect when Google needs the person. Never a silent "unconfirmed".
// Unpacked extension against the local Google lane server. Nothing is sent.
const { test, expect } = require('./support/harness');
const { startGoogleLaneServer } = require('./support/google-lane-server');

const SELF = 'ai.local.flow@gmail.com';
const MAIN = 'div[role="main"]';
const SUBJECT = '[G-Calendar] שיחת וידאו עם רוני על התקציב 2';
const BODY = 'נקבע שיחת וידאו ביום ג׳ הקרוב ב-10:00, תשריין ביומן.';
const INSERT = '/calendar/v3/calendars/primary/events';
let server;
let n = 0;

test.beforeAll(async () => { server = await startGoogleLaneServer(); });
test.afterAll(async () => { if (server) await server.close(); });
test.beforeEach(async ({ glance }) => {
  server.reset();
  server.setAccount(SELF);
  await glance.evaluateWorker((origin) => { globalThis.__glanceE2e.httpOrigin = origin; }, server.origin);
});

async function openHold(glance) {
  await glance.seedGmail({});
  n += 1;
  const page = await glance.openGmail({
    liveSelf: true, messageId: 'm-g6526-' + n, threadId: 't-g6526-' + n, ownEmail: SELF, senderName: 'flow',
    subject: SUBJECT, body: BODY, lang: 'he',
    accountLabel: 'Google Account: flow (' + SELF + ')'
  });
  const lines = [];
  page.on('console', (m) => { const t = m.text(); if (t.indexOf('[Glance] calendar hold') === 0) lines.push(t); });
  const host = page.locator(MAIN + ' .flow-chip-host').first();
  await expect(host.locator('.gs-intent')).toHaveText('שריין ג׳ 10:00', { timeout: 20000 });
  return { page, host, lines };
}

const inserts = () => server.calls.filter((c) => c.method === 'POST' && c.path === INSERT);
const events = () => Object.values(server.events());

test('Do It on the Hebrew self-mail hold inserts one Calendar event titled with the subject, and Undo deletes it', async ({ glance }) => {
  const { page, host, lines } = await openHold(glance);
  await host.locator('button.flow-chip').click();
  await expect(host.locator('.flow-chip-handled')).toBeVisible({ timeout: 20000 });
  expect(inserts()).toHaveLength(1);
  const sent = inserts()[0].body;
  expect(sent.summary).toBe('שיחת וידאו עם רוני על התקציב 2');
  expect(sent.attendees || []).toEqual([]);
  expect(events()).toHaveLength(1);
  const ev = events()[0];
  expect(ev.summary).toBe('שיחת וידאו עם רוני על התקציב 2');
  expect(ev.start.dateTime).toMatch(/T10:00:00/);
  // The body line is written once.
  expect(String(ev.description || '').split(BODY).length - 1).toBeLessThanOrEqual(1);
  await expect.poll(() => lines).toContain('[Glance] calendar hold created verified');
  await expect(host.locator('.flow-chip-hold-error')).toHaveCount(0);
  await page.locator(MAIN + ' button.flow-chip-undo').click();
  await expect.poll(() => events().length).toBe(0);
});

test('an expired Google connection: no event, the card says so in Hebrew with Reconnect, and the console names the reason', async ({ glance }) => {
  server.rejectAuth('/calendar/v3');
  await glance.evaluateWorker(() => chrome.storage.local.set({ googleReconnect: { needed: true, reason: 'not signed in' } }));
  try {
    const { host, lines } = await openHold(glance);
    await host.locator('button.flow-chip').click();
    const alert = host.locator('.flow-chip-hold-error');
    await expect(alert).toBeVisible({ timeout: 20000 });
    await expect(alert).toHaveAttribute('role', 'alert');
    await expect(alert).toContainText('לא נוצר אירוע ביומן');
    await expect(alert).toContainText('חבר מחדש את Google');
    await expect(alert).toHaveAttribute('data-glance-hold-reason', 'token-expired');
    await expect(host.locator('.flow-chip-reconnect')).toBeVisible();
    await expect(host.locator('.flow-chip-reconnect')).toHaveText('חבר מחדש את Google');
    // The approve banner names the failure; it is not the generic "unconfirmed".
    await expect(host.locator('.approve-title')).toHaveText('עדיין פתוח · לא נוצר דבר');
    await expect(host).not.toContainText('unconfirmed');
    await expect(host.locator('.flow-chip-handled')).toHaveCount(0);
    expect(events()).toHaveLength(0);
    await expect.poll(() => lines).toContain('[Glance] calendar hold failed token-expired');
  } finally {
    await glance.evaluateWorker(() => chrome.storage.local.remove('googleReconnect'));
  }
});

test('Google never connected on this profile: no event, a Hebrew line with Reconnect, reason not-connected', async ({ glance }) => {
  server.rejectAuth('/calendar/v3');
  const { host, lines } = await openHold(glance);
  await host.locator('button.flow-chip').click();
  const alert = host.locator('.flow-chip-hold-error');
  await expect(alert).toBeVisible({ timeout: 20000 });
  await expect(alert).toHaveAttribute('data-glance-hold-reason', 'not-connected');
  await expect(host.locator('.flow-chip-reconnect')).toBeVisible();
  expect(events()).toHaveLength(0);
  await expect.poll(() => lines).toContain('[Glance] calendar hold failed not-connected');
});

test('the Calendar writer global is not published in the worker: no insert, a Hebrew line, reason handler-unpublished', async ({ glance }) => {
  await glance.evaluateWorker(() => { globalThis.__heldCalendar = globalThis.FlowGoogleCalendar; delete globalThis.FlowGoogleCalendar; });
  try {
    const { host, lines } = await openHold(glance);
    await host.locator('button.flow-chip').click();
    const alert = host.locator('.flow-chip-hold-error');
    await expect(alert).toBeVisible({ timeout: 20000 });
    await expect(alert).toContainText('לא נוצר אירוע ביומן');
    await expect(alert).toContainText('רכיב היומן של Glance לא נטען');
    await expect(alert).toHaveAttribute('data-glance-hold-reason', 'handler-unpublished');
    await expect(host.locator('.flow-chip-reconnect')).toHaveCount(0);
    expect(inserts()).toHaveLength(0);
    await expect.poll(() => lines).toContain('[Glance] calendar hold failed handler-unpublished');
  } finally {
    await glance.evaluateWorker(() => { globalThis.FlowGoogleCalendar = globalThis.__heldCalendar; delete globalThis.__heldCalendar; });
  }
});

test('Google reads the hold back as wall time in Asia/Jerusalem: the event stays, the card says טופל, Undo deletes it', async ({ glance }) => {
  server.setWallTimes(true);
  try {
    const { page, host } = await openHold(glance);
    await host.locator('button.flow-chip').click();
    await expect(host.locator('.flow-chip-handled')).toContainText('טופל', { timeout: 20000 });
    await expect(host).not.toContainText('unconfirmed');
    await expect(host).not.toContainText('Still open');
    expect(inserts()).toHaveLength(1);
    const ev = events()[0];
    expect(ev.start.dateTime).toMatch(/T10:00:00$/);
    expect(ev.start.timeZone).toBeTruthy();
    expect(String(ev.start.dateTime)).not.toMatch(/Z|[+-]\d{2}:\d{2}$/);
    await page.locator(MAIN + ' button.flow-chip-undo').click();
    await expect.poll(() => events().length).toBe(0);
  } finally {
    server.setWallTimes(false);
  }
});

test('a grant without calendar.events does not insert, and the Hebrew card names the missing permission', async ({ glance }) => {
  const partial = {
    granted: [
      'openid',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/tasks'
    ]
  };
  try {
    const { host, lines } = await openHold(glance);
    await glance.evaluateWorker((scopes) => chrome.storage.local.set({ googleGrantedScopes: scopes }), partial);
    await host.locator('button.flow-chip').click();
    const alert = host.locator('.flow-chip-hold-error');
    await expect(alert).toBeVisible({ timeout: 20000 });
    await expect(alert).toHaveAttribute('data-glance-hold-reason', 'calendar-scope-missing');
    await expect(alert).toContainText('אין הרשאה ליומן');
    await expect(host).not.toContainText('unconfirmed');
    await expect(host).not.toContainText('Still open');
    await expect(host.locator('.flow-chip-handled')).toHaveCount(0);
    expect(inserts()).toHaveLength(0);
    expect(events()).toHaveLength(0);
    await expect.poll(() => lines.join('\n')).toContain('calendar-scope-missing');
  } finally {
    await glance.evaluateWorker(() => chrome.storage.local.remove('googleGrantedScopes'));
  }
});

test('Google does not return the event after the insert: it is removed, and the card says so in Hebrew', async ({ glance }) => {
  server.failGet('/calendar/v3');
  const { host, lines } = await openHold(glance);
  await host.locator('button.flow-chip').click();
  const alert = host.locator('.flow-chip-hold-error');
  await expect(alert).toBeVisible({ timeout: 20000 });
  await expect(alert).toHaveAttribute('data-glance-hold-reason', 'verify_failed');
  await expect(alert).toContainText('לא נוצר אירוע ביומן');
  expect(inserts()).toHaveLength(1);
  expect(events()).toHaveLength(0);
  await expect.poll(() => lines).toContain('[Glance] calendar hold failed verify_failed');
});

// Next named weekday, same rule as core/extract.js: a bare weekday said on
// that weekday is a week ahead. The browser clock is the job clock.
function nextWeekdayIso(target) {
  const d = new Date();
  let delta = (target - d.getDay() + 7) % 7;
  if (delta === 0) delta = 7;
  d.setDate(d.getDate() + delta);
  const p = (x) => String(x).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

async function openSelf(glance, subject, body, messageId) {
  n += 1;
  const page = await glance.openGmail({
    liveSelf: true, messageId: messageId + n, threadId: 't-' + messageId + n, ownEmail: SELF, senderName: 'flow',
    subject: subject, body: body, lang: 'he',
    accountLabel: 'Google Account: flow (' + SELF + ')'
  });
  const host = page.locator(MAIN + ' .flow-chip-host').first();
  return { page, host };
}

test('self-sent «שריין ג׳ 10:00 ביומן» offers the Tuesday hold, בצע creates it, בטל deletes it', async ({ glance }) => {
  const tuesday = nextWeekdayIso(2);
  await glance.seedGmail({});
  const { page, host } = await openSelf(
    glance,
    '[G-Calendar] שיחה עם רוני ce3f',
    'נקבע שיחה. שריין ג׳ 10:00 ביומן בבקשה.',
    'm-ce3f-'
  );
  await expect(host.locator('.gs-intent')).toHaveText('שריין ג׳ 10:00', { timeout: 20000 });
  await expect(host.locator('.flow-chip-when')).toContainText('10:00');
  await expect(host.locator('button.flow-chip')).toHaveText('בצע');
  await host.locator('button.flow-chip').click();
  await expect(host.locator('.flow-chip-handled')).toBeVisible({ timeout: 20000 });
  expect(inserts()).toHaveLength(1);
  const ev = events()[0];
  expect(ev.summary).toBe('שיחה עם רוני ce3f');
  expect(ev.start.dateTime).toContain(tuesday);
  expect(ev.start.dateTime).toMatch(/T10:00:00/);
  const undo = page.locator(MAIN + ' button.flow-chip-undo');
  await expect(undo).toHaveText('בטל');
  await undo.click();
  await expect.poll(() => events().length).toBe(0);
});

test('self-sent «נקבעה פגישה ב-18/11 בשעה 10:00, תשריין ביומן» is the 18 Nov 10:00 hold when that day is still ahead', async ({ glance }) => {
  await glance.seedGmail({});
  await glance.evaluateWorker(() => chrome.storage.local.set({ glanceE2eNowMs: Date.parse('2026-11-01T08:00:00Z') }));
  const { page, host } = await openSelf(
    glance,
    'פגישה עם דנה',
    'נקבעה פגישה ב-18/11 בשעה 10:00, תשריין ביומן.',
    'm-1811-'
  );
  await expect(host.locator('.gs-intent')).toHaveText('שריין ד׳ 10:00', { timeout: 20000 });
  await expect(host.locator('.flow-chip-when')).toContainText('18');
  await expect(host.locator('.flow-chip-when')).toContainText('10:00');
  await expect(host.locator('button.flow-chip')).toHaveText('בצע');
  await host.locator('button.flow-chip').click();
  await expect(host.locator('.flow-chip-handled')).toBeVisible({ timeout: 20000 });
  expect(inserts()).toHaveLength(1);
  const ev = events()[0];
  expect(ev.summary).toBe('פגישה עם דנה');
  expect(ev.start.dateTime).toContain('2026-11-18');
  expect(ev.start.dateTime).toMatch(/T10:00:00/);
  await expect(page.locator(MAIN + ' button.flow-chip-undo')).toHaveText('בטל');
  await page.locator(MAIN + ' button.flow-chip-undo').click();
  await expect.poll(() => events().length).toBe(0);
});
