// The chat task card on WhatsApp Web, the first user's main surface: the production WhatsApp lane registration, a one-to-one chat, the
// owner's off switch CHAT_TASK_CARD in glanceSwitches, a Microsoft-only person (the Graph stand-in). Until now the card was proved in a real
// browser on Messenger only. A delivery window, a cancelled booking, a payment and a chat from the person themself are the checks.
const { test, expect } = require('./support/harness');
const { whatsappHtml, registerWhatsApp, SEND_URL } = require('./support/rehearsal');

const CARD = '#glance-chat-task .flow-chip-host';
const events = (glance) => glance.evaluateWorker(() => Object.values(globalThis.__glanceE2e.outlookEvents));
const todo = (glance) => glance.evaluateWorker(() => Object.values(globalThis.__glanceE2e.todoTasks));

async function open(glance, switches, html) {
  expect(await registerWhatsApp(glance)).toBe(true);
  await glance.seedOutlook(switches ? { glanceSwitches: switches } : {}, { calendar: true });
  return glance.openWhatsApp(html);
}

test('WhatsApp, CHAT_TASK_CARD off: a delivery window shows no card and writes nothing', async ({ glance }) => {
  const page = await open(glance, null, whatsappHtml('Your package will be delivered tomorrow between 14:00 and 18:00'));
  await page.waitForTimeout(3000);
  await expect(page.locator(CARD)).toHaveCount(0);
  expect(await events(glance)).toHaveLength(0);
});

