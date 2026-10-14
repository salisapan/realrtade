// Word: create or edit one .docx, read the item back, undo by delete or restore.
// Run: node test/outlook-word-corpus.cjs
'use strict';
const { FlowProofOfClose } = require('../core/proof-of-close.js');
globalThis.FlowProofOfClose = FlowProofOfClose;
const { FlowOutlookWord: W } = require('../core/outlook-word.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

function fake(routes) {
  const calls = [];
  const call = async (req) => {
    calls.push(req);
    const method = String((req && req.method) || 'GET').toUpperCase();
    for (const route of routes) {
      if (route.method === method && route.test.test(req.path)) return route.reply(req);
    }
    return { ok: false, status: 404, body: null };
  };
  return { calls, call };
}

const NOW = '2026-10-14T12:00:00.000Z';
const depsOf = (call) => ({ call: call, grantedScopes: ['Files.ReadWrite'], now: () => NOW });

(async () => {
  const quiet = ['I\'ll send Dana the numbers by Thursday.', 'Please save the attachment to OneDrive.', 'Please create a Word document.', ''];
  quiet.forEach((text) => check('stays quiet: ' + JSON.stringify(text).slice(0, 40), W.offer({ text: text }).show === false));

  const offer = W.offer({ text: 'Please create a Word document called notes.docx with the pricing summary.' });
  check('offer names the file and the text', offer.show === true && offer.params.fileName === 'notes.docx' && offer.params.content === 'the pricing summary.', offer);
  check('unsafe names are refused', W.safeDocx('../notes.docx') === '' && W.safeDocx('a/b.docx') === '' && W.safeDocx('') === '');
  check('Files.ReadWrite.All is not this scope', W.hasWriteScope(['Files.ReadWrite.All']) === false && W.hasWriteScope(['Files.ReadWrite']) === true);

  const bytes = W.docxBytes('a < b & c');
  check('docx is a stored zip', bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04);
  const xml = new TextDecoder().decode(bytes);
  check('document text is escaped inside the zip', xml.indexOf('a &lt; b &amp; c') >= 0 && xml.indexOf('word/document.xml') >= 0);

  const created = fake([
    { method: 'GET', test: /\/me\/drive\/root:\//, reply: () => ({ ok: false, status: 404, body: {} }) },
    { method: 'PUT', test: /\/content$/, reply: () => ({ ok: true, status: 201, body: { id: 'file-1', name: 'notes.docx' } }) },
    { method: 'GET', test: /\/me\/drive\/items\/file-1$/, reply: () => ({ ok: true, status: 200, body: { id: 'file-1', name: 'notes.docx' } }) }
  ]);
  const made = await W.run({ params: offer.params, messageId: 'm1' }, depsOf(created.call));
  check('create is Handled only after the item is read back', made.ok === true && made.proof && made.proof.fetchedBack === true && made.proof.system === 'microsoft/word' && made.proof.externalId === 'file-1' && made.ref.created === true, made);
  check('create does not send', created.calls.every((c) => c.path.indexOf('sendMail') < 0) && created.calls.some((c) => c.method === 'PUT' && c.raw && c.raw[0] === 0x50));
  const removed = fake([
    { method: 'DELETE', test: /\/me\/drive\/items\/file-1$/, reply: () => ({ ok: true, status: 204, body: null }) }
  ]);
  const undone = await W.undo(made.ref, depsOf(removed.call));
  check('undo of a new file deletes it', undone.ok === true && removed.calls[0].method === 'DELETE' && /deleted/.test(undone.written), undone);

  const edited = fake([
    { method: 'GET', test: /\/me\/drive\/root:\//, reply: () => ({ ok: true, status: 200, body: { id: 'file-9', name: 'notes.docx' } }) },
    { method: 'GET', test: /\/versions/, reply: () => ({ ok: true, status: 200, body: { value: [{ id: 'ver-prev' }] } }) },
    { method: 'PUT', test: /\/items\/file-9\/content$/, reply: () => ({ ok: true, status: 200, body: { id: 'file-9' } }) },
    { method: 'GET', test: /\/me\/drive\/items\/file-9$/, reply: () => ({ ok: true, status: 200, body: { id: 'file-9' } }) }
  ]);
  const updated = await W.run({ fileName: 'notes.docx', content: 'revised' }, depsOf(edited.call));
  check('edit keeps the previous version', updated.ok === true && updated.ref.created === false && updated.ref.previousVersionId === 'ver-prev', updated);
  const restored = fake([
    { method: 'POST', test: /\/restoreVersion$/, reply: () => ({ ok: true, status: 204, body: null }) }
  ]);
  const back = await W.undo(updated.ref, depsOf(restored.call));
  check('undo restores that version', back.ok === true && restored.calls[0].path.indexOf('/versions/ver-prev/restoreVersion') > 0, back);

  const bare = fake([
    { method: 'GET', test: /\/me\/drive\/root:\//, reply: () => ({ ok: true, status: 200, body: { id: 'file-2' } }) },
    { method: 'GET', test: /\/versions/, reply: () => ({ ok: true, status: 200, body: { value: [] } }) }
  ]);
  const held = await W.run({ fileName: 'notes.docx', content: 'x' }, depsOf(bare.call));
  check('a missing version does not overwrite', held.reason === 'unclear' && bare.calls.every((c) => c.method !== 'PUT'), held);

  const miss = fake([
    { method: 'GET', test: /\/root:\//, reply: () => ({ ok: false, status: 404, body: {} }) },
    { method: 'PUT', test: /\/content$/, reply: () => ({ ok: true, status: 201, body: { id: 'file-3' } }) },
    { method: 'GET', test: /\/items\/file-3$/, reply: () => ({ ok: true, status: 200, body: { id: 'other' } }) }
  ]);
  const unverified = await W.run({ fileName: 'notes.docx', content: 'x' }, depsOf(miss.call));
  check('a mismatched read-back is not Handled', unverified.reason === 'verify_failed' && !unverified.proof, unverified);

  const denied = fake([]);
  const noScope = await W.run({ fileName: 'notes.docx', content: 'x' }, { call: denied.call, grantedScopes: ['Files.Read'], now: () => NOW });
  check('without Files.ReadWrite nothing is uploaded', noScope.reason === 'files-not-granted' && denied.calls.length === 0);

  const row = W.receiptFromLog([
    { kind: 'written', connectorId: 'outlookWord', fetchedBack: true, externalId: 'file-1', messageId: 'm1', ref: { itemId: 'file-1', created: true } },
    { kind: 'undone', connectorId: 'outlookWord', messageId: 'm1' }
  ], { itemId: 'm1' });
  check('a later undo hides the receipt', row === null);

  if (failures) process.exit(1);
  console.log('outlook-word-corpus: all passed');
})().catch((err) => { console.error(err); process.exit(1); });
