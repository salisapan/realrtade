// The chat task card, behind the owner's off switch CHAT_TASK_CARD in glanceSwitches (docs/glance-ai/chat-task-card-spec.md).
// A one-to-one Messenger chat (the real chat lane registration, with the judge and card files the production lane loads),
// the local Google lane server. Off: no card, no task call. On: the canonical Do It card in a corner, Do It writes one
// Google Task whose note names the chat, reads it back by id, a receipt that survives a reload, Undo removes it and refuses
// after the person edited it. Nothing is sent and no key is pressed.
const fs = require('fs');
const path = require('path');
const { test, expect } = require('./support/harness');
const { startGoogleLaneServer } = require('./support/google-lane-server');

const ASK = 'Can you review the draft by Wednesday?';
const HTML = (text, who) => '<!doctype html><html><body><div role="main"><header><h2 data-glance-title>Dana</h2><a href="/100012345678/" role="link">Dana</a>' +
  '<a aria-label="Conversation information" href="https://www.messenger.com/t/100012345678">Conversation information</a></header>' +
  '<div role="row" data-author="' + (who || 'them') + '" data-message-id="m1"><span dir="auto">' + text + '</span></div>' +
  '<div data-glance-composer="1" contenteditable="true" role="textbox" aria-label="Message"></div>' +
  '<button type="button" aria-label="Send"></button></div></body></html>';

let server;
test.beforeAll(async () => { server = await startGoogleLaneServer(); });
test.afterAll(async () => { if (server) await server.close(); });
test.beforeEach(async ({ glance }) => {
  server.reset();
  server.setAccount('me@x.com');
  await glance.evaluateWorker((origin) => { globalThis.__glanceE2e.httpOrigin = origin; }, server.origin);
});

// The production registration: the lane's own definition run through the builder the worker uses.
async function registerRealLane(glance) {
  const ok = await glance.evaluateWorker(async () => {
    const lane = globalThis.__glanceLaneChatDefs.find((l) => l.id === 'glance-lane-messenger');
    const id = 'glance-lane-messenger-e2e';
    try { await chrome.scripting.unregisterContentScripts({ ids: [id] }); } catch (e) { /* first run */ }
    await chrome.scripting.registerContentScripts([{
      id: id,
      matches: ['https://www.messenger.com/*', 'https://messenger.com/*'],
      js: globalThis.__glanceLaneChatScripts(lane),
      css: ['design/step-states-v1/scoped.css', 'src/chip.css'],
      runAt: 'document_idle'
    }]);
    const listed = await chrome.scripting.getRegisteredContentScripts({ ids: [id] });
    const js = listed[0].js;
    return js.indexOf('core/incoming-judge.js') >= 0 && js.indexOf('src/chat-task-card.js') > js.indexOf('src/chat-lane.js');
  });
  expect(ok).toBe(true);
}

async function open(glance, switches, text, who) {
  await registerRealLane(glance);
  await glance.seedGmail(Object.assign({ googleConnectedAccount: { email: 'me@x.com', at: Date.now(), source: 'web' } }, switches ? { glanceSwitches: switches } : {}));
  return glance.openMessenger(HTML(text || ASK, who));
}
const CARD = '#glance-chat-task .flow-chip-host';
const tasks = () => Object.values(server.tasks());
const taskCalls = () => server.calls.filter((c) => /tasks\/v1/.test(c.path) && c.method !== 'GET');

test('CHAT_TASK_CARD off: no card and no task call', async ({ glance }) => {
  const page = await open(glance, null);
  await page.waitForTimeout(5000);
  await expect(page.locator(CARD)).toHaveCount(0);
  expect(taskCalls()).toHaveLength(0);
});

