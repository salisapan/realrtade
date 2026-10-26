// The lane host registers handlers and injects fetch, and it does not
// call the network while the service worker is starting. A later write
// uses chrome.identity and a real fetch. Run: node test/google-lane-host-corpus.cjs

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const EXT = path.join(__dirname, '..');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const fetches = [];
let authCalls = 0;
const listeners = [];
const stored = { googleTasksAuth: { taskListId: 'glance-list' }, googleConnectedAccount: { email: 'host@example.com' } };
const sandbox = {
  module: undefined,
  console,
  atob: (s) => Buffer.from(s, 'base64').toString('binary'),
  TextEncoder,
  Uint8Array,
  Date,
  setTimeout,
  clearTimeout,
  AbortController,
  URL,
  fetch: async (url, init) => {
    fetches.push({ url: String(url), init: init || {} });
    const body = JSON.stringify({ id: 'e2e-gtask-1', title: 'Pay the invoice', status: 'needsAction' });
    return { ok: true, status: 200, text: async () => body };
  },
  chrome: {
    identity: {
      getAuthToken: (details, cb) => {
        authCalls += 1;
        sandbox.chrome.identity.last = details || null;
        if (typeof cb === 'function') cb('ya29.host');
      }
    },
    runtime: {
      onMessage: { addListener: (fn) => { listeners.push(fn); } },
      lastError: null
    },
    i18n: { getUILanguage: () => 'en' },
    storage: {
      local: {
        get: async (key) => {
          if (typeof key === 'string') return { [key]: stored[key] };
          if (Array.isArray(key)) {
            const out = {};
            key.forEach((k) => { out[k] = stored[k]; });
            return out;
          }
          return Object.assign({}, stored);
        },
        set: async (patch) => { Object.assign(stored, patch); },
        remove: async (keys) => {
          const list = Array.isArray(keys) ? keys : [keys];
          list.forEach((k) => { delete stored[k]; });
        }
      }
    }
  }
};
// The account probe (Gmail profile) is answered here for every fetch the
// checks below install, so the counted calls are the lane's own.
{
  let inner = sandbox.fetch;
  const userinfo = /\/oauth2\/v[0-9]+\/userinfo/;
  const answer = { ok: true, status: 200, text: async () => '{"email":"host@example.com"}', json: async () => ({ email: 'host@example.com' }) };
  Object.defineProperty(sandbox, 'fetch', {
    configurable: true,
    get: () => (url, init) => (userinfo.test(String(url)) ? Promise.resolve(answer) : inner(url, init)),
    set: (fn) => { inner = fn; }
  });
}
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

const cores = [
  'google-config.js', 'google-account.js', 'google-calendar.js', 'google-tasks.js', 'google-drive.js',
  'google-docs.js', 'google-sheets.js', 'google-compose.js', 'google-proof.js'
];
for (const f of cores) {
  vm.runInContext(fs.readFileSync(path.join(EXT, 'core', f), 'utf8'), sandbox, { filename: f });
}
vm.runInContext(fs.readFileSync(path.join(EXT, 'src', 'google-lane.js'), 'utf8'), sandbox, { filename: 'google-lane.js' });

const hostSrc = fs.readFileSync(path.join(EXT, 'src', 'google-lane-host.js'), 'utf8')
  .replace(/^import .*;$/gm, '');
vm.runInContext(hostSrc, sandbox, { filename: 'google-lane-host.js' });

check('startup does not call fetch', fetches.length === 0, fetches.length);
check('startup does not call getAuthToken', authCalls === 0, authCalls);
check('startup registers one listener', listeners.length === 1, listeners.length);
check('startup injected http', vm.runInContext('FlowGoogleLane', sandbox) && fetches.length === 0);

const bg = fs.readFileSync(path.join(EXT, 'src', 'background.js'), 'utf8');
const imports = bg.match(/import '\.\/google-lane-host\.js';/g) || [];
check('background.js imports the lane host once', imports.length === 1, imports.length);

