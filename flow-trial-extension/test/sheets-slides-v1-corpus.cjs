// Sheets and Slides v1. Drive only: no sheets.googleapis.com, no slides.googleapis.com,
// no spreadsheets or presentations scope. Run: node test/sheets-slides-v1-corpus.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const EXT = path.join(__dirname, '..');
const sandbox = {
  module: undefined,
  console,
  TextEncoder,
  TextDecoder,
  Uint8Array,
  Date,
  setTimeout,
  Promise
};
vm.createContext(sandbox);
for (const f of ['proof-of-close.js', 'google-config.js', 'google-sheets.js', 'google-slides.js', 'sheet-mail.js', 'slide-deck.js']) {
  vm.runInContext(fs.readFileSync(path.join(EXT, 'core', f), 'utf8'), sandbox, { filename: f });
}
const Cfg = vm.runInContext('FlowGoogleConfig', sandbox);
const Sheets = vm.runInContext('FlowGoogleSheets', sandbox);
const Slides = vm.runInContext('FlowGoogleSlides', sandbox);
const Mail = vm.runInContext('FlowSheetMail', sandbox);
const Deck = vm.runInContext('FlowSlideDeck', sandbox);
const CLOCK = '2026-11-20T12:00:00.000Z';
const SNAP = { headRevisionId: 'rev-1', version: '1', modifiedTime: '2026-11-20T00:00:00.000Z' };
const SHEET = 'application/vnd.google-apps.spreadsheet';
const DECK_MIME = 'application/vnd.google-apps.presentation';

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
function scripted(steps) {
  const calls = [];
  let i = 0;
  async function http(req) {
    calls.push({ method: req.method, url: req.url, body: req.body });
    const step = steps[i++] || { status: 500, ok: false, json: null, text: '' };
    return step;
  }
  return { http, calls };
}
function proved(res) {
  return !!(res && res.ok === true && res.proof && res.proof.fetchedBack === true && res.proof.externalId);
}
function offApi(calls) {
  return calls.every((c) => c.url.indexOf('sheets.googleapis.com') < 0 && c.url.indexOf('slides.googleapis.com') < 0);
}

