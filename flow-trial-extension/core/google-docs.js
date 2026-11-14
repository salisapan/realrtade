// One Google Doc, created or edited only when Glance made the file or the
// person picked it. A new Doc is a Drive multipart upload of HTML
// (uploadType=multipart, mimeType application/vnd.google-apps.document)
// into the Glance folder, using drive.file only. There is no documents
// OAuth scope and no docs.googleapis.com call on that create. The write
// is verified with Drive files.get and an export to text/plain. Undo
// trashes a file this lane created. An edit of a picked Doc is still
// wrapped in a named range via the Docs API. Undo reads that range back,
// locks the delete to that revision, and removes the text and the named
// range. A changed revision is read again before any second delete. A
// missing or edited range is refused. Handled waits for a read-back.
// Portable: no chrome.*, no DOM, no network.
const FlowGoogleDocs = (() => {
  const SYSTEM = 'google/docs';
  const CONNECTOR = 'googleDoc';
  const DOC_MIME = 'application/vnd.google-apps.document';
  const FILES = 'https://www.googleapis.com/drive/v3/files';
  const DOCS = 'https://docs.googleapis.com/v1/documents/';
  const FILE_FIELDS = 'id,name,mimeType,trashed,webViewLink,headRevisionId,version,modifiedTime';
  const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=' + encodeURIComponent(FILE_FIELDS);
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

  function docId(id) {
    const s = String(id || '').trim();
    if (!s || s.length > 200 || /[\/\\\s]/.test(s)) return '';
    return s;
  }

  function htmlToPlain(html) {
    return String(html || '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|h1|h2|h3|li|div|tr|table|ul|ol)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }

  function textOf(input) {
    const raw = String((input && input.text) || '').replace(/\u0000/g, '');
    const fromHtml = raw.trim() ? raw : htmlToPlain(input && input.html);
    const text = String(fromHtml || '').replace(/\u0000/g, '');
    if (!text.trim() || text.length > 8000) return '';
    return text;
  }

  function ours(input) {
    const origin = String((input && input.origin) || '');
    return origin === 'created' || origin === 'picked';
  }

  function fileUrl(id) {
    return FILES + '/' + encodeURIComponent(id) + '?fields=' + encodeURIComponent(FILE_FIELDS);
  }

  function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function hasHebrew(s) {
    return /[\u0590-\u05FF]/.test(String(s || ''));
  }

  // UTF-8 HTML so Hebrew (and any other script) renders in the Doc. dir=rtl
  // when the text has Hebrew; otherwise ltr. Block elements so Google Docs
  // import keeps paragraphs instead of collapsing them into one line.
  function wrapDocHtml(inner, textHint) {
    const src = String(inner || '').trim();
    const rtl = hasHebrew(src) || hasHebrew(textHint);
    const dir = rtl ? 'rtl' : 'ltr';
    const lang = rtl ? 'he' : 'en';
    if (/<html[\s>]/i.test(src)) {
      let out = src;
      if (!/<meta[^>]+charset/i.test(out)) {
        out = out.replace(/<head([^>]*)>/i, '<head$1><meta charset="UTF-8">');
        if (!/<head[\s>]/i.test(out)) out = out.replace(/<html([^>]*)>/i, '<html$1><head><meta charset="UTF-8"></head>');
      }
      if (!/\sdir=/i.test(out)) out = out.replace(/<html([^>]*)>/i, '<html dir="' + dir + '" lang="' + lang + '"$1>');
      if (!/<body[^>]*\sdir=/i.test(out)) out = out.replace(/<body([^>]*)>/i, '<body dir="' + dir + '"$1>');
      return out;
    }
    return '<!DOCTYPE html><html dir="' + dir + '" lang="' + lang + '"><head><meta charset="UTF-8"></head><body dir="' + dir + '">' + src + '</body></html>';
  }

  function asHtml(text) {
    const blocks = String(text || '').split(/\r\n|\r|\n/).map(function (line) {
      return '<p>' + escapeHtml(line) + '</p>';
    });
    return wrapDocHtml(blocks.join('') || '<p></p>', text);
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

  function waitMs(clock, ms) {
    if (clock && typeof clock === 'object' && typeof clock.wait === 'function') return Promise.resolve(clock.wait(ms));
    if (typeof setTimeout === 'function') return new Promise(function (resolve) { setTimeout(resolve, ms); });
    return Promise.resolve();
  }

  // Google's text/plain export of a Doc often has a BOM, CRLF, bidi marks,
  // and "* " (or "• ") prefixes on list items. Collapse those so a faithful
  // export still compares as the written text.
  function normalizeText(s) {
    return String(s || '')
      .replace(/^\uFEFF/, '')
      .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, '')
      .replace(/\r\n?/g, '\n')
      .replace(/^[ \t\u00A0]*[*\u2022\u25CF\u25E6\u00B7\u2043\u2219-]\s+/gm, '')
      .replace(/(^| )[*\u2022\u25CF]\s+/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function keyFields(html, text) {
    const parts = [];
    const src = String(html || '');
    if (src) {
      const h1 = src.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
      if (h1) parts.push(normalizeText(htmlToPlain(h1[1])));
      const liRe = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
      let m;
      while ((m = liRe.exec(src))) parts.push(normalizeText(htmlToPlain(m[1])));
      const pRe = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
      while ((m = pRe.exec(src))) parts.push(normalizeText(htmlToPlain(m[1])));
    }
    if (!parts.length) {
      String(text || '').split(/\r\n|\r|\n/).forEach(function (line) {
        const n = normalizeText(line);
        if (n) parts.push(n);
      });
    }
    return parts.filter(function (p) { return p && p.length >= 2; });
  }

  // Honest verify: after normalize, either the written text is present as a
  // whole, or every title / list item / paragraph from the HTML is present.
  function exportContains(exported, text, html) {
    const got = normalizeText(exported);
    if (!got) return false;
    const wantSrc = String(text || '').trim() ? text : htmlToPlain(html);
    const want = normalizeText(wantSrc);
    if (want && got.indexOf(want) >= 0) return true;
    const parts = keyFields(html, wantSrc);
    return parts.length > 0 && parts.every(function (p) { return got.indexOf(p) >= 0; });
  }

  function docLink(json, id) {
    const link = json && typeof json.webViewLink === 'string' ? json.webViewLink.trim() : '';
    if (link && /^https:\/\/docs\.google\.com\//.test(link)) return link;
    return 'https://docs.google.com/document/d/' + encodeURIComponent(id) + '/edit';
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
      return { status: status, ok: !!(res && (res.ok === true || (status >= 200 && status < 300))), json: res && res.json ? res.json : null, text: res && res.text != null ? String(res.text) : '', denial: res && res.denial ? res.denial : null, url: req && req.url };
    } catch (e) {
      return { status: 0, ok: false, json: null };
    }
  }

  // A refused write says why. drive-not-granted: the token lacks drive.file
  // (Reconnect asks for it). docs-api-disabled / drive-api-disabled: the
  // API is off in Glance's Cloud project (Reconnect cannot fix it). A 401,
  // or a 403 that names nothing, stays not-connected.
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
      else if (d.kind === 'api-disabled') out.reason = /docs\.googleapis/.test(d.service || '') ? 'docs-api-disabled' : 'drive-api-disabled';
      else if (d.kind === 'forbidden') out.reason = 'http-403';
    }
    return out;
  }

  // A Doc this lane created whose text could not be written is trashed, so a
  // failed Do It does not leave an empty Doc behind in Drive.
  async function trashCreated(http, id) {
    const del = await call(http, {
      method: 'PATCH',
      url: FILES + '/' + encodeURIComponent(id),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trashed: true })
    });
    return !!(del.ok || del.status === 404);
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
    const denied = authFail(posted);
    if (denied) {
      if (created === true) denied.cleanedUp = await trashCreated(http, id);
      return denied;
    }
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

  function clipProp(value, max) {
    return String(value || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, max);
  }

  // Private to this app, so drive.file can find the Doc later by thread and type.
  function glanceMeta(extra, text) {
    const g = extra && extra.glance;
    if (!g) return null;
    const props = { glanceDoc: '1' };
    const thread = clipProp(g.threadId, 80);
    const type = clipProp(g.docType, 40);
    const title = clipProp(g.titleKey, 60);
    const at = clipProp(g.at, 20);
    if (thread) props.glanceThread = thread;
    if (type) props.glanceType = type;
    if (title) props.glanceTitle = title;
    if (at) props.glanceAt = at;
    props.glanceHash = hash(normalizeText(text)).slice(0, 16);
    return props;
  }

  function withGlance(meta, extra, text) {
    const props = glanceMeta(extra, text);
    if (!props) return meta;
    meta.appProperties = props;
    meta.description = 'glance ' + JSON.stringify({
      glance: true,
      thread: props.glanceThread || '',
      type: props.glanceType || '',
      title: props.glanceTitle || '',
      at: props.glanceAt || ''
    });
    return meta;
  }

  async function listGlanceDocs(http) {
    const q = "mimeType='" + DOC_MIME + "' and trashed=false and appProperties has { key='glanceDoc' and value='1' }";
    const fields = 'files(id,name,mimeType,trashed,webViewLink,description,appProperties,createdTime)';
    const listed = await call(http, {
      method: 'GET',
      url: FILES + '?q=' + encodeURIComponent(q) + '&pageSize=20&fields=' + encodeURIComponent(fields)
    });
    const denied = authFail(listed);
    if (denied) return denied;
    if (!listed.ok) return { ok: false, reason: 'skipped', files: null };
    const files = listed.json && Array.isArray(listed.json.files) ? listed.json.files : [];
    return { ok: true, files: files };
  }

  async function uploadHtml(http, url, meta, html) {
    const packed = multipart(meta, 'text/html; charset=UTF-8', utf8Bytes(html));
    return call(http, {
      method: url.indexOf('/upload/drive/v3/files/') >= 0 ? 'PATCH' : 'POST',
      url: url,
      headers: { 'Content-Type': packed.contentType },
      body: packed.body
    });
  }

  async function replaceAndRead(id, name, text, htmlIn, http, clock, extraRef, expectedHash) {
    const C = cfg();
    const got = await call(http, { method: 'GET', url: fileUrl(id) });
    const gotDenied = authFail(got);
    if (gotDenied) return gotDenied;
    if (!got.ok || !got.json || got.json.id !== id || got.json.trashed === true || got.json.mimeType !== DOC_MIME) {
      return { ok: false, reason: 'verify_failed', ref: null, proof: null, where: 'Google Docs', target: name };
    }
    const exportUrl = FILES + '/' + encodeURIComponent(id) + '/export?mimeType=' + encodeURIComponent('text/plain');
    const prior = await call(http, { method: 'GET', url: exportUrl });
    if (prior.status === 401 || prior.status === 403) return authFail(prior) || { ok: false, reason: 'not-connected' };
    if (!prior.ok) return { ok: false, reason: 'unconfirmed', error: "Couldn't confirm it's unchanged. Undo left it alone." };
    const previous = normalizeText(prior.text || '');
    if (expectedHash && hash(previous).slice(0, 16) !== String(expectedHash)) {
      return { ok: false, reason: 'user-edited', error: 'You edited this. Undo left it alone.' };
    }
    const html = htmlIn ? wrapDocHtml(htmlIn, text) : asHtml(text);
    const meta = withGlance({ mimeType: DOC_MIME }, extraRef, text);
    if (name) meta.name = name;
    const posted = await uploadHtml(http, 'https://www.googleapis.com/upload/drive/v3/files/' + encodeURIComponent(id) + '?uploadType=multipart&fields=' + encodeURIComponent(FILE_FIELDS), meta, html);
    const denied = authFail(posted);
    if (denied) return denied;
    const base = { where: 'Google Docs', target: name, written: 'Doc · ' + name, url: null };
    if (!posted.ok) return Object.assign({ ok: false, reason: 'http-' + posted.status, ref: null, proof: null }, base);
    const again = await call(http, { method: 'GET', url: exportUrl });
    if (!again.ok || !exportContains(again.text || '', text, html)) {
      const back = asHtml(previous);
      await uploadHtml(http, 'https://www.googleapis.com/upload/drive/v3/files/' + encodeURIComponent(id) + '?uploadType=multipart', { mimeType: DOC_MIME }, back);
      return Object.assign({ ok: false, reason: 'verify_failed', cleanedUp: true, ref: { documentId: id, externalId: id, updated: true } }, base);
    }
    const link = docLink(got.json, id);
    base.url = link;
    const proof = C && C.proofOf(SYSTEM, id, link, C.clockIso(clock));
    const ref = {
      documentId: id,
      externalId: id,
      created: false,
      updated: true,
      fullDocument: true,
      name: name || (got.json && got.json.name) || '',
      contentText: normalizeText(again.text || ''),
      previousText: previous,
      snapshot: fileSnapshot(posted.json || got.json)
    };
    if (!proof) return Object.assign({ ok: false, reason: 'proof_pending', ref: ref, proof: null }, base);
    return Object.assign({ ok: true, ref: ref, proof: proof }, base);
  }

  async function restoreUpdated(ref, http) {
    const id = docId(ref && (ref.documentId || ref.externalId));
    if (!id) return { ok: false, reason: 'unclear' };
    const got = await call(http, { method: 'GET', url: fileUrl(id) });
    if (got.status === 401 || got.status === 403) return { ok: false, reason: 'not-connected' };
    if (got.status === 404) return { ok: true, reason: 'restored', written: 'Doc restored.' };
    if (!got.ok || got.status === 0) return unconfirmedResult();
    if (got.json && got.json.trashed === true) return { ok: true, reason: 'restored', written: 'Doc restored.' };
    if (ref.name && got.json && got.json.name && String(got.json.name) !== String(ref.name)) return editedResult();
    const want = normalizeText(ref.contentText || '');
    const exported = await call(http, {
      method: 'GET',
      url: FILES + '/' + encodeURIComponent(id) + '/export?mimeType=' + encodeURIComponent('text/plain')
    });
    if (exported.status === 401 || exported.status === 403) return { ok: false, reason: 'not-connected' };
    if (!exported.ok || exported.status === 0) return unconfirmedResult();
    if (want && normalizeText(exported.text || '') !== want) return editedResult();
    const back = asHtml(ref.previousText || '');
    const posted = await uploadHtml(http, 'https://www.googleapis.com/upload/drive/v3/files/' + encodeURIComponent(id) + '?uploadType=multipart', { mimeType: DOC_MIME, name: ref.name || '' }, back);
    if (posted.status === 401 || posted.status === 403) return { ok: false, reason: 'not-connected' };
    if (!posted.ok) return { ok: false, reason: 'http-' + posted.status };
    return { ok: true, reason: 'restored', written: 'Doc restored.' };
  }

  async function write(input, http, clock) {
    const C = cfg();
    const i = input || {};
    const blocked = C && C.gate(i.scopes, C.SCOPE_DRIVE_FILE, 'drive-not-granted');
    if (blocked) return blocked;
    const text = textOf(i);
    if (!text) return { ok: false, reason: 'unclear' };
    const name = safeName(i.name || i.title || 'Note');
    const extra = {};
    if (i.fullDocument) extra.fullDocument = true;
    if (i.glance) extra.glance = i.glance;
    const extraRef = Object.keys(extra).length ? extra : null;
    const existing = docId(i.documentId);
    if (existing) {
      if (!ours(i)) return { ok: false, reason: 'not-ours' };
      if (i.fullDocument && (i.html || text)) return replaceAndRead(existing, name || existing, text, i.html, http, clock, extraRef, String(i.expectedHash || ''));
      return insertAndRead(existing, text, http, clock, false, name || existing);
    }
    if (!name) return { ok: false, reason: 'unclear' };
    return createAndRead(name, text, i.html, http, clock, extraRef);
  }

  // The Glance folder is one this lane made, so drive.file can see it.
  // A 401/403 is returned as the write's reason (Reconnect or an API that
  // is off). Any other list or create miss falls back to My Drive.
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

  async function createAndRead(name, text, htmlIn, http, clock, extraRef) {
    const C = cfg();
    const folder = await glanceFolder(http);
    if (folder && folder.ok === false) return folder;
    const html = htmlIn ? wrapDocHtml(htmlIn, text) : asHtml(text);
    const meta = withGlance(Object.assign({ name: name, mimeType: DOC_MIME }, folder && folder.id ? { parents: [folder.id] } : {}), extraRef, text);
    const packed = multipart(meta, 'text/html; charset=UTF-8', utf8Bytes(html));
    const posted = await call(http, {
      method: 'POST',
      url: UPLOAD,
      headers: { 'Content-Type': packed.contentType },
      body: packed.body
    });
    const denied = authFail(posted);
    if (denied) return denied;
    const base = { where: 'Google Docs', target: name, written: 'Doc · ' + name, url: null };
    if (!posted.ok) return Object.assign({ ok: false, reason: 'http-' + posted.status, ref: null, proof: null }, base);
    const file = posted.json || {};
    if (!file.id) return Object.assign({ ok: false, reason: 'proof_pending', ref: null, proof: null }, base);

    async function failClean(reason, extra) {
      const cleanedUp = await trashCreated(http, file.id);
      return Object.assign({ ok: false, reason: reason, ref: { documentId: file.id, externalId: file.id, created: true }, proof: null, cleanedUp: cleanedUp }, extra || {}, base);
    }

    const got = await call(http, { method: 'GET', url: fileUrl(file.id) });
    const gotDenied = authFail(got);
    if (gotDenied) {
      gotDenied.cleanedUp = await trashCreated(http, file.id);
      return gotDenied;
    }
    if (!got.ok || !got.json || got.json.id !== file.id || got.json.trashed === true || got.json.mimeType !== DOC_MIME) {
      return failClean('verify_failed');
    }

    const exportUrl = FILES + '/' + encodeURIComponent(file.id) + '/export?mimeType=' + encodeURIComponent('text/plain');
    let exported = await call(http, { method: 'GET', url: exportUrl });
    const expDenied = authFail(exported);
    if (expDenied) {
      expDenied.cleanedUp = await trashCreated(http, file.id);
      return expDenied;
    }
    let exportedText = exported.text || '';
    // Drive conversion can lag the create. One short retry when the export is empty.
    if (exported.ok && !String(exportedText).trim()) {
      await waitMs(clock, 250);
      exported = await call(http, { method: 'GET', url: exportUrl });
      const retryDenied = authFail(exported);
      if (retryDenied) {
        retryDenied.cleanedUp = await trashCreated(http, file.id);
        return retryDenied;
      }
      exportedText = exported.text || '';
    }
    if (!exported.ok || !exportContains(exportedText, text, html)) {
      return failClean('verify_failed');
    }

    const link = docLink(got.json, file.id);
    base.url = link;
    const proof = C && C.proofOf(SYSTEM, file.id, link, C.clockIso(clock));
    const ref = Object.assign({
      documentId: file.id,
      externalId: file.id,
      created: true,
      name: (got.json && got.json.name) || name,
      contentText: normalizeText(exportedText),
      snapshot: fileSnapshot(got.json)
    }, extraRef || {});
    if (!proof) return Object.assign({ ok: false, reason: 'proof_pending', ref: ref, proof: null }, base);
    return Object.assign({ ok: true, ref: ref, proof: proof }, base);
  }

  async function undo(ref, http) {
    const id = docId(ref && (ref.documentId || ref.externalId));
    if (!id) return { ok: false, reason: 'unclear' };
    if (ref.updated === true && ref.created !== true) return restoreUpdated(ref, http);
    if (ref.created === true) {
      const got = await call(http, { method: 'GET', url: fileUrl(id) });
      if (got.status === 401 || got.status === 403) return { ok: false, reason: 'not-connected' };
      if (got.status === 404) return { ok: true, reason: 'trashed', written: 'Doc removed.' };
      if (!got.ok || got.status === 0) return unconfirmedResult();
      if (got.json && got.json.trashed === true) return { ok: true, reason: 'trashed', written: 'Doc removed.' };
      if (ref.name && got.json && got.json.name && String(got.json.name) !== String(ref.name)) return editedResult();
      const want = normalizeText(ref.contentText || '');
      if (want) {
        const exported = await call(http, {
          method: 'GET',
          url: FILES + '/' + encodeURIComponent(id) + '/export?mimeType=' + encodeURIComponent('text/plain')
        });
        if (exported.status === 401 || exported.status === 403) return { ok: false, reason: 'not-connected' };
        if (!exported.ok || exported.status === 0) return unconfirmedResult();
        if (normalizeText(exported.text || '') !== want) return editedResult();
      }
      const del = await call(http, {
        method: 'PATCH',
        url: FILES + '/' + encodeURIComponent(id),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trashed: true })
      });
      if (del.status === 401 || del.status === 403) return { ok: false, reason: 'not-connected' };
      if (del.ok || del.status === 204 || del.status === 404) return { ok: true, reason: 'trashed', written: 'Doc removed.' };
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
      if (got.status === 0) return unconfirmedResult();
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
    undo: undo,
    asHtml: asHtml,
    wrapDocHtml: wrapDocHtml,
    htmlToPlain: htmlToPlain,
    normalizeText: normalizeText,
    exportContains: exportContains,
    listGlanceDocs: listGlanceDocs,
    FOLDER_NAME: FOLDER_NAME
  };
})();

if (typeof module !== 'undefined') module.exports = { FlowGoogleDocs };
else if (typeof globalThis !== 'undefined') globalThis.FlowGoogleDocs = FlowGoogleDocs;
