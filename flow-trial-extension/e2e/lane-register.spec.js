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
  const extDir = copyExtension({ bare: true });
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'glance-lanes-'));
  let context = null;
  try {
    context = await launch(extDir, userData);
    let worker = await readyWorker(context);
    const extensionId = await worker.evaluate(() => chrome.runtime.id);
    const origins = await worker.evaluate(() => globalThis.FlowMetaConsent.ORIGINS.slice());
    const popupUrl = 'chrome-extension://' + extensionId + '/popup/popup.html';
    const enableUrl = 'chrome-extension://' + extensionId + '/lane-chat/enable.html';

    const popup = await context.newPage();
    await popup.goto(popupUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await expect(popup.locator('#meta-chats-link .btn-label')).toHaveText(HE_BUTTON);
    const enable = await context.newPage();
    await enable.goto(enableUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await expect(enable.locator('#meta-turn-on .btn-label')).toHaveText(HE_BUTTON);
    await expect(enable.locator('[data-lang="he"]')).toBeVisible();
    await expect(enable.locator('[data-lang="en"]')).toBeHidden();
    await expect(enable.locator('[data-lang="he"]')).toContainText('שום דבר לא נשלח אוטומטית');
    await expect(enable.locator('[data-lang="he"]')).toContainText('בצ׳אטים של WhatsApp');
    await expect(enable.locator('[data-lang="he"]')).toContainText('המיקום של אירועים');

    await popup.close();
    await enable.close();
    await context.close();
    context = null;
    grantOrigins(userData, extensionId, origins);

    context = await launch(extDir, userData);
    worker = await readyWorker(context);
    await expect.poll(() => laneIds(worker), { timeout: 20000 }).toEqual(EXACT);

    // Stop the extension process and start it again on the same profile.
    // That starts a new service worker. chrome.runtime.reload() does not
    // surface a new worker in this headless Chrome, so the restart is this
    // new process. The grant is still in the profile.
    await context.close();
    context = await launch(extDir, userData);
    worker = await readyWorker(context);
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
    await expect.poll(async () => {
      const ids = await laneIds(worker);
      return ids.filter((id) => id.indexOf('glance-lane-') === 0);
    }, { timeout: 20000 }).toEqual([]);
    const full = await worker.evaluate(async () => chrome.permissions.contains({ origins: globalThis.FlowMetaConsent.ORIGINS.slice() }));
    expect(full).toBe(false);
  } finally {
    if (context) await context.close().catch(() => {});
    fs.rmSync(extDir, { recursive: true, force: true });
    fs.rmSync(userData, { recursive: true, force: true });
  }
});
