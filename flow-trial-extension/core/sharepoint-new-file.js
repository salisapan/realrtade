// "Please create a Word document called Q4 plan on the Marketing SharePoint site" in Outlook mail becomes a new, empty Word document or
// Excel workbook with that name in the Glance folder of that site's document library (owner approval 2026-10-24, row 79a: SharePoint,
// a file saved with read-back and an Undo that refuses after an edit). The SharePoint twin of core/onedrive-new-file.js, which reads the
// same ask. Portable: no chrome.*, no DOM, no network. Behind the off switch SHAREPOINT_NEW_FILE (default off).
//
// The close is the file existing, named as asked, in the library of the one site the mail names. The site is found by name through
// Graph search (read only) and must match exactly one site by its name; none or several is silence, Glance never picks a site. The
// file is empty and unshared; Glance writes no content. It never replaces a file (conflictBehavior=fail). Handled only when the read
// back by id shows the same name, a file, a size above zero and not deleted. Undo deletes it only while eTag and lastModifiedDateTime
// are still the ones read back; after the person edited it, Undo leaves it. Needs the delegated scope Sites.ReadWrite.All, asked only
// when the SharePoint box is ticked on the Connect screen.
//
// The host injects call({ method, path, raw?, contentType? }) -> Promise<{ ok, status, body }> against https://graph.microsoft.com/v1.0.
const FlowSharepointNewFile = (() => {
  function sibling(globalValue, file, name) {
    if (globalValue) return globalValue;
    try { return typeof require !== 'undefined' ? require(file)[name] : null; } catch (e) { return null; }
  }
  const base = sibling(typeof FlowOnedriveNewFile !== 'undefined' ? FlowOnedriveNewFile : null, './onedrive-new-file.js', 'FlowOnedriveNewFile');
  const drive = sibling(typeof FlowOnedriveFile !== 'undefined' ? FlowOnedriveFile : null, './onedrive-file.js', 'FlowOnedriveFile');
  const proofs = sibling(typeof FlowProofOfClose !== 'undefined' ? FlowProofOfClose : null, './proof-of-close.js', 'FlowProofOfClose');
  const word = sibling(typeof FlowOutlookWord !== 'undefined' ? FlowOutlookWord : null, './outlook-word.js', 'FlowOutlookWord');
  const excel = sibling(typeof FlowOutlookExcel !== 'undefined' ? FlowOutlookExcel : null, './outlook-excel.js', 'FlowOutlookExcel');

  const SWITCH = 'SHAREPOINT_NEW_FILE';
  const SWITCH_DEFAULT = false;
  const SCOPE = 'Sites.ReadWrite.All';
  const CONNECTOR = 'sharepointNewFile';
  const SYSTEM = 'microsoft/sharepoint';
  const FOLDER = 'Glance';
  const EXT = { doc: '.docx', sheet: '.xlsx' };
  const TYPE = {
    doc: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    sheet: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  };
  const PENDING = 'proof_pending';
  const FAILED = 'verify_failed';

  const SP = '(?:share\\s?point|שרפוינט|שייר\\s?פוינט)';
  const NAME_EN = '(?:["“]([^"”\\n]{2,40})["”]|([A-Z][\\w&\'’-]*(?:\\s+[A-Z0-9][\\w&\'’-]*){0,3}))';
  const NAME_HE = '(?:["“]([^"”\\n]{2,40})["”]|([֐-׿A-Za-z0-9][֐-׿\\w&\'’-]*(?:\\s+[֐-׿A-Za-z0-9][֐-׿\\w&\'’-]*){0,2}))';
  // "on the Marketing SharePoint site", "in the "Q4 Launch" SharePoint site"
  const SITE_BEFORE_EN = new RegExp('\\b(?:on|in|to|at)\\s+(?:the\\s+|our\\s+)?' + NAME_EN + '\\s+' + SP + '(?:\\s+(?:team\\s+)?site)?\\b', 'i');
  // "in SharePoint site Marketing", "on the SharePoint site called Marketing", "in SharePoint, on the Marketing site"
  const SITE_AFTER_EN = new RegExp('\\b(?:on|in|to|at)\\s+(?:the\\s+)?' + SP + '(?:\\s+(?:team\\s+)?site)?\\s*,?\\s*(?:(?:called|named)\\s+)?(?:on\\s+the\\s+)?' + NAME_EN + '(?:\\s+site\\b)?', 'i');
  // «באתר השיווק ב-SharePoint», «ב-SharePoint באתר Marketing»
  const SITE_BEFORE_HE = new RegExp('(?:באתר|לאתר)\\s+(?:ה)?' + NAME_HE + '\\s+(?:ב-?|של\\s+|ב\\s*)' + SP, 'i');
  const SITE_AFTER_HE = new RegExp('(?:ב-?|ל-?)' + SP + '\\s+(?:באתר|לאתר)\\s+(?:ה)?' + NAME_HE, 'i');

  function enabled(flags) {
    if (!flags || typeof flags !== 'object') return SWITCH_DEFAULT;
    return flags[SWITCH] === true;
  }

  function hasScope(scopes) {
    if (scopes == null) return null;
    const list = Array.isArray(scopes) ? scopes : String(scopes).split(/[\s,]+/);
    return list.some((s) => {
      const x = String(s || '').trim().toLowerCase();
      return x === SCOPE.toLowerCase() || x === 'https://graph.microsoft.com/' + SCOPE.toLowerCase();
    });
  }

  // The site words in the mail and the mail without them (so the ask reads like the OneDrive one): { name, rest } or null.
  function siteOf(text) {
    const s = String(text || '').replace(/[​-‏‪-‮ ]/g, ' ');
    if (!new RegExp(SP, 'i').test(s)) return null;
    const heText = /[֐-׿]/.test(s);
    const rules = heText ? [SITE_BEFORE_HE, SITE_AFTER_HE, SITE_BEFORE_EN, SITE_AFTER_EN] : [SITE_BEFORE_EN, SITE_AFTER_EN, SITE_BEFORE_HE, SITE_AFTER_HE];
    for (const re of rules) {
      const m = s.match(re);
      if (!m) continue;
      const name = String(m[1] || m[2] || '').trim();
      if (name.length < 2) continue;
      return { name: name, rest: (s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length)).replace(/\s+/g, ' ').replace(/\s+([.,;?!])/g, '$1').trim() };
    }
    return null;
  }

  // The ask, or silence with a reason: the OneDrive reader's ask plus one named site.
  function recognize(text) {
    const s = String(text || '');
    if (!base || !new RegExp(SP, 'i').test(s)) return { kind: 'ignore' };
    const site = siteOf(s);
    const ask = base.recognize(site ? site.rest : s);
    if (ask.kind === 'ignore') return ask; // nothing asks for a new file: SharePoint is just mentioned
    if (!site) return { kind: 'block', reason: 'no-site' };
    if (ask.kind !== 'clear') return ask;
    return Object.assign({}, ask, { siteName: site.name });
  }

  function norm(x) { return String(x || '').toLowerCase().replace(/[\s_-]+/g, ' ').trim(); }

  // Candidate site names, longest first: "Marketing Please" is tried, then "Marketing".
  function candidates(name) {
    const words = String(name || '').trim().split(/\s+/).filter(Boolean);
    const out = [];
    for (let n = words.length; n >= 1; n--) out.push(words.slice(0, n).join(' '));
    return out;
  }

  // The one site that has this name, or { reason }. Read only: GET /sites?search=.
  async function resolveSite(name, io) {
    for (const cand of candidates(name)) {
      const res = await io.call({ method: 'GET', path: '/sites?search=' + encodeURIComponent(cand) });
      if (res && (res.status === 401 || res.status === 403)) return { reason: 'not-connected' };
      if (!res || res.ok !== true || !res.body || !Array.isArray(res.body.value)) return { reason: 'site-lookup-failed' };
      const hits = res.body.value.filter((s) => s && s.id && (norm(s.displayName) === norm(cand) || norm(s.name) === norm(cand)));
      if (hits.length === 1) return { site: { id: String(hits[0].id), name: String(hits[0].displayName || hits[0].name || cand), url: hits[0].webUrl || '' } };
      if (hits.length > 1) return { reason: 'site-ambiguous' };
    }
    return { reason: 'site-not-found' };
  }

  function fileNameFor(kind, name) {
    const base0 = drive && drive.safeName ? drive.safeName(String(name || '').replace(/\.(?:docx|xlsx)$/i, '')) : '';
    return base0 ? base0 + EXT[kind] : '';
  }

  function enc(x) { return encodeURIComponent(x); }
  function createPath(siteId, fileName) { return '/sites/' + enc(siteId) + '/drive/root:/' + enc(FOLDER) + '/' + enc(fileName) + ':/content'; }
  function itemPath(siteId, id) { return '/sites/' + enc(siteId) + '/drive/items/' + enc(id); }

  // The plan, with the site resolved (read only). io.call is needed; without it the plan is silent.
  async function plan(input, io) {
    input = input || {};
    if (!enabled(input.flags)) return { action: 'off', reason: 'switch-off' };
    const r = recognize(input.text);
    if (r.kind !== 'clear') return { action: 'silence', reason: r.reason || 'no-ask' };
    if (!io || typeof io.call !== 'function') return { action: 'silence', reason: 'no-host' };
    const fileName = fileNameFor(r.fileKind, r.name);
    if (!fileName) return { action: 'silence', reason: 'no-name' };
    const found = await resolveSite(r.siteName, io);
    if (!found.site) return { action: 'silence', reason: found.reason };
    const he = r.lang === 'he';
    const kindLabel = r.fileKind === 'sheet' ? (he ? 'חוברת Excel' : 'Excel workbook') : (he ? 'מסמך Word' : 'Word document');
    return {
      action: 'offer',
      approval: 'DoIt',
      fileKind: r.fileKind,
      name: r.name,
      fileName: fileName,
      siteId: found.site.id,
      siteName: found.site.name,
      line: he ? 'ליצור ' + kindLabel + ' ריק בשם "' + fileName + '" באתר SharePoint "' + found.site.name + '"?' : 'Create an empty ' + kindLabel + ' called "' + fileName + '" on the "' + found.site.name + '" SharePoint site?',
      steps: [
        { id: 'create', kind: 'drive', label: he ? 'יצירת הקובץ ב-SharePoint ובדיקה חוזרת' : 'Create the file in SharePoint and read it back', proof: SYSTEM },
        { id: 'share', kind: 'manual', label: he ? 'תוכן והרשאות: על פי בחירתך, גלאנס לא כותב ולא משתף' : 'Content and permissions: your choice, Glance does not write or share' }
      ],
      lang: r.lang
    };
  }

  function miss(reason, extra) {
    return Object.assign({ ok: false, reason: reason, proof: null }, extra || {});
  }

  function bytesFor(kind) {
    if (kind === 'sheet') return excel && excel.xlsxBytes ? excel.xlsxBytes() : null;
    return word && word.docxBytes ? word.docxBytes('') : null;
  }

  // The write itself, shared with the attachment save (core/sharepoint-save-file.js): resolve nothing, trust the site id the person saw,
  // read it once more by id, upload without replacing, read back by id. input: { siteId, fileName, siteName, now, expectedSize? };
  // bytes and contentType come from the caller. system is the ProofOfClose system.
  async function writeFile(input, bytes, contentType, kind, io) {
    const call = io.call;
    const siteId = String(input.siteId || '').trim();
    const fileName = String(input.fileName || '');
    const site = await call({ method: 'GET', path: '/sites/' + enc(siteId) });
    if (site && (site.status === 401 || site.status === 403)) return miss('not-connected');
    if (!site || site.ok !== true || !site.body || String(site.body.id) !== siteId) return miss('site-not-found');
    const put = await call({ method: 'PUT', path: createPath(siteId, fileName) + '?@microsoft.graph.conflictBehavior=fail', raw: bytes, contentType: contentType });
    if (put && (put.status === 401 || put.status === 403)) return miss('not-connected');
    if (put && put.status === 409) return miss('name-taken');
    if (!put || put.ok !== true || !put.body || !put.body.id) return miss('write-failed');
    const id = String(put.body.id);
    const ref = { siteId: siteId, itemId: id, fileId: id, externalId: id, kind: kind, created: true, createdByGlance: true };
    // Nothing stays in the site that the card does not own: a file that cannot be confirmed is deleted again; if that fails the ref is kept for Undo.
    const withdraw = async (why) => {
      const gone = await call({ method: 'DELETE', path: itemPath(siteId, id) });
      const removed = !!(gone && (gone.ok === true || gone.status === 404));
      return miss(FAILED, { ref: removed ? null : ref, removed: removed, why: why, itemId: id });
    };
    const back = await call({ method: 'GET', path: itemPath(siteId, id) });
    if (!back || back.ok !== true || !back.body || String(back.body.id) !== id) return withdraw('get-' + (back && back.status));
    const f = back.body;
    if (f.deleted) return withdraw('deleted');
    if (String(f.name || '') !== fileName) return withdraw('name-differs');
    if (!f.file) return withdraw('not-a-file');
    if (!(Number(f.size) > 0)) return withdraw('empty-upload');
    if (input.expectedSize != null && Number(f.size) !== Number(input.expectedSize)) return withdraw('size-differs');
    if (!f.eTag || !f.lastModifiedDateTime) return withdraw('no-stamp');
    const verifiedAt = typeof input.now === 'string' ? input.now : new Date().toISOString();
    const url = f.webUrl && String(f.webUrl).slice(0, 8) === 'https://' ? f.webUrl : '';
    const finalRef = Object.assign({}, ref, { eTag: String(f.eTag), lastModifiedDateTime: String(f.lastModifiedDateTime) });
    const proof = proofs ? proofs.buildProof({ system: SYSTEM, externalId: id, url: url, fetchedBack: true, verifiedAt: verifiedAt }) : null;
    if (!proof) return miss(PENDING, { ref: finalRef });
    const siteName = String(site.body.displayName || site.body.name || input.siteName || '');
    return {
      ok: true,
      connector: CONNECTOR,
      where: 'SharePoint',
      target: 'SharePoint > ' + (siteName ? siteName + ' > ' : '') + FOLDER + ' > ' + fileName,
      written: 'SharePoint · ' + (siteName ? siteName + ' · ' : '') + fileName,
      url: url || null,
      proof: proof,
      ref: finalRef,
      // The file exists and is not shared. Whether the people it was for have used it is theirs.
      loopClosed: true
    };
  }

  // Do It. The host passes the plan's kind, file name and site id as the person saw them; the site is read once more, by id, first.
  async function create(input, io) {
    input = input || {};
    io = io || {};
    if (!enabled(input.flags)) return miss('switch-off');
    if (typeof io.call !== 'function') return miss('no-host');
    if (!drive) return miss('no-onedrive-module');
    const kind = input.fileKind === 'sheet' ? 'sheet' : input.fileKind === 'doc' ? 'doc' : '';
    const fileName = kind ? fileNameFor(kind, input.fileName || input.name) : '';
    const siteId = String(input.siteId || '').trim();
    if (!kind || !fileName || !siteId) return miss('unclear');
    if (input.grantedScopes != null && hasScope(input.grantedScopes) === false) return miss('sharepoint-not-granted');
    const bytes = bytesFor(kind);
    if (!bytes) return miss('no-office-module');
    return writeFile(Object.assign({}, input, { fileName: fileName }), bytes, TYPE[kind], kind, io);
  }

  // Undo: delete the file, only while it is still exactly what Glance made.
  async function undo(ref, io) {
    io = io || {};
    if (!ref || !ref.itemId || !ref.siteId || ref.createdByGlance !== true) return { ok: false, reason: 'not-ours' };
    if (typeof io.call !== 'function') return { ok: false, reason: 'no-host' };
    const path = itemPath(ref.siteId, ref.itemId);
    const got = await io.call({ method: 'GET', path: path });
    if (got && (got.status === 401 || got.status === 403)) return { ok: false, reason: 'not-connected' };
    if (got && got.status === 404) return { ok: true, undone: true, externalId: ref.itemId };
    if (!got || got.ok !== true || !got.body) return { ok: false, reason: 'unconfirmed', error: "Couldn't confirm it's unchanged. Undo left it alone." };
    if (got.body.deleted) return { ok: true, undone: true, externalId: ref.itemId };
    if (!ref.eTag || !ref.lastModifiedDateTime || !got.body.eTag || !got.body.lastModifiedDateTime) {
      return { ok: false, reason: 'unconfirmed', error: "Couldn't confirm it's unchanged. Undo left it alone." };
    }
    if (String(got.body.eTag) !== String(ref.eTag) || String(got.body.lastModifiedDateTime) !== String(ref.lastModifiedDateTime)) {
      return { ok: false, reason: 'user-edited', undoUnavailable: true, error: 'You edited this. Undo left it alone.' };
    }
    const del = await io.call({ method: 'DELETE', path: path });
    if (del && (del.status === 401 || del.status === 403)) return { ok: false, reason: 'not-connected' };
    if (!del || !(del.ok === true || del.status === 404)) return { ok: false, reason: 'undo-failed' };
    const after = await io.call({ method: 'GET', path: path });
    const gone = after && (after.status === 404 || (after.ok === true && after.body && after.body.deleted));
    return gone ? { ok: true, undone: true, externalId: ref.itemId } : { ok: false, reason: 'undo-unverified' };
  }

  return { SWITCH, SWITCH_DEFAULT, SCOPE, SYSTEM, CONNECTOR, FOLDER, enabled, hasScope, siteOf, recognize, resolveSite, plan, create, writeFile, undo };
})();

if (typeof module !== 'undefined') module.exports = { FlowSharepointNewFile };
else if (typeof globalThis !== 'undefined') globalThis.FlowSharepointNewFile = FlowSharepointNewFile;
