'use strict';
// Glance deterministic PROPOSE-GATE (2026-10-08). Sits on an LLM-originated card (engine silent) BEFORE llm-veto.proposalVeto.
// Silence-only: it can drop a proposal or turn a save proposal into the suggest-save decision; it never adds a card.
// Reasons (logged per case):
//   gate:unsupported-kind:<action>        the LLM action is not a step kind Glance has today
//   gate:unsupported-kind:create-doc      ask to create/make/open a new doc / sheet / deck / form / invoice / quote (no Glance tool)
//   gate:unsupported-kind:attach-to-invite ask to attach/add a file to an existing invite / meeting / event / task (file_place; no tool)
//   gate:money-offer-acceptance           agree/accept/approve an offer, quote, price or amount (EN+HE); an LLM never proposes this
//   gate:undated                          task / calendar / reply proposal with no future engine date and no deadline cue in the text
//   gate:save-<suggest reason>            a save proposal becomes the suggest-save decision (model/suggest-save/suggest-save.js);
//                                         anything but suggest:show is silence (e.g. gate:save-suggest:attachments-unread)
//   gate:save-target-mismatch             the LLM named the other host's storage (save_to_drive on Outlook / save_to_onedrive on Gmail)
// Supported kinds come from the engine's step table (model/teacher/engine.cjs STEP_NEUTRAL: gmailDraft/outlookDraft -> draft,
// googleTask(s)/outlookTask -> task, calendar/outlookCalendar -> calendar, driveFile/onedriveFile -> file_save) and the LLM schema
// (oss-models/eval/prompt.py action enum). attachmentSave (spec suggest-save §8) is the only save step.
const SS = require('../../model/suggest-save/suggest-save.js');

const SUPPORTED = { create_task: 'task', calendar_event: 'calendar', draft_reply: 'draft', save_to_drive: 'file_save', save_to_onedrive: 'file_save' };
const FAM2STEP = { task: 'task', calendar: 'calendar', reply: 'draft', file: 'file_save' };
const s = (x) => String(x == null ? '' : x).replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '');
// Hebrew-safe word end (JS \b is ASCII-only)
const E = String.raw`(?=$|[\s,.;:!?)"'\-])`;
const B = String.raw`(?:^|[\s,.;:!?("'\-])`;

// --- (a) unsupported kinds ---
// create a new document-like artefact, asked of the reader. First-person promises ("I'll prepare the invoice", "אכין את החשבונית")
// are commitments (task) and do not match: the verbs below are imperative / infinitive / 2nd person only.
const DOC_EN = String.raw`(?:new\s+|blank\s+|shared\s+)?(?:google\s+|word\s+|excel\s+)?(?:doc|docs|document|spreadsheet|sheet|tracker|deck|slide\s*deck|slides|presentation|form|invoice|quote|quotation|template)`;
const ASKV_EN = String.raw`\b(?:please\s+|pls\s+|can\s+you\s+|could\s+you\s+|would\s+you\s+|kindly\s+)(?:\w+\s+)?`;
// create a NEW artefact (any doc noun), or issue/prepare an invoice/quote (the v2 create_doc templates). "prepare the deck" (an existing
// work item someone asks for) is NOT matched: v2 labels those as reply asks.
const CREATE_DOC_EN = new RegExp(ASKV_EN + String.raw`(?:(?:create|make|open|start|set\s+up|build|spin\s+up)\s+(?:a|an|the|us\s+a|me\s+a)?\s*${DOC_EN}|(?:prepare|draw\s+up|issue|generate|produce)\s+(?:a|an)\s+(?:new\s+)?(?:invoice|quote|quotation)|(?:prepare|draft)\s+(?:a|an)\s+new\s+${DOC_EN})\b`, 'i');
const CREATE_DOC_HE = new RegExp(B + String.raw`(?:(?:לפתוח|תפתח|תפתחי|תפתחו|ליצור|תיצור|תיצרי|תיצרו|לבנות|תבנה|תבני|להקים|תקים)\s+(?:את\s+)?(?:ה)?(?:מסמך|גיליון|גליון|טבלה|טבלת|מצגת|טופס|תבנית|קובץ\s+(?:חדש|אקסל|וורד))|(?:להכין|תכין|תכיני|תכינו|להפיק|תפיק|תפיקי|תפיקו)\s+(?:את\s+)?(?:ה)?(?:חשבונית|הצעת\s+מחיר)\s+(?:ל|עבור\s+)\S+\s+על\s|(?:מסמך|גיליון|גליון|קובץ|מצגת|טופס)\s+חדש)`);
// attach / add a file to an existing invite / meeting / event / task
const ATTACH_INVITE_EN = /\b(?:attach|add|put|include|link)\s+(?:the\s+|a\s+|this\s+|my\s+|our\s+)?(?:[\w-]+\s+){0,3}?(?:to|on|in(?:to)?)\s+(?:the\s+|my\s+|our\s+|your\s+)?(?:[\w-]+\s+){0,2}?(?:invite|invitation|meeting|event|calendar\s+(?:invite|event|entry)|task)\b/i;
const ATTACH_INVITE_HE = new RegExp(B + String.raw`(?:לצרף|תצרף|תצרפי|תצרפו|צרף|צרפי|להוסיף|תוסיף|תוסיפי|לשים|תשים|תשימי)\s+(?:את\s+)?[^.?!\n]{0,30}?(?:ל|ב)(?:ה)?(?:זימון|הזמנה|פגישה|אירוע|משימה|יומן)`);

