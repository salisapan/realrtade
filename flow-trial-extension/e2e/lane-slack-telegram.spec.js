// Slack and Telegram optional hosts. Same lane shape as Teams: register after the grant,
// inject on the live hosts, identify the chat, draft on Do It, never press Send.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect, chromium } = require('@playwright/test');
const { copyExtension } = require('./support/launch');

const SLACK_HOST = 'https://app.slack.com/*';
const TELEGRAM_HOST = 'https://web.telegram.org/*';
const HOSTS = [SLACK_HOST, TELEGRAM_HOST];
const ASK = 'Can you send the invoice by Friday?';
const DRAFT = 'Send the invoice by Friday.';

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

async function swLines(worker, notes) {
  const logged = await worker.evaluate(() => (globalThis.__glanceLaneNotes || []).slice()).catch(() => []);
  return notes.concat(logged);
}

function fixture(name) {
  return fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
}

test('Slack and Telegram hosts are optional, and nothing registers until they are granted', async () => {
  test.setTimeout(90000);
  const extDir = copyExtension({ bare: true });
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'glance-chat-off-'));
  let context = null;
  try {
    context = await launchBare(extDir, userData);
    const worker = await readyWorker(context);
    const ids = await registeredIds(worker);
    expect(ids).not.toContain('flow-slack');
    expect(ids).not.toContain('flow-telegram');
    const manifest = await worker.evaluate(() => chrome.runtime.getManifest());
    expect(manifest.optional_host_permissions).toEqual(expect.arrayContaining(HOSTS));
    expect(manifest.host_permissions || []).not.toEqual(expect.arrayContaining(HOSTS));
    const staticJs = (manifest.content_scripts || []).reduce((all, row) => all.concat(row.js || []), []);
    expect(staticJs).not.toContain('src/content-slack.js');
    expect(staticJs).not.toContain('src/content-telegram.js');
    const oauth = JSON.stringify((manifest.oauth2 && manifest.oauth2.scopes) || []);
    expect(oauth).not.toMatch(/slack|telegram|chat\.read/i);
  } finally {
    if (context) await context.close().catch(() => {});
    fs.rmSync(extDir, { recursive: true, force: true });
    fs.rmSync(userData, { recursive: true, force: true });
  }
});

test('a grant registers Slack and Telegram, a restart keeps them, a revoke clears them', async () => {
  test.setTimeout(180000);
  const extDir = copyExtension({ bare: true });
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'glance-chat-on-'));
  let context = null;
  try {
    context = await launchBare(extDir, userData);
    let worker = await readyWorker(context);
    const extensionId = await worker.evaluate(() => chrome.runtime.id);
    await context.close();
    context = null;
    grantOrigins(userData, extensionId, HOSTS);
    context = await launchBare(extDir, userData);
    worker = await readyWorker(context);
    await expect.poll(() => registeredIds(worker).catch(() => []), { timeout: 20000 }).toEqual(expect.arrayContaining(['flow-slack', 'flow-telegram']));
    await context.close();
    context = null;
    context = await launchBare(extDir, userData);
    worker = await readyWorker(context);
    await expect.poll(() => registeredIds(worker).catch(() => []), { timeout: 20000 }).toEqual(expect.arrayContaining(['flow-slack', 'flow-telegram']));
    await context.close();
    context = null;
    revokeOrigins(userData, extensionId, HOSTS);
    context = await launchBare(extDir, userData);
    worker = await readyWorker(context);
    await expect.poll(() => registeredIds(worker).catch(() => []), { timeout: 20000 }).not.toEqual(expect.arrayContaining(['flow-slack']));
    const ids = await registeredIds(worker);
    expect(ids).not.toContain('flow-telegram');
  } finally {
    if (context) await context.close().catch(() => {});
    fs.rmSync(extDir, { recursive: true, force: true });
    fs.rmSync(userData, { recursive: true, force: true });
  }
});