const gmail = fs.readFileSync(path.join(EXT, 'src', 'content-gmail.js'), 'utf8');
check('Hold It, Task, Save file, Doc and Sheet send flow:google-write', /type: 'flow:google-write'/.test(gmail) && /googleHold:/.test(gmail) === false && /calendar: 'googleHold'/.test(gmail) && /googleTask: 'googleLaneTask'/.test(gmail) && /driveFile: 'googleDriveSave'/.test(gmail) && /driveDoc: 'googleDoc'/.test(gmail) && /driveSheet: 'googleSheetAppend'/.test(gmail));
check('Draft reply uses flow:gmail-compose in the compose window only (no Gmail drafts API, no contacts lookup, no contacts scope)', /type: 'flow:gmail-compose'/.test(gmail) && !/flow:google-contacts/.test(gmail) && !/googleReplyDraft/.test(gmail) && /gmailDraft: 'gmailCompose'/.test(gmail) && /reason: 'compose-closed'/.test(gmail));
check('the card Undo sends flow:google-undo', /type: 'flow:google-undo'/.test(gmail));

const manifest = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
const hosts = manifest.host_permissions || [];
check('the Drive save redirect host is a required host permission, and it is the only googleusercontent one', hosts.indexOf('https://*.googleusercontent.com/*') >= 0 && hosts.filter((h) => /googleusercontent/.test(h)).length === 1, hosts);
check('the attachment fetch runs in the worker and follows the redirect', /flow:fetch-attachment/.test(fs.readFileSync(path.join(EXT, 'src', 'google-lane-host.js'), 'utf8')) && /redirect: 'follow'/.test(fs.readFileSync(path.join(EXT, 'src', 'google-lane-host.js'), 'utf8')) && /type: 'flow:fetch-attachment'/.test(gmail));
const store = fs.readFileSync(path.join(EXT, 'docs', 'chrome-web-store-submission.md'), 'utf8');
check('the store submission explains the googleusercontent host', /host_permissions: https:\/\/\*\.googleusercontent\.com\/\*/.test(store));

const popup = fs.readFileSync(path.join(EXT, 'popup', 'popup.js'), 'utf8');
check('the panel Undo sends flow:google-undo', /type: 'flow:google-undo'/.test(popup));

