// Glance never blocks the person. A compose box is filled once. Undo of a
// draft, task, event, or file stops when the creation snapshot no longer
// matches. Run: node test/native-edit-corpus.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { webcrypto } = require('crypto');
const { FlowNativeEdit: N } = require('../src/native-edit.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

function box() {
  const events = {};
  return {
    textContent: '',
    events: events,
    addEventListener(type, fn) { events[type] = fn; },
    setAttribute(key, value) { this[key] = value; },
    getAttribute(key) { return this[key] || null; }
  };
}

console.log('\n--- a compose box is written once ---\n');
{
  const field = box();
  const first = N.fillOnce(field, 'Thanks, I will send it.');
  field.textContent = 'Thanks, I will send it tomorrow.';
  if (field.events.input) field.events.input();
  const second = N.fillOnce(field, 'Thanks, I will send it.');
  check('the first fill writes the draft', first.wrote === true && field.getAttribute('data-glance-filled') === '1', first);
  check('typing after the fill is not rewritten',
    second.wrote === false && second.reason === 'user-typed' && field.textContent === 'Thanks, I will send it tomorrow.',
    { second, text: field.textContent });
  const fresh = box();
  fresh.textContent = 'I already started this reply.';
  const blocked = N.fillOnce(fresh, 'Thanks, I will send it.');
  check('text already in the box is left as the person left it',
    blocked.wrote === false && fresh.textContent === 'I already started this reply.', blocked);
}

console.log('\n--- a changed snapshot is an edit ---\n');
{
  const snap = N.snapshotOf({
    '@odata.etag': 'W/"abc"',
    changeKey: 'ck1',
    lastModifiedDateTime: '2026-10-14T09:00:00.000Z',
    body: { contentType: 'html', content: '<html><body>Thanks</body></html>' },
    title: 'File it',
    dueDateTime: { dateTime: '2026-10-20T00:00:00.0000000', timeZone: 'UTC' },
    status: 'notStarted'
  });
  check('a snapshot keeps content and drops server fields',
    snap.changeKey == null && snap.lastModifiedDateTime == null && snap.eTag == null &&
    snap.title === 'File it' && snap.body && snap.body.prefix === 'Thanks' && snap.body.hash &&
    snap.dueDateTime === '2026-10-20T00:00:00' && snap.status === 'notStarted',
    snap);
  const same = {
    '@odata.etag': 'W/"zzz"',
    changeKey: 'ck2',
    lastModifiedDateTime: '2026-10-15T01:00:00.000Z',
    body: { contentType: 'html', content: '<p>Thanks</p>' },
    title: 'File it',
    dueDateTime: { dateTime: '2026-10-20T00:00:00', timeZone: 'Eastern Standard Time' },
    status: 'notStarted'
  };
  check('a new etag and lastModifiedDateTime is not an edit', N.userEdited(snap, same) === false);
  check('a new title is an edit', N.userEdited(snap, Object.assign({}, same, { title: 'File it RENAMED' })) === true);
  check('a new body is an edit', N.userEdited(snap, Object.assign({}, same, { body: { contentType: 'html', content: '<p>I rewrote this</p>' } })) === true);
  check('the refusal is one line', N.userEditedLine() === 'You edited this. Undo left it alone.');
  check('an empty body is stored as null', snap.body && snap.body.prefix === 'Thanks' && N.snapshotOf({ title: 'File it', body: { content: '' } }).body === null);
  check('a field the read did not return is omitted',
    !Object.prototype.hasOwnProperty.call(N.snapshotOf({ title: 'File it' }), 'dueDateTime') &&
    !Object.prototype.hasOwnProperty.call(N.snapshotOf({ title: 'File it' }), 'importance'));
  const full = N.snapshotOf({
    title: 'File it',
    body: { content: 'Thanks' },
    dueDateTime: { dateTime: '2026-10-20T00:00:00.0000000', timeZone: 'UTC' },
    importance: 'normal',
    isReminderOn: false
  });
  check('an emptied body is an edit', N.compareContent(full, {
    title: 'File it', body: { content: '' }, dueDateTime: { dateTime: '2026-10-20T00:00:00' }, importance: 'normal', isReminderOn: false
  }) === 'edited');
  check('a removed due date is an edit', N.compareContent(full, {
    title: 'File it', body: { content: 'Thanks' }, importance: 'normal', isReminderOn: false
  }) === 'edited');
  check('importance is stored and a reminder is not',
    full.importance === 'normal' &&
    !Object.prototype.hasOwnProperty.call(full, 'isReminderOn'));
  check('a starred task is an edit', N.compareContent(full, {
    title: 'File it', body: { content: 'Thanks' }, dueDateTime: { dateTime: '2026-10-20T00:00:00' },
    importance: 'high', isReminderOn: true, reminderMinutesBeforeStart: 30,
    reminderDateTime: { dateTime: '2026-10-20T09:00:00' }
  }) === 'edited');
  check('importance normal or missing is not an edit',
    N.compareContent(full, {
      title: 'File it', body: { content: 'Thanks' }, dueDateTime: { dateTime: '2026-10-20T00:00:00' }
    }) === 'match' &&
    N.compareContent({ title: 'File it' }, {
      title: 'File it', importance: 'normal'
    }) === 'match' &&
    N.compareContent({ title: 'File it' }, {
      title: 'File it', importance: 'high'
    }) === 'edited');
  check('a stored null that is filled later is unconfirmed', N.compareContent(Object.assign({}, full, { body: null }), {
    title: 'File it', body: { content: 'call Dana first' }, dueDateTime: { dateTime: '2026-10-20T00:00:00' }, importance: 'normal', isReminderOn: false
  }) === 'unconfirmed');
  check('a reminder Graph adds later is not an edit', N.compareContent({ title: 'File it', isReminderOn: false, importance: 'normal' }, {
    title: 'File it', isReminderOn: true, importance: 'normal', reminderDateTime: { dateTime: '2026-10-20T09:00:00' }, reminderMinutesBeforeStart: 15
  }) === 'match');
  {
    const long = 'word '.repeat(4000);
    const stored = N.snapshotOf({ body: { content: long } });
    const again = N.snapshotOf({ body: { contentType: 'html', content: '<p>' + long + '</p>' } });
    const changed = long + 'friday';
    check('a body stores a hash and a prefix no longer than 8KB',
      stored.body && stored.body.prefix.length === N.BODY_PREFIX && stored.body.prefix.length <= 8192 &&
      stored.body.hash === again.body.hash &&
      N.compareContent(stored, { body: { content: long } }) === 'match' &&
      N.compareContent(stored, { body: { content: changed } }) === 'edited',
      stored.body && { len: stored.body.prefix.length, same: stored.body.hash === again.body.hash });
  }
  check('isAllDay false versus true is an edit', N.userEdited(
    N.snapshotOf({ title: 'File it', isAllDay: false }),
    { title: 'File it', isAllDay: true }
  ) === true);
  const partial = { title: 'File it', body: 'Thanks' };
  check('a field the snapshot never stored is not called an edit', N.userEdited(partial, Object.assign({}, same, { location: { displayName: 'Room 4' } })) === false);
  check('a field the snapshot never stored is unconfirmed', N.compareContent(partial, Object.assign({}, same, { location: { displayName: 'Room 4' } })) === 'unconfirmed');
  const meet = N.snapshotOf({
    subject: 'Meet',
    attendees: [{ emailAddress: { address: 'Noa@x.com' } }, { emailAddress: { address: 'dana@x.com' } }],
    reminderMinutesBeforeStart: 0,
    isReminderOn: true
  });
  check('attendees are a sorted set and a reminder is not stored',
    meet.attendees === 'dana@x.com,noa@x.com' &&
    !Object.prototype.hasOwnProperty.call(meet, 'reminderMinutesBeforeStart') &&
    !Object.prototype.hasOwnProperty.call(meet, 'isReminderOn'));
  check('the same attendees in another order are not an edit', N.userEdited(meet, {
    subject: 'Meet',
    attendees: [{ emailAddress: { address: 'dana@x.com' } }, { emailAddress: { address: 'NOA@x.com' } }],
    reminderMinutesBeforeStart: 0,
    isReminderOn: true
  }) === false);
  check('a new attendee is an edit', N.userEdited(meet, {
    subject: 'Meet',
    attendees: [{ emailAddress: { address: 'dana@x.com' } }],
    reminderMinutesBeforeStart: 0,
    isReminderOn: true
  }) === true);
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
        grantedScopes: opts.scopes || ['Mail.Read', 'Mail.ReadWrite', 'Calendars.ReadWrite', 'offline_access', 'User.Read']
      },
      account: { address: 'glance.salisapan@outlook.com' },
      requestedScopes: ['offline_access', 'User.Read', 'Mail.Read', 'Mail.ReadWrite', 'Calendars.ReadWrite']
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
        getManifest: () => ({ oauth2: { client_id: 'x' }, version: '0.9.56', content_scripts: [{ js: [] }] }),
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

console.log('\n--- the page scan does not rewrite a draft ---\n');
{
  const page = fs.readFileSync(path.join(__dirname, '..', 'src', 'content-outlook.js'), 'utf8');
  const obsAt = page.indexOf('const obs = new MutationObserver');
  const obs = page.slice(obsAt, page.indexOf('setInterval', obsAt));
  const gmail = fs.readFileSync(path.join(__dirname, '..', 'src', 'content-gmail.js'), 'utf8');
  check('the Outlook observer only schedules a scan',
    obs.indexOf('(schedule)') > 0 && obs.indexOf('execCommand') < 0 && obs.indexOf('textContent') < 0, obs);
  check('Gmail insert goes through the one-time fill',
    gmail.indexOf('FlowNativeEdit') > 0 && gmail.indexOf('fillOnce') > 0);
}

(async () => {
console.log('\n--- a failed To Do read does not delete, and a draft with no snapshot stays ---\n');
{
  const snap = { changeKey: 'ck-created', title: 'File the amendment', lastModifiedDateTime: '2026-10-14T09:00:00.000Z' };
  const taskRef = (id) => ({ taskListId: 'DEF', taskId: id, externalId: id, created: snap });
  const confirmLine = "Couldn't confirm it's unchanged. Undo left it alone.";
  const legacy = { taskListId: 'DEF', taskId: 'TASKLEGACY', externalId: 'TASKLEGACY' };
  const five = background({ routes: [
    { method: 'GET', test: /\/tasks\/TASK500$/, reply: () => ({ ok: false, status: 500, json: async () => ({ error: 'server' }), text: async () => '' }) }
  ] });
  const refused500 = await five.fn('outlookTaskUndo')(taskRef('TASK500'));
  check('a To Do edit-check 500 refuses in one line and does not delete',
    refused500.ok === false && refused500.written === confirmLine && refused500.reason === 'unconfirmed' &&
    !five.calls.some((c) => c.method === 'DELETE' || c.method === 'PATCH'),
    refused500);
  const down = background({ routes: [
    { method: 'GET', test: /\/tasks\/TASKNET$/, reply: () => { throw new Error('network'); } }
  ] });
  const refusedNet = await down.fn('outlookTaskUndo')(taskRef('TASKNET'));
  check('a To Do edit-check network error refuses in one line and does not delete',
    refusedNet.ok === false && refusedNet.written === confirmLine && refusedNet.reason === 'unconfirmed' &&
    !down.calls.some((c) => c.method === 'DELETE' || c.method === 'PATCH'),
    refusedNet);
  const hung = background({
    clock: (fn, ms) => { if (ms >= 8000) { fn(); return 1; } return setTimeout(fn, ms); },
    routes: [
      { method: 'GET', test: /\/tasks\/TASKSLOW$/, reply: () => new Promise(() => {}) }
    ]
  });
  const refusedSlow = await hung.fn('outlookTaskUndo')(taskRef('TASKSLOW'));
  check('a To Do edit-check timeout refuses in one line and does not delete',
    refusedSlow.ok === false && refusedSlow.written === confirmLine && refusedSlow.reason === 'unconfirmed' &&
    !hung.calls.some((c) => c.method === 'DELETE' || c.method === 'PATCH'),
    refusedSlow);
  const draft = background({ routes: [
    { method: 'GET', test: /\/me\/messages\/odraft-nosnap/, reply: () => ({ ok: true, status: 200, json: async () => ({ id: 'odraft-nosnap', isDraft: true, changeKey: 'ck', body: { content: 'Thanks' } }), text: async () => '' }) }
  ] });
  const noSnap = await draft.fn('outlookDraftUndo')('odraft-nosnap');
  check('an Outlook draft Undo with no snapshot refuses in one line and does not delete',
    noSnap.ok === false && noSnap.written === confirmLine && noSnap.reason === 'unconfirmed' &&
    !draft.calls.some((c) => c.method === 'DELETE' || c.method === 'PATCH'),
    noSnap);
  const bareTodo = background({ routes: [
    { method: 'GET', test: /\/tasks\/TASKLEGACY$/, reply: () => ({ ok: true, status: 200, json: async () => ({ id: 'TASKLEGACY', title: 'File the amendment' }), text: async () => '' }) },
    { method: 'DELETE', test: /\/tasks\/TASKLEGACY$/, reply: () => ({ ok: true, status: 204, json: async () => ({}), text: async () => '' }) }
  ] });
  const todoBare = await bareTodo.fn('outlookTaskUndo')(legacy);
  check('a To Do Undo with no snapshot refuses and does not delete',
    todoBare.ok === false && todoBare.written === confirmLine && todoBare.deleted !== true && !/Undone/.test(todoBare.written || '') &&
    !bareTodo.calls.some((c) => c.method === 'DELETE' || c.method === 'PATCH'),
    todoBare);
  const bareCal = background({ routes: [
    { method: 'DELETE', test: /\/me\/events\/EVLEGACY/, reply: () => ({ ok: true, status: 204, json: async () => ({}), text: async () => '' }) }
  ] });
  const calBare = await bareCal.fn('outlookCalendarUndo')({ eventId: 'EVLEGACY' });
  check('a Calendar Undo with no snapshot refuses and does not delete',
    calBare.ok === false && calBare.written === confirmLine && !/Undone/.test(calBare.written || '') &&
    !bareCal.calls.some((c) => c.method === 'DELETE' || c.method === 'PATCH'),
    calBare);
  const activityEnv = background({ routes: [
    { method: 'GET', test: /\/tasks\/TASKLEGACY$/, reply: () => ({ ok: true, status: 200, json: async () => ({ id: 'TASKLEGACY', title: 'File the amendment' }), text: async () => '' }) },
    { method: 'DELETE', test: /\/tasks\/TASKLEGACY$/, reply: () => ({ ok: true, status: 204, json: async () => ({}), text: async () => '' }) }
  ] });
  const activity = await activityEnv.fn('outlookTaskUndo')(legacy, { type: 'flow:undo-action', connectorId: 'outlookTask', ref: legacy, created: undefined });
  const popup = fs.readFileSync(path.join(__dirname, '..', 'popup', 'popup.js'), 'utf8');
  const activityAt = popup.indexOf('created: e.created');
  const activitySrc = popup.slice(activityAt, activityAt + 2800);
  check('Activity Undo on a legacy log entry refuses with the unconfirmed line and does not delete',
    activity.ok === false && activity.written === confirmLine && activity.deleted !== true &&
    !activityEnv.calls.some((c) => c.method === 'DELETE' || c.method === 'PATCH') &&
    activitySrc.indexOf("reason === 'unconfirmed'") > 0 && activitySrc.indexOf('r.ok') > 0,
    activity);
}

console.log('\n--- an edited calendar event is left alone ---\n');
{
  const event = {
    id: 'EV1',
    subject: 'glance-pricing-q4.pdf',
    changeKey: 'ck-user',
    lastModifiedDateTime: '2026-10-14T12:00:00.000Z',
    body: { contentType: 'Text', content: 'I moved this event.' }
  };
  const env = background({ routes: [
    { method: 'GET', test: /\/me\/events\/EV1/, reply: () => ({ ok: true, status: 200, json: async () => event, text: async () => '' }) }
  ] });
  env.fn('outlookCalendarUndo')({
    eventId: 'EV1',
    created: { changeKey: 'ck-created', lastModifiedDateTime: '2026-10-14T09:00:00.000Z', subject: 'glance-pricing-q4.pdf', body: 'File: glance-pricing-q4.pdf' }
  }).then((kept) => {
    check('Undo refuses an edited event with one line and does not delete it',
      kept.ok === false && kept.reason === 'user-edited' && kept.written === N.userEditedLine() &&
      !env.calls.some((c) => c.method === 'DELETE' || c.method === 'PATCH'),
      kept);
    console.log('\nTOTAL FAILURES:', failures);
    process.exit(failures ? 1 : 0);
  }).catch((err) => {
    console.log('FAIL: calendar undo threw', err && err.stack ? err.stack : err);
    process.exit(1);
  });
}
})().catch((err) => {
  console.log('FAIL: rule-9 undo threw', err && err.stack ? err.stack : err);
  process.exit(1);
});
