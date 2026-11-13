'use strict';
// The floor under every model answer (docs/glance-ai/ai-product.md §3, "strict gate and veto"): the production strict gate and veto
// that Router v2 (core/understanding-router.js) runs on each Tier 1 or Tier 2 proposal. Until now these lived only in the lab
// (glance-ai/oss/veto/propose-gate.cjs, llm-veto.cjs) and a host had to inject them; this is the same rule set, portable, so a host
// gives the AI engine only its model transport and its mask.
//
//   gate   the proposal is a step Glance can close (draft, task, calendar; a file goes to suggest-save), the mail does not ask for
//          something Glance has no tool for (a new document, a file into an invite), it does not ask to accept an offer or a price,
//          and a task, event or reply is anchored in time (a date the device read, or a deadline cue in the text).
//   veto   silence on the person's own mail, an injection aimed at a model, fraud-shaped money, any money movement, a save with no
//          single attachment or a target this surface cannot write, and a date in the past or a meeting that already happened.
// Dates are only ever the device's (proposal.due comes from core/understanding.js readDate). Silence-only: nothing here adds a card.
// No switch of its own: it runs only inside the AI engine, which rides on aiPrimary (off). Portable: no chrome.*, no DOM, no network.
const FlowAiFloor = (() => {
  const E = String.raw`(?=$|[\s,.;:!?)"'\-])`;
  const B = String.raw`(?:^|[\s,.;:!?("'\-])`;
  const DOC_EN = String.raw`(?:new\s+|blank\s+|shared\s+)?(?:google\s+|word\s+|excel\s+)?(?:doc|docs|document|spreadsheet|sheet|tracker|deck|slide\s*deck|slides|presentation|form|invoice|quote|quotation|template)`;
  const ASKV_EN = String.raw`\b(?:please\s+|pls\s+|can\s+you\s+|could\s+you\s+|would\s+you\s+|kindly\s+)(?:\w+\s+)?`;
  const CREATE_DOC_EN = new RegExp(ASKV_EN + String.raw`(?:(?:create|make|open|start|set\s+up|build|spin\s+up)\s+(?:a|an|the|us\s+a|me\s+a)?\s*${DOC_EN}|(?:prepare|draw\s+up|issue|generate|produce)\s+(?:a|an)\s+(?:new\s+)?(?:invoice|quote|quotation)|(?:prepare|draft)\s+(?:a|an)\s+new\s+${DOC_EN})\b`, 'i');
  const CREATE_DOC_HE = new RegExp(B + String.raw`(?:(?:לפתוח|תפתח|תפתחי|תפתחו|ליצור|תיצור|תיצרי|תיצרו|לבנות|תבנה|תבני|להקים|תקים)\s+(?:את\s+)?(?:ה)?(?:מסמך|גיליון|גליון|טבלה|טבלת|מצגת|טופס|תבנית|קובץ\s+(?:חדש|אקסל|וורד))|(?:להכין|תכין|תכיני|תכינו|להפיק|תפיק|תפיקי|תפיקו)\s+(?:את\s+)?(?:ה)?(?:חשבונית|הצעת\s+מחיר)\s+(?:ל|עבור\s+)\S+\s+על\s|(?:מסמך|גיליון|גליון|קובץ|מצגת|טופס)\s+חדש)`);
  const ATTACH_INVITE_EN = /\b(?:attach|add|put|include|link)\s+(?:the\s+|a\s+|this\s+|my\s+|our\s+)?(?:[\w-]+\s+){0,3}?(?:to|on|in(?:to)?)\s+(?:the\s+|my\s+|our\s+|your\s+)?(?:[\w-]+\s+){0,2}?(?:invite|invitation|meeting|event|calendar\s+(?:invite|event|entry)|task)\b/i;
  const ATTACH_INVITE_HE = new RegExp(B + String.raw`(?:לצרף|תצרף|תצרפי|תצרפו|צרף|צרפי|להוסיף|תוסיף|תוסיפי|לשים|תשים|תשימי)\s+(?:את\s+)?[^.?!\n]{0,30}?(?:ל|ב)(?:ה)?(?:זימון|הזמנה|פגישה|אירוע|משימה|יומן)`);
  const OFFER_OBJ = String.raw`(?:offer|counter-?offer|quote|quotation|proposal|bid|price|pricing|deal|terms|fee|rate|amount)`;
  const DAY_EN = '(?:mon|tue|tues|wed|wednes|thu|thur|thurs|fri|sat|satur|sun)(?:day)?';
  const MON_EN = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?';
  const DEADLINE_EN = new RegExp([
    String.raw`\b(?:by|until|till|before|due|no\s+later\s+than)\s+(?:the\s+)?(?:end\s+of\s+(?:the\s+)?(?:day|week|month)|eod|eow|cob|tomorrow|tonight|today|noon|midnight|next\s+\w+|this\s+\w+|${DAY_EN}\b|\d{1,2}(?:st|nd|rd|th)?\b|${MON_EN}\s*\d)`,
    String.raw`\b(?:today|tomorrow|tonight|eod|eow|this\s+(?:week|afternoon|evening|morning)|next\s+week|end\s+of\s+(?:the\s+)?(?:day|week|month)|before\s+the\s+(?:holiday|holidays|meeting|call|weekend)|asap|as\s+soon\s+as\s+possible|right\s+away|urgent(?:ly)?)\b`,
    String.raw`\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b`,
    String.raw`\b${MON_EN}\s+\d{1,2}\b|\b\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?${MON_EN}`,
    String.raw`\b\d{1,2}[/.]\d{1,2}(?:[/.]\d{2,4})?\b|\b\d{1,2}:\d{2}\b|\bat\s+\d{1,2}\s*(?:am|pm)\b`
  ].join('|'), 'i');
  const DAY_HE = '(?:ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)';
  const DEADLINE_HE = new RegExp([
    B + String.raw`(?:עד|לפני|ב|ב-|ביום|יום|עד\s+יום|עד\s+ה-?)\s*` + DAY_HE + E,
    B + String.raw`(?:מחר|מחרתיים|היום|הערב|השבוע|בשבוע\s+הבא|לשבוע\s+הבא|שבוע\s+הבא|סוף\s+(?:ה)?(?:יום|שבוע|חודש)|לפני\s+(?:ה)?(?:חג|חגים|פגישה|שיחה|סוף\s+השבוע)|בהקדם(?:\s+האפשרי)?|דחוף|מיד|ASAP|asap|יום\s+[אבגדהו]['׳])` + E,
    String.raw`\d{1,2}[/.]\d{1,2}(?:[/.]\d{2,4})?|\d{1,2}:\d{2}|בשעה\s+\d|עד\s+ה-?\d{1,2}|ב-?\d{1,2}\s+ב(?:ינואר|פברואר|מרץ|אפריל|מאי|יוני|יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר)`
  ].join('|'));
  const OFFER_CUR = String.raw`(?:[$€£₪]\s?\d|\d[\d,.]*\s?(?:₪|ש"ח|ש״ח|שקל(?:ים)?|(?:usd|eur|ils|nis|gbp|dollars?|euros?|shekels?)\b))`;
  const OFFER_EN = new RegExp(String.raw`(?:\b(?:do|would|will|can|could)\s+you\s+(?:\w+\s+)?|\b(?:please|pls|kindly)\s+|\b(?:let\s+me\s+know|tell\s+me|confirm)\s+(?:if|whether)\s+you\s+|\bare\s+you\s+(?:ok|okay|fine|good)\s+with\s+|\bwaiting\s+for\s+your\s+)(?:agree(?:ment)?|accept(?:ance)?|approv(?:e|al)|sign\s+off|ok(?:ay)?|go\s+ahead|confirm(?:ation)?)\b[^.?!\n]{0,40}?(?:\b${OFFER_OBJ}\b|${OFFER_CUR})`, 'i');
  const OFFER_HE = new RegExp(String.raw`(?:(?:^|[\s,.;:!?("'\-])(?:אתה|את|אתם|אתן|האם)\s+(?:\S+\s+)?(?:מסכים|מסכימה|מסכימים|מאשר|מאשרת|מאשרים|מקבל|מקבלת|מקבלים)|` + B + String.raw`(?:תסכים|תסכימי|תסכימו|להסכים|תאשר|תאשרי|תאשרו|לאשר|אשר|אשרי|תקבל|תקבלי|תקבלו))` + E + String.raw`[^.?!\n]{0,30}?(?:הצע(?:ה|ת)|מחיר|תנאי|עסקה|עסקת|סכום|סך` + E + '|' + OFFER_CUR + ')');
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
  const FRAUD_EN = /\b(?:new|updated|changed|different|alternate|alternative)\s+(?:bank|banking|payment|wire|remittance)\s+(?:details|account|info(?:rmation)?|instructions)\b|\b(?:new|updated|different)\s+(?:bank\s+)?account\s+(?:below|number|details)\b|\bwire\s+[^.\n]{0,30}\b(?:to|into)\s+(?:the|this|our|a)\s+new\s+account\b|\bto\s+the\s+new\s+(?:bank\s+)?account\b|\bbank\s+details\s+(?:have\s+)?changed\b|\b(?:update|change)\s+(?:our|the|your)\s+(?:bank|payment|banking)\s+details\b|\bgift\s*-?\s*cards?\b|\b(?:itunes|google\s+play|amazon|steam|apple)\s+(?:gift\s+)?cards?\b|\b(?:crypto(?:currency)?|bitcoin|btc|ethereum|eth|usdt|tether)\b|\bwallet\s+address\b|\b(?:urgent(?:ly)?|immediately|asap|right\s+away)\b[^.\n]{0,40}\b(?:wire|transfer)\b|\b(?:wire|transfer)\b[^.\n]{0,40}\b(?:urgent(?:ly)?|immediately|right\s+now|right\s+away|now)\b|\bforward\s+(?:all|every)\s+(?:the\s+)?(?:invoices?|emails?|messages?|files?|documents?)\b|\baccount\s+\d{2}-\d{3}/i;
  const FRAUD_HE = /חשבון\s+(?:ה)?בנק\s+(?:ה)?(?:חדש|שלנו\s+השתנה)|(?:ל)?חשבון\s+(?:ה)?חדש|פרטי\s+(?:ה)?(?:בנק|חשבון)\s+(?:ה)?(?:חדשים|השתנו|עודכנו)|שינוי\s+(?:ב)?פרטי\s+(?:ה)?(?:בנק|חשבון)|כרטיס(?:י)?\s+(?:ה)?מתנה|גיפט\s*-?\s*קארד|ביטקוין|קריפטו|מטבע(?:ות)?\s+דיגיטלי|ארנק\s+(?:דיגיטלי|קריפטו)|(?:דחוף|מיד|מייד|עכשיו)[^.\n]{0,30}(?:להעביר|העבר|תעביר|העבירו)\s+[$₪€£\d]|(?:להעביר|העבר|תעביר|העבירו)\s+[$₪€£]?[\d,.]+\s*(?:₪|ש"ח|ש״ח|\$|€)?[^.\n]{0,30}(?:מיד|מייד|עכשיו|דחוף)|העבר\s+את\s+כל\s+(?:ה)?(?:חשבוניות|מיילים|קבצים|מסמכים)|לחשבון\s+\d{2}-\d{3}/;
  const HE_CUR = String.raw`ש["״׳']{1,2}ח|שקלים|שקל(?![\u0590-\u05FF])`;
  const CUR = String.raw`(?:[$€£₪]\s?\d|\d[\d,.]*\s?(?:₪|${HE_CUR}|(?:usd|eur|ils|nis|gbp|dollars?|euros?|shekels?)\b))`;
  const MONEY_EN = new RegExp(String.raw`\b(?:wire|wiring|wired|remit(?:tance)?|pay(?:ing|ment|ments|able)?|paid|payout|settle\s+(?:the\s+)?(?:outstanding\s+)?(?:balance|invoice|bill|debt)|clear\s+(?:the\s+)?(?:outstanding\s+)?balance|bank\s+(?:account|transfer|details)|account\s+(?:number|no\.?)|iban|swift|bic|routing\s+number|sort\s+code|venmo|zelle|paypal|western\s+union|moneygram|refund|reimburse(?:ment)?|deposit\s+(?:the\s+)?(?:money|funds|check)|invoice\s+of)\b|\btransfer(?:ring|red|s)?\b[^.\n]{0,25}${CUR}|${CUR}[^.\n]{0,25}\btransfer\b|\btransfer(?:ring|red)?\s+(?:the\s+)?(?:money|funds|payment|deposit|amount|balance|fee)\b|\bsend\s+(?:me\s+|us\s+|them\s+)?${CUR}|\b(?:gift\s*cards?|crypto|bitcoin)\b`, 'i');
  const MONEY_HE = new RegExp(String.raw`העברה\s+בנקאית|העברת\s+(?:ה)?(?:כספים|כסף|תשלום|סכום)|(?:ל|ת|ו)?(?:העביר|תעביר|תעבירי|תעבירו|להעביר|העבר|העבירו)\s+(?:את\s+)?(?:ה)?(?:-)?(?:כסף|כספים|תשלום|סכום|יתרה|מקדמה|דמי|${CUR}|[$₪€£]|\d)|(?:ל|ת)?(?:שלם|תשלם|תשלמי|תשלמו|לשלם|שלמו|שלמי)(?=$|[\s,.?!])|תשלום|תשלומים|חשבון\s+(?:ה)?בנק|מספר\s+(?:ה)?חשבון|פרטי\s+(?:ה)?(?:בנק|חשבון)|(?:ל)?הסדיר\S*\s+(?:את\s+)?(?:ה)?(?:תשלום|יתרה|חוב)|(?:ל)?סגור\s+את\s+(?:ה)?יתרה|תסדירו|תסדיר|להסדרה|(?:ב)?ביט(?=$|[\s,.?!])|פייבוקס|פייפאל|ביטקוין|קריפטו|כרטיס(?:י)?\s+(?:ה)?מתנה|החזר\s+כספי|IBAN`);
  const PAST_CUE_EN = /\b(?:yesterday|last\s+(?:week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday|night)|earlier\s+(?:today|this\s+week)|(?:was|were)\s+(?:due|supposed\s+to)|already\s+(?:sent|signed|paid|happened|took\s+place|done|submitted|delivered|held)|took\s+place|went\s+(?:well|great|fine)|thanks?\s+(?:you\s+)?for\s+(?:the|our|today'?s)\s+(?:meeting|call|chat|sync|session|discussion)|thanks?\s+(?:you\s+)?for\s+(?:meeting|joining)|great\s+(?:meeting|call|chatting|discussion)|we\s+had\s+(?:our|a|the)\s+(?:meeting|call|sync|chat|session))\b/i;
  const PAST_CUE_HE = /שעבר(?:ה)?(?=$|[\s,.!?])|אתמול|שלשום|(?:היה|היתה|הייתה|היו)\s+(?:אמור|אמורה|אמורים|טוב|טובה|טובים|מצוינ)|כבר\s+(?:שלחנו|שלחתי|נשלח|נחתם|חתמנו|שילמנו|התקיים|התקיימה|קרה|הועבר)|התקיימ(?:ה|ו)?|תודה\s+על\s+(?:ה)?(?:פגישה|שיחה)/;
  const STRONG_PAST = /\b(?:thanks?\s+(?:you\s+)?for\s+(?:the|our|today'?s|meeting|joining)\b[^.!?\n]{0,20}\b(?:meeting|call|chat|sync|session|discussion|time)|great\s+(?:meeting|call|chatting|talking|discussion)|(?:went|was)\s+(?:well|great|fine|productive)|it\s+was\s+(?:productive|great|good)|we\s+had\s+(?:our|a|the)\s+(?:meeting|call|sync|chat|session)|took\s+place)\b|תודה\s+על\s+(?:ה)?(?:פגישה|שיחה)|(?:הייתה|היתה|היה)\s+(?:טובה|טוב|מוצלחת|מוצלח|פורייה)|התקיימ(?:ה|ו)/i;
  const PAST_DAY = /\blast\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|week|month)\b|(?:ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת|שבוע|חודש)\s+שעבר/i;
  const FORWARD = /\b(?:let'?s|can\s+we|could\s+we|shall\s+we|next\s+(?:week|time|call|meeting)|again|follow[-\s]?up\s+(?:call|meeting)|reschedul\w*|move\s+(?:it|the))\b|בוא\s+נ|בואו\s+נ|אפשר\s+לקבוע|נקבע|שוב|הבאה|הבא(?=$|[\s,.?!])/i;
  const ONEDRIVE = /one\s?-?drive|וואן\s?-?דרייב/i;
  const STEPS = { draft: true, task: true, calendar: true, file_save: true };
  const clean = (x) => String(x == null ? '' : x).replace(/[‎‏‪-‮⁦-⁩]/g, '');
  function hasDeadline(t) { return DEADLINE_EN.test(t) || DEADLINE_HE.test(t); }
  function unsupportedKind(t) {
    if (CREATE_DOC_EN.test(t) || CREATE_DOC_HE.test(t)) return 'gate:unsupported-kind:create-doc';
    if (ATTACH_INVITE_EN.test(t) || ATTACH_INVITE_HE.test(t)) return 'gate:unsupported-kind:attach-to-invite';
    return null;
  }
  function offerAcceptance(t) { return OFFER_EN.test(t) || OFFER_HE.test(t); }
  // Red team 2026-10-30 (docs/glance-ai/red-team.md): an injection written to slip past the patterns above. A zero-width or soft hyphen inside
  // a word ("Ig​nore"), full-width letters ("Ｉｇｎｏｒｅ"), a Cyrillic or Greek letter that looks Latin ("Ignоre"), spaced-out letters
  // ("I g n o r e"), or the same order in other words ("forget everything above", «תתעלם מכל מה שנאמר לך קודם»). The text is folded first,
  // then read by the same patterns plus the paraphrases.
  const LOOKALIKE = { 'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'у': 'y', 'х': 'x', 'і': 'i', 'ј': 'j', 'ѕ': 's', 'ԁ': 'd', 'ӏ': 'l', 'һ': 'h', 'к': 'k', 'м': 'm', 'н': 'h', 'т': 't', 'в': 'b',
    'А': 'A', 'Е': 'E', 'О': 'O', 'Р': 'P', 'С': 'C', 'Т': 'T', 'Х': 'X', 'І': 'I', 'К': 'K', 'М': 'M', 'Н': 'H', 'В': 'B',
    'ο': 'o', 'α': 'a', 'ε': 'e', 'ι': 'i', 'κ': 'k', 'ν': 'v', 'ρ': 'p', 'τ': 't', 'υ': 'u', 'Ο': 'O', 'Α': 'A', 'Ε': 'E', 'Ι': 'I', 'Κ': 'K', 'Ν': 'N', 'Ρ': 'P', 'Τ': 'T' };
  function fold(x) {
    let t = String(x == null ? '' : x);
    try { t = t.normalize('NFKC'); } catch (e) { /* keep as is */ }
    t = t.replace(/[­᠎​-‏⁠-⁤﻿‪-‮⁦-⁩]/g, '');
    t = t.replace(/[Ͱ-ϿЀ-ӿ]/g, (ch) => LOOKALIKE[ch] || ch);
    t = t.replace(/(?:\b[A-Za-z][  ]){3,}[A-Za-z]\b/g, (m) => m.replace(/[  ]/g, ''));
    return t;
  }
  const INJECT_PARA_EN = /\b(?:forget|disregard|ignore|drop)\s+(?:about\s+)?(?:everything|all(?:\s+of)?(?:\s+(?:that|this|the\s+above))?|anything)\s+(?:(?:written\s+|said\s+|stated\s+)?(?:above|before|prior|previously|earlier)|you\s+(?:were|have\s+been)\s+(?:told|given|instructed))\b|\b(?:disregard|ignore|forget)\s+what\s+you\s+(?:were|have\s+been)\s+(?:told|instructed|asked|given)\b/i;
  const INJECT_PARA_HE = /(?:התעלם|תתעלם|התעלמי|תתעלמי|התעלמו|תתעלמו|שכח|תשכח|שכחי|תשכחי)\s+(?:מ|מכל|ממה|מכל\s+מה|את\s+כל\s+מה)\s*(?:מה\s+)?ש(?:נאמר|נכתב|אמרו|קיבלת|ביקשו|הוגדר|כתוב)/;
  function textVeto(full, own) {
    const ff = fold(full);
    if (INJECT_EN.test(full) || INJECT_HE.test(full) || INJECT_EN.test(ff) || INJECT_HE.test(ff) || INJECT_PARA_EN.test(ff) || INJECT_PARA_HE.test(ff)) return 'injection';
    if (FRAUD_EN.test(own) || FRAUD_HE.test(own)) return 'payment-fraud';
    return null;
  }
  function moneyMovement(t) { return MONEY_EN.test(t) || MONEY_HE.test(t); }

  // gate(proposal, mail) -> { pass, reason, step }. mail: { text, body?, subject, surface, direction, attachmentCount, today }
  function gate(p, mail) {
    mail = mail || {};
    const step = p && p.step;
    if (!STEPS[step]) return { pass: false, reason: 'gate:unsupported-step:' + step };
    const t = clean(mail.text);
    const uk = unsupportedKind(t); if (uk) return { pass: false, reason: uk, step };
    if (offerAcceptance(t)) return { pass: false, reason: 'gate:money-offer-acceptance', step };
    if (step === 'file_save') return { pass: true, reason: 'pass', step }; // the host's core/suggest-save.js decides on the real attachments
    const today = mail.today || '';
    if (!(p.due && p.due >= today) && !hasDeadline(t)) return { pass: false, reason: 'gate:undated', step };
    return { pass: true, reason: 'pass', step };
  }

  // veto(proposal, mail) -> null | reason
  function veto(p, mail) {
    mail = mail || {};
    const step = p && p.step;
    if (!step || step === 'SILENT') return null;
    const dir = mail.direction || 'inbound';
    if (dir === 'outbound') return 'own-mail';
    if (dir === 'self' && step === 'draft') return 'no-draft-to-self';
    const own = clean(mail.text) + '\n' + clean(mail.subject), full = clean(mail.body != null ? mail.body : mail.text) + '\n' + clean(mail.subject);
    const tv = textVeto(full, own); if (tv) return tv;
    if (moneyMovement(own)) return 'money-movement';
    if (step === 'file_save') {
      if (Number(mail.attachmentCount || 0) !== 1) return 'save-no-attachment';
      if (mail.surface !== 'outlook' && ONEDRIVE.test(own)) return 'save-gmail-onedrive';
      return null;
    }
    const today = mail.today || '', d = p.due || null, future = !!(d && d >= today);
    if (d && d < today) return 'past-date';
    if ((step === 'calendar' || step === 'task') && PAST_DAY.test(own) && !FORWARD.test(own)) return 'past-date';
    if (step === 'calendar' && STRONG_PAST.test(own) && !FORWARD.test(own)) return 'past-date';
    if (step === 'task' && STRONG_PAST.test(own) && !future) return 'past-date';
    if ((PAST_CUE_EN.test(own) || PAST_CUE_HE.test(own)) && (step === 'calendar' || step === 'task') && !future) return 'past-date';
    if (step === 'calendar' && !future) return 'calendar-needs-future-date';
    return null;
  }

  // floorFor(mail) -> the { gate, veto } pair Router v2 takes as deps, bound to this mail.
  function floorFor(mail) { return { gate: (p) => gate(p, mail), veto: (p) => veto(p, mail) }; }

  // The injection read alone, for close paths that are not a model proposal (core/bill-paid.js): folded text, the same patterns.
  function injected(text) { const t = clean(text), ff = fold(t); return INJECT_EN.test(t) || INJECT_HE.test(t) || INJECT_EN.test(ff) || INJECT_HE.test(ff) || INJECT_PARA_EN.test(ff) || INJECT_PARA_HE.test(ff); }

  return { gate, veto, floorFor, hasDeadline, unsupportedKind, offerAcceptance, moneyMovement, fold, injected };
})();

if (typeof module !== 'undefined') module.exports = { FlowAiFloor };
