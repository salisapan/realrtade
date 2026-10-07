'use strict';
// Product rules (v2). Used twice: as label overrides when building the v2 reference (dataset/v2) and as silence-only veto
// rules at runtime (runtime/veto-v2.cjs).
// Product-correct reference labels (v2) = engine 0.9.35 decision + confirmed-engine-bug corrections.
// Every corrected row carries ruleCorrected:[...]; NONE of these are owner-verified. Rules only ever (a) silence, or
// (b) turn an Outlook OneDrive save with exactly one attachment into the save the product already ships for Drive.
const { addresseeOf, recipientRole, clean } = require('./addressee.cjs');
const ONEDRIVE = /one\s?-?drive|וואן\s?-?דרייב/i;
const SAVE_VERB = /\b(?:save|upload|store|file|put)\b|(?:^|[\s,.(])(?:ו?(?:ל|ת|נ)?(?:שמור|שמרי|שמרו|תשמור|תשמרי|תשמרו|לשמור|תעלה|תעלי|תעלו|להעלות|העלה|העלי|תאחסן|לאחסן))(?=$|[\s,.?!])/i;
const NEG_SAVE = /\b(?:do\s+not|don['’]?t|no\s+need\s+to|never|you\s+don['’]?t\s+need\s+to|hold\s+off\s+on)\s+(?:\w+\s+){0,2}(?:sav(?:e|ing)|upload(?:ing)?|stor(?:e|ing)|fil(?:e|ing))\b|(?:^|[\s,.(])(?:אל|לא\s+צריך|אין\s+צורך|בבקשה\s+לא|בבקשה\s+אל|לא)\s+(?:ל|ת)?(?:שמור|תשמור|תשמרי|תשמרו|לשמור|תעלה|תעלי|תעלו|להעלות|לאחסן)/i;
const NEG_CUE = /^(?:please\s+)?(?:do\s+not|don['’]?t|no\s+need|never\s+mind|you\s+don['’]?t\s+need|hold\s+off|there['’]?s\s+no\s+need)\b|^(?:בבקשה\s+)?(?:אל\s+ת|אין\s+צורך|לא\s+צריך|לא\s+לשמור|לא\s+לשלוח|בבקשה\s+לא|עזוב|עזבי|תתעלם|תתעלמי)/i;
const ASK_CUE = /\?|\b(?:please|pls|could\s+you|can\s+you|would\s+you|kindly|let\s+me\s+know|lmk|send|pay|sign|confirm|review|approve|schedule|need)\b|(?:^|\s)(?:תוכל|תוכלי|תוכלו|אפשר|בבקשה|נא|אנא|אשמח|נשמח|תשלח|תשלחי|שלח|שלחי|תעביר|תעבירי|תעבירו|תאשר|תאשרי|תחתום|תחתמי|תשלם|תשלמי|צריך|צריכה|מחכה|מחכים|נדרשת)(?=$|[\s,.?!])/i;
const HEDGE = /\b(?:maybe|perhaps|might|possibly|if\s+you\s+(?:have|get)\s+(?:a\s+)?(?:sec|chance|time)|no\s+rush|not\s+urgent)\b|(?:^|\s)(?:אולי|אם\s+יוצא|אם\s+יהיה|לא\s+דחוף|מתי\s+שנוח|אם\s+בא\s+לך|תחליט|תחליטי)(?=$|[\s,.?!])/i;
const NO_ACTION_HE = /לא\s+נדרש(?:ת|ים|ות)?\s+(?:(?:ממך|מצדך|מכם|מצדכם|ממכם)\s+)?(?:כל\s+)?(?:פעולה|דבר|כלום)|לא\s+נדרש(?:ת)?\s+(?:ממך|מצדך|מכם)(?=$|[\s,.!])|אין\s+צורך\s+(?:ב|לעשות\s+)?(?:פעולה|דבר|כלום)|לידיעה\s+בלבד|לתיעוד\s+בלבד/;
const NO_ACTION_EN = /\b(?:no\s+action\s+(?:is\s+)?(?:needed|required)|nothing\s+(?:is\s+)?(?:needed|required)\s+from\s+you|no\s+(?:reply|response)\s+(?:is\s+)?(?:needed|required|necessary)|fyi\s+only|for\s+your\s+records\s+only)\b/i;
const POS_ACTION_HE = /(?<!לא\s)(?:נדרשת\s+פעולה|פעולה\s+נדרשת)\s*(?:מצדך\s*)?[:–-]/;
const MARKETING = /\b(?:unsubscribe|register\s+now|webinar|flash\s+sale|\d+%\s+off|shop\s+now|manage\s+(?:your\s+)?(?:email\s+)?preferences|exclusive\s+offer|newsletter)\b|וובינר|הירשמו|ההרשמה\s+פתוחה|להסרה|ניוזלטר|רשימת\s+התפוצה|מבצע|סייל|\d+%\s+הנחה|הנחה!|שדרגו\s+עכשיו|הטבה\s+בלעדית|מקומות\s+אחרונים/i;
const CONDITIONAL = /\b(?:nothing\s+(?:is\s+)?decided|not\s+(?:yet\s+)?decided|no\s+decision\s+yet|suppose\s+we|hypothetically|if\s+we\s+(?:approve|approved|go\s+ahead)|if\s+(?:leadership|management|the\s+board)\s+approves?)\b|לא\s+הוחלט|טרם\s+הוחלט|נניח\s+ש|אם\s+נאשר|אם\s+ההנהלה\s+תאשר|עוד\s+לא\s+סגרנו|שום\s+דבר\s+לא\s+סגור|עדיין\s+לא\s+החלטנו/i;
const sentences = (t) => clean(t).split(/(?<=[.?!])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
const GREETING_ONLY = /^(?:hi|hey|hello|dear|good\s+\w+|thanks|thank\s+you|best|regards|cheers|many\s+thanks|best\s+regards|היי|הי|שלום|בוקר\s+טוב|תודה|בברכה|תודה\s+רבה|המשך\s+יום\s+טוב|יום\s+נעים|בתודה)\b[^.?!]{0,25}[,!.]?$/i;

function negatedOnly(own) {
  const ss = sentences(own).filter((s) => !GREETING_ONLY.test(s));
  let neg = 0, pos = 0;
  for (const s of ss) { if (NEG_CUE.test(s)) neg++; else if (ASK_CUE.test(s)) pos++; }
  return neg > 0 && pos === 0;
}
// ctx: {surface, direction, attachmentCount, subject, own (quote-stripped own text), to, cc, ownEmail, ownNames}
function referenceLabel(engineLabel, ctx, canonicalSaveLabel) {
  const rules = [];
  let label = engineLabel;
  if (ctx.direction !== 'inbound') return { label, rules };
  const own = clean(ctx.own || '');
  const shows = label !== 'SILENT';
  const silence = (rule) => { if (label !== 'SILENT') { label = 'SILENT'; rules.push(rule); } };
  const voc = addresseeOf(own, ctx.ownNames);
  const role = recipientRole(ctx, ctx.ownEmail);
  const onedrive = ONEDRIVE.test(own), saveVerb = SAVE_VERB.test(own), negSave = NEG_SAVE.test(own);
  // (1) negated saves (EN+HE) and negated-only asks
  if (shows && negSave && /\|file_save$|^drive-file/.test(label)) silence('negated-save');
  if (label !== 'SILENT' && negatedOnly(own)) silence('negated-ask');
  // (3) Gmail cannot write OneDrive
  if (label !== 'SILENT' && ctx.surface === 'gmail' && onedrive && saveVerb) silence('gmail-onedrive-target');
  // (4) explicit no-action FYI (HE primary; EN mirror) — a positive "נדרשת פעולה:" ask is never touched
  if (label !== 'SILENT' && (NO_ACTION_HE.test(own) || NO_ACTION_EN.test(own)) && !POS_ACTION_HE.test(own)) silence('no-action-fyi');
  // (5) addressed to a named colleague, or user only on Cc without being named
  if (label !== 'SILENT' && (voc === 'other' || (role === 'cc-only' && voc !== 'own'))) silence(voc === 'other' ? 'addressed-to-other' : 'cc-only');
  // (6) marketing / webinar
  if (label !== 'SILENT' && (MARKETING.test(own) || MARKETING.test(ctx.subject || ''))) silence('marketing');
  // (7) conditional / undecided
  if (label !== 'SILENT' && CONDITIONAL.test(own)) silence('conditional-undecided');
  // (2) Outlook + OneDrive + exactly one attachment + save verb (engine silent OR only offering a reply draft), addressed to the user, not negated / hedged / marketing
  if ((label === 'SILENT' || /\|draft$/.test(label)) && rules.length === 0 && ctx.surface === 'outlook' && onedrive && saveVerb && !negSave && !HEDGE.test(own) && (ctx.attachmentCount || 0) === 1
      && voc !== 'other' && role !== 'cc-only' && !MARKETING.test(own) && !CONDITIONAL.test(own) && !negatedOnly(own)) { label = canonicalSaveLabel; rules.push('outlook-onedrive-save'); }
  return { label, rules, voc, role };
}
module.exports = { referenceLabel, negatedOnly, addresseeOf, recipientRole, RX: { ONEDRIVE, SAVE_VERB, NEG_SAVE, NEG_CUE, ASK_CUE, HEDGE, NO_ACTION_HE, NO_ACTION_EN, POS_ACTION_HE, MARKETING, CONDITIONAL } };
