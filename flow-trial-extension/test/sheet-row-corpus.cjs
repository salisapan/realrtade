// Add one row to the tracker they named (close map D4), behind SHEET_ROW (off).
// One explicit ask (verb, named sheet, exactly one amount), exactly one fitting
// Google Sheet, a header with an amount column: append one row and read that range
// back. Undo deletes the row only while it still holds what Glance wrote.
// Sheets and Drive are mocked. Nothing is sent.
// Run: node test/sheet-row-corpus.cjs
'use strict';
const { FlowSheetRow: S } = require('../core/sheet-row.js');
const { FlowProofOfClose: Proof } = require('../core/proof-of-close.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const ON = { SHEET_ROW: true };
const NOW = '2026-10-13T12:00:00.000Z';
const TODAY = '2026-10-13';
const SHEET = 'application/vnd.google-apps.spreadsheet';
const f = (id, name, mimeType) => ({ id, name, mimeType: mimeType || SHEET });
const DRIVE = [
  f('S1', 'Payments 2026'),
  f('S2', 'תשלומים - 2026'),
  f('S3', 'Expenses tracker'),
  f('S4', 'Travel'),
  f('S5', 'הכנסות'),
  f('S6', 'Payments template'),
  f('D1', 'Payments notes', 'application/vnd.google-apps.document')
];

// ---- 1. recognition and the plan ---------------------------------------------
console.log('\n--- one explicit ask, one sheet that fits ---\n');
const positives = [
  { text: 'Please log the ₪3,850 in the payments sheet.', sheet: 'S1', value: 3850, lang: 'en' },
  { text: 'Can you add $1,200 from Acme to our expenses tracker?', sheet: 'S3', value: 1200, lang: 'en', label: 'Acme' },
  { text: 'Record 500 EUR for the Berlin hotel in the travel spreadsheet.', sheet: 'S4', value: 500, lang: 'en', label: 'Berlin hotel' },
  { text: 'תרשום בבקשה 3,850 ש"ח בגיליון התשלומים.', sheet: 'S2', value: 3850, lang: 'he' },
  { text: 'תוסיפי 1,200 ₪ עבור ייעוץ לטבלת ההכנסות', sheet: 'S5', value: 1200, lang: 'he', label: 'ייעוץ' },
  { text: 'תוסיף 900 ₪ מ-דנה לטבלת ההכנסות', sheet: 'S5', value: 900, lang: 'he', label: 'דנה' }
];
let offered = 0;
for (const p of positives) {
  const out = S.plan({ flags: ON, text: p.text, files: DRIVE });
  const ok = out.action === 'offer' && out.sheet.id === p.sheet && out.ask.amount.value === p.value && out.ask.lang === p.lang && (p.label === undefined || out.ask.label === p.label);
  if (ok) offered++;
  check('offers the one sheet: ' + p.text, ok, out);
}
const he = S.plan({ flags: ON, text: positives[3].text, files: DRIVE });
check('the Hebrew line names the amount and the sheet', he.line === 'לרשום 3,850 ש"ח בתשלומים - 2026?', he.line);
check('the plan reads the header, then appends with a proof', he.steps.length === 2 && he.steps[1].proof === 'google/sheets');
check('the Drive query asks spreadsheets only, quotes escaped', S.driveQuery("Dana's") === "trashed = false and mimeType = 'application/vnd.google-apps.spreadsheet' and name contains 'Dana\\'s'");
check('a Hebrew label never comes from a מ inside a word', S.recognize('תרשום 500 ₪ מחר בגיליון ההוצאות').label === '' && S.recognize(positives[3].text).label === '');

// ---- 2. silence ---------------------------------------------------------------
console.log('\n--- silence wins ---\n');
const negatives = [
  { why: 'negation (en)', text: "Don't log the ₪3,850 in the payments sheet yet." },
  { why: 'negation (he)', text: 'אל תרשום את ה-3,850 ש"ח בגיליון התשלומים' },
  { why: 'already done (en)', text: 'I already logged the ₪3,850 in the payments sheet.' },
  { why: 'already done (he)', text: 'רשמתי 3,850 ש"ח בגיליון התשלומים' },
  { why: 'a status question', text: 'Did you log the ₪3,850 in the payments sheet?' },
  { why: 'a status question (he)', text: 'האם רשמת 3,850 ש"ח בגיליון התשלומים?' },
  { why: 'third party (en)', text: 'Ask Dana to log the ₪3,850 in the payments sheet.' },
  { why: 'third party (he)', text: 'תבקש מדנה לרשום 3,850 ש"ח בגיליון התשלומים' },
  { why: 'hedge', text: 'Maybe add $200 to the expenses tracker.' },
  { why: 'two amounts', text: 'Add $1,200 and $300 to the expenses tracker.' },
  { why: 'no amount', text: 'Please log it in the payments sheet.' },
  { why: 'a bare number is not money', text: 'Please add 3850 to the payments sheet.' },
  { why: 'no sheet name', text: 'Please add ₪500 to the sheet.' },
  { why: 'a sheet mentioned, nothing asked', text: 'The payments sheet shows ₪3,850 for September.' },
  { why: 'no sheet fits the name', text: 'Please log the ₪3,850 in the donations sheet.' },
  { why: 'two sheets fit', text: 'Please log the ₪3,850 in the payments sheet.', files: [f('A', 'Payments 2025'), f('B', 'Payments 2026')] },
  { why: 'only a template fits', text: 'Please log the ₪3,850 in the payments sheet.', files: [f('T', 'Payments template')] },
  { why: 'only a Doc fits', text: 'Please log the ₪3,850 in the payments sheet.', files: [f('D', 'Payments', 'application/vnd.google-apps.document')] },
  { why: 'Drive was not searched', text: 'Please log the ₪3,850 in the payments sheet.', files: null }
];
let wrongOffers = 0;
for (const n of negatives) {
  const out = S.plan({ flags: ON, text: n.text, files: n.files === undefined ? DRIVE : n.files });
  if (out.action === 'offer') wrongOffers++;
  check('silent: ' + n.why, out.action === 'silence', out);
}

console.log('\n--- the switch ---\n');
check('the switch is SHEET_ROW and defaults off', S.SWITCH === 'SHEET_ROW' && S.SWITCH_DEFAULT === false && S.enabled() === false && S.enabled({ SHEET_ROW: 1 }) === false);
for (const p of positives) {
  check('switch off: no offer for ' + p.text, S.plan({ text: p.text, files: DRIVE }).action === 'off');
}

console.log('\n--- the row follows the sheet\'s own headers ---\n');
const ask = S.recognize(positives[1].text);
check('amount, date, label and currency land in their columns', JSON.stringify(S.rowFor(['Date', 'Client', 'Amount', 'Currency', 'Status'], ask, TODAY)) === JSON.stringify([TODAY, 'Acme', '1200', 'USD']));
check('Hebrew headers', JSON.stringify(S.rowFor(['תאריך', 'סכום', 'הערות'], S.recognize(positives[4].text), TODAY)) === JSON.stringify([TODAY, '1200', 'ייעוץ']));
check('no amount column: no row, Glance never adds a column', S.rowFor(['Date', 'Client', 'Status'], ask, TODAY) === null);
check('an empty sheet has no header: no row', S.rowFor([], ask, TODAY) === null);

// ---- 3. the writer with a mocked Sheets API ----------------------------------
function mockSheets(opts) {
  opts = opts || {};
  const calls = [];
  const header = opts.header || ['Date', 'Client', 'Amount'];
  let rows = [header].concat(opts.rows || [[ '2026-10-01', 'Old', '100' ]]);
  async function sheets(method, path, body) {
    calls.push({ method, path, body });
    if (method === 'GET' && /\?fields=sheets\.properties/.test(path)) {
      if (opts.metaStatus) return { status: opts.metaStatus, ok: false, json: null };
      return { status: 200, ok: true, json: { sheets: [{ properties: { sheetId: 77, title: "Q4 'live'", index: 0 } }, { properties: { sheetId: 78, title: 'Old', index: 1 } }] } };
    }
    if (method === 'GET' && /\/values\/[^:]*1%3A1$/.test(path)) return { status: 200, ok: true, json: { values: [header] } };
    if (method === 'POST' && /:append\?/.test(path)) {
      if (opts.appendStatus) return { status: opts.appendStatus, ok: false, json: {} };
      rows.push(body.values[0]);
      const n = rows.length;
      return { status: 200, ok: true, json: { updates: opts.noRange ? {} : { updatedRange: "'Q4 ''live'''!A" + n + ':C' + n } } };
    }
    if (method === 'GET' && /\/values\//.test(path)) {
      const range = decodeURIComponent(path.split('/values/')[1]);
      const n = Number((range.match(/!A(\d+)/) || [])[1]);
      if (opts.getStatus) return { status: opts.getStatus, ok: false, json: null };
      let row = rows[n - 1];
      if (opts.tamper && row) row = row.slice(0, -1).concat(['999']);
      return { status: 200, ok: true, json: row ? { range, values: [row] } : { range } };
    }
    if (method === 'POST' && /:batchUpdate$/.test(path)) {
      const d = body.requests[0].deleteDimension.range;
      if (!opts.keepOnDelete) rows.splice(d.startIndex, d.endIndex - d.startIndex);
      return { status: 200, ok: true, json: {} };
    }
    return { status: 400, ok: false, json: null };
  }
  return { sheets, calls, rows: () => rows };
}
const SHEET1 = { id: 'S3', name: 'Expenses tracker' };

(async () => {
  console.log('\n--- Do It: append, read back ---\n');
  const m = mockSheets();
  const res = await S.append({ flags: ON, sheet: SHEET1, ask, today: TODAY, now: NOW }, { sheets: m.sheets });
  check('appended and read back: ok with a proof', res.ok === true && Proof.allowsHandled(res), res);
  check('ProofOfClose is google/sheets with the sheet and the range', res.proof && res.proof.system === 'google/sheets' && res.proof.externalId === "S3!'Q4 ''live'''!A3:C3" && res.proof.fetchedBack === true && res.proof.verifiedAt === NOW, res.proof);
  check('the row in the sheet is the close', res.loopClosed === true);
  check('the appended row is the one under the headers', JSON.stringify(m.rows()[2]) === JSON.stringify([TODAY, 'Acme', '1200']), m.rows());
  check('a quote in the tab title is escaped', m.calls[1].path.indexOf(encodeURIComponent("'Q4 ''live'''!1:1")) !== -1, m.calls[1].path);
  check('the first tab by index is the target', res.ref.tabId === 77);
  check('order: tabs, header, append, read back', m.calls.map((c) => c.method).join(',') === 'GET,GET,POST,GET');
  check('append inserts rows, never overwrites', /insertDataOption=INSERT_ROWS/.test(m.calls[2].path));

  console.log('\n--- a missing or wrong read-back is not Handled ---\n');
  const cases = [
    ['the token is refused', { metaStatus: 403 }, 'not-connected'],
    ['the sheet cannot be read', { metaStatus: 404 }, 'sheet-unreadable'],
    ['no amount column', { header: ['Date', 'Client'] }, 'no-amount-column'],
    ['the append fails', { appendStatus: 500 }, 'append-failed'],
    ['no range comes back', { noRange: true }, 'proof_pending'],
    ['the read-back fails', { getStatus: 500 }, 'verify_failed'],
    ['the row reads back different', { tamper: true }, 'verify_failed']
  ];
  for (const [why, opts, reason] of cases) {
    const r = await S.append({ flags: ON, sheet: SHEET1, ask, today: TODAY, now: NOW }, { sheets: mockSheets(opts).sheets });
    check(why + ' → ' + reason + ', not Handled', r.ok === false && r.reason === reason && !Proof.allowsHandled(r), r);
  }
  const off = mockSheets();
  const r0 = await S.append({ sheet: SHEET1, ask, today: TODAY, now: NOW }, { sheets: off.sheets });
  check('switch off: no Sheets call', r0.reason === 'switch-off' && off.calls.length === 0);

  console.log('\n--- Undo ---\n');
  const u = mockSheets();
  const saved = await S.append({ flags: ON, sheet: SHEET1, ask, today: TODAY, now: NOW }, { sheets: u.sheets });
  const undone = await S.undo(saved.ref, { sheets: u.sheets });
  check('Undo deletes that row and reads the range back without it', undone.ok === true && u.rows().length === 2, { undone, rows: u.rows() });
  const del = u.calls.find((c) => /batchUpdate/.test(c.path));
  check('the delete names exactly that row on that tab', del && JSON.stringify(del.body.requests[0].deleteDimension.range) === JSON.stringify({ sheetId: 77, dimension: 'ROWS', startIndex: 2, endIndex: 3 }), del && del.body);
  const edited = mockSheets();
  const s2 = await S.append({ flags: ON, sheet: SHEET1, ask, today: TODAY, now: NOW }, { sheets: edited.sheets });
  edited.rows()[2] = [TODAY, 'Acme', '1250'];
  const u2 = await S.undo(s2.ref, { sheets: edited.sheets });
  check('a row the person edited is not deleted: Undo unavailable', u2.ok === false && u2.reason === 'row-changed' && u2.undoUnavailable === true && edited.rows().length === 3, u2);
  const stuck = mockSheets({ keepOnDelete: true });
  const s3 = await S.append({ flags: ON, sheet: SHEET1, ask, today: TODAY, now: NOW }, { sheets: stuck.sheets });
  check('a row still there after delete is undo-unverified', (await S.undo(s3.ref, { sheets: stuck.sheets })).reason === 'undo-unverified');
  check('Undo refuses a row Glance did not write', (await S.undo({ spreadsheetId: 'x', range: 'A!A2:C2', rowIndex: 2, createdByGlance: false }, { sheets: u.sheets })).reason === 'not-ours');

  console.log('\nprecision: offers ' + offered + '/' + positives.length + ' positives, wrong offers ' + wrongOffers + '/' + negatives.length + ' negatives');
  check('precision gate: zero wrong offers on the negative set', wrongOffers === 0);
  check('recall on the positive set is 100%', offered === positives.length);
  console.log(failures ? '\n' + failures + ' FAILED' : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})();