console.log('\n--- the mail ---\n');
(async () => {
{
  const table = Mail.plan({
    subject: 'Order',
    text: 'Please put this in a sheet:\n| Item | Amount |\n| chairs | 12 |\n| desks | 3 |'
  });
  check('a table with a sheet ask is a new sheet', table && table.mode === 'create' && table.rows.length === 3 && table.rows[1][0] === 'chairs', table);
  const list = Mail.plan({ text: 'Please record these in a spreadsheet:\n- chairs 12\n- desks 3' });
  check('a list with a sheet ask is a new sheet', list && list.mode === 'create' && list.rows.length === 2, list);
  const he = Mail.plan({ subject: 'גיליון', text: 'בבקשה תכין גיליון:\nכיסאות 12\nשולחנות 3' });
  check('Hebrew amounts are rows, right to left text kept', he && he.lang === 'he' && he.rows[0][0] === 'כיסאות' && he.rows[1][1] === '3', he);
  const pick = Mail.plan({ text: 'Please add these to the existing sheet:\n- lamps 2\n- shelves 4' });
  check('an existing sheet is a picker append', pick && pick.mode === 'pick' && pick.rows.length === 2, pick);
  const one = Mail.plan({ text: 'Please log $4,200 confirmed on November 17 in a new spreadsheet.' });
  check('one amount stays off this card', one === null, one);
  const fyi = Mail.plan({ text: 'FYI the sheet is attached\n- chairs 12\n- desks 3' });
  check('FYI stays quiet', fyi === null);
  const hedge = Mail.plan({ text: 'Maybe put these in a sheet:\n- chairs 12\n- desks 3' });
  check('a hedge stays quiet', hedge === null);
  const neg = Mail.plan({ text: 'Please do not put these in a sheet:\n- chairs 12\n- desks 3' });
  check('a negation stays quiet', neg === null);
  const plain = Mail.plan({ text: 'The chairs arrived and the desks are late.' });
  check('a mail with no sheet ask stays quiet', plain === null);
}

console.log('\n--- the deck ---\n');
{
  const deck = Deck.plan({
    subject: 'סיכום פגישה — תקציב',
    text: 'סיכום פגישה\n- דנה שולחת את החוזה\n- התקציב נשאר'
  });
  check('a meeting summary is a deck', deck && deck.lang === 'he' && deck.bullets.length === 2 && deck.slides.length >= 2, deck);
  check('the deck keeps the Hebrew points', deck && deck.bullets[0].indexOf('דנה') >= 0);
  const en = Deck.plan({ subject: 'Notes', text: 'Meeting summary\n- Dana sends the contract\n- The budget stays' });
  check('an English summary is a deck', en && en.lang === 'en' && en.bullets.length === 2, en);
  const thin = Deck.plan({ text: 'Meeting summary\n- only one point' });
  check('one point is not a deck', thin === null);
  const fyi = Deck.plan({ text: 'FYI meeting summary\n- Dana sends the contract\n- The budget stays' });
  check('an FYI summary stays quiet', fyi === null);
  const bytes = Slides.pptxBytes(Slides.deckSlides(deck));
  check('the PPTX is a zip', bytes && bytes[0] === 0x50 && bytes[1] === 0x4b);
  const xml = new TextDecoder().decode(bytes);
  check('Hebrew slides are right to left', xml.indexOf('rtl="1"') >= 0 && xml.indexOf('דנה שולחת את החוזה') >= 0, xml.indexOf('rtl'));
}

console.log('\n--- same thread, and a failed read-back ---\n');
{
  const manifest = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
  const hosts = (manifest.host_permissions || []).concat(manifest.optional_host_permissions || []);
  check('sheets.googleapis.com is not a host and is not requested', hosts.every((h) => h.indexOf('sheets.googleapis.com') < 0) && !/permissions\.request\(/.test(fs.readFileSync(path.join(EXT, 'src', 'background.js'), 'utf8') + fs.readFileSync(path.join(EXT, 'src', 'google-lane-host.js'), 'utf8') + fs.readFileSync(path.join(EXT, 'src', 'content-gmail.js'), 'utf8')));
  check('slides.googleapis.com is not a host', hosts.every((h) => h.indexOf('slides.googleapis.com') < 0));
  const scopes = (manifest.oauth2 && manifest.oauth2.scopes) || [];
  check('no spreadsheets or presentations scope', scopes.every((s) => s.indexOf('spreadsheet') < 0 && s.indexOf('presentation') < 0));
  const host = fs.readFileSync(path.join(EXT, 'src', 'google-lane-host.js'), 'utf8');
  check('sheet-row.js stays unwired', host.indexOf('sheet-row.js') < 0 && fs.readFileSync(path.join(EXT, 'src', 'content-gmail.js'), 'utf8').indexOf('sheet-row') < 0);

  const again = scripted([
    { status: 200, ok: true, json: { files: [{ id: 'sheet1', name: 'Payments', mimeType: SHEET, trashed: false, appProperties: { glanceSheet: '1', glanceThread: 'thr', glanceType: 'sheet' } }] } },
    { status: 200, ok: true, json: { sheets: [{ properties: { sheetId: 0, title: 'Sheet1' } }] } },
    { status: 200, ok: true, json: { updates: { updatedRange: 'Sheet1!A2:B2', updatedRows: 1 } } },
    { status: 200, ok: true, json: { values: [['Bea', '200']] } }
  ]);
  const appended = await Sheets.write({ scopes: Cfg.SCOPES, name: 'Payments', threadId: 'thr', rows: [['Bea', '200']] }, again.http, CLOCK);
  check('the same thread appends and does not create another file', proved(appended) && appended.ref.created === false && appended.ref.spreadsheetId === 'sheet1' && again.calls[0].url.indexOf('appProperties') >= 0 && again.calls.some((c) => c.url.indexOf(':append') >= 0) && again.calls.every((c) => c.url.indexOf('/upload/drive/') < 0), appended);
  const two = scripted([
    { status: 200, ok: true, json: { files: [
      { id: 'a', mimeType: SHEET, appProperties: { glanceSheet: '1', glanceThread: 'thr' } },
      { id: 'b', mimeType: SHEET, appProperties: { glanceSheet: '1', glanceThread: 'thr' } }
    ] } }
  ]);
  const ambiguous = await Sheets.write({ scopes: Cfg.SCOPES, name: 'Payments', threadId: 'thr', rows: [['Bea', '200']] }, two.http, CLOCK);
  check('two sheets for the thread are not written', ambiguous.ok === false && ambiguous.reason === 'ambiguous' && two.calls.length === 1, ambiguous);

  const FILE = Object.assign({ id: 'sheet1', name: 'Payments', mimeType: SHEET, trashed: false }, SNAP);
  const failed = scripted([
    { status: 200, ok: true, json: { files: [{ id: 'fld', name: 'Glance' }] } },
    { status: 200, ok: true, json: FILE },
    { status: 200, ok: true, json: FILE },
    { status: 200, ok: true, text: '' },
    { status: 200, ok: true, text: '' },
    { status: 200, ok: true, json: { trashed: true } }
  ]);
  const missed = await Sheets.write({ scopes: Cfg.SCOPES, name: 'Payments', row: ['Ada', '100'] }, failed.http, CLOCK);
  check('a failed read-back trashes the new sheet', missed.ok === false && missed.reason === 'verify_failed' && missed.cleanedUp === true && failed.calls[5].method === 'PATCH' && offApi(failed.calls), missed);

  const heRows = [['כיסא', '4'], ['שולחן', '2']];
  const heFile = Object.assign({ id: 'sheet-he', name: 'גיליון', mimeType: SHEET, trashed: false }, SNAP);
  const heWrite = scripted([
    { status: 200, ok: true, json: { files: [] } },
    { status: 200, ok: true, json: { files: [{ id: 'fld', name: 'Glance' }] } },
    { status: 200, ok: true, json: heFile },
    { status: 200, ok: true, json: heFile },
    { status: 200, ok: true, text: 'כיסא,4\nשולחן,2\n' }
  ]);
  const hebrew = await Sheets.write({ scopes: Cfg.SCOPES, name: 'גיליון', threadId: 't-he', rows: heRows }, heWrite.http, CLOCK);
  const body = new TextDecoder().decode(heWrite.calls[2].body);
  check('Hebrew rows are in the upload and the proof', proved(hebrew) && hebrew.ref.created === true && body.indexOf('כיסא') >= 0 && body.indexOf('glanceSheet') >= 0 && body.indexOf('t-he') >= 0, hebrew);
}

console.log('\n--- the deck write ---\n');
{
  const plan = Deck.plan({ subject: 'Q4', text: 'Meeting summary\n- Dana sends the contract\n- The budget stays' });
  const file = Object.assign({ id: 'deck1', name: 'Q4', mimeType: DECK_MIME, trashed: false }, SNAP);
  const made = scripted([
    { status: 200, ok: true, json: { files: [{ id: 'fld', name: 'Glance' }] } },
    { status: 200, ok: true, json: file },
    { status: 200, ok: true, json: file },
    { status: 200, ok: true, text: 'Q4\nDana sends the contract\nThe budget stays\n' }
  ]);
  const deck = await Slides.write({ scopes: Cfg.SCOPES, title: plan.title, slides: plan.slides, threadId: 't-deck' }, made.http, CLOCK);
  check('the deck is proved from a Drive upload', proved(deck) && deck.proof.system === 'google/slides' && deck.ref.created === true && made.calls[1].method === 'POST' && made.calls[1].url.indexOf('/upload/drive/') >= 0 && offApi(made.calls), deck);
  const undo = scripted([
    { status: 200, ok: true, json: file },
    { status: 200, ok: true, text: deck.ref.contentText },
    { status: 200, ok: true, json: { trashed: true } }
  ]);
  const removed = await Slides.undo(deck.ref, undo.http);
  check('undo trashes the deck', removed.ok === true && undo.calls[2].method === 'PATCH', removed);
  const edited = scripted([
    { status: 200, ok: true, json: file },
    { status: 200, ok: true, text: 'The person rewrote the deck.' }
  ]);
  const refused = await Slides.undo(deck.ref, edited.http);
  check('an edited deck is left alone', refused.ok === false && refused.reason === 'user-edited' && edited.calls.every((c) => c.method === 'GET'), refused);
  const missed = scripted([
    { status: 200, ok: true, json: { files: [{ id: 'fld', name: 'Glance' }] } },
    { status: 200, ok: true, json: file },
    { status: 200, ok: true, json: file },
    { status: 200, ok: true, text: '' },
    { status: 200, ok: true, text: '' },
    { status: 200, ok: true, json: { trashed: true } }
  ]);
  const blank = await Slides.write({ scopes: Cfg.SCOPES, title: plan.title, slides: plan.slides }, missed.http, CLOCK);
  check('a deck that does not read back is trashed', blank.ok === false && blank.reason === 'verify_failed' && blank.cleanedUp === true && offApi(missed.calls), blank);
}

console.log('\n--- list, link, and a sheet Glance cannot open ---\n');
{
  check('a docs link yields the spreadsheet id', Sheets.parseSheetLink('https://docs.google.com/spreadsheets/d/abc1234567890_XYZ/edit#gid=0') === 'abc1234567890_XYZ');
  check('a bare id is accepted', Sheets.parseSheetLink('1AbCdefGHIjklMNOpqrsTUVwxyz012345') === '1AbCdefGHIjklMNOpqrsTUVwxyz012345');
  check('a sentence is not an id', Sheets.parseSheetLink('please use the sheet') === '');
  const listed = scripted([
    { status: 200, ok: true, json: { files: [
      { id: 'newer', name: 'November', mimeType: SHEET, modifiedTime: '2026-11-20T01:00:00.000Z' },
      { id: 'older', name: 'October', mimeType: SHEET, modifiedTime: '2026-10-01T01:00:00.000Z' },
      { id: 'nope', name: 'Doc', mimeType: 'application/vnd.google-apps.document' },
      { id: 'gone', name: 'Trash', mimeType: SHEET, trashed: true }
    ] } }
  ]);
  const list = await Sheets.listAccessible(listed.http);
  check('the list is the spreadsheets Drive can already see, at most 10', list.ok === true && list.files.length === 2 && list.files[0].id === 'newer' && listed.calls[0].url.indexOf('orderBy=modifiedTime%20desc') >= 0 && listed.calls[0].url.indexOf('pageSize=10') >= 0 && listed.calls[0].url.indexOf('mimeType') >= 0, list);
  const denied = scripted([{ status: 403, ok: false, json: { error: { code: 403 } } }]);
  const no = await Sheets.probeSheet(denied.http, '1AbCdefGHIjklMNOpqrsTUVwxyz012345');
  check('a 403 link is refused in Hebrew and does not ask for a wider scope', no.ok === false && no.reason === 'no-access' && no.message === Sheets.NO_ACCESS && no.message.indexOf('אין גישה') >= 0, no);
  const missing = scripted([{ status: 404, ok: false, json: null }]);
  const gone = await Sheets.probeSheet(missing.http, '1AbCdefGHIjklMNOpqrsTUVwxyz012345');
  check('a 404 link is the same refusal', gone.reason === 'no-access' && gone.message === Sheets.NO_ACCESS);
  const gmail = fs.readFileSync(path.join(EXT, 'src', 'content-gmail.js'), 'utf8');
  check('the sheet card does not open the Drive picker', gmail.indexOf("openDrivePicker('sheet')") < 0 && gmail.indexOf('flow:google-sheet-list') >= 0);
}

console.log('\n--- picker stays unused for sheets ---\n');
{
  const picker = fs.readFileSync(path.join(EXT, 'picker', 'picker.js'), 'utf8');
  check('picker.js still has the placeholder and is not the sheet chooser', picker.indexOf('YOUR_GOOGLE_PICKER_API_KEY') >= 0 && picker.indexOf('setAppId') < 0);
}

console.log(failures ? '\n' + failures + ' FAILED' : '\nALL PASS');
process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
