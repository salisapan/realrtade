'use strict';
// The guard on the engine's own cards (docs/glance-ai/ai-product.md §3): a mail that carries an instruction aimed at a model, or
// fraud-shaped money (changed bank details, gift cards, crypto, an urgent wire, "forward all invoices"), gets no card at all: not the
// engine's own card (tier 0) and not a model card, and it is never sent to a model. The lab veto was always meant to cover every card
// (glance-ai/oss/veto/llm-veto.cjs textVeto, "silences EVERY card (engine and LLM)"); until now only model cards had it.
// The patterns are the lab's, the same source core/ai-floor.js was ported from. Silence-only: it never adds or changes a card.
// Off switch: SWITCH ('aiTier0GuardV1'), default off: check() is not called and read() keeps today's path. Portable: no chrome.*, no DOM,
// no network.
const FlowTier0Guard = (() => {
  const SWITCH = 'aiTier0GuardV1';
  const DEFAULTS = Object.freeze({ [SWITCH]: false });
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

  const clean = (x) => String(x == null ? '' : x).replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '');
  function enabled(flags) { return !!(flags && flags[SWITCH] === true); }

  // check(mail) -> null | 'guard:injection' | 'guard:payment-fraud'. mail: { text (the person's own part), body? (the whole mail), subject }.
  // An injection counts anywhere in the mail, quoted part included; fraud counts in the mail's own text.
  function check(mail) {
    mail = mail || {};
    const own = clean(mail.text) + '\n' + clean(mail.subject);
    const full = clean(mail.body != null ? mail.body : mail.text) + '\n' + clean(mail.subject);
    if (INJECT_EN.test(full) || INJECT_HE.test(full)) return 'guard:injection';
    if (FRAUD_EN.test(own) || FRAUD_HE.test(own)) return 'guard:payment-fraud';
    return null;
  }

  return { SWITCH, DEFAULTS, enabled, check };
})();

if (typeof module !== 'undefined') module.exports = { FlowTier0Guard };
