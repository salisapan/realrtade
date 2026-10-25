// Save the mail's attachment, unchanged, into the Glance folder of the ONE SharePoint site a mail names, behind SHAREPOINT_SAVE_FILE
// (off). An explicit ask (a save verb asked of the reader, a file the mail points at, one named site); the site found by name and
// exactly one; the file the only real attachment or the one the mail names; the bytes untouched; nothing replaced; read back by id for
// name, a file and the same size; Undo deletes it only while eTag and lastModifiedDateTime are unchanged. Graph is mocked.
// Run: node test/sharepoint-save-file-corpus.cjs
'use strict';
const { FlowSharepointSaveFile: V } = require('../core/sharepoint-save-file.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const ON = { SHAREPOINT_SAVE_FILE: true };
const STAMP = '2026-10-25T10:00:00.000Z';

console.log('\n--- an explicit ask to save the file on one named site ---\n');
const yes = [
  ['Please save the attached contract on the Marketing SharePoint site.', 'en', 'Marketing'],
  ['Could you upload the attached invoice to the Finance SharePoint site?', 'en', 'Finance'],
  ['Hi, please save the attached contract on the Marketing SharePoint site.', 'en', 'Marketing'],
  ['Can you put this file in the "Q4 Launch" SharePoint site?', 'en', 'Q4 Launch'],
  ['Please store the quote in SharePoint site Sales', 'en', 'Sales'],
  ['תשמור את הקובץ המצורף באתר השיווק ב-SharePoint, בבקשה', 'he', 'שיווק'],
  ['בבקשה תעלה את החוזה המצורף באתר Legal ב-SharePoint', 'he', 'Legal']
];
for (const [text, lang, site] of yes) {
  const r = V.recognize(text);
  check('clear: ' + text.slice(0, 70), r.kind === 'clear' && r.lang === lang && r.siteName === site, r);
}

console.log('\n--- silence, with the reason ---\n');
const no = [
  ['Please save the attached contract on the Marketing SharePoint site and send it to Dana', 'also-sends'],
  ['Please save the attached file on the Marketing SharePoint site and OneDrive', 'other-target'],
  ['Please save the attached file on the Marketing SharePoint site, not Dropbox', 'other-target'],
  ['No need to save the attached contract on the Marketing SharePoint site', 'negation'],
  ['Ask Dana to save the attached contract on the Marketing SharePoint site', 'third-party'],
  ['Maybe save the attached contract on the Marketing SharePoint site', 'hedge'],
  ['Did you save the attached contract on the Marketing SharePoint site?', 'question-or-report'],
  ['Please save the attached contract in SharePoint', 'no-site'],
  ['Save the attached contract on the Marketing SharePoint site', 'no-request-or-clear'],
  ['אפשר לשמור את הקובץ המצורף באתר השיווק ב-SharePoint ולשלוח לדנה', 'also-sends'],
  ['היה אפשר לשמור את הקובץ המצורף באתר השיווק ב-SharePoint אתמול', 'past']
];
for (const [text, why] of no) {
  const r = V.recognize(text);
  if (why === 'no-request-or-clear') { check('an imperative is an ask: ' + text.slice(0, 50), r.kind === 'clear', r); continue; }
  check('silent (' + why + '): ' + text.slice(0, 70), r.kind !== 'clear' && r.kind !== 'ignore' && r.reason === why, r);
}
for (const text of ['FYI the attached contract was saved on the Marketing SharePoint site', 'Here is the contract. It lives on the Marketing SharePoint site.', 'Where is the attached contract on the Marketing SharePoint site?', 'I saved the attached contract on the Marketing SharePoint site', 'Please save the attached contract', 'Your SharePoint storage is almost full', 'איפה שמרת את הקובץ המצורף באתר השיווק ב-SharePoint?', '']) {
  check('ignored: ' + text.slice(0, 60), V.recognize(text).kind === 'ignore');
}

console.log('\n--- which file ---\n');
const A = (id, name, size, extra) => Object.assign({ id: id, name: name, size: size == null ? 1200 : size, contentType: 'application/pdf', isInline: false }, extra || {});
let pk = V.pickFile('save the attached', [A('a1', 'contract.pdf')]);
check('the only attachment is the file', pk.file && pk.file.id === 'a1', pk);
pk = V.pickFile('save the attached', [A('a1', 'logo.png', 10, { isInline: true }), A('a2', 'contract.pdf')]);
check('an inline image is not a file', pk.file && pk.file.id === 'a2', pk);
pk = V.pickFile('save the attached', [A('a1', 'contract.pdf'), A('a2', 'invoice.pdf')]);
check('two files and no name: Glance does not guess', !pk.file && pk.reason === 'which-file', pk);
pk = V.pickFile('please save the invoice.pdf on the site', [A('a1', 'contract.pdf'), A('a2', 'invoice.pdf')]);
check('the mail names one file: that one', pk.file && pk.file.id === 'a2', pk);
pk = V.pickFile('please save the contract on the site', [A('a1', 'contract.pdf'), A('a2', 'contract-v2.pdf')]);
check('a name that fits two files is not a pick', !pk.file && pk.reason === 'which-file', pk);
pk = V.pickFile('save it', []);
check('no attachment: no file', !pk.file && pk.reason === 'no-files', pk);
pk = V.pickFile('save it', [A('a1', 'mail.eml', 10, { '@odata.type': '#microsoft.graph.itemAttachment' })]);
check('an attached mail or event is not a file', !pk.file, pk);

function makeGraph(opts) {
  opts = opts || {};
  const log = [];
  const store = {};
  const sites = opts.sites || [{ id: 'contoso.sharepoint.com,s1,w1', displayName: 'Marketing', name: 'marketing', webUrl: 'https://contoso.sharepoint.com/sites/marketing' }];
  const call = async (req) => {
    log.push(req);
    if (opts.auth) return { ok: false, status: opts.auth, body: null };
    if (req.method === 'GET' && /^\/sites\?search=/.test(req.path)) {
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
      store.I1 = { id: 'I1', name: opts.rename || name, file: { mimeType: req.contentType }, size: opts.size != null ? opts.size : req.raw.length, eTag: '"e1,1"', lastModifiedDateTime: '2026-10-25T10:00:01Z', webUrl: 'https://contoso.sharepoint.com/sites/marketing/Shared%20Documents/Glance/' + name, __raw: req.raw };
      return { ok: true, status: 201, body: { id: 'I1' } };
    }
    const id = req.path.split('/items/')[1];
    if (req.method === 'GET') {
      const it = store[id];
      if (!it) return { ok: false, status: 404, body: null };
      const copy = Object.assign({}, it); delete copy.__raw;
      return { ok: true, status: 200, body: copy };
    }
    if (req.method === 'DELETE') { delete store[id]; return { ok: true, status: 204, body: null }; }
    return { ok: false, status: 400, body: null };
  };
  return { call, log, store };
}
const io = (g) => ({ call: g.call });
const B64 = Buffer.from('%PDF-1.4 e2e contract bytes').toString('base64');

(async () => {
  console.log('\n--- the switch and the plan ---\n');
  let g = makeGraph();
  const text = 'Please save the attached contract on the Marketing SharePoint site.';
  check('off by default', V.SWITCH_DEFAULT === false && (await V.plan({ text: text, attachments: [A('a1', 'contract.pdf')] }, io(g))).action === 'off' && g.log.length === 0);
  g = makeGraph();
  const p = await V.plan({ flags: ON, text: text, attachments: [A('a1', 'contract.pdf')] }, io(g));
  check('one Do It; the line names the file and the site', p.action === 'offer' && p.approval === 'DoIt' && p.fileName === 'contract.pdf' && p.attachmentId === 'a1' && p.siteName === 'Marketing' && /Save "contract\.pdf" on the "Marketing" SharePoint site\?/.test(p.line), p);
  check('planning only reads: one search, nothing written', g.log.length === 1 && g.log[0].method === 'GET', g.log);
  const ph = await V.plan({ flags: ON, text: yes[5][0], attachments: [A('a1', 'חוזה.pdf')] }, io(makeGraph({ sites: [{ id: 'h,1,2', displayName: 'שיווק', name: 'shivuk' }] })));
  check('Hebrew plan: Hebrew line and Hebrew file name', ph.action === 'offer' && ph.lang === 'he' && /SharePoint/.test(ph.line) && ph.fileName === 'חוזה.pdf', ph);
  let q = await V.plan({ flags: ON, text: 'Please save the attached on the Marketing SharePoint site.', attachments: [A('a1', 'contract.pdf'), A('a2', 'invoice.pdf')] }, io(makeGraph()));
  check('two attachments and no name: silence, no Graph call needed', q.action === 'silence' && q.reason === 'which-file', q);
  q = await V.plan({ flags: ON, text: text, attachments: [A('a1', 'big.pdf', 5 * 1000 * 1000)] }, io(makeGraph()));
  check('a file over the limit is silence', q.action === 'silence' && q.reason === 'too-large', q);
  q = await V.plan({ flags: ON, text: text, attachments: [A('a1', 'empty.pdf', 0)] }, io(makeGraph()));
  check('an empty file is silence', q.action === 'silence' && q.reason === 'empty-file', q);
  q = await V.plan({ flags: ON, text: text, attachments: [A('a1', 'contract.pdf')] }, io(makeGraph({ sites: [] })));
  check('no site of that name: silence', q.action === 'silence' && q.reason === 'site-not-found', q);
  q = await V.plan({ flags: ON, text: text, attachments: [A('a1', 'contract.pdf')] }, io(makeGraph({ sites: [{ id: 'a', displayName: 'Marketing', name: 'm1' }, { id: 'b', displayName: 'Marketing', name: 'm2' }] })));
  check('two sites of that name: silence, never picks', q.action === 'silence' && q.reason === 'site-ambiguous', q);
  q = await V.plan({ flags: ON, text: 'Please save the attached contract on the Marketing SharePoint site and send it to Dana', attachments: [A('a1', 'contract.pdf')] }, io(makeGraph()));
  check('a silent ask has no plan', q.action === 'silence' && q.reason === 'also-sends', q);

  console.log('\n--- Do It: save, read back ---\n');
  const doit = { flags: ON, fileName: p.fileName, siteId: p.siteId, base64: B64, contentType: 'application/pdf', attachmentName: 'contract.pdf', now: STAMP };
  g = makeGraph();
  let r = await V.save(doit, io(g));
  const put = g.log.find((l) => l.method === 'PUT');
  check('uploads the attachment bytes untouched into the site Glance folder, never replacing', /\/Glance\/contract\.pdf:\/content\?@microsoft\.graph\.conflictBehavior=fail$/.test(put.path) && Buffer.from(put.raw).toString() === '%PDF-1.4 e2e contract bytes' && put.contentType === 'application/pdf', put);
  check('Handled needs the read-back: proof fetchedBack, SharePoint system, id, stamp, site in the ref', r.ok === true && r.proof && r.proof.fetchedBack === true && r.proof.system === 'microsoft/sharepoint' && r.proof.externalId === 'I1' && r.ref.siteId === p.siteId && r.ref.eTag, r);
  check('the receipt names SharePoint, the site and the file', /SharePoint · Marketing · contract\.pdf/.test(r.written) && r.loopClosed === true, r);
  check('nothing is sent or shared: only site calls', g.log.every((l) => /^\/sites/.test(l.path)), g.log.map((l) => l.path));
  g = makeGraph({ taken: true });
  r = await V.save(doit, io(g));
  check('the name is taken: refused, nothing replaced', r.ok === false && r.reason === 'name-taken', r);
  g = makeGraph({ size: 3 });
  r = await V.save(doit, io(g));
  check('a different size on read-back is not Handled and the file is deleted again', r.ok === false && r.reason === 'verify_failed' && r.removed === true && !g.store.I1, r);
  g = makeGraph({ rename: 'Other.pdf' });
  r = await V.save(doit, io(g));
  check('a different name on read-back is not Handled', r.ok === false && r.reason === 'verify_failed' && !g.store.I1, r);
  r = await V.save(Object.assign({}, doit, { attachmentName: 'other.pdf' }), io(makeGraph()));
  check('a different attachment than the card named is refused before any write', r.ok === false && r.reason === 'attachment-differs', r);
  r = await V.save(Object.assign({}, doit, { base64: '' }), io(makeGraph()));
  check('no bytes: nothing written', r.ok === false && r.reason === 'no-bytes', r);
  r = await V.save(Object.assign({}, doit, { base64: Buffer.alloc(3 * 1000 * 1000 + 1).toString('base64') }), io(makeGraph()));
  check('over the limit: nothing written', r.ok === false && r.reason === 'too-large', r);
  r = await V.save(Object.assign({}, doit, { grantedScopes: ['Mail.Read', 'Files.ReadWrite'] }), io(makeGraph()));
  check('Files.ReadWrite is not enough', r.ok === false && r.reason === 'sharepoint-not-granted', r);
  r = await V.save(Object.assign({}, doit, { grantedScopes: ['Sites.ReadWrite.All'] }), io(makeGraph()));
  check('Sites.ReadWrite.All is enough', r.ok === true, r);
  r = await V.save(Object.assign({}, doit, { flags: {} }), io(makeGraph()));
  check('switch off: nothing', r.ok === false && r.reason === 'switch-off', r);
  r = await V.save(doit, io(makeGraph({ auth: 403 })));
  check('403 is not-connected', r.ok === false && r.reason === 'not-connected', r);

  console.log('\n--- Undo: only while it is still what Glance made ---\n');
  g = makeGraph();
  r = await V.save(doit, io(g));
  let u = await V.undo(r.ref, io(g));
  check('unchanged: deleted and read back as gone', u.ok === true && u.undone === true && !g.store.I1, u);
  g = makeGraph();
  r = await V.save(doit, io(g));
  g.store.I1.eTag = '"e2,2"'; g.store.I1.lastModifiedDateTime = '2026-10-25T11:00:00Z';
  u = await V.undo(r.ref, io(g));
  check('edited by the person: left alone, says so', u.ok === false && u.reason === 'user-edited' && !!g.store.I1, u);

  console.log('\n' + (failures ? failures + ' FAILED' : 'All sharepoint-save-file checks passed'));
  process.exit(failures ? 1 : 0);
})();
