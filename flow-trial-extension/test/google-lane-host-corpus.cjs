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
    storage: {
      local: {
        get: async () => ({ googleTasksAuth: { taskListId: 'glance-list' } })
      }
    }
  }
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

const cores = [
  'google-config.js', 'google-calendar.js', 'google-tasks.js', 'google-drive.js',
  'google-docs.js', 'google-sheets.js', 'google-contacts.js', 'google-compose.js', 'google-proof.js'
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
check('Draft reply sends flow:gmail-compose and a contacts lookup', /type: 'flow:gmail-compose'/.test(gmail) && /type: 'flow:google-contacts'/.test(gmail) && /gmailDraft: 'gmailCompose'/.test(gmail));
check('the card Undo sends flow:google-undo', /type: 'flow:google-undo'/.test(gmail));

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
  const SNAP = { headRevisionId: 'rev-1', version: '1', modifiedTime: '2026-10-15T00:00:00.000Z' };
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
    for (let i = 0; i < 8; i++) await Promise.resolve();
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
    const live = Object.assign({ id: 'file1', trashed: false }, SNAP, { version: '2' });
    return { ok: true, status: 200, text: async () => JSON.stringify(live) };
  };
  const versionRefused = await askUndo('googleDriveSave', driveRef);
  check('a version mismatch says the file was edited and does not trash', versionRefused.ok === false && versionRefused.reason === 'user-edited' && versionRefused.error === EDITED && versionCalls.length === 1 && versionCalls[0] === 'GET', versionRefused);

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

  if (failures) {
    console.log('\n' + failures + ' failed');
    process.exit(1);
  }
  console.log('\nall passed');
}

main();
