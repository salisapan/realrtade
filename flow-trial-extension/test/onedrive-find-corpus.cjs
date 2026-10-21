// Find the file they asked for on the person's own OneDrive (close map F2),
// behind ONEDRIVE_FIND (off). Outlook only. One clear ask, the thread without it,
// exactly one of the person's own files: attach it to the reply draft, read the
// item and the attachment back. Undo removes the attachment and reads it as gone.
// Graph is mocked. Nothing is sent, and the ask stays open.
// Run: node test/onedrive-find-corpus.cjs
'use strict';
const { FlowOnedriveFind: F } = require('../core/onedrive-find.js');
const { FlowProofOfClose: Proof } = require('../core/proof-of-close.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const ON = { ONEDRIVE_FIND: true };
const NOW = '2026-10-12T12:00:00.000Z';
const row = (id, name, size, extra) => Object.assign({ id, name, size, file: { mimeType: 'application/pdf' }, webUrl: 'https://onedrive.live.com/?id=' + id }, extra || {});
const DRIVE = [
  row('A1', 'NDA-Acme-signed.pdf', 1200),
  row('A2', 'holiday.jpg', 800, { file: { mimeType: 'image/jpeg' } }),
  row('A3', 'הצעת מחיר - דנה.pdf', 900),
  row('A4', 'Projects', 0, { file: undefined, folder: { childCount: 3 } })
];
const base = { flags: ON, surface: 'outlook', threadAttachments: [], scopes: 'Mail.ReadWrite Files.ReadWrite' };

// ---- 1. recognition and the plan ---------------------------------------------
console.log('\n--- one clear ask on Outlook, one of their own files ---\n');
const positives = [
  { text: 'Hi, could you send me the signed NDA for Acme?', expect: 'A1', lang: 'en' },
  { text: 'Please send the NDA, it should be in your OneDrive.', expect: 'A1', lang: 'en' },
  { text: 'היי, תשלחי לי בבקשה את הצעת המחיר לדנה.', expect: 'A3', lang: 'he' },
  { text: 'אשמח לקבל את הצעת המחיר עד יום חמישי.', expect: 'A3', lang: 'he' }
];
let offered = 0;
for (const p of positives) {
  const out = F.plan(Object.assign({}, base, { text: p.text, searchResults: DRIVE }));
  const ok = out.action === 'offer' && out.file.id === p.expect && out.ask.lang === p.lang;
  if (ok) offered++;
  check('offers the one OneDrive file: ' + p.text, ok, out);
}
const rec = F.recognize(Object.assign({}, base, { text: positives[0].text }));
check('recognize returns Graph search paths on the person\'s own drive', rec.action === 'search' && rec.paths.length >= 1 && rec.paths.every((p) => p.indexOf('/me/drive/root/search(q=') === 0), rec);
check('a quote in a term is escaped for the search', F.searchPaths({ label: "Dana's NDA" })[0].indexOf(encodeURIComponent("Dana''s NDA")) !== -1);
const he = F.plan(Object.assign({}, base, { text: positives[2].text, searchResults: DRIVE }));
check('the Hebrew line names the file and OneDrive', /^מצאתי את הצעת מחיר - דנה\.pdf ב-OneDrive/.test(he.line), he.line);
check('the plan: found, attached to the draft, and a blocked send step', he.steps.length === 3 && he.steps[0].proof === 'microsoft/onedrive' && he.steps[2].blocked === 'mail-send-not-built', he.steps);
check('a OneDrive cue is evidence on the plan', F.plan(Object.assign({}, base, { text: positives[1].text, searchResults: DRIVE })).cue === true);

// ---- 2. silence ---------------------------------------------------------------
console.log('\n--- silence wins ---\n');
const negatives = [
  { why: 'Gmail is not searched against OneDrive', text: positives[0].text, surface: 'gmail' },
  { why: 'negation (en)', text: "Don't send the NDA yet." },
  { why: 'negation (he)', text: 'אל תשלחי את הצעת המחיר עדיין.' },
  { why: 'third party (en)', text: 'Can you ask legal to send the NDA?' },
  { why: 'third party (he)', text: 'תבקשי מהנהלת חשבונות שתשלח את הצעת המחיר.' },
  { why: 'hedge', text: 'Maybe send the NDA if you want.' },
  { why: 'fyi', text: 'FYI the NDA is attached.' },
  { why: 'no ask', text: 'Great meeting today, thanks!' },
  { why: 'the thread already has it', text: positives[0].text, threadAttachments: [{ name: 'NDA_final.pdf', isInline: false }] },
  { why: 'the attachment list is unread', text: positives[0].text, threadAttachments: null },
  { why: 'two files fit', text: 'Please send the NDA.', searchResults: [row('B1', 'NDA v1.pdf', 10), row('B2', 'NDA v2.pdf', 11)] },
  { why: 'only a template', text: 'Please send the NDA.', searchResults: [row('B3', 'NDA template.docx', 10)] },
  { why: 'nothing named like it', text: 'Please send the NDA.', searchResults: [row('B4', 'holiday.jpg', 10)] },
  { why: 'a folder named like it', text: 'Please send the NDA.', searchResults: [row('B5', 'NDA', 0, { file: undefined, folder: {} })] },
  { why: 'a deleted item', text: 'Please send the NDA.', searchResults: [row('B6', 'NDA.pdf', 10, { deleted: { state: 'deleted' } })] },
  { why: 'a file shared from another drive', text: 'Please send the NDA.', searchResults: [row('B7', 'NDA.pdf', 10, { remoteItem: { id: 'x' } })] },
  { why: 'over 3 MB', text: 'Please send the NDA.', searchResults: [row('B8', 'NDA.pdf', 4 * 1024 * 1024)] },
  { why: 'empty search', text: 'Please send the NDA.', searchResults: [] },
  { why: 'search did not run', text: 'Please send the NDA.', searchResults: null }
];
let wrongOffers = 0;
for (const n of negatives) {
  const input = Object.assign({}, base, { text: n.text, searchResults: n.searchResults === undefined ? DRIVE : n.searchResults });
  if (n.surface) input.surface = n.surface;
  if (n.threadAttachments !== undefined) input.threadAttachments = n.threadAttachments;
  const out = F.plan(input);
  if (out.action === 'offer') wrongOffers++;
  check('silent: ' + n.why, out.action === 'silence', out);
}
check('two files fit is a conflict', F.plan(Object.assign({}, base, { text: 'Please send the NDA.', searchResults: negatives[10].searchResults })).reason === 'conflict');

console.log('\n--- the switch and the scope ---\n');
check('the switch is ONEDRIVE_FIND and defaults off', F.SWITCH === 'ONEDRIVE_FIND' && F.SWITCH_DEFAULT === false && F.enabled() === false && F.enabled({ ONEDRIVE_FIND: 'true' }) === false);
for (const p of positives) {
  const out = F.plan(Object.assign({}, base, { flags: undefined, text: p.text, searchResults: DRIVE }));
  check('switch off: no search and no offer for ' + p.text, out.action === 'off' && F.recognize(Object.assign({}, base, { flags: {}, text: p.text })).action === 'off', out);
}
const noScope = F.recognize(Object.assign({}, base, { text: positives[0].text, scopes: 'Mail.ReadWrite' }));
check('a token without Files.Read says reconnect', noScope.action === 'reconnect', noScope);
check('Files.Read alone is enough to search', F.hasReadScope('Mail.ReadWrite Files.Read') === true && F.hasReadScope(null) === null);

console.log('\n--- base64 matches Node ---\n');
for (const s of ['', 'a', 'ab', 'abc', 'abcd', '%PDF-1.7 חתום']) {
  const b = new Uint8Array(Buffer.from(s, 'utf8'));
  check('base64 of ' + JSON.stringify(s), F.toBase64(b) === Buffer.from(b).toString('base64'));
}

// ---- 3. the writer with a mocked Graph ---------------------------------------
const PDF = new Uint8Array(Buffer.from('%PDF-1.7 signed NDA Acme', 'utf8'));
function mockGraph(opts) {
  opts = opts || {};
  const calls = [];
  const atts = {};
  const item = Object.assign({ id: 'A1', name: 'NDA-Acme-signed.pdf', size: PDF.length, file: { mimeType: 'application/pdf' }, webUrl: 'https://onedrive.live.com/?id=A1' }, opts.item || {});
  async function graph(method, path, body) {
    calls.push({ method, path, body });
    if (method === 'GET' && /\/me\/drive\/items\/A1\/content$/.test(path)) {
      return { status: 200, ok: true, bytes: opts.shortContent ? PDF.slice(1) : PDF };
    }
    if (method === 'GET' && /\/me\/drive\/items\/A1$/.test(path)) {
      if (opts.itemStatus) return { status: opts.itemStatus, ok: false, json: null };
      return { status: 200, ok: true, json: item };
    }
    if (method === 'POST' && /\/attachments$/.test(path)) {
      if (opts.postStatus) return { status: opts.postStatus, ok: false, json: {} };
      if (opts.noAttId) return { status: 201, ok: true, json: {} };
      atts.ATT1 = { id: 'ATT1', name: body.name, size: Buffer.from(body.contentBytes, 'base64').length + 180 };
      return { status: 201, ok: true, json: { id: 'ATT1' } };
    }
    const m = path.match(/\/attachments\/([^?]+)/);
    if (m && method === 'GET') {
      const a = atts[decodeURIComponent(m[1])];
      if (!a || opts.attGetFail) return { status: 404, ok: false, json: null };
      return { status: 200, ok: true, json: opts.attRename ? Object.assign({}, a, { name: 'other.pdf' }) : a };
    }
    if (m && method === 'DELETE') {
      if (!opts.keepOnDelete) delete atts[decodeURIComponent(m[1])];
      return { status: 204, ok: true, json: null };
    }
    return { status: 400, ok: false, json: null };
  }
  return { graph, calls, atts };
}
const FILE = { id: 'A1', name: 'NDA-Acme-signed.pdf', size: PDF.length };

(async () => {
  console.log('\n--- Do It: attach, read back ---\n');
  const g = mockGraph();
  const res = await F.attachToDraft({ flags: ON, file: FILE, draftId: 'DRAFT1', now: NOW }, { graph: g.graph });
  check('attached and read back: ok with a proof', res.ok === true && Proof.allowsHandled(res), res);
  check('ProofOfClose names the OneDrive item read back by id', res.proof && res.proof.system === 'microsoft/onedrive' && res.proof.externalId === 'A1' && res.proof.fetchedBack === true && res.proof.verifiedAt === NOW, res.proof);
  check('the draft attachment was read back too', res.attachment && res.attachment.fetchedBack === true && res.attachment.attachmentId === 'ATT1');
  check('the ask is not closed by a draft', res.loopClosed === false);
  check('order: GET item, GET content, POST attachment, GET attachment', g.calls.map((c) => c.method).join(',') === 'GET,GET,POST,GET', g.calls.map((c) => c.method + ' ' + c.path));
  check('the attachment carries the exact bytes', Buffer.from(g.calls[2].body.contentBytes, 'base64').equals(Buffer.from(PDF)));
  check('no send call anywhere', g.calls.every((c) => !/\/send\b/.test(c.path)));

  console.log('\n--- a missing or wrong read-back is not Handled ---\n');
  const cases = [
    ['the item is gone', { itemStatus: 404 }, 'item-gone'],
    ['the token is refused', { itemStatus: 403 }, 'not-connected'],
    ['the item became a folder', { item: { folder: {}, file: undefined } }, 'verify_failed'],
    ['the item size changed', { item: { size: PDF.length + 5 } }, 'verify_failed'],
    ['the content is short', { shortContent: true }, 'verify_failed'],
    ['the attach POST fails', { postStatus: 500 }, 'attach-failed'],
    ['the attach has no id', { noAttId: true }, 'proof_pending'],
    ['the attachment GET misses', { attGetFail: true }, 'verify_failed'],
    ['another name comes back', { attRename: true }, 'verify_failed']
  ];
  for (const [why, opts, reason] of cases) {
    const r = await F.attachToDraft({ flags: ON, file: FILE, draftId: 'DRAFT1', now: NOW }, { graph: mockGraph(opts).graph });
    check(why + ' → ' + reason + ', not Handled', r.ok === false && r.reason === reason && !Proof.allowsHandled(r), r);
  }
  const orphan = await F.attachToDraft({ flags: ON, file: FILE, draftId: 'DRAFT1', now: NOW }, { graph: mockGraph({ attRename: true }).graph });
  check('a failed read-back keeps the ref so the attachment can be undone', orphan.ref && orphan.ref.attachmentId === 'ATT1');

  const off = mockGraph();
  const r0 = await F.attachToDraft({ file: FILE, draftId: 'DRAFT1', now: NOW }, { graph: off.graph });
  check('switch off: no Graph call', r0.ok === false && r0.reason === 'switch-off' && off.calls.length === 0);

  console.log('\n--- Undo ---\n');
  const u = mockGraph();
  const saved = await F.attachToDraft({ flags: ON, file: FILE, draftId: 'DRAFT1', now: NOW }, { graph: u.graph });
  const undone = await F.undo(saved.ref, { graph: u.graph });
  check('Undo removes the attachment and reads it back as gone', undone.ok === true && !u.atts.ATT1 && u.calls.slice(-2).map((c) => c.method).join(',') === 'DELETE,GET', undone);
  check('Undo never touches the OneDrive file', u.calls.every((c) => !(c.method === 'DELETE' && /\/drive\//.test(c.path))));
  const stuck = mockGraph({ keepOnDelete: true });
  const s2 = await F.attachToDraft({ flags: ON, file: FILE, draftId: 'DRAFT1', now: NOW }, { graph: stuck.graph });
  check('still there after delete is undo-unverified', (await F.undo(s2.ref, { graph: stuck.graph })).reason === 'undo-unverified');
  check('Undo refuses what Glance did not attach', (await F.undo({ draftId: 'D', attachmentId: 'X', createdByGlance: false }, { graph: u.graph })).reason === 'not-ours');

  console.log('\nprecision: offers ' + offered + '/' + positives.length + ' positives, wrong offers ' + wrongOffers + '/' + negatives.length + ' negatives');
  check('precision gate: zero wrong offers on the negative set', wrongOffers === 0);
  check('recall on the positive set is 100%', offered === positives.length);
  console.log(failures ? '\n' + failures + ' FAILED' : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})();
