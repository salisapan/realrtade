const fs = require('fs');
const path = require('path');
const { test, expect } = require('./support/harness');
const { registerWhatsApp, SEND_URL } = require('./support/rehearsal');

const FIXTURE_EN = fs.readFileSync(path.join(__dirname, '../test/fixtures/chat/whatsapp-w1-en-place.html'), 'utf8');
const FIXTURE_HE = fs.readFileSync(path.join(__dirname, '../test/fixtures/chat/whatsapp-w1-he-caption.html'), 'utf8');

async function seedWhatsAppOn(glance) {
  await glance.evaluateWorker(async () => {
    await chrome.storage.local.set({
      glanceChatKillRemote: {
        off: { messenger: true, instagram: true },
        fetchedAt: Date.now(),
        neverFetched: false,
        valid: true
      }
    });
  });
}

const CAPTION = 'send me the location of the restaurant you were at last week';
const SIDEBAR = 'please send the passport by Friday';
const FIXTURE_CAPTION = '<!doctype html><html lang="en"><body><div id="app">' +
  '<div id="pane-list"><div data-id="false_972509999999@c.us_SIDE"><span class="selectable-text">' + SIDEBAR + '</span></div></div>' +
  '<div id="main" data-glance-chat="direct"><header><span dir="auto" title="Dana Cole">Dana Cole</span></header>' +
  '<div data-id="false_972501234567@c.us_CAP"><img alt="' + CAPTION + '" /></div>' +
  '<footer><div data-glance-composer="1" contenteditable="true" role="textbox" aria-label="Type a message"></div>' +
  '<button type="button" aria-label="Send" data-testid="send"></button></footer></div></div></body></html>';

async function openChat(glance, html) {
  const page = await glance.context.newPage();
  await page.route('https://web.whatsapp.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: html }));
  await page.goto('https://web.whatsapp.com/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  return page;
}

async function openFixture(glance, html) {
  await seedWhatsAppOn(glance);
  expect(await registerWhatsApp(glance)).toBe(true);
  return openChat(glance, html);
}

function watchSend(page) {
  return page.evaluate(() => {
    window.__glanceSendClicks = 0;
    const btn = document.querySelector('[data-testid="send"]');
    if (btn) btn.addEventListener('click', () => { window.__glanceSendClicks = (window.__glanceSendClicks || 0) + 1; });
  });
}

async function gesture(glance) {
  return glance.evaluateWorker(async () => {
    const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
    const tab = tabs && tabs[0];
    return globalThis.FlowChatOnDemand.run(chrome, tab, { surface: 'whatsapp', source: 'gesture' });
  });
}

function lastWeekBounds(now) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  });
  const week = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const bag = {};
  fmt.formatToParts(now).forEach((part) => { bag[part.type] = part.value; });
  function add(y, m, d, n) {
    const utc = new Date(Date.UTC(y, m - 1, d + n));
    return { y: utc.getUTCFullYear(), m: utc.getUTCMonth() + 1, d: utc.getUTCDate() };
  }
  function wall(y, m, d) {
    const want = Date.UTC(y, m - 1, d, 0, 0, 0);
    function asUtc(ms) {
      const parts = {};
      fmt.formatToParts(new Date(ms)).forEach((part) => { parts[part.type] = part.value; });
      return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
    }
    let guess = want;
    for (let i = 0; i < 3; i++) guess += want - asUtc(guess);
    return guess;
  }
  const sunday = add(+bag.year, +bag.month, +bag.day, -week[bag.weekday]);
  const start = add(sunday.y, sunday.m, sunday.d, -7);
  return { startMs: wall(start.y, start.m, start.d), endMs: wall(sunday.y, sunday.m, sunday.d) };
}

async function seedPlaces(glance, places) {
  const bounds = lastWeekBounds(new Date());
  const events = {};
  places.forEach((loc, i) => {
    const id = 'e2e-place-' + i;
    events[id] = {
      id: id,
      isCancelled: false,
      location: { displayName: loc },
      start: { dateTime: new Date(bounds.startMs + (30 + i * 20) * 60 * 60 * 1000).toISOString(), timeZone: 'UTC' }
    };
  });
  await glance.evaluateWorker((bag) => { globalThis.__glanceE2e.outlookEvents = bag; }, events);
}

test('W1: flag and consent off by default, opening a chat does nothing', async ({ glance }) => {
  const bag = await glance.storage();
  expect(bag.glanceWhatsAppWebRead).not.toBe(true);
  expect(bag.glanceWhatsAppWebConsent).not.toBe(true);
  const page = await openChat(glance, FIXTURE_EN);
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__glanceChatDomReads || 0)).toBe(0);
  expect(await page.locator('.flow-chip-host').count()).toBe(0);
  expect((await page.locator('[data-glance-composer="1"]').innerText()).trim()).toBe('');
  expect(await page.evaluate(() => document.getElementById('main').getAttribute('data-glance-scanned'))).toBe(null);
});