async function main() {
  const ignored = listeners[0]({ type: 'flow:execute-action', payload: {} }, {}, () => {});
  check('the host leaves flow:execute-action to the service worker', ignored == null, ignored);

  const written = await new Promise((resolve) => {
    listeners[0]({
      type: 'flow:google-write',
      connectorId: 'googleLaneTask',
      input: { label: 'Pay the invoice' }
    }, {}, resolve);
  });
  check('a write after startup calls getAuthToken', authCalls >= 1, authCalls);
  check('that token ask is not interactive', sandbox.chrome.identity.last && sandbox.chrome.identity.last.interactive === false, sandbox.chrome.identity.last);
  check('a write calls fetch, not the status-0 stub', fetches.length >= 2 && written && written.ok === true && written.proof && written.proof.fetchedBack === true, { fetches: fetches.length, written: written && written.ok, reason: written && written.reason });
  check('the request is the Tasks API with the stored list and a bearer token', fetches.some((c) => c.url.indexOf('https://tasks.googleapis.com/tasks/v1/lists/glance-list/tasks') >= 0 && c.init.headers && c.init.headers.Authorization === 'Bearer ya29.host'), fetches.map((c) => c.url));
  check('the read-back is a GET of the created task', fetches.some((c) => c.init.method === 'GET' && /\/tasks\/e2e-gtask-1$/.test(c.url)));

  const CONFIRM = "Couldn't confirm it's unchanged. Undo left it alone.";
  const EDITED = 'You edited this. Undo left it alone.';
  const SNAP = { headRevisionId: 'rev-1', version: '1', modifiedTime: '2026-10-15T00:00:00.000Z', md5Checksum: 'a'.repeat(32) };
  const driveRef = {
    fileId: 'file1',
    externalId: 'file1',
    created: true,
    snapshot: SNAP
  };

  function askUndo(connectorId, ref) {
    return new Promise((resolve) => {
      listeners[0]({ type: 'flow:google-undo', connectorId: connectorId, ref: ref }, {}, resolve);
    });
  }

  async function flush() {
    for (let i = 0; i < 400; i++) await Promise.resolve();
  }

  const matchBody = JSON.stringify(Object.assign({ id: 'file1', trashed: false }, SNAP));
  const matched = [];
  sandbox.fetch = async (url, init) => {
    matched.push({ method: (init && init.method) || 'GET', url: String(url) });
    const body = (init && init.method) === 'PATCH' ? '{"trashed":true}' : matchBody;
    return { ok: true, status: 200, text: async () => body };
  };
  const driveGone = await askUndo('googleDriveSave', driveRef);
  check('a matching Drive snapshot trashes the file', driveGone.ok === true && matched.some((c) => c.method === 'PATCH') && matched[0].method === 'GET', driveGone);

  const versionCalls = [];
  sandbox.fetch = async (url, init) => {
    versionCalls.push((init && init.method) || 'GET');
    const live = Object.assign({ id: 'file1', trashed: false }, SNAP, { version: '2', headRevisionId: 'rev-2', modifiedTime: '2026-10-15T00:05:00.000Z' });
    return { ok: true, status: 200, text: async () => JSON.stringify(live) };
  };
  const versionBumped = await askUndo('googleDriveSave', driveRef);
  check('a version bump with the same md5Checksum still trashes the file', versionBumped.ok === true && versionCalls[0] === 'GET' && versionCalls.indexOf('PATCH') >= 0, versionBumped);

  const editCalls = [];
  sandbox.fetch = async (url, init) => {
    editCalls.push((init && init.method) || 'GET');
    const live = Object.assign({ id: 'file1', trashed: false }, SNAP, { md5Checksum: 'b'.repeat(32), version: '2' });
    return { ok: true, status: 200, text: async () => JSON.stringify(live) };
  };
  const versionRefused = await askUndo('googleDriveSave', driveRef);
  check('a changed md5Checksum says the file was edited and does not trash', versionRefused.ok === false && versionRefused.reason === 'user-edited' && versionRefused.error === EDITED && editCalls.length === 1 && editCalls[0] === 'GET', versionRefused);

  const timeCalls = [];
  sandbox.fetch = async (url, init) => {
    timeCalls.push((init && init.method) || 'GET');
    const live = { id: 'file1', trashed: false, headRevisionId: 'rev-1', modifiedTime: SNAP.modifiedTime };
    return { ok: true, status: 200, text: async () => JSON.stringify(live) };
  };
  const timeRef = Object.assign({}, driveRef, { snapshot: { headRevisionId: 'rev-1', modifiedTime: SNAP.modifiedTime } });
  const timeRefused = await askUndo('googleDriveSave', timeRef);
  check('a modifiedTime match with no version says undo could not confirm and does not trash', timeRefused.ok === false && timeRefused.reason === 'unconfirmed' && timeRefused.error === CONFIRM && timeCalls.length === 1, timeRefused);

  const savedTimer = sandbox.setTimeout;
  const savedClear = sandbox.clearTimeout;
  const pendingTimers = [];
  sandbox.setTimeout = (fn, ms) => {
    if (ms >= 8000) {
      pendingTimers.push(fn);
      return pendingTimers.length;
    }
    return savedTimer(fn, ms);
  };
  sandbox.clearTimeout = (id) => {
    if (typeof id === 'number' && id > 0 && id <= pendingTimers.length) {
      pendingTimers[id - 1] = null;
      return;
    }
    return savedClear(id);
  };

  async function hungUndo(connectorId, ref) {
    const calls = [];
    let late = null;
    let signal = null;
    sandbox.fetch = (url, init) => {
      const method = (init && init.method) || 'GET';
      calls.push(method);
      if (method !== 'GET') {
        return Promise.resolve({ ok: true, status: 200, text: async () => '{"trashed":true}' });
      }
      signal = init && init.signal;
      return new Promise((resolve) => {
        late = () => resolve({ ok: true, status: 200, text: async () => matchBody });
      });
    };
    const pending = askUndo(connectorId, ref);
    await flush();
    const timer = pendingTimers.shift();
    check(connectorId + ' arms an 8s verify timer', typeof timer === 'function', pendingTimers.length);
    if (typeof timer === 'function') timer();
    const result = await Promise.race([
      pending,
      new Promise((resolve) => savedTimer(() => resolve({ hung: true }), 500))
    ]);
    if (typeof late === 'function') late();
    await flush();
    return { result: result, calls: calls, signal: signal };
  }

  const driveHung = await hungUndo('googleDriveSave', driveRef);
  check('an 8s Drive verify timeout refuses and does not trash', driveHung.result && driveHung.result.ok === false && driveHung.result.reason === 'unconfirmed' && driveHung.result.error === CONFIRM && driveHung.result.hung !== true && driveHung.calls.indexOf('PATCH') < 0 && driveHung.calls.indexOf('DELETE') < 0, driveHung);
  check('a late Drive response after the timeout does not trash', driveHung.signal && driveHung.signal.aborted === true && driveHung.calls.filter((m) => m !== 'GET').length === 0, driveHung.calls);

  const docHung = await hungUndo('googleDoc', { documentId: 'doc1', externalId: 'doc1', created: true, snapshot: SNAP });
  check('an 8s Doc verify timeout refuses and a late response does not trash', docHung.result && docHung.result.reason === 'unconfirmed' && docHung.result.error === CONFIRM && docHung.calls.indexOf('PATCH') < 0 && docHung.signal && docHung.signal.aborted === true, docHung);

  const sheetHung = await hungUndo('googleSheetAppend', {
    spreadsheetId: 'sheet1',
    externalId: 'sheet1!Sheet1!A1:B1',
    updatedRange: 'Sheet1!A1:B1',
    created: true,
    row: ['Ada', '100'],
    snapshot: SNAP
  });
  check('an 8s Sheet verify timeout refuses and a late response does not trash', sheetHung.result && sheetHung.result.reason === 'unconfirmed' && sheetHung.result.error === CONFIRM && sheetHung.calls.indexOf('PATCH') < 0 && sheetHung.calls.indexOf('POST') < 0 && sheetHung.signal && sheetHung.signal.aborted === true, sheetHung);

  sandbox.setTimeout = savedTimer;
  sandbox.clearTimeout = savedClear;

  const HE = 'לא הצלחתי לאמת שלא השתנה — השארתי אותו כמו שהוא';
  sandbox.fetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ id: 'file-he', modifiedTime: SNAP.modifiedTime }) });
  sandbox.chrome.i18n.getUILanguage = () => 'he';
  const hebrew = await askUndo('googleDriveSave', { fileId: 'file-he', externalId: 'file-he', created: true, snapshot: { modifiedTime: SNAP.modifiedTime } });
  check('Hebrew UI refuses an unconfirmed undo in Hebrew', hebrew.ok === false && hebrew.reason === 'unconfirmed' && hebrew.error === HE && hebrew.written === HE, hebrew);
  sandbox.chrome.i18n.getUILanguage = () => 'en';
  const english = await askUndo('googleDriveSave', { fileId: 'file-en', externalId: 'file-en', created: true, snapshot: { modifiedTime: SNAP.modifiedTime } });
  check('English UI keeps the English refusal', english.error === CONFIRM && english.written === CONFIRM, english);

  const beforeAuth = authCalls;
  stored.googleWebAuth = { accessToken: 'ya29.stored', expiresAt: Date.now() + 60 * 60 * 1000 };
  sandbox.chrome.identity.getAuthToken = (details, cb) => {
    authCalls += 1;
    sandbox.chrome.runtime.lastError = { message: 'The user is not signed in.' };
    if (typeof cb === 'function') cb('');
    sandbox.chrome.runtime.lastError = null;
  };
  const storedFetches = [];
  sandbox.fetch = async (url, init) => {
    storedFetches.push({ url: String(url), auth: init && init.headers && init.headers.Authorization });
    const body = JSON.stringify({ id: 'e2e-gtask-stored', title: 'Pay the invoice', status: 'needsAction' });
    return { ok: true, status: 200, text: async () => body };
  };
  const storedWrite = await new Promise((resolve) => {
    listeners[0]({
      type: 'flow:google-write',
      connectorId: 'googleLaneTask',
      input: { label: 'Pay the invoice' }
    }, {}, resolve);
  });
  check('identity is tried first and a signed-out call uses the stored Connect token', storedWrite && storedWrite.ok === true && authCalls > beforeAuth && storedFetches.some((c) => c.auth === 'Bearer ya29.stored'), { ok: storedWrite && storedWrite.ok, authCalls, beforeAuth, storedFetches });

  delete stored.googleWebAuth;
  delete stored.googleReconnect;
  sandbox.chrome.identity.getAuthToken = (details, cb) => {
    authCalls += 1;
    if (typeof cb === 'function') cb('ya29.host');
  };
  sandbox.fetch = async () => ({ ok: false, status: 401, text: async () => '{"error":{"code":401}}' });
  const denied = await new Promise((resolve) => {
    listeners[0]({
      type: 'flow:google-write',
      connectorId: 'googleLaneTask',
      input: { label: 'Pay the invoice' }
    }, {}, resolve);
  });
  const view = vm.runInContext('laneGoogleStatus', sandbox)(stored.googleTasksAuth, stored.googleReconnect, 'ya29.host');
  check('a 401 write switches Google to reconnect and Connected is gone', denied && denied.ok === false && denied.needsReconnect === true && denied.reconnectLabel === 'Reconnect Google' && view.connected === false && view.needsReconnect === true && view.label === 'Reconnect Google' && view.label !== 'Connected', { denied, view, flag: stored.googleReconnect });

  sandbox.chrome.i18n.getUILanguage = () => 'he';
  const hebrewDenied = await new Promise((resolve) => {
    listeners[0]({
      type: 'flow:google-write',
      connectorId: 'googleLaneTask',
      input: { label: 'Pay the invoice' }
    }, {}, resolve);
  });
  const hebrewView = vm.runInContext('laneGoogleStatus', sandbox)(stored.googleTasksAuth, stored.googleReconnect, 'ya29.host');
  check('a 401 reconnect label follows a Hebrew UI', hebrewDenied && hebrewDenied.reconnectLabel === 'חבר מחדש את Google' && hebrewView.label === 'חבר מחדש את Google' && hebrewView.connected === false, { hebrewDenied, hebrewView });
  sandbox.chrome.i18n.getUILanguage = () => 'en';

  delete stored.googleTasksAuth;
  delete stored.googleReconnect;
  delete stored.googleEverConnected;
  delete stored.googleWebAuth;
  delete stored.glanceLaneUndo;
  const noGrant = await new Promise((resolve) => {
    listeners[0]({
      type: 'flow:google-write',
      connectorId: 'googleLaneTask',
      input: { label: 'Pay the invoice', taskListId: 'glance-list' }
    }, {}, resolve);
  });
  const noGrantView = vm.runInContext('laneGoogleStatus', sandbox)(stored.googleTasksAuth, stored.googleReconnect, 'ya29.host', stored.googleEverConnected);
  check('a 401 with no grant and no Connect is Connect', noGrant && noGrant.ok === false && !stored.googleReconnect && noGrant.needsReconnect !== true && noGrantView.connected === false && noGrantView.needsReconnect === false && noGrantView.label === 'Connect Google', { noGrant, noGrantView, flag: stored.googleReconnect });

  stored.googleEverConnected = { connected: true };
  delete stored.googleReconnect;
  const again = await new Promise((resolve) => {
    listeners[0]({
      type: 'flow:google-write',
      connectorId: 'googleLaneTask',
      input: { label: 'Pay the invoice', taskListId: 'glance-list' }
    }, {}, resolve);
  });
  const againView = vm.runInContext('laneGoogleStatus', sandbox)(stored.googleTasksAuth, stored.googleReconnect, 'ya29.host', stored.googleEverConnected);
  check('a 401 after a successful Connect is Reconnect', again && again.ok === false && stored.googleReconnect && stored.googleReconnect.needed === true && again.needsReconnect === true && againView.connected === false && againView.needsReconnect === true && againView.label === 'Reconnect Google', { again, againView, flag: stored.googleReconnect });

  stored.googleTasksAuth = { taskListId: 'glance-list' };
  delete stored.googleReconnect;
  sandbox.chrome.i18n.getUILanguage = () => 'en';
  sandbox.chrome.identity.getAuthToken = (details, cb) => {
    if (typeof cb === 'function') cb('ya29.host');
  };
  const stickyFetches = [];
  sandbox.fetch = async (url, init) => {
    const u = String(url);
    stickyFetches.push({ url: u, method: (init && init.method) || 'GET' });
    if (u.indexOf('tasks.googleapis.com') >= 0) {
      return { ok: false, status: 401, text: async () => '{"error":{"code":401}}' };
    }
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        id: 'evt-sticky',
        status: 'confirmed',
        summary: 'פגישה',
        start: { dateTime: '2026-10-22T11:00:00Z', timeZone: 'Asia/Jerusalem' },
        end: { dateTime: '2026-10-22T11:30:00Z', timeZone: 'Asia/Jerusalem' },
        htmlLink: 'https://calendar.google.com/calendar/event?eid=evt-sticky'
      })
    };
  };
  const taskDenied = await new Promise((resolve) => {
    listeners[0]({
      type: 'flow:google-write',
      connectorId: 'googleLaneTask',
      input: { label: 'Pay the invoice', taskListId: 'glance-list' }
    }, {}, resolve);
  });
  const calendarOk = await new Promise((resolve) => {
    listeners[0]({
      type: 'flow:google-write',
      connectorId: 'googleHold',
      input: {
        dateIso: '2026-10-22',
        hour: 14,
        minute: 0,
        title: 'פגישה',
        quote: 'פגישה ביום חמישי 22/10 בשעה 14:00',
        timeZone: 'Asia/Jerusalem'
      }
    }, {}, resolve);
  });
  const stickyView = vm.runInContext('laneGoogleStatus', sandbox)(stored.googleTasksAuth, stored.googleReconnect, 'ya29.host');
  const calendarPosts = stickyFetches.filter((c) => c.method === 'POST' && c.url.indexOf('/calendar/v3/calendars/primary/events') >= 0);
  check('a Task 401 then a Calendar write stays reconnect and writes nothing else', taskDenied && taskDenied.ok === false && calendarOk && calendarOk.ok === false && calendarOk.reason === 'not-connected' && stored.googleReconnect && stored.googleReconnect.needed === true && stickyView.connected === false && stickyView.needsReconnect === true && stickyView.label === 'Reconnect Google' && stickyView.label !== 'Connected' && calendarPosts.length === 0, { taskDenied, calendarOk: calendarOk && { ok: calendarOk.ok, reason: calendarOk.reason }, flag: stored.googleReconnect, stickyView, posts: calendarPosts.length });
  check('a later success does not call noteGoogleAuthOk', hostSrc.indexOf('if (res.ok) return noteGoogleAuthOk()') < 0);
  check('a 2xx in the service worker does not clear reconnect', bg.indexOf('else if (res.ok) await clearGoogleReconnect()') < 0 && bg.indexOf('await clearGoogleReconnect()') > 0);

  const popup = fs.readFileSync(path.join(EXT, 'popup', 'popup.js'), 'utf8');
  const connectedBadge = popup.indexOf("badge on', 'מחובר'");
  check('panel, Setup, and popup render the shared reconnect label', popup.indexOf('st.needsReconnect') > 0 && popup.indexOf('st.reconnectLabel') > 0 && connectedBadge > 0 && popup.indexOf('needsReconnect') < connectedBadge);
  check('a lane warning is not the Connected header', popup.indexOf('status[k].warning') > 0 && popup.indexOf('warningLabel') > 0 && popup.indexOf('googleLaneWarning') > 0);

  delete stored.googleTasksAuth;
  delete stored.googleEverConnected;
  delete stored.googleReconnect;
  delete stored.glanceLaneUndo;
  stored.googleWebAuth = { accessToken: 'ya29.old', expiresAt: Date.now() + 60 * 60 * 1000 };
  const oldView = vm.runInContext('laneGoogleStatus', sandbox)(null, null, '', null, { webAuth: stored.googleWebAuth });
  check('an old web token with no marker shows Reconnect', oldView.connected === false && oldView.needsReconnect === true && oldView.label === 'Reconnect Google', oldView);
  delete stored.googleWebAuth;
  const cleanView = vm.runInContext('laneGoogleStatus', sandbox)(null, null, '', null, {});
  check('a clean state shows Connect', cleanView.connected === false && cleanView.needsReconnect === false && cleanView.label === 'Connect Google', cleanView);

  if (failures) {
    console.log('\n' + failures + ' failed');
    process.exit(1);
  }
  console.log('\nall passed');
}

main();
