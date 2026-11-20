const { test, expect } = require('./support/harness');
const S = require('./support/sentences');
const FIX = require('./fixtures/ms-contacts');
const lane = require('./support/lane-ms-mock');

test('Contacts.Read puts the contact into a reply draft and does not send', async ({ glance }) => {
  await glance.seedOutlook();
  await lane.run(glance, { scopes: ['Contacts.Read'], scenario: FIX.SCENARIO }, {
    id: FIX.ID,
    subject: 'Contacts',
    senderEmail: S.SENDER,
    body: FIX.BODY
  }, async (page) => {
    await page.waitForSelector('html[data-glance-lane-ms="on"]', { timeout: 20000 });
    const card = page.locator('#ReadingPaneContainerId .flow-lane-ms');
    await expect(card).toBeVisible();
    await expect(card).toContainText('dana.cohen.test@example.com');
    await expect(card).not.toContainText('dana.levi.test@example.com');
    await expect(card.locator('button.flow-lane-do')).toHaveCount(1);
    await page.evaluate(() => {
      const pane = document.getElementById('ReadingPaneContainerId');
      pane.style.position = 'relative';
      const cover = document.createElement('div');
      cover.id = 'mailMessageBodyContainer';
      cover.style.cssText = 'position:absolute;inset:0;z-index:1';
      pane.appendChild(cover);
      const reply = document.createElement('button');
      reply.setAttribute('aria-label', 'Reply');
      reply.textContent = 'Reply';
      const box = document.createElement('div');
      box.setAttribute('role', 'textbox');
      box.setAttribute('contenteditable', 'true');
      box.setAttribute('data-glance-reply-body', '1');
      reply.addEventListener('click', () => { window.__glanceReplyClicks = (window.__glanceReplyClicks || 0) + 1; box.hidden = false; });
      box.hidden = true;
      pane.appendChild(reply);
      pane.appendChild(box);
    });
    const clickable = await page.evaluate(() => {
      const btn = document.querySelector('#ReadingPaneContainerId .flow-lane-do');
      if (!btn) return false;
      const rect = btn.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return !!(hit && (hit === btn || btn.contains(hit)));
    });
    expect(clickable).toBe(true);
    await expect(page.locator('#ReadingPaneContainerId .flow-why-not')).toHaveCount(0);
    await card.locator('button.flow-lane-do').click();
    await expect(card.locator('.flow-lane-draft')).toContainText('dana.cohen.test@example.com');
    await expect(card.locator('.flow-lane-draft')).not.toContainText('dana.levi.test@example.com');
    expect(await page.evaluate(() => window.__glanceReplyClicks || 0)).toBe(0);
    await expect(page.locator('[data-glance-reply-body]')).not.toContainText('dana.cohen.test@example.com');
    const calls = await glance.apiCalls();
    const looked = calls.filter((c) => c.url.indexOf('/me/contacts') >= 0 || c.url.indexOf('/me/people') >= 0);
    expect(looked.some((c) => c.method === 'GET' && c.url.indexOf('/me/contacts') >= 0)).toBe(true);
    expect(looked.some((c) => c.method !== 'GET')).toBe(false);
    expect(calls.some((c) => c.method === 'POST' && c.url.indexOf('/createReply') >= 0)).toBe(true);
    expect(calls.some((c) => c.url.indexOf('sendMail') >= 0)).toBe(false);
    await expect(card).toContainText('בטיוטה');
    await expect(card).toHaveAttribute('data-glance-draft-state', 'in-draft');
    await expect(card.locator('.flow-lane-undo')).toBeVisible();
    await expect(card.locator('button.flow-lane-do')).toBeHidden();
    const drafted = (await glance.apiCalls()).filter((c) => c.method === 'POST' && c.url.indexOf('/createReply') >= 0);
    expect(drafted.length).toBe(1);
    await expect(card.locator('.flow-lane-undo')).toHaveText('בטל');
    await card.locator('.flow-lane-undo').click();
    await expect(card.locator('button.flow-lane-do')).toBeVisible();
    await expect(card.locator('button.flow-lane-do')).toContainText('הכנס לטיוטה');
    await expect(card).not.toHaveAttribute('data-glance-draft-state', 'in-draft');
    const after = await glance.apiCalls();
    expect(after.some((c) => c.method === 'DELETE' && c.url.indexOf('/me/messages/') >= 0)).toBe(true);
    expect(after.some((c) => c.url.indexOf('sendMail') >= 0)).toBe(false);
    await expect(card).not.toContainText('Handled');
  });
});

