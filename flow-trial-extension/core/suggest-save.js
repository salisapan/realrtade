// Suggested save of real attached files. Portable: no chrome.*, no DOM, no network.
// decide(input) follows the suggest-save spec §1–§7 and §9 reason codes, in the
// reference oracle's check order. suggestSave is the page adapter: a shown
// decision is logged as suggest:eligible-hidden. The step's copy follows
// spec §9 and names the file. decide().chip uses that same sentence.
// 0.9.41 draws the step on the checklist. The card title is "Save the file?".
// Mail.Send is not this step.
const FlowSuggestSave = (() => {
  const KIND = 'attachmentSave';
  // SAVE_NO exactly as in core/google-closes.js. NEG_SAVE is the v2 product-rule
  // list. Refusal is either pattern. Core SAVE_NO is not edited here.
  const SAVE_NO = /\b(?:(?:do not|don't|dont|no need to)\s+(?:save|file|store|upload)|never mind)\b|(?:אל\s+ת|לא\s+צריך\s+ל|אין\s+צורך\s+ל|לא\s+ל)(?:שמור|שמרי|לשמור|תתייק)/i;
  const NEG_SAVE = /\b(?:do\s+not|don['’]?t|no\s+need\s+to|never|you\s+don['’]?t\s+need\s+to|hold\s+off\s+on)\s+(?:\w+\s+){0,2}(?:sav(?:e|ing)|upload(?:ing)?|stor(?:e|ing)|fil(?:e|ing))\b|(?:^|[\s,.(])(?:אל|לא\s+צריך|אין\s+צורך|בבקשה\s+לא|בבקשה\s+אל|לא)\s+(?:ל|ת)?(?:שמור|תשמור|תשמרי|תשמרו|לשמור|תעלה|תעלי|תעלו|להעלות|לאחסן)/i;
  const ONEDRIVE = /one\s?-?drive|וואן\s?-?דרייב/i;
  const SAVE_VERB = /\b(?:save|upload|store|file|put)\b|(?:^|[\s,.(])(?:ו?(?:ל|ת|נ)?(?:שמור|שמרי|שמרו|תשמור|תשמרי|תשמרו|לשמור|תעלה|תעלי|תעלו|להעלות|העלה|העלי|תאחסן|לאחסן))(?=$|[\s,.?!])/i;
  const MARKETING = /\b(?:unsubscribe|register\s+now|webinar|flash\s+sale|\d+%\s+off|shop\s+now|manage\s+(?:your\s+)?(?:email\s+)?preferences|exclusive\s+offer|newsletter)\b|וובינר|הירשמו|ההרשמה\s+פתוחה|להסרה|ניוזלטר|רשימת\s+התפוצה|מבצע|סייל|\d+%\s+הנחה|הנחה!|שדרגו\s+עכשיו|הטבה\s+בלעדית|מקומות\s+אחרונים/i;
  const GDRIVE = /\bgoogle\s*drive\b|\bg-?drive\b|גוגל\s*דרייב/i;
  const OTHER_TARGET = /\bshared\s+(?:folder|drive|files?)\b|\bsharepoint\b|\bdropbox\b|\bbox\.com\b|\bteams\s+(?:folder|channel)\b|(?:ה)?תיקי(?:י)?ה\s+המשותפת|הקבצים\s+המשותפים|שרפוינט|דרופבוקס/i;
  const OTHER_CHAIN = { 'file': 1, 'file-chain-not-run': 1, 'google-wait(drive-lookup)': 1, 'calendar-wait(file-lookup)': 1 };

  const DOC_EXT = { pdf: 1, doc: 1, docx: 1, xls: 1, xlsx: 1, ppt: 1, pptx: 1, csv: 1, txt: 1, rtf: 1, odt: 1, ods: 1, odp: 1, key: 1, pages: 1, numbers: 1 };
  const IMG_EXT = { jpg: 1, jpeg: 1, png: 1, heic: 1 };
  const DOC_MIN = 2 * 1024;
  const IMG_MIN = 100 * 1024;
  // Same simple-upload cap as the OneDrive writer. The page adapter applies it.
  // decide() applies a cap only when input.uploadLimitBytes is a number.
  const MAX_BYTES = 4 * 1024 * 1024;

  const REASONS = ['suggest:show', 'suggest:other-card', 'suggest:already-saved', 'suggest:dismissed', 'suggest:bulk', 'suggest:no-consent', 'suggest:attachments-unread', 'suggest:negated', 'suggest:too-large', 'suggest:not-inbound', 'suggest:no-files', 'suggest:onedrive-target-on-gmail', 'suggest:drive-target-on-outlook', 'suggest:other-target'];

  function extOf(name) {
    const m = /\.([A-Za-z0-9]{1,8})$/.exec(String(name || ''));
    return m ? m[1].toLowerCase() : '';
  }
  function cidSet(list) {
    const s = {};
    (list || []).forEach((c) => { s[String(c).replace(/^<|>$/g, '').toLowerCase()] = 1; });
    return s;
  }
  function cidOf(a) {
    return a.contentId ? String(a.contentId).replace(/^<|>$/g, '').toLowerCase() : '';
  }

  function excludeWhy(a, cids) {
    const kind = a.kind || 'file';
    if (kind === 'item') return 'item';
    if (kind === 'reference') return 'reference';
    const name = String(a.name || '');
    const ext = extOf(name);
    const ct = String(a.contentType || '').toLowerCase();
    const isImg = Object.prototype.hasOwnProperty.call(IMG_EXT, ext) || /^image\//.test(ct);
    if (a.isInline === true) return 'inline';
    const cid = cidOf(a);
    if (cid && (isImg || cids[cid])) return 'cid';
    if (ext === 'ics' || ext === 'vcs' || /text\/calendar/.test(ct)) return 'calendar';
    if (ext === 'vcf' || /text\/(?:x-)?vcard/.test(ct)) return 'contact';
    if (/^winmail\.dat$/i.test(name) || /ms-tnef/.test(ct)) return 'tnef';
    if (ext === 'p7s' || ext === 'p7m' || /smime/i.test(name) || /pkcs7/.test(ct)) return 'smime';
    if (typeof a.size !== 'number' || !isFinite(a.size) || a.size < 0) return 'size-unknown';
    if (Object.prototype.hasOwnProperty.call(DOC_EXT, ext)) return a.size >= DOC_MIN ? null : 'small-doc';
    if (Object.prototype.hasOwnProperty.call(IMG_EXT, ext)) {
      if (/^image\d{3}\./i.test(name) || /^outlook-/i.test(name)) return 'signature-image';
      return a.size >= IMG_MIN ? null : 'small-image';
    }
    return 'type';
  }

  function chip(files, surface) {
    const copy = specCopy(files, surface);
    const tgt = surface === 'outlook' ? 'OneDrive' : 'Drive';
    return {
      count: files.length,
      target: tgt,
      names: copy.names,
      en: copy.en,
      he: copy.he
    };
  }

  // Spec §9. One file always names the file. Several files name the count.
  function specCopy(files, surface) {
    const tgt = surface === 'outlook' ? 'OneDrive' : 'Drive';
    const n = files.length;
    const names = files.map((f) => f.name);
    if (n === 1) {
      return {
        en: 'Save ' + names[0] + ' to ' + tgt + '?',
        he: 'לשמור את ' + names[0] + ' ב-' + tgt + '?',
        names: names
      };
    }
    return {
      en: 'Save ' + n + ' files to ' + tgt + '?',
      he: 'לשמור ' + n + ' קבצים ב-' + tgt + '?',
      names: names
    };
  }

  function quiet(reason, extra) {
    return Object.assign({ suggest: false, reason: reason }, extra || {});
  }

  // Check order: not-inbound, no-consent, attachments-unread, bulk, negated,
  // wrong or other target, no-files, too-large, other-card, already-saved, dismissed.
  function decide(inp) {
    const input = inp || {};
    const surface = input.surface === 'outlook' ? 'outlook' : 'gmail';
    const target = surface === 'outlook' ? 'onedrive' : 'drive';
    const text = String(input.text || '');
    const subject = String(input.subject || '');
    const J = input.judgment || {};
    if ((input.direction || 'inbound') !== 'inbound' || input.senderIsUser === true || input.isDraft === true || input.inSent === true) return quiet('suggest:not-inbound');
    if (input.consent !== true) return quiet('suggest:no-consent');
    if (input.attachmentsRead !== true || !Array.isArray(input.attachments)) return quiet('suggest:attachments-unread');
    const H = input.headers || {};
    if ((H.listUnsubscribe && String(H.listUnsubscribe).length) || /^(?:bulk|list|junk)$/i.test(String(H.precedence || '').trim())
      || J.reason === 'quiet:noise' || J.marketing === true || MARKETING.test(text) || MARKETING.test(subject)) return quiet('suggest:bulk');
    if (SAVE_NO.test(text) || NEG_SAVE.test(text)) return quiet('suggest:negated');
    if (surface === 'gmail' && ONEDRIVE.test(text) && SAVE_VERB.test(text)) return quiet('suggest:onedrive-target-on-gmail');
    if (surface === 'outlook' && GDRIVE.test(text) && SAVE_VERB.test(text)) return quiet('suggest:drive-target-on-outlook');
    if (OTHER_TARGET.test(text) && SAVE_VERB.test(text)) return quiet('suggest:other-target');
    const cids = cidSet(input.bodyCids);
    const files = [];
    const excluded = [];
    const big = [];
    input.attachments.forEach((a) => {
      const why = excludeWhy(a, cids);
      if (why) { excluded.push({ id: a.id, why: why }); return; }
      if (typeof input.uploadLimitBytes === 'number' && a.size > input.uploadLimitBytes) {
        big.push(a);
        excluded.push({ id: a.id, why: 'too-large' });
        return;
      }
      files.push({ id: a.id, name: a.name, size: a.size });
    });
    if (!files.length && !big.length) return quiet('suggest:no-files', { excluded: excluded });
    if (!files.length) return quiet('suggest:too-large', { excluded: excluded });
    const ex = J.explicit || null;
    let mode = 'suggest';
    if (!ex && Object.prototype.hasOwnProperty.call(OTHER_CHAIN, String(J.reason))) return quiet('suggest:other-card', { excluded: excluded });
    if (ex) {
      if (ex.step === 'file_save' && files.length >= 2) mode = 'explicit-multi';
      else return quiet('suggest:other-card', { excluded: excluded });
    }
    const saved = {};
    (input.savedFileIds || []).forEach((id) => { saved[id] = 1; });
    const open = files.filter((f) => !saved[f.id]);
    if (!open.length) return quiet('suggest:already-saved', { excluded: excluded });
    const key = String(input.messageId || '') + '|' + open.map((f) => f.id).sort().join(',');
    const dis = input.dismissed || [];
    if (dis.indexOf(String(input.messageId || '')) >= 0 || dis.indexOf(key) >= 0) return quiet('suggest:dismissed', { excluded: excluded, key: key });
    return { suggest: true, reason: 'suggest:show', target: target, mode: mode, files: open, excluded: excluded, key: key, chip: chip(open, surface) };
  }

  function fromGraph(list) {
    return (list || []).map((a) => {
      const t = String(a['@odata.type'] || '');
      return {
        id: a.id,
        name: a.name,
        contentType: a.contentType || null,
        size: a.size,
        isInline: a.isInline === true,
        contentId: a.contentId || null,
        kind: /itemAttachment/i.test(t) ? 'item' : (/referenceAttachment/i.test(t) ? 'reference' : 'file')
      };
    });
  }

  function fromGmailPayload(payload) {
    const out = [];
    (function walk(p) {
      if (!p) return;
      if (p.filename) {
        const h = {};
        (p.headers || []).forEach((x) => { h[String(x.name).toLowerCase()] = String(x.value); });
        const disp = h['content-disposition'] || '';
        out.push({
          id: (p.body && p.body.attachmentId) || p.partId,
          name: p.filename,
          contentType: p.mimeType || null,
          size: p.body ? p.body.size : null,
          isInline: /^\s*inline/i.test(disp),
          contentId: h['content-id'] || h['x-attachment-id'] || null,
          kind: /message\/rfc822/i.test(p.mimeType || '') ? 'item' : 'file'
        });
      }
      (p.parts || []).forEach(walk);
    })(payload);
    return out;
  }

  function bodyCidsOf(html) {
    const s = [];
    const re = /cid:([^"'\s>)]+)/gi;
    let m;
    while ((m = re.exec(String(html || '')))) s.push(m[1]);
    return s;
  }

  function closes() {
    if (typeof FlowGoogleCloses !== 'undefined') return FlowGoogleCloses;
    try { return typeof require !== 'undefined' ? require('./google-closes.js').FlowGoogleCloses : null; } catch (e) { return null; }
  }

  function prepareText(text) {
    if (typeof FlowIncomingJudge !== 'undefined' && typeof FlowIncomingJudge.prepareForJudge === 'function') {
      return FlowIncomingJudge.prepareForJudge(text);
    }
    return text;
  }

  function dismissalKey(messageId, files) {
    const ids = (files || []).map((f) => String((f && (f.id || f.attachmentId)) || '')).filter(Boolean).sort();
    return String(messageId || '') + '|' + ids.join(',');
  }

  function dismiss(store, messageId, files) {
    const next = Object.assign({}, store || {});
    next[dismissalKey(messageId, files)] = { at: Date.now(), undo: false };
    return next;
  }

  function dismissUndo(store, messageId, files) {
    const next = Object.assign({}, store || {});
    next[dismissalKey(messageId, files)] = { at: Date.now(), undo: true };
    return next;
  }

  function isDismissed(store, messageId, files) {
    const row = store && store[dismissalKey(messageId, files)];
    return !!(row && (row === true || row.at || row.undo));
  }

  function rowKey(row) {
    if (!row) return '';
    if (row.suggestKey) return String(row.suggestKey);
    const files = row.files || row.attachmentIds;
    if (!row.messageId || !files) return '';
    return dismissalKey(row.messageId, files);
  }

  function alreadySaved(log, messageId, files) {
    const key = dismissalKey(messageId, files);
    const rows = Array.isArray(log) ? log : [];
    let saved = false;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row || rowKey(row) !== key) continue;
      if (row.kind === 'undone' || row.kind === 'dismissed' || row.undone === true) return false;
      const proved = row.fetchedBack === true || (row.proof && row.proof.fetchedBack === true);
      if (row.kind === 'written' && proved) saved = true;
    }
    return saved;
  }

  function pageAttachment(a) {
    if (!a) return a;
    if (a['@odata.type'] || a.odataType) return fromGraph([a])[0];
    const size = a.size;
    let sized = null;
    if (typeof size === 'number') sized = size;
    else if (size != null && size !== '') sized = Number(size);
    return {
      id: a.id || a.attachmentId || a.url,
      name: a.name || a.filename,
      contentType: a.contentType || a.mimeType || null,
      size: sized,
      isInline: a.isInline === true || a.inline === true,
      contentId: a.contentId || a.cid || null,
      kind: a.kind || (/message\/rfc822/i.test(String(a.contentType || a.mimeType || '')) ? 'item' : 'file')
    };
  }

  function pageJudgment(m, text) {
    if (m.judgment && typeof m.judgment === 'object') return m.judgment;
    const api = closes();
    let explicit = null;
    if (m.otherCard === true) explicit = { step: 'task' };
    else if (api && typeof api.needsOneAttachment === 'function' && api.needsOneAttachment(text)) {
      if (!(typeof api.refusesSave === 'function' && api.refusesSave(text))) explicit = { step: 'file_save' };
    }
    return {
      reason: m.noise === true ? 'quiet:noise' : null,
      explicit: explicit,
      marketing: m.marketing === true
    };
  }

  function pageInput(m) {
    const text = prepareText(String(m.text || m.body || ''));
    const headers = m.headers || {};
    const list = headers.listUnsubscribe || headers['List-Unsubscribe'] || headers.list_unsubscribe || null;
    const precedence = headers.precedence || headers.Precedence || null;
    const dismissals = m.dismissed || m.dismissals;
    let dismissed = [];
    if (Array.isArray(dismissals)) dismissed = dismissals.slice();
    else if (dismissals && typeof dismissals === 'object') {
      Object.keys(dismissals).forEach((k) => {
        const row = dismissals[k];
        if (row === true || (row && (row.at || row.undo))) dismissed.push(k);
      });
    }
    return {
      surface: m.surface === 'outlook' ? 'outlook' : 'gmail',
      direction: m.inbound === false ? 'outbound' : (m.direction || 'inbound'),
      senderIsUser: m.senderIsUser === true,
      isDraft: m.isDraft === true,
      inSent: m.inSent === true,
      consent: m.consent === true,
      attachmentsRead: Array.isArray(m.attachments),
      attachments: Array.isArray(m.attachments) ? m.attachments.map(pageAttachment) : [],
      bodyCids: Array.isArray(m.bodyCids) ? m.bodyCids : bodyCidsOf(m.bodyHtml || m.html || ''),
      headers: { listUnsubscribe: list, precedence: precedence },
      text: text,
      subject: String(m.subject || ''),
      judgment: pageJudgment(m, text),
      messageId: m.messageId,
      savedFileIds: Array.isArray(m.savedFileIds) ? m.savedFileIds : savedIds(m.log, m.messageId),
      dismissed: dismissed,
      uploadLimitBytes: Object.prototype.hasOwnProperty.call(m, 'uploadLimitBytes') ? m.uploadLimitBytes : MAX_BYTES
    };
  }

  function savedIds(log, messageId) {
    const ids = [];
    const dropped = {};
    (Array.isArray(log) ? log : []).forEach((row) => {
      if (!row) return;
      if (messageId && row.messageId && String(row.messageId) !== String(messageId)) return;
      const files = row.files || row.attachmentIds || [];
      const each = (fn) => {
        files.forEach((f) => {
          const id = f && (f.id || f.attachmentId) ? (f.id || f.attachmentId) : (typeof f === 'string' ? f : '');
          if (id) fn(id);
        });
      };
      if (row.kind === 'undone' || row.kind === 'dismissed' || row.undone === true) { each((id) => { dropped[id] = 1; }); return; }
      const proved = row.fetchedBack === true || (row.proof && row.proof.fetchedBack === true);
      if (row.kind === 'written' && proved) each((id) => { if (!dropped[id]) ids.push(id); });
    });
    return ids.filter((id) => !dropped[id]);
  }

  function pageResult(out) {
    if (!out || out.suggest !== true) {
      return {
        eligible: false,
        files: [],
        target: null,
        reason: (out && out.reason) || 'suggest:no-files',
        fileCount: 0,
        step: null,
        mode: (out && out.mode) || null
      };
    }
    const surface = out.target === 'onedrive' ? 'outlook' : 'gmail';
    const files = out.files || [];
    return {
      eligible: true,
      files: files,
      target: out.target,
      reason: 'suggest:eligible-hidden',
      fileCount: files.length,
      mode: out.mode || 'suggest',
      step: {
        kind: KIND,
        id: KIND,
        params: { target: out.target, files: files },
        copy: specCopy(files, surface)
      }
    };
  }

  // Oracle input (attachmentsRead is set) goes straight to decide.
  // A page mail is adapted: consent must be true, a missing list is unread,
  // and the live upload cap is MAX_BYTES.
  function suggestSave(mail) {
    const m = mail || {};
    if (Object.prototype.hasOwnProperty.call(m, 'attachmentsRead')) return pageResult(decide(m));
    return pageResult(decide(pageInput(m)));
  }

  function createdRef(one) {
    const ref = one && one.ref;
    if (!ref || ref.created === false) return null;
    return ref;
  }

  async function saveAttachments(files, target, deps) {
    const list = Array.isArray(files) ? files : [];
    const where = target === 'drive' ? 'drive' : 'onedrive';
    const writeOne = deps && deps.writeOne;
    const results = [];
    for (let i = 0; i < list.length; i++) {
      const file = list[i];
      let one = null;
      try {
        one = writeOne ? await writeOne(file, where) : { ok: false, reason: 'no-writer' };
      } catch (e) {
        one = { ok: false, reason: 'error' };
      }
      const proof = one && one.proof && one.proof.fetchedBack === true ? one.proof : null;
      const ref = createdRef(one);
      results.push({
        id: file && file.id,
        name: file && file.name,
        ok: !!proof,
        created: !!ref,
        ref: ref,
        proof: proof,
        reason: (one && one.reason) || (proof ? null : 'verify_failed')
      });
    }
    const proofs = results.filter((r) => r.proof).map((r) => r.proof);
    const saved = proofs.length;
    const total = list.length;
    return {
      results: results,
      proofs: proofs,
      saved: saved,
      total: total,
      handled: total > 0 && saved === total,
      line: saved < total ? ('Saved ' + saved + ' of ' + total) : null,
      undo: results.filter((r) => r.created && r.ref).map((r) => r.ref)
    };
  }

  async function undoSaved(refs, deps) {
    const list = (refs || []).filter((r) => r && r.created !== false);
    const undoOne = deps && deps.undoOne;
    const results = [];
    for (let i = 0; i < list.length; i++) {
      let one = null;
      try { one = undoOne ? await undoOne(list[i]) : { ok: false }; }
      catch (e) { one = { ok: false }; }
      results.push({ ref: list[i], ok: !!(one && one.ok) });
    }
    return { results: results, deleted: results.filter((r) => r.ok).length };
  }

  return {
    KIND: KIND,
    DOC_MIN: DOC_MIN,
    IMG_MIN: IMG_MIN,
    MAX_BYTES: MAX_BYTES,
    SAVE_NO: SAVE_NO,
    NEG_SAVE: NEG_SAVE,
    REASONS: REASONS,
    dismissalKey: dismissalKey,
    dismiss: dismiss,
    dismissUndo: dismissUndo,
    isDismissed: isDismissed,
    alreadySaved: alreadySaved,
    excludeWhy: excludeWhy,
    fromGraph: fromGraph,
    fromGmailPayload: fromGmailPayload,
    bodyCidsOf: bodyCidsOf,
    decide: decide,
    suggestSave: suggestSave,
    saveAttachments: saveAttachments,
    undoSaved: undoSaved
  };
})();

if (typeof module !== 'undefined') module.exports = { FlowSuggestSave };
else if (typeof globalThis !== 'undefined') globalThis.FlowSuggestSave = FlowSuggestSave;
