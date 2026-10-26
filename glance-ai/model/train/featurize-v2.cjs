'use strict';
// v2 featurizer (pure JS, no deps; same file at train and inference time). v1 features + : normalized text (nbsp/RLM/\r\n
// cannot change a feature), char 3-5-grams (typo robustness), leading-token mood features, addressee features
// (voc:own|other|group|none, rcpt:to|cc-only|none — needs ownNames + the account address), subject-prefix flag.
const DIM = 1 << 17;
const { fnv1a, norm } = require('./featurize.cjs');
const { cleanText } = require('../runtime/normalize.cjs');
const { addresseeOf, recipientRole } = require('../runtime/addressee.cjs');
const NEG_EN = /^(don't|dont|do|not|no|never|without|stop|cancel|nothing|hold)$/;
const NEG_HE = /^(אל|לא|אין|בלי|אסור|עזוב|עזבי)$/;
const HE_PREFIX = /^[והבלמשכ]{1,2}(?=[\u05D0-\u05EA]{2,})/;
const GREETING_TOK = new Set(['hi', 'hey', 'hello', 'dear', 'good', 'morning', 'היי', 'הי', 'שלום', 'בוקר', 'טוב', 'רב', 'צהריים', 'טובים', 'ערב']);
function tokens(t) { return norm(cleanText(t)).match(/[a-z'_]+|[\u05D0-\u05EA"'׳״]+|0+|[?!]/g) || []; }
function featuresOf(c, ctx) {
  ctx = ctx || {};
  const f = new Set();
  const add = (s) => { f.add(fnv1a(s) % DIM); if (ctx.names) ctx.names.push(s); };
  const surface = c.surface || 'gmail', dir = c.direction || 'inbound';
  const att = Math.min(Number(c.attachmentCount || 0), 2);
  add('m:surface=' + surface); add('m:dir=' + dir); add('m:att=' + att); add('m:sa=' + surface + att); add('m:ds=' + dir + surface);
  const body = cleanText(c.own != null ? c.own : (c.body || ''));
  const toks = tokens(body);
  const fx = c.facts || {};
  add('f:date=' + (fx.date || 'na')); add('f:time=' + Boolean(fx.time)); add('f:money=' + Boolean(fx.money));
  add('f:dt=' + (fx.date || 'na') + Boolean(fx.time)); add('f:datt=' + (fx.date || 'na') + att);
  if (cleanText(c.body || '').length > body.length + 20) add('m:hadQuote');
  add('m:len=' + Math.min(6, Math.floor(Math.log2(1 + toks.length))));
  if (/[\u05D0-\u05EA]/.test(body)) add('m:he');
  const voc = ctx.voc || addresseeOf(body, c.ownNames || []);
  const role = ctx.role || recipientRole(c, ctx.ownEmail || '');
  add('a:voc=' + voc); add('a:rcpt=' + role); add('a:vr=' + voc + '|' + role); add('a:vd=' + voc + '|' + dir);
  if (/^\s*(?:re|fw|fwd|תגובה|השב|הועבר)\s*:/i.test(c.subject || '')) add('s:prefix');
  let negLeft = 0;
  const marked = toks.map((w) => { let out = w; if (negLeft > 0) { out = 'NEG_' + w; negLeft--; } if (NEG_EN.test(w) || NEG_HE.test(w)) negLeft = 4; return out; });
  // leading content tokens (after greeting / vocative) carry the mood: imperative, question, statement
  let k0 = 0; while (k0 < marked.length && (GREETING_TOK.has(marked[k0]) || (k0 < 3 && (c.ownNames || []).some((n) => String(n).toLowerCase() === marked[k0])))) k0++;
  if (marked[k0]) add('p0:' + marked[k0].replace(HE_PREFIX, '')); if (marked[k0 + 1]) add('p01:' + marked[k0] + ' ' + marked[k0 + 1]);
  for (let i = 0; i < marked.length; i++) {
    const w = marked[i];
    add('w:' + w);
    const base = w.replace(/^NEG_/, '');
    if (/[\u05D0-\u05EA]/.test(base)) { const s = base.replace(HE_PREFIX, ''); if (s !== base) add('w:' + (w.startsWith('NEG_') ? 'NEG_' : '') + s); }
    if (i + 1 < marked.length) add('b:' + w + ' ' + marked[i + 1]);
    if (i + 2 < marked.length) add('t:' + w + ' ' + marked[i + 1] + ' ' + marked[i + 2]);
    const pad = '<' + base + '>';
    if (pad.length >= 5) for (let n = 3; n <= 5; n++) for (let k = 0; k + n <= pad.length; k++) add('c' + n + ':' + pad.slice(k, k + n));
    add('wa:' + base + '|att' + att);
    add('wd:' + base + '|' + dir);
  }
  for (const w of tokens(c.subject || '')) add('s:' + w);
  return Array.from(f).sort((a, b) => a - b);
}
module.exports = { DIM, featuresOf, tokens };
