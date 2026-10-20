// "Please set up a shared doc / tracker for X" becomes a new, empty Google Doc
// or Google Sheet with that name (ecosystem gap: create from a request, with no
// attachment). Portable: no chrome.*, no DOM, no network. Behind the off switch
// WORKSPACE_FILE (default off).
//
// The close is the file existing, named as asked, in the person's Drive. Glance
// does not write the content (it is not a writer): the file is empty, ready for
// the person and the people they share it with. Glance does not share it.
// Drive files.create uses `drive.file`, already granted, no new scope.
// Handled only when the read-back by id shows the same name, the Doc or Sheet
// type, and not trashed. Undo trashes it only while version and modifiedTime
// are still the ones read back; after the person edited it, Undo leaves it.
//
// Rules:
//   - one explicit request to create it (Hebrew and English), with a name the
//     person gave ("called Q4 launch plan", "for the Q4 launch", "בשם ...");
//     no name is silence, Glance does not invent one;
//   - an existing file ("update the doc", "attached", "the sheet we have"), a
//     request to write the content, Word or Excel named, a hedge, a negation,
//     FYI, and "ask Dana to create" stay silent.
//
// The host injects drive(method, path, body?) -> Promise<{ status, ok, json }>
// against https://www.googleapis.com/drive/v3. No src/ file calls this yet.
const FlowWorkspaceFile = (() => {
  function sibling(globalValue, file, name) {
    if (globalValue) return globalValue;
    try { return typeof require !== 'undefined' ? require(file)[name] : null; } catch (e) { return null; }
  }
  const attach = sibling(typeof FlowFileAttach !== 'undefined' ? FlowFileAttach : null, './file-attach.js', 'FlowFileAttach');
  const proofs = sibling(typeof FlowProofOfClose !== 'undefined' ? FlowProofOfClose : null, './proof-of-close.js', 'FlowProofOfClose');

  const SWITCH = 'WORKSPACE_FILE';
  const SWITCH_DEFAULT = false;
  const SYSTEM_DOC = 'google/docs';
  const SYSTEM_SHEET = 'google/sheets';
  const CONNECTOR = 'googleNewFile';
  const MIME = { doc: 'application/vnd.google-apps.document', sheet: 'application/vnd.google-apps.spreadsheet' };
  const PENDING = 'proof_pending';
  const FAILED = 'verify_failed';

  const NOUN_EN = '(?:google\\s+)?(?:shared\\s+)?(doc(?:ument)?|notes?(?:\\s+doc)?|agenda|minutes|sheet|spreadsheet|tracker|budget\\s+sheet|checklist)';
  const MAKE_EN = new RegExp('\\b(?:create|set\\s+up|start|open|make|build|put\\s+together|prepare|begin)\\s+(?:up\\s+)?(?:a|an|the|one)?\\s*(?:new\\s+)?(?:shared\\s+)?' + NOUN_EN + '\\b', 'i');
  const MAKE_HE = /(?:תפתח(?:י|ו)?|תיצור|תיצרי|תיצרו|פתח(?:י|ו)?|צור|צרי|תכין|תכיני|תכינו|הכן|הכיני|נפתח|נכין|נקים|תקים|תקימי|תקימו)\s+(?:לנו\s+|לי\s+)?(?:בבקשה\s+)?(מסמך|גיליון|טבלה|מעקב|אג'נדה|אגנדה|סיכום|רשימת\s+משימות)/;
  const ASK_EN = /\b(?:please|can you|could you|would you|will you|kindly|i need you to|let'?s|we need you to|we need to)\b|^\s*(?:create|set up|start|open|make|build|prepare)\b/i;
  const ASK_HE = /(?:בבקשה|נא\s|אפשר|תוכל|תוכלי|תוכלו|אתה יכול|את יכולה|בוא|בואו|צריך|צריכים|תפתח|תיצור|תכין|תקים|פתח|צור|הכן)/;
  const EXISTING = /\b(?:update|edit|fill\s+in|add\s+to|finish|review|attached|enclosed|already|existing|we\s+have|you\s+have|the\s+one\s+(?:we|i)|latest\s+version|latest|current)\b|עדכן|עדכני|תעדכן|מצורף|קיים|כבר\s+יש|הקיים/i;
  const CONTENT = /\b(?:write|draft|compose|summari[sz]e|fill\s+it\s+(?:in|out)|with\s+the\s+numbers|and\s+(?:write|fill|add|list|include)|that\s+(?:lists|includes|summari[sz]es|covers))\b|תכתוב|תנסח|תסכם|ותכתוב|וימלא|ותמלא|שמכיל|שמסכם/i;
  const OTHER_APP = /\b(?:word|excel|pages|numbers|notion|confluence|onenote|powerpoint|slides?|deck)\b|וורד|אקסל|נושן/i;
  const NEG = /\b(?:no need (?:to|for)|don'?t (?:need|create|make|open)|do not (?:create|make|open)|not necessary|without (?:a|an))\b|אין\s+צורך|אל\s+תפתח|לא\s+צריך/i;
  const HEDGE = /\b(?:maybe|perhaps|if you want|if you'?d like|if it helps|no pressure|sometime|at some point|one day|might)\b|(?:^|[\s,.])אולי(?:[\s,.]|$)|אם\s+בא\s+לך|אם\s+יש\s+זמן/i;
  const FYI = /\b(?:fyi|for your information|no action needed)\b|לידיעתך|לידיעה/i;
  const THIRD = /\b(?:ask|have|get|tell|let)\s+(?!(?:me|us|you)\b)[A-Za-z][\w']*(?:\s+[A-Za-z][\w']*){0,3}\s+(?:to\s+)?(?:create|set\s+up|start|open|make|build|prepare)\b|תבקש(?:י|ו)?\s*מ|תגיד(?:י|ו)?\s*ל(?!י(?:\s|$|[.,!?]))/i;
  const NAMED_EN = /\b(?:called|named|titled|entitled)\s+["“'‘]?([^"”'’\n.;?!]{3,60}?)["”'’]?(?=\s*(?:[.;?!,]|\bso\b|\band\b|\bby\b|\bbefore\b|\bfor\s+(?:us|me|everyone|the\s+team)\b|$))/i;
  const NAMED_HE = /(?:בשם|שנקרא|שכותרתו)\s+["“'‘]?([^"”'’\n.;?!,]{3,60}?)["”'’]?(?=\s*[.;?!,]|\s+(?:עד|לפני|בבקשה)(?:\s|$)|\s*$)/;
  const FOR_EN = /\b(?:for|about|on)\s+(?:the\s+|our\s+|my\s+)?([A-Za-z0-9][\w'’&/-]*(?:\s+[A-Za-z0-9][\w'’&/-]*){0,4}?)(?=\s*(?:[.;?!,]|\bso\b|\band\b|\bby\b|\bbefore\b|\bfrom\b|\bwith\b|\bthis\b|\bnext\b|\btomorrow\b|\btoday\b|\bsoon\b|\bplease\b|$))/i;
  const FOR_HE = /(?:מסמך|גיליון|טבלה|מעקב|אג'נדה|אגנדה|סיכום|משימות)\s+(?:ל|עבור\s+|בנושא\s+)(?:ה)?([\u0590-\u05FFA-Za-z0-9][\u0590-\u05FF\w'’&/-]*(?:\s+[\u0590-\u05FFA-Za-z0-9][\u0590-\u05FF\w'’&/-]*){0,3}?)(?=\s*[.;?!,]|\s+(?:עד|לפני|בבקשה)(?:\s|$)|\s*$)/;

  function enabled(flags) {
    if (!flags || typeof flags !== 'object') return SWITCH_DEFAULT;
    return flags[SWITCH] === true;
  }

  function kindOf(noun) {
    return /sheet|spreadsheet|tracker|budget|checklist|גיליון|טבלה|מעקב|רשימת/i.test(noun) ? 'sheet' : 'doc';
  }

  function cleanName(raw) {
    let s = String(raw || '').replace(/[\r\n]+/g, ' ').replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();
    s = s.replace(/^(?:the|our|my|a|an)\s+/i, '').replace(/\s+(?:please|thanks|thank you)$/i, '').trim();
    if (s.length < 3 || s.length > 60 || s.indexOf('..') !== -1) return '';
    return s;
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
    if (!name) return { kind: 'block', reason: 'no-name' };
    return { kind: 'clear', lang: lang, fileKind: kind, name: name };
  }

  function silence(reason) {
    return { action: 'silence', reason: reason };
  }

  function plan(input) {
    input = input || {};
    if (!enabled(input.flags)) return { action: 'off', reason: 'switch-off' };
    const r = recognize(input.text);
    if (r.kind !== 'clear') return silence(r.reason || 'no-ask');
    const he = r.lang === 'he';
    const kindLabel = r.fileKind === 'sheet' ? (he ? 'גיליון' : 'sheet') : (he ? 'מסמך' : 'doc');
    return {
      action: 'offer',
      approval: 'DoIt',
      fileKind: r.fileKind,
      name: r.name,
      line: he ? 'ליצור ' + kindLabel + ' ריק בשם "' + r.name + '" ב-Drive?' : 'Create an empty ' + kindLabel + ' called "' + r.name + '" in your Drive?',
      steps: [
        { id: 'create', kind: 'drive', label: he ? 'יצירת הקובץ ב-Drive ובדיקה חוזרת' : 'Create the file in Drive and read it back', proof: r.fileKind === 'sheet' ? SYSTEM_SHEET : SYSTEM_DOC },
        { id: 'share', kind: 'manual', label: he ? 'שיתוף והוספת תוכן: על פי בחירתך, גלאנס לא כותב ולא משתף' : 'Share it and add content: your choice, Glance does not write or share' }
      ],
      lang: r.lang
    };
  }

  function filePath(id) {
    return '/files/' + encodeURIComponent(id) + '?fields=' + encodeURIComponent('id,name,mimeType,trashed,version,modifiedTime,webViewLink,owners(emailAddress,me)');
  }

  function miss(reason, extra) {
    return Object.assign({ ok: false, reason: reason, proof: null }, extra || {});
  }

  function snapshotOf(json) {
    return { version: String(json.version == null ? '' : json.version), modifiedTime: String(json.modifiedTime || '') };
  }

  // Do It. The host passes the plan's name and kind as the person saw them.
  async function create(input, io) {
    input = input || {};
    io = io || {};
    if (!enabled(input.flags)) return miss('switch-off');
    if (typeof io.drive !== 'function') return miss('no-host');
    const kind = input.fileKind === 'sheet' ? 'sheet' : input.fileKind === 'doc' ? 'doc' : '';
    const name = cleanName(input.name);
    if (!kind || !name) return miss('unclear');
    const drive = io.drive;
    const posted = await drive('POST', '/files?fields=' + encodeURIComponent('id,name,mimeType,trashed'), { name: name, mimeType: MIME[kind] });
    if (posted.status === 401 || posted.status === 403) return miss('not-connected');
    if (!posted.ok || !posted.json || !posted.json.id) return miss('write-failed');
    const id = posted.json.id;
    const system = kind === 'sheet' ? SYSTEM_SHEET : SYSTEM_DOC;
    const ref = { fileId: id, externalId: id, kind: kind, createdByGlance: true };
    // Nothing stays in Drive that the card does not own: a file that cannot be
    // confirmed is trashed again, and if that fails the ref is kept for Undo.
    const withdraw = async (why) => {
      const gone = await drive('PATCH', '/files/' + encodeURIComponent(id), { trashed: true });
      const removed = !!(gone.ok || gone.status === 404);
      return miss(FAILED, { ref: removed ? null : ref, removed: removed, why: why, fileId: id });
    };
    const back = await drive('GET', filePath(id));
    if (!back.ok || !back.json || back.json.id !== id) return withdraw('get-' + back.status);
    const f = back.json;
    if (f.trashed === true) return withdraw('trashed');
    if (String(f.name || '') !== name) return withdraw('name-differs');
    if (f.mimeType !== MIME[kind]) return withdraw('type-differs');
    const verifiedAt = typeof input.now === 'string' ? input.now : new Date().toISOString();
    const url = f.webViewLink && String(f.webViewLink).slice(0, 8) === 'https://' ? f.webViewLink : '';
    const finalRef = Object.assign({}, ref, { snapshot: snapshotOf(f) });
    const proof = proofs ? proofs.buildProof({ system: system, externalId: id, url: url, fetchedBack: true, verifiedAt: verifiedAt }) : null;
    if (!proof) return miss(PENDING, { ref: finalRef });
    return {
      ok: true,
      connector: CONNECTOR,
      where: kind === 'sheet' ? 'Google Sheets' : 'Google Docs',
      target: name,
      written: (kind === 'sheet' ? 'Sheet · ' : 'Doc · ') + name,
      url: url || null,
      proof: proof,
      ref: finalRef,
      // The file exists, empty and unshared. Whether the people it was for have
      // used it is theirs; the request to create it is what was asked.
      loopClosed: true
    };
  }

  // Undo: trash the file, only while it is still exactly what Glance made.
  async function undo(ref, io) {
    io = io || {};
    if (!ref || !ref.fileId || ref.createdByGlance !== true) return { ok: false, reason: 'not-ours' };
    if (typeof io.drive !== 'function') return { ok: false, reason: 'no-host' };
    const got = await io.drive('GET', filePath(ref.fileId));
    if (got.status === 401 || got.status === 403) return { ok: false, reason: 'not-connected' };
    if (got.status === 404) return { ok: true, undone: true, externalId: ref.fileId };
    if (!got.ok || !got.json) return { ok: false, reason: 'unconfirmed', error: "Couldn't confirm it's unchanged. Undo left it alone." };
    if (got.json.trashed === true) return { ok: true, undone: true, externalId: ref.fileId };
    const snap = ref.snapshot;
    if (!snap || !snap.version || !snap.modifiedTime || got.json.version == null || !got.json.modifiedTime) {
      return { ok: false, reason: 'unconfirmed', error: "Couldn't confirm it's unchanged. Undo left it alone." };
    }
    const live = snapshotOf(got.json);
    if (live.version !== snap.version || live.modifiedTime !== snap.modifiedTime) {
      return { ok: false, reason: 'user-edited', undoUnavailable: true, error: 'You edited this. Undo left it alone.' };
    }
    const del = await io.drive('PATCH', '/files/' + encodeURIComponent(ref.fileId), { trashed: true });
    if (del.status === 401 || del.status === 403) return { ok: false, reason: 'not-connected' };
    if (!(del.ok || del.status === 404)) return { ok: false, reason: 'undo-failed' };
    const after = await io.drive('GET', filePath(ref.fileId));
    const gone = after.status === 404 || (after.ok && after.json && after.json.trashed === true);
    return gone ? { ok: true, undone: true, externalId: ref.fileId } : { ok: false, reason: 'undo-unverified' };
  }

  return { SWITCH, SWITCH_DEFAULT, SYSTEM_DOC, SYSTEM_SHEET, CONNECTOR, enabled, recognize, plan, create, undo };
})();

if (typeof module !== 'undefined') module.exports = { FlowWorkspaceFile };
else if (typeof globalThis !== 'undefined') globalThis.FlowWorkspaceFile = FlowWorkspaceFile;
