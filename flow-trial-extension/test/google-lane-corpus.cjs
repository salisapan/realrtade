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
  check('the compose page never activates a control', pageSrc.indexOf('.click(') < 0);
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
  const undone = scripted([{ status: 204, ok: true, json: null }]);
  const undo = await Cal.undo(wrote.ref, undone.http);
  check('calendar undo deletes that event', undo.ok === true && undone.calls[0].method === 'DELETE' && undone.calls[0].url.indexOf('ev1') >= 0 && undone.calls[0].url.indexOf('sendUpdates=none') >= 0, undo);
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
  const taskUndo = scripted([{ status: 204, ok: true, json: null }]);
  const taskGone = await Tasks.undo(task.ref, taskUndo.http);
  check('task undo deletes that task', taskGone.ok === true && taskUndo.calls[0].method === 'DELETE' && taskUndo.calls[0].url.indexOf('/lists/list1/tasks/t1') >= 0, taskGone);

  console.log('\n--- one Drive file is read back, then undo trashes it ---\n');
  const saved = scripted([
    { status: 200, ok: true, json: { id: 'file1', name: 'note.txt', trashed: false } },
    { status: 200, ok: true, json: { id: 'file1', name: 'note.txt', trashed: false } }
  ]);
  const drive = await Drive.write({ scopes: Cfg.SCOPES, fileName: 'note.txt', base64: Buffer.from('hi').toString('base64'), mimeType: 'text/plain' }, saved.http, CLOCK);
  check('drive write is proved from the GET', proved(drive) && drive.proof.system === 'google/drive' && drive.ref.created === true && saved.calls[1].method === 'GET', drive);
  check('drive calls stay off gmail', noGmail(saved.calls));
  const trashed = scripted([{ status: 200, ok: true, json: { id: 'file1', trashed: true } }]);
  const driveUndo = await Drive.undo(drive.ref, trashed.http);
  check('drive undo trashes that file', driveUndo.ok === true && trashed.calls[0].method === 'PATCH', driveUndo);

  function markedDoc(name, parts, rangeText) {
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
    if (range && name) {
      body.namedRanges[name] = {
        name: name,
        namedRanges: [{ namedRangeId: 'kix.' + name, name: name, ranges: [range] }]
      };
    }
    return body;
  }

  console.log('\n--- a Doc is created and edited, then undo removes it ---\n');
  const docText = 'Please find the receipt.';
  const createdMark = Docs.rangeName('doc1', docText, CLOCK);
  const created = scripted([
    { status: 200, ok: true, json: { id: 'doc1', name: 'Receipt', mimeType: 'application/vnd.google-apps.document', trashed: false } },
    { status: 200, ok: true, json: { id: 'doc1', trashed: false } },
    { status: 200, ok: true, json: {} },
    { status: 200, ok: true, json: markedDoc(createdMark, [docText], docText) }
  ]);
  const doc = await Docs.write({ scopes: Cfg.SCOPES, name: 'Receipt', text: docText }, created.http, CLOCK);
  check('doc create is proved from the named range', proved(doc) && doc.proof.system === 'google/docs' && doc.ref.created === true && doc.ref.rangeName === createdMark && created.calls.length === 4 && created.calls[3].method === 'GET', doc);
  const createdBatch = JSON.parse(created.calls[2].body);
  check('the insert is stored in a named range',
    createdBatch.requests[0].insertText.text === docText &&
    createdBatch.requests[1].createNamedRange.name === createdMark);
  check('doc calls stay off gmail and off a documents scope', noGmail(created.calls) && created.calls.every((c) => c.url.indexOf('/auth/documents') < 0));
  const docTrash = scripted([{ status: 200, ok: true, json: { trashed: true } }]);
  const docUndo = await Docs.undo(doc.ref, docTrash.http);
  check('undo of a created doc trashes it', docUndo.ok === true && docTrash.calls[0].method === 'PATCH', docUndo);
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
    { status: 200, ok: true, json: markedDoc(editMark, [preface, added], added) },
    { status: 200, ok: true, json: {} }
  ]);
  const editGone = await Docs.undo(edit.ref, shifted.http);
  const deleted = JSON.parse(shifted.calls[1].body).requests[0].deleteContentRange.range;
  check('undo after a new opening deletes only the marked text',
    editGone.ok === true && shifted.calls[0].method === 'GET' && shifted.calls[1].method === 'POST' &&
    deleted.startIndex === shiftedStart && deleted.endIndex === shiftedStart + added.length && deleted.startIndex !== 1, deleted);
  const changed = 'Added line!!';
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
    { status: 200, ok: true, json: { values: [row] } }
  ]);
  const appended = await Sheets.write({ scopes: Cfg.SCOPES, name: 'Payments', row: row }, sheet.http, CLOCK);
  check('sheet create append is proved', proved(appended) && appended.proof.system === 'google/sheets' && appended.ref.created === true && sheet.calls[3].method === 'GET', appended);
  check('sheet calls stay off gmail', noGmail(sheet.calls));
  check('a nested row is refused', Sheets.rowOf({ row: [['a']] }) === null && Sheets.rowOf({ row: ['only'] }) && Sheets.rowOf({ row: ['only'] }).length === 1);
  const sheetTrash = scripted([{ status: 200, ok: true, json: { trashed: true } }]);
  const sheetUndo = await Sheets.undo(appended.ref, sheetTrash.http);
  check('undo of a created sheet trashes it', sheetUndo.ok === true && sheetTrash.calls[0].method === 'PATCH', sheetUndo);
  const picked = scripted([
    { status: 200, ok: true, json: { updates: { updatedRange: 'Sheet1!A2:B2', updatedRows: 1 } } },
    { status: 200, ok: true, json: { values: [['Bea', '200']] } }
  ]);
  const pickedRow = await Sheets.write({ scopes: Cfg.SCOPES, spreadsheetId: 'sheet9', origin: 'picked', row: ['Bea', '200'] }, picked.http, CLOCK);
  check('a picked sheet append is proved', proved(pickedRow) && pickedRow.ref.created === false, pickedRow);
  const cleared = scripted([{ status: 200, ok: true, json: {} }]);
  const clear = await Sheets.undo(pickedRow.ref, cleared.http);
  check('undo of an append clears that range', clear.ok === true && cleared.calls[0].method === 'POST' && cleared.calls[0].url.indexOf(':clear') >= 0, clear);

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
  const restored = Compose.undo(filled.ref, state);
  check('undo restores the compose window', restored.ok === true && restored.written === 'Undone. Nothing was sent.' && state.body === '' && state.to === '', restored);
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