test('granted hosts inject, identify the chat, draft on Do It, and stay quiet on FYI', async () => {
  test.setTimeout(180000);
  const extDir = copyExtension({ bare: true });
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'glance-chat-live-'));
  let context = null;
  try {
    context = await launchBare(extDir, userData);
    let worker = await readyWorker(context);
    const extensionId = await worker.evaluate(() => chrome.runtime.id);
    await context.close();
    context = null;
    grantOrigins(userData, extensionId, HOSTS);
    context = await launchBare(extDir, userData);
    const notes = [];
    context.on('serviceworker', (sw) => sw.on('console', (msg) => notes.push(msg.text())));
    worker = await readyWorker(context);
    worker.on('console', (msg) => notes.push(msg.text()));
    await expect.poll(() => registeredIds(worker).catch(() => []), { timeout: 20000 }).toEqual(expect.arrayContaining(['flow-slack', 'flow-telegram']));

    const pages = {
      'https://app.slack.com/client/T01ABC/D02SELF': fixture('slack-web-self.html'),
      'https://app.slack.com/client/T01ABC/D02FYI': fixture('slack-web-fyi.html'),
      'https://app.slack.com/': '<!doctype html><html><body><p>Slack</p></body></html>',
      'https://web.telegram.org/a/': fixture('telegram-a-self.html'),
      'https://web.telegram.org/k/': fixture('telegram-k-self.html'),
      'https://web.telegram.org/a/fyi': fixture('telegram-a-fyi.html')
    };
    await context.route(/https:\/\/(app\.slack\.com|web\.telegram\.org)\//, async (route) => {
      const url = route.request().url().split('#')[0];
      if (route.request().resourceType() === 'document') {
        const bare = url.replace(/\/$/, '');
        const body = pages[url] || pages[bare] || pages[bare + '/'] || '<!doctype html><html><body></body></html>';
        await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: body });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'text/plain', body: '' });
    });

    const page = await context.newPage();
    const pageNotes = [];
    page.on('console', (msg) => pageNotes.push(msg.text()));
    await page.goto('https://app.slack.com/client/T01ABC/D02SELF', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await expect.poll(() => page.locator('html').getAttribute('data-glance-lane-slack').catch(() => null), { timeout: 20000 }).toBe('on');
    await expect.poll(() => page.locator('html').getAttribute('data-glance-chat').catch(() => ''), { timeout: 20000 }).toBe('slack:T01ABC:D02SELF');
    await expect.poll(() => page.locator('html').getAttribute('data-glance-sender').catch(() => ''), { timeout: 20000 }).toBe('Sali Sapan');
    await expect.poll(() => pageNotes.some((line) => line.indexOf('[Glance] slack lane injected https://app.slack.com/client/T01ABC/D02SELF') >= 0), { timeout: 20000 }).toBe(true);
    await expect.poll(async () => (await swLines(worker, notes)).some((line) => line.indexOf('[Glance] slack lane injected https://app.slack.com/client/T01ABC/D02SELF') >= 0), { timeout: 20000 }).toBe(true);
    const doIt = page.locator('[data-glance-do-it]');
    await expect(doIt).toBeVisible({ timeout: 20000 });
    await doIt.click();
    await expect.poll(() => page.locator('.ql-editor').innerText().catch(() => ''), { timeout: 20000 }).toContain(DRAFT);
    expect(await page.evaluate(() => window.__glanceSendClicks || 0)).toBe(0);
    await page.locator('[data-glance-undo]').click();
    await expect.poll(() => page.locator('.ql-editor').innerText().catch(() => ''), { timeout: 20000 }).toBe('');

    await page.goto('https://app.slack.com/client/T01ABC/D02FYI', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await expect.poll(async () => (await swLines(worker, notes)).some((line) => line.indexOf('[Glance] slack why-not fyi') >= 0), { timeout: 20000 }).toBe(true);
    await expect(page.locator('[data-glance-do-it]')).toHaveCount(0);
    expect(await page.evaluate(() => window.__glanceSendClicks || 0)).toBe(0);

    await page.goto('https://app.slack.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await expect.poll(async () => (await swLines(worker, notes)).some((line) => line.indexOf('[Glance] slack why-not chat-not-identified') >= 0 && line.indexOf(ASK) < 0), { timeout: 20000 }).toBe(true);

    await page.goto('https://web.telegram.org/a/#777000123', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await expect.poll(() => page.locator('html').getAttribute('data-glance-lane-telegram').catch(() => null), { timeout: 20000 }).toBe('on');
    await expect.poll(() => page.locator('html').getAttribute('data-glance-chat').catch(() => ''), { timeout: 20000 }).toBe('tg:777000123');
    await expect.poll(() => page.locator('html').getAttribute('data-glance-sender').catch(() => ''), { timeout: 20000 }).toBe('me');
    await expect.poll(async () => (await swLines(worker, notes)).some((line) => line.indexOf('[Glance] telegram lane injected https://web.telegram.org/a/') >= 0), { timeout: 20000 }).toBe(true);
    await expect(page.locator('[data-glance-do-it]')).toBeVisible({ timeout: 20000 });
    await page.locator('[data-glance-do-it]').click();
    await expect.poll(() => page.locator('#editable-message-text').innerText().catch(() => ''), { timeout: 20000 }).toContain(DRAFT);
    expect(await page.evaluate(() => window.__glanceSendClicks || 0)).toBe(0);
    await page.locator('[data-glance-undo]').click();
    await expect.poll(() => page.locator('#editable-message-text').innerText().catch(() => ''), { timeout: 20000 }).toBe('');

    await page.goto('https://web.telegram.org/k/#777000123', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await expect.poll(() => page.locator('html').getAttribute('data-glance-lane-telegram').catch(() => null), { timeout: 20000 }).toBe('on');
    await expect.poll(() => page.locator('html').getAttribute('data-glance-chat').catch(() => ''), { timeout: 20000 }).toBe('tg:777000123');
    await expect.poll(async () => (await swLines(worker, notes)).some((line) => line.indexOf('[Glance] telegram lane injected https://web.telegram.org/k/') >= 0), { timeout: 20000 }).toBe(true);
    await expect(page.locator('[data-glance-do-it]')).toBeVisible({ timeout: 20000 });
    await page.locator('[data-glance-do-it]').click();
    await expect.poll(() => page.locator('.input-message-input').innerText().catch(() => ''), { timeout: 20000 }).toContain(DRAFT);
    expect(await page.evaluate(() => window.__glanceSendClicks || 0)).toBe(0);

    await page.goto('https://web.telegram.org/a/fyi#777000123', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await expect.poll(async () => (await swLines(worker, notes)).some((line) => line.indexOf('[Glance] telegram why-not fyi') >= 0), { timeout: 20000 }).toBe(true);
    await expect(page.locator('[data-glance-do-it]')).toHaveCount(0);
  } finally {
    if (context) await context.close().catch(() => {});
    fs.rmSync(extDir, { recursive: true, force: true });
    fs.rmSync(userData, { recursive: true, force: true });
  }
});

test('an ungranted Slack page shows the in-page prompt and does not send', async () => {
  test.setTimeout(90000);
  const extDir = copyExtension({ bare: true });
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'glance-chat-prompt-'));
  let context = null;
  try {
    context = await launchBare(extDir, userData);
    await readyWorker(context);
    await context.addInitScript(() => {
      window.__grantCalls = [];
      window.chrome = {
        runtime: {
          id: 'prompt-test',
          lastError: null,
          sendMessage: (msg, cb) => { if (cb) setTimeout(() => cb({ ok: true }), 0); },
          getManifest: () => ({ version: '0.9.56' })
        },
        permissions: {
          contains: async () => false,
          request: async (opts) => { window.__grantCalls.push(opts); return false; }
        }
      };
    });
    await context.route(/https:\/\/app\.slack\.com\//, async (route) => {
      if (route.request().resourceType() !== 'document') {
        await route.fulfill({ status: 200, contentType: 'text/plain', body: '' });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: fixture('slack-web-self.html') });
    });
    const page = await context.newPage();
    await page.goto('https://app.slack.com/client/T01ABC/D02SELF', { waitUntil: 'domcontentloaded', timeout: 30000 });
    const files = ['src/slack-parse.js', 'src/chat-host-prompt.js', 'src/chat-self-card.js', 'src/chat-compose.js', 'src/content-slack.js'];
    for (const file of files) await page.addScriptTag({ path: path.join(extDir, file) });
    const prompt = page.locator('[data-glance-host-prompt]');
    await expect(prompt).toBeVisible({ timeout: 20000 });
    await expect(prompt).toContainText('טיוטה בלבד');
    await prompt.locator('[data-glance-host-grant]').click();
    await expect.poll(() => page.evaluate(() => (window.__grantCalls || []).map((row) => (row && row.origins) || [])), { timeout: 20000 }).toEqual([[SLACK_HOST]]);
    await expect(prompt).toContainText('הדפדפן לא נתן גישה');
    await expect(prompt.locator('[data-glance-host-grant]')).toBeEnabled();
    expect(await page.evaluate(() => window.__glanceSendClicks || 0)).toBe(0);
    await expect(page.locator('[data-glance-do-it]')).toHaveCount(0);
  } finally {
    if (context) await context.close().catch(() => {});
    fs.rmSync(extDir, { recursive: true, force: true });
    fs.rmSync(userData, { recursive: true, force: true });
  }
});