// --- (c) money / offer acceptance ---
const CUR = String.raw`(?:[$€£₪]\s?\d|\d[\d,.]*\s?(?:₪|ש"ח|ש״ח|שקל(?:ים)?|(?:usd|eur|ils|nis|gbp|dollars?|euros?|shekels?)\b))`;
// Only ASKS for the reader's acceptance count ("do you agree to the 3,900 ₪ offer", "please approve the $4,000 quote", "תאשרי את הצעת המחיר").
// A sender's own confirmation ("מאשרת את הסכום: ₪7,250", "Approved: $1,200") is a decision record (engine confirmed-amount task), not an ask.
const OFFER_OBJ = String.raw`(?:offer|counter-?offer|quote|quotation|proposal|bid|price|pricing|deal|terms|fee|rate|amount)`;
const OFFER_EN = new RegExp(String.raw`(?:\b(?:do|would|will|can|could)\s+you\s+(?:\w+\s+)?|\b(?:please|pls|kindly)\s+|\b(?:let\s+me\s+know|tell\s+me|confirm)\s+(?:if|whether)\s+you\s+|\bare\s+you\s+(?:ok|okay|fine|good)\s+with\s+|\bwaiting\s+for\s+your\s+)(?:agree(?:ment)?|accept(?:ance)?|approv(?:e|al)|sign\s+off|ok(?:ay)?|go\s+ahead|confirm(?:ation)?)\b[^.?!\n]{0,40}?(?:\b${OFFER_OBJ}\b|${CUR})`, 'i');
const OFFER_HE = new RegExp(String.raw`(?:(?:^|[\s,.;:!?("'\-])(?:אתה|את|אתם|אתן|האם)\s+(?:\S+\s+)?(?:מסכים|מסכימה|מסכימים|מאשר|מאשרת|מאשרים|מקבל|מקבלת|מקבלים)|` + B + String.raw`(?:תסכים|תסכימי|תסכימו|להסכים|תאשר|תאשרי|תאשרו|לאשר|אשר|אשרי|תקבל|תקבלי|תקבלו))` + E + String.raw`[^.?!\n]{0,30}?(?:הצע(?:ה|ת)|מחיר|תנאי|עסקה|עסקת|סכום|סך` + E + '|' + CUR + ')');

// --- (c) deadline cue (EN+HE). The DATE itself still always comes from the engine; this only says the ask is anchored in time.
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

function textOf(c, own) { return s(own != null ? own : c.body); }
function hasDeadline(t) { return DEADLINE_EN.test(t) || DEADLINE_HE.test(t); }
function unsupportedKind(t) {
  if (CREATE_DOC_EN.test(t) || CREATE_DOC_HE.test(t)) return 'gate:unsupported-kind:create-doc';
  if (ATTACH_INVITE_EN.test(t) || ATTACH_INVITE_HE.test(t)) return 'gate:unsupported-kind:attach-to-invite';
  return null;
}
function offerAcceptance(t) { return OFFER_EN.test(t) || OFFER_HE.test(t); }

/**
 * gate(c, own, pred, eng, att) -> { pass: bool, reason, step, card? , suggest? }
 * c: case ({ surface, direction, body, subject, engineReason }), pred: LLM { decision, family, action, title },
 * eng: { dateIso, today }, att: { read: bool, attachments: [...suggest-save shape], bodyCids, headers, consent } or null (unread)
 */
function gate(c, own, pred, eng, att) {
  const t = textOf(c, own);
  const action = String(pred.action || 'none');
  // (a) supported action kinds only
  let step = SUPPORTED[action] || null;
  if (!step) return { pass: false, reason: 'gate:unsupported-kind:' + action };
  const famStep = FAM2STEP[pred.family];
  if (famStep && famStep !== step) return { pass: false, reason: 'gate:unsupported-kind:family-action-mismatch' };
  const uk = unsupportedKind(t); if (uk) return { pass: false, reason: uk, step };
  // (c) money / offer acceptance
  if (offerAcceptance(t)) return { pass: false, reason: 'gate:money-offer-acceptance', step };
  if (step === 'file_save') {
    // (b) the save becomes the suggest-save decision on the message's real attachment data
    const surface = c.surface === 'outlook' ? 'outlook' : 'gmail';
    const d = SS.decide({ surface, direction: c.direction || 'inbound', consent: att ? att.consent !== false : true,
      attachmentsRead: !!(att && att.read), attachments: att ? att.attachments : undefined, bodyCids: att ? att.bodyCids : [], headers: att ? att.headers || {} : {},
      text: t, subject: c.subject || '', judgment: { reason: c.engineReason, explicit: null, marketing: false }, messageId: c.id, savedFileIds: [], dismissed: [] });
    if (!d.suggest) return { pass: false, reason: 'gate:save-' + d.reason, step, suggest: d };
    if ((surface === 'outlook' && action === 'save_to_drive') || (surface === 'gmail' && action === 'save_to_onedrive')) return { pass: false, reason: 'gate:save-target-mismatch', step, suggest: d };
    return { pass: true, reason: 'pass', step: 'file_save', card: { step: 'file_save', kind: 'attachmentSave', target: d.target, mode: d.mode, files: d.files, chip: d.chip }, suggest: d };
  }
  // (c) date or deadline for task / calendar / reply proposals
  const today = (eng && eng.today) || '2026-10-07', fut = !!(eng && eng.dateIso && eng.dateIso >= today);
  if (!fut && !hasDeadline(t)) return { pass: false, reason: 'gate:undated', step };
  return { pass: true, reason: 'pass', step };
}
module.exports = { gate, hasDeadline, unsupportedKind, offerAcceptance, SUPPORTED, RX: { CREATE_DOC_EN, CREATE_DOC_HE, ATTACH_INVITE_EN, ATTACH_INVITE_HE, OFFER_EN, OFFER_HE, DEADLINE_EN, DEADLINE_HE } };
