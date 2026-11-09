// Three chat closes on the Meta lanes, Messenger and Instagram direct messages, for a Microsoft-only person (To Do and Calendar through the Graph
// stand-in): a vendor's invoice notice with a number and a day but no amount is one "Pay invoice 2231" task (CHAT_TASK_CARD); the person's own
// "I paid invoice 2231" then offers Mark done on that task (CHAT_PROMISE_CARD), Do It completes it and reads it back, Undo reopens it; and a
// plumber's day and hours is one calendar hold titled "Visit 08:00-12:00" with no guest. Nothing is paid or sent. Unpacked extension, the
// production lane registrations, the Graph stand-in. Not a live run: the markup is a fixture.
const { test, expect } = require('./support/harness');

const HTML_M = (text, author, id) => '<!doctype html><html><body><div role="main"><header><h2 data-glance-title>Dana</h2><a href="/100012345678/" role="link">Dana</a>' +
  '<a aria-label="Conversation information" href="https://www.messenger.com/t/100012345678">Conversation information</a></header>' +
  '<div role="row" data-author="' + author + '" data-message-id="' + id + '"><span dir="auto">' + text + '</span></div>' +
  '<div data-glance-composer="1" contenteditable="true" role="textbox" aria-label="Message"></div>' +
  '<button type="button" aria-label="Send"></button></div></body></html>';

const HTML_I = (text, author, id) => '<!doctype html><html><body><div role="main"><header><img alt="Dana\'s profile picture" src="data:,"><h2 data-glance-title>Dana</h2><a href="/dana/" role="link">Dana</a>' +
  '<button type="button" aria-label="Chat details">Chat details</button></header>' +
  '<div role="row" data-author="' + author + '" data-message-id="' + id + '"><span dir="auto">' + text + '</span></div>' +
  '<div data-glance-composer="1" contenteditable="true" role="textbox" aria-label="Message"></div>' +
  '<button type="button" aria-label="Send"></button></div></body></html>';

async function registerMessenger(glance) {
  const ok = await glance.evaluateWorker(async () => {
    const lane = globalThis.__glanceLaneChatDefs.find((l) => l.id === 'glance-lane-messenger');
    const id = 'glance-lane-messenger-e2e';
    try { await chrome.scripting.unregisterContentScripts({ ids: [id] }); } catch (e) { /* first run */ }
    await chrome.scripting.registerContentScripts([{ id: id, matches: ['https://www.messenger.com/*', 'https://messenger.com/*'], js: globalThis.__glanceLaneChatScripts(lane), css: ['design/step-states-v1/scoped.css', 'src/chip.css'], runAt: 'document_idle' }]);
    return true;
  });
  expect(ok).toBe(true);
}

async function registerInstagram(glance) {
  const ok = await glance.evaluateWorker(async () => {
    const lane = globalThis.__glanceLaneChatDefs.find((l) => l.id === 'glance-lane-instagram');
    const id = 'glance-lane-instagram-e2e';
    try { await chrome.scripting.unregisterContentScripts({ ids: [id] }); } catch (e) { /* first run */ }
    await chrome.scripting.registerContentScripts([{ id: id, matches: ['https://www.instagram.com/direct', 'https://www.instagram.com/direct/*', 'https://instagram.com/direct', 'https://instagram.com/direct/*'], js: globalThis.__glanceLaneChatScripts(lane), css: ['design/step-states-v1/scoped.css', 'src/chip.css'], runAt: 'document_idle' }]);
    return true;
  });
  expect(ok).toBe(true);
}

const LANES = [
  { name: 'Messenger', html: HTML_M, register: registerMessenger, open: (g, h) => g.openMessenger(h) },
  { name: 'Instagram', html: HTML_I, register: registerInstagram, open: (g, h) => g.openInstagram(h) }
];
const CARD = '#glance-chat-task .flow-chip-host';
const todo = (glance) => glance.evaluateWorker(() => Object.values(globalThis.__glanceE2e.todoTasks));
const events = (glance) => glance.evaluateWorker(() => Object.values(globalThis.__glanceE2e.outlookEvents));

