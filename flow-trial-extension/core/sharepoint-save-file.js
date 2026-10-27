// "Please save the attached contract on the Marketing SharePoint site" in Outlook mail saves that attachment, unchanged, into the Glance
// folder of that site's document library (owner approval 2026-10-24, row 79a: SharePoint, a file saved with read-back and an Undo that
// refuses after an edit). The attachment twin of core/sharepoint-new-file.js, which owns the site lookup, the write and the Undo. Portable:
// no chrome.*, no DOM, no network. Behind the off switch SHAREPOINT_SAVE_FILE (default off).
//
// An explicit ask, not a suggestion: a save verb asked of the reader, a file the mail points at (attached, the contract, this file), and
// one named SharePoint site. The site is found by name through Graph search (read only) and must match exactly one site. The file is the
// mail's only real attachment, or the one attachment whose name the mail says; two candidates is silence, Glance never guesses which.
// The bytes are the attachment's own, never changed. A name already taken in the folder is a refusal (nothing replaced). Handled only
// when the read-back by id shows the same name, a file and the same size. Undo deletes it only while eTag and lastModifiedDateTime are
// still the ones read back. Needs Sites.ReadWrite.All (the SharePoint box on the Connect screen).
//
// The host injects call({ method, path, raw?, contentType? }) -> Promise<{ ok, status, body }> against https://graph.microsoft.com/v1.0.
const FlowSharepointSaveFile = (() => {
  function sibling(globalValue, file, name) {
    if (globalValue) return globalValue;
    try { return typeof require !== 'undefined' ? require(file)[name] : null; } catch (e) { return null; }
  }
  const sp = sibling(typeof FlowSharepointNewFile !== 'undefined' ? FlowSharepointNewFile : null, './sharepoint-new-file.js', 'FlowSharepointNewFile');
  const base = sibling(typeof FlowOnedriveNewFile !== 'undefined' ? FlowOnedriveNewFile : null, './onedrive-new-file.js', 'FlowOnedriveNewFile');
  const drive = sibling(typeof FlowOnedriveFile !== 'undefined' ? FlowOnedriveFile : null, './onedrive-file.js', 'FlowOnedriveFile');

  const SWITCH = 'SHAREPOINT_SAVE_FILE';
  const SWITCH_DEFAULT = false;
  const CONNECTOR = 'sharepointSaveFile';
  const MAX_BYTES = 3 * 1000 * 1000; // a file attachment that Graph lists with its bytes

  const SAVE_EN = /\b(?:save|store|upload|put|file|add|drop|copy|move|archive)\b/i;
  const FILE_EN = /\b(?:attach(?:ed|ment|ments)|enclosed|this\s+(?:file|document|pdf|contract|invoice|quote|report|presentation|spreadsheet)|the\s+(?:file|document|pdf|contract|invoice|quote|report|presentation|spreadsheet|attachment)s?)\b/i;
  const ASK_EN = /\b(?:please|can you|could you|would you|will you|kindly|i need you to|let'?s|we need you to|we need to)\b|^\s*(?:save|store|upload|put|file|add|drop|copy|archive)\b/i;
  const SAVE_HE = /(?:תשמור(?:י|ו)?|שמור|שמרי|תעלה|תעלי|תעלו|העלה|העלי|תוסיף|תוסיפי|הוסף|הוסיפי|לשמור|להעלות|להוסיף)/;
  const FILE_HE = /(?:הקובץ|המצורף|המסמך|החוזה|החשבונית|ההצעה|הדוח|המצגת|הגיליון|הקבצים)/;
  const ASK_HE = /(?:בבקשה|נא\s|אפשר|תוכל|תוכלי|תוכלו|אתה יכול|את יכולה|בוא|בואו|צריך|צריכים|תשמור|תשמרי|תעלה|תעלי|תוסיף|תוסיפי|שמור|שמרי|העלה|העלי|הוסף)/;
  const OTHER_TARGET = /\b(?:onedrive|dropbox|google\s*drive|gdrive|box\.com|icloud)\b|דרופבוקס|גוגל\s*דרייב|וואן\s*דרייב/i;
  // A question about the file, or a report that it is saved already, is not an ask. "Could you ...?" is a polite ask and stays one.
  const REMEMBER = /(?:^|[.!?]\s*)(?:hi\s*,?\s*|hello\s*,?\s*)?(?:did|was|were|is|are|has|have|where|which|how|when|why|what)\b|\b(?:already|was\s+saved|is\s+saved|has\s+been\s+saved|were\s+saved)\b|(?:^|[\s,.])(?:איפה|מתי|האם|למה|איך)(?:[\s,.?]|$)/i;
  // Saving is all this card does: an ask that also sends, shares or forwards the file is not offered half-done.
  const ALSO_SEND = /\b(?:send|email|e-?mail|forward|share|reply|message|text)\b|(?:ותשלח|ולשלוח|תשלח|שלח|ותשתף|ולשתף|תשתף|תעביר|ותעביר)/i;

  function enabled(flags) {
    if (!flags || typeof flags !== 'object') return SWITCH_DEFAULT;
    return flags[SWITCH] === true;
  }

  // The ask, or silence with a reason.
  function recognize(text) {
    const s = String(text || '').replace(/[​-‏‪-‮ ]/g, ' ');
    if (!sp || !base || !s.trim()) return { kind: 'ignore' };
    if (!/(?:share\s?point|שרפוינט|שייר\s?פוינט)/i.test(s)) return { kind: 'ignore' };
    const he = /[֐-׿]/.test(s);
    const saveVerb = SAVE_EN.test(s) || SAVE_HE.test(s);
    const fileRef = FILE_EN.test(s) || FILE_HE.test(s);
    if (!saveVerb || !fileRef) return { kind: 'ignore' }; // SharePoint is just mentioned
    const site = sp.siteOf(s);
    if (!site) return { kind: 'block', reason: 'no-site' };
    if (OTHER_TARGET.test(s)) return { kind: 'block', reason: 'other-target' };
    const why = base.blockedBy(s);
    if (why) return { kind: 'block', reason: why };
    if (REMEMBER.test(s)) return { kind: 'block', reason: 'question-or-report' };
    if (ALSO_SEND.test(s)) return { kind: 'block', reason: 'also-sends' };
    if (!(ASK_EN.test(s) || ASK_HE.test(s))) return { kind: 'block', reason: 'no-request' };
    return { kind: 'clear', lang: he ? 'he' : 'en', siteName: site.name, rest: site.rest };
  }

  function stem(name) { return String(name || '').replace(/\.[A-Za-z0-9]{1,6}$/, '').toLowerCase().trim(); }

  // The one attachment the mail means: the only real file attachment, or the only one whose name the mail says.
  function pickFile(text, attachments) {
    const list = (Array.isArray(attachments) ? attachments : []).filter((a) => a && a.id && a.name && !a.isInline && (!a['@odata.type'] || /fileAttachment$/i.test(String(a['@odata.type']))));
    if (!list.length) return { reason: 'no-files' };
    if (list.length === 1) return { file: list[0] };
    const t = String(text || '').toLowerCase();
    const named = list.filter((a) => t.indexOf(String(a.name).toLowerCase()) >= 0 || (stem(a.name).length >= 4 && t.indexOf(stem(a.name)) >= 0));
    // A name that is also part of another file's name ("contract" and "contract-v2") does not say which one.
    const sole = named.filter((a) => !list.some((o) => o !== a && (String(o.name).toLowerCase().indexOf(stem(a.name)) >= 0 || stem(o.name).indexOf(stem(a.name)) >= 0)) || t.indexOf(String(a.name).toLowerCase()) >= 0);
    if (sole.length === 1 && named.length === 1) return { file: sole[0] };
    return { reason: 'which-file' };
  }

  function safeFileName(name) {
    return drive && drive.safeName ? drive.safeName(name) : '';
  }

  // The plan, with the site and the file resolved (read only). io.call is needed; without it the plan is silent.
  async function plan(input, io) {
    input = input || {};
    if (!enabled(input.flags)) return { action: 'off', reason: 'switch-off' };
    const r = recognize(input.text);
    if (r.kind !== 'clear') return { action: 'silence', reason: r.reason || 'no-ask' };
    if (!io || typeof io.call !== 'function') return { action: 'silence', reason: 'no-host' };
    const picked = pickFile(input.text, input.attachments);
    if (!picked.file) return { action: 'silence', reason: picked.reason };
    const f = picked.file;
    const fileName = safeFileName(f.name);
    if (!fileName) return { action: 'silence', reason: 'no-name' };
    if (!(Number(f.size) > 0)) return { action: 'silence', reason: 'empty-file' };
    if (Number(f.size) > MAX_BYTES) return { action: 'silence', reason: 'too-large' };
    const found = await sp.resolveSite(r.siteName, io);
    if (!found.site) return { action: 'silence', reason: found.reason };
    const he = r.lang === 'he';
    return {
      action: 'offer',
      approval: 'DoIt',
      fileName: fileName,
      attachmentId: String(f.id),
      size: Number(f.size),
      siteId: found.site.id,
      siteName: found.site.name,
      line: he ? 'לשמור את "' + fileName + '" באתר SharePoint "' + found.site.name + '"?' : 'Save "' + fileName + '" on the "' + found.site.name + '" SharePoint site?',
      steps: [
        { id: 'save', kind: 'drive', label: he ? 'שמירת הקובץ ב-SharePoint ובדיקה חוזרת' : 'Save the file in SharePoint and read it back', proof: sp.SYSTEM }
      ],
      lang: r.lang
    };
  }

  function miss(reason, extra) {
    return Object.assign({ ok: false, reason: reason, proof: null }, extra || {});
  }

  function bytesOf(b64) {
    try {
      if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(String(b64), 'base64'));
      const bin = atob(String(b64));
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    } catch (e) { return null; }
  }

  // Do It. The host passes the plan's file name, site id and the attachment as read from the message (base64 and its own name).
  async function save(input, io) {
    input = input || {};
    io = io || {};
    if (!enabled(input.flags)) return miss('switch-off');
    if (typeof io.call !== 'function') return miss('no-host');
    const fileName = safeFileName(input.fileName);
    const siteId = String(input.siteId || '').trim();
    if (!fileName || !siteId) return miss('unclear');
    if (input.grantedScopes != null && sp.hasScope(input.grantedScopes) === false) return miss('sharepoint-not-granted');
    // What was read from the message must be the file the person saw named on the card.
    if (input.attachmentName != null && safeFileName(input.attachmentName) !== fileName) return miss('attachment-differs');
    const bytes = bytesOf(input.base64);
    if (!bytes || !bytes.length) return miss('no-bytes');
    if (bytes.length > MAX_BYTES) return miss('too-large');
    const type = String(input.contentType || 'application/octet-stream');
    return sp.writeFile(Object.assign({}, input, { fileName: fileName, expectedSize: bytes.length }), bytes, type, 'file', io);
  }

  return { SWITCH, SWITCH_DEFAULT, CONNECTOR, MAX_BYTES, enabled, recognize, pickFile, plan, save, undo: sp ? sp.undo : null };
})();

if (typeof module !== 'undefined') module.exports = { FlowSharepointSaveFile };
else if (typeof globalThis !== 'undefined') globalThis.FlowSharepointSaveFile = FlowSharepointSaveFile;
