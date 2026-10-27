// The chat card on a Microsoft-only person: a meeting or a Teams call proposed in a one-to-one Messenger chat becomes one hold on
// the person's Outlook Calendar (the Graph stand-in), nobody invited, read back by id, with a Teams link only when the owner's
// TEAMS_MEETING switch is on, and Undo deletes it. Closes the "Outlook hold has corpus coverage only" item.
const { test, expect } = require('./support/harness');

const HTML = (text) => '<!doctype html><html><body><div role="main"><header><h2 data-glance-title>Dana</h2><a href="/100012345678/" role="link">Dana</a>' +
  '<a aria-label="Conversation information" href="https://www.messenger.com/t/100012345678">Conversation information</a></header>' +
  '<div role="row" data-author="them" data-message-id="m1"><span dir="auto">' + text + '</span></div>' +
  '<div data-glance-composer="1" contenteditable="true" role="textbox" aria-label="Message"></div>' +
  '<button type="button" aria-label="Send"></button></div></body></html>';

async function registerRealLane(glance) {
  const ok = await glance.evaluateWorker(async () => {
    const lane = globalThis.__glanceLaneChatDefs.find((l) => l.id === 'glance-lane-messenger');
    const id = 'glance-lane-messenger-e2e';
    try { await chrome.scripting.unregisterContentScripts({ ids: [id] }); } catch (e) { /* first run */ }
    await chrome.scripting.registerContentScripts([{ id: id, matches: ['https://www.messenger.com/*', 'https://messenger.com/*'], js: globalThis.__glanceLaneChatScripts(lane), css: ['design/step-states-v1/scoped.css', 'src/chip.css'], runAt: 'document_idle' }]);
    return true;
  });
  expect(ok).toBe(true);
}
async function open(glance, switches, text) {
  await registerRealLane(glance);
  await glance.seedOutlook(Object.assign({}, switches ? { glanceSwitches: switches } : {}), { calendar: true });
  return glance.openMessenger(HTML(text));
}
const CARD = '#glance-chat-task .flow-chip-host';
const events = (glance) => glance.evaluateWorker(() => Object.values(globalThis.__glanceE2e.outlookEvents));

