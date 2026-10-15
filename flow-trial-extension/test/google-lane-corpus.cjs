// Google lane. Each write reads the id back before a proof. Undo removes
// that id. Compose is filled and never sent. Scopes stay on the allowlist.
// Run: node test/google-lane-corpus.cjs

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const EXT = path.join(__dirname, '..');
const sandbox = {
  module: undefined,
  console,
  atob: (s) => Buffer.from(s, 'base64').toString('binary'),
  TextEncoder,
  Uint8Array,
  Date
};
vm.createContext(sandbox);
const core = [
  'domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'intent.js', 'actions.js',
  'proof-of-close.js', 'draft-reply.js', 'google-config.js', 'google-calendar.js', 'google-tasks.js',
  'google-drive.js', 'google-docs.js', 'google-sheets.js', 'google-contacts.js', 'google-compose.js',
  'google-proof.js'
];
for (const f of core) {
  vm.runInContext(fs.readFileSync(path.join(EXT, 'core', f), 'utf8'), sandbox, { filename: f });
}
vm.runInContext(fs.readFileSync(path.join(EXT, 'src', 'google-lane.js'), 'utf8'), sandbox, { filename: 'google-lane.js' });
vm.runInContext(fs.readFileSync(path.join(EXT, 'src', 'google-compose-page.js'), 'utf8'), sandbox, { filename: 'google-compose-page.js' });

const Cfg = vm.runInContext('FlowGoogleConfig', sandbox);
const Cal = vm.runInContext('FlowGoogleCalendar', sandbox);
const Tasks = vm.runInContext('FlowGoogleTasks', sandbox);
const Drive = vm.runInContext('FlowGoogleDrive', sandbox);
const Docs = vm.runInContext('FlowGoogleDocs', sandbox);
const Sheets = vm.runInContext('FlowGoogleSheets', sandbox);
const Contacts = vm.runInContext('FlowGoogleContacts', sandbox);
const Compose = vm.runInContext('FlowGoogleCompose', sandbox);
const Proof = vm.runInContext('FlowGoogleProof', sandbox);
const Lane = vm.runInContext('FlowGoogleLane', sandbox);
const Page = vm.runInContext('FlowGoogleComposePage', sandbox);

const CLOCK = '2026-10-14T12:00:00.000Z';
const GATE_NOW = new Date(2026, 9, 7, 12, 0, 0);
const EN = 'Put the glance-pricing-q4.pdf file on my calendar tomorrow (Oct 8, 2026) at 10:00.';
const FILE_URL = 'https://drive.google.com/file/d/f1/view';

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

function scripted(steps) {
  const calls = [];
  let i = 0;
  async function http(req) {
    calls.push({ method: req.method, url: req.url, body: req.body });
    const step = steps[i++] || { status: 500, ok: false, json: null };
    return step;
  }
  return { http, calls };
}

function proved(res) {
  return !!(res && res.ok === true && res.proof && res.proof.fetchedBack === true && res.proof.externalId);
}

function noGmail(calls) {
  return calls.every((c) => !/gmail/i.test(c.url) && c.method !== 'SEND');
}

console.log('\n--- allowlist, key, full-flavor manifest ---\n');
{
  const full = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.full.json'), 'utf8'));
  const live = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
  const der = Buffer.from(full.key, 'base64');
  const hash = crypto.createHash('sha256').update(der).digest();
  const id = hash.slice(0, 16).toString('hex').split('').map((c) => String.fromCharCode(parseInt(c, 16) + 97)).join('');
  check('full flavor key hashes to the store id', id === 'lbihckfmoffgjjlnneoeaehbhoonfenh' && id === Cfg.EXTENSION_ID, id);
  check('full flavor client is the lane client', full.oauth2.client_id === Cfg.CLIENT_ID);
  check('full flavor scopes are the allowlist', JSON.stringify(full.oauth2.scopes) === JSON.stringify(Cfg.SCOPES));
  check('live manifest is still the current worker', live.background.service_worker === 'src/background.js' && live.key !== full.key);
  check('full flavor worker is the wrapper', full.background.service_worker === 'src/google-lane-sw.js');
  check('docs, sheets, and people hosts are on the full flavor',
    full.host_permissions.indexOf('https://docs.googleapis.com/*') >= 0 &&
    full.host_permissions.indexOf('https://sheets.googleapis.com/*') >= 0 &&
    full.host_permissions.indexOf('https://people.googleapis.com/*') >= 0);
  const refused = ['https://www.googleapis.com/auth/gmail.compose', 'https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/documents', 'https://www.googleapis.com/auth/spreadsheets'];
  check('gmail, wide drive, documents, and spreadsheets are refused', refused.every((s) => Cfg.assertAllowed([s]).ok === false));
  check('the allowlist itself is accepted', Cfg.assertAllowed(Cfg.SCOPES).ok === true);
  const sw = fs.readFileSync(path.join(EXT, 'src', 'google-lane-sw.js'), 'utf8');
  check('the wrapper imports the current worker and the lane', sw.indexOf("import './background.js'") >= 0 && sw.indexOf("import './google-lane.js'") >= 0);
  const pageSrc = fs.readFileSync(path.join(EXT, 'src', 'google-compose-page.js'), 'utf8');
  check('the compose page never activates a control', pageSrc.indexOf('.click(') < 0 && pageSrc.indexOf('MutationObserver') < 0);
  const gmailScripts = live.content_scripts[0].js;
  check('the live Gmail page loads the compose filler before the card',
    gmailScripts.indexOf('core/google-compose.js') >= 0 &&
    gmailScripts.indexOf('src/google-compose-page.js') > gmailScripts.indexOf('core/google-compose.js') &&
    gmailScripts.indexOf('src/google-compose-page.js') < gmailScripts.indexOf('src/content-gmail.js'));
  const gmailSrc = fs.readFileSync(path.join(EXT, 'src', 'content-gmail.js'), 'utf8');
  const composeSlice = gmailSrc.slice(gmailSrc.indexOf('async function sendGmailCompose'), gmailSrc.indexOf('function sendLaneUndo'));
  check('a filled receipt is the compose DOM, not the in-memory fill',
    composeSlice.indexOf('composeReadBack') >= 0 && composeSlice.indexOf('return sw') < 0 && composeSlice.indexOf("type: 'flow:gmail-compose'") >= 0);
  const receiptSlice = gmailSrc.slice(gmailSrc.indexOf('function placeReceipt'), gmailSrc.indexOf('async function showMultiActionReceipt'));
  check('the compose receipt replaces the card and says filled only after read-back',
    receiptSlice.indexOf('composeReadBack') >= 0 && receiptSlice.indexOf('host.replaceChildren') >= 0 &&
    receiptSlice.indexOf('Compose filled') > receiptSlice.indexOf('composeReadBack'));
  const worker = fs.readFileSync(path.join(EXT, 'src', 'background.js'), 'utf8');
  check('background.js does not gain the lane dispatcher', worker.indexOf('FlowGoogleLane') < 0);
}

