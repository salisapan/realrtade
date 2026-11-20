// A Google Slides deck from a meeting summary, with drive.file only.
// slides.googleapis.com is not in the extension host list. A service-worker
// fetch to that host fails, and adding the host needs the owner's approval,
// so this file never calls it. The deck is a small PPTX uploaded through
// Drive multipart and converted to a Google Slides file in the Glance
// folder. The text is verified by files.get and a text/plain export. A
// failed verify trashes the file. Undo trashes it only while the export
// and the file stamp still match. Nothing is shared. Hebrew is written
// right to left. Portable: no chrome.*, no DOM, no network.
const FlowGoogleSlides = (() => {
  const SYSTEM = 'google/slides';
  const CONNECTOR = 'googleSlides';
  const SLIDES_MIME = 'application/vnd.google-apps.presentation';
  const PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  const FILES = 'https://www.googleapis.com/drive/v3/files';
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

  function fileId(id) {
    const s = String(id || '').trim();
    if (!s || s.length > 200 || /[\/\\\s]/.test(s)) return '';
    return s;
  }

  function xml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function hasHebrew(s) {
    return /[\u0590-\u05FF]/.test(String(s || ''));
  }

  function utf8Bytes(s) {
    return new TextEncoder().encode(String(s || ''));
  }

  function crc32(bytes) {
    let c = ~0;
    for (let i = 0; i < bytes.length; i++) {
      c ^= bytes[i];
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return (~c) >>> 0;
  }

  function u16(n) { return [n & 255, (n >> 8) & 255]; }
  function u32(n) { return [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >> 24) & 255]; }

  function zipStore(files) {
    const locals = [];
    const centrals = [];
    let offset = 0;
    for (let i = 0; i < files.length; i++) {
      const name = utf8Bytes(files[i].name);
      const data = files[i].bytes;
      const crc = crc32(data);
      const local = [].concat(
        u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0)
      );
      const localBytes = new Uint8Array(local.length + name.length + data.length);
      localBytes.set(local, 0);
      localBytes.set(name, local.length);
      localBytes.set(data, local.length + name.length);
      locals.push(localBytes);
      const central = [].concat(
        u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0),
        u16(0), u16(0), u32(0), u32(offset)
      );
      const centralBytes = new Uint8Array(central.length + name.length);
      centralBytes.set(central, 0);
      centralBytes.set(name, central.length);
      centrals.push(centralBytes);
      offset += localBytes.length;
    }
    let centralSize = 0;
    for (let i = 0; i < centrals.length; i++) centralSize += centrals[i].length;
    const end = [].concat(
      u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
      u32(centralSize), u32(offset), u16(0)
    );
    let total = end.length;
    for (let i = 0; i < locals.length; i++) total += locals[i].length;
    total += centralSize;
    const out = new Uint8Array(total);
    let at = 0;
    for (let i = 0; i < locals.length; i++) { out.set(locals[i], at); at += locals[i].length; }
    for (let i = 0; i < centrals.length; i++) { out.set(centrals[i], at); at += centrals[i].length; }
    out.set(end, at);
    return out;
  }

  function paragraph(text, rtl) {
    const dir = rtl ? '<a:pPr rtl="1" algn="r"/>' : '<a:pPr/>';
    const lang = rtl ? 'he-IL' : 'en-US';
    return '<a:p>' + dir + '<a:r><a:rPr lang="' + lang + '" dirty="0" smtClean="0"/><a:t>' + xml(text) + '</a:t></a:r></a:p>';
  }

  function slideXml(title, bullets, rtl) {
    const paras = [paragraph(title, rtl)];
    for (let i = 0; i < bullets.length; i++) paras.push(paragraph(bullets[i], rtl));
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
      '<p:cSld><p:spTree>' +
      '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>' +
      '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Text"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr/>' +
      '<p:txBody><a:bodyPr/><a:lstStyle/>' + paras.join('') + '</p:txBody></p:sp>' +
      '</p:spTree></p:cSld></p:sld>';
  }

  function deckSlides(input) {
    const i = input || {};
    const title = safeName(i.title || i.name || '');
    if (!title) return null;
    let slides = Array.isArray(i.slides) ? i.slides : null;
    if (!slides && Array.isArray(i.bullets)) {
      slides = [{ title: title, bullets: [] }];
      const bullets = [];
      for (let n = 0; n < i.bullets.length && bullets.length < 24; n++) {
        const b = String(i.bullets[n] || '').replace(/[\r\n\u0000]/g, ' ').trim();
        if (b && b.length <= 400) bullets.push(b);
      }
      if (bullets.length < 2) return null;
      for (let n = 0; n < bullets.length; n += 6) slides.push({ title: title, bullets: bullets.slice(n, n + 6) });
    }
    if (!slides || slides.length < 1 || slides.length > 8) return null;
    const out = [];
    for (let n = 0; n < slides.length; n++) {
      const s = slides[n] || {};
      const heading = safeName(s.title || title) || title;
      const bullets = [];
      const raw = Array.isArray(s.bullets) ? s.bullets : [];
      for (let b = 0; b < raw.length && bullets.length < 8; b++) {
        const line = String(raw[b] || '').replace(/[\r\n\u0000]/g, ' ').trim();
        if (line && line.length <= 400) bullets.push(line);
      }
      out.push({ title: heading, bullets: bullets });
    }
    const points = out.reduce((n, s) => n + s.bullets.length, 0);
    if (!points) return null;
    return { title: title, slides: out };
  }

  function pptxBytes(deck) {
    const rtl = hasHebrew(deck.title) || deck.slides.some((s) => hasHebrew(s.title) || s.bullets.some(hasHebrew));
    const files = [];
    const overrides = [];
    const rels = [];
    for (let i = 0; i < deck.slides.length; i++) {
      const n = i + 1;
      const path = 'ppt/slides/slide' + n + '.xml';
      files.push({ name: path, bytes: utf8Bytes(slideXml(deck.slides[i].title, deck.slides[i].bullets, rtl)) });
      overrides.push('<Override PartName="/' + path + '" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>');
      rels.push('<Relationship Id="rId' + n + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide' + n + '.xml"/>');
    }
    const sldId = deck.slides.map((_, i) => '<p:sldId id="' + (256 + i) + '" r:id="rId' + (i + 1) + '"/>').join('');
    files.push({
      name: 'ppt/presentation.xml',
      bytes: utf8Bytes('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<p:presentation xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
        '<p:sldIdLst>' + sldId + '</p:sldIdLst>' +
        '<p:sldSz cx="9144000" cy="5143500"/><p:notesSz cx="6858000" cy="9144000"/>' +
        '</p:presentation>')
    });
    files.push({
      name: 'ppt/_rels/presentation.xml.rels',
      bytes: utf8Bytes('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + rels.join('') + '</Relationships>')
    });
    files.push({
      name: '[Content_Types].xml',
      bytes: utf8Bytes('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>' +
        overrides.join('') + '</Types>')
    });
    files.push({
      name: '_rels/.rels',
      bytes: utf8Bytes('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>' +
        '</Relationships>')
    });
    return zipStore(files);
  }

  function wantedText(deck) {
    const parts = [deck.title];
    for (let i = 0; i < deck.slides.length; i++) {
      if (deck.slides[i].title) parts.push(deck.slides[i].title);
      for (let b = 0; b < deck.slides[i].bullets.length; b++) parts.push(deck.slides[i].bullets[b]);
    }
    return parts;
  }

  function normalizeText(s) {
    return String(s || '')
      .replace(/^\uFEFF/, '')
      .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function exportContains(exported, parts) {
    const got = normalizeText(exported);
    if (!got) return false;
    return parts.every((p) => {
      const n = normalizeText(p);
      return n.length < 2 || got.indexOf(n) >= 0;
    });
  }

  function multipart(meta, bytes) {
    const boundary = 'glance_lane_drive';
    const head = '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(meta) + '\r\n--' + boundary + '\r\nContent-Type: ' + PPTX + '\r\n\r\n';
    const tail = '\r\n--' + boundary + '--';
    const h = utf8Bytes(head);
    const t = utf8Bytes(tail);
    const body = new Uint8Array(h.length + bytes.length + t.length);
    body.set(h, 0);
    body.set(bytes, h.length);
    body.set(t, h.length + bytes.length);
    return { contentType: 'multipart/related; boundary=' + boundary, body: body };
  }

  function fileUrl(id) {
    return FILES + '/' + encodeURIComponent(id) + '?fields=' + encodeURIComponent(FILE_FIELDS);
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

  function withGlance(meta, input, name, clock) {
    const g = (input && input.glance) || {};
    const props = { glanceSlides: '1', glanceType: 'slides' };
    const thread = clipProp(g.threadId || (input && input.threadId) || '', 80);
    if (thread) props.glanceThread = thread;
    const title = clipProp(g.titleKey || String(name || '').toLowerCase(), 60);
    if (title) props.glanceTitle = title;
    const at = clipProp(g.at || dayOf(clock), 20);
    if (at) props.glanceDay = at;
    meta.appProperties = props;
    meta.description = 'glance ' + JSON.stringify({
      glance: true, thread: props.glanceThread || '', type: 'slides', title: props.glanceTitle || '', at: props.glanceDay || ''
    });
    return meta;
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

  function deckLink(json, id) {
    const link = json && typeof json.webViewLink === 'string' ? json.webViewLink.trim() : '';
    if (link && /^https:\/\/docs\.google\.com\//.test(link)) return link;
    return 'https://docs.google.com/presentation/d/' + encodeURIComponent(id) + '/edit';
  }

  async function write(input, http, clock) {
    const C = cfg();
    const i = input || {};
    const blocked = C && C.gate(i.scopes, C.SCOPE_DRIVE_FILE, 'drive-not-granted');
    if (blocked) return blocked;
    const deck = deckSlides(i);
    if (!deck) return { ok: false, reason: 'unclear' };
    const folder = await glanceFolder(http);
    if (folder && folder.ok === false) return folder;
    const bytes = pptxBytes(deck);
    const meta = withGlance(Object.assign({ name: deck.title, mimeType: SLIDES_MIME }, folder && folder.id ? { parents: [folder.id] } : {}), i, deck.title, clock);
    const packed = multipart(meta, bytes);
    const posted = await call(http, {
      method: 'POST',
      url: UPLOAD,
      headers: { 'Content-Type': packed.contentType },
      body: packed.body
    });
    const denied = authFail(posted);
    if (denied) return denied;
    const base = { where: 'Google Slides', target: deck.title, written: 'Slides · ' + deck.title, url: null };
    if (!posted.ok) return Object.assign({ ok: false, reason: 'http-' + posted.status, ref: null, proof: null }, base);
    const file = posted.json || {};
    if (!file.id) return Object.assign({ ok: false, reason: 'proof_pending', ref: null, proof: null }, base);
    async function failClean(reason) {
      const cleanedUp = await trashCreated(http, file.id);
      return Object.assign({ ok: false, reason: reason, ref: { presentationId: file.id, externalId: file.id, created: true }, proof: null, cleanedUp: cleanedUp }, base);
    }
    const got = await call(http, { method: 'GET', url: fileUrl(file.id) });
    const gotDenied = authFail(got);
    if (gotDenied) {
      gotDenied.cleanedUp = await trashCreated(http, file.id);
      return gotDenied;
    }
    if (!got.ok || !got.json || got.json.id !== file.id || got.json.trashed === true || got.json.mimeType !== SLIDES_MIME) return failClean('verify_failed');
    const exportUrl = FILES + '/' + encodeURIComponent(file.id) + '/export?mimeType=' + encodeURIComponent('text/plain');
    let exported = await call(http, { method: 'GET', url: exportUrl });
    const expDenied = authFail(exported);
    if (expDenied) {
      expDenied.cleanedUp = await trashCreated(http, file.id);
      return expDenied;
    }
    if (exported.ok && !String(exported.text || '').trim()) {
      await waitMs(clock, 250);
      exported = await call(http, { method: 'GET', url: exportUrl });
      const retryDenied = authFail(exported);
      if (retryDenied) {
        retryDenied.cleanedUp = await trashCreated(http, file.id);
        return retryDenied;
      }
    }
    const parts = wantedText(deck);
    if (!exported.ok || !exportContains(exported.text || '', parts)) return failClean('verify_failed');
    const link = deckLink(got.json, file.id);
    base.url = link;
    const ref = {
      presentationId: file.id,
      externalId: file.id,
      created: true,
      name: (got.json && got.json.name) || deck.title,
      contentText: normalizeText(exported.text || ''),
      snapshot: fileSnapshot(got.json)
    };
    const proof = C && C.proofOf(SYSTEM, file.id, link, C.clockIso(clock));
    if (!proof) return Object.assign({ ok: false, reason: 'proof_pending', ref: ref, proof: null }, base);
    return Object.assign({ ok: true, ref: ref, proof: proof }, base);
  }

  async function undo(ref, http) {
    const id = fileId(ref && (ref.presentationId || ref.externalId));
    if (!id || ref.created !== true) return { ok: false, reason: 'unclear' };
    const got = await call(http, { method: 'GET', url: fileUrl(id) });
    if (got.status === 401 || got.status === 403) return { ok: false, reason: 'not-connected' };
    if (got.status === 404) return { ok: true, reason: 'trashed', written: 'Slides removed.' };
    if (!got.ok || got.status === 0) return unconfirmedResult();
    if (got.json && got.json.trashed === true) return { ok: true, reason: 'trashed', written: 'Slides removed.' };
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
    const verdict = unchanged(ref.snapshot, got.json);
    if (verdict === 'edited') return editedResult();
    if (verdict !== 'match') return unconfirmedResult();
    const del = await call(http, {
      method: 'PATCH',
      url: FILES + '/' + encodeURIComponent(id),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trashed: true })
    });
    if (del.status === 401 || del.status === 403) return { ok: false, reason: 'not-connected' };
    if (del.ok || del.status === 204 || del.status === 404) return { ok: true, reason: 'trashed', written: 'Slides removed.' };
    return { ok: false, reason: 'http-' + del.status };
  }

  return {
    SYSTEM: SYSTEM,
    CONNECTOR: CONNECTOR,
    pptxBytes: pptxBytes,
    deckSlides: deckSlides,
    write: write,
    undo: undo,
    FOLDER_NAME: FOLDER_NAME
  };
})();

if (typeof module !== 'undefined') module.exports = { FlowGoogleSlides };
else if (typeof globalThis !== 'undefined') globalThis.FlowGoogleSlides = FlowGoogleSlides;
