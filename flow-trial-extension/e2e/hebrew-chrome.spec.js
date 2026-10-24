// Hebrew UI: card chrome and Activity have no Latin words.
// User content (names, subjects, amounts) is allowed. Glance stays the brand.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SHOTS = '/opt/cursor/artifacts/screenshots';

function latinWords(text) {
  let t = String(text || '');
  t = t.replace(/https?:\/\/\S+/g, ' ');
  t = t.replace(/[$₪€]\s?\d[\d,.]*/g, ' ');
  t = t.replace(/\d+/g, ' ');
  // The brand sits against Hebrew and against the time digits, so a word
  // boundary is not enough. Glance is the product name, not chrome copy.
  t = t.replace(/Glance/g, ' ');
  return t.match(/[A-Za-z]{2,}/g) || [];
}

async function paintCards(page, dark) {
  await page.setContent(
    '<!doctype html><html lang="he" dir="rtl"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>' +
    '<body style="margin:0;padding:16px;font-family:system-ui,sans-serif"><div id="hold"></div><div id="log" style="margin-top:16px"></div></body></html>',
    { waitUntil: 'domcontentloaded' }
  );
  await page.addStyleTag({ path: path.join(ROOT, 'design/step-states-v1/scoped.css') });
  await page.addStyleTag({ path: path.join(ROOT, 'src/chip.css') });
  for (const rel of ['core/display-copy.js', 'core/step-list.js', 'src/step-kit.js', 'src/step-list-view.js', 'src/chip-host.js']) {
    await page.addScriptTag({ path: path.join(ROOT, rel) });
  }
  await page.evaluate((isDark) => {
    document.body.style.background = isDark ? '#1c1c1e' : '#f4f1ea';
    document.documentElement.lang = 'he';
    const hold = {
      uiLang: 'he',
      app: 'outlook',
      glanceChain: 'calendar-hold',
      process: {
        id: 'hold',
        name: 'Hold It',
        closingLine: 'Putting this on your calendar.',
        steps: [{ kind: 'calendar', id: 'calendar', label: 'Calendar', params: { dateIso: '2026-10-19', hour: 10, minute: 0, title: 'Budget review' } }]
      },
      intent: { label: 'Hold the slot' }
    };
    const logged = {
      uiLang: 'he',
      app: 'outlook',
      process: {
        id: 'log-it',
        name: 'Log It',
        closingLine: 'Logging this so it stays tracked.',
        steps: [{ kind: 'googleTask', id: 'task', label: 'Task', params: { title: 'Log $500 agreed' } }]
      },
      intent: { label: 'Log $500 agreed' }
    };
    window.FlowChipHost.inject(document.getElementById('hold'), hold, {});
    window.FlowChipHost.inject(document.getElementById('log'), logged, {});
    if (isDark) {
      document.querySelectorAll('.flow-step-card').forEach((node) => node.setAttribute('data-theme', 'dark'));
    }
  }, dark);
}

