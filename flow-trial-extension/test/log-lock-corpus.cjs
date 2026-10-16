// Two open mails undo at once. Each page has its own copy of storage.js.
// The service worker grants flow:log-lock to one of them, so the later
// set() cannot put the other row back to Handled.
// Run: node test/log-lock-corpus.cjs

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const store = {};
const lock = { held: null, waiters: [] };

function release(port) {
  if (lock.held === port) lock.held = null;
  lock.waiters = lock.waiters.filter((p) => p !== port);
  grant();
}

function grant() {
  if (lock.held || !lock.waiters.length) return;
  const next = lock.waiters.shift();
  lock.held = next;
  setTimeout(() => {
    if (lock.held !== next) return;
    next.listeners.forEach((fn) => fn({ ok: true }));
  }, 0);
}

function connect(name) {
  const port = { name: name, listeners: [], disconnectFns: [] };
  port.onMessage = { addListener(fn) { port.listeners.push(fn); } };
  port.onDisconnect = { addListener(fn) { port.disconnectFns.push(fn); } };
  port.disconnect = () => release(port);
  if (name === 'glance-log-lock') {
    lock.waiters.push(port);
    grant();
  }
  return port;
}

function chromeStub(prefix) {
  let n = 0;
  return {
    storage: {
      local: {
        get: (keysWithDefaults, cb) => {
          const result = {};
          for (const k of Object.keys(keysWithDefaults)) {
            result[k] = Object.prototype.hasOwnProperty.call(store, k) ? store[k] : keysWithDefaults[k];
          }
          setTimeout(() => cb(JSON.parse(JSON.stringify(result))), 0);
        },
        set: (patch, cb) => {
          setTimeout(() => {
            Object.assign(store, JSON.parse(JSON.stringify(patch)));
            if (cb) cb();
          }, 0);
        }
      }
    },
    runtime: {
      id: 'ext',
      connect: (info) => connect(info && info.name),
      sendMessage: (msg, cb) => { if (cb) cb(undefined); }
    },
    crypto: { randomUUID: () => prefix + '-' + (++n) }
  };
}

function load(prefix) {
  const chrome = chromeStub(prefix);
  const sandbox = {
    module: undefined,
    console,
    chrome: chrome,
    crypto: chrome.crypto,
    setTimeout,
    clearTimeout
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'storage.js'), 'utf8'), sandbox, { filename: 'storage.js' });
  return vm.runInContext('FlowStorage', sandbox);
}

async function main() {
  const background = fs.readFileSync(path.join(__dirname, '..', 'src', 'background.js'), 'utf8');
  check('the service worker grants one log lock port at a time',
    background.indexOf("port.name !== 'glance-log-lock'") > 0 &&
    background.indexOf('function glanceLogLockGrant') > 0 &&
    background.indexOf('onDisconnect') > 0);

  store.log = [
    { ts: 3, kind: 'written', messageId: 'reply', connectorId: 'outlookDraft', label: 'Draft', app: 'outlook' },
    {
      ts: 2, kind: 'written', messageId: 'file', connectorId: 'attachmentSave', system: 'microsoft/onedrive',
      externalId: 'e2e-file-9', label: 'Save the file?', app: 'outlook'
    },
    {
      ts: 1, kind: 'written', messageId: 'dana', connectorId: 'outlookTask', system: 'microsoft/todo',
      externalId: 'e2e-todo-9', label: "I'll send Dana the numbers by Thursday.", app: 'outlook'
    }
  ];

  const danaPage = load('dana');
  const filePage = load('file');
  await Promise.all([
    danaPage.markMicrosoftTodoUndone('dana', { taskId: 'other-task' }, 'thread-dana'),
    filePage.markOnedriveFileUndone('file', { undo: [{ fileId: 'e2e-file-1' }], created: true }, 'thread-file')
  ]);

  const kinds = {};
  (store.log || []).forEach((row) => { if (row && row.messageId) kinds[row.messageId] = row.kind; });
  check('a task undo and a file undo both leave Activity without Handled',
    kinds.dana === 'undone' && kinds.file === 'undone' && kinds.reply === 'written', kinds);
  check('the draft row is still the only written row',
    (store.log || []).filter((row) => row && row.kind === 'written').length === 1);

  const again = load('again');
  store.log = [{
    ts: 1, kind: 'written', messageId: 'file-2', connectorId: 'attachmentSave',
    externalId: 'stored-file', label: 'Save the file?', app: 'outlook'
  }];
  await again.markOnedriveFileUndone('file-2', { fileId: 'undo-file' }, null);
  check('the same message flips a file row when the file ids differ',
    store.log[0] && store.log[0].kind === 'undone' && store.log[0].connectorId === 'attachmentSave');
}

main().then(() => {
  if (failures) {
    console.log('\n' + failures + ' failed');
    process.exit(1);
  }
  console.log('\nall passed');
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
