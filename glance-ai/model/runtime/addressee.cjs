'use strict';
// Who is the message addressed to? Pure function, used by the v2 featurizer, the label overrides and the veto, so all three
// agree. ownNames = the account's own names (profile display name, first name, Hebrew spelling) — known at runtime.
// -> 'own' (Hi Sali, / סאלי, ) | 'other' (Hi Dana, / דנה, ) | 'group' (Hi team, / היי כולם,) | 'none'
const GREET_EN = /^(?:hi|hey|hello|dear|good\s+(?:morning|afternoon|evening)|morning|hiya|yo)\b[\s,!]*/i;
const GREET_HE = /^(?:היי|הי|שלום\s+רב|שלום|בוקר\s+טוב|ערב\s+טוב|צהריים\s+טובים|אהלן|הלו|יקר(?:ה|י)?)(?=[\s,!]|$)[\s,!]*/;
const GROUP = /^(?:team|all|everyone|guys|folks|there|both|colleagues|כולם|צוות|חברים|חברות|לכולם|שניכם)$/i;
const NOT_NAME = new Set(['thanks', 'thank', 'please', 'also', 'so', 'fyi', 'update', 'reminder', 'great', 'ok', 'okay', 'sure', 'yes', 'no', 'unfortunately', 'quick', 'urgent', 'again', 'sorry', 'well', 'btw', 'note', 'important', 'perfect', 'awesome', 'cool', 're', 'fwd', 'hope', 'today', 'tomorrow', 'tonight', 'now', 'next', 'first', 'meanwhile', 'regarding', 'anyway', 'otherwise', 'however', 'unless', 'if', 'when', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'sunday', 'saturday', 'finance', 'legal', 'hr', 'invoice', 'contract', 'attached',
  'תודה', 'בבקשה', 'אגב', 'מעולה', 'סבבה', 'אוקיי', 'טוב', 'כן', 'לא', 'רגע', 'אז', 'בנוסף', 'ובכן', 'עדכון', 'חשוב', 'דחוף', 'נהדר', 'יופי', 'מצוין', 'אחלה', 'תזכורת', 'לידיעתך', 'מקווה', 'שוב', 'סליחה', 'רק', 'בהמשך', 'כאמור', 'מצורף', 'מצורפת', 'נדרשת', 'שימו', 'הערה', 'מחר', 'היום', 'עכשיו', 'בינתיים', 'לגבי', 'בקיצור', 'בכל', 'אם', 'כש', 'למרות', 'מבחינתי', 'מבחינתנו', 'כרגע', 'עדיין', 'בעיקרון', 'ראשית', 'שנית', 'לסיכום', 'החשבונית', 'החוזה', 'הקובץ', 'הפגישה', 'בהצלחה', 'ברשותך', 'אוקי', 'יאללה', 'נו', 'אהלן', 'שבוע', 'חג', 'בהתאם', 'כמובן', 'בסדר', 'ראיתי', 'קיבלתי', 'מצטער', 'מצטערת']);
function clean(t) { return String(t || '').replace(/\r\n?/g, '\n').replace(/[\u00a0\u2007\u202f]/g, ' ').replace(/[\u200e\u200f\u202a-\u202e]/g, ''); }
function firstLines(text) { return clean(text).split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 2); }
function nameMatches(name, ownNames) {
  const n = name.toLowerCase();
  return (ownNames || []).some((o) => { const t = String(o).toLowerCase().trim(); return t && (t === n || t.split(/\s+/)[0] === n); });
}
function addresseeOf(text, ownNames) {
  for (const raw of firstLines(text)) {
    let line = raw;
    const g = line.match(GREET_EN) || line.match(GREET_HE);
    const greeted = Boolean(g && g[0].length);
    if (greeted) line = line.slice(g[0].length);
    if (greeted && !line.trim()) continue;
    const m = line.match(/^([A-Za-z][a-z]+|[\u05D0-\u05EA][\u05D0-\u05EA'׳]{1,})(?:\s+(?:and|ו)\s*([A-Z][a-z]+|[\u05D0-\u05EA]{2,}))?\s*(?:[,:–—-]|$)/);
    if (m) {
      const name = m[1];
      if (GROUP.test(name)) return 'group';
      if (NOT_NAME.has(name.toLowerCase())) { if (greeted) return 'none'; continue; }
      if (nameMatches(name, ownNames) || (m[2] && nameMatches(m[2], ownNames))) return 'own';
      // a bare "Word," is only a vocative when a greeting precedes it or the word ends with a comma (not a sentence start)
      if (greeted || /^[^\s,]+\s*[,:–—-]/.test(line)) return 'other';
    }
    if (greeted) return 'none';
    return 'none';
  }
  return 'none';
}
// The user's position on the recipient line: 'to' | 'cc-only' | 'none'
function recipientRole(c, ownEmail) {
  const own = String(ownEmail || '').toLowerCase();
  const to = (c.to || []).map((x) => String(x).toLowerCase()), cc = (c.cc || []).map((x) => String(x).toLowerCase());
  if (to.includes(own)) return 'to';
  if (cc.includes(own)) return 'cc-only';
  return 'none';
}
module.exports = { addresseeOf, recipientRole, clean };
if (require.main === module) {
  const own = ['Sali', 'Sali Sapan', 'סאלי'];
  for (const t of ['Hi Sali,\nPlease send the invoice.', 'Hi Dana,\n\nPlease send the invoice.', 'Dana, please send the contract.', 'Please send the invoice.', 'Hi team,\nplease review.', 'Thanks, got it', 'היי סאלי,\nתשלח את החשבונית', 'דנה, בבקשה שלחי את החוזה', 'היי דנה,\nאפשר לשלוח?', 'שלום,\nאפשר לשלוח את החוזה?', 'תודה, קיבלתי', 'Good morning Tom,\r\nCan you sign?', 'בוקר טוב לכולם,', 'סאלי, תוכל לאשר?', 'Hi,\nDana, can you sign the NDA?', 'Hello Sali and Dana,\nplease sign.', 'אגב, תוכל לשלוח?'])
    console.log(addresseeOf(t, own).padEnd(6), JSON.stringify(t));
}
