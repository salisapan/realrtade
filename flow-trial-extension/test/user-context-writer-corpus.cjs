// UserContext writer (D1 part 1): features and counts only; no mail bodies.
// Run: TZ=UTC node test/user-context-writer-corpus.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { webcrypto } = require('crypto');
const { FlowUserContextWriter: W } = require('../core/user-context-writer.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

let p = W.empty('u1');
check('empty profile has schema version', p.schemaVersion === W.VERSION && p.userId === 'u1');

p = W.fromConnect(p, { email: 'me@co.com', name: 'Ada', title: 'CFO', department: 'Finance', preferDrive: true });
check('Connect seeds identity and Drive preference', p.identity.aliases.indexOf('Ada') >= 0 && p.identity.title === 'CFO' && p.workStyle.preferredTools.files === 'drive');

p = W.fromStyleSummary(p, { greeting: 'hi-name', signoff: 'best', length: 'short' }, 'en');
check('style summary becomes a note, not raw mail', /opens with hi-name/.test(p.workStyle.writingStyleNote || '') && p.workStyle.languages.indexOf('en') >= 0);

p = W.recordKnowledge(p, 'We never discount below list.', 'user');
check('knowledge is capped text only', p.knowledge.length === 1 && p.knowledge[0].note.indexOf('discount') >= 0);

p = W.applyEvent(p, { type: 'shown', partyKey: 'dana@x.com', intentFamily: 'quote' });
p = W.applyEvent(p, { type: 'approved', partyKey: 'dana@x.com', intentFamily: 'quote', fetchedBack: true });
p = W.applyEvent(p, { type: 'approved', partyKey: 'dana@x.com', intentFamily: 'quote', fetchedBack: true });
const hint = W.relevanceHint(p);
check('two fetched-back closes without dismissals read as relevant history', hint.relevance === 'relevant' && hint.reason === 'history_closed');

const tNow = new Date().toISOString();
const t24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
const lone24 = W.applyEvent(W.empty('one-24h'), { type: 'approved', partyKey: 'a@b.com', intentFamily: 'quote', fetchedBack: true, at: t24h });
check('24h: one decayed approval stays below 2.0', W.relevanceHint(lone24, tNow).relevance === 'unknown');
const pair24 = W.applyEvent(W.applyEvent(W.empty('pair-24h'), { type: 'approved', partyKey: 'a@b.com', intentFamily: 'quote', fetchedBack: true, at: tNow }), { type: 'approved', partyKey: 'a@b.com', intentFamily: 'quote', fetchedBack: true, at: tNow });
check('24h: two fresh approvals reach decayed weight 2.0', W.relevanceHint(pair24, tNow).relevance === 'relevant');

const t7d = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
const weekLone = W.applyEvent(W.empty('7d'), { type: 'approved', partyKey: 'a@b.com', intentFamily: 'quote', fetchedBack: true, at: t7d });
check('7d: one old approval alone stays cold at weight 2.0 rule', W.relevanceHint(weekLone, tNow).relevance === 'unknown');
const weekPair = W.applyEvent(W.applyEvent(W.empty('7d-pair'), { type: 'approved', partyKey: 'a@b.com', intentFamily: 'quote', fetchedBack: true, at: tNow }), { type: 'approved', partyKey: 'a@b.com', intentFamily: 'quote', fetchedBack: true, at: tNow });
check('7d: two fresh approvals still reach relevant with 30-day half-life', W.relevanceHint(weekPair, tNow).relevance === 'relevant');

const t60d = new Date(Date.now() - 61 * 24 * 3600 * 1000).toISOString();
const stale = W.applyEvent(W.applyEvent(W.empty('stale'), { type: 'approved', partyKey: 'a@b.com', intentFamily: 'quote', fetchedBack: true, at: t60d }), { type: 'approved', partyKey: 'a@b.com', intentFamily: 'quote', fetchedBack: true, at: t60d });
check('approval older than 60 days does not reach weight 2.0', W.relevanceHint(stale, tNow).relevance === 'unknown');

const one = W.applyEvent(W.empty('one'), { type: 'approved', partyKey: 'a@b.com', intentFamily: 'quote', fetchedBack: true, at: tNow });
check('one approval stays cold', W.relevanceHint(one, tNow).relevance === 'unknown');

let twoDismiss = W.applyEvent(W.empty('d2'), { type: 'dismissed', partyKey: 'a@b.com', intentFamily: 'quote' });
twoDismiss = W.applyEvent(twoDismiss, { type: 'dismissed', partyKey: 'a@b.com', intentFamily: 'quote' });
check('two dismissals without three stays unknown', W.relevanceHint(twoDismiss, tNow).relevance === 'unknown');

const t1 = new Date(Date.now() - 36 * 3600 * 1000).toISOString();
const t2 = new Date().toISOString();
const decayed = W.applyEvent(W.empty('decay'), { type: 'approved', partyKey: 'a@b.com', intentFamily: 'quote', fetchedBack: true, at: t2 });
const d2 = W.applyEvent(decayed, { type: 'approved', partyKey: 'a@b.com', intentFamily: 'quote', fetchedBack: true, at: t2 });
let decayPass = 0;
for (let i = 0; i < 100; i++) {
  if (W.relevanceHint(d2, t2).relevance === 'relevant') decayPass += 1;
}
check('decay relevance stable 100/100 in this TZ', decayPass === 100, { decayPass });

let a = W.empty('acct-a');
let b = W.empty('acct-b');
a = W.applyEvent(a, { type: 'approved', partyKey: 'x@y.com', intentFamily: 'quote', fetchedBack: true });
b = W.applyEvent(b, { type: 'dismissed', partyKey: 'x@y.com', intentFamily: 'quote' });
check('profiles stay per user id', a.decisionHistory[0].approvedFetchedBack === 1 && b.decisionHistory[0].dismissed === 1);

p = W.applyEvent(W.empty('u2'), { type: 'dismissed', partyKey: 'a@b.com', intentFamily: 'quote' });
p = W.applyEvent(p, { type: 'dismissed', partyKey: 'a@b.com', intentFamily: 'quote' });
p = W.applyEvent(p, { type: 'dismissed', partyKey: 'a@b.com', intentFamily: 'quote' });
check('three dismissals without approval read as not_relevant', W.relevanceHint(p).relevance === 'not_relevant');

check('switch name is stable', W.SWITCH === 'USER_CONTEXT_WRITER');

const ucSrc = fs.readFileSync(path.join(__dirname, '..', 'core', 'user-context-writer.js'), 'utf8');
check('N11a no 1e-2 relevance floor dodge', !/1e-2/.test(ucSrc) && /approvalWeight >= RELEVANT_MIN_APPROVED/.test(ucSrc));
check('N11b dismissals use raw counts', /dismissCount \+= Number\(r\.dismissed\)/.test(ucSrc));
check('N11d injectable now in relevanceHint', /function relevanceHint\(profile, nowIso\)/.test(ucSrc));
check('N11e per-event approvalAts decay sum', /approvalAts\[i\]/.test(ucSrc) && /decayWeight\(approvalAts\[i\]/.test(ucSrc));

console.log('\n--- worker guards (switch off does not persist) ---\n');

function loadWorker(stored) {
  const bag = JSON.parse(JSON.stringify(stored || { glanceSwitches: {}, glanceUserContextV0: { byAccount: {} } }));
  const listeners = [];
  const sandbox = {
    console,
    fetch: async () => ({ ok: false, status: 500, json: async () => ({}) }),
    chrome: {
      runtime: {
        getManifest: () => ({ oauth2: { client_id: 'real.apps.googleusercontent.com' } }),
        onMessage: { addListener: (fn) => listeners.push(fn) },
        onInstalled: { addListener() {} },
        onStartup: { addListener() {} },
        lastError: null,
        getURL: (s) => s,
        id: 'ext'
      },
      identity: { getAuthToken: (o, cb) => cb('tok'), removeCachedAuthToken: (o, cb) => cb(), launchWebAuthFlow: () => {} },
      storage: {
        local: {
          get: async (k) => {
            if (typeof k === 'string') return { [k]: bag[k] };
            const defaults = (k && typeof k === 'object' && !Array.isArray(k)) ? k : {};
            const out = {};
            const keys = Object.keys(defaults).length ? Object.keys(defaults) : Object.keys(bag);
            keys.forEach((key) => { out[key] = bag[key] !== undefined ? bag[key] : defaults[key]; });
            return out;
          },
          set: async (patch) => { Object.assign(bag, patch); }
        }
      },
      contextMenus: { onClicked: { addListener() {} }, create() {}, removeAll(cb) { if (cb) cb(); } },
      windows: { create: () => {}, onRemoved: { addListener() {} } },
      tabs: { sendMessage: () => {} },
      alarms: { create: () => {}, onAlarm: { addListener() {} } }
    },
    URLSearchParams,
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    crypto: webcrypto,
    TextEncoder,
    Uint8Array
  };
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(require('./load-background.cjs').backgroundScript(), sandbox, { filename: 'background.js' });
  const send = (msg) => new Promise((resolve) => {
    const l = listeners[listeners.length - 1];
    const keep = l(msg, {}, resolve);
    if (keep !== true) resolve(undefined);
  });
  return { bag, send, W: sandbox.FlowUserContextWriter };
}

(async () => {
  let w = loadWorker();
  const wrote = await w.send({
    type: 'flow:user-context-event',
    event: { type: 'approved', partyKey: 'z@z.com', intentFamily: 'quote', fetchedBack: true }
  });
  check('flow:user-context-event refuses when USER_CONTEXT_WRITER is off', wrote && wrote.ok === false && wrote.reason === 'switch-off', wrote);
  check('switch off leaves glanceUserContextV0 empty', !w.bag.glanceUserContextV0 || !w.bag.glanceUserContextV0.byAccount || !Object.keys(w.bag.glanceUserContextV0.byAccount).length, w.bag.glanceUserContextV0);

  w = loadWorker({ glanceSwitches: { USER_CONTEXT_WRITER: true }, glanceUserContextV0: { byAccount: {} } });
  const wroteOn = await w.send({
    type: 'flow:user-context-event',
    accountKey: 'on@test.com',
    event: { type: 'approved', partyKey: 'z@z.com', intentFamily: 'quote', fetchedBack: true }
  });
  check('flow:user-context-event persists when switch is on', wroteOn && wroteOn.ok === true && w.bag.glanceUserContextV0.byAccount['on@test.com'], wroteOn);

  w = loadWorker({ glanceSwitches: { USER_CONTEXT_WRITER: true }, glanceUserContextV0: { byAccount: {} } });
  const before = JSON.stringify(w.bag.glanceUserContextV0);
  const missing = await w.send({ type: 'flow:user-context-event', event: {} });
  check('missing event type is rejected before storage', missing && missing.ok === false && missing.reason === 'missing-event' && JSON.stringify(w.bag.glanceUserContextV0) === before);

  const bg = fs.readFileSync(path.join(__dirname, '..', 'src', 'background.js'), 'utf8');
  check('seedUserContextFromConnect writes by account email key', /seedUserContextFromConnect/.test(bg) && /readUserContextProfile\(accountKey\)/.test(bg) && /writeUserContextProfile\(next, accountKey\)/.test(bg));

  console.log(failures ? '\n' + failures + ' FAILED' : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})();
