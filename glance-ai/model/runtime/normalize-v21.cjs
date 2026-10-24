'use strict';
// v2.1 minimal text normalization, to run in FRONT of both the engine and the model (harness + proposed extension entry).
// Exactly four format-only operations; it never removes words, so it cannot change meaning:
//   1. \r\n and lone \r -> \n
//   2. nbsp-family spaces (U+00A0, U+2007, U+202F, U+2009) -> ' '
//   3. zero-width chars (U+200B-U+200D, U+2060, U+FEFF) removed
//   4. bidi controls (LRM/RLM U+200E/F, embeddings/overrides U+202A-U+202E, isolates U+2066-U+2069) removed
// The heavier runtime/normalize.cjs (whitespace collapse, signature/disclaimer/mobile-footer strip) stays the v2 model path.
function normalizeText(t) {
  return String(t == null ? '' : t).replace(/\r\n?/g, '\n').replace(/[\u00a0\u2007\u202f\u2009]/g, ' ').replace(/[\u200b-\u200d\u2060\ufeff]/g, '').replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '');
}
function normalizeInput(c) { return Object.assign({}, c, { body: normalizeText(c.body), subject: normalizeText(c.subject), rawBody: c.body }); }
module.exports = { normalizeText, normalizeInput };
