// One Google Doc, created or edited only when Glance made the file or the
// person picked it. Drive files.create uses drive.file. The Docs API edits
// that id. There is no documents OAuth scope. Undo trashes a file this
// lane created, or deletes the inserted range. Handled waits for a read-back.
// Portable: no chrome.*, no DOM, no network.
const FlowGoogleDocs = (() => {
  const SYSTEM = 'google/docs';
  const CONNECTOR = 'googleDoc';
  const DOC_MIME = 'application/vnd.google-apps.document';
  const FILES = 'https://www.googleapis.com/drive/v3/files';
  const DOCS = 'https://docs.googleapis.com/v1/documents/';

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

  function docId(id) {
    const s = String(id || '').trim();
    if (!s || s.length > 200 || /[\/\\\s]/.test(s)) return '';
    return s;
  }

  function textOf(input) {
    const text = String((input && input.text) || '').replace(/\u0000/g, '');
    if (!text.trim() || text.length > 8000) return '';
    return text;
  }

  function ours(input) {
    const origin = String((input && input.origin) || '');
    return origin === 'created' || origin === 'picked';
  }

  function fileUrl(id) {
    return FILES + '/' + encodeURIComponent(id) + '?fields=' + encodeURIComponent('id,name,mimeType,trashed');
  }

  function docText(doc) {
    const content = doc && doc.body && doc.body.content;
    if (!Array.isArray(content)) return '';
    let out = '';
    for (let i = 0; i < content.length; i++) {
      const els = content[i].paragraph && content[i].paragraph.elements;
      if (!els) continue;
      for (let j = 0; j < els.length; j++) {
        if (els[j].textRun && els[j].textRun.content) out += els[j].textRun.content;
      }
    }
    return out;
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

  function authFail(status) {
    if (status === 401 || status === 403) return { ok: false, reason: 'not-connected' };
    return null;
  }

  async function insertAndRead(id, text, http, clock, created, name) {
    const C = cfg();
    const posted = await call(http, {
      method: 'POST',
      url: DOCS + encodeURIComponent(id) + ':batchUpdate',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests: [{ insertText: { location: { index: 1 }, text: text } }] })
    });
    const denied = authFail(posted.status);
    if (denied) return denied;
    const ref = { documentId: id, externalId: id, created: created === true, inserted: text };
    const base = { where: 'Google Docs', target: name || id, written: 'Doc · ' + (name || id), url: null };
    if (!posted.ok) return Object.assign({ ok: false, reason: 'http-' + posted.status, ref: created ? ref : null, proof: null }, base);
    const got = await call(http, { method: 'GET', url: DOCS + encodeURIComponent(id) });
    if (!got.ok || docText(got.json).indexOf(text) < 0) {
      return Object.assign({ ok: false, reason: 'verify_failed', ref: ref, proof: null }, base);
    }
    const link = 'https://docs.google.com/document/d/' + encodeURIComponent(id) + '/edit';
    base.url = link;
    const proof = C && C.proofOf(SYSTEM, id, link, C.clockIso(clock));
    if (!proof) return Object.assign({ ok: false, reason: 'proof_pending', ref: ref, proof: null }, base);
    return Object.assign({ ok: true, ref: ref, proof: proof }, base);
  }

  async function write(input, http, clock) {
    const C = cfg();
    const i = input || {};
    const blocked = C && C.gate(i.scopes, C.SCOPE_DRIVE_FILE, 'drive-not-granted');
    if (blocked) return blocked;
    const text = textOf(i);
    if (!text) return { ok: false, reason: 'unclear' };
    const existing = docId(i.documentId);
    if (existing) {
      if (!ours(i)) return { ok: false, reason: 'not-ours' };
      return insertAndRead(existing, text, http, clock, false, safeName(i.name || i.title || '') || existing);
    }
    const name = safeName(i.name || i.title || 'Note');
    if (!name) return { ok: false, reason: 'unclear' };
    const posted = await call(http, {
      method: 'POST',
      url: FILES + '?fields=' + encodeURIComponent('id,name,mimeType,trashed'),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, mimeType: DOC_MIME })
    });
    const denied = authFail(posted.status);
    if (denied) return denied;
    if (!posted.ok) return { ok: false, reason: 'http-' + posted.status };
    const file = posted.json || {};
    const base = { where: 'Google Docs', target: name, written: 'Doc · ' + name, url: null };
    if (!file.id) return Object.assign({ ok: false, reason: 'proof_pending', ref: null, proof: null }, base);
    const got = await call(http, { method: 'GET', url: fileUrl(file.id) });
    if (!got.ok || !got.json || got.json.id !== file.id || got.json.trashed === true) {
      return Object.assign({ ok: false, reason: 'verify_failed', ref: { documentId: file.id, externalId: file.id, created: true }, proof: null }, base);
    }
    return insertAndRead(file.id, text, http, clock, true, name);
  }

  async function undo(ref, http) {
    const id = docId(ref && (ref.documentId || ref.externalId));
    if (!id) return { ok: false, reason: 'unclear' };
    if (ref.created === true) {
      const del = await call(http, {
        method: 'PATCH',
        url: FILES + '/' + encodeURIComponent(id),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trashed: true })
      });
      if (del.status === 401 || del.status === 403) return { ok: false, reason: 'not-connected' };
      if (del.ok || del.status === 204 || del.status === 404) return { ok: true, written: 'Doc removed.' };
      return { ok: false, reason: 'http-' + del.status };
    }
    const inserted = ref.inserted ? String(ref.inserted) : '';
    if (!inserted) return { ok: false, reason: 'unclear' };
    const del = await call(http, {
      method: 'POST',
      url: DOCS + encodeURIComponent(id) + ':batchUpdate',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests: [{ deleteContentRange: { range: { startIndex: 1, endIndex: 1 + inserted.length } } }] })
    });
    if (del.status === 401 || del.status === 403) return { ok: false, reason: 'not-connected' };
    if (del.ok) return { ok: true, written: 'Doc edit removed.' };
    return { ok: false, reason: 'http-' + del.status };
  }

  return {
    SYSTEM: SYSTEM,
    CONNECTOR: CONNECTOR,
    safeName: safeName,
    docText: docText,
    write: write,
    undo: undo
  };
})();

if (typeof module !== 'undefined') module.exports = { FlowGoogleDocs };
else if (typeof globalThis !== 'undefined') globalThis.FlowGoogleDocs = FlowGoogleDocs;
