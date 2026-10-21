// The title on the card is the title of what Glance writes. Headless
// Chromium, a local Google server, fixtures only. A Hebrew UI card says
// שיחה בנושא הפיילוט, so the calendar event and the task say it too.
const { test, expect } = require('./support/harness');
const { startGoogleLaneServer } = require('./support/google-lane-server');

const SELF = 'ai.local.flow@gmail.com';
const CALL = "Let's have a call Tuesday at 15:00 about the pilot";
let server;

test.beforeAll(async () => { server = await startGoogleLaneServer(); });
test.afterAll(async () => { if (server) await server.close(); });
test.beforeEach(async ({ glance }) => {
  server.reset();
  await glance.evaluateWorker((origin) => { globalThis.__glanceE2e.httpOrigin = origin; }, server.origin);
});

async function run(glance, lang, id) {
  await glance.seedGmail(lang === 'he' ? { glanceUiLanguage: 'he' } : {});
  const page = await glance.openGmail({
    messageId: 'm-' + id, threadId: 't-' + id, subject: 'the pilot',
    senderEmail: 'dana@acme.io', senderName: 'Dana', ownEmail: SELF, to: [SELF], lang: lang, body: CALL
  });
  const card = page.locator('[data-legacy-message-id="m-' + id + '"] .flow-chip-host');
  await expect(card).toBeVisible({ timeout: 8000 });
  const shown = (await card.locator('.gs-intent').innerText()).trim();
  await page.locator('div[role="main"] button.flow-chip').click();
  await expect(page.locator('div[role="main"] .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  const events = server.calls.filter((c) => c.method === 'POST' && c.path.indexOf('/calendar/v3/calendars/primary/events') >= 0);
  const tasks = server.calls.filter((c) => c.method === 'POST' && /\/tasks\/v1\/lists\/[^/]+\/tasks$/.test(c.path));
  return { shown, events, tasks };
}

test('a Hebrew card, its calendar event and its task share one title', async ({ glance }) => {
  const r = await run(glance, 'he', 'art-he');
  expect(r.shown).toBe('שיחה בנושא הפיילוט');
  expect(r.events).toHaveLength(1);
  expect(r.tasks).toHaveLength(1);
  expect(r.events[0].body.summary).toBe(r.shown);
  expect(r.tasks[0].body.title).toBe(r.shown);
});

test('an English card, its calendar event and its task share one title', async ({ glance }) => {
  const r = await run(glance, 'en', 'art-en');
  expect(r.shown).toBe('Call about the pilot');
  expect(r.events[0].body.summary).toBe(r.shown);
  expect(r.tasks[0].body.title).toBe(r.shown);
});
