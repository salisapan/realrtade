// "Please set up a shared doc / tracker / feedback form for X" becomes a new, empty Google Doc,
// Sheet, Slides deck or Form with that name (ecosystem gap: create from a request, with no
// attachment). Portable: no chrome.*, no DOM, no network. Behind the off switch
// WORKSPACE_FILE (default off).
//
// The close is the file existing, named as asked, in the person's Drive. Glance
// does not write the content (it is not a writer): the file is empty, ready for
// the person and the people they share it with. Glance does not share it.
// Drive files.create uses `drive.file`, already granted, no new scope.
// A Form is created through the Forms API (forms.googleapis.com/v1, scope forms.body and its host
// permission; neither is in manifest.json yet, so the write answers not-connected until the owner
// adds them). The read-back is the form by id: same title. Undo trashes it through Drive only
// while the form's revisionId is the one read back; a form the person edited is left alone.
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
  const MIME = { doc: 'application/vnd.google-apps.document', sheet: 'application/vnd.google-apps.spreadsheet', slides: 'application/vnd.google-apps.presentation', form: 'application/vnd.google-apps.form' };
  const SYSTEM_SLIDES = 'google/slides';
  const SYSTEM_FORM = 'google/forms';
  const FORMS_API = 'https://forms.googleapis.com/v1';
  const PENDING = 'proof_pending';
  const FAILED = 'verify_failed';

  const NOUN_EN = '(?:google\\s+)?(?:shared\\s+)?(doc(?:ument)?|notes?(?:\\s+doc)?|agenda|minutes|sheet|spreadsheet|tracker|budget\\s+sheet|checklist|slide\\s+deck|slides|deck|presentation|(?:feedback\\s+|sign-?up\\s+|registration\\s+|rsvp\\s+|contact\\s+|booking\\s+)?(?:form|survey|questionnaire))';
  const MAKE_EN = new RegExp('\\b(?:create|set\\s+up|start|open|make|build|put\\s+together|prepare|begin)\\s+(?:up\\s+)?(?:a|an|the|one)?\\s*(?:new\\s+)?(?:shared\\s+)?' + NOUN_EN + '\\b', 'i');
  const MAKE_HE = /(?:לפתוח|ליצור|להכין|להקים|תפתח(?:י|ו)?|תיצור|תיצרי|תיצרו|פתח(?:י|ו)?|צור|צרי|תכין|תכיני|תכינו|הכן|הכיני|נפתח|נכין|נקים|תקים|תקימי|תקימו)\s+(?:לנו\s+|לי\s+)?(?:בבקשה\s+)?(מסמך|גיליון|טבלה|מעקב|אג'נדה|אגנדה|סיכום|רשימת\s+משימות|מצגת|טופס(?:\s+משוב|\s+הרשמה)?|סקר|שאלון)/;
  const ASK_EN = /\b(?:please|can you|could you|would you|will you|kindly|i need you to|let'?s|we need you to|we need to)\b|^\s*(?:create|set up|start|open|make|build|prepare)\b/i;
  const ASK_HE = /(?:בבקשה|נא\s|אפשר|תוכל|תוכלי|תוכלו|אתה יכול|את יכולה|בוא|בואו|צריך|צריכים|תפתח|תיצור|תכין|תקים|פתח|צור|הכן)/;
  const EXISTING = /\b(?:update|edit|fill\s+in|add\s+to|finish|review|attached|enclosed|already|existing|we\s+have|you\s+have|the\s+one\s+(?:we|i)|latest\s+version|latest|current)\b|עדכן|עדכני|תעדכן|מצורף|קיים|כבר\s+יש|הקיים/i;
  const CONTENT = /\b(?:(?:that|which)\s+(?:asks?|collects?)|with\s+(?:\d+\s+)?questions|questions\s+(?:about|on)|write|draft|compose|summari[sz]e|fill\s+it\s+(?:in|out)|with\s+the\s+numbers|and\s+(?:write|fill|add|list|include)|that\s+(?:lists|includes|summari[sz]es|covers))\b|תכתוב|תנסח|תסכם|ותכתוב|וימלא|ותמלא|שמכיל|שמסכם|עם\s+שאלות|שישאל|שאלות\s+על/i;
  const OTHER_APP = /\b(?:typeform|jotform|survey\s*monkey|microsoft\s+forms|ms\s+forms|word|excel|pages|numbers|notion|confluence|onenote|powerpoint|keynote)\b|וורד|אקסל|נושן/i;
  const NEG = /\b(?:no need (?:to|for)|don'?t (?:need|create|make|open)|do not (?:create|make|open)|not necessary|without (?:a|an))\b|אין\s+צורך|אל\s+תפתח|לא\s+צריך/i;
  const HEDGE = /\b(?:maybe|perhaps|if you want|if you'?d like|if it helps|no pressure|sometime|at some point|one day|might)\b|(?:^|[\s,.])אולי(?:[\s,.]|$)|אם\s+בא\s+לך|אם\s+יש\s+זמן/i;
  // Looking back ("it was possible yesterday") and the writer's own promise ("I'll open a doc") are not an ask of the reader.
  const PAST_HE = /(?:^|[\s,.])(?:אתמול|שבוע\s+שעבר|בעבר)(?:[\s,.?!]|$)/;
  const SELF_HE = /(?:^|[\s,.])(?:אני|אנחנו|אנו)\s+(?:א|נ)(?:פתח|יצור|כין|קים)(?![֐-׿])/;
  const FYI = /\b(?:fyi|for your information|no action needed)\b|לידיעתך|לידיעה/i;
  const THIRD = /\b(?:ask|have|get|tell|let)\s+(?!(?:me|us|you)\b)[A-Za-z][\w']*(?:\s+[A-Za-z][\w']*){0,3}\s+(?:to\s+)?(?:create|set\s+up|start|open|make|build|prepare)\b|תבקש(?:י|ו)?\s*מ|תגיד(?:י|ו)?\s*ל(?!י(?:\s|$|[.,!?]))/i;
  const NAMED_EN = /\b(?:called|named|titled|entitled)\s+["“'‘]?([^"”'’\n.;?!]{3,60}?)["”'’]?(?=\s*(?:[.;?!,]|\bso\b|\band\b|\bby\b|\bbefore\b|\bfor\s+(?:us|me|everyone|the\s+team)\b|$))/i;
  const NAMED_HE = /(?:בשם|שנקרא|שכותרתו)\s+["“'‘]?([^"”'’\n.;?!,]{3,60}?)["”'’]?(?=\s*[.;?!,]|\s+(?:עד|לפני|בבקשה)(?:\s|$)|\s+ו[\u0590-\u05FF]{2,}(?:\s|$)|\s*$)/;
  const FOR_EN = /\b(?:for|about|on)\s+(?:the\s+|our\s+|my\s+)?([A-Za-z0-9][\w'’&/-]*(?:\s+[A-Za-z0-9][\w'’&/-]*){0,4}?)(?=\s*(?:[.;?!,]|\bso\b|\band\b|\bby\b|\bbefore\b|\bfrom\b|\bwith\b|\bthis\b|\bnext\b|\btomorrow\b|\btoday\b|\bsoon\b|\bplease\b|$))/i;
  const FOR_HE = /(?:מסמך|גיליון|טבלה|מעקב|אג'נדה|אגנדה|סיכום|משימות|מצגת|טופס|סקר|שאלון)\s+(?:ל|עבור\s+|בנושא\s+)(?:ה)?([\u0590-\u05FFA-Za-z0-9][\u0590-\u05FF\w'’&/-]*(?:\s+[\u0590-\u05FFA-Za-z0-9][\u0590-\u05FF\w'’&/-]*){0,3}?)(?=\s*[.;?!,]|\s+(?:עד|לפני|בבקשה)(?:\s|$)|\s*$)/;

  function enabled(flags) {
    if (!flags || typeof flags !== 'object') return SWITCH_DEFAULT;
    return flags[SWITCH] === true;
  }

  function kindOf(noun) {
    if (/slide|deck|presentation|מצגת/i.test(noun)) return 'slides';
    if (/form|survey|questionnaire|טופס|סקר|שאלון/i.test(noun)) return 'form';
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
    if (!(ASK_EN.test(s) || ASK_HE.test(s))) return { kind: 'block', reason: 'no-request' };
    const lang = /[֐-׿]/.test(s) ? 'he' : 'en';
    const noun = (en ? en[1] : he[1]).toLowerCase();
    const kind = kindOf(noun);
    const named = s.match(lang === 'he' ? NAMED_HE : NAMED_EN) || s.match(NAMED_EN);
    // A word inside the name the person gave ("Board update Q4") is not an instruction.
    const rest = named ? s.replace(named[0], ' ') : s;
    if (PAST_HE.test(s) || SELF_HE.test(s)) return { kind: 'block', reason: PAST_HE.test(s) ? 'past' : 'own-promise' };
    if (EXISTING.test(rest)) return { kind: 'block', reason: 'existing-file' };
    if (CONTENT.test(rest)) return { kind: 'block', reason: 'asks-content' };
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

  function systemOf(kind) {
    return kind === 'sheet' ? SYSTEM_SHEET : kind === 'slides' ? SYSTEM_SLIDES : kind === 'form' ? SYSTEM_FORM : SYSTEM_DOC;
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
    const kindLabel = r.fileKind === 'sheet' ? (he ? 'גיליון' : 'sheet') : r.fileKind === 'slides' ? (he ? 'מצגת' : 'slide deck') : r.fileKind === 'form' ? (he ? 'טופס' : 'form') : (he ? 'מסמך' : 'doc');
    return {
      action: 'offer',
      approval: 'DoIt',
      fileKind: r.fileKind,
      name: r.name,
      line: he ? 'ליצור ' + kindLabel + ' ריק בשם "' + r.name + '" ב-Drive?' : 'Create an empty ' + kindLabel + ' called "' + r.name + '" in your Drive?',
      steps: [
        { id: 'create', kind: 'drive', label: he ? 'יצירת הקובץ ב-Drive ובדיקה חוזרת' : 'Create the file in Drive and read it back', proof: systemOf(r.fileKind) },
        { id: 'share', kind: 'manual', label: r.fileKind === 'form' ? (he ? 'הוספת שאלות ושליחה לנענים: על פי בחירתך, גלאנס לא כותב ולא שולח' : 'Add questions and send it to respondents: your choice, Glance does not write or send') : (he ? 'שיתוף והוספת תוכן: על פי בחירתך, גלאנס לא כותב ולא משתף' : 'Share it and add content: your choice, Glance does not write or share') }
      ],
      lang: r.lang
    };
  }

  function filePath(id) {
    return '/files/' + encodeURIComponent(id) + '?fields=' + encodeURIComponent('id,name,mimeType,trashed,version,modifiedTime,webViewLink');
  }

  function miss(reason, extra) {
    return Object.assign({ ok: false, reason: reason, proof: null }, extra || {});
  }

  function snapshotOf(json) {
    return { version: String(json.version == null ? '' : json.version), modifiedTime: String(json.modifiedTime || '') };
  }

  // The Google lane hands its writers an http function (req -> { status, ok, json }); the module
  // itself speaks drive(method, path, body). Either is accepted.
  const DRIVE_API = 'https://www.googleapis.com/drive/v3';
  function ioOf(arg) {
    if (typeof arg !== 'function') return arg || {};
    const call = (base) => (method, path, body) => arg({
      method: method,
      url: base + path,
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }
    });
    return { drive: call(DRIVE_API), forms: call(FORMS_API) };
  }

  // The lane's writer signature: (input, http, clock).
  function write(input, http) {
    return create(input, http);
  }

  // Do It. The host passes the plan's name and kind as the person saw them.
  async function create(input, io) {
    input = input || {};
    io = ioOf(io);
    if (!enabled(input.flags)) return miss('switch-off');
    if (typeof io.drive !== 'function') return miss('no-host');
    const kind = input.fileKind === 'sheet' ? 'sheet' : input.fileKind === 'slides' ? 'slides' : input.fileKind === 'form' ? 'form' : input.fileKind === 'doc' ? 'doc' : '';
    const name = cleanName(input.name);
    if (!kind || !name) return miss('unclear');
    const drive = io.drive;
    if (kind === 'form') return createForm(name, io, input);
    const posted = await drive('POST', '/files?fields=' + encodeURIComponent('id,name,mimeType,trashed'), { name: name, mimeType: MIME[kind] });
    if (posted.status === 401 || posted.status === 403) return miss('not-connected');
    if (!posted.ok || !posted.json || !posted.json.id) return miss('write-failed');
    const id = posted.json.id;
    const system = systemOf(kind);
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
      where: kind === 'sheet' ? 'Google Sheets' : kind === 'slides' ? 'Google Slides' : 'Google Docs',
      target: name,
      written: (kind === 'sheet' ? 'Sheet · ' : kind === 'slides' ? 'Slides · ' : 'Doc · ') + name,
      url: url || null,
      proof: proof,
      ref: finalRef,
      // The file exists, empty and unshared. Whether the people it was for have
      // used it is theirs; the request to create it is what was asked.
      loopClosed: true
    };
  }

  // A Form: Forms API create, read back by id, trash through Drive if it cannot be confirmed.
  async function createForm(name, io, input) {
    if (typeof io.forms !== 'function' || typeof io.drive !== 'function') return miss('no-host');
    const posted = await io.forms('POST', '/forms', { info: { title: name, documentTitle: name } });
    if (posted.status === 401 || posted.status === 403) return miss('not-connected');
    if (!posted.ok || !posted.json || !posted.json.formId) return miss('write-failed');
    const id = posted.json.formId;
    const ref = { fileId: id, externalId: id, kind: 'form', createdByGlance: true };
    const withdraw = async (why) => {
      const gone = await io.drive('PATCH', '/files/' + encodeURIComponent(id), { trashed: true });
      const removed = !!(gone.ok || gone.status === 404);
      return miss(FAILED, { ref: removed ? null : ref, removed: removed, why: why, fileId: id });
    };
    const back = await io.forms('GET', '/forms/' + encodeURIComponent(id));
    if (!back.ok || !back.json || back.json.formId !== id) return withdraw('get-' + back.status);
    if (String((back.json.info && back.json.info.title) || '') !== name) return withdraw('name-differs');
    const verifiedAt = typeof input.now === 'string' ? input.now : new Date().toISOString();
    const url = 'https://docs.google.com/forms/d/' + encodeURIComponent(id) + '/edit';
    const finalRef = Object.assign({}, ref, { snapshot: { revisionId: String(back.json.revisionId || '') } });
    const proof = proofs ? proofs.buildProof({ system: SYSTEM_FORM, externalId: id, url: url, fetchedBack: true, verifiedAt: verifiedAt }) : null;
    if (!proof) return miss(PENDING, { ref: finalRef });
    return { ok: true, connector: CONNECTOR, where: 'Google Forms', target: name, written: 'Form · ' + name, url: url, proof: proof, ref: finalRef, loopClosed: true };
  }

  async function undoForm(ref, io) {
    if (typeof io.forms !== 'function' || typeof io.drive !== 'function') return { ok: false, reason: 'no-host' };
    const got = await io.forms('GET', '/forms/' + encodeURIComponent(ref.fileId));
    if (got.status === 401 || got.status === 403) return { ok: false, reason: 'not-connected' };
    if (got.status === 404) return { ok: true, undone: true, externalId: ref.fileId };
    const unsure = { ok: false, reason: 'unconfirmed', error: "Couldn't confirm it's unchanged. Undo left it alone." };
    if (!got.ok || !got.json) return unsure;
    const snap = ref.snapshot;
    if (!snap || !snap.revisionId || !got.json.revisionId) return unsure;
    if (String(got.json.revisionId) !== snap.revisionId) {
      return { ok: false, reason: 'user-edited', undoUnavailable: true, error: 'You edited this. Undo left it alone.' };
    }
    const del = await io.drive('PATCH', '/files/' + encodeURIComponent(ref.fileId), { trashed: true });
    if (del.status === 401 || del.status === 403) return { ok: false, reason: 'not-connected' };
    if (!(del.ok || del.status === 404)) return { ok: false, reason: 'undo-failed' };
    const after = await io.drive('GET', filePath(ref.fileId));
    const gone = after.status === 404 || (after.ok && after.json && after.json.trashed === true);
    return gone ? { ok: true, undone: true, externalId: ref.fileId } : { ok: false, reason: 'undo-unverified' };
  }

  // Undo: trash the file, only while it is still exactly what Glance made.
  async function undo(ref, io) {
    io = ioOf(io);
    if (!ref || !ref.fileId || ref.createdByGlance !== true) return { ok: false, reason: 'not-ours' };
    if (ref.kind === 'form') return undoForm(ref, io);
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

  return { SWITCH, SWITCH_DEFAULT, SYSTEM_DOC, SYSTEM_SHEET, SYSTEM_SLIDES, SYSTEM_FORM, CONNECTOR, enabled, recognize, plan, create, write, undo };
})();

if (typeof module !== 'undefined') module.exports = { FlowWorkspaceFile };
else if (typeof globalThis !== 'undefined') globalThis.FlowWorkspaceFile = FlowWorkspaceFile;
