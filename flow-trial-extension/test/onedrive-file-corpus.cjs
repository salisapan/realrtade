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
    setTimeout, clearTimeout,
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
        getManifest: () => ({ oauth2: { client_id: 'x' }, version: '0.9.40', content_scripts: [{ js: [] }] }),
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

// A drive that answers like Graph: PUT creates, GET reads the item, DELETE (when offered) removes it and the next GET is a 404
// unless the drive is told to keep it (a delete that answers 204 and leaves the file).
function createRoutes(getStatus, getBody, opts) {
  const o = opts || {};
  const state = { gone: false };
  const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => '' });
  const routes = [
    { method: 'GET', test: /\/me\/drive\/root:\/Glance\/passport\.pdf$/, reply: () => reply(404, {}) },
    { method: 'PUT', test: /\/me\/drive\/root:\/Glance\/passport\.pdf:\/content(\?.*)?$/, reply: () => reply(201, FILE) },
    { method: 'GET', test: /\/me\/drive\/items\/FILE1$/, reply: () => (state.gone ? reply(404, {}) : reply(getStatus, getBody)) }
  ];
  if (o.deleteStatus) {
    routes.push({ method: 'DELETE', test: /\/me\/drive\/items\/FILE1$/, reply: () => {
      if (o.deleteStatus === 204 && o.keepAfterDelete !== true) state.gone = true;
      return reply(o.deleteStatus, {});
    } });
  }
  return routes;
}

console.log('\n--- names, scope, one attachment ---\n');
{
  check('Files.ReadWrite can write and Files.Read cannot',
    F.hasWriteScope(['Files.ReadWrite']) === true && F.hasWriteScope(['Files.Read']) === false &&
    F.hasWriteScope(['https://graph.microsoft.com/Files.ReadWrite']) === true &&
    F.hasWriteScope(['Files.ReadWrite.All']) === false);
  check('an unknown scope list is not a refusal', F.hasWriteScope(null) === null);
  check('the file goes into the Glance folder, and the card can say exactly where',
    F.FOLDER === 'Glance' && F.rootItemPath('passport.pdf') === '/me/drive/root:/Glance/passport.pdf' &&
    F.createContentPath('a b.pdf') === '/me/drive/root:/Glance/a%20b.pdf:/content' &&
    F.destination('passport.pdf') === 'OneDrive > Glance > passport.pdf' &&
    F.destination('passport.pdf', 'Drive') === 'Drive > Glance > passport.pdf' && F.destination('') === '');
  check('a name cannot climb out of the folder', F.safeName('../secret.txt') === '' && F.safeName('passport.pdf') === 'passport.pdf');
  check('inline text is one upload under the simple cap',
    F.prepare(PAYLOAD).ok === true && F.prepare(PAYLOAD).fetchOne === false && F.prepare(PAYLOAD).name === 'passport.pdf');
  const big = { params: { content: 'x'.repeat(F.MAX_BYTES + 1), fileName: 'big.txt' } };
  check('a file over the simple upload cap is unclear', F.prepare(big).ok === false && F.prepare(big).reason === 'unclear');
  check('no bytes and no message is unclear', F.prepare({ label: 'Save' }).ok === false);
  check('save-shaped text is the only sentence that counts attachments',
    G.needsOneAttachment('Please save the attached file to Drive.') === true &&
    G.needsOneAttachment('Please save the attachment to OneDrive.') === true &&
    G.needsOneAttachment('Please save it to our shared files by Friday.') === false &&
    G.needsOneAttachment('We agreed to renew the passport application by Friday.') === false);
  const mapped = J.forSurface({
    id: 'file-it',
    steps: [
      { kind: 'driveFile', id: 'file', params: { copyAttachment: true } },
      { kind: 'gmailDraft', id: 'draft', dependsOn: 'file', params: {} }
    ]
  }, 'outlook');
  check('Outlook file-save is one OneDrive step: the Drive link-draft that waits on the file is gone',
    mapped.steps.length === 1 && mapped.steps[0].kind === 'onedriveFile' && mapped.steps[0].label === 'OneDrive' &&
    !mapped.steps.some((s) => /draft/i.test(s.kind)) &&
    mapped.closedLine === 'Saved on OneDrive.' && mapped.closingLine === 'Saving the attached file to OneDrive.');
  check('a draft that does not wait on the file stays an Outlook draft step',
    J.forSurface({ steps: [{ kind: 'driveFile', id: 'file' }, { kind: 'gmailDraft', id: 'gmailDraft', params: {} }] }, 'outlook').steps[1].kind === 'outlookDraft');
  check('Gmail keeps the Drive save and its link draft',
    J.forSurface({ steps: [{ kind: 'driveFile', id: 'file' }, { kind: 'gmailDraft', id: 'draft', dependsOn: 'file' }] }, 'gmail').steps.length === 2);
  check('Gmail still writes Drive',
    J.forSurface({ steps: [{ kind: 'driveFile', id: 'file' }] }, 'gmail').steps[0].kind === 'driveFile');
}