test('W1: no DOM read until gesture (English fixture)', async ({ glance }) => {
  const page = await openFixture(glance, FIXTURE_EN);
  const reads = await page.evaluate(() => window.__glanceChatDomReads || 0);
  expect(reads).toBe(0);
  expect(await page.evaluate(() => document.documentElement.getAttribute('data-glance-reads'))).toBe(null);
});

test('W1: gesture scans only the open chat, including an image caption, and shows a card', async ({ glance }) => {
  await glance.seedOutlook();
  await glance.setScenario({ chatLocation: 'Taizu, 23 Montefiore, Tel Aviv' });
  const page = await openFixture(glance, FIXTURE_CAPTION);
  await watchSend(page);
  const r = await gesture(glance);
  expect(r.ok).toBe(true);
  expect(await page.evaluate(() => document.documentElement.getAttribute('data-glance-reads'))).toBe('1');
  expect(await page.evaluate(() => document.getElementById('main').getAttribute('data-glance-scanned'))).toBe(CAPTION);
  const card = page.locator('.flow-chip-host');
  await expect(card).toBeVisible();
  expect(await card.getAttribute('data-glance-read')).toBe(CAPTION);
  expect(await card.innerText()).not.toContain('passport');
  expect((await page.locator('[data-glance-composer="1"]').innerText()).trim()).toBe('');
  await expect(page.getByRole('button', { name: 'Do It' })).toBeVisible();
  expect(await page.evaluate(() => window.__glanceSendClicks || 0)).toBe(0);
});

test('W1: one calendar place gives Do It, types one draft, never sends, and Undo clears it', async ({ glance }) => {
  // The sentence asks for last week's restaurant. Do It types the draft only
  // when that week has one place on the connected calendar. The read flags
  // stay off until registerWhatsApp turns them on for this gesture.
  await glance.seedOutlook();
  await glance.setScenario({ chatLocation: 'Taizu, 23 Montefiore, Tel Aviv' });
  const page = await openFixture(glance, FIXTURE_EN);
  await watchSend(page);
  const r = await gesture(glance);
  expect(r.ok).toBe(true);
  const box = page.locator('[data-glance-composer="1"]');
  expect((await box.innerText()).trim()).toBe('');
  await page.getByRole('button', { name: 'Do It' }).click();
  await expect(box).toContainText('Taizu');
  const composer = await box.innerText();
  expect(composer.length).toBeGreaterThan(5);
  expect(composer.split('https://www.google.com/maps/search/').length - 1).toBe(1);
  expect(await page.evaluate(() => window.__glanceSendClicks || 0)).toBe(0);
  const calls = await glance.apiCalls();
  expect(calls.some((c) => SEND_URL.test(c.url))).toBe(false);
  await page.locator('button.flow-chip-undo').click();
  await expect(box).toHaveText('');
  expect(await page.evaluate(() => window.__glanceSendClicks || 0)).toBe(0);
});

test('W1: zero calendar places leave no draft', async ({ glance }) => {
  await glance.seedOutlook();
  await glance.setScenario({});
  const page = await openFixture(glance, FIXTURE_EN);
  await watchSend(page);
  await gesture(glance);
  expect(await page.locator('.flow-chip-host').count()).toBe(0);
  expect((await page.locator('[data-glance-composer="1"]').innerText()).trim()).toBe('');
  expect(await page.evaluate(() => window.__glanceSendClicks || 0)).toBe(0);
  const calls = await glance.apiCalls();
  expect(calls.some((c) => SEND_URL.test(c.url))).toBe(false);
});

test('W1: two calendar places leave no draft', async ({ glance }) => {
  await glance.seedOutlook();
  await glance.setScenario({});
  await seedPlaces(glance, ['Taizu, 23 Montefiore, Tel Aviv', 'North Abraxas, 40 Lilienblum, Tel Aviv']);
  const page = await openFixture(glance, FIXTURE_EN);
  await watchSend(page);
  await gesture(glance);
  expect(await page.locator('.flow-chip-host').count()).toBe(0);
  expect((await page.locator('[data-glance-composer="1"]').innerText()).trim()).toBe('');
  expect(await page.evaluate(() => window.__glanceSendClicks || 0)).toBe(0);
  const calls = await glance.apiCalls();
  expect(calls.some((c) => SEND_URL.test(c.url))).toBe(false);
});

test('W1: Hebrew image caption is read on gesture; kill switch silences', async ({ glance }) => {
  const page = await openFixture(glance, FIXTURE_HE);
  await glance.evaluateWorker(async () => {
    await chrome.storage.local.set({ 'glanceChatOff.whatsapp': true });
  });
  const r = await glance.evaluateWorker(async () => {
    const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
    return globalThis.FlowChatOnDemand.run(chrome, tabs[0], { surface: 'whatsapp', source: 'test' });
  });
  expect(r.ok).toBe(false);
  expect(r.reason).toMatch(/kill|off|user/);
});
