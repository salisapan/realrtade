// drive.file: unreadable Drive ids get an honest error (no silent fail, no remote picker).
const { test, expect } = require('./support/harness');
const { startGoogleLaneServer } = require('./support/google-lane-server');
const S = require('./support/sentences');

const SELF = 'ai.local.flow@gmail.com';
const FOREIGN = 'FOREIGN-NOT-CREATED-BY-GLANCE';
let laneServer;

test.beforeAll(async () => {
  laneServer = await startGoogleLaneServer();
});

test.afterAll(async () => {
  if (laneServer) await laneServer.close();
});

async function seedLaneAuth(glance) {
  laneServer.reset();
  laneServer.setAccount(SELF);
  await glance.evaluateWorker((origin) => {
    globalThis.__glanceE2e.httpOrigin = origin;
  }, laneServer.origin);
  await glance.setAuthFail(true);
  await glance.seedGmail({
    googleWebAuth: { accessToken: 'ya29.web-v1', source: 'web', expiresAt: Date.now() + 3600000, loginHint: SELF },
    googleGrantedScopes: {
      version: [
        'openid',
        'https://www.googleapis.com/auth/userinfo.profile',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/calendar.events',
        'https://www.googleapis.com/auth/tasks'
      ].sort().join('\n'),
      status: 'granted',
      source: 'web',
      at: Date.now()
    },
    googleConnectedAccount: { email: SELF, source: 'web', at: Date.now() },
    googleEverConnected: { connected: true }
  });
}

test('flow:drive-file-check returns drive-scope for a file Glance did not create (lane 404)', async ({ glance }) => {
  await seedLaneAuth(glance);
  const out = await glance.evaluateWorker(async (id) => {
    return globalThis.chrome.runtime.sendMessage({ type: 'flow:drive-file-check', id });
  }, FOREIGN);
  expect(out && out.ok).toBe(false);
  expect(out.reason).toBe('drive-scope');
});

test('follow-draft with unreadable Drive file returns drive-scope (not attach)', async ({ glance }) => {
  await seedLaneAuth(glance);
  const out = await glance.evaluateWorker(async (id) => {
    return globalThis.chrome.runtime.sendMessage({
      type: 'flow:follow-draft',
      payload: {
        to: S.SENDER,
        subject: 'Contract',
        body: 'Please see the attached file.',
        driveFileId: id
      }
    });
  }, FOREIGN);
  expect(out && out.ok).toBe(false);
  expect(out.reason).toBe('drive-scope');
});

test('driveFileScope copy is wired in EN and HE on the Gmail surface', async ({ glance }) => {
  const page = await glance.openGmail({
    messageId: 'm-drive-scope-copy',
    threadId: 't-drive-scope-copy',
    subject: 'Contract',
    senderEmail: S.SENDER,
    senderName: 'flow',
    ownEmail: SELF,
    to: [SELF],
    body: 'Please send the signed contract back with the file attached.'
  });
  const copy = await page.evaluate(() => ({
    en: typeof FlowDisplay !== 'undefined' ? FlowDisplay.copy('en').driveFileScope : '',
    he: typeof FlowDisplay !== 'undefined' ? FlowDisplay.copy('he').driveFileScope : ''
  }));
  expect(copy.en).toMatch(/this version/i);
  expect(copy.he).toMatch(/גרסה/);
});
