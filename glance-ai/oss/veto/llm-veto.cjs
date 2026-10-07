'use strict';
// Glance LLM veto (oss-models/veto). Silence-only rules that sit around ANY card (engine or LLM). They can never add a card.
// Rule: silence beats a wrong Do It. Three layers:
//   textVeto(c, own)                 -> fires on the email itself; silences EVERY card (engine and LLM):
//        'injection'       instruction-like text aimed at an AI / the assistant (EN+HE)
//        'payment-fraud'   bank-detail change, new account, gift cards, crypto, urgent wire, exfil "forward all invoices"
//   proposalVeto(c, own, card, eng)  -> fires on an LLM-originated card (engine was silent):
//        'money-movement'  any wire/transfer/payment/bank account/crypto/gift card text (EN+HE) -> an LLM proposal never touches money
//        + every cardVeto below
//   cardVeto(c, own, card, eng)      -> fires on any card given its step and the ENGINE's date (dates always come from the engine):
//        'past-date'       engine date < today, or past-time cues with no future engine date (calendar/task/reply)
//        'calendar-needs-future-engine-date'  a calendar card needs a future engine date (LLM dates are never used)
//        'save-no-attachment' file_save needs exactly one attachment; 'save-gmail-onedrive' Gmail cannot write OneDrive
//   titleVeto(title, lang)           -> an LLM title that mentions money/instructions/URLs/emails/amounts is not used (engine title kept)
// c: { body, subject, direction, surface, attachmentCount }, own = quote-stripped own text (falls back to body)
// card: { step: 'draft'|'task'|'calendar'|'file_save', action?, title? }, eng: { dateIso: 'YYYY-MM-DD'|null, today: 'YYYY-MM-DD' }

