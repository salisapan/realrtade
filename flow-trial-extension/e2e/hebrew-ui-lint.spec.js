// Hebrew UI chrome. A Gmail fixture with lang=he. Mail titles, names, and
// file names are user content. Glance and the other product names stay.
// An English month or any other Latin word in chrome fails.
const { test, expect } = require('./support/harness');

const MONTHS = /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/;
const BRANDS = new Set([
  'glance', 'google', 'gmail', 'drive', 'meta', 'outlook', 'pro', 'microsoft',
  'onedrive', 'whatsapp', 'glnc', 'teams', 'slack', 'telegram', 'web', 'notion',
  'ollama', 'lm', 'studio'
]);

function offenders(text) {
  const raw = String(text || '');
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
      const aria = el.getAttribute('aria-label');
      if (aria) out.push(aria);
      for (const child of el.childNodes) {
        if (child.nodeType === 3) out.push(child.nodeValue || '');
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
        facts: { date: { iso: '2026-10-17' } },
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
  await expect(panel.locator('.flow-chip-process-name').first()).toContainText('באוק');

  const chips = page.locator('.flow-chip-host');
  const gmailParts = [
    await visibleChrome(page, '#flow-brief-indicator-host'),
    await visibleChrome(page, '#flow-brief-panel-host')
  ];
  if (await chips.count()) gmailParts.push(await visibleChrome(page, '.flow-chip-host'));
  const gmailBad = offenders(gmailParts.join('\n'));
  expect(gmailBad, gmailParts.join('\n')).toEqual([]);

  const popup = await glance.openPopup();
  await expect(popup.locator('#namesDiag')).toHaveText('Names: Sali Sapan, source: aria-label', { timeout: 8000 });
  await expect(popup.locator('[data-glance-connect="meta"]')).toBeVisible();
  await expect(popup.locator('#meta-chats-link .btn-label')).toHaveText('הפעל צ׳אטים של Meta');
  const popupText = await visibleChrome(popup, 'body');
  expect(offenders(popupText), popupText).toEqual([]);

  await popup.locator('html').evaluate((el) => el.setAttribute('data-theme', 'light'));
  const light = await popup.locator('[data-glance-connect="meta"]').evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(light).toBe('rgb(247, 244, 238)');
  await popup.locator('html').evaluate((el) => el.setAttribute('data-theme', 'dark'));
  const dark = await popup.locator('[data-glance-connect="meta"]').evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(dark).not.toBe('rgb(247, 244, 238)');
});
