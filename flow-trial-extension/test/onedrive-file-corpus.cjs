// OneDrive file proof of close. PUT the file, GET it back, Handled only
// when that GET is the same id. A miss is not Handled. Undo deletes a file
// this write created, or restores the previous version. Nothing is sent.
// Run: node test/onedrive-file-corpus.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { webcrypto } = require('crypto');
const { FlowOnedriveFile: F } = require('../core/onedrive-file.js');
const { FlowProofOfClose: Proof } = require('../core/proof-of-close.js');
const { FlowIncomingJudge: J } = require('../core/incoming-judge.js');
const { FlowGoogleCloses: G } = require('../core/google-closes.js');

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
        grantedScopes: opts.scopes || ['Mail.Read', 'Mail.ReadWrite', 'Files.ReadWrite', 'offline_access', 'User.Read']
      },
      account: { address: 'glance.salisapan@outlook.com' }
    }
  };
  const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
  const routes = opts.routes || [];
  const sandbox = {
    console, URLSearchParams, URL, TextEncoder, Uint8Array, atob, crypto: webcrypto,
    fetch: async (url, init) => {
      const method = (init && init.method) || 'GET';
      let body = null;
      try { body = init && init.body ? JSON.parse(init.body) : null; } catch (e) { body = init && init.body; }
      calls.push({ method, url: String(url), body, contentType: init && init.headers && init.headers['Content-Type'] });
      for (const route of routes) {
        if (route.method === method && route.test.test(String(url))) return route.reply(body);
      }
      return json(404, {});
    },
    chrome: {
      runtime: {
        getManifest: () => ({ oauth2: { client_id: 'x' }, version: '0.9.34', content_scripts: [{ js: [] }] }),
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

const FILE = { id: 'FILE1', name: 'passport.pdf', webUrl: 'https://onedrive.live.com/edit.aspx?id=FILE1' };
const PAYLOAD = { params: { content: 'signed', fileName: 'passport.pdf' }, label: 'Save the file' };

function createRoutes(getStatus, getBody) {
  return [
    { method: 'GET', test: /\/me\/drive\/root:\/passport\.pdf$/, reply: () => ({ ok: false, status: 404, json: async () => ({}), text: async () => '' }) },
    { method: 'PUT', test: /\/me\/drive\/root:\/passport\.pdf:\/content$/, reply: () => ({ ok: true, status: 201, json: async () => FILE, text: async () => '' }) },
    { method: 'GET', test: /\/me\/drive\/items\/FILE1$/, reply: () => ({ ok: getStatus >= 200 && getStatus < 300, status: getStatus, json: async () => getBody, text: async () => '' }) }
  ];
}

console.log('\n--- names, scope, one attachment ---\n');
{
  check('Files.ReadWrite can write and Files.Read cannot',
    F.hasWriteScope(['Files.ReadWrite']) === true && F.hasWriteScope(['Files.Read']) === false &&
    F.hasWriteScope(['https://graph.microsoft.com/Files.ReadWrite']) === true &&
    F.hasWriteScope(['Files.ReadWrite.All']) === false);
  check('an unknown scope list is not a refusal', F.hasWriteScope(null) === null);
  check('a name cannot climb out of the folder', F.safeName('../secret.txt') === '' && F.safeName('passport.pdf') === 'passport.pdf');
  check('inline text is one upload under the simple cap',
    F.prepare(PAYLOAD).ok === true && F.prepare(PAYLOAD).fetchOne === false && F.prepare(PAYLOAD).name === 'passport.pdf');
  const big = { params: { content: 'x'.repeat(F.MAX_BYTES + 1), fileName: 'big.txt' } };
  check('a file over the simple upload cap is unclear', F.prepare(big).ok === false && F.prepare(big).reason === 'unclear');
  check('no bytes and no message is unclear', F.prepare({ label: 'Save' }).ok === false);
  check('save-shaped text is the only sentence that counts attachments',
    G.needsOneAttachment('Please save the attached file to Drive.') === true &&
    G.needsOneAttachment('We agreed to renew the passport application by Friday.') === false);
  const mapped = J.forSurface({
    id: 'file-it',
    steps: [
      { kind: 'driveFile', id: 'file', params: { copyAttachment: true } },
      { kind: 'gmailDraft', id: 'gmailDraft', params: {} }
    ]
  }, 'outlook');
  check('Outlook keeps the draft step and writes the file on OneDrive',
    mapped.steps[0].kind === 'onedriveFile' && mapped.steps[1].kind === 'outlookDraft' && mapped.closedLine === 'Saved on OneDrive.');
  check('Gmail still writes Drive',
    J.forSurface({ steps: [{ kind: 'driveFile', id: 'file' }] }, 'gmail').steps[0].kind === 'driveFile');
}

(async () => {
console.log('\n--- create, read back, undo ---\n');
{
  const env = background({ routes: createRoutes(200, FILE) });
  const out = await env.fn('outlookFileWrite')(PAYLOAD);
  const put = env.calls.find((c) => c.method === 'PUT');
  const gets = env.calls.filter((c) => c.method === 'GET' && /\/items\/FILE1$/.test(c.url));
  check('PUT creates the file, then GET reads that id',
    out.ok === true && out.proof && out.proof.fetchedBack === true && out.proof.system === 'microsoft/onedrive' &&
    out.proof.externalId === 'FILE1' && out.ref.created === true && out.ref.fileId === 'FILE1' &&
    put && /\/passport\.pdf:\/content$/.test(put.url) && gets.length === 1,
    { out, calls: env.calls.map((c) => c.method + ' ' + c.url) });
  check('Handled is allowed only for that proof', Proof.allowsHandled({ ok: true, proof: out.proof }) === true);
  check('nothing was sent', !env.calls.some((c) => /\/(send|reply|replyAll|forward|sendMail)(\b|\/|$)/i.test(c.url)));
  const undo = await env.fn('outlookFileUndo')(out.ref);
  const del = env.calls.filter((c) => c.method === 'DELETE');
  check('Undo DELETEs a file this write created',
    undo.ok === true && del.length === 1 && /\/me\/drive\/items\/FILE1$/.test(del[0].url), del.map((c) => c.url));
}

console.log('\n--- a verify miss is not Handled ---\n');
{
  const miss = background({ routes: createRoutes(404, {}) });
  const out = await miss.fn('outlookFileWrite')(PAYLOAD);
  check('a GET miss is verify_failed and not a proof',
    out.ok === false && out.reason === 'verify_failed' && out.proof === null && out.ref && out.ref.fileId === 'FILE1', out);
  check('the miss does not say Handled and does not delete the file',
    Proof.allowsHandled({ ok: out.ok, proof: out.proof }) === false && !miss.calls.some((c) => c.method === 'DELETE'));
}

console.log('\n--- update restores a version, and a file with no version is left alone ---\n');
{
  const routes = [
    { method: 'GET', test: /\/me\/drive\/root:\/passport\.pdf$/, reply: () => ({ ok: true, status: 200, json: async () => FILE, text: async () => '' }) },
    { method: 'GET', test: /\/versions\?\$top=1$/, reply: () => ({ ok: true, status: 200, json: async () => ({ value: [{ id: 'VER1' }] }), text: async () => '' }) },
    { method: 'PUT', test: /\/me\/drive\/items\/FILE1\/content$/, reply: () => ({ ok: true, status: 200, json: async () => FILE, text: async () => '' }) },
    { method: 'GET', test: /\/me\/drive\/items\/FILE1$/, reply: () => ({ ok: true, status: 200, json: async () => FILE, text: async () => '' }) },
    { method: 'POST', test: /\/versions\/VER1\/restoreVersion$/, reply: () => ({ ok: true, status: 204, json: async () => ({}), text: async () => '' }) }
  ];
  const env = background({ routes: routes });
  const out = await env.fn('outlookFileWrite')(PAYLOAD);
  check('an existing file is updated only with a version to restore',
    out.ok === true && out.ref.created === false && out.ref.previousVersionId === 'VER1' && out.proof.fetchedBack === true, out.ref);
  const undo = await env.fn('outlookFileUndo')(out.ref);
  const restored = env.calls.filter((c) => c.method === 'POST');
  check('Undo restores that version and does not delete the file',
    undo.ok === true && restored.length === 1 && /restoreVersion$/.test(restored[0].url) && !env.calls.some((c) => c.method === 'DELETE'));
  const copy = Proof.remountCopy({
    kind: 'written', system: 'microsoft/onedrive', externalId: 'FILE1', fetchedBack: true, verifiedAt: '2026-10-07T12:00:00.000Z',
    connectorId: 'onedriveFile', ref: out.ref, url: FILE.webUrl, writtenLine: 'OneDrive · passport.pdf'
  });
  check('a reload keeps the version on the receipt',
    copy && copy.connectorId === 'onedriveFile' && copy.ref.created === false && copy.ref.previousVersionId === 'VER1' &&
    copy.undoHint === 'Undo restores the previous OneDrive file.', copy);

  const bare = [
    { method: 'GET', test: /\/me\/drive\/root:\/passport\.pdf$/, reply: () => ({ ok: true, status: 200, json: async () => FILE, text: async () => '' }) },
    { method: 'GET', test: /\/versions\?\$top=1$/, reply: () => ({ ok: true, status: 200, json: async () => ({ value: [] }), text: async () => '' }) }
  ];
  const left = background({ routes: bare });
  const skipped = await left.fn('outlookFileWrite')(PAYLOAD);
  check('no previous version means the file is not overwritten',
    skipped.ok === false && skipped.reason === 'unclear' && !left.calls.some((c) => c.method === 'PUT'), skipped);
}

console.log('\n--- the write scope is the checkbox ---\n');
{
  const env = background({ scopes: ['Mail.Read', 'Mail.ReadWrite', 'Files.Read', 'offline_access', 'User.Read'], routes: createRoutes(200, FILE) });
  const out = await env.fn('outlookFileWrite')(PAYLOAD);
  check('Files.Read does not write', out.ok === false && out.reason === 'files-not-granted' && env.calls.length === 0, out);
}

console.log('\n--- one Undo after reload ---\n');
{
  const page = fs.readFileSync(path.join(__dirname, '..', 'src', 'content-outlook.js'), 'utf8');
  const start = page.indexOf('async function onDoIt');
  const end = page.indexOf('function outlookTodoRow');
  const body = page.slice(start, end);
  check('Do It holds the scan off until the write finishes',
    body.indexOf('doItInFlight = true') >= 0 && body.indexOf('onOutlookTodoDoIt') < body.lastIndexOf('doItInFlight = false') &&
    body.indexOf('onOnedriveDoIt') < body.lastIndexOf('doItInFlight = false'));
  const remount = page.slice(page.indexOf('async function remountProvedTodoReceipt'), page.indexOf('async function onOutlookTodoDoIt'));
  check('reload drops the in-body Undo and keeps one host outside the message',
    page.indexOf('function stripDuplicateUndoHosts') > 0 && remount.indexOf('stripDuplicateUndoHosts(mount)') > 0);
  const popup = fs.readFileSync(path.join(__dirname, '..', 'popup', 'popup.js'), 'utf8');
  const storage = fs.readFileSync(path.join(__dirname, '..', 'src', 'storage.js'), 'utf8');
  check('Undo rewrites the OneDrive Activity row',
    storage.indexOf('markOnedriveFileUndone') > 0 && popup.indexOf('markOnedriveFileUndone') > 0 &&
    page.indexOf('markOnedriveFileUndone') > 0);
}

if (failures) {
  console.log('\n' + failures + ' failed');
  process.exit(1);
}
console.log('\nall passed');
})().catch((e) => { console.error(e); process.exit(1); });
