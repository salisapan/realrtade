// "Please set up a shared doc / tracker for X" in Outlook mail becomes a new,
// empty Word document or Excel workbook with that name in OneDrive > Glance
// (ecosystem gap row 76: create Word or Excel from a request with no
// attachment). The Microsoft twin of core/workspace-file.js. Portable: no
// chrome.*, no DOM, no network. Behind the off switch ONEDRIVE_NEW_FILE
// (default off).
//
// The close is the file existing, named as asked, in the person's OneDrive.
// Glance does not write the content: the file is empty, ready for the person
// and the people they share it with. Glance does not share it. The upload uses
// `Files.ReadWrite`, the existing OneDrive box, no new scope. It never
// replaces a file: a name already taken is a refusal (conflictBehavior=fail).
// Handled only when the read-back by id shows the same name, a file (not a
// folder), a size above zero and not deleted. Undo deletes it only while eTag
// and lastModifiedDateTime are still the ones read back; after the person
// edited it, Undo leaves it.
//
// Rules:
//   - one explicit request to create it (Hebrew and English), with a name the
//     person gave ("called Q4 launch plan", "for the Q4 launch", "בשם ...");
//     no name is silence, Glance does not invent one;
//   - an existing file ("update the doc", "attached", "the sheet we have"), a
//     request to write the content, a Google or other app named, a hedge, a
//     negation, FYI, and "ask Dana to create" stay silent.
//
// The host injects call({ method, path, raw?, contentType? }) -> Promise<{ ok,
// status, body }> against https://graph.microsoft.com/v1.0. No src/ file calls
// this yet.
const FlowOnedriveNewFile = (() => {
  function sibling(globalValue, file, name) {
    if (globalValue) return globalValue;
    try { return typeof require !== 'undefined' ? require(file)[name] : null; } catch (e) { return null; }
  }
  const attach = sibling(typeof FlowFileAttach !== 'undefined' ? FlowFileAttach : null, './file-attach.js', 'FlowFileAttach');
  const proofs = sibling(typeof FlowProofOfClose !== 'undefined' ? FlowProofOfClose : null, './proof-of-close.js', 'FlowProofOfClose');
  const drive = sibling(typeof FlowOnedriveFile !== 'undefined' ? FlowOnedriveFile : null, './onedrive-file.js', 'FlowOnedriveFile');
  const word = sibling(typeof FlowOutlookWord !== 'undefined' ? FlowOutlookWord : null, './outlook-word.js', 'FlowOutlookWord');
  const excel = sibling(typeof FlowOutlookExcel !== 'undefined' ? FlowOutlookExcel : null, './outlook-excel.js', 'FlowOutlookExcel');

  const SWITCH = 'ONEDRIVE_NEW_FILE';
  const SWITCH_DEFAULT = false;
  const SYSTEM_DOC = 'microsoft/word';
  const SYSTEM_SHEET = 'microsoft/excel';
  const CONNECTOR = 'onedriveNewFile';
  const EXT = { doc: '.docx', sheet: '.xlsx' };
  const TYPE = {
    doc: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    sheet: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  };
  const PENDING = 'proof_pending';
  const FAILED = 'verify_failed';

  const NOUN_EN = '(?:word\\s+|excel\\s+)?(?:shared\\s+)?(doc(?:ument)?|notes?(?:\\s+doc)?|agenda|minutes|sheet|spreadsheet|workbook|tracker|budget\\s+sheet|checklist)';
  const MAKE_EN = new RegExp('\\b(?:create|set\\s+up|start|open|make|build|put\\s+together|prepare|begin)\\s+(?:up\\s+)?(?:a|an|the|one)?\\s*(?:new\\s+)?(?:shared\\s+)?' + NOUN_EN + '\\b', 'i');
  const MAKE_HE = /(?:לפתוח|ליצור|להכין|להקים|תפתח(?:י|ו)?|תיצור|תיצרי|תיצרו|פתח(?:י|ו)?|צור|צרי|תכין|תכיני|תכינו|הכן|הכיני|נפתח|נכין|נקים|תקים|תקימי|תקימו)\s+(?:לנו\s+|לי\s+)?(?:בבקשה\s+)?(מסמך|גיליון|טבלה|מעקב|אג'נדה|אגנדה|סיכום|רשימת\s+משימות)/;
  const ASK_EN = /\b(?:please|can you|could you|would you|will you|kindly|i need you to|let'?s|we need you to|we need to)\b|^\s*(?:create|set up|start|open|make|build|prepare)\b/i;
  const ASK_HE = /(?:בבקשה|נא\s|אפשר|תוכל|תוכלי|תוכלו|אתה יכול|את יכולה|בוא|בואו|צריך|צריכים|תפתח|תיצור|תכין|תקים|פתח|צור|הכן)/;
  const EXISTING = /\b(?:update|edit|fill\s+in|add\s+to|finish|review|attached|enclosed|already|existing|we\s+have|you\s+have|the\s+one\s+(?:we|i)|latest\s+version|latest|current)\b|עדכן|עדכני|תעדכן|מצורף|קיים|כבר\s+יש|הקיים/i;
  const CONTENT = /\b(?:write|draft|compose|summari[sz]e|fill\s+it\s+(?:in|out)|with\s+the\s+numbers|and\s+(?:write|fill|add|list|include)|that\s+(?:lists|includes|summari[sz]es|covers))\b|תכתוב|תנסח|תסכם|ותכתוב|וימלא|ותמלא|שמכיל|שמסכם/i;
  const OTHER_APP = /\b(?:google|gdoc|gsheet|pages|numbers|notion|confluence|onenote|powerpoint|slides?|deck|sharepoint|planner)\b|גוגל|נושן|וואן\s*נוט/i;
  const NEG = /\b(?:no need (?:to|for)|don'?t (?:need|create|make|open)|do not (?:create|make|open)|not necessary|without (?:a|an))\b|אין\s+צורך|אל\s+תפתח|לא\s+צריך/i;
  const HEDGE = /\b(?:maybe|perhaps|if you want|if you'?d like|if it helps|no pressure|sometime|at some point|one day|might)\b|(?:^|[\s,.])אולי(?:[\s,.]|$)|אם\s+בא\s+לך|אם\s+יש\s+זמן/i;
  // Looking back ("it was possible yesterday") and the writer's own promise ("I'll open a doc") are not an ask of the reader.
  const PAST_HE = /(?:^|[\s,.])(?:אתמול|שבוע\s+שעבר|בעבר)(?:[\s,.?!]|$)/;
  const SELF_HE = /(?:^|[\s,.])(?:אני|אנחנו|אנו)\s+(?:א|נ)(?:פתח|יצור|כין|קים)(?![֐-׿])/;
  const FYI = /\b(?:fyi|for your information|no action needed)\b|לידיעתך|לידיעה/i;
  const THIRD = /\b(?:ask|have|get|tell|let)\s+(?!(?:me|us|you)\b)[A-Za-z][\w']*(?:\s+[A-Za-z][\w']*){0,3}\s+(?:to\s+)?(?:create|set\s+up|start|open|make|build|prepare)\b|תבקש(?:י|ו)?\s*מ|תגיד(?:י|ו)?\s*ל(?!י(?:\s|$|[.,!?]))/i;
  const NAMED_EN = /\b(?:called|named|titled|entitled)\s+["“'‘]?([^"”'’\n.;?!]{3,60}?)["”'’]?(?=\s*(?:[.;?!,]|\bso\b|\band\b|\bby\b|\bbefore\b|\bfor\s+(?:us|me|everyone|the\s+team)\b|$))/i;
  const NAMED_HE = /(?:בשם|שנקרא|שכותרתו)\s+["“'‘]?([^"”'’\n.;?!,]{3,60}?)["”'’]?(?=\s*[.;?!,]|\s+(?:עד|לפני|בבקשה)(?:\s|$)|\s*$)/;
  const FOR_EN = /\b(?:for|about|on)\s+(?:the\s+|our\s+|my\s+)?([A-Za-z0-9][\w'’&/-]*(?:\s+[A-Za-z0-9][\w'’&/-]*){0,4}?)(?=\s*(?:[.;?!,]|\bso\b|\band\b|\bby\b|\bbefore\b|\bfrom\b|\bwith\b|\bthis\b|\bnext\b|\btomorrow\b|\btoday\b|\bsoon\b|\bplease\b|$))/i;
  const FOR_HE = /(?:מסמך|גיליון|טבלה|מעקב|אג'נדה|אגנדה|סיכום|משימות)\s+(?:ל|עבור\s+|בנושא\s+)(?:ה)?([֐-׿A-Za-z0-9][֐-׿\w'’&/-]*(?:\s+[֐-׿A-Za-z0-9][֐-׿\w'’&/-]*){0,3}?)(?=\s*[.;?!,]|\s+(?:עד|לפני|בבקשה)(?:\s|$)|\s*$)/;

  function enabled(flags) {
    if (!flags || typeof flags !== 'object') return SWITCH_DEFAULT;
    return flags[SWITCH] === true;
  }

  function kindOf(noun) {
    return /sheet|spreadsheet|workbook|tracker|budget|checklist|גיליון|טבלה|מעקב|רשימת/i.test(noun) ? 'sheet' : 'doc';
  }

  function cleanName(raw) {
    let s = String(raw || '').replace(/[\r\n]+/g, ' ').replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();
    s = s.replace(/^(?:the|our|my|a|an)\s+/i, '').replace(/\s+(?:please|thanks|thank you)$/i, '').trim();
    if (s.length < 3 || s.length > 60 || s.indexOf('..') !== -1) return '';
    return s;
  }

  // The guards every ask of this family shares (a Glance own-promise, a past ask, a negation, FYI, a hedge, a third party): the reason or ''.
  function blockedBy(text) {
    const s = String(text || '').replace(/[​-‏‪-‮ ]/g, ' ');
    if (NEG.test(s)) return 'negation';
    if (FYI.test(s)) return 'fyi';
    if (HEDGE.test(s)) return 'hedge';
    if (THIRD.test(s) || (attach && attach.asksThirdParty && attach.asksThirdParty(s))) return 'third-party';
    if (PAST_HE.test(s) || SELF_HE.test(s)) return PAST_HE.test(s) ? 'past' : 'own-promise';
    return '';
  }

  // The ask, or silence with a reason.
  function recognize(text) {
    const s = String(text || '').replace(/[​-‏‪-‮ ]/g, ' ');
    if (!s.trim()) return { kind: 'ignore' };
    const en = s.match(MAKE_EN);
    const he = s.match(MAKE_HE);
    if (!en && !he) return { kind: 'ignore' };
    if (OTHER_APP.test(s)) return { kind: 'block', reason: 'other-app' };
    if (NEG.test(s)) return { kind: 'block', reason: 'negation' };
    if (FYI.test(s)) return { kind: 'block', reason: 'fyi' };
    if (HEDGE.test(s)) return { kind: 'block', reason: 'hedge' };
    if (THIRD.test(s) || (attach && attach.asksThirdParty && attach.asksThirdParty(s))) return { kind: 'block', reason: 'third-party' };
    if (PAST_HE.test(s) || SELF_HE.test(s)) return { kind: 'block', reason: PAST_HE.test(s) ? 'past' : 'own-promise' };
    if (EXISTING.test(s)) return { kind: 'block', reason: 'existing-file' };
    if (CONTENT.test(s)) return { kind: 'block', reason: 'asks-content' };
    if (!(ASK_EN.test(s) || ASK_HE.test(s))) return { kind: 'block', reason: 'no-request' };
    const lang = /[֐-׿]/.test(s) ? 'he' : 'en';
    const noun = (en ? en[1] : he[1]).toLowerCase();
    const kind = kindOf(noun);
    const named = s.match(lang === 'he' ? NAMED_HE : NAMED_EN) || s.match(NAMED_EN);
    let name = named ? cleanName(named[1]) : '';
    if (!name) {
      const about = s.match(lang === 'he' ? FOR_HE : FOR_EN);
      const topic = about ? cleanName(about[1]) : '';
      if (topic) {
        const label = lang === 'he' ? noun.replace(/\s+/g, ' ') : noun.replace(/^notes?\s+doc$/, 'notes').replace(/^doc(?:ument)?$/, 'doc');
        name = lang === 'he' ? label + ' ' + topic : topic + ' ' + label;
        name = name.slice(0, 60);
      }
    }
    // "... בשם הצעה ולשתף": the share is the person's own step; it is not part of the name.
    name = name.replace(/\s+ו(?:לשתף|לשלוח|להוסיף|לכתוב|למלא|לסכם|תשתף|תשלח)(?:\s.*)?$/, '').trim();
    if (!name) return { kind: 'block', reason: 'no-name' };
    return { kind: 'clear', lang: lang, fileKind: kind, name: name };
  }

  function fileNameFor(kind, name) {
    const base = drive && drive.safeName ? drive.safeName(cleanName(name)) : '';
    return base ? base + EXT[kind] : '';
  }

  function plan(input) {
    input = input || {};
    if (!enabled(input.flags)) return { action: 'off', reason: 'switch-off' };
    const r = recognize(input.text);
    if (r.kind !== 'clear') return { action: 'silence', reason: r.reason || 'no-ask' };
    const fileName = fileNameFor(r.fileKind, r.name);
    if (!fileName) return { action: 'silence', reason: 'no-name' };
    const he = r.lang === 'he';
    const kindLabel = r.fileKind === 'sheet' ? (he ? 'חוברת Excel' : 'Excel workbook') : (he ? 'מסמך Word' : 'Word document');
    return {
      action: 'offer',
      approval: 'DoIt',
      fileKind: r.fileKind,
      name: r.name,
      fileName: fileName,
      line: he ? 'ליצור ' + kindLabel + ' ריק בשם "' + fileName + '" ב-OneDrive?' : 'Create an empty ' + kindLabel + ' called "' + fileName + '" in your OneDrive?',
      steps: [
        { id: 'create', kind: 'drive', label: he ? 'יצירת הקובץ ב-OneDrive ובדיקה חוזרת' : 'Create the file in OneDrive and read it back', proof: r.fileKind === 'sheet' ? SYSTEM_SHEET : SYSTEM_DOC },
        { id: 'share', kind: 'manual', label: he ? 'שיתוף והוספת תוכן: על פי בחירתך, גלאנס לא כותב ולא משתף' : 'Share it and add content: your choice, Glance does not write or share' }
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

  // Do It. The host passes the plan's kind and file name as the person saw them.
  async function create(input, io) {
    input = input || {};
    io = io || {};
    if (!enabled(input.flags)) return miss('switch-off');
    if (typeof io.call !== 'function') return miss('no-host');
    if (!drive) return miss('no-onedrive-module');
    const kind = input.fileKind === 'sheet' ? 'sheet' : input.fileKind === 'doc' ? 'doc' : '';
    const fileName = kind ? fileNameFor(kind, String(input.fileName || input.name || '').replace(/\.(?:docx|xlsx)$/i, '')) : '';
    if (!kind || !fileName) return miss('unclear');
    if (input.grantedScopes != null && drive.hasWriteScope(input.grantedScopes) === false) return miss('files-not-granted');
    const bytes = bytesFor(kind);
    if (!bytes) return miss('no-office-module');
    const call = io.call;
    // Never replace a file: a taken name fails with 409.
    const put = await call({ method: 'PUT', path: drive.createContentPath(fileName) + '?@microsoft.graph.conflictBehavior=fail', raw: bytes, contentType: TYPE[kind] });
    if (put && (put.status === 401 || put.status === 403)) return miss('not-connected');
    if (put && put.status === 409) return miss('name-taken');
    if (!put || put.ok !== true || !put.body || !put.body.id) return miss('write-failed');
    const id = String(put.body.id);
    const ref = { itemId: id, fileId: id, externalId: id, kind: kind, created: true, createdByGlance: true };
    // Nothing stays in OneDrive that the card does not own: a file that cannot
    // be confirmed is deleted again, and if that fails the ref is kept for Undo.
    const withdraw = async (why) => {
      const gone = await call({ method: 'DELETE', path: drive.itemPath(id) });
      const removed = !!(gone && (gone.ok === true || gone.status === 404));
      return miss(FAILED, { ref: removed ? null : ref, removed: removed, why: why, itemId: id });
    };
    const back = await call({ method: 'GET', path: drive.itemPath(id) });
    if (!back || back.ok !== true || !back.body || String(back.body.id) !== id) return withdraw('get-' + (back && back.status));
    const f = back.body;
    if (f.deleted) return withdraw('deleted');
    if (String(f.name || '') !== fileName) return withdraw('name-differs');
    if (!f.file) return withdraw('not-a-file');
    if (!(Number(f.size) > 0)) return withdraw('empty-upload');
    if (!f.eTag || !f.lastModifiedDateTime) return withdraw('no-stamp');
    const system = kind === 'sheet' ? SYSTEM_SHEET : SYSTEM_DOC;
    const verifiedAt = typeof input.now === 'string' ? input.now : new Date().toISOString();
    const url = f.webUrl && String(f.webUrl).slice(0, 8) === 'https://' ? f.webUrl : '';
    const finalRef = Object.assign({}, ref, { eTag: String(f.eTag), lastModifiedDateTime: String(f.lastModifiedDateTime) });
    const proof = proofs ? proofs.buildProof({ system: system, externalId: id, url: url, fetchedBack: true, verifiedAt: verifiedAt }) : null;
    if (!proof) return miss(PENDING, { ref: finalRef });
    return {
      ok: true,
      connector: CONNECTOR,
      where: kind === 'sheet' ? 'Excel' : 'Word',
      target: drive.destination(fileName, kind === 'sheet' ? 'Excel' : 'Word'),
      written: (kind === 'sheet' ? 'Excel · ' : 'Word · ') + fileName,
      url: url || null,
      proof: proof,
      ref: finalRef,
      // The file exists, empty and unshared. Whether the people it was for have
      // used it is theirs; the request to create it is what was asked.
      loopClosed: true
    };
  }

  // Undo: delete the file, only while it is still exactly what Glance made.
  async function undo(ref, io) {
    io = io || {};
    if (!ref || !ref.itemId || ref.createdByGlance !== true) return { ok: false, reason: 'not-ours' };
    if (typeof io.call !== 'function' || !drive) return { ok: false, reason: 'no-host' };
    const got = await io.call({ method: 'GET', path: drive.itemPath(ref.itemId) });
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
    const del = await io.call({ method: 'DELETE', path: drive.itemPath(ref.itemId) });
    if (del && (del.status === 401 || del.status === 403)) return { ok: false, reason: 'not-connected' };
    if (!del || !(del.ok === true || del.status === 404)) return { ok: false, reason: 'undo-failed' };
    const after = await io.call({ method: 'GET', path: drive.itemPath(ref.itemId) });
    const gone = after && (after.status === 404 || (after.ok === true && after.body && after.body.deleted));
    return gone ? { ok: true, undone: true, externalId: ref.itemId } : { ok: false, reason: 'undo-unverified' };
  }

  return { SWITCH, SWITCH_DEFAULT, SYSTEM_DOC, SYSTEM_SHEET, CONNECTOR, enabled, recognize, blockedBy, plan, create, undo };
})();

if (typeof module !== 'undefined') module.exports = { FlowOnedriveNewFile };
else if (typeof globalThis !== 'undefined') globalThis.FlowOnedriveNewFile = FlowOnedriveNewFile;
