/* Glance shadow tier, featurizers v2 and v2.1 (ports of train/featurize-v2.cjs and train/featurize-v21.cjs; hashed FNV-1a, 2^17).
 * Output: sorted unique Uint32 index lists. Must stay bit-identical to the training featurizer (parity test: test/parity.test.cjs).
 * Registers self.GlanceShadow.features. */
(function (root) {
  'use strict';
  var NS = root.GlanceShadow || (root.GlanceShadow = {});
  var T = NS.text || (typeof require === 'function' ? require('./gs-text.js') : null);
  var fnv1a = T.fnv1a, norm = T.norm, cleanText = T.cleanText;
  var DIM = 1 << 17;
  var NEG_EN = /^(don't|dont|do|not|no|never|without|stop|cancel|nothing|hold)$/;
  var NEG_HE = /^(אל|לא|אין|בלי|אסור|עזוב|עזבי)$/;
  var HE_PREFIX = /^[והבלמשכ]{1,2}(?=[\u05D0-\u05EA]{2,})/;
  var GREETING_TOK = new Set(['hi', 'hey', 'hello', 'dear', 'good', 'morning', 'היי', 'הי', 'שלום', 'בוקר', 'טוב', 'רב', 'צהריים', 'טובים', 'ערב']);
  function tokens(t) { return norm(cleanText(t)).match(/[a-z'_]+|[\u05D0-\u05EA"'׳״]+|0+|[?!]/g) || []; }
  var SUBJ_PREFIX = /^\s*(?:re|fw|fwd|תגובה|השב|הועבר)\s*:/i;
  function sortU(f) { return Array.from(f).sort(function (a, b) { return a - b; }); }

  // ctx: { voc, role } (computed once in gs-prepare)
  function featuresV2Set(c, ctx) {
    var f = new Set();
    var add = function (s) { f.add(fnv1a(s) % DIM); };
    var surface = c.surface || 'gmail', dir = c.direction || 'inbound';
    var att = Math.min(Number(c.attachmentCount || 0), 2);
    add('m:surface=' + surface); add('m:dir=' + dir); add('m:att=' + att); add('m:sa=' + surface + att); add('m:ds=' + dir + surface);
    var body = cleanText(c.own != null ? c.own : (c.body || ''));
    var toks = tokens(body);
    var fx = c.facts || {};
    add('f:date=' + (fx.date || 'na')); add('f:time=' + Boolean(fx.time)); add('f:money=' + Boolean(fx.money));
    add('f:dt=' + (fx.date || 'na') + Boolean(fx.time)); add('f:datt=' + (fx.date || 'na') + att);
    if (cleanText(c.body || '').length > body.length + 20) add('m:hadQuote');
    add('m:len=' + Math.min(6, Math.floor(Math.log2(1 + toks.length))));
    if (/[\u05D0-\u05EA]/.test(body)) add('m:he');
    var voc = ctx.voc, role = ctx.role;
    add('a:voc=' + voc); add('a:rcpt=' + role); add('a:vr=' + voc + '|' + role); add('a:vd=' + voc + '|' + dir);
    if (SUBJ_PREFIX.test(c.subject || '')) add('s:prefix');
    var negLeft = 0;
    var marked = toks.map(function (w) { var out = w; if (negLeft > 0) { out = 'NEG_' + w; negLeft--; } if (NEG_EN.test(w) || NEG_HE.test(w)) negLeft = 4; return out; });
    var own = c.ownNames || [];
    var k0 = 0; while (k0 < marked.length && (GREETING_TOK.has(marked[k0]) || (k0 < 3 && own.some(function (n) { return String(n).toLowerCase() === marked[k0]; })))) k0++;
    if (marked[k0]) add('p0:' + marked[k0].replace(HE_PREFIX, '')); if (marked[k0 + 1]) add('p01:' + marked[k0] + ' ' + marked[k0 + 1]);
    for (var i = 0; i < marked.length; i++) {
      var w = marked[i];
      add('w:' + w);
      var base = w.replace(/^NEG_/, '');
      if (/[\u05D0-\u05EA]/.test(base)) { var s = base.replace(HE_PREFIX, ''); if (s !== base) add('w:' + (w.startsWith('NEG_') ? 'NEG_' : '') + s); }
      if (i + 1 < marked.length) add('b:' + w + ' ' + marked[i + 1]);
      if (i + 2 < marked.length) add('t:' + w + ' ' + marked[i + 1] + ' ' + marked[i + 2]);
      var pad = '<' + base + '>';
      if (pad.length >= 5) for (var n = 3; n <= 5; n++) for (var k = 0; k + n <= pad.length; k++) add('c' + n + ':' + pad.slice(k, k + n));
      add('wa:' + base + '|att' + att);
      add('wd:' + base + '|' + dir);
    }
    var st = tokens(c.subject || ''); for (var j = 0; j < st.length; j++) add('s:' + st[j]);
    return f;
  }

  var GREET = /^(?:hi|hey|hello|dear|good (?:morning|afternoon|evening)|היי|הי|שלום|בוקר טוב|צהריים טובים|ערב טוב)\b/i;
  function shapeOf(c) {
    var own = cleanText(c.own != null ? c.own : (c.body || ''));
    var lines = own.split('\n').filter(function (l) { return l.trim(); });
    return (lines.length <= 1 && !(lines.length && GREET.test(lines[0])) && tokens(own).length <= 22) ? 'bare' : 'mail';
  }
  var KEEP = new Set(('i you we he she they it me us my your our their this that these those the a an to of for on in at by with from about before after until ' +
    'can could would will shall should may might must do does did is are was were be been have has had need needs want please pls kindly let know lmk ' +
    'send share forward review confirm sign approve pay transfer schedule book meet call attend finish fix tell check look update move cancel save upload store ' +
    'reply respond get give take make prepare bring return resend fill email ' +
    'what when where which who whether if not no never dont don\'t yet still also just and or but so ? ! ' +
    'today tomorrow monday tuesday wednesday thursday friday saturday sunday week weekend morning eod asap ' +
    'agreed promised said mentioned committed i\'ll we\'ll you\'ll i\'d you\'d ' +
    'אני אתה את אתם אתן אנחנו הוא היא הם לי לך לכם לנו אליי אליך אותו אותה אותם של על עם את מה מתי איפה האם אם לא אל אין כן עוד עדיין גם רק או אבל ' +
    'אפשר תוכל תוכלי תוכלו אשמח נשמח נודה בבקשה נא אנא צריך צריכה צריכים חייב מחכה מחכים ' +
    'לשלוח שלח שלחי תשלח תשלחי תשלחו אשלח נשלח להעביר העבר תעביר תעבירי תעבירו אעביר לאשר תאשר תאשרי מאשר לחתום תחתום לשלם תשלם אשלם נשלם ' +
    'לקבוע תקבע נקבע לתקן תתקן לבדוק תבדוק לעבור תעבור לשמור תשמור תשמרי להעלות תעלה לעדכן תעדכן לחזור תחזור אחזור לענות תענה לבטל ' +
    'עד מחר היום השבוע יום ראשון שני שלישי רביעי חמישי שישי בוקר ערב סיכמנו הבטחת אמרת').split(/\s+/));
  var HE_PFX = /^[והבלמשכ]{1,2}(?=[\u05D0-\u05EA]{2,})/;
  function delex(toks) {
    var out = [];
    for (var i = 0; i < toks.length; i++) {
      var w = toks[i];
      var neg = w.startsWith('NEG_'), b = neg ? w.slice(4) : w;
      var k = KEEP.has(b) ? b : (/^[\u05D0-\u05EA]/.test(b) && KEEP.has(b.replace(HE_PFX, '')) ? b.replace(HE_PFX, '') : (/^0+$/.test(b) ? 'D' : 'X'));
      if (neg) k = 'NEG_' + k;
      if (k === 'X' && out[out.length - 1] === 'X') continue;
      out.push(k);
    }
    return out;
  }
  var NEGW = /^(don't|dont|do|not|no|never|without|stop|cancel|nothing|hold|אל|לא|אין|בלי|אסור|עזוב|עזבי)$/;
  // v2.1 = v2 set + shape / delex / interaction features; takes the v2 set so the v2 work is shared
  function featuresV21FromV2(c, v2set) {
    var f = new Set(v2set); var add = function (s) { f.add(fnv1a('v21:' + s) % DIM); };
    var own = cleanText(c.own != null ? c.own : (c.body || ''));
    var lines = own.split('\n').filter(function (l) { return l.trim(); });
    var toks = tokens(own);
    var subj = cleanText(c.subject || '');
    var greet = lines.length > 0 && GREET.test(lines[0]);
    var bare = !greet && lines.length <= 1 && toks.length <= 22;
    add('subj=' + (subj ? 'y' : 'n')); add('greet=' + greet); add('lines=' + Math.min(4, lines.length)); add('bare=' + bare);
    add('endq=' + /\?\s*$/.test(own)); add('ntok=' + Math.min(8, Math.floor(toks.length / 3)));
    add('bare|subj=' + bare + (subj ? 'y' : 'n'));
    var fx = c.facts || {}; var att = Math.min(Number(c.attachmentCount || 0), 2);
    var p0 = (norm(own).match(/[a-z'_]+|[\u05D0-\u05EA"'׳״]+/) || [''])[0];
    if (p0) { add('p0d:' + p0 + '|' + (fx.date || 'na')); add('p0t:' + p0 + '|' + Boolean(fx.time)); add('p0m:' + p0 + '|' + Boolean(fx.money)); add('p0a:' + p0 + '|' + att); if (bare) add('p0bare:' + p0); }
    var negLeft = 0; var marked = toks.map(function (w) { var o = w; if (negLeft > 0) { o = 'NEG_' + w; negLeft--; } if (NEGW.test(w)) negLeft = 4; return o; });
    var dx = delex(marked);
    for (var i = 0; i < dx.length; i++) { add('dx1:' + dx[i]); if (i + 1 < dx.length) add('dx2:' + dx[i] + ' ' + dx[i + 1]); if (i + 2 < dx.length) add('dx3:' + dx[i] + ' ' + dx[i + 1] + ' ' + dx[i + 2]); }
    add('dxp:' + dx.slice(0, 3).join(' ')); add('dxs:' + dx.slice(-2).join(' '));
    add('dtm:' + (fx.date || 'na') + '|' + Boolean(fx.time) + '|' + Boolean(fx.money) + '|' + att);
    return f;
  }
  function featuresBoth(c, ctx) { var s2 = featuresV2Set(c, ctx); var s21 = featuresV21FromV2(c, s2); return { x2: sortU(s2), x21: sortU(s21) }; }

  var api = { DIM: DIM, tokens: tokens, shapeOf: shapeOf, delex: delex, featuresBoth: featuresBoth,
    featuresV2: function (c, ctx) { return sortU(featuresV2Set(c, ctx)); }, SUBJ_PREFIX: SUBJ_PREFIX };
  NS.features = api;
  if (typeof module === 'object' && module && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
