// Teams web lane (fixture DOM): English and Hebrew inbound asks, attachment row, silence when unsure, never sends.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect } = require('./support/harness');
const { chromium } = require('@playwright/test');
const { startGoogleLaneServer } = require('./support/google-lane-server');
const { copyExtension } = require('./support/launch');

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

const TEAMS_HOSTS = ['https://teams.microsoft.com/*', 'https://teams.live.com/*'];

let server;
test.beforeAll(async () => {
  server = await startGoogleLaneServer();
  server.setAccount('me@x.com');
});
test.afterAll(async () => { if (server) await server.close(); });

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
  if (server.reset) server.reset();
  server.setAccount('me@x.com');
  await glance.seedGmail(Object.assign({
    googleConnectedAccount: { email: 'me@x.com', at: Date.now(), source: 'web' },
    glanceDevFixture: true
  }, switches ? { glanceSwitches: switches } : {}));
  await glance.evaluateWorker((origin) => { globalThis.__glanceE2e.httpOrigin = origin; }, server.origin);
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
  const heRow = '<div data-glance-message data-author="them" data-message-id="m-he"><span dir="auto">' + ASK_HE + '</span><span data-glance-attachment="quote.pdf"></span></div>';
  const page = await openTeams(glance, heRow, { CHAT_TASK_CARD: true });
  await page.waitForSelector('html[data-glance-lane-teams="on"]', { timeout: 20000 });
  await expect(page.locator(CARD)).toBeVisible({ timeout: 20000 });
  expect(await page.evaluate(() => window.__glanceSendClicks || 0)).toBe(0);
});

test('CHAT_TASK_CARD on: unsure line stays silent', async ({ glance }) => {
  const page = await openTeams(glance, row('<div data-glance-message data-author="them" data-message-id="q"><span dir="auto">' + QUIET + '</span></div>'), { CHAT_TASK_CARD: true });
  await page.waitForSelector('html[data-glance-lane-teams="on"]', { timeout: 20000 });
  await page.waitForTimeout(4000);
  await expect(page.locator(CARD)).toHaveCount(0);
  expect(taskCalls()).toHaveLength(0);
});

function launchBare(extDir, userData) {
  return chromium.launchPersistentContext(userData, {
    headless: false,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [
      '--headless=new',
      '--disable-extensions-except=' + extDir,
      '--load-extension=' + extDir,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-dev-shm-usage'
    ]
  });
}

async function readyWorker(context) {
  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 30000 });
  await expect.poll(async () => worker.evaluate(() => Boolean(chrome.runtime && chrome.runtime.id)).catch(() => false), { timeout: 20000 }).toBe(true);
  return worker;
}

function grantOrigins(userData, id, origins) {
  const prefsPath = path.join(userData, 'Default', 'Preferences');
  const prefs = JSON.parse(fs.readFileSync(prefsPath, 'utf8'));
  const row = prefs.extensions && prefs.extensions.settings && prefs.extensions.settings[id];
  if (!row) throw new Error('extension preferences were not written');
  function add(block) {
    const hosts = new Set((block && block.explicit_host) || []);
    origins.forEach((origin) => hosts.add(origin));
    block.explicit_host = Array.from(hosts);
  }
  row.granted_permissions = row.granted_permissions || {};
  row.active_permissions = row.active_permissions || {};
  add(row.granted_permissions);
  add(row.active_permissions);
  fs.writeFileSync(prefsPath, JSON.stringify(prefs));
}

function revokeOrigins(userData, id, origins) {
  const prefsPath = path.join(userData, 'Default', 'Preferences');
  const prefs = JSON.parse(fs.readFileSync(prefsPath, 'utf8'));
  const row = prefs.extensions && prefs.extensions.settings && prefs.extensions.settings[id];
  if (!row) throw new Error('extension preferences were not written');
  function drop(block) {
    if (!block) return;
    block.explicit_host = ((block.explicit_host) || []).filter((origin) => origins.indexOf(origin) < 0);
  }
  drop(row.granted_permissions);
  drop(row.active_permissions);
  fs.writeFileSync(prefsPath, JSON.stringify(prefs));
}

