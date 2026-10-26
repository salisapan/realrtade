// The late-payment reminder (CHAT_CHASE_DRAFT, off) on Messenger for a Microsoft-only person: the person asked Dana for 500 NIS by Thursday
// ("Waiting on Dana: Payment 500 NIS" task in Microsoft To Do, CHAT_PROMISE_CARD), the day has passed, and Dana writes something that is not
// the payment. The card offers the polite reminder; Do It puts it in the chat's box and nowhere else; nothing is sent; the To Do task stays
// open; Undo empties the box while the words are unchanged. Unpacked extension, the production Messenger lane registration, the Graph stand-in.
const { test, expect } = require('./support/harness');

const HTML = (text, author, id) => '<!doctype html><html><body><div role="main"><header><h2 data-glance-title>Dana</h2><a href="/100012345678/" role="link">Dana</a>' +
  '<a aria-label="Conversation information" href="https://www.messenger.com/t/100012345678">Conversation information</a></header>' +
  '<div role="row" data-author="' + author + '" data-message-id="' + id + '"><span dir="auto">' + text + '</span></div>' +
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
const CARD = '#glance-chat-task .flow-chip-host';
const BOX = '[data-glance-composer="1"]';
const todo = (glance) => glance.evaluateWorker(() => Object.values(globalThis.__glanceE2e.todoTasks));
const isoDaysAgo = (n) => { const d = new Date(Date.now() - n * 86400000); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

async function waitingTask(glance, switches) {
  await registerRealLane(glance);
  await glance.seedOutlook({ glanceSwitches: Object.assign({ CHAT_TASK_CARD: true, CHAT_PROMISE_CARD: true }, switches || {}) });
  const page = await glance.openMessenger(HTML('Please transfer 500 NIS to my account by Thursday', 'me', 'm1'));
  await expect(page.locator(CARD)).toBeVisible({ timeout: 20000 });
  await page.locator(CARD + ' button.flow-chip').click();
  await expect(page.locator(CARD + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  expect(JSON.stringify(await todo(glance))).toContain('Waiting on Dana: Payment 500 NIS');
  const due = isoDaysAgo(3);
  await glance.evaluateWorker((iso) => new Promise((resolve) => chrome.storage.local.get('log', (bag) => {
    const log = (bag.log || []).map((e) => {
      const st = e && e.kind === 'written' && e.process && e.process.steps && e.process.steps[0];
      if (st && st.params && /^Waiting on/.test(String(st.params.title || ''))) {
        const steps = e.process.steps.map((s, k) => (k === 0 ? Object.assign({}, s, { params: Object.assign({}, s.params, { dateIso: iso }) }) : s));
        return Object.assign({}, e, { process: Object.assign({}, e.process, { steps: steps }) });
      }
      return e;
    });
    chrome.storage.local.set({ log: log }, resolve);
  })), due);
}

test('Messenger, CHAT_CHASE_DRAFT off: a late payment and an unrelated reply show no reminder card', async ({ glance }) => {
  await waitingTask(glance, null);
  const page = await glance.openMessenger(HTML('ok, I will check', 'them', 'm2'));
  await page.waitForTimeout(3000);
  await expect(page.locator(CARD)).toHaveCount(0);
  expect(await page.locator(BOX).innerText()).toBe('');
});

test('Messenger, CHAT_CHASE_DRAFT on: the reminder goes in the box, nothing is sent, the To Do task stays open, and Undo empties the box', async ({ glance }) => {
  await waitingTask(glance, { CHAT_CHASE_DRAFT: true });
  const page = await glance.openMessenger(HTML('ok, I will check', 'them', 'm2'));
  await expect(page.locator(CARD)).toBeVisible({ timeout: 20000 });
  await expect(page.locator(CARD)).toContainText('Reminder to Dana in the chat');
  await page.locator(CARD + ' button.flow-chip').click();
  await expect(page.locator(CARD + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  expect(await page.locator(BOX).innerText()).toMatch(/^Hi Dana, a quick reminder: I'm still waiting on the 500 NIS payment/);
  expect(await page.evaluate(() => window.__glanceSendClicks || 0)).toBe(0);
  const tasks = await todo(glance);
  expect(tasks).toHaveLength(1);
  expect(tasks[0].status || 'notStarted').not.toBe('completed');
  await page.locator(CARD + ' button.flow-chip-undo').click();
  await expect.poll(async () => page.locator(BOX).innerText()).toBe('');
});