test('CHAT_TASK_CARD on: the card shows, Do It writes one task naming the chat, reads it back, survives a reload, and Undo removes it', async ({ glance }) => {
  const page = await open(glance, { CHAT_TASK_CARD: true });
  await expect(page.locator(CARD)).toBeVisible({ timeout: 20000 });
  await page.locator(CARD + ' button.flow-chip').click();
  await expect(page.locator(CARD + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  expect(tasks()).toHaveLength(1);
  expect(tasks()[0].notes).toContain('Open in Messenger');
  expect(tasks()[0].notes).toContain('https://www.messenger.com/t/100012345678');
  expect(await page.evaluate(() => window.__glanceSendClicks || 0)).toBe(0);

  await page.reload();
  await expect(page.locator(CARD + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  expect(tasks()).toHaveLength(1);

  await page.locator(CARD + ' button.flow-chip-undo').click();
  await expect.poll(() => tasks().length).toBe(0);
});

test('CHAT_TASK_CARD on: Undo refuses after the person edited the task, and the task stays', async ({ glance }) => {
  const page = await open(glance, { CHAT_TASK_CARD: true });
  await page.locator(CARD + ' button.flow-chip').click();
  await expect(page.locator(CARD + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  const id = Object.keys(server.tasks())[0];
  server.editTask(id, { title: 'Changed by the person' });
  await page.locator(CARD + ' button.flow-chip-undo').click();
  await expect(page.locator(CARD)).toContainText(/changed the task|left it as you left it/i, { timeout: 15000 });
  expect(server.tasks()[id].title).toBe('Changed by the person');
});

test('CHAT_TASK_CARD on: a line that is not a task shows nothing', async ({ glance }) => {
  const page = await open(glance, { CHAT_TASK_CARD: true }, 'Thanks, got it!');
  await page.waitForTimeout(5000);
  await expect(page.locator(CARD)).toHaveCount(0);
  expect(taskCalls()).toHaveLength(0);
});

// A proposed meeting in the chat becomes a hold on the person's own Google Calendar, through the same lane as the Gmail card.
const MEET = 'Could we meet Thursday at 3pm to go over the pilot?';
const events = () => Object.values(server.events());

test('CHAT_TASK_CARD on: a proposed meeting shows the card, Do It makes one hold with nobody invited, Undo removes it', async ({ glance }) => {
  const page = await open(glance, { CHAT_TASK_CARD: true }, MEET);
  await expect(page.locator(CARD)).toBeVisible({ timeout: 20000 });
  await page.locator(CARD + ' button.flow-chip').click();
  await expect(page.locator(CARD + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  expect(events()).toHaveLength(1);
  const ev = events()[0];
  expect(String(ev.start.dateTime)).toMatch(/T15:00:00/);
  expect(ev.attendees || []).toHaveLength(0);
  expect(String(ev.description || '')).toContain('https://www.messenger.com/t/100012345678');
  expect(await page.evaluate(() => window.__glanceSendClicks || 0)).toBe(0);
  await page.reload();
  await expect(page.locator(CARD + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  expect(events()).toHaveLength(1);
  await page.locator(CARD + ' button.flow-chip-undo').click();
  await expect.poll(() => events().length).toBe(0);
});

test('CHAT_TASK_CARD on: Undo of a hold refuses after the person edited the event', async ({ glance }) => {
  const page = await open(glance, { CHAT_TASK_CARD: true }, MEET);
  await page.locator(CARD + ' button.flow-chip').click();
  await expect(page.locator(CARD + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  const id = Object.keys(server.events())[0];
  server.editEvent(id, { description: 'Agenda: pricing' });
  await page.locator(CARD + ' button.flow-chip-undo').click();
  await expect(page.locator(CARD)).toContainText(/changed|left it|edited/i, { timeout: 15000 });
  expect(server.events()[id]).toBeTruthy();
});

// The person's own dated promise in the chat becomes a task, behind its own switch CHAT_PROMISE_CARD.
const PROMISE = 'אשלח לך את ההצעה עד יום חמישי';

test('CHAT_PROMISE_CARD off: the person\'s own promise shows nothing, even with CHAT_TASK_CARD on', async ({ glance }) => {
  const page = await open(glance, { CHAT_TASK_CARD: true }, PROMISE, 'me');
  await page.waitForTimeout(5000);
  await expect(page.locator(CARD)).toHaveCount(0);
  expect(taskCalls()).toHaveLength(0);
});

test('CHAT_PROMISE_CARD on: the own promise shows the card, Do It writes one task due that day, read back, Undo removes it', async ({ glance }) => {
  const page = await open(glance, { CHAT_PROMISE_CARD: true }, PROMISE, 'me');
  await expect(page.locator(CARD)).toBeVisible({ timeout: 20000 });
  await page.locator(CARD + ' button.flow-chip').click();
  await expect(page.locator(CARD + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  expect(tasks()).toHaveLength(1);
  expect(tasks()[0].title).toContain('Dana');
  expect(String(tasks()[0].due || '')).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  expect(tasks()[0].notes).toContain('To: Dana');
  expect(tasks()[0].notes).toContain('Open in Messenger');
  expect(await page.evaluate(() => window.__glanceSendClicks || 0)).toBe(0);
  await page.reload();
  await expect(page.locator(CARD + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  expect(tasks()).toHaveLength(1);
  await page.locator(CARD + ' button.flow-chip-undo').click();
  await expect.poll(() => tasks().length).toBe(0);
});

test('CHAT_PROMISE_CARD on: a vague promise and a promise from them (not me) show no promise card', async ({ glance }) => {
  const page = await open(glance, { CHAT_PROMISE_CARD: true }, 'I will think about it', 'me');
  await page.waitForTimeout(4000);
  await expect(page.locator(CARD)).toHaveCount(0);
  const again = await open(glance, { CHAT_PROMISE_CARD: true }, ASK, 'them');
  await again.waitForTimeout(4000);
  await expect(again.locator(CARD)).toHaveCount(0);
  expect(taskCalls()).toHaveLength(0);
});

// An agreed meeting («מעולה, נתראה ביום חמישי ב-15:00») is not a proposal; core/meeting-confirm.js reads it and the card holds it.
test('CHAT_TASK_CARD on: an agreed Hebrew meeting shows the card, Do It holds it titled with the person, Undo removes it', async ({ glance }) => {
  const page = await open(glance, { CHAT_TASK_CARD: true }, 'מעולה, נתראה ביום חמישי ב-15:00');
  await expect(page.locator(CARD)).toBeVisible({ timeout: 20000 });
  await page.locator(CARD + ' button.flow-chip').click();
  await expect(page.locator(CARD + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  expect(events()).toHaveLength(1);
  const ev = events()[0];
  expect(ev.summary).toBe('פגישה · Dana');
  expect(String(ev.start.dateTime)).toMatch(/T15:00:00/);
  expect(ev.attendees || []).toHaveLength(0);
  expect(String(ev.description || '')).not.toContain('נתראה');
  await page.locator(CARD + ' button.flow-chip-undo').click();
  await expect.poll(() => events().length).toBe(0);
});

test('CHAT_TASK_CARD on: a cancelled or looking-back meeting message shows no card', async ({ glance }) => {
  const page = await open(glance, { CHAT_TASK_CARD: true }, 'מצטער, לא אוכל ביום חמישי ב-15:00');
  await page.waitForTimeout(4000);
  await expect(page.locator(CARD)).toHaveCount(0);
  expect(events()).toHaveLength(0);
});
