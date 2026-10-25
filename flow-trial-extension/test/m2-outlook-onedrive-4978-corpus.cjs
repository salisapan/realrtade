// M2: F2 ONEDRIVE_FIND + U2 LOCAL_FILE_CLOSE (Outlook close map). Behaviour rows through decide()/plan();
// page rows for conversation pane + undo. Graph mocked. Bite guards patch core/onedrive-find.js plan().
// Run: TZ=UTC node test/m2-outlook-onedrive-4978-corpus.cjs
//      TZ=Asia/Jerusalem node test/m2-outlook-onedrive-4978-corpus.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { FlowOutlookM2Close: M2 } = require('../src/outlook-m2-close.js');
const { FlowOnedriveFind: Find } = require('../core/onedrive-find.js');
const { FlowFileAttach: FileAttach } = require('../core/file-attach.js');
const { FlowLocalFile: Local } = require('../core/local-file.js');
const { FlowProofOfClose: Proof } = require('../core/proof-of-close.js');
const { runPage, CONV, ME } = require('./owa-page-harness.cjs');

const ROOT = path.join(__dirname, '..');
const FIND_SRC = path.join(ROOT, 'core/onedrive-find.js');
const M2_EXTRA = ['core/onedrive-find.js', 'core/local-file.js', 'src/outlook-m2-close.js'];

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail).slice(0, 400) : ''); }
}

const ON_FIND = { ONEDRIVE_FIND: true };
const ON_LOCAL = { LOCAL_FILE_CLOSE: true };
const NOW = '2026-10-12T12:00:00.000Z';
const PDF = new Uint8Array(Buffer.from('%PDF-1.7 nda-signed'));
const ASK = 'Hi, could you send me the signed NDA for Acme?';
const row = (id, name, size, extra) => Object.assign({ id, name, size, file: { mimeType: 'application/pdf' } }, extra || {});
const DRIVE_ROW = row('m2-A1', 'NDA-Acme-signed.pdf', PDF.length);
const LISTING = [{ path: 'Downloads/acme-contract-signed.pdf', size: PDF.length }];
const BASE = { flags: ON_FIND, surface: 'outlook', text: ASK, threadAttachments: [], scopes: 'Mail.ReadWrite Files.ReadWrite' };

function planWith(files) {
  return Find.plan(Object.assign({}, BASE, { searchResults: files }));
}

function decideWith(files, text) {
  const g = FileAttach.gate(String(text || ASK));
  if (g.kind !== 'clear') return g;
  return FileAttach.decide(g.ask, files, {}, String(text || ASK));
}

function loadFindFromSource(src) {
  const mod = { exports: {} };
  const sandbox = {
    module: mod,
    exports: mod.exports,
    require,
    FlowFileAttach: FileAttach,
    FlowProofOfClose: Proof,
    globalThis: { FlowFileAttach: FileAttach, FlowProofOfClose: Proof }
  };
  vm.runInNewContext(src, sandbox, { filename: 'onedrive-find-patched.js' });
  return mod.exports.FlowOnedriveFind;
}

const M2_SRC = path.join(ROOT, 'src/outlook-m2-close.js');

function loadM2FromSource(src) {
  const mod = { exports: {} };
  const sandbox = {
    module: mod,
    exports: mod.exports,
    require,
    FlowOnedriveFind: Find,
    FlowProofOfClose: Proof,
    globalThis: { FlowOnedriveFind: Find, FlowProofOfClose: Proof }
  };
  vm.runInNewContext(src, sandbox, { filename: 'outlook-m2-close-patched.js' });
  return mod.exports.FlowOutlookM2Close;
}

function biteGuard(label, mutate, runExpect) {
  const orig = fs.readFileSync(FIND_SRC, 'utf8');
  const patched = mutate(orig);
  check(label + ': patch applied', patched !== orig);
  const F = loadFindFromSource(patched);
  const good = runExpect(F);
  const bad = runExpect(loadFindFromSource(orig));
  check(label + ': bites (patched fails product guard)', good === true && bad === false, { good, bad });
}

