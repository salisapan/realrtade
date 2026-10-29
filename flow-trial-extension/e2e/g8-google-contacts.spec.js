// G8 Google Contacts: v1 keeps contacts.readonly off the manifest; GOOGLE_CONTACTS must stay fail-closed.
const { test, expect } = require('./support/harness');

const ASK = "What's Dana's email?";
const CARD_ANSWER = "Answer with Dana's address";
const BASE_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/tasks'
];

function granted(extra) {
  const scopes = BASE_SCOPES.concat(extra || []).slice().sort();
  return {
    version: scopes.join('\n'),
    status: 'granted',
    source: 'chrome',
    at: Date.now()
  };
}

async function open(glance, switches, body, id) {
  await glance.seedGmail({
    glanceSwitches: switches || {},
    googleGrantedScopes: granted()
  });
  return glance.openGmail({
    messageId: 'm-' + id,
    threadId: 't-' + id,
    subject: 'Question',
    senderEmail: 'asker@example.com',
    senderName: 'Asker',
    body,
    composeReply: true,
    composeTo: 'asker@example.com',
    composeSubject: 'Re: Question'
  });
}

test('GOOGLE_CONTACTS off: no card', async ({ glance }) => {
  const page = await open(glance, null, ASK, 'off');
  await expect(page.locator('div[role="main"]')).not.toContainText(CARD_ANSWER, { timeout: 15000 });
});

test('GOOGLE_CONTACTS on without v1 scope: still no card (fail-closed)', async ({ glance }) => {
  const page = await open(glance, { GOOGLE_CONTACTS: true }, ASK, 'on-no-scope');
  await expect(page.locator('div[role="main"]')).not.toContainText(CARD_ANSWER, { timeout: 15000 });
});

test('GOOGLE_CONTACTS on without v1 scope: forward ask stays quiet', async ({ glance }) => {
  const page = await open(glance, { GOOGLE_CONTACTS: true }, 'send this to Dana', 'fwd-off');
  await expect(page.locator('div[role="main"] .flow-chip-host')).toHaveCount(0, { timeout: 15000 });
});