test('WhatsApp, CHAT_TASK_CARD on: a courier\'s delivery window is one hold titled Delivery 14:00–18:00, no guest, read back, and Undo deletes it', async ({ glance }) => {
  const page = await open(glance, { CHAT_TASK_CARD: true }, whatsappHtml('Your package will be delivered tomorrow between 14:00 and 18:00'));
  await expect(page.locator(CARD)).toBeVisible({ timeout: 20000 });
  await page.locator(CARD + ' button.flow-chip').click();
  await expect(page.locator(CARD + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  const list = await events(glance);
  expect(list).toHaveLength(1);
  expect(list[0].subject).toMatch(/Delivery 14:00–18:00/);
  expect(list[0].attendees || []).toEqual([]);
  expect(JSON.stringify(list[0].end)).toContain('18:00');
  expect(JSON.stringify(list[0])).not.toContain('package');
  expect(await page.evaluate(() => window.__glanceSendClicks || 0)).toBe(0);
  await page.locator(CARD + ' button.flow-chip-undo').click();
  await expect.poll(async () => (await events(glance)).length).toBe(0);
});

for (const [label, text, want, end] of [['English', 'The plumber will come between 8 and 12 on Tuesday', /Visit 08:00–12:00/, '12:00'], ['Hebrew', 'האינסטלטור יגיע ביום שלישי בין 8 ל-12', /ביקור 08:00–12:00/, '12:00']]) {
  test('WhatsApp, CHAT_TASK_CARD on: a plumber\'s visit window (' + label + ') is one hold titled Visit 08:00–12:00, no guest, read back, and Undo deletes it', async ({ glance }) => {
    const page = await open(glance, { CHAT_TASK_CARD: true }, whatsappHtml(text));
    await expect(page.locator(CARD)).toBeVisible({ timeout: 20000 });
    await page.locator(CARD + ' button.flow-chip').click();
    await expect(page.locator(CARD + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
    const list = await events(glance);
    expect(list).toHaveLength(1);
    expect(list[0].subject).toMatch(want);
    expect(list[0].attendees || []).toEqual([]);
    expect(JSON.stringify(list[0].end)).toContain(end);
    expect(await page.evaluate(() => window.__glanceSendClicks || 0)).toBe(0);
    await page.locator(CARD + ' button.flow-chip-undo').click();
    await expect.poll(async () => (await events(glance)).length).toBe(0);
  });
}

test('WhatsApp, CHAT_TASK_CARD on: an appointment that names its length is one hold of that length, no guest, and Undo deletes it', async ({ glance }) => {
  const page = await open(glance, { CHAT_TASK_CARD: true }, whatsappHtml('Your appointment is confirmed for tomorrow from 14:00 to 15:30'));
  await expect(page.locator(CARD)).toBeVisible({ timeout: 20000 });
  await page.locator(CARD + ' button.flow-chip').click();
  await expect(page.locator(CARD + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  const list = await events(glance);
  expect(list).toHaveLength(1);
  expect(list[0].subject).toMatch(/Appointment/);
  expect(JSON.stringify(list[0].start)).toContain('14:00');
  expect(JSON.stringify(list[0].end)).toContain('15:30');
  await page.locator(CARD + ' button.flow-chip-undo').click();
  await expect.poll(async () => (await events(glance)).length).toBe(0);
});

test('WhatsApp, CHAT_TASK_CARD and RECURRING_HOLD on: a lesson that repeats every Monday is the weekly Outlook series, no guest, and Undo deletes it', async ({ glance }) => {
  const page = await open(glance, { CHAT_TASK_CARD: true, RECURRING_HOLD: true }, whatsappHtml('Your piano lesson is every Monday at 17:00'));
  await expect(page.locator(CARD)).toBeVisible({ timeout: 20000 });
  await page.locator(CARD + ' button.flow-chip').click();
  await expect(page.locator(CARD + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  const list = await events(glance);
  expect(list).toHaveLength(1);
  expect(list[0].recurrence.pattern.type).toBe('weekly');
  expect(list[0].recurrence.pattern.daysOfWeek).toEqual(['monday']);
  expect(list[0].attendees || []).toEqual([]);
  await page.locator(CARD + ' button.flow-chip-undo').click();
  await expect.poll(async () => (await events(glance)).length).toBe(0);
});

test('WhatsApp, CHAT_TASK_CARD on: a polite Hebrew payment ask («נא להעביר ... עד מחר») is one To Do task, nothing is paid or sent, and Undo deletes it', async ({ glance }) => {
  const page = await open(glance, { CHAT_TASK_CARD: true }, whatsappHtml('נא להעביר את התשלום על 1200 ש"ח עד מחר'));
  await expect(page.locator(CARD)).toBeVisible({ timeout: 20000 });
  await page.locator(CARD + ' button.flow-chip').click();
  await expect(page.locator(CARD + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  const list = await todo(glance);
  expect(list).toHaveLength(1);
  expect(JSON.stringify(list[0])).toMatch(/לשלם 1200 NIS/);
  expect(await page.evaluate(() => window.__glanceSendClicks || 0)).toBe(0);
  await page.locator(CARD + ' button.flow-chip-undo').click();
  await expect.poll(async () => (await todo(glance)).length).toBe(0);
});

test('WhatsApp, CHAT_TASK_CARD on: a payment asked is one To Do task Pay 500 NIS, nothing is paid or sent', async ({ glance }) => {
  const page = await open(glance, { CHAT_TASK_CARD: true }, whatsappHtml('Please transfer 500 NIS to my account by Thursday'));
  await expect(page.locator(CARD)).toBeVisible({ timeout: 20000 });
  await page.locator(CARD + ' button.flow-chip').click();
  await expect(page.locator(CARD + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  const list = await todo(glance);
  expect(list).toHaveLength(1);
  expect(JSON.stringify(list[0])).toMatch(/Pay 500 NIS/);
  expect(JSON.stringify(list[0])).not.toContain('my account');
  expect(await page.evaluate(() => window.__glanceSendClicks || 0)).toBe(0);
  const calls = await glance.apiCalls();
  expect(calls.some((c) => SEND_URL.test(c.url))).toBe(false);
});

for (const [label, text, want] of [['English', 'Reminder: your invoice 2231 is due on Thursday', /Pay invoice 2231/], ['Hebrew', 'חשבונית מספר 2231 לתשלום עד יום חמישי', /לשלם חשבונית 2231/]]) {
  test('WhatsApp, CHAT_TASK_CARD on: an invoice with a number and a day but no amount (' + label + ') is one To Do task, nothing is paid or sent, Undo deletes it', async ({ glance }) => {
    const page = await open(glance, { CHAT_TASK_CARD: true }, whatsappHtml(text));
    await expect(page.locator(CARD)).toBeVisible({ timeout: 20000 });
    await page.locator(CARD + ' button.flow-chip').click();
    await expect(page.locator(CARD + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
    const list = await todo(glance);
    expect(list).toHaveLength(1);
    expect(JSON.stringify(list[0])).toMatch(want);
    expect(await page.evaluate(() => window.__glanceSendClicks || 0)).toBe(0);
    const calls = await glance.apiCalls();
    expect(calls.some((c) => SEND_URL.test(c.url))).toBe(false);
    await page.locator(CARD + ' button.flow-chip-undo').click();
    await expect.poll(async () => (await todo(glance)).length).toBe(0);
  });
}

test('WhatsApp, CHAT_TASK_CARD on: a cancelled booking offers to remove the hold made from this chat', async ({ glance }) => {
  let page = await open(glance, { CHAT_TASK_CARD: true }, whatsappHtml('Your appointment is confirmed for tomorrow at 14:00'));
  await expect(page.locator(CARD)).toBeVisible({ timeout: 20000 });
  await page.locator(CARD + ' button.flow-chip').click();
  await expect(page.locator(CARD + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  expect(await events(glance)).toHaveLength(1);
  page = await glance.openWhatsApp(whatsappHtml('Your appointment tomorrow at 14:00 was cancelled'));
  await expect(page.locator(CARD)).toBeVisible({ timeout: 20000 });
  await page.locator(CARD + ' button.flow-chip').click();
  await expect(page.locator(CARD + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  await expect.poll(async () => (await events(glance)).length).toBe(0);
});

test('WhatsApp, CHAT_TASK_CARD on: a plain chat line shows nothing', async ({ glance }) => {
  const page = await open(glance, { CHAT_TASK_CARD: true }, whatsappHtml('Haha see you on Thursday, thanks!'));
  await page.waitForTimeout(3000);
  await expect(page.locator(CARD)).toHaveCount(0);
  expect(await events(glance)).toHaveLength(0);
  expect(await todo(glance)).toHaveLength(0);
});

// Meta Business Suite shares the Messenger lane (same files, the business inbox addresses): a customer writing to the person's page.
const fs = require('fs');
const path = require('path');
const SUITE_HTML = fs.readFileSync(path.join(__dirname, '../test/fixtures/chat/live/business-suite-existing.html'), 'utf8');
const SUITE_ASK = 'איפה המסעדה שהיינו בה שבוע שעבר?';

test('Business Suite, CHAT_TASK_CARD on: a customer\'s payment ask on the page inbox is one To Do task, nothing is sent', async ({ glance }) => {
  const registered = await glance.evaluateWorker(async () => {
    const lane = globalThis.__glanceLaneChatDefs.find((l) => l.id === 'glance-lane-messenger');
    const id = 'glance-lane-messenger-e2e';
    try { await chrome.scripting.unregisterContentScripts({ ids: [id] }); } catch (e) { /* first run */ }
    await chrome.scripting.registerContentScripts([{
      id: id,
      matches: ['https://business.facebook.com/latest/inbox', 'https://business.facebook.com/latest/inbox/*', 'https://www.business.facebook.com/latest/inbox', 'https://www.business.facebook.com/latest/inbox/*'],
      js: globalThis.__glanceLaneChatScripts(lane),
      css: ['design/step-states-v1/scoped.css', 'src/chip.css'],
      runAt: 'document_idle'
    }]);
    return (await chrome.scripting.getRegisteredContentScripts({ ids: [id] })).length === 1;
  });
  expect(registered).toBe(true);
  expect(SUITE_HTML.indexOf(SUITE_ASK)).toBeGreaterThanOrEqual(0);
  await glance.seedOutlook({ glanceSwitches: { CHAT_TASK_CARD: true } }, { calendar: true });
  const page = await glance.openBusiness(SUITE_HTML.split(SUITE_ASK).join('Please transfer 500 NIS to my account by Thursday'));
  await expect(page.locator(CARD)).toBeVisible({ timeout: 20000 });
  await page.locator(CARD + ' button.flow-chip').click();
  await expect(page.locator(CARD + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  const list = await todo(glance);
  expect(list).toHaveLength(1);
  expect(JSON.stringify(list[0])).toMatch(/Pay 500 NIS/);
  expect(await page.evaluate(() => window.__glanceSendClicks || 0)).toBe(0);
});

// Instagram direct messages: the Instagram lane's own registration, the same card.
const IG_HTML = fs.readFileSync(path.join(__dirname, '../test/fixtures/chat/instagram-place.html'), 'utf8');
const IG_ASK = 'תשלח לי את המיקום של המסעדה שהייתם בה בשבוע שעבר';

test('Instagram, CHAT_TASK_CARD on: a Hebrew courier window in a direct message is one hold titled משלוח 10:00–12:00, nothing is sent', async ({ glance }) => {
  const registered = await glance.evaluateWorker(async () => {
    const lane = globalThis.__glanceLaneChatDefs.find((l) => l.id === 'glance-lane-instagram');
    const id = 'glance-lane-instagram-e2e';
    try { await chrome.scripting.unregisterContentScripts({ ids: [id] }); } catch (e) { /* first run */ }
    await chrome.scripting.registerContentScripts([{
      id: id,
      matches: ['https://www.instagram.com/direct', 'https://www.instagram.com/direct/*', 'https://instagram.com/direct', 'https://instagram.com/direct/*'],
      js: globalThis.__glanceLaneChatScripts(lane),
      css: ['design/step-states-v1/scoped.css', 'src/chip.css'],
      runAt: 'document_idle'
    }]);
    return (await chrome.scripting.getRegisteredContentScripts({ ids: [id] })).length === 1;
  });
  expect(registered).toBe(true);
  expect(IG_HTML.indexOf(IG_ASK)).toBeGreaterThanOrEqual(0);
  await glance.seedOutlook({ glanceSwitches: { CHAT_TASK_CARD: true } }, { calendar: true });
  const page = await glance.openInstagram(IG_HTML.split(IG_ASK).join('השליח יגיע מחר בין 10:00 ל-12:00'));
  await expect(page.locator(CARD)).toBeVisible({ timeout: 20000 });
  await page.locator(CARD + ' button.flow-chip').click();
  await expect(page.locator(CARD + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  const list = await events(glance);
  expect(list).toHaveLength(1);
  expect(list[0].subject).toMatch(/משלוח 10:00–12:00/);
  expect(list[0].attendees || []).toEqual([]);
  expect(await page.evaluate(() => window.__glanceSendClicks || 0)).toBe(0);
});

test('WhatsApp, CHAT_TASK_CARD on: a Hebrew payment ask is one To Do task and a Hebrew nudge repeating it is not offered a second one', async ({ glance }) => {
  let page = await open(glance, { CHAT_TASK_CARD: true }, whatsappHtml('תעביר לי 500 שקל עד יום חמישי'));
  await expect(page.locator(CARD)).toBeVisible({ timeout: 20000 });
  await page.locator(CARD + ' button.flow-chip').click();
  await expect(page.locator(CARD + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  expect(await todo(glance)).toHaveLength(1);
  page = await glance.openWhatsApp(whatsappHtml('תזכורת: תעביר לי 500 שקל עד יום חמישי', { id: 'BBB' }));
  await page.waitForTimeout(3000);
  await expect(page.locator(CARD + ' button.flow-chip')).toHaveCount(0);
  expect(await todo(glance)).toHaveLength(1);
});

test('WhatsApp, CHAT_PROMISE_CARD on: what the person asked the other side for is one follow-up task "Waiting on Dana: Payment 500 NIS", read back, nothing is sent, Undo deletes it', async ({ glance }) => {
  const page = await open(glance, { CHAT_PROMISE_CARD: true }, whatsappHtml('Please transfer 500 NIS to my account by Thursday', { own: true }));
  await expect(page.locator(CARD)).toBeVisible({ timeout: 20000 });
  await page.locator(CARD + ' button.flow-chip').click();
  await expect(page.locator(CARD + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  const list = await todo(glance);
  expect(list).toHaveLength(1);
  expect(JSON.stringify(list[0])).toContain('Waiting on Dana: Payment 500 NIS');
  expect(JSON.stringify(list[0])).not.toContain('my account');
  expect(await page.evaluate(() => window.__glanceSendClicks || 0)).toBe(0);
  await page.locator(CARD + ' button.flow-chip-undo').click();
  await expect.poll(async () => (await todo(glance)).length).toBe(0);
});

test('WhatsApp, CHAT_PROMISE_CARD on: a Hebrew ask for a document by a day is one follow-up task and a question shows nothing', async ({ glance }) => {
  let page = await open(glance, { CHAT_PROMISE_CARD: true }, whatsappHtml('תחתום על החוזה עד יום שישי', { own: true }));
  await expect(page.locator(CARD)).toBeVisible({ timeout: 20000 });
  await page.locator(CARD + ' button.flow-chip').click();
  await expect(page.locator(CARD + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  const list = await todo(glance);
  expect(list).toHaveLength(1);
  expect(JSON.stringify(list[0])).toContain('מחכים ל-Dana');
  page = await glance.openWhatsApp(whatsappHtml('Could you send me the contract by Thursday?', { own: true, id: 'QQQ' }));
  await page.waitForTimeout(3000);
  await expect(page.locator(CARD + ' button.flow-chip')).toHaveCount(0);
  expect(await todo(glance)).toHaveLength(1);
});

test('WhatsApp, CHAT_PROMISE_CARD on: a polite Hebrew ask for a document («נא לשלוח את הטפסים החתומים עד יום רביעי») is one follow-up task, nothing is sent', async ({ glance }) => {
  const page = await open(glance, { CHAT_PROMISE_CARD: true }, whatsappHtml('נא לשלוח את הטפסים החתומים עד יום רביעי', { own: true }));
  await expect(page.locator(CARD)).toBeVisible({ timeout: 20000 });
  await page.locator(CARD + ' button.flow-chip').click();
  await expect(page.locator(CARD + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  const list = await todo(glance);
  expect(list).toHaveLength(1);
  expect(JSON.stringify(list[0])).toContain('מחכים ל-Dana');
  expect(JSON.stringify(list[0])).toContain('הטפסים החתומים');
  expect(await page.evaluate(() => window.__glanceSendClicks || 0)).toBe(0);
});

test('WhatsApp, CHAT_PROMISE_CARD on: "Reminder: please transfer …" typed to the other person is a Waiting-on follow-up, not a note to self with the message words', async ({ glance }) => {
  const page = await open(glance, { CHAT_PROMISE_CARD: true }, whatsappHtml('Reminder: please transfer 500 NIS to my account by Thursday', { own: true }));
  await expect(page.locator(CARD)).toBeVisible({ timeout: 20000 });
  await page.locator(CARD + ' button.flow-chip').click();
  await expect(page.locator(CARD + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  const list = await todo(glance);
  expect(list).toHaveLength(1);
  expect(JSON.stringify(list[0])).toContain('Waiting on Dana: Payment 500 NIS');
  expect(JSON.stringify(list[0])).not.toContain('my account');
});