async function registeredIds(worker) {
  return worker.evaluate(async () => (await chrome.scripting.getRegisteredContentScripts()).map((row) => row.id));
}

test('Teams hosts not granted: the lane does not register', async () => {
  test.setTimeout(90000);
  const extDir = copyExtension({ bare: true });
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'glance-teams-off-'));
  let context = null;
  try {
    context = await launchBare(extDir, userData);
    const worker = await readyWorker(context);
    const ids = await worker.evaluate(async () => (await chrome.scripting.getRegisteredContentScripts()).map((row) => row.id));
    expect(ids).not.toContain('glance-lane-teams');
    const manifest = await worker.evaluate(() => chrome.runtime.getManifest());
    expect(manifest.optional_host_permissions).toEqual(expect.arrayContaining(TEAMS_HOSTS));
    expect(manifest.host_permissions || []).not.toEqual(expect.arrayContaining(TEAMS_HOSTS));
    expect((manifest.permissions || []).join(' ')).not.toMatch(/teams\.microsoft\.com|teams\.live\.com/);
    const leaked = JSON.parse(JSON.stringify(manifest));
    delete leaked.optional_host_permissions;
    expect(JSON.stringify(leaked)).not.toMatch(/teams\.(microsoft|live)\.com/);
    const staticJs = (manifest.content_scripts || []).reduce((all, row) => all.concat(row.js || []), []);
    expect(staticJs).not.toContain('src/content-teams.js');
    expect(staticJs).not.toContain('src/teams-lane-boot.js');
  } finally {
    if (context) await context.close().catch(() => {});
    fs.rmSync(extDir, { recursive: true, force: true });
    fs.rmSync(userData, { recursive: true, force: true });
  }
});

test('Teams hosts: grant registers, a restart keeps it, a revoke clears it', async () => {
  test.setTimeout(180000);
  const extDir = copyExtension({ bare: true });
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'glance-teams-on-'));
  let context = null;
  try {
    context = await launchBare(extDir, userData);
    let worker = await readyWorker(context);
    const extensionId = await worker.evaluate(() => chrome.runtime.id);
    await context.close();
    context = null;
    grantOrigins(userData, extensionId, TEAMS_HOSTS);
    context = await launchBare(extDir, userData);
    worker = await readyWorker(context);
    await expect.poll(() => registeredIds(worker).catch(() => []), { timeout: 20000 }).toContain('glance-lane-teams');
    await context.close();
    context = null;
    context = await launchBare(extDir, userData);
    worker = await readyWorker(context);
    await expect.poll(() => registeredIds(worker).catch(() => []), { timeout: 20000 }).toContain('glance-lane-teams');
    await context.close();
    context = null;
    revokeOrigins(userData, extensionId, TEAMS_HOSTS);
    context = await launchBare(extDir, userData);
    worker = await readyWorker(context);
    await expect.poll(() => registeredIds(worker).catch(() => []), { timeout: 20000 }).not.toContain('glance-lane-teams');
  } finally {
    if (context) await context.close().catch(() => {});
    fs.rmSync(extDir, { recursive: true, force: true });
    fs.rmSync(userData, { recursive: true, force: true });
  }
});