test('zero contact matches says so and does not offer a draft', async ({ glance }) => {
  await glance.seedOutlook();
  await lane.run(glance, { scopes: ['Contacts.Read'], scenario: { contacts: [], people: [] } }, {
    id: 'AQMkLaneMsContactsNone',
    subject: 'Contacts',
    senderEmail: S.SENDER,
    body: FIX.BODY
  }, async (page) => {
    const card = page.locator('#ReadingPaneContainerId .flow-lane-ms');
    await expect(card).toBeVisible({ timeout: 20000 });
    await expect(card).toContainText('לא מצאתי את דנה כהן באנשי הקשר');
    await expect(card.locator('button.flow-lane-do')).toHaveCount(0);
    const calls = await glance.apiCalls();
    expect(calls.some((c) => c.method === 'GET' && String(c.url).indexOf('/me/contacts') >= 0)).toBe(true);
    expect(calls.some((c) => c.url.indexOf('/createReply') >= 0)).toBe(false);
    expect(calls.some((c) => c.url.indexOf('sendMail') >= 0)).toBe(false);
  });
});

test('without Contacts.Read the card says how to grant it and does not call Graph', async ({ glance }) => {
  await glance.seedOutlook();
  await lane.prepare(glance, { scenario: FIX.SCENARIO });
  const page = await glance.openOutlook({
    id: 'AQMkLaneMsContactsWhy',
    subject: 'Contacts',
    senderEmail: S.SENDER,
    body: FIX.BODY
  });
  try {
    const card = page.locator('#ReadingPaneContainerId .flow-lane-ms');
    await expect(card).toBeVisible({ timeout: 20000 });
    await expect(card).toContainText('שורת Outlook');
    await expect(card).toContainText('אנשי קשר');
    await expect(card.locator('button.flow-lane-do')).toHaveCount(0);
    const calls = await glance.apiCalls();
    expect(calls.some((c) => String(c.url).indexOf('/me/contacts') >= 0)).toBe(false);
    expect(calls.some((c) => String(c.url).indexOf('/me/people') >= 0)).toBe(false);
    expect(calls.some((c) => String(c.url).indexOf('sendMail') >= 0)).toBe(false);
    await expect(card).not.toContainText('Handled');
  } finally {
    await lane.release(glance);
  }
});

test('unticking Contacts hides the lookup even when the token still has Contacts.Read', async ({ glance }) => {
  await glance.seedOutlook();
  await lane.prepare(glance, { scopes: ['Contacts.Read'], scenario: FIX.SCENARIO });
  await glance.evaluateWorker(async () => {
    await chrome.storage.local.set({ glanceContactsChoice: false });
    return true;
  });
  const page = await glance.openOutlook({
    id: 'AQMkLaneMsContactsOff',
    subject: 'Contacts',
    senderEmail: S.SENDER,
    body: FIX.BODY
  });
  try {
    const card = page.locator('#ReadingPaneContainerId .flow-lane-ms');
    await expect(card).toBeVisible({ timeout: 20000 });
    await expect(card).toContainText('כדי למצוא את איש הקשר');
    await expect(card.locator('button.flow-lane-do')).toHaveCount(0);
    const calls = await glance.apiCalls();
    expect(calls.some((c) => String(c.url).indexOf('/me/contacts') >= 0)).toBe(false);
    expect(calls.some((c) => String(c.url).indexOf('sendMail') >= 0)).toBe(false);
  } finally {
    await lane.release(glance);
  }
});