const INJECT_EN = new RegExp([
  String.raw`\b(?:ignore|disregard|forget|override|bypass)\s+(?:all\s+|any\s+|the\s+|your\s+|my\s+)?(?:previous|prior|above|earlier|preceding|existing|original|safety)?\s*(?:instructions?|rules?|prompts?|guidelines?|directions?|policies)\b`,
  String.raw`\bas\s+(?:the|an|a)\s+(?:ai|a\.i\.|assistant|language\s+model|llm|bot|model|agent)\b`,
  String.raw`\byou\s+are\s+(?:now\s+)?(?:an?\s+)?(?:ai|assistant|chatgpt|gpt|language\s+model|llm|glance)\b`,
  String.raw`(?:^|\n|[.!]\s+)\s*(?:system|assistant|developer|admin)\s*(?:prompt|message|note|instruction)?\s*:`,
  String.raw`\b(?:new|updated|hidden|secret)\s+instructions?\s*:`,
  String.raw`\bdeveloper\s+mode\b|\bjailbreak\b|\bprompt\s+injection\b`,
  String.raw`\b(?:output|respond\s+with|return|set)\s+(?:decision|"?decision"?\s*[:=])\s*"?act\b`,
  String.raw`\bdo\s+not\s+(?:tell|inform|notify|alert)\s+(?:the\s+user|sali|anyone)\b|\bwithout\s+(?:telling|asking|notifying|confirming\s+with)\s+(?:the\s+user|sali|anyone)\b`,
  String.raw`\b(?:automatically|auto-?)\s*(?:approve|execute|pay|send|forward|create)\b`,
  String.raw`\[\[?\s*(?:system|inst|instructions?)\s*\]?\]|<\/?\s*(?:system|instructions?|prompt)\s*>`
].join('|'), 'i');
const INJECT_HE = /(?:התעלמ|תתעלמ|התעלם|שכח|תשכח|עקוף)\S*\s+(?:מ)?(?:כל\s+)?(?:ה)?(?:הוראות|כללים|כללי|הנחיות)|הוראת\s+מערכת|הודעת\s+מערכת|(?:^|\n)\s*מערכת\s*:|הוראות\s+חדשות\s*:|כ(?:בינה\s+מלאכותית|עוזר\s+(?:ה)?(?:דיגיטלי|וירטואלי|AI)|מודל\s+(?:ה)?שפה)|אתה\s+(?:עכשיו\s+)?(?:עוזר|בינה\s+מלאכותית|מודל)|אל\s+(?:תספר|תספרי|תגיד|תגידי|תודיע)\s+(?:ל)?(?:סאלי|משתמש)|בלי\s+(?:לשאול|לספר|לעדכן)\s+(?:את\s+)?(?:סאלי|המשתמש)|באופן\s+אוטומטי\s+(?:לאשר|לשלם|להעביר|לשלוח)/;
// fraud-shaped money: always silence, even an engine card
const FRAUD_EN = /\b(?:new|updated|changed|different|alternate|alternative)\s+(?:bank|banking|payment|wire|remittance)\s+(?:details|account|info(?:rmation)?|instructions)\b|\b(?:new|updated|different)\s+(?:bank\s+)?account\s+(?:below|number|details)\b|\bwire\s+[^.\n]{0,30}\b(?:to|into)\s+(?:the|this|our|a)\s+new\s+account\b|\bto\s+the\s+new\s+(?:bank\s+)?account\b|\bbank\s+details\s+(?:have\s+)?changed\b|\b(?:update|change)\s+(?:our|the|your)\s+(?:bank|payment|banking)\s+details\b|\bgift\s*-?\s*cards?\b|\b(?:itunes|google\s+play|amazon|steam|apple)\s+(?:gift\s+)?cards?\b|\b(?:crypto(?:currency)?|bitcoin|btc|ethereum|eth|usdt|tether)\b|\bwallet\s+address\b|\b(?:urgent(?:ly)?|immediately|asap|right\s+away)\b[^.\n]{0,40}\b(?:wire|transfer)\b|\b(?:wire|transfer)\b[^.\n]{0,40}\b(?:urgent(?:ly)?|immediately|right\s+now|right\s+away|now)\b|\bforward\s+(?:all|every)\s+(?:the\s+)?(?:invoices?|emails?|messages?|files?|documents?)\b|\baccount\s+\d{2}-\d{3}/i;
const FRAUD_HE = /חשבון\s+(?:ה)?בנק\s+(?:ה)?(?:חדש|שלנו\s+השתנה)|(?:ל)?חשבון\s+(?:ה)?חדש|פרטי\s+(?:ה)?(?:בנק|חשבון)\s+(?:ה)?(?:חדשים|השתנו|עודכנו)|שינוי\s+(?:ב)?פרטי\s+(?:ה)?(?:בנק|חשבון)|כרטיס(?:י)?\s+(?:ה)?מתנה|גיפט\s*-?\s*קארד|ביטקוין|קריפטו|מטבע(?:ות)?\s+דיגיטלי|ארנק\s+(?:דיגיטלי|קריפטו)|(?:דחוף|מיד|מייד|עכשיו)[^.\n]{0,30}(?:להעביר|העבר|תעביר|העבירו)\s+[$₪€£\d]|(?:להעביר|העבר|תעביר|העבירו)\s+[$₪€£]?[\d,.]+\s*(?:₪|ש"ח|ש״ח|\$|€)?[^.\n]{0,30}(?:מיד|מייד|עכשיו|דחוף)|העבר\s+את\s+כל\s+(?:ה)?(?:חשבוניות|מיילים|קבצים|מסמכים)|לחשבון\s+\d{2}-\d{3}/;
// any money movement (EN+HE): an LLM proposal never touches these
// JS \b is ASCII-only, so a trailing \b never sees ₪ or Hebrew. Hebrew currency is matched on its own, before the Latin \b.
// ש"ח covers ASCII ", Hebrew gershayim (U+05F4), geresh (U+05F3) and ''. שקל does not match a longer Hebrew word (שקלונות).
const HE_CUR = String.raw`ש["״׳']{1,2}ח|שקלים|שקל(?![\u0590-\u05FF])`;
const CUR = String.raw`(?:[$€£₪]\s?\d|\d[\d,.]*\s?(?:₪|${HE_CUR}|(?:usd|eur|ils|nis|gbp|dollars?|euros?|shekels?)\b))`;
const MONEY_EN = new RegExp(String.raw`\b(?:wire|wiring|wired|remit(?:tance)?|pay(?:ing|ment|ments|able)?|paid|payout|settle\s+(?:the\s+)?(?:outstanding\s+)?(?:balance|invoice|bill|debt)|clear\s+(?:the\s+)?(?:outstanding\s+)?balance|bank\s+(?:account|transfer|details)|account\s+(?:number|no\.?)|iban|swift|bic|routing\s+number|sort\s+code|venmo|zelle|paypal|western\s+union|moneygram|refund|reimburse(?:ment)?|deposit\s+(?:the\s+)?(?:money|funds|check)|invoice\s+of)\b|\btransfer(?:ring|red|s)?\b[^.\n]{0,25}${CUR}|${CUR}[^.\n]{0,25}\btransfer\b|\btransfer(?:ring|red)?\s+(?:the\s+)?(?:money|funds|payment|deposit|amount|balance|fee)\b|\bsend\s+(?:me\s+|us\s+|them\s+)?${CUR}|\b(?:gift\s*cards?|crypto|bitcoin)\b`, 'i');
const MONEY_HE = new RegExp(String.raw`העברה\s+בנקאית|העברת\s+(?:ה)?(?:כספים|כסף|תשלום|סכום)|(?:ל|ת|ו)?(?:העביר|תעביר|תעבירי|תעבירו|להעביר|העבר|העבירו)\s+(?:את\s+)?(?:ה)?(?:-)?(?:כסף|כספים|תשלום|סכום|יתרה|מקדמה|דמי|${CUR}|[$₪€£]|\d)|(?:ל|ת)?(?:שלם|תשלם|תשלמי|תשלמו|לשלם|שלמו|שלמי)(?=$|[\s,.?!])|תשלום|תשלומים|חשבון\s+(?:ה)?בנק|מספר\s+(?:ה)?חשבון|פרטי\s+(?:ה)?(?:בנק|חשבון)|(?:ל)?הסדיר\S*\s+(?:את\s+)?(?:ה)?(?:תשלום|יתרה|חוב)|(?:ל)?סגור\s+את\s+(?:ה)?יתרה|תסדירו|תסדיר|להסדרה|(?:ב)?ביט(?=$|[\s,.?!])|פייבוקס|פייפאל|ביטקוין|קריפטו|כרטיס(?:י)?\s+(?:ה)?מתנה|החזר\s+כספי|IBAN`);
const PAST_CUE_EN = /\b(?:yesterday|last\s+(?:week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday|night)|earlier\s+(?:today|this\s+week)|(?:was|were)\s+(?:due|supposed\s+to)|already\s+(?:sent|signed|paid|happened|took\s+place|done|submitted|delivered|held)|took\s+place|went\s+(?:well|great|fine)|thanks?\s+(?:you\s+)?for\s+(?:the|our|today'?s)\s+(?:meeting|call|chat|sync|session|discussion)|thanks?\s+(?:you\s+)?for\s+(?:meeting|joining)|great\s+(?:meeting|call|chatting|discussion)|we\s+had\s+(?:our|a|the)\s+(?:meeting|call|sync|chat|session))\b/i;
const PAST_CUE_HE = /שעבר(?:ה)?(?=$|[\s,.!?])|אתמול|שלשום|(?:היה|היתה|הייתה|היו)\s+(?:אמור|אמורה|אמורים|טוב|טובה|טובים|מצוינ)|כבר\s+(?:שלחנו|שלחתי|נשלח|נחתם|חתמנו|שילמנו|התקיים|התקיימה|קרה|הועבר)|התקיימ(?:ה|ו)?|תודה\s+על\s+(?:ה)?(?:פגישה|שיחה)/;
// retrospective about the event itself (veto calendar/task even when the engine resolved a bare weekday to the future), unless a forward cue
const STRONG_PAST = /\b(?:thanks?\s+(?:you\s+)?for\s+(?:the|our|today'?s|meeting|joining)\b[^.!?\n]{0,20}\b(?:meeting|call|chat|sync|session|discussion|time)|great\s+(?:meeting|call|chatting|talking|discussion)|(?:went|was)\s+(?:well|great|fine|productive)|it\s+was\s+(?:productive|great|good)|we\s+had\s+(?:our|a|the)\s+(?:meeting|call|sync|chat|session)|took\s+place)\b|תודה\s+על\s+(?:ה)?(?:פגישה|שיחה)|(?:הייתה|היתה|היה)\s+(?:טובה|טוב|מוצלחת|מוצלח|פורייה)|התקיימ(?:ה|ו)/i;
const PAST_DAY = /\blast\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|week|month)\b|(?:ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת|שבוע|חודש)\s+שעבר/i;
const FORWARD = /\b(?:let'?s|can\s+we|could\s+we|shall\s+we|next\s+(?:week|time|call|meeting)|again|follow[-\s]?up\s+(?:call|meeting)|reschedul\w*|move\s+(?:it|the))\b|בוא\s+נ|בואו\s+נ|אפשר\s+לקבוע|נקבע|שוב|הבאה|הבא(?=$|[\s,.?!])/i;
const URL_OR_MAIL = /https?:\/\/|www\.|[\w.+-]+@[\w-]+\.[\w.]+/i;
const AMOUNT = new RegExp(CUR, 'i');
const ONEDRIVE = /one\s?-?drive|וואן\s?-?דרייב/i;

const s = (x) => String(x == null ? '' : x).replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '');
function textOf(c, own) { return s(own != null ? own : c.body) + '\n' + s(c.subject); }
function textVeto(c, own) {
  const t = textOf(c, own), full = s(c.body) + '\n' + s(c.subject);
  if (INJECT_EN.test(full) || INJECT_HE.test(full)) return 'injection';
  if (FRAUD_EN.test(t) || FRAUD_HE.test(t)) return 'payment-fraud';
  return null;
}
function moneyMovement(c, own) { const t = textOf(c, own); return MONEY_EN.test(t) || MONEY_HE.test(t); }
function cardVeto(c, own, card, eng) {
  if (!card || !card.step || card.step === 'SILENT') return null;
  const t = textOf(c, own), today = (eng && eng.today) || '2026-10-07', d = eng && eng.dateIso;
  if ((c.direction || 'inbound') === 'outbound') return 'own-mail';
  if (card.step === 'file_save') {
    if (Number(c.attachmentCount || 0) !== 1) return 'save-no-attachment';
    if (c.surface !== 'outlook' && (ONEDRIVE.test(t) || card.action === 'save_to_onedrive')) return 'save-gmail-onedrive';
    return null;
  }
  if (d && d < today) return 'past-date';
  if ((card.step === 'calendar' || card.step === 'task') && PAST_DAY.test(t) && !FORWARD.test(t)) return 'past-date';
  if (card.step === 'calendar' && STRONG_PAST.test(t) && !FORWARD.test(t)) return 'past-date';            // "thanks for the call on Monday" (bare weekday resolves forward)
  if (card.step === 'task' && STRONG_PAST.test(t) && !(d && d >= today)) return 'past-date';
  const pastCue = PAST_CUE_EN.test(t) || PAST_CUE_HE.test(t);
  if (pastCue && (card.step === 'calendar' || card.step === 'task') && !(d && d >= today)) return 'past-date';
  if (card.step === 'calendar' && !(d && d >= today)) return 'calendar-needs-future-engine-date';
  return null;
}
function proposalVeto(c, own, card, eng) {
  const tv = textVeto(c, own); if (tv) return tv;
  if (moneyMovement(c, own)) return 'money-movement';
  if (card && card.title && (MONEY_EN.test(card.title) || MONEY_HE.test(card.title))) return 'money-movement';
  return cardVeto(c, own, card, eng);
}
function titleVeto(title) {
  const t = s(title).trim();
  if (!t) return 'empty';
  if (t.length > 60) return 'too-long';
  if (INJECT_EN.test(t) || INJECT_HE.test(t)) return 'injection';
  if (MONEY_EN.test(t) || MONEY_HE.test(t) || AMOUNT.test(t)) return 'money';
  if (URL_OR_MAIL.test(t)) return 'url-or-email';
  return null;
}
module.exports = { textVeto, proposalVeto, cardVeto, titleVeto, moneyMovement, RX: { INJECT_EN, INJECT_HE, FRAUD_EN, FRAUD_HE, MONEY_EN, MONEY_HE, PAST_CUE_EN, PAST_CUE_HE } };
