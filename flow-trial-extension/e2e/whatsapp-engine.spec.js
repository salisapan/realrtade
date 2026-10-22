const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect, chromium } = require('@playwright/test');
const { copyExtension } = require('./support/launch');

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

async function readyWorker(context) {
  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 30000 });
  await expect.poll(async () => worker.evaluate(() => Boolean(
    chrome.runtime && chrome.runtime.id && chrome.scripting && globalThis.FlowLaneScripts && globalThis.FlowWhatsappEngine
  )).catch(() => false), { timeout: 20000 }).toBe(true);
  return worker;
}

async function whatsappScripts(worker) {
  return worker.evaluate(async () => {
    const rows = await chrome.scripting.getRegisteredContentScripts({ ids: ['glance-lane-whatsapp'] });
    const row = rows && rows[0];
    return row && Array.isArray(row.js) ? row.js : [];
  });
}

async function armMeta(worker, engineOn) {
  await worker.evaluate(async (on) => {
    const bag = await chrome.storage.local.get({ glanceSwitches: {} });
    const switches = Object.assign({}, bag.glanceSwitches || {});
    switches.WHATSAPP_ENGINE = on === true;
    await chrome.storage.local.set({ glanceSwitches: switches });
    const origins = globalThis.FlowMetaConsent.ORIGINS.slice();
    const granted = await chrome.permissions.contains({ origins: origins });
    if (!granted) throw new Error('meta-not-granted');
    if (typeof globalThis.__glanceRelaneChats === 'function') {
      await globalThis.__glanceRelaneChats();
      return;
    }
    throw new Error('lane-rearm-missing');
  }, engineOn);
}

test('WHATSAPP_ENGINE off keeps the full WhatsApp lane list', async () => {
  test.setTimeout(90000);
  const extDir = copyExtension({ bare: true });
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'glance-wa-engine-off-'));
  let context = null;
  try {
    context = await launch(extDir, userData);
    let worker = await readyWorker(context);
    const extensionId = await worker.evaluate(() => chrome.runtime.id);
    const origins = await worker.evaluate(() => globalThis.FlowMetaConsent.ORIGINS.slice());
    const enableUrl = 'chrome-extension://' + extensionId + '/lane-chat/enable.html';
    const boot = await context.newPage();
    await boot.goto(enableUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await boot.close();
    await context.close();
    grantOrigins(userData, extensionId, origins);
    context = await launch(extDir, userData);
    worker = await readyWorker(context);
    await armMeta(worker, false);
    const js = await whatsappScripts(worker);
    expect(js.indexOf('core/incoming-judge.js')).toBeGreaterThanOrEqual(0);
    expect(js.indexOf('src/chat-task-card.js')).toBeGreaterThanOrEqual(0);
    expect(js.indexOf('src/content-whatsapp.js')).toBeGreaterThanOrEqual(0);
  } finally {
    if (context) await context.close();
  }
});

test('WHATSAPP_ENGINE on registers the manifest engine base on WhatsApp', async () => {
  test.setTimeout(90000);
  const extDir = copyExtension({ bare: true });
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'glance-wa-engine-on-'));
  let context = null;
  try {
    context = await launch(extDir, userData);
    let worker = await readyWorker(context);
    const extensionId = await worker.evaluate(() => chrome.runtime.id);
    const origins = await worker.evaluate(() => globalThis.FlowMetaConsent.ORIGINS.slice());
    const enableUrl = 'chrome-extension://' + extensionId + '/lane-chat/enable.html';
    const boot = await context.newPage();
    await boot.goto(enableUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await boot.close();
    await context.close();
    grantOrigins(userData, extensionId, origins);
    context = await launch(extDir, userData);
    worker = await readyWorker(context);
    await armMeta(worker, true);
    const js = await whatsappScripts(worker);
    expect(js.indexOf('core/incoming-judge.js')).toBeGreaterThanOrEqual(0);
    expect(js.indexOf('src/chat-compose.js')).toBeGreaterThanOrEqual(0);
    expect(js.indexOf('src/chat-task-card.js')).toBeGreaterThanOrEqual(0);
    expect(js.indexOf('src/content-gmail.js')).toBe(-1);
    expect(js.indexOf('src/content-whatsapp.js')).toBeGreaterThanOrEqual(0);
  } finally {
    if (context) await context.close();
  }
});