for (const L of LANES) {
  test(L.name + ': an invoice notice with no amount is one Pay task, the person\'s own "I paid invoice 2231" marks it done, and Undo reopens it', async ({ glance }) => {
    await L.register(glance);
    await glance.seedOutlook({ glanceSwitches: { CHAT_TASK_CARD: true, CHAT_PROMISE_CARD: true } });
    let page = await L.open(glance, L.html('Reminder: your invoice 2231 is due on Thursday', 'them', 'i1'));
    await expect(page.locator(CARD)).toBeVisible({ timeout: 20000 });
    await page.locator(CARD + ' button.flow-chip').click();
    await expect(page.locator(CARD + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
    let tasks = await todo(glance);
    expect(tasks).toHaveLength(1);
    expect(JSON.stringify(tasks[0])).toMatch(/Pay invoice 2231/);
    page = await L.open(glance, L.html('I paid invoice 2231', 'me', 'i2'));
    await expect(page.locator(CARD)).toBeVisible({ timeout: 20000 });
    await expect(page.locator(CARD)).toContainText('Mark done');
    await page.locator(CARD + ' button.flow-chip').click();
    await expect(page.locator(CARD + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
    tasks = await todo(glance);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].status).toBe('completed');
    expect(await page.evaluate(() => window.__glanceSendClicks || 0)).toBe(0);
    await page.locator(CARD + ' button.flow-chip-undo').click();
    await expect.poll(async () => (await todo(glance))[0].status).not.toBe('completed');
  });

  test(L.name + ': a plumber\'s day and hours is one hold titled Visit 08:00-12:00, no guest, and Undo deletes it', async ({ glance }) => {
    await L.register(glance);
    await glance.seedOutlook({ glanceSwitches: { CHAT_TASK_CARD: true } }, { calendar: true });
    const page = await L.open(glance, L.html('The plumber will come between 8 and 12 on Tuesday', 'them', 'v1'));
    await expect(page.locator(CARD)).toBeVisible({ timeout: 20000 });
    await page.locator(CARD + ' button.flow-chip').click();
    await expect(page.locator(CARD + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
    const list = await events(glance);
    expect(list).toHaveLength(1);
    expect(list[0].subject).toMatch(/Visit 08:00/);
    expect(list[0].attendees || []).toEqual([]);
    expect(await page.evaluate(() => window.__glanceSendClicks || 0)).toBe(0);
    await page.locator(CARD + ' button.flow-chip-undo').click();
    await expect.poll(async () => (await events(glance)).length).toBe(0);
  });

  for (const [label, text, want] of [['"bring" with a day', 'Please bring your passport tomorrow', /bring your passport/i], ['"call the bank on Monday"', 'Please call the bank on Monday', /call the bank/i], ['a friendly reminder', 'Friendly reminder to submit your expense report by Thursday', /expense report/i]]) {
    test(L.name + ': ' + label + ' is one To Do task, read back, nothing is sent, and Undo deletes it', async ({ glance }) => {
      await L.register(glance);
      await glance.seedOutlook({ glanceSwitches: { CHAT_TASK_CARD: true } });
      const page = await L.open(glance, L.html(text, 'them', 'r1'));
      await expect(page.locator(CARD)).toBeVisible({ timeout: 20000 });
      await page.locator(CARD + ' button.flow-chip').click();
      await expect(page.locator(CARD + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
      const tasks = await todo(glance);
      expect(tasks).toHaveLength(1);
      expect(JSON.stringify(tasks[0])).toMatch(want);
      expect(await page.evaluate(() => window.__glanceSendClicks || 0)).toBe(0);
      await page.locator(CARD + ' button.flow-chip-undo').click();
      await expect.poll(async () => (await todo(glance)).length).toBe(0);
    });
  }
}
