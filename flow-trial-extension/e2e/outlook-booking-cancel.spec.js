// A cancellation mail on the real Outlook card, behind the owner's off switch BOOKING_NOTICE: the business that confirmed an
// appointment (and whose hold Glance wrote) writes "Your appointment tomorrow at 14:00 was cancelled". Do It removes that same
// event through the hold's own undo and reads back that it is gone; an event the person changed is left alone; with no hold from
// that sender at that day and clock the mail shows nothing. Unpacked extension, Graph stand-in. Nothing is sent.
const { test, expect } = require('./support/harness');

const PANE = '#ReadingPaneContainerId';
const APPT = 'Hi, your appointment is confirmed for tomorrow at 14:00. See you then.';
const GONE = 'Hi, unfortunately your appointment tomorrow at 14:00 was cancelled.';
const GONE_OTHER = 'Hi, unfortunately your appointment tomorrow at 16:00 was cancelled.';

let n = 0;
const mail = (glance, body, sender) => {
  n += 1;
  return glance.openOutlook({ id: 'AQMk-cancel-' + n, subject: 'Your booking', senderEmail: sender || 'hello@nofar.example', senderName: 'Studio Nofar', body: body });
};
const events = (glance) => glance.evaluateWorker(() => Object.values(globalThis.__glanceE2e.outlookEvents));

async function holdMade(glance) {
  await glance.seedOutlook({ glanceSwitches: { BOOKING_NOTICE: true } }, { calendar: true });
  const page = await mail(glance, APPT);
  await expect(page.locator(PANE + ' .chip-hold')).toBeVisible({ timeout: 20000 });
  await page.locator(PANE + ' .chip-hold').click();
  await expect(page.locator(PANE + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  expect(await events(glance)).toHaveLength(1);
}

test('BOOKING_NOTICE on: the cancellation removes the hold Glance made for that appointment, read back', async ({ glance }) => {
  await holdMade(glance);
  const page = await mail(glance, GONE);
  await expect(page.locator(PANE + ' button.flow-chip')).toBeVisible({ timeout: 20000 });
  await page.locator(PANE + ' button.flow-chip').click();
  await expect(page.locator(PANE + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  expect(await events(glance)).toHaveLength(0);
});

test('BOOKING_NOTICE on: an event the person changed stays and the card says so', async ({ glance }) => {
  await holdMade(glance);
  await glance.evaluateWorker(() => { Object.values(globalThis.__glanceE2e.outlookEvents).forEach((ev) => { ev.subject = 'Appointment (moved by me)'; ev.body = { contentType: 'text', content: 'my own notes' }; }); });
  const page = await mail(glance, GONE);
  await expect(page.locator(PANE + ' button.flow-chip')).toBeVisible({ timeout: 20000 });
  await page.locator(PANE + ' button.flow-chip').click();
  await expect(page.locator(PANE + ' [data-glance-chip-state="flow-chip-error"]')).toBeVisible({ timeout: 20000 });
  expect(await events(glance)).toHaveLength(1);
});

test('BOOKING_NOTICE on: a cancellation with no hold at that clock, or from another sender, shows nothing', async ({ glance }) => {
  await holdMade(glance);
  let page = await mail(glance, GONE_OTHER);
  await page.waitForTimeout(3000);
  await expect(page.locator(PANE + ' .flow-chip-host')).toHaveCount(0);
  page = await mail(glance, GONE, 'someone@else.example');
  await page.waitForTimeout(3000);
  await expect(page.locator(PANE + ' .flow-chip-host')).toHaveCount(0);
  expect(await events(glance)).toHaveLength(1);
});

test('BOOKING_NOTICE off: a cancellation shows nothing', async ({ glance }) => {
  await glance.seedOutlook({}, { calendar: true });
  const page = await mail(glance, GONE);
  await page.waitForTimeout(3000);
  await expect(page.locator(PANE + ' .flow-chip-host')).toHaveCount(0);
});
