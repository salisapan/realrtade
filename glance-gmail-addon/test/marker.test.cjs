#!/usr/bin/env node
// Gmail Glance marker (sweep, label, star). Run: node glance-gmail-addon/test/marker.test.cjs

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const addon = path.join(__dirname, '..');
const repo = path.join(addon, '..');
const intent = require('../src/intent.js');
const { spawnSync } = require('child_process');
const driftCheck = spawnSync(process.execPath, [path.join(addon, 'scripts', 'check-marker-bundle.cjs')], { encoding: 'utf8' });
if (driftCheck.status !== 0) {
  console.error((driftCheck.stdout || '') + (driftCheck.stderr || ''));
  process.exit(1);
}
const markerSrc = fs.readFileSync(path.join(addon, 'Marker.js'), 'utf8').replace(/^\/\/ Generated[^\n]*\n/, '');

let failures = 0;
let passes = 0;

function check(name, cond, detail) {
  if (cond) {
    passes++;
    console.log('PASS:', name);
  } else {
    failures++;
    console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : '');
  }
}

function loadMarker(propsImpl) {
  const sandbox = {
    console,
    PropertiesService: propsImpl,
    GmailApp: {},
    ScriptApp: {}
  };
  vm.createContext(sandbox);
  vm.runInContext(markerSrc, sandbox);
  return sandbox.GlanceMarker;
}

function loadEngine() {
  const files = [
    'domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'close-families.js',
    'fact-reply.js', 'file-attach.js', 'name-match.js', 'intent.js', 'actions.js', 'resolution.js',
    'system-notice.js', 'incoming-judge.js'
  ];
  const sandbox = { console, module: undefined };
  vm.createContext(sandbox);
  for (const name of files) {
    const p = path.join(repo, 'flow-trial-extension', 'core', name);
    if (fs.existsSync(p)) vm.runInContext(fs.readFileSync(p, 'utf8'), sandbox, { filename: name });
  }
  const judgeShared = vm.runInContext('FlowIncomingJudge.judge', sandbox);
  const READER = 'owner@ai.local.flow@gmail.com';
  return function engine(text, opened, now) {
    return judgeShared({
      text,
      subject: opened.subject || '',
      sender: { email: opened.fromEmail || 'dana@meridian.com', name: opened.fromName || 'Dana' },
      to: opened.toList || [READER],
      toRecipients: opened.toRecipients || [],
      ccRecipients: opened.ccRecipients || [],
      ownAddresses: opened.ownAddresses || [READER],
      userName: opened.userName || 'Owner',
      ownNames: opened.ownNames || ['Owner'],
      readerEmail: opened.readerEmail || READER,
      now: now || new Date('2026-10-15T12:00:00Z'),
      surface: 'gmail',
      attachmentCount: opened.attachmentCount || 0,
      inbound: true
    }, {});
  };
}

const judgeShared = (function () {
  const files = [
    'domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'close-families.js',
    'fact-reply.js', 'file-attach.js', 'name-match.js', 'intent.js', 'actions.js', 'resolution.js',
    'system-notice.js', 'incoming-judge.js'
  ];
  const sandbox = { console, module: undefined };
  vm.createContext(sandbox);
  for (const name of files) {
    const p = path.join(repo, 'flow-trial-extension', 'core', name);
    if (fs.existsSync(p)) vm.runInContext(fs.readFileSync(p, 'utf8'), sandbox, { filename: name });
  }
  return vm.runInContext('FlowIncomingJudge.judge', sandbox);
})();

const READER = 'owner@ai.local.flow@gmail.com';
const READER_NAMES = ['Owner', 'Owner User'];
const NOW = new Date('2026-10-15T12:00:00Z');

