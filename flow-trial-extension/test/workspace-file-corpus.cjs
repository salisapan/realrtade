// Create an empty Google Doc or Sheet from a request, behind WORKSPACE_FILE (off).
// An explicit ask with a name the person gave, a Drive file made with drive.file,
// read back by id for name, type and not trashed. Undo trashes it only while
// version and modifiedTime are unchanged. Drive is mocked. Nothing is shared or written into it.
// Run: node test/workspace-file-corpus.cjs
'use strict';
const { FlowWorkspaceFile: W } = require('../core/workspace-file.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const ON = { WORKSPACE_FILE: true };
const STAMP = '2026-10-20T10:00:00.000Z';

console.log('\n--- an explicit ask to create it, with a name ---\n');
const yes = [
  ['Can you create a shared doc called Q4 launch plan?', 'doc', 'Q4 launch plan'],
  ['Please set up a tracker for the Q4 launch.', 'sheet', 'Q4 launch tracker'],
  ['Could you open a new spreadsheet named "Vendor payments" so we can log them?', 'sheet', 'Vendor payments'],
  ['Please start a shared agenda for Thursday sync.', 'doc', 'Thursday sync agenda'],
  ['Can you set up a doc for the board meeting by Friday?', 'doc', 'board meeting doc'],
  ['Could you make a budget sheet titled Office move 2027?', 'sheet', 'Office move 2027'],
  ['תפתח בבקשה מסמך בשם סיכום רבעון שלישי', 'doc', 'סיכום רבעון שלישי'],
  ['אפשר ליצור גיליון מעקב בשם תשלומים לספקים?', 'sheet', 'תשלומים לספקים'],
  ['בבקשה תפתחי לנו מסמך לפגישת הצוות', 'doc', 'מסמך פגישת הצוות'],
  ['Can you create a slide deck called Board update Q4?', 'slides', 'Board update Q4'],
  ['Please set up a presentation for the investor meeting.', 'slides', 'investor meeting presentation'],
  ['Could you start a deck for the offsite by Friday?', 'slides', 'offsite deck'],
  ['Can you create a doc called Latest pricing update?', 'doc', 'Latest pricing update'],
  ['תפתח בבקשה מצגת בשם עדכון דירקטוריון', 'slides', 'עדכון דירקטוריון'],
  ['אפשר ליצור מצגת לפגישת לקוח', 'slides', 'מצגת פגישת לקוח']
];
for (const [text, kind, name] of yes) {
  const r = W.recognize(text);
  check('clear: ' + text, r.kind === 'clear' && r.fileKind === kind && r.name === name, r);
}

console.log('\n--- silence, with the reason ---\n');
const no = [
  ['Please create a doc and write a one-page summary of Q3.', 'asks-content'],
  ['Please create a doc that summarizes the meeting.', 'asks-content'],
  ['Please create a deck and write the slides for Q3.', 'asks-content'],
  ['Maybe create a doc for the launch if you want.', 'hedge'],
  ['Ask Dana to create a doc for the launch.', 'third-party'],
  ['No need to create a sheet for the launch.', 'negation'],
  ['Please create a doc.', 'no-name'],
  ['Please create a doc, update the latest version we have.', 'existing-file'],
  ['FYI I set up a doc for the launch.', 'fyi'],
  ['אולי תפתח מסמך בשם סיכום', 'hedge'],
  ['תפתח בבקשה מסמך.', 'no-name'],
  ['בבקשה תפתח מסמך בשם סיכום ותכתוב בו את התוצאות', 'asks-content'],
  ['אין צורך ליצור מסמך בשם סיכום', 'negation']
];
for (const [text, why] of no) {
  const r = W.recognize(text);
  check('silent (' + why + '): ' + text, r.kind !== 'clear' && r.kind !== 'ignore' && r.reason === why, r);
}
for (const text of ['Please create a PowerPoint deck called Board.', 'Please create a Word document called Contract.', 'Can you set up an Excel sheet for the budget?', 'Please update the doc we have for the launch.', 'Here is the doc for the launch, thanks.', 'Lunch tomorrow?']) {
  check('ignored: ' + text, W.recognize(text).kind === 'ignore');
}

console.log('\n--- the switch and the plan ---\n');
check('off by default', W.SWITCH_DEFAULT === false && W.plan({ text: yes[0][0] }).action === 'off');
const p = W.plan({ flags: ON, text: yes[0][0] });
check('one Do It; the line says empty, in the Drive, and the name', p.action === 'offer' && p.approval === 'DoIt' && /empty doc called "Q4 launch plan"/.test(p.line), p);
check('Glance neither writes nor shares: that step is the person\'s', p.steps.some((s) => s.kind === 'manual' && /does not write or share/.test(s.label)), p.steps);
const ph = W.plan({ flags: ON, text: yes[7][0] });
check('Hebrew plan: sheet, Hebrew line', ph.fileKind === 'sheet' && /^ליצור גיליון ריק בשם/.test(ph.line), ph);
check('a silent ask has no plan', W.plan({ flags: ON, text: no[0][0] }).action === 'silence');

// ---- the write, mocked ---------------------------------------------------------
function makeDrive(opts) {
  opts = opts || {};
  const log = [];
  const files = {};
  let tick = 0;
  const api = async (method, path, body) => {
    log.push({ method, path, body });
    if (opts.auth) return { status: opts.auth, ok: false, json: null };
    if (method === 'POST') {
      if (opts.postFails) return { status: 500, ok: false, json: null };
      files.F1 = { id: 'F1', name: body.name, mimeType: body.mimeType, trashed: false, version: '1', modifiedTime: '2026-10-20T10:00:01.000Z', webViewLink: 'https://docs.google.com/document/d/F1/edit' };
      return { status: 200, ok: true, json: { id: 'F1', name: body.name, mimeType: body.mimeType, trashed: false } };
    }
    const id = decodeURIComponent(path.split('/files/')[1].split('?')[0]);
    if (method === 'GET') {
      const f = files[id];
      if (!f) return { status: 404, ok: false, json: null };
      const copy = Object.assign({}, f);
      if (opts.mutate) opts.mutate(copy);
      return { status: 200, ok: true, json: copy };
    }
    if (method === 'PATCH') {
      if (opts.patchFails) return { status: 500, ok: false, json: null };
      Object.assign(files[id], body);
      tick++;
      return { status: 200, ok: true, json: files[id] };
    }
    return { status: 400, ok: false, json: null };
  };
  return { api, log, files };
}
const input = { flags: ON, fileKind: 'doc', name: 'Q4 launch plan', now: STAMP };
const io = (d) => ({ drive: d.api });

(async () => {
  console.log('\n--- Do It: create, read back ---\n');
  let d = makeDrive();
  let r = await W.create(input, io(d));
  const post = d.log.find((l) => l.method === 'POST');
  check('creates a native Google Doc with the name asked, nothing else in the body', post.body.mimeType === 'application/vnd.google-apps.document' && post.body.name === 'Q4 launch plan' && Object.keys(post.body).sort().join() === 'mimeType,name', post.body);
  check('Handled needs the read-back: proof fetchedBack, system, id, link', r.ok === true && r.proof.fetchedBack === true && r.proof.system === 'google/docs' && r.proof.externalId === 'F1' && r.url && r.ref.snapshot.version === '1', r);
  check('the file exists empty and unshared: no permission or content call', d.log.every((l) => /\/files/.test(l.path) && !/permissions|batchUpdate|values/.test(l.path)), d.log.map((l) => l.path));
  check('the ask is closed by the file existing', r.loopClosed === true);

  d = makeDrive();
  r = await W.create(Object.assign({}, input, { fileKind: 'sheet', name: 'Vendor payments' }), io(d));
  check('a Sheet is a native spreadsheet and proved as google/sheets', r.ok === true && d.log[0].body.mimeType === 'application/vnd.google-apps.spreadsheet' && r.proof.system === 'google/sheets', r);

  d = makeDrive();
  r = await W.create(Object.assign({}, input, { fileKind: 'slides', name: 'Board update Q4' }), io(d));
  check('a Slides deck is a native presentation and proved as google/slides', r.ok === true && d.log[0].body.mimeType === 'application/vnd.google-apps.presentation' && r.proof.system === 'google/slides' && /^Slides/.test(r.written), r);
  check('the plan for a deck says slide deck, empty', /empty slide deck called/.test(W.plan({ flags: ON, text: yes[9][0] }).line), W.plan({ flags: ON, text: yes[9][0] }));

  d = makeDrive({ mutate: (f) => { f.name = 'Other'; } });
  r = await W.create(input, io(d));
  check('another name on the read-back: trashed again, no Handled', r.ok === false && r.reason === 'verify_failed' && r.removed === true && d.files.F1.trashed === true, r);
  d = makeDrive({ mutate: (f) => { f.mimeType = 'application/pdf'; } });
  r = await W.create(input, io(d));
  check('another type on the read-back is not the file asked for', r.ok === false && /type-differs/.test(r.why), r);
  d = makeDrive({ mutate: (f) => { f.trashed = true; } });
  r = await W.create(input, io(d));
  check('a trashed file is not a close', r.ok === false && /trashed/.test(r.why), r);
  d = makeDrive({ mutate: (f) => { f.name = 'Other'; }, patchFails: true });
  r = await W.create(input, io(d));
  check('cannot trash it either: the ref is kept for Undo', r.ok === false && r.removed === false && r.ref && r.ref.fileId === 'F1', r);
  r = await W.create(input, io(makeDrive({ auth: 403 })));
  check('not connected is said', r.reason === 'not-connected', r);
  r = await W.create(input, io(makeDrive({ postFails: true })));
  check('a failed write is a failed write', r.reason === 'write-failed', r);
  d = makeDrive();
  r = await W.create(Object.assign({}, input, { flags: {} }), io(d));
  check('switch off: no call', r.reason === 'switch-off' && d.log.length === 0);
  d = makeDrive();
  r = await W.create(Object.assign({}, input, { name: 'x' }), io(d));
  check('a name that is too short makes no call', r.reason === 'unclear' && d.log.length === 0, r);

  console.log('\n--- Undo never overwrites a person\'s edit ---\n');
  d = makeDrive();
  r = await W.create(input, io(d));
  let u = await W.undo(r.ref, io(d));
  check('untouched: Undo trashes it and the read confirms', u.ok === true && u.undone === true && d.files.F1.trashed === true, u);

  d = makeDrive();
  r = await W.create(input, io(d));
  d.files.F1.version = '4'; d.files.F1.modifiedTime = '2026-10-20T11:00:00.000Z';
  u = await W.undo(r.ref, io(d));
  check('the person typed in it: Undo unavailable, file stays', u.ok === false && u.reason === 'user-edited' && u.undoUnavailable === true && d.files.F1.trashed === false, u);

  d = makeDrive();
  r = await W.create(input, io(d));
  d.files.F1.modifiedTime = '2026-10-20T10:30:00.000Z';
  u = await W.undo(r.ref, io(d));
  check('a changed modified time alone is an edit', u.reason === 'user-edited', u);

  d = makeDrive();
  r = await W.create(input, io(d));
  const bare = Object.assign({}, r.ref, { snapshot: null });
  u = await W.undo(bare, io(d));
  check('no snapshot: cannot confirm, leaves it', u.ok === false && u.reason === 'unconfirmed' && d.files.F1.trashed === false, u);

  d = makeDrive();
  r = await W.create(input, io(d));
  delete d.files.F1;
  check('already deleted by the person: nothing to undo', (await W.undo(r.ref, io(d))).ok === true);
  check('a ref that is not Glance\'s is refused', (await W.undo({ fileId: 'F9' }, io(makeDrive()))).reason === 'not-ours');

  console.log(failures ? '\n' + failures + ' FAILED' : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})();
