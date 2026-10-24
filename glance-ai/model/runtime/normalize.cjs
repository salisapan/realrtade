'use strict';
// Body normalization for the v2 model path (runs BEFORE the engine's own quote stripping). Live mail carries format noise
// that must never change a decision: \r\n, nbsp from HTML (Gmail/OWA innerText), RLM/LRM bidi marks in Hebrew, zero-width
// chars, signature blocks, "[image: ...]" placeholders, confidentiality disclaimers, mobile footers.
const DISCLAIMER = /^(?:confidentiality notice|this (?:e-?mail|message) (?:and any attachments )?(?:is|are|may contain) (?:confidential|privileged)|the information (?:contained )?in this (?:e-?mail|message)|הודעה זו (?:והמצורפים לה )?(?:מיועדת|מיועדים|עשויה)|המידע (?:הכלול )?בהודעה זו|מסמך זה (?:מכיל|עשוי))/i;
const MOBILE = /^(?:sent from my (?:iphone|ipad|android|samsung|mobile)|get outlook for (?:ios|android)|נשלח מה-?(?:iphone|אייפון|אנדרואיד|נייד)(?: שלי)?|נשלח מהנייד)\s*$/i;
function cleanText(t) {
  return String(t || '').replace(/\r\n?/g, '\n').replace(/[\u00a0\u2007\u202f\u2009]/g, ' ').replace(/[\u200b-\u200d\u2060\ufeff]/g, '').replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
    .split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
function stripBoilerplate(t) {
  const lines = cleanText(t).split('\n');
  const out = [];
  for (const l of lines) {
    if (l === '--' || l === '-- ' || l === '__' || /^_{5,}$/.test(l)) break;           // signature delimiter
    if (DISCLAIMER.test(l)) break;
    if (/^-{2,}\s*(?:original message|forwarded message)|^on .{0,120} wrote:$|^from: .+$/i.test(l)) { out.push(l); continue; } // keep: engine strips quotes itself
    if (/^\[(?:image|cid|logo)[^\]]*\]$/i.test(l) || MOBILE.test(l)) continue;
    out.push(l);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
function normalizeCase(c) { const body = stripBoilerplate(c.body); return Object.assign({}, c, { body, rawBody: c.body }); }
module.exports = { cleanText, stripBoilerplate, normalizeCase };
