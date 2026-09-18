// background.js corpus — the Google write path.
//
// This file had no tests, which is the wrong way round: it is the only code
// in the extension that creates something in the user's real Google account.
// Everything else risks a missed chip or an awkward label; a defect here
// either writes the wrong thing, writes it twice, or refuses to write at all
// with a message the user cannot act on.
//
// The sandbox stubs chrome.* and fetch, then calls the writers directly. Each
// case asserts on the REQUESTS made, not just the return value — "it returned
// ok" is not the same claim as "it wrote to the list it said it did."
//
// Run: node test/background-write-corpus.cjs

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const TASKS = 'https://tasks.googleapis.com/tasks/v1';

function res(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

// Builds a fresh sandbox per case so stored state and call logs never leak
// between them. `routes` is consulted in order; the first match answers.
function load(opts) {
  opts = opts || {};
  const calls = [];
  const tokens = [];
  const stored = JSON.parse(JSON.stringify(opts.stored || {}));
  let tokenSeq = 0;

  const sandbox = {
    console,
    fetch: async (url, options) => {
      const method = (options && options.method) || 'GET';
      calls.push(method + ' ' + String(url).replace(TASKS, '').replace('https://www.googleapis.com/calendar/v3', ''));
      const auth = options && options.headers && options.headers.Authorization;
      if (auth) tokens.push(String(auth).replace('Bearer ', ''));
      for (const [match, answer] of opts.routes || []) {
        if (match.test(String(url)) && (!answer.method || answer.method === method)) {
          return typeof answer.reply === 'function' ? answer.reply(calls.length) : answer.reply;
        }
      }
      return res(500, { error: { message: 'unrouted: ' + method + ' ' + url } });
    },
    chrome: {
      runtime: {
        getManifest: () => ({ oauth2: { client_id: 'real.apps.googleusercontent.com' } }),
        onMessage: { addListener() {} },
        onInstalled: { addListener() {} },
        onStartup: { addListener() {} },
        lastError: null, getURL: (s) => s, id: 'ext'
      },
      identity: {
        getAuthToken: (o, cb) => cb('tok' + (++tokenSeq)),
        removeCachedAuthToken: (o, cb) => { calls.push('EVICT ' + o.token); cb(); },
        launchWebAuthFlow: () => {}
      },
      storage: {
        local: {
          get: async (k) => (typeof k === 'string' ? { [k]: stored[k] } : stored),
          set: async (patch) => { Object.assign(stored, patch); },
          remove: async () => {}
        }
      },
      windows: { create: () => {}, onRemoved: { addListener() {} } },
      tabs: { sendMessage: () => {} },
      alarms: { create: () => {}, onAlarm: { addListener() {} } }
    }
  };
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'background.js'), 'utf8'), sandbox, { filename: 'background.js' });
  return {
    calls, tokens, stored,
    fn: (name) => vm.runInContext(name, sandbox)
  };
}

