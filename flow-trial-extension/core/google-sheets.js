// Append one row to a spreadsheet Glance created or the person picked.
// The file is created with drive.file. The row is appended with the Sheets
// API on that id. There is no spreadsheets OAuth scope. One row only.
// Undo clears that range, or trashes the file when this lane created it.
// Handled waits for a read-back of the range. Portable: no chrome.*, no DOM, no network.
const FlowGoogleSheets = (() => {
  const SYSTEM = 'google/sheets';
  const CONNECTOR = 'googleSheetAppend';
  const SHEET_MIME = 'application/vnd.google-apps.spreadsheet';
  const FILES = 'https://www.googleapis.com/drive/v3/files';
  const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets/';
  const RANGE = 'Sheet1!A1';

  function cfg() {
    return typeof FlowGoogleConfig !== 'undefined' ? FlowGoogleConfig : null;
  }

  function safeName(name) {
    let s = String(name || '').replace(/[\u0000-\u001f]/g, '');
    s = s.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!s || s.indexOf('..') !== -1) return '';
    s = s.replace(/^\.+/, '').replace(/\.+$/, '').trim();
    if (!s || s === '.' || s === '..') return '';
    if (s.length > 120) s = s.slice(0, 120).trim();
    return s;
  }

  function sheetId(id) {
    const s = String(id || '').trim();
    if (!s || s.length > 200 || /[\/\\\s]/.test(s)) return '';
    return s;
  }

  function ours(input) {
    const origin = String((input && input.origin) || '');
    return origin === 'created' || origin === 'picked';
  }

  function rowOf(input) {
    const row = input && input.row;
    if (!Array.isArray(row) || row.length < 1 || row.length > 26) return null;
    const out = [];
    for (let i = 0; i < row.length; i++) {
      const cell = row[i];
      if (cell == null || Array.isArray(cell) || typeof cell === 'object') return null;
      const text = String(cell).replace(/[\r\n\u0000]/g, ' ').trim();
      if (!text || text.length > 500) return null;
      out.push(text);
    }
    return out;
  }

  function rangeOk(range) {
    return typeof range === 'string' && /^[^!]+![A-Z]+[0-9]+(?::[A-Z]+[0-9]+)?$/.test(range);
  }

  function fileUrl(id) {
    return FILES + '/' + encodeURIComponent(id) + '?fields=' + encodeURIComponent('id,name,mimeType,trashed,headRevisionId,version,modifiedTime');
  }

  function fileSnapshot(json) {
    const snap = {};
    if (!json || typeof json !== 'object') return null;
    if (json.headRevisionId) snap.headRevisionId = String(json.headRevisionId);
    if (json.version != null && String(json.version) !== '') snap.version = String(json.version);
    if (json.modifiedTime) snap.modifiedTime = String(json.modifiedTime);
    return Object.keys(snap).length ? snap : null;
  }

  function present(obj, key) {
    return !!(obj && obj[key] != null && String(obj[key]) !== '');
  }

  // Version and modifiedTime both have to be present and equal.
  // headRevisionId has to match when either side has it.
  // A modifiedTime match with no version cannot confirm the file.
  function unchanged(snapshot, live) {
    if (!snapshot || typeof snapshot !== 'object') return 'missing';
    const got = live && typeof live === 'object' ? live : {};
    if (!present(snapshot, 'version') || !present(snapshot, 'modifiedTime')) return 'unconfirmed';
    if (!present(got, 'version') || !present(got, 'modifiedTime')) return 'unconfirmed';
    if (String(snapshot.version) !== String(got.version)) return 'edited';
    if (String(snapshot.modifiedTime) !== String(got.modifiedTime)) return 'edited';
    const snapRev = present(snapshot, 'headRevisionId');
    const liveRev = present(got, 'headRevisionId');
    if (snapRev || liveRev) {
      if (!snapRev || !liveRev) return 'unconfirmed';
      if (String(snapshot.headRevisionId) !== String(got.headRevisionId)) return 'edited';
    }
    return 'match';
  }

  function editedResult() {
    return { ok: false, reason: 'user-edited', error: 'You edited this. Undo left it alone.' };
  }

  function unconfirmedResult() {
    return { ok: false, reason: 'unconfirmed', error: "Couldn't confirm it's unchanged. Undo left it alone." };
  }

  function appendUrl(id) {
    return SHEETS + encodeURIComponent(id) + '/values/' + encodeURIComponent(RANGE) + ':append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS';
  }

  function valuesUrl(id, range) {
    return SHEETS + encodeURIComponent(id) + '/values/' + encodeURIComponent(range);
  }

  async function call(http, req) {
    try {
      const res = await http(req);
      const status = res && typeof res.status === 'number' ? res.status : 0;
      return { status: status, ok: !!(res && (res.ok === true || (status >= 200 && status < 300))), json: res && res.json ? res.json : null };
    } catch (e) {
      return { status: 0, ok: false, json: null };
    }
  }

  function sameRow(got, row) {
    const values = got && got.values;
    if (!values || !values[0] || values[0].length !== row.length) return false;
    for (let i = 0; i < row.length; i++) {
      if (String(values[0][i]) !== row[i]) return false;
    }
    return true;
  }

  async function appendRow(id, row, http, clock, created, name) {
    const C = cfg();
    const posted = await call(http, {
      method: 'POST',
      url: appendUrl(id),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [row] })
    });
    if (posted.status === 401 || posted.status === 403) return { ok: false, reason: 'not-connected' };
    const base = { where: 'Google Sheets', target: name || id, written: 'Sheet · ' + row.join(' · '), url: null };
    if (!posted.ok) return Object.assign({ ok: false, reason: 'http-' + posted.status, proof: null }, base);
    const updated = posted.json && posted.json.updates;
    const range = updated && updated.updatedRange;
    const ref = { spreadsheetId: id, externalId: id + '!' + (range || ''), updatedRange: range || '', created: created === true, row: row };
    if (!rangeOk(range) || updated.updatedRows !== 1) {
      return Object.assign({ ok: false, reason: 'verify_failed', ref: ref, proof: null }, base);
    }
    const got = await call(http, { method: 'GET', url: valuesUrl(id, range) });
    if (!got.ok || !sameRow(got.json, row)) {
      return Object.assign({ ok: false, reason: 'verify_failed', ref: ref, proof: null }, base);
    }
    const link = 'https://docs.google.com/spreadsheets/d/' + encodeURIComponent(id) + '/edit';
    base.url = link;
    const proof = C && C.proofOf(SYSTEM, ref.externalId, link, C.clockIso(clock));
    if (!proof) return Object.assign({ ok: false, reason: 'proof_pending', ref: ref, proof: null }, base);
    return Object.assign({ ok: true, ref: ref, proof: proof }, base);
  }

  async function write(input, http, clock) {
    const C = cfg();
    const i = input || {};
    const blocked = C && C.gate(i.scopes, C.SCOPE_DRIVE_FILE, 'drive-not-granted');
    if (blocked) return blocked;
    const row = rowOf(i);
    if (!row) return { ok: false, reason: 'unclear' };
    const existing = sheetId(i.spreadsheetId);
    if (existing) {
      if (!ours(i)) return { ok: false, reason: 'not-ours' };
      return appendRow(existing, row, http, clock, false, safeName(i.name || '') || existing);
    }
    const name = safeName(i.name || 'Row');
    if (!name) return { ok: false, reason: 'unclear' };
    const posted = await call(http, {
      method: 'POST',
      url: FILES + '?fields=' + encodeURIComponent('id,name,mimeType,trashed'),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, mimeType: SHEET_MIME })
    });
    if (posted.status === 401 || posted.status === 403) return { ok: false, reason: 'not-connected' };
    if (!posted.ok) return { ok: false, reason: 'http-' + posted.status };
    const file = posted.json || {};
    if (!file.id) return { ok: false, reason: 'proof_pending', where: 'Google Sheets', written: 'Sheet · ' + name, proof: null };
    const got = await call(http, { method: 'GET', url: fileUrl(file.id) });
    if (!got.ok || !got.json || got.json.id !== file.id || got.json.trashed === true) {
      return { ok: false, reason: 'verify_failed', ref: { spreadsheetId: file.id, externalId: file.id, created: true }, proof: null };
    }
    const appended = await appendRow(file.id, row, http, clock, true, name);
    if (appended && appended.ref && appended.ref.created === true && appended.ok) {
      const meta = await call(http, { method: 'GET', url: fileUrl(file.id) });
      if (meta.ok && meta.json) appended.ref.snapshot = fileSnapshot(meta.json);
    }
    return appended;
  }

  async function undo(ref, http) {
    const id = sheetId(ref && (ref.spreadsheetId || ''));
    if (!id) return { ok: false, reason: 'unclear' };
    if (!ref.row || !rangeOk(ref.updatedRange)) return unconfirmedResult();
    const got = await call(http, { method: 'GET', url: valuesUrl(id, ref.updatedRange) });
    if (got.status === 401 || got.status === 403) return { ok: false, reason: 'not-connected' };
    if (got.status === 404) {
      if (ref.created === true) return unconfirmedResult();
      return { ok: true, written: 'Sheet row removed.' };
    }
    if (!got.ok || got.status === 0) return unconfirmedResult();
    if (!sameRow(got.json, ref.row)) return editedResult();
    if (ref.created === true) {
      const file = await call(http, { method: 'GET', url: fileUrl(id) });
      if (file.status === 401 || file.status === 403) return { ok: false, reason: 'not-connected' };
      if (file.status === 404) return { ok: true, written: 'Sheet removed.' };
      if (!file.ok || file.status === 0) return unconfirmedResult();
      const verdict = unchanged(ref.snapshot, file.json);
      if (verdict === 'edited') return editedResult();
      if (verdict !== 'match') return unconfirmedResult();
      const del = await call(http, {
        method: 'PATCH',
        url: FILES + '/' + encodeURIComponent(id),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trashed: true })
      });
      if (del.status === 401 || del.status === 403) return { ok: false, reason: 'not-connected' };
      if (del.ok || del.status === 204 || del.status === 404) return { ok: true, written: 'Sheet removed.' };
      return { ok: false, reason: 'http-' + del.status };
    }
    if (!rangeOk(ref.updatedRange)) return { ok: false, reason: 'unclear' };
    const del = await call(http, {
      method: 'POST',
      url: valuesUrl(id, ref.updatedRange) + ':clear',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    });
    if (del.status === 401 || del.status === 403) return { ok: false, reason: 'not-connected' };
    if (del.ok) return { ok: true, written: 'Sheet row removed.' };
    return { ok: false, reason: 'http-' + del.status };
  }

  return {
    SYSTEM: SYSTEM,
    CONNECTOR: CONNECTOR,
    rowOf: rowOf,
    write: write,
    undo: undo
  };
})();

if (typeof module !== 'undefined') module.exports = { FlowGoogleSheets };
else if (typeof globalThis !== 'undefined') globalThis.FlowGoogleSheets = FlowGoogleSheets;