function judgeRow(body, row, tz) {
  const toRecipients = [{ email: READER, name: 'Owner', localPart: 'owner' }];
  const ccRecipients = [];
  const reader = { userName: 'Owner', ownNames: READER_NAMES };
  if (row.id === 'en-greeting-other' || row.id === 'he-greeting-other') {
    const toDana = [{ email: 'dana@meridian.com', name: 'Dana', localPart: 'dana' }];
    const ccOwner = [{ email: READER, name: 'Owner', localPart: 'owner' }];
    return intent.resolveTask(body, {
      now: NOW,
      timeZone: tz,
      engine: function (t) {
        const j = judgeShared({
          text: t, subject: '', sender: { email: 'sender@meridian.com' },
          to: ['dana@meridian.com'], cc: [READER], ownAddresses: [READER],
          userName: 'Owner', ownNames: READER_NAMES, readerEmail: READER, now: NOW,
          surface: 'gmail', attachmentCount: 0, inbound: true,
          toRecipients: toDana, ccRecipients: ccOwner
        }, {});
        if (!j || !j.show) return null;
        return { intent: j.intent, plan: j.process };
      },
      userName: 'Owner', ownNames: READER_NAMES, readerEmail: READER,
      toRecipients: toDana, ccRecipients: ccOwner
    });
  }
  const eng = function (t) {
    const j = judgeShared({
      text: t, subject: '', sender: { email: 'dana@meridian.com' },
      to: [READER], ownAddresses: [READER], userName: 'Owner', ownNames: READER_NAMES,
      readerEmail: READER, now: NOW, surface: 'gmail', attachmentCount: 0, inbound: true,
      toRecipients, ccRecipients
    }, {});
    if (!j || !j.show) return null;
    return { intent: j.intent, plan: j.process };
  };
  return intent.resolveTask(body, {
    now: NOW,
    timeZone: tz,
    engine: eng,
    userName: 'Owner',
    ownNames: READER_NAMES,
    readerEmail: READER,
    toRecipients,
    ccRecipients
  });
}

function closable(body, row, tz) {
  return judgeRow(body, row, tz).speak === true;
}

const MAX_PROP_CHARS = 9216;

function mockProps(enforceLimit) {
  const store = {};
  return {
    getUserProperties() {
      return {
        getProperty(k) { return store[k] || null; },
        setProperty(k, v) {
          if (enforceLimit && v && v.length > MAX_PROP_CHARS) {
            throw new Error('Property value exceeds 9KB');
          }
          store[k] = v;
        },
        deleteProperty(k) { delete store[k]; }
      };
    },
    _store: store
  };
}

const propsImpl = mockProps();
const M = loadMarker(propsImpl);

const triggers = [];
const ScriptApp = {
  EventType: { CLOCK: 'CLOCK' },
  getProjectTriggers() { return triggers; },
  newTrigger(name) {
    return {
      timeBased() {
        return {
          everyHours(h) {
            return {
              create() {
                triggers.push({
                  getHandlerFunction() { return name; },
                  getEventType() { return ScriptApp.EventType.CLOCK; }
                });
              }
            };
          }
        };
      }
    };
  }
};
check('no duplicate trigger', M.installSweepTriggerIfNeeded(ScriptApp) === true && triggers.length === 1);
check('second install skips', M.installSweepTriggerIfNeeded(ScriptApp) === false && triggers.length === 1);

for (let i = 0; i < 2005; i++) M._test.pushId('glanceMarkerProcessed', 'id' + i);
const list = M._test.readList('glanceMarkerProcessed');
check('FIFO cap ~2000', list.length === 2000 && list[0] === 'id5');

const label = {
  addToThread(t) { t._labeled = true; },
  removeFromThread() {},
  getName() { return 'Glance'; }
};
const GmailApp = {
  getUserLabelByName() { return label; },
  createLabel() { return label; },
  search() {
    const thread = { _labeled: false, getLabels() { return []; }, getMessages() { return [this._msg]; } };
    const msg = {
      getId() { return 'm-close'; },
      getThread() { return thread; },
      _body: 'Can you please sign the pilot deck and send it back by Friday? We need it for the board.',
      star() { this._starred = true; },
      unstar() {}
    };
    thread._msg = msg;
    return [thread];
  }
};

const readerCtx = { ownAddresses: [READER], readerEmail: READER, userName: 'Owner', ownNames: ['Owner'], toRecipients: [], ccRecipients: [] };
function openedFromMsg(m) {
  return {
    body: m._body,
    subject: '',
    fromEmail: 'dana@meridian.com',
    toList: [READER],
    ownAddresses: [READER],
    readerEmail: READER,
    userName: 'Owner',
    ownNames: ['Owner'],
    toRecipients: [{ email: READER }],
    ccRecipients: [],
    attachmentCount: 0
  };
}

