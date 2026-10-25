// A cancellation mail on the real Gmail card, behind the owner's off switch BOOKING_NOTICE: the business that confirmed an appointment
// (and whose hold Glance wrote) writes "your appointment tomorrow at 14:00 was cancelled". Do It removes that same Google Calendar event
// through the hold's own undo and the lane reads back that it is gone; an event the person changed is left and the card says so; with
// no hold from that sender at that day and clock the mail shows nothing. Unpacked extension, local Google lane server. Nothing is sent.
const { test, expect } = require('./support/harness');
const { startGoogleLaneServer } = require('./support/google-lane-server');

const APPT = 'Hi, your appointment is confirmed for tomorrow at 14:00. See you then.';
const GONE = 'Hi, unfortunately your appointment tomorrow at 14:00 was cancelled.';
const GONE_OTHER = 'Hi, unfortunately your appointment tomorrow at 16:00 was cancelled.';
const MAIN = 'div[role="main"]';
let server;
let n = 0;

test.beforeAll(async () => { server = await startGoogleLaneServer(); });
test.afterAll(async () => { if (server) await server.close(); });
test.beforeEach(async ({ glance }) => {
  server.reset();
  server.setAccount('me@x.com');
  await glance.evaluateWorker((origin) => { globalThis.__glanceE2e.httpOrigin = origin; }, server.origin);
});

const mail = (glance, body, sender) => {
  n += 1;
  return glance.openGmail({ messageId: 'm-bc-' + n, threadId: 't-bc-' + n, subject: 'Your booking', senderEmail: sender || 'hello@nofar.example', senderName: 'Studio Nofar', body: body, detailsTable: { to: ['me@x.com'], cc: [], expanded: true, hebrew: false } });
};
const events = () => Object.values(server.events());

async function holdMade(glance) {
  await glance.seedGmail({ glanceSwitches: { BOOKING_NOTICE: true } });
  const page = await mail(glance, APPT);
  const chip = page.locator(MAIN + ' button.flow-chip');
  await expect(chip).toBeVisible({ timeout: 20000 });
  await chip.click();
  await expect(page.locator(MAIN + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  expect(events()).toHaveLength(1);
}

test('BOOKING_NOTICE on: the cancellation removes the hold Glance made for that appointment, read back', async ({ glance }) => {
  await holdMade(glance);
  const page = await mail(glance, GONE);
  const chip = page.locator(MAIN + ' button.flow-chip');
  await expect(chip).toBeVisible({ timeout: 20000 });
  await chip.click();
  await expect(page.locator(MAIN + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  expect(events()).toHaveLength(0);
});

test('BOOKING_NOTICE on: an event the person changed stays and the card says so', async ({ glance }) => {
  await holdMade(glance);
  const id = Object.keys(server.events())[0];
  server.event(id).summary = 'Appointment (moved by me)';
  server.event(id).description = 'my own notes';
  const page = await mail(glance, GONE);
  const chip = page.locator(MAIN + ' button.flow-chip');
  await expect(chip).toBeVisible({ timeout: 20000 });
  await chip.click();
  await expect(page.locator(MAIN + ' [data-glance-chip-state="flow-chip-error"], ' + MAIN + ' .flow-chip-error')).toBeVisible({ timeout: 20000 });
  expect(events()).toHaveLength(1);
});

test('BOOKING_NOTICE on: a cancellation with no hold at that clock, or from another sender, shows nothing', async ({ glance }) => {
  await holdMade(glance);
  let page = await mail(glance, GONE_OTHER);
  await page.waitForTimeout(3000);
  await expect(page.locator(MAIN + ' button.flow-chip')).toHaveCount(0);
  page = await mail(glance, GONE, 'someone@else.example');
  await page.waitForTimeout(3000);
  await expect(page.locator(MAIN + ' button.flow-chip')).toHaveCount(0);
  expect(events()).toHaveLength(1);
});

test('BOOKING_NOTICE off: a cancellation shows nothing', async ({ glance }) => {
  await glance.seedGmail({});
  const page = await mail(glance, GONE);
  await page.waitForTimeout(3000);
  await expect(page.locator(MAIN + ' button.flow-chip')).toHaveCount(0);
});
