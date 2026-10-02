// File-backed execution for open loops — portable, no chrome.*, no DOM, no
// network, no model. Cross-platform (Drive, Gmail attachments) only matters when it
// helps an open intention become done (docs/file-backed-closure-plan.md).
//
// Some intentions are finished by a file: "please send the signed contract" (they
// owe me one), "I'll send you the contract Friday" (I owe one), "I never got the
// attachment" (I resend), "can you send the receipt?" (I send). This file decides
//
//   - whether an ask or a promise is FILE-BACKED (exactly one clear file object);
//   - whether a message really carries a file (not just the word "attached");
//   - what that does to a loop's reply judgement and a promise's delivery;
//   - which ONE file may be offered for a draft, or none.
//
// Three rules hold everywhere. A wrong file is worse than no file, so zero or several
// candidates means none. Preparing a draft is intermediate: nothing here closes a
// loop because a file was prepared. And when the page cannot report attachments,
// every function falls back to the old text-only behaviour.
const FlowFilePath = (() => {
  function sibling(globalValue, file, name) {
    if (globalValue) return globalValue;
    try { return typeof require !== 'undefined' ? require(file)[name] : null; } catch (e) { return null; }
  }
  const attach = sibling(typeof FlowFileAttach !== 'undefined' ? FlowFileAttach : null, './file-attach.js', 'FlowFileAttach');

  // A message that SAYS a file came with it. Not proof; evidence() pairs it with the
  // real attachment list.
  const CLAIM = /\b(?:attached|attaching|enclosed|find attached|see attached|i(?:'ve| have) attached|i(?:'m| am) attaching)\b|(?:מצורף|מצורפת|מצורפים|צירפתי|מצרף|מצרפת|צירפנו)/i;

  function norm(v) {
    return String(v || '').toLowerCase().replace(/\.[a-z0-9]{1,8}$/i, '').replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();
  }

  // ---- 1. is the intention file-backed? --------------------------------------------
  function slim(o) { return o ? { object: o.id, label: o.label, lang: o.lang, synonym: o.synonym } : null; }

  // I asked THEM for something. One clear file object in a sentence that asks for it.
  function askNeed(line) {
    if (!attach) return null;
    const g = attach.gate(String(line || ''));
    return g.kind === 'clear' ? slim(g.ask) : null;
  }

  // I promised to send something. A send-type promise naming one clear file object.
  // Hebrew first-person send verbs the lexicon does not map to "send" (אשלח, אעביר, אצרף).
  const SEND_HE = /(?:^|[^א-ת])(?:אשלח|נשלח|אעביר|נעביר|אצרף|נצרף|אחזיר|נחזיר|אמסור|נמסור)(?![א-ת])/;
  function promiseNeed(line, action) {
    if (!attach || !(action === 'send' || SEND_HE.test(String(line || '')))) return null;
    return slim(attach.mention(String(line || '')));
  }

  function isFileBacked(w) { return Boolean(w && w.file && w.file.object); }

  // ---- 2. does a message really carry a file? -------------------------------------
  // info: { text, attachments } where attachments is an array of { filename } or null
  // when the page could not tell.
  function evidence(info) {
    const i = info || {};
    const known = Array.isArray(i.attachments);
    const names = known ? i.attachments.map((a) => String((a && a.filename) || '')).filter(Boolean) : [];
    return { known, attached: known && i.attachments.length > 0, names, claims: CLAIM.test(String(i.text || '')) };
  }

  function nameFits(w, names) {
    const syn = (w && w.file && w.file.synonym) || [];
    return names.some((n) => syn.some((t) => norm(n).includes(norm(t))));
  }

  // ---- 3. what a file does to a reply ----------------------------------------------
  // A real attachment settles a file-backed ask when the reply was only an
  // acknowledgement or a generic answer; it never overrides a promise, a decline, a
  // question or an auto-reply. A reply that only CLAIMS "attached" settles nothing.
  function judgeReply(watch, reply, ev) {
    if (!reply || !isFileBacked(watch) || !ev || !ev.known || watch.direction === 'mine') return reply;
    const o = reply.outcome;
    const open = o === 'ack' || o === 'closed' || o === 'answered';
    if (!open) return reply;
    if (ev.attached) {
      return Object.assign({}, reply, { outcome: 'closed', delivered: 'file', fileNames: ev.names, basis: 'rule' });
    }
    if (ev.claims) return Object.assign({}, reply, { outcome: 'ack', claimedOnly: true, basis: 'rule' });
    return reply;
  }

  // ---- 4. did my newer message deliver the file I promised? -----------------------
  // deliversText: the text-only rule (FlowFollowUp.deliversPromise).
  function promiseDelivered(watch, text, ev, deliversText) {
    const textual = typeof deliversText === 'function' ? Boolean(deliversText(text)) : false;
    if (!isFileBacked(watch) || !ev || !ev.known) return textual;
    if (!ev.attached) return false;                 // "attached" with nothing attached never closes it
    return textual || nameFits(watch, ev.names);    // a real file, and it says so or is named for the thing
  }

  // ---- 5. which ONE file may go into a draft ----------------------------------------
  // The file I sent earlier is the right file to resend: only when there is exactly one.
  function resendCandidate(attachments) {
    const list = Array.isArray(attachments) ? attachments.filter((a) => a && a.filename) : [];
    return list.length === 1 ? list[0] : null;
  }

  function driveQuery(need) { return attach && need ? attach.driveQuery(need.label) : null; }

  // files: a Drive search result for driveQuery(need). Returns { id, name, mimeType } for
  // exactly one confident match, else null (a template, a conflict, none: all null).
  function pickDrive(need, files, ctx, sourceText) {
    if (!attach || !need || !Array.isArray(files)) return null;
    const ask = { id: need.object, creatable: false, lang: need.lang, label: need.label, query: need.label, synonym: need.synonym || [], line: '' };
    const d = attach.decide(ask, files, ctx || {}, sourceText || '');
    return d && d.action === 'attach' && d.file ? { id: d.file.id, name: d.file.name, mimeType: d.file.mimeType } : null;
  }

  // Loop state after PREPARING: the draft exists, nothing is closed.
  function preparedPatch(now, fileName) {
    return { preparedAt: typeof now === 'number' ? now : Date.now(), preparedFile: fileName ? String(fileName).slice(0, 120) : null };
  }

  return { askNeed, promiseNeed, isFileBacked, evidence, judgeReply, promiseDelivered, resendCandidate, driveQuery, pickDrive, preparedPatch, CLAIM };
})();

if (typeof module !== 'undefined') module.exports = { FlowFilePath };
