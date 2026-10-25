// Find the file they asked for on the person's own OneDrive (close map row F2).
// Portable: no chrome.*, no DOM, no network. Behind the off switch ONEDRIVE_FIND
// (default off).
//
// The loop: an Outlook mail asks for one file ("Please send the signed NDA",
// "תשלחי את הצעת המחיר"), and the thread has no such attachment. Today a mail
// does not search OneDrive, so Glance stays quiet. With this slice, Glance
// searches the person's OneDrive once, and when exactly one of their own files
// fits, it attaches that file to the reply draft and reads both back:
//   1. GET the OneDrive item by id: it exists, it is a file, not a folder, not
//      someone else's shared item, and the size is the size it will attach;
//   2. GET the draft attachment by id: same name, same size.
// That is the step proof. The ask closes only when a message the person sent
// carries the file (docs/resolution-paths.md); Mail.Send is not built, so the
// result always says loopClosed: false. A draft is not a close.
//
// Rules, the same as every other file close:
//   - Outlook only. A Gmail mail is not searched against OneDrive (E4 keeps the
//     Gmail-names-OneDrive case quiet);
//   - one clear file ask (core/file-attach.js gate), or silence: negation,
//     hedge, FYI and "ask someone else to send it" stay silent;
//   - the thread already carries a file of that kind: silence (the file is there);
//   - zero or several fitting files: silence. A wrong file is worse than none;
//   - a template is never the file; folders, deleted items and items shared
//     from another drive are never candidates;
//   - over 3 MB is silence: Graph fileAttachment takes contentBytes under 3 MB,
//     and an upload session is not built;
//   - nothing is searched until the switch is on, and nothing is sent.
//
// The host injects Graph: graph(method, path, body?) -> Promise<{ status, ok, json, bytes? }>.
// For a /content GET the host returns the raw bytes in `bytes`.
// No src/ file calls this yet. With the switch off every entry point returns
// 'off' before any Graph call, so no current path changes.
const FlowOnedriveFind = (() => {
  function sibling(globalValue, file, name) {
    if (globalValue) return globalValue;
    try { return typeof require !== 'undefined' ? require(file)[name] : null; } catch (e) { return null; }
  }
  function fileAttach() {
    return sibling(typeof FlowFileAttach !== 'undefined' ? FlowFileAttach : null, './file-attach.js', 'FlowFileAttach');
  }
  const proofs = sibling(typeof FlowProofOfClose !== 'undefined' ? FlowProofOfClose : null, './proof-of-close.js', 'FlowProofOfClose');

  const SWITCH = 'ONEDRIVE_FIND';
  const SWITCH_DEFAULT = false;
  const SYSTEM = 'microsoft/onedrive';
  const CONNECTOR = 'onedriveFindAttach';
  const MAX_BYTES = 3 * 1024 * 1024;
  const READ_SCOPES = ['Files.Read', 'Files.ReadWrite'];
  const PENDING = 'proof_pending';
  const FAILED = 'verify_failed';

  // Where the person (or the sender) says the file is. Evidence on the plan only.
  const CUE_EN = /\b(?:in|on|from) (?:my |your |the )?one ?drive\b/i;
  const CUE_HE = /(?:ב|מה|ל)[-־]?\s?(?:OneDrive|וואן ?דרייב)/i;

  function enabled(flags) {
    if (!flags || typeof flags !== 'object') return SWITCH_DEFAULT;
    return flags[SWITCH] === true;
  }

  function scopeList(scopes) {
    if (scopes == null) return null;
    if (Array.isArray(scopes)) return scopes.map((s) => String(s || '').trim()).filter(Boolean);
    if (typeof scopes === 'string') return scopes.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    return null;
  }

  // null: unknown, the host may try and a 403 fails closed. false: known and absent.
  function hasReadScope(scopes) {
    const list = scopeList(scopes);
    if (!list) return null;
    return list.some((s) => READ_SCOPES.some((r) => s === r || s === 'https://graph.microsoft.com/' + r));
  }

  function cue(text) {
    const s = String(text || '');
    return CUE_EN.test(s) || CUE_HE.test(s);
  }

  function escapeQ(term) {
    return String(term || '').replace(/'/g, "''").replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 80);
  }

  // One search call per term; the host runs them and passes the merged results.
  function searchPaths(ask) {
    const terms = [];
    const seen = {};
    for (const t of [].concat(ask && ask.searchTerms ? ask.searchTerms : [], ask && ask.label ? [ask.label] : [])) {
      const q = escapeQ(t);
      const key = q.toLowerCase();
      if (!q || seen[key]) continue;
      seen[key] = 1;
      terms.push(q);
    }
    return terms.slice(0, 3).map((q) => "/me/drive/root/search(q='" + encodeURIComponent(q) + "')?$select=id,name,size,file,folder,deleted,remoteItem,parentReference,webUrl&$top=25");
  }

  // Graph search rows → candidates for core/file-attach.js decide(). Only the
  // person's own files: a remoteItem is a share from another drive.
  function asCandidates(rows) {
    if (!Array.isArray(rows)) return null;
    const out = [];
    const seen = {};
    for (const r of rows) {
      if (!r || typeof r.id !== 'string' || !r.id || seen[r.id]) continue;
      if (r.folder || r.deleted || r.remoteItem || !r.file) continue;
      const size = Number(r.size);
      if (!Number.isFinite(size) || size <= 0) continue;
      seen[r.id] = 1;
      out.push({ id: r.id, name: String(r.name || ''), size: size, mimeType: (r.file && r.file.mimeType) || '' });
    }
    return out;
  }

  function threadHasIt(ask, threadAttachments) {
    if (!Array.isArray(threadAttachments) || !threadAttachments.length) return false;
    const norm = (v) => String(v || '').toLowerCase();
    return threadAttachments.some((a) => a && !a.isInline && (ask.synonym || []).some((s) => norm(a.name).indexOf(norm(s)) !== -1));
  }

  function line(lang, name) {
    if (lang === 'he') return 'מצאתי את ' + name + ' ב-OneDrive שלך. לצרף לטיוטת התשובה?';
    return 'Found ' + name + ' in your OneDrive. Attach it to the reply draft?';
  }

  function silence(reason) {
    return { action: 'silence', reason: reason };
  }

  // The ask, before any search: what to search for, or silence.
  //   surface            'outlook' | 'gmail' | ...
  //   text               the mail body, normalized by the host
  //   threadAttachments  [{ name, isInline }] or null when unread
  function recognize(input) {
    input = input || {};
    if (!enabled(input.flags)) return { action: 'off', reason: 'switch-off' };
    if (input.surface !== 'outlook') return silence('not-outlook');
    const attach = fileAttach();
    if (!attach) return silence('no-gate');
    const g = attach.gate(String(input.text || ''));
    if (g.kind !== 'clear') return silence(g.reason || 'no-ask');
    if (!Array.isArray(input.threadAttachments)) return silence('attachments-unread');
    if (threadHasIt(g.ask, input.threadAttachments)) return silence('thread-has-it');
    if (hasReadScope(input.scopes) === false) return { action: 'reconnect', reason: 'files-scope-missing', scope: 'Files.Read' };
    return { action: 'search', ask: g.ask, paths: searchPaths(g.ask), cue: cue(input.text) };
  }

  // The close plan, after the host ran the search paths.
  function plan(input) {
    input = input || {};
    const r = recognize(input);
    if (r.action !== 'search') return r;
    const files = asCandidates(input.searchResults);
    if (!files) return silence('not-searched');
    if (!files.length) return silence('none');
    const picked = fileAttach().decide(r.ask, files, {}, String(input.text || ''));
    if (picked.action !== 'attach') return silence(picked.reason === 'conflict' ? 'conflict' : 'none');
    const file = files.find((f) => f.id === picked.file.id);
    if (!file) return silence('none');
    if (file.size > MAX_BYTES) return silence('too-big');
    const he = r.ask.lang === 'he';
    return {
      action: 'offer',
      approval: 'Do It',
      ask: { id: r.ask.id, label: r.ask.label, lang: r.ask.lang },
      cue: r.cue,
      file: file,
      line: line(r.ask.lang, file.name),
      steps: [
        { id: 'find-onedrive', kind: 'onedrive', label: he ? 'נמצא ב-OneDrive' : 'Found in OneDrive', proof: SYSTEM },
        { id: 'attach-draft', kind: 'draft', label: he ? 'מצורף לטיוטת התשובה' : 'Attached to the reply draft' },
        { id: 'send', kind: 'send', label: he ? 'שליחה, אחרי תצוגה מקדימה' : 'Send, after a preview', blocked: 'mail-send-not-built' }
      ]
    };
  }

  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  function toBase64(bytes) {
    let out = '';
    let i = 0;
    for (; i + 2 < bytes.length; i += 3) {
      const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
      out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
    }
    const rest = bytes.length - i;
    if (rest === 1) {
      const n = bytes[i] << 16;
      out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + '==';
    } else if (rest === 2) {
      const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
      out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + '=';
    }
    return out;
  }

  function itemPath(id) { return '/me/drive/items/' + encodeURIComponent(id); }
  function itemContentPath(id) { return itemPath(id) + '/content'; }
  function attachmentsPath(draftId) { return '/me/messages/' + encodeURIComponent(draftId) + '/attachments'; }
  function attachmentPath(draftId, attId) { return attachmentsPath(draftId) + '/' + encodeURIComponent(attId); }

  function miss(reason, extra) {
    return Object.assign({ ok: false, reason: reason, proof: null, loopClosed: false }, extra || {});
  }

  // Do It. The draft already exists (outlookDraftWrite makes it). Attach the one
  // file and read both the item and the attachment back. Nothing is sent.
  async function attachToDraft(input, io) {
    input = input || {};
    io = io || {};
    if (!enabled(input.flags)) return miss('switch-off');
    const file = input.file || {};
    const draftId = typeof input.draftId === 'string' ? input.draftId : '';
    if (!file.id || !draftId) return miss('invalid');
    if (typeof io.graph !== 'function') return miss('no-host');
    const graph = io.graph;

    const item = await graph('GET', itemPath(file.id));
    if (item.status === 401 || item.status === 403) return miss('not-connected');
    if (!item.ok || !item.json) return miss('item-gone');
    const it = item.json;
    if (it.id !== file.id || it.folder || it.deleted || it.remoteItem || !it.file) return miss(FAILED, { why: 'item-changed' });
    const size = Number(it.size);
    if (size !== Number(file.size)) return miss(FAILED, { why: 'item-size' });
    if (size > MAX_BYTES) return miss('too-big');

    const content = await graph('GET', itemContentPath(file.id));
    if (!content.ok || !content.bytes || content.bytes.length !== size) return miss(FAILED, { why: 'content' });
    const name = String(it.name || file.name || 'file');

    const post = await graph('POST', attachmentsPath(draftId), {
      '@odata.type': '#microsoft.graph.fileAttachment',
      name: name,
      contentType: (it.file && it.file.mimeType) || 'application/octet-stream',
      contentBytes: toBase64(content.bytes)
    });
    if (post.status === 401 || post.status === 403) return miss('not-connected');
    if (!post.ok) return miss('attach-failed');
    const attId = post.json && typeof post.json.id === 'string' ? post.json.id : '';
    if (!attId) return miss(PENDING);
    const ref = { draftId: draftId, attachmentId: attId, itemId: file.id, name: name, createdByGlance: true };

    const back = await graph('GET', attachmentPath(draftId, attId) + '?$select=id,name,size');
    if (!back.ok || !back.json) return miss(FAILED, { ref: ref, why: 'attachment-get' });
    // Graph counts the attachment's size with its headers, so the size is at least the file's.
    if (back.json.id !== attId || back.json.name !== name || !(Number(back.json.size) >= size)) {
      return miss(FAILED, { ref: ref, why: 'attachment-mismatch' });
    }

    const verifiedAt = typeof input.now === 'string' ? input.now : new Date().toISOString();
    const proof = proofs ? proofs.buildProof({ system: SYSTEM, externalId: file.id, url: it.webUrl || '', fetchedBack: true, verifiedAt: verifiedAt }) : null;
    if (!proof) return miss(PENDING, { ref: ref });
    return {
      ok: true,
      connector: CONNECTOR,
      where: 'Outlook draft',
      written: 'Draft · ' + name + ' attached from OneDrive',
      proof: proof,
      attachment: { draftId: draftId, attachmentId: attId, fetchedBack: true },
      ref: ref,
      // A draft with the file is preparation. The ask closes on the sent message.
      loopClosed: false
    };
  }

  // Undo removes the attachment from the draft and reads it back as gone.
  // The OneDrive file is the person's own and is never touched.
  async function undo(ref, io) {
    io = io || {};
    if (!ref || !ref.draftId || !ref.attachmentId || ref.createdByGlance !== true) return { ok: false, reason: 'not-ours' };
    if (typeof io.graph !== 'function') return { ok: false, reason: 'no-host' };
    const del = await io.graph('DELETE', attachmentPath(ref.draftId, ref.attachmentId));
    if (del.status === 401 || del.status === 403) return { ok: false, reason: 'not-connected' };
    if (!del.ok && del.status !== 404) return { ok: false, reason: 'undo-failed' };
    const got = await io.graph('GET', attachmentPath(ref.draftId, ref.attachmentId) + '?$select=id');
    if (got.status === 404) return { ok: true, undone: true, attachmentId: ref.attachmentId };
    return { ok: false, reason: 'undo-unverified' };
  }

  return {
    SWITCH, SWITCH_DEFAULT, SYSTEM, CONNECTOR, MAX_BYTES,
    enabled, hasReadScope, cue, searchPaths, asCandidates, recognize, plan, attachToDraft, undo, toBase64
  };
})();

if (typeof module !== 'undefined') module.exports = { FlowOnedriveFind };
else if (typeof globalThis !== 'undefined') globalThis.FlowOnedriveFind = FlowOnedriveFind;
