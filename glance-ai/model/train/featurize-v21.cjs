'use strict';
// v2.1 featurizer = v2 features + SHAPE features (so a bare one-liner / empty subject is not read as "repo => silent"):
// subject empty/present, greeting line present, line count, bare one-liner flag, ends-with-?, token-length bucket, and
// chooser-oriented interactions (leading token x date/time/money facts, attachment x leading token).
const { DIM, featuresOf: v2Features, tokens } = require('./featurize-v2.cjs');
const { fnv1a, norm } = require('./featurize.cjs');
const { cleanText } = require('../runtime/normalize.cjs');
const GREET = /^(?:hi|hey|hello|dear|good (?:morning|afternoon|evening)|היי|הי|שלום|בוקר טוב|צהריים טובים|ערב טוב)\b/i;
// deterministic shape key used for shape-specific thresholds (same code at train and inference time)
function shapeOf(c) {
  const own = cleanText(c.own != null ? c.own : (c.body || ''));
  const lines = own.split('\n').filter((l) => l.trim());
  return (lines.length <= 1 && !(lines.length && GREET.test(lines[0])) && tokens(own).length <= 22) ? 'bare' : 'mail';
}
// delexicalized backoff features: content words outside a closed list of function words + common ask/commit verbs become X,
// so "could you X the X X ?" generalises to objects the synthetic slot tables never contained (repo / real one-liners).
const KEEP = new Set(('i you we he she they it me us my your our their this that these those the a an to of for on in at by with from about before after until ' +
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
const HE_PFX = /^[והבלמשכ]{1,2}(?=[\u05D0-\u05EA]{2,})/;
function delex(toks) {
  const out = [];
  for (const w of toks) {
    const neg = w.startsWith('NEG_'), b = neg ? w.slice(4) : w;
    let k = KEEP.has(b) ? b : (/^[\u05D0-\u05EA]/.test(b) && KEEP.has(b.replace(HE_PFX, '')) ? b.replace(HE_PFX, '') : (/^0+$/.test(b) ? 'D' : 'X'));
    if (neg) k = 'NEG_' + k;
    if (k === 'X' && out[out.length - 1] === 'X') continue;
    out.push(k);
  }
  return out;
}
function featuresOf(c, ctx) {
  const base = v2Features(c, ctx);
  const f = new Set(base); const add = (s) => f.add(fnv1a('v21:' + s) % DIM);
  const own = cleanText(c.own != null ? c.own : (c.body || ''));
  const lines = own.split('\n').filter((l) => l.trim());
  const toks = tokens(own);
  const subj = cleanText(c.subject || '');
  const greet = lines.length > 0 && GREET.test(lines[0]);
  const bare = !greet && lines.length <= 1 && toks.length <= 22;
  add('subj=' + (subj ? 'y' : 'n')); add('greet=' + greet); add('lines=' + Math.min(4, lines.length)); add('bare=' + bare);
  add('endq=' + /\?\s*$/.test(own)); add('ntok=' + Math.min(8, Math.floor(toks.length / 3)));
  add('bare|subj=' + bare + (subj ? 'y' : 'n'));
  const fx = c.facts || {}; const att = Math.min(Number(c.attachmentCount || 0), 2);
  const p0 = (norm(own).match(/[a-z'_]+|[\u05D0-\u05EA"'׳״]+/) || [''])[0];
  if (p0) { add('p0d:' + p0 + '|' + (fx.date || 'na')); add('p0t:' + p0 + '|' + Boolean(fx.time)); add('p0m:' + p0 + '|' + Boolean(fx.money)); add('p0a:' + p0 + '|' + att); if (bare) add('p0bare:' + p0); }
  const NEGW = /^(don't|dont|do|not|no|never|without|stop|cancel|nothing|hold|אל|לא|אין|בלי|אסור|עזוב|עזבי)$/;
  let negLeft = 0; const marked = toks.map((w) => { let o = w; if (negLeft > 0) { o = 'NEG_' + w; negLeft--; } if (NEGW.test(w)) negLeft = 4; return o; });
  const dx = delex(marked);
  for (let i = 0; i < dx.length; i++) { add('dx1:' + dx[i]); if (i + 1 < dx.length) add('dx2:' + dx[i] + ' ' + dx[i + 1]); if (i + 2 < dx.length) add('dx3:' + dx[i] + ' ' + dx[i + 1] + ' ' + dx[i + 2]); }
  add('dxp:' + dx.slice(0, 3).join(' ')); add('dxs:' + dx.slice(-2).join(' '));
  add('dtm:' + (fx.date || 'na') + '|' + Boolean(fx.time) + '|' + Boolean(fx.money) + '|' + att);
  return Array.from(f).sort((a, b) => a - b);
}
module.exports = { DIM, featuresOf, tokens, shapeOf, delex };
