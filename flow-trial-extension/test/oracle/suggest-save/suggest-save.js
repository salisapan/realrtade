/* Glance suggested save of attachments: deterministic eligibility rule (reference for 0.9.38). Pure function, no I/O.
 * Spec: specs/suggest-save.md §1-7 (Sali lock 2026-10-08 01:01, reconciled with Dima's draft 01:10). Python twin: suggest_save.py.
 * Plain JS (content script / MV3 SW / Node). Registers self.GlanceSuggestSave.
 *
 * Reason codes. Dima's names (spec §7) are used verbatim:
 *   suggest:other-card, suggest:already-saved, suggest:dismissed, suggest:bulk, suggest:no-consent, suggest:attachments-unread,
 *   suggest:negated, suggest:too-large
 * The spec gives no code for these quiet cases, so they are ADDED here and flagged for confirmation:
 *   suggest:not-inbound (row 13), suggest:no-files (rows 3, 4, 5, 16, 17), suggest:onedrive-target-on-gmail (row 11, named in the
 *   row text), suggest:drive-target-on-outlook (symmetric, no corpus row), suggest:other-target (the mail names a shared folder /
 *   SharePoint / Dropbox / Box / Teams as the save target; personal OneDrive or Drive would be the wrong target)
 * suggest:other-card also covers engine silences that hand the mail to another chain (file / file-chain-not-run / drive or file lookup).
 * A shown chip returns reason 'suggest:show'.
 *
 * Check order (the first failing check names the reason):
 *   1 not-inbound  2 no-consent (before any attachment read)  3 attachments-unread  4 bulk  5 negated  6 wrong / other target
 *   7 no-files  8 too-large  9 other-card  10 already-saved  11 dismissed  -> show
 */
