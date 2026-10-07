/* Glance engine-input stripper: reference for the engine-core fix ("normalize, then strip footers / signatures / disclaimers /
 * [image] placeholders BEFORE judging"). Plain JS, no deps; Python twin: glance_strip.py (byte-identical output, tested).
 * Identical behaviour to runtime/normalize.cjs (the v2 model path), packaged standalone so the engine can adopt it without the model.
 *   normalizeText(t)    : CRLF/CR -> LF, nbsp-family -> space, zero-width removed, bidi controls removed (never removes words)
 *   cleanText(t)        : normalizeText + collapse runs of space/tab, trim each line, max one blank line, trim
 *   stripForEngine(t)   : cleanText, then drop: everything from a signature delimiter ("--", "__", "_____") or a confidentiality
 *                         disclaimer line onward; "[image: ...]" / "[cid: ...]" / "[logo]" placeholder lines; mobile footers
 *                         ("Sent from my iPhone", "Get Outlook for iOS", "נשלח מה-iPhone שלי", ...). Quote headers are KEPT
 *                         ("On ... wrote:", "-----Original Message-----", "From: ...") because the engine strips quotes itself.
 * Where: in FlowIncomingJudge.judge (or right before it on every surface), text = stripForEngine(text), subject = normalizeText(subject).
 * Registers self.GlanceStrip. */
(function (root) {
  'use strict';
  var DISCLAIMER = /^(?:confidentiality notice|this (?:e-?mail|message) (?:and any attachments )?(?:is|are|may contain) (?:confidential|privileged)|the information (?:contained )?in this (?:e-?mail|message)|הודעה זו (?:והמצורפים לה )?(?:מיועדת|מיועדים|עשויה)|המידע (?:הכלול )?בהודעה זו|מסמך זה (?:מכיל|עשוי))/i;
  var MOBILE = /^(?:sent from my (?:iphone|ipad|android|samsung|mobile)|get outlook for (?:ios|android)|נשלח מה-?(?:iphone|אייפון|אנדרואיד|נייד)(?: שלי)?|נשלח מהנייד)\s*$/i;
  var QUOTE_HEAD = /^-{2,}\s*(?:original message|forwarded message)|^on .{0,120} wrote:$|^from: .+$/i;
  var PLACEHOLDER = /^\[(?:image|cid|logo)[^\]]*\]$/i;
  function normalizeText(t) {
    return String(t == null ? '' : t).replace(/\r\n?/g, '\n').replace(/[\u00a0\u2007\u202f\u2009]/g, ' ').replace(/[\u200b-\u200d\u2060\ufeff]/g, '').replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '');
  }
  function cleanText(t) {
    return String(t || '').replace(/\r\n?/g, '\n').replace(/[\u00a0\u2007\u202f\u2009]/g, ' ').replace(/[\u200b-\u200d\u2060\ufeff]/g, '').replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
      .split('\n').map(function (l) { return l.replace(/[ \t]+/g, ' ').trim(); }).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  function stripForEngine(t) {
    var lines = cleanText(t).split('\n'), out = [];
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i];
      if (l === '--' || l === '-- ' || l === '__' || /^_{5,}$/.test(l)) break;     // signature delimiter: drop the rest
      if (DISCLAIMER.test(l)) break;                                                 // disclaimer: drop the rest
      if (QUOTE_HEAD.test(l)) { out.push(l); continue; }                            // keep quote headers (engine strips quotes)
      if (PLACEHOLDER.test(l) || MOBILE.test(l)) continue;                          // drop placeholder / mobile footer lines
      out.push(l);
    }
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  var api = { normalizeText: normalizeText, cleanText: cleanText, stripForEngine: stripForEngine };
  root.GlanceStrip = api;
  if (typeof module === 'object' && module && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
