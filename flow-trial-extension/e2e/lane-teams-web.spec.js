// Teams web lane (fixture DOM): English and Hebrew inbound asks, attachment row, silence when unsure, never sends.
const { test, expect } = require('./support/harness');
const { startGoogleLaneServer } = require('./support/google-lane-server');

const CARD = '#glance-chat-task .flow-chip-host';
const ASK_EN = 'Can you review the draft by Wednesday?';
const ASK_HE = 'תוכל לשלוח לי את הקובץ עד יום חמישי?';
const QUIET = 'Thanks, got it!';

function row(html) {
  return html;
}

const LANE_JS = [
  'core/fact-reply.js',
  'core/close-chains.js',
  'src/chat-draft.js',
  'src/chat-compose.js',
  'src/chat-lane.js',
  'src/lane-draft-store.js',
  'src/group-word.js',
  'src/teams-parse.js',
  'src/content-teams.js'
];

// Runs once C1 adds optional_host_permissions for teams.microsoft.com / teams.live.com (PR #212).
const TEAMS_HOSTS_IN_MANIFEST = false;

let server;
test.beforeAll(async () => { server = await startGoogleLaneServer(); });
test.afterAll(async () => { if (server) await server.close(); });
test.beforeEach(() => { test.skip(!TEAMS_HOSTS_IN_MANIFEST, 'Waiting on manifest host permissions (C1 #212)'); });

function shellHtml(bodyRow) {
  return '<!doctype html><html><body><div role="main" data-glance-teams-thread="dm" data-glance-teams-root="1">' +
    '<header><h2 data-glance-title>Dana Cohen</h2></header>' + bodyRow +
    '<div data-glance-composer contenteditable="true" role="textbox" aria-label="Type a message"></div>' +
    '<button type="button" aria-label="Send" onclick="window.__glanceSendClicks=(window.__glanceSendClicks||0)+1"></button>' +
    '<p data-glance-quiet hidden></p></div></body></html>';
}

async function injectTeamsLane(glance, page) {
  const files = await glance.evaluateWorker((lean) => globalThis.__glanceLaneChatScripts({ js: lean }), LANE_JS);
  expect(files.indexOf('src/content-teams.js')).toBeGreaterThanOrEqual(0);
  expect(files.indexOf('src/chat-task-card.js')).toBeGreaterThan(files.indexOf('src/chat-lane.js'));
  const base = 'chrome-extension://' + glance.extensionId + '/';
  await page.addStyleTag({ url: base + 'design/step-states-v1/scoped.css' });
  await page.addStyleTag({ url: base + 'src/chip.css' });
  for (const file of files) await page.addScriptTag({ url: base + file });
}

async function openTeams(glance, bodyRow, switches) {
  await glance.seedGmail(Object.assign({
    googleConnectedAccount: { email: 'me@x.com', at: Date.now(), source: 'web' },
    glanceDevFixture: true
  }, switches ? { glanceSwitches: switches } : {}));
  const page = await glance.context.newPage();
  await page.goto('chrome-extension://' + glance.extensionId + '/dev/teams-fixture.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
  if (bodyRow) {
    await page.evaluate((row) => {
      const main = document.querySelector('[role="main"]');
      const composer = main.querySelector('[data-glance-composer]');
      main.querySelectorAll('[data-glance-message]').forEach((n) => n.remove());
      const wrap = document.createElement('div');
      wrap.innerHTML = row;
      while (wrap.firstChild) main.insertBefore(wrap.firstChild, composer);
    }, bodyRow);
  }
  await injectTeamsLane(glance, page);
  await page.evaluate(() => {
    if (globalThis.__glanceChatSurfaces && globalThis.__glanceChatSurfaces.teams && globalThis.__glanceChatSurfaces.teams.scan) {
      return globalThis.__glanceChatSurfaces.teams.scan();
    }
    return null;
  });
  return page;
}

const taskCalls = () => server.calls.filter((c) => /tasks\/v1/.test(c.path) && c.method !== 'GET');

test('CHAT_TASK_CARD on: English inbound ask shows one Do It, read back, never sends', async ({ glance }) => {
  await glance.evaluateWorker((origin) => { globalThis.__glanceE2e.httpOrigin = origin; }, server.origin);
  const page = await openTeams(glance, row('<div data-glance-message data-author="them" data-message-id="m1"><span dir="auto">' + ASK_EN + '</span></div>'), { CHAT_TASK_CARD: true });
  await page.waitForSelector('html[data-glance-lane-teams="on"]', { timeout: 20000 });
  await expect(page.locator(CARD)).toBeVisible({ timeout: 20000 });
  await page.locator(CARD + ' button.flow-chip').click();
  await expect(page.locator(CARD + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  expect(Object.keys(server.tasks()).length).toBe(1);
  expect(await page.evaluate(() => window.__glanceSendClicks || 0)).toBe(0);
  const calls = await glance.apiCalls();
  expect(calls.some((c) => c.method !== 'GET' && /chats/.test(c.url))).toBe(false);
});

test('CHAT_TASK_CARD on: Hebrew inbound ask with attachment shows the card', async ({ glance }) => {
  await glance.evaluateWorker((origin) => { globalThis.__glanceE2e.httpOrigin = origin; }, server.origin);
  const heRow = '<div data-glance-message data-author="them" data-message-id="m-he"><span dir="auto">' + ASK_HE + '</span><span data-glance-attachment="quote.pdf"></span></div>';
  const page = await openTeams(glance, heRow, { CHAT_TASK_CARD: true });
  await page.waitForSelector('html[data-glance-lane-teams="on"]', { timeout: 20000 });
  await expect(page.locator(CARD)).toBeVisible({ timeout: 20000 });
  expect(await page.evaluate(() => window.__glanceSendClicks || 0)).toBe(0);
});

test('CHAT_TASK_CARD on: unsure line stays silent', async ({ glance }) => {
  await glance.evaluateWorker((origin) => { globalThis.__glanceE2e.httpOrigin = origin; }, server.origin);
  const page = await openTeams(glance, row('<div data-glance-message data-author="them" data-message-id="q"><span dir="auto">' + QUIET + '</span></div>'), { CHAT_TASK_CARD: true });
  await page.waitForSelector('html[data-glance-lane-teams="on"]', { timeout: 20000 });
  await page.waitForTimeout(4000);
  await expect(page.locator(CARD)).toHaveCount(0);
  expect(taskCalls()).toHaveLength(0);
});

test('a reply draft is inserted in the composer and is not sent', async ({ glance }) => {
  await glance.evaluateWorker((origin) => { globalThis.__glanceE2e.httpOrigin = origin; }, server.origin);
  await glance.seedOutlook();
  await glance.setScenario({ chatLocation: 'Taizu, 23 Montefiore, Tel Aviv' });
  const place = 'איפה הייתה המסעדה משבוע שעבר?';
  const page = await openTeams(glance, row('<div data-glance-message data-author="them" data-message-id="p"><span dir="auto">' + place + '</span></div>'), { CHAT_TASK_CARD: true });
  await page.waitForSelector('html[data-glance-lane-teams="on"]', { timeout: 20000 });
  const box = page.locator('[data-glance-composer]');
  await expect(box).not.toBeEmpty({ timeout: 20000 });
  expect(await page.evaluate(() => window.__glanceSendClicks || 0)).toBe(0);
  await expect(page.locator(CARD)).toHaveCount(0);
});
