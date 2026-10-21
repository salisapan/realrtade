// drive.file: unreadable Drive ids get an honest error (no silent fail, no remote picker).
const { test, expect } = require('./support/harness');
const { startGoogleLaneServer } = require('./support/google-lane-server');
const S = require('./support/sentences');

const SELF = 'ai.local.flow@gmail.com';
const FOREIGN = 'FOREIGN-NOT-CREATED-BY-GLANCE';
const V1_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/tasks'
].sort().join('\n');

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
  await glance.setAuthFail(true);
  await glance.evaluateWorker((origin, email) => {
    globalThis.__glanceE2e.httpOrigin = origin;
    globalThis.__glanceE2e.identityToken = 'ya29.web-v1';
    globalThis.__glanceE2e.tokenAccounts = { 'ya29.web-v1': email };
    globalThis.__glanceE2e.webFlowError = '';
  }, laneServer.origin, SELF);
  await glance.seedGmail({
    googleWebAuth: { accessToken: 'ya29.web-v1', source: 'web', expiresAt: Date.now() + 3600000, loginHint: SELF },
    googleGrantedScopes: { version: V1_SCOPES, status: 'granted', source: 'web', at: Date.now() },
    googleConnectedAccount: { email: SELF, source: 'web', at: Date.now() },
    googleEverConnected: { connected: true }
  });
}

test('lane 404 on an uncreated Drive file maps to drive-scope (same as background)', async ({ glance }) => {
  await seedLaneAuth(glance);
  const out = await glance.evaluateWorker(async (id) => globalThis.__glanceE2e.probeDriveFile(id), FOREIGN);
  expect(out && out.ok).toBe(false);
  expect(out.reason).toBe('drive-scope');
});

test('follow-draft path refuses an unreadable Drive file with drive-scope', async ({ glance }) => {
  await seedLaneAuth(glance);
  const out = await glance.evaluateWorker(async (payload) => globalThis.__glanceE2e.probeFollowDraftDrive(payload), {
    to: S.SENDER,
    subject: 'Contract',
    body: 'Please see the attached file.',
    driveFileId: FOREIGN
  });
  expect(out && out.ok).toBe(false);
  expect(out.reason).toBe('drive-scope');
});

test('driveFileScope copy is wired in EN and HE (display-copy.js)', () => {
  const fs = require('fs');
  const path = require('path');
  const vm = require('vm');
  const file = path.join(__dirname, '..', 'core', 'display-copy.js');
  const sandbox = { module: { exports: {} }, globalThis: {} };
  sandbox.globalThis = sandbox;
  vm.runInContext(fs.readFileSync(file, 'utf8'), vm.createContext(sandbox));
  const en = sandbox.FlowDisplay.chrome('en').driveFileScope;
  const he = sandbox.FlowDisplay.chrome('he').driveFileScope;
  expect(en).toMatch(/this version/i);
  expect(he).toMatch(/גרסה/);
});