test('registered Teams script injects on teams.live.com/v2, including a nested frame', async () => {
  test.setTimeout(180000);
  const extDir = copyExtension({ bare: true });
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'glance-teams-v2-'));
  let context = null;
  try {
    context = await launchBare(extDir, userData);
    let worker = await readyWorker(context);
    const extensionId = await worker.evaluate(() => chrome.runtime.id);
    await context.close();
    context = null;
    grantOrigins(userData, extensionId, TEAMS_HOSTS);
    context = await launchBare(extDir, userData);
    const notes = [];
    context.on('serviceworker', (sw) => sw.on('console', (msg) => notes.push(msg.text())));
    worker = await readyWorker(context);
    worker.on('console', (msg) => notes.push(msg.text()));
    await expect.poll(async () => {
      const ids = await registeredIds(worker).catch(() => []);
      return ids.indexOf('glance-lane-teams') >= 0 ? 'glance-lane-teams' : (notes.join(' | ') || 'no-registration');
    }, { timeout: 20000 }).toBe('glance-lane-teams');
    const spec = await worker.evaluate(async () => {
      const rows = await chrome.scripting.getRegisteredContentScripts({ ids: ['glance-lane-teams'] });
      return rows && rows[0];
    });
    expect(spec && spec.allFrames).toBe(true);
    expect(spec.matchOriginAsFallback).toBe(true);
    expect(spec.persistAcrossSessions).toBe(true);
    expect(spec.runAt).toBe('document_end');
    expect(spec.js[0]).toBe('src/teams-lane-boot.js');
    expect(spec.matches.slice().sort()).toEqual([
      'https://teams.live.com/*',
      'https://teams.microsoft.com/*'
    ]);
    const manifest = await worker.evaluate(() => chrome.runtime.getManifest());
    const staticJs = (manifest.content_scripts || []).reduce((all, row) => all.concat(row.js || []), []);
    expect(staticJs).not.toContain('src/teams-lane-boot.js');
    const missing = await worker.evaluate(async (files) => {
      const bad = [];
      for (const file of files) {
        const res = await fetch(chrome.runtime.getURL(file));
        if (!res.ok) bad.push(file + ' ' + res.status);
      }
      return bad;
    }, (spec.js || []).concat(spec.css || []));
    expect(missing).toEqual([]);

    const shell = '<!doctype html><html><body><p>shell</p>' +
      '<iframe id="chat" src="https://teams.live.com/v2/chat"></iframe>' +
      '<iframe id="blank" src="about:blank"></iframe></body></html>';
    const frameHtml = '<!doctype html><html><body><p>chat frame</p></body></html>';
    await context.route(/https:\/\/teams\.live\.com\//, async (route) => {
      const url = route.request().url();
      const body = url.indexOf('/v2/chat') >= 0 ? frameHtml : shell;
      if (route.request().resourceType() === 'document') {
        await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: body });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'text/plain', body: '' });
    });
    const logs = [];
    const page = await context.newPage();
    page.on('console', (msg) => logs.push(msg.text()));
    await page.goto('https://teams.live.com/v2/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await expect.poll(() => page.locator('html').getAttribute('data-glance-lane-teams').catch(() => null), { timeout: 20000 }).toBe('on');
    const chat = page.frame({ url: /https:\/\/teams\.live\.com\/v2\/chat/ });
    expect(chat).toBeTruthy();
    await expect.poll(() => chat.locator('html').getAttribute('data-glance-lane-teams').catch(() => null), { timeout: 20000 }).toBe('on');
    const blank = page.frames().filter((frame) => frame.url() === 'about:blank' && frame.parentFrame() === page.mainFrame())[0];
    expect(blank).toBeTruthy();
    await expect.poll(() => blank.locator('html').getAttribute('data-glance-lane-teams').catch(() => null), { timeout: 20000 }).toBe('on');
    await expect.poll(() => logs.some((line) => line.indexOf('[Glance] teams lane injected https://teams.live.com/v2/') >= 0), { timeout: 20000 }).toBe(true);
    await expect.poll(() => logs.some((line) => line.indexOf('[Glance] teams lane injected https://teams.live.com/v2/chat') >= 0), { timeout: 20000 }).toBe(true);
  } finally {
    if (context) await context.close().catch(() => {});
    fs.rmSync(extDir, { recursive: true, force: true });
    fs.rmSync(userData, { recursive: true, force: true });
  }
});

test('a reply draft is inserted in the composer and is not sent', async ({ glance }) => {
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
