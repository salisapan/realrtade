// "Waiting on" storage and Google writes.
//   storage.js : upsert / update / get, cap, concurrency
//   background : the Task (due date, notes, list recovery), completing it when
//                a reply arrives, and the nudge draft (never sent).
// Run: node test/follow-write-corpus.cjs
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { webcrypto } = require('crypto');
const { FlowFollowUp: F } = require('../core/follow-up.js');
const { FlowExtract } = require('../core/extract.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

// ---------------------------------------------------------------- storage.js
async function storageTests() {
  const store = {};
  const chrome = { storage: { local: {
    get: (defaults, cb) => { const out = {}; for (const k of Object.keys(defaults)) out[k] = Object.prototype.hasOwnProperty.call(store, k) ? store[k] : defaults[k]; setTimeout(() => cb(out), 0); },
    set: (patch, cb) => { setTimeout(() => { Object.assign(store, patch); if (cb) cb(); }, 0); }
  } }, runtime: { sendMessage: (m, cb) => cb && cb({}) } };
  const sandbox = { console, chrome, crypto: { randomUUID: () => 'u' } };
  vm.createContext(sandbox);
  for (const f of ['core/pmf-metrics.js', 'core/classification-metrics.js', 'core/close-quality-metrics.js', 'core/quiet-metrics.js', 'core/recurrence.js', 'src/storage.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), sandbox, { filename: f });
  }
  const S = vm.runInContext('FlowStorage', sandbox);
  const now = new Date(2026, 9, 1, 12).getTime();
  const ask = F.classifyOutgoing('Please confirm the final figure by Monday so I can book the vendor.', { now, extract: FlowExtract });
  const mk = (id, over) => Object.assign(F.buildWatch({ threadId: id, messageId: 'm' + id, subject: 'S' + id, counterpart: { email: id + '@x.com' }, ask, now }), over || {});

  check('no watches to begin with', (await S.getWatches()).length === 0);
  await S.upsertWatch(mk('a'));
  check('a watch is stored and found by thread', (await S.getWatch('a')).status === 'waiting' && (await S.getWatches()).length === 1);
  await S.upsertWatch(mk('a', { what: 'changed' }));
  check('upserting the same thread replaces it, not duplicates', (await S.getWatches()).length === 1 && (await S.getWatch('a')).what === 'changed');
  await S.updateWatch('a', { status: 'resolved', resolvedBy: 'reply', resolvedAt: 5 });
  const a = await S.getWatch('a');
  check('update merges fields and keeps the rest', a.status === 'resolved' && a.resolvedBy === 'reply' && a.kind === 'reply' && a.counterpart.email === 'a@x.com', a);
  check('updating an unknown id changes nothing', (await S.updateWatch('nope', { status: 'stopped' })) === null && (await S.getWatches()).length === 1);

  await Promise.all(['b', 'c', 'd', 'e', 'f'].map((id) => S.upsertWatch(mk(id))));
  check('five concurrent upserts all land (no lost update)', (await S.getWatches()).length === 6, (await S.getWatches()).map((w) => w.id));

  for (let i = 0; i < 70; i++) await S.upsertWatch(mk('s' + i, { status: 'stopped', resolvedAt: i + 10 }));
  await S.upsertWatch(mk('live'));
  const all = await S.getWatches();
  check('the list is capped at 60', all.length === 60, all.length);
  check('the cap never drops a live watch', all.some((w) => w.id === 'live') && all.filter((w) => w.status === 'waiting').length >= 6, all.filter((w) => w.status === 'waiting').map((w) => w.id));
  // meetings to debrief
  check('no meetings to begin with', (await S.getMeetings()).length === 0);
  await S.recordMeeting({ id: 'msg1', title: 'Call with Dana', dateIso: '2026-10-09', threadUrl: 'https://mail.google.com/x' });
  await S.recordMeeting({ id: 'msg1', title: 'Call with Dana (moved)', dateIso: '2026-10-10' });
  const ms = await S.getMeetings();
  check('a meeting is stored once, with title and date only, and updating replaces it', ms.length === 1 && ms[0].title === 'Call with Dana (moved)' && ms[0].dateIso === '2026-10-10' && ms[0].done === false && Object.keys(ms[0]).sort().join() === 'dateIso,done,id,threadUrl,title', ms);
  await S.updateMeeting('msg1', { done: true });
  check('a meeting can be marked debriefed', (await S.getMeetings())[0].done === true);
  check('a meeting with no date is refused', (await S.recordMeeting({ id: 'x', title: 't' })) === null && (await S.getMeetings()).length === 1);
  for (let i = 0; i < 25; i++) await S.recordMeeting({ id: 'm' + i, title: 't', dateIso: '2026-10-09' });
  check('meetings are capped at 20', (await S.getMeetings()).length === 20);

  // loop rhythms
  const open = (day) => Object.assign({}, mk('r'), { counterpart: { email: 'dana@acme.com', name: 'Dana' }, createdAt: new Date(day + 'T12:00:00').getTime() });
  await S.recordLoopOpen(open('2026-07-12')); await S.recordLoopOpen(open('2026-08-12')); await S.recordLoopOpen(open('2026-09-12')); await S.recordLoopOpen(open('2026-09-12'));
  const lh = await S.getLoopHistory();
  check('opening loops records only dates, per person and kind, once per day', Object.keys(lh.history).length === 1 && Object.values(lh.history)[0].dates.length === 3 && !/Please confirm/.test(JSON.stringify(lh.history)), lh.history);
  await S.ackRecurrence('k', '2026-10-12');
  check('an acknowledged prediction is remembered', (await S.getLoopHistory()).acked.k === '2026-10-12');

  check('it drops the OLDEST settled records first', !all.some((w) => w.id === 's0') && all.some((w) => w.id === 's69'));
}

// --------------------------------------------------------------- background.js
function load(opts) {
  opts = opts || {};
  const calls = [];
  const stored = JSON.parse(JSON.stringify(opts.stored || {}));
  const json = (status, data) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
  const sandbox = {
    console,
    fetch: async (url, o) => {
      url = String(url); o = o || {};
      const body = o.body ? (() => { try { return JSON.parse(o.body); } catch (e) { return o.body; } })() : null;
      calls.push({ method: o.method || 'GET', url, body });
      for (const [re, answer] of opts.routes || []) if (re.test(url) && (!answer.method || answer.method === (o.method || 'GET'))) return typeof answer.reply === 'function' ? answer.reply(calls.length) : answer.reply;
      return json(500, { error: { message: 'unrouted ' + url } });
    },
    chrome: {
      runtime: { getManifest: () => ({ oauth2: { client_id: 'real.apps.googleusercontent.com' } }), onMessage: { addListener() {} }, onInstalled: { addListener() {} }, onStartup: { addListener() {} }, lastError: null, getURL: (s) => s, id: 'ext' },
      identity: { getAuthToken: (o, cb) => cb('tok'), removeCachedAuthToken: (o, cb) => cb(), launchWebAuthFlow: () => {} },
      storage: { local: { get: async (k) => (typeof k === 'string' ? { [k]: stored[k] } : stored), set: async (p) => { Object.assign(stored, p); }, remove: async (k) => { delete stored[k]; } } },
      windows: { create() {}, onRemoved: { addListener() {} } }, tabs: { sendMessage() {} }, alarms: { create() {}, onAlarm: { addListener() {} } }
    },
    URLSearchParams, btoa: (s) => Buffer.from(s, 'binary').toString('base64'), atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    crypto: webcrypto, TextEncoder, Uint8Array
  };
  sandbox.self = sandbox; sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(require('./load-background.cjs').backgroundScript(), sandbox, { filename: 'background.js' });
  return { calls, stored, fn: (n) => vm.runInContext(n, sandbox) };
}
const ok = (data) => ({ ok: true, status: 200, json: async () => data });
const status = (s) => ({ ok: s < 300, status: s, json: async () => ({ error: { message: 'x' } }) });
const decodeRaw = (raw) => Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');

async function backgroundTests() {
  const auth = { googleTasksAuth: { taskListId: 'LIST1' } };
  const TASKS = /tasks\.googleapis\.com/;

  let w = load({ stored: {} });
  let r = await w.fn('followTaskCreate')({ title: 'Chase reply from Dana', dueIso: '2026-10-05' });
  check('without Google connected: not-connected, no request', r.ok === false && r.reason === 'not-connected' && w.calls.length === 0, { r, calls: w.calls });

  w = load({ stored: auth, routes: [[TASKS, { method: 'POST', reply: ok({ id: 'T1' }) }]] });
  r = await w.fn('followTaskCreate')({ title: 'Chase reply from Dana — Vendor booking', dueIso: '2026-10-05', what: 'Please confirm the final figure by Monday', counterpart: 'Dana <dana@acme.com>', threadUrl: 'https://mail.google.com/mail/u/0/#all/m2' });
  const post = w.calls[0];
  check('creates the Task in the Glance list', r.ok && r.ref.taskListId === 'LIST1' && r.ref.taskId === 'T1' && /\/lists\/LIST1\/tasks$/.test(post.url) && post.method === 'POST', { r, post });
  check('the due date is midnight UTC of the chase day', post.body.due === '2026-10-05T00:00:00.000Z', post.body);
  check('the notes name what was asked, who, and link back to the thread', /Asked: Please confirm/.test(post.body.notes) && /Waiting on: Dana/.test(post.body.notes) && /Open in Gmail: https:\/\/mail\.google\.com/.test(post.body.notes), post.body.notes);
  r = await w.fn('followTaskCreate')({ title: '  ' });
  check('an empty title is refused without a request', r.ok === false && r.reason === 'invalid' && w.calls.length === 1, r);
  r = await w.fn('followTaskCreate')({ title: 'x', dueIso: 'tomorrow' });
  check('a malformed due date is dropped, not sent', r.ok && !('due' in w.calls[w.calls.length - 1].body), w.calls[w.calls.length - 1].body);

  let n = 0;
  w = load({ stored: auth, routes: [
    [/\/lists\/LIST1\/tasks$/, { method: 'POST', reply: status(404) }],
    [/users\/@me\/lists\?/, { reply: ok({ items: [{ id: 'FRESH', title: 'Glance' }] }) }],
    [/\/lists\/FRESH\/tasks$/, { method: 'POST', reply: ok({ id: 'T2' }) }]
  ] });
  r = await w.fn('followTaskCreate')({ title: 'Chase', dueIso: '2026-10-05' });
  check('a deleted Glance list is re-resolved once and the write retried', r.ok && r.ref.taskListId === 'FRESH' && w.stored.googleTasksAuth.taskListId === 'FRESH', { r, stored: w.stored });

  w = load({ stored: auth, routes: [[TASKS, { method: 'POST', reply: status(403) }]] });
  r = await w.fn('followTaskCreate')({ title: 'Chase' });
  check('a revoked grant reads as not-connected', r.ok === false && r.reason === 'not-connected', r);

  // completing
  w = load({ stored: auth, routes: [[TASKS, { method: 'PATCH', reply: ok({}) }]] });
  r = await w.fn('followTaskComplete')({ taskListId: 'LIST1', taskId: 'T1' });
  const patch = w.calls[0];
  check('a reply completes the Task (PATCH status), it does not delete it', r.ok && patch.method === 'PATCH' && patch.body.status === 'completed' && /\/lists\/LIST1\/tasks\/T1$/.test(patch.url), { r, patch });
  w = load({ stored: auth, routes: [[TASKS, { method: 'PATCH', reply: status(404) }]] });
  r = await w.fn('followTaskComplete')({ taskListId: 'LIST1', taskId: 'GONE' });
  check('a Task the person already deleted is fine', r.ok === true, r);
  r = await w.fn('followTaskComplete')(null);
  check('no reference, no request', r.ok === false && w.calls.length === 1, r);

  // rescheduling (they promised a date / you chased) and reopening
  w = load({ stored: auth, routes: [[TASKS, { method: 'PATCH', reply: ok({}) }]] });
  r = await w.fn('followTaskSchedule')({ taskListId: 'LIST1', taskId: 'T1' }, '2026-10-16');
  const moved = w.calls[0];
  check('a moved chase day PATCHes only the due date', r.ok && moved.method === 'PATCH' && moved.body.due === '2026-10-16T00:00:00.000Z' && Object.keys(moved.body).join() === 'due', { r, moved });
  r = await w.fn('followTaskSchedule')({ taskListId: 'LIST1', taskId: 'T1' }, 'next friday');
  check('a malformed day is refused without a request', r.ok === false && r.reason === 'invalid' && w.calls.length === 1, r);
  r = await w.fn('followTaskSchedule')(null, '2026-10-16');
  check('no Task reference, no request', r.ok === false && r.reason === 'invalid' && w.calls.length === 1, r);
  w = load({ stored: auth, routes: [[TASKS, { method: 'PATCH', reply: status(404) }]] });
  r = await w.fn('followTaskSchedule')({ taskListId: 'LIST1', taskId: 'GONE' }, '2026-10-16');
  check('a deleted Task is reported as gone, so the caller can make a new one', r.ok === false && r.reason === 'gone', r);
  w = load({ stored: auth, routes: [[TASKS, { method: 'PATCH', reply: status(403) }]] });
  r = await w.fn('followTaskSchedule')({ taskListId: 'LIST1', taskId: 'T1' }, '2026-10-16');
  check('a revoked grant reads as not-connected', r.reason === 'not-connected', r);
  w = load({ stored: auth, routes: [[TASKS, { method: 'PATCH', reply: ok({}) }]] });
  r = await w.fn('followTaskReopen')({ taskListId: 'LIST1', taskId: 'T1' }, '2026-10-13');
  const reopened = w.calls[0];
  check('reopening makes the Task open again on the new day', r.ok && reopened.body.status === 'needsAction' && reopened.body.completed === null && reopened.body.due === '2026-10-13T00:00:00.000Z', { r, reopened });
  r = await w.fn('followTaskReopen')({ taskListId: 'LIST1', taskId: 'T1' }, null);
  check('reopening without a day still reopens', r.ok && w.calls[1].body.status === 'needsAction' && !('due' in w.calls[1].body), w.calls[1]);

  // nudge draft
  const watch = F.buildWatch({ threadId: 't', messageId: 'm', subject: 'Vendor booking', counterpart: { email: 'dana@acme.com', name: 'Dana Cole' }, ask: F.classifyOutgoing('Please confirm the final figure by Monday so I can book the vendor.', { now: new Date(2026, 9, 1, 12).getTime(), extract: FlowExtract }), now: 1 });
  w = load({ stored: auth, routes: [
    [/gmail\.googleapis\.com.*\/threads\?/, { reply: ok({ threads: [{ id: 'THREAD9' }] }) }],
    [/gmail\.googleapis\.com.*\/drafts$/, { method: 'POST', reply: ok({ id: 'D1' }) }]
  ] });
  r = await w.fn('followDraftCreate')({ to: 'dana@acme.com', toName: 'Dana Cole', subject: 'Vendor booking', body: F.nudgeText(watch) });
  const search = w.calls.find((c) => /threads\?/.test(c.url));
  const draft = w.calls.find((c) => /\/drafts$/.test(c.url));
  const mime = decodeRaw(draft.body.message.raw);
  check('it looks for the thread by RECIPIENT (the account wrote last)', search && /q=to%3Adana%40acme\.com/.test(search.url), search && search.url);
  check('the draft is filed into that thread', draft.body.message.threadId === 'THREAD9', draft.body);
  check('the draft is addressed to the counterpart with a Re: subject', /^To: .*dana@acme\.com/m.test(mime) && /^Subject: Re: Vendor booking/m.test(mime), mime.slice(0, 200));
  const bodyText = Buffer.from(mime.split('\r\n\r\n').slice(1).join('').replace(/\s+/g, ''), 'base64').toString('utf8');
  check('its body is the nudge text, restating the earlier ask', /^Hi Dana,/.test(bodyText) && /confirm the final figure/.test(bodyText), bodyText);
  check('it is saved as a draft, never sent', w.calls.every((c) => !/messages\/send|drafts\/send/.test(c.url)) && r.ok && r.ref.draftId === 'D1', { r, calls: w.calls.map((c) => c.url) });
  r = await w.fn('followDraftCreate')({ to: '', body: 'x' });
  check('no recipient, no draft', r.ok === false && r.reason === 'invalid', r);
  w = load({ stored: auth, routes: [[/threads\?/, { reply: ok({ threads: [] }) }], [/\/drafts$/, { method: 'POST', reply: ok({ id: 'D2' }) }]] });
  r = await w.fn('followDraftCreate')({ to: 'dana@acme.com', subject: '', body: 'Hi' });
  const d2 = w.calls.find((c) => /\/drafts$/.test(c.url));
  check('with no thread found, a standalone draft is still made', r.ok && !('threadId' in d2.body.message), d2.body);

  // a draft with a file: the one in the thread, or the one Drive file. Never a claim without a file.
  const bytes = (str) => ({ ok: true, status: 200, arrayBuffer: async () => Buffer.from(str).buffer.slice(0, Buffer.from(str).length) });
  const gmailRoutes = [[/gmail\.googleapis\.com.*\/threads\?/, { reply: ok({ threads: [{ id: 'THREAD9' }] }) }], [/gmail\.googleapis\.com.*\/drafts$/, { method: 'POST', reply: ok({ id: 'D3' }) }]];
  w = load({ stored: auth, routes: gmailRoutes });
  r = await w.fn('followDraftCreate')({ to: 'dana@acme.com', toName: 'Dana Cole', subject: 'Contract', body: 'Hi Dana,\n\nAttached: contract.pdf', attachment: { filename: 'contract.pdf', mimeType: 'application/pdf', base64: Buffer.from('PDFBYTES').toString('base64') } });
  let d3 = w.calls.find((c) => /\/drafts$/.test(c.url));
  let m3 = decodeRaw(d3.body.message.raw);
  check('a thread attachment becomes a multipart draft with that file name', r.ok && r.attached === 'contract.pdf' && /multipart\/mixed/.test(m3) && /filename="contract\.pdf"/.test(m3), { r, m3: m3.slice(0, 300) });
  check('it is still only a draft', w.calls.every((c) => !/messages\/send|drafts\/send/.test(c.url)));
  w = load({ stored: auth, routes: gmailRoutes.concat([
    [/drive\/v3\/files\/F1\?fields=/, { reply: ok({ name: 'Receipt - Oct.pdf', mimeType: 'application/pdf', size: '8' }) }],
    [/drive\/v3\/files\/F1\?alt=media/, { reply: bytes('RECEIPT!') }]
  ]) });
  r = await w.fn('followDraftCreate')({ to: 'dana@acme.com', subject: 'Receipt', body: 'Hi', driveFileId: 'F1' });
  d3 = w.calls.find((c) => /\/drafts$/.test(c.url));
  m3 = d3 ? decodeRaw(d3.body.message.raw) : '';
  check('a Drive file is read by the worker and attached', r.ok && r.attached === 'Receipt - Oct.pdf' && /filename="Receipt - Oct\.pdf"/.test(m3), { r, m3: m3.slice(0, 300) });
  w = load({ stored: auth, routes: gmailRoutes.concat([
    [/drive\/v3\/files\/F2\?fields=/, { reply: ok({ name: 'Big.pdf', mimeType: 'application/pdf', size: String(50 * 1024 * 1024) }) }]
  ]) });
  r = await w.fn('followDraftCreate')({ to: 'dana@acme.com', subject: 'Receipt', body: 'Hi, attached', driveFileId: 'F2' });
  check('a file that cannot be read writes NO draft (the body claims one is attached)', r.ok === false && r.reason === 'attach' && !w.calls.some((c) => /\/drafts$/.test(c.url)), { r, calls: w.calls.map((c) => c.url) });
  w = load({ stored: auth, routes: gmailRoutes });
  r = await w.fn('followDraftCreate')({ to: 'dana@acme.com', subject: 'Contract', body: 'Hi', attachment: { filename: 'big.bin', mimeType: 'application/octet-stream', base64: 'A'.repeat(12 * 1024 * 1024) } });
  check('an oversized thread attachment also writes no draft', r.ok === false && r.reason === 'attach' && !w.calls.some((c) => /\/drafts$/.test(c.url)), r);
  w = load({ stored: auth, routes: gmailRoutes });
  r = await w.fn('followDraftCreate')({ to: 'dana@acme.com', subject: 'Contract', body: 'Hi' });
  check('no file requested: the plain draft is unchanged', r.ok && r.attached === null && !/multipart/.test(decodeRaw(w.calls.find((c) => /\/drafts$/.test(c.url)).body.message.raw)), r);
}

(async () => {
  await storageTests();
  await backgroundTests();
  console.log('\nTOTAL FAILURES: ' + failures);
  process.exit(failures ? 1 : 0);
})();