console.log('\n--- calendar hold reads the event back, then undo deletes it ---\n');
(async () => {
  const decided = Cal.decide({ text: EN, now: GATE_NOW, senderEmail: 'me@gmail.com', fileMatch: 'one' });
  check('one file and one clock is a hold', decided.move === 'hold' && decided.params && decided.params.dateIso === '2026-10-08', decided.move);
  const body = Cal.eventBody({ dateIso: '2026-10-08', hour: 10, minute: 0, fileName: 'glance-pricing-q4.pdf', fileUrl: FILE_URL, quote: EN });
  check('the event invites nobody', body && Array.isArray(body.attendees) && body.attendees.length === 0 && body.summary === 'glance-pricing-q4.pdf');
  check('attendees are refused', Cal.createRequest(Object.assign({}, body, { attendees: [{ email: 'a@b.c' }] })) === null);
  const held = scripted([
    { status: 200, ok: true, json: { id: 'ev1', htmlLink: 'https://calendar.google.com/calendar/event?eid=ev1' } },
    { status: 200, ok: true, json: { id: 'ev1', status: 'confirmed' } }
  ]);
  const wrote = await Cal.write({
    scopes: Cfg.SCOPES, dateIso: '2026-10-08', hour: 10, minute: 0,
    fileName: 'glance-pricing-q4.pdf', fileUrl: FILE_URL, quote: EN
  }, held.http, CLOCK);
  check('calendar write is proved from the GET', proved(wrote) && wrote.proof.system === 'google/calendar' && held.calls.length === 2 && held.calls[1].method === 'GET', wrote);
  check('calendar create does not notify guests', held.calls[0].method === 'POST' && held.calls[0].url.indexOf('sendUpdates=none') >= 0);
  check('calendar calls stay off gmail', noGmail(held.calls));
  const undone = scripted([
    { status: 200, ok: true, json: { id: 'ev1', status: 'confirmed' } },
    { status: 204, ok: true, json: null }
  ]);
  const undo = await Cal.undo(wrote.ref, undone.http);
  check('calendar undo reads the event, then deletes it', undo.ok === true && undone.calls[0].method === 'GET' && undone.calls[1].method === 'DELETE' && undone.calls[1].url.indexOf('ev1') >= 0 && undone.calls[1].url.indexOf('sendUpdates=none') >= 0, undo);
  const editedCal = scripted([{ status: 200, ok: true, json: { id: 'ev1', summary: 'Changed', status: 'confirmed' } }]);
  const refusedCal = await Cal.undo(wrote.ref, editedCal.http);
  check('calendar undo refuses a changed event and does not delete it', refusedCal.ok === false && refusedCal.reason === 'user-edited' && editedCal.calls.length === 1 && editedCal.calls[0].method === 'GET', refusedCal);
  const blocked = scripted([]);
  const denied = await Cal.write({ scopes: ['https://www.googleapis.com/auth/gmail.compose'], dateIso: '2026-10-08', hour: 10, minute: 0, fileName: 'a.pdf', fileUrl: FILE_URL }, blocked.http, CLOCK);
  check('a gmail scope does not create an event', denied.ok === false && denied.reason === 'gmail-scope' && blocked.calls.length === 0, denied);

  console.log('\n--- a task is read back, then undo deletes it ---\n');
  const tasked = scripted([
    { status: 200, ok: true, json: { id: 't1', title: 'Send the file' } },
    { status: 200, ok: true, json: { id: 't1', title: 'Send the file' } }
  ]);
  const task = await Tasks.write({ scopes: Cfg.SCOPES, taskListId: 'list1', title: 'Send the file' }, tasked.http, CLOCK);
  check('task write is proved from the GET', proved(task) && task.proof.system === 'google/tasks' && tasked.calls[0].method === 'POST' && tasked.calls[1].method === 'GET', task);
  check('task calls stay off gmail', noGmail(tasked.calls));
  const taskUndo = scripted([
    { status: 200, ok: true, json: { id: 't1', title: 'Send the file' } },
    { status: 204, ok: true, json: null }
  ]);
  const taskGone = await Tasks.undo(task.ref, taskUndo.http);
  check('task undo reads the task, then deletes it', taskGone.ok === true && taskUndo.calls[0].method === 'GET' && taskUndo.calls[1].method === 'DELETE' && taskUndo.calls[1].url.indexOf('/lists/list1/tasks/t1') >= 0, taskGone);
  const taskEdited = scripted([{ status: 200, ok: true, json: { id: 't1', title: 'Changed by you' } }]);
  const taskRefused = await Tasks.undo(task.ref, taskEdited.http);
  check('task undo refuses a changed task and does not delete it', taskRefused.ok === false && taskRefused.reason === 'user-edited' && taskEdited.calls.length === 1 && taskEdited.calls[0].method === 'GET', taskRefused);

  console.log('\n--- one Drive file is read back, then undo trashes it ---\n');
  const SNAP = { headRevisionId: 'rev-1', version: '1', modifiedTime: '2026-10-15T00:00:00.000Z' };
  const saved = scripted([
    { status: 200, ok: true, json: { id: 'file1', name: 'note.txt', trashed: false, contentHash: 'abc' } },
    { status: 200, ok: true, json: Object.assign({ id: 'file1', name: 'note.txt', trashed: false, contentHash: 'abc' }, SNAP) }
  ]);
  const drive = await Drive.write({ scopes: Cfg.SCOPES, fileName: 'note.txt', base64: Buffer.from('hi').toString('base64'), mimeType: 'text/plain' }, saved.http, CLOCK);
  check('drive write is proved from the GET', proved(drive) && drive.proof.system === 'google/drive' && drive.ref.created === true && saved.calls[1].method === 'GET', drive);
  check('drive calls stay off gmail', noGmail(saved.calls));
  const trashed = scripted([
    { status: 200, ok: true, json: Object.assign({ id: 'file1', name: 'note.txt', trashed: false }, SNAP) },
    { status: 200, ok: true, json: { id: 'file1', trashed: true } }
  ]);
  const driveUndo = await Drive.undo(drive.ref, trashed.http);
  check('drive undo reads the file, then trashes it', driveUndo.ok === true && drive.ref.snapshot.headRevisionId === 'rev-1' && trashed.calls[0].method === 'GET' && trashed.calls[1].method === 'PATCH', driveUndo);
  const driveEdited = scripted([{ status: 200, ok: true, json: Object.assign({ id: 'file1', name: 'note-edited.txt', trashed: false }, SNAP, { headRevisionId: 'rev-2', modifiedTime: '2026-10-15T01:00:00.000Z' }) }]);
  const driveRefused = await Drive.undo(drive.ref, driveEdited.http);
  check('drive undo refuses a changed file and does not trash it', driveRefused.ok === false && driveRefused.reason === 'user-edited' && driveRefused.error === 'You edited this. Undo left it alone.' && driveEdited.calls.length === 1 && driveEdited.calls[0].method === 'GET', driveRefused);
  const driveDown = scripted([{ status: 500, ok: false, json: null }]);
  const driveUnread = await Drive.undo(drive.ref, driveDown.http);
  check('drive undo refuses when the read fails and does not trash', driveUnread.ok === false && driveUnread.reason === 'unconfirmed' && driveUnread.error === "Couldn't confirm it's unchanged. Undo left it alone." && driveDown.calls.length === 1, driveUnread);
  let driveThrew = false;
  const driveTimeout = await Drive.undo(drive.ref, async () => { driveThrew = true; throw new Error('timeout'); });
  check('drive undo refuses on a timeout and does not trash', driveTimeout.ok === false && driveTimeout.reason === 'unconfirmed' && driveThrew === true, driveTimeout);
  const bareDrive = Object.assign({}, drive.ref, { snapshot: null });
  const driveNoSnap = await Drive.undo(bareDrive, scripted([{ status: 200, ok: true, json: Object.assign({ id: 'file1', trashed: false }, SNAP) }]).http);
  check('drive undo without a snapshot does not trash', driveNoSnap.ok === false && driveNoSnap.reason === 'unconfirmed' && driveNoSnap.error === "Couldn't confirm it's unchanged. Undo left it alone.", driveNoSnap);
  const timeOnly = { headRevisionId: 'rev-1', modifiedTime: SNAP.modifiedTime };
  const driveTimeOnly = scripted([{ status: 200, ok: true, json: Object.assign({ id: 'file1', trashed: false }, timeOnly) }]);
  const driveTimeRefused = await Drive.undo(Object.assign({}, drive.ref, { snapshot: timeOnly }), driveTimeOnly.http);
  check('drive undo refuses a modifiedTime match when version is missing and does not trash', driveTimeRefused.ok === false && driveTimeRefused.reason === 'unconfirmed' && driveTimeRefused.error === "Couldn't confirm it's unchanged. Undo left it alone." && driveTimeOnly.calls.length === 1, driveTimeRefused);
  const driveVersion = scripted([{ status: 200, ok: true, json: Object.assign({ id: 'file1', trashed: false }, SNAP, { version: '2' }) }]);
  const driveVersionRefused = await Drive.undo(drive.ref, driveVersion.http);
  check('drive undo refuses a version mismatch and does not trash', driveVersionRefused.ok === false && driveVersionRefused.reason === 'user-edited' && driveVersionRefused.error === 'You edited this. Undo left it alone.' && driveVersion.calls.length === 1, driveVersionRefused);
  const driveRevOnly = scripted([{ status: 200, ok: true, json: { id: 'file1', trashed: false, version: '1', modifiedTime: SNAP.modifiedTime, headRevisionId: 'rev-live' } }]);
  const driveRevRefused = await Drive.undo(Object.assign({}, drive.ref, { snapshot: { version: '1', modifiedTime: SNAP.modifiedTime } }), driveRevOnly.http);
  check('drive undo refuses when only the live file has a head revision and does not trash', driveRevRefused.ok === false && driveRevRefused.reason === 'unconfirmed' && driveRevOnly.calls.length === 1, driveRevRefused);

  function markedDoc(name, parts, rangeText, revisionId) {
    let cursor = 1;
    const elements = [];
    let range = null;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const start = cursor;
      const end = cursor + part.length;
      elements.push({ startIndex: start, endIndex: end, textRun: { content: part } });
      if (part === rangeText && !range) range = { startIndex: start, endIndex: end };
      cursor = end;
    }
    const body = { body: { content: [{ paragraph: { elements: elements } }] }, namedRanges: {} };
    if (revisionId) body.revisionId = revisionId;
    if (range && name) {
      body.namedRanges[name] = {
        name: name,
        namedRanges: [{ namedRangeId: 'kix.' + name, name: name, ranges: [range] }]
      };
    }
    return body;
  }

  function undoBody(call) {
    return JSON.parse(call.body);
  }

  console.log('\n--- a Doc is created and edited, then undo removes it ---\n');
  const docText = 'Please find the receipt.';
  const createdMark = Docs.rangeName('doc1', docText, CLOCK);
  const created = scripted([
    { status: 200, ok: true, json: { id: 'doc1', name: 'Receipt', mimeType: 'application/vnd.google-apps.document', trashed: false } },
    { status: 200, ok: true, json: { id: 'doc1', trashed: false } },
    { status: 200, ok: true, json: {} },
    { status: 200, ok: true, json: markedDoc(createdMark, [docText], docText) },
    { status: 200, ok: true, json: Object.assign({ id: 'doc1', trashed: false }, SNAP) }
  ]);
  const doc = await Docs.write({ scopes: Cfg.SCOPES, name: 'Receipt', text: docText }, created.http, CLOCK);
  check('doc create is proved from the named range', proved(doc) && doc.proof.system === 'google/docs' && doc.ref.created === true && doc.ref.rangeName === createdMark && doc.ref.snapshot.headRevisionId === 'rev-1' && created.calls.length === 5 && created.calls[3].method === 'GET' && created.calls[4].method === 'GET', doc);
  const createdBatch = JSON.parse(created.calls[2].body);
  check('the insert is stored in a named range',
    createdBatch.requests[0].insertText.text === docText &&
    createdBatch.requests[1].createNamedRange.name === createdMark);
  check('doc calls stay off gmail and off a documents scope', noGmail(created.calls) && created.calls.every((c) => c.url.indexOf('/auth/documents') < 0));
  const docTrash = scripted([
    { status: 200, ok: true, json: Object.assign({ id: 'doc1', trashed: false }, SNAP) },
    { status: 200, ok: true, json: { trashed: true } }
  ]);
  const docUndo = await Docs.undo(doc.ref, docTrash.http);
  check('undo of a created doc reads the file snapshot, then trashes it', docUndo.ok === true && docTrash.calls[0].method === 'GET' && docTrash.calls[0].url.indexOf('headRevisionId') >= 0 && docTrash.calls[1].method === 'PATCH', docUndo);
  const docEdited = scripted([{ status: 200, ok: true, json: Object.assign({ id: 'doc1', trashed: false }, SNAP, { headRevisionId: 'rev-edited', version: '2' }) }]);
  const docRefused = await Docs.undo(doc.ref, docEdited.http);
  check('undo of a created doc refuses an edited file and does not trash it', docRefused.ok === false && docRefused.reason === 'user-edited' && docRefused.error === 'You edited this. Undo left it alone.' && docEdited.calls.length === 1 && docEdited.calls[0].method === 'GET', docRefused);
  const docDown = scripted([{ status: 500, ok: false, json: null }]);
  const docUnread = await Docs.undo(doc.ref, docDown.http);
  check('doc undo refuses when the read fails and does not trash', docUnread.ok === false && docUnread.reason === 'unconfirmed' && docUnread.error === "Couldn't confirm it's unchanged. Undo left it alone." && docDown.calls.length === 1, docUnread);
  const docNoSnap = await Docs.undo(Object.assign({}, doc.ref, { snapshot: null }), scripted([{ status: 200, ok: true, json: Object.assign({ id: 'doc1', trashed: false }, SNAP) }]).http);
  check('doc undo without a snapshot does not trash', docNoSnap.ok === false && docNoSnap.reason === 'unconfirmed', docNoSnap);
  const docTimeOnly = scripted([{ status: 200, ok: true, json: { id: 'doc1', trashed: false, headRevisionId: 'rev-1', modifiedTime: SNAP.modifiedTime } }]);
  const docTimeRefused = await Docs.undo(Object.assign({}, doc.ref, { snapshot: { headRevisionId: 'rev-1', modifiedTime: SNAP.modifiedTime } }), docTimeOnly.http);
  check('doc undo refuses a modifiedTime match when version is missing and does not trash', docTimeRefused.ok === false && docTimeRefused.reason === 'unconfirmed' && docTimeRefused.error === "Couldn't confirm it's unchanged. Undo left it alone." && docTimeOnly.calls.length === 1, docTimeRefused);
  const docVersion = scripted([{ status: 200, ok: true, json: Object.assign({ id: 'doc1', trashed: false }, SNAP, { version: '4' }) }]);
  const docVersionRefused = await Docs.undo(doc.ref, docVersion.http);
  check('doc undo refuses a version mismatch and does not trash', docVersionRefused.ok === false && docVersionRefused.reason === 'user-edited' && docVersionRefused.error === 'You edited this. Undo left it alone.' && docVersion.calls.length === 1, docVersionRefused);
  const added = 'Added line';
  const editMark = Docs.rangeName('doc9', added, CLOCK);
  const edited = scripted([
    { status: 200, ok: true, json: {} },
    { status: 200, ok: true, json: markedDoc(editMark, [added], added) }
  ]);
  const edit = await Docs.write({ scopes: Cfg.SCOPES, documentId: 'doc9', origin: 'picked', text: added }, edited.http, CLOCK);
  check('a picked doc edit is proved', proved(edit) && edit.ref.created === false && edit.ref.rangeName === editMark, edit);
  const notOurs = await Docs.write({ scopes: Cfg.SCOPES, documentId: 'doc9', text: added }, scripted([]).http, CLOCK);
  check('a doc Glance did not create or pick is refused', notOurs.ok === false && notOurs.reason === 'not-ours', notOurs);
  const preface = 'Opened earlier. ';
  const shiftedStart = 1 + preface.length;
  const shifted = scripted([
    { status: 200, ok: true, json: markedDoc(editMark, [preface, added], added, 'rev-open') },
    { status: 200, ok: true, json: {} }
  ]);
  const editGone = await Docs.undo(edit.ref, shifted.http);
  const shiftedBatch = undoBody(shifted.calls[1]);
  const deleted = shiftedBatch.requests[0].deleteContentRange.range;
  check('undo after a new opening deletes only the marked text',
    editGone.ok === true && shifted.calls[0].method === 'GET' && shifted.calls[1].method === 'POST' &&
    deleted.startIndex === shiftedStart && deleted.endIndex === shiftedStart + added.length && deleted.startIndex !== 1, deleted);
  check('undo locks the delete to the read-back revision and removes the named range',
    shiftedBatch.writeControl.requiredRevisionId === 'rev-open' &&
    shiftedBatch.requests.length === 2 &&
    shiftedBatch.requests[1].deleteNamedRange.namedRangeId === 'kix.' + editMark, shiftedBatch);
  const stale = scripted([
    { status: 200, ok: true, json: markedDoc(editMark, [added], added, 'rev-1') },
    { status: 400, ok: false, json: { error: { message: 'The required revision ID does not match the latest revision.' } } },
    { status: 200, ok: true, json: markedDoc(editMark, [preface, added], added, 'rev-2') },
    { status: 200, ok: true, json: {} }
  ]);
  const retried = await Docs.undo(edit.ref, stale.http);
  const firstDelete = undoBody(stale.calls[1]);
  const secondDelete = undoBody(stale.calls[3]);
  check('a changed revision is read again before the delete',
    retried.ok === true &&
    stale.calls.map((c) => c.method).join(',') === 'GET,POST,GET,POST' &&
    firstDelete.writeControl.requiredRevisionId === 'rev-1' &&
    firstDelete.requests[0].deleteContentRange.range.startIndex === 1 &&
    secondDelete.writeControl.requiredRevisionId === 'rev-2' &&
    secondDelete.requests[0].deleteContentRange.range.startIndex === shiftedStart &&
    secondDelete.requests[1].deleteNamedRange.namedRangeId === 'kix.' + editMark, secondDelete);
  const changed = 'Added line!!';
  const movedThenEdited = scripted([
    { status: 200, ok: true, json: markedDoc(editMark, [added], added, 'rev-1') },
    { status: 400, ok: false, json: { error: { message: 'required revision ID is stale' } } },
    { status: 200, ok: true, json: {
      revisionId: 'rev-2',
      body: { content: [{ paragraph: { elements: [{ startIndex: shiftedStart, endIndex: shiftedStart + changed.length, textRun: { content: changed } }] } }] },
      namedRanges: { [editMark]: { name: editMark, namedRanges: [{ namedRangeId: 'kix.' + editMark, name: editMark, ranges: [{ startIndex: shiftedStart, endIndex: shiftedStart + changed.length }] }] } }
    } }
  ]);
  const refusedRetry = await Docs.undo(edit.ref, movedThenEdited.http);
  check('a revision change that edited the range does not delete',
    refusedRetry.ok === false && refusedRetry.reason === 'range-edited' &&
    movedThenEdited.calls.map((c) => c.method).join(',') === 'GET,POST,GET', refusedRetry);
  const noRevision = scripted([{ status: 200, ok: true, json: markedDoc(editMark, [added], added) }]);
  const refusedRevision = await Docs.undo(edit.ref, noRevision.http);
  check('undo without a revision does not delete',
    refusedRevision.ok === false && refusedRevision.reason === 'revision-missing' && noRevision.calls.length === 1, refusedRevision);
  const editedRange = scripted([{
    status: 200, ok: true, json: {
      body: { content: [{ paragraph: { elements: [{ startIndex: 1, endIndex: 1 + changed.length, textRun: { content: changed } }] } }] },
      namedRanges: { [editMark]: { name: editMark, namedRanges: [{ namedRangeId: 'kix.edit', name: editMark, ranges: [{ startIndex: 1, endIndex: 1 + changed.length }] }] } }
    }
  }]);
  const refusedEdit = await Docs.undo(edit.ref, editedRange.http);
  check('an edited range is not deleted', refusedEdit.ok === false && refusedEdit.reason === 'range-edited' && editedRange.calls.length === 1 && editedRange.calls[0].method === 'GET', refusedEdit);
  const missing = scripted([{ status: 200, ok: true, json: markedDoc('', [preface, added], added) }]);
  const refusedMissing = await Docs.undo(edit.ref, missing.http);
  check('a missing range is not deleted', refusedMissing.ok === false && refusedMissing.reason === 'range-missing' && missing.calls.length === 1, refusedMissing);

  console.log('\n--- one sheet row is read back, then undo clears or trashes it ---\n');
  const row = ['Ada', '100'];
  const sheet = scripted([
    { status: 200, ok: true, json: { id: 'sheet1', trashed: false } },
    { status: 200, ok: true, json: { id: 'sheet1', trashed: false } },
    { status: 200, ok: true, json: { updates: { updatedRange: 'Sheet1!A1:B1', updatedRows: 1 } } },
    { status: 200, ok: true, json: { values: [row] } },
    { status: 200, ok: true, json: Object.assign({ id: 'sheet1', trashed: false }, SNAP) }
  ]);
  const appended = await Sheets.write({ scopes: Cfg.SCOPES, name: 'Payments', row: row }, sheet.http, CLOCK);
  check('sheet create append is proved', proved(appended) && appended.proof.system === 'google/sheets' && appended.ref.created === true && appended.ref.snapshot.version === '1' && sheet.calls[3].method === 'GET' && sheet.calls[4].method === 'GET', appended);
  check('sheet calls stay off gmail', noGmail(sheet.calls));
  check('a nested row is refused', Sheets.rowOf({ row: [['a']] }) === null && Sheets.rowOf({ row: ['only'] }) && Sheets.rowOf({ row: ['only'] }).length === 1);
  const sheetTrash = scripted([
    { status: 200, ok: true, json: { values: [row] } },
    { status: 200, ok: true, json: Object.assign({ id: 'sheet1', trashed: false }, SNAP) },
    { status: 200, ok: true, json: { trashed: true } }
  ]);
  const sheetUndo = await Sheets.undo(appended.ref, sheetTrash.http);
  check('undo of a created sheet reads the row and the file, then trashes it', sheetUndo.ok === true && sheetTrash.calls[0].method === 'GET' && sheetTrash.calls[1].method === 'GET' && sheetTrash.calls[2].method === 'PATCH', sheetUndo);
  const sheetEdited = scripted([{ status: 200, ok: true, json: { values: [['Ada', '999']] } }]);
  const sheetRefused = await Sheets.undo(appended.ref, sheetEdited.http);
  check('sheet undo refuses a changed row and does not trash it', sheetRefused.ok === false && sheetRefused.reason === 'user-edited' && sheetRefused.error === 'You edited this. Undo left it alone.' && sheetEdited.calls.length === 1 && sheetEdited.calls[0].method === 'GET', sheetRefused);
  const sheetFileEdited = scripted([
    { status: 200, ok: true, json: { values: [row] } },
    { status: 200, ok: true, json: Object.assign({ id: 'sheet1', trashed: false }, SNAP, { version: '9', headRevisionId: 'rev-9' }) }
  ]);
  const sheetFileRefused = await Sheets.undo(appended.ref, sheetFileEdited.http);
  check('sheet undo refuses a changed file and does not trash it', sheetFileRefused.ok === false && sheetFileRefused.error === 'You edited this. Undo left it alone.' && sheetFileEdited.calls.length === 2 && sheetFileEdited.calls.every((c) => c.method === 'GET'), sheetFileRefused);
  const sheetDown = scripted([{ status: 500, ok: false, json: null }]);
  const sheetUnread = await Sheets.undo(appended.ref, sheetDown.http);
  check('sheet row undo refuses when the read fails and does not delete', sheetUnread.ok === false && sheetUnread.reason === 'unconfirmed' && sheetUnread.error === "Couldn't confirm it's unchanged. Undo left it alone." && sheetDown.calls.length === 1, sheetUnread);
  const sheetNoRow = await Sheets.undo(Object.assign({}, appended.ref, { row: null }), scripted([]).http);
  check('sheet row undo without a row snapshot does not delete', sheetNoRow.ok === false && sheetNoRow.reason === 'unconfirmed' && sheetNoRow.error === "Couldn't confirm it's unchanged. Undo left it alone.", sheetNoRow);
  const sheetTimeOnly = scripted([
    { status: 200, ok: true, json: { values: [row] } },
    { status: 200, ok: true, json: { id: 'sheet1', trashed: false, headRevisionId: 'rev-1', modifiedTime: SNAP.modifiedTime } }
  ]);
  const sheetTimeRefused = await Sheets.undo(Object.assign({}, appended.ref, { snapshot: { headRevisionId: 'rev-1', modifiedTime: SNAP.modifiedTime } }), sheetTimeOnly.http);
  check('sheet undo refuses a modifiedTime match when version is missing and does not trash', sheetTimeRefused.ok === false && sheetTimeRefused.reason === 'unconfirmed' && sheetTimeRefused.error === "Couldn't confirm it's unchanged. Undo left it alone." && sheetTimeOnly.calls.length === 2 && sheetTimeOnly.calls.every((c) => c.method === 'GET'), sheetTimeRefused);
  const sheetVersion = scripted([
    { status: 200, ok: true, json: { values: [row] } },
    { status: 200, ok: true, json: Object.assign({ id: 'sheet1', trashed: false }, SNAP, { version: '3' }) }
  ]);
  const sheetVersionRefused = await Sheets.undo(appended.ref, sheetVersion.http);
  check('sheet undo refuses a version mismatch and does not trash', sheetVersionRefused.ok === false && sheetVersionRefused.reason === 'user-edited' && sheetVersionRefused.error === 'You edited this. Undo left it alone.' && sheetVersion.calls.length === 2, sheetVersionRefused);
  const picked = scripted([
    { status: 200, ok: true, json: { updates: { updatedRange: 'Sheet1!A2:B2', updatedRows: 1 } } },
    { status: 200, ok: true, json: { values: [['Bea', '200']] } }
  ]);
  const pickedRow = await Sheets.write({ scopes: Cfg.SCOPES, spreadsheetId: 'sheet9', origin: 'picked', row: ['Bea', '200'] }, picked.http, CLOCK);
  check('a picked sheet append is proved', proved(pickedRow) && pickedRow.ref.created === false, pickedRow);
  const cleared = scripted([
    { status: 200, ok: true, json: { values: [['Bea', '200']] } },
    { status: 200, ok: true, json: {} }
  ]);
  const clear = await Sheets.undo(pickedRow.ref, cleared.http);
  check('undo of an append reads the row, then clears that range', clear.ok === true && cleared.calls[0].method === 'GET' && cleared.calls[1].method === 'POST' && cleared.calls[1].url.indexOf(':clear') >= 0, clear);

  console.log('\n--- contacts lookup is a GET and nothing else ---\n');
  const people = scripted([{
    status: 200, ok: true, json: {
      results: [{ person: { resourceName: 'people/c1', names: [{ displayName: 'Ada Lovelace' }], emailAddresses: [{ value: 'Ada@Example.com' }] } }]
    }
  }]);
  const found = await Contacts.lookup({ scopes: Cfg.SCOPES, email: 'ada@example.com' }, people.http);
  check('exact email matches', found.ok === true && found.found === true && found.match.email === 'ada@example.com' && people.calls.length === 1 && people.calls[0].method === 'GET', found);
  check('contact lookup never writes', noGmail(people.calls) && people.calls[0].url.indexOf('searchContacts') >= 0);
  const missed = scripted([{ status: 200, ok: true, json: { results: [{ person: { emailAddresses: [{ value: 'other@example.com' }] } }] } }]);
  const none = await Contacts.lookup({ scopes: Cfg.SCOPES, email: 'ada@example.com' }, missed.http);
  check('a partial address is not a match', none.ok === true && none.found === false, none);
  const bad = await Contacts.lookup({ scopes: Cfg.SCOPES, email: 'not-an-email' }, scripted([]).http);
  check('an invalid email is refused before the call', bad.ok === false && bad.reason === 'unclear');

  console.log('\n--- compose is filled, read back, and never sent ---\n');
  const state = { to: '', subject: '', body: '', sendClicks: 0 };
  const filled = Compose.fill({ to: 'ada@example.com', subject: 'Receipt', body: 'Attached.' }, state, CLOCK);
  check('compose fill is a preview with a read-back proof',
    proved(filled) && filled.preview === true && filled.closes === false && filled.sent === false &&
    filled.written === 'Compose filled. You send it.' && state.sendClicks === 0 && state.body === 'Attached.', filled);
  check('subject is a reply', state.subject === 'Re: Receipt');
  const sendAttempt = Compose.fill({ to: 'ada@example.com', send: true, body: 'No.' }, state, CLOCK);
  check('a send flag is refused and Send stays unpressed', sendAttempt.ok === false && sendAttempt.reason === 'never-sends' && state.sendClicks === 0, sendAttempt);
  const click = Compose.clickSend(state);
  check('clickSend does not press Send', click.ok === false && click.reason === 'never-sends' && state.sendClicks === 0, click);
  check('the fill stores a content hash', typeof filled.ref.contentHash === 'string' && filled.ref.contentHash.length > 0, filled.ref);
  const restored = Compose.undo(filled.ref, state);
  check('undo restores the compose window', restored.ok === true && restored.written === 'Undone. Nothing was sent.' && state.body === '' && state.to === '', restored);
  const fresh = { to: '', subject: '', body: '', sendClicks: 0 };
  const again = Compose.fill({ to: 'ada@example.com', subject: 'Receipt', body: 'Attached.' }, fresh, CLOCK);
  fresh.body = 'Edited by you';
  const refusedCompose = Compose.undo(again.ref, fresh);
  check('compose undo refuses a changed hash and leaves the text', refusedCompose.ok === false && refusedCompose.reason === 'user-edited' && fresh.body === 'Edited by you', refusedCompose);
  state.sendClicks = 1;
  const late = Compose.undo(filled.ref, state);
  check('undo after Send does not claim the message was cleared', late.ok === false && late.reason === 'already-sent', late);

  function box(value, editable) {
    return {
      value: editable ? undefined : value,
      textContent: value,
      isContentEditable: !!editable,
      getAttribute: (name) => (name === 'contenteditable' && editable ? 'true' : null),
      dispatchEvent() {}
    };
  }
  const dom = {
    to: box('', false),
    subject: box('', false),
    body: box('', true)
  };
  const root = {
    querySelector(sel) {
      if (sel.indexOf('name="to"') >= 0) return dom.to;
      if (sel.indexOf('subjectbox') >= 0) return dom.subject;
      if (sel.indexOf('Message Body') >= 0) return dom.body;
      return null;
    }
  };
  const pageFill = Page.fill({ to: 'ada@example.com', subject: 'Receipt', body: 'Attached.' }, root);
  check('the page fill reads the body back and does not send',
    pageFill.ok === true && pageFill.sent === false && pageFill.closes === false && dom.body.textContent === 'Attached.' && dom.to.value === 'ada@example.com', pageFill);
  const pageUndo = Page.undo(pageFill.ref, root);
  check('the page undo clears the body', pageUndo.ok === true && pageUndo.written === 'Undone. Nothing was sent.' && dom.body.textContent === '', pageUndo);
  const noBody = Page.fill({ to: 'ada@example.com', body: 'Hi' }, { querySelector() { return null; } });
  check('a closed compose asks the person to open Reply', noBody.ok === false && noBody.reason === 'compose-closed' && /does not press Send/.test(noBody.error), noBody);
  const pageAgain = Page.fill({ to: 'ada@example.com', subject: 'Receipt', body: 'Attached.' }, root);
  dom.body.textContent = 'Edited by you';
  const pageRewrite = Page.fill({ to: 'ada@example.com', subject: 'Other', body: 'Nope.' }, root);
  check('a second fill does not rewrite text the person typed', pageRewrite.ok === false && pageRewrite.reason === 'user-edited' && dom.body.textContent === 'Edited by you' && dom.to.value === 'ada@example.com', pageRewrite);
  const pageRefused = Page.undo(pageAgain.ref, root);
  check('page undo refuses a changed hash and leaves the text', pageRefused.ok === false && pageRefused.reason === 'user-edited' && dom.body.textContent === 'Edited by you', pageRefused);
  const { JSDOM } = require('jsdom');
  const reply = new JSDOM('<form><textarea name="to">ada@example.com</textarea><input name="subjectbox" value="Re: Receipt"><div aria-label="Message Body" contenteditable="true" role="textbox"><br><div class="gmail_signature">Best, Ada</div><div class="gmail_quote">On Thursday Flow wrote:<blockquote>Original ask</blockquote></div></div></form>');
  const replyRoot = reply.window.document;
  const replyFill = Page.fill({ to: 'other@example.com', subject: 'Other', body: 'Thanks for the note.' }, replyRoot);
  const replyBody = replyRoot.querySelector('[aria-label="Message Body"]');
  const replyText = replyBody.textContent;
  check('a reply fill leaves To, Subject, signature, and the quote, and inserts the body above them',
    replyFill.ok === true &&
    replyRoot.querySelector('textarea[name="to"]').value === 'ada@example.com' &&
    replyRoot.querySelector('input[name="subjectbox"]').value === 'Re: Receipt' &&
    replyText.indexOf('Thanks for the note.') >= 0 &&
    replyText.indexOf('Thanks for the note.') < replyText.indexOf('Best, Ada') &&
    replyText.indexOf('Original ask') > replyText.indexOf('Best, Ada') &&
    replyBody.querySelectorAll('[data-glance-draft]').length === 1, replyText);
  const replyAgain = Page.fill({ to: 'other@example.com', subject: 'Other', body: 'Nope.' }, replyRoot);
  check('fillOnce does not write the reply a second time',
    replyAgain === replyFill && replyBody.querySelectorAll('[data-glance-draft]').length === 1 && replyBody.textContent.indexOf('Nope') < 0, replyAgain);
  replyBody.querySelector('[data-glance-draft]').textContent = 'Typed by the person';
  const replyStop = Page.fill({ to: 'other@example.com', subject: 'Other', body: 'Nope.' }, replyRoot);
  check('the first user edit stops a later fill',
    replyStop.ok === false && replyStop.reason === 'user-edited' &&
    replyBody.textContent.indexOf('Typed by the person') >= 0 && replyBody.textContent.indexOf('Best, Ada') >= 0, replyStop);

  console.log('\n--- lane proof: a preview is not a trusted close ---\n');
  const holdStep = { action: { kind: 'googleHold' }, response: wrote };
  const bareHold = { action: { kind: 'googleHold' }, response: { ok: true } };
  const composeStep = { action: { kind: 'gmailCompose' }, response: filled };
  const oldCalendar = { action: { kind: 'calendar' }, response: { ok: true } };
  check('a proved hold counts as handled', Proof.stepCountsAsHandled(holdStep) === true);
  check('a hold without proof does not', Proof.stepCountsAsHandled(bareHold) === false);
  check('compose does not count as handled', Proof.stepCountsAsHandled(composeStep) === false && Proof.shouldRecordTrustedClose([holdStep, composeStep]) === false);
  check('a calendar write without this proof still delegates', Proof.stepCountsAsHandled(oldCalendar) === true);
  check('lane messages are only the lane types', Lane.isLaneMessage({ type: 'flow:google-write' }) === true && Lane.isLaneMessage({ type: 'flow:execute-action' }) === false);
  const via = await Lane.write('googleLaneTask', { scopes: Cfg.SCOPES, taskListId: 'list1', title: 'Call back' }, scripted([
    { status: 200, ok: true, json: { id: 't2' } },
    { status: 200, ok: true, json: { id: 't2' } }
  ]).http, CLOCK);
  check('the dispatcher writes a lane task', proved(via) && via.proof.system === 'google/tasks', via);

  if (failures) {
    console.log('\n' + failures + ' failed');
    process.exit(1);
  }
  console.log('\nall passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
