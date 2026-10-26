// Scenario rehearsal C — the restaurant, in the chat (holistic-close-map.md §4, slice 1, catalog M2/X2).
// WhatsApp Web, a one-to-one chat, the production WhatsApp lane registration. The friend asks where we
// ate last week; Glance reads the person's Google calendar and puts the one place in the chat box. It
// never presses Send. The approved send, the re-read of the sent line with fetchedBack, the receipt
// after reload and Undo do not exist yet (open-tasks row 54). Messenger stays quiet while its host is off.
const { test, expect } = require('./support/harness');
const { whatsappHtml, registerWhatsApp, dropMessengerLanes, expectedMissing, SEND_URL } = require('./support/rehearsal');

const ASK = 'איפה אכלנו בשבוע שעבר?';
const PLACE = 'Port Said, 5 Har Sinai, Tel Aviv';
const OTHER = 'North Abraxas, 40 Lilienblum, Tel Aviv';
const BOX = '[data-glance-composer="1"]';

test('C1 one place on the calendar: the chat box holds that place, nothing is sent, nothing is Handled', async ({ glance }, testInfo) => {
  expect(await registerWhatsApp(glance)).toBe(true);
  await glance.seedGmail();
  await glance.setScenario({ chatGoogleLocation: PLACE });
  const page = await glance.openWhatsApp(whatsappHtml(ASK));
  const box = page.locator(BOX);
  await expect(box).toContainText('Port Said', { timeout: 20000 });
  expect(await box.innerText()).toContain('https://www.google.com/maps/search/?api=1&query=');
  expect(await page.evaluate(() => window.__glanceSendClicks || 0)).toBe(0);
  const calls = await glance.apiCalls();
  expect(calls.some((c) => c.method === 'GET' && /calendar\/v3\/calendars\/primary\/events/.test(c.url))).toBe(true);
  expect(calls.some((c) => SEND_URL.test(c.url))).toBe(false);
  await expect(page.locator('.flow-chip-handled')).toHaveCount(0);

  expectedMissing(testInfo, 'row 54, M2', 'the person approves and Glance sends the line; a re-read of the sent line sets fetchedBack; Activity stores the chat message id');
  expectedMissing(testInfo, 'row 54, M2', 'reload the chat: the receipt is still there');
  expectedMissing(testInfo, 'row 54, M2', 'Undo deletes the sent line, or says Undo unavailable and Activity is not HANDLED');
});

test('C2 two different places that week: the box stays empty', async ({ glance }) => {
  expect(await registerWhatsApp(glance)).toBe(true);
  await glance.seedOutlook({ googleTasksAuth: { taskListId: 'glance-list' } });
  await glance.setScenario({ chatLocation: PLACE, chatGoogleLocation: OTHER });
  const page = await glance.openWhatsApp(whatsappHtml(ASK));
  await expect.poll(async () => {
    const calls = await glance.apiCalls();
    return calls.some((c) => /calendar\/v3/.test(c.url)) && calls.some((c) => c.url.indexOf('/me/calendarView') >= 0);
  }, { timeout: 20000 }).toBe(true);
  await page.waitForTimeout(2500);
  expect((await page.locator(BOX).innerText()).trim()).toBe('');
  expect(await page.evaluate(() => window.__glanceSendClicks || 0)).toBe(0);
});

test('C3 the same afternoon on Messenger, with that host not turned on: no draft and no calendar read', async ({ glance }) => {
  expect(await dropMessengerLanes(glance)).toBe(0);
  await glance.seedGmail();
  await glance.setScenario({ chatGoogleLocation: PLACE });
  const html = '<!doctype html><html><body><div role="main"><header><h2>Dana</h2></header>' +
    '<div role="row" data-author="them" data-message-id="m1"><span dir="auto">' + ASK + '</span></div>' +
    '<div data-glance-composer="1" contenteditable="true" role="textbox" aria-label="Message"></div>' +
    '<button type="button" aria-label="Send"></button></div></body></html>';
  const page = await glance.openMessenger(html);
  await page.waitForTimeout(6000);
  expect((await page.locator(BOX).innerText()).trim()).toBe('');
  const calls = await glance.apiCalls();
  expect(calls.some((c) => /calendar\/v3/.test(c.url))).toBe(false);
});
