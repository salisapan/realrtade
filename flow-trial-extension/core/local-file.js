// A file on the person's own computer (close map row U2). Portable: no chrome.*,
// no DOM, no network. Behind the off switch LOCAL_FILE_CLOSE (default off).
//
// The loop: someone asks for one file ("שלח לי את ההסכם החתום"), the cloud search
// found nothing, and the file is on the local disk (Downloads, the desktop).
// Glance finds exactly that one file in a folder the person granted once, reads
// its bytes, saves a copy to the person's own OneDrive, and reads the item back
// by id. The step is Handled only when the read-back matches: same id, same
// size, and the same SHA-256 / SHA-1 when OneDrive reports one. The ask itself
// closes later, when a message the person sent carries the file
// (docs/resolution-paths.md). That send is not here: Mail.Send is not built.
//
// Rules, the same as every other file close:
//   - one clear file ask (core/file-attach.js gate), or silence;
//   - negation, hedges, FYI and "ask someone else to send it" stay silent;
//   - zero or several local candidates is silence. A wrong file is worse than none;
//   - a cloud hit wins: the local disk is searched only when the cloud search
//     ran and found nothing (F1 owns the cloud file);
//   - a template is never offered as the file;
//   - the upload never overwrites (conflictBehavior=rename), so Undo deletes
//     only the item this write created;
//   - nothing is sent, and nothing is read until the person taps Do It.
//
// The host injects everything that touches the world:
//   source  { read(path) -> Promise<Uint8Array> }        the granted folder
//   graph   (method, path, body?, headers?) -> Promise<{ status, ok, json }>
//   digest  (algo, bytes) -> Promise<hex string>          'SHA-256' or 'SHA-1'
// No src/ file calls this yet. With the switch off, every entry point returns
// 'off' before reading anything, so no current path changes.
const FlowLocalFile = (() => {
  function sibling(globalValue, file, name) {
    if (globalValue) return globalValue;
    try { return typeof require !== 'undefined' ? require(file)[name] : null; } catch (e) { return null; }
  }
  const attach = sibling(typeof FlowFileAttach !== 'undefined' ? FlowFileAttach : null, './file-attach.js', 'FlowFileAttach');
  const proofs = sibling(typeof FlowProofOfClose !== 'undefined' ? FlowProofOfClose : null, './proof-of-close.js', 'FlowProofOfClose');
  const onedrive = sibling(typeof FlowOnedriveFile !== 'undefined' ? FlowOnedriveFile : null, './onedrive-file.js', 'FlowOnedriveFile');

  const SWITCH = 'LOCAL_FILE_CLOSE';
  const SWITCH_DEFAULT = false;
  const SYSTEM = 'microsoft/onedrive';
  const CONNECTOR = 'localFileToOnedrive';
  // Graph simple upload. A larger file needs an upload session, which is not built.
  const MAX_BYTES = 4 * 1024 * 1024;
  const FOLDER = 'Glance';

  // Where the person says the file is. Evidence only: the plan still needs the
  // one local file. "Not on my computer" is the opposite and stays silent.
  const LOCAL_CUE_EN = /\b(?:(?:in|from) (?:my |your |the )?downloads(?: folder)?|on (?:my |your |the )?(?:desktop|computer|laptop|pc|mac|hard drive|disk)|saved locally|(?:a |the )?local (?:copy|file))\b/i;
  const LOCAL_CUE_HE = /(?:בהורדות|בתיקיי?ת (?:ה)?הורדות|על שולחן העבודה|על הדסקטופ|(?:אצלי )?(?:ב|על ה)מחשב(?: שלי)?|בלפטופ|עותק מקומי|שמור מקומית)/;
  const NOT_LOCAL_EN = /\b(?:not|isn'?t|no longer) (?:on|in) (?:my |the )?(?:computer|laptop|desktop|downloads)\b/i;
  const NOT_LOCAL_HE = /(?:לא|אין)(?: לי)? (?:אותו |אותה )?(?:ב|על ה)מחשב|(?:לא|אין) בהורדות/;

  function enabled(flags) {
    if (!flags || typeof flags !== 'object') return SWITCH_DEFAULT;
    return flags[SWITCH] === true;
  }

  function localCue(text) {
    const s = String(text || '');
    if (NOT_LOCAL_EN.test(s) || NOT_LOCAL_HE.test(s)) return false;
    return LOCAL_CUE_EN.test(s) || LOCAL_CUE_HE.test(s);
  }

  function baseName(path) {
    const parts = String(path || '').split(/[\\/]/);
    return parts[parts.length - 1] || '';
  }

  // The granted folder's listing, shaped for core/file-attach.js decide().
  // A path that climbs out of the folder, or a hidden or partial download, is dropped.
  function asCandidates(listing) {
    if (!Array.isArray(listing)) return null;
    const out = [];
    for (const row of listing) {
      if (!row || typeof row.path !== 'string') continue;
      const p = row.path.replace(/\\/g, '/');
      if (!p || p.charAt(0) === '/' || /(^|\/)\.\.(\/|$)/.test(p)) continue;
      const name = baseName(p);
      if (!name || name.charAt(0) === '.' || /\.(?:crdownload|part|download|tmp)$/i.test(name)) continue;
      const size = Number(row.size);
      if (!Number.isFinite(size) || size <= 0) continue;
      out.push({ id: p, name: name, size: size, mimeType: row.mimeType || '', lastModified: row.lastModified || null });
    }
    return out;
  }

  function line(lang, name) {
    if (lang === 'he') return 'מצאתי את ' + name + ' במחשב. לשמור עותק ב-OneDrive כדי שיהיה מוכן לשליחה?';
    return 'Found ' + name + ' on your computer. Save a copy to OneDrive so it is ready to send?';
  }

  function silence(reason) {
    return { action: 'silence', reason: reason };
  }

  // The close plan. Nothing here reads a byte.
  //   text       the ask (one message, already normalized by the host)
  //   cloudHits  the cloud search result for that ask: an array (may be empty),
  //              or null when no search ran
  //   listing    [{ path, size, mimeType?, lastModified? }] from the granted folder,
  //              or null when the person never granted one
  //   scopes     the Microsoft token's scopes, when known
  function plan(input) {
    input = input || {};
    if (!enabled(input.flags)) return { action: 'off', reason: 'switch-off' };
    if (!attach) return silence('no-gate');
    const text = String(input.text || '');
    const g = attach.gate(text);
    if (g.kind !== 'clear') return silence(g.reason || 'no-ask');
    const ask = g.ask;
    if (!Array.isArray(input.cloudHits)) return silence('cloud-not-searched');
    if (input.cloudHits.length > 0) return silence('cloud-has-it');
    const files = asCandidates(input.listing);
    if (!files) return silence('no-folder');
    if (!files.length) return silence('none');
    const picked = attach.decide(ask, files, {}, text);
    if (picked.action !== 'attach') return silence(picked.reason === 'conflict' ? 'conflict' : 'none');
    const file = files.find((f) => f.id === picked.file.id);
    if (!file) return silence('none');
    if (file.size > MAX_BYTES) return silence('too-big');
    const writable = onedrive ? onedrive.hasWriteScope(input.scopes) : null;
    if (writable === false) return { action: 'reconnect', reason: 'files-readwrite-missing', scope: 'Files.ReadWrite' };
    return {
      action: 'offer',
      approval: 'Do It',
      ask: { id: ask.id, label: ask.label, lang: ask.lang },
      cue: localCue(text),
      file: { path: file.id, name: file.name, size: file.size },
      line: line(ask.lang, file.name),
      steps: [
        { id: 'read-local', kind: 'local-file', label: ask.lang === 'he' ? 'קריאת הקובץ מהמחשב' : 'Read the file on this computer' },
        { id: 'save-onedrive', kind: 'onedrive', label: ask.lang === 'he' ? 'שמירה ב-OneDrive ובדיקה חוזרת' : 'Save to OneDrive and read it back', proof: SYSTEM },
        { id: 'send', kind: 'send', label: ask.lang === 'he' ? 'שליחה, אחרי תצוגה מקדימה' : 'Send, after a preview', blocked: 'mail-send-not-built' }
      ]
    };
  }

  function uploadPath(name) {
    return '/me/drive/root:/' + encodeURIComponent(FOLDER) + '/' + encodeURIComponent(name) + ':/content?@microsoft.graph.conflictBehavior=rename';
  }

  function itemPath(id) {
    return '/me/drive/items/' + encodeURIComponent(id);
  }

  function safeName(name) {
    if (onedrive && onedrive.safeName) return onedrive.safeName(name);
    return String(name || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').trim().slice(0, 120);
  }

  function upper(v) {
    return typeof v === 'string' ? v.trim().toUpperCase() : '';
  }

  function miss(reason, extra) {
    return Object.assign({ ok: false, reason: reason, proof: null }, extra || {});
  }

  // The read-back. Handled needs this, not the upload's 201.
  function verifyItem(item, expect) {
    if (!item || typeof item !== 'object') return { ok: false, why: 'no-body' };
    if (String(item.id || '') !== expect.id) return { ok: false, why: 'other-id' };
    if (item.deleted) return { ok: false, why: 'deleted' };
    if (!item.file) return { ok: false, why: 'not-a-file' };
    if (Number(item.size) !== expect.size) return { ok: false, why: 'size' };
    const hashes = (item.file && item.file.hashes) || {};
    const remote256 = upper(hashes.sha256Hash);
    const remote1 = upper(hashes.sha1Hash);
    if (remote256 && remote256 !== upper(expect.sha256)) return { ok: false, why: 'sha256' };
    if (remote1 && expect.sha1 && remote1 !== upper(expect.sha1)) return { ok: false, why: 'sha1' };
    return { ok: true, hashChecked: !!(remote256 || (remote1 && expect.sha1)) };
  }

  // Do It. Reads the one file, uploads it, reads it back. Never overwrites.
  async function save(input, io) {
    input = input || {};
    io = io || {};
    if (!enabled(input.flags)) return miss('switch-off');
    const file = input.file || {};
    if (!file.path || !(Number(file.size) > 0)) return miss('invalid');
    if (Number(file.size) > MAX_BYTES) return miss('too-big');
    if (!io.source || typeof io.source.read !== 'function' || typeof io.graph !== 'function' || typeof io.digest !== 'function') {
      return miss('no-host');
    }
    const name = safeName(baseName(file.path));
    if (!name) return miss('invalid');

    let bytes;
    try { bytes = await io.source.read(file.path); } catch (e) { return miss('local-unreadable'); }
    if (!bytes || typeof bytes.length !== 'number') return miss('local-unreadable');
    // The file changed since the plan: it is not the file the person approved.
    if (bytes.length !== Number(file.size)) return miss('local-changed');
    const sha256 = await io.digest('SHA-256', bytes);
    const sha1 = await io.digest('SHA-1', bytes);

    const put = await io.graph('PUT', uploadPath(name), bytes, { 'Content-Type': 'application/octet-stream' });
    if (put.status === 401 || put.status === 403) return miss('not-connected');
    if (!put.ok) return miss('upload-failed');
    const id = put.json && typeof put.json.id === 'string' ? put.json.id : '';
    if (!id) return miss(proofs ? proofs.REASON_PENDING : 'proof_pending');
    const ref = { itemId: id, createdByGlance: true, sha256: sha256, localPath: file.path, name: (put.json && put.json.name) || name };

    const got = await io.graph('GET', itemPath(id));
    const failed = proofs ? proofs.REASON_FAILED : 'verify_failed';
    if (!got.ok) return miss(failed, { ref: ref, why: 'get-' + got.status });
    const check = verifyItem(got.json, { id: id, size: bytes.length, sha256: sha256, sha1: sha1 });
    if (!check.ok) return miss(failed, { ref: ref, why: check.why });

    const verifiedAt = typeof input.now === 'string' ? input.now : new Date().toISOString();
    const proof = proofs ? proofs.buildProof({ system: SYSTEM, externalId: id, url: got.json.webUrl || '', fetchedBack: true, verifiedAt: verifiedAt }) : null;
    if (!proof) return miss(proofs ? proofs.REASON_PENDING : 'proof_pending', { ref: ref });
    return {
      ok: true,
      connector: CONNECTOR,
      where: 'OneDrive',
      target: FOLDER,
      written: 'OneDrive · ' + FOLDER + ' · ' + ref.name,
      hashChecked: check.hashChecked,
      proof: proof,
      ref: ref,
      // The save step is proved. The ask is still open until a sent message carries it.
      loopClosed: false
    };
  }

  // Undo deletes the item this write created, then reads it back as gone.
  async function undo(ref, io) {
    io = io || {};
    if (!ref || !ref.itemId || ref.createdByGlance !== true) return { ok: false, reason: 'not-ours' };
    if (typeof io.graph !== 'function') return { ok: false, reason: 'no-host' };
    const del = await io.graph('DELETE', itemPath(ref.itemId));
    if (del.status === 401 || del.status === 403) return { ok: false, reason: 'not-connected' };
    if (!del.ok && del.status !== 404) return { ok: false, reason: 'undo-failed' };
    const got = await io.graph('GET', itemPath(ref.itemId));
    if (got.status === 404 || (got.ok && got.json && got.json.deleted)) return { ok: true, undone: true, externalId: ref.itemId };
    return { ok: false, reason: 'undo-unverified' };
  }

  return {
    SWITCH, SWITCH_DEFAULT, SYSTEM, CONNECTOR, MAX_BYTES, FOLDER,
    enabled, localCue, asCandidates, plan, save, undo, verifyItem, uploadPath
  };
})();

if (typeof module !== 'undefined') module.exports = { FlowLocalFile };
else if (typeof globalThis !== 'undefined') globalThis.FlowLocalFile = FlowLocalFile;
