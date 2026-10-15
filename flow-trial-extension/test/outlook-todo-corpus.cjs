// Microsoft To Do proof of close. POST the task, GET it back, Handled only
// when that GET is the same id. A miss is not Handled. Undo DELETEs by
// externalId. Nothing is sent.
// Run: node test/outlook-todo-corpus.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { webcrypto } = require('crypto');
const { FlowIncomingJudge: J } = require('../core/incoming-judge.js');
const { FlowGraphMail: Mail } = require('../core/graph-mail.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

function background(opts) {
  opts = opts || {};
  const calls = [];
  const stored = {
    outlookAuth: {
      token: {
        accessToken: 'AT',
        refreshToken: 'RT',
        expiresAt: Date.now() + 3600 * 1000,
        rtIssuedAt: Date.now(),
        grantedScopes: opts.scopes || ['Mail.Read', 'Mail.ReadWrite', 'Tasks.ReadWrite', 'offline_access', 'User.Read']
      },
      account: { address: 'glance.salisapan@outlook.com' },
      requestedScopes: ['offline_access', 'User.Read', 'Mail.Read', 'Mail.ReadWrite', 'Tasks.ReadWrite']
    },
    outlookSync: {}
  };
  const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
  const routes = opts.routes || [];
  const sandbox = {
    console, URLSearchParams, URL, TextEncoder, Uint8Array, crypto: webcrypto,
    btoa: (s) => Buffer.from(String(s), 'binary').toString('base64'),
    atob: (s) => Buffer.from(String(s), 'base64').toString('binary'),
    setTimeout: opts.clock || setTimeout,
    clearTimeout: opts.clearClock || clearTimeout,
    fetch: async (url, init) => {
      const method = (init && init.method) || 'GET';
      let body = null;
      try { body = init && init.body ? JSON.parse(init.body) : null; } catch (e) { body = init && init.body; }
      calls.push({ method, url: String(url), body });
      for (const route of routes) {
        if (route.method === method && route.test.test(String(url))) return route.reply(body);
      }
      if (/login\.microsoftonline\.com/.test(String(url))) return json(400, { error: 'unexpected-token' });
      return json(404, {});
    },
    chrome: {
      runtime: {
        getManifest: () => ({ oauth2: { client_id: 'x' }, version: '0.9.31', content_scripts: [{ js: [] }] }),
        onMessage: { addListener() {} }, onInstalled: { addListener() {} }, onStartup: { addListener() {} },
        lastError: null, getURL: (s) => s, id: 'ext'
      },
      identity: {
        getAuthToken: (o, cb) => cb('gtok'),
        removeCachedAuthToken: (o, cb) => cb && cb(),
        getRedirectURL: () => 'https://ext.chromiumapp.org/',
        launchWebAuthFlow: (o, cb) => cb && cb(null)
      },
      storage: {
        local: {
          get: async (k) => {
            const o = JSON.parse(JSON.stringify(stored));
            if (typeof k === 'string') return { [k]: o[k] };
            if (Array.isArray(k)) { const r = {}; k.forEach((x) => { r[x] = o[x]; }); return r; }
            return o;
          },
          set: async (p) => { Object.assign(stored, p); },
          remove: async () => {}
        },
        onChanged: { addListener() {} }
      },
      windows: { create: () => {}, onRemoved: { addListener() {} } },
      tabs: { sendMessage: () => {}, query: async () => [] },
      alarms: { create: () => {}, onAlarm: { addListener() {} } },
      contextMenus: { create: () => {}, removeAll: (cb) => cb && cb(), onClicked: { addListener() {} } },
      permissions: { contains: async () => false },
      scripting: { getRegisteredContentScripts: async () => [], registerContentScripts: async () => {} },
      sidePanel: { setPanelBehavior: () => Promise.resolve() }
    }
  };
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(require('./load-background.cjs').backgroundScript(), sandbox, { filename: 'background.js' });
  return { calls, fn: (n) => vm.runInContext(n, sandbox) };
}

const LISTS = { value: [
  { id: 'FLAG', displayName: 'Flagged', wellknownListName: 'flaggedEmails' },
  { id: 'DEF', displayName: 'Tasks', wellknownListName: 'defaultList' }
] };

function happyRoutes(getStatus, getBody) {
  return [
    { method: 'GET', test: /\/me\/todo\/lists$/, reply: () => ({ ok: true, status: 200, json: async () => LISTS, text: async () => '' }) },
    { method: 'POST', test: /\/me\/todo\/lists\/DEF\/tasks$/, reply: () => ({ ok: true, status: 201, json: async () => ({ id: 'TASK9', title: 'File the amendment' }), text: async () => '' }) },
    { method: 'GET', test: /\/me\/todo\/lists\/DEF\/tasks\/TASK9$/, reply: () => ({ ok: getStatus >= 200 && getStatus < 300, status: getStatus, json: async () => getBody, text: async () => '' }) }
  ];
}

const PAYLOAD = {
  label: 'File the amendment',
  senderName: 'Dana',
  params: { title: 'File the amendment', dateIso: '2026-10-10', what: 'file the amendment' },
  threadUrl: 'https://outlook.live.com/mail/0/inbox/id/msg1',
  now: '2026-10-07T12:00:00.000Z'
};

console.log('\n--- judge: task-only is To Do, a draft stays a draft, a calendar stays quiet ---\n');
{
  const intent = {
    classify: () => ({ type: 'decision', label: 'File the amendment', confidence: 'high', lang: 'en' }),
    shouldShowChip: () => true,
    TYPES: { REQUEST: 'request' }
  };
  const quiet = { factReply: { blocksInbox: () => false, detect: () => null }, fileAttach: { gate: () => ({ kind: 'ignore' }) } };
  const task = J.judge({
    text: 'We agreed to file the amendment by September 21 please.',
    surface: 'outlook',
    sender: { name: 'Dana', email: 'dana@acme.com' }
  }, Object.assign({ intent, actions: { planFor: () => ({ id: 'log-it', name: 'Log It', closedLine: 'Logged and tracked.', steps: [{ kind: 'googleTask', id: 'task', params: { title: 'File the amendment', dateIso: '2026-10-10' } }] }) } }, quiet));
  check('a task-only close is shown as outlookTask', task.show === true && task.process.steps.length === 1 && task.process.steps[0].kind === 'outlookTask', task);
  const mixed = J.judge({
    text: 'Please confirm the headcount by Thursday so we can book the venue.',
    surface: 'outlook',
    sender: { name: 'Dana', email: 'dana@acme.com' }
  }, Object.assign({ intent, actions: { planFor: () => ({ id: 'reply-track', name: 'Reply', steps: [{ kind: 'gmailDraft', id: 'draft', params: {} }, { kind: 'googleTask', id: 'task', params: {} }] }) } }, quiet));
  check('a process with a draft stays a draft and does not become the only step',
    mixed.show === true && mixed.process.steps.some((s) => s.kind === 'outlookDraft') && mixed.process.steps.some((s) => s.kind === 'googleTask'),
    mixed.process && mixed.process.steps);
  const cal = J.judge({
    text: 'Can we meet tomorrow at 10:00 to go over the rollout plan?',
    surface: 'outlook',
    sender: { name: 'Avi', email: 'avi@partner.io' }
  }, Object.assign({ intent, actions: { planFor: () => ({ id: 'schedule', name: 'Schedule', steps: [{ kind: 'calendar', id: 'cal', params: {} }] }) } }, quiet));
  check('a calendar close with no task stays quiet', cal.show === false && cal.reason === 'no-draft-close', cal);
}

(async () => {
console.log('\n--- write, read back, undo ---\n');
{
  const env = background({ routes: happyRoutes(200, { id: 'TASK9', status: 'notStarted', changeKey: 'ck-created', title: 'File the amendment' }) });
  const out = await env.fn('outlookTaskWrite')(PAYLOAD);
  const post = env.calls.find((c) => c.method === 'POST');
  const gets = env.calls.filter((c) => c.method === 'GET' && /\/tasks\//.test(c.url));
  check('POST creates the task on the default list, then GET reads that id',
    out.ok === true && out.proof && out.proof.fetchedBack === true && out.proof.system === 'microsoft/todo' &&
    out.proof.externalId === 'TASK9' && out.ref.externalId === 'TASK9' && out.ref.taskListId === 'DEF' &&
    post && /\/me\/todo\/lists\/DEF\/tasks$/.test(post.url) && gets.length === 1 && /\/tasks\/TASK9$/.test(gets[0].url),
    { out, calls: env.calls.map((c) => c.method + ' ' + c.url) });
  check('the task title is the chip label when the body has no verb span, with no sender prefix',
    post && post.body && post.body.title === 'File the amendment' && post.body.title.indexOf('Dana') < 0 &&
    post.body.dueDateTime && post.body.dueDateTime.dateTime.indexOf('2026-10-10') === 0,
    post && post.body);
  const titled = background({ routes: happyRoutes(200, { id: 'TASK9', status: 'notStarted' }) });
  const titledOut = await titled.fn('outlookTaskWrite')(Object.assign({}, PAYLOAD, {
    label: 'Log commitment for Oct 9',
    senderName: 'flow',
    subject: 'Passport',
    text: 'We agreed to file the amendment by October 21 please.'
  }));
  const titledPost = titled.calls.find((c) => c.method === 'POST');
  check('a firing sentence becomes the title and the subject does not',
    titledOut.ok === true && titledPost && titledPost.body && titledPost.body.title === 'File the amendment' &&
    titledPost.body.body && /From: flow/.test(titledPost.body.body.content || '') &&
    titledPost.body.title.indexOf('Passport') < 0 && titledPost.body.title.indexOf('flow') < 0,
    titledPost && titledPost.body);
  const greeted = background({ routes: happyRoutes(200, { id: 'TASK9', status: 'notStarted' }) });
  const greetedOut = await greeted.fn('outlookTaskWrite')(Object.assign({}, PAYLOAD, {
    label: 'Log commitment for Oct 9',
    senderName: 'flow',
    subject: 'Gate 0.9.34 To Do title',
    text: 'Gate 0.9.34 To Do title\nHi, We agreed to renew the passport application by Friday. Thanks, Flow Gate'
  }));
  const greetedPost = greeted.calls.find((c) => c.method === 'POST');
  check('Outlook card text with a subject line and Hi posts the commitment',
    greetedOut.ok === true && greetedPost && greetedPost.body && greetedPost.body.title === 'Renew the passport application' &&
    greetedPost.body.title.indexOf('Gate') < 0 && greetedPost.body.title.indexOf('Hi') < 0,
    greetedPost && greetedPost.body);
  const blank = background({ routes: happyRoutes(200, { id: 'TASK9', status: 'notStarted' }) });
  const blankOut = await blank.fn('outlookTaskWrite')(Object.assign({}, PAYLOAD, {
    label: 'Hi, We agreed to renew the passport application',
    senderName: 'flow',
    subject: 'Gate 0.9.35 To Do title',
    text: 'Hi,\n\nWe agreed to renew the passport application by Friday.\n\nThanks, Flow Gate'
  }));
  const blankPost = blank.calls.find((c) => c.method === 'POST');
  check('blank lines in the Outlook body post the commitment, not Hi',
    blankOut.ok === true && blankPost && blankPost.body && blankPost.body.title === 'Renew the passport application',
    blankPost && blankPost.body);
  const GATE_HTML = '<html><body><div dir="auto">Hi,<br/><br/>We agreed to renew the passport application by Friday.<br/><br/>Thanks, Flow Gate</div></body></html>';
  const gateBodies = [
    ['Gate HTML through htmlToText and ownText', Mail.ownText(Mail.htmlToText(GATE_HTML))],
    ['CRLF blank lines', 'Hi,\r\n\r\nWe agreed to renew the passport application by Friday.\r\n\r\nThanks, Flow Gate'],
    ['a non-breaking space', 'Hi,\u00a0\n\nWe agreed to renew the passport application by Friday.\n\nThanks, Flow Gate'],
    ['a zero-width mark inside the verb', 'Hi,\n\nWe\u200b agreed to renew the passport\u200b application by Friday.\n\nThanks, Flow Gate'],
    ['the r34 subject line plus the body', 'Gate 0.9.34 To Do title\nHi, We agreed to renew the passport application by Friday. Thanks, Flow Gate']
  ];
  for (const row of gateBodies) {
    const wrote = background({ routes: happyRoutes(200, { id: 'TASK9', status: 'notStarted' }) });
    const out = await wrote.fn('outlookTaskWrite')(Object.assign({}, PAYLOAD, {
      label: 'Log commitment for Oct 9',
      subject: 'Gate 0.9.35 To Do title',
      text: row[1]
    }));
    const post = wrote.calls.find((c) => c.method === 'POST');
    check(row[0] + ' posts the commitment',
      out.ok === true && post && post.body && post.body.title === 'Renew the passport application',
      post && post.body && post.body.title);
  }
  check('nothing was sent', !env.calls.some((c) => /\/(send|reply|replyAll|forward|sendMail)(\b|\/|$)/i.test(c.url)));
  check('Handled is allowed only for that proof',
    env.fn('globalThis.FlowProofOfClose.allowsHandled')({ ok: true, proof: out.proof }) === true);

  const undo = await env.fn('outlookTaskUndo')(out.ref);
  const del = env.calls.filter((c) => c.method === 'DELETE');
  const afterDelete = env.calls.filter((c) => c.method === 'GET' && /\/tasks\/TASK9$/.test(c.url));
  check('Undo does not say Undone while GET still returns the task',
    undo.ok === false && undo.reason === 'still-present' && undo.fetchedBack === true &&
    del.length === 1 && /\/me\/todo\/lists\/DEF\/tasks\/TASK9$/.test(del[0].url) && afterDelete.length >= 2,
    { undo, del: del.map((c) => c.url), gets: afterDelete.length });
}

console.log('\n--- Undo says Undone only after GET confirms the task is gone ---\n');
{
  let goneReads = 0;
  const gone = background({ routes: [
    { method: 'DELETE', test: /\/me\/todo\/lists\/DEF\/tasks\/TASK9$/, reply: () => ({ ok: true, status: 204, json: async () => ({}), text: async () => '' }) },
    { method: 'GET', test: /\/me\/todo\/lists\/DEF\/tasks\/TASK9$/, reply: () => {
      goneReads += 1;
      if (goneReads === 1) return { ok: true, status: 200, json: async () => ({ id: 'TASK9', changeKey: 'ck-created', title: 'File the amendment' }), text: async () => '' };
      return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
    } }
  ] });
  const undone = await gone.fn('outlookTaskUndo')({ taskListId: 'DEF', taskId: 'TASK9', externalId: 'TASK9', created: { changeKey: 'ck-created', title: 'File the amendment' } });
  const order = gone.calls.map((c) => c.method);
  check('DELETE then GET 404 is Undone, and the receipt names the To Do page cache',
    undone.ok === true && undone.fetchedBack === true && undone.deleted === true &&
    order.indexOf('DELETE') >= 0 && order.indexOf('DELETE') < order.lastIndexOf('GET') &&
    /two minutes/.test(undone.written || ''),
    { undone, order });
  let presentReads = 0;
  const present = background({ routes: [
    { method: 'DELETE', test: /\/tasks\/TASK9$/, reply: () => ({ ok: true, status: 204, json: async () => ({}), text: async () => '' }) },
    { method: 'GET', test: /\/tasks\/TASK9$/, reply: () => {
      presentReads += 1;
      if (presentReads === 1) return { ok: true, status: 200, json: async () => ({ id: 'TASK9', title: 'File the amendment' }), text: async () => '' };
      return { ok: true, status: 200, json: async () => ({ id: 'TASK9', title: 'File the amendment', status: 'notStarted' }), text: async () => '' };
    } }
  ] });
  const still = await present.fn('outlookTaskUndo')({ taskListId: 'DEF', taskId: 'TASK9', externalId: 'TASK9', created: { changeKey: 'ck-created', title: 'File the amendment' } });
  check('a live task after DELETE is not Undone', still.ok === false && still.reason === 'still-present' && still.fetchedBack === true, still);
  let flaggedReads = 0;
  const flagged = background({ routes: [
    { method: 'DELETE', test: /\/tasks\/TASK9$/, reply: () => ({ ok: true, status: 204, json: async () => ({}), text: async () => '' }) },
    { method: 'GET', test: /\/tasks\/TASK9$/, reply: () => {
      flaggedReads += 1;
      if (flaggedReads === 1) return { ok: true, status: 200, json: async () => ({ id: 'TASK9', title: 'File the amendment' }), text: async () => '' };
      return { ok: true, status: 200, json: async () => ({ id: 'TASK9', title: 'File the amendment', status: 'deleted', isDeleted: true, '@removed': { reason: 'deleted' } }), text: async () => '' };
    } }
  ] });
  const marked = await flagged.fn('outlookTaskUndo')({ taskListId: 'DEF', taskId: 'TASK9', externalId: 'TASK9', created: { changeKey: 'ck-created', title: 'File the amendment' } });
  check('a 200 with a deleted flag is not Undone',
    marked.ok === false && marked.reason === 'still-present' && marked.fetchedBack === true && marked.deleted !== true,
    marked);
  const edited = background({ routes: [
    { method: 'GET', test: /\/tasks\/TASK9$/, reply: () => ({ ok: true, status: 200, json: async () => ({ id: 'TASK9', title: 'I changed the title', changeKey: 'ck-user', lastModifiedDateTime: '2026-10-14T12:00:00.000Z' }), text: async () => '' }) }
  ] });
  const kept = await edited.fn('outlookTaskUndo')({
    taskListId: 'DEF', taskId: 'TASK9', externalId: 'TASK9',
    created: { changeKey: 'ck-created', title: 'File the amendment', lastModifiedDateTime: '2026-10-14T09:00:00.000Z' }
  });
  check('a task the person edited is not deleted',
    kept.ok === false && kept.reason === 'user-edited' &&
    kept.written === 'You edited this. Undo left it alone.' &&
    !edited.calls.some((c) => c.method === 'DELETE' || c.method === 'PATCH'),
    kept);
}

console.log('\n--- a read-back that does not answer is not Undone ---\n');
{
  let slowWaits = 0;
  let slowReads = 0;
  const hung = background({
    clock: (fn, ms) => {
      if (ms >= 8000) {
        slowWaits += 1;
        if (slowWaits > 1) { fn(); return slowWaits; }
        return slowWaits;
      }
      return setTimeout(fn, ms);
    },
    routes: [
      { method: 'DELETE', test: /\/tasks\/TASK9$/, reply: () => ({ ok: true, status: 204, json: async () => ({}), text: async () => '' }) },
      { method: 'GET', test: /\/tasks\/TASK9$/, reply: () => {
        slowReads += 1;
        if (slowReads === 1) return { ok: true, status: 200, json: async () => ({ id: 'TASK9', changeKey: 'ck-created', title: 'File the amendment' }), text: async () => '' };
        return new Promise(() => {});
      } }
    ]
  });
  const slow = await hung.fn('outlookTaskUndo')({ taskListId: 'DEF', taskId: 'TASK9', externalId: 'TASK9', created: { changeKey: 'ck-created', title: 'File the amendment' } });
  check('an 8s read-back timeout says try again and is not Undone',
    slow.ok === false && slow.reason === 'verify-timeout' && slow.fetchedBack !== true &&
    slow.written === "Couldn't verify, try again",
    slow);
}

console.log('\n--- To Do Do It rechecks the open mail after the proof read ---\n');
{
  const page = fs.readFileSync(path.join(__dirname, '..', 'src', 'content-outlook.js'), 'utf8');
  const fn = page.slice(page.indexOf('async function onOutlookTodoDoIt'), page.indexOf('async function onOnedriveDoIt'));
  const failFn = page.slice(page.indexOf('function todoWriteFailureLine'), page.indexOf('async function onOutlookTodoDoIt'));
  const proofAt = fn.indexOf('await livePromiseProof');
  const recheckAt = fn.indexOf('ignoreStaleClick(host)', proofAt);
  const writeAt = fn.indexOf("type: 'flow:execute-action'", proofAt);
  const afterWrite = fn.indexOf('ignoreStaleClick(host)', writeAt);
  const logAt = fn.indexOf('FlowStorage.appendLog', writeAt);
  check('the stale check sits after the proof await and before the write',
    proofAt >= 0 && recheckAt > proofAt && writeAt > recheckAt, { proofAt, recheckAt, writeAt });
  check('the stale check sits again after the write and before the receipt',
    afterWrite > writeAt && logAt > afterWrite, { writeAt, afterWrite, logAt });
  const scopeAt = failFn.indexOf("r.reason === 'tasks-not-granted'");
  const reconnectAt = failFn.indexOf('Reconnect Outlook');
  check('a missing To Do scope uses the Setup line, and Reconnect is the expired-token line',
    fn.indexOf('todoWriteFailureLine') > 0 && scopeAt >= 0 &&
    failFn.indexOf('Tasks.ReadWrite') > scopeAt &&
    failFn.indexOf('token-expired') > 0 && reconnectAt > failFn.indexOf('token-expired') &&
    page.indexOf('Reconnect Outlook to allow To Do') < 0,
    { scopeAt, reconnectAt });
  const undoClick = page.slice(page.indexOf("undo.textContent = 'Undoing…'"), page.indexOf('async function livePromiseProof'));
  const popup = fs.readFileSync(path.join(__dirname, '..', 'popup', 'popup.js'), 'utf8');
  check('an undo that does not answer shows try again instead of staying on Undoing',
    undoClick.indexOf('readBackOrTimeout') > 0 &&
    undoClick.indexOf("reason === 'verify-timeout'") > 0 &&
    undoClick.indexOf("Couldn't verify, try again") > 0 &&
    popup.indexOf('readBackOrTimeout') > 0 &&
    popup.indexOf("r.reason === 'verify-timeout'") > 0);
}

console.log('\n--- a verify miss is not Handled ---\n');
{
  const miss = background({ routes: happyRoutes(404, {}) });
  const out = await miss.fn('outlookTaskWrite')(PAYLOAD);
  check('a GET miss is verify_failed and not a proof',
    out.ok === false && out.reason === 'verify_failed' && out.proof === null && out.ref && out.ref.externalId === 'TASK9',
    out);
  check('the miss does not say Handled and does not delete the task',
    miss.fn('globalThis.FlowProofOfClose.allowsHandled')({ ok: out.ok, proof: out.proof }) === false &&
    out.written === "Created, couldn't verify" && out.fetchedBack === false &&
    !miss.calls.some((c) => c.method === 'DELETE'));
  const undone = await miss.fn('outlookTaskUndo')(out.ref);
  check('Undo with no snapshot says Couldn\'t confirm and does not delete',
    undone.ok === false && undone.reason === 'unconfirmed' &&
    undone.written === "Couldn't confirm it's unchanged. Undo left it alone." &&
    !miss.calls.some((c) => c.method === 'DELETE'), undone);
  const card = fs.readFileSync(path.join(__dirname, '..', 'src', 'content-outlook.js'), 'utf8');
  const missCard = card.slice(card.indexOf('async function onOutlookTodoDoIt'), card.indexOf('async function onOnedriveDoIt'));
  check('the To Do miss paints a receipt with Undo and is not Handled',
    missCard.indexOf("Created, couldn't verify") > 0 &&
    missCard.indexOf("type: 'flow:undo-action'") > missCard.indexOf("Created, couldn't verify") &&
    missCard.indexOf("'Handled.'") > missCard.indexOf("type: 'flow:undo-action'"));
  const empty = background({ routes: [
    { method: 'GET', test: /\/me\/todo\/lists$/, reply: () => ({ ok: true, status: 200, json: async () => LISTS, text: async () => '' }) },
    { method: 'POST', test: /\/tasks$/, reply: () => ({ ok: true, status: 201, json: async () => ({}), text: async () => '' }) }
  ] });
  const pending = await empty.fn('outlookTaskWrite')(PAYLOAD);
  check('a create with no id is proof_pending', pending.ok === false && pending.reason === 'proof_pending' && pending.proof === null, pending);
}

console.log('\n--- no Tasks.ReadWrite means no write and no Handled ---\n');
{
  const denied = background({ scopes: ['Mail.Read', 'Mail.ReadWrite'], routes: happyRoutes(200, { id: 'TASK9' }) });
  const out = await denied.fn('outlookTaskWrite')(PAYLOAD);
  check('a token without Tasks.ReadWrite does not create a task',
    out.ok === false && out.reason === 'tasks-not-granted' && denied.calls.length === 0, { out, calls: denied.calls });
  const expired = background({ routes: [
    { method: 'GET', test: /\/me\/todo\/lists$/, reply: () => ({ ok: false, status: 401, json: async () => ({}), text: async () => '' }) }
  ] });
  const expiredOut = await expired.fn('outlookTaskWrite')(PAYLOAD);
  check('a 401 after the scope is present is an expired token, not a missing scope',
    expiredOut.ok === false && expiredOut.reason === 'token-expired', expiredOut);
}

console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
