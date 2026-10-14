// One OneDrive file for a save-the-attachment close. Portable: no chrome.*,
// no DOM, no network. The service worker uploads, reads the item back, and
// undoes. Handled is the proof in proof-of-close.js, not this file.
// Files.ReadWrite is the checkbox scope. Files.Read cannot write.
// Files.ReadWrite.All is not this scope. A mail does not search OneDrive.
const FlowOnedriveFile = (() => {
  const SYSTEM = 'microsoft/onedrive';
  const CONNECTOR = 'onedriveFile';
  const WRITE_SCOPE = 'Files.ReadWrite';
  const MAX_BYTES = 4 * 1024 * 1024;

  function scopeList(scopes) {
    if (scopes == null) return null;
    if (Array.isArray(scopes)) return scopes.map((s) => String(s || '').trim()).filter(Boolean);
    if (typeof scopes === 'string') return scopes.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    return null;
  }

  // null: the token did not say which scopes it holds, so the host may try
  // and a 403 fails closed. false: the list is known and this scope is absent.
  function hasWriteScope(scopes) {
    const list = scopeList(scopes);
    if (!list) return null;
    return list.some((s) => s === WRITE_SCOPE || s === 'https://graph.microsoft.com/' + WRITE_SCOPE);
  }

  function safeName(name) {
    let s = String(name || '').replace(/[\u0000-\u001f]/g, '');
    s = s.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!s || s.indexOf('..') !== -1) return '';
    s = s.replace(/^\.+/, '').replace(/\.+$/, '').trim();
    if (!s || s === '.' || s === '..' || s.indexOf('..') !== -1) return '';
    if (s.length > 120) s = s.slice(0, 120).trim();
    return s;
  }

  function encodeName(name) {
    return encodeURIComponent(name);
  }

  function rootItemPath(name) {
    return '/me/drive/root:/' + encodeName(name);
  }

  function createContentPath(name) {
    return '/me/drive/root:/' + encodeName(name) + ':/content';
  }

  function itemPath(id) {
    return '/me/drive/items/' + encodeURIComponent(id);
  }

  function itemContentPath(id) {
    return '/me/drive/items/' + encodeURIComponent(id) + '/content';
  }

  function versionsPath(id) {
    return '/me/drive/items/' + encodeURIComponent(id) + '/versions?$top=1';
  }

  function restorePath(id, versionId) {
    return '/me/drive/items/' + encodeURIComponent(id) + '/versions/' + encodeURIComponent(versionId) + '/restoreVersion';
  }

  function attachmentsPath(messageId) {
    return '/me/messages/' + encodeURIComponent(messageId) + '/attachments';
  }

  function attachmentItemPath(messageId, attachmentId) {
    return '/me/messages/' + encodeURIComponent(messageId) + '/attachments/' + encodeURIComponent(attachmentId);
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

  function textBytes(value) {
    return new TextEncoder().encode(String(value));
  }

  function chooseName(input) {
    const i = input || {};
    const params = i.params || {};
    const att = i.attachment || params.attachment || {};
    const raw = i.fileName || params.fileName || i.fileTerm || params.fileTerm || att.filename || att.name || '';
    let locked = Boolean(String(raw || '').trim());
    let name = safeName(raw);
    if (!name) {
      locked = false;
      let stem = '';
      const Title = typeof globalThis !== 'undefined' ? globalThis.FlowCommitmentTitle : null;
      if (Title && typeof Title.fromPayload === 'function') stem = Title.fromPayload(i);
      name = safeName((stem || 'note') + '.txt');
    }
    if (name && name.indexOf('.') < 0) name = safeName(name + '.txt');
    return { name: name, nameLocked: locked && Boolean(name) };
  }

  function inlineBytes(input) {
    const i = input || {};
    const params = i.params || {};
    if (typeof params.content === 'string' && params.content) {
      return { bytes: textBytes(params.content), contentType: 'text/plain' };
    }
    if (typeof i.content === 'string' && i.content) {
      return { bytes: textBytes(i.content), contentType: 'text/plain' };
    }
    const att = i.attachment || params.attachment;
    const b64 = att && att.base64;
    if (b64) {
      const bytes = bytesFromBase64(b64);
      if (!bytes) return { bad: true };
      return { bytes: bytes, contentType: (att && att.mimeType) || 'application/octet-stream' };
    }
    return null;
  }

  // Inline bytes, or a request to fetch the one file on the message.
  // Zero files, many files, and a file over the simple-upload cap are unclear.
  function prepare(input) {
    const named = chooseName(input);
    if (!named.name) return { ok: false, reason: 'unclear' };
    const inline = inlineBytes(input);
    if (inline && inline.bad) return { ok: false, reason: 'unclear' };
    if (inline && inline.bytes) {
      if (!inline.bytes.length || inline.bytes.length > MAX_BYTES) return { ok: false, reason: 'unclear' };
      return {
        ok: true,
        name: named.name,
        nameLocked: named.nameLocked,
        bytes: inline.bytes,
        contentType: inline.contentType,
        fetchOne: false
      };
    }
    const params = (input && input.params) || {};
    const messageId = (input && (input.outlookIncomingId || input.messageId)) || params.messageId || '';
    if (!messageId) return { ok: false, reason: 'unclear' };
    return {
      ok: true,
      name: named.name,
      nameLocked: named.nameLocked,
      fetchOne: true,
      messageId: String(messageId),
      contentType: 'application/octet-stream'
    };
  }

  function versionIdOf(body) {
    const rows = body && Array.isArray(body.value) ? body.value : [];
    const first = rows[0];
    if (!first || !first.id) return '';
    return String(first.id);
  }

  return {
    SYSTEM: SYSTEM,
    CONNECTOR: CONNECTOR,
    WRITE_SCOPE: WRITE_SCOPE,
    MAX_BYTES: MAX_BYTES,
    hasWriteScope: hasWriteScope,
    safeName: safeName,
    rootItemPath: rootItemPath,
    createContentPath: createContentPath,
    itemPath: itemPath,
    itemContentPath: itemContentPath,
    versionsPath: versionsPath,
    restorePath: restorePath,
    attachmentsPath: attachmentsPath,
    attachmentItemPath: attachmentItemPath,
    bytesFromBase64: bytesFromBase64,
    prepare: prepare,
    versionIdOf: versionIdOf
  };
})();

if (typeof module !== 'undefined') module.exports = { FlowOnedriveFile };
else if (typeof globalThis !== 'undefined') globalThis.FlowOnedriveFile = FlowOnedriveFile;
