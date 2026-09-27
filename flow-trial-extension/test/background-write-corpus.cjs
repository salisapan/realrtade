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
const { Buffer } = require('buffer');
const { webcrypto } = require('crypto');

const TASKS = 'https://tasks.googleapis.com/tasks/v1';
const GMAIL = 'https://gmail.googleapis.com/gmail/v1';
const DRIVE = 'https://www.googleapis.com/drive/v3';

function res(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

// fetchDriveFileAsAttachment (background.js) reads the Drive file-content
// response via .arrayBuffer(), never .json() — res() above has no such
// method, so a route standing in for the `?alt=media` download needs its
// own binary-response shape instead.
function resBuf(status, text) {
  const buf = Buffer.from(text, 'utf8');
  return { ok: status >= 200 && status < 300, status, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
}

// Builds a fresh sandbox per case so stored state and call logs never leak
// between them. `routes` is consulted in order; the first match answers.
function load(opts) {
  opts = opts || {};
  const calls = [];
  const bodies = [];
  const tokens = [];
  const stored = JSON.parse(JSON.stringify(opts.stored || {}));
  let tokenSeq = 0;

  const sandbox = {
    console,
    fetch: async (url, options) => {
      const method = (options && options.method) || 'GET';
      calls.push(method + ' ' + String(url).replace(TASKS, '').replace('https://www.googleapis.com/calendar/v3', ''));
      // Parsed alongside calls (not just method+url) so a case can assert on
      // what was actually IN the write, not just that a write happened —
      // the exact gap that let the Quote field go missing without any test
      // ever catching it (background-write-corpus only ever checked
      // out.ok/out.ref before this, never the request body itself).
      if (options && typeof options.body === 'string') {
        try { bodies.push(JSON.parse(options.body)); } catch (e) { bodies.push(options.body); }
      } else {
        bodies.push(null);
      }
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
    },
    // A bare vm context has no Node/browser globals beyond the ECMAScript
    // spec ones (encodeURIComponent, unescape, ... are already there) —
    // btoa/atob/crypto are runtime additions neither V8 nor this sandbox
    // provide for free. gmailDraftWrite's MIME-building path (buildMimeMessage,
    // base64UrlEncode, arrayBufferToBase64) needs all three; no writer
    // tested before it did, which is why they were never here.
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    crypto: webcrypto
  };
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'background.js'), 'utf8'), sandbox, { filename: 'background.js' });
  return {
    calls, bodies, tokens, stored,
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

// Decodes a Gmail drafts.create request's base64url `raw` field back into
// its plain-text body and (if present) attachment filename, mirroring
// exactly what buildMimeMessage (background.js) assembled — the only way
// to assert on what a draft actually SAYS rather than just that the API
// call happened. Base64url -> raw MIME text -> (if multipart) split on the
// boundary and base64-decode each part's own body, since buildMimeMessage
// base64-encodes the text part and the attachment independently of the
// outer raw-message encoding.
function decodeDraftRaw(raw) {
  const mime = Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  const boundaryMatch = mime.match(/boundary="([^"]+)"/);
  if (!boundaryMatch) {
    const b64Body = mime.split('\r\n\r\n').slice(1).join('').replace(/\r\n/g, '');
    return { body: Buffer.from(b64Body, 'base64').toString('utf8'), attachmentFilename: null };
  }
  const segments = mime.split('--' + boundaryMatch[1]);
  const textPart = segments[1] || '';
  const bodyB64 = textPart.split('\r\n\r\n').slice(1).join('').replace(/\r\n/g, '');
  const attachmentPart = segments[2] || '';
  const filenameMatch = attachmentPart.match(/filename="([^"]*)"/);
  return { body: Buffer.from(bodyB64, 'base64').toString('utf8'), attachmentFilename: filenameMatch ? filenameMatch[1] : null };
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

  console.log('\n--- background.js: the task actually carries what was decided, not just metadata ---\n');
  {
    // Regression for the exact gap a real user hit: Amount/Date/From/Subject
    // answer "what kind of thing is this," never "what did the email
    // actually say" — that's entities.what/requestWhat, forwarded from
    // content-gmail.js's buildActionPayload only after this fix. Asserting
    // on the real request body (not just out.ok) is the point: the write
    // path was "succeeding" the whole time by returning ok:true while
    // silently omitting the one line that makes the record readable
    // without reopening Gmail.
    const env = load({
      stored: CONNECTED,
      routes: [[/\/lists\/LIST_A\/tasks$/, { reply: res(200, { id: 'task_q' }) }]]
    });
    const payload = Object.assign({}, PAYLOAD, {
      entities: { what: "We're good at $3,900/mo for the 14th floor, signing Monday." }
    });
    const out = await attempt(env.fn('googleTasksWrite')(payload));
    check('the write still succeeds', out.ok === true, out);
    const notes = (env.bodies[0] || {}).notes || '';
    check('the notes include a Quote line with the actual decided text',
      notes.includes('Quote: "We\'re good at $3,900/mo for the 14th floor, signing Monday."'), notes);
  }

  console.log('\n--- background.js: no quote available — no fabricated Quote line ---\n');
  {
    // The common REQUEST/DECISION_TO_LOG case with no entities.what at
    // all (or ensureRemoteClassification's remote shape, which never sets
    // entities.what/requestWhat either — see content-gmail.js). factLines()
    // must not print an empty or placeholder Quote line just because the
    // key exists on facts/entities with nothing in it.
    const env = load({
      stored: CONNECTED,
      routes: [[/\/lists\/LIST_A\/tasks$/, { reply: res(200, { id: 'task_noq' }) }]]
    });
    const out = await attempt(env.fn('googleTasksWrite')(PAYLOAD));
    check('the write still succeeds', out.ok === true, out);
    const notes = (env.bodies[0] || {}).notes || '';
    check('no Quote line appears when there is nothing to quote', !notes.includes('Quote:'), notes);
  }

  console.log('\n--- background.js: an unusually long quote is trimmed, not truncated mid-word into the API limit blindly ---\n');
  {
    const env = load({
      stored: CONNECTED,
      routes: [[/\/lists\/LIST_A\/tasks$/, { reply: res(200, { id: 'task_long' }) }]]
    });
    const longQuote = 'A'.repeat(500);
    const payload = Object.assign({}, PAYLOAD, { entities: { what: longQuote } });
    const out = await attempt(env.fn('googleTasksWrite')(payload));
    check('the write still succeeds', out.ok === true, out);
    const notes = (env.bodies[0] || {}).notes || '';
    const quoteLine = notes.split('\n').find((l) => l.startsWith('Quote:')) || '';
    check('the quote is trimmed well under the 8192-char notes cap, with an ellipsis marking the cut',
      quoteLine.length < 450 && quoteLine.includes('…'), quoteLine.length);
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

  console.log('\n--- background.js: each shared-destination write attributes itself distinctly ---\n');
  {
    // Every write that lands somewhere a teammate might see it (a CRM note,
    // a Slack message, a Notion page, a Calendar event) credits Glance with
    // one quiet line — this trial's actual distribution channel, per this
    // file's own header comment on ATTRIBUTION_TEXT/attributionUrl. Each
    // surface must carry ITS OWN ref code, not a shared generic one, or a
    // click from a HubSpot note is indistinguishable from a click from a
    // Slack message in the numbers later. A Gmail draft is deliberately
    // exempt (see this file's own comment there) — it is not tested here.
    const env = load();
    const p = { label: 'Renewal agreed', facts: {}, threadUrl: 'https://mail.google.com/x' };

    const hubspot = env.fn('hubspotNoteBody')(p);
    check('HubSpot note attributes with ref=hubspot', hubspot.includes('ref=hubspot'), hubspot);

    const salesforce = env.fn('salesforceTaskDescription')(p);
    check('Salesforce task attributes with ref=salesforce', salesforce.includes('ref=salesforce'), salesforce);

    const slack = env.fn('slackMessageText')(p);
    check('Slack message attributes with ref=slack', slack.includes('ref=slack'), slack);

    const monday = env.fn('mondayUpdateBody')(p);
    check('Monday.com update attributes with ref=monday', monday.includes('ref=monday'), monday);

    const notion = JSON.stringify(env.fn('notionBlocks')(p));
    check('Notion page attributes with ref=notion', notion.includes('ref=notion'), notion);

    // Every ref code actually differs — the whole point is telling these
    // apart later, so two surfaces silently sharing one code would defeat it
    // just as quietly as the old single shared ATTRIBUTION_URL did.
    const codes = [hubspot, salesforce, slack, monday, notion].map((s) => (s.match(/ref=(\w+)/) || [])[1]);
    check('all five ref codes are distinct', new Set(codes).size === codes.length, codes);
  }

  console.log('\n--- background.js: a Calendar event attributes itself without throwing ---\n');
  {
    // Regression guard for a real bug: attributionUrl() replaced the single
    // ATTRIBUTION_URL constant everywhere BUT this call site kept referencing
    // the now-deleted constant, which would have thrown ReferenceError on
    // every single Calendar write in production — caught only by actually
    // invoking the writer, not by any string-level check above.
    const env = load({
      stored: CONNECTED,
      routes: [[/\/calendars\/primary\/events$/, { reply: res(200, { id: 'ev_9', htmlLink: 'https://calendar.google.com/x' }) }]]
    });
    const out = await attempt(env.fn('googleCalendarWrite')({
      params: { title: 'Kickoff', dateIso: '2026-09-21', hour: 15, minute: 0 }
    }));
    check('the write succeeds rather than throwing', out.ok === true, out);
    check('the request actually reached the Calendar API', env.calls.some((c) => c.includes('POST') && c.includes('/calendars/primary/events')), env.calls);
  }

  console.log('\n--- background.js: gmailDraftWrite — a plain draft with nothing to attach ---\n');
  {
    const env = load({
      stored: CONNECTED,
      routes: [
        [/\/gmail\/v1\/users\/me\/threads\?/, { reply: res(200, { threads: [] }) }],
        [/\/gmail\/v1\/users\/me\/drafts$/, { reply: res(200, { id: 'draft_1' }), method: 'POST' }]
      ]
    });
    const out = await attempt(env.fn('gmailDraftWrite')({
      senderEmail: 'dana@meridian.com', senderName: 'Dana', subject: 'Signed contract',
      params: { what: 'the signed contract', when: 'Sep 18' }
    }));
    check('a draft with nothing to attach still succeeds', out.ok === true, out);
    check('target reads as a plain draft reply, no attachment claim', out.target === 'a draft reply', out.target);
    const draftCall = env.bodies[env.calls.findIndex((c) => c.includes('POST') && c.includes('/users/me/drafts'))];
    const decoded = decodeDraftRaw(draftCall.message.raw);
    check('no attachment filename ends up in the MIME message', decoded.attachmentFilename === null, decoded);
    check('no auto-find verification note when nothing was ever attached', !decoded.body.includes('found'), decoded.body);
    // Nobody supplied requestedObjectTerm — Drive must never be searched
    // speculatively just because a draft is being written.
    check('Drive is never queried when the request named no object at all', !env.calls.some((c) => c.includes('/drive/v3/')), env.calls);
  }

  console.log('\n--- background.js: gmailDraftWrite — Drive auto-search finds and attaches the named file ---\n');
  {
    // The one path this session added: nothing on the thread, nothing
    // manually picked, but the email itself named a concrete object
    // ("the signed contract" -> requestedObjectTerm "contract") — so
    // driveSearchAttachment gets one real chance to close the loop itself.
    const env = load({
      stored: CONNECTED,
      routes: [
        [/\/gmail\/v1\/users\/me\/threads\?/, { reply: res(200, { threads: [] }) }],
        [/\/drive\/v3\/files\?q=/, { reply: res(200, { files: [{ id: 'file_1', name: 'Contract-Signed.pdf', mimeType: 'application/pdf', size: '2048' }] }) }],
        [/\/drive\/v3\/files\/file_1\?fields=/, { reply: res(200, { name: 'Contract-Signed.pdf', mimeType: 'application/pdf', size: '2048' }) }],
        [/\/drive\/v3\/files\/file_1\?alt=media/, { reply: resBuf(200, 'pdf-bytes-here') }],
        [/\/gmail\/v1\/users\/me\/drafts$/, { reply: res(200, { id: 'draft_2' }), method: 'POST' }]
      ]
    });
    const out = await attempt(env.fn('gmailDraftWrite')({
      senderEmail: 'dana@meridian.com', senderName: 'Dana', subject: 'Following up',
      params: { what: 'the signed contract', when: 'Sep 18', requestedObjectTerm: 'contract' }
    }));
    check('the auto-found draft still succeeds', out.ok === true, out);
    check('Drive was actually searched for the named term', env.calls.some((c) => c.includes('/drive/v3/files?q=') && c.includes('contract')), env.calls);
    check('target flags the file as unverified, not as a confirmed attachment', out.target.includes('unverified'), out.target);
    const draftCall = env.bodies[env.calls.findIndex((c) => c.includes('POST') && c.includes('/users/me/drafts'))];
    const decoded = decodeDraftRaw(draftCall.message.raw);
    check('the auto-found filename actually lands in the MIME attachment', decoded.attachmentFilename === 'Contract-Signed.pdf', decoded);
    check('the body carries the "please confirm" verification note for an auto-found file', decoded.body.includes('Contract-Signed.pdf') && decoded.body.includes('confirm'), decoded.body);
  }

  console.log('\n--- background.js: gmailDraftWrite — Drive search with no match still succeeds, no attachment ---\n');
  {
    const env = load({
      stored: CONNECTED,
      routes: [
        [/\/gmail\/v1\/users\/me\/threads\?/, { reply: res(200, { threads: [] }) }],
        [/\/drive\/v3\/files\?q=/, { reply: res(200, { files: [] }) }],
        [/\/gmail\/v1\/users\/me\/drafts$/, { reply: res(200, { id: 'draft_3' }), method: 'POST' }]
      ]
    });
    const out = await attempt(env.fn('gmailDraftWrite')({
      senderEmail: 'dana@meridian.com', senderName: 'Dana', subject: 'Following up',
      params: { what: 'the resume', requestedObjectTerm: 'resume' }
    }));
    check('an empty Drive search still resolves to a successful, plain draft', out.ok === true && out.target === 'a draft reply', out);
    const draftCall = env.bodies[env.calls.findIndex((c) => c.includes('POST') && c.includes('/users/me/drafts'))];
    const decoded = decodeDraftRaw(draftCall.message.raw);
    check('no attachment and no fabricated verification note when nothing was found', decoded.attachmentFilename === null && !decoded.body.includes('found'), decoded);
  }

  console.log('\n--- background.js: gmailDraftWrite — a real thread attachment always outranks a Drive guess ---\n');
  {
    // params.includeAttachment + a real attachment the user already saw on
    // the thread must win outright — Drive is Glance's own guess, and a
    // guess must never override something the user already had in front of
    // them. Proven by NOT routing Drive's files.list at all: if
    // driveSearchAttachment ran anyway, its unrouted call would return a
    // 500 that gmailDraftWrite's try/catch swallows into "no attachment",
    // silently masking the real bug — so the call log itself is the
    // assertion, not just the final attachment.
    const env = load({
      stored: CONNECTED,
      routes: [
        [/\/gmail\/v1\/users\/me\/threads\?/, { reply: res(200, { threads: [] }) }],
        [/\/gmail\/v1\/users\/me\/drafts$/, { reply: res(200, { id: 'draft_4' }), method: 'POST' }]
      ]
    });
    const out = await attempt(env.fn('gmailDraftWrite')({
      senderEmail: 'dana@meridian.com', senderName: 'Dana', subject: 'Following up',
      params: { what: 'the signed contract', requestedObjectTerm: 'contract', includeAttachment: true },
      attachment: { filename: 'from-thread.pdf', mimeType: 'application/pdf', base64: Buffer.from('thread-bytes').toString('base64') }
    }));
    check('a real thread attachment still produces a successful draft', out.ok === true, out);
    check('target reflects a confirmed attachment, not an unverified guess', out.target === 'a draft reply with the attachment', out.target);
    check('Drive is never queried once a real thread attachment already exists', !env.calls.some((c) => c.includes('/drive/v3/')), env.calls);
    const draftCall = env.bodies[env.calls.findIndex((c) => c.includes('POST') && c.includes('/users/me/drafts'))];
    const decoded = decodeDraftRaw(draftCall.message.raw);
    check('the thread attachment\'s own filename is what actually gets attached', decoded.attachmentFilename === 'from-thread.pdf', decoded);
    check('no "please confirm" note for a thread attachment the user already saw', !decoded.body.includes('confirm'), decoded.body);
  }

  console.log('\n--- background.js: gmailDraftWrite — an oversized Drive candidate is skipped for the next one ---\n');
  {
    // driveSearchAttachment's own size guard (files(...).size from the list
    // response, before any metadata/content fetch) must skip a too-large
    // candidate without ever downloading it, then still try the next one —
    // proven by asserting the oversized file's own id never appears in any
    // later call, not just that the final attachment is the small one.
    const env = load({
      stored: CONNECTED,
      routes: [
        [/\/gmail\/v1\/users\/me\/threads\?/, { reply: res(200, { threads: [] }) }],
        [/\/drive\/v3\/files\?q=/, { reply: res(200, { files: [
          { id: 'file_big', name: 'Contract-4K-Scan.pdf', mimeType: 'application/pdf', size: String(50 * 1024 * 1024) },
          { id: 'file_small', name: 'Contract-Signed.pdf', mimeType: 'application/pdf', size: '1024' }
        ] }) }],
        [/\/drive\/v3\/files\/file_small\?fields=/, { reply: res(200, { name: 'Contract-Signed.pdf', mimeType: 'application/pdf', size: '1024' }) }],
        [/\/drive\/v3\/files\/file_small\?alt=media/, { reply: resBuf(200, 'small-pdf-bytes') }],
        [/\/gmail\/v1\/users\/me\/drafts$/, { reply: res(200, { id: 'draft_5' }), method: 'POST' }]
      ]
    });
    const out = await attempt(env.fn('gmailDraftWrite')({
      senderEmail: 'dana@meridian.com', senderName: 'Dana', subject: 'Following up',
      params: { what: 'the signed contract', requestedObjectTerm: 'contract' }
    }));
    check('the write still succeeds once the small candidate is found', out.ok === true, out);
    check('the oversized candidate is never fetched at all', !env.calls.some((c) => c.includes('file_big') && (c.includes('?fields=') || c.includes('?alt=media'))), env.calls);
    const draftCall = env.bodies[env.calls.findIndex((c) => c.includes('POST') && c.includes('/users/me/drafts'))];
    const decoded = decodeDraftRaw(draftCall.message.raw);
    check('the small candidate is the one actually attached', decoded.attachmentFilename === 'Contract-Signed.pdf', decoded);
  }

  console.log('\n--- background.js: Gmail draft undo deletes that draft, and a missing one is already undone ---\n');
  {
    const env = load({
      stored: CONNECTED,
      routes: [
        [/\/users\/me\/drafts\/draft_1$/, { reply: res(204, {}) }],
        [/\/users\/me\/drafts\/gone$/, { reply: res(404, {}) }]
      ]
    });
    const undo = env.fn('gmailDraftUndo');
    check('undoing a Gmail draft deletes that draft',
      (await attempt(undo({ draftId: 'draft_1' }))).ok === true
      && env.calls.some((c) => c.startsWith('DELETE ') && c.includes('/users/me/drafts/draft_1')),
      env.calls);
    check('an already-deleted draft still counts as undone',
      (await attempt(undo({ draftId: 'gone' }))).ok === true);
    check('a draft undo without an id does not guess',
      (await undo({})).ok === false && (await undo(null)).ok === false);
  }

  console.log('\n--- background.js: Notion undo archives the page, and a missing page is already gone ---\n');
  {
    const env = load({
      stored: { notionAuth: { token: 'secret_test', databaseId: 'db' } },
      routes: [
        [/\/pages\/page_1$/, { reply: res(200, {}) }],
        [/\/pages\/gone$/, { reply: res(404, {}) }]
      ]
    });
    const undo = env.fn('notionUndo');
    const ok = await attempt(undo({ pageId: 'page_1' }));
    const archive = env.bodies[env.calls.findIndex((c) => c.includes('/pages/page_1'))];
    check('undoing a Notion page archives it', ok.ok === true && archive && archive.archived === true, { ok, archive, calls: env.calls });
    check('the Notion undo is a PATCH',
      env.calls.some((c) => c.startsWith('PATCH ') && c.includes('/pages/page_1')), env.calls);
    check('an already-missing Notion page still counts as undone',
      (await attempt(undo({ pageId: 'gone' }))).ok === true);
    check('a Notion undo without a page id does nothing',
      (await undo(null)).ok === false && (await undo({})).ok === false);
    const disconnected = load({ stored: {} });
    check('a Notion undo with no token does not call the API',
      (await attempt(disconnected.fn('notionUndo')({ pageId: 'page_1' }))).ok === false
      && disconnected.calls.length === 0, disconnected.calls);
  }

  console.log('\nTOTAL FAILURES:', failures);
  process.exit(failures ? 1 : 0);
}

run();
