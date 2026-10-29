// Live Gate on the flip-sample SHA: consent before a To Do write, one
// Microsoft status without a reload, Hebrew dates, and one why line.
const { test, expect } = require('./support/harness');
const S = require('./support/sentences');

// The next Friday at least three days out, so the spec does not go stale.
const FRIDAY = (() => {
  const d = new Date(Date.now() + 3 * 24 * 3600 * 1000);
  while (d.getDay() !== 5) d.setDate(d.getDate() + 1);
  return d;
})();
const GYM = 'please remember to renew your gym membership by Friday ' + FRIDAY.getDate() + '/' + (FRIDAY.getMonth() + 1);
const HOLD_BODY = 'תשמור לי את הזמן';
const HOLD_OFFSET_DAYS = 7;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function holdOnCalendar(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return {
    subject: 'פגישה ' + dd + '/' + mm + ' 11:00 רוטשילד 12',
    title: 'Hold ' + WEEKDAYS[d.getDay()] + ' 11:00',
    when: MONTHS[d.getMonth()] + ' ' + d.getDate()
  };
}

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
  await expect(todo.first()).not.toBeChecked();
  await expect(popup.locator('label[data-glance-granted] [data-glance-service="todo"]').first()).toBeVisible();
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

test('a hold card shows the time in the card text, and a dateless hold is not a card', async ({ glance }) => {
  test.setTimeout(60000);
  await glance.seedOutlook();
  const hold = holdOnCalendar(HOLD_OFFSET_DAYS);
  const page = await glance.openOutlook({
    id: 'AQMkGlanceHoldWhen',
    subject: hold.subject,
    senderEmail: S.SENDER,
    senderName: 'flow',
    body: HOLD_BODY
  });
  const title = page.locator('#ReadingPaneContainerId .gs-intent, #ReadingPaneContainerId .flow-chip-process-name').first();
  await expect(title).toBeVisible({ timeout: 20000 });
  await expect(title).toHaveText(hold.title);
  const when = page.locator('#ReadingPaneContainerId [data-glance-when]');
  await expect(when).toBeVisible();
  await expect(when).toContainText(hold.when);
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

test('Hebrew UI chrome on an English mail localizes the why line', async ({ glance }) => {
  test.setTimeout(60000);
  await glance.seedOutlook({ glanceUiLanguage: 'he' });
  const page = await glance.openOutlook({
    id: 'AQMkGlanceUiHeEn',
    subject: 'Transfer',
    senderEmail: S.SENDER,
    senderName: 'flow',
    body: S.SHOW
  });
  const host = page.locator('#ReadingPaneContainerId .flow-chip-host');
  await expect(host).toHaveCount(1);
  await expect(host.getByRole('button', { name: 'בצע' })).toBeVisible();
  await expect(host.getByRole('button', { name: 'הסתר' })).toBeVisible();
  const title = host.locator('.gs-intent, .flow-chip-process-name').first();
  await expect(title).toBeVisible();
  await expect(title).toHaveText('מענה ומעקב');
  const card = await host.innerText();
  expect(card).toMatch(/מוצע/);
  expect(card).not.toMatch(/\bSuggested\b/i);
  expect(card).not.toMatch(/\bAdded\b/i);
  expect(card).not.toMatch(/\bDismiss\b/i);
  expect(card).not.toMatch(/\bDo It\b/i);
  expect(card).not.toMatch(/\bUndo\b/i);
  expect(card).not.toMatch(/\bView\b/i);
  expect(card).not.toMatch(/\bQueued\b/i);
  expect(card).not.toMatch(/\bHandled\b/i);
  expect(card).not.toMatch(/Couldn't confirm/i);
  expect(card).not.toMatch(/Deleted in To Do/i);

  const popup = await glance.openPopup();
  await popup.locator('button[data-tab="open"]').click();
  const list = popup.locator('#open-list');
  await expect(list.locator('[data-glance-section="suggested"]')).toHaveText('מוצע');
  await expect(list.getByRole('button', { name: 'הסתר' }).first()).toBeVisible();
  // The why line is chrome and follows the UI locale. The card title above
  // stays the mail's own words.
  await expect(list.locator('.log-label').first()).toHaveText('עדיין חייבים תשובה');
  await expect(list.locator('.log-label').first()).not.toContainText(/[A-Za-z]/);
  const loops = await list.innerText();
  expect(loops).not.toMatch(/\bSuggested\b/i);
  expect(loops).not.toMatch(/\bDismiss\b/i);
  expect(loops).not.toMatch(/\bUndo\b/i);
  expect(loops).not.toMatch(/\bHandled\b/i);
  expect(loops).not.toMatch(/Deleted in To Do/i);
});

test('English UI chrome on an English mail stays English', async ({ glance }) => {
  test.setTimeout(60000);
  await glance.seedOutlook({ glanceUiLanguage: 'en' });
  const page = await glance.openOutlook({
    id: 'AQMkGlanceUiEnEn',
    subject: 'Transfer',
    senderEmail: S.SENDER,
    senderName: 'flow',
    body: S.SHOW
  });
  const host = page.locator('#ReadingPaneContainerId .flow-chip-host');
  await expect(host).toHaveCount(1);
  await expect(host.getByRole('button', { name: 'Do It' })).toBeVisible();
  await expect(host.getByRole('button', { name: 'Dismiss' })).toBeVisible();
  const title = host.locator('.gs-intent, .flow-chip-process-name').first();
  await expect(title).toBeVisible();
  await expect(title).toHaveText(/[A-Za-z]/);
  const card = await host.innerText();
  expect(card).toMatch(/\bSuggested\b/i);
  expect(card).toMatch(/\bQueued\b/i);
  expect(card).toMatch(/Hold It/i);
  expect(card).not.toMatch(/בצע/);
  expect(card).not.toMatch(/הסתר/);
  expect(card).not.toMatch(/מוצע/);
});
