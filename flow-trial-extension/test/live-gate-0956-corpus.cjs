// Live gate 0.9.56. Do It writes a Graph-shaped To Do task, the receipt keeps
// that content snapshot, a reload paints done + Undo, and Undo deletes only
// when the content still matches. A renamed title is left alone. Hold It on
// a meeting mail creates one event and the card changes.
// Run: node test/live-gate-0956-corpus.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { webcrypto } = require('crypto');

let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch (e) {
  console.error('FAIL: jsdom is not installed. The live-gate corpus cannot run.');
  process.exit(1);
}

const ROOT = path.join(__dirname, '..');
const ME = 'glance.salisapan@outlook.com';
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail).slice(0, 800) : ''); }
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
        grantedScopes: ['Mail.Read', 'Mail.ReadWrite', 'Tasks.ReadWrite', 'Calendars.ReadWrite', 'offline_access', 'User.Read']
      },
      account: { address: ME },
      requestedScopes: ['offline_access', 'User.Read', 'Mail.Read', 'Mail.ReadWrite', 'Tasks.ReadWrite', 'Calendars.ReadWrite']
    },
    outlookSync: {}
  };
  const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
  const routes = opts.routes || [];
  const sandbox = {
    console, URLSearchParams, URL, TextEncoder, Uint8Array, crypto: webcrypto,
    btoa: (s) => Buffer.from(String(s), 'binary').toString('base64'),
    atob: (s) => Buffer.from(String(s), 'base64').toString('binary'),
    setTimeout, clearTimeout,
    fetch: async (url, init) => {
      const method = (init && init.method) || 'GET';
      let body = null;
      try { body = init && init.body ? JSON.parse(init.body) : null; } catch (e) { body = init && init.body; }
      calls.push({ method, url: String(url), body });
      for (const route of routes) {
        if (route.method === method && route.test.test(String(url))) return route.reply(body, calls);
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

function graphTask(over) {
  return Object.assign({
    '@odata.etag': 'W/"created-etag"',
    id: 'TASK-LIVE',
    title: 'Renew the parking permit',
    status: 'notStarted',
    importance: 'normal',
    body: { contentType: 'html', content: '<html><body>What: Renew the parking permit</body></html>' },
    dueDateTime: { dateTime: '2026-10-20T00:00:00.0000000', timeZone: 'UTC' },
    lastModifiedDateTime: '2026-10-15T01:00:00.000Z',
    createdDateTime: '2026-10-15T01:00:00.000Z'
  }, over || {});
}

function listsRoute() {
  return { method: 'GET', test: /\/me\/todo\/lists$/, reply: () => ({ ok: true, status: 200, json: async () => ({ value: [{ id: 'DEF', wellknownListName: 'defaultList' }] }), text: async () => '' }) };
}

(async () => {
  console.log('\n--- Do It writes a content snapshot, and Undo uses it ---\n');
  let reads = 0;
  const fresh = background({ routes: [
    listsRoute(),
    { method: 'POST', test: /\/lists\/DEF\/tasks$/, reply: () => ({ ok: true, status: 201, json: async () => graphTask({ lastModifiedDateTime: '2026-10-15T01:00:00.000Z', '@odata.etag': 'W/"post"' }), text: async () => '' }) },
    { method: 'GET', test: /\/lists\/DEF\/tasks\/TASK-LIVE$/, reply: () => {
      reads += 1;
      const bumped = graphTask({ lastModifiedDateTime: '2026-10-15T01:00:0' + reads + '.000Z', '@odata.etag': 'W/"get-' + reads + '"' });
      return { ok: true, status: 200, json: async () => bumped, text: async () => '' };
    } }
  ] });
  const wrote = await fresh.fn('outlookTaskWrite')({
    label: 'Renew the parking permit',
    params: { title: 'Renew the parking permit', dateIso: '2026-10-20' },
    text: 'What: Renew the parking permit',
    now: '2026-10-15T09:00:00.000Z'
  });
  const snap = wrote && wrote.ref && wrote.ref.created;
  check('Do It stores a content snapshot on the receipt ref',
    wrote && wrote.ok === true && snap && snap.title === 'Renew the parking permit' &&
    snap.body && snap.dueDateTime === '2026-10-20T00:00:00' && snap.status === 'notStarted' &&
    snap.lastModifiedDateTime == null && snap.changeKey == null && snap.eTag == null,
    { ok: wrote && wrote.ok, reason: wrote && wrote.reason, snap });

  let undoReads = 0;
  const clean = background({ routes: [
    { method: 'GET', test: /\/tasks\/TASK-LIVE$/, reply: () => {
      undoReads += 1;
      if (undoReads === 1) {
        return { ok: true, status: 200, json: async () => graphTask({ lastModifiedDateTime: '2026-10-15T02:00:00.000Z', '@odata.etag': 'W/"later"' }), text: async () => '' };
      }
      return { ok: false, status: 404, json: async () => ({ error: { code: 'ErrorItemNotFound' } }), text: async () => '' };
    } },
    { method: 'DELETE', test: /\/tasks\/TASK-LIVE$/, reply: () => ({ ok: true, status: 204, json: async () => ({}), text: async () => '' }) }
  ] });
  const undone = await clean.fn('outlookTaskUndo')(wrote.ref, { created: snap });
  check('an unedited task is Undone after DELETE and a confirming GET 404',
    undone && undone.ok === true && undone.fetchedBack === true && /^Undone\. /.test(undone.written || '') &&
    clean.calls.some((c) => c.method === 'DELETE'),
    undone);

  const renamed = background({ routes: [
    { method: 'GET', test: /\/tasks\/TASK-LIVE$/, reply: () => ({ ok: true, status: 200, json: async () => graphTask({ title: 'Renew the parking permit RENAMED', lastModifiedDateTime: '2026-10-15T03:00:00.000Z', '@odata.etag': 'W/"renamed"' }), text: async () => '' }) },
    { method: 'DELETE', test: /\/tasks\/TASK-LIVE$/, reply: () => ({ ok: true, status: 204, json: async () => ({}), text: async () => '' }) }
  ] });
  const kept = await renamed.fn('outlookTaskUndo')(wrote.ref, { created: snap });
  check('a renamed title says you edited it and does not delete',
    kept && kept.ok === false && kept.reason === 'user-edited' &&
    kept.written === 'You edited this. Undo left it alone.' &&
    !renamed.calls.some((c) => c.method === 'DELETE'),
    kept);

  const pageSrc = fs.readFileSync(path.join(ROOT, 'src/content-outlook.js'), 'utf8');
  check('the card Undo sends the creation snapshot with the receipt ref',
    pageSrc.indexOf('created: (copy.ref && copy.ref.created)') > 0 && pageSrc.indexOf('copy.ref.created = keptSnap') > 0);

  console.log('\n--- Do It, receipt, remount, Undo ---\n');
  const proofSrc = fs.readFileSync(path.join(ROOT, 'core/proof-of-close.js'), 'utf8');
  const proofBox = { console };
  vm.createContext(proofBox);
  vm.runInContext(proofSrc, proofBox, { filename: 'proof-of-close.js' });
  const Proof = proofBox.FlowProofOfClose;
  const sameWords = fresh.fn('FlowNativeEdit.userEdited')(
    { title: 'Renew the parking permit', body: 'What: Renew the parking permit\r\nThanks' },
    { title: 'Renew the parking permit', body: { contentType: 'html', content: '<p>What: Renew the parking permit\nThanks</p>' }, lastModifiedDateTime: '2099-01-01T00:00:00.000Z', '@odata.etag': 'W/"later"', changeKey: 'ck' }
  );
  check('HTML and CRLF are the same words, and a new etag is not an edit', sameWords === false, sameWords);

  const storedRow = JSON.parse(JSON.stringify({
    kind: 'written',
    connectorId: 'outlookTask',
    system: 'microsoft/todo',
    externalId: wrote.ref.taskId,
    fetchedBack: true,
    verifiedAt: wrote.proof && wrote.proof.verifiedAt,
    ref: wrote.ref,
    created: wrote.ref.created,
    writtenLine: wrote.written
  }));
  const logged = Proof.receiptLogFields(wrote.proof, { writtenLine: wrote.written, status: 'Handled.', created: storedRow.created });
  const remounted = Proof.remountCopy(Object.assign({}, storedRow, logged));
  check('remountCopy carries the snapshot Undo needs',
    remounted && remounted.ref && remounted.ref.created &&
    remounted.ref.created.title === snap.title &&
    remounted.ref.created.body && snap.body && remounted.ref.created.body.hash === snap.body.hash &&
    remounted.ref.created.dueDateTime === snap.dueDateTime &&
    remounted.ref.created.lastModifiedDateTime == null,
    remounted && remounted.ref);
  const remountUndo = background({ routes: [
    { method: 'GET', test: /\/tasks\/TASK-LIVE$/, reply: (() => {
      let n = 0;
      return () => {
        n += 1;
        if (n === 1) return { ok: true, status: 200, json: async () => graphTask({ lastModifiedDateTime: '2026-10-15T05:00:00.000Z', '@odata.etag': 'W/"remount"' }), text: async () => '' };
        return { ok: false, status: 404, json: async () => ({ error: { code: 'ErrorItemNotFound' } }), text: async () => '' };
      };
    })() },
    { method: 'DELETE', test: /\/tasks\/TASK-LIVE$/, reply: () => ({ ok: true, status: 204, json: async () => ({}), text: async () => '' }) }
  ] });
  const fromRemount = await remountUndo.fn('outlookTaskUndo')(remounted.ref);
  check('Undo after remount deletes an unedited task',
    fromRemount && fromRemount.ok === true && fromRemount.fetchedBack === true &&
    remountUndo.calls.some((c) => c.method === 'DELETE') &&
    remountUndo.calls.filter((c) => c.method === 'GET').length >= 1,
    fromRemount);

  console.log('\n--- Hold It writes one meeting event ---\n');
  const meet = background({ routes: [
    { method: 'POST', test: /\/me\/events$/, reply: () => ({ ok: true, status: 201, json: async () => ({
      id: 'EV-BUDGET',
      subject: 'CREATED-STUB',
      body: { contentType: 'text', content: 'stub from the 201' },
      webLink: 'https://outlook.live.com/calendar/item/EV-BUDGET',
      '@odata.etag': 'W/"ev-201"',
      changeKey: 'ck-201',
      lastModifiedDateTime: '2026-10-15T04:00:00.000Z'
    }), text: async () => '' }) },
    { method: 'GET', test: /\/me\/events\/EV-BUDGET/, reply: () => ({ ok: true, status: 200, json: async () => ({
      id: 'EV-BUDGET',
      subject: 'Budget review',
      body: { contentType: 'html', content: '<html><body>Budget review tomorrow at 10:00.</body></html>' },
      start: { dateTime: '2026-10-16T10:00:00.0000000', timeZone: 'UTC' },
      end: { dateTime: '2026-10-16T10:30:00.0000000', timeZone: 'UTC' },
      location: { displayName: 'Room 4' },
      '@odata.etag': 'W/"ev-get"',
      changeKey: 'ck-get',
      lastModifiedDateTime: '2026-10-15T04:00:05.000Z'
    }), text: async () => '' }) }
  ] });
  const held = await meet.fn('outlookCalendarWrite')({
    params: { meeting: true, title: 'Budget review', dateIso: '2026-10-16', hour: 10, minute: 0, quote: 'Budget review tomorrow at 10:00.' }
  });
  const post = meet.calls.filter((c) => c.method === 'POST' && /\/me\/events$/.test(c.url))[0];
  const eventGet = meet.calls.filter((c) => c.method === 'GET' && /\/me\/events\/EV-BUDGET/.test(c.url));
  check('Hold It creates one event and keeps a content snapshot',
    held && held.ok === true && held.ref && held.ref.eventId === 'EV-BUDGET' &&
    held.ref.created && held.ref.created.subject === 'Budget review' &&
    held.ref.created.location === 'Room 4' && held.ref.created.start &&
    held.ref.created.subject !== 'CREATED-STUB' &&
    held.ref.created.lastModifiedDateTime == null && held.ref.created.changeKey == null &&
    eventGet.length === 1 &&
    post && post.body && post.body.subject === 'Budget review' &&
    Array.isArray(post.body.attendees) && post.body.attendees.length === 0 && post.body.isOnlineMeeting == null,
    { held, gets: eventGet.length, attendees: post && post.body && post.body.attendees });
  const calStored = JSON.parse(JSON.stringify(held.ref));
  const calClean = background({ routes: [
    { method: 'GET', test: /\/me\/events\/EV-BUDGET$/, reply: () => ({ ok: true, status: 200, json: async () => ({
      id: 'EV-BUDGET', subject: 'Budget review',
      body: { contentType: 'html', content: '<p>Budget review tomorrow at 10:00.</p>' },
      start: { dateTime: '2026-10-16T10:00:00.0000000', timeZone: 'UTC' },
      end: { dateTime: '2026-10-16T10:30:00.0000000', timeZone: 'UTC' },
      location: { displayName: 'Room 4' },
      '@odata.etag': 'W/"ev-undo"', lastModifiedDateTime: '2026-10-15T06:00:00.000Z'
    }), text: async () => '' }) },
    { method: 'DELETE', test: /\/me\/events\/EV-BUDGET$/, reply: () => ({ ok: true, status: 204, json: async () => ({}), text: async () => '' }) }
  ] });
  const calUndone = await calClean.fn('outlookCalendarUndo')(calStored);
  check('an unedited event deletes after the stored snapshot is reloaded',
    calUndone && calUndone.ok === true && calClean.calls.some((c) => c.method === 'DELETE'),
    calUndone);
  const calEdited = background({ routes: [
    { method: 'GET', test: /\/me\/events\/EV-BUDGET$/, reply: () => ({ ok: true, status: 200, json: async () => ({
      id: 'EV-BUDGET', subject: 'Budget review moved',
      body: { contentType: 'html', content: '<p>Budget review tomorrow at 10:00.</p>' },
      start: { dateTime: '2026-10-16T10:00:00.0000000', timeZone: 'UTC' },
      end: { dateTime: '2026-10-16T10:30:00.0000000', timeZone: 'UTC' },
      location: { displayName: 'Room 4' },
      '@odata.etag': 'W/"ev-edit"', lastModifiedDateTime: '2026-10-15T07:00:00.000Z'
    }), text: async () => '' }) },
    { method: 'DELETE', test: /\/me\/events\/EV-BUDGET$/, reply: () => ({ ok: true, status: 204, json: async () => ({}), text: async () => '' }) }
  ] });
  const calKept = await calEdited.fn('outlookCalendarUndo')(calStored);
  check('an edited event says you edited it and does not delete',
    calKept && calKept.ok === false && calKept.reason === 'user-edited' &&
    calKept.written === 'You edited this. Undo left it alone.' &&
    !calEdited.calls.some((c) => c.method === 'DELETE'),
    calKept);

  console.log('\n--- a reply draft survives reload, then Undo ---\n');
  const draftBg = background({ routes: [
    { method: 'POST', test: /\/createReply$/, reply: () => ({ ok: true, status: 201, json: async () => ({
      id: 'DRAFT-1', isDraft: true, subject: 'RE: Q3 summary',
      toRecipients: [{ emailAddress: { address: 'dana@example.com' } }],
      body: { contentType: 'html', content: '<html>createReply stub</html>' },
      '@odata.etag': 'W/"d-201"', changeKey: 'd-ck', lastModifiedDateTime: '2026-10-15T08:00:00.000Z'
    }), text: async () => '' }) },
    { method: 'PATCH', test: /\/me\/messages\/DRAFT-1$/, reply: () => ({ ok: true, status: 200, json: async () => ({ id: 'DRAFT-1' }), text: async () => '' }) },
    { method: 'GET', test: /\/me\/messages\/DRAFT-1/, reply: () => ({ ok: true, status: 200, json: async () => ({
      id: 'DRAFT-1', isDraft: true, subject: 'RE: Q3 summary',
      toRecipients: [{ emailAddress: { address: 'Dana@example.com' } }],
      body: { contentType: 'html', content: '<html><body>Thanks, I will confirm.</body></html>' },
      '@odata.etag': 'W/"d-get"', changeKey: 'd-get', lastModifiedDateTime: '2026-10-15T08:00:02.000Z'
    }), text: async () => '' }) }
  ] });
  const drafted = await draftBg.fn('outlookDraftWrite')({
    messageId: 'MSG-Q3',
    comment: 'Thanks, I will confirm.',
    subject: 'Q3 summary'
  });
  const draftRow = JSON.parse(JSON.stringify({ ref: drafted && drafted.ref, created: drafted && drafted.created }));
  check('Do It stores a draft snapshot beside the id',
    drafted && drafted.ok === true && draftRow.ref === 'DRAFT-1' &&
    draftRow.created && draftRow.created.body && draftRow.created.body.prefix === 'Thanks, I will confirm.' &&
    draftRow.created.subject === 'RE: Q3 summary' &&
    draftRow.created.lastModifiedDateTime == null && draftRow.created.changeKey == null,
    drafted);
  const draftClean = background({ routes: [
    { method: 'GET', test: /\/me\/messages\/DRAFT-1/, reply: () => ({ ok: true, status: 200, json: async () => ({
      id: 'DRAFT-1', isDraft: true, subject: 'RE: Q3 summary',
      toRecipients: [{ emailAddress: { address: 'dana@example.com' } }],
      body: { contentType: 'html', content: '<p>Thanks, I will confirm.</p>' },
      '@odata.etag': 'W/"d-undo"', lastModifiedDateTime: '2026-10-15T09:00:00.000Z', changeKey: 'later'
    }), text: async () => '' }) },
    { method: 'DELETE', test: /\/me\/messages\/DRAFT-1$/, reply: () => ({ ok: true, status: 204, json: async () => ({}), text: async () => '' }) }
  ] });
  const draftUndone = await draftClean.fn('outlookDraftUndo')(draftRow.ref, { created: draftRow.created });
  check('an unedited draft deletes after the receipt is reloaded',
    draftUndone && draftUndone.ok === true && draftClean.calls.some((c) => c.method === 'DELETE'),
    draftUndone);
  const draftEdited = background({ routes: [
    { method: 'GET', test: /\/me\/messages\/DRAFT-1/, reply: () => ({ ok: true, status: 200, json: async () => ({
      id: 'DRAFT-1', isDraft: true, subject: 'RE: Q3 summary',
      toRecipients: [{ emailAddress: { address: 'dana@example.com' } }],
      body: { contentType: 'html', content: '<p>I typed this myself.</p>' },
      '@odata.etag': 'W/"d-edit"', lastModifiedDateTime: '2026-10-15T09:30:00.000Z'
    }), text: async () => '' }) },
    { method: 'DELETE', test: /\/me\/messages\/DRAFT-1$/, reply: () => ({ ok: true, status: 204, json: async () => ({}), text: async () => '' }) }
  ] });
  const draftKept = await draftEdited.fn('outlookDraftUndo')(draftRow.ref, { created: draftRow.created });
  check('an edited draft says you edited it and does not delete',
    draftKept && draftKept.ok === false && draftKept.reason === 'user-edited' &&
    draftKept.written === 'You edited this. Undo left it alone.' &&
    !draftEdited.calls.some((c) => c.method === 'DELETE'),
    draftKept);
  const cleanupAt = pageSrc.indexOf("pageReason('outlook:file-found-no-attach'");
  const cleanupUndo = pageSrc.lastIndexOf("type: 'flow:undo-action'", cleanupAt);
  check('a failed attach undoes the draft with its snapshot',
    cleanupUndo > 0 && pageSrc.slice(cleanupUndo, cleanupAt).indexOf('created: r.created') > 0);

  console.log('\n--- the open mail keeps done + Undo after a reload ---\n');
  const draftPage = await boot({
    id: 'MSG-Q3-RELOAD',
    subject: 'Gate A 0.9.41 – Q3 summary',
    body: 'Hi,\nCan you reply and confirm whether the Q3 summary will include the October numbers?\nThanks,\nFlow'
  });
  const host = await waitCard(draftPage);
  check('the reply mail shows a card', Boolean(host), { text: chipText(draftPage.doc) });
  const go = host && (host.querySelector('.do-halo') || host.querySelector('button.flow-chip'));
  if (go) go.click();
  const undo = await waitFor(draftPage.doc, '.flow-chip-undo', 4000);
  check('Do It leaves the card on done, with Undo',
    Boolean(undo) && /Draft ready|Reply draft ready|Not sent/i.test(chipText(draftPage.doc)) && !draftPage.doc.querySelector('.do-halo'),
    { text: chipText(draftPage.doc) });
  const reloaded = await boot({
    id: 'MSG-Q3-RELOAD',
    subject: 'Gate A 0.9.41 – Q3 summary',
    body: 'Hi,\nCan you reply and confirm whether the Q3 summary will include the October numbers?\nThanks,\nFlow',
    store: JSON.parse(JSON.stringify(draftPage.store))
  });
  const undoAgain = await waitFor(reloaded.doc, '.flow-chip-undo', 4000);
  check('a reload restores done and Undo from the receipt',
    Boolean(undoAgain) && /Draft ready|Reply draft ready|Not sent/i.test(chipText(reloaded.doc)) && !reloaded.doc.querySelector('.do-halo'),
    { text: chipText(reloaded.doc), log: (reloaded.store.log || []).map((e) => e && e.kind + ':' + e.connectorId) });
  draftPage.w.close();
  reloaded.w.close();

  console.log('\n--- Hold It on a meeting mail changes the card ---\n');
  const meetPage = await boot({
    id: 'MSG-BUDGET-REVIEW',
    subject: 'Budget review',
    body: 'Hi,\nCan you reply and confirm whether we can meet tomorrow at 10:00 to review the budget?\nThanks,\nFlow'
  });
  const meetHost = await waitCard(meetPage);
  const holdBtn = meetHost && meetHost.querySelector('.chip-hold');
  check('the budget-review mail shows Hold It', Boolean(holdBtn), { text: chipText(meetPage.doc) });
  if (holdBtn) holdBtn.click();
  const changed = await waitFor(meetPage.doc, '.flow-chip-undo', 4000);
  const cal = meetPage.sent.filter((m) => m.type === 'flow:execute-action' && m.payload && m.payload.connectorId === 'outlookCalendar');
  check('Hold It creates the event and the card shows done with Undo',
    Boolean(changed) && cal.length === 1 && cal[0].payload.params && cal[0].payload.params.meeting === true &&
    /Handled|Calendar/i.test(chipText(meetPage.doc)),
    { text: chipText(meetPage.doc), cal: cal.map((m) => m.payload && m.payload.params) });
  meetPage.w.close();

  console.log('\n--- the card and Loops read one proof record ---\n');
  const parkStore = parkProofStore();
  const park = await boot({
    id: 'MSG-PARK',
    subject: 'Parking permit - please renew by Sunday',
    body: 'Please renew the parking permit by Sunday.\nThanks',
    store: parkStore
  });
  const parkUndo = await waitFor(park.doc, '.flow-chip-undo', 4000);
  check('a reload shows Handled, the receipt, and Undo',
    Boolean(parkUndo) && /Handled/i.test(chipText(park.doc)) && !park.doc.querySelector('.do-halo'),
    { text: chipText(park.doc) });
  const away = park.w.location.href.replace('MSG-PARK', 'MSG-OTHER');
  park.w.history.pushState({}, '', away);
  const left = await waitForGone(park.doc, 'Renew the parking permit', 4000);
  check('switching mail leaves this receipt', left, { text: chipText(park.doc) });
  park.w.history.pushState({}, '', park.w.location.href.replace('MSG-OTHER', 'MSG-PARK'));
  const backUndo = await waitFor(park.doc, '.flow-chip-undo', 4000);
  check('switching back restores Handled and Undo from the same record',
    Boolean(backUndo) && /Handled/i.test(chipText(park.doc)) && !park.doc.querySelector('.do-halo'),
    { text: chipText(park.doc) });
  park.w.close();

  const editedStore = parkProofStore();
  const edited = await boot({
    id: 'MSG-PARK',
    subject: 'Parking permit - please renew by Sunday',
    body: 'Please renew the parking permit by Sunday.\nThanks',
    store: editedStore,
    undo: () => ({ ok: false, reason: 'user-edited', written: 'You edited this. Undo left it alone.' })
  });
  const editedBtn = await waitFor(edited.doc, '.flow-chip-undo', 4000);
  if (editedBtn) editedBtn.click();
  const editedLine = await waitForText(edited.doc, 'You edited this', 4000);
  check('a refused Undo says You edited this', editedLine, { text: chipText(edited.doc) });
  const editedAgain = await boot({
    id: 'MSG-PARK',
    subject: 'Parking permit - please renew by Sunday',
    body: 'Please renew the parking permit by Sunday.\nThanks',
    store: JSON.parse(JSON.stringify(edited.store)),
    undo: () => ({ ok: false, reason: 'user-edited', written: 'You edited this. Undo left it alone.' })
  });
  const editedKept = await waitForText(editedAgain.doc, 'You edited this', 4000);
  check('a refused Undo is still shown after reopen',
    editedKept && Boolean(editedAgain.doc.querySelector('.flow-chip-undo')) &&
    chipText(editedAgain.doc).indexOf('Undo removes the To Do task.') < 0,
    { text: chipText(editedAgain.doc), record: editedAgain.store.glanceProofs && editedAgain.store.glanceProofs.records['MSG-PARK'] });
  edited.w.close();
  editedAgain.w.close();

  const deleted = await boot({
    id: 'MSG-PARK',
    subject: 'Parking permit - please renew by Sunday',
    body: 'Please renew the parking permit by Sunday.\nThanks',
    store: parkProofStore(),
    reconcile: () => ({ ok: false, status: 404 })
  });
  const deletedLine = await waitForText(deleted.doc, 'Deleted in To Do', 4000);
  check('a manual delete on reopen says Deleted in To Do and drops Undo',
    deletedLine && !deleted.doc.querySelector('.flow-chip-undo'),
    { text: chipText(deleted.doc) });
  const deletedRec = deleted.store.glanceProofs && deleted.store.glanceProofs.records['MSG-PARK'];
  check('the delete is stored on the proof record', Boolean(deletedRec && deletedRec.deleted === true), deletedRec);
  deleted.w.close();

  const shaky = await boot({
    id: 'MSG-PARK',
    subject: 'Parking permit - please renew by Sunday',
    body: 'Please renew the parking permit by Sunday.\nThanks',
    store: parkProofStore(),
    reconcile: () => ({ ok: false, status: 500 })
  });
  const shakyLine = await waitForText(shaky.doc, "couldn't verify", 4000);
  const shakyRec = shaky.store.glanceProofs && shaky.store.glanceProofs.records['MSG-PARK'];
  check('a Graph error keeps Handled and Undo and says couldn\'t verify',
    shakyLine && /Handled/i.test(chipText(shaky.doc)) && Boolean(shaky.doc.querySelector('.flow-chip-undo')) &&
    shakyRec && shakyRec.deleted !== true,
    { text: chipText(shaky.doc), record: shakyRec });
  shaky.w.close();

  console.log('\n--- Hold without calendar scope asks, then finishes ---\n');
  const noCal = mailOnlyStore();
  const oncePage = await boot({
    id: 'MSG-BUDGET-REVIEW',
    subject: 'Budget review',
    body: 'Hi,\nCan you reply and confirm whether we can meet tomorrow at 10:00 to review the budget?\nThanks,\nFlow',
    store: noCal
  });
  const onceHost = await waitCard(oncePage);
  const onceHold = onceHost && onceHost.querySelector('.chip-hold');
  if (onceHold) onceHold.click();
  const onceBtn = await waitFor(oncePage.doc, '[data-glance-consent-choice="once"]', 4000);
  check('Hold without calendar asks Once, Always, and Not now',
    Boolean(onceBtn) && onceBtn.textContent === 'אפשר פעם אחת' &&
    onceBtn.classList.contains('capture-secondary') &&
    !onceBtn.classList.contains('do-halo') && !onceBtn.classList.contains('flow-chip') &&
    !onceBtn.querySelector('.shell') &&
    oncePage.doc.querySelector('[data-glance-consent-choice="always"]').textContent === 'אפשר תמיד' &&
    oncePage.doc.querySelector('[data-glance-consent-choice="not-now"]').textContent === 'לא עכשיו' &&
    /צריך הרשאה ליומן/.test(chipText(oncePage.doc)) &&
    !/Calendar needs/.test(chipText(oncePage.doc)),
    { text: chipText(oncePage.doc) });
  if (onceBtn) onceBtn.click();
  const onceDone = await waitFor(oncePage.doc, '.flow-chip-undo', 4000);
  const onceConsent = oncePage.sent.filter((m) => m.type === 'flow:outlook-consent-scope');
  const onceCal = oncePage.sent.filter((m) => m.type === 'flow:execute-action' && m.payload && m.payload.connectorId === 'outlookCalendar');
  const onceLogged = (oncePage.store.log || []).some((e) => e && e.label === 'הרשאת יומן: פעם אחת');
  check('Once consents only Calendars.ReadWrite and the hold finishes',
    Boolean(onceDone) && onceConsent.length === 1 && onceConsent[0].scope === 'Calendars.ReadWrite' && onceConsent[0].policy === 'once' &&
    onceCal.length === 1 && onceLogged && /Handled|Calendar/i.test(chipText(oncePage.doc)),
    { text: chipText(oncePage.doc), consent: onceConsent, cal: onceCal.length, log: oncePage.store.log });
  const onceKept = {
    outlookAuth: JSON.parse(JSON.stringify(oncePage.store.outlookAuth)),
    glanceCalendarConsent: JSON.parse(JSON.stringify(oncePage.store.glanceCalendarConsent))
  };
  const onceAgain = await boot({
    id: 'MSG-BUDGET-NEXT',
    subject: 'Budget review next',
    body: 'Hi,\nCan you reply and confirm whether we can meet tomorrow at 10:00 to review the budget?\nThanks,\nFlow',
    store: onceKept
  });
  const onceHost2 = await waitCard(onceAgain);
  const onceHold2 = onceHost2 && onceHost2.querySelector('.chip-hold');
  if (onceHold2) onceHold2.click();
  const onceAsked = await waitFor(onceAgain.doc, '[data-glance-consent-choice="once"]', 4000);
  check('Once asks again the next time, even though the scope stays granted',
    Boolean(onceAsked) && onceAgain.store.glanceCalendarConsent && onceAgain.store.glanceCalendarConsent.mode === 'once',
    { text: chipText(onceAgain.doc), policy: onceAgain.store.glanceCalendarConsent });
  oncePage.w.close();
  onceAgain.w.close();

  const alwaysPage = await boot({
    id: 'MSG-BUDGET-REVIEW',
    subject: 'Budget review',
    body: 'Hi,\nCan you reply and confirm whether we can meet tomorrow at 10:00 to review the budget?\nThanks,\nFlow',
    store: mailOnlyStore()
  });
  const alwaysHost = await waitCard(alwaysPage);
  const alwaysHold = alwaysHost && alwaysHost.querySelector('.chip-hold');
  if (alwaysHold) alwaysHold.click();
  const alwaysBtn = await waitFor(alwaysPage.doc, '[data-glance-consent-choice="always"]', 4000);
  if (alwaysBtn) alwaysBtn.click();
  const alwaysDone = await waitFor(alwaysPage.doc, '.flow-chip-undo', 4000);
  const alwaysLogged = (alwaysPage.store.log || []).some((e) => e && e.reason === 'calendar-consent-always' && e.label === 'הרשאת יומן: תמיד');
  check('Always is stored and logged, then the hold finishes',
    Boolean(alwaysDone) && alwaysPage.store.glanceCalendarConsent && alwaysPage.store.glanceCalendarConsent.mode === 'always' && alwaysLogged,
    { policy: alwaysPage.store.glanceCalendarConsent, text: chipText(alwaysPage.doc) });
  const alwaysKept = {
    outlookAuth: JSON.parse(JSON.stringify(alwaysPage.store.outlookAuth)),
    glanceCalendarConsent: JSON.parse(JSON.stringify(alwaysPage.store.glanceCalendarConsent))
  };
  const alwaysNext = await boot({
    id: 'MSG-BUDGET-NEXT',
    subject: 'Budget review next',
    body: 'Hi,\nCan you reply and confirm whether we can meet tomorrow at 10:00 to review the budget?\nThanks,\nFlow',
    store: alwaysKept
  });
  const alwaysHost2 = await waitCard(alwaysNext);
  const alwaysHold2 = alwaysHost2 && alwaysHost2.querySelector('.chip-hold');
  if (alwaysHold2) alwaysHold2.click();
  const alwaysQuiet = await waitFor(alwaysNext.doc, '.flow-chip-undo', 4000);
  const alwaysCal = alwaysNext.sent.filter((m) => m.type === 'flow:execute-action' && m.payload && m.payload.connectorId === 'outlookCalendar');
  check('Always does not ask the next time',
    Boolean(alwaysHold2) && Boolean(alwaysQuiet) && alwaysCal.length === 1 &&
    !alwaysNext.doc.querySelector('[data-glance-consent="calendar"]') &&
    alwaysNext.sent.filter((m) => m.type === 'flow:outlook-consent-scope').length === 0,
    { text: chipText(alwaysNext.doc) });
  alwaysPage.w.close();
  alwaysNext.w.close();

  console.log('\n--- Always is revocable in Settings, and the next Hold asks ---\n');
  const grantPage = await boot({
    id: 'MSG-BUDGET-REVIEW',
    subject: 'Budget review',
    body: 'Hi,\nCan you reply and confirm whether we can meet tomorrow at 10:00 to review the budget?\nThanks,\nFlow',
    store: mailOnlyStore()
  });
  const grantHost = await waitCard(grantPage);
  const grantHold = grantHost && grantHost.querySelector('.chip-hold');
  if (grantHold) grantHold.click();
  const grantAlways = await waitFor(grantPage.doc, '[data-glance-consent-choice="always"]', 4000);
  if (grantAlways) grantAlways.click();
  await waitFor(grantPage.doc, '.flow-chip-undo', 4000);
  const { load: loadPopup } = require('./popup-open-corpus.cjs');
  const panel = loadPopup(JSON.parse(JSON.stringify(grantPage.store)), {
    activeTabs: [{ url: 'https://outlook.live.com/mail/0/inbox' }]
  });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'popup', 'popup.js'), 'utf8'), panel.sandbox, { filename: 'popup.js' });
  for (let i = 0; i < 20; i++) await sleep(0);
  const setup = panel.document.getElementById('connector-list');
  const shown = [];
  let revokeBtn = null;
  (function walk(n) {
    if (!n) return;
    if (n.textContent === 'הרשאת יומן: תמיד' || n.textContent === 'בטל הרשאת יומן') shown.push(n.textContent);
    if (n.getAttribute && n.getAttribute('data-glance-revoke-calendar') === 'always') revokeBtn = n;
    (n.children || []).forEach(walk);
  })(setup);
  check('Settings shows הרשאת יומן: תמיד after Always',
    shown.indexOf('הרשאת יומן: תמיד') >= 0 && shown.indexOf('בטל הרשאת יומן') >= 0,
    shown);
  const revokeClick = revokeBtn && revokeBtn.listeners && revokeBtn.listeners.click && revokeBtn.listeners.click[0];
  if (revokeClick) await revokeClick();
  for (let i = 0; i < 20; i++) await sleep(0);
  const afterSetup = panel.document.getElementById('connector-list');
  let stillAlways = false;
  (function walk(n) {
    if (!n) return;
    if (n.textContent === 'הרשאת יומן: תמיד') stillAlways = true;
    (n.children || []).forEach(walk);
  })(afterSetup);
  const revokedLog = (panel.store().log || []).some((e) => e && e.label === 'הרשאת יומן בוטלה' && e.reason === 'calendar-consent-revoked');
  check('Revoke logs הרשאת יומן בוטלה and Settings drops תמיד',
    revokedLog && !stillAlways && panel.store().glanceCalendarConsent && panel.store().glanceCalendarConsent.revoked === true,
    { log: (panel.store().log || []).map((e) => e && e.label), policy: panel.store().glanceCalendarConsent, stillAlways: stillAlways });
  grantPage.w.close();
  const revokedStore = {
    outlookAuth: JSON.parse(JSON.stringify(panel.store().outlookAuth)),
    glanceCalendarConsent: JSON.parse(JSON.stringify(panel.store().glanceCalendarConsent))
  };
  const askAgain = await boot({
    id: 'MSG-BUDGET-AFTER-REVOKE',
    subject: 'Budget review after revoke',
    body: 'Hi,\nCan you reply and confirm whether we can meet tomorrow at 10:00 to review the budget?\nThanks,\nFlow',
    store: revokedStore
  });
  const askHost = await waitCard(askAgain);
  const askHold = askHost && askHost.querySelector('.chip-hold');
  if (askHold) askHold.click();
  const askOnce = await waitFor(askAgain.doc, '[data-glance-consent-choice="once"]', 4000);
  const askAlwaysBtn = askAgain.doc.querySelector('[data-glance-consent-choice="always"]');
  const askLater = askAgain.doc.querySelector('[data-glance-consent-choice="not-now"]');
  check('the next Hold asks once, always, and not now',
    Boolean(askOnce) && askOnce.textContent === 'אפשר פעם אחת' &&
    askAlwaysBtn && askAlwaysBtn.textContent === 'אפשר תמיד' &&
    askLater && askLater.textContent === 'לא עכשיו',
    { text: chipText(askAgain.doc) });
  askAgain.w.close();

  const laterPage = await boot({
    id: 'MSG-BUDGET-REVIEW',
    subject: 'Budget review',
    body: 'Hi,\nCan you reply and confirm whether we can meet tomorrow at 10:00 to review the budget?\nThanks,\nFlow',
    store: mailOnlyStore()
  });
  const laterHost = await waitCard(laterPage);
  const laterHold = laterHost && laterHost.querySelector('.chip-hold');
  if (laterHold) laterHold.click();
  const laterBtn = await waitFor(laterPage.doc, '[data-glance-consent-choice="not-now"]', 4000);
  if (laterBtn) laterBtn.click();
  const laterDone = await waitFor(laterPage.doc, '.flow-chip-undo', 4000);
  const laterTask = laterPage.sent.filter((m) => m.type === 'flow:execute-action' && m.payload && m.payload.connectorId === 'outlookTask');
  const laterCal = laterPage.sent.filter((m) => m.type === 'flow:execute-action' && m.payload && m.payload.connectorId === 'outlookCalendar');
  const reminder = laterTask[0] && laterTask[0].payload.params && laterTask[0].payload.params.reminder;
  const laterLogged = (laterPage.store.log || []).some((e) => e && e.label === 'הרשאת יומן: לא עכשיו');
  check('Not now holds a To Do task with a reminder, and does not write a calendar event',
    Boolean(laterDone) && laterTask.length === 1 && laterCal.length === 0 && reminder && reminder.hour === 10 &&
    laterLogged && /Handled|To Do/i.test(chipText(laterPage.doc)),
    { text: chipText(laterPage.doc), reminder: reminder, log: laterPage.store.log });
  laterPage.w.close();

  console.log('\n--- a real Microsoft token, and a real OWA mail open ---\n');
  function msJwt(scp) {
    const enc = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
    return enc({ alg: 'none', typ: 'JWT' }) + '.' + enc({ scp: scp }) + '.sig';
  }
  const liveToken = {
    outlookAuth: {
      token: {
        accessToken: msJwt('Mail.ReadWrite Tasks.ReadWrite User.Read email'),
        refreshToken: 'RT',
        expiresAt: Date.now() + 3600e3,
        rtIssuedAt: Date.now(),
        scope: 'unknown',
        grantedScopes: 'https://graph.microsoft.com/Mail.ReadWrite https://graph.microsoft.com/Tasks.ReadWrite https://graph.microsoft.com/Calendars.ReadWrite openid profile offline_access'
      },
      account: { address: ME, name: 'Glance' },
      ownAddresses: [ME],
      requestedScopes: ['offline_access', 'User.Read', 'Mail.Read', 'Mail.ReadWrite', 'Tasks.ReadWrite', 'Calendars.ReadWrite']
    }
  };
  const liveHold = await boot({
    id: 'MSG-BUDGET-REVIEW',
    subject: 'Budget review',
    body: 'Hi,\nCan you reply and confirm whether we can meet tomorrow at 10:00 to review the budget?\nThanks,\nFlow',
    store: liveToken
  });
  const liveHost = await waitCard(liveHold);
  const liveBtn = liveHost && liveHost.querySelector('.chip-hold');
  if (liveBtn) liveBtn.click();
  const liveOnce = await waitFor(liveHold.doc, '[data-glance-consent-choice="once"]', 4000);
  const liveWrote = liveHold.sent.filter((m) => m.type === 'flow:execute-action');
  check('a real MS token without calendar in scp asks, and does not write a To Do',
    Boolean(liveOnce) && liveOnce.textContent === 'אפשר פעם אחת' && liveWrote.length === 0,
    { text: chipText(liveHold.doc), wrote: liveWrote.map((m) => m.payload && m.payload.connectorId) });
  liveHold.w.close();

  let paneStatus = 200;
  const paneOpen = await boot({
    id: 'MSG-PARK',
    subject: 'Parking permit - please renew by Sunday',
    body: 'Please renew the parking permit by Sunday.\nThanks',
    store: parkProofStore(),
    reconcile: () => ({ ok: paneStatus === 200, status: paneStatus })
  });
  const paneUndo = await waitFor(paneOpen.doc, '.flow-chip-undo', 4000);
  const reconBefore = paneOpen.sent.filter((m) => m.type === 'flow:reconcile-proof').length;
  paneStatus = 404;
  const docNode = paneOpen.doc.querySelector('#ReadingPaneContainerId [role="document"]');
  const nextBody = docNode.cloneNode(false);
  nextBody.innerHTML = docNode.innerHTML;
  docNode.parentNode.replaceChild(nextBody, docNode);
  const conv = paneOpen.doc.createElement('span');
  conv.id = 'CONV_PARKTAIL_SUBJECT';
  paneOpen.doc.querySelector('#ReadingPaneContainerId').appendChild(conv);
  const paneDeleted = await waitForText(paneOpen.doc, 'Deleted in To Do', 4000);
  const reconAfter = paneOpen.sent.filter((m) => m.type === 'flow:reconcile-proof').length;
  check('opening the mail through the reading pane reconciles a deleted task',
    Boolean(paneUndo) && paneDeleted && reconAfter > reconBefore && !paneOpen.doc.querySelector('.flow-chip-undo'),
    { text: chipText(paneOpen.doc), before: reconBefore, after: reconAfter });
  paneOpen.w.close();

  console.log('\n--- a hand delete reconciles on the next open, without a reload ---\n');
  let handGone = false;
  const hand = await boot({
    id: 'MSG-PARK',
    subject: 'Parking permit - please renew by Sunday',
    body: 'Please renew the parking permit by Sunday.\nThanks',
    store: parkProofStore(),
    reconcile: () => handGone ? { ok: false, status: 404 } : { ok: true, status: 200 }
  });
  const handUndo = await waitFor(hand.doc, '.flow-chip-undo', 4000);
  check('the created task shows Handled and Undo before the delete',
    Boolean(handUndo) && /Handled/i.test(chipText(hand.doc)),
    { text: chipText(hand.doc) });
  handGone = true;
  const reconAtCreate = hand.sent.filter((m) => m.type === 'flow:reconcile-proof').length;
  showSpaMail(hand, 'MSG-OTHER', 'Vendor contract', 'Can you send me the signed vendor contract by Thursday?\nThanks');
  const leftPark = await waitForGone(hand.doc, 'Renew the parking permit', 4000);
  check('switching mail leaves the parking receipt', leftPark, { text: chipText(hand.doc) });
  showSpaMail(hand, 'MSG-PARK', 'Parking permit - please renew by Sunday', 'Please renew the parking permit by Sunday.\nThanks');
  const handDeleted = await waitForText(hand.doc, 'Deleted in To Do', 4000);
  const reconAfterBack = hand.sent.filter((m) => m.type === 'flow:reconcile-proof').length;
  const handRec = hand.store.glanceProofs && hand.store.glanceProofs.records['MSG-PARK'];
  const handCopy = hand.w.FlowProofOfClose.remountCopy(hand.w.FlowProofOfClose.proofAsLogRow(handRec));
  check('switching back with no reload says Deleted in To Do and drops Undo',
    handDeleted && !hand.doc.querySelector('.flow-chip-undo') && reconAfterBack > reconAtCreate &&
    handRec && handRec.deleted === true && handRec.deletedLine === 'Deleted in To Do' &&
    handCopy && handCopy.deleted === true && handCopy.deletedLine === 'Deleted in To Do',
    { text: chipText(hand.doc), before: reconAtCreate, after: reconAfterBack, record: handRec, copy: handCopy });
  const beforeSame = hand.sent.filter((m) => m.type === 'flow:reconcile-proof').length;
  showSpaMail(hand, 'MSG-PARK', 'Parking permit - please renew by Sunday', 'Please renew the parking permit by Sunday.\nThanks');
  await sleep(600);
  const afterSame = hand.sent.filter((m) => m.type === 'flow:reconcile-proof').length;
  showSpaMail(hand, 'MSG-OTHER', 'Vendor contract', 'Can you send me the signed vendor contract by Thursday?\nThanks');
  await waitForGone(hand.doc, 'Deleted in To Do', 4000);
  showSpaMail(hand, 'MSG-PARK', 'Parking permit - please renew by Sunday', 'Please renew the parking permit by Sunday.\nThanks');
  const secondOpen = await waitForText(hand.doc, 'Deleted in To Do', 4000);
  const afterSecond = hand.sent.filter((m) => m.type === 'flow:reconcile-proof').length;
  check('the same mail reopened twice reconciles each time and stays Deleted in To Do',
    secondOpen && !hand.doc.querySelector('.flow-chip-undo') && afterSame > beforeSame && afterSecond > afterSame,
    { before: beforeSame, same: afterSame, second: afterSecond, text: chipText(hand.doc) });
  hand.w.close();

  const graphId = 'AQMkAG+ab/cd=';
  const urlId = 'AQMkAG-ab_cd';
  const graphStore = {
    glanceProofs: {
      records: {
        [graphId]: {
          messageId: graphId,
          ids: [graphId.toLowerCase().replace(/\//g, '_')],
          kind: 'written',
          connectorId: 'outlookTask',
          system: 'microsoft/todo',
          externalId: 'task-park',
          ref: { taskId: 'task-park', taskListId: 'list-1', externalId: 'task-park', created: { title: 'Renew the parking permit', importance: 'normal' } },
          fetchedBack: true,
          writtenLine: 'To Do · Renew the parking permit',
          receiptStatus: 'Handled.',
          label: 'Renew the parking permit',
          url: 'https://to-do.office.com/tasks/task-park',
          objectName: 'To Do',
          app: 'outlook'
        }
      },
      byId: { [graphId.toLowerCase().replace(/\//g, '_')]: graphId }
    },
    log: []
  };
  const graphPage = await boot({
    id: urlId,
    subject: 'Parking permit - please renew by Sunday',
    body: 'Please renew the parking permit by Sunday.\nThanks',
    store: graphStore,
    reconcile: () => ({ ok: false, status: 404 })
  });
  const graphGone = await waitForText(graphPage.doc, 'Deleted in To Do', 4000);
  check('an OWA address id reconciles the Graph proof',
    graphGone && !graphPage.doc.querySelector('.flow-chip-undo'),
    { text: chipText(graphPage.doc) });
  graphPage.w.close();

  console.log('\n--- a draft both reads missed is not Draft ready ---\n');
  const missPage = await boot({
    id: 'MSG-DRAFT-MISS',
    subject: 'Gate A 0.9.41 – Q3 summary',
    body: 'Hi,\nCan you reply and confirm whether the Q3 summary will include the October numbers?\nThanks,\nFlow',
    execute: () => ({
      ok: true,
      fetchedBack: false,
      reason: 'unverified',
      ref: 'draft-miss',
      created: null,
      written: "Created, couldn't verify",
      url: 'https://outlook.live.com/mail/0/drafts/draft-miss',
      where: 'Outlook Drafts'
    })
  });
  const missHost = await waitCard(missPage);
  const missGo = missHost && (missHost.querySelector('.do-halo') || missHost.querySelector('button.flow-chip'));
  if (missGo) missGo.click();
  const missUndo = await waitFor(missPage.doc, '.flow-chip-undo', 4000);
  const handled = missPage.doc.querySelector('.flow-chip-handled');
  await sleep(80);
  check('a missed draft read-back says Created, couldn\'t verify, with Undo',
    Boolean(missUndo) && handled && handled.textContent === "Created, couldn't verify" &&
    !/Draft ready/i.test(handled.textContent || ''),
    { text: chipText(missPage.doc) });
  check('a missed draft read-back does not record a close',
    !missPage.store.closeQuality && !missPage.store.stillOpenMetrics,
    { closeQuality: missPage.store.closeQuality, stillOpen: missPage.store.stillOpenMetrics });
  missPage.w.close();

  console.log('\n--- a dead extension context does not leave the mail blank ---\n');
  const quiet = await boot({
    id: 'MSG-QUIET',
    subject: 'Gym renewal',
    body: 'Please renew the gym membership by Friday.\nThanks',
    store: { outlookAuth: null }
  });
  const quietLine = await waitFor(quiet.doc, '.flow-why-not', 4000);
  check('a mail with no token shows a quiet why line and no card',
    Boolean(quietLine) && /Connect Microsoft/.test(quietLine.textContent) && !quiet.doc.querySelector('.flow-chip-host'),
    { text: quietLine && quietLine.textContent });
  quiet.w.chrome.runtime.id = '';
  try { if (quiet.w.__glanceOutlookPage) quiet.w.__glanceOutlookPage.rescan(); } catch (e) { check('rescan after the context dies does not throw', false, String(e)); }
  await sleep(80);
  const deadLine = quiet.doc.querySelector('[data-glance-refresh]');
  const deadBtn = deadLine && deadLine.querySelector('[data-glance-refresh-btn]');
  check('a dead context stops quietly and leaves the refresh line on the mail',
    Boolean(deadLine) && deadLine.getAttribute('data-glance-why') === 'context-dead' &&
    /Glance התעדכן/.test(deadLine.textContent) && deadBtn && deadBtn.textContent === 'רענן' &&
    !quiet.doc.querySelector('.flow-chip-host'),
    { text: deadLine && deadLine.textContent, why: deadLine && deadLine.getAttribute('data-glance-why') });
  quiet.w.close();

  console.log('\n--- an extension reload does not wipe a compose ---\n');
  const compose = await boot({
    id: 'MSG-COMPOSE',
    subject: 'Draft in progress',
    body: 'Hello'
  });
  const box = compose.doc.createElement('textarea');
  box.id = 'glance-compose';
  box.value = 'meeting notes I am still writing';
  compose.doc.body.appendChild(box);
  const hrefBefore = String(compose.w.location.href);
  compose.w.chrome.runtime.id = '';
  try { if (compose.w.__glanceOutlookPage) compose.w.__glanceOutlookPage.rescan(); } catch (e) { check('rescan after reload does not throw', false, String(e)); }
  await sleep(80);
  const composeBox = compose.doc.getElementById('glance-compose');
  const refreshLine = compose.doc.querySelector('[data-glance-refresh]');
  const refreshBtn = refreshLine && refreshLine.querySelector('[data-glance-refresh-btn]');
  check('an open compose stays, with the refresh line, and nothing navigates',
    composeBox && composeBox.value === 'meeting notes I am still writing' &&
    String(compose.w.location.href) === hrefBefore && !compose.w.__glanceReloaded &&
    compose.doc.documentElement.getAttribute('data-glance-outlook') === '1' &&
    Boolean(refreshLine) && /Glance התעדכן — רענן את הדף כדי להתחבר מחדש/.test(refreshLine.textContent) &&
    refreshBtn && refreshBtn.textContent === 'רענן',
    { value: composeBox && composeBox.value, href: compose.w.location.href, text: refreshLine && refreshLine.textContent });
  if (refreshBtn) refreshBtn.click();
  check('pressing רענן reloads', compose.w.__glanceReloaded === 1 && String(compose.w.location.href) === hrefBefore,
    { reloads: compose.w.__glanceReloaded, href: compose.w.location.href });
  compose.w.close();
  const recovered = await boot({
    id: 'MSG-GYM',
    subject: 'Gym renewal',
    body: 'Please renew the gym membership by Friday.\nThanks'
  });
  const recoveredCard = await waitFor(recovered.doc, '.flow-chip-host', 4000);
  const recoveredWhy = recovered.doc.querySelector('.flow-why-not');
  check('a recovered tab shows a card or a why line without a manual reload',
    Boolean(recoveredCard) || Boolean(recoveredWhy),
    { card: Boolean(recoveredCard), why: recoveredWhy && recoveredWhy.textContent });
  recovered.w.close();

  const recoverBg = background();
  check('a live Outlook tab is rescanned and not injected again',
    recoverBg.fn('recoverOutlookTab')({ windowType: 'normal', pingOk: true, hasPage: true }) === 'rescan');
  check('a dead Outlook tab is left in place for a manual refresh',
    recoverBg.fn('recoverOutlookTab')({ windowType: 'normal', pingOk: false, hasPage: true, refreshShown: false }) === 'ask' &&
    recoverBg.fn('recoverOutlookTab')({ windowType: 'normal', pingOk: false, hasPage: true, alive: true }) === 'ask');
  check('a dead Outlook tab that already shows the refresh line is left alone',
    recoverBg.fn('recoverOutlookTab')({ windowType: 'normal', pingOk: false, hasPage: true, refreshShown: true }) === 'leave');
  check('an empty Outlook tab is injected',
    recoverBg.fn('recoverOutlookTab')({ windowType: 'normal', pingOk: false, hasPage: false }) === 'inject');
  check('a window that is not a browser window is left alone',
    recoverBg.fn('recoverOutlookTab')({ windowType: 'popup', pingOk: false, hasPage: false }) === 'skip');

  console.log('\nTOTAL FAILURES:', failures);
  process.exit(failures ? 1 : 0);
})().catch((err) => {
  console.log('FAIL: live gate threw', err && err.stack ? err.stack : err);
  process.exit(1);
});

function registeredFiles() {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  const bg = fs.readFileSync(path.join(ROOT, 'src/background.js'), 'utf8');
  const only = JSON.parse(bg.match(/const GMAIL_ONLY_SCRIPTS = (\[[^\]]*\])/)[1].replace(/'/g, '"'));
  const table = bg.match(/const SURFACES = \{([\s\S]*?)\n\};/)[1];
  const outlook = table.slice(table.indexOf('outlook:'));
  const extra = (outlook.match(/extra: \[([\s\S]*?)\]/)[1].match(/'([^']+)'/g) || []).map((s) => s.slice(1, -1));
  return (manifest.content_scripts[0].js || []).filter((f) => only.indexOf(f) < 0).concat(extra);
}

function lines(text) {
  return String(text || '').split('\n').map((line) => '<div>' + line + '</div>').join('');
}

function showSpaMail(page, id, subject, bodyText) {
  const href = 'https://outlook.live.com/mail/0/inbox/id/' + encodeURIComponent(id);
  page.w.history.pushState({}, '', href);
  const heading = page.doc.querySelector('#ReadingPaneContainerId [role="heading"] span');
  if (heading) {
    heading.textContent = subject;
    heading.setAttribute('title', subject);
  }
  const docNode = page.doc.querySelector('#ReadingPaneContainerId [role="document"]');
  if (!docNode || !docNode.parentNode) return;
  const next = docNode.cloneNode(false);
  next.innerHTML = lines(bodyText);
  docNode.parentNode.replaceChild(next, docNode);
}

function chipText(doc) {
  const host = doc.querySelector('.flow-chip-host');
  return host ? String(host.textContent || '').replace(/\s+/g, ' ').trim() : '';
}

function parkProofStore() {
  return {
    glanceProofs: {
      records: {
        'MSG-PARK': {
          messageId: 'MSG-PARK',
          ids: ['msg-park'],
          kind: 'written',
          connectorId: 'outlookTask',
          system: 'microsoft/todo',
          externalId: 'task-park',
          ref: {
            taskId: 'task-park',
            taskListId: 'list-1',
            externalId: 'task-park',
            created: { title: 'Renew the parking permit', importance: 'normal' }
          },
          fetchedBack: true,
          writtenLine: 'To Do · Renew the parking permit',
          receiptStatus: 'Handled.',
          label: 'Renew the parking permit',
          url: 'https://to-do.office.com/tasks/task-park',
          objectName: 'To Do',
          app: 'outlook',
          subject: 'Parking permit - please renew by Sunday'
        }
      },
      byId: { 'msg-park': 'MSG-PARK' }
    },
    log: [{
      ts: Date.now(),
      kind: 'written',
      messageId: 'MSG-PARK',
      connectorId: 'outlookTask',
      system: 'microsoft/todo',
      externalId: 'task-park',
      fetchedBack: true,
      label: 'Renew the parking permit',
      writtenLine: 'To Do · Renew the parking permit',
      url: 'https://to-do.office.com/tasks/task-park'
    }]
  };
}

function mailOnlyStore() {
  return {
    outlookAuth: {
      token: {
        accessToken: 'AT',
        refreshToken: 'RT',
        expiresAt: Date.now() + 3600e3,
        rtIssuedAt: Date.now(),
        grantedScopes: ['Mail.ReadWrite', 'Tasks.ReadWrite']
      },
      account: { address: ME, name: 'Glance' },
      ownAddresses: [ME]
    }
  };
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function waitForText(doc, text, ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (chipText(doc).indexOf(text) >= 0) return true;
    await sleep(30);
  }
  return false;
}

async function waitForGone(doc, text, ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (chipText(doc).indexOf(text) < 0) return true;
    await sleep(30);
  }
  return false;
}

async function waitFor(doc, sel, ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const n = doc.querySelector(sel);
    if (n) return n;
    await sleep(30);
  }
  return null;
}

async function waitCard(page) {
  const until = Date.now() + 5000;
  while (Date.now() < until) {
    const host = page.doc.querySelector('.flow-chip-host');
    if (host && host.getAttribute('data-glance-open')) return host;
    await sleep(30);
  }
  return page.doc.querySelector('.flow-chip-host');
}

async function boot(opts) {
  const o = opts || {};
  const files = registeredFiles();
  const html = fs.readFileSync(path.join(__dirname, 'fixtures/owa-reading-pane-he.html'), 'utf8');
  const url = 'https://outlook.live.com/mail/0/inbox/id/' + encodeURIComponent(o.id);
  const dom = new JSDOM(html, { url, runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  Object.defineProperty(w.HTMLElement.prototype, 'innerText', {
    get() {
      return this.innerHTML.replace(/<br\s*\/?>/gi, '\n').replace(/<\/div>/gi, '\n').replace(/<(?:[^>"']|"[^"]*"|'[^']*')*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\n{3,}/g, '\n\n').trim();
    }
  });
  w.TextEncoder = TextEncoder;
  w.TextDecoder = TextDecoder;
  if (!w.crypto || !w.crypto.subtle) Object.defineProperty(w, 'crypto', { value: webcrypto });
  const logs = [];
  w.console = Object.assign({}, console, {
    log: (...a) => logs.push(a.map(String).join(' ')),
    info: (...a) => logs.push(a.map(String).join(' ')),
    debug: (...a) => logs.push(a.map(String).join(' ')),
    warn: (...a) => logs.push(a.map(String).join(' ')),
    error: (...a) => logs.push('ERROR ' + a.map(String).join(' '))
  });
  const store = Object.assign({
    outlookAuth: {
      token: { accessToken: 'AT', refreshToken: 'RT', expiresAt: Date.now() + 3600e3, rtIssuedAt: Date.now(), grantedScopes: ['Mail.ReadWrite', 'Calendars.ReadWrite', 'Tasks.ReadWrite'] },
      account: { address: ME, name: 'Glance' },
      ownAddresses: [ME]
    },
    outlookSync: { stateVersion: 3 }
  }, o.store || {});
  const sent = [];
  function snapshotGet(k, cb) {
    const snap = JSON.parse(JSON.stringify(store));
    let r;
    if (k && typeof k === 'object' && !Array.isArray(k)) r = Object.assign({}, k, snap);
    else if (typeof k === 'string') r = { [k]: snap[k] };
    else if (Array.isArray(k)) { r = {}; k.forEach((x) => { r[x] = snap[x]; }); }
    else r = snap;
    if (cb) cb(r);
    return r;
  }
  function reply(msg) {
    sent.push(msg);
    if (msg.type === 'flow:outlook-session') return { ok: true, token: store.outlookAuth.token, changed: false, how: 'fresh' };
    if (msg.type === 'flow:outlook-fetch') {
      const u = String(msg.url || '');
      if (/\/me\?/.test(u)) return { ok: true, status: 200, body: JSON.stringify({ mail: ME, displayName: 'Glance' }) };
      if (/\/me\/messages/.test(u)) return { ok: true, status: 200, body: JSON.stringify({ value: [] }) };
      return { ok: false, status: 404, body: '{}' };
    }
    if (msg.type === 'flow:execute-action' && typeof o.execute === 'function') return o.execute(msg);
    if (msg.type === 'flow:reconcile-proof') {
      if (typeof o.reconcile === 'function') return o.reconcile(msg);
      return { ok: true, status: 200 };
    }
    if (msg.type === 'flow:outlook-consent-scope') {
      return { ok: true, policy: msg.policy, scope: msg.scope };
    }
    if (msg.type === 'flow:execute-action' && msg.payload && msg.payload.connectorId === 'outlookCalendar') {
      return {
        ok: true,
        fetchedBack: true,
        ref: { eventId: 'EV-BUDGET', created: { subject: 'Budget review', start: '2026-10-16T10:00:00', body: 'Budget review', importance: 'normal' } },
        written: 'Calendar · Budget review · 10:00',
        url: 'https://outlook.live.com/calendar/item/EV-BUDGET',
        where: 'Outlook Calendar'
      };
    }
    if (msg.type === 'flow:execute-action' && msg.payload && msg.payload.connectorId === 'outlookTask') {
      return {
        ok: true,
        fetchedBack: true,
        proof: { system: 'microsoft/todo', externalId: 'task-hold', fetchedBack: true, verifiedAt: '2026-10-15T06:00:00.000Z' },
        ref: { taskId: 'task-hold', taskListId: 'list-1', externalId: 'task-hold', created: { title: 'Budget review', importance: 'normal' } },
        written: 'To Do · Budget review',
        url: 'https://to-do.office.com/tasks/task-hold',
        where: 'Microsoft To Do'
      };
    }
    if (msg.type === 'flow:execute-action') {
      return {
        ok: true,
        ref: 'draft-q3',
        created: { subject: 'RE: Q3 summary', body: 'Thanks, I will confirm.', to: ME },
        written: 'Reply draft ready in Outlook Drafts. Not sent.',
        url: 'https://outlook.live.com/mail/0/drafts/draft-q3',
        where: 'Outlook Drafts'
      };
    }
    if (msg.type === 'flow:undo-action') {
      if (typeof o.undo === 'function') return o.undo(msg);
      return { ok: true, written: 'Draft removed from Outlook Drafts.' };
    }
    return { ok: true };
  }
  w.chrome = {
    runtime: {
      id: 'ext', lastError: null, getURL: (s) => 'chrome-extension://x/' + s,
      getManifest: () => ({ version: '0.9.56' }),
      onMessage: { addListener() {} },
      sendMessage: (msg, cb) => { const r = reply(msg); setTimeout(() => cb && cb(r), 5); }
    },
    storage: {
      local: {
        get: (k, cb) => { setTimeout(() => snapshotGet(k, cb), 1); },
        set: (p, cb) => { Object.assign(store, JSON.parse(JSON.stringify(p))); if (cb) setTimeout(cb, 1); return Promise.resolve(); },
        remove: (k, cb) => { [].concat(k).forEach((x) => { delete store[x]; }); if (cb) cb(); return Promise.resolve(); }
      },
      onChanged: { addListener() {} },
      sync: { get: (k, cb) => cb && cb({}) }
    },
    i18n: { getUILanguage: () => 'en' }
  };
  const ctx = dom.getInternalVMContext();
  for (const f of files) {
    new vm.Script(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f }).runInContext(ctx);
  }
  const heading = w.document.querySelector('#ReadingPaneContainerId [role="heading"] span');
  if (heading) heading.textContent = o.subject;
  const body = w.document.querySelector('#ReadingPaneContainerId [role="document"]');
  if (body) body.innerHTML = lines(o.body);
  const to = w.document.querySelector('#ReadingPaneContainerId .to');
  if (to) to.innerHTML = 'אל: <span>' + ME + '</span>';
  return { w, doc: w.document, logs, sent, store };
}