console.log('\n--- Outlook wording: OneDrive fires, a refusal and shared files do not ---\n');
{
  const engine = { module: undefined, console };
  vm.createContext(engine);
  for (const f of ['domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'close-families.js', 'fact-reply.js', 'intent.js', 'actions.js', 'file-attach.js', 'resolution.js', 'incoming-judge.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'core', f), 'utf8'), engine, { filename: f });
  }
  const Judge = vm.runInContext('FlowIncomingJudge', engine);
  const when = new Date('2026-10-07T12:00:00Z');
  function outlook(text, count) {
    return Judge.judge({
      text: text,
      subject: 'Gate 0.9.34 signed NDA attached',
      sender: { name: 'flow', email: 'ai.local.flow@gmail.com' },
      attachmentCount: count,
      hasThreadAttachment: count === 1,
      surface: 'outlook',
      now: when
    });
  }
  [
    'Please save the attachment to OneDrive.',
    'Please store the attached file on OneDrive.',
    'Please upload the attachment to OneDrive.'
  ].forEach((text) => {
    const row = outlook(text, 1);
    const kinds = row.process && row.process.steps.map((s) => s.kind);
    check('Outlook Do It writes OneDrive: ' + text,
      row.show === true && kinds && kinds[0] === 'onedriveFile' && row.process.closedLine === 'Saved on OneDrive.',
      { show: row.show, reason: row.reason, kinds: kinds });
  });
  [
    "Please don't save the attachment to Drive.",
    'Do not save the attached file to Drive.',
    'No need to save the attachment to Drive.'
  ].forEach((text) => {
    const row = outlook(text, 1);
    check('Outlook stays quiet on a refusal: ' + text, row.show === false && row.reason === 'quiet:google', row.reason);
  });
  const shared = outlook('Hi, Attached is the signed NDA. Please save it to our shared files by Friday, October 9. Thanks, Flow Gate', 1);
  check('our shared files stays silent on Outlook', shared.show === false && shared.reason === 'intent-null', shared.reason);
  check('zero files and two files stay silent',
    outlook('Please save the attachment to OneDrive.', 0).show === false &&
    outlook('Please save the attachment to OneDrive.', 2).show === false);
  const forget = outlook("Don't forget to save the attached file to OneDrive.", 1);
  const forgetKinds = forget.process && forget.process.steps.map((s) => s.kind);
  check('don\'t forget to save the attached file to OneDrive still shows on Outlook',
    forget.show === true && forgetKinds && forgetKinds[0] === 'onedriveFile' && forget.process.steps[0].label === 'OneDrive',
    { show: forget.show, reason: forget.reason, kinds: forgetKinds, label: forget.process && forget.process.steps[0].label });
  function gmail(text, count) {
    return Judge.judge({
      text: text,
      subject: 'Please save this',
      sender: { name: 'flow', email: 'ai.local.flow@gmail.com' },
      attachmentCount: count,
      hasThreadAttachment: count === 1,
      surface: 'gmail',
      now: when
    });
  }
  const { FlowGraphMail: Mail } = require('../core/graph-mail.js');
  const HTML_SAVE = '<html><body><div dir="auto">Hi, Please save the attachment to OneDrive by Friday, October 9. Thanks</div></body></html>';
  const HTML_DONT = '<html><body><div dir="auto">Hi, Please don&#39;t save the attachment to OneDrive. Thanks</div></body></html>';
  const htmlOne = outlook(Mail.ownText(Mail.htmlToText(HTML_SAVE)), 1);
  const htmlKinds = htmlOne.process && htmlOne.process.steps.map((s) => s.kind);
  check('Gate HTML with one PDF is the OneDrive step alone',
    htmlOne.show === true && htmlKinds && htmlKinds.length === 1 && htmlKinds[0] === 'onedriveFile' &&
    htmlOne.process.steps[0].label === 'OneDrive',
    { show: htmlOne.show, reason: htmlOne.reason, kinds: htmlKinds });
  check('Gate HTML with zero files stays quiet', outlook(Mail.ownText(Mail.htmlToText(HTML_SAVE)), 0).show === false);
  check('Gate HTML with two files stays quiet', outlook(Mail.ownText(Mail.htmlToText(HTML_SAVE)), 2).show === false);
  const htmlDont = outlook(Mail.ownText(Mail.htmlToText(HTML_DONT)), 1);
  check('Gate HTML don\'t save stays quiet with one file',
    /don't save/.test(Mail.htmlToText(HTML_DONT)) && htmlDont.show === false && htmlDont.reason === 'quiet:google',
    { text: Mail.htmlToText(HTML_DONT), show: htmlDont.show, reason: htmlDont.reason });
  const gmailSave = gmail('Please save the attached file to OneDrive.', 1);
  check('Gmail stays quiet when the ask names OneDrive',
    gmailSave.show === false && gmailSave.reason === 'onedrive-target-on-gmail' && !(gmailSave.process && gmailSave.process.steps),
    { show: gmailSave.show, reason: gmailSave.reason });
  const gmailDrive = gmail('Please save the attached file to Drive.', 1);
  check('Gmail still shows a Drive save',
    gmailDrive.show === true && gmailDrive.process.steps[0].kind === 'driveFile' && gmailDrive.process.steps[0].label === 'Drive',
    { show: gmailDrive.show, reason: gmailDrive.reason, label: gmailDrive.process && gmailDrive.process.steps[0].label });
  [
    'אל תשמור את הקובץ המצורף בדרייב בבקשה.',
    'לא צריך לשמור את הקובץ המצורף בדרייב.',
    'אין צורך לשמור את הקובץ המצורף בדרייב.',
    'לא לשמור את הקובץ המצורף בדרייב.'
  ].forEach((text) => {
    const row = outlook(text, 1);
    check('Outlook stays quiet on a Hebrew refusal: ' + text, row.show === false && row.reason === 'quiet:google', row.reason);
  });
  const signed = [
    'תשמור את הקובץ המצורף ב-One Drive עד יום ראשון\n\nנשלח מה-iPhone שלי',
    'תשמור את הקובץ המצורף ב\u05BEOne Drive עד יום ראשון\n\nנשלח מה-iPhone שלי',
    'Please save the attached file to One Drive by Sunday\n\nSent from my iPhone'
  ];
  signed.forEach((text) => {
    const one = outlook(text, 1);
    const kinds = one.process && one.process.steps && one.process.steps.map((s) => s.kind);
    check('One Drive with a phone signature shows on Outlook at one file, one step',
      one.show === true && kinds && kinds.length === 1 && kinds[0] === 'onedriveFile',
      { text: text.slice(0, 48), show: one.show, reason: one.reason, kinds: kinds });
    check('that save stays quiet at zero files', outlook(text, 0).show === false, text.slice(0, 24));
    check('that save stays quiet at two files', outlook(text, 2).show === false, text.slice(0, 24));
    const g = gmail(text, 1);
    check('Gmail stays quiet on that One Drive save',
      g.show === false && g.reason === 'onedrive-target-on-gmail',
      { text: text.slice(0, 48), show: g.show, reason: g.reason });
  });
  const signedNo = 'אל תשמור את הקובץ המצורף ב-One Drive\n\nנשלח מה-iPhone שלי';
  check('a Hebrew One Drive refusal with an iPhone line stays quiet',
    outlook(signedNo, 1).show === false && gmail(signedNo, 1).show === false,
    { outlook: outlook(signedNo, 1).reason, gmail: gmail(signedNo, 1).reason });
  const form = 'בבקשה לצרף את טופס 101 לזימון של הדמו ביום שני בשעה 9:00';
  const formOutlook = outlook(form, 1);
  const formGmail = gmail(form, 1);
  function inviteTrack(row) {
    const kinds = row.process && row.process.steps && row.process.steps.map((s) => s.kind);
    const taskAt = kinds ? kinds.findIndex((k) => k === 'googleTask' || k === 'outlookTask') : -1;
    const draftAt = kinds ? kinds.findIndex((k) => k === 'gmailDraft' || k === 'outlookDraft') : -1;
    const draft = row.process && row.process.steps && row.process.steps[draftAt] && row.process.steps[draftAt].params && row.process.steps[draftAt].params.body;
    return row.show === true && row.intent && row.intent.label === 'לצרף טופס 101 לזימון' && draft === 'אצרף בהקדם.' && !/מצורף/.test(String(draft || '')) && taskAt !== -1 && draftAt > taskAt;
  }
  check('attaching a form to a demo invite is the file track',
    inviteTrack(formOutlook) && inviteTrack(formGmail),
    { outlook: { show: formOutlook.show, reason: formOutlook.reason, label: formOutlook.intent && formOutlook.intent.label },
      gmail: { show: formGmail.show, reason: formGmail.reason, label: formGmail.intent && formGmail.intent.label } });
}

