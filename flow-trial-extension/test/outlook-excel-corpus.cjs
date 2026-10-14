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
    if (req.method === 'GET' && /\/rows$/.test(req.path)) {
      return { ok: true, status: 200, body: { value: state.rows.map((values, index) => ({ index: index, values: [values] })) } };
    }
    if (req.method === 'POST' && /closeSession/.test(req.path)) return { ok: true, status: 204, body: null };
    return { ok: false, status: 404, body: {} };
  });
  const added = await X.run({ params: { fileName: 'pay.xlsx', mode: 'append', values: ['12', 'Dana', 'paid'] }, messageId: 'm-x' }, deps(append.call));
  check('append is Handled when the row is read back', added.ok === true && added.proof.externalId === 'wb-1/t1/1' && added.ref.createdFile === false, added);
  check('the session is closed', append.calls.some((c) => c.path.indexOf('closeSession') > 0));

  const mismatch = fake((req) => {
    if (req.method === 'GET' && /root:/.test(req.path)) return { ok: true, status: 200, body: { id: 'wb-1' } };
    if (req.method === 'POST' && /createSession/.test(req.path)) return { ok: true, status: 201, body: { id: 'sess' } };
    if (req.method === 'GET' && /\/tables$/.test(req.path)) return { ok: true, status: 200, body: { value: [{ id: 't1' }] } };
    if (req.method === 'POST' && /rows\/add/.test(req.path)) return { ok: true, status: 201, body: { index: 1 } };
    if (req.method === 'GET' && /\/rows$/.test(req.path)) return { ok: true, status: 200, body: { value: [{ index: 1, values: [['nope']] }] } };
    if (req.method === 'POST' && /closeSession/.test(req.path)) return { ok: true, status: 204, body: null };
    return { ok: false, status: 404, body: {} };
  });
  const bad = await X.run({ params: { fileName: 'pay.xlsx', mode: 'append', values: ['12', 'Dana'] } }, deps(mismatch.call));
  check('a mismatched row is not Handled', bad.reason === 'verify_failed' && !bad.proof && mismatch.calls.some((c) => c.path.indexOf('closeSession') > 0), bad);

  const table = fake((req) => {
    if (req.method === 'GET' && /root:/.test(req.path)) return { ok: false, status: 404, body: {} };
    if (req.method === 'PUT') return { ok: true, status: 201, body: { id: 'wb-new' } };
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

  const removed = fake((req) => (req.method === 'DELETE' ? { ok: true, status: 204, body: null } : { ok: false, status: 404, body: {} }));
  const gone = await X.undo(made.ref, deps(removed.call));
  check('undo of a new workbook deletes the file', gone.ok === true && removed.calls[0].method === 'DELETE' && /workbook was deleted/.test(gone.written), gone);

  const rowUndo = fake((req) => {
    if (/createSession|closeSession|\/delete/.test(req.path)) return { ok: true, status: 204, body: req.path.indexOf('createSession') >= 0 ? { id: 'sess' } : null };
    if (/createSession/.test(req.path)) return { ok: true, status: 201, body: { id: 'sess' } };
    return { ok: false, status: 404, body: {} };
  });
  const dropped = await X.undo({ itemId: 'wb-1', tableId: 't1', rowIndex: 1, createdFile: false, createdTable: false }, deps(rowUndo.call));
  check('undo of a row deletes that row', dropped.ok === true && rowUndo.calls.some((c) => c.path.indexOf('itemAt(index=1)/delete') > 0), rowUndo.calls.map((c) => c.path));

  const denied = fake(() => ({ ok: true, status: 200, body: {} }));
  const no = await X.run({ params: { fileName: 'pay.xlsx', mode: 'append', values: ['1'] } }, deps(denied.call, ['Files.Read']));
  check('without Files.ReadWrite nothing is called', no.reason === 'files-not-granted' && denied.calls.length === 0);

  if (failures) process.exit(1);
  console.log('outlook-excel-corpus: all passed');
})().catch((err) => { console.error(err); process.exit(1); });
