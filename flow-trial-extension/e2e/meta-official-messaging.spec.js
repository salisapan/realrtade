// Official Messenger and Instagram lane, stubbed. The switch is off unless this spec turns it on.
// Do It is the one approval. The Graph call is the Glance relay stand-in, never messenger.com.
const { test, expect } = require('./support/harness');

const RELAY = 'e2e-relay-secret-32chars';

function ask(channel) {
  const instagram = channel === 'instagram';
  return {
    channel: instagram ? 'instagram' : 'messenger',
    pageId: instagram ? '3333333333' : '1111111111',
    senderId: instagram ? '4444444444' : '2222222222',
    recipientId: instagram ? '4444444444' : '2222222222',
    messageId: instagram ? 'mid.instagram-ask' : 'mid.messenger-ask',
    timestamp: Date.now() - 60 * 1000,
    text: instagram ? 'Can you send me the invoice?' : 'אפשר את החשבונית עד יום חמישי?',
    draft: instagram ? "Got it. I'll check and get back to you." : 'קיבלתי. אבדוק ואחזור אליך.',
    lang: instagram ? 'en' : 'he'
  };
}

async function arm(glance, channel, scenario) {
  await glance.seed({
    glanceSwitches: { META_OFFICIAL_MESSAGING: true },
    glanceMetaOfficialRelaySecret: RELAY,
    glanceMetaOfficialInbox: [ask(channel)]
  });
  await glance.evaluateWorker((patch) => {
    const e = globalThis.__glanceE2e;
    e.scenario = Object.assign({}, e.scenario, patch);
  }, scenario);
}

function sends(calls) {
  return (calls || []).filter((c) => String(c.url || '').indexOf('meta-official-messaging') >= 0 && c.method === 'POST');
}

test('the official Meta lane stays off: no card and no send', async ({ glance }) => {
  const page = await glance.openMetaOfficial();
  await expect(page.locator('[data-glance-meta="off"]')).toBeVisible();
  await expect(page.locator('[data-glance-meta="off"]')).toContainText('הנתיב כבוי');
  await expect(page.locator('.flow-chip')).toHaveCount(0);
  const calls = await glance.apiCalls();
  expect(sends(calls)).toHaveLength(0);
});

test('Messenger Do It sends the approved reply, then Handled, and Undo says Meta cannot take it back', async ({ glance }) => {
  await arm(glance, 'messenger', { metaOfficial: { ok: true } });
  const page = await glance.openMetaOfficial();
  await expect(page.locator('[data-glance-meta="card"]')).toBeVisible();
  await expect(page.locator('#glance-meta-reply')).toHaveValue('קיבלתי. אבדוק ואחזור אליך.');
  await expect(page.locator('.flow-chip-do-label')).toHaveText('בצע');
  await page.locator('button.flow-chip').click();
  await expect(page.locator('[data-glance-meta="handled"]')).toBeVisible();
  await expect(page.locator('.flow-chip-handled')).toHaveText('טופל.');
  const calls = await glance.apiCalls();
  expect(sends(calls)).toHaveLength(1);
  const body = JSON.parse(sends(calls)[0].body);
  expect(body.approved).toBe(true);
  expect(body.channel).toBe('messenger');
  expect(body.text).toBe('קיבלתי. אבדוק ואחזור אליך.');
  expect(String(sends(calls)[0].url)).not.toContain('graph.facebook.com');
  await page.locator('.flow-chip-undo').click();
  await expect(page.locator('.flow-chip-undo-hint')).toContainText('אי אפשר למשוך הודעה שנשלחה');
  const after = await glance.apiCalls();
  expect(sends(after)).toHaveLength(1);
});

test('an edited Instagram reply is what Do It sends, and a missed read-back is not Handled', async ({ glance }) => {
  await arm(glance, 'instagram', { metaOfficial: { unverified: true } });
  const page = await glance.openMetaOfficial();
  await expect(page.locator('[data-glance-meta="card"]')).toBeVisible();
  await page.locator('#glance-meta-reply').fill('The invoice is attached.');
  await page.locator('button.flow-chip').click();
  await expect(page.locator('[data-glance-meta="unverified"]')).toBeVisible();
  await expect(page.locator('.flow-chip-handled')).toHaveCount(0);
  const calls = await glance.apiCalls();
  expect(sends(calls)).toHaveLength(1);
  expect(JSON.parse(sends(calls)[0].body).text).toBe('The invoice is attached.');
  expect(JSON.parse(sends(calls)[0].body).channel).toBe('instagram');
});
