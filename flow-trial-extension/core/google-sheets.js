// A Google Sheet created with drive.file, or rows appended to a sheet Glance
// can already open. A new sheet is a Drive multipart upload of CSV into the
// Glance folder, with appProperties, verified by files.get and a CSV export.
// Undo of that file trashes it. A failed read-back trashes it.
// An append uses spreadsheets.values.append (USER_ENTERED, INSERT_ROWS) on
// the first sheet or a named tab. Undo deletes exactly those rows with
// batchUpdate deleteDimension and reads the range again. There is no
// spreadsheets OAuth scope and no Google Picker. A pasted link that Drive
// answers 403 or 404 is not accessible under drive.file.
// Portable: no chrome.*, no DOM, no network.
const FlowGoogleSheets = (() => {
  const SYSTEM = 'google/sheets';
  const CONNECTOR = 'googleSheetAppend';
  const SHEET_MIME = 'application/vnd.google-apps.spreadsheet';
  const FILES = 'https://www.googleapis.com/drive/v3/files';
  const FILE_FIELDS = 'id,name,mimeType,trashed,webViewLink,headRevisionId,version,modifiedTime';
  const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=' + encodeURIComponent(FILE_FIELDS);
  const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets/';
  const NO_ACCESS = 'ל-Glance אין גישה לגיליון הזה. אפשר לבחור גיליון ש-Glance יצר, או ליצור גיליון חדש.';
  const FOLDER_NAME = 'Glance';
  const FOLDER_MIME = 'application/vnd.google-apps.folder';

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

  function cellOf(cell) {
    if (cell == null || Array.isArray(cell) || typeof cell === 'object') return null;
    const text = String(cell).replace(/[\r\n\u0000]/g, ' ').trim();
    if (!text || text.length > 500) return null;
    return text;
  }

  function rowOf(input) {
    const row = input && input.row;
    if (!Array.isArray(row) || row.length < 1 || row.length > 26) return null;
    const out = [];
    for (let i = 0; i < row.length; i++) {
      const cell = cellOf(row[i]);
      if (cell == null) return null;
      out.push(cell);
    }
    return out;
  }

  function rowsOf(input) {
    const i = input || {};
    const source = Array.isArray(i.rows) ? i.rows : null;
    if (source) {
      if (source.length < 1 || source.length > 40) return null;
      const out = [];
      for (let r = 0; r < source.length; r++) {
        const one = rowOf({ row: source[r] });
        if (!one) return null;
        out.push(one);
      }
      return out;
    }
    if (typeof i.csv === 'string' && i.csv.trim()) {
      const parsed = parseCsv(i.csv);
      if (!parsed.length || parsed.length > 40) return null;
      const out = [];
      for (let r = 0; r < parsed.length; r++) {
        const one = rowOf({ row: parsed[r] });
        if (!one) return null;
        out.push(one);
      }
      return out;
    }
    const one = rowOf(i);
    return one ? [one] : null;
  }

  function fileUrl(id) {
    return FILES + '/' + encodeURIComponent(id) + '?fields=' + encodeURIComponent(FILE_FIELDS);
  }

  function exportUrl(id) {
    return FILES + '/' + encodeURIComponent(id) + '/export?mimeType=' + encodeURIComponent('text/csv');
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

  function utf8Bytes(s) {
    return new TextEncoder().encode(String(s || ''));
  }

  function multipart(meta, mediaType, bytes) {
    const boundary = 'glance_lane_drive';
    const head = '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(meta) + '\r\n--' + boundary + '\r\nContent-Type: ' + mediaType + '\r\n\r\n';
    const tail = '\r\n--' + boundary + '--';
    const h = utf8Bytes(head);
    const t = utf8Bytes(tail);
    const body = new Uint8Array(h.length + bytes.length + t.length);
    body.set(h, 0);
    body.set(bytes, h.length);
    body.set(t, h.length + bytes.length);
    return { contentType: 'multipart/related; boundary=' + boundary, body: body };
  }

  function csvEscape(cell) {
    const s = String(cell == null ? '' : cell);
    if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function toCsv(rows) {
    const lines = [];
    for (let i = 0; i < rows.length; i++) lines.push(rows[i].map(csvEscape).join(','));
    return '\uFEFF' + lines.join('\r\n') + '\r\n';
  }

  function parseCsv(text) {
    const src = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const rows = [];
    let row = [];
    let cell = '';
    let quote = false;
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      if (quote) {
        if (ch === '"') {
          if (src[i + 1] === '"') { cell += '"'; i++; }
          else quote = false;
        } else cell += ch;
        continue;
      }
      if (ch === '"') { quote = true; continue; }
      if (ch === ',') { row.push(cell); cell = ''; continue; }
      if (ch === '\n') {
        row.push(cell);
        cell = '';
        if (row.some((c) => String(c).trim())) rows.push(row.map((c) => String(c).trim()));
        row = [];
        continue;
      }
      cell += ch;
    }
    row.push(cell);
    if (row.some((c) => String(c).trim())) rows.push(row.map((c) => String(c).trim()));
    return rows;
  }

  function norm(s) {
    return String(s || '').replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, '').replace(/\s+/g, ' ').trim();
  }

  function rangeMatches(parsed, start, written) {
    if (!start || start < 1) return false;
    for (let i = 0; i < written.length; i++) {
      const got = parsed[start - 1 + i];
      if (!got) return false;
      for (let c = 0; c < written[i].length; c++) {
        if (norm(got[c]) !== norm(written[i][c])) return false;
      }
    }
    return true;
  }

  function sameGrid(parsed, written) {
    if (!parsed || parsed.length !== written.length) return false;
    return rangeMatches(parsed, 1, written);
  }

  function blankRange(parsed, start, written) {
    const out = parsed.map((r) => r.slice());
    for (let i = 0; i < written.length; i++) {
      const at = start - 1 + i;
      if (!out[at]) return null;
      for (let c = 0; c < written[i].length; c++) out[at][c] = '';
    }
    while (out.length && out[out.length - 1].every((c) => !norm(c))) out.pop();
    return out;
  }

  function colLetter(n) {
    let x = n;
    let s = '';
    while (x > 0) {
      const m = (x - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      x = Math.floor((x - 1) / 26);
    }
    return s || 'A';
  }

  function a1(start, rows) {
    const width = rows.reduce((m, r) => Math.max(m, r.length), 1);
    const end = start + rows.length - 1;
    return 'Sheet1!' + colLetter(1) + start + ':' + colLetter(width) + end;
  }

  function waitMs(clock, ms) {
    if (clock && typeof clock === 'object' && typeof clock.wait === 'function') return Promise.resolve(clock.wait(ms));
    if (typeof setTimeout === 'function') return new Promise((resolve) => { setTimeout(resolve, ms); });
    return Promise.resolve();
  }

  async function call(http, req) {
    try {
      const res = await http(req);
      const status = res && typeof res.status === 'number' ? res.status : 0;
      return {
        status: status,
        ok: !!(res && (res.ok === true || (status >= 200 && status < 300))),
        json: res && res.json ? res.json : null,
        text: res && res.text != null ? String(res.text) : '',
        denial: res && res.denial ? res.denial : null,
        url: req && req.url
      };
    } catch (e) {
      return { status: 0, ok: false, json: null, text: '' };
    }
  }

  function authFail(res) {
    const status = res && res.status;
    if (status !== 401 && status !== 403) return null;
    const C = cfg();
    const d = (res && res.denial) || (C && typeof C.googleDenial === 'function' ? C.googleDenial(status, res && res.json, res && res.url) : null);
    const out = { ok: false, reason: 'not-connected', status: status };
    if (d && d.googleReason) out.googleReason = d.googleReason;
    if (d && d.service) out.service = d.service;
    if (status === 403 && d) {
      if (d.kind === 'scope') out.reason = 'drive-not-granted';
      else if (d.kind === 'api-disabled') out.reason = 'drive-api-disabled';
      else if (d.kind === 'forbidden') out.reason = 'http-403';
    }
    return out;
  }

  async function trashCreated(http, id) {
    const del = await call(http, {
      method: 'PATCH',
      url: FILES + '/' + encodeURIComponent(id),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trashed: true })
    });
    return !!(del.ok || del.status === 404);
  }

  function clipProp(value, max) {
    return String(value || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, max);
  }

  function dayOf(clock) {
    const C = cfg();
    const iso = C && typeof C.clockIso === 'function' ? C.clockIso(clock) : '';
    const m = String(iso || '').match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : '';
  }

  function titleKey(name) {
    return clipProp(String(name || '').toLowerCase().replace(/\s+/g, ' '), 60);
  }

  function glanceProps(input, name, clock) {
    const g = (input && input.glance) || {};
    const thread = clipProp(g.threadId || (input && input.threadId) || '', 80);
    const props = { glanceSheet: '1', glanceType: 'sheet' };
    if (thread) props.glanceThread = thread;
    const title = clipProp(g.titleKey || titleKey(name), 60);
    if (title) props.glanceTitle = title;
    const at = clipProp(g.at || dayOf(clock), 20);
    if (at) props.glanceDay = at;
    return props;
  }

  function withGlance(meta, input, name, clock) {
    const props = glanceProps(input, name, clock);
    meta.appProperties = props;
    meta.description = 'glance ' + JSON.stringify({
      glance: true,
      thread: props.glanceThread || '',
      type: 'sheet',
      title: props.glanceTitle || '',
      at: props.glanceDay || ''
    });
    return meta;
  }

  // Same query shape as the Doc lookup (appProperties has key/value), on a
  // spreadsheet Glance created. drive.file can see those files.
  async function listGlanceSheets(http) {
    const q = "mimeType='" + SHEET_MIME + "' and trashed=false and appProperties has { key='glanceSheet' and value='1' }";
    const fields = 'files(id,name,mimeType,trashed,appProperties)';
    const listed = await call(http, {
      method: 'GET',
      url: FILES + '?q=' + encodeURIComponent(q) + '&pageSize=20&fields=' + encodeURIComponent(fields)
    });
    const denied = authFail(listed);
    if (denied) return denied;
    if (!listed.ok) return { ok: false, reason: 'lookup-failed', files: null };
    const files = listed.json && Array.isArray(listed.json.files) ? listed.json.files : [];
    return { ok: true, files: files };
  }

  function threadOf(input) {
    const g = input && input.glance;
    return clipProp((g && g.threadId) || (input && input.threadId) || '', 80);
  }

  async function findThreadSheet(http, input) {
    const thread = threadOf(input);
    if (!thread) return { ok: true, id: '' };
    const listed = await listGlanceSheets(http);
    if (listed && listed.ok === false) return listed;
    const hits = (listed.files || []).filter((f) => {
      if (!f || f.trashed === true || !sheetId(f.id)) return false;
      const props = f.appProperties || {};
      return String(props.glanceThread || '') === thread && String(props.glanceSheet || '') === '1';
    });
    if (hits.length > 1) return { ok: false, reason: 'ambiguous' };
    if (hits.length === 1) return { ok: true, id: String(hits[0].id), name: hits[0].name || '' };
    return { ok: true, id: '' };
  }

  async function glanceFolder(http) {
    const q = "mimeType='" + FOLDER_MIME + "' and name='" + FOLDER_NAME + "' and trashed=false";
    const listed = await call(http, {
      method: 'GET',
      url: FILES + '?q=' + encodeURIComponent(q) + '&pageSize=1&fields=' + encodeURIComponent('files(id,name)')
    });
    const listedDenied = authFail(listed);
    if (listedDenied) return listedDenied;
    const hit = listed.ok && listed.json && Array.isArray(listed.json.files) ? listed.json.files[0] : null;
    if (hit && hit.id) return { ok: true, id: String(hit.id) };
    const made = await call(http, {
      method: 'POST',
      url: FILES + '?fields=' + encodeURIComponent('id,name'),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: FOLDER_NAME, mimeType: FOLDER_MIME })
    });
    const madeDenied = authFail(made);
    if (madeDenied) return madeDenied;
    if (made.ok && made.json && made.json.id) return { ok: true, id: String(made.json.id) };
    return { ok: true, id: '' };
  }

  async function uploadCsv(http, url, meta, rows) {
    const packed = multipart(meta, 'text/csv; charset=UTF-8', utf8Bytes(toCsv(rows)));
    const method = url.indexOf('/upload/drive/v3/files/') >= 0 ? 'PATCH' : 'POST';
    return call(http, { method: method, url: url, headers: { 'Content-Type': packed.contentType }, body: packed.body });
  }

  function sheetLink(json, id) {
    const link = json && typeof json.webViewLink === 'string' ? json.webViewLink.trim() : '';
    if (link && /^https:\/\/docs\.google\.com\//.test(link)) return link;
    return 'https://docs.google.com/spreadsheets/d/' + encodeURIComponent(id) + '/edit';
  }

  function baseOf(name, rows) {
    const label = rows.map((r) => r.join(' · ')).join(' | ').slice(0, 180);
    return { where: 'Google Sheets', target: name, written: 'Sheet · ' + label, url: null };
  }

  async function readExport(http, id, clock) {
    let exported = await call(http, { method: 'GET', url: exportUrl(id) });
    const denied = authFail(exported);
    if (denied) return denied;
    if (exported.ok && !String(exported.text || '').trim()) {
      await waitMs(clock, 250);
      exported = await call(http, { method: 'GET', url: exportUrl(id) });
      const retryDenied = authFail(exported);
      if (retryDenied) return retryDenied;
    }
    return exported;
  }

  function quoteTitle(title) {
    return "'" + String(title || 'Sheet1').replace(/'/g, "''") + "'";
  }

  function parseA1(range) {
    const m = String(range || '').match(/^(?:'((?:[^']|'')*)'|([^!]+))!([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/);
    if (!m) return null;
    const startRow = Number(m[4]);
    const endRow = Number(m[6] || m[4]);
    if (!startRow || !endRow || endRow < startRow) return null;
    return { title: (m[1] || m[2] || '').replace(/''/g, "'"), startRow: startRow, endRow: endRow };
  }

  function valuesMatch(got, rows) {
    const values = got && got.values;
    if (!values || values.length !== rows.length) return false;
    for (let r = 0; r < rows.length; r++) {
      if (!values[r] || values[r].length < rows[r].length) return false;
      for (let c = 0; c < rows[r].length; c++) {
        if (norm(values[r][c]) !== norm(rows[r][c])) return false;
      }
    }
    return true;
  }

  async function listAccessible(http) {
    const q = "mimeType='" + SHEET_MIME + "' and trashed=false";
    const fields = 'files(id,name,modifiedTime,mimeType,trashed)';
    const listed = await call(http, {
      method: 'GET',
      url: FILES + '?q=' + encodeURIComponent(q) + '&orderBy=' + encodeURIComponent('modifiedTime desc') + '&pageSize=10&fields=' + encodeURIComponent(fields)
    });
    const denied = authFail(listed);
    if (denied) return denied;
    if (!listed.ok) return { ok: false, reason: 'http-' + (listed.status || 0), files: [] };
    const files = listed.json && Array.isArray(listed.json.files) ? listed.json.files : [];
    const out = [];
    for (let i = 0; i < files.length && out.length < 10; i++) {
      const f = files[i];
      if (!f || f.trashed === true || f.mimeType !== SHEET_MIME || !sheetId(f.id)) continue;
      out.push({ id: String(f.id), name: String(f.name || f.id), modifiedTime: String(f.modifiedTime || '') });
    }
    return { ok: true, files: out };
  }

  function parseSheetLink(text) {
    const s = String(text || '').trim();
    const fromUrl = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]{10,})/);
    if (fromUrl) return fromUrl[1];
    if (/^[a-zA-Z0-9_-]{20,200}$/.test(s)) return s;
    return '';
  }

  async function probeSheet(http, id) {
    const sid = sheetId(id);
    if (!sid) return { ok: false, reason: 'unclear', message: NO_ACCESS };
    const got = await call(http, { method: 'GET', url: fileUrl(sid) });
    if (got.status === 401) return { ok: false, reason: 'not-connected' };
    if (got.status === 403 || got.status === 404 || !got.ok || !got.json) {
      return { ok: false, reason: 'no-access', status: got.status || 0, message: NO_ACCESS };
    }
    if (got.json.trashed === true || got.json.mimeType !== SHEET_MIME || got.json.id !== sid) {
      return { ok: false, reason: 'no-access', message: NO_ACCESS };
    }
    return { ok: true, id: sid, name: String(got.json.name || sid) };
  }

  async function sheetTabs(http, id) {
    const got = await call(http, {
      method: 'GET',
      url: SHEETS + encodeURIComponent(id) + '?fields=' + encodeURIComponent('sheets(properties(sheetId,title))')
    });
    const denied = authFail(got);
    if (denied) return denied;
    if (!got.ok) return { ok: false, reason: 'http-' + (got.status || 0) };
    const sheets = got.json && Array.isArray(got.json.sheets) ? got.json.sheets : [];
    const tabs = [];
    for (let i = 0; i < sheets.length; i++) {
      const p = sheets[i] && sheets[i].properties;
      if (!p || !Number.isInteger(p.sheetId) || !p.title) continue;
      tabs.push({ sheetId: p.sheetId, title: String(p.title) });
    }
    if (!tabs.length) return { ok: false, reason: 'verify_failed' };
    return { ok: true, tabs: tabs };
  }

  function chooseTab(tabs, wanted) {
    const name = String(wanted || '').trim();
    if (name) {
      for (let i = 0; i < tabs.length; i++) {
        if (tabs[i].title === name) return tabs[i];
      }
      return null;
    }
    return tabs[0];
  }

  async function appendRows(id, rows, http, clock, name, input) {
    const C = cfg();
    const tabs = await sheetTabs(http, id);
    if (tabs && tabs.ok === false) return tabs;
    const tab = chooseTab(tabs.tabs, input && (input.sheetTitle || input.tab));
    if (!tab) return { ok: false, reason: 'unclear' };
    const label = safeName(name) || id;
    const base = baseOf(label, rows);
    const posted = await call(http, {
      method: 'POST',
      url: SHEETS + encodeURIComponent(id) + '/values/' + encodeURIComponent(quoteTitle(tab.title) + '!A1') + ':append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: rows })
    });
    const denied = authFail(posted);
    if (denied) return denied;
    const updated = posted.json && posted.json.updates;
    const range = updated && updated.updatedRange;
    const parsed = parseA1(range);
    const ref = {
      spreadsheetId: id,
      externalId: id + '!' + (range || ''),
      updatedRange: range || '',
      created: false,
      rows: rows,
      row: rows[0],
      startRow: parsed ? parsed.startRow : 0,
      endRow: parsed ? parsed.endRow : 0,
      sheetId: tab.sheetId,
      sheetTitle: tab.title,
      name: label
    };
    if (!posted.ok || !parsed || updated.updatedRows !== rows.length) {
      return Object.assign({ ok: false, reason: posted.ok ? 'verify_failed' : 'http-' + posted.status, ref: ref, proof: null }, base);
    }
    const got = await call(http, {
      method: 'GET',
      url: SHEETS + encodeURIComponent(id) + '/values/' + encodeURIComponent(range)
    });
    if (!got.ok || !valuesMatch(got.json, rows)) {
      return Object.assign({ ok: false, reason: 'verify_failed', ref: ref, proof: null }, base);
    }
    const link = sheetLink(null, id);
    base.url = link;
    const proof = C && C.proofOf(SYSTEM, ref.externalId, link, C.clockIso(clock));
    if (!proof) return Object.assign({ ok: false, reason: 'proof_pending', ref: ref, proof: null }, base);
    return Object.assign({ ok: true, ref: ref, proof: proof }, base);
  }

  async function createAndRead(name, rows, http, clock, input) {
    const C = cfg();
    const folder = await glanceFolder(http);
    if (folder && folder.ok === false) return folder;
    const meta = withGlance(Object.assign({ name: name, mimeType: SHEET_MIME }, folder && folder.id ? { parents: [folder.id] } : {}), input, name, clock);
    const posted = await uploadCsv(http, UPLOAD, meta, rows);
    const denied = authFail(posted);
    if (denied) return denied;
    const base = baseOf(name, rows);
    if (!posted.ok) return Object.assign({ ok: false, reason: 'http-' + posted.status, ref: null, proof: null }, base);
    const file = posted.json || {};
    if (!file.id) return Object.assign({ ok: false, reason: 'proof_pending', ref: null, proof: null }, base);

    async function failClean(reason) {
      const cleanedUp = await trashCreated(http, file.id);
      return Object.assign({
        ok: false,
        reason: reason,
        ref: { spreadsheetId: file.id, externalId: file.id, created: true, rows: rows },
        proof: null,
        cleanedUp: cleanedUp
      }, base);
    }

    const got = await call(http, { method: 'GET', url: fileUrl(file.id) });
    const gotDenied = authFail(got);
    if (gotDenied) {
      gotDenied.cleanedUp = await trashCreated(http, file.id);
      return gotDenied;
    }
    if (!got.ok || !got.json || got.json.id !== file.id || got.json.trashed === true || got.json.mimeType !== SHEET_MIME) {
      return failClean('verify_failed');
    }
    const exported = await readExport(http, file.id, clock);
    if (exported && exported.ok === false && exported.reason) {
      exported.cleanedUp = await trashCreated(http, file.id);
      return exported;
    }
    if (!exported.ok || !sameGrid(parseCsv(exported.text || ''), rows)) return failClean('verify_failed');
    const link = sheetLink(got.json, file.id);
    base.url = link;
    const range = a1(1, rows);
    const ref = {
      spreadsheetId: file.id,
      externalId: file.id + '!' + range,
      updatedRange: range,
      created: true,
      rows: rows,
      row: rows.length === 1 ? rows[0] : rows[0],
      startRow: 1,
      name: (got.json && got.json.name) || name,
      snapshot: fileSnapshot(got.json)
    };
    const proof = C && C.proofOf(SYSTEM, ref.externalId, link, C.clockIso(clock));
    if (!proof) return Object.assign({ ok: false, reason: 'proof_pending', ref: ref, proof: null }, base);
    return Object.assign({ ok: true, ref: ref, proof: proof }, base);
  }

  async function write(input, http, clock) {
    const C = cfg();
    const i = input || {};
    const blocked = C && C.gate(i.scopes, C.SCOPE_DRIVE_FILE, 'drive-not-granted');
    if (blocked) return blocked;
    const rows = rowsOf(i);
    if (!rows) return { ok: false, reason: 'unclear' };
    const existing = sheetId(i.spreadsheetId);
    const name = safeName(i.name || i.title || '') || (existing || 'Sheet');
    if (existing) {
      if (!ours(i)) return { ok: false, reason: 'not-ours' };
      return appendRows(existing, rows, http, clock, name, i);
    }
    const found = await findThreadSheet(http, i);
    if (found && found.ok === false) return found;
    if (found && found.id) return appendRows(found.id, rows, http, clock, safeName(found.name) || name, i);
    const title = safeName(i.name || i.title || 'Sheet');
    if (!title) return { ok: false, reason: 'unclear' };
    return createAndRead(title, rows, http, clock, i);
  }

  function writtenRows(ref) {
    if (ref && Array.isArray(ref.rows) && ref.rows.length) return ref.rows;
    if (ref && Array.isArray(ref.row) && ref.row.length && !Array.isArray(ref.row[0])) return [ref.row];
    return null;
  }

  async function undo(ref, http) {
    const id = sheetId(ref && (ref.spreadsheetId || ''));
    if (!id) return { ok: false, reason: 'unclear' };
    const rows = writtenRows(ref);
    if (!rows) return unconfirmedResult();
    if (ref.created === true) {
      const got = await call(http, { method: 'GET', url: exportUrl(id) });
      if (got.status === 401 || got.status === 403) return { ok: false, reason: 'not-connected' };
      if (got.status === 404) return unconfirmedResult();
      if (!got.ok || got.status === 0) return unconfirmedResult();
      const parsed = parseCsv(got.text || '');
      if (!sameGrid(parsed, rows)) return editedResult();
      const file = await call(http, { method: 'GET', url: fileUrl(id) });
      if (file.status === 401 || file.status === 403) return { ok: false, reason: 'not-connected' };
      if (file.status === 404) return { ok: true, written: 'Sheet removed.' };
      if (!file.ok || file.status === 0) return unconfirmedResult();
      if (ref.name && file.json && file.json.name && String(file.json.name) !== String(ref.name)) return editedResult();
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
    const start = Number(ref.startRow) || 0;
    const end = Number(ref.endRow) || (start + rows.length - 1);
    if (!start || !end || !Number.isInteger(ref.sheetId)) return unconfirmedResult();
    const read = await call(http, {
      method: 'GET',
      url: SHEETS + encodeURIComponent(id) + '/values/' + encodeURIComponent(ref.updatedRange)
    });
    if (read.status === 401 || read.status === 403) return { ok: false, reason: 'not-connected' };
    if (!read.ok || read.status === 0) return unconfirmedResult();
    if (!valuesMatch(read.json, rows)) return editedResult();
    const del = await call(http, {
      method: 'POST',
      url: SHEETS + encodeURIComponent(id) + ':batchUpdate',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{
          deleteDimension: {
            range: { sheetId: ref.sheetId, dimension: 'ROWS', startIndex: start - 1, endIndex: end }
          }
        }]
      })
    });
    if (del.status === 401 || del.status === 403) return { ok: false, reason: 'not-connected' };
    if (!del.ok) return { ok: false, reason: 'http-' + (del.status || 0) };
    const after = await call(http, {
      method: 'GET',
      url: SHEETS + encodeURIComponent(id) + '/values/' + encodeURIComponent(ref.updatedRange)
    });
    if (after.status === 401 || after.status === 403) return { ok: false, reason: 'not-connected' };
    if (!after.ok && after.status !== 404 && after.status !== 400) return unconfirmedResult();
    if (after.ok && valuesMatch(after.json, rows)) return { ok: false, reason: 'verify_failed' };
    return { ok: true, written: 'Sheet row removed.' };
  }

  return {
    SYSTEM: SYSTEM,
    CONNECTOR: CONNECTOR,
    rowOf: rowOf,
    rowsOf: rowsOf,
    toCsv: toCsv,
    parseCsv: parseCsv,
    listGlanceSheets: listGlanceSheets,
    listAccessible: listAccessible,
    parseSheetLink: parseSheetLink,
    probeSheet: probeSheet,
    NO_ACCESS: NO_ACCESS,
    write: write,
    undo: undo,
    FOLDER_NAME: FOLDER_NAME
  };
})();

if (typeof module !== 'undefined') module.exports = { FlowGoogleSheets };
else if (typeof globalThis !== 'undefined') globalThis.FlowGoogleSheets = FlowGoogleSheets;
