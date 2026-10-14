'use strict';
// Canonical featurizer for the Glance close model. Pure JS, no deps, no network — the SAME file is meant to run in the
// extension / on the Glance server, so training and inference cannot drift. Hashed sparse binary features, L2-normalized.
const DIM = 1 << 16;
const NEG_EN = /^(don't|dont|do|not|no|never|without|stop|cancel|nothing)$/;
const NEG_HE = /^(אל|לא|אין|בלי|אסור)$/;
function fnv1a(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; }
function norm(t) {
  return String(t || '').normalize('NFKC').toLowerCase()
    .replace(/[\u0591-\u05C7]/g, '')                       // niqqud / cantillation
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, ' _email_ ')
    .replace(/https?:\/\/\S+/g, ' _url_ ')
    .replace(/[₪$€£]\s?\d[\d,.]*/g, ' _money_ ')
    .replace(/\d{1,2}:\d{2}|\b\d{1,2}\s?(?:am|pm)\b/g, ' _clock_ ')
    .replace(/\d+/g, '0')
    .replace(/[’`]/g, "'");
}
function tokens(t) { return norm(t).match(/[a-z'_]+|[\u05D0-\u05EA"']+|0+|[?!]/g) || []; }
const HE_PREFIX = /^[והבלמשכ]{1,2}(?=[\u05D0-\u05EA]{2,})/;
function featuresOf(c) {
  const f = new Set();
  const add = (s) => f.add(fnv1a(s) % DIM);
  const surface = c.surface || 'gmail', dir = c.direction || 'inbound';
  const att = Math.min(Number(c.attachmentCount || 0), 2);
  add('m:surface=' + surface); add('m:dir=' + dir); add('m:att=' + att); add('m:sa=' + surface + att); add('m:ds=' + dir + surface);
  const body = String(c.own != null ? c.own : (c.body || ''));
  const toks = tokens(body);
  const fx = c.facts || {};
  add('f:date=' + (fx.date || 'na')); add('f:time=' + Boolean(fx.time)); add('f:money=' + Boolean(fx.money));
  add('f:dt=' + (fx.date || 'na') + Boolean(fx.time)); add('f:datt=' + (fx.date || 'na') + att);
  if (String(c.body || '').length > body.length + 20) add('m:hadQuote');
  add('m:len=' + Math.min(6, Math.floor(Math.log2(1 + toks.length))));
  if (/[\u05D0-\u05EA]/.test(body)) add('m:he');
  
  let negLeft = 0;
  const marked = toks.map((w) => {
    let out = w;
    if (negLeft > 0) { out = 'NEG_' + w; negLeft--; }
    if (NEG_EN.test(w) || NEG_HE.test(w) || /^אל$/.test(w)) negLeft = 4;
    return out;
  });
  for (let i = 0; i < marked.length; i++) {
    const w = marked[i];
    add('w:' + w);
    const base = w.replace(/^NEG_/, '');
    if (/[\u05D0-\u05EA]/.test(base)) { const s = base.replace(HE_PREFIX, ''); if (s !== base) add('w:' + (w.startsWith('NEG_') ? 'NEG_' : '') + s); }
    if (i + 1 < marked.length) add('b:' + w + ' ' + marked[i + 1]);
    if (i + 2 < marked.length) add('t:' + w + ' ' + marked[i + 1] + ' ' + marked[i + 2]);
    const pad = '<' + base + '>';
    if (pad.length >= 5) for (let n = 3; n <= 4; n++) for (let k = 0; k + n <= pad.length; k++) add('c' + n + ':' + pad.slice(k, k + n));
    add('wa:' + base + '|att' + att);  // word x attachment count (save asks depend on exactly one file)
    add('wd:' + base + '|' + dir);
  }
  for (const w of tokens(c.subject || '')) add('s:' + w);
  return Array.from(f).sort((a, b) => a - b);
}
module.exports = { DIM, featuresOf, tokens, norm, fnv1a };
