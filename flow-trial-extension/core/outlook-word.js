// One .docx on the person's OneDrive. A new file is Handled when its item id
// is read back. An existing file is Handled only when the inserted text is in
// the file content. Undo deletes a file this write created, or restores the
// previous version, only when both eTag and lastModifiedDateTime are present
// and unchanged since that write. A missing or changed stamp is file-changed
// and nothing is deleted or restored. Files.ReadWrite. Never sends.
// No network here: pass call().
const FlowOutlookWord = (() => {
  const CONNECTOR = 'outlookWord';
  const SYSTEM = 'microsoft/word';
  const WRITE_SCOPE = 'Files.ReadWrite';
  const CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

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

  function safeDocx(name) {
    const s = String(name || '').replace(/[\u0000-\u001f]/g, '').trim();
    if (!s || s.length > 80) return '';
    if (/[\\/]/.test(s) || s.indexOf('..') !== -1) return '';
    if (!/^[A-Za-z0-9][\w.-]{0,70}\.docx$/i.test(s)) return '';
    return s;
  }

  function xml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
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
    parts.forEach((p) => {
      out.set(p, o);
      o += p.length;
    });
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

  function docxBytes(text) {
    const enc = new TextEncoder();
    const documentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:body><w:p><w:r><w:t xml:space="preserve">' + xml(text) + '</w:t></w:r></w:p></w:body></w:document>';
    const types = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '</Types>';
    const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '</Relationships>';
    const docRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
    return zipStore([
      { name: '[Content_Types].xml', data: enc.encode(types) },
      { name: '_rels/.rels', data: enc.encode(rels) },
      { name: 'word/document.xml', data: enc.encode(documentXml) },
      { name: 'word/_rels/document.xml.rels', data: enc.encode(docRels) }
    ]);
  }

  function contentFrom(text) {
    const m = String(text || '').match(/\.docx\b[^\n]{0,40}\bwith\b\s+([^\n]{1,500})/i);
    return m ? m[1].trim() : '';
  }

  function payloadText(body) {
    if (typeof body === 'string') return body;
    if (body && typeof body.text === 'string') return body.text;
    if (body && typeof body.length === 'number' && typeof body.byteLength === 'number') {
      try { return new TextDecoder().decode(body); } catch (e) { return ''; }
    }
    return '';
  }

  function inserted(payload, content) {
    if (!payload) return false;
    if (content) return payload.indexOf(xml(content)) >= 0 || payload.indexOf(content) >= 0;
    return payload.indexOf('word/document.xml') >= 0;
  }

  function offer(ctx) {
    const text = String((ctx && (ctx.text || ctx.body)) || '');
    if (!/\b(?:create|write|edit|update|prepare)\b[\s\S]{0,80}\b(?:word document|\.docx)\b/i.test(text)) return { show: false };
    const found = text.match(/([A-Za-z0-9][\w.-]{0,60}\.docx)\b/i);
    const fileName = found ? safeDocx(found[1]) : '';
    if (!fileName) return { show: false };
    const content = contentFrom(text);
    return {
      show: true,
      connectorId: CONNECTOR,
      title: 'Word',
      lines: [
        { label: 'File', value: fileName },
        { label: 'Text', value: content }
      ],
      button: 'Write',
      closes: true,
      params: { fileName: fileName, content: content }
    };
  }

  function versionIdOf(body) {
    const rows = body && Array.isArray(body.value) ? body.value : [];
    const first = rows[0];
    return first && first.id ? String(first.id) : '';
  }

  function prove(itemId, deps) {
    const Proof = globalThis.FlowProofOfClose;
    if (!Proof || typeof Proof.buildProof !== 'function') return null;
    return Proof.buildProof({
      system: SYSTEM,
      externalId: String(itemId),
      fetchedBack: true,
      verifiedAt: deps && typeof deps.now === 'function' ? deps.now() : ''
    });
  }

  function logRow(messageId, itemId, ref) {
    return {
      kind: 'written',
      fetchedBack: true,
      externalId: String(itemId),
      connectorId: CONNECTOR,
      system: SYSTEM,
      where: 'OneDrive',
      event: 'word-write',
      messageId: messageId || '',
      ref: ref
    };
  }

  async function run(input, deps) {
    const params = (input && input.params) || {};
    const fileName = safeDocx((input && input.fileName) || params.fileName);
    if (!fileName) return { ok: false, reason: 'unclear' };
    const call = deps && deps.call;
    if (typeof call !== 'function') return { ok: false, reason: 'unclear' };
    if (hasWriteScope(deps.grantedScopes) === false) return { ok: false, reason: 'files-not-granted' };
    const content = typeof params.content === 'string' ? params.content : (typeof input.content === 'string' ? input.content : '');
    const bytes = docxBytes(content);
    const lookup = await call({ method: 'GET', path: '/me/drive/root:/' + encodeURIComponent(fileName) });
    let itemId = '';
    let created = false;
    let previousVersionId = '';
    if (lookup && lookup.status === 404) {
      const put = await call({
        method: 'PUT',
        path: '/me/drive/root:/' + encodeURIComponent(fileName) + ':/content',
        raw: bytes,
        contentType: CONTENT_TYPE
      });
      if (!put || put.ok !== true || !put.body || !put.body.id) return { ok: false, reason: 'write-failed' };
      itemId = String(put.body.id);
      created = true;
    } else if (lookup && lookup.ok === true && lookup.body && lookup.body.id) {
      itemId = String(lookup.body.id);
      const versions = await call({ method: 'GET', path: '/me/drive/items/' + encodeURIComponent(itemId) + '/versions?$top=1' });
      previousVersionId = versionIdOf(versions && versions.body);
      if (!previousVersionId) return { ok: false, reason: 'unclear' };
      const put = await call({
        method: 'PUT',
        path: '/me/drive/items/' + encodeURIComponent(itemId) + '/content',
        raw: bytes,
        contentType: CONTENT_TYPE
      });
      if (!put || put.ok !== true) return { ok: false, reason: 'write-failed' };
    } else {
      return { ok: false, reason: 'unclear', status: lookup && lookup.status };
    }
    const back = await call({ method: 'GET', path: '/me/drive/items/' + encodeURIComponent(itemId) });
    if (!back || back.ok !== true || !back.body || String(back.body.id) !== itemId) {
      return { ok: false, reason: 'verify_failed', proof: null };
    }
    if (!created) {
      const file = await call({ method: 'GET', path: '/me/drive/items/' + encodeURIComponent(itemId) + '/content' });
      if (!file || file.ok !== true || !inserted(payloadText(file.body), content)) {
        return { ok: false, reason: 'verify_failed', proof: null };
      }
    }
    const proof = prove(itemId, deps);
    if (!proof) return { ok: false, reason: 'verify_failed', proof: null };
    const ref = {
      fileId: itemId,
      itemId: itemId,
      externalId: itemId,
      created: created,
      previousVersionId: previousVersionId,
      eTag: back.body.eTag ? String(back.body.eTag) : '',
      lastModifiedDateTime: back.body.lastModifiedDateTime ? String(back.body.lastModifiedDateTime) : ''
    };
    return {
      ok: true,
      connectorId: CONNECTOR,
      proof: proof,
      fetchedBack: true,
      ref: ref,
      written: (created ? 'Created ' : 'Updated ') + fileName + '.',
      log: logRow(input && input.messageId, itemId, ref)
    };
  }

  async function stampGate(ref, call, itemId) {
    if (!ref.eTag || !ref.lastModifiedDateTime) return 'file-changed';
    const fresh = await call({ method: 'GET', path: '/me/drive/items/' + encodeURIComponent(itemId) });
    const body = fresh && fresh.body;
    if (!fresh || fresh.ok !== true || !body) return 'undo-failed';
    if (!body.eTag || !body.lastModifiedDateTime) return 'file-changed';
    if (String(body.eTag) !== String(ref.eTag)) return 'file-changed';
    if (String(body.lastModifiedDateTime) !== String(ref.lastModifiedDateTime)) return 'file-changed';
    return '';
  }

  async function undo(ref, deps) {
    const call = deps && deps.call;
    const itemId = ref && (ref.itemId || ref.fileId);
    if (!itemId || typeof call !== 'function') return { ok: false, reason: 'unclear' };
    const gate = await stampGate(ref, call, itemId);
    if (gate) return { ok: false, reason: gate };
    if (ref.created) {
      const del = await call({ method: 'DELETE', path: '/me/drive/items/' + encodeURIComponent(itemId) });
      if (!del || del.ok !== true) return { ok: false, reason: 'undo-failed' };
      return {
        ok: true,
        written: 'Undone. The new file was deleted.',
        log: { kind: 'undone', connectorId: CONNECTOR, system: SYSTEM, externalId: String(itemId), messageId: '', where: 'OneDrive', ref: ref }
      };
    }
    if (!ref.previousVersionId) return { ok: false, reason: 'undo-unavailable' };
    const restored = await call({
      method: 'POST',
      path: '/me/drive/items/' + encodeURIComponent(itemId) + '/versions/' + encodeURIComponent(ref.previousVersionId) + '/restoreVersion'
    });
    if (!restored || restored.ok !== true) return { ok: false, reason: 'undo-failed' };
    return {
      ok: true,
      written: 'Undone. The previous version was restored.',
      log: { kind: 'undone', connectorId: CONNECTOR, system: SYSTEM, externalId: String(itemId), messageId: '', where: 'OneDrive', ref: ref }
    };
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
    CONTENT_TYPE: CONTENT_TYPE,
    hasWriteScope: hasWriteScope,
    safeDocx: safeDocx,
    docxBytes: docxBytes,
    offer: offer,
    run: run,
    undo: undo,
    receiptFromLog: receiptFromLog
  };
})();

if (typeof globalThis !== 'undefined') globalThis.FlowOutlookWord = FlowOutlookWord;
if (typeof module !== 'undefined') module.exports = { FlowOutlookWord };
else if (typeof globalThis !== 'undefined') globalThis.FlowOutlookWord = FlowOutlookWord;
