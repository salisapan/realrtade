// Create an empty Word document or Excel workbook in OneDrive > Glance from a request
// with no attachment, behind ONEDRIVE_NEW_FILE (off). An explicit ask with a name the
// person gave, an upload that never replaces a file, read back by id for name, a file,
// a size and not deleted. Undo deletes it only while eTag and lastModifiedDateTime are
// unchanged. Graph is mocked. Nothing is shared or written into it.
// Run: node test/onedrive-new-file-corpus.cjs
'use strict';
const { FlowOnedriveNewFile: N } = require('../core/onedrive-new-file.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const ON = { ONEDRIVE_NEW_FILE: true };
const STAMP = '2026-10-20T10:00:00.000Z';

console.log('\n--- an explicit ask to create it, with a name ---\n');
const yes = [
  ['Could you create a Word document called Supplier onboarding?', 'doc', 'Supplier onboarding'],
  ['Please set up an Excel tracker for the November campaign.', 'sheet', 'November campaign tracker'],
  ['Can you open a new workbook named "Invoice follow-ups" so we can log them?', 'sheet', 'Invoice follow-ups'],
  ['Please start a shared agenda for Monday standup.', 'doc', 'Monday standup agenda'],
  ['Could you make a shared doc for the board meeting by Friday?', 'doc', 'board meeting doc'],
  ['Please build a budget sheet titled Warehouse lease 2027.', 'sheet', 'Warehouse lease 2027'],
  ['תפתח בבקשה מסמך בשם הצעת מחיר ללקוח', 'doc', 'הצעת מחיר ללקוח'],
  ['אפשר ליצור גיליון מעקב בשם חשבוניות פתוחות?', 'sheet', 'חשבוניות פתוחות'],
  ['בבקשה תכיני לנו מסמך לישיבת ההנהלה', 'doc', 'מסמך ישיבת ההנהלה']
];
for (const [text, kind, name] of yes) {
  const r = N.recognize(text);
  check('clear: ' + text, r.kind === 'clear' && r.fileKind === kind && r.name === name, r);
}

console.log('\n--- silence, with the reason ---\n');
const no = [
  ['Please create a doc and write a one-page summary of the offer.', 'asks-content'],
  ['Please create a doc that summarizes the call.', 'asks-content'],
  ['Maybe create a doc for the offer if you want.', 'hedge'],
  ['Ask Dana to create a doc for the offer.', 'third-party'],
  ['No need to create a sheet for the offer.', 'negation'],
  ['Please create a doc for the offer review, in OneNote.', 'other-app'],
  ['Please create a doc for the offer in Notion.', 'other-app'],
  ['Please make a doc for the annual review.', 'existing-file'],
  ['Please create a doc.', 'no-name'],
  ['Please create a doc, update the latest version we have.', 'existing-file'],
  ['FYI I set up a doc for the offer.', 'fyi'],
  ['אולי תפתח מסמך בשם הצעה', 'hedge'],
  ['תפתח בבקשה מסמך.', 'no-name'],
  ['בבקשה תפתח מסמך בשם הצעה ותכתוב בו את המחירים', 'asks-content'],
  ['אין צורך ליצור מסמך בשם הצעה', 'negation']
];
for (const [text, why] of no) {
  const r = N.recognize(text);
  check('silent (' + why + '): ' + text, r.kind !== 'clear' && r.kind !== 'ignore' && r.reason === why, r);
}
for (const text of ['Please create a Google doc called Offer.', 'Please create a OneNote page for the offer.', 'Please update the doc we have for the offer.', 'Here is the doc for the offer, thanks.', 'Lunch tomorrow?']) {
  check('ignored: ' + text, N.recognize(text).kind === 'ignore');
}

console.log('\n--- the switch and the plan ---\n');
check('off by default', N.SWITCH_DEFAULT === false && N.plan({ text: yes[0][0] }).action === 'off');
const p = N.plan({ flags: ON, text: yes[0][0] });
check('one Do It; the line says empty, OneDrive, the file name with .docx', p.action === 'offer' && p.approval === 'DoIt' && p.fileName === 'Supplier onboarding.docx' && /empty Word document called "Supplier onboarding.docx" in your OneDrive/.test(p.line), p);
const ps = N.plan({ flags: ON, text: yes[1][0] });
check('a tracker is an .xlsx', ps.fileKind === 'sheet' && ps.fileName === 'November campaign tracker.xlsx' && ps.steps[0].proof === 'microsoft/excel', ps);
const ph = N.plan({ flags: ON, text: yes[6][0] });
check('Hebrew plan: Hebrew line, Hebrew file name kept', ph.lang === 'he' && /OneDrive/.test(ph.line) && ph.fileName === 'הצעת מחיר ללקוח.docx', ph);
check('the share step is the person\'s, Glance writes and shares nothing', p.steps.some((s) => s.kind === 'manual') && !p.steps.some((s) => /send|share/i.test(s.kind)), p.steps);
check('a silent ask has no plan', N.plan({ flags: ON, text: no[0][0] }).action === 'silence');

function makeGraph(opts) {
  opts = opts || {};
  const log = [];
  const store = {};
  const call = async (req) => {
    log.push(req);
    if (opts.auth) return { ok: false, status: opts.auth, body: null };
    if (req.method === 'PUT') {
      if (opts.taken) return { ok: false, status: 409, body: null };
      if (opts.putFails) return { ok: false, status: 500, body: null };
      const name = decodeURIComponent(req.path.split('/Glance/')[1].split(':/content')[0]);
      store.I1 = { id: 'I1', name: opts.rename || name, file: opts.folder ? undefined : { mimeType: req.contentType }, folder: opts.folder ? {} : undefined, size: opts.empty ? 0 : req.raw.length, eTag: '"e1,1"', lastModifiedDateTime: '2026-10-20T10:00:01Z', webUrl: 'https://onedrive.live.com/?id=I1' };
      return { ok: true, status: 201, body: { id: 'I1' } };
    }
    const id = req.path.split('/items/')[1];
    if (req.method === 'GET') {
      const it = store[id];
      return it ? { ok: true, status: 200, body: JSON.parse(JSON.stringify(it)) } : { ok: false, status: 404, body: null };
    }
    if (req.method === 'DELETE') {
      if (opts.deleteFails) return { ok: false, status: 500, body: null };
      delete store[id];
      return { ok: true, status: 204, body: null };
    }
    return { ok: false, status: 400, body: null };
  };
  return { call, log, store };
}
const word = { flags: ON, fileKind: 'doc', fileName: p.fileName, now: STAMP };
const sheet = { flags: ON, fileKind: 'sheet', fileName: ps.fileName, now: STAMP };
const io = (g) => ({ call: g.call });
const zipOk = (raw) => raw && raw[0] === 0x50 && raw[1] === 0x4b;

(async () => {
  console.log('\n--- Do It: create, read back ---\n');
  let g = makeGraph();
  let r = await N.create(word, io(g));
  const put = g.log.find((l) => l.method === 'PUT');
  check('uploads a real .docx into OneDrive > Glance, never replacing', /\/me\/drive\/root:\/Glance\/Supplier%20onboarding\.docx:\/content\?@microsoft\.graph\.conflictBehavior=fail$/.test(put.path) && zipOk(put.raw) && /wordprocessingml\.document$/.test(put.contentType), put.path);
  check('Handled needs the read-back: proof fetchedBack, system, id, stamp in the ref', r.ok === true && r.proof && r.proof.fetchedBack === true && r.proof.system === 'microsoft/word' && r.proof.externalId === 'I1' && r.ref.eTag && r.ref.lastModifiedDateTime, r);
  check('the receipt names Word and the OneDrive path', /Word · Supplier onboarding\.docx/.test(r.written) && /OneDrive|Glance/.test(r.target) && r.loopClosed === true, r);
  check('nothing is sent or shared: only drive calls', g.log.every((l) => /^\/me\/drive\//.test(l.path)), g.log.map((l) => l.path));

  g = makeGraph();
  r = await N.create(sheet, io(g));
  const putX = g.log.find((l) => l.method === 'PUT');
  check('a workbook is a real .xlsx with the Excel proof system', r.ok === true && r.proof.system === 'microsoft/excel' && zipOk(putX.raw) && /spreadsheetml\.sheet$/.test(putX.contentType), r);

  g = makeGraph({ taken: true });
  r = await N.create(word, io(g));
  check('the name is taken: refused, nothing replaced, nothing else called', r.ok === false && r.reason === 'name-taken' && g.log.length === 1, r);

  g = makeGraph({ rename: 'Other.docx' });
  r = await N.create(word, io(g));
  check('another name on the read-back: withdrawn, no Handled', r.ok === false && r.reason === 'verify_failed' && /name-differs/.test(r.why) && r.removed === true && !g.store.I1, r);

  g = makeGraph({ folder: true });
  r = await N.create(word, io(g));
  check('a folder is not a file', r.ok === false && /not-a-file/.test(r.why), r);

  g = makeGraph({ empty: true });
  r = await N.create(word, io(g));
  check('a zero-byte upload is withdrawn', r.ok === false && /empty-upload/.test(r.why) && !g.store.I1, r);

  g = makeGraph({ rename: 'x.docx', deleteFails: true });
  r = await N.create(word, io(g));
  check('withdrawal fails too: the ref is kept so Undo can still delete it', r.ok === false && r.removed === false && r.ref && r.ref.itemId === 'I1', r);

  g = makeGraph();
  r = await N.create(Object.assign({}, word, { grantedScopes: ['Mail.Read', 'Files.Read'] }), io(g));
  check('Files.Read cannot write: no call is made', r.ok === false && r.reason === 'files-not-granted' && g.log.length === 0, r);
  g = makeGraph();
  r = await N.create(Object.assign({}, word, { grantedScopes: ['Mail.Read', 'Files.ReadWrite'] }), io(g));
  check('Files.ReadWrite is enough', r.ok === true, r);

  r = await N.create(word, io(makeGraph({ auth: 401 })));
  check('not connected is said, not guessed', r.ok === false && r.reason === 'not-connected', r);
  r = await N.create(word, io(makeGraph({ putFails: true })));
  check('a failed write is a failed write', r.ok === false && r.reason === 'write-failed', r);
  r = await N.create(Object.assign({}, word, { flags: {} }), io(makeGraph()));
  check('switch off: nothing is called', r.ok === false && r.reason === 'switch-off');
  g = makeGraph();
  r = await N.create(Object.assign({}, word, { fileName: '..' }), io(g));
  check('an unsafe name makes no call', r.ok === false && r.reason === 'unclear' && g.log.length === 0, r);

  console.log('\n--- Undo never overwrites a person\'s edit ---\n');
  g = makeGraph();
  r = await N.create(word, io(g));
  let u = await N.undo(r.ref, io(g));
  check('untouched: Undo deletes it and the delete is read back', u.ok === true && u.undone === true && !g.store.I1, u);

  g = makeGraph();
  r = await N.create(word, io(g));
  g.store.I1.eTag = '"e2,2"'; g.store.I1.lastModifiedDateTime = '2026-10-20T10:30:00Z';
  u = await N.undo(r.ref, io(g));
  check('the person edited it: Undo is unavailable and the file stays', u.ok === false && u.reason === 'user-edited' && u.undoUnavailable === true && !!g.store.I1, u);

  g = makeGraph();
  r = await N.create(word, io(g));
  delete g.store.I1.eTag;
  u = await N.undo(r.ref, io(g));
  check('no stamp to compare: Undo leaves it alone', u.ok === false && u.reason === 'unconfirmed' && !!g.store.I1, u);

  g = makeGraph();
  r = await N.create(word, io(g));
  delete g.store.I1;
  u = await N.undo(r.ref, io(g));
  check('the person already deleted it: nothing left to undo, said as undone', u.ok === true, u);

  check('a ref that is not Glance\'s is refused', (await N.undo({ itemId: 'X' }, io(makeGraph()))).reason === 'not-ours');
  check('no ref, no call', (await N.undo(null, io(makeGraph()))).ok === false);

  console.log(failures ? '\n' + failures + ' FAILED' : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})();
