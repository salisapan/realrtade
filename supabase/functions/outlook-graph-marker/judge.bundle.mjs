var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __commonJS = (cb, mod) => function __require2() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// flow-trial-extension/core/intent.js
var require_intent = __commonJS({
  "flow-trial-extension/core/intent.js"(exports, module) {
    var FlowIntent3 = (() => {
      const TYPES = {
        REQUEST: "request",
        // בקשה המופנית למשתמש
        COMMITMENT_OF_READER: "commitment",
        // התחייבות שהמשתמש לקח על עצמו
        SCHEDULED_EVENT: "event",
        // מועד סופי ברור / אירוע מתוזמן
        DECISION_TO_LOG: "decision",
        // החלטה שיש לתעד
        FOLLOW_UP: "followup"
        // פעולת המשך נדרשת
      };
      const EVENT_NOUN_ALT = [
        "quick chat",
        "strategy session",
        "planning session",
        "panel discussion",
        "town hall",
        "office hours",
        "one-on-one",
        "meeting",
        "call",
        "sync",
        "check-?in",
        "appointment",
        "session",
        "interview",
        "demo",
        "walkthrough",
        "consultation",
        "stand-?up",
        "retro(?:spective)?",
        "workshop",
        "webinar",
        "huddle",
        "kick-?off",
        "deposition",
        "hearing",
        "mediation",
        "chat"
      ].join("|");
      const MEETING_NOUN = new RegExp("\\b(?:" + EVENT_NOUN_ALT + ")\\b(?!\\s+(?:recording|notes|transcript|minutes|summary|recap|feedback|materials|slides|deck|agenda))", "i");
      const ATTACH_TARGET = "(?:" + EVENT_NOUN_ALT + "|invite|invitation)";
      const MEETING_NOUN_HE = /(פגישת|פגישה|שיחה|ראיון|סנכרון|תיאום|ייעוץ|הדגמה|מפגש|ועידה|שיחת טלפון|פגישת עבודה|שיחת זום|שיחת וידאו|עמידה יומית|רטרו(?:ספקטיבה)?|סדנה|וובינר|תדרוך|כנס פתיחה|היכרות עם הצוות|שימוע|גישור|דיון בפאנל)(?!\s*(?:הקלטה|הקלטת|הערות|תמליל|פרוטוקול|סיכום|חומרים|מצגת|סדר יום))/;
      const EXPLICIT_MEETING_ASK = new RegExp([
        "\\b(?:can|could|would)\\s+(?:you|we)\\s+meet(?!\\s+(?:the\\s+)?(?:deadline|requirement|criteria|quota|target|obligation))\\b",
        "\\b(?:can|could|would)\\s+(?:you|we)\\s+(?:schedule|set up|book)\\b",
        "\\bplease\\s+(?:schedule|set up|book|put)\\b"
      ].join("|"), "i");
      const EXPLICIT_MEETING_ASK_HE = /(?:בבקשה\s+תקבע(?:ו|י)?\s+פגישה|אפשר\s+לקבוע\s+פגישה|(?:^|[^\u0590-\u05FF])ת?שמור(?:י|ו)?\s+לי\s+את\s+הזמן|(?:^|[^\u0590-\u05FF])(?:נוכל|אוכל|תוכל(?:ו|י)?|אפשר)\s+(?:\S+\s+){0,3}?(?:להיפגש|לדבר|לקבוע|לתאם|להתקשר|לשוחח))/;
      const EVENT_CALLED_OFF = new RegExp([
        "postpon(?:e|ed|ing)",
        "reschedul(?:e|ed|ing)",
        "call(?:ed|ing)? off",
        "no longer (?:needed|necessary|happening|required|going ahead|relevant)",
        "won'?t be going ahead",
        "not going ahead",
        "push(?:ed|ing)? (?:back|out)",
        "mov(?:e|ed|ing)\\b[^.!?;]{0,60}?\\bto (?:next|another|the following|a later|sometime)",
        "skip(?:ping)? (?:this|next) week'?s?",
        "(?:take|drop) (?:it|this|that) (?:off|from) the calendar",
        "don'?t schedule",
        "do not schedule",
        "no loner needed"
      ].join("|"), "i");
      const EVENT_CALLED_OFF_HE = /(נדח(?:ה|ית|תה)|לדחות|דוחים את|מבוטל|מבוטתל|בוטל|מבטלת|מבטל|לא מתקיים|לא יתקיים|נקבע מחדש|מבטלים את הפגישה|הפגישה לא תתקיים|יש לדחות את)/;
      const EVENT_RECAP = new RegExp([
        "thanks? for (?:the |our )?(?:call|meeting|chat|time|interview)",
        "thank you for (?:the |our )?(?:call|meeting|chat|time|interview)",
        "great (?:meeting|call|chat|catting|talking to you|speaking with you)",
        "good (?:speaking|talking|chatting) with you",
        "it was (?:great|good|nice) (?:to (?:meet|speak|talk|chat)|meeting you|speaking with you|chatting)",
        "enjoyed (?:our|the) (?:call|meeting|chat|conversation)",
        "glad (?:we|to have) (?:synced|caught up|connected|spoke|talked)",
        // "The call was on Monday" resolves Monday forward. The meeting already
        // happened; "was on" is the tense cue EVENT_RECAP's thank-you list misses.
        "(?:the |our )?(?:call|meeting|sync|chat|demo|interview|check-?in|appointment) was on",
        "already had (?:the |our )?(?:call|meeting|sync|chat|demo|interview|check-?in)"
      ].join("|"), "i");
      const EVENT_RECAP_HE = /(תודה על ה(?:שיחה|פגישה)|היה נעים (?:לדבר|להיפגש)|שמחתי שדיברנו|נהניתי מ(?:השיחה|הפגישה)|תודה שהתפניתם?|היה כיף לדבר|נעים היה להכיר|(?:שיחת|פגישת|הראיון|הפגישה|השיחה|הישיבה|ראיון).{0,40}(?:הייתה|היה|היו)|(?:הייתה|היה|היו) ביום)/;
      function isPastDate(dateIso, now) {
        if (!dateIso) return false;
        const n = now || /* @__PURE__ */ new Date();
        const todayIso = n.getFullYear() + "-" + String(n.getMonth() + 1).padStart(2, "0") + "-" + String(n.getDate()).padStart(2, "0");
        return dateIso < todayIso;
      }
      const READER_COMMIT = /\b(you (?:agreed|committed|promised|confirmed) to|you (?:said|mentioned|indicated) you(?:'d| would)|you told (?:us|me) you(?:'d| would)|you'?re supposed to|you were (?:going|supposed) to|as (?:you|per your|we) (?:agreed|committed|promised|discussed)|confirming you(?:'ll| will)|per your commitment|as (?:discussed|promised|previously agreed),? you(?:'ll| will)|per our conversation,? you(?:'ll| will)|reminding you (?:that )?you (?:agreed|committed|promised) to)\b/i;
      const READER_COMMIT_HE = /(כפי שהתחייבת|כמו שהתחייבת|כפי שסיכמת|כמו שסיכמת|את(?:ה)? התחייבת|כמו שאמרת ש|כפי שהבטחת|כמו שהבטחת|אתה אמור ל|את אמורה ל|היית אמור ל|היית אמורה ל|לפי הסיכום שלנו|בהתאם למה שסיכמנו|כפי שהיה מוסכם|כמו שהיה מוסכם)/;
      function whatText(text, patterns) {
        return FlowExtract.decisiveSentence(text, patterns) || null;
      }
      function humanWhen(date, time) {
        if (!date && !time) return null;
        const parts = [];
        if (date) parts.push(date.iso ? humanDateFallback(date) : date.raw);
        if (time) parts.push(String(time.hour).padStart(2, "0") + ":" + String(time.minute).padStart(2, "0"));
        return parts.join(" ") || null;
      }
      function humanDateFallback(date) {
        if (!date || !date.iso) return date ? date.raw : null;
        const parts = date.iso.split("-");
        const dt = new Date(+parts[0], +parts[1] - 1, +parts[2]);
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const sameYear = dt.getFullYear() === (/* @__PURE__ */ new Date()).getFullYear();
        return months[dt.getMonth()] + " " + dt.getDate() + (sameYear ? "" : " " + dt.getFullYear());
      }
      const REQUEST_PATTERNS = [FlowJudgment.HANDOFF, FlowJudgment.HANDOFF_HE, FlowJudgment.FOLLOW_UP_ASK, FlowJudgment.FOLLOW_UP_ASK_HE];
      const DATED_COMMIT_PATTERNS = [FlowJudgment.SENDER_PROMISE, FlowJudgment.SENDER_PROMISE_HE, /\b(agreed|approved|confirmed|confirming)\b/i, /(סוכם|אישרנו|מאשרים|מאשר|מאושר)/];
      const REQUESTED_OBJECT_GROUPS_EN = [
        // Finance
        "receipts?",
        "tax invoices?",
        "invoices?",
        "credit notes?",
        "refunds?",
        "reimbursements?",
        "expense reports?",
        "purchase orders?",
        "POs?",
        "price lists?",
        "quotes?",
        "quotations?",
        "statements?",
        "estimates?",
        "budgets?",
        "payments?",
        "invoice numbers?",
        "W-?9s?",
        "W-?2s?",
        "1099s?",
        // Legal / contractual
        "contracts?",
        "agreements?",
        "NDAs?",
        "non-disclosure agreements?",
        "MSAs?",
        "master service agreements?",
        "SOWs?",
        "statements? of work",
        "amendments?",
        "addend(?:um|a)",
        "waivers?",
        "releases?",
        "licen[cs]es?",
        "terms(?: and conditions)?",
        "polic(?:y|ies)",
        "redlines?",
        "markups?",
        // Documents / files
        "documents?",
        "files?",
        "scans?",
        "PDFs?",
        "spreadsheets?",
        "presentations?",
        "decks?",
        "slides?",
        "templates?",
        "forms?",
        "applications?",
        "certificates?",
        "transcripts?",
        "diplomas?",
        "cop(?:y|ies)",
        // Reports / updates
        "reports?",
        "updates?",
        "status(?: updates?)?",
        "summar(?:y|ies)",
        "recaps?",
        "breakdowns?",
        "analys[ie]s",
        "forecasts?",
        "projections?",
        "roadmaps?",
        "timelines?",
        "schedules?",
        "itinerar(?:y|ies)",
        "agendas?",
        "minutes",
        "meeting notes",
        "action items?",
        // Access / credentials
        "access",
        "logins?",
        "credentials?",
        "passwords?",
        "API keys?",
        "permissions?",
        "invites?",
        "invitation links?",
        "dashboard access",
        // Communication
        "confirmations?",
        "approvals?",
        "sign-?offs?",
        "feedback",
        "comments?",
        "input",
        "responses?",
        "repl(?:y|ies)",
        "clarifications?",
        "guidance",
        "instructions?",
        // Deliverables
        "drafts?",
        "deliverables?",
        "proposals?",
        "samples?",
        "mockups?",
        "prototypes?",
        "wireframes?",
        "designs?",
        "artwork",
        "specs?",
        "specifications?",
        "requirements?",
        // Scheduling
        "availability",
        "calendars?",
        "time slots?",
        // HR
        "r[\xE9e]sum[\xE9e]s?",
        "CVs?",
        "cover letters?",
        "references?",
        "offer letters?",
        "employment contracts?",
        "onboarding paperwork",
        "background checks?",
        // Kept from the original list
        "links?",
        "attach(?:ments?|ed)",
        "signatures?",
        "information",
        "details",
        "data",
        "figures?"
      ];
      const REQUESTED_OBJECT = new RegExp("\\b(" + REQUESTED_OBJECT_GROUPS_EN.join("|") + ")\\b", "i");
      const REQUESTED_LOGISTICS_EN = new RegExp("\\b(" + [
        "delivery(?: dates?| times?| address(?:es)?| windows?| details)?",
        "(?:shipping|ship|due|arrival|pick-?up) dates?",
        "dates?",
        "addresses",
        "amounts?",
        "totals?",
        "deadlines?"
      ].join("|") + ")\\b", "i");
      const REQUESTED_LOGISTICS_HE = /(פרטי(?: ה(?:משלוח|אספקה))?|מועד(?: ה(?:משלוח|אספקה))?|תאריך(?: משלוח| אספקה)?|כתובת|סכום|סכומים|משלוח|אספקה)/;
      const SENDER_PROMISE = /\b(?:we(?:'|’)ll|we will|i(?:'|’)ll|i will|we(?:'|’)re going to|i(?:'|’)m going to|we can|i can|let me|we(?:'|’)ve|i(?:'|’)ve)\b|(?:^|[^\u0590-\u05FF])(?:נשלח|אשלח|נעביר|אעביר|נחזיר|אחזיר|נמסור|אמסור|נדאג|אדאג|נעדכן|אעדכן)(?![\u0590-\u05FF])/i;
      const REQUEST_ADDRESSEE = /\b(?:please|kindly|pls|(?:could|can|would|will)\s+you)\b|\?|(?:^|[^\u0590-\u05FF])(?:אנא|נא|תוכל|תוכלי|תוכלו|אפשר|ניתן)(?![\u0590-\u05FF])/i;
      const SUBJECT_LIKE_START = /^(?:we|i|they|he|she|it|the|our|my|this|that|there|these|those|his|her|their)\b/i;
      const PAY_OR_CALL_VERB = /\b(?:pay|wire|remit|settle|call|phone|dial|ring)\b|(?:^|[^\u0590-\u05FF])[הוכלמב]?(?:לשלם|שלם|תשלם|שלמו|להתקשר|התקשר|תתקשר|תתקשרי|טלפן)(?![\u0590-\u05FF])/i;
      function addressedRequest(sentence) {
        const t = String(sentence || "").trim();
        if (!t || SENDER_PROMISE.test(t)) return false;
        if (REQUEST_ADDRESSEE.test(t)) return true;
        return !SUBJECT_LIKE_START.test(t);
      }
      function logisticsCounts(sentence) {
        const t = String(sentence || "");
        return addressedRequest(t) && !PAY_OR_CALL_VERB.test(t);
      }
      function requestObjectTest(sentence) {
        if (!sentence) return false;
        if (REQUESTED_OBJECT.test(sentence) || REQUESTED_OBJECT_HE.test(sentence)) return true;
        return logisticsCounts(sentence) && (REQUESTED_LOGISTICS_EN.test(sentence) || REQUESTED_LOGISTICS_HE.test(sentence));
      }
      function requestObjectExec(sentence) {
        if (!sentence) return null;
        const core = REQUESTED_OBJECT.exec(sentence) || REQUESTED_OBJECT_HE.exec(sentence);
        if (core) return core;
        if (!logisticsCounts(sentence)) return null;
        return REQUESTED_LOGISTICS_EN.exec(sentence) || REQUESTED_LOGISTICS_HE.exec(sentence);
      }
      const REQUESTED_OBJECT_HE = /(קבלה|חשבונית מס|חשבונית|זיכוי|החזר כספי|החזר|הוצאות|דוח הוצאות|הזמנת (?:ה)?רכש|מחירון|הצעת (?:ה)?מחיר|תקציב|תשלום|חוזה|הסכם|הסכם סודיות|נספח|תיקון להסכם|ויתור|שחרור מהתחייבות|רישיון|תנאי שימוש|תנאים והגבלות|מדיניות|מסמך|קובץ|סריקה|מצגת|תבנית|טופס|בקשת הצטרפות|תעודה|תעודת (?:ה)?זהות|גיליון אלקטרוני|תמליל|דו["״]ח|דוח|עדכון|עדכון סטטוס|סטטוס|תקציר|סיכום|סיכום פגישה|ניתוח|תחזית|תחזית תקציבית|מפת (?:ה)?דרכים|לוח זמנים|סדר (?:ה)?יום|פרוטוקול|(?:ה)?פעולות (?:ה)?נדרשות|גישה|פרטי התחברות|סיסמה|מפתח API|הרשאה|הרשאות|הזמנה|קישור הזמנה|אישור|חתימה|משוב|הערות|תגובה|מענה|הבהרה|הנחיה|הוראות|טיוטה|תוצר|הצעה|דוגמה|מוקאפ|אבטיפוס|עיצוב|גרפיקה|מפרט|דרישות|זמינות|לוח שנה|חלון זמן|קורות (?:ה)?חיים|מכתב מקדים|המלצות|מכתב הצעת (?:ה)?עבודה|חוזה העסקה|קישור|פרטים|מידע|נתונים|נתונים מספריים)/;
      function shortLabel(type, facts, enrichedFacts) {
        const dateText = facts.date ? humanDateFallback(facts.date) : null;
        if (type === TYPES.SCHEDULED_EVENT) {
          return "Meeting" + (dateText ? " " + dateText : "") + (facts.timeText ? " " + facts.timeText : "");
        }
        if (type === TYPES.COMMITMENT_OF_READER) {
          return "Your commitment" + (dateText ? ", due " + dateText : "") + (facts.moneyText ? ", " + facts.moneyText : "");
        }
        if (type === TYPES.REQUEST) {
          return "Reply requested" + (dateText ? " by " + dateText : "") + (facts.moneyText ? ", " + facts.moneyText : "");
        }
        return FlowJudgment.neutralTitle(enrichedFacts);
      }
      const INFO_FULL = /\b(?:fyi|for your information|no action (?:needed|required|necessary)|no need to do anything|informational only|for visibility only|for (?:your )?awareness|looping you(?: in)? for (?:visibility|awareness))\b|(?:^|\s)(?:לידיעתך|לידיעה בלבד|אין צורך בפעולה)|לא נדרש(?:ת|ים)?\s+(?:ממך\s+)?(?:פעולה|דבר|כלום|ממך)|לא נדר(?:שת|ת)\s+פעולה/i;
      const REPLY_CANCEL = /\b(?:no reply needed|no need to (?:reply|respond))\b|(?:^|\s)אין צורך להגיב/i;
      const ACTION_PLEASE = /\bplease\s+[a-z]{2,}\b/i;
      const JUST_DO = /\bjust get it done\b/i;
      const DUE_CUE = /\b(?:today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|by|before|due|expires?)\b|\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}\b|\b\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?\b/i;
      function replyCancelOnly(text) {
        const raw = String(text || "");
        if (INFO_FULL.test(raw) || !REPLY_CANCEL.test(raw)) return false;
        if (ACTION_PLEASE.test(raw)) return true;
        return JUST_DO.test(raw) && DUE_CUE.test(raw);
      }
      function isReaderStandDown(sentence) {
        return /^(?:everyone else|all others|everybody else|the rest(?: of you)?)[,:]?\s+no action (?:needed|required|necessary)\b/i.test(String(sentence || "").trim());
      }
      function mailSentences(text) {
        return String(text || "").split(/\n+|(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
      }
      function sentenceNamesReader(sentence, ctx) {
        const first = String(ctx && ctx.userName || "").trim().split(/\s+/)[0];
        if (!first) return false;
        const escaped = first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return new RegExp("(?:^|[^A-Za-z\\u0590-\\u05FF])" + escaped + "(?:[^A-Za-z\\u0590-\\u05FF]|$)", "i").test(String(sentence || ""));
      }
      function namedReplySentence(text, ctx) {
        const parts = mailSentences(text);
        for (let i = 0; i < parts.length; i++) {
          if (sentenceNamesReader(parts[i], ctx) && explicitReplyAsk(parts[i])) return true;
        }
        return false;
      }
      function infoOnlyMail(text, ctx) {
        const raw = String(text || "");
        const parts = mailSentences(raw);
        const kept = [];
        let stoodDown = false;
        for (let i = 0; i < parts.length; i++) {
          if (isReaderStandDown(parts[i])) {
            stoodDown = true;
            continue;
          }
          kept.push(parts[i]);
        }
        if (stoodDown && kept.some((s) => sentenceNamesReader(s, ctx) && explicitReplyAsk(s))) {
          const body = kept.join("\n");
          if (INFO_FULL.test(body)) return true;
          return REPLY_CANCEL.test(body) && !replyCancelOnly(body);
        }
        if (INFO_FULL.test(raw)) return true;
        return REPLY_CANCEL.test(raw) && !replyCancelOnly(raw);
      }
      const EXTRA_NOISE = /\b(?:quick bump|friendly bump|bumping this|just a nudge|accepted invitation|invitation accepted|updated invitation|event reminder|calendar reminder|automated reminder|your response:\s*accepted)\b|^\s*accepted\s*:|^\s*reminder:\s*(?:meeting|sync|call)\b/im;
      const SOFT_ASK = /\b(?:maybe|perhaps|possibly|no rush|whenever you|when convenient|at your leisure|if possible|if you want|if it helps|just a nudge|optional|provided that|subject to|assuming)\b/i;
      const SOFT_ASK_HE = /(?:^|\s)אולי|במידה ו|בהנחה ש|בכפוף ל|כשיהיה לך|מתי שנוח/;
      function explicitReplyAsk(text) {
        const raw = String(text || "");
        if (/\b(?:can|could|would|will)\s+you\s+(?:please\s+)?reply\b/i.test(raw)) return true;
        if (/\b(?:please|kindly)\s+reply\b/i.test(raw)) return true;
        if (/\breply and confirm\b/i.test(raw)) return true;
        if (/תוכל(?:י|ו)?(?:\s+\S+){0,4}\s+להשיב/.test(raw)) return true;
        if (/להשיב\s+ולאשר/.test(raw)) return true;
        return false;
      }
      const AUTO_REPLY_TEXT = /\b(?:out of (?:the )?office|automatic reply|auto-?reply|autoreply|away until|on (?:vacation|leave|holiday)|do not reply|undeliverable|delivery (?:status|failure)|mailer-daemon|message blocked|recipient address rejected)\b|(?:מחוץ למשרד|תשובה אוטומטית|בחופשה עד|בחופשה|אעדר)/i;
      function addressList(value) {
        if (!value) return [];
        const list = Array.isArray(value) ? value : [value];
        const out = [];
        list.forEach((a) => {
          if (!a) return;
          const email = typeof a === "string" ? a : a.email || a.address || a.emailAddress && a.emailAddress.address || "";
          const norm = String(email || "").trim().toLowerCase();
          if (norm) out.push(norm);
        });
        return out;
      }
      function autoReplyMail(text, senderEmail) {
        if (typeof FlowFollowUp !== "undefined" && typeof FlowFollowUp.isAutoReply === "function") {
          return FlowFollowUp.isAutoReply(text, senderEmail);
        }
        if (AUTO_REPLY_TEXT.test(String(text || "").slice(0, 600))) return true;
        return /^(?:no-?reply|do-?not-?reply|noreply|mailer-daemon|postmaster)@/i.test(String(senderEmail || ""));
      }
      const VETO_EVENT = "(?:(?:" + EVENT_NOUN_ALT + ")s?|reviews?)";
      const VETO_CANCEL = "(?:cancell?ed|cancel|postponed|postpone|postone|no loner needed|no lnoger needed)";
      const VETO_EVENT_RE = new RegExp("\\b" + VETO_EVENT + "\\b", "i");
      const VETO_CANCEL_RE = new RegExp("\\b" + VETO_CANCEL + "\\b", "i");
      const VETO_HE_EVENT = "(?:\u05D4\u05E4\u05D2\u05D9\u05E9\u05EA\\s+\\S+|\u05E4\u05D2\u05D9\u05E9\u05EA\\s+\\S+|\u05D4\u05E9\u05D9\u05D7\u05EA\\s+\u05D6\u05D5\u05DD|\u05E9\u05D9\u05D7\u05EA\\s+\u05D6\u05D5\u05DD|\u05D4\u05D4\u05D3\u05D2\u05DE\u05D4|\u05D4\u05D3\u05D2\u05DE\u05D4|\u05D4\u05E8\u05D0\u05D9\u05D5\u05DF|\u05E8\u05D0\u05D9\u05D5\u05DF|\u05D4\u05E4\u05D2\u05D9\u05E9\u05D4|\u05E4\u05D2\u05D9\u05E9\u05D4|\u05D4\u05E9\u05D9\u05D7\u05D4|\u05E9\u05D9\u05D7\u05D4)";
      const VETO_HE_LATIN = "(?:^|[^A-Za-z\\u0590-\\u05FF])\u05D4?(?:call|meeting)(?![A-Za-z])";
      const VETO_HE_CANCEL = "(?:\u05D1\u05D5\u05D8\u05DC\u05D4|\u05D1\u05D5\u05D8\u05DC|\u05DE\u05D1\u05D5\u05D8\u05EA\u05DC|\u05DE\u05D1\u05D8\u05DC\u05EA|\u05DE\u05D1\u05D8\u05DC|\u05D1\u05D9\u05D8\u05DC\u05E0\u05D5|\u05D1\u05D9\u05D8\u05DC\u05D4|\u05D1\u05D9\u05D8\u05DC|\u05DC\u05D0\\s+\u05EA\u05EA\u05E7\u05D9\u05D9\u05DD|\u05E0\u05D3\u05D7\u05D4|\u05EA\u05D9\u05D3\u05D7\u05D4|\u05D9\u05D9\u05D3\u05D7\u05D4|\u05DC\u05D1\u05D8\u05DC|\u05EA\u05D1\u05D8\u05DC|\u05D1\u05D8\u05DC|\u05DE\u05D5\u05D8\u05DC\u05EA)";
      const VETO_HE_EVENT_RE = new RegExp(VETO_HE_EVENT);
      const VETO_HE_LATIN_RE = new RegExp(VETO_HE_LATIN, "i");
      const VETO_HE_CANCEL_RE = new RegExp("(?:^|[^\\u0590-\\u05FF])(?:" + VETO_HE_CANCEL + ")(?![\\u0590-\\u05FF])");
      const VETO_PAST_EN = new RegExp("\\b(?:the |our |a |this )?" + VETO_EVENT + "\\s+was\\s+(?:on|yesterday)\\b", "i");
      const VETO_PAST_HE = new RegExp("(?:" + VETO_HE_EVENT + "|" + VETO_HE_LATIN + ")(?:[^\\n.!?]){0,40}(?:\u05D4\u05D9\u05D9\u05EA\u05D4|\u05D4\u05D9\u05D4|\u05D4\u05D9\u05D5)|(?:\u05D4\u05D9\u05D9\u05EA\u05D4|\u05D4\u05D9\u05D4|\u05D4\u05D9\u05D5)(?:[^\\n.!?]){0,40}(?:" + VETO_HE_EVENT + "|" + VETO_HE_LATIN + ")", "i");
      function vetoClauses(raw) {
        return String(raw || "").split(/\n+|(?<=[.!?;])\s+|,\s+|\s+\bbut\b\s+|\s+אבל\s+/i);
      }
      function clauseHasEvent(clause) {
        return VETO_EVENT_RE.test(clause) || VETO_HE_EVENT_RE.test(clause) || VETO_HE_LATIN_RE.test(clause);
      }
      function personalAsk(raw) {
        const r = String(raw || "");
        if (/\?/.test(r)) return true;
        if (/\b(?:can|could|would)\s+(?:you|we)\b/i.test(r)) return true;
        if (/\blet(?:'s| us)\b/i.test(r)) return true;
        if (/\b(?:please|kindly)\b/i.test(r) && !/\b(?:please|kindly)\s+(?:register|join)\b/i.test(r)) return true;
        if (/(?:אפשר|בבקשה|תוכל|תוכלי|תאשר|נוכל|תקבע|תכניס)/.test(r)) return true;
        if (/\b(?:add|put) it (?:on|in) (?:your |the )?calendar\b/i.test(r)) return true;
        return false;
      }
      function clauseCancelled(clause) {
        if (VETO_EVENT_RE.test(clause) && VETO_CANCEL_RE.test(clause)) return true;
        if ((VETO_HE_EVENT_RE.test(clause) || VETO_HE_LATIN_RE.test(clause)) && VETO_HE_CANCEL_RE.test(clause)) return true;
        return false;
      }
      function clausePast(clause) {
        if (/\bwas on my list\b/i.test(clause)) return false;
        return VETO_PAST_EN.test(clause) || VETO_PAST_HE.test(clause);
      }
      function clauseLive(clause) {
        if (clausePast(clause) || clauseCancelled(clause)) return false;
        return clauseHasEvent(clause);
      }
      function askClause(clause) {
        if (/confidentiality notice|please notify the sender|הודעה זו והמצורפים/i.test(clause)) return false;
        return personalAsk(clause);
      }
      function liveWithAsk(clauses) {
        for (let i = 0; i < clauses.length; i++) {
          if (!clauseLive(clauses[i])) continue;
          if (askClause(clauses[i])) return true;
          if (askClause(clauses[i + 1] || "")) return true;
        }
        return false;
      }
      function marketingWebinar(raw) {
        if (/הצטרפו/.test(raw) && /וו?בינר/.test(raw) && /הרשמה/.test(raw)) return true;
        if (/וו?בינר/.test(raw) && /חינמי/.test(raw)) return true;
        if (/\bwebinar\b/i.test(raw) && /\b(?:join our|register now|registration(?:\s+is)?\s+open|free)\b/i.test(raw)) return true;
        if (/הזמנה/.test(raw) && /הירשמו/.test(raw) && /(?:וירטואלית|השקה|לכל הלקוחות|מקומות מוגבלים)/.test(raw)) return true;
        return false;
      }
      function meetingPlanVeto(text) {
        const raw = String(text || "");
        if (/\b(?:please|kindly)\s+cancel\b/i.test(raw)) return false;
        if (/(?:^|[^\u0590-\u05FF])(?:בבקשה\s+)?(?:בטל|לבטל|תבטל)\s+את/.test(raw)) return false;
        const clauses = vetoClauses(raw);
        if (liveWithAsk(clauses)) return false;
        if (marketingWebinar(raw)) return true;
        if (AUTO_REPLY_TEXT.test(raw) || /(?:אני|אנחנו)\s+לא\s+במשרד/.test(raw)) return true;
        if (clauses.some(clausePast)) return true;
        if (clauses.some(clauseCancelled)) return true;
        return false;
      }
      const OPEN_GREET = /^(?:good\s+(?:morning|afternoon|evening)|greetings|hi|hey|hello|dear)\b|^(?:בוקר\s+טוב|ערב\s+טוב|שלום\s+רב|שלום|היי\s+לכולם|היי\s+לכולן|היי|הי)(?![\u0590-\u05FF])/i;
      const GROUP_ADDRESSEE = /^(?:all|team|everyone|everybody|there|folks|guys|y['’]all|colleagues|both|כולם|לכולם|לכולן|צוות|חברים|חבר['׳’]ה)$/i;
      function openingAddressee(text) {
        let raw = String(text || "").replace(/^\uFEFF/, "").replace(/^[\s\u00a0\u202f]+/, "");
        const greet = raw.match(OPEN_GREET);
        if (greet) raw = raw.slice(greet[0].length).replace(/^[\s,،:!]+/, "");
        const named = raw.match(/^([A-Za-z\u0590-\u05FF][A-Za-z\u0590-\u05FF'’-]{0,40}),/);
        if (!named || GROUP_ADDRESSEE.test(named[1])) return "";
        return named[1];
      }
      const BANK_CHANGE = /\b(?:changed banks|new account|new bank account|update (?:our |the )?(?:bank|account) details|(?:bank )?account below)\b|פרטי חשבון חדשים|החלפנו בנק/i;
      const PAY_MOVE = /\b(?:pay|wire|transfer)\b|(?:תשלום|העברה)|(?:^|[^\u0590-\u05FF])(?:שלם|תשלם|להעביר)(?![\u0590-\u05FF])/i;
      function bankChangePayment(text) {
        const raw = String(text || "");
        return BANK_CHANGE.test(raw) && PAY_MOVE.test(raw);
      }
      function phishingOrNegative(text) {
        const raw = String(text || "");
        if (bankChangePayment(raw)) return true;
        if (/\bignore previous instructions\b/i.test(raw) && PAY_MOVE.test(raw)) return true;
        if (/\bSYSTEM\s*:/i.test(raw) || /billing@evil\b/i.test(raw)) return true;
        if (/התעלם מההוראות/.test(raw)) return true;
        if (/\baccount\s+\d{2,}(?:-\d{2,})+\b/i.test(raw) && PAY_MOVE.test(raw)) return true;
        if (/חשבון(?:\s+\S+){0,4}\s+השתנה/.test(raw) && PAY_MOVE.test(raw)) return true;
        if (/לחשבון(?:\s+\S+){0,3}\s+החדש/.test(raw) && PAY_MOVE.test(raw)) return true;
        return false;
      }
      function replyDraftAllowed(text, ctx) {
        const c = ctx || {};
        if (addressedToSelf(c) && c.autoReply !== true) return true;
        if (c.autoReply === true || c.noteToSelf === true || c.senderIsUser === true) return false;
        if (c.inbound === false || c.direction === "outbound" || c.inSent === true) return false;
        const sender = String(c.senderEmail || "").toLowerCase();
        const own = addressList(c.ownAddresses || c.own);
        if (sender && own.indexOf(sender) !== -1) return false;
        if (autoReplyMail(text, sender)) return false;
        const to = addressList(c.to || c.toRecipients);
        const cc = addressList(c.cc || c.ccRecipients);
        if (!to.length && !cc.length) return false;
        const onTo = to.some((a) => own.indexOf(a) !== -1);
        const onCc = cc.some((a) => own.indexOf(a) !== -1);
        if (own.length && (to.length || cc.length) && !onTo && !(onCc && namedReplySentence(text, c))) return false;
        const who = openingAddressee(text);
        if (who && readerNameList(c).length && !nameIsReader(who, c)) return false;
        return true;
      }
      function replyAimedElsewhere(text, ctx) {
        const c = ctx || {};
        const to = addressList(c.to || c.toRecipients);
        const cc = addressList(c.cc || c.ccRecipients);
        const own = addressList(c.ownAddresses || c.own);
        if (!own.length || !to.length && !cc.length) return false;
        const onTo = to.some((a) => own.indexOf(a) !== -1);
        const onCc = cc.some((a) => own.indexOf(a) !== -1);
        if (!onTo && !(onCc && namedReplySentence(text, c))) return true;
        const who = openingAddressee(text);
        if (who && readerNameList(c).length && !nameIsReader(who, c)) return true;
        return false;
      }
      const NAME_SCRIPT = [
        ["sali", "\u05E1\u05D0\u05DC\u05D9"],
        ["noa", "\u05E0\u05D5\u05E2\u05D4"],
        ["dana", "\u05D3\u05E0\u05D4"],
        ["maya", "\u05DE\u05D0\u05D9\u05D4"],
        ["avi", "\u05D0\u05D1\u05D9"],
        ["michael", "\u05DE\u05D9\u05DB\u05D0\u05DC"],
        ["sarah", "\u05E9\u05E8\u05D4"],
        ["rachel", "\u05E8\u05D7\u05DC"],
        ["lior", "\u05DC\u05D9\u05D0\u05D5\u05E8"],
        ["tomer", "\u05EA\u05D5\u05DE\u05E8"],
        ["yael", "\u05D9\u05E2\u05DC"],
        ["david", "\u05D3\u05D5\u05D3"],
        ["yossi", "\u05D9\u05D5\u05E1\u05D9"],
        ["ron", "\u05E8\u05D5\u05DF"],
        ["tal", "\u05D8\u05DC"],
        ["shir", "\u05E9\u05D9\u05E8"],
        ["oren", "\u05D0\u05D5\u05E8\u05DF"],
        ["amit", "\u05E2\u05DE\u05D9\u05EA"],
        ["noam", "\u05E0\u05D5\u05E2\u05DD"],
        ["michal", "\u05DE\u05D9\u05DB\u05DC"]
      ];
      function scriptAliases(token) {
        const t = String(token || "").trim().toLowerCase();
        if (!t) return [];
        const out = [];
        for (let i = 0; i < NAME_SCRIPT.length; i++) {
          const pair = NAME_SCRIPT[i];
          if (pair[0] === t) out.push(pair[1]);
          else if (pair[1] === t) out.push(pair[0]);
        }
        return out;
      }
      function readerNameList(ctx) {
        const c = ctx || {};
        const names = [];
        function add(raw) {
          const s = String(raw || "").trim().toLowerCase();
          if (!s) return;
          if (names.indexOf(s) === -1) names.push(s);
          scriptAliases(s).forEach((alias) => {
            if (names.indexOf(alias) === -1) names.push(alias);
          });
          const first = s.split(/\s+/)[0];
          if (first && first !== s) {
            if (names.indexOf(first) === -1) names.push(first);
            scriptAliases(first).forEach((alias) => {
              if (names.indexOf(alias) === -1) names.push(alias);
            });
          }
        }
        add(c.userName);
        if (Array.isArray(c.ownNames)) c.ownNames.forEach(add);
        return names;
      }
      function nameIsReader(token, ctx) {
        const named = String(token || "").trim().toLowerCase();
        if (!named) return false;
        if (readerNameList(ctx).indexOf(named) !== -1) return true;
        const list = readerNameList(ctx);
        for (let a = 0; a < scriptAliases(named).length; a++) {
          if (list.indexOf(scriptAliases(named)[a]) !== -1) return true;
        }
        if (typeof FlowNameMatch !== "undefined" && FlowNameMatch.equivalent) {
          for (let r = 0; r < list.length; r++) {
            if (FlowNameMatch.equivalent(named, list[r])) return true;
          }
        }
        const c = ctx || {};
        if (!c.readerEmail && c.namesWaitDone !== true) return false;
        const own = addressList(c.ownAddresses || c.own || []);
        const readerEmail = String(c.readerEmail || "").trim().toLowerCase();
        if (readerEmail && own.indexOf(readerEmail) === -1) own.push(readerEmail);
        for (let i = 0; i < own.length; i++) {
          const local = (String(own[i] || "").split("@")[0] || "").toLowerCase();
          if (!local || named.length < 3) continue;
          if (local === named || local.startsWith(named)) return true;
          const parts = local.split(/[._-]+/);
          for (let p = 0; p < parts.length; p++) {
            const part = parts[p];
            if (!part || part.length < 3) continue;
            if (part === named || part.startsWith(named)) return true;
          }
          for (let n = 0; n < NAME_SCRIPT.length; n++) {
            const latin = NAME_SCRIPT[n][0];
            const heb = NAME_SCRIPT[n][1];
            if (latin.length < 3 || !local.startsWith(latin)) continue;
            if (named === latin || named === heb) return true;
          }
        }
        return false;
      }
      function readerNamesFrom(src) {
        const s = src || {};
        const out = [];
        function add(raw) {
          const name = String(raw || "").trim();
          if (!name || name.toLowerCase() === "me") return;
          if (out.some((n) => n.toLowerCase() === name.toLowerCase())) return;
          out.push(name);
        }
        add(s.displayName);
        add(s.userName);
        const profile = s.profile && typeof s.profile === "object" ? s.profile : {};
        add(profile.displayName);
        add(profile.name);
        const given = String(profile.givenName || profile.given_name || "").trim();
        const surname = String(profile.surname || profile.familyName || profile.family_name || "").trim();
        add(given);
        add(surname);
        if (given && surname) add(given + " " + surname);
        const known = [].concat(s.knownNames || [], s.ownNames || [], s.glanceOwnNames || []);
        known.forEach(add);
        return out;
      }
      const NOT_A_VOCABLE = /^(?:thanks|thank|regards|best|cheers|sincerely|yours|hi|hey|hello|dear|greetings|greeting|morning|afternoon|evening|all|team|everyone|everybody|folks|guys|colleagues|both|also|separately|actually|however|first|second|third|finally|meanwhile|otherwise|anyway|anyways|wait|sorry|yes|no|sure|please|to|cc|bcc|from|subject|body|reminder|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|שלום|היי|הי|תודה|תודות|בברכה|בתודה|נעים|בעצם|אגב|כמובן|סליחה|נכון|לכן|בנוסף|יום|ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)$/i;
      const DISCOURSE_OPEN = /^(?:also|separately|actually|however|first|second|third|finally|meanwhile|otherwise|anyway|anyways|בעצם|אגב|לכן|בנוסף)(?:\b|(?=\s*[,:،]))\s*[,:،]+\s*/i;
      const LABEL_OPEN = /^(?:agreed|approved|reminder|update|urgent|fyi|quote|re|fw|fwd|note|subject|דחוף|תזכורת|עדכון|אושר|השב|הועבר)$/i;
      function personToken(token) {
        if (!token || LABEL_OPEN.test(token) || NOT_A_VOCABLE.test(token) || GROUP_ADDRESSEE.test(token)) return false;
        if (/^[A-Z][A-Za-z'’-]{1,40}$/.test(token)) return /[a-z]/.test(token);
        if (/^[\u0590-\u05FF][\u0590-\u05FF'’-]{1,40}$/.test(token)) return true;
        return false;
      }
      function restIsAsk(rest) {
        const r = String(rest || "");
        if (/\?/.test(r)) return true;
        if (/\b(?:could|can|would|will|please|kindly|pls)\b/i.test(r)) return true;
        if (/\b(?:review|send|pay|forward|confirm|schedule)\b/i.test(r)) return true;
        if (/(?:אפשר|נא|בבקשה|תוכל|תוכלי|לשלוח|שלח|תשלח|לבדוק)/.test(r)) return true;
        return false;
      }
      function vocativeAt(chunk, askText) {
        let raw = String(chunk || "").replace(/^\uFEFF/, "").replace(/^[\s\u00a0\u202f]+/, "");
        const askFrom = askText == null ? chunk : askText;
        const greet = raw.match(OPEN_GREET);
        if (greet) raw = raw.slice(greet[0].length).replace(/^[\s,،:!]+/, "");
        let guard = 0;
        while (guard++ < 3) {
          const discourse = raw.match(DISCOURSE_OPEN);
          if (!discourse) break;
          raw = raw.slice(discourse[0].length);
        }
        let hops = 0;
        while (hops++ < 3) {
          const head = raw.match(/^([A-Za-z\u0590-\u05FF][A-Za-z\u0590-\u05FF'’-]{0,40})/);
          if (!head) return "";
          const name = head[1];
          const after = raw.slice(name.length);
          if (GROUP_ADDRESSEE.test(name) && /^\s*(?:(?:,|،)|(?:\u2014|\u2013|-))/.test(after)) {
            raw = after.replace(/^\s*(?:(?:,|،)|(?:\u2014|\u2013|-))\s*/, "");
            continue;
          }
          if (/^\s*:/.test(after)) {
            if (!personToken(name) || !restIsAsk(after)) return "";
            return name;
          }
          if (/^\s*(?:\u2014|\u2013|-)/.test(after)) {
            if (!personToken(name)) return "";
            const rest = after.replace(/^\s*(?:\u2014|\u2013|-)\s*/, "");
            if (!restIsAsk(rest)) return "";
            return name;
          }
          if (/^\s*(?:,|،)/.test(after)) {
            if (!personToken(name)) return "";
            return name;
          }
          if (/^\s+שלום\s*(?:,|،)/.test(after) && personToken(name) && restIsAsk(askFrom)) return name;
          return "";
        }
        return "";
      }
      function thirdPartyQuote(text) {
        const raw = String(text || "").replace(/^\uFEFF/, "").replace(/^[\s\u00a0\u202f]+/, "");
        return /^quote\s*:/i.test(raw) && /["“”«»]/.test(raw);
      }
      function greetedPerson(text) {
        const chunks = String(text || "").split(/\n+|(?<=[.!?])\s+/);
        for (let i = 0; i < chunks.length; i++) {
          const who = vocativeAt(chunks[i], text);
          if (who && personToken(who)) return true;
        }
        const inline = /[:：]\s*([A-Za-z\u0590-\u05FF][A-Za-z\u0590-\u05FF'’-]{1,40})\s*[,،]\s*([^\n]{0,180})/g;
        const raw = String(text || "");
        let m;
        while (m = inline.exec(raw)) {
          if (personToken(m[1]) && restIsAsk(m[2])) return true;
        }
        return false;
      }
      function greetingAwaitingNames(text, ctx) {
        const c = ctx || {};
        if (c.namesWaitDone === true) return false;
        const unresolved = c.namesPending === true || !readerNameList(c).length;
        if (!unresolved) return false;
        return greetedPerson(text);
      }
      function greetingUnconfirmed(text, ctx) {
        const c = ctx || {};
        if (c.namesWaitDone !== true || !greetedPerson(text)) return false;
        const chunks = String(text || "").split(/\n+|(?<=[.!?])\s+/);
        let greeted = "";
        for (let i = 0; i < chunks.length; i++) {
          const who = vocativeAt(chunks[i], text);
          if (!who) continue;
          if (!greeted) greeted = who;
          if (nameIsReader(who, c)) return false;
        }
        const readerEmail = String(c.readerEmail || "").trim().toLowerCase();
        const toOnly = addressList(c.to || []);
        if (greeted && readerEmail && toOnly.length === 1 && toOnly[0] === readerEmail) {
          const others = [];
          const pushRecip = (entry) => {
            if (!entry) return;
            if (typeof entry === "string") {
              const e2 = entry.trim().toLowerCase();
              if (e2 && e2 !== readerEmail) others.push({ email: e2, localPart: e2.split("@")[0] || "" });
              return;
            }
            const e = String(entry.email || "").trim().toLowerCase();
            if (!e || e === readerEmail) return;
            others.push({ email: e, name: entry.name || "", localPart: entry.localPart || (e.split("@")[0] || "") });
          };
          (c.toRecipients || c.to || []).forEach(pushRecip);
          (c.ccRecipients || c.cc || []).forEach(pushRecip);
          if (typeof FlowNameMatch !== "undefined" && FlowNameMatch.matchesRecipient && FlowNameMatch.matchesRecipient(greeted, others)) return true;
          return false;
        }
        return true;
      }
      function buriedReaderRememberAsk(text) {
        const raw = String(text || "");
        if (/\bplease remember to\b/i.test(raw) && !/\bplease remember to\s+(?:remind|tell|ask|notify|ping|nudge|check with)\b/i.test(raw)) return true;
        if (/(?:^|[^\u0590-\u05FF])(?:תזכיר(?:י|ו)?\s+לי|תזכור(?:י|ו)?\s+ל(?!הזכיר|זכיר|שאול|הודיע|עדכן|תזכר)|אל\s+תשכח(?:י|ו)?\s+ל)/.test(raw)) {
          if (/(?:תזכור|תזכיר|אל\s+תשכח)\s+(?:ל)?(?:הזכיר|להזכיר|לשאול|להודיע|לעדכן|לתזכר)\s+/i.test(raw)) return false;
          return true;
        }
        return false;
      }
      function vocativeIsOther(text, ctx) {
        const names = readerNameList(ctx);
        if (!names.length) return false;
        const chunks = String(text || "").split(/\n+|(?<=[.!?])\s+/);
        for (let i = 0; i < chunks.length; i++) {
          const who = vocativeAt(chunks[i], text);
          if (!who) continue;
          if (nameIsReader(who, ctx)) continue;
          return true;
        }
        const inline = /[:：]\s*([A-Za-z\u0590-\u05FF][A-Za-z\u0590-\u05FF'’-]{1,40})\s*[,،]\s*([^\n]{0,180})/g;
        const raw = String(text || "");
        let m;
        while (m = inline.exec(raw)) {
          const name = m[1];
          if (!personToken(name) || !restIsAsk(m[2])) continue;
          if (nameIsReader(name, ctx)) continue;
          return true;
        }
        if (otherCommaName(text, ctx)) return true;
        return false;
      }
      const NOT_COMMA_NAME = /^(?:please|kindly|thanks|thank|regards|best|cheers|hi|hey|hello|dear|greetings|greeting|good|morning|afternoon|evening|following|quick|also|separately|and|but|so|yes|no|ok|okay|re|fw|fwd|sent|from|subject|monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today|fiday|eod|asap|בבקשה|נא|אנא|אפשר|תוכל|תוכלי|תוכלו|תשלח|תשלחי|שלום|היי|הי|תודה|בברכה|בתודה|בהמשך|צהריים|בוקר|ערב|רבה|שבוע|נשלח|יום|המשך|טובים|טוב|רב|שיחתנו|לשיחתנו|נעים|המשך|שגוי|שגויה|נכון|נכונה|חשוב|דחוף|מצורף)$/i;
      function restStartsAsk(rest) {
        const r = String(rest || "");
        if (/^(?:can|could|would|will|please|kindly)\b/i.test(r)) return true;
        if (/^(?:תוכל|תוכלי|תוכלו|תשלח|תשלחי|נא|בבקשה|אפשר)/.test(r)) return true;
        return false;
      }
      function otherCommaName(text, ctx) {
        const raw = String(text || "");
        const re = /([A-Z][a-zA-Z'’-]{1,40}|[\u0590-\u05FF]{2,20})\s*[,،]/g;
        let m;
        let sawReader = false;
        let sawOther = false;
        while (m = re.exec(raw)) {
          const name = m[1];
          const before = raw.slice(0, m.index);
          if (/\b(?:by|on|before|until|till|due)\s+$/i.test(before)) continue;
          if (READER_COMMIT_HE.test(before + name) || READER_COMMIT.test(before + " " + name)) continue;
          const rest = raw.slice(m.index + m[0].length).replace(/^[\s\u00a0\u200f]+/, "");
          if (/^[\u0590-\u05FF]/.test(name) && /^[הבלמוכ]/.test(name)) continue;
          if (!personToken(name) || NOT_COMMA_NAME.test(name) || !restStartsAsk(rest)) continue;
          if (nameIsReader(name, ctx)) sawReader = true;
          else sawOther = true;
        }
        return sawOther && !sawReader;
      }
      function ccOnlyWithoutGreeting(text, ctx) {
        const c = ctx || {};
        const to = addressList(c.to || c.toRecipients);
        const cc = addressList(c.cc || c.ccRecipients);
        const own = addressList(c.ownAddresses || c.own);
        if (!own.length || !cc.length) return false;
        const onTo = to.some((a) => own.indexOf(a) !== -1);
        const onCc = cc.some((a) => own.indexOf(a) !== -1);
        if (onTo || !onCc) return false;
        const names = readerNameList(c);
        if (!names.length) return true;
        const chunks = String(text || "").split(/\n+|(?<=[.!?])\s+/);
        for (let i = 0; i < chunks.length; i++) {
          const who = vocativeAt(chunks[i], text);
          if (who && nameIsReader(who, c)) return false;
        }
        const inline = /[:：]\s*([A-Za-z\u0590-\u05FF][A-Za-z\u0590-\u05FF'’-]{1,40})\s*[,،]\s*([^\n]{0,180})/g;
        let m;
        const raw = String(text || "");
        while (m = inline.exec(raw)) {
          if (!personToken(m[1]) || !restIsAsk(m[2])) continue;
          if (nameIsReader(m[1], c)) return false;
        }
        return true;
      }
      function sentByReader(ctx) {
        const c = ctx || {};
        if (c.noteToSelf === true || c.senderIsUser === true || c.inSent === true) return true;
        if (c.direction === "outbound" || c.direction === "self") return true;
        if (c.inbound === false) return true;
        const sender = String(c.senderEmail || "").trim().toLowerCase();
        const own = addressList(c.ownAddresses || c.own);
        return Boolean(sender && own.length && own.indexOf(sender) !== -1);
      }
      function addressedToSelf(ctx) {
        const c = ctx || {};
        if (c.forwarded === true) return false;
        const from = String(c.senderEmail || "").trim().toLowerCase();
        const behalf = String(c.onBehalfOf || c.graphSender || "").trim().toLowerCase();
        if (behalf && behalf.indexOf("@") >= 0 && behalf !== from) return false;
        const own = addressList(c.ownAddresses || c.own);
        if (!from || !own.length || own.indexOf(from) < 0) return false;
        const to = addressList(c.to || c.toRecipients);
        if (!to.length) return false;
        const cc = addressList(c.cc || c.ccRecipients);
        for (let i = 0; i < to.length; i++) if (own.indexOf(to[i]) < 0) return false;
        for (let i = 0; i < cc.length; i++) if (own.indexOf(cc[i]) < 0) return false;
        return true;
      }
      function mailIsOwn(ctx) {
        const c = ctx || {};
        if (addressedToSelf(c)) return false;
        if (c.noteToSelf === true || c.senderIsUser === true || c.inSent === true) return true;
        if (c.direction === "outbound" || c.direction === "self") return true;
        if (c.inbound === false) return true;
        const sender = String(c.senderEmail || "").toLowerCase();
        const own = addressList(c.ownAddresses || c.own);
        return Boolean(sender && own.length && own.indexOf(sender) !== -1);
      }
      function readerDecisionAsk(text) {
        const raw = String(text || "");
        if (/\b(?:can|could|would|will) you\s+(?:please\s+)?(?:agree|accept)\b/i.test(raw)) return true;
        if (/\b(?:please|kindly|do you)\s+(?:agree|accept)\b/i.test(raw)) return true;
        if (/\bconfirm\b/i.test(raw) && /\bwhether\b/i.test(raw) && !/\bconfirm\s+by\b/i.test(raw)) return true;
        if (/\b(?:please|kindly)\s+confirm\b/i.test(raw) && /\bagree[ds]?\b/i.test(raw)) return true;
        if (/(?:^|\s)האם\s/.test(raw) && /מסכימ/.test(raw)) return true;
        if (/(?:^|\s)אתה\s+מסכים/.test(raw) || /(?:^|\s)אתם\s+מסכימים/.test(raw)) return true;
        if (/(?<!לא\s)נדרשת פעולה/.test(raw)) return false;
        const sentences = raw.split(/[.!?\n]+/);
        for (let i = 0; i < sentences.length; i++) {
          const sent = sentences[i];
          if (!HE_CONFIRM_ASK.test(sent)) continue;
          if (REQUESTED_LOGISTICS_HE.test(sent) && !HE_DECISION_OBJECT.test(sent)) continue;
          return true;
        }
        return false;
      }
      const HE_CONFIRM_ASK = /בבקשה\s+תאשר|(?:^|\s)נא\s+לאשר(?![\u0590-\u05FF])|תוכל(?:י|ו)?\s+לאשר(?![\u0590-\u05FF])|אנא\s+(?:לאשר(?![\u0590-\u05FF])|תאשר|אשר(?:י|ו)?(?![\u0590-\u05FF]))/;
      const HE_DECISION_OBJECT = /הצעה|חוזה|הסכם|תנאי|מחיר|תקציב/;
      const CONTINGENT = /\b(?:hoping|once)\b|(?:^|\s)(?:מקווה|מקווים)/i;
      const ALREADY_SETTLED = /\b(?:already paid|we paid|was paid|(?:the )?file is closed|back in [A-Za-z]+ \d{4})\b|כבר\s+שול(?:מה|מו|ם|מ)|שול(?:מה|מו|ם)\s+אתמול|שילמתי/i;
      function amountIsAmbiguous(text) {
        const raw = String(text || "");
        if (/\b(?:about|around|approx(?:imately)?|roughly|circa)\b/i.test(raw)) return true;
        if (/(?:בערך|בסביבות)/.test(raw)) return true;
        const figs = raw.match(/(?:\$|€|£|₪)\s?\d[\d,]*(?:\.\d+)?|\d[\d,]*(?:\.\d+)?\s?(?:שקל(?:ים)?|ש(?:״|")?ח|USD|ILS|NIS)/gi) || [];
        const vals = [];
        for (const fig of figs) {
          const n = parseFloat(String(fig).replace(/[^\d.]/g, ""));
          if (!Number.isNaN(n) && vals.indexOf(n) === -1) vals.push(n);
        }
        return vals.length >= 2 && (/\b(?:or|between)\b/i.test(raw) || /(?:^|\s)או(?:\s|$)/.test(raw));
      }
      const COMMIT_SENTENCE = /\b(?:agree[ds]?|approved|confirm(?:ed|ing)?)\b|(?:סוכם|אישרנו|מאשרים|מאשר|מאושר)/i;
      function commitmentIsContingent(text) {
        if (!CONTINGENT.test(text)) return false;
        let saw = false;
        let plain = false;
        for (const s of String(text || "").split(/(?<=[.!?;])\s+|\n+/)) {
          const hits = COMMIT_SENTENCE.test(s) || FlowJudgment.SENDER_PROMISE.test(s) || FlowJudgment.SENDER_PROMISE_HE.test(s);
          if (!hits) continue;
          saw = true;
          if (!CONTINGENT.test(s)) plain = true;
        }
        return saw && !plain;
      }
      function classify(text, ctx) {
        ctx = ctx || {};
        text = FlowJudgment.newContent(text);
        if (typeof FlowCloseFamilies !== "undefined" && FlowCloseFamilies.stripQuotedAsks) {
          text = FlowCloseFamilies.stripQuotedAsks(text);
        }
        const domain = FLOW_DOMAINS[0];
        const facts = FlowExtract.extract(text, { senderEmail: ctx.senderEmail, now: ctx.now });
        if (typeof FlowCloseFamilies !== "undefined" && FlowCloseFamilies.readSlot) {
          const slot = FlowCloseFamilies.readSlot(text, ctx.now);
          if (slot && slot.time && !facts.time) facts.time = slot.time;
          if (slot && slot.date && slot.date.iso && !(facts.date && (facts.date.iso || facts.date.contradictsWeekday || facts.date.invalidDate))) {
            facts.date = slot.date;
          }
        }
        const s = FlowJudgment.score(text, domain, facts);
        if (facts.date && (facts.date.contradictsWeekday || facts.date.invalidDate) && s.flags.handoff) {
          facts.date = { raw: facts.date.raw || null, iso: null, dropped: true };
        }
        const threshold = FlowJudgment.thresholdFrom(ctx.calibration, ctx.now);
        const enrichedFacts = Object.assign({}, facts, {
          lost: s.flags.lost,
          executed: s.flags.executed,
          dispute: s.flags.dispute,
          dateText: facts.date && facts.date.iso ? humanDateFallback(facts.date) : null
        });
        const who = ctx.senderName || ctx.senderEmail || null;
        const amount = facts.moneyText || null;
        const MEETING_SOFT = /\b(?:might|maybe|perhaps|possibly|tentatively)\b|(?:^|\s)(?:אולי|ייתכן|נראה לי)/i;
        const DEADLINE_BEFORE_MEETING_EN = /\b(?:before|by|ahead of|prior to|in time for|until)\s+(?:(?:the|our|your|a|an|this|next|tomorrow['’]?s|today['’]?s|tonight['’]?s)\s+)*(?:[\w']+\s+){0,4}$/i;
        const DEADLINE_BEFORE_MEETING_HE = /(?:לפני|עד)\s+ה?\s*$/;
        function deadlineBeforeMeeting(before) {
          return DEADLINE_BEFORE_MEETING_EN.test(before) || DEADLINE_BEFORE_MEETING_HE.test(before);
        }
        function meetingAsserted(pattern) {
          const sentences = String(text || "").split(/(?<=[.!?;])\s+|\n+/);
          for (const s2 of sentences) {
            const hit = s2.match(pattern);
            if (!hit) continue;
            let index = hit.index;
            if (index > 0 && s2.charAt(index - 1) === "\u05D4" && (index === 1 || /\s/.test(s2.charAt(index - 2)))) index -= 1;
            if (FlowJudgment.isNegatedBefore(s2.slice(0, index))) continue;
            if (MEETING_SOFT.test(s2)) continue;
            if (deadlineBeforeMeeting(s2.slice(0, index))) continue;
            const noun = String(hit[1] || hit[0] || "");
            if (/^call$/i.test(noun) && /\bfollowing up on (?:our|the|that) call\b/i.test(s2) && !/\b(?:tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}:\d{2}|next\s+\w+)\b/i.test(s2)) continue;
            return true;
          }
          return false;
        }
        const hasMeetingNoun = meetingAsserted(MEETING_NOUN) || meetingAsserted(MEETING_NOUN_HE);
        const hasResolvedDate = Boolean(facts.date && facts.date.iso);
        const hasConcreteAnchor = Boolean(facts.money) || hasResolvedDate;
        const isReaderCommit = READER_COMMIT.test(text) || READER_COMMIT_HE.test(text);
        const commitmentWhat = isReaderCommit ? whatText(text, [READER_COMMIT, READER_COMMIT_HE]) : null;
        const hasConcreteCommitmentObject = Boolean(commitmentWhat) && (REQUESTED_OBJECT.test(commitmentWhat) || REQUESTED_OBJECT_HE.test(commitmentWhat));
        const requestWhat = s.flags.handoff ? whatText(text, REQUEST_PATTERNS) : null;
        const hasConcreteRequestObject = Boolean(requestWhat) && requestObjectTest(requestWhat);
        const requestedObjectMatch = requestWhat && requestObjectExec(requestWhat);
        const requestedObjectTerm = requestedObjectMatch ? requestedObjectMatch[1] : null;
        const signals = {
          hasMeetingNoun,
          hasConcreteAnchor,
          hasConcreteRequestObject,
          hasConcreteCommitmentObject,
          isReaderCommit,
          handoff: s.flags.handoff,
          slotAsk: Boolean(s.flags.slotAsk),
          hasDate: Boolean(facts.date && facts.date.iso),
          hasTime: Boolean(facts.time),
          hasMoney: Boolean(facts.money),
          score: s.total,
          threshold,
          meetingVeto: meetingPlanVeto((ctx && ctx.subject ? String(ctx.subject) + "\n" : "") + String(text || ""))
        };
        const familyBox = { hit: null };
        function familyAgrees(type, fam) {
          if (!fam || fam.suppress) return false;
          if (fam.family === "A" || fam.family === "C" || fam.family === "F" || fam.family === "I" || fam.family === "J") return type === TYPES.REQUEST;
          if (fam.family === "B") return type === TYPES.REQUEST || type === TYPES.SCHEDULED_EVENT || type === TYPES.DECISION_TO_LOG;
          if (fam.family === "D" || fam.family === "G") return type === TYPES.SCHEDULED_EVENT || type === TYPES.DECISION_TO_LOG;
          if (fam.family === "E") return type === TYPES.DECISION_TO_LOG || type === TYPES.REQUEST;
          return false;
        }
        function finish(type, confidence, entities, personalClose, googleClose) {
          if (addressedToSelf(ctx)) {
            const blob = (ctx && ctx.subject ? String(ctx.subject) + "\n" : "") + String(text || "");
            const held = selfContentStaysQuiet(blob);
            if (held) return stayQuiet(held === "phishing" ? "family" : "hedge");
          }
          const famDate = entities && entities.dateIso;
          const factIso = facts.date && facts.date.iso;
          if (isPast && (!famDate || famDate === factIso)) {
            entities = Object.assign({}, entities, { when: null, dateIso: null });
          }
          const intent = {
            type,
            confidence,
            entities: Object.assign({ requestWhat, requestedObjectTerm }, entities),
            label: labelFor(type),
            signals,
            facts
          };
          if (personalClose) intent.personalClose = personalClose;
          if (googleClose) intent.googleClose = googleClose;
          if (replyCancelOnly(text)) intent.noReplyDraft = true;
          if (addressedToSelf(ctx)) {
            intent.noReplyDraft = true;
            intent.selfTask = true;
            delete intent.googleClose;
          }
          if (/\bplease\s+create\s+a\s+task\b/i.test(text)) intent.noReplyDraft = true;
          if (/\bplease remember to\b/i.test(text) || /(?:^|[^\u0590-\u05FF])(?:תזכיר(?:י|ו)?\s+לי|תזכור(?:י|ו)?\s+ל(?!הזכיר|זכיר|שאול|הודיע|עדכן|תזכר)|אל\s+תשכח(?:י|ו)?\s+ל)/.test(text)) intent.noReplyDraft = true;
          const fam = familyBox.hit;
          const selfFileChain = Boolean(intent.selfTask && fam && fam.family === "A");
          if (familyAgrees(type, fam) && !selfFileChain) {
            intent.closeFamily = fam.family;
            if (fam.fileTarget) intent.fileTarget = fam.fileTarget;
            if (fam.createWhenMissing) intent.createWhenMissing = true;
            if (fam.what) {
              const current = intent.entities.what || "";
              const famAt = text.indexOf(fam.what);
              const curAt = current ? text.indexOf(current) : -1;
              if (famAt > curAt) {
                intent.entities.what = fam.what;
                if (fam.requestWhat) intent.entities.requestWhat = fam.requestWhat;
                if (fam.objectTerm) intent.entities.requestedObjectTerm = fam.objectTerm;
              }
            }
          }
          const invitePlan = addressedToSelf(ctx) ? null : attachToInvitePlan(text);
          if (invitePlan && type === TYPES.REQUEST) {
            intent.inviteFile = true;
            intent.label = invitePlan.label;
            intent.inviteDraft = invitePlan.draft;
          }
          if (intent.noReplyDraft && !intent.inviteFile) {
            const what = String(intent.entities && intent.entities.what || "").replace(/\s+/g, " ").trim();
            const iso = intent.entities && intent.entities.dateIso;
            const dateText = iso ? humanDateFallback({ iso }) : "";
            if (what) intent.label = what + (dateText ? " by " + dateText : "");
          }
          if (intent.selfTask && !intent.inviteFile) {
            intent.noReplyDraft = true;
            if (selfCallCancelled(text) || meetingPlanVeto(text)) return stayQuiet("hedge", { noRescue: true });
            if (type === TYPES.SCHEDULED_EVENT) intent.type = TYPES.REQUEST;
            const subject = ctx && ctx.subject;
            const pay = payAsk(prepareAsk(text));
            if (type === TYPES.DECISION_TO_LOG && facts && facts.moneyText && !pay) {
              const iso = intent.entities && intent.entities.dateIso;
              const dateText = iso ? humanDateFallback({ iso }) : "";
              intent.label = FlowJudgment.neutralTitle({ moneyText: facts.moneyText, dateText: dateText || null });
            } else {
              const decided = selfDecisionTitle(text, facts);
              let titled = decided || selfAskTitle(text, subject, ctx);
              if (!decided && !usableSelfTitle(titled)) titled = selfRecoverTitle(text, subject, ctx);
              const callTitled = haveACallTitle(text, ctx, humanWhen(facts && facts.date, facts && facts.time));
              if (usableSelfTitle(callTitled)) titled = callTitled;
              if (!decided && !usableSelfTitle(titled)) return stayQuiet("hedge", { noRescue: true });
              intent.label = titled;
            }
            const labelNow = String(intent.label || "").trim();
            if (!/^(?:Decision|החלטה): \S/.test(labelNow) && !usableSelfTitle(labelNow)) return stayQuiet("hedge", { noRescue: true });
            if (intent.confidence === "low") intent.confidence = "high";
            if (/\bremind me to\b/i.test(text) && facts && facts.date && facts.date.iso && intent.entities && !intent.entities.dateIso) {
              intent.entities.dateIso = facts.date.iso;
            }
          }
          if (personalClose === "calendar-hold") {
            const held = familyBox.hit;
            const fileHold = Boolean(held && held.fileTarget);
            const familyMeet = Boolean(held && held.family === "D" && held.type === "event" && held.personalClose === "calendar-hold");
            if (!fileHold && (familyMeet || EXPLICIT_MEETING_ASK.test(text) || EXPLICIT_MEETING_ASK_HE.test(text))) {
              intent.explicitHold = true;
            }
          }
          return gateCreateWhenMissing(intent);
        }
        function gateCreateWhenMissing(intent) {
          if (!intent || !Array.isArray(ctx.missingSlots)) return intent;
          if (typeof FlowCloseFamilies === "undefined" || !FlowCloseFamilies.route) return intent;
          return FlowCloseFamilies.route(intent, ctx.missingSlots);
        }
        function suppressed(type) {
          return FlowJudgment.isTypeSuppressed(ctx.calibrationByType && ctx.calibrationByType[type], ctx.now);
        }
        const calledOff = (s.flags.lost || EVENT_CALLED_OFF.test(text) || EVENT_CALLED_OFF_HE.test(text)) && !liveWithAsk(vetoClauses(text));
        const isRecap = EVENT_RECAP.test(text) || EVENT_RECAP_HE.test(text);
        const isPast = isPastDate(facts.date && facts.date.iso, ctx.now);
        const bankCallReminder = /\breminder\b[\s\S]{0,80}\bcall the bank\b/i.test(text) && /\bnext\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(text);
        const infoOrNoise = infoOnlyMail(text, ctx) || EXTRA_NOISE.test(text) && !bankCallReminder;
        const blocked = s.flags.noise || infoOrNoise;
        function sentenceIsSoft(sentence) {
          return SOFT_ASK.test(sentence) || SOFT_ASK_HE.test(sentence);
        }
        let askIsSoft = Boolean(requestWhat) && sentenceIsSoft(requestWhat);
        if (askIsSoft) {
          const parts = String(text || "").split(/(?<=[.!?])\s+|\n+/);
          for (let i = 0; i < parts.length; i++) {
            const sentence = parts[i].trim();
            if (sentence.length <= 12 || sentence.length >= 320) continue;
            let handoff = false;
            for (let p = 0; p < REQUEST_PATTERNS.length; p++) {
              const pattern = REQUEST_PATTERNS[p];
              if (new RegExp(pattern.source, pattern.flags).test(sentence)) {
                handoff = true;
                break;
              }
            }
            if (handoff && !sentenceIsSoft(sentence)) {
              askIsSoft = false;
              break;
            }
          }
        }
        let quietHint = blocked ? "noise" : askIsSoft ? "hedge" : null;
        function selfContentStaysQuiet(raw) {
          const blob = String(raw || "");
          const main = withoutIfClause(blob);
          if (/\blmk\b/i.test(blob) && /\bif the\b/i.test(blob) && /\bworks\b/i.test(blob)) return "";
          if (selfPastDone(blob)) return "past";
          if (phishingOrNegative(blob)) return "phishing";
          if (marketingWebinar(blob)) return "marketing";
          if (/\bexclusive offer\b/i.test(blob)) return "marketing";
          if (/\bsign up\b/i.test(blob) && /\b(?:save|sae)\b/i.test(blob)) return "marketing";
          if (/\bsign up\b/i.test(blob) && /\$\s?\d/.test(blob)) return "marketing";
          if (/\b(?:save|sae)\s+\$[\d,]/i.test(blob) && /\bplan\b/i.test(blob)) return "marketing";
          if (/\b(?:unsubscribe|shop now|book your demo|last chance|email preferences)\b/i.test(blob)) return "marketing";
          if (/\b\d+\s*%\s*off\b/i.test(blob)) return "marketing";
          if (/\bupgrade\b/i.test(blob) && /\bfree\b/i.test(blob)) return "marketing";
          if (/להסרה|ניוזלטר|מבצע|שדרגו|הירשמו|הנחה|סייל|חודשיים חינם|חודש חינם|מקומות אחרונים|רשימת התפוצה|הטבה בלעדית|מנוי שנתי|רק השבוע/.test(blob)) return "marketing";
          if (AUTO_REPLY_TEXT.test(blob)) return "ooo";
          if (/מענה אוטומטי|בחפשה|בחופשת לידה|אחזור אליך בהקדם|תודה על פנייתך/.test(blob)) return "ooo";
          if (/\bno reply (?:needed|necessary|required)\b/i.test(blob) || /\bfor your records\b/i.test(blob)) return "fyi";
          if (/\bfor reference only\b/i.test(blob) || /\bfor your awareness\b/i.test(blob)) return "fyi";
          if (/לא נדרש|לעיונך|רק עדכון|עדכון קצר|לתיעוד בלבד/.test(blob)) return "fyi";
          if (/\b(?:quick update|fyi|for your information|just an update|heads[- ]up)\b/i.test(blob) || /רק לעדכן|לידיעתך|לידיעה/.test(blob)) {
            if (!/\b(?:please|could you|can you)\b/i.test(blob) && !/(?:בבקשה|תוכל)/.test(blob)) return "fyi";
          }
          if (selfAckNote(blob)) return "ack";
          if (/\bforwarding for visibility\b/i.test(blob) || /-----Original Message-----/i.test(blob) || /Begin forwarded message/i.test(blob)) return "quoted_forward";
          if (vocativeIsOther(blob, ctx)) return "third_party";
          if (/\b(?:maybe|perhaps|possibly|if you get a chance|if you have time|if it(?:'|’)s not too much trouble|at some point|eventually|when convenient|whenever you|i might|hoping to|might be worth|tentatively|we might need|i(?:'|’)ll let you know)\b/i.test(main)) return "hedge";
          if (/(?:^|\s)אולי|אם יוצא|מתישהו|אם יש לך זמן|כשיהיה לך|מתי שנוח|נראה לי|יכול להיות ש/.test(main)) return "hedge";
          if (/,\s*מקווה|מקווה\s*[.!]?\s*$/.test(main)) return "hedge";
          const negBlob = withoutIfClause(blob.replace(/\bdon'?t\s+forget\b/ig, " ").replace(/\bno\s+ne+d\s+to\s+reply\b/ig, " "));
          if (/\b(?:do not|don'?t|no need to|never mind|won'?t|will not)\b/i.test(negBlob) || /(?:^|[^\u0590-\u05FF])אל\s*ת/.test(negBlob) || /לא\s+צריך|אין\s+צורך|אין\s+צר[וו]?ך/.test(negBlob) || /לא\s+(?:נקיים|תהיה|נעשה)/.test(negBlob) || /(?:^|[^\u0590-\u05FF])בוטל(?:ה)?(?:[^\u0590-\u05FF]|$)/.test(negBlob)) return "negative";
          if (/\blast\s+(?:week|night|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(blob) || /\bfollowing (?:our|the|that) call last\b/i.test(blob)) return "past";
          if (/\byesterday\b/i.test(blob) && /\b(?:meeting|met|chat|chatting|speaking|spoke|call)\b/i.test(blob)) return "past";
          if (/\b(?:was|were) due\b/i.test(blob) && /\bpaid\b/i.test(blob)) return "past";
          if (/\bwe had our\b/i.test(blob)) return "past";
          if (/\b(?:was|were) on\s+(?:moday|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(blob)) return "past";
          if (/\bit was great (?:speaking|meeting|chatting)\b/i.test(blob) || /\bgreat (?:meeting|chatting)\b/i.test(blob) && !/\bplease remember to\b/i.test(blob)) return "past";
          if (/\bthanks for the\b/i.test(blob) && /\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|yesterday)\b/i.test(blob)) return "past";
          if (/אתמול|בשבוע שעבר|היה נעים|נהניתי|שמחתי שדיברנו|תודה שהקדשת|הייתה ביום|היה ביום|הפגישה הייתה/.test(blob)) return "past";
          const year = blob.match(/\b(19\d{2}|20\d{2})\b/);
          const nowYear = ctx.now ? new Date(ctx.now).getFullYear() : 2026;
          if (year && +year[1] < nowYear && /\b(?:meeting|call|sync|review|interview|invoice|due|paid)\b/i.test(blob)) return "past";
          if (undecidedAnywhere(blob)) return "conditional";
          if (conditionalMainIsNotAction(blob, main)) return "conditional";
          if (/\bno decision yet\b/i.test(main) || /\bnot decided yet\b/i.test(main)) return "conditional";
          if (/\bsuppose we\b/i.test(main) || /\bwould th?a?t work\b/i.test(main) || /\bwould tht work\b/i.test(main)) return "conditional";
          if (/נניח ש|זה יעבוד אצלכם|טרם הוחלט|עוד לא סגרנו/.test(main)) return "conditional";
          if (/\bno longer needed\b/i.test(blob)) return "cancelled";
          const families = typeof FlowCloseFamilies !== "undefined" ? FlowCloseFamilies : null;
          if (families && typeof families.commitmentHeldBack === "function" && families.commitmentHeldBack(main)) return "conditional";
          if (families && typeof families.sentenceLiveAsk === "function" && families.sentenceLiveAsk(main)) return "";
          if (EVENT_CALLED_OFF_HE.test(blob)) return "negative";
          if (/\b(?:postpon(?:e|ed|ing)|cancel(?:led|ed|ing)?|called off|won'?t happen|will not happen|isn'?t happening)\b/i.test(blob)) return "negative";
          return "";
        }
        function rescueSelfSent(code) {
          if (code === "calibrated") return null;
          if (!addressedToSelf(ctx)) return null;
          const blob = (ctx && ctx.subject ? String(ctx.subject) + "\n" : "") + String(text || "");
          if (selfContentStaysQuiet(blob)) return null;
          if (selfCallCancelled(text) || meetingPlanVeto(text)) return null;
          const subject = ctx && ctx.subject;
          const decided = selfDecisionTitle(text, facts);
          let titled = decided || selfAskTitle(text, subject, ctx);
          if (!decided && !usableSelfTitle(titled)) titled = selfRecoverTitle(text, subject, ctx);
          const callTitled = haveACallTitle(text, ctx, humanWhen(facts && facts.date, facts && facts.time));
          if (!decided && usableSelfTitle(callTitled)) titled = callTitled;
          if (!decided && !usableSelfTitle(titled)) return null;
          const made = finish(TYPES.REQUEST, "high", { what: titled });
          if (!made || !made.type) return null;
          made.label = titled;
          made.selfTask = true;
          made.noReplyDraft = true;
          return made;
        }
        function stayQuiet(code, extra) {
          if (!(extra && extra.noRescue)) {
            const rescued = rescueSelfSent(code);
            if (rescued) return rescued;
          }
          const row = { type: null, signals, facts, quiet: code };
          if (extra && extra.noRescue) {
            const rest = Object.assign({}, extra);
            delete rest.noRescue;
            if (Object.keys(rest).length) Object.assign(row, rest);
          } else if (extra) Object.assign(row, extra);
          return row;
        }
        const contingent = commitmentIsContingent(text);
        const settled = ALREADY_SETTLED.test(text);
        if (!quietHint && (contingent || settled)) quietHint = "hedge";
        familyBox.hit = typeof FlowCloseFamilies !== "undefined" && !blocked && !askIsSoft && !settled ? FlowCloseFamilies.assess(text, facts, { now: ctx.now, senderEmail: ctx.senderEmail }) : null;
        function fromFamily(fam) {
          if (!fam || fam.suppress) return null;
          if (facts.date && (facts.date.contradictsWeekday || facts.date.invalidDate || facts.date.dropped)) return null;
          if (suppressed(fam.type)) return null;
          const date = fam.date || null;
          const time = fam.time || null;
          if (date && date.iso && isPastDate(date.iso, ctx.now)) return null;
          const entities = {
            who,
            amount,
            what: fam.what,
            requestWhat: fam.requestWhat || null,
            requestedObjectTerm: fam.objectTerm || null,
            when: humanWhen(date, time),
            dateIso: date && date.iso
          };
          if (time && Number.isInteger(time.hour)) {
            entities.hour = time.hour;
            entities.minute = time.minute;
          }
          if (fam.calendarOp === "delete" || fam.calendarOp === "update") entities.calendarOp = fam.calendarOp;
          if (fam.fromDate && fam.fromDate.iso) {
            entities.fromDateIso = fam.fromDate.iso;
            if (fam.fromTime && Number.isInteger(fam.fromTime.hour)) {
              entities.fromHour = fam.fromTime.hour;
              entities.fromMinute = fam.fromTime.minute;
            }
          }
          const intent = finish(fam.type, fam.confidence, entities, fam.personalClose || null);
          if (!intent || !intent.type) return intent;
          if (!(intent.selfTask && fam.family === "A")) {
            intent.closeFamily = fam.family;
            if (fam.fileTarget) intent.fileTarget = fam.fileTarget;
            if (fam.createWhenMissing) intent.createWhenMissing = true;
          }
          return gateCreateWhenMissing(intent);
        }
        function labelFor(type) {
          const source = isPast ? Object.assign({}, facts, { date: null }) : facts;
          const enriched = isPast ? Object.assign({}, enrichedFacts, { dateText: null }) : enrichedFacts;
          return shortLabel(type, source, enriched);
        }
        const replyAsk = explicitReplyAsk(text);
        const replyOk = !replyAsk || replyDraftAllowed(text, ctx);
        const replyMisaddressed = replyAsk && replyAimedElsewhere(text, ctx);
        if (replyMisaddressed && !quietHint) quietHint = "hedge";
        if (mailIsOwn(ctx) || thirdPartyQuote(text)) return stayQuiet("hedge");
        if (greetingAwaitingNames(text, ctx)) {
          return { type: null, namesPending: true, signals, facts };
        }
        if (greetingUnconfirmed(text, ctx)) return stayQuiet("hedge", { noRescue: true });
        if (mailIsOwn(ctx) || vocativeIsOther(text, ctx) || ccOnlyWithoutGreeting(text, ctx) || thirdPartyQuote(text)) return stayQuiet("hedge");
        if (bankChangePayment(text)) return stayQuiet("family");
        if (!blocked && typeof FlowCloseFamilies !== "undefined" && typeof FlowCloseFamilies.commitmentHeldBack === "function" && FlowCloseFamilies.commitmentHeldBack(text)) {
          return stayQuiet("hedge");
        }
        if (!blocked && addressedToSelf(ctx) && weAgreedPromise(text) && isPast) {
          return finish(TYPES.DECISION_TO_LOG, "high", {
            who,
            amount,
            what: "Log commitment",
            when: null,
            dateIso: null
          });
        }
        const slotOnly = Boolean(familyBox.hit && (familyBox.hit.family === "D" || familyBox.hit.family === "H") && s.flags && s.flags.slotAsk);
        if (familyBox.hit && familyBox.hit.suppress && !slotOnly) {
          if (ctx.debug) {
            let matched = familyBox.hit.matched || null;
            if (Array.isArray(matched)) matched = matched.join(", ").slice(0, 80);
            else if (matched != null) matched = String(matched).slice(0, 80);
            console.log("[Glance debug]", {
              messageId: ctx.messageId || null,
              family: familyBox.hit.family,
              rule: familyBox.hit.rule || null,
              reason: "family",
              suppress: true,
              matched
            });
          }
          return stayQuiet("family");
        }
        if (!replyMisaddressed && familyBox.hit && familyBox.hit.family === "G") {
          const replaced = familyBox.hit.calendarOp === "delete" && liveWithAsk(vetoClauses(text));
          if (!replaced) {
            const viaMove = fromFamily(familyBox.hit);
            if (viaMove) return viaMove;
          }
        }
        const attachToInvite = Boolean(attachToInvitePlan(text));
        if (!blocked && attachToInvite && addressedToSelf(ctx)) {
          const noted = finish(TYPES.REQUEST, "medium", {
            who,
            amount,
            what: whatText(text, REQUEST_PATTERNS) || labelFor(TYPES.REQUEST),
            when: humanWhen(facts.date, facts.time),
            dateIso: facts.date && facts.date.iso
          }, "follow-up-ask");
          if (noted) noted.selfAttachTask = true;
          return noted;
        }
        if (!blocked && attachToInvite && sentByReader(ctx)) return stayQuiet("hedge");
        if (!blocked && !replyMisaddressed && attachToInvite) {
          return finish(TYPES.REQUEST, "medium", {
            who,
            amount,
            what: whatText(text, REQUEST_PATTERNS) || labelFor(TYPES.REQUEST),
            when: humanWhen(facts.date, facts.time),
            dateIso: facts.date && facts.date.iso
          }, "follow-up-ask");
        }
        if (!replyMisaddressed && !attachToInvite && !calledOff && !isRecap && !isPast && familyBox.hit && familyBox.hit.family === "D" && (familyBox.hit.personalClose === "calendar-hold" || familyBox.hit.personalClose === "dated-commitment")) {
          const viaHold = fromFamily(familyBox.hit);
          if (viaHold) return viaHold;
        }
        if (!replyMisaddressed && familyBox.hit && !familyBox.hit.suppress && familyBox.hit.what && familyBox.hit.type && familyBox.hit.type !== TYPES.REQUEST) {
          const at = text.indexOf(familyBox.hit.what);
          const head = at > 0 ? text.slice(0, at) : "";
          const earlierAsk = head && (/\b(?:could you|can you|please (?:send|forward|chase)|i need)\b/i.test(head) || /(?:אפשר לשלוח|בבקשה תשלח|תשלח את|תעקוב)/.test(head) || /\b(?:got \d+ minutes|are you free|let's meet)\b/i.test(head));
          if (earlierAsk) {
            const viaLatest = fromFamily(familyBox.hit);
            if (viaLatest && viaLatest.type) return viaLatest;
          }
        }
        const phoneSomeone = /(?:^|[\n\r])\s*Call\s+[A-Z][a-zA-Z'’-]{1,40}\b/.test(String(text || "")) && !/\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/.test(String(text || ""));
        const clock = facts.time && Number.isInteger(facts.time.hour) && Number.isInteger(facts.time.minute) && facts.time.hour >= 0 && facts.time.hour <= 23 && facts.time.minute >= 0 && facts.time.minute <= 59 ? facts.time : null;
        const pendingChoices = Boolean(facts.date && Array.isArray(facts.date.choices) && facts.date.choices.length >= 2 && !facts.date.iso);
        const meetingAskHedge = /\b(?:might|maybe|perhaps|if you(?:'re| are) (?:free|available)|if (?:that|this|it) works)\b|נראה לי|(?:^|[^\u0590-\u05FF])אולי/.test(text);
        const eventEvidence = hasMeetingNoun && facts.date && (facts.date.iso || pendingChoices && clock) && !calledOff && !isRecap && !isPast && !attachToInvite && !phoneSomeone && !meetingAskHedge;
        const explicitMeetingAsk = Boolean(clock) && hasResolvedDate && !calledOff && !isRecap && !isPast && !meetingAskHedge && !attachToInvite && !phoneSomeone && (EXPLICIT_MEETING_ASK.test(text) || EXPLICIT_MEETING_ASK_HE.test(text));
        if (typeof FlowGoogleCloses !== "undefined") {
          const google = FlowGoogleCloses.consider({
            text,
            blocked,
            amount,
            dateIso: hasResolvedDate ? facts.date.iso : null,
            dateText: enrichedFacts.dateText,
            hasClock: Boolean(clock),
            template: ctx.companyTemplate || null,
            fileMatch: ctx.fileMatch || null,
            attachmentCount: ctx.attachmentCount == null ? null : ctx.attachmentCount
          });
          if (google && google.wait) {
            const rescued = rescueSelfSent("google-wait");
            if (rescued) return rescued;
            return { type: null, signals, facts, googleWait: { fileTerm: google.wait } };
          }
          if (google && google.silence) {
            return stayQuiet("google", { googleSilence: true });
          }
          if (google && google.close) {
            const g = google.close;
            const hold = g.personalClose === "file-on-hold";
            if (hold && suppressed(TYPES.SCHEDULED_EVENT)) {
              return stayQuiet("calibrated", { googleSilence: true });
            }
            if (!hold && suppressed(TYPES.DECISION_TO_LOG)) {
              return stayQuiet("calibrated", { googleSilence: true });
            }
            const entities = {
              who,
              amount,
              what: g.what || g.cardLine,
              when: humanWhen(facts.date, facts.time),
              dateIso: hasResolvedDate ? facts.date.iso : null
            };
            if (hold && clock) {
              entities.hour = clock.hour;
              entities.minute = clock.minute;
            }
            return finish(
              hold ? TYPES.SCHEDULED_EVENT : TYPES.DECISION_TO_LOG,
              "high",
              entities,
              g.personalClose,
              g
            );
          }
        }
        if (eventEvidence && suppressed(TYPES.SCHEDULED_EVENT)) return stayQuiet("calibrated");
        function holdEntities() {
          return {
            who,
            amount,
            what: whatText(text, [EXPLICIT_MEETING_ASK, EXPLICIT_MEETING_ASK_HE]) || whatText(text, [MEETING_NOUN, MEETING_NOUN_HE]) || whatText(text, DATED_COMMIT_PATTERNS) || "Hold",
            when: humanWhen(facts.date, facts.time),
            dateIso: facts.date.iso,
            hour: facts.time.hour,
            minute: facts.time.minute
          };
        }
        if (!blocked && !replyMisaddressed && phoneSomeone && hasResolvedDate && clock && !isPast && !calledOff) {
          const intent = finish(TYPES.DECISION_TO_LOG, "high", {
            who,
            amount,
            what: "Call",
            when: humanWhen(facts.date, facts.time),
            dateIso: facts.date.iso,
            hour: clock.hour,
            minute: clock.minute
          }, "dated-commitment");
          if (intent && !intent.selfTask) intent.label = /[\u0590-\u05FF]/.test(String(text || "")) ? "\u05E9\u05D9\u05D7\u05D4" : "Call";
          return intent;
        }
        if (!blocked && !replyMisaddressed && typeof soloPhoneTask === "function" && soloPhoneTask(text) && hasResolvedDate && clock && !isPast && !calledOff) {
          const intent = finish(TYPES.DECISION_TO_LOG, "high", {
            who,
            amount,
            what: "Call",
            when: humanWhen(facts.date, facts.time),
            dateIso: facts.date.iso,
            hour: clock.hour,
            minute: clock.minute
          }, "dated-commitment");
          if (intent && !intent.selfTask) intent.label = /[\u0590-\u05FF]/.test(String(text || "")) ? "\u05E9\u05D9\u05D7\u05D4" : "Call";
          return intent;
        }
        if (!blocked && !replyMisaddressed && /\badd this to my tasks\b/i.test(text) && /\bcall\b/i.test(text)) {
          const intent = finish(TYPES.REQUEST, "medium", {
            who,
            amount,
            what: "Call",
            when: humanWhen(facts.date, facts.time),
            dateIso: facts.date && facts.date.iso
          }, "follow-up-ask");
          if (intent) {
            intent.noReplyDraft = true;
            if (!intent.selfTask) intent.label = /[\u0590-\u05FF]/.test(String(text || "")) ? "\u05E9\u05D9\u05D7\u05D4" : "Call";
          }
          return intent;
        }
        if (!blocked && !replyMisaddressed && bankCallReminder && hasResolvedDate && !isPast) {
          const intent = finish(TYPES.DECISION_TO_LOG, "high", {
            who,
            amount,
            what: "Call",
            when: humanWhen(facts.date, facts.time),
            dateIso: facts.date.iso
          }, "dated-commitment");
          if (intent && !intent.selfTask) intent.label = "Call";
          return intent;
        }
        if (!blocked && !replyMisaddressed && eventEvidence) {
          const meetingHold = explicitMeetingAsk;
          if (meetingHold) {
            if (suppressed(TYPES.SCHEDULED_EVENT)) return stayQuiet("calibrated");
            return finish(TYPES.SCHEDULED_EVENT, "high", holdEntities(), "calendar-hold");
          }
          const scheduled = finish(TYPES.SCHEDULED_EVENT, facts.time ? "high" : "medium", {
            who,
            amount,
            what: whatText(text, [MEETING_NOUN, MEETING_NOUN_HE]) || "Meeting",
            when: humanWhen(facts.date, facts.time),
            dateIso: facts.date.iso,
            hour: facts.time ? facts.time.hour : null,
            minute: facts.time ? facts.time.minute : null
          });
          if (scheduled && scheduled.type) {
            const titled = haveACallTitle(text, ctx, humanWhen(facts.date, facts.time));
            if (titled) scheduled.label = titled;
          }
          return scheduled;
        }
        if (!blocked && !replyMisaddressed && explicitMeetingAsk && !hasMeetingNoun) {
          if (suppressed(TYPES.SCHEDULED_EVENT)) return stayQuiet("calibrated");
          return finish(TYPES.SCHEDULED_EVENT, "high", holdEntities(), "calendar-hold");
        }
        const readerCommitEvidence = isReaderCommit && (hasConcreteAnchor || hasConcreteCommitmentObject);
        if (readerCommitEvidence && suppressed(TYPES.COMMITMENT_OF_READER)) return stayQuiet("calibrated");
        if (!blocked && readerCommitEvidence && !isPast) {
          return finish(TYPES.COMMITMENT_OF_READER, hasConcreteAnchor ? "high" : "medium", {
            who,
            amount,
            what: commitmentWhat || labelFor(TYPES.COMMITMENT_OF_READER),
            when: humanWhen(facts.date, facts.time),
            dateIso: facts.date && facts.date.iso
          });
        }
        const parkingBody = typeof FlowCloseFamilies !== "undefined" && typeof FlowCloseFamilies.parkingPermitAsk === "function" && FlowCloseFamilies.parkingPermitAsk(text);
        const parkingSubject = typeof FlowCloseFamilies !== "undefined" && typeof FlowCloseFamilies.parkingPermitAsk === "function" && FlowCloseFamilies.parkingPermitAsk(ctx.subject || "");
        const parkingAsk = (parkingBody || parkingSubject) && !blocked;
        if (parkingAsk) {
          return finish(TYPES.REQUEST, "medium", {
            who,
            amount,
            what: "Renew the parking permit",
            when: humanWhen(facts.date, facts.time),
            dateIso: facts.date && facts.date.iso
          }, "follow-up-ask");
        }
        const dateDropped = Boolean(facts.date && facts.date.dropped);
        const inboundAsk = /\b(?:any chance you could|please (?:email|e-mail) me|please loop in)\b/i.test(text);
        const selfPhrase = addressedToSelf(ctx) && /\b(?:any chance you could|please (?:email|e-mail|loop in)|kindly (?:email|loop in))\b/i.test(text);
        const datedAsk = hasResolvedDate && !isPast && (/\bplease\s+create\s+a\s+task\b/i.test(text) || selfPhrase || inboundAsk);
        const requestEvidence = (s.flags.handoff || datedAsk) && (hasResolvedDate && !isPast || hasConcreteRequestObject || dateDropped) || s.flags.slotAsk || s.flags.workAsk || s.flags.shortAsk;
        if (requestEvidence && suppressed(TYPES.REQUEST)) return stayQuiet("calibrated");
        const familiesBlockAsk = typeof FlowCloseFamilies !== "undefined" && FlowCloseFamilies.askBlocked(text);
        const familyBlocks = familiesBlockAsk && !inboundAsk;
        if (!quietHint && (askIsSoft || familyBlocks) && requestEvidence) quietHint = "hedge";
        if (!blocked && requestEvidence && !askIsSoft && !familyBlocks && readerDecisionAsk(text) && !replyAsk) {
          quietHint = quietHint || "hedge";
        } else if (!blocked && requestEvidence && !askIsSoft && !familyBlocks && replyAsk && !replyOk) {
          quietHint = quietHint || "hedge";
        } else if (!blocked && requestEvidence && !askIsSoft && !familyBlocks && replyOk) {
          return finish(TYPES.REQUEST, "medium", {
            who,
            amount,
            what: whatText(text, REQUEST_PATTERNS) || labelFor(TYPES.REQUEST),
            when: humanWhen(facts.date, facts.time),
            dateIso: facts.date && facts.date.iso
          }, "follow-up-ask");
        }
        const datedCommitment = (s.flags.commit || s.flags.senderPromise) && hasResolvedDate && !s.flags.lost && !isPast && !contingent;
        if (!blocked && datedCommitment && suppressed(TYPES.DECISION_TO_LOG)) quietHint = "calibrated";
        if (!blocked && !contingent && !settled && !isPast && s.flags.commit && facts.money && !s.flags.lost && !amountIsAmbiguous(text) && suppressed(TYPES.DECISION_TO_LOG)) quietHint = "calibrated";
        if (!blocked && datedCommitment && !suppressed(TYPES.DECISION_TO_LOG)) {
          const committed = {
            who,
            amount,
            what: whatText(text, DATED_COMMIT_PATTERNS) || labelFor(TYPES.DECISION_TO_LOG),
            when: humanWhen(facts.date, facts.time),
            dateIso: facts.date.iso
          };
          if (clock && explicitMeetingAsk) {
            committed.hour = facts.time.hour;
            committed.minute = facts.time.minute;
            return finish(TYPES.SCHEDULED_EVENT, "high", committed, "calendar-hold");
          }
          const rawClock = String(clock && clock.raw || "");
          const baseSeesClock = /(?:בשעה|בשעות|(?<![\u0590-\u05FF])בעה)|\bat\s+\d/i.test(text) || /(?:פגישה|שיחה|ראיון|\b(?:meeting|call|sync)\b)/i.test(text) && /(?:^|[^\d])\d{1,2}:\d{2}(?!\d)/.test(text);
          const laneOnlyBet = /ב-\s*\d{1,2}:\d{2}/.test(rawClock) && !baseSeesClock;
          const sendReportTomorrow = /\bi(?:'|’)?ll send the report tomorrow\b/i.test(text);
          const ownTimedSend = /\bfollowing up on (?:our|the|that) call\b/i.test(text) && /\b(?:i|we)(?:'|’)?ll\s+send\b|\b(?:i|we)\s+will\s+send\b/i.test(text);
          if (sendReportTomorrow && !committed.hour) {
            const hm = String(text || "").match(/\b(\d{1,2}):(\d{2})\b/);
            if (hm) {
              committed.hour = +hm[1];
              committed.minute = +hm[2];
            }
          }
          if (ownTimedSend && clock) {
            committed.hour = clock.hour;
            committed.minute = clock.minute;
          }
          if (clock && s.flags.senderPromise && !laneOnlyBet && !sendReportTomorrow && !ownTimedSend) return stayQuiet("hedge");
          const logged = finish(TYPES.DECISION_TO_LOG, "high", committed, "dated-commitment");
          if (ownTimedSend && logged && clock) {
            const stamp = clock.hour + ":" + String(clock.minute).padStart(2, "0");
            if (logged.label && logged.label.indexOf(stamp) < 0) logged.label = logged.label + " " + stamp;
          }
          return logged;
        }
        if (!blocked && !contingent && !settled && !isPast && s.flags.commit && facts.money && !s.flags.lost && !amountIsAmbiguous(text) && !suppressed(TYPES.DECISION_TO_LOG)) {
          return finish(TYPES.DECISION_TO_LOG, "high", {
            who,
            amount,
            what: whatText(text, DATED_COMMIT_PATTERNS) || labelFor(TYPES.DECISION_TO_LOG),
            when: humanWhen(facts.date, facts.time),
            dateIso: facts.date && facts.date.iso
          }, "confirmed-amount");
        }
        const isDecision = s.flags.commit || s.flags.lost || s.flags.executed || s.flags.dispute;
        const likelyType = isDecision ? TYPES.DECISION_TO_LOG : TYPES.FOLLOW_UP;
        const gatingThreshold = FlowJudgment.applyTypeAdjustment(
          threshold,
          ctx.calibrationByType && ctx.calibrationByType[likelyType],
          ctx.now
        );
        if (infoOrNoise) return stayQuiet("noise");
        if (askIsSoft && !isDecision) return stayQuiet("hedge");
        if (s.total < gatingThreshold) {
          if (!replyMisaddressed) {
            const via = fromFamily(familyBox.hit);
            if (via) return via;
          }
          if (quietHint) return stayQuiet(quietHint);
          const rescued = rescueSelfSent("intent-null");
          if (rescued) return rescued;
          return { type: null, signals, facts };
        }
        if (isDecision && contingent) return stayQuiet("hedge");
        if (isDecision && settled && (isPast || !(facts.date && facts.date.iso))) return stayQuiet("hedge");
        if (isDecision && facts.money && amountIsAmbiguous(text)) return stayQuiet("hedge");
        if (isDecision) {
          return finish(TYPES.DECISION_TO_LOG, "high", {
            who,
            amount,
            what: whatText(text, [/\b(agreed|approved|confirmed|executed|declin(?:e|ed|ing))\b/i, /(סוכם|אישרנו|מאשרים|נחתם)/]) || labelFor(TYPES.DECISION_TO_LOG),
            when: humanWhen(facts.date, facts.time),
            dateIso: facts.date && facts.date.iso
          });
        }
        if (!replyMisaddressed) {
          const via = fromFamily(familyBox.hit);
          if (via) return via;
        }
        return finish(TYPES.FOLLOW_UP, "low", {
          who,
          amount,
          what: labelFor(TYPES.FOLLOW_UP),
          when: humanWhen(facts.date, facts.time),
          dateIso: facts.date && facts.date.iso
        });
      }
      function shouldShowChip(intent) {
        if (!intent || !intent.type) return false;
        return intent.confidence !== "low";
      }
      function soloPhoneTask(text) {
        const src = String(text || "");
        if (/\bcall you\b/i.test(src)) return false;
        if (/\bi(?:'|’)?ll\s+call\s+the\b|\bi will call the\b/i.test(src)) return true;
        if (/\bcall\s+(?:tom|avi|the bank)\b/i.test(src)) return true;
        return false;
      }
      function cleanInviteFile(raw) {
        const name = String(raw || "").replace(/\s+/g, " ").trim().replace(/^[\s:,.-]+|[\s:,.!-]+$/g, "");
        if (!name || name.length > 80) return "";
        if (/^(?:file|files|it|this|that|the file|קובץ|הקובץ|אותו|את זה)$/i.test(name)) return "";
        return name;
      }
      function inviteFileName(raw) {
        const he = String(raw || "").match(/לצרר?ף\s+את\s+([\s\S]{1,80}?)\s+לזימון/);
        if (he) return cleanInviteFile(he[1]);
        const en = String(raw || "").match(new RegExp("\\battach\\s+(?:the\\s+|a\\s+|an\\s+)?([\\s\\S]{1,80}?)\\s+to\\s+the\\s+" + ATTACH_TARGET + "\\b", "i"));
        if (en) return cleanInviteFile(en[1]);
        return "";
      }
      function attachToInvitePlan(text, opts) {
        const raw = String(text || "");
        const heAttach = /לצרר?ף[\s\S]{0,160}?לזימון/.test(raw);
        const enAttach = new RegExp("\\battach\\b[\\s\\S]{0,160}?\\bto\\s+the\\s+" + ATTACH_TARGET + "\\b", "i").test(raw);
        if (!heAttach && !enAttach) return null;
        const he = /[\u0590-\u05FF]/.test(raw);
        const named = inviteFileName(raw);
        const file = named || (he ? "\u05E7\u05D5\u05D1\u05E5" : "file");
        const attached = Boolean(opts && opts.attached === true);
        return {
          inviteFile: true,
          fileName: named || null,
          attached,
          label: he ? "\u05DC\u05E6\u05E8\u05E3 " + file + " \u05DC\u05D6\u05D9\u05DE\u05D5\u05DF" : "Attach " + file + " to invite",
          processId: "attach-invite",
          stepKinds: ["task", "draft"],
          draft: attached ? he ? "\u05DE\u05E6\u05D5\u05E8\u05E3." : "Attached." : he ? "\u05D0\u05E6\u05E8\u05E3 \u05D1\u05D4\u05E7\u05D3\u05DD." : "I'll attach it shortly.",
          banner: false
        };
      }
      function ownFirstPersonPromise(text) {
        const src = String(text || "");
        if (/\b(?:i|we)(?:'|’)?ll\s+call\s+you\b|\b(?:i|we)\s+will\s+call\s+you\b/i.test(src)) return true;
        if (/\b(?:i|we)(?:'|’)?ll\s+(?:send|deliver|share|provide|submit|file|pay|return|forward|transfer|wire|prepare|email|finish|complete)\b/i.test(src)) return true;
        if (/\b(?:i|we)\s+will\s+(?:send|deliver|share|provide|submit|file|pay|return|forward|transfer|wire|prepare|email|finish|complete)\b/i.test(src)) return true;
        if (/\bpromised\b/i.test(src) && /\bsend\b/i.test(src)) return true;
        if (/(?:^|[^\u0590-\u05FF])(?:(?:אני|אנחנו)\s+)?(?:אשלח|נשלח|אעביר|נעביר|אשלם|נשלם|אגיש|נגיש|אכין|נכין|אחזיר|נחזיר)/.test(src)) return true;
        return false;
      }
      function weAgreedPromise(text) {
        return /\bwe\s+agreed\s+to\b/i.test(String(text || ""));
      }
      function bareSelfTitle(label) {
        return /^(?:Pay|Send|Review|Call|Update|File|Approve|Confirm|Sign|Scan|Upload|Prepare|Resend|Reply|Save|Fill out|Loop in|Sign off|Sign-off|לשלם|לשלוח|להעביר|להכין|למלא|לחזור|להעלות|לאשר|להגיש|לעדכן|להשלים|לסרוק|לבדוק|לשמור|שיחה)$/.test(String(label || "").trim());
      }
      function payAsk(src) {
        if (/\b(?:pay|wire)\b/i.test(src)) return true;
        if (/\bprocess\b/i.test(src) && /\bpayment\b/i.test(src)) return true;
        if (/\bclear\b/i.test(src) && /\bbalance\b/i.test(src)) return true;
        if (/\btransfer\b/i.test(src) && /(?:\$|₪|€|£|\b(?:deposit|balance|vendor|payment|invoice)\b)/i.test(src)) return true;
        if (/\bneeds to be paid\b/i.test(src)) return true;
        if (/לשלם|תשלם|תשלמי|לסגור את היתרה/.test(src)) return true;
        if (/להעביר את התשלום|תעביר(?:י|ו)? את התשלום/.test(src)) return true;
        return false;
      }
      function reviewAsk(src) {
        if (/\b(?:review|double-?check)\b/i.test(src)) return true;
        if (/לבדוק|תבדוק|תבדקי|תבדקו/.test(src)) return true;
        return false;
      }
      function callAsk(src) {
        if (/להחזיר(?:י|ו)? לי טלפון/.test(src)) return true;
        if (/\bcall\b/i.test(src) && /\b(?:reminder|remember)\b/i.test(src) && !/\bto the call\b/i.test(src)) return true;
        return false;
      }
      function earliestVerb(src, rows) {
        let best = null;
        let at = -1;
        for (let i = 0; i < rows.length; i++) {
          const m = src.match(rows[i][0]);
          if (!m || m.index == null) continue;
          if (at < 0 || m.index < at) {
            at = m.index;
            best = { verb: rows[i][1], match: m };
          }
        }
        return best;
      }
      function prepareAsk(raw) {
        return String(raw || "").replace(/[\u200B\u200C\u200D\uFEFF\u2060\u00A0\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, " ").replace(/\bfollowing up on (?:our|the|that) call\b/ig, " ").replace(/\bper our (?:call|chat)\b/ig, " ").replace(/בהמשך לשיחתנו/g, " ").replace(/\[[^\]]*image[^\]]*\]/ig, " ").replace(/CONFIDENTIALITY[\s\S]*$/i, " ").replace(/הודעה זו[\s\S]*$/, " ").replace(/Sent from my iPhone/ig, " ").replace(/נשלח מה-?\s*iPhone[\s\S]*/ig, " ").replace(/(?:^|\n)\s*--\s*\n[\s\S]*$/, " ").replace(/^(?:שבוע טוב|בוקר טוב|צהריים טובים|ערב טוב|happy monday|hope you(?:r week)? (?:is |are )?well)[.!,\s]*/i, " ").replace(/\b(?:best regards|many thanks|thank you|thanks|regards|cheers)\b[\s\S]*$/i, " ").replace(/(?:בברכה|בתודה|תודה רבה|יום נעים|המשך יום טוב|תודה)[\s\S]*$/, " ").replace(/\s+/g, " ").trim();
      }
      function heTopic(subject) {
        return cleanSubject(subject).replace(/^בהמשך\s+ל/, "").replace(/\s+/g, " ").trim();
      }
      function cleanSubject(subject) {
        return String(subject || "").replace(/[\u200B\u200C\u200D\uFEFF\u2060\u00A0\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, " ").replace(/\s+/g, " ").trim().replace(/^(?:(?:re|fw|fwd|השב|תגובה|הועבר)\s*:\s*)+/ig, "").replace(/\s+attached$/i, "").trim();
      }
      function weakSubject(subject) {
        return /^(?:quick question|following up|reminder|todo|note to self|next steps|please add|task|payment reminder|outstanding balance|משימה|תזכורת|שאלה קצרה|תזכורת תשלום)$/i.test(String(subject || "").trim());
      }
      function genericFollowSubject(subject) {
        const s = String(subject || "").replace(/[!?.]+$/g, "").replace(/\s+/g, " ").trim();
        if (!s) return false;
        if (/^(?:thanks?|thank you|recap|decision|heads?[- ]?up|update|updates|thoughts?|urgent|action required|new features|change of plans|budget question|big sale|your weekly digest|weekly digest|fyi|note|hello|hi)$/i.test(s)) return true;
        if (/^(?:תודה|סיכום|מחשבות|עדכון|מבצע|ניוזלטר|דחוף|מענה אוטומטי|תקציב|הודעה|שאלה)$/.test(s)) return true;
        return false;
      }
      function selfAckNote(blob) {
        const raw = String(blob || "");
        if (/\bthanks?,?\s+got it\b/i.test(raw) || /\bsounds good,?\s+thank you\b/i.test(raw)) return true;
        if (/קיבלתי|אחלה תודה|יופי תודה/.test(raw)) return true;
        if (/\b(?:send|pay|call|attach|review|please|could you|can you)\b/i.test(raw)) return false;
        if (/לשלוח|תשלח|לצרף|בבקשה|תוכל|אפשר/.test(raw)) return false;
        const parts = raw.split("\n");
        let t = parts.slice(1).join(" ") || parts[0] || "";
        t = t.replace(/\[image:[^\]]*\]/gi, " ");
        t = t.replace(/CONFIDENTIALITY[\s\S]*/i, " ");
        t = t.replace(/הודעה זו[\s\S]*/, " ");
        t = t.replace(/Sent from my iPhone[\s\S]*/ig, " ");
        t = t.replace(/נשלח מה-?\s*iPhone[\s\S]*/ig, " ");
        t = t.replace(/(?:^|\n)\s*--\s*[\s\S]*/, " ");
        t = t.replace(/\bSali Sapan\b[\s\S]*/i, " ");
        t = t.replace(/מקווה שאת\/?ה בטוב[.!]?\s*/g, " ");
        t = t.replace(/שבוע טוב[.!]?\s*/g, " ");
        t = t.replace(/(?:המשך יום טוב|יום נעים|בברכה|בתודה)[.!\s]*$/g, " ");
        t = t.replace(/\s+/g, " ").trim();
        return /^(?:thanks?(?:\s+you)?|thank you|cheers|תודה(?:\s+רבה)?)[.!\s]*$/i.test(t);
      }
      function weakObject(obj) {
        return /^(?:it|this|that|them|me|you|us|file|files|attached file|the file|a file|attachment|an attachment|הקובץ|קובץ|אותו|את זה|זה|אליי|אלי|לי)$/i.test(String(obj || "").trim());
      }
      const EN_DATE_TAIL = /\s+(?:by|due|until|before|no later than|tomorrow|today|tonight|asap|eod|eow|end of (?:the )?(?:week|day)|for\s+next\b|tomorr\w*|next\s+(?:week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|on\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|oct(?:ober)?|nov(?:ember)?|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june|july|aug(?:ust)?|sep(?:tember)?|dec(?:ember)?|\d{1,2})|(?:this\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|january|february|march|april|may|june|july|august|september|october|november|december)\b[\s\S]*$/i;
      const EN_DATE_LEAD = /^(?:by|on|before|until|due|no later than)\s+(?:eod|eow|asap|tomorrow|today|tonight|end of (?:the )?(?:week|day)|next\s+(?:week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|oct|nov)(?:\s+\d{1,2})?(?:,\s*(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2})?)\b\s*/i;
      const HE_DATE_WORD = "(?:\u05E2\u05D3|\u05DE\u05D7\u05E8|\u05D4\u05D9\u05D5\u05DD|\u05D4\u05E9\u05D1\u05D5\u05E2|\u05D1\u05D9\u05D5\u05DD|\u05DC\u05D9\u05D5\u05DD|\u05DC\u05E4\u05E0\u05D9|\u05E1\u05D5\u05E3|asap|\u05DC\u05DE\u05E2\u05E8\u05DB\u05EA|\u05D1(?:\u05E8\u05D0\u05E9\u05D5\u05DF|\u05E9\u05E0\u05D9|\u05E9\u05DC\u05D9\u05E9\u05D9|\u05E8\u05D1\u05D9\u05E2\u05D9|\u05D7\u05DE\u05D9\u05E9\u05D9|\u05E9\u05D9\u05E9\u05D9|\u05E9\u05D1\u05EA))";
      const HE_DATE_TAIL = new RegExp("\\s+" + HE_DATE_WORD + "(?=\\s|$|[.,!?])[\\s\\S]*$", "i");
      const HE_DATE_LEAD = new RegExp("^" + HE_DATE_WORD + "(?=\\s|$|[.,!?])[\\s\\S]*$", "i");
      const AT_CLOCK = /\s+at\s+\d[\s\S]*$/i;
      const NUM_DATE = /\s+(?:עד\s+)?(?:ה-)?\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?[\s\S]*$/;
      function unwrapGoogleRedirectUrl(s) {
        let t = String(s || "").trim();
        const re = /(?:https?:\/\/)?(?:www\.)?google\.com\/url\?(?:[^#\s&]*&)*q=([^&#\s]+)(?:&[^#\s&]*)*/gi;
        t = t.replace(re, (_, q) => {
          try {
            return decodeURIComponent(q);
          } catch (e) {
            return q;
          }
        });
        const urlParam = /(?:https?:\/\/)?(?:www\.)?google\.com\/url\?(?:[^#\s&]*&)*url=([^&#\s]+)(?:&[^#\s&]*)*/gi;
        t = t.replace(urlParam, (_, u) => {
          try {
            return decodeURIComponent(u);
          } catch (e) {
            return u;
          }
        });
        const strip = /(?:https?:\/\/)?(?:www\.)?google\.com\/url\?(?:[^#\s&]*(?:&[^#\s&]+)*)/gi;
        t = t.replace(strip, "");
        t = t.replace(/https?:\/\//gi, "");
        if (/^(?:www\.)?google\.com\/url\b/i.test(t.trim())) return "";
        t = t.replace(/\s+(?:the|on)\s*$/i, "").replace(/\s{2,}/g, " ").trim();
        return t.replace(/\s+/g, " ").trim();
      }
      function takeObject(rest, keepThe) {
        let s = String(rest || "").replace(/\s+/g, " ").trim();
        s = s.replace(EN_DATE_LEAD, "");
        s = s.replace(HE_DATE_LEAD, "");
        s = s.replace(/\s+is\s+due\b[\s\S]*$/i, "");
        s = s.replace(EN_DATE_TAIL, "").replace(AT_CLOCK, "").replace(HE_DATE_TAIL, "").replace(NUM_DATE, "");
        s = s.replace(/\s+(?:and\s+get\s+back|and\s+send|so\s+(?:we|i)\s+can)\b[\s\S]*$/i, "");
        s = s.replace(/\s+as\s+an\s+attachment\b[\s\S]*$/i, "");
        s = s.split(/(?<!\d)[.!?](?![\w\u0590-\u05FF-])/)[0];
        s = s.replace(/\s+to\s+(?:my\s+)?(?:google\s+drive|one\s?drive|the\s+portal|the\s+drive|portal|drive)\b[\s\S]*$/i, "");
        s = s.replace(/\s+from\s+you\b[\s\S]*$/i, "");
        s = s.replace(/^(?:and\s+(?:send|email)\s+)/i, "");
        s = s.replace(/^(?:please|kindly|over|back|just)\s+/i, "");
        s = s.replace(/^(?:me|you|us)\s+/i, "");
        s = s.replace(/^(?:with)\s+/i, "");
        if (!keepThe) s = s.replace(/^(?:the|a|an)\s+/i, "");
        s = s.replace(/^(?:(?:שלך|אליי|אלי|לי|לך|לכם|אותי|בבקשה|נא|ממך|מכם)\s+)+/, "");
        s = s.replace(HE_DATE_LEAD, "").replace(HE_DATE_TAIL, "").replace(NUM_DATE, "");
        s = s.replace(/^ו\S+\s+(?=את\s)/, "");
        if (!/^לגבי/.test(s) && /^ל[\u0590-\u05FF]/.test(s) && !/^ל[השמב]/.test(s)) s = "\u05D0\u05EA " + s.slice(1);
        s = s.replace(/^על\s+ה-(\S+)/, "$1").replace(/^על\s+ה\s+(\S+)/, "$1");
        s = s.replace(/^on\s+the\s+(\S+)$/i, "$1");
        s = s.replace(/\s+attached$/i, "");
        s = s.replace(/\s+is$/i, "");
        s = s.replace(/\b([A-Za-z]{2,})\s+\1\b/gi, "$1");
        s = s.replace(/[.?!]+$/g, "").replace(/[,\s]+$/g, "").replace(/\s+/g, " ").trim();
        s = unwrapGoogleRedirectUrl(s);
        return s;
      }
      function shapeHeObject(verb, obj) {
        let object = String(obj || "").replace(/[.?!]+$/g, "").replace(/\s+/g, " ").trim();
        if (verb === "\u05DC\u05D4\u05EA\u05E7\u05E9\u05E8") {
          object = object.replace(/^את\s+/, "");
          if (/^(?:זה|לעצמי|בהמשך)$/.test(object)) return "";
          if (object && !/^ל/.test(object)) object = "\u05DC" + object;
        }
        if (verb === "\u05DC\u05E2\u05D3\u05DB\u05DF") object = object.replace(/^את גבי\b/, "\u05DC\u05D2\u05D1\u05D9");
        if (verb === "\u05DC\u05D1\u05D3\u05D5\u05E7") {
          const latin = object.match(/^ל-([A-Za-z][\w-]*)/);
          if (latin) object = "\u05D0\u05EA \u05D4-" + latin[1];
        }
        return object;
      }
      function earlierNoun(src, index) {
        const before = String(src || "").slice(0, index);
        const re = /\b(?:the|a|an)\s+((?:[A-Za-z0-9$₪€£][\w$₪€£.,-]*)(?:\s+[A-Za-z0-9$₪€£][\w$₪€£.,-]*){0,4})/gi;
        let found = "";
        let m;
        while (m = re.exec(before)) found = m[1];
        if (!found || /^(?:moment|call|week|day|time|email|mail|message|one)$/i.test(found)) return "";
        return found;
      }
      function moneyPhrase(src) {
        const m = String(src || "").match(/(?:\$|₪|€|£)\s?\d[\d,]*(?:\.\d+)?/);
        if (!m) return "";
        const amount = m[0].replace(/\s+/g, "").replace(/,+$/g, "");
        const noun = String(src || "").match(/\b(deposit|invoice|balance|bill)\b/i);
        return noun ? amount + " " + noun[1].toLowerCase() : amount;
      }
      function clipTitle(value) {
        const t = String(value || "").replace(/\s+/g, " ").trim();
        if (t.length <= 72) return t;
        const cut = t.lastIndexOf(" ", 72);
        return (cut >= 12 ? t.slice(0, cut) : t.slice(0, 72)).trim();
      }
      function joinTitle(verb, obj, subject, opts) {
        let object = String(obj || "").replace(/\s+/g, " ").trim();
        if (weakObject(object)) object = "";
        if (opts && opts.pay && object && !/(?:\$|₪|€|£)/.test(object)) {
          const money = moneyPhrase(opts.src || "");
          if (money) object = money + (/^(?:deposit|invoice|payment|balance|bill)$/i.test(object) ? "" : "");
          if (money && /^(?:deposit|invoice|payment|balance|bill)$/i.test(String(obj || "").trim())) object = money;
        }
        if (!object && opts && opts.pay) object = moneyPhrase(opts.src || "");
        if (object && /(?:\$|₪|€|£)/.test(object)) object = object.replace(/\s+payments?\b/ig, " ").replace(/\s+/g, " ").trim();
        if (verb === "\u05DC\u05E9\u05DC\u05DD" && /תשלום/.test(object)) {
          const money = moneyPhrase(opts && opts.src || "");
          if (money) object = money;
        }
        if (verb === "Reply" && object && !/^(?:about|to|with|on)\b/i.test(object)) object = "about " + object;
        if (verb === "Sign off" && object && !/^on\b/i.test(object)) object = "on " + object;
        if (object) {
          const title = clipTitle(verb + " " + object);
          if (title.split(/\s+/).length >= 2 && !bareSelfTitle(title)) return title;
        }
        if (opts && opts.phoneHe) {
          const topic = heTopic(subject);
          if (topic) return clipTitle("\u05E9\u05D9\u05D7\u05D4 \u05D1\u05E0\u05D5\u05E9\u05D0 " + topic);
        }
        if (verb === "\u05DC\u05D7\u05D6\u05D5\u05E8") {
          const topic = heTopic(subject);
          if (topic) return clipTitle("\u05DC\u05D7\u05D6\u05D5\u05E8 \u05D1\u05E0\u05D5\u05E9\u05D0 " + topic);
        }
        const sub = cleanSubject(subject);
        if (sub && !weakSubject(sub) && !genericFollowSubject(sub) && !/^בהמשך\b/.test(sub) && sub !== "\u05DC\u05E2\u05E6\u05DE\u05D9") {
          const title = clipTitle(verb + " " + sub);
          if (title.split(/\s+/).length >= 2) return title;
        }
        return "";
      }
      function titleAfter(verb, match, src, subject, opts) {
        const rest = src.slice(match.index + match[0].length);
        let useVerb = verb;
        let keepThe = Boolean(opts && opts.keepThe) || verb === "Fill out" || verb === "Confirm" || verb === "Save" || verb === "\u05DC\u05E9\u05DE\u05D5\u05E8" || verb === "Book" || verb === "Order" || verb === "Renew" || verb === "Notify" || verb === "Create" || verb === "Keep" || verb === "Store" || verb === "Share" || verb === "Forward" || verb === "Email" || verb === "Send" || verb === "\u05DC\u05D4\u05D6\u05DE\u05D9\u05DF" || verb === "\u05DC\u05D4\u05D7\u05D6\u05D9\u05E8" || verb === "\u05DC\u05D7\u05D3\u05E9" || verb === "\u05DC\u05E9\u05DC\u05D5\u05D7" || verb === "\u05DC\u05E7\u05D1\u05DC" || verb === "\u05DC\u05E6\u05E8\u05E3";
        if (verb === "Reply" && /^\s*with\b/i.test(rest)) {
          useVerb = "Send";
          keepThe = true;
        }
        let obj = shapeHeObject(useVerb, takeObject(rest, keepThe));
        if (!obj || weakObject(obj)) obj = shapeHeObject(useVerb, takeObject(earlierNoun(src, match.index), keepThe));
        if (opts && opts.pay && (weakObject(obj) || /^payment of\b/i.test(obj))) obj = moneyPhrase(src) || obj;
        return joinTitle(useVerb, obj, subject, Object.assign({ src }, opts || {}));
      }
      function firstOf(src, regs) {
        let best = null;
        for (let i = 0; i < regs.length; i++) {
          const m = src.match(regs[i]);
          if (!m || m.index == null) continue;
          if (!best || m.index < best.index) best = m;
        }
        return best;
      }
      const NOT_CALLEE = /^(?:you|me|us|her|him|them|she|he|they|it|the|a|an|tomorrow|today|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|eod|asap|next|this|on|at|by|for|and|back|please|day|week|time|morning|afternoon|evening|is|was|last|following|our|january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)$/i;
      function callTitle(src, subject) {
        const main = withoutIfClause(src);
        if (/להחזיר(?:י|ו)?\s+לי\s+טלפון/.test(main)) {
          return joinTitle("\u05DC\u05D4\u05EA\u05E7\u05E9\u05E8", "", subject, { phoneHe: true, src: main });
        }
        const re = /\bcal(?:l)?\s+(?:(the|a|an)\s+)?([A-Za-z][A-Za-z'’-]{1,40})\b/gi;
        let m;
        let picked = null;
        while (m = re.exec(main)) {
          if (NOT_CALLEE.test(m[2])) continue;
          picked = m;
        }
        if (!picked) return "";
        const article = picked[1] ? picked[1].toLowerCase() : "";
        let name = picked[2];
        if (article) name = name.toLowerCase();
        else if (name.charAt(0) === name.charAt(0).toLowerCase()) name = name.charAt(0).toUpperCase() + name.slice(1);
        return "Call" + (article ? " " + article : "") + " " + name;
      }
      function callAboutSubject(src, subject) {
        const raw = withoutIfClause(String(src || ""));
        if (/\bcall you\b/i.test(raw)) return "";
        if (/\b(?:i|we)(?:'|’)?ll\s+join\s+(?:the\s+)?call\b/i.test(raw)) return "";
        if (/\b(?:i|we)\s+will\s+join\s+(?:the\s+)?call\b/i.test(raw)) return "";
        if (/\bper our (?:call|chat)\b/i.test(raw)) return "";
        const bare = /\b(?:need to|have to|remember to|reminder to|please|gotta|time to|must)\s+call\b/i.test(raw) || /^(?:please\s+)?call(?:\s+(?:tomorrow|today|tonight|back|soon|asap))?(?:[.!]|$)/i.test(raw.trim()) || /\b(?:gimme|give me)\s+a\s+call\b/i.test(raw) || /\bhop on a call\b/i.test(raw);
        if (!bare) return "";
        const topic = callTopicPhrase(raw, subject);
        if (!topic) return "";
        if (/[\u0590-\u05FF]/.test(raw) || /[\u0590-\u05FF]/.test(topic)) {
          return clipTitle("\u05E9\u05D9\u05D7\u05D4 \u05D1\u05E0\u05D5\u05E9\u05D0 " + topic);
        }
        return clipTitle("Call about " + topic);
      }
      function callSubjectPhrase(subject) {
        return cleanSubject(subject).replace(/[.?!,]+$/g, "").replace(/\s+/g, " ").trim();
      }
      function dirtyCallTopic(phrase) {
        const s = String(phrase || "").replace(/\s+/g, " ").trim();
        if (!s || weakSubject(s) || genericFollowSubject(s)) return true;
        if (/@/.test(s) || /\b[a-z0-9-]+\.[a-z]{2,}\b/i.test(s)) return true;
        if (/^(?:let'?s|let us|please|could you|can we|shall we)\b/i.test(s)) return true;
        if (/^(?:it|this|that|these|those|them|him|her|זה|זאת|זו|אותו|אותה|את זה|הזה)$/i.test(s)) return true;
        if (/^(?:meeting request)$/i.test(s)) return true;
        if (/^call$/i.test(s)) return true;
        if (/^(?:hello|hi|hey|dear)\b/i.test(s)) return true;
        if (/^invoice\b/i.test(s)) return true;
        return false;
      }
      function tidyCallTopic(phrase) {
        return String(phrase || "").replace(EN_DATE_TAIL, "").replace(AT_CLOCK, "").replace(HE_DATE_TAIL, "").replace(/[.?!,]+$/g, "").replace(/\s+/g, " ").trim();
      }
      function topicFromBody(text) {
        const raw = String(text || "");
        const patterns = [
          /\babout\s+([^.\n?!,]+)/gi,
          /בנושא\s+([^.\n?!,]+)/g,
          /(?:^|[^\u0590-\u05FF])על\s+(?!call\b|שיחה|פגישה)([^.\n?!,]+)/g
        ];
        let picked = "";
        for (let i = 0; i < patterns.length; i++) {
          const re = patterns[i];
          let m;
          while (m = re.exec(raw)) {
            const phrase = tidyCallTopic(m[1]);
            if (!dirtyCallTopic(phrase)) picked = phrase;
          }
        }
        return picked;
      }
      function topicFromSubject(subject) {
        let sub = callSubjectPhrase(subject);
        if (/[\u0590-\u05FF]/.test(sub)) sub = heTopic(sub);
        if (dirtyCallTopic(sub)) return "";
        return sub;
      }
      function callClockPhrase(text) {
        const raw = String(text || "");
        let m = raw.match(/\b(tomorrow|today|tonight)\b(?:\s+at)?\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
        if (!m) m = raw.match(/\b((?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b(?:\s+at)?\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
        if (!m) return "";
        const day = /^(?:tomorrow|today|tonight)$/i.test(m[1]) ? m[1].toLowerCase() : m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();
        return day + " " + m[2].replace(/\s+/g, "");
      }
      function shortMonth(name) {
        const key = String(name || "").toLowerCase();
        const map = {
          january: "Jan",
          jan: "Jan",
          february: "Feb",
          feb: "Feb",
          march: "Mar",
          mar: "Mar",
          april: "Apr",
          apr: "Apr",
          may: "May",
          june: "Jun",
          jun: "Jun",
          july: "Jul",
          jul: "Jul",
          august: "Aug",
          aug: "Aug",
          september: "Sep",
          sep: "Sep",
          sept: "Sep",
          october: "Oct",
          oct: "Oct",
          november: "Nov",
          nov: "Nov",
          december: "Dec",
          dec: "Dec"
        };
        return map[key] || "";
      }
      function callMonthPhrase(text) {
        const raw = String(text || "");
        const mon = "january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec";
        const m = raw.match(new RegExp("\\b(" + mon + ")\\b\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+at)?\\s+(\\d{1,2}(?::\\d{2})?\\s*(?:am|pm)?)", "i"));
        if (!m) return "";
        const short = shortMonth(m[1]);
        if (!short) return "";
        return short + " " + String(m[2]) + " " + m[3].replace(/\s+/g, "");
      }
      function withoutIfClause(blob) {
        let s = String(blob || "");
        s = s.replace(/(?:^|[\n,])\s*אם(?:\s[^,\n]*)?/g, " ");
        s = s.replace(/(?:^|[\n,])\s*\b(?:if|when)\b[^,\n]*/gi, " ");
        s = s.replace(/(^|[^\n,])\s+\bif\b[^,\n]*/gi, "$1 ");
        return s;
      }
      function undecidedAnywhere(blob) {
        const s = String(blob || "");
        if (/עוד לא הוחלט/.test(s)) return true;
        if (/\bnothing (?:has been |was |is )?decided\b/i.test(s)) return true;
        if (/\bno decision yet\b/i.test(s)) return true;
        if (/\bnot decided yet\b/i.test(s)) return true;
        if (/\bTBD\b/i.test(s)) return true;
        return false;
      }
      function mainIsModal(main) {
        let s = String(main || "").replace(/^[\s,.:;–—-]+/, "");
        s = s.replace(/^\d[\d.,]*\s*,\s*/, "").replace(/^[\s,.:;–—-]+/, "");
        if (/^נוכל(?![\u0590-\u05FF])/.test(s)) return true;
        if (/^(?:we|i|you|they)\s+(?:could|can|might)\b/i.test(s)) return true;
        if (/^might\b/i.test(s)) return true;
        return false;
      }
      function mainIsExplicitAction(main) {
        const s = String(main || "");
        if (/\b(?:call|ring|send|pay|review|book|file|share|forward|attach|reply|confirm|approve|sign|email|upload|prepare|order|renew|notify|wire|transfer)\b/i.test(s)) return true;
        if (/להתקשר|לשלוח|לשלם|לחתום|לאשר|להעביר|להכין|למלא|לבדוק|לעדכן|לצרף|להגיש|לשמור|לחדש|להעלות|לחזור|להזמין|לסגור|לסרוק|להחזיר|לקבוע|תשלח|תתקשר/.test(s)) return true;
        return false;
      }
      function conditionalMainIsNotAction(blob) {
        const lines = String(blob || "").split(/\n/);
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].replace(/^[\s\u00a0]+/, "");
          if (!line) continue;
          if (/^if you have received\b/i.test(line) || /^אם קיבלת/.test(line)) continue;
          if (!(/^(?:if|when|unless)\b/i.test(line) || /^אם/.test(line))) continue;
          const main = withoutIfClause(line);
          if (mainIsModal(main)) return true;
          if (!mainIsExplicitAction(main)) return true;
        }
        return false;
      }
      function callWhenPhrase(text) {
        const clock = callClockPhrase(text);
        if (clock) return clock;
        const month = callMonthPhrase(text);
        if (month) return month;
        const raw = String(text || "");
        let m = raw.match(/\b(tomorrow|today|tonight)\b/i);
        if (m) return m[1].toLowerCase();
        m = raw.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
        if (!m) return "";
        const day = m[1];
        return day.charAt(0).toUpperCase() + day.slice(1).toLowerCase();
      }
      function ownCalleeTokens(ctx) {
        const set = { sali: 1, sapan: 1 };
        function add(name) {
          String(name || "").split(/[\s,|]+/).forEach(function(word) {
            const key = word.toLowerCase().replace(/[^a-z\u0590-\u05FF'-]/g, "");
            if (key) set[key] = 1;
          });
        }
        if (ctx && typeof ctx === "object") {
          add(ctx.userName);
          if (Array.isArray(ctx.ownNames)) ctx.ownNames.forEach(add);
          if (ctx.sender && ctx.sender.name) add(ctx.sender.name);
          add(ctx.senderName);
        }
        return set;
      }
      const CALLEE_SKIP = /^(?:her|him|them|you|me|us|she|he|they|if|when|unless|call|ring|please|monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today|tonight|january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec|thank|thanks|best|regards|sent|from|image|logo|account|manager|confidentiality|notice|dear|hello|hi|hey|re|fwd|subject|northwind)$/i;
      function personNamesIn(text, ctx) {
        const own = ownCalleeTokens(ctx);
        const head = String(text || "").split(/\n\s*(?:thank you|thanks|best regards|best,|regards,|cheers|sent from|many thanks|\[image)/i)[0];
        const re = /\b([A-Z][a-z][A-Za-z'’-]{0,40})\b/g;
        const names = [];
        const seen = {};
        let m;
        while (m = re.exec(head)) {
          const word = m[1];
          if (CALLEE_SKIP.test(word) || own[word.toLowerCase()]) continue;
          if (/^(?:I'll|I've|I'm|I'd|We're|We'll|Don't|Let's|Can't|Won't)$/.test(word)) continue;
          const key = word.toLowerCase();
          if (seen[key]) continue;
          seen[key] = 1;
          names.push(word);
        }
        return names;
      }
      function calleeFromBody(text, ctx) {
        const names = personNamesIn(text, ctx);
        return names.length ? names[names.length - 1] : "";
      }
      function pronounCalleeTitle(src, ctx) {
        const full = String(src || "");
        const main = withoutIfClause(full);
        const hit = main.match(/\b(?:call|ring)\s+(her|him|them|you|me|us)\b/i);
        if (!hit) return "";
        const pronoun = hit[1].toLowerCase();
        const names = personNamesIn(full, ctx);
        if ((pronoun === "her" || pronoun === "him") && names.length === 1) return "Call " + names[0];
        const when = callWhenPhrase(main);
        if (when) return clipTitle("Call " + when);
        return "";
      }
      function callTopicPhrase(text, subject) {
        return topicFromBody(text) || topicFromSubject(subject);
      }
      function haveACallTitle(text, ctx, whenText) {
        const main = withoutIfClause(String(text || ""));
        if (!/\bhave a call\b/i.test(main)) return "";
        const box = ctx && typeof ctx === "object" ? ctx : { subject: ctx };
        const topic = callTopicPhrase(main, box.subject);
        if (topic) return clipTitle("Call about " + topic);
        if (!addressedToSelf(box)) {
          const name = String(box.senderName || "").trim();
          if (name && name.indexOf("@") < 0 && !/^me$/i.test(name)) return clipTitle("Call with " + name);
        }
        const when = String(whenText || "").replace(/\s+/g, " ").trim();
        return clipTitle(when ? "Call " + when : "Call");
      }
      const SELF_EN_VERBS = [
        [/\bshoot me\b/i, "Send"],
        [/\bfill out\b/i, "Fill out"],
        [/\bfill in\b/i, "Fill out"],
        [/\bloop in\b/i, "Loop in"],
        [/\bsign-?off\b/i, "Sign off"],
        [/\bresend\b/i, "Resend"],
        [/\bupload\b/i, "Upload"],
        [/\bprepare\b/i, "Prepare"],
        [/\bconfirm\b/i, "Confirm"],
        [/\bapprove\b/i, "Approve"],
        [/\bupdate\b/i, "Update"],
        [/\breply\b/i, "Reply"],
        [/\bsave\b/i, "Save"],
        [/\b(?:need to|have to|remember to|please|i will|we'll|i'll|we will)\s+bo+k[o]?\b/i, "Book"],
        [/\bbook\b/i, "Book"],
        [/\border\b/i, "Order"],
        [/\b(?:need to|have to|remember to|please|i will|we'll|i'll|we will)\s+order\b/i, "Order"],
        [/\b(?:need to|have to|remember to|please|i will|we'll|i'll|we will)\s+renew\b/i, "Renew"],
        [/\b(?:need to|have to|remember to|please|i will|we'll|i'll|we will)\s+book\b/i, "Book"],
        [/\b(?:need to|have to|remember to|please|i will|we'll|i'll|we will)\s+notify\b/i, "Notify"],
        [/\b(?:need to|have to|remember to|please)\s+create\b/i, "Create"],
        [/\b(?:need to|have to|remember to|please)\s+keep\b/i, "Keep"],
        [/\b(?:need to|have to|remember to|please)\s+store\b/i, "Store"],
        [/\bshar(?:e|ing)\b/i, "Share"],
        [/\be-?mail\b/i, "Email"],
        [/\bforward\b/i, "Forward"],
        [/\bsend\b/i, "Send"],
        [/\bsign\b/i, "Sign"],
        [/\bscan\b/i, "Scan"],
        [/\bfile\b/i, "File"]
      ];
      const SELF_HE_VERBS = [
        [/אני צריך(?:ה|ים)? ממך/, "\u05DC\u05E9\u05DC\u05D5\u05D7"],
        [/לשלוח|תשלח(?:י|ו)?(?![\u0590-\u05FF])/, "\u05DC\u05E9\u05DC\u05D5\u05D7"],
        [/להעביר|תעביר(?:י|ו)?(?![\u0590-\u05FF])|מעביר(?:ה|ים|ות)?(?![\u0590-\u05FF])/, "\u05DC\u05D4\u05E2\u05D1\u05D9\u05E8"],
        [/להכין|תכינ(?:י|ו)?(?![\u0590-\u05FF])|תכין(?![\u0590-\u05FF])/, "\u05DC\u05D4\u05DB\u05D9\u05DF"],
        [/למלא|תמלא(?:י|ו)?(?![\u0590-\u05FF])/, "\u05DC\u05DE\u05DC\u05D0"],
        [/לחזור|תחזור(?![\u0590-\u05FF])|תחזרי(?![\u0590-\u05FF])|תחזרו(?![\u0590-\u05FF])/, "\u05DC\u05D7\u05D6\u05D5\u05E8"],
        [/להעלות|תעלה(?![\u0590-\u05FF])|תעלי(?![\u0590-\u05FF])|תעלו(?![\u0590-\u05FF])/, "\u05DC\u05D4\u05E2\u05DC\u05D5\u05EA"],
        [/לאשר|תאשר(?:י|ו)?(?![\u0590-\u05FF])|(?<![\u0590-\u05FF])אשר(?![\u0590-\u05FF])/, "\u05DC\u05D0\u05E9\u05E8"],
        [/לדכן(?![\u0590-\u05FF])/, "\u05DC\u05E2\u05D3\u05DB\u05DF"],
        [/להגיש|תגיש(?![\u0590-\u05FF])/, "\u05DC\u05D4\u05D2\u05D9\u05E9"],
        [/לעדכן|תעדכ(?:ן|נ(?:י|ו)?)(?![\u0590-\u05FF])/, "\u05DC\u05E2\u05D3\u05DB\u05DF"],
        [/להשלים|יש להשלים/, "\u05DC\u05D4\u05E9\u05DC\u05D9\u05DD"],
        [/לסרוק|תסרק(?:י|ו)?(?![\u0590-\u05FF])/, "\u05DC\u05E1\u05E8\u05D5\u05E7"],
        [/לשמור|תשמור(?:י|ו)?(?![\u0590-\u05FF])|שמור(?![\u0590-\u05FF])/, "\u05DC\u05E9\u05DE\u05D5\u05E8"],
        [/(?<=^|[^\u0590-\u05FF])שלח(?:י|ו)?(?![\u0590-\u05FF])/, "\u05DC\u05E9\u05DC\u05D5\u05D7"],
        [/(?<=^|[^\u0590-\u05FF])לקבל(?![\u0590-\u05FF])/, "\u05DC\u05E7\u05D1\u05DC"],
        [/(?<=^|[^\u0590-\u05FF])לצרף(?![\u0590-\u05FF])/, "\u05DC\u05E6\u05E8\u05E3"],
        [/להתקשר|תתקשר(?:י|ו)?(?![\u0590-\u05FF])/, "\u05DC\u05D4\u05EA\u05E7\u05E9\u05E8"],
        [/להזמין|תזמינ(?:י|ו)?(?![\u0590-\u05FF])/, "\u05DC\u05D4\u05D6\u05DE\u05D9\u05DF"],
        [/להחזיר|תחזיר(?:י|ו)?(?![\u0590-\u05FF])/, "\u05DC\u05D4\u05D7\u05D6\u05D9\u05E8"],
        [/לסגור|תסגור(?:י|ו)?(?![\u0590-\u05FF])/, "\u05DC\u05E1\u05D2\u05D5\u05E8"],
        [/לחדש|תחדש(?:י|ו)?(?![\u0590-\u05FF])/, "\u05DC\u05D7\u05D3\u05E9"]
      ];
      function badSelfTitle(label) {
        const t = String(label || "").trim();
        if (/^Follow up on\b/i.test(t)) return true;
        if (/לעקוב אחרי\s+(?:זה|לעצמי|בהמשך)\b/.test(t)) return true;
        if (/להתקשר את/.test(t)) return true;
        if (/את גבי/.test(t)) return true;
        if (/לבדוק ל-/.test(t)) return true;
        if (/^["“”'«„]/.test(t)) return true;
        if (/^(?:תזכורת|בבקשה|אפשר|מחכים ל|מחכה ל|עדיין חסר|יש מצב|אני אגיע|אנחנו בפנים|לזכור |סיכמנו |הבטחתי |רק משהו|מה דעתך|can i get\b)/i.test(t)) return true;
        if (/[?!]/.test(t)) return true;
        if (/(?<!\d)\.(?![\w\u0590-\u05FF-])/.test(t) || /\.$/.test(t)) return true;
        return false;
      }
      function selfFollowTitle() {
        return "";
      }
      function heWhenPhrase(src) {
        const day = String(src || "").match(/ביום\s+([\u0590-\u05FF]+)/);
        const clock = String(src || "").match(/(?:בשעה\s+|ב-)(\d{1,2}:\d{2})/);
        if (!day) return "";
        return "\u05D1\u05D9\u05D5\u05DD " + day[1] + (clock ? " " + clock[1] : "");
      }
      function selfBodyTitle(src) {
        const t = String(src || "");
        const call = t.match(/להתקשר\s+ל([^\s.,!?]{1,24})/);
        if (call) return "\u05DC\u05D4\u05EA\u05E7\u05E9\u05E8 \u05DC" + call[1];
        const about = t.match(/(?:לעדכן|תעדכ[נן][ייו]?|לדכן)\s+(?:אותי\s+)?לגבי\s+(ה[\u0590-\u05FF]+)/);
        if (about) return "\u05DC\u05E2\u05D3\u05DB\u05DF \u05DC\u05D2\u05D1\u05D9 " + about[1];
        const review = t.match(/\breview\s+ל-([A-Za-z][\w-]*)/i);
        if (review) return "\u05DC\u05D1\u05D3\u05D5\u05E7 \u05D0\u05EA \u05D4-" + review[1];
        const status = t.match(/פגישת\s+([\u0590-\u05FF]{2,20})(?:\s+קצרה)?/);
        if (status && heWhenPhrase(t)) return "\u05E4\u05D2\u05D9\u05E9\u05EA " + status[1] + " " + heWhenPhrase(t);
        const meet = t.match(/(?:לפגישה|פגישה)(?!\s+סטטוס)/);
        if (meet && /ביום/.test(t) && heWhenPhrase(t) && !/פגישת/.test(t)) return "\u05E4\u05D2\u05D9\u05E9\u05D4 " + heWhenPhrase(t);
        const demo = t.match(/לדמו/);
        if (demo && heWhenPhrase(t)) return "\u05D3\u05DE\u05D5 " + heWhenPhrase(t);
        const book = t.match(/\b(?:need to\s+)?bo+k[o]?\s+(?:the\s+)?(venue|room|hall)\b/i);
        if (book) return "Book the " + book[1].toLowerCase();
        const shareOrder = t.match(/\bshare\s+(the\s+(?:purchase|sales|work)\s+order)\s+(by\s+[A-Za-z]+\s+\d{1,2})\b/i);
        if (shareOrder) return "Share " + shareOrder[1].replace(/\s+/g, " ") + " " + shareOrder[2].replace(/\s+/g, " ");
        const sendOrder = t.match(/\bsend\s+(?:(?:me|him|her|them|you|us|tom)\s+)?(the\s+(?:purchase|sales|work)\s+order)(?:\s+(by\s+[A-Za-z]+(?:\s+\d{1,2})?))?/i);
        if (sendOrder) return "Send " + sendOrder[1].replace(/\s+/g, " ") + (sendOrder[2] ? " " + sendOrder[2].replace(/\s+/g, " ") : "");
        const typoSend = t.match(/\b(?:sedn|sned|snd)\s+(?:(?:me|him|her|them|you|us)\s+)?(.+)/i);
        if (typoSend && !/\blattest\b/i.test(typoSend[1])) {
          let rest = typoSend[1].replace(/[.!?].*$/, " ").replace(/\s+/g, " ").trim();
          rest = rest.replace(/\s+\b(?:back|over)\b/ig, " ").replace(/\s+/g, " ").trim();
          const by = rest.match(/^(.*?)\s+(by\s+\S+(?:\s+\d{1,2})?)\b/i);
          let obj = (by ? by[1] : rest).replace(/\s+(?:next|on|before|until|tomorrow|today|eod|asap)\b[\s\S]*$/i, "").trim();
          const when = by ? by[2].replace(/\s+/g, " ").trim() : "";
          if (obj && !/^(?:the|a|an|to)$/i.test(obj)) return "Send " + obj + (when ? " " + when : "");
        }
        if (/\bset up a sync\b/i.test(t) && !/\babout\b/i.test(t)) return "Set up a sync";
        const setup = t.match(/\bset\s+up\s+((?:a|the)\s+)?(.+)/i);
        if (setup) {
          let obj = setup[2].replace(EN_DATE_TAIL, "").replace(AT_CLOCK, "").replace(/[.?!].*$/, "").replace(/\s+\b(?:for|at|on|by|about|with|before|until)\b$/i, "").replace(/\s+/g, " ").trim();
          if (obj && !/^(?:a|the|an)$/i.test(obj)) return "Set up " + (setup[1] ? setup[1].toLowerCase() : "") + obj;
        }
        const loopIn = t.match(/\bloop\s+in\s+([A-Za-z]+)\s+on\s+(the\s+\S+\s+order)\b/i);
        if (loopIn) return "Loop in " + loopIn[1].toLowerCase() + " on " + loopIn[2].replace(/\s+/g, " ");
        const moved = t.match(/\bmoving\s+forward\s+with\s+([A-Za-z][\w.&'-]*)\s+at\s+(\$\s?[\d,]+(?:\.\d+)?)/i);
        if (moved) return "Log " + moved[1] + " at " + moved[2].replace(/\s+/g, "");
        const order = t.match(/(?<!\b(?:purchase|sales|work|the|an|a|in)\s)\border\s+(.+?)(?:\s+(?:before|by|on|until|till|tomorrow|today|next|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|[.?!]|$)/i);
        if (order) {
          const obj = order[1].replace(/\s+/g, " ").trim();
          if (obj && !/^(?:to|the|a|an|by|for|on|at)$/i.test(obj)) return "Order " + obj;
        }
        const over = t.match(/\bto go over\s+(the\s+[A-Za-z0-9][\w]*(?:\s+[A-Za-z0-9][\w]*){0,4})/i);
        if (over && /\bmeet\b/i.test(t)) return "Meet about " + over[1].replace(/\s+/g, " ").trim();
        const interview = t.match(/\binterview\b(?:\s+[a-z]+){0,4}?\s+((?:next\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december)(?:\s+\d{1,2})?)\s+at\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
        if (interview) return "Interview " + interview[1].replace(/^next\s+/i, "") + " " + interview[2].replace(/\s+/g, "");
        if (/\bsve\b/i.test(t) && /\battachment\b/i.test(t) && /\bdrive\b/i.test(t)) return "Save attachment to Drive";
        const sent = t.match(/\b(?:sedn|send)\s+(?:me\s+)?(?:the\s+)?lattest\s+([a-z][\w]*)/i);
        if (sent) return "Send the latest " + sent[1].toLowerCase();
        const placed = t.match(/\b(put|add)\s+(?:the\s+)?([a-z][\w]*(?:\s+[a-z][\w]*)?)\s+(?:on|to)\s+(?:my\s+|the\s+)?(calendar|task)\b/i);
        if (placed) {
          const noun = placed[2].replace(/\s+/g, " ").trim();
          if (placed[3].toLowerCase() === "calendar" && /^put$/i.test(placed[1])) return "Put " + noun + " on calendar";
          if (placed[3].toLowerCase() === "task") return "Add the " + noun + " to the task";
          return "Put " + noun + " on calendar";
        }
        const syncAbout = t.match(/\bsync\b[\s\S]{0,80}?\babout\s+((?:the\s+)?[A-Za-z0-9][\w-]*(?:\s+[A-Za-z0-9][\w-]*){0,4})/i);
        if (syncAbout) {
          const obj = syncAbout[1].replace(/\s+(?:cheers|thanks|thank\s+you|best|regards|many\s+thanks)\b[\s\S]*$/i, "").replace(/\s+is\b[\s\S]*$/i, "").replace(/\s+/g, " ").trim();
          if (obj) return "Sync about " + obj;
        }
        const approve = t.match(/(?<![\u0590-\u05FF])אשר\s+את\s+([\u0590-\u05FF]+(?:\s+[\u0590-\u05FF]+){0,4})/);
        if (approve) {
          const obj = approve[1].replace(/\s+עד(?:\s|$).*$/, "").trim();
          if (obj) return "\u05DC\u05D0\u05E9\u05E8 \u05D0\u05EA " + obj;
        }
        return "";
      }
      function softenTypos(src) {
        return String(src || "").replace(/\bpepare\b/ig, "prepare").replace(/\breivew\b/ig, "review").replace(/\btranser\b/ig, "transfer").replace(/\bbeofre\b/ig, "before").replace(/\breenew\b/ig, "renew").replace(/למאל/g, "\u05DC\u05DE\u05DC\u05D0").replace(/מעברי/g, "\u05DE\u05E2\u05D1\u05D9\u05E8").replace(/\baproved\b/ig, "approved").replace(/\btis morning\b/ig, "this morning").replace(/לחשד את הדררכון/g, "\u05DC\u05D7\u05D3\u05E9 \u05D0\u05EA \u05D4\u05D3\u05E8\u05DB\u05D5\u05DF").replace(/הדררכון/g, "\u05D4\u05D3\u05E8\u05DB\u05D5\u05DF").replace(/לעעדכן/g, "\u05DC\u05E2\u05D3\u05DB\u05DF").replace(/פלויסת/g, "\u05E4\u05D5\u05DC\u05D9\u05E1\u05EA").replace(/להזמןי/g, "\u05DC\u05D4\u05D6\u05DE\u05D9\u05DF").replace(/לגיש/g, "\u05DC\u05D4\u05D2\u05D9\u05E9").replace(/הדחו/g, "\u05D4\u05D3\u05D5\u05D7").replace(/להמזין/g, "\u05DC\u05D4\u05D6\u05DE\u05D9\u05DF").replace(/ללוח את/g, "\u05DC\u05E9\u05DC\u05D5\u05D7 \u05D0\u05EA").replace(/להעלת/g, "\u05DC\u05D4\u05E2\u05DC\u05D5\u05EA").replace(/להעות/g, "\u05DC\u05D4\u05E2\u05DC\u05D5\u05EA").replace(/לשל את/g, "\u05DC\u05E9\u05DC\u05DD \u05D0\u05EA").replace(/האסכמתא/g, "\u05D4\u05D0\u05E1\u05DE\u05DB\u05EA\u05D0").replace(/להעבה/g, "\u05DC\u05D4\u05E2\u05D1\u05E8\u05D4").replace(/היוום/g, "\u05D4\u05D9\u05D5\u05DD");
      }
      function selfCallCancelled(text) {
        return /בולה/.test(String(text || "")) && /(?:call|שיחה|פגישה)/i.test(String(text || ""));
      }
      const SELF_DONE_MARK = /\balready\b|^\s*done\b|\b(?:all|it(?:'|’)s|is|are|i(?:'|’)m|i am|i(?:'|’)ve|i have)\s+done\b|(?:^|[^\u0590-\u05FF])(?:כבר|בוצע|בוצעה|סיימתי)(?![\u0590-\u05FF])/i;
      const SELF_FUTURE_CUE = new RegExp([
        "\\b(?:remind me|remember to|don'?t forget|need to|needs to|have to|has to|must|should|i(?:'|\u2019)ll|i will|we(?:'|\u2019)ll|we will|i(?:'|\u2019)m going to|going to|will|to-?do|tomorrow|tonight|later|please|pls)\\b",
        "\\b(?:next|this)\\s+(?:week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\\b",
        "\\b(?:on|by|before)\\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\\b",
        "(?:^|[^\\u0590-\\u05FF])(?:\u05EA\u05D6\u05DB\u05D9\u05E8(?:\u05D9|\u05D5)?\\s+\u05DC\u05D9|\u05EA\u05D6\u05DB\u05D5\u05E8(?:\u05D9|\u05D5)?|\u05DC\u05D0\\s+\u05DC\u05E9\u05DB\u05D5\u05D7|\u05D0\u05DC\\s+\u05EA\u05E9\u05DB\u05D7(?:\u05D9|\u05D5)?|\u05E6\u05E8\u05D9\u05DA|\u05E6\u05E8\u05D9\u05DB\u05D4|\u05D7\u05D9\u05D9\u05D1|\u05D7\u05D9\u05D9\u05D1\u05EA|\u05D0\u05E6\u05D8\u05E8\u05DA|\u05DE\u05D7\u05E8|\u05D4\u05E2\u05E8\u05D1|\u05D1\u05E9\u05D1\u05D5\u05E2 \u05D4\u05D1\u05D0|\u05D1\u05D7\u05D5\u05D3\u05E9 \u05D4\u05D1\u05D0|\u05D0\u05D7\u05E8 \u05DB\u05DA|\u05D1\u05D4\u05DE\u05E9\u05DA)(?![\\u0590-\\u05FF])",
        "(?:^|[^\\u0590-\\u05FF])(?:\u05D0\u05E0\u05D9\\s+)?\u05D0(?:\u05E9\u05DC\u05D7|\u05D7\u05D3\u05E9|\u05E9\u05DC\u05DD|\u05EA\u05E7\u05E9\u05E8|\u05E2\u05E9\u05D4|\u05D1\u05D3\u05D5\u05E7|\u05E7\u05D1\u05E2|\u05E2\u05D3\u05DB\u05DF|\u05D6\u05DB\u05D5\u05E8|\u05E1\u05D2\u05D5\u05E8|\u05E2\u05D1\u05D9\u05E8|\u05DB\u05D9\u05DF|\u05E6\u05D5\u05E8|\u05E4\u05EA\u05D7|\u05D7\u05D6\u05D5\u05E8|\u05D6\u05DE\u05D9\u05DF|\u05E9\u05DE\u05D5\u05E8)(?![\\u0590-\\u05FF])"
      ].join("|"), "i");
      function selfKeepsDoneTask(blob) {
        const s = String(blob || "");
        if (/\bget it done\b/i.test(s)) return true;
        if (/\bneeds to be done\b/i.test(s)) return true;
        if (/\bto be done\b/i.test(s)) return true;
        if (/\bdone\s+(?:by|before|until|on|in)\b/i.test(s)) return true;
        if (/צריך\s+לבצע/.test(s)) return true;
        return false;
      }
      function selfCompletionMarked(blob) {
        const s = String(blob || "");
        if (SELF_DONE_MARK.test(s)) return true;
        if (/\b[a-z][a-z-]+\s+done\b(?!\s+(?:by|before|until|on|in)\b)/i.test(s)) return true;
        if (/\b(?:completed|renewed|paid)\b/i.test(s)) return true;
        if (/(?:^|[^\u0590-\u05FF])(?:הושלם|בוצע)(?![\u0590-\u05FF])/.test(s)) return true;
        return false;
      }
      function selfPastDone(raw) {
        const blob = String(raw || "");
        if (selfKeepsDoneTask(blob)) return false;
        if (!selfCompletionMarked(blob)) return false;
        return !SELF_FUTURE_CUE.test(blob);
      }
      function pastSentenceTitle(t) {
        return /^(?:i|we)\s+(?:already\s+|just\s+)?(?:\w+ed|sent|paid|did|made|got|bought|had|was|were|have|has|took|gave|wrote|booked|called)\b/i.test(t) || /^(?:כבר\s+)?[\u0590-\u05FF]+תי(?![\u0590-\u05FF])/.test(t) || /^(?:כבר|בוצע|בוצעה)(?![\u0590-\u05FF])/.test(t) || /^(?:already|done)\b/i.test(t);
      }
      const DECISION_NAME = "([A-Z][\\w&.\\-]*(?:[ \\t]+(?!(?:is|are|was|will|as|at|for|to|and|our|the)\\b)[A-Z][\\w&.\\-]*){0,2})";
      const SIGNOFF_TAIL = /(?:^|[\s,.!;:\-])(?:תודה(?:\s+רבה)?|בתודה|בברכה|ברכה|יום\s+(?:טוב|נעים)|המשך\s+יום|שבוע\s+(?:טוב|נעים)|thanks|thank\s+you|many\s+thanks|regards|kind\s+regards|cheers|sincerely|cordially|best(?:\s+regards)?[ \t]*[,.!]?[ \t]*$)(?![\u0590-\u05FFA-Za-z]).*$/i;
      function selfDecisionTitle(raw, facts) {
        const money = facts && facts.moneyText ? ", " + String(facts.moneyText).trim() : "";
        const lines = String(raw || "").replace(/\u00A0/g, " ").split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
          const t = lines[i].replace(SIGNOFF_TAIL, "").replace(/[ \t]+/g, " ").trim();
          if (!t) continue;
          let m = t.match(new RegExp("(?:^|[.!]\\s*)(?:[Ff]inal[ \\t]+)?[Dd]ecision(?:[ \\t]+[Mm]ade)?[ \\t]*[:\\-\u2013][ \\t]*" + DECISION_NAME));
          if (!m) m = t.match(new RegExp("\\b(?:[Ww]e(?:'|\u2019)re|[Ww]e are|[Ii](?:'|\u2019)m|[Ii] am)[ \\t]+going[ \\t]+with[ \\t]+" + DECISION_NAME));
          if (!m) m = t.match(new RegExp("\\b(?:[Ww]e|[Ii])[ \\t]+(?:decided|chose|picked|selected)[ \\t]+(?:on[ \\t]+|to go with[ \\t]+|to use[ \\t]+)?" + DECISION_NAME));
          if (m) return clipDecision("Decision: " + m[1].trim() + money);
          const he = t.match(/(?:^|[^\u0590-\u05FF])(?:הוחלט|החלטנו|החלטתי)(?:[ \t]+סופית)?[ \t]+(?:על|ש(?:ניקח|נבחר|נעבוד עם))[ \t]*([\u0590-\u05FF][\u0590-\u05FF'"״׳\-]*(?:[ \t]+[\u0590-\u05FF][\u0590-\u05FF'"״׳\-]*)?)/);
          if (he) return clipDecision("\u05D4\u05D7\u05DC\u05D8\u05D4: " + he[1].trim() + money);
        }
        return "";
      }
      function clipDecision(title) {
        return title.split(/\s+/).slice(0, 6).join(" ");
      }
      function usableSelfTitle(label) {
        const t = String(label || "").trim();
        if (!t) return false;
        if (t.split(/\s+/).filter(Boolean).length < 2) return false;
        if (badSelfTitle(t)) return false;
        if (/[?]/.test(t)) return false;
        if (/^(?:could you|would you|can you|please |need )\b/i.test(t)) return false;
        if (/תוכל|אשמח אם|האם תוכל|נשמח לקבוע/.test(t)) return false;
        if (/^(?:if|when|unless)\b/i.test(t) || /^אם/.test(t)) return false;
        if (/^Log commitment\b/i.test(t)) return false;
        if (pastSentenceTitle(t)) return false;
        if (/^Log this decision$/i.test(t)) return false;
        if (/^Reply requested\b/.test(t) || /^Saving\b/i.test(t)) return false;
        if (/^(?:see you|talk soon|sounds good|got it)\b/i.test(t)) return false;
        return true;
      }
      function selfMeetingAbout(src, subject) {
        const raw = withoutIfClause(String(src || ""));
        const meet = /(?:\b(?:call|meeting|sync|chat|demo|kickoff)\b|שיחה|פגישה|ראיון|הדגמה|זום|אתקשר|נתראה|להיפגש|היפגש|לדבר)/i.test(raw);
        if (!meet) return "";
        const topic = callTopicPhrase(raw, subject);
        if (topic && topic !== "\u05DC\u05E2\u05E6\u05DE\u05D9" && !/^call$/i.test(topic)) {
          if (/[\u0590-\u05FF]/.test(raw) || /[\u0590-\u05FF]/.test(topic)) return clipTitle("\u05E9\u05D9\u05D7\u05D4 \u05D1\u05E0\u05D5\u05E9\u05D0 " + topic);
          return clipTitle("Call about " + topic);
        }
        const when = callClockPhrase(raw);
        if (!when) return "";
        return clipTitle((/[\u0590-\u05FF]/.test(raw) ? "\u05E9\u05D9\u05D7\u05D4 " : "Call ") + when);
      }
      function selfRecoverTitle(text, subject, ctx) {
        if (selfCallCancelled(text)) return "";
        const s = softenTypos(prepareAsk(text)).replace(/מקווה שאת\/?ה בטוב[.!]?\s*/g, " ").replace(/מקווה שהכל טוב[.!]?\s*/g, " ").replace(/\s+/g, " ").trim();
        const heAbout = s.match(/(?:לגבי|בנושא|על)\s+((?:ה|ל)?[\u0590-\u05FF]{2,20}(?:\s+ל[\u0590-\u05FF]{2,20})?)/);
        if (heAbout) {
          const topic = heAbout[1];
          if (/תעדכ[נן]|לעדכן|לדכן/.test(s)) return clipTitle("\u05DC\u05E2\u05D3\u05DB\u05DF \u05DC\u05D2\u05D1\u05D9 " + topic);
          if (/אתקשר|להתקשר|לדבר|היפגש|נתראה|שיחה|פגישה|call|meeting/i.test(s)) return clipTitle("\u05E9\u05D9\u05D7\u05D4 \u05D1\u05E0\u05D5\u05E9\u05D0 " + topic);
        }
        let clause = s;
        const lead = [
          /^(?:quick one:\s*)+/i,
          /^(?:note to self:\s*)+/i,
          /^(?:final decision:\s*)+/i,
          /^(?:as discussed,?\s*(?:you will\s+)?)/i,
          /^(?:just confirming\s+(?:that\s+)?)(?:you(?:'|’)?ll|you will\s+)?/i,
          /^(?:i(?:'|’)?ll|i will|we(?:'|’)?ll|we will)\s+/i,
          /^(?:we agreed to)\s+/i,
          /^אני צריך\s+/,
          /^(?:please\s+)?(?:can|could|would)\s+you\s+(?:please\s+)?/i,
          /^(?:can|could|would)\s+we\s+/i,
          /^please\s+/i,
          /^need\s+/i,
          /^(?:would|does)\s+(?:(?!work\s+for\b)[\s\S]){0,80}?work\s+for\s+/i,
          /^כמו שסיכמ(?:נו|ו) בשיחה,?\s*/,
          /^(?:אתה|אתם)\s+/,
          /^אשמח אם תוכל(?:י|ו)?\s+/,
          /^האם תוכל(?:י|ו)?\s+/,
          /^נשמח\s+ל?/,
          /^תוכלו\s+/,
          /^תקבע(?:י|ו)? לנו\s+/,
          /^רוצה\s+/,
          /^נוכל לעשות\s+/,
          /^יש לך זמן ל/,
          /^מה דעתך על\s+/,
          /^נקבע\s+/,
          /^קבעתי לנו\s+/,
          /^בהמשך לשיחתנו,?\s*/,
          /^פעולה נדרשת מצדך:\s*/
        ];
        for (let guard = 0; guard < 6; guard++) {
          let next = clause;
          for (let i = 0; i < lead.length; i++) next = next.replace(lead[i], "");
          next = next.replace(/\s+/g, " ").trim();
          if (next === clause) break;
          clause = next;
        }
        clause = unwrapGoogleRedirectUrl(clause);
        clause = clause.replace(/(?:https?:\/\/)?(?:www\.)?google\.com\/url\?(?:[^\s]+\s*)*/gi, " ");
        clause = clause.replace(/\bthe\s+on\b/i, "on");
        clause = clause.replace(/[?].*$/, " ").replace(/[.!]+$/g, "").replace(/\s+/g, " ").trim();
        clause = clause.replace(/^מקווה[\s\S]*?[.]\s*/, "").trim();
        if (/\b(?:swing|stop|come|drop|pass)\s+by\b/i.test(clause)) {
          clause = clause.replace(/\s+(?:on\s+)?(?:next\s+|this\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today)\b[\s\S]*$/i, "");
        } else {
          clause = clause.replace(EN_DATE_TAIL, "").replace(AT_CLOCK, "");
        }
        clause = clause.replace(HE_DATE_TAIL, "").replace(NUM_DATE, "");
        clause = clause.replace(/\s+ב-\d[\s\S]*$/, "").replace(/\s+בשעה[\s\S]*$/, "").replace(/\s+/g, " ").trim();
        if (/^[a-z]/.test(clause)) clause = clause.charAt(0).toUpperCase() + clause.slice(1);
        if (/^(?:call|ring)\s+(?:her|him|them|you|me|us)$/i.test(clause)) {
          const named = pronounCalleeTitle(s, ctx);
          if (named) return named;
        }
        if (/^(?:a\s+)?quick\s+chat$/i.test(clause)) return "Set up a quick chat";
        if (/^(?:a\s+)?quick\s+call$/i.test(clause) || /\b(?:hop on a call|have a call|jump on a call)\b/i.test(clause)) {
          const about = selfMeetingAbout(s, subject);
          if (about) return about;
        }
        if (/^(?:call|meeting)$/i.test(clause) && /תקבע|לקבוע|נקבע|set up/i.test(s)) {
          const about = selfMeetingAbout(s, subject);
          if (about) return about;
          return /[\u0590-\u05FF]/.test(s) ? "\u05DC\u05E7\u05D1\u05D5\u05E2 \u05E9\u05D9\u05D7\u05D4" : "Set up a meeting";
        }
        const bareMeet = /^(?:a\s+|the\s+)?(?:quick\s+|short\s+)?(?:call|chat|meeting|sync|demo)$/i.test(clause) || /^(?:שיחה|פגישה|שיחת זום)$/.test(clause);
        if (!clause || bareMeet || !usableSelfTitle(clause)) return selfMeetingAbout(s, subject);
        return clipTitle(clause);
      }
      function selfFrameTitle(src) {
        const s = String(src || "").replace(/\s+/g, " ").trim();
        const money = (raw) => String(raw || "").replace(/\s+/g, "");
        let m;
        m = s.match(/\bremind me to\s+renew\s+(?:the\s+)?(https?:\/\/\S+)/i);
        if (m) {
          let obj = unwrapGoogleRedirectUrl(m[1]);
          if (!obj || /google\.com\/url\b/i.test(obj)) {
            const q = s.match(/google\.com\/url\?[^\s#]+/i);
            if (q) obj = unwrapGoogleRedirectUrl("https://www." + q[0]);
          }
          if (obj && !/google\.com\/url\b/i.test(obj)) {
            return "Renew " + String(obj).replace(/^https?:\/\//i, "").replace(/\/$/, "");
          }
          const renewWhen = s.match(/\bremind me to\s+renew(?:\s+the\s+https?:\/\/\S+)?\s+on\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)/i);
          if (renewWhen) return "Remind me to renew on " + renewWhen[1].trim();
        }
        m = s.match(/\bremind me to\s+renew\s+((?:the|my|our|your)\s+.+?)(?:\s+(?:on|by|before)\b|$)/i);
        if (m) return "Renew " + m[1].replace(/\s+/g, " ").trim();
        m = s.match(/אפשר\s+לאשר[\s\S]{0,48}?עם\s+(ה[\u0590-\u05FF]+(?:\s+ל[\u0590-\u05FF]+)?)/);
        if (m) return "\u05DC\u05D0\u05E9\u05E8 \u05D0\u05EA " + m[1];
        m = s.match(/עדיין\s+חסר\s+לנו\s+(.+?)\s+ממך/);
        if (m) return "\u05DC\u05E9\u05DC\u05D5\u05D7 \u05D0\u05EA " + m[1].replace(/\s+/g, " ").trim();
        m = s.match(/תשלום\s+של\s+((?:₪|\$|€|£)\s?[\d,]*\d(?:\.\d+)?)/);
        if (m && /תזכורת/.test(s)) return "\u05DC\u05E9\u05DC\u05DD " + money(m[1]);
        m = s.match(/מה דעתך על\s+דמו\s+ב-(\d{1,2}\.\d{1,2})\s+בשעה\s+(\d{1,2}:\d{2})/);
        if (m) return "\u05D3\u05DE\u05D5 \u05D1-" + m[1] + " " + m[2];
        m = s.match(/\bcan i get\s+(the\s+.+?)\s+from you\b/i);
        if (m) return "Send " + m[1].replace(/\s+/g, " ").trim();
        m = s.match(/מחכים\s+להצעת המחיר/);
        if (m) return "\u05DC\u05E9\u05DC\u05D5\u05D7 \u05D0\u05EA \u05D4\u05E6\u05E2\u05EA \u05D4\u05DE\u05D7\u05D9\u05E8";
        m = s.match(/מחכים\s+לה-(\S+)/);
        if (m) return "\u05DC\u05E9\u05DC\u05D5\u05D7 \u05D0\u05EA \u05D4-" + m[1].replace(/[.,!?].*$/, "");
        m = s.match(/מחכה\s+להקבלה/);
        if (m) return "\u05DC\u05E9\u05DC\u05D5\u05D7 \u05D0\u05EA \u05D4\u05E7\u05D1\u05DC\u05D4";
        m = s.match(/מחכה לאישור שלך על\s+(ה[\u0590-\u05FF]+)/);
        if (m) return "\u05DC\u05D0\u05E9\u05E8 \u05D0\u05EA " + m[1];
        m = s.match(/אפשר\s+follow up על\s+(ה[\u0590-\u05FF]+)/i);
        if (m) return "\u05DC\u05E2\u05D3\u05DB\u05DF \u05DC\u05D2\u05D1\u05D9 " + m[1];
        m = s.match(/אפשר\s+להסדיר את התשלום של\s+((?:₪|\$|€|£)\s?[\d,]*\d(?:\.\d+)?)/);
        if (m) return "\u05DC\u05E9\u05DC\u05DD " + money(m[1]);
        m = s.match(/יתרה פתוחה של\s+((?:₪|\$|€|£)\s?[\d,]*\d(?:\.\d+)?)/);
        if (m) return "\u05DC\u05E9\u05DC\u05DD " + money(m[1]);
        m = s.match(/אפשר\s+לדבר[\s\S]{0,60}?על\s+(ה-[\w.-]+|ה[\u0590-\u05FF]+)/);
        if (m) return "\u05E9\u05D9\u05D7\u05D4 \u05D1\u05E0\u05D5\u05E9\u05D0 " + m[1];
        m = s.match(/יש מצב להיפגש\s+ב-(\d{1,2}\.\d{1,2})\s+ב-(\d{1,2}:\d{2})/);
        if (m) return "\u05E4\u05D2\u05D9\u05E9\u05D4 \u05D1-" + m[1] + " " + m[2];
        m = s.match(/יש מצב להיפגש\s+ביום\s+([\u0590-\u05FF]+)\s+ב-(\d{1,2}:\d{2})/);
        if (m) return "\u05E4\u05D2\u05D9\u05E9\u05D4 \u05D1\u05D9\u05D5\u05DD " + m[1] + " " + m[2];
        m = s.match(/יש מצב לעשות שיחת היכרות(?:\s+קצרה)?\s+ביום\s+([\u0590-\u05FF]+)\s+ב-(\d{1,2}:\d{2})/);
        if (m) return "\u05E9\u05D9\u05D7\u05EA \u05D4\u05D9\u05DB\u05E8\u05D5\u05EA \u05D1\u05D9\u05D5\u05DD " + m[1] + " " + m[2];
        m = s.match(/אני אגיע\s+מחר\s+בשעה\s+(\d{1,2}:\d{2})/);
        if (m) return "\u05DC\u05D4\u05D2\u05D9\u05E2 \u05DE\u05D7\u05E8 " + m[1];
        m = s.match(/אני אגיע\s+ב-(\d{1,2})\s+באוקטובר\s+בשעה\s+(\d{1,2}:\d{2})/);
        if (m) return "\u05DC\u05D4\u05D2\u05D9\u05E2 " + m[1] + ".10 " + m[2];
        m = s.match(/אנחנו\s+בפנים\s*[–—-]\s*((?:₪|\$|€|£)\s?[\d,]*\d(?:\.\d+)?)/);
        if (m) return "Log " + money(m[1]) + " agreed";
        m = s.match(/אפשר\s+להעלות את המצורף ל-OneDrive/);
        if (m) return "\u05DC\u05D4\u05E2\u05DC\u05D5\u05EA \u05D0\u05EA \u05D4\u05DE\u05E6\u05D5\u05E8\u05E3 \u05DC-OneDrive";
        m = s.match(/\blmk\b[\s\S]{0,48}?\bif the (.+?)\s+works\b/i);
        if (m) return "Reply about the " + m[1].replace(/\s+/g, " ").trim();
        m = s.match(/\bwe\s+approved\b[\s\S]{0,80}?((?:₪|\$|€|£)\s?[\d,]*\d(?:\.\d+)?)/i);
        if (m) return "Log " + money(m[1]) + " agreed";
        let clause = s.replace(/^(?:רק משהו קטן:\s*)+/, "").replace(/^(?:תזכורת לעצמי:\s*)+/, "").replace(/^(?:בבקשה\s+)/, "").replace(/^(?:לזכור\s+)/, "").replace(/^(?:סיכמנו\s+)/, "").replace(/^הבטחתי\s+ל[\u0590-\u05FF]+\s+/, "");
        if (clause === s) return "";
        clause = clause.replace(/^צרף\s+/, "\u05DC\u05E6\u05E8\u05E3 ");
        clause = clause.replace(HE_DATE_TAIL, "").replace(EN_DATE_TAIL, "").replace(/[.?!](?![\w\u0590-\u05FF-]).*$/, "").replace(/\s+/g, " ").trim();
        if (/^להוסיף משימה(?:\s|$)/.test(clause)) return "";
        if (/^ל[\u0590-\u05FF]/.test(clause)) return clipTitle(clause);
        return "";
      }
      function selfAskTitle(text, subject, ctx) {
        const raw = String(text || "");
        const invite = attachToInvitePlan(raw);
        if (invite) return invite.label;
        const src = softenTypos(prepareAsk(raw));
        const framed = selfFrameTitle(src);
        if (framed && !badSelfTitle(framed)) return framed;
        const fromBody = selfBodyTitle(src);
        if (fromBody && !badSelfTitle(fromBody)) return fromBody;
        const he = /[\u0590-\u05FF]/.test(src);
        if (payAsk(src)) {
          const m = firstOf(src, [/לשלם|תשלמ(?:י|ו)?/, /להעביר|תעביר(?:י|ו)?/, /לסגור/, /\bpay\b/i, /\bneeds to be paid\b/i, /\bwire\b/i, /\bprocess\b/i, /\btransfer\b/i, /\bclear\b/i]);
          if (m) {
            const verb = /[\u0590-\u05FF]/.test(m[0]) ? "\u05DC\u05E9\u05DC\u05DD" : "Pay";
            const titled = titleAfter(verb, m, src, subject, { pay: true });
            if (titled) return titled;
          }
        }
        if (reviewAsk(src)) {
          const m = firstOf(src, [/לבדוק|תבדק(?:י|ו)?/, /\bdouble-?check\b/i, /\breview\b/i]);
          if (m) {
            const verb = he ? "\u05DC\u05D1\u05D3\u05D5\u05E7" : "Review";
            const titled = titleAfter(verb, m, src, subject, {});
            if (titled) return titled;
          }
        }
        const phone = callTitle(src, subject);
        if (phone) return phone;
        const pronoun = pronounCalleeTitle(src, ctx);
        if (pronoun) return pronoun;
        const about = callAboutSubject(src, subject);
        if (about) return about;
        if (callAsk(src)) {
          const titled = he ? joinTitle("\u05DC\u05D4\u05EA\u05E7\u05E9\u05E8", "", subject, { phoneHe: true, src }) : "";
          if (titled) return titled;
        }
        const hit = earliestVerb(src, he ? SELF_HE_VERBS.concat(SELF_EN_VERBS) : SELF_EN_VERBS);
        if (!hit) return "";
        return titleAfter(hit.verb, hit.match, src, subject, {});
      }
      return { TYPES, classify, shouldShowChip, copiedOnly: ccOnlyWithoutGreeting, openingAddressee, addressedToSelf, meetingPlanVeto, attachToInvitePlan, soloPhoneTask, phishingOrNegative, bankChangePayment, nameIsReader, readerNamesFrom, marketingWebinar };
    })();
    if (typeof module !== "undefined") module.exports = { FlowIntent: FlowIntent3 };
  }
});

// flow-trial-extension/core/actions.js
var require_actions = __commonJS({
  "flow-trial-extension/core/actions.js"(exports, module) {
    var FlowActions3 = /* @__PURE__ */ (() => {
      const MAX_ACTIONS = 5;
      const DEMOTE_THRESHOLD = 3;
      function calendarAction(intent, e, ctx) {
        const mutate = e.calendarOp === "delete" || e.calendarOp === "update";
        const hold = intent.personalClose === "calendar-hold" || mutate;
        const title = (hold ? e.what || intent.label : intent.label || e.what) || (hold ? "Hold" : "Meeting");
        const hint = e.calendarOp === "delete" ? "Remove from Calendar: " : e.calendarOp === "update" ? "Move on Calendar: " : "Add to Calendar: ";
        return {
          id: "calendar",
          kind: "calendar",
          // Short — this is a collapsed-by-default step label, not the whole
          // sentence describing the step (see content-gmail.js's injectChip:
          // only surfaced at all once someone opens the step list). The full
          // description still exists, as `hint`, for the step's title/aria-label.
          label: "Calendar",
          hint: hint + (intent.label || "Meeting"),
          params: {
            title: String(title).slice(0, 200),
            dateIso: e.dateIso,
            hour: e.hour,
            minute: e.minute,
            calendarOp: mutate ? e.calendarOp : null,
            fromDateIso: e.calendarOp === "update" ? e.fromDateIso : null,
            fromHour: e.calendarOp === "update" ? e.fromHour : null,
            fromMinute: e.calendarOp === "update" ? e.fromMinute : null,
            // The sentence the event is about. The title stays short ("Meeting
            // Sep 18 15:00"); without this, View opens a Calendar event that
            // never says what was scheduled. "Meeting" is the classifier's
            // fallback when no sentence was found — not a quote. A hold's
            // fallback title is "Hold", which is the same kind of placeholder.
            quote: e.what && e.what !== "Meeting" && e.what !== "Hold" ? String(e.what).slice(0, 400) : null,
            // A hold was only proposed because a clock time resolved. The
            // writer must not fall back to an all-day event if that time is
            // missing by the time Do It runs.
            requireTime: hold || mutate,
            threadUrl: ctx.threadUrl
          }
        };
      }
      function draftAction(intent, e, ctx, hasAttachment) {
        if (intent.type === "fact" || intent.signals && intent.signals.factReply) {
          const factLine = e.factLine ? String(e.factLine).replace(/[\r\n]+/g, " ").trim() : "";
          if (!factLine) return null;
          return {
            id: "draft",
            kind: "gmailDraft",
            label: "Reply draft",
            hint: "Insert " + (e.factValue || "the fact") + " into a reply draft",
            params: {
              intentType: "fact",
              replyFact: true,
              what: factLine,
              factLine,
              factValue: e.factValue || null,
              includeAttachment: false
            }
          };
        }
        const what = intent.type === FlowIntent.TYPES.SCHEDULED_EVENT && e.requestWhat ? e.requestWhat : e.what;
        if (intent.inviteFile) {
          const fileOnDraft = Boolean(ctx.attachFile && ctx.attachFile.id);
          const plan = typeof FlowIntent !== "undefined" && FlowIntent.attachToInvitePlan ? FlowIntent.attachToInvitePlan(ctx.text || "", { attached: fileOnDraft }) : null;
          const he = /[\u0590-\u05FF]/.test(String(plan && plan.label || intent.label || ctx.text || ""));
          const honest = he ? "\u05D0\u05E6\u05E8\u05E3 \u05D1\u05D4\u05E7\u05D3\u05DD." : "I'll attach it shortly.";
          return {
            id: "draft",
            kind: "gmailDraft",
            label: "Draft",
            hint: fileOnDraft ? "Short note that the file is attached" : "Short note that the file is still to attach",
            params: {
              intentType: intent.type,
              what: plan && plan.label || intent.label || null,
              inviteFile: true,
              body: plan && plan.draft || intent.inviteDraft || honest,
              lang: he ? "he" : "en",
              threadUrl: ctx.threadUrl,
              includeAttachment: fileOnDraft,
              fileAttached: fileOnDraft,
              requestedObjectTerm: null
            }
          };
        }
        const found = ctx.attachFile && ctx.attachFile.id ? ctx.attachFile : null;
        const mayFindFile = hasAttachment || Boolean(found);
        return {
          id: "draft",
          kind: "gmailDraft",
          label: mayFindFile ? "Draft reply + file" : "Draft reply",
          hint: "Prepare reply draft" + (mayFindFile ? " with attachment" : ""),
          params: {
            intentType: intent.type,
            what,
            when: e.when,
            amount: e.amount,
            threadUrl: ctx.threadUrl,
            includeAttachment: mayFindFile,
            requestedObjectTerm: e.requestedObjectTerm || null,
            driveFileId: found ? found.id : null,
            driveFileName: found ? found.name : null,
            driveMimeType: found ? found.mimeType : null,
            attachSource: found ? "found" : null
          }
        };
      }
      function taskAction(intent, e, ctx) {
        return {
          id: "task",
          kind: "googleTask",
          label: "Task",
          hint: "Create task: " + (intent.label || e.what || intent.type),
          params: {
            title: intent.label || e.what,
            dateIso: e.dateIso,
            amount: e.amount,
            // The sentence this close is about. The writer quotes it even when
            // the later caller only still has the step (a Brief replay stores
            // steps, and used to drop intent.entities).
            what: e.what || null,
            threadUrl: ctx.threadUrl
          }
        };
      }
      function buildStep(kind, intent, e, ctx, hasAttachment) {
        const step = kind === "calendar" ? calendarAction(intent, e, ctx) : kind === "draft" ? draftAction(intent, e, ctx, hasAttachment) : taskAction(intent, e, ctx);
        if (!step) return null;
        step.dependsOn = null;
        return step;
      }
      const PROCESS_CATALOG = {
        // One event, no reminder. planFor chooses this when a meeting noun, a
        // date, and a time are present and the mail does not ask for a reply.
        // A meeting noun and a date with no time stays schedule.
        "hold": {
          name: "Hold It",
          closingLine: "Putting this on your calendar.",
          closedLine: "On your calendar.",
          anchor: "calendar",
          stepKinds: ["calendar"]
        },
        // A named slot that is cancelled. One delete, after the writer finds
        // exactly one event at that time. Not a new event.
        "clear-it": {
          name: "Clear It",
          closingLine: "Taking this off your calendar.",
          closedLine: "Off your calendar.",
          anchor: "calendar",
          stepKinds: ["calendar"]
        },
        // A named slot moved to a different named clock. One update.
        "move-it": {
          name: "Move It",
          closingLine: "Moving this on your calendar.",
          closedLine: "Moved on your calendar.",
          anchor: "calendar",
          stepKinds: ["calendar"]
        },
        "schedule-confirm": {
          name: "Schedule & Confirm",
          // "replying to confirm" / "confirmed" would both overclaim: the draft
          // step (gmailDraftWrite, background.js) only ever creates a Gmail
          // draft — never sends — as a deliberate safety choice, never on the
          // user's behalf without their own review. Saying "confirmed" here
          // would tell the user this process already sent something it
          // didn't, which is the one thing worse than an honest "still needs
          // you to hit send": believing it's done when it isn't.
          closingLine: "Scheduling this, drafting a reply to confirm, and setting a follow-up.",
          closedLine: "Scheduled, drafted, and tracked.",
          anchor: "calendar",
          stepKinds: ["calendar", "draft", "task"]
        },
        "schedule": {
          name: "Schedule It",
          closingLine: "Scheduling this and setting a reminder to prepare.",
          closedLine: "Scheduled, with a reminder set.",
          anchor: "calendar",
          stepKinds: ["calendar", "task"]
        },
        "reply-track": {
          name: "Reply & Track",
          closingLine: "Drafting your reply and tracking it as a task.",
          // Same accuracy fix as schedule-confirm above: the draft step never
          // sends, so "Replied" claimed a step this process doesn't take.
          closedLine: "Drafted and tracked.",
          anchor: "draft",
          stepKinds: ["draft", "task"]
        },
        // A file asked onto an invite that already exists. The task is the
        // work. The draft says the file is attached only when a file is on it.
        "attach-invite": {
          name: "Attach it",
          closingLine: "Tracking the file on the invite, with a short draft.",
          closedLine: "Drafted and tracked.",
          anchor: "task",
          stepKinds: ["task", "draft"]
        },
        "follow-through": {
          name: "Follow Through",
          closingLine: "Setting a reminder to follow through, with a reply ready.",
          closedLine: "Reminder set, reply ready.",
          anchor: "task",
          stepKinds: ["task", "draft"]
        },
        // One trusted Sheet cell or Doc paragraph, inserted into a reply draft.
        // The user still sends. No task, no attachment, no second step.
        "reply-fact": {
          name: "Reply with it",
          closingLine: "Putting this fact into a reply draft.",
          closedLine: "The fact is in a reply draft.",
          anchor: "draft",
          stepKinds: ["draft"]
        },
        // DECISION_TO_LOG / FOLLOW_UP — the chip's original job, narrowed to
        // its own named process rather than a type-less default.
        "log-it": {
          name: "Log It",
          closingLine: "Logging this so it stays tracked.",
          // "Logged." alone read thinner than every sibling closedLine here
          // (all the others state two things that happened) now that this
          // string is actually shown in the receipt — see content-gmail.js's
          // closedSummary(). "and tracked" also matches reply-track's own
          // vocabulary for the same underlying step (a Google Task).
          closedLine: "Logged and tracked.",
          anchor: "task",
          stepKinds: ["task"]
        },
        // Google Drive / Doc / Sheet closes. The anchor is the file itself.
        // Memory may not drop it; a close with no file is not a close.
        "file-on-hold": {
          name: "Hold it",
          closingLine: "Putting the file on your calendar.",
          closedLine: "On your calendar, with the file.",
          anchor: "calendar",
          stepKinds: ["calendar"]
        },
        "file-on-task": {
          name: "Note it",
          closingLine: "Noting the file on the task.",
          closedLine: "On the task, with the file.",
          anchor: "task",
          stepKinds: ["task"]
        },
        "file-it": {
          name: "File it",
          closingLine: "Saving the attached file to Drive.",
          closedLine: "Saved to Drive, link drafted.",
          anchor: "file",
          stepKinds: ["file", "draft"]
        },
        "create-missing": {
          name: "Draft it",
          closingLine: "Didn't find it \u2014 draft from template.",
          closedLine: "Drafted from the template, link ready.",
          anchor: "doc",
          stepKinds: ["doc", "sheet", "calendar", "draft"]
        }
      };
      function processFor(intent) {
        const sig = intent.signals || {};
        let id;
        if (intent.type === "fact" || intent.signals && intent.signals.factReply) {
          id = "reply-fact";
        } else if (intent.personalClose === "calendar-cancel") {
          id = "clear-it";
        } else if (intent.personalClose === "calendar-move") {
          id = "move-it";
        } else if (intent.personalClose === "calendar-hold") {
          id = "hold";
        } else if (intent.type === FlowIntent.TYPES.SCHEDULED_EVENT) {
          id = sig.handoff ? "schedule-confirm" : "schedule";
        } else if (intent.type === FlowIntent.TYPES.REQUEST) {
          id = intent.inviteFile ? "attach-invite" : intent.noReplyDraft ? "log-it" : "reply-track";
        } else if (intent.type === FlowIntent.TYPES.COMMITMENT_OF_READER) {
          id = "follow-through";
        } else {
          id = "log-it";
        }
        return Object.assign({ id }, PROCESS_CATALOG[id]);
      }
      function isNetRejected(stats) {
        if (!stats || stats.pinned) return false;
        const rejected = (stats.removed || 0) + (stats.undone || 0);
        return rejected >= DEMOTE_THRESHOLD && rejected > (stats.accepted || 0);
      }
      function applyMemory(stepKinds, anchor, memoryForProcess) {
        const rest = stepKinds.filter((k) => k !== anchor);
        const stats = memoryForProcess && memoryForProcess.steps || {};
        const kept = rest.filter((k) => !isNetRejected(stats[k]));
        const scored = kept.map((k, i) => {
          const s = stats[k];
          if (!s) return { k, rate: 0.5, i };
          const total = s.accepted + s.removed + s.undone;
          return { k, rate: total > 0 ? s.accepted / total : 0.5, i };
        });
        scored.sort((a, b) => b.rate - a.rate || a.i - b.i);
        const ordered = scored.map((x) => x.k);
        return stepKinds.includes(anchor) ? [anchor, ...ordered] : ordered;
      }
      function withThread(step, ctx) {
        if (step.params && ctx.threadUrl) step.params.threadUrl = ctx.threadUrl;
        return step;
      }
      function planGoogle(intent, ctx) {
        const g = intent.googleClose;
        if (!g) return null;
        const e = intent.entities || {};
        if (g.personalClose === "file-on-hold") {
          if (!Number.isInteger(e.hour) || !Number.isInteger(e.minute)) return null;
          return {
            id: "file-on-hold",
            name: "Hold it",
            closingLine: g.cardLine,
            closedLine: "On your calendar, with the file.",
            steps: [withThread({
              id: "calendar",
              kind: "calendar",
              label: "Calendar",
              hint: "Add to Calendar with the file",
              dependsOn: null,
              params: {
                title: String(e.what || g.fileTerm || "Hold").slice(0, 200),
                dateIso: e.dateIso,
                hour: e.hour,
                minute: e.minute,
                quote: e.what || null,
                requireTime: true,
                fileTerm: g.fileTerm
              }
            }, ctx)]
          };
        }
        if (g.personalClose === "file-on-task") {
          return {
            id: "file-on-task",
            name: "Note it",
            closingLine: g.cardLine,
            closedLine: "On the task, with the file.",
            steps: [withThread({
              id: "task",
              kind: "googleTask",
              label: "Task",
              hint: "Task note with the file",
              dependsOn: null,
              params: {
                title: e.what || g.fileTerm,
                dateIso: e.dateIso,
                amount: e.amount,
                what: e.what || null,
                fileTerm: g.fileTerm
              }
            }, ctx)]
          };
        }
        if (g.personalClose === "drive-file") {
          const onedrive = g.target === "onedrive";
          const fileStep = {
            id: "file",
            kind: "driveFile",
            label: onedrive ? "OneDrive" : "Drive",
            hint: onedrive ? "Save the attached file to OneDrive" : "Save the attached file",
            dependsOn: null,
            params: { copyAttachment: true, googleClose: g }
          };
          const draftStep = {
            id: "draft",
            kind: "gmailDraft",
            label: "Draft link",
            hint: "Draft a reply with the file link",
            dependsOn: "file",
            params: { what: g.cardLine, shareLink: true, includeAttachment: false, requestedObjectTerm: null }
          };
          return {
            id: "file-it",
            name: "File it",
            closingLine: g.cardLine,
            closedLine: onedrive ? "Saved on OneDrive." : "Saved to Drive, link drafted.",
            steps: [fileStep, draftStep]
          };
        }
        if (g.personalClose !== "create-missing") return null;
        const createId = g.kind === "sheet" ? "sheet" : "doc";
        const createKind = g.kind === "sheet" ? "driveSheet" : "driveDoc";
        const steps = [{
          id: createId,
          kind: createKind,
          label: g.kind === "sheet" ? "Sheet" : "Doc",
          hint: g.templateName || "Create from the template",
          dependsOn: null,
          params: { googleClose: g }
        }];
        if (g.destination === "calendar" && Number.isInteger(e.hour) && Number.isInteger(e.minute)) {
          steps.push(withThread({
            id: "calendar",
            kind: "calendar",
            label: "Calendar",
            hint: "Add to Calendar with the new file",
            dependsOn: createId,
            params: {
              title: String(e.what || g.cardLine || "Hold").slice(0, 200),
              dateIso: e.dateIso,
              hour: e.hour,
              minute: e.minute,
              quote: e.what || null,
              requireTime: true,
              shareLink: true
            }
          }, ctx));
        }
        steps.push({
          id: "draft",
          kind: "gmailDraft",
          label: "Draft link",
          hint: "Draft a reply with the file link",
          dependsOn: createId,
          params: { what: g.cardLine, shareLink: true, includeAttachment: false, requestedObjectTerm: null }
        });
        return {
          id: "create-missing",
          name: "Draft it",
          closingLine: g.cardLine,
          closedLine: "Drafted from the template, link ready.",
          steps
        };
      }
      function dateChoicesOf(intent) {
        const e = intent && intent.entities;
        if (e && Array.isArray(e.dateChoices) && e.dateChoices.length >= 2) return e.dateChoices;
        const d = intent && intent.facts && intent.facts.date;
        if (d && Array.isArray(d.choices) && d.choices.length >= 2) return d.choices;
        return null;
      }
      function meetingClock(intent) {
        const e = intent && intent.entities;
        return Boolean(e && Number.isInteger(e.hour) && Number.isInteger(e.minute));
      }
      function writtenDayNumber(intent) {
        const raw = intent && intent.facts && intent.facts.date && intent.facts.date.raw;
        return /\d/.test(String(raw || ""));
      }
      function soloPhoneTask(text) {
        if (typeof FlowIntent !== "undefined" && typeof FlowIntent.soloPhoneTask === "function") return FlowIntent.soloPhoneTask(text);
        return false;
      }
      function inboundMeetingAnnouncement(text) {
        const src = String(text || "").trim();
        if (!src || /\?/.test(src)) return false;
        if (/\b(?:could|can|would|shall)\s+(?:we|you)\s+(?:meet|schedule|book)\b/i.test(src)) return false;
        if (/\blet'?s\s+(?:meet|schedule|book)\b/i.test(src)) return false;
        if (/אפשר|נתאם|נקבע|מה דעתך|בואו ניפגש/.test(src)) return false;
        if (/^פגישה/.test(src) || /(?:^|\n)\s*פגישה\s+ביום/.test(src)) return true;
        if (/פגישה[^\n]{0,80}בשעה\s*\d{1,2}/.test(src)) return true;
        if (/\b(?:the\s+)?\w+\s+meeting\s+is\s+on\b/i.test(src)) {
          if (/\b(?:can|could|would)\s+you\s+(?:make it|attend|join|come)\b/i.test(src)) return false;
          return true;
        }
        return false;
      }
      function meetingNarrow(intent, text) {
        if (!intent || intent.type !== "event" || intent.googleClose) return false;
        if (inboundMeetingAnnouncement(text)) return false;
        if (soloPhoneTask(text)) return false;
        const close = intent.personalClose;
        if (close === "calendar-cancel" || close === "calendar-move" || close === "file-on-hold") return false;
        const sig = intent.signals || {};
        const e = intent.entities || {};
        if (!e.dateIso || !meetingClock(intent)) return false;
        if (close !== "calendar-hold" && !writtenDayNumber(intent)) return false;
        return Boolean(sig.hasMeetingNoun || close === "calendar-hold");
      }
      function meetingPlan(intent, proc, text) {
        if (!intent || intent.type !== "event" || intent.googleClose) return proc;
        const close = intent.personalClose;
        if (close === "calendar-cancel" || close === "calendar-move" || close === "file-on-hold") return proc;
        const sig = intent.signals || {};
        if (sig.handoff) return proc;
        const e = intent.entities || {};
        const choices = dateChoicesOf(intent);
        const openChoice = Boolean(choices && !e.dateIso);
        const hasDate = Boolean(e.dateIso) || openChoice;
        if (!hasDate) return proc;
        const timed = meetingClock(intent);
        if (openChoice) return Object.assign({ id: "hold" }, PROCESS_CATALOG.hold);
        if (!sig.hasMeetingNoun) return proc;
        if (!timed) {
          if (inboundMeetingAnnouncement(text)) return null;
          return proc;
        }
        if (inboundMeetingAnnouncement(text)) return Object.assign({ id: "hold" }, PROCESS_CATALOG.hold);
        if (close !== "calendar-hold" && !writtenDayNumber(intent)) return proc;
        return Object.assign({ id: "hold" }, PROCESS_CATALOG.hold);
      }
      function chooseDate(plan, iso) {
        const want = String(iso || "");
        const choices = plan && plan.dateChoices;
        if (!want || !Array.isArray(choices) || !choices.some((c) => c && c.iso === want)) return false;
        (plan.steps || []).forEach((step) => {
          if (step && step.kind === "calendar" && step.params) step.params.dateIso = want;
        });
        plan.needsDateChoice = false;
        return true;
      }
      function taskNotMeeting(intent, text) {
        if (!intent || intent.type !== "event" || intent.googleClose) return false;
        const close = intent.personalClose;
        if (close === "calendar-hold" || close === "calendar-cancel" || close === "calendar-move" || close === "file-on-hold") return false;
        const src = String(text || "");
        if (/\b(?:please\s+)?create a task\b|\badd this to my tasks\b|\bremember to\b/i.test(src)) return true;
        if (soloPhoneTask(src)) return true;
        if (/\bi(?:'|’)ll call\b|\bi will call\b/i.test(src)) return true;
        if (/\byou(?:'|’)ll\s+(?:book|update|call|send)\b|\byou will\s+(?:book|update|call|send)\b|\byou(?:'|’)?re\s+sending\b/i.test(src)) return true;
        if (/אתה\s*מעב[יר]+/.test(src) || /אתם\s+מעבירים/.test(src)) return true;
        return false;
      }
      function planForRaw(intent, ctx) {
        ctx = ctx || {};
        if (!intent || !intent.type) return null;
        if (intent.googleClose && !intent.selfTask) return planGoogle(intent, ctx);
        const vetoText = ctx.text;
        const vetoed = Boolean(intent.signals && intent.signals.meetingVeto) || Boolean(vetoText && typeof FlowIntent !== "undefined" && typeof FlowIntent.meetingPlanVeto === "function" && FlowIntent.meetingPlanVeto(vetoText));
        if (intent.type === "event" && vetoed) return null;
        const e = intent.entities || {};
        const hasAttachment = Boolean(ctx.hasThreadAttachment);
        const hedged = /\b(?:perhaps|possibly|not sure|maybe|might)\b/i.test(String(vetoText || ""));
        const useMeeting = !ctx.baseOnly && !hedged && meetingNarrow(intent, vetoText);
        const taskInstead = !ctx.baseOnly && !useMeeting && taskNotMeeting(intent, vetoText);
        let proc = useMeeting ? meetingPlan(intent, processFor(intent), vetoText) : taskInstead ? Object.assign({ id: "log-it" }, PROCESS_CATALOG["log-it"]) : processFor(intent);
        const dateConflict = Boolean(intent.facts && intent.facts.date && intent.facts.date.contradictsWeekday);
        if (inboundMeetingAnnouncement(vetoText) && meetingClock(intent) && !dateConflict && proc && (proc.id === "schedule" || proc.id === "schedule-confirm")) {
          proc = Object.assign({ id: "hold" }, PROCESS_CATALOG.hold);
        }
        const calendarOp = e.calendarOp;
        const untimedCalendar = proc && Array.isArray(proc.stepKinds) && proc.stepKinds.indexOf("calendar") !== -1 && !meetingClock(intent) && calendarOp !== "delete" && calendarOp !== "update" && intent.personalClose !== "calendar-cancel" && intent.personalClose !== "calendar-move";
        const untimedSrc = String(vetoText || "");
        const heMail = /[\u0590-\u05FF]/.test(untimedSrc);
        const ownPromise = /\b(?:i|we)(?:'|’)?ll\s+(?:send|deliver|share|provide|submit|file|pay|return|forward|transfer|wire|prepare|email|finish|complete)\b/i.test(untimedSrc) || /\b(?:i|we)\s+will\s+(?:send|deliver|share|provide|submit|file|pay|return|forward|transfer|wire|prepare|email|finish|complete)\b/i.test(untimedSrc) || /(?:^|[^\u0590-\u05FF])(?:(?:אני|אנחנו)\s+)?(?:אשלח|נשלח|אעביר|נעביר|אשלם|נשלם|אגיש|נגיש|אכין|נכין|אחזיר|נחזיר)/.test(untimedSrc);
        const createTaskAsk = /\bplease\s+create\s+a\s+task\b/i.test(untimedSrc) || /\badd this to my tasks\b/i.test(untimedSrc);
        const callBody = untimedSrc.replace(/\bfollowing up on (?:our|the|that) call\b/ig, " ").replace(/\bper our call\b/ig, " ").replace(/\bper our chat\b/ig, " ");
        const senderCallYou = /\b(?:i|we)(?:'|’)?ll\s+call\s+you\b|\b(?:i|we)\s+will\s+call\s+you\b/i.test(untimedSrc);
        const senderJoinCall = /\b(?:i|we)(?:'|’)?ll\s+join\s+(?:the\s+)?call\b|\b(?:i|we)\s+will\s+join\s+(?:the\s+)?call\b/i.test(untimedSrc);
        const readerWill = /\byou(?:'|’)?ll\b|\byou will\b|\byou(?:'|’)?re\s+sending\b|\byou are sending\b/i.test(untimedSrc) || /אתה\s*מעב/.test(untimedSrc) || /אתם\s+מעבירים/.test(untimedSrc) || /לפי מה שסגרנו,?\s*אתם מעבירים/.test(untimedSrc);
        const readerSaid = /\byou (?:said|committed|mentioned|agreed|promised)\b/i.test(untimedSrc);
        const callReminder = !senderCallYou && !senderJoinCall && (/\bcall\b/i.test(callBody) && /\b(?:task|reminder|remember|day after tomorrow)\b/i.test(callBody) && !readerSaid || /^\s*call the day after tomorrow\b/i.test(callBody) || /\b(?:i|we)(?:'|’)?ll\s+call\b|\b(?:i|we)\s+will\s+call\b/i.test(callBody));
        const helpOffer = /\blet me know if you (?:have|need|want)\b/i.test(untimedSrc) || /\blet me know if (?:i|we) can\b/i.test(untimedSrc);
        const answerAsk = !helpOffer && (/\b(?:let me know|who will|will you be|are you (?:free|available)|confirm the|please confirm)\b/i.test(untimedSrc) || /פנוי|מי יגיע/.test(untimedSrc));
        const letsMeet = /\blet'?s\s+meet\b/i.test(untimedSrc) || /(?:בואו|בוא)\s+ניפגש|נתאם\s+פגישה|נקבע\s+פגישה/.test(untimedSrc);
        const coordinate = letsMeet || /\blet'?s\s+(?:do|set up|schedule|book)\b/i.test(untimedSrc) || /\b(?:can|could|would)\s+(?:you|we)\s+(?:schedule|set up|book)\b/i.test(untimedSrc) || /\bbook a time\b/i.test(untimedSrc) || /\b(?:schedule|set up)\s+a\b/i.test(untimedSrc) || /(?:בואו|בוא)\s+(?:ניפגש|נקבע)|(?:^|[^\u0590-\u05FF])(?:נתאם|נקבע|לתאם|לקבוע)(?![\u0590-\u05FF])|אפשר\s+לתאם/.test(untimedSrc) || /\?/.test(untimedSrc) && !answerAsk && !/\b(?:send|attach|forward|share|pay)\b/i.test(untimedSrc);
        const handoff = Boolean(intent.signals && intent.signals.handoff);
        let replyInstead = false;
        const logIt = Object.assign({ id: "log-it" }, PROCESS_CATALOG["log-it"]);
        const callNamesADate = /\bcall\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june|july|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i.test(String(vetoText || ""));
        if (intent.selfTask) {
          if ((intent.type === "event" || intent.signals && intent.signals.hasMeetingNoun) && e.dateIso && inboundMeetingAnnouncement(untimedSrc)) {
            proc = Object.assign({ id: "schedule" }, PROCESS_CATALOG.schedule);
          } else if (proc.id !== "schedule") {
            proc = logIt;
          }
        }
        if (!intent.selfTask && !senderCallYou && (untimedCalendar || createTaskAsk || callReminder) && !intent.inviteFile) {
          if (ownPromise && !createTaskAsk && !callReminder && !coordinate && !answerAsk && !readerSaid) {
            proc = logIt;
          } else if ((createTaskAsk || callReminder) && !readerSaid) {
            proc = logIt;
            if (callReminder && !intent.selfTask) intent.label = heMail ? "\u05E9\u05D9\u05D7\u05D4" : "Call";
            else if (/^Reply requested\b/.test(String(intent.label || ""))) {
              const named = untimedSrc.match(/\bplease\s+create\s+a\s+task\s*:\s*([^\n.]+)/i);
              const when = e.when ? String(e.when).replace(/\s+\d{1,2}:\d{2}(?::\d{2})?\s*$/, "").trim() : "";
              intent.label = named ? named[1].replace(/\s+/g, " ").trim() : when ? "Log commitment for " + when : "Log this decision";
            }
          } else if (coordinate) {
            proc = logIt;
            intent.label = heMail ? "\u05DC\u05EA\u05D0\u05DD \u05E4\u05D2\u05D9\u05E9\u05D4" : "Schedule meeting";
          } else if ((readerWill || readerSaid) && !intent.selfTask) {
            proc = logIt;
          } else if ((answerAsk || handoff) && !intent.selfTask) {
            proc = Object.assign({ id: "reply-track" }, PROCESS_CATALOG["reply-track"]);
            replyInstead = true;
            const when = e.when ? String(e.when).replace(/\s+\d{1,2}:\d{2}(?::\d{2})?\s*$/, "").trim() : "";
            intent.label = "Reply requested" + (when ? " by " + when : "");
          } else if (untimedCalendar && !intent.selfTask) {
            if (e.dateIso && inboundMeetingAnnouncement(untimedSrc)) {
              if (!meetingClock(intent)) return null;
              proc = Object.assign({ id: "hold" }, PROCESS_CATALOG.hold);
            } else {
              return null;
            }
          } else if (untimedCalendar) {
            proc = logIt;
          }
        }
        if (senderCallYou && !intent.inviteFile && !intent.selfTask) {
          proc = logIt;
          const when = e.when ? String(e.when).replace(/\s+\d{1,2}:\d{2}(?::\d{2})?\s*$/, "").trim() : "";
          intent.label = when ? "Log commitment for " + when : "Log this decision";
        }
        const taskPlan = taskInstead || senderCallYou || intent.selfTask && !intent.inviteFile || untimedCalendar && !replyInstead;
        if (proc.id !== "schedule") {
          if (taskPlan && soloPhoneTask(vetoText) && !readerSaid && !intent.selfTask) {
            intent.label = /[\u0590-\u05FF]/.test(String(vetoText || "")) ? "\u05E9\u05D9\u05D7\u05D4" : "Call";
          } else if (taskPlan && !intent.selfTask && (/^Meeting\b/.test(String(intent.label || "")) || intent.label === "\u05E4\u05D2\u05D9\u05E9\u05D4")) {
            if (!callNamesADate || intent.selfTask) {
              const when = e.when ? String(e.when).replace(/\s+\d{1,2}:\d{2}(?::\d{2})?\s*$/, "").trim() : "";
              const dateText = when || null;
              intent.label = typeof FlowJudgment !== "undefined" && typeof FlowJudgment.neutralTitle === "function" ? FlowJudgment.neutralTitle({ dateText }) : dateText ? "Log commitment for " + dateText : "Log this decision";
            }
          }
        }
        const memoryForProcess = ctx.executionMemory ? ctx.executionMemory[proc.id] : null;
        const orderedKinds = applyMemory(proc.stepKinds, proc.anchor, memoryForProcess).slice(0, MAX_ACTIONS);
        let steps = orderedKinds.map((kind) => buildStep(kind, intent, e, ctx, hasAttachment)).filter(Boolean);
        if (intent.noReplyDraft) steps = steps.filter((s) => s && s.kind !== "gmailDraft" && s.kind !== "outlookDraft");
        if (!steps.length) return null;
        const choices = useMeeting ? dateChoicesOf(intent) : null;
        const needsDateChoice = Boolean(choices && !e.dateIso);
        if (needsDateChoice) {
          steps.forEach((step) => {
            if (step && step.kind === "calendar" && step.params) {
              step.params.dateIso = null;
              step.params.dateChoices = choices;
            }
          });
        }
        return {
          id: proc.id,
          name: proc.name,
          closingLine: proc.closingLine,
          closedLine: proc.closedLine,
          needsDateChoice,
          dateChoices: needsDateChoice ? choices : null,
          steps
        };
      }
      const TITLE_MAX_WORDS = 6;
      function titleNorm(value) {
        return String(value || "").replace(/[\u00A0\u200B-\u200F\u2060\uFEFF]/g, " ").toLowerCase().replace(/[^\p{L}\p{N}$₪€%\s]+/gu, " ").replace(/\s+/g, " ").trim();
      }
      function titleWords(value) {
        return String(value || "").trim().split(/\s+/).filter(Boolean);
      }
      function bodySentences(text) {
        const out = [];
        String(text || "").split(/\r?\n+|(?<=[.!?])\s+/).forEach((part) => {
          const n = titleNorm(part);
          if (n) out.push(n);
        });
        return out;
      }
      const DECISION_NOTE = /הוחלט|החלטנו|החלטתי|החלטה|(?:^|[^\p{L}])סופי(?![\p{L}])|\bdecision\b|\bdecided\b|\bgoing with\b|\bfinal\b/iu;
      function titleIsBody(title, sentences) {
        const words = titleWords(title).length;
        const norm = titleNorm(title);
        if (!norm) return false;
        if (words > TITLE_MAX_WORDS && DECISION_NOTE.test(title)) return true;
        if (words < 3) return false;
        for (let i = 0; i < sentences.length; i++) {
          const s = sentences[i];
          if (s === norm) return true;
          if (words >= 6 && s.indexOf(norm) !== -1 && norm.split(" ").length >= 0.9 * s.split(" ").length) return true;
        }
        return false;
      }
      const FALLBACK_TITLE = {
        decision: ["Log decision", "\u05DC\u05EA\u05E2\u05D3 \u05D4\u05D7\u05DC\u05D8\u05D4"],
        commitment: ["Log commitment", "\u05DC\u05EA\u05E2\u05D3 \u05D4\u05EA\u05D7\u05D9\u05D9\u05D1\u05D5\u05EA"],
        task: ["Handle this note", "\u05DC\u05D8\u05E4\u05DC \u05D1\u05D4\u05E2\u05E8\u05D4"],
        reply: ["Reply requested", "\u05E0\u05D3\u05E8\u05E9\u05EA \u05EA\u05E9\u05D5\u05D1\u05D4"],
        event: ["Meeting", "\u05E4\u05D2\u05D9\u05E9\u05D4"],
        file: ["Save the file", "\u05DC\u05E9\u05DE\u05D5\u05E8 \u05D0\u05EA \u05D4\u05E7\u05D5\u05D1\u05E5"],
        followup: ["Follow up", "\u05DE\u05E2\u05E7\u05D1"]
      };
      function fallbackKind(intent, process, title) {
        const pid = process && process.id;
        if (pid === "file-it" || pid === "suggest-save") return "file";
        if (DECISION_NOTE.test(String(title || "")) || intent.type === "decision") return "decision";
        if (pid === "reply-track") return "reply";
        if (intent.selfTask || pid === "log-it") return "task";
        if (intent.type === "event") return "event";
        if (intent.type === "commitment") return "commitment";
        if (intent.type === "followup") return "followup";
        return intent.type === "request" ? "reply" : "task";
      }
      function guardTitles(intent, process, ctx) {
        if (!intent || !process) return process;
        const text = String(ctx && ctx.text || "");
        if (!text) return process;
        const hold = intent.personalClose === "calendar-hold" || process.id === "hold";
        const sentences = bodySentences(text);
        const he = /[\u0590-\u05FF]/.test(text);
        const shortFor = (title) => FALLBACK_TITLE[fallbackKind(intent, process, title)][he ? 1 : 0];
        if (!hold && intent.label && titleIsBody(intent.label, sentences)) intent.label = shortFor(intent.label);
        (process.steps || []).forEach((step) => {
          if (!step || !step.params || !step.params.title) return;
          if (step.kind === "calendar") return;
          if (titleIsBody(step.params.title, sentences)) step.params.title = shortFor(step.params.title);
        });
        return process;
      }
      function planFor(intent, ctx) {
        const process = planForRaw(intent, ctx);
        return guardTitles(intent, process, ctx);
      }
      function receiptWrittenLines(results) {
        const lines = [];
        for (const r of results || []) {
          const response = r && r.response;
          if (!response || !response.ok || typeof response.written !== "string") continue;
          const line = response.written.trim();
          if (!line || lines.indexOf(line) !== -1) continue;
          lines.push(line);
        }
        return lines;
      }
      return { planFor, chooseDate, MAX_ACTIONS, PROCESS_CATALOG, isNetRejected, receiptWrittenLines, inboundMeetingAnnouncement };
    })();
    if (typeof module !== "undefined") module.exports = { FlowActions: FlowActions3 };
  }
});

// flow-trial-extension/core/incoming-judge.js
var require_incoming_judge = __commonJS({
  "flow-trial-extension/core/incoming-judge.js"(exports, module) {
    var FlowIncomingJudge2 = /* @__PURE__ */ (() => {
      const MIN_TEXT = 20;
      function prepareForJudge(text) {
        return String(text == null ? "" : text).replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069\u061C]/g, "").replace(/[\u200B-\u200D\u2060\uFEFF]/g, "").replace(/[\u00A0\u202F]/g, " ").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      }
      function withoutPhoneSignature(text) {
        return String(text || "").split("\n").filter((line) => {
          if (/^\s*sent from my (?:iphone|ipad|android)\s*\.?\s*$/i.test(line)) return false;
          if (/^\s*נשלח מה[-\u05BE\s]*(?:iphone|אייפון|אנדרואיד)(?:\s+שלי)?\s*\.?\s*$/i.test(line)) return false;
          return true;
        }).join("\n").trim();
      }
      function subjectCarriesSlot(subject) {
        const s = String(subject || "");
        if (/(?:פגישה|שיחה|ראיון|\b(?:meeting|call|sync)\b)/i.test(s)) return true;
        const m = s.match(/\b(\d{1,2})\/(\d{1,2})\b/);
        if (!m) return false;
        const a = +m[1];
        const b = +m[2];
        return a > 12 && a <= 31 && b >= 1 && b <= 12 || b > 12 && b <= 31 && a >= 1 && a <= 12;
      }
      function selfSent(input) {
        const i = input || {};
        const from = String(i.sender && i.sender.email || i.senderEmail || "").trim().toLowerCase();
        const own = (i.ownAddresses || []).map((a) => String(a || "").trim().toLowerCase()).filter(Boolean);
        if (!from || own.indexOf(from) === -1) return false;
        const to = (i.to || i.toRecipients || []).map((a) => String(a || "").trim().toLowerCase()).filter(Boolean);
        const cc = (i.cc || i.ccRecipients || []).map((a) => String(a || "").trim().toLowerCase()).filter(Boolean);
        const rest = to.concat(cc);
        if (!rest.length) {
          if (i.headerToSelf === true) return true;
          return to.length > 0 && to.every((a) => own.indexOf(a) !== -1);
        }
        return rest.every((a) => own.indexOf(a) !== -1);
      }
      function buriedReaderRememberAsk(text) {
        const raw = String(text || "");
        if (/\bplease remember to\b/i.test(raw) && !/\bplease remember to\s+(?:remind|tell|ask|notify|ping|nudge|check with)\b/i.test(raw)) return true;
        if (/(?:^|[^\u0590-\u05FF])(?:תזכיר(?:י|ו)?\s+לי|תזכור(?:י|ו)?\s+ל(?!הזכיר|זכיר|שאול|הודיע|עדכן|תזכר)|אל\s+תשכח(?:י|ו)?\s+ל)/.test(raw)) {
          if (/(?:תזכור|תזכיר|אל\s+תשכח)\s+(?:ל)?(?:הזכיר|להזכיר|לשאול|להודיע|לעדכן|לתזכר)\s+/i.test(raw)) return false;
          return true;
        }
        return false;
      }
      function relayTargetIsThirdParty(who) {
        const name = String(who || "").toLowerCase().replace(/[^\w\u0590-\u05FF'’\s-]/g, "").trim();
        if (!name) return false;
        if (/^(you|ya|u|me|us|your|yours|yourself|yourselves)$/.test(name)) return false;
        if (/^(לך|לכם|לי|לנו|אותך|אתכם|אותי)$/.test(name)) return false;
        return true;
      }
      function buriedRememberRelayQuiet(text) {
        const raw = String(text || "");
        const heNotReader = "(?!\u05D9(?:\\s|[,\u060C.!?]|$)|\u05DB\u05DD(?:\\s|[,\u060C.!?]|$)|\u05E0\u05D5(?:\\s|[,\u060C.!?]|$)|\u05DA(?:\\s|[,\u060C.!?]|$)|\u05D0\u05D5\u05EA\u05DA|\u05D0\u05EA\u05DB\u05DD|\u05D0\u05D5\u05EA\u05D9)";
        if (/\b(?:please\s+)?remind\s+me\b/i.test(raw)) return false;
        if (/(?:^|[^\u0590-\u05FF])(?:תזכיר(?:י|ו)?\s+לי|תזכור(?:י|ו)?\s+לי|להזכיר\s+לי|אל\s+תשכח(?:י|ו)?\s+לי)\b/.test(raw)) return false;
        const enForgetRelay = raw.match(/\b(?:please\s+)?(?:do not|don't|dont)\s+forget\s+to\s+(?:remind|tell|ask|notify|ping|nudge|check with)\s+([A-Za-z\u0590-\u05FF][\w\u0590-\u05FF'’-]{0,40})\b/i);
        if (enForgetRelay && relayTargetIsThirdParty(enForgetRelay[1])) return true;
        const enRememberRelay = raw.match(/\bplease remember to\s+(?:remind|tell|ask|notify|ping|nudge|check with)\s+([A-Za-z\u0590-\u05FF][\w\u0590-\u05FF'’-]{0,40})\b/i);
        if (enRememberRelay && relayTargetIsThirdParty(enRememberRelay[1])) return true;
        const enVerb = raw.match(/\b(?:remind|tell|ask|notify|ping|nudge)\s+([A-Za-z\u0590-\u05FF][\w\u0590-\u05FF'’-]{0,40})\s+(?:to|that)\b/i);
        if (enVerb && relayTargetIsThirdParty(enVerb[1])) return true;
        if (/אל\s+תשכח\s+להזכיר\s+ל/.test(raw) && !/אל\s+תשכח\s+להזכיר\s+ל(?:י|כם|נו|ך|אותך|אתכם|אותי)\b/.test(raw)) return true;
        if (/תזכור\s+ל(?:הזכיר|זכיר)\s+ל/.test(raw) && new RegExp("\u05EA\u05D6\u05DB\u05D5\u05E8\\s+\u05DC(?:\u05D4\u05D6\u05DB\u05D9\u05E8|\u05D6\u05DB\u05D9\u05E8)\\s+\u05DC" + heNotReader).test(raw)) return true;
        if (/תזכור\s+לשאול\s+את\s+/.test(raw) && !/תזכור\s+לשאול\s+אתכם/.test(raw)) return true;
        if (/תזכור\s+להגיד\s+ל(?!כם(?:\s|[,،.!?]|$)|ך(?:\s|[,،.!?]|$))/.test(raw)) return true;
        if (new RegExp("\u05DC\u05D4\u05D6\u05DB\u05D9\u05E8\\s+\u05DC" + heNotReader).test(raw)) return true;
        if (new RegExp("(?:^|[^\\u0590-\\u05FF])(?:\u05EA\u05D6\u05DB\u05D9\u05E8|\u05EA\u05D6\u05DB\u05D9\u05E8\u05D9|\u05EA\u05D6\u05DB\u05D9\u05E8\u05D5)\\s+\u05DC" + heNotReader).test(raw)) return true;
        if (/לשאול\s+את\s+[\u0590-\u05FF]{2,}/.test(raw) && !/לשאול\s+אתכם/.test(raw)) return true;
        if (/להגיד\s+ל(?!י(?:\s|[,،.!?]|$)|נו(?:\s|[,،.!?]|$)|כם(?:\s|[,،.!?]|$)|ך(?:\s|[,،.!?]|$)|אותי|אותנו)[\u0590-\u05FF]{2,}/.test(raw)) return true;
        if (/לעדכן\s+אות(?!י(?:\s|[,،.!?]|$)|נו(?:\s|[,،.!?]|$)|ך(?:\s|[,،.!?]|$)|כם)/.test(raw)) return true;
        return false;
      }
      function notifyWhenDoneOnSendAsk(text) {
        const raw = String(text || "");
        if (/\b(?:do not|don't|dont)\s+forget\s+to\s+tell\s+(?:us|me)\s+when\b/i.test(raw)) return true;
        if (/אל\s+תשכח(?:י|ו)?\s+ל(?:הגיד|הודיע|עדכן)\s+ל(?:נו|י|כם|ך)(?:\s|$|[,،.!?])/.test(raw)) return true;
        return false;
      }
      function textForJudge(rawText, subject, selfNote) {
        const body = withoutPhoneSignature(prepareForJudge(rawText));
        const sub = String(prepareForJudge(subject || "")).replace(/\s+/g, " ").trim();
        if (body.length >= MIN_TEXT || !sub) return body;
        if (body.indexOf(sub) !== -1) return body;
        if (selfNote && sub.length >= MIN_TEXT) return (sub + "\n" + body).trim();
        if (!subjectCarriesSlot(sub)) return body;
        return (sub + "\n" + body).trim();
      }
      function sibling(globalValue, file, name) {
        if (globalValue) return globalValue;
        try {
          return typeof __require !== "undefined" ? __require(file)[name] : null;
        } catch (e) {
          return null;
        }
      }
      function pick(deps, key, globalValue) {
        return deps && deps[key] || globalValue || null;
      }
      function judge(input, deps) {
        const i = input || {};
        const d = deps || {};
        const intentApi = pick(d, "intent", typeof FlowIntent !== "undefined" ? FlowIntent : null);
        const actionsApi = pick(d, "actions", typeof FlowActions !== "undefined" ? FlowActions : null);
        const factReply = pick(d, "factReply", typeof FlowFactReply !== "undefined" ? FlowFactReply : null);
        const fileAttach = pick(d, "fileAttach", sibling(typeof FlowFileAttach !== "undefined" ? FlowFileAttach : null, "./file-attach.js", "FlowFileAttach"));
        const resolution = pick(d, "resolution", sibling(typeof FlowResolution !== "undefined" ? FlowResolution : null, "./resolution.js", "FlowResolution"));
        const quiet = pick(d, "quietMetrics", typeof FlowQuietMetrics !== "undefined" ? FlowQuietMetrics : null);
        if (!intentApi || typeof intentApi.classify !== "function") return { show: false, reason: "no-intent-api", intent: null };
        if (!actionsApi || typeof actionsApi.planFor !== "function") return { show: false, reason: "no-actions-api", intent: null };
        const noticeApi = pick(d, "systemNotice", sibling(typeof FlowSystemNotice !== "undefined" ? FlowSystemNotice : null, "./system-notice.js", "FlowSystemNotice"));
        if (i.systemNoticeOn === true && noticeApi && typeof noticeApi.detect === "function" && i.senderIsUser !== true) {
          const now0 = i.now && typeof i.now.getTime === "function" ? i.now : new Date(typeof i.now === "number" ? i.now : Date.now());
          const notice = noticeApi.detect({ text: prepareForJudge(i.text), subject: prepareForJudge(i.subject || ""), sender: i.sender || {}, now: now0, knownSenders: i.knownSenders || null });
          if (notice) return { show: true, intent: noticeIntent(intentApi, notice), process: forSurface(noticeProcess(notice, i.threadUrl), i.surface || "gmail") };
        }
        const bodyOnly = withoutPhoneSignature(prepareForJudge(i.text));
        const text = textForJudge(i.text, i.subject, selfSent(i));
        const factProbe = bodyOnly.length >= 12 && factReply && typeof factReply.detect === "function" ? factReply.detect(bodyOnly) : null;
        const shortAsk = typeof FlowJudgment !== "undefined" && typeof FlowJudgment.shortAskText === "function" && FlowJudgment.shortAskText(bodyOnly);
        if (text.length < MIN_TEXT && !factProbe && !shortAsk) return { show: false, reason: "too-short", intent: null };
        const sender = i.sender || {};
        const now = i.now && typeof i.now.getTime === "function" ? i.now : new Date(typeof i.now === "number" ? i.now : Date.now());
        let intent = intentApi.classify(text, {
          senderEmail: sender.email || null,
          senderName: sender.name || null,
          subject: i.subject || "",
          calibration: i.calibration || null,
          calibrationByType: i.calibrationByType || null,
          attachmentCount: i.attachmentCount || 0,
          now,
          to: i.to || i.toRecipients || null,
          cc: i.cc || i.ccRecipients || null,
          ownAddresses: i.ownAddresses || i.own || null,
          userName: i.userName || null,
          ownNames: i.ownNames || null,
          autoReply: i.autoReply === true,
          noteToSelf: i.noteToSelf === true,
          senderIsUser: i.senderIsUser === true,
          inbound: i.inbound,
          direction: i.direction || null,
          inSent: i.inSent === true,
          onBehalfOf: i.onBehalfOf || null,
          graphSender: i.graphSender || null,
          forwarded: i.forwarded === true,
          namesPending: i.namesPending === true,
          namesWaitDone: i.namesWaitDone === true,
          readerEmail: i.readerEmail || null
        });
        if (intent && intent.namesPending) return { show: false, reason: "names-pending", intent };
        if (buriedRememberRelayQuiet(text)) {
          return { show: false, reason: "quiet:relay", intent: intent || null };
        }
        if (!intent || !intent.type) {
          return { show: false, reason: intent && intent.quiet ? "quiet:" + intent.quiet : "intent-null", intent: intent || null };
        }
        const marketBlob = (i.subject ? String(i.subject) + "\n" : "") + text;
        if (intent.selfTask && typeof intentApi.marketingWebinar === "function" && intentApi.marketingWebinar(marketBlob)) {
          return { show: false, reason: "quiet:marketing", intent };
        }
        if (!intentApi.shouldShowChip(intent)) {
          const named = quiet && typeof quiet.reasonFor === "function" ? quiet.reasonFor(intent) : null;
          return { show: false, reason: named ? "quiet:" + named : "chip-low-confidence", intent };
        }
        if ((i.surface || "gmail") !== "gmail" && factReply && typeof factReply.blocksInbox === "function" && factReply.blocksInbox(intent, text)) {
          return { show: false, reason: "fact-reply-block", intent };
        }
        const isRequest = intentApi.TYPES ? intent.type === intentApi.TYPES.REQUEST : intent.type === "request";
        const vetoText = (i.subject ? String(i.subject) + "\n" : "") + text;
        if (typeof intentApi.phishingOrNegative === "function" && intentApi.phishingOrNegative(vetoText)) {
          return { show: false, reason: "quiet:family", intent };
        }
        if (/\b(?:do not|don't|no need to)\s+(?:send|attach|forward|share|resend|provide)\b/i.test(text)) {
          return { show: false, reason: "quiet:hedge", intent };
        }
        const gate = fileAttach && typeof fileAttach.gate === "function" ? fileAttach.gate(text) : { kind: "ignore" };
        const noParsedClock = !(intent.entities && Number.isInteger(intent.entities.hour) && Number.isInteger(intent.entities.minute));
        const followUpCall = /\bfollowing up on (?:our|the|that) call\b/i.test(text);
        const replyInsteadOfFile = isRequest && noParsedClock && intent.personalClose === "follow-up-ask" && !intent.inviteFile && followUpCall;
        const selfAttachTask = Boolean(intent && intent.selfAttachTask);
        const selfSentTask = Boolean(intent && intent.selfTask);
        if (!selfAttachTask && !selfSentTask && !replyInsteadOfFile && isRequest && gate.kind === "block") return { show: false, reason: gate.reason === "third-party" ? "third-party" : "file", intent };
        const droppedDeadline = Boolean(intent.facts && intent.facts.date && intent.facts.date.dropped);
        if (!selfAttachTask && !selfSentTask && !replyInsteadOfFile && isRequest && gate.kind === "clear" && !droppedDeadline && !(intent && intent.inviteFile) && !buriedReaderRememberAsk(text)) {
          if (resolution && typeof resolution.attestsPayment === "function" && resolution.attestsPayment(gate.ask.id)) return { show: false, reason: "file", intent };
          if (i.surface && i.surface !== "gmail" && !(intent && intent.inviteFile) && !notifyWhenDoneOnSendAsk(text)) {
            return { show: false, reason: "file-chain-not-run", intent };
          }
          if ((i.surface || "gmail") === "gmail" && resolution && typeof resolution.owns === "function" && resolution.owns(gate.ask.id)) return { show: false, reason: "file", intent };
        }
        if (intent.type === "event" && typeof intentApi.meetingPlanVeto === "function" && intentApi.meetingPlanVeto(vetoText)) {
          if (intent.signals && intent.signals.slotAsk && !(intent.facts && intent.facts.time)) {
            intent = Object.assign({}, intent, { type: "request", label: "Reply requested", entities: Object.assign({}, intent.entities || {}, { requestWhat: null, what: null }) });
          } else {
            return { show: false, reason: "meeting-veto", intent };
          }
        }
        const planCtx = {
          threadUrl: i.threadUrl || null,
          hasThreadAttachment: Boolean(i.hasThreadAttachment),
          executionMemory: i.executionMemory || null,
          text: vetoText
        };
        const baseProcess = actionsApi.planFor(intent, Object.assign({ baseOnly: true }, planCtx));
        if (!baseProcess || !baseProcess.steps || !baseProcess.steps.length) return { show: false, reason: "no-process", intent };
        const calendarHold = intent && intent.personalClose === "calendar-hold" && intent.explicitHold === true;
        const outlookInboundMeeting = outlookInboundMeetingClose(baseProcess, vetoText, actionsApi, intent);
        if ((i.surface || "gmail") !== "gmail" && !draftStepOf(baseProcess) && !taskOnlyProcess(baseProcess) && !calendarHold && !outlookInboundMeeting) {
          return { show: false, reason: "no-draft-close", intent };
        }
        const asked = intent.googleClose;
        if (!selfSentTask && (i.surface || "gmail") !== "outlook" && asked && asked.target === "onedrive") {
          return { show: false, reason: "onedrive-target-on-gmail", intent };
        }
        const process = actionsApi.planFor(intent, planCtx);
        if (!process || !process.steps || !process.steps.length) return { show: false, reason: "no-process", intent };
        return { show: true, intent, process: forSurface(process, i.surface || "gmail") };
      }
      function noticeIntent(intentApi, notice) {
        return {
          type: intentApi.TYPES ? intentApi.TYPES.REQUEST : "request",
          label: "Deadline notice",
          confidence: 0.9,
          systemNotice: true,
          notice,
          personalClose: "system-notice",
          entities: { what: notice.action, deadline: notice.dueIso },
          facts: { date: { iso: notice.dueIso } }
        };
      }
      function noticeProcess(notice, threadUrl) {
        return {
          id: "log-it",
          name: "Log It",
          closingLine: "Logging this so it stays tracked.",
          closedLine: "Logged and tracked.",
          needsDateChoice: false,
          dateChoices: null,
          systemNotice: true,
          steps: [{
            id: "task",
            kind: "googleTask",
            label: "Task",
            hint: "Create task: " + notice.title,
            params: { title: notice.title, dateIso: notice.dueIso, amount: null, what: notice.action, threadUrl: threadUrl || null },
            dependsOn: null
          }]
        };
      }
      function taskOnlyProcess(process) {
        const steps = process && process.steps || [];
        return steps.length > 0 && steps.every((s) => s && (s.kind === "googleTask" || s.kind === "googleTasks" || s.kind === "outlookTask"));
      }
      function meetingClockInText(text, intent) {
        const e = intent && intent.entities;
        if (e && Number.isInteger(e.hour) && Number.isInteger(e.minute)) return true;
        if (typeof FlowCloseFamilies !== "undefined" && typeof FlowCloseFamilies.readSlot === "function") {
          const slot = FlowCloseFamilies.readSlot(String(text || ""), /* @__PURE__ */ new Date());
          if (slot && slot.time && Number.isInteger(slot.time.hour) && Number.isInteger(slot.time.minute)) return true;
        }
        const extractApi = sibling(typeof FlowExtract !== "undefined" ? FlowExtract : null, "./extract.js", "FlowExtract");
        if (extractApi && typeof extractApi.extract === "function") {
          const facts = extractApi.extract(String(text || ""), {});
          if (facts && facts.time && Number.isInteger(facts.time.hour) && Number.isInteger(facts.time.minute)) return true;
        }
        if (extractApi && typeof extractApi.parseTime === "function") {
          const t = extractApi.parseTime(String(text || ""));
          if (t && Number.isInteger(t.hour) && Number.isInteger(t.minute)) return true;
        }
        return false;
      }
      function outlookInboundMeetingClose(process, text, actionsApi, intent) {
        const id = process && process.id;
        if (!process || draftStepOf(process)) return false;
        const src = String(text || "");
        const announce = actionsApi && typeof actionsApi.inboundMeetingAnnouncement === "function" && actionsApi.inboundMeetingAnnouncement(src);
        const timed = meetingClockInText(src, intent);
        if (id === "hold" && timed) return true;
        if (id === "schedule" && announce && !timed) return false;
        if (announce && (id === "hold" || id === "schedule")) return false;
        return false;
      }
      function forSurface(process, surface) {
        if (!process || surface !== "outlook") return process;
        const tasks = taskOnlyProcess(process);
        const steps = (process.steps || []).map((s) => {
          if (s && s.kind === "gmailDraft") {
            return Object.assign({}, s, { kind: "outlookDraft", id: String(s.id || "draft").replace(/^gmail/i, "outlook") });
          }
          if (tasks && s && (s.kind === "googleTask" || s.kind === "googleTasks")) {
            return Object.assign({}, s, { kind: "outlookTask", id: "outlookTask" });
          }
          if (s && s.kind === "driveFile") {
            return Object.assign({}, s, {
              kind: "onedriveFile",
              id: "onedriveFile",
              label: "OneDrive",
              hint: "Save the attached file to OneDrive"
            });
          }
          return s;
        });
        const out = Object.assign({}, process, { steps });
        if (steps.some((s) => s && s.kind === "onedriveFile")) {
          out.closedLine = "Saved on OneDrive.";
          const he = /[\u0590-\u05FF]/.test(String(out.closingLine || ""));
          out.closingLine = he ? "\u05E9\u05D5\u05DE\u05E8 \u05D0\u05EA \u05D4\u05E7\u05D5\u05D1\u05E5 \u05D4\u05DE\u05E6\u05D5\u05E8\u05E3 \u05D1-OneDrive." : "Saving the attached file to OneDrive.";
        }
        return out;
      }
      function draftStepOf(process) {
        return (process && process.steps || []).find((s) => s && (s.kind === "gmailDraft" || s.kind === "outlookDraft")) || null;
      }
      function draftPayload(process, ctx) {
        const c = ctx || {};
        const step = draftStepOf(process);
        const params = Object.assign({}, step && step.params || {});
        delete params.selectedAttachment;
        delete params.driveFileId;
        delete params.driveFileName;
        delete params.driveMimeType;
        const sender = c.sender || {};
        return { params, senderEmail: sender.email || null, senderName: sender.name || null, subject: c.subject || null };
      }
      function draftText(process, ctx, drafter) {
        const D = drafter || (typeof FlowDraftReply !== "undefined" ? FlowDraftReply : sibling(null, "./draft-reply.js", "FlowDraftReply"));
        if (!D || typeof D.draftBodyText !== "function") return null;
        return D.draftBodyText(draftPayload(process, ctx), null, null, null);
      }
      function silencesReceipt(text) {
        const fileAttach = sibling(typeof FlowFileAttach !== "undefined" ? FlowFileAttach : null, "./file-attach.js", "FlowFileAttach");
        const resolution = sibling(typeof FlowResolution !== "undefined" ? FlowResolution : null, "./resolution.js", "FlowResolution");
        const gate = fileAttach && typeof fileAttach.gate === "function" ? fileAttach.gate(prepareForJudge(text)) : { kind: "ignore" };
        if (!gate || gate.kind !== "clear" || !gate.ask || !gate.ask.id) return false;
        return Boolean(resolution && typeof resolution.attestsPayment === "function" && resolution.attestsPayment(gate.ask.id));
      }
      return { MIN_TEXT, prepareForJudge, selfSent, textForJudge, judge, noticeIntent, noticeProcess, forSurface, draftStepOf, taskOnlyProcess, draftPayload, draftText, silencesReceipt };
    })();
    if (typeof module !== "undefined") module.exports = { FlowIncomingJudge: FlowIncomingJudge2 };
    else if (typeof globalThis !== "undefined") globalThis.FlowIncomingJudge = FlowIncomingJudge2;
  }
});

// flow-trial-extension/core/request-types.js
var require_request_types = __commonJS({
  "flow-trial-extension/core/request-types.js"(exports, module) {
    var FlowRequestTypes2 = (() => {
      const ACTIONS = [
        {
          id: "pay",
          days: 7,
          noun: "payment",
          en: ["pay", "wire", "transfer", "settle", "remit", "reimburse"],
          he: ["\u05DC\u05E9\u05DC\u05DD", "\u05EA\u05E9\u05DC\u05DD", "\u05EA\u05E9\u05DC\u05DE\u05D5", "\u05DC\u05D4\u05D7\u05D6\u05D9\u05E8 \u05DB\u05E1\u05E3", "\u05D4\u05D7\u05D6\u05E8 \u05DB\u05E1\u05E4\u05D9", "\u05D4\u05E2\u05D1\u05E8\u05EA", "\u05E9\u05D9\u05DC\u05DE\u05EA", "\u05EA\u05E2\u05D1\u05D9\u05E8", "\u05EA\u05E2\u05D1\u05D9\u05E8\u05D9"]
        },
        {
          id: "sign",
          days: 2,
          noun: "signature",
          en: ["sign", "signed it", "countersign", "initial", "signature", "signed copy"],
          he: ["\u05DC\u05D7\u05EA\u05D5\u05DD", "\u05EA\u05D7\u05EA\u05D5\u05DD", "\u05EA\u05D7\u05EA\u05DE\u05D5", "\u05D7\u05EA\u05D9\u05DE\u05D4", "\u05D7\u05EA\u05D9\u05DE\u05EA\u05DA", "\u05D7\u05EA\u05DE\u05EA", "\u05EA\u05D7\u05EA\u05DE\u05D9"]
        },
        {
          id: "approve",
          days: 2,
          noun: "approval",
          en: ["approve", "authori[sz]e", "sign off", "green-?light", "approval", "go-ahead", "accept"],
          he: ["\u05DC\u05D0\u05E9\u05E8", "\u05EA\u05D0\u05E9\u05E8", "\u05EA\u05D0\u05E9\u05E8\u05D5", "\u05D0\u05D9\u05E9\u05D5\u05E8", "\u05D0\u05D9\u05E9\u05D5\u05E8\u05DA", "\u05D0\u05D9\u05E9\u05E8\u05EA", "\u05EA\u05D0\u05E9\u05E8\u05D9"]
        },
        {
          id: "confirm",
          days: 2,
          noun: "confirmation",
          en: ["confirm", "confirmation", "verify", "validate", "double-?check"],
          he: ["\u05DC\u05D5\u05D5\u05D3\u05D0", "\u05EA\u05D5\u05D5\u05D3\u05D0", "\u05DC\u05D0\u05DE\u05EA", "\u05EA\u05D0\u05DE\u05EA", "\u05D5\u05D9\u05D3\u05D5\u05D0"]
        },
        {
          id: "schedule",
          days: 1,
          noun: "a time",
          en: ["schedule", "book", "set up", "arrange", "propose a time", "pick a time", "reschedule", "move (?:it|this|that|the \\w+) to", "what time (?:works|is good|suits)", "call me", "your availability", "are you available", "when (?:are|can) you"],
          he: ["\u05DC\u05E7\u05D1\u05D5\u05E2", "\u05EA\u05E7\u05D1\u05E2", "\u05EA\u05E7\u05D1\u05E2\u05D5", "\u05DC\u05EA\u05D0\u05DD", "\u05EA\u05EA\u05D0\u05DD", "\u05EA\u05EA\u05D0\u05DE\u05D5", "\u05E4\u05E0\u05D5\u05D9", "\u05E4\u05E0\u05D5\u05D9\u05D4", "\u05DC\u05D3\u05D7\u05D5\u05EA", "\u05D6\u05DE\u05D9\u05E0\u05D5\u05EA", "\u05E0\u05D5\u05D7 \u05DC\u05DA", "\u05DE\u05EA\u05D0\u05D9\u05DD \u05DC\u05DA", "\u05EA\u05D0\u05E8\u05D9\u05DA \u05E0\u05D5\u05E1\u05E3", "\u05DE\u05D5\u05E2\u05D3 \u05E0\u05D5\u05E1\u05E3", "\u05D4\u05D0\u05E8\u05DB\u05D4", "\u05D4\u05D0\u05E8\u05DB\u05EA"]
        },
        {
          id: "decide",
          days: 2,
          noun: "a decision",
          en: ["decide", "decision", "choose", "pick", "select", "advise", "let me know whether"],
          he: ["\u05DC\u05D4\u05D7\u05DC\u05D9\u05D8", "\u05EA\u05D7\u05DC\u05D9\u05D8", "\u05EA\u05D7\u05DC\u05D9\u05D8\u05D5", "\u05D4\u05D7\u05DC\u05D8\u05D4", "\u05DC\u05D1\u05D7\u05D5\u05E8", "\u05EA\u05D1\u05D7\u05E8", "\u05EA\u05D1\u05D7\u05E8\u05D5"]
        },
        {
          id: "review",
          days: 2,
          noun: "a review",
          en: ["review", "check", "look at", "look over", "take a look", "proofread", "read", "comment on", "feedback", "thoughts", "input"],
          he: ["\u05DC\u05D1\u05D3\u05D5\u05E7", "\u05EA\u05D1\u05D3\u05D5\u05E7", "\u05EA\u05D1\u05D3\u05E7\u05D5", "\u05DC\u05E2\u05D1\u05D5\u05E8 \u05E2\u05DC", "\u05EA\u05E2\u05D1\u05D5\u05E8 \u05E2\u05DC", "\u05DC\u05D4\u05E1\u05EA\u05DB\u05DC", "\u05EA\u05E1\u05EA\u05DB\u05DC", "\u05DE\u05E9\u05D5\u05D1", "\u05D4\u05E2\u05E8\u05D5\u05EA", "\u05D7\u05D5\u05D5\u05EA \u05D3\u05E2\u05EA", "\u05D1\u05D3\u05D9\u05E7\u05EA", "\u05D1\u05D3\u05D9\u05E7\u05D4"]
        },
        {
          id: "join",
          days: 2,
          noun: "attendance",
          en: ["join", "attend", "rsvp", "register", "sign up", "come to"],
          he: ["\u05DC\u05D4\u05E6\u05D8\u05E8\u05E3", "\u05EA\u05E6\u05D8\u05E8\u05E3", "\u05DC\u05D4\u05D2\u05D9\u05E2", "\u05EA\u05D2\u05D9\u05E2", "\u05EA\u05D2\u05D9\u05E2\u05D5", "\u05DC\u05D4\u05D9\u05E8\u05E9\u05DD", "\u05EA\u05D9\u05E8\u05E9\u05DD", "\u05D0\u05D9\u05E9\u05D5\u05E8 \u05D4\u05D2\u05E2\u05D4"]
        },
        {
          id: "complete",
          days: 3,
          noun: "a deliverable",
          en: ["complete", "fill out", "fill in", "finish", "renew", "finali[sz]e", "prepare", "draft", "write", "create", "build", "fix", "update the", "deliver"],
          he: ["\u05DC\u05D4\u05E9\u05DC\u05D9\u05DD", "\u05EA\u05E9\u05DC\u05D9\u05DD", "\u05EA\u05E9\u05DC\u05D9\u05DE\u05D5", "\u05DC\u05DE\u05DC\u05D0", "\u05EA\u05DE\u05DC\u05D0", "\u05EA\u05DE\u05DC\u05D0\u05D5", "\u05DC\u05E1\u05D9\u05D9\u05DD", "\u05EA\u05E1\u05D9\u05D9\u05DD", "\u05DC\u05D4\u05DB\u05D9\u05DF", "\u05EA\u05DB\u05D9\u05DF", "\u05EA\u05DB\u05D9\u05E0\u05D5", "\u05DC\u05DB\u05EA\u05D5\u05D1", "\u05EA\u05DB\u05EA\u05D5\u05D1", "\u05DC\u05EA\u05E7\u05DF", "\u05EA\u05EA\u05E7\u05DF"]
        },
        {
          id: "send",
          days: 2,
          noun: "a file",
          en: ["send", "sending", "sent", "share", "forward", "provide", "attach", "upload", "return", "submit", "resend", "e-?mail me", "give me", "get me"],
          he: ["\u05DC\u05E7\u05D1\u05DC", "\u05E9\u05DC\u05D7\u05EA", "\u05E9\u05DC\u05D7\u05EA\u05DD", "\u05DC\u05E9\u05DC\u05D5\u05D7", "\u05EA\u05E9\u05DC\u05D7", "\u05EA\u05E9\u05DC\u05D7\u05D5", "\u05E9\u05DC\u05D7", "\u05DC\u05D4\u05E2\u05D1\u05D9\u05E8", "\u05EA\u05E2\u05D1\u05D9\u05E8", "\u05EA\u05E2\u05D1\u05D9\u05E8\u05D5", "\u05DC\u05D4\u05E2\u05DC\u05D5\u05EA", "\u05EA\u05E2\u05DC\u05D4", "\u05DC\u05D4\u05D2\u05D9\u05E9", "\u05EA\u05D2\u05D9\u05E9", "\u05DC\u05D4\u05D7\u05D6\u05D9\u05E8", "\u05EA\u05D7\u05D6\u05D9\u05E8", "\u05DC\u05E1\u05E4\u05E7", "\u05EA\u05E1\u05E4\u05E7", "\u05EA\u05DF \u05DC\u05D9", "\u05EA\u05E0\u05D9 \u05DC\u05D9", "\u05EA\u05E9\u05DE\u05D5\u05E8 \u05D0\u05EA (?:\u05D4)?(?:\u05E7\u05D5\u05D1\u05E5|\u05DE\u05E1\u05DE\u05DA|\u05DE\u05E6\u05D5\u05E8\u05E3)", "\u05DC\u05E9\u05DE\u05D5\u05E8 \u05D0\u05EA (?:\u05D4)?(?:\u05E7\u05D5\u05D1\u05E5|\u05DE\u05E1\u05DE\u05DA|\u05DE\u05E6\u05D5\u05E8\u05E3)"]
        },
        {
          id: "reply",
          days: 2,
          noun: "a reply",
          en: ["get my (?:email|message|text)", "reply", "respond", "get back", "revert", "answer", "response", "update me", "an update", "let me know", "follow up", "be in touch", "hear (?:back )?from you", "hear your"],
          he: ["\u05E7\u05D9\u05D1\u05DC\u05EA", "\u05DC\u05D4\u05E9\u05D9\u05D1", "\u05EA\u05E9\u05D9\u05D1", "\u05EA\u05E9\u05D9\u05D1\u05D5", "\u05DC\u05E2\u05E0\u05D5\u05EA", "\u05EA\u05E2\u05E0\u05D4", "\u05EA\u05E2\u05E0\u05D5", "\u05EA\u05D7\u05D6\u05D5\u05E8", "\u05EA\u05D7\u05D6\u05E8\u05D5", "\u05EA\u05D7\u05D6\u05E8\u05D9", "\u05DC\u05D7\u05D6\u05D5\u05E8 \u05D0\u05DC\u05D9\u05D9", "\u05DC\u05E2\u05D3\u05DB\u05DF", "\u05EA\u05E2\u05D3\u05DB\u05DF", "\u05EA\u05E2\u05D3\u05DB\u05E0\u05D5", "\u05EA\u05D5\u05D3\u05D9\u05E2", "\u05EA\u05D5\u05D3\u05D9\u05E2\u05D5", "\u05EA\u05E9\u05D5\u05D1\u05D4", "\u05E2\u05D3\u05DB\u05D5\u05DF", "\u05E1\u05D9\u05D5\u05E2", "\u05E2\u05D6\u05E8\u05EA\u05DA", "\u05E2\u05D6\u05E8\u05D4", "\u05D1\u05D9\u05E8\u05D5\u05E8", "\u05DC\u05D1\u05E8\u05E8", "\u05D4\u05D1\u05D4\u05E8\u05D4", "\u05DC\u05D4\u05D1\u05D4\u05D9\u05E8", "\u05DC\u05D3\u05E2\u05EA", "\u05E1\u05D8\u05D8\u05D5\u05E1", "\u05DC\u05D4\u05D5\u05D3\u05D9\u05E2"]
        }
      ];
      const OBJECTS = [
        { id: "contract", en: ["contract", "agreement", "lease", "nda", "terms", "addendum", "amendment", "engagement letter", "sow", "msa"], he: ["\u05D7\u05D5\u05D6\u05D4", "\u05D4\u05E1\u05DB\u05DD", "\u05E9\u05DB\u05D9\u05E8\u05D5\u05EA", "\u05EA\u05E0\u05D0\u05D9\u05DD", "\u05E0\u05E1\u05E4\u05D7", "\u05DB\u05EA\u05D1 \u05D4\u05EA\u05D7\u05D9\u05D9\u05D1\u05D5\u05EA"] },
        { id: "invoice", en: ["invoice", "bill", "receipt", "statement", "purchase order", "po"], he: ["\u05D7\u05E9\u05D1\u05D5\u05E0\u05D9\u05EA", "\u05E7\u05D1\u05DC\u05D4", "\u05D3\u05E8\u05D9\u05E9\u05EA \u05EA\u05E9\u05DC\u05D5\u05DD", "\u05D4\u05D6\u05DE\u05E0\u05EA \u05E8\u05DB\u05E9", "\u05D7\u05D9\u05D5\u05D1"] },
        { id: "quote", en: ["quote", "quotation", "estimate", "pricing", "price list", "bid", "proposal", "offer", "rates?"], he: ["\u05D4\u05E6\u05E2\u05EA \u05DE\u05D7\u05D9\u05E8", "\u05D4\u05E6\u05E2\u05D4", "\u05EA\u05DE\u05D7\u05D5\u05E8", "\u05DE\u05D7\u05D9\u05E8", "\u05DE\u05D7\u05D9\u05E8\u05D5\u05DF", "\u05D0\u05D5\u05DE\u05D3\u05DF"] },
        { id: "report", en: ["report", "analysis", "numbers", "figures", "data", "spreadsheet", "metrics", "results", "summary", "forecast", "budget"], he: ["\u05D3\u05D5\u05D7", '\u05D3\u05D5"\u05D7', "\u05E0\u05D9\u05EA\u05D5\u05D7", "\u05DE\u05E1\u05E4\u05E8\u05D9\u05DD", "\u05E0\u05EA\u05D5\u05E0\u05D9\u05DD", "\u05D2\u05D9\u05DC\u05D9\u05D5\u05DF", "\u05EA\u05E7\u05E6\u05D9\u05D1", "\u05EA\u05D7\u05D6\u05D9\u05EA", "\u05E1\u05D9\u05DB\u05D5\u05DD", "\u05EA\u05D5\u05E6\u05D0\u05D5\u05EA"] },
        { id: "deck", en: ["deck", "presentation", "slides", "pitch", "one-?pager", "brochure"], he: ["\u05DE\u05E6\u05D2\u05EA", "\u05E9\u05E7\u05E4\u05D9\u05DD", "\u05D1\u05E8\u05D5\u05E9\u05D5\u05E8"] },
        { id: "meeting", en: ["meeting", "call", "demo", "appointment", "time", "slot", "date", "availability", "session", "interview", "sync"], he: ["\u05E4\u05D2\u05D9\u05E9\u05D4", "\u05E9\u05D9\u05D7\u05D4", "\u05D3\u05DE\u05D5", "\u05DE\u05D5\u05E2\u05D3", "\u05D6\u05DE\u05DF", "\u05EA\u05D0\u05E8\u05D9\u05DA", "\u05E8\u05D0\u05D9\u05D5\u05DF"] },
        { id: "decision", en: ["decision", "go-?ahead", "direction", "option", "plan", "next steps?", "approach"], he: ["\u05D4\u05D7\u05DC\u05D8\u05D4", "\u05DB\u05D9\u05D5\u05D5\u05DF", "\u05D0\u05E4\u05E9\u05E8\u05D5\u05EA", "\u05EA\u05D5\u05DB\u05E0\u05D9\u05EA", "\u05E6\u05E2\u05D3\u05D9\u05DD \u05D4\u05D1\u05D0\u05D9\u05DD"] },
        { id: "design", en: ["design", "mock-?ups?", "logo", "artwork", "copy", "photos?", "images?", "video", "wireframes?", "creative"], he: ["\u05E2\u05D9\u05E6\u05D5\u05D1", "\u05DE\u05D5\u05E7\u05D0\u05E4", "\u05DC\u05D5\u05D2\u05D5", "\u05E7\u05D5\u05E4\u05D9", "\u05EA\u05DE\u05D5\u05E0\u05D5\u05EA", "\u05EA\u05DE\u05D5\u05E0\u05D4", "\u05E1\u05E8\u05D8\u05D5\u05DF"] },
        { id: "details", en: ["details", "info(?:rmation)?", "address", "phone number", "passport", "tax id", "vat number", "bank details", "account details"], he: ["\u05E4\u05E8\u05D8\u05D9\u05DD", "\u05DE\u05D9\u05D3\u05E2", "\u05DB\u05EA\u05D5\u05D1\u05EA", "\u05D8\u05DC\u05E4\u05D5\u05DF", "\u05EA\u05E2\u05D5\u05D3\u05EA \u05D6\u05D4\u05D5\u05EA", "\u05D3\u05E8\u05DB\u05D5\u05DF", "\u05E4\u05E8\u05D8\u05D9 \u05D1\u05E0\u05E7", "\u05E4\u05E8\u05D8\u05D9 \u05D7\u05E9\u05D1\u05D5\u05DF"] },
        { id: "access", en: ["access", "invite", "permissions?", "login", "account", "license"], he: ["\u05D2\u05D9\u05E9\u05D4", "\u05D4\u05D6\u05DE\u05E0\u05D4", "\u05D4\u05E8\u05E9\u05D0\u05D4", "\u05D4\u05E8\u05E9\u05D0\u05D5\u05EA", "\u05D7\u05E9\u05D1\u05D5\u05DF", "\u05E8\u05D9\u05E9\u05D9\u05D5\u05DF"] },
        { id: "feedback", en: ["feedback", "comments", "opinion", "edits", "redlines", "markup"], he: ["\u05DE\u05E9\u05D5\u05D1", "\u05D4\u05E2\u05E8\u05D5\u05EA", "\u05D3\u05E2\u05D4", "\u05E2\u05E8\u05D9\u05DB\u05D5\u05EA", "\u05EA\u05D9\u05E7\u05D5\u05E0\u05D9\u05DD"] },
        { id: "document", en: ["file", "files", "document", "documents", "attachment", "pdf", "form", "forms", "paperwork", "docs", "certificate", "letter", "application"], he: ["\u05E7\u05D5\u05D1\u05E5", "\u05E7\u05D1\u05E6\u05D9\u05DD", "\u05DE\u05E1\u05DE\u05DA", "\u05DE\u05E1\u05DE\u05DB\u05D9\u05DD", "\u05D8\u05D5\u05E4\u05E1", "\u05D8\u05E4\u05E1\u05D9\u05DD", "\u05EA\u05E2\u05D5\u05D3\u05D4", "\u05DE\u05DB\u05EA\u05D1", "\u05D1\u05E7\u05E9\u05D4"] },
        { id: "deliverable", en: ["deliverables?", "work", "version", "release", "patch", "milestone"], he: ["\u05EA\u05D5\u05E6\u05E8", "\u05E2\u05D1\u05D5\u05D3\u05D4", "\u05D2\u05E8\u05E1\u05D4", "\u05E9\u05D7\u05E8\u05D5\u05E8", "\u05D0\u05D1\u05DF \u05D3\u05E8\u05DA"] },
        { id: "money", en: ["deposit", "fee", "balance", "amount", "retainer", "installment", "refund", "payment"], he: ["\u05DE\u05E7\u05D3\u05DE\u05D4", "\u05E2\u05DE\u05DC\u05D4", "\u05D9\u05EA\u05E8\u05D4", "\u05E1\u05DB\u05D5\u05DD", "\u05E8\u05D9\u05D8\u05D9\u05D9\u05E0\u05E8", "\u05EA\u05E9\u05DC\u05D5\u05DD", "\u05D4\u05D7\u05D6\u05E8"] }
      ];
      const FRAME_EN = /\b(?:could|can|would|will) you\b|\b(?:can|could|shall) we\b|\bplease\b|\bkindly\b|\b(?:i|we)(?:'d| would) (?:like|appreciate|love)\b|\b(?:i|we) (?:need|require|want|expect)\b|\bneed you to\b|\b(?:waiting|awaiting) (?:for|on)\b|\bany chance\b|\bwhen (?:can|could|will) you\b|\bdo you have\b|\bby when\b|\bwould you mind\b|\bit would help (?:if|to)\b|\bstill need\b|\bhave you (?:had a chance|been able)\b|\b(?:can|could|would|will) (?:u|ya)\b|\b(?:pls|plz|pleez)\b|\b(?:did|have|had) (?:you|u) (?:\w+ )?(?:sent|send|paid|pay|signed|sign|confirmed|confirm|got|get|received|receive|transferred|transfer|checked|check|seen|see)\b|\b(?:u|you) able to\b|\bwhat time (?:works|is good|suits)\b|\blet me know if (?:you|u)\b|\bneed (?:the )?[\w ]{1,30} by\b/i;
      const FRAME_HE = /(?:תוכל|תוכלי|תוכלו|אפשר|ניתן(?!\s+לפנות)|נא |בבקשה|אשמח|צריך ש|צריכים|אני צריך|אנחנו צריכים|ממתין|ממתינה|ממתינים|מחכה|מחכים|מתי תוכל|יש לך|היית יכול|האם תוכל|עדיין צריך|אודה|נודה|אבקש|נבקש|אני מבקש|אנו מבקשים|אנחנו מבקשים|מבקשת|ברצוני (?:לדעת|לברר|לקבל|לוודא|לבקש)|ברצוננו (?:לדעת|לברר|לקבל|לוודא|לבקש)|הייתי מבקש|הייתי מודה|אצטרך|נצטרך|נשמח|^(?:(?:אחי|אחותי|חבר|חבר'ה|יקירי|היי|הי|שלום|נו|אז|ו)[,\s]+)*ת(?:שלח|שלחי|עביר|עבירי|חתום|חתמי|אשר|אשרי|בדוק|בדקי|עדכן|עדכני|חזור|חזרי|תן|תני|ביא|בואי|גיד|גידי|שמור|שמרי|שמרו|אשר)(?=[\s,.!?]|$)|(?:שלחת|שלחתם|העברת|חתמת|אישרת|שילמת|בדקת|קיבלת|ראית)(?:\s+כבר)?(?=[\s,.!?]|$)|מתי (?:ת(?:עביר|שלח|חתום|אשר|חזור|עדכן|שלם|בוא|גיע)|נוח|מתאים|אפשר|זה יהיה)|אפשר (?:ל|ש)\S+)/;
      ACTIONS.concat(OBJECTS).forEach((e) => {
        e.enRe = new RegExp("\\b(?:" + e.en.join("|") + ")\\b", "i");
        e.heRe = e.he.map((w) => new RegExp("(?<![\u05D0-\u05EA])[\u05D5\u05DC\u05E9\u05D1\u05D4\u05DE\u05DB]{0,2}" + w + "(?![\u05D0-\u05EA])"));
      });
      function hasHebrew(t) {
        return /[֐-׿]/.test(t);
      }
      function find(list, sentence) {
        const he = hasHebrew(sentence);
        for (const e of list) {
          if (e.enRe.test(sentence) || he && e.heRe.some((r) => r.test(sentence))) return e;
        }
        return null;
      }
      const findAction = (s) => find(ACTIONS, String(s || ""));
      const findObject = (s) => find(OBJECTS, String(s || ""));
      function framed(sentence) {
        const s = String(sentence || "");
        return FRAME_EN.test(s) || hasHebrew(s) && FRAME_HE.test(s);
      }
      function detectRequest(sentence) {
        const s = String(sentence || "");
        if (!framed(s)) return null;
        const action = findAction(s);
        if (!action) return null;
        const object = findObject(s);
        return {
          type: action.id + (object ? ":" + object.id : ""),
          action: action.id,
          object: object ? object.id : null,
          label: action.noun + (object ? " \xB7 " + object.id : ""),
          // A quote or a deliverable usually takes a day longer to produce.
          days: action.days + (object && (object.id === "quote" || object.id === "deliverable") && action.id !== "pay" ? 1 : 0)
        };
      }
      const COMMIT_EN = /^(?:will|sending|paying|transferring|signing)\b(?:\s+\w+){0,3}\s+(?:it|this|that|the|you|them|now|today|tonight|tomorrow|on|by|in)\b|\bill (?:send|pay|sign|check|call|do|transfer|confirm|get)\b|\b(?:i|we)(?:'ll| will| shall)\b|\b(?:i|we)(?:'m|'re| am| are) (?:going to|gonna)\b|\blet me (?:check|look|review|get|send|find|confirm|come back|revert|run|see|loop|work|pull|put|dig)\b|\b(?:i|we) agreed to\b/i;
      const COMMIT_HE = /אני (?:מעביר|שולח|חותם|משלם|מאשר|בודק|מעדכן|חוזר)(?![א-ת])(?:\s+\S+){0,3}?\s+(?:היום|עכשיו|הערב|מחר|עוד מעט)|(?<![א-ת])ו?(?:אדאג|נדאג|אעשה|נעשה|אחתום|נחתום|אפנה|נפנה|אבצע|נבצע|אגיש|נגיש|אפעל|נפעל|אשלם|נשלם|אקבע|נקבע|אסדר|נסדר|אטפל|נטפל|אשלח|נשלח|אחזור|נחזור|אעדכן|נעדכן|אבדוק|נבדוק|אכין|נכין|אעביר|נעביר|אתאם|נתאם|אחזיר|נחזיר|אשיב|נשיב|אאשר|נאשר|אספק|נספק|אכתוב|נכתוב|אסגור|נסגור|אסיים|נסיים|אתקן|נתקן)/;
      const COMMIT_NOT = /\b(?:maybe|might|perhaps|probably|hopefully|try to|if you|unless|in case|when you|once you|let me know)\b|(?:אולי|בערך|בוא נ|בואו נ|בואי נ|אם תרצו|אם תרצה|ברגע שתשלח|תודיע לי)/i;
      const COMMIT_NOT_ACTION = /\b(?:thank|thanks|happy|glad|be there|see you|call you|talk to you|speak)\b/i;
      function commitmentParts(sentence) {
        return String(sentence || "").split(/(?<=[.!?])\s+/).map((p) => p.trim()).filter(Boolean);
      }
      function detectCommitmentSentence(sentence) {
        const s = String(sentence || "");
        if (COMMIT_NOT.test(s)) return null;
        const parts = commitmentParts(s);
        if (hasHebrew(s)) {
          const hit2 = parts.find((p) => COMMIT_HE.test(p));
          if (!hit2) return null;
          const action2 = findAction(hit2);
          const object2 = findObject(hit2);
          const a = action2 ? action2.id : "reply";
          return { type: "owe:" + a + (object2 ? ":" + object2.id : ""), action: a, object: object2 ? object2.id : null };
        }
        const hit = parts.find((p) => COMMIT_EN.test(p) && !COMMIT_NOT_ACTION.test(p));
        if (!hit) return null;
        const action = findAction(hit);
        if (!action) return null;
        const object = findObject(hit);
        return { type: "owe:" + action.id + (object ? ":" + object.id : ""), action: action.id, object: object ? object.id : null };
      }
      function lexHits(sentence) {
        const s = String(sentence || "");
        const he = hasHebrew(s);
        const hit = (list) => list.filter((e) => e.enRe.test(s) || he && e.heRe.some((r) => r.test(s))).map((e) => e.id);
        return {
          actions: hit(ACTIONS),
          objects: hit(OBJECTS),
          framed: framed(s),
          committed: hasHebrew(s) ? COMMIT_HE.test(s) : COMMIT_EN.test(s),
          hedged: COMMIT_NOT.test(s)
        };
      }
      const SHORT_STATUS_EN = /^(?:(?:any|got any|is there any) (?:update|updates|news|progress|word)(?: on (?:this|that|it|the \w+))?|(?:what(?:'s| is) )?(?:the )?(?:status|eta)(?: on (?:this|that|it|the \w+))?|update|status|eta|news|(?:have you )?(?:seen|had a look at|checked) (?:this|it|my (?:email|message|note))|(?:did you|have you) (?:get|got|see|receive) (?:my|the|our) (?:email|message|note|invoice|contract|file|attachment|request)|(?:any )?(?:thoughts|luck|movement)(?: on (?:this|that|it))?)$/i;
      const SHORT_DONE_EN = /^(?:(paid|signed|approved|confirmed|sent|done|ready|finished|reviewed|booked|scheduled|received)(?: yet| already)?|(?:is it|was it|has it been|have you) (paid|signed|approved|sent|done|ready|reviewed)(?: yet| already)?)$/i;
      const SHORT_OBJECT_EN = /^(?:the |my |your |our |a )?(?:signed |updated |latest |final |revised )?(?:(?:signed )?copy|invoice|contract|agreement|quote|proposal|report|numbers|deck|draft|receipt|payment|file|files|document|form|forms|nda|po|link|address|details|slot|time|date)(?: (?:please|today|asap))?$/i;
      const SHORT_STATUS_HE = /^(?:מה (?:הסטטוס|המצב)(?: עם (?:זה|החשבונית|החוזה|ההצעה|התשלום))?|יש (?:עדכון|חדש|התקדמות)(?: (?:לגבי|בנוגע ל|עם) [^?]{1,20})?|עדכון|סטטוס|ראית(?:ם)? (?:את )?(?:המייל|ההודעה|זה)|קיבלת(?:ם)? (?:את )?(?:המייל|ההודעה|החשבונית|החוזה|הקובץ|זה)|מתי (?:תשלח(?:ו)?|תחזור|תחזרו|תעדכן|תעדכנו|יהיה)(?: [^?]{1,20})?)$/;
      const SHORT_DONE_HE = /^(?:(?:כבר )?(שולם|נחתם|אושר|נשלח|הוכן|סודר|נבדק)(?: כבר| עדיין)?|(?:כבר )?(שילמת(?:ם)?|חתמת(?:ם)?|אישרת(?:ם)?|שלחת(?:ם)?|בדקת(?:ם)?)(?: כבר)?)$/;
      const SHORT_OBJECT_HE = /^(?:את |ה)?(?:חשבונית|החשבונית|חוזה|החוזה|הסכם|ההסכם|הצעה|ההצעה|הצעת מחיר|דוח|הדוח|מצגת|המצגת|קבלה|הקבלה|קובץ|הקובץ|מסמך|המסמך|טופס|הטופס|תשלום|התשלום|כתובת|פרטים|הפרטים|מועד|הקישור|קישור)(?: בבקשה| היום)?$/;
      const DONE_ACTION = {
        paid: "pay",
        signed: "sign",
        approved: "approve",
        confirmed: "confirm",
        sent: "send",
        done: "complete",
        ready: "complete",
        finished: "complete",
        reviewed: "review",
        booked: "schedule",
        scheduled: "schedule",
        received: "send",
        "\u05E9\u05D5\u05DC\u05DD": "pay",
        "\u05E9\u05D9\u05DC\u05DE\u05EA": "pay",
        "\u05E9\u05D9\u05DC\u05DE\u05EA\u05DD": "pay",
        "\u05E0\u05D7\u05EA\u05DD": "sign",
        "\u05D7\u05EA\u05DE\u05EA": "sign",
        "\u05D7\u05EA\u05DE\u05EA\u05DD": "sign",
        "\u05D0\u05D5\u05E9\u05E8": "approve",
        "\u05D0\u05D9\u05E9\u05E8\u05EA": "approve",
        "\u05D0\u05D9\u05E9\u05E8\u05EA\u05DD": "approve",
        "\u05E0\u05E9\u05DC\u05D7": "send",
        "\u05E9\u05DC\u05D7\u05EA": "send",
        "\u05E9\u05DC\u05D7\u05EA\u05DD": "send",
        "\u05D4\u05D5\u05DB\u05DF": "complete",
        "\u05E1\u05D5\u05D3\u05E8": "complete",
        "\u05E0\u05D1\u05D3\u05E7": "review",
        "\u05D1\u05D3\u05E7\u05EA": "review",
        "\u05D1\u05D3\u05E7\u05EA\u05DD": "review"
      };
      function detectShortAsk(text) {
        const raw = String(text || "").replace(/\s+/g, " ").trim();
        if (!raw || raw.length > 60) return null;
        const q = /[?؟]\s*$/.test(raw) || /^\?/.test(raw);
        const body = raw.replace(/^[?\s]+|[?!.\s]+$/g, "").trim();
        if (!body || body.split(" ").length > 6) return null;
        if (!q) return null;
        const he = hasHebrew(body);
        const mk = (actionId, objectId, label) => {
          const act = ACTIONS.find((x) => x.id === actionId);
          return { type: actionId + (objectId ? ":" + objectId : "") + ":short", action: actionId, object: objectId || null, label: label || (act ? act.noun : "a reply"), days: act ? act.days : 2, short: true };
        };
        if (he) {
          let m2 = body.match(SHORT_DONE_HE);
          if (m2) return mk(DONE_ACTION[m2[1] || m2[2]] || "reply");
          if (SHORT_STATUS_HE.test(body)) return mk("reply", null, "a status");
          if (SHORT_OBJECT_HE.test(body)) {
            const o = findObject(body);
            return mk("send", o ? o.id : null);
          }
          return null;
        }
        const m = body.match(SHORT_DONE_EN);
        if (m) return mk(DONE_ACTION[(m[1] || m[2]).toLowerCase()] || "reply");
        if (SHORT_STATUS_EN.test(body)) return mk("reply", null, "a status");
        if (SHORT_OBJECT_EN.test(body)) {
          const o = findObject(body);
          return mk("send", o ? o.id : null);
        }
        return null;
      }
      function lexiconSize() {
        return ACTIONS.length * (OBJECTS.length + 1) * 2 * 2;
      }
      return { detectRequest, detectShortAsk, detectCommitmentSentence, findAction, findObject, framed, lexHits, lexiconSize, ACTIONS, OBJECTS };
    })();
    if (typeof module !== "undefined") module.exports = { FlowRequestTypes: FlowRequestTypes2 };
  }
});

// flow-trial-extension/core/extract.js
var require_extract = __commonJS({
  "flow-trial-extension/core/extract.js"(exports, module) {
    var FlowExtract3 = (() => {
      const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
      const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
      const DAYS_HE = ["\u05E8\u05D0\u05E9\u05D5\u05DF", "\u05E9\u05E0\u05D9", "\u05E9\u05DC\u05D9\u05E9\u05D9", "\u05E8\u05D1\u05D9\u05E2\u05D9", "\u05D7\u05DE\u05D9\u05E9\u05D9", "\u05E9\u05D9\u05E9\u05D9", "\u05E9\u05D1\u05EA"];
      const MONTHS_HE = ["\u05D9\u05E0\u05D5\u05D0\u05E8", "\u05E4\u05D1\u05E8\u05D5\u05D0\u05E8", "\u05DE\u05E8\u05E5", "\u05D0\u05E4\u05E8\u05D9\u05DC", "\u05DE\u05D0\u05D9", "\u05D9\u05D5\u05E0\u05D9", "\u05D9\u05D5\u05DC\u05D9", "\u05D0\u05D5\u05D2\u05D5\u05E1\u05D8", "\u05E1\u05E4\u05D8\u05DE\u05D1\u05E8", "\u05D0\u05D5\u05E7\u05D8\u05D5\u05D1\u05E8", "\u05E0\u05D5\u05D1\u05DE\u05D1\u05E8", "\u05D3\u05E6\u05DE\u05D1\u05E8"];
      const MONTH_ABBR = {
        jan: 0,
        feb: 1,
        mar: 2,
        apr: 3,
        may: 4,
        jun: 5,
        jul: 6,
        aug: 7,
        sep: 8,
        sept: 8,
        oct: 9,
        nov: 10,
        dec: 11
      };
      const CURRENCY = {
        "$": "USD",
        "us$": "USD",
        "usd": "USD",
        "\u20AC": "EUR",
        "eur": "EUR",
        "\xA3": "GBP",
        "gbp": "GBP",
        "\u20AA": "ILS",
        "nis": "ILS",
        "ils": "ILS",
        "\u20B9": "INR",
        "inr": "INR",
        "c$": "CAD",
        "cad": "CAD",
        "a$": "AUD",
        "aud": "AUD"
      };
      const MULT = { k: 1e3, thousand: 1e3, \u05D0\u05DC\u05E3: 1e3, m: 1e6, mm: 1e6, million: 1e6, \u05DE\u05D9\u05DC\u05D9\u05D5\u05DF: 1e6, bn: 1e9, billion: 1e9 };
      const MONEY_RE = new RegExp(
        '(?:(\\$|\u20AC|\xA3|\u20AA|\u20B9|US\\$|C\\$|A\\$|USD|EUR|GBP|NIS|ILS|INR|CAD|AUD)\\s?)?(\\d{1,3}(?:,\\d{3})+(?:\\.\\d{1,2})?|\\d+(?:\\.\\d{1,2})?)(?:\\s?(k|m|mm|bn|thousand|million|billion|\u05D0\u05DC\u05E3|\u05DE\u05D9\u05DC\u05D9\u05D5\u05DF)(?![A-Za-z\\u0590-\\u05FF]))?(?:\\s?(USD|EUR|GBP|NIS|ILS|INR|CAD|AUD|dollars|euros|pounds|shekels|\\$|\u20AC|\xA3|\u20AA|\u05E9\u05E7\u05DC(?:\u05D9\u05DD)?|\u05E9(?:\u05F4|")?\u05D7))?',
        "gi"
      );
      function parseMoney(text) {
        const hits = [];
        let m;
        MONEY_RE.lastIndex = 0;
        while ((m = MONEY_RE.exec(text)) !== null) {
          const [raw, pre, digits, mult, post] = m;
          const code = CURRENCY[(pre || "").toLowerCase()] || CURRENCY[(post || "").toLowerCase().slice(0, 3)] || (/dollars/i.test(post || "") ? "USD" : /euros/i.test(post || "") ? "EUR" : /pounds/i.test(post || "") ? "GBP" : /shekels|שקל|ש(?:״|")?ח/i.test(post || "") ? "ILS" : null);
          if (!code) continue;
          let value = parseFloat(digits.replace(/,/g, ""));
          if (mult) value *= MULT[mult.toLowerCase()] || 1;
          const after = text.slice(m.index + raw.length, m.index + raw.length + 2);
          if (after.trim().startsWith("%")) continue;
          hits.push({ raw: raw.trim(), value, currency: code, index: m.index });
        }
        if (!hits.length) return null;
        return hits.sort((a, b) => b.value - a.value)[0];
      }
      function fmtMoney(money) {
        if (!money) return null;
        try {
          return new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: money.currency,
            maximumFractionDigits: money.value % 1 === 0 ? 0 : 2
          }).format(money.value);
        } catch (e) {
          return money.raw;
        }
      }
      function iso(d) {
        return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
      }
      function buildDate(year, monthIdx, day) {
        if (!(monthIdx >= 0 && monthIdx <= 11) || !(day >= 1 && day <= 31)) return null;
        const d = new Date(year, monthIdx, day);
        if (d.getFullYear() !== year || d.getMonth() !== monthIdx || d.getDate() !== day) return null;
        return d;
      }
      const PAST_MS = 1e3 * 60 * 60 * 24 * 30;
      const FUTURE_MS = 1e3 * 60 * 60 * 24 * 120;
      function weekdayDayFirst(text, now) {
        const src = String(text || "");
        const dayName = src.match(/(?:ביום|יום)\s+(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)(?![\u0590-\u05FF])/);
        const slash = src.match(/(?:^|[^\d])(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?!\d)/);
        const clock = src.match(/(?:בשעה|בשעות|(?<![\u0590-\u05FF])בעה)\s*\d{1,2}:\d{2}(?!\d)/);
        if (!dayName || !slash || !clock || !now) return null;
        const weekday = DAYS_HE.indexOf(dayName[1]);
        const day = +slash[1];
        const month = +slash[2];
        const raw = dayName[0] + " " + slash[1] + "/" + slash[2] + (slash[3] ? "/" + slash[3] : "");
        if (weekday < 0 || month < 1 || month > 12 || day < 1 || day > 31) {
          return { raw, iso: null, contradictsWeekday: true };
        }
        let year = null;
        if (slash[3]) {
          year = +slash[3];
          if (year < 100) year += 2e3;
        }
        if (year) {
          const dated = buildDate(year, month - 1, day);
          if (!dated || dated.getDay() !== weekday) return { raw, iso: null, contradictsWeekday: true };
          return { raw, iso: iso(dated) };
        }
        const y = now.getFullYear();
        const candidates = [y - 1, y, y + 1].map((yy) => buildDate(yy, month - 1, day)).filter((d) => d && d.getDay() === weekday && now - d <= PAST_MS && d - now <= FUTURE_MS);
        if (candidates.length !== 1) return { raw, iso: null, contradictsWeekday: true };
        return { raw, iso: iso(candidates[0]) };
      }
      function monthDay(raw, monthIdx, day, explicitYear, now) {
        if (explicitYear) {
          const d = buildDate(+explicitYear, monthIdx, day);
          return d ? { raw, iso: iso(d) } : null;
        }
        const y = now.getFullYear();
        const inWindow = [y - 1, y, y + 1].map((yy) => buildDate(yy, monthIdx, day)).filter((d) => d && now - d <= PAST_MS && d - now <= FUTURE_MS);
        if (inWindow.length !== 1) {
          const anyValid = [y - 1, y, y + 1].some((yy) => buildDate(yy, monthIdx, day));
          return anyValid ? { raw, iso: null, ambiguousYear: true } : null;
        }
        return { raw, iso: iso(inWindow[0]) };
      }
      function localToday(now) {
        const d = now || /* @__PURE__ */ new Date();
        const p = (n) => String(n).padStart(2, "0");
        return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
      }
      function slashRejected(text, index) {
        const before = text.slice(Math.max(0, index - 32), index);
        if (/(?:invoice|inv|version|ver|חשבונית|גרסה|טלפון|phone|ext)\.?\s*[#:]?\s*$/i.test(before)) return true;
        if (/(?:^|[^A-Za-z])v\s*$/i.test(before)) return true;
        return false;
      }
      function slashDateContext(text, index, raw) {
        const before = text.slice(Math.max(0, index - 40), index);
        const window = text.slice(Math.max(0, index - 48), Math.min(text.length, index + String(raw || "").length + 48));
        if (/(?:עד|ב-|ב־|לפני|ביום)\s*$/.test(before)) return true;
        if (/\b(?:on|by|until|before|due|no later than)\s*$/i.test(before)) return true;
        if (/\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(window)) return true;
        if (/יום\s+(?:ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)/.test(window)) return true;
        if (/(?:פגישה|שיחה|ראיון|\b(?:meeting|call|sync)\b)/i.test(window)) return true;
        if (/(?:בשעה|(?<![\u0590-\u05FF])בעה|\bat\s+\d|\b\d{1,2}:\d{2}\b)/i.test(window)) return true;
        return false;
      }
      function slashDate(text, now) {
        const src = String(text || "");
        const re = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g;
        const today = localToday(now || /* @__PURE__ */ new Date());
        let ambiguous = null;
        let m;
        while (m = re.exec(src)) {
          if (slashRejected(src, m.index)) continue;
          const a = +m[1];
          const b = +m[2];
          let day = null;
          let monthIdx = null;
          if (a > 12 && a <= 31 && b >= 1 && b <= 12) {
            day = a;
            monthIdx = b - 1;
          } else if (b > 12 && b <= 31 && a >= 1 && a <= 12) {
            day = b;
            monthIdx = a - 1;
          } else {
            if (!ambiguous) ambiguous = { raw: m[0], iso: null };
            continue;
          }
          let year = m[3] ? +m[3] : null;
          if (year != null && year < 100) year += 2e3;
          const built = monthDay(m[0], monthIdx, day, year, now || /* @__PURE__ */ new Date());
          const iso2 = built && built.iso;
          if (!iso2 || !slashDateContext(src, m.index, m[0]) || iso2 < today) {
            if (!ambiguous) ambiguous = { raw: m[0], iso: null };
            continue;
          }
          return built;
        }
        return ambiguous;
      }
      function hasStatedClock(src) {
        if (/(?:בשעה|בשעות|(?<![\u0590-\u05FF])בעה)\s*\d{1,2}:\d{2}(?!\d)/.test(src)) return true;
        if (/(?:^|[^\u0590-\u05FF\d])ב-\s*\d{1,2}:\d{2}(?!\d)/.test(src)) return true;
        if (/\bat\s+\d{1,2}(?::\d{2})?\b/i.test(src)) return true;
        if (/(?:^|[^\d])\d{1,2}:\d{2}(?!\d)/.test(src)) return true;
        return false;
      }
      function numericDayMonth(src) {
        const slash = src.match(/(?:^|[^\d])(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?!\d)/);
        const dotted = src.match(/(?:^|[^\d])(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?(?!\d)/);
        const m = slash || dotted;
        if (!m) return null;
        const a = +m[1];
        const b = +m[2];
        let day = null;
        let month = null;
        if (a > 12 && a <= 31 && b >= 1 && b <= 12) {
          day = a;
          month = b;
        } else if (b > 12 && b <= 31 && a >= 1 && a <= 12) {
          day = b;
          month = a;
        } else return null;
        return { day, month, yearRaw: m[3] || null, token: m[1] + (slash ? "/" : ".") + m[2] + (m[3] ? (slash ? "/" : ".") + m[3] : "") };
      }
      function namedWeekday(src) {
        const he = src.match(/(?:ביום|יום)\s+(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)(?![\u0590-\u05FF])/);
        const en = src.match(new RegExp("\\b(" + DAYS.join("|") + ")\\b", "i"));
        if (he && (!en || he.index <= en.index)) return { index: DAYS_HE.indexOf(he[1]), he: true, raw: he[0] };
        if (en) return { index: DAYS.indexOf(en[1].toLowerCase()), he: false, raw: en[0] };
        return null;
      }
      function choiceLabel(date, he) {
        const name = he ? DAYS_HE[date.getDay()] : DAYS[date.getDay()].charAt(0).toUpperCase() + DAYS[date.getDay()].slice(1);
        return name + " " + date.getDate() + "/" + (date.getMonth() + 1);
      }
      function nearestWeekday(anchor, weekday) {
        for (let delta = 1; delta <= 3; delta++) {
          const before = new Date(anchor.getTime());
          before.setDate(anchor.getDate() - delta);
          if (before.getDay() === weekday) return before;
          const after = new Date(anchor.getTime());
          after.setDate(anchor.getDate() + delta);
          if (after.getDay() === weekday) return after;
        }
        return null;
      }
      function weekdayDayFirst(text, now) {
        const src = String(text || "");
        const dayName = namedWeekday(src);
        const num = numericDayMonth(src);
        if (!dayName || !num || !now) return null;
        const clock = hasStatedClock(src);
        const raw = dayName.raw + " " + num.token;
        if (dayName.index < 0 || num.month < 1 || num.month > 12 || num.day < 1 || num.day > 31) {
          if (!clock) return null;
          return { raw, iso: null, invalidDate: true };
        }
        let year = null;
        if (num.yearRaw) {
          year = +num.yearRaw;
          if (year < 100) year += 2e3;
        }
        let written = null;
        if (year) {
          written = buildDate(year, num.month - 1, num.day);
          if (!written) return clock ? { raw, iso: null, invalidDate: true } : null;
        } else {
          const y = now.getFullYear();
          const inWindow = [y - 1, y, y + 1].map((yy) => buildDate(yy, num.month - 1, num.day)).filter((d) => d && now - d <= PAST_MS && d - now <= FUTURE_MS);
          if (inWindow.length !== 1) return clock ? { raw, iso: null, invalidDate: true } : null;
          written = inWindow[0];
        }
        if (written.getDay() === dayName.index) {
          if (!clock) return null;
          return { raw, iso: iso(written), statedWeekday: true };
        }
        if (!clock) return null;
        const other = nearestWeekday(written, dayName.index);
        if (!other) return { raw, iso: null, contradictsWeekday: true };
        return {
          raw,
          iso: null,
          contradictsWeekday: true,
          choices: [
            { iso: iso(other), label: choiceLabel(other, dayName.he) },
            { iso: iso(written), label: choiceLabel(written, dayName.he) }
          ]
        };
      }
      function parseDate(text, now) {
        now = now || /* @__PURE__ */ new Date();
        let m;
        m = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
        if (m) {
          const d = buildDate(+m[1], +m[2] - 1, +m[3]);
          if (d) return { raw: m[0], iso: m[0] };
          return null;
        }
        const monthNames = MONTHS.join("|");
        m = text.match(new RegExp("\\b(" + monthNames + ")\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b", "i"));
        if (m) return monthDay(m[0], MONTHS.indexOf(m[1].toLowerCase()), +m[2], m[3], now);
        m = text.match(new RegExp("\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(" + monthNames + ")(?:,?\\s+(\\d{4}))?\\b", "i"));
        if (m) return monthDay(m[0], MONTHS.indexOf(m[2].toLowerCase()), +m[1], m[3], now);
        m = text.match(/\b(sept|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/i);
        if (m) return monthDay(m[0], MONTH_ABBR[m[1].toLowerCase()], +m[2], m[3], now);
        m = text.match(new RegExp("(?:^|[^\\d\\u0590-\\u05FF])(\\d{1,2})\\s+\u05D1-?(" + MONTHS_HE.join("|") + ")(?![\\u0590-\\u05FF])(?:\\s+(\\d{4}))?"));
        if (m) return monthDay(m[0].replace(/^[^\d]+/, ""), MONTHS_HE.indexOf(m[2]), +m[1], m[3], now);
        const stated = weekdayDayFirst(text, now);
        if (stated) return stated;
        m = text.match(new RegExp("\\b(?:by|on|before|due|until|no later than|signing|closing|starting|effective|kick(?:ing)? off)\\s+(?:on\\s+)?(?:next\\s+)?(" + DAYS.join("|") + ")\\b", "i"));
        if (m) {
          const target = DAYS.indexOf(m[1].toLowerCase());
          const d = new Date(now);
          let delta = (target - d.getDay() + 7) % 7;
          if (delta === 0) delta = 7;
          else if (/next\s/i.test(m[0])) delta += 7;
          d.setDate(d.getDate() + delta);
          const numbered = slashDate(text, now);
          if (numbered && numbered.iso) return numbered;
          return { raw: m[0], iso: iso(d) };
        }
        m = text.match(new RegExp("\\bnext\\s+(" + DAYS.join("|") + ")\\b", "i"));
        if (m) {
          const target = DAYS.indexOf(m[1].toLowerCase());
          const d = new Date(now);
          let delta = (target - d.getDay() + 7) % 7;
          if (delta === 0) delta = 7;
          else delta += 7;
          d.setDate(d.getDate() + delta);
          return { raw: m[0], iso: iso(d) };
        }
        m = text.match(new RegExp("\\b(this\\s+|next\\s+)?(" + DAYS.join("|") + ")\\b(?=\\s+at\\s+\\d)", "i"));
        if (m) {
          const target = DAYS.indexOf(m[2].toLowerCase());
          const d = new Date(now);
          let delta = (target - d.getDay() + 7) % 7;
          const flagged = (m[1] || "").toLowerCase();
          if (delta === 0) {
            if (flagged.indexOf("this") !== 0) delta = 7;
          } else if (flagged.indexOf("next") === 0) delta += 7;
          d.setDate(d.getDate() + delta);
          return { raw: m[0], iso: iso(d) };
        }
        m = text.match(new RegExp("(?:\u05E2\u05D3|\u05D1-?|\u05DC|\u05DC\u05D0 \u05D9\u05D0\u05D5\u05D7\u05E8 \u05DE-?)\\s*\u05D9\u05D5\u05DD\\s+(" + DAYS_HE.join("|") + ")(?:\\s+\u05D4\u05D1\u05D0(?![\\u0590-\\u05FF]))?"));
        if (m) {
          const target = DAYS_HE.indexOf(m[1]);
          const d = new Date(now);
          let delta = (target - d.getDay() + 7) % 7;
          const isNext = /הבא(?![\u0590-\u05FF])/.test(m[0]);
          if (delta === 0) delta = 7;
          else if (isNext) delta += 7;
          d.setDate(d.getDate() + delta);
          return { raw: m[0], iso: iso(d) };
        }
        m = text.match(/\b(the day after tomorrow|tomorrow)\b/i);
        if (m) {
          const word = m[1].toLowerCase();
          const days = word === "tomorrow" ? 1 : 2;
          const d = new Date(now);
          d.setDate(d.getDate() + days);
          return { raw: m[0], iso: iso(d) };
        }
        m = text.match(/\b(?:by|due|before|until|no later than)\s+today\b|\b(?:meet(?:ing)?|call|sync)\s+today\b|\btoday\s+at\b/i);
        if (m) {
          const d = new Date(now);
          return { raw: m[0], iso: iso(d) };
        }
        m = text.match(/\b(?:by|before|due|until|no later than)\s+(?:the\s+)?(?:eod|end of day|close of business|cob)\b/i);
        if (m) {
          const d = new Date(now);
          return { raw: m[0], iso: iso(d) };
        }
        m = text.match(/(?:^|[^\u0590-\u05FF])ל?(מחרתיים|מחר)(?![\u0590-\u05FF])/);
        if (m) {
          const days = m[1] === "\u05DE\u05D7\u05E8" ? 1 : 2;
          const d = new Date(now);
          d.setDate(d.getDate() + days);
          return { raw: m[1], iso: iso(d) };
        }
        m = text.match(/(?:פגישה|שיחה|עד)\s+היום(?![\u0590-\u05FF])|היום\s+בשעה/);
        if (m) {
          const d = new Date(now);
          return { raw: "\u05D4\u05D9\u05D5\u05DD", iso: iso(d) };
        }
        m = text.match(/(?:עד|לפני)\s+סוף\s+היום(?![\u0590-\u05FF])/);
        if (m) {
          const d = new Date(now);
          return { raw: "\u05D4\u05D9\u05D5\u05DD", iso: iso(d) };
        }
        const slash = slashDate(text, now);
        if (slash) return slash.iso ? slash : { raw: slash.raw, iso: null };
        return null;
      }
      function resolveClock(hour, minute, marker) {
        let h = hour;
        if (h > 23 || minute > 59 || h < 0 || minute < 0) return null;
        if (!marker) {
          if (h < 8 || h === 12) return null;
          return { hour: h, minute };
        }
        if (marker === "am" || marker === "in the morning") {
          if (h === 12) h = 0;
          else if (h > 12) return null;
          return { hour: h, minute };
        }
        if (marker === "pm" || marker === "in the afternoon") {
          if (h < 12) h += 12;
          return h > 23 ? null : { hour: h, minute };
        }
        if (marker === "noon-window") {
          if (h >= 1 && h <= 6) h += 12;
          else if (h !== 12 && h < 13) return null;
          return { hour: h, minute };
        }
        if (marker === "in the evening") {
          if (h === 0 || h === 12) return null;
          if (h < 12) h += 12;
          return h > 23 ? null : { hour: h, minute };
        }
        if (marker === "at night") {
          if (h === 12) h = 0;
          else if (h >= 8 && h <= 11) h += 12;
          else if (!(h >= 1 && h <= 4 || h >= 13)) return null;
          return { hour: h, minute };
        }
        return null;
      }
      function parseTime(text) {
        let m;
        m = text.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?|(?:in the|this) (?:morning|afternoon|evening)|at night)?\b/i);
        if (m) {
          const marker = (m[3] || "").toLowerCase().replace(/\./g, "").replace(/^this /, "in the ");
          const clock = resolveClock(+m[1], m[2] ? +m[2] : 0, marker);
          if (!clock) return null;
          return { raw: m[0], hour: clock.hour, minute: clock.minute };
        }
        const hePart = `\u05D1\u05D1\u05D5\u05E7\u05E8|\u05D1\u05E6\u05D4\u05E8\u05D9\u05D9\u05DD|\u05D0\u05D7\u05E8 \u05D4\u05E6\u05D4\u05E8\u05D9\u05D9\u05DD|\u05D0\u05D7\u05E8 \u05D4\u05E6\u05D4\u05E8\u05D9\u05DD|\u05D0\u05D7\u05D4["\u05F4\u05F3']\u05E6|\u05D1\u05E2\u05E8\u05D1|\u05D1\u05DC\u05D9\u05DC\u05D4`;
        m = text.match(new RegExp("(?:\u05D1\u05E9\u05E2\u05D4|\u05D1\u05E9\u05E2\u05D5\u05EA|(?<![\\u0590-\\u05FF])\u05D1\u05E2\u05D4)\\s*(\\d{1,2})(?::(\\d{2}))?(?:\\s*(" + hePart + "))?(?![\\u0590-\\u05FF\\d])"));
        if (m) {
          const rawPart = (m[3] || "").replace(/["״׳']/g, "");
          const marker = rawPart === "\u05D1\u05D1\u05D5\u05E7\u05E8" ? "in the morning" : rawPart === "\u05D1\u05E6\u05D4\u05E8\u05D9\u05D9\u05DD" ? "noon-window" : rawPart === "\u05D0\u05D7\u05E8 \u05D4\u05E6\u05D4\u05E8\u05D9\u05D9\u05DD" || rawPart === "\u05D0\u05D7\u05E8 \u05D4\u05E6\u05D4\u05E8\u05D9\u05DD" || rawPart === "\u05D0\u05D7\u05D4\u05E6" ? "in the afternoon" : rawPart === "\u05D1\u05E2\u05E8\u05D1" ? "in the evening" : rawPart === "\u05D1\u05DC\u05D9\u05DC\u05D4" ? "at night" : "";
          const minuteWritten = Boolean(m[2]);
          let clock = resolveClock(+m[1], minuteWritten ? +m[2] : 0, marker);
          if (!clock && !marker && !minuteWritten && +m[1] >= 1 && +m[1] <= 7) {
            clock = resolveClock(+m[1], 0, "pm");
          }
          if (!clock) return null;
          return { raw: m[0], hour: clock.hour, minute: clock.minute };
        }
        const heHourWords = [
          ["\u05D0\u05D7\u05EA \u05E2\u05E9\u05E8\u05D4", 11],
          ["\u05D0\u05D7\u05D3 \u05E2\u05E9\u05E8\u05D4", 11],
          ["\u05E9\u05EA\u05D9\u05D9\u05DD \u05E2\u05E9\u05E8\u05D4", 12],
          ["\u05E9\u05EA\u05D9\u05DD \u05E2\u05E9\u05E8\u05D4", 12],
          ["\u05E9\u05EA\u05D9\u05D9\u05DD", 2],
          ["\u05E9\u05EA\u05D9\u05DD", 2],
          ["\u05E9\u05DC\u05D5\u05E9", 3],
          ["\u05D0\u05E8\u05D1\u05E2", 4],
          ["\u05D7\u05DE\u05E9", 5],
          ["\u05E9\u05E9", 6],
          ["\u05E9\u05D1\u05E2", 7],
          ["\u05E9\u05DE\u05D5\u05E0\u05D4", 8],
          ["\u05EA\u05E9\u05E2", 9],
          ["\u05E2\u05E9\u05E8", 10],
          ["\u05D0\u05D7\u05EA", 1]
        ];
        const heHourAlt = heHourWords.map((pair) => pair[0]).join("|");
        m = text.match(new RegExp("(?:^|[^\\u0590-\\u05FF])\u05D1(" + heHourAlt + ")(\\s+\u05D5\u05D7\u05E6\u05D9|\\s+\u05D5\u05E8\u05D1\u05E2)?(?:\\s+(" + hePart + "))?(?![\\u0590-\\u05FF])"));
        if (m) {
          const spokenHour = heHourWords.find((pair) => pair[0] === m[1]);
          const rawPart = (m[3] || "").replace(/["״׳']/g, "");
          const marker = rawPart === "\u05D1\u05D1\u05D5\u05E7\u05E8" ? "in the morning" : rawPart === "\u05D1\u05E6\u05D4\u05E8\u05D9\u05D9\u05DD" ? "noon-window" : rawPart === "\u05D0\u05D7\u05E8 \u05D4\u05E6\u05D4\u05E8\u05D9\u05D9\u05DD" || rawPart === "\u05D0\u05D7\u05E8 \u05D4\u05E6\u05D4\u05E8\u05D9\u05DD" || rawPart === "\u05D0\u05D7\u05D4\u05E6" ? "in the afternoon" : rawPart === "\u05D1\u05E2\u05E8\u05D1" ? "in the evening" : rawPart === "\u05D1\u05DC\u05D9\u05DC\u05D4" ? "at night" : "";
          const extra = m[2] && m[2].indexOf("\u05D7\u05E6\u05D9") !== -1 ? 30 : m[2] && m[2].indexOf("\u05E8\u05D1\u05E2") !== -1 ? 15 : 0;
          let clock = spokenHour ? resolveClock(spokenHour[1], extra, marker) : null;
          if (!clock && spokenHour && !marker && spokenHour[1] >= 1 && spokenHour[1] <= 7) {
            clock = resolveClock(spokenHour[1], extra, "pm");
          }
          if (clock) return { raw: m[0], hour: clock.hour, minute: clock.minute };
        }
        m = text.match(/(?:^|[^\u0590-\u05FF\d])ב-\s*(\d{1,2}):(\d{2})(?!\d)/);
        if (m) {
          const clock = resolveClock(+m[1], +m[2], "");
          if (!clock) return null;
          return { raw: m[0], hour: clock.hour, minute: clock.minute };
        }
        if (/(?:פגישה|שיחה|ראיון|\b(?:meeting|call|sync)\b)/i.test(text)) {
          const re = /(?:^|[^\d])(\d{1,2}):(\d{2})(?!\d)/g;
          let tm;
          while (tm = re.exec(text)) {
            const clock = resolveClock(+tm[1], +tm[2], "");
            if (!clock) continue;
            return { raw: tm[1] + ":" + tm[2], hour: clock.hour, minute: clock.minute };
          }
        }
        return null;
      }
      function fmtTime(t) {
        if (!t) return null;
        return String(t.hour).padStart(2, "0") + ":" + String(t.minute).padStart(2, "0");
      }
      function decisiveSentence(text, patterns) {
        const sentences = text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter((s) => s.length > 12 && s.length < 320);
        for (const p of patterns) {
          const hit = sentences.find((s) => p.test(s));
          if (hit) return hit;
        }
        return null;
      }
      function senderIsAutomated(email, text) {
        const local = String(email || "").split("@")[0].toLowerCase();
        if (/^(no-?reply|do-?not-?reply|noreply|notifications?|alerts?|mailer|bounce|postmaster|automated|support-bot)/.test(local)) return true;
        if (/^(newsletter|news|marketing)(?![a-z0-9])/.test(local)) return true;
        if (/\bunsubscribe\b|\bview (this )?in browser\b|\bmanage (your )?preferences\b|\byou are receiving this\b|\byou(?:'|’)re receiving this\b|\byou received this email because\b|קיבלת מייל זה|להסרה מרשימת התפוצה|הנך רשום/i.test(text)) return true;
        return false;
      }
      function extract(text, ctx) {
        const money = parseMoney(text);
        const time = parseTime(text);
        return {
          money,
          moneyText: fmtMoney(money),
          date: parseDate(text, ctx && ctx.now),
          time,
          timeText: fmtTime(time),
          automated: senderIsAutomated(ctx && ctx.senderEmail, text),
          wordCount: (text.match(/\S+/g) || []).length
        };
      }
      return { extract, parseMoney, parseDate, parseTime, fmtMoney, fmtTime, decisiveSentence, senderIsAutomated };
    })();
    if (typeof module !== "undefined") module.exports = { FlowExtract: FlowExtract3 };
    else if (typeof globalThis !== "undefined") globalThis.FlowExtract = FlowExtract3;
  }
});

// flow-trial-extension/scripts/outlook-marker-judge-entry.mjs
var import_intent = __toESM(require_intent(), 1);
var import_actions = __toESM(require_actions(), 1);
var import_incoming_judge = __toESM(require_incoming_judge(), 1);
var import_request_types = __toESM(require_request_types(), 1);
var import_extract = __toESM(require_extract(), 1);
globalThis.FlowIntent = import_intent.FlowIntent;
globalThis.FlowActions = import_actions.FlowActions;
globalThis.FlowRequestTypes = import_request_types.FlowRequestTypes;
globalThis.FlowExtract = import_extract.FlowExtract;
function judgeOutlookInboxMessage(msg, me) {
  const body = msg && msg.body && msg.body.content || msg && msg.bodyPreview || "";
  const from = msg && msg.from && msg.from.emailAddress;
  return import_incoming_judge.FlowIncomingJudge.judge({
    text: body,
    subject: msg && msg.subject,
    senderEmail: from && from.address,
    senderName: from && from.name,
    ownAddresses: Array.isArray(me) ? me : [],
    attachmentCount: msg && msg.hasAttachments ? 1 : 0,
    surface: "outlook"
  });
}
export {
  judgeOutlookInboxMessage
};
