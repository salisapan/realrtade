// Save one attachment to Drive with drive.file. The file is one Glance
// creates. Undo trashes that file. Handled waits for a GET of the id.
// Portable: no chrome.*, no DOM, no network. A mail does not search Drive.
const FlowGoogleDrive = (() => {
  const SYSTEM = 'google/drive';
  const CONNECTOR = 'googleDriveSave';
  const MAX_BYTES = 4 * 1024 * 1024;
  const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=' + encodeURIComponent('id,name,mimeType,trashed');
  const FILES = 'https://www.googleapis.com/drive/v3/files/';

  function cfg() {
    return typeof FlowGoogleConfig !== 'undefined' ? FlowGoogleConfig : null;
  }

  function hasWriteScope(scopes) {
    const C = cfg();
    if (!C) return null;
    return C.hasScope(scopes, C.SCOPE_DRIVE_FILE);
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

  function bytesFromBase64(b64) {
    const clean = String(b64 || '').replace(/\s/g, '');
    if (!clean) return null;
    try {
      const bin = atob(clean);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 255;
      return out;
    } catch (e) {
      return null;
    }
  }

  function fileBytes(input) {
    const i = input || {};
    const att = i.attachment || (i.params && i.params.attachment) || {};
    if (i.bytes instanceof Uint8Array) return i.bytes;
    if (att.bytes instanceof Uint8Array) return att.bytes;
    const b64 = i.base64 || att.base64 || att.contentBytes;
    return bytesFromBase64(b64);
  }

  function prepare(input) {
    const i = input || {};
    const att = i.attachment || (i.params && i.params.attachment) || {};
    const name = safeName(i.fileName || i.name || att.filename || att.name || '');
    const bytes = fileBytes(i);
    if (!name || !bytes || !bytes.length || bytes.length > MAX_BYTES) return { ok: false, reason: 'unclear' };
    const mime = String(i.mimeType || att.mimeType || att.contentType || 'application/octet-stream').split(';')[0].trim() || 'application/octet-stream';
    if (!/^[\w.+-]+\/[\w.+-]+$/.test(mime) || mime.length > 120) return { ok: false, reason: 'unclear' };
    return { ok: true, name: name, bytes: bytes, mimeType: mime };
  }

  function multipart(meta, mediaType, bytes) {
    const boundary = 'glance_lane_drive';
    const head = '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(meta) + '\r\n--' + boundary + '\r\nContent-Type: ' + mediaType + '\r\n\r\n';
    const tail = '\r\n--' + boundary + '--';
    const h = new TextEncoder().encode(head);
    const t = new TextEncoder().encode(tail);
    const body = new Uint8Array(h.length + bytes.length + t.length);
    body.set(h, 0);
    body.set(bytes, h.length);
    body.set(t, h.length + bytes.length);
    return { contentType: 'multipart/related; boundary=' + boundary, body: body };
  }

  function fileUrl(id) {
    return FILES + encodeURIComponent(id) + '?fields=' + encodeURIComponent('id,name,mimeType,trashed');
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

  async function write(input, http, clock) {
    const C = cfg();
    const i = input || {};
    const blocked = C && C.gate(i.scopes, C.SCOPE_DRIVE_FILE, 'drive-not-granted');
    if (blocked) return blocked;
    const ready = prepare(i);
    if (!ready.ok) return { ok: false, reason: ready.reason || 'unclear' };
    const packed = multipart({ name: ready.name, mimeType: ready.mimeType }, ready.mimeType, ready.bytes);
    const posted = await call(http, {
      method: 'POST',
      url: UPLOAD,
      headers: { 'Content-Type': packed.contentType },
      body: packed.body
    });
    if (posted.status === 401 || posted.status === 403) return { ok: false, reason: 'not-connected' };
    if (!posted.ok) return { ok: false, reason: 'http-' + posted.status };
    const file = posted.json || {};
    const base = { where: 'Google Drive', target: ready.name, written: 'Drive · ' + ready.name, url: null };
    if (!file.id) return Object.assign({ ok: false, reason: 'proof_pending', ref: null, proof: null }, base);
    const got = await call(http, { method: 'GET', url: fileUrl(file.id) });
    if (!got.ok || !got.json || got.json.id !== file.id || got.json.trashed === true) {
      return Object.assign({ ok: false, reason: 'verify_failed', ref: { fileId: file.id, externalId: file.id, created: true }, proof: null }, base);
    }
    const link = 'https://drive.google.com/file/d/' + encodeURIComponent(file.id) + '/view';
    base.url = link;
    const proof = C && C.proofOf(SYSTEM, file.id, link, C.clockIso(clock));
    if (!proof) return Object.assign({ ok: false, reason: 'proof_pending', ref: { fileId: file.id, externalId: file.id, created: true }, proof: null }, base);
    return Object.assign({ ok: true, ref: { fileId: file.id, externalId: file.id, created: true }, proof: proof }, base);
  }

  async function undo(ref, http) {
    const id = ref && (ref.externalId || ref.fileId);
    if (!id || ref.created !== true) return { ok: false, reason: 'unclear' };
    const del = await call(http, {
      method: 'PATCH',
      url: FILES + encodeURIComponent(id),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trashed: true })
    });
    if (del.status === 401 || del.status === 403) return { ok: false, reason: 'not-connected' };
    if (del.ok || del.status === 204 || del.status === 404) return { ok: true, written: 'Drive file removed.' };
    return { ok: false, reason: 'http-' + del.status };
  }

  return {
    SYSTEM: SYSTEM,
    CONNECTOR: CONNECTOR,
    MAX_BYTES: MAX_BYTES,
    hasWriteScope: hasWriteScope,
    safeName: safeName,
    prepare: prepare,
    multipart: multipart,
    write: write,
    undo: undo
  };
})();

if (typeof module !== 'undefined') module.exports = { FlowGoogleDrive };
else if (typeof globalThis !== 'undefined') globalThis.FlowGoogleDrive = FlowGoogleDrive;