test('a meeting proposed in a chat is one Outlook hold with no guest, read back; Undo deletes it', async ({ glance }) => {
  const page = await open(glance, { CHAT_TASK_CARD: true }, 'Could we meet Thursday at 3pm to go over the pilot?');
  await expect(page.locator(CARD)).toBeVisible({ timeout: 20000 });
  await page.locator(CARD + ' button.flow-chip').click();
  await expect(page.locator(CARD + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  const list = await events(glance);
  expect(list).toHaveLength(1);
  expect(list[0].attendees || []).toEqual([]);
  expect(JSON.stringify(list[0])).not.toContain('go over the pilot');
  expect(list[0].isOnlineMeeting).toBeFalsy();
  await page.locator(CARD + ' button.flow-chip-undo').click();
  await expect.poll(async () => (await events(glance)).length).toBe(0);
});

test('TEAMS_MEETING on: a Teams call proposed in a chat is one Outlook hold with a Teams link, read back', async ({ glance }) => {
  const page = await open(glance, { CHAT_TASK_CARD: true, TEAMS_MEETING: true }, 'Can we do a Teams call Thursday at 3pm?');
  await expect(page.locator(CARD)).toBeVisible({ timeout: 20000 });
  await page.locator(CARD + ' button.flow-chip').click();
  await expect(page.locator(CARD + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  const list = await events(glance);
  expect(list).toHaveLength(1);
  expect(list[0].isOnlineMeeting).toBe(true);
  expect(list[0].attendees || []).toEqual([]);
  expect(String(list[0].subject)).toMatch(/^Call/);
});

test('TEAMS_MEETING off: the same Teams call proposal is one plain hold, no link', async ({ glance }) => {
  const page = await open(glance, { CHAT_TASK_CARD: true }, 'Can we do a Teams call Thursday at 3pm?');
  await expect(page.locator(CARD)).toBeVisible({ timeout: 20000 });
  await page.locator(CARD + ' button.flow-chip').click();
  await expect(page.locator(CARD + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  const list = await events(glance);
  expect(list).toHaveLength(1);
  expect(list[0].isOnlineMeeting).toBeFalsy();
});

const todo = (glance) => glance.evaluateWorker(() => Object.values(globalThis.__glanceE2e.todoTasks));

test('a task asked in a chat is one Microsoft To Do task naming the chat, read back, Handled, and Undo deletes it', async ({ glance }) => {
  const page = await open(glance, { CHAT_TASK_CARD: true }, 'Can you review the draft by Wednesday?');
  await expect(page.locator(CARD)).toBeVisible({ timeout: 20000 });
  await page.locator(CARD + ' button.flow-chip').click();
  await expect(page.locator(CARD + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  const list = await todo(glance);
  expect(list).toHaveLength(1);
  expect(JSON.stringify(list[0])).toContain('Open in Messenger');
  expect(JSON.stringify(list[0])).not.toContain('review the draft by Wednesday?');
  await page.locator(CARD + ' button.flow-chip-undo').click();
  await expect.poll(async () => (await todo(glance)).length).toBe(0);
});

test('a reminder asked in a chat is one Microsoft To Do task titled with the thing, Handled, and Undo deletes it', async ({ glance }) => {
  const page = await open(glance, { CHAT_TASK_CARD: true }, "Don't forget to bring the signed form on Monday");
  await expect(page.locator(CARD)).toBeVisible({ timeout: 20000 });
  await page.locator(CARD + ' button.flow-chip').click();
  await expect(page.locator(CARD + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  const list = await todo(glance);
  expect(list).toHaveLength(1);
  expect(JSON.stringify(list[0])).toMatch(/signed form/i);
  await page.locator(CARD + ' button.flow-chip-undo').click();
  await expect.poll(async () => (await todo(glance)).length).toBe(0);
});

test('the same reminder repeated in the same chat while its task stands is not offered a second To Do task', async ({ glance }) => {
  let page = await open(glance, { CHAT_TASK_CARD: true }, "Don't forget to bring the signed form on Monday");
  await expect(page.locator(CARD)).toBeVisible({ timeout: 20000 });
  await page.locator(CARD + ' button.flow-chip').click();
  await expect(page.locator(CARD + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  expect(await todo(glance)).toHaveLength(1);
  page = await glance.openMessenger(HTML("Hi again, don't forget to bring the signed form on Monday"));
  await page.waitForTimeout(3000);
  await expect(page.locator(CARD + ' button.flow-chip')).toHaveCount(0);
  expect(await todo(glance)).toHaveLength(1);
});

test('a payment asked in a chat is one To Do task, and "Reminder: …" repeating it is not offered a second one', async ({ glance }) => {
  let page = await open(glance, { CHAT_TASK_CARD: true }, 'Please transfer 500 NIS to my account by Sunday');
  await expect(page.locator(CARD)).toBeVisible({ timeout: 20000 });
  await page.locator(CARD + ' button.flow-chip').click();
  await expect(page.locator(CARD + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  const first = await todo(glance);
  expect(first).toHaveLength(1);
  expect(JSON.stringify(first[0])).toMatch(/Pay 500 NIS/);
  expect(JSON.stringify(first[0])).not.toContain('my account');
  page = await glance.openMessenger(HTML('Reminder: please transfer 500 NIS to my account by Sunday'));
  await page.waitForTimeout(3000);
  await expect(page.locator(CARD + ' button.flow-chip')).toHaveCount(0);
  expect(await todo(glance)).toHaveLength(1);
});

test('a deadline asked in a chat is one To Do task, and "Reminder: …" repeating it is not offered a second one', async ({ glance }) => {
  let page = await open(glance, { CHAT_TASK_CARD: true }, 'Please send the signed form by Monday');
  await expect(page.locator(CARD)).toBeVisible({ timeout: 20000 });
  await page.locator(CARD + ' button.flow-chip').click();
  await expect(page.locator(CARD + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  expect(await todo(glance)).toHaveLength(1);
  page = await glance.openMessenger(HTML('Reminder: please send the signed form by Monday'));
  await page.waitForTimeout(3000);
  await expect(page.locator(CARD + ' button.flow-chip')).toHaveCount(0);
  expect(await todo(glance)).toHaveLength(1);
});

test('a booking the business cancelled offers to remove the hold Glance made from this chat; Do It removes that event and it is gone', async ({ glance }) => {
  let page = await open(glance, { CHAT_TASK_CARD: true }, 'Your appointment is confirmed for tomorrow at 14:00');
  await expect(page.locator(CARD)).toBeVisible({ timeout: 20000 });
  await page.locator(CARD + ' button.flow-chip').click();
  await expect(page.locator(CARD + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  expect(await events(glance)).toHaveLength(1);
  page = await glance.openMessenger(HTML('Your appointment tomorrow at 14:00 was cancelled'));
  await expect(page.locator(CARD)).toBeVisible({ timeout: 20000 });
  await page.locator(CARD + ' button.flow-chip').click();
  await expect(page.locator(CARD + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  await expect.poll(async () => (await events(glance)).length).toBe(0);
});

test('a cancellation with no hold from this chat offers nothing', async ({ glance }) => {
  const page = await open(glance, { CHAT_TASK_CARD: true }, 'Your appointment tomorrow at 14:00 was cancelled');
  await page.waitForTimeout(3000);
  await expect(page.locator(CARD + ' button.flow-chip')).toHaveCount(0);
});

test('a cancelled flight offers to remove the Trip hold Glance made from this chat; Do It removes that event', async ({ glance }) => {
  let page = await open(glance, { CHAT_TASK_CARD: true }, 'Your flight LY001 departs tomorrow at 06:30');
  await expect(page.locator(CARD)).toBeVisible({ timeout: 20000 });
  await page.locator(CARD + ' button.flow-chip').click();
  await expect(page.locator(CARD + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  expect(await events(glance)).toHaveLength(1);
  page = await glance.openMessenger(HTML('Your flight LY001 departing tomorrow at 06:30 was cancelled'));
  await expect(page.locator(CARD)).toBeVisible({ timeout: 20000 });
  await page.locator(CARD + ' button.flow-chip').click();
  await expect(page.locator(CARD + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  await expect.poll(async () => (await events(glance)).length).toBe(0);
});
