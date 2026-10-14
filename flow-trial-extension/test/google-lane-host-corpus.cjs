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

  if (failures) {
    console.log('\n' + failures + ' failed');
    process.exit(1);
  }
  console.log('\nall passed');
}

main();
