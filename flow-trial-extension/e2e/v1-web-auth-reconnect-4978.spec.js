const { test, expect } = require('./support/harness');
const { startGoogleLaneServer } = require('./support/google-lane-server');

const SELF = 'ai.local.flow@gmail.com';
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

async function seedWeb(glance) {
  await glance.setAuthFail(true);
  await glance.evaluateWorker((email) => {
    globalThis.__glanceE2e.identityToken = 'ya29.chrome-stale';
    globalThis.__glanceE2e.tokenAccounts = { 'ya29.web-v1': email };
    globalThis.__glanceE2e.webFlowError = '';
  }, SELF);
  await glance.seedGmail({
    googleWebAuth: {
      accessToken: 'ya29.web-v1',
      source: 'web',
      expiresAt: Date.now() + 60 * 60 * 1000,
      loginHint: SELF
    },
    googleGrantedScopes: { version: V1_SCOPES, status: 'granted', source: 'web', at: Date.now() },
    googleConnectedAccount: { email: SELF, source: 'web', at: Date.now() },
    googleEverConnected: { connected: true }
  });
}

async function wireLane(glance, flags) {
  laneServer.reset();
  laneServer.setAccount(SELF);
  if (flags && flags.tasks401AfterRefresh) laneServer.setTasks401AfterRefresh(true);
  if (flags && flags.tasks403Insufficient) laneServer.setTasks403Insufficient(true);
  await glance.evaluateWorker((origin) => {
    globalThis.__glanceE2e.httpOrigin = origin;
  }, laneServer.origin);
}

test('invalid_grant on silent web refresh sets reconnect', async ({ glance }) => {
  await seedWeb(glance);
  const out = await glance.evaluateWorker(async () => {
    globalThis.__glanceE2e.launchWebAuthFlow = async () => {
      throw new Error('invalid_grant: Token has been revoked.');
    };
    const next = await globalThis.FlowGoogleAccess.retry({ token: 'ya29.web-v1', source: 'web' });
    const bag = await chrome.storage.local.get('googleReconnect');
    return { next, reconnect: bag.googleReconnect };
  });
  expect(out.next && out.next.revoked).toBe(true);
  expect(out.reconnect && out.reconnect.needed).toBe(true);
});

test('revoked grant on refresh sets reconnect', async ({ glance }) => {
  await wireLane(glance, { tasks401AfterRefresh: true });
  await seedWeb(glance);
  await glance.evaluateWorker(() => {
    globalThis.__glanceE2e.webFlowError = 'Token has been revoked.';
  });
  const out = await glance.evaluateWorker(async () => {
    const C = globalThis.FlowGoogleConfig;
    const res = await globalThis.FlowGoogleLane.write('googleLaneTask', {
      title: 'Revoked probe',
      taskListId: 'glance-list',
      scopes: [C.SCOPE_TASKS, C.SCOPE_CALENDAR, C.SCOPE_DRIVE_FILE]
    });
    const bag = await chrome.storage.local.get('googleReconnect');
    return { res, reconnect: bag.googleReconnect };
  });
  expect(out.reconnect && out.reconnect.needed).toBe(true);
  expect(out.reconnect.reason).toBe('revoked');
});

test('401 after a successful refresh sets reconnect', async ({ glance }) => {
  await wireLane(glance, { tasks401AfterRefresh: true });
  await seedWeb(glance);
  const out = await glance.evaluateWorker(async () => {
    const C = globalThis.FlowGoogleConfig;
    const res = await globalThis.FlowGoogleLane.write('googleLaneTask', {
      title: 'Reconnect probe',
      taskListId: 'glance-list',
      scopes: [C.SCOPE_TASKS, C.SCOPE_CALENDAR, C.SCOPE_DRIVE_FILE]
    });
    const bag = await chrome.storage.local.get('googleReconnect');
    return { res, reconnect: bag.googleReconnect };
  });
  expect(out.reconnect && out.reconnect.needed).toBe(true);
  expect(out.reconnect.reason).toBe('401');
});

test('403 insufficientPermissions shows missing-permission, not reconnect', async ({ glance }) => {
  await wireLane(glance, { tasks403Insufficient: true });
  await seedWeb(glance);
  const out = await glance.evaluateWorker(async () => {
    const C = globalThis.FlowGoogleConfig;
    const res = await globalThis.FlowGoogleLane.write('googleLaneTask', {
      title: 'Scope probe',
      taskListId: 'glance-list',
      scopes: [C.SCOPE_TASKS, C.SCOPE_CALENDAR, C.SCOPE_DRIVE_FILE]
    });
    const bag = await chrome.storage.local.get('googleReconnect');
    return { res, reconnect: bag.googleReconnect };
  });
  expect(out.res && out.res.reason).toBe('missing-permission');
  expect(out.reconnect).toBeFalsy();
});
