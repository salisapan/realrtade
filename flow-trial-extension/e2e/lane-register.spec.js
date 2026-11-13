const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect, chromium } = require('@playwright/test');
const { copyExtension } = require('./support/launch');

const HE_BUTTON = 'הפעל צ׳אטים של Meta';
const CHAT_LANE_IDS = ['glance-lane-whatsapp', 'glance-lane-messenger', 'glance-lane-instagram'];
const CHAT_FLOW_SURFACE_IDS = ['flow-slack', 'flow-telegram', 'flow-whatsapp'];

function launch(extDir, userData) {
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
  await expect.poll(async () => worker.evaluate(() => Boolean(
    chrome.runtime && chrome.runtime.id && chrome.permissions && chrome.scripting && globalThis.FlowMetaConsent
  )).catch(() => false), { timeout: 20000 }).toBe(true);
  return worker;
}

async function registeredScriptIds(worker) {
  return worker.evaluate(async () => {
    const rows = await chrome.scripting.getRegisteredContentScripts();
    return rows.map((row) => row.id).sort();
  });
}

async function mailLanesFromManifest(worker) {
  return worker.evaluate(() => {
    const cs = chrome.runtime.getManifest().content_scripts || [];
    const gmailRow = cs.find((r) => (r.matches || []).some((m) => m.indexOf('mail.google.com') >= 0));
    const outlookRow = cs.find((r) => (r.matches || []).some((m) => /outlook\.(live|office)/.test(m)));
    return {
      gmail: Boolean(gmailRow && (gmailRow.js || []).indexOf('src/content-gmail.js') >= 0),
      outlook: Boolean(outlookRow && (outlookRow.matches || []).length >= 1)
    };
  });
}

function assertNoChatLaneScripts(ids) {
  for (const id of CHAT_LANE_IDS) expect(ids, 'dynamic chat lane ' + id).not.toContain(id);
  for (const id of CHAT_FLOW_SURFACE_IDS) expect(ids, 'dynamic chat surface ' + id).not.toContain(id);
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

test('v1 bare manifest: Gmail and Outlook mail lanes are declared; chat lanes never register', async () => {
  test.setTimeout(120000);
  const extDir = copyExtension({ bare: true });
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'glance-lanes-'));
  let context = null;
  try {
    context = await launch(extDir, userData);
    let worker = await readyWorker(context);
    const extensionId = await worker.evaluate(() => chrome.runtime.id);
    const metaOrigins = await worker.evaluate(() => globalThis.FlowMetaConsent.ORIGINS.slice());
    const enableUrl = 'chrome-extension://' + extensionId + '/lane-chat/enable.html';

    const lanes = await mailLanesFromManifest(worker);
    expect(lanes.gmail, 'Gmail content_scripts lane').toBe(true);
    expect(lanes.outlook, 'Outlook content_scripts lane').toBe(true);
    assertNoChatLaneScripts(await registeredScriptIds(worker));

    const popup = await context.newPage();
    await popup.goto('chrome-extension://' + extensionId + '/popup/popup.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await expect(popup.locator('#meta-chats-link .btn-label')).toHaveText(HE_BUTTON);
    const enable = await context.newPage();
    await enable.goto(enableUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await expect(enable.locator('#meta-turn-on .btn-label')).toHaveText(HE_BUTTON);
    await expect(enable.locator('[data-lang="he"]')).toBeVisible();
    await expect(enable.locator('[data-lang="en"]')).toBeHidden();
    await expect(enable.locator('[data-lang="he"]')).toContainText('שום דבר לא נשלח אוטומטית');

    await popup.close();
    await enable.close();
    await context.close();
    context = null;

    const chatGrants = metaOrigins.concat([
      'https://app.slack.com/*',
      'https://web.telegram.org/*',
      'https://teams.microsoft.com/*'
    ]);
    grantOrigins(userData, extensionId, chatGrants);

    context = await launch(extDir, userData);
    worker = await readyWorker(context);
    const lanesAfter = await mailLanesFromManifest(worker);
    expect(lanesAfter.gmail).toBe(true);
    expect(lanesAfter.outlook).toBe(true);
    assertNoChatLaneScripts(await registeredScriptIds(worker));
  } finally {
    if (context) await context.close().catch(() => {});
    fs.rmSync(extDir, { recursive: true, force: true });
    fs.rmSync(userData, { recursive: true, force: true });
  }
});

test('a WhatsApp-only grant registers no lane', async () => {
  test.setTimeout(90000);
  const extDir = copyExtension({ bare: true });
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'glance-wa-only-'));
  let context = null;
  try {
    context = await launch(extDir, userData);
    let worker = await readyWorker(context);
    const extensionId = await worker.evaluate(() => chrome.runtime.id);
    await context.close();
    context = null;
    grantOrigins(userData, extensionId, ['https://web.whatsapp.com/*']);
    context = await launch(extDir, userData);
    worker = await readyWorker(context);
    const ids = await registeredScriptIds(worker);
    assertNoChatLaneScripts(ids);
    const full = await worker.evaluate(async () => chrome.permissions.contains({ origins: globalThis.FlowMetaConsent.ORIGINS.slice() }));
    expect(full).toBe(false);
  } finally {
    if (context) await context.close().catch(() => {});
    fs.rmSync(extDir, { recursive: true, force: true });
    fs.rmSync(userData, { recursive: true, force: true });
  }
});