test('Hebrew card chrome and Activity have no Latin words', async ({ page }) => {
  fs.mkdirSync(SHOTS, { recursive: true });
  for (const dark of [false, true]) {
    await page.setViewportSize({ width: 1280, height: 900 });
    await paintCards(page, dark);
    await expect(page.locator('#hold .gs-intent')).toHaveText('שריין ב׳ 10:00');
    await expect(page.locator('#hold .chip-hold')).toHaveText('השהה');
    await expect(page.locator('#hold .doit-dark')).toHaveText('בצע');
    await expect(page.locator('#hold .act-text').first()).toHaveText('יומן');
    await expect(page.locator('#log .gs-intent')).toHaveText('רשום $500 שסוכם');
    await expect(page.locator('#log .act-text').first()).toHaveText('משימה');
    await expect(page.locator('#log .act-app').first()).toHaveText('משימות');
    const imgHidden = await page.locator('#hold img.chip-do').evaluate((node) => getComputedStyle(node).display === 'none');
    expect(imgHidden).toBe(true);
    const chrome = await page.locator('body').evaluate(() => {
      const root = document.body.cloneNode(true);
      root.querySelectorAll('[data-glance-user]').forEach((node) => node.remove());
      return root.innerText;
    });
    expect(latinWords(chrome), chrome).toEqual([]);
    const name = 'hebrew-chrome-he-' + (dark ? 'dark' : 'light') + '.png';
    await page.screenshot({ path: path.join(SHOTS, name), fullPage: true });
  }

  await page.addInitScript(() => {
    const store = {
      glanceHostLanguage: 'he',
      onboarded: true,
      log: [{
        ts: Date.now(),
        kind: 'written',
        connectorId: 'outlookDraft',
        messageId: 'm-draft',
        label: 'Budget review',
        subject: 'Budget review',
        where: 'https://outlook.live.com/mail/0/drafts/draft-1',
        url: 'https://outlook.live.com/mail/0/drafts/draft-1',
        ref: 'draft-1',
        app: 'outlook'
      }],
      closeQuality: { success: 2, return: 1, falseDoIt: 0 }
    };
    const reply = (msg) => {
      if (msg && msg.type === 'flow:connector-status') return { ok: true };
      if (msg && msg.type === 'flow:pro-status') return { ok: true, active: false };
      return { ok: true };
    };
    window.chrome = {
      runtime: {
        id: 'ext', lastError: null, getURL: (s) => s,
        getManifest: () => ({ version: '0.9.56' }),
        onMessage: { addListener() {} },
        sendMessage: (msg, cb) => { const r = reply(msg); if (cb) setTimeout(() => cb(r), 0); return Promise.resolve(r); }
      },
      storage: {
        local: {
          get: (k, cb) => {
            let r;
            if (k == null) r = Object.assign({}, store);
            else if (typeof k === 'string') r = { [k]: store[k] };
            else if (Array.isArray(k)) r = Object.fromEntries(k.map((x) => [x, store[x]]));
            else r = Object.assign({}, k, store);
            if (cb) cb(r);
            return Promise.resolve(r);
          },
          set: (o, cb) => { Object.assign(store, o); if (cb) cb(); return Promise.resolve(); },
          remove: (k, cb) => { if (cb) cb(); return Promise.resolve(); }
        },
        onChanged: { addListener() {} },
        sync: { get: (k, cb) => { if (cb) cb({}); return Promise.resolve({}); } }
      },
      i18n: { getUILanguage: () => 'en-US' },
      tabs: { query: () => Promise.resolve([]), sendMessage() {}, create() {} },
      identity: { getRedirectURL: () => 'https://example.test/', launchWebAuthFlow(o, cb) { if (cb) cb(null); } },
      permissions: { contains: () => Promise.resolve(false), request: () => Promise.resolve(false), remove: () => Promise.resolve(true) }
    };
    Object.defineProperty(navigator, 'language', { get: () => 'en-US' });
  });
  await page.goto('file://' + path.join(ROOT, 'popup/popup.html'));
  await page.locator('button[data-tab="log"]').click();
  await expect(page.locator('button[data-tab="log"]')).toHaveText('פעילות');
  await expect(page.locator('#log-list')).toContainText('פתח טיוטה');
  await expect(page.locator('#log-list')).toContainText('בטל');
  await expect(page.locator('#closeQuality')).toContainText('סגירות מלאות 2');
  await expect(page.locator('#closeQuality')).toContainText('חזרות 1');
  await expect(page.locator('#closeQuality')).toContainText('סירובים 0');
  await expect(page.locator('#weekLabel')).toHaveText(' נרשמו השבוע');
  const activity = await page.locator('[data-panel="log"]').evaluate(() => {
    const root = document.querySelector('[data-panel="log"]').cloneNode(true);
    root.querySelectorAll('[data-glance-user]').forEach((node) => node.remove());
    return root.innerText;
  });
  expect(latinWords(activity), activity).toEqual([]);
  await page.screenshot({ path: path.join(SHOTS, 'hebrew-activity-he.png'), fullPage: true });
});
