// M2: F2 ONEDRIVE_FIND + U2 LOCAL_FILE_CLOSE wired on the Outlook close map (page).
// Loads core modules directly (no SURFACES registry). Graph and folder I/O mocked.
// Run: TZ=UTC node test/m2-outlook-onedrive-4978-corpus.cjs
//      TZ=Asia/Jerusalem node test/m2-outlook-onedrive-4978-corpus.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const { FlowOutlookM2Close: M2 } = require('../src/outlook-m2-close.js');
const { FlowOnedriveFind: Find } = require('../core/onedrive-find.js');
const { FlowLocalFile: Local } = require('../core/local-file.js');
const { FlowProofOfClose: Proof } = require('../core/proof-of-close.js');

const ROOT = path.join(__dirname, '..');
const FIXTURE = path.join(__dirname, 'fixtures/owa-reading-pane-he.html');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail).slice(0, 400) : ''); }
}

const ON_FIND = { ONEDRIVE_FIND: true };
const ON_LOCAL = { LOCAL_FILE_CLOSE: true };
const NOW = '2026-10-12T12:00:00.000Z';
const PDF = new Uint8Array(Buffer.from('%PDF-1.7 nda-signed'));
const DRIVE_ROW = { id: 'm2-A1', name: 'NDA-Acme-signed.pdf', size: PDF.length, file: { mimeType: 'application/pdf' } };
const LISTING = [{ path: 'Downloads/acme-contract-signed.pdf', size: PDF.length }];

function mockGraphFind() {
  const atts = {};
  const calls = [];
  async function graph(method, p, body) {
    calls.push({ method, path: p, body });
    if (method === 'GET' && /\/items\/m2-A1$/.test(p)) {
      return { status: 200, ok: true, json: Object.assign({}, DRIVE_ROW, { webUrl: 'https://onedrive.test/m2-A1' }) };
    }
    if (method === 'GET' && /\/content$/.test(p)) {
      return { status: 200, ok: true, bytes: PDF };
    }
    if (method === 'POST' && /\/attachments$/.test(p)) {
      atts.ATT1 = { id: 'ATT1', name: DRIVE_ROW.name, size: PDF.length };
      return { status: 201, ok: true, json: { id: 'ATT1' } };
    }
    const attGet = p.match(/\/attachments\/([^/?]+)/);
    if (attGet && method === 'GET') {
      const id = decodeURIComponent(attGet[1]);
      if (!atts[id]) return { status: 404, ok: false, json: null };
      return { status: 200, ok: true, json: atts[id] };
    }
    if (attGet && method === 'DELETE') {
      const id = decodeURIComponent(attGet[1]);
      delete atts[id];
      return { status: 204, ok: true, json: null };
    }
    return { status: 400, ok: false, json: null };
  }
  return { graph, calls, atts };
}

(async () => {
  console.log('\n--- switches default off ---\n');
  check('ONEDRIVE_FIND off in storage shape', M2.switches({ glanceSwitches: {} }).ONEDRIVE_FIND === false);
  check('LOCAL_FILE_CLOSE off in storage shape', M2.switches({ glanceSwitches: { ONEDRIVE_FIND: true } }).LOCAL_FILE_CLOSE === false);

  console.log('\n--- F2 plan via M2 (search mocked) ---\n');
  const ask = 'Hi, could you send me the signed NDA for Acme?';
  const askLocal = 'Could you send me the signed contract for Acme?';
  const graphGet = async (method, p) => {
    if (method === 'GET' && p.indexOf('/me/drive/root/search') === 0) {
      return { status: 200, ok: true, json: { value: [DRIVE_ROW] } };
    }
    return { status: 404, ok: false, json: null };
  };
  const planFind = await M2.planOnedriveFind({
    flags: ON_FIND,
    surface: 'outlook',
    text: ask,
    threadAttachments: [],
    scopes: 'Mail.ReadWrite Files.ReadWrite',
    searchResults: [DRIVE_ROW],
    graphGet: graphGet
  });
  check('find offers one drive file', planFind.action === 'offer' && planFind.file.id === 'm2-A1', planFind);
  const offFind = await M2.planOnedriveFind({ flags: {}, text: ask, threadAttachments: [], scopes: 'Files.ReadWrite', graphGet: graphGet });
  check('find switch off → off', offFind.action === 'off', offFind);

  console.log('\n--- F2 write + undo (worker-shaped) ---\n');
  const g = mockGraphFind();
  const outlookFetch = async (url, init) => {
    const u = new URL(url);
    const p = u.pathname.replace('/v1.0', '');
    const method = (init && init.method) || 'GET';
    let body = null;
    if (init && init.body) {
      if (typeof init.body === 'string') {
        try { body = JSON.parse(init.body); } catch (e) { body = init.body; }
      } else body = init.body;
    }
    const r = await g.graph(method, p, body);
    return { ok: r.ok, status: r.status, json: async () => r.json, arrayBuffer: async () => (r.bytes ? r.bytes.buffer : new ArrayBuffer(0)) };
  };
  const wrote = await M2.onedriveFindAttachWrite(outlookFetch, {
    flags: ON_FIND,
    params: { file: DRIVE_ROW, draftId: 'DRAFT-M2' },
    now: NOW
  });
  check('find attach ProofOfClose + fetchedBack', wrote.ok && wrote.fetchedBack === true && Proof.allowsHandled(wrote), wrote);
  const undone = await M2.onedriveFindUndo(outlookFetch, wrote.ref);
  check('find undo removes attachment only', undone.ok === true && !g.atts.ATT1);

  console.log('\n--- U2 plan (cloud empty, one local file) ---\n');
  const planLocal = await M2.planLocalFile({
    flags: ON_LOCAL,
    text: askLocal,
    cloudHits: [],
    listing: LISTING,
    scopes: 'Mail.ReadWrite Files.ReadWrite'
  });
  check('local offers one file', planLocal.action === 'offer' && planLocal.file.path.indexOf('acme-contract-signed') !== -1, planLocal);
  check('listingFromSt reads glanceLocalListing', M2.listingFromSt({ glanceLocalListing: LISTING }) === LISTING);

  console.log('\n--- real-shape OWA DOM (Hebrew fixture) ---\n');
  let JSDOM;
  try { ({ JSDOM } = require('jsdom')); } catch (e) {
    console.error('FAIL: jsdom is not installed.');
    process.exit(1);
  }
  const { FlowOwaParse } = require('../core/owa-parse.js');
  const html = fs.readFileSync(FIXTURE, 'utf8');
  const { window } = new JSDOM(html, { url: 'https://outlook.live.com/mail/0/inbox/id/AQMkM2RealShape' });
  const pane = FlowOwaParse.readPane(window.document, window.location.href, { own: ['glance.salisapan@outlook.com'], userName: 'Glance' });
  check('fixture pane has body text', pane && (pane.text || '').toLowerCase().indexOf('pilot proposal') !== -1, pane && pane.text && pane.text.slice(0, 80));
  check('fixture has ReadingPaneContainerId', Boolean(window.document.querySelector('#ReadingPaneContainerId')));

  console.log('\n--- C1 requests (do not apply in M2 branch) ---\n');
  const c1 = path.join(__dirname, 'm2-outlook-c1-requests-4978.md');
  check('C1 request doc present', fs.existsSync(c1));

  console.log(failures ? '\n' + failures + ' FAILED' : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})();