let failures = 0;
function check(name, cond, detail) {
  if (cond) { console.log('PASS:', name); }
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

// A writer that throws where the test expected a value must be reported as a
// named failure, not allowed to abort the run. A regression that kills the
// suite before it prints TOTAL FAILURES is a regression that looks, to any
// script reading the last line, like nothing ran at all.
async function attempt(promise) {
  try { return await promise; }
  catch (e) { return { ok: false, threw: String((e && e.message) || e) }; }
}

const CONNECTED = { googleTasksAuth: { taskListId: 'LIST_A' } };
const PAYLOAD = { label: 'Send the signed SOW', facts: {}, senderName: 'Dana', threadUrl: 'https://mail.google.com/x' };

async function run() {
  console.log('\n--- background.js: the ordinary write ---\n');
  {
    const env = load({
      stored: CONNECTED,
      routes: [[/\/lists\/LIST_A\/tasks$/, { reply: res(200, { id: 'task_1' }) }]]
    });
    const out = await attempt(env.fn('googleTasksWrite')(PAYLOAD));
    check('a connected write succeeds', out.ok === true, out);
    check('it writes to the stored list', env.calls.includes('POST /lists/LIST_A/tasks'), env.calls);
    check('the undo ref names the list it actually wrote to',
      (out.ref || {}).taskListId === 'LIST_A' && (out.ref || {}).taskId === 'task_1', out);
    check('one request, no speculative extra round trips', env.calls.length === 1, env.calls);
  }

  console.log('\n--- background.js: the user deleted the Glance list ---\n');
  {
    // Deleting a list is ordinary tidying in an app Glance does not own. The
    // stored id then points at nothing and every Do It failed forever with
    // "Google Tasks write failed (404)" — a message naming neither cause nor
    // remedy, escapable only via a Disconnect/Connect nothing suggested.
    const env = load({
      stored: CONNECTED,
      routes: [
        [/\/lists\/LIST_A\/tasks$/, { reply: res(404, { error: { message: 'Requested entity was not found.' } }) }],
        [/\/users\/@me\/lists\?/, { reply: res(200, { items: [] }) }],
        [/\/users\/@me\/lists$/, { method: 'POST', reply: res(200, { id: 'LIST_B', title: 'Glance' }) }],
        [/\/lists\/LIST_B\/tasks$/, { reply: res(200, { id: 'task_2' }) }]
      ]
    });
    const out = await attempt(env.fn('googleTasksWrite')(PAYLOAD));
    check('the write recovers instead of failing permanently', out.ok === true, out);
    check('the new list id is persisted, so the next write is one request again',
      env.stored.googleTasksAuth.taskListId === 'LIST_B', env.stored.googleTasksAuth);
    check('the undo ref points at the list the task really landed in',
      (out.ref || {}).taskListId === 'LIST_B', out);
    check('it re-resolves exactly once — no retry loop',
      env.calls.filter((c) => c.includes('/lists/') && c.startsWith('POST /lists/')).length === 2, env.calls);
  }

  console.log('\n--- background.js: the list exists but under a new id ---\n');
  {
    // e.g. the list was rebuilt by a sync client. Find-by-title must reuse it
    // rather than creating a second list called "Glance".
    const env = load({
      stored: CONNECTED,
      routes: [
        [/\/lists\/LIST_A\/tasks$/, { reply: res(404, { error: { message: 'not found' } }) }],
        [/\/users\/@me\/lists\?/, { reply: res(200, { items: [{ id: 'LIST_C', title: 'Glance' }, { id: 'zz', title: 'My Tasks' }] }) }],
        [/\/lists\/LIST_C\/tasks$/, { reply: res(200, { id: 'task_3' }) }]
      ]
    });
    const out = await attempt(env.fn('googleTasksWrite')(PAYLOAD));
    check('the existing list is reused', out.ok === true && (out.ref || {}).taskListId === 'LIST_C', out);
    check('and no second "Glance" list is created',
      !env.calls.includes('POST /users/@me/lists'), env.calls);
  }

  console.log('\n--- background.js: recovery itself fails ---\n');
  {
    // Whatever broke the list may also break creating one. The user must see
    // the ORIGINAL problem, not a second, more confusing error about list
    // creation that hides it.
    const env = load({
      stored: CONNECTED,
      routes: [
        [/\/lists\/LIST_A\/tasks$/, { reply: res(404, { error: { message: 'Requested entity was not found.' } }) }],
        [/\/users\/@me\/lists/, { reply: res(500, { error: { message: 'backend error' } }) }]
      ]
    });
    let threw = null;
    try { await env.fn('googleTasksWrite')(PAYLOAD); } catch (e) { threw = e.message; }
    check('it still fails loudly rather than silently claiming success', threw !== null);
    check('and reports the original 404, not the recovery failure',
      /404/.test(threw) && !/500/.test(threw), threw);
  }

  console.log('\n--- background.js: not connected is not an error ---\n');
  {
    // "Connect Google" is a thing the user can act on. A raw exception is not
    // — and the chip renders the two differently.
    const env = load({ stored: {}, routes: [] });
    const out = await attempt(env.fn('googleTasksWrite')(PAYLOAD));
    check('an unconnected write reports not-connected, it does not throw',
      out.ok === false && out.reason === 'not-connected', out);
    check('and it never reaches the network', env.calls.length === 0, env.calls);
  }

  console.log('\n--- background.js: a revoked grant reads as not-connected ---\n');
  {
    const env = load({
      stored: CONNECTED,
      routes: [[/\/lists\/LIST_A\/tasks$/, { reply: res(403, { error: { message: 'insufficient permission' } }) }]]
    });
    const out = await attempt(env.fn('googleTasksWrite')(PAYLOAD));
    check('403 asks the user to reconnect rather than surfacing an API error',
      out.ok === false && out.reason === 'not-connected', out);
  }

  console.log('\n--- background.js: a stale cached token is refreshed once ---\n');
  {
    // Chrome can hand back a token the user revoked from their Google account
    // page. Evict it, ask for a fresh one, retry — once.
    let n = 0;
    const env = load({
      stored: CONNECTED,
      routes: [[/\/lists\/LIST_A\/tasks$/, { reply: () => (++n === 1 ? res(401, {}) : res(200, { id: 'task_4' })) }]]
    });
    const out = await attempt(env.fn('googleTasksWrite')(PAYLOAD));
    check('the write succeeds on the retry', out.ok === true, out);
    check('the stale token was evicted from Chrome\'s cache',
      env.calls.some((c) => c.startsWith('EVICT tok1')), env.calls);
    check('and the retry used a DIFFERENT token', env.tokens[0] !== env.tokens[1], env.tokens);
  }

  console.log('\n--- background.js: undo is idempotent ---\n');
  {
    // rollbackChain stops at the first failed undo and lets the user retry.
    // If an already-deleted record reported failure, that retry could never
    // get past step one and the remaining writes would never be reverted.
    const env = load({
      stored: CONNECTED,
      routes: [
        [/\/lists\/LIST_A\/tasks\/task_1$/, { reply: res(204, {}) }],
        [/\/lists\/LIST_A\/tasks\/gone$/, { reply: res(404, {}) }]
      ]
    });
    const undo = env.fn('googleTasksUndo');
    check('undoing a real task succeeds', (await attempt(undo({ taskListId: 'LIST_A', taskId: 'task_1' }))).ok === true);
    check('undoing an already-deleted task also succeeds — retrying a partial rollback must be able to get past it',
      (await attempt(undo({ taskListId: 'LIST_A', taskId: 'gone' }))).ok === true);
    check('undo without a ref does nothing rather than guessing',
      (await undo(null)).ok === false && (await undo({})).ok === false);
  }

  console.log('\n--- background.js: undo deletes from the right list ---\n');
  {
    // After a recovery the stored list id has moved on. Undo must use the id
    // recorded on the write, not whatever is current — otherwise it deletes
    // a same-id task from the wrong list, or nothing at all.
    const env = load({
      stored: { googleTasksAuth: { taskListId: 'LIST_NEW' } },
      routes: [[/\/lists\/LIST_OLD\/tasks\/task_9$/, { reply: res(204, {}) }]]
    });
    const out = await attempt(env.fn('googleTasksUndo')({ taskListId: 'LIST_OLD', taskId: 'task_9' }));
    check('the ref\'s own list wins over the currently stored one',
      out.ok === true && env.calls.includes('DELETE /lists/LIST_OLD/tasks/task_9'), env.calls);
  }

  console.log('\n--- background.js: a Calendar undo tolerates 410 Gone ---\n');
  {
    const env = load({
      stored: CONNECTED,
      routes: [[/\/calendars\/primary\/events\/ev_1$/, { reply: res(410, {}) }]]
    });
    check('410 is Calendar\'s "already deleted" and counts as undone',
      (await attempt(env.fn('googleCalendarUndo')({ eventId: 'ev_1' }))).ok === true);
  }

  console.log('\nTOTAL FAILURES:', failures);
  process.exit(failures ? 1 : 0);
}

run();