function mockGraphFind(opts) {
  opts = opts || {};
  const atts = {};
  const drafts = {};
  function touchDraft(id) {
    if (id && !drafts[id]) drafts[id] = { id: id };
  }
  async function graph(method, p, body) {
    if (method === 'GET' && /\/items\/m2-A1$/.test(p)) {
      return { status: 200, ok: true, json: Object.assign({}, DRIVE_ROW, { webUrl: 'https://onedrive.test/m2-A1' }) };
    }
    if (method === 'GET' && /\/content$/.test(p)) {
      if (opts.skipContent) return { status: 200, ok: true, bytes: PDF.slice(0, 2) };
      return { status: 200, ok: true, bytes: PDF };
    }
    if (method === 'POST' && /\/attachments$/.test(p)) {
      const msg = (p.match(/\/me\/messages\/([^/]+)\/attachments$/) || [])[1];
      if (msg) touchDraft(decodeURIComponent(msg));
      atts.ATT1 = { id: 'ATT1', name: DRIVE_ROW.name, size: PDF.length };
      return { status: 201, ok: true, json: { id: 'ATT1' } };
    }
    const attGet = p.match(/\/attachments\/([^/?]+)/);
    if (attGet && method === 'GET') {
      const id = decodeURIComponent(attGet[1]);
      if (opts.attMissing) return { status: 404, ok: false, json: null };
      if (!atts[id]) return { status: 404, ok: false, json: null };
      const row = atts[id];
      return { status: 200, ok: true, json: { id: row.id, name: row.name, size: row.size + 200 } };
    }
    if (attGet && method === 'DELETE') {
      delete atts[decodeURIComponent(attGet[1])];
      return { status: 204, ok: true, json: null };
    }
    const draftGet = p.match(/\/me\/messages\/([^/?]+)/);
    if (draftGet && method === 'GET') {
      const id = decodeURIComponent(draftGet[1]);
      if (!drafts[id]) return { status: 404, ok: false, json: null };
      return { status: 200, ok: true, json: drafts[id] };
    }
    if (draftGet && method === 'DELETE') {
      delete drafts[decodeURIComponent(draftGet[1])];
      return { status: 204, ok: true, json: null };
    }
    return { status: 400, ok: false, json: null };
  }
  return { graph, atts, drafts };
}

async function runM2Page(opts) {
  const o = Object.assign({}, opts || {});
  o.store = Object.assign({ glanceSwitches: { ONEDRIVE_FIND: true } }, o.store || {});
  o.extraFiles = M2_EXTRA;
  return runPage(o);
}