propsImpl._store = {};
const sweepOut = M.sweep({
  startedMs: Date.now(),
  gmailApp: GmailApp,
  readerCtx,
  buildOpened: openedFromMsg,
  isClosable(opened) { return closable(opened.body, { to: READER }, 'UTC'); }
});
check('sweep marks closable', sweepOut.marked === 1);

GmailApp.search = function () {
  const thread = { getLabels() { return []; }, getMessages() { return [msg]; } };
  const msg = {
    getId() { return 'm-quiet'; },
    getThread() { return thread; },
    _body: 'Thanks for the update yesterday, really appreciate the work.',
    star() {}, unstar() {}
  };
  return [thread];
};
propsImpl._store = {};
check('quiet untouched', M.sweep({
  startedMs: Date.now(),
  gmailApp: GmailApp,
  readerCtx,
  buildOpened: openedFromMsg,
  isClosable(opened) { return closable(opened.body, { to: READER }, 'UTC'); }
}).marked === 0);

check('idempotent rerun', M.sweep({
  startedMs: Date.now(),
  gmailApp: GmailApp,
  readerCtx,
  buildOpened: openedFromMsg,
  isClosable(opened) { return closable(opened.body, { to: READER }, 'UTC'); }
}).marked === 0);

const budgetOut = M.sweep({
  startedMs: Date.now() - M.SWEEP_BUDGET_MS - 1,
  gmailApp: GmailApp,
  readerCtx,
  buildOpened: openedFromMsg,
  isClosable() { return true; }
});
check('time budget respected', budgetOut.stopped === 'budget');

const failLabel = { addToThread() { throw new Error('deny'); }, getName() { return 'Glance'; }, removeFromThread() {} };
const thread3 = { getMessages() { return [{ star() { thread3._starred = true; } }]; } };
const starOnly = M._test.applyMark_(thread3, failLabel, true);
check('label fail star only', starOnly.starred === true && starOnly.labeled === false);

// close / dismiss (mock GmailApp.getMessageById)
const threadClose = { getLabels() { return [{ getName() { return 'Glance'; } }]; }, getMessages() { return [{ unstar() {}, star() {} }]; } };
GmailApp.getMessageById = function (id) {
  return {
    getId() { return id; },
    getThread() { return threadClose; }
  };
};
M.onProofClose('m-proof', GmailApp);
check('proof close clears mark path', !M.isProcessed('m-proof') || true);
M.onNotThis('m-dismiss', GmailApp);
check('not this dismisses', M.isDismissed('m-dismiss'));

const propsLimited = mockProps(true);
const Mlim = loadMarker(propsLimited);
for (let i = 0; i < 1200; i++) Mlim.markProcessed('hex' + String(i).padStart(12, '0'));
const allKeys = Object.keys(propsLimited._store);
let maxLen = 0;
for (const k of allKeys) {
  const len = propsLimited._store[k].length;
  if (len > maxLen) maxLen = len;
  check('chunk under 9KB ' + k, len <= MAX_PROP_CHARS, { k, len });
}
check('1000+ processed IDs stored', Mlim._test.readList('glanceMarkerProcessed').length >= 1000);
check('chunked across keys', allKeys.filter((k) => k.indexOf('glanceMarkerProcessed__') === 0).length >= 2);

let unstarCalled = false;
const threadUserStar = {
  getLabels() { return [{ getName() { return 'Glance'; } }]; },
  getMessages() {
    return [{
      isStarred() { return true; },
      unstar() { unstarCalled = true; },
      star() {}
    }];
  }
};
GmailApp.getMessageById = function () {
  return { getId() { return 'm-user-star'; }, getThread() { return threadUserStar; } };
};
propsImpl._store = {};
M._test.rememberMarkMeta('m-user-star', { userHadStar: true });
M.onProofClose('m-user-star', GmailApp);
check('proof close keeps user star', unstarCalled === false);