(async () => {
console.log('\n--- create, read back, undo ---\n');
{
  const env = background({ routes: createRoutes(200, FILE, { deleteStatus: 204 }) });
  const out = await env.fn('outlookFileWrite')(PAYLOAD);
  const put = env.calls.find((c) => c.method === 'PUT');
  const gets = env.calls.filter((c) => c.method === 'GET' && /\/items\/FILE1$/.test(c.url));
  check('PUT creates the file, then GET reads that id',
    out.ok === true && out.proof && out.proof.fetchedBack === true && out.proof.system === 'microsoft/onedrive' &&
    out.proof.externalId === 'FILE1' && out.ref.created === true && out.ref.fileId === 'FILE1' &&
    put && /\/passport\.pdf:\/content\?@microsoft\.graph\.conflictBehavior=rename$/.test(put.url) && gets.length === 1,
    { out, calls: env.calls.map((c) => c.method + ' ' + c.url) });
  check('Handled is allowed only for that proof', Proof.allowsHandled({ ok: true, proof: out.proof }) === true);
  check('nothing was sent', !env.calls.some((c) => /\/(send|reply|replyAll|forward|sendMail)(\b|\/|$)/i.test(c.url)));
  const undo = await env.fn('outlookFileUndo')(out.ref);
  const del = env.calls.filter((c) => c.method === 'DELETE');
  check('Undo DELETEs a file this write created',
    undo.ok === true && del.length === 1 && /\/me\/drive\/items\/FILE1$/.test(del[0].url), del.map((c) => c.url));
  const renamed = background({ routes: [
    { method: 'GET', test: /\/me\/drive\/items\/FILE1$/, reply: () => ({ ok: true, status: 200, json: async () => Object.assign({}, FILE, { name: 'renamed.pdf', eTag: 'user' }), text: async () => '' }) }
  ] });
  const kept = await renamed.fn('outlookFileUndo')({
    fileId: 'FILE1', itemId: 'FILE1', externalId: 'FILE1', created: true,
    editSnap: { name: 'passport.pdf', eTag: 'created' }
  });
  check('a file the person edited is not deleted',
    kept.ok === false && kept.reason === 'user-edited' &&
    kept.written === 'You edited this. Undo left it alone.' &&
    !renamed.calls.some((c) => c.method === 'DELETE' || c.method === 'PUT' || c.method === 'PATCH'),
    kept);
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

console.log('\n--- a taken name is never overwritten ---\n');
{
  const NEW = { id: 'FILE2', name: 'passport (1).pdf', webUrl: 'https://onedrive.live.com/edit.aspx?id=FILE2' };
  const state = { gone: false };
  const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => '' });
  const routes = [
    { method: 'PUT', test: /\/me\/drive\/root:\/Glance\/passport\.pdf:\/content\?@microsoft\.graph\.conflictBehavior=rename$/, reply: () => reply(201, NEW) },
    { method: 'GET', test: /\/me\/drive\/items\/FILE2$/, reply: () => (state.gone ? reply(404, {}) : reply(200, NEW)) },
    { method: 'DELETE', test: /\/me\/drive\/items\/FILE2$/, reply: () => { state.gone = true; return reply(204, {}); } }
  ];
  const env = background({ routes: routes });
  const out = await env.fn('outlookFileWrite')(PAYLOAD);
  check('the save goes beside the file that is there, as a new item, and never replaces it',
    out.ok === true && out.ref.created === true && out.ref.fileId === 'FILE2' && !out.ref.previousVersionId &&
    out.target === 'passport (1).pdf' && out.written === 'OneDrive \u00b7 passport (1).pdf' && out.proof.fetchedBack === true &&
    !env.calls.some((c) => /\/versions|restoreVersion|\/items\/OLD1/.test(c.url)) &&
    env.calls.filter((c) => c.method === 'PUT').length === 1, { out, calls: env.calls.map((c) => c.method + ' ' + c.url) });
  const undo = await env.fn('outlookFileUndo')(out.ref);
  check('Undo deletes only the new item and the old file is untouched',
    undo.ok === true && env.calls.filter((c) => c.method === 'DELETE').length === 1 &&
    !env.calls.some((c) => c.method === 'DELETE' && /OLD1/.test(c.url)) && !env.calls.some((c) => /restoreVersion/.test(c.url)), undo);

  // A receipt saved by 0.9.56 can still carry a version to restore. That restore stays as it was.
  const legacy = background({ routes: [
    { method: 'GET', test: /\/me\/drive\/items\/FILE1$/, reply: () => reply(200, FILE) },
    { method: 'POST', test: /\/versions\/VER1\/restoreVersion$/, reply: () => reply(204, {}) }
  ] });
  const back = await legacy.fn('outlookFileUndo')({ fileId: 'FILE1', itemId: 'FILE1', externalId: 'FILE1', created: false, previousVersionId: 'VER1' });
  check('a receipt with a previous version still restores it and never deletes',
    back.ok === true && legacy.calls.filter((c) => c.method === 'POST').length === 1 && !legacy.calls.some((c) => c.method === 'DELETE'), back);
}

console.log('\n--- Undo deletes a file Glance created ---\n');
{
  const env = background({ routes: createRoutes(200, FILE, { deleteStatus: 204 }) });
  const out = await env.fn('outlookFileWrite')(PAYLOAD);
  const put = env.calls.find((c) => c.method === 'PUT');
  check('a new file is put in the Glance folder', out.ok === true && out.ref.created === true && put && /\/me\/drive\/root:\/Glance\/passport\.pdf:\/content\?/.test(put.url), put);
  const undo = await env.fn('outlookFileUndo')(out.ref);
  const del = env.calls.filter((c) => c.method === 'DELETE');
  const lastGet = env.calls.filter((c) => c.method === 'GET' && /\/items\/FILE1$/.test(c.url)).length;
  check('Undo deletes that file, reads it back as gone, and only then says so',
    undo.ok === true && del.length === 1 && /\/items\/FILE1$/.test(del[0].url) && undo.written === 'OneDrive file removed.' && lastGet >= 3, undo);
  const failing = background({ routes: createRoutes(200, FILE, { deleteStatus: 500 }) });
  const w = await failing.fn('outlookFileWrite')(PAYLOAD);
  const u = await failing.fn('outlookFileUndo')(w.ref);
  check('a failed delete is an honest error, not a removed file', u.ok === false && u.reason === 'http-500', u);
  // The delete answers 204 and the file is still there: not removed, not Undone.
  const stuck = background({ routes: createRoutes(200, FILE, { deleteStatus: 204, keepAfterDelete: true }) });
  const ws = await stuck.fn('outlookFileWrite')(PAYLOAD);
  const us = await stuck.fn('outlookFileUndo')(ws.ref);
  check('a delete that leaves the file in OneDrive fails closed and does not claim removal',
    us.ok === false && us.reason === 'still-there' && us.written !== 'OneDrive file removed.' && /still has this file/.test(us.written), us);
  // The delete answers 404 for an id that was never this file's, and the file is still there.
  const odd = background({ routes: createRoutes(200, FILE).concat([
    { method: 'DELETE', test: /\/me\/drive\/items\/FILE1$/, reply: () => ({ ok: false, status: 404, json: async () => ({}), text: async () => '' }) }
  ]) });
  const wo = await odd.fn('outlookFileWrite')(PAYLOAD);
  const uo = await odd.fn('outlookFileUndo')(wo.ref);
  check('a 404 on delete while a read still finds the file is not a removal', uo.ok === false && uo.reason === 'still-there', uo);
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
  check('reload keeps one receipt for this message',
    page.indexOf('function stripDuplicateUndoHosts') > 0 && remount.indexOf('stripDuplicateUndoHosts(mount)') > 0 &&
    page.indexOf('glanceUndoneBanners') > 0);
  const undoClick = page.slice(page.indexOf("undo.addEventListener('click'"), page.indexOf('done.appendChild(actionsRow)'));
  check('a successful Undo leaves the Undone line on this message',
    undoClick.indexOf('data-glance-undone') > 0 &&
    undoClick.indexOf("copy.undoneLine") > undoClick.indexOf('data-glance-undone') &&
    remount.indexOf('data-glance-undone') > 0 &&
    remount.indexOf('data-glance-undone') < remount.indexOf('if (!outlookProofRow(row))'));
  const ctx = page.slice(page.indexOf('function buildCtx'), page.indexOf('function preferHumanFrom'));
  check('the open page keeps the OneDrive step when a draft sits beside it',
    ctx.indexOf('onedriveFile') > 0 && ctx.indexOf('!hasOnedrive') > 0);
  const outlookSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'outlook.js'), 'utf8');
  check('the Outlook card body is the message, not the subject glued in front',
    /const text = inc\.base\.text \|\| ''/.test(outlookSrc) &&
    outlookSrc.indexOf("inc.base.subject + '\\n'") < 0 &&
    /bodyText: text/.test(outlookSrc));
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
