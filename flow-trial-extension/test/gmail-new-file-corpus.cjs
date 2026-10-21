// An empty Google Doc, Sheet or Slides deck from a request, on the existing Gmail card, behind the owner's
// switch WORKSPACE_FILE (off). Checks: the module speaks the Google lane's writer signature (an http
// function), the lane maps the new connector, the host reads the switch and the page only shows a card the
// worker offers. The real-browser run is e2e/gmail-new-file.spec.js.
// Run: node test/gmail-new-file-corpus.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const { FlowWorkspaceFile: W } = require('../core/workspace-file.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

// ---- the lane's writer signature: (input, http) and (ref, http) -----------------
const files = {};
let n = 0;
const http = async (req) => {
  const u = String(req.url);
  if (req.method === 'POST' && /\/drive\/v3\/files\?/.test(u)) {
    const body = JSON.parse(req.body);
    const id = 'F' + (++n);
    files[id] = { id, name: body.name, mimeType: body.mimeType, trashed: false, version: '1', modifiedTime: '2026-10-21T10:00:00.000Z', webViewLink: 'https://docs.google.com/document/d/' + id + '/edit' };
    return { status: 200, ok: true, json: { id, name: body.name, mimeType: body.mimeType, trashed: false } };
  }
  const id = decodeURIComponent((u.split('/files/')[1] || '').split('?')[0]);
  if (req.method === 'GET') return files[id] ? { status: 200, ok: true, json: Object.assign({}, files[id]) } : { status: 404, ok: false, json: null };
  if (req.method === 'PATCH') { Object.assign(files[id], JSON.parse(req.body)); return { status: 200, ok: true, json: files[id] }; }
  return { status: 400, ok: false, json: null };
};
(async () => {
  console.log('\n--- the Google lane writer signature ---\n');
  const input = { flags: { WORKSPACE_FILE: true }, fileKind: 'slides', name: 'Board update Q4', now: '2026-10-21T10:00:05.000Z' };
  const r = await W.write(input, http);
  check('write(input, http) creates the native file and proves it', r.ok === true && r.proof.system === 'google/slides' && r.proof.fetchedBack === true && files.F1.mimeType === 'application/vnd.google-apps.presentation', r);
  check('the receipt carries the file link', /^https:\/\/docs\.google\.com\//.test(r.url || ''), r.url);
  const u = await W.undo(r.ref, http);
  check('undo(ref, http) trashes it while unedited', u.ok === true && files.F1.trashed === true, u);
  const r2 = await W.write(input, http);
  files.F2.version = '5';
  const u2 = await W.undo(r2.ref, http);
  check('undo(ref, http) refuses after an edit', u2.ok === false && u2.reason === 'user-edited' && files.F2.trashed === false, u2);
  check('switch off: the lane writer makes nothing', (await W.write(Object.assign({}, input, { flags: {} }), http)).reason === 'switch-off');
  check('the Drive request names only fields the API and the stand-in know', !/owners/.test(fs.readFileSync(path.join(__dirname, '..', 'core', 'workspace-file.js'), 'utf8')));

  console.log('\n--- the wiring ---\n');
  const lane = read('src', 'google-lane.js');
  const host = read('src', 'google-lane-host.js');
  const gmail = read('src', 'content-gmail.js');
  const view = read('src', 'step-list-view.js');
  const manifest = read('manifest.json');
  check('the lane maps the connector to the module', /googleNewFile: 'FlowWorkspaceFile'/.test(lane));
  check('the host imports the module and reads the switch for the write', /import '\.\.\/core\/workspace-file\.js'/.test(host) && /\[W\.SWITCH\]: await laneSwitchOn\(W\.SWITCH\)/.test(host));
  check('the host answers the plan only when the switch is on', /flow:google-new-file-plan/.test(host) && /if \(!\(await laneSwitchOn\(W\.SWITCH\)\)\) return \{ action: 'off'/.test(host));
  check('reopening verifies the file by id like the other Drive writes', /\(DriveSave\|Doc\|SheetAppend\|NewFile\)/.test(host));
  check('the page shows a card only when the worker offers one, and only for inbound mail on a connected Google', /inboundMail && usingGoogle && await showNewFileChip\(/.test(gmail) && /plan\.action !== 'offer'/.test(gmail));
  check('the card is the existing chip with its step list, one step, no new design', /injectChip\(message, \{\s*messageId: c\.messageId/.test(gmail) && /kind: 'driveNewFile'/.test(gmail));
  check('the step writes through the lane with the file kind and name only', /action\.kind === 'driveNewFile'/.test(gmail) && /driveNewFile: 'googleNewFile'/.test(gmail));
  check('the step row says exactly where the file lands, not the Glance folder', /destinationText/.test(view) && /destinationText: /.test(gmail));
  check('the manifest is not changed by this wiring', !/workspace-file|WORKSPACE_FILE/.test(manifest));

  console.log(failures ? '\n' + failures + ' FAILED' : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})();
