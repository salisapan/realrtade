// Lightweight classifiers for language, restricted names, and mid-flow asides.
// These are intentionally conservative. They never ask the user for a password,
// an ID number, or client data.
const { SECTORS } = require('./copy');

const FISCHER_RE = /\b(?:fischer|fbc)\b|fbc\s*&\s*co|פישר(?:\s+בכר)?/i;

const PRICE_RE =
  /(?:how\s+much|what(?:'s| is)\s+the\s+price|pricing|cost\b|quote\b|כמה\s+זה\s+עולה|מה\s+המחיר|מחיר|תמחור|עלות)/i;

const PERSON_RE =
  /(?:speak(?:\s+to|\s+with)\s+(?:a\s+)?(?:person|human|someone|agent)|talk\s+to\s+(?:a\s+)?(?:person|human|someone)|human\s+(?:please|agent)|representative|נציג|לדבר\s+עם\s+(?:מישהו|אדם|בן אדם|אדם)|אדם\s+אמיתי|בן\s+אדם|זאב|יעל)/i;

const SUPPORT_RE =
  /(?:existing\s+customer|i(?:'m| am)\s+a\s+customer|already\s+(?:a\s+)?(?:customer|client|user)|support\b|תמיכה|אני\s+לקוח|לקוח(?:ה)?\s+קיים|יש\s+לי\s+כבר|יעל)/i;

// Pasted secrets / identity / client records — not a "yes, our data is sensitive" answer.
const SENSITIVE_PASTE_RE =
  /(?:password|passwd|סיסמ(?:ה|א)|תעודת\s*זהות|\bת\.?\s*ז\.?\b|\bssn\b|credit\s*card|מספר\s+כרטיס)|(?:\b\d{9}\b)|(?:\b(?:\d[ -]?){13,16}\b)/i;

function hasHebrew(text) {
  return /[\u0590-\u05FF]/.test(text || '');
}

function hasLatinWord(text) {
  return /[A-Za-z]{3,}/.test(text || '');
}

// Hebrew wins if the message contains Hebrew letters. Otherwise a Latin
// sentence switches the bot to English. Button ids do not change language.
function detectLanguage(text, current) {
  const value = String(text || '').trim();
  if (!value) return current || 'he';
  if (hasHebrew(value)) return 'he';
  if (hasLatinWord(value)) return 'en';
  return current || 'he';
}

function mentionsFischer(text) {
  return FISCHER_RE.test(String(text || ''));
}

function isPriceQuestion(text) {
  return PRICE_RE.test(String(text || ''));
}

function isPersonRequest(text) {
  return PERSON_RE.test(String(text || ''));
}

function isSupportRoute(text, state) {
  const blob = [text, state && state.asked && state.asked.join(' '), state && state.process]
    .filter(Boolean)
    .join(' ');
  return SUPPORT_RE.test(blob);
}

function isSensitivePaste(text) {
  return SENSITIVE_PASTE_RE.test(String(text || ''));
}

function looksLikeEmail(text) {
  return /[^\s@]+@[^\s@]+\.[^\s@]+/.test(String(text || ''));
}

function extractEmail(text) {
  const m = String(text || '').match(/[^\s@]+@[^\s@]+\.[^\s@]+/);
  return m ? m[0] : '';
}

function extractName(text) {
  const cleaned = String(text || '')
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '')
    .replace(/[<>]/g, '')
    .trim();
  if (!cleaned) return '';
  if (cleaned.length > 80) return cleaned.slice(0, 80);
  return cleaned;
}

function matchSector(text, buttonId) {
  if (buttonId) {
    const byId = SECTORS.find((s) => s.id === buttonId);
    if (byId) return byId.id;
  }
  const value = String(text || '').trim().toLowerCase();
  if (!value) return null;
  const map = [
    ['sector_legal', ['עורכי דין', 'עורך דין', 'עריכת דין', 'משפטים', 'lawyer', 'lawyers', 'legal', 'law firm', 'attorney']],
    ['sector_insurance', ['ביטוח', 'insurance']],
    ['sector_accounting', ['ראיית חשבון', 'רואה חשבון', 'הנהלת חשבונות', 'accounting', 'accountant', 'bookkeeping']],
    ['sector_other', ['אחר', 'other', 'something else']],
  ];
  for (const [id, aliases] of map) {
    if (aliases.some((a) => value === a.toLowerCase() || value.includes(a.toLowerCase()))) return id;
  }
  return null;
}

function isYes(text, buttonId) {
  if (buttonId === 'demo_yes') return true;
  const v = String(text || '').trim().toLowerCase();
  return /^(yes|yeah|yep|sure|ok|okay|please|כן|בטח|סבבה|רוצה|יאללה)$/i.test(v);
}

function isNo(text, buttonId) {
  if (buttonId === 'demo_no') return true;
  const v = String(text || '').trim().toLowerCase();
  return /^(no|nope|not now|later|לא|לא תודה|לא עכשיו)$/i.test(v);
}

module.exports = {
  detectLanguage,
  mentionsFischer,
  isPriceQuestion,
  isPersonRequest,
  isSupportRoute,
  isSensitivePaste,
  looksLikeEmail,
  extractEmail,
  extractName,
  matchSector,
  isYes,
  isNo,
};
