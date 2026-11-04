// Hebrew UI chrome. A Gmail fixture with lang=he. Mail titles, names, and
// file names are user content. Glance and the other product names stay.
// An English month or any other Latin word in chrome fails.
const fs = require('fs');
const path = require('path');
const { test, expect } = require('./support/harness');
const { manifestOauthScopes } = require('./support/launch');
const { sameDayIso } = require('./support/frozen-date');

const SHOTS = '/opt/cursor/artifacts/screenshots';

const MONTHS = /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/;
const BRANDS = new Set([
  'glance', 'google', 'gmail', 'drive', 'meta', 'outlook', 'pro', 'microsoft',
  'onedrive', 'sharepoint', 'whatsapp', 'glnc', 'teams', 'slack', 'telegram', 'web', 'notion',
  'ollama', 'lm', 'studio'
]);
const BRAND_PHRASES = ['glance pro', 'telegram web', 'google', 'meta', 'slack'];

function offenders(text) {
  let raw = String(text || '');
  BRAND_PHRASES.forEach((phrase) => {
    raw = raw.replace(new RegExp(phrase.replace(/ /g, '\\s+'), 'ig'), ' ');
  });
  const months = raw.match(MONTHS) || [];
  const words = (raw.match(/[A-Za-z][A-Za-z'’]{1,}/g) || [])
    .filter((word) => !BRANDS.has(word.toLowerCase().replace(/[’']/g, '')));
  return months.concat(words);
}

async function visibleChrome(page, selector) {
  const root = page.locator(selector);
  if (await root.count() === 0) return '';
  return root.first().evaluate((node) => {
    function skip(el) {
      if (!el || el.nodeType !== 1) return true;
      if (el.hidden || el.getAttribute('hidden') != null) return true;
      if (el.hasAttribute('data-glance-user') || el.hasAttribute('data-glance-names-diag')) return true;
      const style = el.ownerDocument.defaultView.getComputedStyle(el);
      return style.display === 'none' || style.visibility === 'hidden';
    }
    function walk(el, out) {
      if (skip(el)) return;
      const style = el.ownerDocument.defaultView.getComputedStyle(el);
      function shown(text) {
        const value = String(text || '');
        if (style.textTransform === 'uppercase') return value.toLocaleUpperCase('en');
        if (style.textTransform === 'lowercase') return value.toLocaleLowerCase('en');
        return value;
      }
      const aria = el.getAttribute('aria-label');
      if (aria) out.push(shown(aria));
      for (const child of el.childNodes) {
        if (child.nodeType === 3) out.push(shown(child.nodeValue || ''));
        else if (child.nodeType === 1) walk(child, out);
      }
    }
    const out = [];
    walk(node, out);
    return out.join('\n');
  });
}

test('a Hebrew Gmail UI has no English chrome', async ({ glance }) => {
  await glance.seedGmail({
    glanceHostLanguage: 'he',
    glanceDevFixture: false,
    googleReconnect: { needed: true, reason: '401' },
    glanceOwnNames: [],
    googleProfile: null,
    stillOpenScan: [{
      messageId: 'm-he-open',
      threadId: 't-he-open',
      app: 'gmail',
      ts: Date.now() - 60 * 60 * 1000,
      sender: { name: 'Dana Levi', email: 'dana@example.com' },
      subject: 'contract.pdf',
      intent: {
        type: 'decision',
        label: 'Send the contract',
        confidence: 'high',
        personalClose: 'dated-commitment',
        facts: { date: { iso: sameDayIso(0) } },
        entities: { what: 'the signed contract' }
      },
      process: { id: 'log-it', name: 'Send the contract', steps: [{ id: 'task', kind: 'task' }] }
    }]
  });
  const page = await glance.openGmail({
    lang: 'he',
    accountLabel: 'Google Account: Sali Sapan (ai.local.flow@gmail.com)',
    messageId: 'm-he-quiet',
    threadId: 't-he-quiet',
    subject: 'contract.pdf',
    body: 'Thanks, got it.',
    senderEmail: 'glance.salisapan@outlook.com',
    senderName: 'Dana Levi',
    ownEmail: 'ai.local.flow@gmail.com',
    to: ['ai.local.flow@gmail.com']
  });
  const pill = page.locator('#flow-brief-indicator-host');
  await expect(pill).toBeVisible({ timeout: 8000 });
  await pill.click();
  const panel = page.locator('#flow-brief-panel-host');
  await expect(panel).toBeVisible();
  await expect(panel.locator('.flow-chip-process-name').first()).toContainText('התחייבת');
  // The seeded date is today, so the Hebrew month is today's month (a fixed 'באוק' broke on 1 November).
  const heMonth = 'ב' + new Intl.DateTimeFormat('he', { month: 'short' }).format(new Date(sameDayIso(0) + 'T12:00:00'));
  await expect(panel.locator('.flow-chip-process-name').first()).toContainText(heMonth);

  const chips = page.locator('.flow-chip-host');
  const gmailParts = [
    await visibleChrome(page, '#flow-brief-indicator-host'),
    await visibleChrome(page, '#flow-brief-panel-host')
  ];
  if (await chips.count()) gmailParts.push(await visibleChrome(page, '.flow-chip-host'));
  const gmailBad = offenders(gmailParts.join('\n'));
  expect(gmailBad, gmailParts.join('\n')).toEqual([]);

  const popup = await glance.openPopup();
  await expect.poll(async () => popup.evaluate(() => new Promise((resolve) => {
    chrome.storage.local.get('glanceNamesDiag', (bag) => resolve(bag && bag.glanceNamesDiag && bag.glanceNamesDiag.source));
  }))).toBe('aria-label');
  const namesLog = [];
  popup.on('console', (msg) => {
    if (msg.type() === 'info') namesLog.push(msg.text());
  });
  await popup.reload({ waitUntil: 'domcontentloaded' });
  await expect.poll(() => namesLog.join('\n')).toContain('Names: Sali Sapan, source: aria-label');
  await expect(popup.locator('#namesDiag')).toBeHidden();
  const google = popup.locator('.conn').filter({ has: popup.locator('b', { hasText: 'Google' }) }).first();
  await expect(google.locator('.badge')).toHaveText('חבר מחדש את Google');
  await expect(google.locator('.btn-label')).toHaveText('חבר מחדש את Google');
  await expect(popup.locator('#statusPill')).toHaveText('חבר מחדש את Google');
  await expect(popup.locator('[data-glance-connect="meta"]')).toBeVisible();
  await expect(popup.locator('[data-provider="google"]')).toHaveCount(1);
  await expect(popup.locator('[data-provider="meta"]')).toHaveCount(1);
  const metaBadge = popup.locator('[data-provider="meta"] .badge');
  await expect(metaBadge).toHaveText('כבוי');
  await expect(metaBadge).toHaveAttribute('dir', 'auto');
  expect(await metaBadge.evaluate((el) => getComputedStyle(el).textTransform)).toBe('none');
  await expect(popup.locator('#meta-chats-link .btn-label')).toHaveText('הפעל צ׳אטים של Meta');
  const popupText = await visibleChrome(popup, 'body');
  expect(offenders(popupText), popupText).toEqual([]);

  await expect(popup.locator('#meta-chats-link')).toHaveClass('primary sm');
  fs.mkdirSync(SHOTS, { recursive: true });
  const list = popup.locator('#connector-list');
  for (const theme of ['light', 'dark']) {
    await popup.locator('html').evaluate((el, name) => el.setAttribute('data-theme', name), theme);
    const paint = await list.evaluate((root) => {
      const meta = root.querySelector('[data-glance-connect="meta"]');
      const neighbour = root.querySelector('.conn:not([data-glance-connect="meta"])');
      function box(el) {
        const style = getComputedStyle(el);
        return {
          backgroundColor: style.backgroundColor,
          color: style.color,
          borderTopColor: style.borderTopColor
        };
      }
      const off = root.querySelector('.conn:not(.on):not([data-glance-connect="meta"])');
      return {
        meta: box(meta),
        neighbour: neighbour ? box(neighbour) : null,
        off: off ? box(off) : null
      };
    });
    expect(paint.neighbour).toBeTruthy();
    expect(paint.meta.backgroundColor).toBe(paint.neighbour.backgroundColor);
    expect(paint.meta.color).toBe(paint.neighbour.color);
    expect(paint.meta.backgroundColor).not.toBe('rgb(247, 244, 238)');
    if (paint.off) expect(paint.meta).toEqual(paint.off);
    await list.screenshot({ path: path.join(SHOTS, 'connections-' + theme + '.png') });
  }

  // After the names read. A second Gmail tab with no account button writes
  // glanceNamesDiag source none, and that must not land before the assertion.
  const deck = await glance.openGmail({
    lang: 'he',
    messageId: 'm-he-deck',
    threadId: 't-he-deck',
    subject: 'deck',
    body: 'can you send me the deck by Sunday?',
    senderEmail: 'glance.salisapan@outlook.com',
    senderName: 'Dana Levi',
    ownEmail: 'ai.local.flow@gmail.com',
    to: ['ai.local.flow@gmail.com']
  });
  // Real v1: the grant is exactly the manifest scopes (no drive.readonly), so
  // flow:search-drive answers drive-search-unavailable and the file chain
  // stops. No needs-you card and no write, but never a silent skip: a visible
  // Hebrew line says why. Nothing here seeds a wider grant.
  const msg = deck.locator('[data-legacy-message-id="m-he-deck"]');
  const why = msg.locator('.flow-why-not[data-glance-why="drive-search-unavailable-v1"]');
  await expect(why).toHaveCount(1, { timeout: 15000 });
  await expect(why).toBeVisible();
  const whyText = (await why.evaluate((el) => el.textContent)).trim();
  expect(whyText, 'the v1 why is visible Hebrew text naming Drive').toMatch(/Drive/);
  expect(whyText).toMatch(/[\u0590-\u05FF]/);
  await expect(deck.locator('div[role="main"] .flow-chip-host')).toHaveCount(0);
  const storedScopes = await glance.storage();
  expect(String(storedScopes.googleGrantedScopes.version).split('\n').sort(), 'the grant is exactly the v1 manifest scopes').toEqual(manifestOauthScopes().sort());
  const calls = await glance.apiCalls();
  expect(calls.filter((c) => /\/drive\/v3\/files\?/.test(JSON.stringify(c))), 'no Drive search call in v1').toEqual([]);
  expect(storedScopes.log || [], 'nothing was written').toEqual([]);
});
