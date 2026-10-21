// Two Outlook mails: create a table in a new workbook, and append a row to
// a workbook that already has a table.
const CREATE_BODY = 'Please create a table in budget.xlsx with columns Name, Amount.';
const CREATE_ID = 'AQMkLaneMsExcelCreate';
const APPEND_BODY = 'Please append a row to pay.xlsx: 12, Dana, paid';
const APPEND_ID = 'AQMkLaneMsExcelAppend';

const APPEND_SCENARIO = {
  driveSeed: [{ id: 'wb-pay', name: 'pay.xlsx', webUrl: 'https://onedrive.live.com/file/wb-pay' }],
  workbookSeed: [{
    itemId: 'wb-pay',
    tables: [{ id: 't-pay', name: 'Table1', rows: [['Name', 'Amount', 'Note']] }]
  }]
};

module.exports = { CREATE_BODY, CREATE_ID, APPEND_BODY, APPEND_ID, APPEND_SCENARIO };
