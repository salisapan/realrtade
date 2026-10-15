// Live Gate on the flip-sample SHA: consent before a To Do write, one
// Microsoft status without a reload, Hebrew dates, and one why line.
const { test, expect } = require('./support/harness');
const S = require('./support/sentences');

const GYM = 'please remember to renew your gym membership by Friday 23/10';
const HOLD_SUBJECT = 'פגישה 18/10 11:00 רוטשילד 12';
const HOLD_BODY = 'תשמור לי את הזמן';

test('a mail-only grant shows To Do consent and does not write', async ({ glance }) => {
  test.setTimeout(60000);
  await glance.seedOutlook({}, { tasks: false });
  const page = await glance.openOutlook({
    id: 'AQMkGlanceTodoConsent',
    subject: 'Gym',
    senderEmail: S.SENDER,
    senderName: 'flow',
    body: GYM
  });
  const pane = page.locator('#ReadingPaneContainerId');
  const ask = pane.locator('[data-glance-consent="todo"]');
  await expect(ask).toBeVisible();
  await expect(ask.getByRole('button', { name: 'אפשר פעם אחת' })).toBeVisible();
  await expect(ask.getByRole('button', { name: 'אפשר תמיד' })).toBeVisible();
  await expect(ask.getByRole('button', { name: 'לא עכשיו' })).toBeVisible();
  await expect(pane.locator('button.flow-chip')).toHaveCount(0);
  const calls = await glance.apiCalls();
  expect(calls.some((c) => /\/todo\//.test(String(c.url || '')))).toBe(false);
});

test('Turn off updates Microsoft status everywhere without a reload', async ({ glance }) => {
  test.setTimeout(60000);
  await glance.seedOutlook();
  const popup = await glance.openPopup();
  await expect(popup.locator('#statusPill')).toHaveText('מחובר');
  await glance.seed({ outlookAuth: null, outlookSync: {} });
  await expect(popup.locator('#statusPill')).toHaveText('לא מחובר');
  await expect(popup.locator('[data-glance-surface="outlook"]')).toHaveCount(1);
  await expect(popup.locator('[data-glance-surface="outlook"]')).toHaveAttribute('data-glance-microsoft', 'missing');
});

test('connected settings show granted scopes and can add one', async ({ glance }) => {
  test.setTimeout(60000);
  await glance.seedOutlook();
  const popup = await glance.openPopup();
  await popup.locator('button[data-tab="setup"]').click();
  const calendar = popup.locator('[data-glance-service="calendar"]');
  const todo = popup.locator('[data-glance-service="todo"]');
  await expect(calendar.first()).toBeVisible();
  await expect(calendar.first()).not.toBeChecked();
  await expect(todo.first()).toBeChecked();
  await expect(popup.getByText('שמירת זמן ביומן').first()).toBeVisible();
  await expect(popup.locator('[data-glance-add-scope="1"]')).toBeVisible();
  await expect(popup.locator('#statusPill')).toHaveText('מחובר');
});

test('the popup shell has no leftover English status words', async ({ glance }) => {
  await glance.seedOutlook();
  const popup = await glance.openPopup();
  const text = await popup.locator('body').innerText();
  expect(text).not.toMatch(/Connect Microsoft/);
  expect(text).not.toMatch(/Not connected/);
  expect(text).not.toMatch(/\bTurn off\b/);
  expect(text).toMatch(/מחובר|לא מחובר|הגדרות/);
});

test('a hold card shows the Hebrew day and clock, and a dateless hold is not a card', async ({ glance }) => {
  test.setTimeout(60000);
  await glance.seedOutlook();
  const page = await glance.openOutlook({
    id: 'AQMkGlanceHoldWhen',
    subject: HOLD_SUBJECT,
    senderEmail: S.SENDER,
    senderName: 'flow',
    body: HOLD_BODY
  });
  const when = page.locator('#ReadingPaneContainerId [data-glance-when]');
  await expect(when).toBeVisible();
  await expect(when).toContainText('18 באוק׳');
  await expect(when).toContainText('11:00');

  const quiet = await glance.openOutlook({
    id: 'AQMkGlanceHoldNone',
    subject: 'Sometime',
    senderEmail: S.SENDER,
    senderName: 'flow',
    body: "I'll call you at 3"
  });
  await expect(quiet.locator('#ReadingPaneContainerId [data-glance-chain="calendar-hold"]')).toHaveCount(0);
  await expect(quiet.locator('#ReadingPaneContainerId [data-glance-when]')).toHaveCount(0);
});

test('the why line is one line for the current mail and hides when a card shows', async ({ glance }) => {
  test.setTimeout(60000);
  await glance.seedOutlook();
  const silent = await glance.openOutlook({
    id: S.MSG_SILENT,
    subject: 'Thanks',
    senderEmail: S.SENDER,
    senderName: 'flow',
    body: S.SILENT
  });
  const why = silent.locator('#ReadingPaneContainerId .flow-why-not');
  await expect(why).toHaveCount(1);
  await expect(why).toContainText('לא זוהתה בקשה');
  const show = await glance.openOutlook({
    id: S.MSG_SHOW,
    subject: 'Transfer',
    senderEmail: S.SENDER,
    senderName: 'flow',
    body: S.SHOW
  });
  await expect(show.locator('#ReadingPaneContainerId .flow-chip-host')).toHaveCount(1);
  await expect(show.locator('#ReadingPaneContainerId .flow-why-not')).toHaveCount(0);
});
