// A file on the person's own computer (close map U2), behind LOCAL_FILE_CLOSE (off).
// One clear ask, the cloud search empty, exactly one local match: read, save a copy
// to OneDrive (never overwrite), read the item back by id, size and hash. Handled
// only on that read-back. Undo deletes the item and reads it back as gone.
// Graph, the folder and hashing are mocked. Nothing is sent.
// Run: node test/local-file-corpus.cjs
'use strict';
const crypto = require('crypto');
const { FlowLocalFile: L } = require('../core/local-file.js');
const { FlowProofOfClose: Proof } = require('../core/proof-of-close.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const ON = { LOCAL_FILE_CLOSE: true };
const NOW = '2026-10-10T12:00:00.000Z';
const bytesOf = (s) => new Uint8Array(Buffer.from(s, 'utf8'));
const CONTRACT = bytesOf('%PDF-1.7 signed contract with Dana');
const RECEIPT = bytesOf('%PDF-1.7 receipt 3850');
const hex = (algo, bytes) => crypto.createHash(algo === 'SHA-256' ? 'sha256' : 'sha1').update(Buffer.from(bytes)).digest('hex');
const digest = async (algo, bytes) => hex(algo, bytes);

const DOWNLOADS = [
  { path: 'Downloads/הסכם-דנה-חתום.pdf', size: CONTRACT.length },
  { path: 'Downloads/holiday-photo.jpg', size: 2048 },
  { path: 'Downloads/receipt-3850.pdf', size: RECEIPT.length }
];
const DOWNLOADS_EN = [
  { path: 'Downloads/acme-contract-signed.pdf', size: CONTRACT.length },
  { path: 'Downloads/notes.txt', size: 12 }
];

// ---- 1. recognition and the plan: Hebrew and English, positive ----------------
console.log('\n--- one clear ask, nothing in the cloud, one file on the computer ---\n');
const positives = [
  { text: 'היי, תשלח לי בבקשה את ההסכם החתום עד מחר.', listing: DOWNLOADS, expect: 'Downloads/הסכם-דנה-חתום.pdf', lang: 'he' },
  { text: 'אשמח לקבל את הקבלה על 3,850 ₪.', listing: DOWNLOADS, expect: 'Downloads/receipt-3850.pdf', lang: 'he' },
  { text: 'Could you send me the signed contract for Acme?', listing: DOWNLOADS_EN, expect: 'Downloads/acme-contract-signed.pdf', lang: 'en' },
  { text: 'Please send the contract, I think you have it in your Downloads.', listing: DOWNLOADS_EN, expect: 'Downloads/acme-contract-signed.pdf', lang: 'en' }
];
let offered = 0;
for (const p of positives) {
  const out = L.plan({ flags: ON, text: p.text, cloudHits: [], listing: p.listing, scopes: 'Mail.ReadWrite Files.ReadWrite' });
  const ok = out.action === 'offer' && out.file.path === p.expect && out.ask.lang === p.lang && out.approval === 'Do It';
  if (ok) offered++;
  check('offers the one local file: ' + p.text, ok, out);
}
const he = L.plan({ flags: ON, text: positives[0].text, cloudHits: [], listing: DOWNLOADS });
check('the Hebrew card line names the file and OneDrive', /מצאתי את הסכם-דנה-חתום\.pdf במחשב/.test(he.line) && /OneDrive/.test(he.line), he.line);
check('the plan has read, save with proof, and a send step that is blocked', he.steps.length === 3 && he.steps[1].proof === 'microsoft/onedrive' && he.steps[2].blocked === 'mail-send-not-built', he.steps);
check('a local cue is evidence on the plan', L.plan({ flags: ON, text: positives[3].text, cloudHits: [], listing: DOWNLOADS_EN }).cue === true);

// ---- 2. silence: hard quiets, ambiguity, cloud first, no folder ---------------
console.log('\n--- silence wins ---\n');
const negatives = [
  { why: 'negation (en)', text: "Don't send the contract yet.", listing: DOWNLOADS_EN },
  { why: 'negation (he)', text: 'אל תשלח את החוזה עדיין.', listing: DOWNLOADS },
  { why: 'third party (en)', text: 'Can you ask accounting to send the receipt?', listing: DOWNLOADS },
  { why: 'third party (he)', text: 'תבקש מהנהלת חשבונות שתשלח את הקבלה.', listing: DOWNLOADS },
  { why: 'hedge', text: 'Maybe send the contract if you want.', listing: DOWNLOADS_EN },
  { why: 'fyi', text: 'FYI the contract is attached.', listing: DOWNLOADS_EN },
  { why: 'no ask at all', text: 'Thanks for the meeting today, great talking.', listing: DOWNLOADS_EN },
  { why: 'two files fit', text: 'Please send the contract.', listing: [{ path: 'Downloads/contract-v1.pdf', size: 10 }, { path: 'Downloads/contract-v2.pdf', size: 11 }] },
  { why: 'only a template', text: 'Please send the contract.', listing: [{ path: 'Downloads/contract-template.docx', size: 10 }] },
  { why: 'nothing named like it', text: 'Please send the contract.', listing: [{ path: 'Downloads/holiday.jpg', size: 10 }] },
  { why: 'a partial download', text: 'Please send the contract.', listing: [{ path: 'Downloads/contract.pdf.crdownload', size: 10 }] },
  { why: 'a hidden file', text: 'Please send the contract.', listing: [{ path: 'Downloads/.contract.pdf', size: 10 }] },
  { why: 'a path out of the folder', text: 'Please send the contract.', listing: [{ path: '../private/contract.pdf', size: 10 }] },
  { why: 'an absolute path', text: 'Please send the contract.', listing: [{ path: '/etc/contract.pdf', size: 10 }] },
  { why: 'an empty file', text: 'Please send the contract.', listing: [{ path: 'Downloads/contract.pdf', size: 0 }] },
  { why: 'too big for a simple upload', text: 'Please send the contract.', listing: [{ path: 'Downloads/contract.pdf', size: 5 * 1024 * 1024 }] },
  { why: 'the cloud already has it', text: 'Please send the contract.', listing: DOWNLOADS_EN, cloudHits: [{ id: 'drive-1', name: 'contract.pdf' }] },
  { why: 'the cloud was not searched', text: 'Please send the contract.', listing: DOWNLOADS_EN, cloudHits: null },
  { why: 'no folder granted', text: 'Please send the contract.', listing: null }
];
let wrongOffers = 0;
for (const n of negatives) {
  const out = L.plan({ flags: ON, text: n.text, cloudHits: n.cloudHits === undefined ? [] : n.cloudHits, listing: n.listing });
  if (out.action === 'offer') wrongOffers++;
  check('silent: ' + n.why, out.action === 'silence', out);
}
check('two files fit is reported as a conflict', L.plan({ flags: ON, text: 'Please send the contract.', cloudHits: [], listing: negatives[7].listing }).reason === 'conflict');
check('a cloud hit is reported as cloud-has-it', L.plan({ flags: ON, text: 'Please send the contract.', cloudHits: [{ id: 'x' }], listing: DOWNLOADS_EN }).reason === 'cloud-has-it');

console.log('\n--- where the person says the file is ---\n');
check('cue: in my Downloads', L.localCue('It is in my Downloads folder'));
check('cue: on my laptop', L.localCue('the signed copy is on my laptop'));
check('cue: בהורדות', L.localCue('הקובץ בהורדות'));
check('cue: אצלי במחשב', L.localCue('ההסכם אצלי במחשב'));
check('no cue: not on my computer', !L.localCue("It's not on my computer, check Drive"));
check('no cue: לא במחשב', !L.localCue('אין לי אותו במחשב'));
check('no cue: plain Drive', !L.localCue('It is in the shared Drive folder'));

// ---- 3. scope and switch ------------------------------------------------------
console.log('\n--- the switch and the scope ---\n');
check('the switch is named LOCAL_FILE_CLOSE and defaults off', L.SWITCH === 'LOCAL_FILE_CLOSE' && L.SWITCH_DEFAULT === false && L.enabled() === false && L.enabled({}) === false);
check('only the literal true turns it on', L.enabled({ LOCAL_FILE_CLOSE: 'true' }) === false && L.enabled({ LOCAL_FILE_CLOSE: 1 }) === false && L.enabled(ON) === true);
for (const p of positives) {
  const out = L.plan({ text: p.text, cloudHits: [], listing: p.listing });
  check('switch off: no offer for ' + p.text, out.action === 'off', out);
}
const noScope = L.plan({ flags: ON, text: positives[2].text, cloudHits: [], listing: DOWNLOADS_EN, scopes: 'Mail.ReadWrite Files.Read' });
check('a token without Files.ReadWrite says reconnect, not Handled', noScope.action === 'reconnect' && noScope.scope === 'Files.ReadWrite', noScope);

// ---- 4. the writer, with a mocked Graph and folder ----------------------------
function mockGraph(opts) {
  opts = opts || {};
  const calls = [];
  const items = {};
  let next = 1;
  async function graph(method, path, body, headers) {
    calls.push({ method, path, size: body && body.length, headers });
    if (method === 'PUT') {
      if (opts.putStatus) return { status: opts.putStatus, ok: false, json: {} };
      const id = opts.noId ? '' : 'ITEM' + (next++);
      const name = decodeURIComponent(path.split('/').slice(-1)[0].split(':')[0]);
      if (id) items[id] = { id, name, size: body.length, bytes: body, webUrl: 'https://onedrive.live.com/?id=' + id };
      return { status: 201, ok: true, json: id ? { id, name, size: body.length } : { name } };
    }
    const id = decodeURIComponent(path.split('/items/')[1] || '');
    if (method === 'GET') {
      if (opts.getStatus) return { status: opts.getStatus, ok: false, json: {} };
      const it = items[id];
      if (!it) return { status: 404, ok: false, json: {} };
      const hashes = opts.noHashes ? {} : { sha256Hash: hex('SHA-256', opts.tamper ? bytesOf('other') : it.bytes).toUpperCase(), sha1Hash: hex('SHA-1', it.bytes).toUpperCase() };
      return { status: 200, ok: true, json: { id: opts.otherId ? 'OTHER' : it.id, name: it.name, size: opts.sizeOff ? it.size + 1 : it.size, webUrl: it.webUrl, file: { mimeType: 'application/pdf', hashes } } };
    }
    if (method === 'DELETE') {
      if (opts.keepOnDelete) return { status: 204, ok: true, json: {} };
      delete items[id];
      return { status: 204, ok: true, json: {} };
    }
    return { status: 400, ok: false, json: {} };
  }
  return { graph, calls, items };
}
function folder(map, spy) {
  return { read: async (p) => { if (spy) spy.push(p); if (!(p in map)) throw new Error('missing'); return map[p]; } };
}
const FILE = { path: 'Downloads/הסכם-דנה-חתום.pdf', size: CONTRACT.length };
const DISK = { 'Downloads/הסכם-דנה-חתום.pdf': CONTRACT };

(async () => {
  console.log('\n--- Do It: save, read back, proof ---\n');
  const g = mockGraph();
  const res = await L.save({ flags: ON, file: FILE, now: NOW }, { source: folder(DISK), graph: g.graph, digest });
  check('saved and read back: ok with a proof', res.ok === true && Proof.allowsHandled(res), res);
  check('ProofOfClose is {system, externalId, fetchedBack, verifiedAt}', res.proof && res.proof.system === 'microsoft/onedrive' && res.proof.externalId === 'ITEM1' && res.proof.fetchedBack === true && res.proof.verifiedAt === NOW, res.proof);
  check('the hash was checked against OneDrive', res.hashChecked === true);
  check('the ask itself is not closed by the save', res.loopClosed === false);
  check('one PUT then one GET by that id', g.calls.length === 2 && g.calls[0].method === 'PUT' && g.calls[1].method === 'GET' && /\/items\/ITEM1$/.test(g.calls[1].path), g.calls);
  check('the upload never overwrites (rename on conflict) and lands in the Glance folder', /conflictBehavior=rename/.test(g.calls[0].path) && /root:\/Glance\//.test(g.calls[0].path), g.calls[0].path);
  check('the bytes uploaded are the bytes on disk', g.calls[0].size === CONTRACT.length);
  check('Undo knows the item is ours', res.ref && res.ref.itemId === 'ITEM1' && res.ref.createdByGlance === true);

  const noHash = await L.save({ flags: ON, file: FILE, now: NOW }, { source: folder(DISK), graph: mockGraph({ noHashes: true }).graph, digest });
  check('no hashes from OneDrive: id and size still prove it, hashChecked false', noHash.ok === true && noHash.hashChecked === false, noHash);

  console.log('\n--- a missing or wrong read-back is not Handled ---\n');
  const cases = [
    ['hash differs', { tamper: true }, 'verify_failed'],
    ['size differs', { sizeOff: true }, 'verify_failed'],
    ['another id comes back', { otherId: true }, 'verify_failed'],
    ['the GET fails', { getStatus: 500 }, 'verify_failed'],
    ['the upload has no id', { noId: true }, 'proof_pending'],
    ['the token is refused', { putStatus: 403 }, 'not-connected'],
    ['the upload fails', { putStatus: 500 }, 'upload-failed']
  ];
  for (const [why, opts, reason] of cases) {
    const r = await L.save({ flags: ON, file: FILE, now: NOW }, { source: folder(DISK), graph: mockGraph(opts).graph, digest });
    check(why + ' → ' + reason + ', not Handled', r.ok === false && r.reason === reason && !Proof.allowsHandled(r), r);
  }
  const orphan = await L.save({ flags: ON, file: FILE, now: NOW }, { source: folder(DISK), graph: mockGraph({ tamper: true }).graph, digest });
  check('a failed read-back keeps the ref so the orphan can be undone', orphan.ref && orphan.ref.itemId === 'ITEM1');

  const changed = await L.save({ flags: ON, file: { path: FILE.path, size: FILE.size + 3 }, now: NOW }, { source: folder(DISK), graph: mockGraph().graph, digest });
  check('a file that changed since the plan is not uploaded', changed.ok === false && changed.reason === 'local-changed');
  const gone = await L.save({ flags: ON, file: { path: 'Downloads/missing.pdf', size: 10 }, now: NOW }, { source: folder(DISK), graph: mockGraph().graph, digest });
  check('a file that is gone is local-unreadable', gone.ok === false && gone.reason === 'local-unreadable');

  console.log('\n--- switch off: nothing is read, nothing is written ---\n');
  const spy = [];
  const off = mockGraph();
  const r0 = await L.save({ file: FILE, now: NOW }, { source: folder(DISK, spy), graph: off.graph, digest });
  check('switch off: no read and no Graph call', r0.ok === false && r0.reason === 'switch-off' && spy.length === 0 && off.calls.length === 0, { r0, spy, calls: off.calls });

  console.log('\n--- Undo ---\n');
  const u = mockGraph();
  const saved = await L.save({ flags: ON, file: FILE, now: NOW }, { source: folder(DISK), graph: u.graph, digest });
  const undone = await L.undo(saved.ref, { graph: u.graph });
  check('Undo deletes the item and reads it back as gone', undone.ok === true && undone.undone === true && !u.items.ITEM1 && u.calls.slice(-2).map((c) => c.method).join(',') === 'DELETE,GET', { undone, calls: u.calls });
  const stuck = mockGraph({ keepOnDelete: true });
  const s2 = await L.save({ flags: ON, file: FILE, now: NOW }, { source: folder(DISK), graph: stuck.graph, digest });
  const u2 = await L.undo(s2.ref, { graph: stuck.graph });
  check('an item still there after delete is undo-unverified', u2.ok === false && u2.reason === 'undo-unverified', u2);
  const notOurs = await L.undo({ itemId: 'X', createdByGlance: false }, { graph: u.graph });
  check('Undo refuses an item Glance did not create', notOurs.ok === false && notOurs.reason === 'not-ours');

  console.log('\nprecision: offers ' + offered + '/' + positives.length + ' positives, wrong offers ' + wrongOffers + '/' + negatives.length + ' negatives');
  check('precision gate: zero wrong offers on the negative set', wrongOffers === 0);
  check('recall on the positive set is 100%', offered === positives.length);
  console.log(failures ? '\n' + failures + ' FAILED' : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})();
