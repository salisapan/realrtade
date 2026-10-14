// Excel: append one row or create one table, then read it back. A missing
// workbook is not invented for an append. A mismatched row is not Handled.
// Run: node test/outlook-excel-corpus.cjs
'use strict';
const { FlowProofOfClose } = require('../core/proof-of-close.js');
globalThis.FlowProofOfClose = FlowProofOfClose;
const { FlowOutlookExcel: X } = require('../core/outlook-excel.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

function fake(handler) {
  const calls = [];
  const call = async (req) => {
    calls.push(req);
    return handler(req, calls);
  };
  return { calls, call };
}

const NOW = '2026-10-14T12:00:00.000Z';
const deps = (call, scopes) => ({ call: call, grantedScopes: scopes || ['Files.ReadWrite'], now: () => NOW });

(async () => {
  ['I\'ll send Dana the numbers by Thursday.', 'Please save the attachment to OneDrive.', 'Please open budget.xlsx.', ''].forEach((text) => {
    check('stays quiet: ' + JSON.stringify(text).slice(0, 42), X.offer({ text: text }).show === false);
  });
  const tableOffer = X.offer({ text: 'Please create a table in budget.xlsx with columns Name, Amount.' });
  check('table offer keeps the columns', tableOffer.show === true && tableOffer.params.mode === 'table' && tableOffer.params.columns.join(',') === 'Name,Amount', tableOffer);
  const nine = X.cellsOf(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']);
  const long = 'x'.repeat(250);
  check('columns cap at 8 and cells at 200', nine.length === 8 && X.cellsOf([long])[0].length === 200);
  const bytes = X.xlsxBytes();
  const xml = new TextDecoder().decode(bytes);
  check('xlsx is a stored zip with Sheet1', bytes[0] === 0x50 && bytes[1] === 0x4b && xml.indexOf('Sheet1') >= 0);

  const appendMiss = fake((req) => ({ ok: false, status: 404, body: {} }));
  const missing = await X.run({ params: { fileName: 'pay.xlsx', mode: 'append', values: ['12', 'Dana'] } }, deps(appendMiss.call));
  check('append without a file does not invent a workbook', missing.reason === 'unclear' && appendMiss.calls.length === 1 && appendMiss.calls[0].method === 'GET', appendMiss.calls);

  const state = { rows: [['Name', 'Amount']] };
  const append = fake((req) => {
    if (req.method === 'GET' && /root:/.test(req.path)) return { ok: true, status: 200, body: { id: 'wb-1', name: 'pay.xlsx' } };
    if (req.method === 'POST' && /createSession/.test(req.path)) return { ok: true, status: 201, body: { id: 'sess' } };
    if (req.method === 'GET' && /\/tables$/.test(req.path)) return { ok: true, status: 200, body: { value: [{ id: 't1', name: 'Table1' }] } };
    if (req.method === 'POST' && /rows\/add/.test(req.path)) {
      state.rows.push(req.body.values[0]);
      return { ok: true, status: 201, body: { index: state.rows.length - 1 } };
    }
    if (req.method === 'GET' && /itemAt\(index=1\)$/.test(req.path)) {
      return { ok: true, status: 200, body: { index: 1, values: [['not', 'the', 'cells']] } };
    }
    if (req.method === 'GET' && /\/rows$/.test(req.path)) {
      return { ok: true, status: 200, body: { value: state.rows.map((values, index) => ({ index: index, values: [values] })) } };
    }
    if (req.method === 'POST' && /closeSession/.test(req.path)) return { ok: true, status: 204, body: null };
    return { ok: false, status: 404, body: {} };
  });
  const added = await X.run({ params: { fileName: 'pay.xlsx', mode: 'append', values: ['12', 'Dana', 'paid'] }, messageId: 'm-x' }, deps(append.call));
  check('append is Handled when the returned index is read back at that address', added.ok === true && added.proof.externalId === 'wb-1/t1/1' && added.ref.createdFile === false && append.calls.some((c) => /itemAt\(index=1\)$/.test(c.path)) && !append.calls.some((c) => /\/rows$/.test(c.path)), added);
  check('the session is closed', append.calls.some((c) => c.path.indexOf('closeSession') > 0));

  const mismatch = fake((req) => {
    if (req.method === 'GET' && /root:/.test(req.path)) return { ok: true, status: 200, body: { id: 'wb-1' } };
    if (req.method === 'POST' && /createSession/.test(req.path)) return { ok: true, status: 201, body: { id: 'sess' } };
    if (req.method === 'GET' && /\/tables$/.test(req.path)) return { ok: true, status: 200, body: { value: [{ id: 't1' }] } };
    if (req.method === 'POST' && /rows\/add/.test(req.path)) return { ok: true, status: 201, body: { index: 1 } };
    if (req.method === 'GET' && /\/rows$/.test(req.path)) return { ok: true, status: 200, body: { value: [{ index: 4, values: [['12', 'Dana']] }] } };
    if (req.method === 'GET' && /itemAt\(index=1\)$/.test(req.path)) return { ok: true, status: 200, body: { index: 4, values: [['12', 'Dana']] } };
    if (req.method === 'POST' && /closeSession/.test(req.path)) return { ok: true, status: 204, body: null };
    return { ok: false, status: 404, body: {} };
  });
  const bad = await X.run({ params: { fileName: 'pay.xlsx', mode: 'append', values: ['12', 'Dana'] } }, deps(mismatch.call));
  check('a content match at another index is not Handled', bad.reason === 'verify_failed' && !bad.proof && mismatch.calls.some((c) => /itemAt\(index=1\)$/.test(c.path)) && mismatch.calls.some((c) => c.path.indexOf('closeSession') > 0), bad);

  const table = fake((req) => {
    if (req.method === 'GET' && /root:/.test(req.path)) return { ok: false, status: 404, body: {} };
    if (req.method === 'PUT') return { ok: true, status: 201, body: { id: 'wb-new' } };
    if (req.method === 'GET' && /\/items\/wb-new$/.test(req.path)) return { ok: true, status: 200, body: { id: 'wb-new', eTag: 'wb-e', lastModifiedDateTime: '2026-10-14T12:00:00Z' } };
    if (req.method === 'POST' && /createSession/.test(req.path)) return { ok: true, status: 201, body: { id: 'sess' } };
    if (req.method === 'PATCH') return { ok: true, status: 200, body: req.body };
    if (req.method === 'POST' && /tables\/add/.test(req.path)) return { ok: true, status: 201, body: { id: 't-new', name: 'Table1' } };
    if (req.method === 'GET' && /\/rows$/.test(req.path)) return { ok: true, status: 200, body: { value: [{ index: 0, values: [['Name', 'Amount']] }] } };
    if (req.method === 'POST' && /closeSession/.test(req.path)) return { ok: true, status: 204, body: null };
    return { ok: false, status: 404, body: {} };
  });
  const made = await X.run({ params: tableOffer.params, messageId: 'm-t' }, deps(table.call));
  check('a new table is Handled after its row is read back', made.ok === true && made.ref.createdFile === true && made.ref.createdTable === true && made.proof.system === 'microsoft/excel', made);
  check('the new workbook is a zip upload', table.calls.some((c) => c.method === 'PUT' && c.raw && c.raw[0] === 0x50));

  const removed = fake((req) => {
    if (req.method === 'GET' && /\/items\/wb-new$/.test(req.path)) return { ok: true, status: 200, body: { id: 'wb-new', eTag: 'wb-e', lastModifiedDateTime: '2026-10-14T12:00:00Z' } };
    if (req.method === 'DELETE') return { ok: true, status: 204, body: null };
    return { ok: false, status: 404, body: {} };
  });
  const gone = await X.undo(made.ref, deps(removed.call));
  check('undo of a new workbook deletes the file only when both stamps match', made.ref.eTag === 'wb-e' && gone.ok === true && removed.calls[0].method === 'GET' && removed.calls[1].method === 'DELETE' && /workbook was deleted/.test(gone.written), gone);
  const noEtag = fake((req) => (req.method === 'DELETE' ? { ok: true, status: 204, body: null } : { ok: true, status: 200, body: { id: 'wb-new', eTag: 'wb-e', lastModifiedDateTime: '2026-10-14T12:00:00Z' } }));
  const refusedEtag = await X.undo(Object.assign({}, made.ref, { eTag: '' }), deps(noEtag.call));
  check('a created workbook with no eTag is not deleted', refusedEtag.reason === 'file-changed' && noEtag.calls.length === 0, refusedEtag);
  const noDate = fake((req) => (req.method === 'DELETE' ? { ok: true, status: 204, body: null } : { ok: true, status: 200, body: {} }));
  const refusedDate = await X.undo(Object.assign({}, made.ref, { lastModifiedDateTime: '' }), deps(noDate.call));
  check('a created workbook with no lastModified is not deleted', refusedDate.reason === 'file-changed' && noDate.calls.length === 0, refusedDate);
  const changedBook = fake((req) => {
    if (req.method === 'GET') return { ok: true, status: 200, body: { id: 'wb-new', eTag: 'wb-other', lastModifiedDateTime: '2026-10-14T12:00:00Z' } };
    if (req.method === 'DELETE') return { ok: true, status: 204, body: null };
    return { ok: false, status: 404, body: {} };
  });
  const refusedBook = await X.undo(made.ref, deps(changedBook.call));
  check('a created workbook whose stamp changed is not deleted', refusedBook.reason === 'file-changed' && changedBook.calls.every((c) => c.method !== 'DELETE'), refusedBook);
  const liveBareBook = fake((req) => {
    if (req.method === 'GET') return { ok: true, status: 200, body: { id: 'wb-new' } };
    if (req.method === 'DELETE') return { ok: true, status: 204, body: null };
    return { ok: false, status: 404, body: {} };
  });
  const refusedLiveBook = await X.undo(made.ref, deps(liveBareBook.call));
  check('a live workbook with no stamp is not deleted', refusedLiveBook.reason === 'file-changed' && liveBareBook.calls.every((c) => c.method !== 'DELETE'), refusedLiveBook);

  const rowUndo = fake((req) => {
    if (req.method === 'POST' && /createSession/.test(req.path)) return { ok: true, status: 201, body: { id: 'sess' } };
    if (req.method === 'GET' && /itemAt\(index=1\)$/.test(req.path)) return { ok: true, status: 200, body: { index: 1, values: [['12', 'Dana', 'paid']] } };
    if (req.method === 'POST' && /itemAt\(index=1\)\/delete/.test(req.path)) return { ok: true, status: 204, body: null };
    if (req.method === 'POST' && /closeSession/.test(req.path)) return { ok: true, status: 204, body: null };
    if (req.method === 'DELETE') return { ok: true, status: 204, body: null };
    return { ok: false, status: 404, body: {} };
  });
  const dropped = await X.undo(added.ref, deps(rowUndo.call));
  const rowGets = rowUndo.calls.filter((c) => c.method === 'GET' && /itemAt\(index=1\)$/.test(c.path));
  const rowDeletes = rowUndo.calls.filter((c) => /itemAt\(index=1\)\/delete/.test(c.path));
  check('undo of an append deletes only the row that was read back', dropped.ok === true && added.ref.createdFile === false && rowGets.length === 1 && rowDeletes.length === 1 && rowUndo.calls.every((c) => c.method !== 'DELETE'), rowUndo.calls.map((c) => c.method + ' ' + c.path));

  const changedRow = fake((req) => {
    if (req.method === 'POST' && /createSession/.test(req.path)) return { ok: true, status: 201, body: { id: 'sess' } };
    if (req.method === 'GET' && /itemAt\(index=1\)$/.test(req.path)) return { ok: true, status: 200, body: { index: 1, values: [['other']] } };
    if (req.method === 'POST' && /closeSession/.test(req.path)) return { ok: true, status: 204, body: null };
    if (req.method === 'POST' && /\/delete/.test(req.path)) return { ok: true, status: 204, body: null };
    if (req.method === 'DELETE') return { ok: true, status: 204, body: null };
    return { ok: false, status: 404, body: {} };
  });
  const left = await X.undo(added.ref, deps(changedRow.call));
  check('undo of an append refuses a different row and does not delete the workbook', left.ok === false && left.reason === 'row-changed' && changedRow.calls.every((c) => c.method !== 'DELETE' && c.path.indexOf('/delete') < 0), changedRow.calls.map((c) => c.method + ' ' + c.path));

  const denied = fake(() => ({ ok: true, status: 200, body: {} }));
  const no = await X.run({ params: { fileName: 'pay.xlsx', mode: 'append', values: ['1'] } }, deps(denied.call, ['Files.Read']));
  check('without Files.ReadWrite nothing is called', no.reason === 'files-not-granted' && denied.calls.length === 0);

  if (failures) process.exit(1);
  console.log('outlook-excel-corpus: all passed');
})().catch((err) => { console.error(err); process.exit(1); });
