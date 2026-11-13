// Meta lane registration with patched manifest + META_CHAT_LANES on (non-blocking CI job only).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect, chromium } = require('@playwright/test');
const { copyExtension } = require('./support/launch');

const EXACT = ['glance-lane-instagram', 'glance-lane-messenger', 'glance-lane-whatsapp'];
const HE_BUTTON = 'הפעל צ׳אטים של Meta';
const HE_ON = 'צ׳אטים של Meta פועלים';

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

async function laneIds(worker) {
  return worker.evaluate(async () => {
    const rows = await chrome.scripting.getRegisteredContentScripts();
    return rows.map((row) => row.id).sort();
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

test('a full Meta grant registers exactly three lanes, and a revoke clears them', async () => {
  test.setTimeout(120000);
  const extDir = copyExtension();
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'glance-lanes-meta-'));
  let context = null;
  try {
    context = await launch(extDir, userData);
    let worker = await readyWorker(context);
    await worker.evaluate(async () => {
      await chrome.storage.local.set({ glanceSwitches: { META_CHAT_LANES: true } });
    });
    const extensionId = await worker.evaluate(() => chrome.runtime.id);
    const origins = await worker.evaluate(() => globalThis.FlowMetaConsent.ORIGINS.slice());
    const popupUrl = 'chrome-extension://' + extensionId + '/popup/popup.html';

    await context.close();
    context = null;
    grantOrigins(userData, extensionId, origins);

    context = await launch(extDir, userData);
    worker = await readyWorker(context);
    await worker.evaluate(async () => {
      await chrome.storage.local.set({ glanceSwitches: { META_CHAT_LANES: true } });
    });
    await expect.poll(() => laneIds(worker), { timeout: 20000 }).toEqual(EXACT);

    await context.close();
    context = await launch(extDir, userData);
    worker = await readyWorker(context);
    await worker.evaluate(async () => {
      await chrome.storage.local.set({ glanceSwitches: { META_CHAT_LANES: true } });
    });
    await expect.poll(() => laneIds(worker), { timeout: 20000 }).toEqual(EXACT);

    const grantedPopup = await context.newPage();
    await grantedPopup.goto(popupUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await expect(grantedPopup.locator('#meta-chats-on')).toHaveText(HE_ON);

    const removed = await worker.evaluate(async (list) => {
      let ok = false;
      try { ok = await chrome.permissions.remove({ origins: list }); } catch (e) { return { ok: false, error: String(e) }; }
      let contains = null;
      try { contains = await chrome.permissions.contains({ origins: list }); } catch (e) { contains = String(e); }
      return { ok: ok, contains: contains };
    }, origins);
    expect(removed).toEqual({ ok: true, contains: false });
    await expect.poll(() => laneIds(worker), { timeout: 20000 }).toEqual([]);
    await expect(grantedPopup.locator('#meta-chats-link .btn-label')).toHaveText(HE_BUTTON);
  } finally {
    if (context) await context.close().catch(() => {});
    fs.rmSync(extDir, { recursive: true, force: true });
    fs.rmSync(userData, { recursive: true, force: true });
  }
});
