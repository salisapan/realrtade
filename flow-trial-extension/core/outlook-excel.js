// Append one row or create one table through the Graph workbook API.
// An append is Handled only when the row read back at the index returned by
// the append is that same index. Undo of an append deletes that row only after
// a read-back still matches its cells, and never the workbook. Undo deletes a
// workbook this write created only when both eTag and lastModifiedDateTime are
// present and unchanged since that write. A missing or changed stamp is
// file-changed and the workbook stays. Files.ReadWrite. Never sends.
// No network in this file: pass call().
const FlowOutlookExcel = (() => {
  const CONNECTOR = 'outlookExcel';
  const SYSTEM = 'microsoft/excel';
  const WRITE_SCOPE = 'Files.ReadWrite';
  const CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const MAX_COLS = 8;
  const MAX_CELL = 200;

  function scopeList(scopes) {
    if (scopes == null) return null;
    if (Array.isArray(scopes)) return scopes.map((s) => String(s || '').trim()).filter(Boolean);
    if (typeof scopes === 'string') return scopes.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    return null;
  }

  function hasWriteScope(scopes) {
    const list = scopeList(scopes);
    if (!list) return null;
    return list.some((s) => s === WRITE_SCOPE || s === 'https://graph.microsoft.com/' + WRITE_SCOPE);
  }

  function safeXlsx(name) {
    const s = String(name || '').replace(/[\u0000-\u001f]/g, '').trim();
    if (!s || s.length > 80) return '';
    if (/[\\/]/.test(s) || s.indexOf('..') !== -1) return '';
    if (!/^[A-Za-z0-9][\w.-]{0,70}\.xlsx$/i.test(s)) return '';
    return s;
  }

  function cellsOf(list) {
    const raw = Array.isArray(list) ? list : String(list == null ? '' : list).split(',');
    const cells = raw.slice(0, MAX_COLS).map((cell) => String(cell == null ? '' : cell).replace(/[\u0000-\u001f]/g, '').trim().slice(0, MAX_CELL));
    if (cells.length) cells[cells.length - 1] = cells[cells.length - 1].replace(/[.,;:!?]+$/g, '');
    return cells;
  }

  function sameRow(left, right) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    for (let i = 0; i < left.length; i++) if (String(left[i]) !== String(right[i])) return false;
    return left.length > 0;
  }

  function colLetter(index) {
    return String.fromCharCode(65 + index);
  }

  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) {
      c ^= bytes[i];
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
    }
    return (~c) >>> 0;
  }

  function u16(n) { return [n & 255, (n >>> 8) & 255]; }
  function u32(n) { return [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]; }

  function concat(parts) {
    let n = 0;
    parts.forEach((p) => { n += p.length; });
    const out = new Uint8Array(n);
    let o = 0;
    parts.forEach((p) => { out.set(p, o); o += p.length; });
    return out;
  }

  function zipStore(files) {
    const enc = new TextEncoder();
    const locals = [];
    const centrals = [];
    let offset = 0;
    files.forEach((file) => {
      const name = enc.encode(file.name);
      const data = file.data;
      const crc = crc32(data);
      const local = concat([
        new Uint8Array(u32(0x04034b50).concat(u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0))),
        name,
        data
      ]);
      const central = concat([
        new Uint8Array(u32(0x02014b50).concat(u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset))),
        name
      ]);
      locals.push(local);
      centrals.push(central);
      offset += local.length;
    });
    const centralBlob = concat(centrals);
    const eocd = new Uint8Array(u32(0x06054b50).concat(u16(0), u16(0), u16(files.length), u16(files.length), u32(centralBlob.length), u32(offset), u16(0)));
    return concat(locals.concat([centralBlob, eocd]));
  }

  function xlsxBytes() {
    const enc = new TextEncoder();
    const types = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '</Types>';
    const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>';
    const book = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>';
    const bookRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
      '</Relationships>';
    const sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData></sheetData></worksheet>';
    return zipStore([
      { name: '[Content_Types].xml', data: enc.encode(types) },
      { name: '_rels/.rels', data: enc.encode(rels) },
      { name: 'xl/workbook.xml', data: enc.encode(book) },
      { name: 'xl/_rels/workbook.xml.rels', data: enc.encode(bookRels) },
      { name: 'xl/worksheets/sheet1.xml', data: enc.encode(sheet) }
    ]);
  }

  function offer(ctx) {
    const text = String((ctx && (ctx.text || ctx.body)) || '');
    const found = text.match(/([A-Za-z0-9][\w.-]{0,60}\.xlsx)\b/i);
    const fileName = found ? safeXlsx(found[1]) : '';
    if (!fileName) return { show: false };
    const append = /\b(?:add|append)\b[\s\S]{0,40}\brow\b/i.test(text);
    const table = /\bcreate\b[\s\S]{0,40}\btable\b/i.test(text);
    if (append) {
      const row = text.match(/\.xlsx\b[^\n]{0,30}:\s*([^\n]{1,400})/i);
      const values = cellsOf(row ? row[1] : '');
      if (!values.some((cell) => cell)) return { show: false };
      return {
        show: true,
        connectorId: CONNECTOR,
        title: 'Excel',
        lines: [{ label: 'File', value: fileName }, { label: 'Row', value: values.join(', ') }],
        button: 'Add row',
        closes: true,
        params: { fileName: fileName, mode: 'append', values: values }
      };
    }
    if (!table) return { show: false };
    const cols = text.match(/\bwith columns\b\s+([^\n]{1,200})/i);
    const columns = cellsOf(cols ? cols[1] : '');
    if (!columns.some((cell) => cell)) return { show: false };
    return {
      show: true,
      connectorId: CONNECTOR,
      title: 'Excel',
      lines: [{ label: 'File', value: fileName }, { label: 'Columns', value: columns.join(', ') }],
      button: 'Create table',
      closes: true,
      params: { fileName: fileName, mode: 'table', columns: columns }
    };
  }

  function prove(externalId, deps) {
    const Proof = globalThis.FlowProofOfClose;
    if (!Proof || typeof Proof.buildProof !== 'function') return null;
    return Proof.buildProof({
      system: SYSTEM,
      externalId: String(externalId),
      fetchedBack: true,
      verifiedAt: deps && typeof deps.now === 'function' ? deps.now() : ''
    });
  }

  function rowList(body) {
    return body && Array.isArray(body.value) ? body.value : [];
  }

  function rowCells(row) {
    if (!row || !Array.isArray(row.values)) return [];
    const first = row.values[0];
    return Array.isArray(first) ? first.map((cell) => String(cell)) : row.values.map((cell) => String(cell));
  }

  async function run(input, deps) {
    const params = (input && input.params) || {};
    const fileName = safeXlsx((input && input.fileName) || params.fileName);
    const mode = params.mode === 'table' || params.mode === 'append' ? params.mode : '';
    if (!fileName || !mode) return { ok: false, reason: 'unclear' };
    const call = deps && deps.call;
    if (typeof call !== 'function') return { ok: false, reason: 'unclear' };
    if (hasWriteScope(deps.grantedScopes) === false) return { ok: false, reason: 'files-not-granted' };
    const lookup = await call({ method: 'GET', path: '/me/drive/root:/' + encodeURIComponent(fileName) });
    let itemId = '';
    let createdFile = false;
    if (lookup && lookup.status === 404) {
      if (mode === 'append') return { ok: false, reason: 'unclear' };
      const put = await call({
        method: 'PUT',
        path: '/me/drive/root:/' + encodeURIComponent(fileName) + ':/content',
        raw: xlsxBytes(),
        contentType: CONTENT_TYPE
      });
      if (!put || put.ok !== true || !put.body || !put.body.id) return { ok: false, reason: 'write-failed' };
      itemId = String(put.body.id);
      createdFile = true;
    } else if (lookup && lookup.ok === true && lookup.body && lookup.body.id) {
      itemId = String(lookup.body.id);
    } else {
      return { ok: false, reason: 'unclear' };
    }
    const base = '/me/drive/items/' + encodeURIComponent(itemId);
    let stamp = { eTag: '', lastModifiedDateTime: '' };
    if (createdFile) {
      const meta = await call({ method: 'GET', path: base });
      const metaBody = meta && meta.body;
      if (meta && meta.ok === true && metaBody) {
        stamp = {
          eTag: metaBody.eTag ? String(metaBody.eTag) : '',
          lastModifiedDateTime: metaBody.lastModifiedDateTime ? String(metaBody.lastModifiedDateTime) : ''
        };
      }
    }
    let sessionId = '';
    let outcome = { ok: false, reason: 'unclear' };
    try {
      const sess = await call({ method: 'POST', path: base + '/workbook/createSession', body: { persistChanges: true } });
      if (!sess || sess.ok !== true || !sess.body || !sess.body.id) {
        outcome = { ok: false, reason: 'session-failed' };
      } else {
        sessionId = String(sess.body.id);
        const headers = { 'workbook-session-id': sessionId };
        if (mode === 'table') {
          const columns = cellsOf(params.columns);
          if (!columns.some((cell) => cell)) outcome = { ok: false, reason: 'unclear' };
          else {
            const addr = 'A1:' + colLetter(columns.length - 1) + '1';
            const range = await call({
              method: 'PATCH',
              path: base + "/workbook/worksheets/Sheet1/range(address='" + addr + "')",
              headers: headers,
              body: { values: [columns] }
            });
            const added = range && range.ok === true
              ? await call({
                method: 'POST',
                path: base + '/workbook/tables/add',
                headers: headers,
                body: { address: 'Sheet1!' + addr, hasHeaders: true }
              })
              : null;
            const tableId = added && added.body && added.body.id ? String(added.body.id) : '';
            const rows = tableId
              ? await call({ method: 'GET', path: base + '/workbook/tables/' + encodeURIComponent(tableId) + '/rows', headers: headers })
              : null;
            const hit = rowList(rows && rows.body).find((row) => sameRow(rowCells(row), columns));
            if (!tableId || !hit) outcome = { ok: false, reason: 'verify_failed', proof: null };
            else outcome = finish(input, deps, itemId, tableId, hit.index, {
              createdFile: createdFile,
              createdTable: true,
              eTag: stamp.eTag,
              lastModifiedDateTime: stamp.lastModifiedDateTime
            });
          }
        } else {
          const values = cellsOf(params.values);
          const tables = await call({ method: 'GET', path: base + '/workbook/tables', headers: headers });
          const list = tables && tables.body && Array.isArray(tables.body.value) ? tables.body.value : [];
          const table = list[0];
          if (!values.some((cell) => cell) || !table || !table.id) outcome = { ok: false, reason: 'unclear' };
          else {
            const tableId = String(table.id);
            const added = await call({
              method: 'POST',
              path: base + '/workbook/tables/' + encodeURIComponent(tableId) + '/rows/add',
              headers: headers,
              body: { values: [values] }
            });
            const addedIndex = added && added.body ? Number(added.body.index) : NaN;
            const seen = added && added.ok === true && Number.isInteger(addedIndex) && addedIndex >= 0
              ? await call({
                method: 'GET',
                path: base + '/workbook/tables/' + encodeURIComponent(tableId) + '/rows/itemAt(index=' + addedIndex + ')',
                headers: headers
              })
              : null;
            const seenIndex = seen && seen.body ? Number(seen.body.index) : NaN;
            if (!seen || seen.ok !== true || seenIndex !== addedIndex) outcome = { ok: false, reason: 'verify_failed', proof: null };
            else outcome = finish(input, deps, itemId, tableId, addedIndex, { createdFile: false, createdTable: false, values: values });
          }
        }
      }
    } finally {
      if (sessionId) {
        try {
          await call({
            method: 'POST',
            path: base + '/workbook/closeSession',
            headers: { 'workbook-session-id': sessionId }
          });
        } catch (e) { /* the read-back result stands */ }
      }
    }
    return outcome;
  }

  function finish(input, deps, itemId, tableId, rowIndex, flags) {
    const externalId = itemId + '/' + tableId + '/' + rowIndex;
    const proof = prove(externalId, deps);
    if (!proof) return { ok: false, reason: 'verify_failed', proof: null };
    const ref = {
      itemId: itemId,
      tableId: tableId,
      rowIndex: rowIndex,
      externalId: externalId,
      createdFile: flags.createdFile === true,
      createdTable: flags.createdTable === true,
      eTag: flags.eTag ? String(flags.eTag) : '',
      lastModifiedDateTime: flags.lastModifiedDateTime ? String(flags.lastModifiedDateTime) : '',
      values: Array.isArray(flags.values) ? flags.values.map((cell) => String(cell)) : []
    };
    return {
      ok: true,
      connectorId: CONNECTOR,
      proof: proof,
      fetchedBack: true,
      ref: ref,
      written: flags.createdTable ? 'Created the table.' : 'Added the row.',
      log: {
        kind: 'written',
        fetchedBack: true,
        externalId: externalId,
        connectorId: CONNECTOR,
        system: SYSTEM,
        where: 'OneDrive',
        event: 'excel-write',
        messageId: (input && input.messageId) || '',
        ref: ref
      }
    };
  }

  async function undo(ref, deps) {
    const call = deps && deps.call;
    if (!ref || !ref.itemId || typeof call !== 'function') return { ok: false, reason: 'unclear' };
    const base = '/me/drive/items/' + encodeURIComponent(ref.itemId);
    if (ref.createdFile === true) {
      if (!ref.eTag || !ref.lastModifiedDateTime) return { ok: false, reason: 'file-changed' };
      const fresh = await call({ method: 'GET', path: base });
      const body = fresh && fresh.body;
      if (!fresh || fresh.ok !== true || !body) return { ok: false, reason: 'undo-failed' };
      if (!body.eTag || !body.lastModifiedDateTime) return { ok: false, reason: 'file-changed' };
      if (String(body.eTag) !== String(ref.eTag) || String(body.lastModifiedDateTime) !== String(ref.lastModifiedDateTime)) {
        return { ok: false, reason: 'file-changed' };
      }
      const del = await call({ method: 'DELETE', path: base });
      if (!del || del.ok !== true) return { ok: false, reason: 'undo-failed' };
      return { ok: true, written: 'Undone. The new workbook was deleted.', log: undone(ref) };
    }
    const sess = await call({ method: 'POST', path: base + '/workbook/createSession', body: { persistChanges: true } });
    if (!sess || !sess.body || !sess.body.id) return { ok: false, reason: 'undo-failed' };
    const headers = { 'workbook-session-id': String(sess.body.id) };
    let outcome = { ok: false, reason: 'undo-failed' };
    try {
      if (ref.createdTable) {
        const del = await call({ method: 'DELETE', path: base + '/workbook/tables/' + encodeURIComponent(ref.tableId), headers: headers });
        outcome = del && del.ok === true ? { ok: true } : { ok: false, reason: 'undo-failed' };
      } else {
        const wanted = Array.isArray(ref.values) ? ref.values.map((cell) => String(cell)) : [];
        const index = Number(ref.rowIndex);
        const rowPath = base + '/workbook/tables/' + encodeURIComponent(ref.tableId) + '/rows/itemAt(index=' + index + ')';
        const seen = wanted.length
          ? await call({ method: 'GET', path: rowPath, headers: headers })
          : null;
        if (!wanted.length || !seen || seen.ok !== true || !sameRow(rowCells(seen.body), wanted)) {
          outcome = { ok: false, reason: 'row-changed' };
        } else {
          const del = await call({ method: 'POST', path: rowPath + '/delete', headers: headers });
          outcome = del && del.ok === true ? { ok: true } : { ok: false, reason: 'undo-failed' };
        }
      }
    } finally {
      try { await call({ method: 'POST', path: base + '/workbook/closeSession', headers: headers }); } catch (e) { /* undo result stands */ }
    }
    if (!outcome.ok) return outcome;
    return {
      ok: true,
      written: ref.createdTable ? 'Undone. The new table was deleted.' : 'Undone. That row was deleted.',
      log: undone(ref)
    };
  }

  function undone(ref) {
    return { kind: 'undone', connectorId: CONNECTOR, system: SYSTEM, externalId: ref.externalId || '', messageId: '', where: 'OneDrive', ref: ref };
  }

  function receiptFromLog(log, pane) {
    const rows = Array.isArray(log) ? log : [];
    const ids = [];
    if (pane) [pane.itemId, pane.messageId, pane.rawUrlId, pane.pathId].forEach((id) => { if (id) ids.push(String(id)); });
    if (!ids.length) return null;
    for (let i = rows.length - 1; i >= 0; i--) {
      const row = rows[i];
      if (!row || row.connectorId !== CONNECTOR) continue;
      if (row.messageId && ids.indexOf(String(row.messageId)) < 0) continue;
      if (row.kind === 'undone') return null;
      if (row.kind === 'written' && row.fetchedBack === true && row.externalId) return row;
    }
    return null;
  }

  return {
    CONNECTOR: CONNECTOR,
    SYSTEM: SYSTEM,
    hasWriteScope: hasWriteScope,
    safeXlsx: safeXlsx,
    cellsOf: cellsOf,
    xlsxBytes: xlsxBytes,
    offer: offer,
    run: run,
    undo: undo,
    receiptFromLog: receiptFromLog
  };
})();

if (typeof globalThis !== 'undefined') globalThis.FlowOutlookExcel = FlowOutlookExcel;
if (typeof module !== 'undefined') module.exports = { FlowOutlookExcel };
else if (typeof globalThis !== 'undefined') globalThis.FlowOutlookExcel = FlowOutlookExcel;
