// CTO parity for the Google lane token. Loads the same files a node vm
// harness loads, with import lines stripped, and does not set __glanceE2e.
// Run: node test/auth-lane-146-corpus.cjs

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const EXT = path.join(__dirname, '..');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const STORED = 'ya29.stored-connect';
const LIST = 'glance-list';
const stored = {};
const fetches = [];
let authCalls = 0;
let lastDetails = null;

function resetFetches() {
  fetches.length = 0;
}

function jsonResponse(status, body) {
  const text = body == null ? '' : JSON.stringify(body);
  return { ok: status >= 200 && status < 300, status: status, text: async () => text };
}

const laneState = { task: null, event: null, file: null, doc: null };

function storedBearer() {
  const record = stored.googleWebAuth;
  const token = record && record.accessToken;
  return token ? 'Bearer ' + token : '';
}

function parseInit(init) {
  const raw = init && init.body;
  if (typeof raw !== 'string' || !raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

// 401 unless Authorization is exactly the stored Connect token.
async function laneFetch(url, init) {
  const method = (init && init.method) || 'GET';
  const headers = (init && init.headers) || {};
  const auth = headers.Authorization || '';
  fetches.push({ url: String(url), method: method, auth: auth });
  const expect = storedBearer();
  if (!expect || auth !== expect) return jsonResponse(401, { error: { code: 401 } });
  const u = String(url);
  const body = parseInit(init);
  if (u.indexOf('/tasks/v1/lists/') >= 0 && method === 'POST') {
    laneState.task = { id: 'task-1', title: (body && body.title) || '', notes: (body && body.notes) || '', due: (body && body.due) || '', status: 'needsAction' };
    return jsonResponse(200, laneState.task);
  }
  if (u.indexOf('/tasks/v1/lists/') >= 0 && method === 'GET') return jsonResponse(200, laneState.task || { id: 'task-1', title: 'Pay the invoice', status: 'needsAction' });
  if (u.indexOf('/tasks/v1/lists/') >= 0 && method === 'DELETE') {
    laneState.task = null;
    return jsonResponse(204, null);
  }
  if (u.indexOf('/calendar/v3/') >= 0 && method === 'POST') {
    laneState.event = Object.assign({ id: 'evt-1', status: 'confirmed', htmlLink: 'https://calendar.google.com/calendar/event?eid=evt-1' }, body || {});
    return jsonResponse(200, laneState.event);
  }
  if (u.indexOf('/calendar/v3/') >= 0 && method === 'GET') return jsonResponse(200, laneState.event || { id: 'evt-1', status: 'confirmed' });
  if (u.indexOf('/calendar/v3/') >= 0 && method === 'DELETE') {
    laneState.event = null;
    return jsonResponse(204, null);
  }
  if (u.indexOf('/upload/drive/v3/files') >= 0 && method === 'POST') {
    laneState.file = { id: 'file-1', name: 'note.txt', mimeType: 'text/plain', trashed: false, version: '3', modifiedTime: '2026-10-15T12:00:00.000Z', headRevisionId: 'rev-1', contentHash: 'abc' };
    return jsonResponse(200, laneState.file);
  }
  if (u.indexOf('www.googleapis.com/drive') >= 0 && u.indexOf('/files') >= 0 && method === 'POST') {
    const mime = body && body.mimeType;
    const id = mime === 'application/vnd.google-apps.document' ? 'doc-1' : 'file-1';
    const file = { id: id, name: (body && body.name) || 'Note', mimeType: mime || '', trashed: false, version: '3', modifiedTime: '2026-10-15T12:00:00.000Z', headRevisionId: 'rev-1' };
    if (id === 'doc-1') laneState.doc = { file: file, text: '', rangeName: '', namedRangeId: 'nr-1' };
    else laneState.file = file;
    return jsonResponse(200, file);
  }
  if (u.indexOf('www.googleapis.com/drive') >= 0 && method === 'GET') {
    const id = (u.match(/\/files\/([^/?]+)/) || [])[1];
    const file = [laneState.doc && laneState.doc.file, laneState.file].find((item) => item && item.id === id);
    return jsonResponse(200, file || { id: id || 'doc-1', name: 'Note', mimeType: 'application/vnd.google-apps.document', trashed: false, version: '3', modifiedTime: '2026-10-15T12:00:00.000Z', headRevisionId: 'rev-1' });
  }
  if (u.indexOf('www.googleapis.com/drive') >= 0 && method === 'PATCH') return jsonResponse(200, { trashed: true });
  if (u.indexOf(':batchUpdate') >= 0 && method === 'POST') {
    const requests = body && body.requests;
    const insert = requests && requests[0] && requests[0].insertText;
    const named = requests && requests[1] && requests[1].createNamedRange;
    if (laneState.doc && insert && named) {
      laneState.doc.text = insert.text || '';
      laneState.doc.rangeName = named.name || '';
    }
    return jsonResponse(200, {});
  }
  if (u.indexOf('docs.googleapis.com') >= 0 && method === 'GET') {
    const doc = laneState.doc || { text: '', rangeName: '', namedRangeId: 'nr-1' };
    const text = doc.text || '';
    const end = 1 + text.length;
    return jsonResponse(200, {
      body: { content: [{ paragraph: { elements: [{ startIndex: 1, endIndex: end, textRun: { content: text } }] } }] },
      namedRanges: doc.rangeName ? {
        [doc.rangeName]: { namedRanges: [{ namedRangeId: doc.namedRangeId, ranges: [{ startIndex: 1, endIndex: end }] }] }
      } : {}
    });
  }
  return jsonResponse(200, { id: 'ok-1' });
}

const sandbox = {
  module: undefined,
  console: console,
  URL: URL,
  URLSearchParams: URLSearchParams,
  Date: Date,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  AbortController: AbortController,
  TextEncoder: TextEncoder,
  Uint8Array: Uint8Array,
  atob: (s) => Buffer.from(s, 'base64').toString('binary'),
  fetch: laneFetch,
  chrome: {
    identity: {
      getAuthToken: (details, cb) => {
        authCalls += 1;
        lastDetails = details || null;
        sandbox.chrome.runtime.lastError = { message: 'The user is not signed in.' };
        if (typeof cb === 'function') cb('');
      }
    },
    runtime: {
      lastError: null,
      onMessage: { addListener: (fn) => { sandbox.chrome.runtime.listeners.push(fn); } },
      listeners: []
    },
    storage: {
      local: {
        get: (key) => Promise.resolve().then(() => {
          if (key == null) return Object.assign({}, stored);
          if (typeof key === 'string') return { [key]: stored[key] };
          if (Array.isArray(key)) {
            const out = {};
            key.forEach((k) => { out[k] = stored[k]; });
            return out;
          }
          if (typeof key === 'object') {
            const out = {};
            Object.keys(key).forEach((k) => { out[k] = stored[k] != null ? stored[k] : key[k]; });
            return out;
          }
          return {};
        }),
        set: (patch) => Promise.resolve().then(() => { Object.assign(stored, patch); }),
        remove: (keys) => Promise.resolve().then(() => {
          const list = Array.isArray(keys) ? keys : [keys];
          list.forEach((k) => { delete stored[k]; });
        })
      }
    },
    i18n: { getUILanguage: () => 'en' }
  }
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

const cores = [
  'google-config.js', 'google-account.js', 'google-calendar.js', 'google-tasks.js', 'google-drive.js',
  'google-docs.js', 'google-sheets.js', 'google-compose.js', 'google-drafts.js', 'google-proof.js'
];
for (const f of cores) {
  vm.runInContext(fs.readFileSync(path.join(EXT, 'core', f), 'utf8'), sandbox, { filename: f });
}
vm.runInContext(fs.readFileSync(path.join(EXT, 'src', 'google-lane.js'), 'utf8'), sandbox, { filename: 'google-lane.js' });
const hostFile = fs.readFileSync(path.join(EXT, 'src', 'google-lane-host.js'), 'utf8');
const hostSrc = hostFile.replace(/^import .*;$/gm, '');
vm.runInContext(hostSrc, sandbox, { filename: 'google-lane-host.js' });

function dispatch(connectorId, input) {
  return vm.runInContext('FlowGoogleLane', sandbox).dispatch({ type: 'flow:google-write', connectorId: connectorId, input: input });
}

function mutating(list) {
  return list.filter((c) => c.method === 'POST' || c.method === 'PUT' || c.method === 'PATCH' || c.method === 'DELETE');
}

const hostBodyStart = hostFile.indexOf('function storedConnectToken(') >= 0 ? hostFile.indexOf('function storedConnectToken(') : hostFile.indexOf('async function storedConnectToken(');
const hostBodyEnd = hostFile.indexOf('\nfunction ', hostBodyStart + 10);
const laneTokenSource = hostFile.slice(hostBodyStart, hostBodyEnd);
check('the stored Connect token reader names googleWebAuth', laneTokenSource.indexOf('googleWebAuth') >= 0, laneTokenSource.slice(0, 80));
check('laneToken does not read __glanceE2e', laneTokenSource.indexOf('__glanceE2e') < 0);
check('the host does not assign __glanceE2e', !/__glanceE2e\s*=/.test(hostFile));
check('the sandbox never gained an e2e hook', sandbox.__glanceE2e == null);

async function main() {
  const C = vm.runInContext('FlowGoogleConfig', sandbox);
  const scopes = [C.SCOPE_TASKS, C.SCOPE_CALENDAR, C.SCOPE_DRIVE_FILE];
  stored.googleWebAuth = { accessToken: STORED, expiresAt: Date.now() + 60 * 60 * 1000 };
  stored.googleTasksAuth = { taskListId: LIST };

  const before = authCalls;
  resetFetches();
  const task = await dispatch('googleLaneTask', { title: 'Pay the invoice', listId: LIST, scopes: scopes });
  const taskPost = fetches.filter((c) => c.method === 'POST' && c.url.indexOf('/tasks/v1/lists/' + LIST + '/tasks') >= 0);
  check('getAuthToken ran before the stored-token task write', authCalls > before && lastDetails && lastDetails.interactive === false, { authCalls, lastDetails });
  check('the task POST uses the stored Bearer and returns proof plus contentHash', task && task.ok === true && task.proof && task.proof.fetchedBack === true && task.ref && task.ref.contentHash && taskPost.length === 1 && taskPost[0].auth === 'Bearer ' + STORED, { task: task && { ok: task.ok, reason: task.reason, ref: task.ref }, taskPost });

  const holdBefore = authCalls;
  resetFetches();
  const hold = await dispatch('googleHold', {
    dateIso: '2026-10-20',
    hour: 10,
    minute: 0,
    fileUrl: 'https://drive.google.com/file/d/abc/view',
    fileName: 'quote.pdf',
    fileTerm: 'quote.pdf',
    scopes: scopes
  });
  const holdPost = fetches.filter((c) => c.method === 'POST' && c.url.indexOf('/calendar/v3/') >= 0);
  check('identity is asked again for the hold', authCalls > holdBefore);
  check('the calendar POST uses the stored Bearer and returns proof', hold && hold.ok === true && hold.proof && hold.proof.fetchedBack === true && holdPost.length === 1 && holdPost[0].auth === 'Bearer ' + STORED, { hold: hold && { ok: hold.ok, reason: hold.reason }, holdPost });

  const docBefore = authCalls;
  resetFetches();
  const doc = await dispatch('googleDoc', {
    title: 'Note',
    name: 'Note',
    text: 'Hello from Glance',
    body: 'Hello from Glance',
    scopes: scopes
  });
  const docCalls = fetches.filter((c) => c.url.indexOf('drive') >= 0 || c.url.indexOf('docs.googleapis') >= 0);
  check('identity is asked again for the doc', authCalls > docBefore);
  const docGets = docCalls.filter((c) => c.method === 'GET');
  check('Docs writes ok with proof and a read-back on the stored Bearer', doc && doc.ok === true && doc.proof && doc.proof.fetchedBack === true && docCalls.length > 0 && docGets.length > 0 && docCalls.every((c) => c.auth === 'Bearer ' + STORED), { doc: doc && { ok: doc.ok, reason: doc.reason, proof: doc.proof }, docCalls: docCalls.map((c) => c.method + ' ' + c.url) });

  resetFetches();
  const drive = await dispatch('googleDriveSave', {
    fileName: 'note.txt',
    mimeType: 'text/plain',
    base64: Buffer.from('a').toString('base64'),
    scopes: scopes
  });
  const driveCalls = fetches.filter((c) => c.url.indexOf('drive') >= 0 || c.url.indexOf('upload') >= 0);
  check('Drive writes ok with proof and a read-back on the stored Bearer', drive && drive.ok === true && drive.proof && drive.proof.fetchedBack === true && driveCalls.some((c) => c.method === 'POST') && driveCalls.some((c) => c.method === 'GET') && driveCalls.every((c) => c.auth === 'Bearer ' + STORED), { drive: drive && { ok: drive.ok, reason: drive.reason }, driveCalls: driveCalls.map((c) => c.method) });

  const listener = sandbox.chrome.runtime.listeners[0];
  resetFetches();
  const taskUndo = await new Promise((resolve) => {
    listener({ type: 'flow:google-undo', connectorId: 'googleLaneTask', ref: task.ref }, {}, resolve);
  });
  const undoCalls = fetches.slice();
  check('Undo GET and DELETE carry the stored Bearer', taskUndo && taskUndo.ok === true && undoCalls.some((c) => c.method === 'GET') && undoCalls.some((c) => c.method === 'DELETE') && undoCalls.every((c) => c.auth === 'Bearer ' + STORED), { taskUndo, undoCalls });

  const signedOut = sandbox.chrome.identity.getAuthToken;
  sandbox.chrome.identity.getAuthToken = (details, cb) => {
    authCalls += 1;
    lastDetails = details || null;
    sandbox.chrome.runtime.lastError = null;
    if (typeof cb === 'function') cb('ya29.not-the-stored-token');
  };
  resetFetches();
  const wrong = await dispatch('googleLaneTask', { title: 'Pay the invoice', listId: LIST, scopes: scopes });
  const wroteWith = fetches.filter((c) => c.url.indexOf('tasks.googleapis.com') >= 0);
  check('a Chrome token that is not the stored token is never the bearer of a write', wrong && wroteWith.length > 0 && wroteWith.every((c) => c.auth === 'Bearer ' + STORED), { wrong, fetches });
  delete stored.googleReconnect;
  sandbox.chrome.identity.getAuthToken = signedOut;

  const signedIn = laneView(stored.googleTasksAuth, null, STORED);
  check('Connected requires the grant and a usable token', signedIn.connected === true && signedIn.label === 'Connected', signedIn);

  console.log('\n--- empty identity and empty storage ---\n');
  delete stored.googleWebAuth;
  delete stored.googleTasksAuth;
  delete stored.googleReconnect;
  resetFetches();
  const denied = await dispatch('googleLaneTask', { title: 'Pay the invoice', listId: LIST, scopes: scopes });
  const writes = mutating(fetches);
  const bearers = fetches.filter((c) => c.auth);
  const emptyStatus = laneView(stored.googleTasksAuth, stored.googleReconnect, '');
  check('an empty identity writes nothing', denied && denied.ok !== true && denied.reason === 'not-connected' && writes.length === 0 && bearers.length === 0, { denied, fetches });
  check('empty storage is not Connected', emptyStatus.connected === false && emptyStatus.label !== 'Connected', emptyStatus);

  console.log('\n--- 401 reconnect ---\n');
  stored.googleTasksAuth = { taskListId: LIST };
  stored.googleWebAuth = { accessToken: STORED, expiresAt: Date.now() + 60 * 60 * 1000 };
  sandbox.fetch = async (url, init) => {
    const method = (init && init.method) || 'GET';
    fetches.push({ url: String(url), method: method, auth: (init && init.headers && init.headers.Authorization) || '' });
    return jsonResponse(401, { error: { code: 401 } });
  };
  resetFetches();
  const rejected = await dispatch('googleLaneTask', { title: 'Pay the invoice', listId: LIST, scopes: scopes });
  const after = laneView(stored.googleTasksAuth, stored.googleReconnect, STORED);
  check('a 401 shows reconnect and Connected is gone', rejected && rejected.ok === false && rejected.reason === 'not-connected' && stored.googleReconnect && stored.googleReconnect.needed === true && after.connected === false && after.needsReconnect === true && after.label === 'Reconnect Google', { rejected, flag: stored.googleReconnect, after });

  delete stored.googleTasksAuth;
  delete stored.googleReconnect;
  delete stored.googleEverConnected;
  delete stored.googleWebAuth;
  delete stored.glanceLaneUndo;
  resetFetches();
  const noGrant = await dispatch('googleLaneTask', { title: 'Pay the invoice', listId: LIST, scopes: scopes });
  const noGrantView = laneView(stored.googleTasksAuth, stored.googleReconnect, STORED, stored.googleEverConnected);
  check('a 401 with no grant and no Connect is Connect', noGrant && noGrant.ok === false && !stored.googleReconnect && noGrantView.connected === false && noGrantView.needsReconnect === false && noGrantView.label === 'Connect Google', { noGrant, noGrantView });

  stored.googleEverConnected = { connected: true };
  delete stored.googleReconnect;
  resetFetches();
  const again = await dispatch('googleLaneTask', { title: 'Pay the invoice', listId: LIST, scopes: scopes });
  const againView = laneView(stored.googleTasksAuth, stored.googleReconnect, STORED, stored.googleEverConnected);
  check('a 401 after a successful Connect is Reconnect', again && again.ok === false && stored.googleReconnect && stored.googleReconnect.needed === true && againView.needsReconnect === true && againView.label === 'Reconnect Google', { again, againView });

  console.log('\n--- Hebrew refusal ---\n');
  stored.googleWebAuth = { accessToken: STORED, expiresAt: Date.now() + 60 * 60 * 1000 };
  sandbox.fetch = async () => jsonResponse(200, { id: 'file-he', modifiedTime: '2026-10-15T00:00:00.000Z' });
  sandbox.chrome.i18n.getUILanguage = () => 'he';
  const HE = 'לא הצלחתי לאמת שלא השתנה — השארתי אותו כמו שהוא';
  const hebrew = await new Promise((resolve) => {
    listener({
      type: 'flow:google-undo',
      connectorId: 'googleDriveSave',
      ref: { fileId: 'file-he', externalId: 'file-he', created: true, snapshot: { modifiedTime: '2026-10-15T00:00:00.000Z' } }
    }, {}, resolve);
  });
  check('Hebrew UI uses the Hebrew undo refusal', hebrew && hebrew.reason === 'unconfirmed' && hebrew.error === HE && hebrew.written === HE, hebrew);

  if (failures) {
    console.log('\n' + failures + ' failed');
    process.exit(1);
  }
  console.log('\nall passed');
}

function laneView(auth, reconnect, token, ever) {
  return vm.runInContext('laneGoogleStatus', sandbox)(auth, reconnect, token, ever);
}

main();
