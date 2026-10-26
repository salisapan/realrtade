// Create an empty Word document or Excel workbook in the Glance folder of the ONE SharePoint site a mail names, behind
// SHAREPOINT_NEW_FILE (off). The site is found by name through Graph search (read only) and must match exactly one site; the
// upload never replaces a file; read back by id for name, a file, a size and not deleted; Undo deletes it only while eTag and
// lastModifiedDateTime are unchanged. Needs Sites.ReadWrite.All. Graph is mocked. Nothing is shared or written into the file.
// Run: node test/sharepoint-new-file-corpus.cjs
'use strict';
const { FlowSharepointNewFile: S } = require('../core/sharepoint-new-file.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const ON = { SHAREPOINT_NEW_FILE: true };
const STAMP = '2026-10-25T10:00:00.000Z';

console.log('\n--- an explicit ask with a name and exactly one named site ---\n');
const yes = [
  ['Please create a Word document called Q4 plan on the Marketing SharePoint site.', 'doc', 'Q4 plan', 'Marketing'],
  ['Could you set up a tracker called Launch tasks in SharePoint site Sales?', 'sheet', 'Launch tasks', 'Sales'],
  ['Please create a Word document called Offer in the "Q4 Launch" SharePoint site', 'doc', 'Offer', 'Q4 Launch'],
  ['Can you open a new workbook named "Invoice follow-ups" on the Finance SharePoint site so we can log them?', 'sheet', 'Invoice follow-ups', 'Finance'],
  ['Please create a Word document called Plan on the Marketing SharePoint site so we can start', 'doc', 'Plan', 'Marketing'],
  ['תפתח מסמך בשם תוכנית רבעון באתר השיווק ב-SharePoint, בבקשה', 'doc', 'תוכנית רבעון', 'שיווק'],
  ['בבקשה תיצור גיליון בשם מעקב באתר "Q4 Launch" ב-SharePoint', 'sheet', 'מעקב', 'Q4 Launch']
];
for (const [text, kind, name, site] of yes) {
  const r = S.recognize(text);
  check('clear: ' + text.slice(0, 70), r.kind === 'clear' && r.fileKind === kind && r.name === name && r.siteName === site, r);
}

console.log('\n--- silence, with the reason ---\n');
const no = [
  ['Please create a Word document called Offer on SharePoint site Marketing, and write the summary', 'asks-content'],
  ['Ask Dana to create a Word document called Offer on the Marketing SharePoint site', 'third-party'],
  ['Maybe create a Word document called Offer on the Marketing SharePoint site', 'hedge'],
  ['No need to create a Word document called Offer on the Marketing SharePoint site', 'negation'],
  ['Please create a Word document on the Marketing SharePoint site, update the latest version we have', 'existing-file'],
  ['Please create a Word document on the Marketing SharePoint site', 'no-name'],
  ['Please create a Word document called Offer in SharePoint', 'no-site']
];
for (const [text, why] of no) {
  const r = S.recognize(text);
  check('silent (' + why + '): ' + text.slice(0, 70), r.kind !== 'clear' && r.kind !== 'ignore' && r.reason === why, r);
}
for (const text of ['Please create a Word document called Offer', 'Here is the link to our SharePoint site', 'Please upload the file to SharePoint', 'Your SharePoint storage is almost full', '']) {
  check('ignored: ' + text.slice(0, 50), S.recognize(text).kind === 'ignore');
}
check('a OneDrive ask that says SharePoint is not offered on OneDrive by the other reader', require('../core/onedrive-new-file.js').FlowOnedriveNewFile.recognize(yes[0][0]).kind === 'block');

function makeGraph(opts) {
  opts = opts || {};
  const log = [];
  const store = {};
  const sites = opts.sites || [{ id: 'contoso.sharepoint.com,s1,w1', displayName: 'Marketing', name: 'marketing', webUrl: 'https://contoso.sharepoint.com/sites/marketing' }];
  const call = async (req) => {
    log.push(req);
    if (opts.auth) return { ok: false, status: opts.auth, body: null };
    if (req.method === 'GET' && /^\/sites\?search=/.test(req.path)) {
      if (opts.searchFails) return { ok: false, status: 500, body: null };
      const q = decodeURIComponent(req.path.split('=')[1]).toLowerCase();
      return { ok: true, status: 200, body: { value: sites.filter((s) => (s.displayName + ' ' + s.name).toLowerCase().indexOf(q) >= 0) } };
    }
    const siteGet = req.path.match(/^\/sites\/([^/]+)$/);
    if (req.method === 'GET' && siteGet) {
      const s = sites.find((x) => encodeURIComponent(x.id) === siteGet[1]);
      return s ? { ok: true, status: 200, body: s } : { ok: false, status: 404, body: null };
    }
    if (req.method === 'PUT') {
      if (opts.taken) return { ok: false, status: 409, body: null };
      const name = decodeURIComponent(req.path.split('/Glance/')[1].split(':/content')[0]);
      store.I1 = { id: 'I1', name: opts.rename || name, file: { mimeType: req.contentType }, size: opts.empty ? 0 : req.raw.length, eTag: '"e1,1"', lastModifiedDateTime: '2026-10-25T10:00:01Z', webUrl: 'https://contoso.sharepoint.com/sites/marketing/Shared%20Documents/Glance/' + name };
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
const io = (g) => ({ call: g.call });
const zipOk = (raw) => raw && raw[0] === 0x50 && raw[1] === 0x4b;

(async () => {
  console.log('\n--- the switch and the plan (the site is read, never guessed) ---\n');
  let g = makeGraph();
  check('off by default', S.SWITCH_DEFAULT === false && (await S.plan({ text: yes[0][0] }, io(g))).action === 'off' && g.log.length === 0);
  g = makeGraph();
  const p = await S.plan({ flags: ON, text: yes[0][0] }, io(g));
  check('one Do It; the line names the file, the empty file and the site', p.action === 'offer' && p.approval === 'DoIt' && p.fileName === 'Q4 plan.docx' && p.siteName === 'Marketing' && /empty Word document called "Q4 plan\.docx" on the "Marketing" SharePoint site/.test(p.line), p);
  check('planning only reads: one search, nothing written', g.log.length === 1 && g.log[0].method === 'GET', g.log);
  const ph = await S.plan({ flags: ON, text: yes[5][0] }, io(makeGraph({ sites: [{ id: 'h,1,2', displayName: 'שיווק', name: 'shivuk', webUrl: 'https://c.sharepoint.com/sites/shivuk' }] })));
  check('Hebrew plan: Hebrew line, SharePoint, Hebrew site name', ph.action === 'offer' && ph.lang === 'he' && /SharePoint/.test(ph.line) && /שיווק/.test(ph.line), ph);
  check('the share step is the person\'s, Glance writes and shares nothing', p.steps.some((s) => s.kind === 'manual') && !p.steps.some((s) => /send|share/i.test(s.kind)), p.steps);
  let q = await S.plan({ flags: ON, text: yes[0][0] }, io(makeGraph({ sites: [] })));
  check('no site of that name: silence', q.action === 'silence' && q.reason === 'site-not-found', q);
  q = await S.plan({ flags: ON, text: yes[0][0] }, io(makeGraph({ sites: [{ id: 'a', displayName: 'Marketing', name: 'm1' }, { id: 'b', displayName: 'Marketing', name: 'm2' }] })));
  check('two sites of that name: silence, Glance never picks one', q.action === 'silence' && q.reason === 'site-ambiguous', q);
  q = await S.plan({ flags: ON, text: yes[0][0] }, io(makeGraph({ sites: [{ id: 'a', displayName: 'Marketing EMEA', name: 'mk' }] })));
  check('a site that only contains the word is not the site', q.action === 'silence', q);
  q = await S.plan({ flags: ON, text: yes[0][0] }, io(makeGraph({ searchFails: true })));
  check('a failed search is silence', q.action === 'silence' && q.reason === 'site-lookup-failed', q);
  q = await S.plan({ flags: ON, text: yes[0][0] }, io(makeGraph({ auth: 401 })));
  check('not connected is silence', q.action === 'silence' && q.reason === 'not-connected', q);
  q = await S.plan({ flags: ON, text: no[0][0] }, io(makeGraph()));
  check('a silent ask has no plan and no call', q.action === 'silence');
  q = await S.plan({ flags: ON, text: 'Please create a Word document called Plan on the Marketing SharePoint site so we can start' }, io(makeGraph()));
  check('trailing words are not part of the site name', q.action === 'offer' && q.siteName === 'Marketing', q);

  console.log('\n--- Do It: create, read back ---\n');
  const word = { flags: ON, fileKind: 'doc', fileName: p.fileName, siteId: p.siteId, now: STAMP };
  g = makeGraph();
  let r = await S.create(word, io(g));
  const put = g.log.find((l) => l.method === 'PUT');
  check('uploads a real .docx into the site library Glance folder, never replacing', /^\/sites\/contoso\.sharepoint\.com%2Cs1%2Cw1\/drive\/root:\/Glance\/Q4%20plan\.docx:\/content\?@microsoft\.graph\.conflictBehavior=fail$/.test(put.path) && zipOk(put.raw) && /wordprocessingml\.document$/.test(put.contentType), put);
  check('Handled needs the read-back: proof fetchedBack, SharePoint system, id, stamp, site in the ref', r.ok === true && r.proof && r.proof.fetchedBack === true && r.proof.system === 'microsoft/sharepoint' && r.proof.externalId === 'I1' && r.ref.siteId === p.siteId && r.ref.eTag && r.ref.lastModifiedDateTime, r);
  check('the receipt names SharePoint, the site and the file', /SharePoint · Marketing · Q4 plan\.docx/.test(r.written) && /SharePoint > Marketing > Glance/.test(r.target) && r.loopClosed === true, r);
  check('nothing is sent or shared: only site and drive calls', g.log.every((l) => /^\/sites/.test(l.path)), g.log.map((l) => l.path));

  g = makeGraph();
  r = await S.create({ flags: ON, fileKind: 'sheet', fileName: 'Launch tasks.xlsx', siteId: p.siteId, now: STAMP }, io(g));
  check('a workbook is a real .xlsx', r.ok === true && zipOk(g.log.find((l) => l.method === 'PUT').raw) && /spreadsheetml\.sheet$/.test(g.log.find((l) => l.method === 'PUT').contentType), r);

  g = makeGraph({ taken: true });
  r = await S.create(word, io(g));
  check('the name is taken: refused, nothing replaced', r.ok === false && r.reason === 'name-taken' && g.log.filter((l) => l.method !== 'GET').length === 1, r);
  g = makeGraph({ sites: [] });
  r = await S.create(word, io(g));
  check('the site is gone: nothing written', r.ok === false && r.reason === 'site-not-found' && !g.log.some((l) => l.method === 'PUT'), r);

  for (const [opt, why] of [[{ rename: 'Other.docx' }, 'name-differs'], [{ empty: true }, 'empty-upload']]) {
    g = makeGraph(opt);
    r = await S.create(word, io(g));
    check('read-back ' + why + ': not Handled, the file is deleted again', r.ok === false && r.reason === 'verify_failed' && r.removed === true && !g.store.I1, r);
  }
  g = makeGraph({ rename: 'Other.docx', deleteFails: true });
  r = await S.create(word, io(g));
  check('a failed withdraw keeps the ref for Undo', r.ok === false && r.removed === false && r.ref && r.ref.itemId === 'I1', r);
  g = makeGraph({ auth: 403 });
  r = await S.create(word, io(g));
  check('403 is not-connected', r.ok === false && r.reason === 'not-connected', r);
  r = await S.create(Object.assign({}, word, { grantedScopes: ['Mail.Read', 'Files.ReadWrite'] }), io(makeGraph()));
  check('Files.ReadWrite is not enough', r.ok === false && r.reason === 'sharepoint-not-granted', r);
  r = await S.create(Object.assign({}, word, { grantedScopes: ['Mail.Read', 'Sites.ReadWrite.All'] }), io(makeGraph()));
  check('Sites.ReadWrite.All is enough', r.ok === true, r);
  r = await S.create(Object.assign({}, word, { grantedScopes: ['https://graph.microsoft.com/Sites.ReadWrite.All'] }), io(makeGraph()));
  check('the Graph-audience form is enough', r.ok === true, r);
  r = await S.create(Object.assign({}, word, { flags: {} }), io(makeGraph()));
  check('switch off: nothing', r.ok === false && r.reason === 'switch-off');
  r = await S.create(Object.assign({}, word, { siteId: '' }), io(makeGraph()));
  check('no site id: unclear', r.ok === false && r.reason === 'unclear');

  console.log('\n--- Undo: only while it is still what Glance made ---\n');
  g = makeGraph();
  r = await S.create(word, io(g));
  let u = await S.undo(r.ref, io(g));
  check('unchanged: deleted and read back as gone', u.ok === true && u.undone === true && !g.store.I1, u);
  g = makeGraph();
  r = await S.create(word, io(g));
  g.store.I1.eTag = '"e2,2"'; g.store.I1.lastModifiedDateTime = '2026-10-25T11:00:00Z';
  u = await S.undo(r.ref, io(g));
  check('edited by the person: left alone, says so', u.ok === false && u.reason === 'user-edited' && !!g.store.I1 && !g.log.some((l) => l.method === 'DELETE'), u);
  g = makeGraph();
  r = await S.create(word, io(g));
  delete g.store.I1;
  u = await S.undo(r.ref, io(g));
  check('already gone: Undo is done', u.ok === true && u.undone === true, u);
  u = await S.undo({ itemId: 'I1', siteId: 's', createdByGlance: false }, io(makeGraph()));
  check('not ours: refused', u.ok === false && u.reason === 'not-ours', u);
  u = await S.undo({ itemId: 'I1', createdByGlance: true }, io(makeGraph()));
  check('no site in the ref: refused', u.ok === false && u.reason === 'not-ours', u);
  g = makeGraph();
  r = await S.create(word, io(g));
  const noStamp = Object.assign({}, r.ref); delete noStamp.eTag;
  u = await S.undo(noStamp, io(g));
  check('no stamp to compare: left alone', u.ok === false && u.reason === 'unconfirmed' && !!g.store.I1, u);

  console.log('\n' + (failures ? failures + ' FAILED' : 'All sharepoint-new-file checks passed'));
  process.exit(failures ? 1 : 0);
})();