(function (root) {
  'use strict';
  // SAVE_NO exactly as in core/google-closes.js (0.9.36 .. 0.9.39)
  var SAVE_NO = /\b(?:(?:do not|don't|dont|no need to)\s+(?:save|file|store|upload)|never mind)\b|(?:אל\s+ת|לא\s+צריך\s+ל|אין\s+צורך\s+ל|לא\s+ל)(?:שמור|שמרי|לשמור|תתייק)/i;
  // product-rules.cjs (v2) NEG_SAVE: wider refusal net. Core SAVE_NO alone misses "you don't need to save ...", "אל תעלי את המצורף"
  // (upload verbs) and "never/hold off on saving"; a chip on any of those is a wrong suggestion (spec §5), so refusal = SAVE_NO OR NEG_SAVE.
  var NEG_SAVE = /\b(?:do\s+not|don['’]?t|no\s+need\s+to|never|you\s+don['’]?t\s+need\s+to|hold\s+off\s+on)\s+(?:\w+\s+){0,2}(?:sav(?:e|ing)|upload(?:ing)?|stor(?:e|ing)|fil(?:e|ing))\b|(?:^|[\s,.(])(?:אל|לא\s+צריך|אין\s+צורך|בבקשה\s+לא|בבקשה\s+אל|לא)\s+(?:ל|ת)?(?:שמור|תשמור|תשמרי|תשמרו|לשמור|תעלה|תעלי|תעלו|להעלות|לאחסן)/i;
  // product-rules.cjs (v2): the same regexes the v2 silence veto uses
  var ONEDRIVE = /one\s?-?drive|וואן\s?-?דרייב/i;
  var SAVE_VERB = /\b(?:save|upload|store|file|put)\b|(?:^|[\s,.(])(?:ו?(?:ל|ת|נ)?(?:שמור|שמרי|שמרו|תשמור|תשמרי|תשמרו|לשמור|תעלה|תעלי|תעלו|להעלות|העלה|העלי|תאחסן|לאחסן))(?=$|[\s,.?!])/i;
  var MARKETING = /\b(?:unsubscribe|register\s+now|webinar|flash\s+sale|\d+%\s+off|shop\s+now|manage\s+(?:your\s+)?(?:email\s+)?preferences|exclusive\s+offer|newsletter)\b|וובינר|הירשמו|ההרשמה\s+פתוחה|להסרה|ניוזלטר|רשימת\s+התפוצה|מבצע|סייל|\d+%\s+הנחה|הנחה!|שדרגו\s+עכשיו|הטבה\s+בלעדית|מקומות\s+אחרונים/i;
  var GDRIVE = /\bgoogle\s*drive\b|\bg-?drive\b|גוגל\s*דרייב/i;
  // a named non-personal target (shared folder / files, SharePoint, Dropbox, Box, Teams): personal OneDrive/Drive would be the wrong target
  var OTHER_TARGET = /\bshared\s+(?:folder|drive|files?)\b|\bsharepoint\b|\bdropbox\b|\bbox\.com\b|\bteams\s+(?:folder|channel)\b|(?:ה)?תיקי(?:י)?ה\s+המשותפת|הקבצים\s+המשותפים|שרפוינט|דרופבוקס/i;
  // engine silences that mean another chain owns the mail (file chain / lookups that can end in their own card)
  var OTHER_CHAIN = { 'file': 1, 'file-chain-not-run': 1, 'google-wait(drive-lookup)': 1, 'calendar-wait(file-lookup)': 1 };

  var DOC_EXT = { pdf: 1, doc: 1, docx: 1, xls: 1, xlsx: 1, ppt: 1, pptx: 1, csv: 1, txt: 1, rtf: 1, odt: 1, ods: 1, odp: 1, key: 1, pages: 1, numbers: 1 };
  var IMG_EXT = { jpg: 1, jpeg: 1, png: 1, heic: 1 };
  var DOC_MIN = 2 * 1024, IMG_MIN = 100 * 1024;

  function extOf(name) { var m = /\.([A-Za-z0-9]{1,8})$/.exec(String(name || '')); return m ? m[1].toLowerCase() : ''; }
  function cidSet(list) { var s = {}; (list || []).forEach(function (c) { s[String(c).replace(/^<|>$/g, '').toLowerCase()] = 1; }); return s; }
  function cidOf(a) { return a.contentId ? String(a.contentId).replace(/^<|>$/g, '').toLowerCase() : ''; }

  // Why a part is NOT a real eligible file (null = eligible). Order: kind, inline/cid, never-files, allowlist, size.
  function excludeWhy(a, cids) {
    var kind = a.kind || 'file';
    if (kind === 'item') return 'item';
    if (kind === 'reference') return 'reference';
    var name = String(a.name || ''), ext = extOf(name), ct = String(a.contentType || '').toLowerCase();
    var isImg = Object.prototype.hasOwnProperty.call(IMG_EXT, ext) || /^image\//.test(ct);
    if (a.isInline === true) return 'inline';
    var cid = cidOf(a);
    if (cid && (isImg || cids[cid])) return 'cid';                          // images: any cid; other parts: a cid the body references
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
    var tgt = surface === 'outlook' ? 'OneDrive' : 'Drive', n = files.length;
    return { count: n, target: tgt, names: files.map(function (f) { return f.name; }),
      en: n === 1 ? 'Save ' + files[0].name + ' to ' + tgt + '?' : 'Save ' + n + ' files to ' + tgt + '?',
      he: n === 1 ? 'לשמור את ' + files[0].name + ' ב-' + tgt + '?' : 'לשמור ' + n + ' קבצים ב-' + tgt + '?' };
  }
  function quiet(reason, extra) { return Object.assign({ suggest: false, reason: reason }, extra || {}); }

  /**
   * decide(input) -> { suggest, reason, target?, files?, excluded?, key?, mode?, chip? }
   * input = {
   *   surface: 'outlook'|'gmail', direction: 'inbound'|'outbound'|'self', senderIsUser, isDraft, inSent,
   *   consent: bool                      OneDrive box (Outlook) / Drive box (Gmail) checked
   *   attachmentsRead: bool              the real list was read (Graph /attachments, Gmail payload parts). hasAttachments never counts.
   *   attachments: [{ id, name, contentType, size, isInline, contentId, kind: 'file'|'item'|'reference' }],
   *   bodyCids: ['cid-a', ...]           cid: references found in the HTML body
   *   headers: { listUnsubscribe: bool|string, precedence: string|null },
   *   text: own text (quote-stripped), subject,
   *   judgment: { reason: engine reason ('show'|'quiet:noise'|...), explicit: null | { step: 'draft'|'task'|'calendar'|'file_save' }, marketing: bool },
   *   messageId, savedFileIds: [ids with a ProofOfClose], dismissed: [messageId or dedupe key],
   *   uploadLimitBytes: number|null      null = upload session available (no limit)
   * }
   */
  function decide(inp) {
    var surface = inp.surface === 'outlook' ? 'outlook' : 'gmail';
    var target = surface === 'outlook' ? 'onedrive' : 'drive';
    var text = String(inp.text || ''), subject = String(inp.subject || '');
    var J = inp.judgment || {};
    // 1 inbound only
    if ((inp.direction || 'inbound') !== 'inbound' || inp.senderIsUser === true || inp.isDraft === true || inp.inSent === true) return quiet('suggest:not-inbound');
    // 2 consent (checked before the attachment list is even fetched)
    if (inp.consent !== true) return quiet('suggest:no-consent');
    // 3 the real file list must have been read
    if (inp.attachmentsRead !== true || !Array.isArray(inp.attachments)) return quiet('suggest:attachments-unread');
    // 4 bulk / marketing
    var H = inp.headers || {};
    if ((H.listUnsubscribe && String(H.listUnsubscribe).length) || /^(?:bulk|list|junk)$/i.test(String(H.precedence || '').trim())
      || J.reason === 'quiet:noise' || J.marketing === true || MARKETING.test(text) || MARKETING.test(subject)) return quiet('suggest:bulk');
    // 5 refusal in the body
    if (SAVE_NO.test(text) || NEG_SAVE.test(text)) return quiet('suggest:negated');
    // 6 target must match the surface (never offer Drive in place of a named OneDrive, or the reverse)
    if (surface === 'gmail' && ONEDRIVE.test(text) && SAVE_VERB.test(text)) return quiet('suggest:onedrive-target-on-gmail');
    if (surface === 'outlook' && GDRIVE.test(text) && SAVE_VERB.test(text)) return quiet('suggest:drive-target-on-outlook');
    if (OTHER_TARGET.test(text) && SAVE_VERB.test(text)) return quiet('suggest:other-target');
    // 7 real files after filtering
    var cids = cidSet(inp.bodyCids), files = [], excluded = [], big = [];
    inp.attachments.forEach(function (a) {
      var why = excludeWhy(a, cids);
      if (why) { excluded.push({ id: a.id, why: why }); return; }
      if (typeof inp.uploadLimitBytes === 'number' && a.size > inp.uploadLimitBytes) { big.push(a); excluded.push({ id: a.id, why: 'too-large' }); return; }
      files.push({ id: a.id, name: a.name, size: a.size });
    });
    if (!files.length && !big.length) return quiet('suggest:no-files', { excluded: excluded });
    // 8 every eligible file is too large for the explicit-save upload path
    if (!files.length) return quiet('suggest:too-large', { excluded: excluded });
    // 9 explicit ask wins; an explicit save of n>=2 files becomes this card (spec §3)
    var ex = J.explicit || null, mode = 'suggest';
    if (!ex && Object.prototype.hasOwnProperty.call(OTHER_CHAIN, String(J.reason))) return quiet('suggest:other-card', { excluded: excluded });
    if (ex) { if (ex.step === 'file_save' && files.length >= 2) mode = 'explicit-multi'; else return quiet('suggest:other-card', { excluded: excluded }); }
    // 10 dedupe: a ProofOfClose for these files
    var saved = {}; (inp.savedFileIds || []).forEach(function (id) { saved[id] = 1; });
    var open = files.filter(function (f) { return !saved[f.id]; });
    if (!open.length) return quiet('suggest:already-saved', { excluded: excluded });
    var key = String(inp.messageId || '') + '|' + open.map(function (f) { return f.id; }).sort().join(',');
    // 11 dismissed ([Not now] or Undo), per message or per key
    var dis = inp.dismissed || [];
    if (dis.indexOf(String(inp.messageId || '')) >= 0 || dis.indexOf(key) >= 0) return quiet('suggest:dismissed', { excluded: excluded, key: key });
    return { suggest: true, reason: 'suggest:show', target: target, mode: mode, files: open, excluded: excluded, key: key, chip: chip(open, surface) };
  }

  // ---- adapters from the two real sources to the input.attachments shape
  function fromGraph(list) {
    return (list || []).map(function (a) {
      var t = String(a['@odata.type'] || '');
      return { id: a.id, name: a.name, contentType: a.contentType || null, size: a.size, isInline: a.isInline === true, contentId: a.contentId || null,
        kind: /itemAttachment/i.test(t) ? 'item' : (/referenceAttachment/i.test(t) ? 'reference' : 'file') };
    });
  }
  function fromGmailPayload(payload) {
    var out = [];
    (function walk(p) {
      if (!p) return;
      if (p.filename) {
        var h = {}; (p.headers || []).forEach(function (x) { h[String(x.name).toLowerCase()] = String(x.value); });
        var disp = h['content-disposition'] || '';
        out.push({ id: (p.body && p.body.attachmentId) || p.partId, name: p.filename, contentType: p.mimeType || null, size: p.body ? p.body.size : null,
          isInline: /^\s*inline/i.test(disp), contentId: h['content-id'] || h['x-attachment-id'] || null, kind: /message\/rfc822/i.test(p.mimeType || '') ? 'item' : 'file' });
      }
      (p.parts || []).forEach(walk);
    })(payload);
    return out;
  }
  function bodyCidsOf(html) { var s = [], re = /cid:([^"'\s>)]+)/gi, m; while ((m = re.exec(String(html || '')))) s.push(m[1]); return s; }

  var api = { decide: decide, excludeWhy: excludeWhy, fromGraph: fromGraph, fromGmailPayload: fromGmailPayload, bodyCidsOf: bodyCidsOf, SAVE_NO: SAVE_NO, NEG_SAVE: NEG_SAVE,
    REASONS: ['suggest:show', 'suggest:other-card', 'suggest:already-saved', 'suggest:dismissed', 'suggest:bulk', 'suggest:no-consent', 'suggest:attachments-unread', 'suggest:negated', 'suggest:too-large',
      'suggest:not-inbound', 'suggest:no-files', 'suggest:onedrive-target-on-gmail', 'suggest:drive-target-on-outlook', 'suggest:other-target'] };
  root.GlanceSuggestSave = api;
  if (typeof module === 'object' && module && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