(async () => {
  console.log('\n--- switches ---\n');
  check('ONEDRIVE_FIND off by default', M2.switches({ glanceSwitches: {} }).ONEDRIVE_FIND === false);
  check('LOCAL_FILE_CLOSE off unless on', M2.switches({ glanceSwitches: { ONEDRIVE_FIND: true } }).LOCAL_FILE_CLOSE === false);

  console.log('\n--- decide() behaviour (plan) ---\n');
  check('one file → offer', planWith([DRIVE_ROW]).action === 'offer');
  check('conflicting NDA files → silence conflict', planWith([row('b1', 'NDA v1.pdf', 10), row('b2', 'NDA v2.pdf', 11)]).reason === 'conflict');
  check('unrelated files → silence', planWith([row('x', 'holiday.jpg', 10)]).action === 'silence');
  check('zero files → silence (no invented NDA)', planWith([]).action === 'silence');
  check('switch off → off', Find.plan(Object.assign({}, BASE, { flags: {}, searchResults: [DRIVE_ROW] })).action === 'off');
  const tooBig = row('big', 'NDA-Acme-signed.pdf', 4 * 1024 * 1024);
  check('too-big → silence', planWith([tooBig]).action === 'silence');
  check('decide conflict not pick-first', decideWith([row('b1', 'NDA v1.pdf', 10), row('b2', 'NDA v2.pdf', 11)]).action !== 'attach');

  console.log('\n--- write + undo (attachment + draft) ---\n');
  const g = mockGraphFind();
  const outlookFetch = async (url, init) => {
    const u = new URL(url);
    const p = u.pathname.replace('/v1.0', '');
    const method = (init && init.method) || 'GET';
    let body = null;
    if (init && init.body) body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
    const r = await g.graph(method, p, body);
    return { ok: r.ok, status: r.status, json: async () => r.json, arrayBuffer: async () => (r.bytes ? r.bytes.buffer : new ArrayBuffer(0)) };
  };
  const wrote = await M2.onedriveFindAttachWrite(outlookFetch, {
    flags: ON_FIND,
    params: {
      file: DRIVE_ROW,
      draftId: 'DRAFT-M2',
      draftMeta: { draftId: 'DRAFT-M2', draftCreatedByGlance: true }
    },
    now: NOW
  });
  check('attach ProofOfClose', wrote.ok && Proof.allowsHandled(wrote), wrote);
  const undone = await M2.onedriveFindUndo(outlookFetch, wrote.ref);
  check('undo removes attachment and draft', undone.ok && !g.atts.ATT1 && !g.drafts['DRAFT-M2']);
  const g2 = mockGraphFind({ attMissing: true });
  const outlookFetch2 = async (url, init) => {
    const u = new URL(url);
    const p = u.pathname.replace('/v1.0', '');
    const method = (init && init.method) || 'GET';
    const r = await g2.graph(method, p, init && init.body);
    return { ok: r.ok, status: r.status, json: async () => r.json, arrayBuffer: async () => new ArrayBuffer(0) };
  };
  const miss = await M2.onedriveFindAttachWrite(outlookFetch2, {
    flags: ON_FIND,
    params: { file: DRIVE_ROW, draftId: 'DRAFT-M2' }
  });
  check('missing attach read-back → not Handled', !miss.ok || !Proof.allowsHandled(miss), miss);

  console.log('\n--- U2 local plan ---\n');
  const planLocal = await M2.planLocalFile({
    flags: ON_LOCAL,
    text: 'Could you send me the signed contract for Acme?',
    cloudHits: [],
    listing: LISTING,
    scopes: 'Mail.ReadWrite Files.ReadWrite'
  });
  check('local offers one file', planLocal.action === 'offer' && planLocal.file.path.indexOf('acme-contract') !== -1, planLocal);

  console.log('\n--- C1 doc: no duplicate SURFACES ---\n');
  const c1 = fs.readFileSync(path.join(__dirname, 'm2-outlook-c1-requests-4978.md'), 'utf8');
  check('C1 extra omits onedrive-file.js', c1.indexOf("'core/onedrive-file.js'") === -1 || c1.indexOf('extra:') === -1);
  check('C1 worker import omits onedrive-file.js', !/import '\.\.\/core\/onedrive-file\.js'/.test(c1));

  console.log('\n--- graphFromPageSend (no Buffer) ---\n');
  const pageGraph = M2.graphFromPageSend(async () => ({ ok: true, body: '%PDF' }));
  const bytes = await pageGraph('GET', '/me/drive/items/x/content');
  check('page graph content is Uint8Array', bytes.bytes instanceof Uint8Array && bytes.bytes.length === 4);

  console.log('\n--- bite guards (plan mutations) ---\n');
  biteGuard('pick-first-file', (s) => s.replace(
    'const picked = fileAttach().decide(r.ask, files, {}, String(input.text || \'\'));',
    'const picked = { action: \'attach\', file: files[0] };'
  ), (F) => {
    const out = F.plan(Object.assign({}, BASE, { searchResults: [row('b1', 'NDA v1.pdf', 10), row('b2', 'NDA v2.pdf', 11)] }));
    return out.action === 'offer';
  });
  biteGuard('zero-files-invents-NDA', (s) => s.replace(
    "if (!files.length) return silence('none');",
    "if (!files.length) return { action: 'offer', file: { id: 'inv', name: 'NDA.pdf', size: 10 }, line: 'x', steps: [] };"
  ), (F) => F.plan(Object.assign({}, BASE, { searchResults: [] })).action === 'offer');
  biteGuard('dropped too-big check', (s) => s.replace(
    'if (file.size > MAX_BYTES) return silence(\'too-big\');',
    '/* too-big removed */'
  ), (F) => F.plan(Object.assign({}, BASE, { searchResults: [tooBig] })).action === 'offer');
  {
    const origFind = fs.readFileSync(FIND_SRC, 'utf8');
    const patchedRb = origFind.replace(
      "const back = await graph('GET', attachmentPath(draftId, attId) + '?$select=id,name,size');",
      "const back = { ok: true, json: { id: attId, name: name, size: size + 200 } };"
    );
    check('dropped read-back check: patch applied', patchedRb !== origFind);
    const Fbad = loadFindFromSource(patchedRb);
    const gMiss = mockGraphFind({ attMissing: true });
    const rBad = await Fbad.attachToDraft({ flags: ON_FIND, file: DRIVE_ROW, draftId: 'D1', now: NOW }, { graph: gMiss.graph });
    const rGood = await Find.attachToDraft({ flags: ON_FIND, file: DRIVE_ROW, draftId: 'D1', now: NOW }, { graph: gMiss.graph });
    check('dropped read-back bites', rBad.ok === true && (!rGood.ok || !Proof.allowsHandled(rGood)));
  }
  const m2Orig = fs.readFileSync(M2_SRC, 'utf8');
  const m2Patched = m2Orig.replace(
    'const draftId = ref && ref.draftId;',
    'const draftId = null; /* bite: draft undo dropped */'
  );
  check('undo no-op: patch applied', m2Patched !== m2Orig);
  const M2bad = loadM2FromSource(m2Patched);
  const g3 = mockGraphFind();
  const of = async (url, init) => {
    const u = new URL(url);
    const p = u.pathname.replace('/v1.0', '');
    const method = (init && init.method) || 'GET';
    const r = await g3.graph(method, p, init && init.body);
    return { ok: r.ok, status: r.status, json: async () => r.json, arrayBuffer: async () => new ArrayBuffer(0) };
  };
  function outlookFetchFrom(graphFn) {
    return async (url, init) => {
      const u = new URL(url);
      const p = u.pathname.replace('/v1.0', '');
      const method = (init && init.method) || 'GET';
      let body = null;
      if (init && init.body) {
        if (typeof init.body === 'string') {
          try { body = JSON.parse(init.body); } catch (e) { body = init.body; }
        } else body = init.body;
      }
      const r = await graphFn(method, p, body);
      return { ok: r.ok, status: r.status, json: async () => r.json, arrayBuffer: async () => (r.bytes ? r.bytes.buffer : new ArrayBuffer(0)) };
    };
  }
  const ofBad = outlookFetchFrom(g3.graph);
  const g4 = mockGraphFind();
  const ofGood = outlookFetchFrom(g4.graph);
  const w3 = await M2.onedriveFindAttachWrite(ofBad, { flags: ON_FIND, params: { file: DRIVE_ROW, draftId: 'DRAFT-M2', draftMeta: { draftId: 'DRAFT-M2', draftCreatedByGlance: true } } });
  const u3bad = await M2bad.onedriveFindUndo(ofBad, w3.ref);
  check('undo no-op leaves draft when draft delete is dropped', u3bad.ok && g3.drafts['DRAFT-M2'], { u3bad, draft: g3.drafts });
  const w4 = await M2.onedriveFindAttachWrite(ofGood, { flags: ON_FIND, params: { file: DRIVE_ROW, draftId: 'DRAFT-B', draftMeta: { draftId: 'DRAFT-B', draftCreatedByGlance: true } } });
  const u3good = await M2.onedriveFindUndo(ofGood, w4.ref);
  check('product undo clears draft', w4.ok && u3good.ok && !g4.drafts['DRAFT-B'], { w4, u3good, draft: g4.drafts });

  console.log('\n--- page: conversation pane (exact-or-unsure) ---\n');
  const convUnsure = await runM2Page({
    urlId: CONV,
    emptyInbox: true,
    mailBody: ASK,
    listedConversationId: CONV,
    driveFiles: [{ id: 'm2-A1', name: 'NDA-Acme-signed.pdf', size: 100, file: { mimeType: 'application/pdf' } }],
    waitMs: 5000
  });
  check('conversation pane without exact pin → why-not reply-target-unsure',
    Boolean(convUnsure.replyTargetUnsureLine) || (convUnsure.doc && convUnsure.doc.querySelector('[data-glance-why="page:reply-target-unsure"]')),
    { line: convUnsure.replyTargetUnsureLine, chip: Boolean(convUnsure.chip) });

  console.log('\n--- page: undo sends worker undo ---\n');
  const htmlPatchAsk = (h) => h.replace('Could you review the attached pilot proposal', ASK);
  const withCard = await runM2Page({
    htmlPatch: htmlPatchAsk,
    urlId: 'AQMkM2RealShape',
    messageId: 'AQMkM2RealShape',
    listedConversationId: CONV,
    mailBody: ASK,
    listedSubject: 'Vendor NDA',
    driveFiles: [{ id: 'm2-A1', name: 'NDA-Acme-signed.pdf', size: 100, file: { mimeType: 'application/pdf' } }],
    store: {
      outlookAuth: {
        token: { accessToken: 'AT', expiresAt: Date.now() + 3600e3, grantedScopes: 'Mail.ReadWrite Files.ReadWrite' },
        account: { address: ME, name: 'Glance' },
        ownAddresses: [ME]
      }
    },
    waitMs: 8000,
    clickDoIt: true,
    clickUndo: true
  });
  const chain = withCard.chip && withCard.chip.getAttribute('data-glance-chain');
  const undos = (withCard.sent || []).filter((m) => m.type === 'flow:undo-action');
  check('page shows onedrive-find card', chain === 'onedrive-find', { chain });
  check('page undo calls onedriveFindAttach undo', undos.some((m) => m.connectorId === 'onedriveFindAttach'), undos);

  console.log(failures ? '\n' + failures + ' FAILED' : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})();