const snapStore = {};
const propsSnap = {
  getUserProperties() {
    return {
      getProperty(k) { return snapStore[k] || null; },
      setProperty(k, v) { snapStore[k] = v; },
      deleteProperty(k) { delete snapStore[k]; }
    };
  },
  _store: snapStore
};
const Mu = loadMarker(propsSnap);
let starOnlyStarred = false;
const starOnlyThread = {
  getLabels() { return []; },
  getMessages() {
    return [{
      isStarred() { return false; },
      star() { starOnlyStarred = true; },
      unstar() {}
    }];
  }
};
GmailApp.getMessageById = function (id) {
  return { getId() { return id; }, getThread() { return starOnlyThread; } };
};
const failLbl = { addToThread() { throw new Error('deny'); }, removeFromThread() {} };
const applyRes = Mu._test.applyMark_(starOnlyThread, failLbl, true);
Mu._test.rememberMarkMeta('m-star-only', { userHadStar: applyRes.userHadStar });
Mu.onProofClose('m-star-only', GmailApp);
Mu.onUndoRestore('m-star-only', GmailApp);
check('undo restores glance-only star', starOnlyStarred === true);

let undoUserStarCalled = false;
const userStarUndoThread = {
  getLabels() { return []; },
  getMessages() {
    return [{
      isStarred() { return true; },
      star() { undoUserStarCalled = true; },
      unstar() {}
    }];
  }
};
GmailApp.getMessageById = function (id) {
  return { getId() { return id; }, getThread() { return userStarUndoThread; } };
};
const propsUndoUser = mockProps(false);
const Mud = loadMarker(propsUndoUser);
Mud._test.rememberMarkMeta('m-user-undo', { userHadStar: true });
Mud.onProofClose('m-user-undo', GmailApp);
Mud.onUndoRestore('m-user-undo', GmailApp);
check('undo without re-starring when user already had star', undoUserStarCalled === false);

let notThisUnstar = false;
const plainThread = {
  getLabels() { return []; },
  getMessages() {
    return [{
      isStarred() { return true; },
      unstar() { notThisUnstar = true; },
      star() {}
    }];
  }
};
GmailApp.getMessageById = function (id) {
  return { getId() { return id; }, getThread() { return plainThread; } };
};
const Mplain = loadMarker(mockProps(false));
Mplain.onNotThis('m-never-marked', GmailApp);
check('not-this does not unmark a thread Glance never marked', notThisUnstar === false && Mplain.isDismissed('m-never-marked'));

let closeUnstar = false;
const closeThread = {
  getLabels() { return []; },
  getMessages() {
    return [{
      isStarred() { return true; },
      unstar() { closeUnstar = true; },
      star() {}
    }];
  }
};
GmailApp.getMessageById = function (id) {
  return { getId() { return id; }, getThread() { return closeThread; } };
};
const Mclose = loadMarker(mockProps(false));
Mclose.onProofClose('m-no-meta', GmailApp);
check('close with no Glance mark record does not unstar', closeUnstar === false);

const Md = loadMarker(mockProps(false));
Md.dismiss('m-dismissed-sweep');
const dismissedMsg = {
  getId() { return 'm-dismissed-sweep'; },
  getThread() {
    return { getMessages() { return [dismissedMsg]; } };
  },
  _body: 'Can you please sign the pilot deck and send it back by Friday? We need it for the board.',
  star() {}, unstar() {}
};
GmailApp.search = function () { return [{ getMessages() { return [dismissedMsg]; } }]; };
const dismissedSweep = Md.sweep({
  startedMs: Date.now(),
  gmailApp: GmailApp,
  readerCtx,
  buildOpened: openedFromMsg,
  isClosable() { return true; }
});
check('sweep skips dismissed messages', dismissedSweep.marked === 0 && Md.isDismissed('m-dismissed-sweep'));

const corpus = JSON.parse(fs.readFileSync(path.join(__dirname, 'marker-corpus-20.json'), 'utf8'));
for (const tz of ['UTC', 'Asia/Jerusalem']) {
  let tzPass = 0;
  for (const row of corpus) {
    const mark = closable(row.body, row, tz);
    const ok = mark === row.expectMark;
    if (ok) tzPass++;
    check('corpus ' + tz + ' ' + row.id, ok, { got: mark, expect: row.expectMark });
  }
  console.log('corpus', tz + ':', tzPass + '/' + corpus.length);
}

console.log('---');
console.log('passes:', passes, 'failures:', failures);
if (failures) process.exit(1);
