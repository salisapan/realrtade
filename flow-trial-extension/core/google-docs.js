// One Google Doc, created or edited only when Glance made the file or the
// person picked it. Drive files.create uses drive.file. The Docs API edits
// that id. There is no documents OAuth scope. Undo trashes a file this
// lane created. An edit is wrapped in a named range. Undo reads that range
// back, locks the delete to that revision, and removes the text and the
// named range. A changed revision is read again before any second delete.
// A missing or edited range is refused. Handled waits for a read-back.
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

  function hash(text) {
    let h = 5381;
    const s = String(text || '');
    for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return h.toString(16);
  }

  // Stable for one insert. Undo looks up this name; it does not reuse the
  // index the text had when it was written.
  function rangeName(documentId, text, when) {
    return 'glance-' + hash(String(documentId) + '\n' + String(text) + '\n' + String(when || ''));
  }

  function namedSpan(doc, name) {
    const entry = doc && doc.namedRanges && doc.namedRanges[name];
    const list = entry && entry.namedRanges;
    if (!Array.isArray(list) || list.length !== 1) return null;
    const ranges = list[0].ranges;
    if (!Array.isArray(ranges) || ranges.length !== 1) return null;
    const span = ranges[0];
    if (!Number.isInteger(span.startIndex) || !Number.isInteger(span.endIndex) || span.endIndex <= span.startIndex) return null;
    if (span.segmentId) return null;
    const namedRangeId = String(list[0].namedRangeId || '').trim();
    if (!namedRangeId || /[\/\\\s]/.test(namedRangeId)) return null;
    return { startIndex: span.startIndex, endIndex: span.endIndex, namedRangeId: namedRangeId };
  }

  // null: the document does not prove which characters the range covers.
  function textInRange(doc, start, end) {
    const content = doc && doc.body && doc.body.content;
    if (!Array.isArray(content)) return null;
    let out = '';
    let covered = 0;
    for (let i = 0; i < content.length; i++) {
      const els = content[i].paragraph && content[i].paragraph.elements;
      if (!els) continue;
      for (let j = 0; j < els.length; j++) {
        const el = els[j];
        if (!el.textRun || typeof el.textRun.content !== 'string') continue;
        if (!Number.isInteger(el.startIndex) || !Number.isInteger(el.endIndex)) return null;
        if (el.textRun.content.length !== el.endIndex - el.startIndex) return null;
        const from = Math.max(el.startIndex, start);
        const to = Math.min(el.endIndex, end);
        if (to > from) {
          out += el.textRun.content.slice(from - el.startIndex, to - el.startIndex);
          covered += to - from;
        }
      }
    }
    if (covered !== end - start) return null;
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

  function revisionIdOf(doc) {
    const id = doc && typeof doc.revisionId === 'string' ? doc.revisionId.trim() : '';
    if (!id || id.length > 200) return '';
    return id;
  }

  // A 400 whose body names the revision is the writeControl miss. Anything
  // else stays a failure. The next step is another read, not another delete.
  function revisionChanged(res) {
    if (!res || res.ok || res.status !== 400) return false;
    return /revision/i.test(JSON.stringify(res.json || ''));
  }

  async function insertAndRead(id, text, http, clock, created, name) {
    const C = cfg();
    const when = C ? C.clockIso(clock) : '';
    const mark = rangeName(id, text, when);
    const posted = await call(http, {
      method: 'POST',
      url: DOCS + encodeURIComponent(id) + ':batchUpdate',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [
          { insertText: { location: { index: 1 }, text: text } },
          { createNamedRange: { name: mark, range: { startIndex: 1, endIndex: 1 + text.length } } }
        ]
      })
    });
    const denied = authFail(posted.status);
    if (denied) return denied;
    const ref = { documentId: id, externalId: id, created: created === true, inserted: text, rangeName: mark };
    const base = { where: 'Google Docs', target: name || id, written: 'Doc · ' + (name || id), url: null };
    if (!posted.ok) return Object.assign({ ok: false, reason: 'http-' + posted.status, ref: created ? ref : null, proof: null }, base);
    const got = await call(http, { method: 'GET', url: DOCS + encodeURIComponent(id) });
    const span = got.ok ? namedSpan(got.json, mark) : null;
    const covered = span ? textInRange(got.json, span.startIndex, span.endIndex) : null;
    if (!span || covered !== text) {
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
    const mark = ref.rangeName ? String(ref.rangeName) : '';
    if (!inserted || !mark) {
      return { ok: false, reason: 'range-missing', error: 'Undo stopped. The marked text is no longer in the doc.' };
    }
    const url = DOCS + encodeURIComponent(id);
    for (let attempt = 0; attempt < 2; attempt++) {
      const got = await call(http, { method: 'GET', url: url });
      if (got.status === 401 || got.status === 403) return { ok: false, reason: 'not-connected' };
      if (!got.ok) return { ok: false, reason: 'http-' + got.status };
      const span = namedSpan(got.json, mark);
      if (!span) {
        return { ok: false, reason: 'range-missing', error: 'Undo stopped. The marked text is no longer in the doc.' };
      }
      const covered = textInRange(got.json, span.startIndex, span.endIndex);
      if (covered == null) {
        return { ok: false, reason: 'range-unsafe', error: 'Undo stopped. The doc did not show which text the mark covers.' };
      }
      if (covered !== inserted) {
        return { ok: false, reason: 'range-edited', error: 'Undo stopped. That text was edited, so nothing was deleted.' };
      }
      const revisionId = revisionIdOf(got.json);
      if (!revisionId) {
        return { ok: false, reason: 'revision-missing', error: 'Undo stopped. The doc did not show a revision to lock the delete to.' };
      }
      const del = await call(http, {
        method: 'POST',
        url: url + ':batchUpdate',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [
            { deleteContentRange: { range: { startIndex: span.startIndex, endIndex: span.endIndex } } },
            { deleteNamedRange: { namedRangeId: span.namedRangeId } }
          ],
          writeControl: { requiredRevisionId: revisionId }
        })
      });
      if (del.status === 401 || del.status === 403) return { ok: false, reason: 'not-connected' };
      if (del.ok) return { ok: true, written: 'Doc edit removed.' };
      if (attempt === 0 && revisionChanged(del)) continue;
      if (revisionChanged(del)) {
        return { ok: false, reason: 'revision-changed', error: 'Undo stopped. The doc changed again before the delete.' };
      }
      return { ok: false, reason: 'http-' + del.status };
    }
  }

  return {
    SYSTEM: SYSTEM,
    CONNECTOR: CONNECTOR,
    safeName: safeName,
    rangeName: rangeName,
    namedSpan: namedSpan,
    textInRange: textInRange,
    write: write,
    undo: undo
  };
})();

if (typeof module !== 'undefined') module.exports = { FlowGoogleDocs };
else if (typeof globalThis !== 'undefined') globalThis.FlowGoogleDocs = FlowGoogleDocs;
