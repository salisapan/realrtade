// Request and promise recognition — portable, no chrome.*, no DOM, no network,
// and no model. This is the "our own code recognises first" rule in
// docs/local-first-principle.md made concrete.
//
// Instead of one regex per phrasing, a sentence is read as three independent
// parts that combine:
//
//     FRAME   how it is asked      "could you", "please", "I need", "waiting for"
//     ACTION  what is wanted       sign, approve, send, schedule, pay, reply ...
//     OBJECT  of what              a contract, a quote, a report, a time ...
//
// Every ACTION x OBJECT pair (in English and Hebrew) is a distinct recognised
// request type, so adding one word to a lexicon adds a whole row of cases
// without touching logic. `lexiconSize()` reports how many combinations that
// is. Recognition is deliberately conservative: a request needs a FRAME and an
// ACTION in the same sentence; a lone noun ("the contract") is never a request.
//
// The same lexicon reads the other direction too: a first-person promise
// ("I'll send the numbers by Friday", "אחזור אליך מחר") is the mirror loop —
// something YOU owe — and is recognised by `detectCommitmentSentence`.
const FlowRequestTypes = (() => {
  // Ordered: the first action that matches wins, so specific ones go first and
  // the generic "reply" goes last. `days` is the business days to wait before
  // chasing when no deadline was stated.
  const ACTIONS = [
    { id: 'pay', days: 7, noun: 'payment',
      en: ['pay', 'wire', 'transfer', 'settle', 'remit', 'reimburse'],
      he: ['לשלם', 'תשלם', 'תשלמו', 'להחזיר כסף', 'החזר כספי'] },
    { id: 'sign', days: 2, noun: 'signature',
      en: ['sign', 'countersign', 'initial', 'signature', 'signed copy'],
      he: ['לחתום', 'תחתום', 'תחתמו', 'חתימה', 'חתימתך'] },
    { id: 'approve', days: 2, noun: 'approval',
      en: ['approve', 'authori[sz]e', 'sign off', 'green-?light', 'approval', 'go-ahead', 'accept'],
      he: ['לאשר', 'תאשר', 'תאשרו', 'אישור', 'אישורך'] },
    { id: 'confirm', days: 2, noun: 'confirmation',
      en: ['confirm', 'confirmation', 'verify', 'validate', 'double-?check'],
      he: ['לוודא', 'תוודא', 'לאמת', 'תאמת', 'וידוא'] },
    { id: 'schedule', days: 1, noun: 'a time',
      en: ['schedule', 'book', 'set up', 'arrange', 'propose a time', 'pick a time', 'reschedule', 'your availability', 'are you available', 'when (?:are|can) you'],
      he: ['לקבוע', 'תקבע', 'תקבעו', 'לתאם', 'תתאם', 'תתאמו', 'פנוי', 'פנויה', 'לדחות', 'זמינות'] },
    { id: 'decide', days: 2, noun: 'a decision',
      en: ['decide', 'decision', 'choose', 'pick', 'select', 'advise', 'let me know whether'],
      he: ['להחליט', 'תחליט', 'תחליטו', 'החלטה', 'לבחור', 'תבחר', 'תבחרו'] },
    { id: 'review', days: 2, noun: 'a review',
      en: ['review', 'check', 'look at', 'look over', 'take a look', 'proofread', 'read', 'comment on', 'feedback', 'thoughts', 'input'],
      he: ['לבדוק', 'תבדוק', 'תבדקו', 'לעבור על', 'תעבור על', 'להסתכל', 'תסתכל', 'משוב', 'הערות', 'חוות דעת'] },
    { id: 'join', days: 2, noun: 'attendance',
      en: ['join', 'attend', 'rsvp', 'register', 'sign up', 'come to'],
      he: ['להצטרף', 'תצטרף', 'להגיע', 'תגיע', 'תגיעו', 'להירשם', 'תירשם', 'אישור הגעה'] },
    { id: 'complete', days: 3, noun: 'a deliverable',
      en: ['complete', 'fill out', 'fill in', 'finish', 'finali[sz]e', 'prepare', 'draft', 'write', 'create', 'build', 'fix', 'update the', 'deliver'],
      he: ['להשלים', 'תשלים', 'תשלימו', 'למלא', 'תמלא', 'תמלאו', 'לסיים', 'תסיים', 'להכין', 'תכין', 'תכינו', 'לכתוב', 'תכתוב', 'לתקן', 'תתקן'] },
    { id: 'send', days: 2, noun: 'a file',
      en: ['send', 'share', 'forward', 'provide', 'attach', 'upload', 'return', 'submit', 'resend', 'e-?mail me', 'give me', 'get me'],
      he: ['לשלוח', 'תשלח', 'תשלחו', 'שלח', 'להעביר', 'תעביר', 'תעבירו', 'להעלות', 'תעלה', 'להגיש', 'תגיש', 'להחזיר', 'תחזיר', 'לספק', 'תספק', 'תן לי', 'תני לי'] },
    { id: 'reply', days: 2, noun: 'a reply',
      en: ['reply', 'respond', 'get back', 'revert', 'answer', 'response', 'update me', 'an update', 'let me know', 'follow up', 'be in touch', 'hear (?:back )?from you', 'hear your'],
      he: ['להשיב', 'תשיב', 'תשיבו', 'לענות', 'תענה', 'תענו', 'תחזור', 'תחזרו', 'תחזרי', 'לחזור אליי', 'לעדכן', 'תעדכן', 'תעדכנו', 'תודיע', 'תודיעו', 'תשובה', 'עדכון'] }
  ];

  // What the action is about. Order: specific first.
  const OBJECTS = [
    { id: 'contract', en: ['contract', 'agreement', 'lease', 'nda', 'terms', 'addendum', 'amendment', 'engagement letter', 'sow', 'msa'], he: ['חוזה', 'הסכם', 'שכירות', 'תנאים', 'נספח', 'כתב התחייבות'] },
    { id: 'invoice', en: ['invoice', 'bill', 'receipt', 'statement', 'purchase order', 'po'], he: ['חשבונית', 'קבלה', 'דרישת תשלום', 'הזמנת רכש', 'חיוב'] },
    { id: 'quote', en: ['quote', 'quotation', 'estimate', 'pricing', 'price list', 'bid', 'proposal', 'offer', 'rates?'], he: ['הצעת מחיר', 'הצעה', 'תמחור', 'מחיר', 'מחירון', 'אומדן'] },
    { id: 'report', en: ['report', 'analysis', 'numbers', 'figures', 'data', 'spreadsheet', 'metrics', 'results', 'summary', 'forecast', 'budget'], he: ['דוח', 'דו"ח', 'ניתוח', 'מספרים', 'נתונים', 'גיליון', 'תקציב', 'תחזית', 'סיכום', 'תוצאות'] },
    { id: 'deck', en: ['deck', 'presentation', 'slides', 'pitch', 'one-?pager', 'brochure'], he: ['מצגת', 'שקפים', 'ברושור'] },
    { id: 'meeting', en: ['meeting', 'call', 'demo', 'appointment', 'time', 'slot', 'date', 'availability', 'session', 'interview', 'sync'], he: ['פגישה', 'שיחה', 'דמו', 'מועד', 'זמן', 'תאריך', 'ראיון'] },
    { id: 'decision', en: ['decision', 'go-?ahead', 'direction', 'option', 'plan', 'next steps?', 'approach'], he: ['החלטה', 'כיוון', 'אפשרות', 'תוכנית', 'צעדים הבאים'] },
    { id: 'design', en: ['design', 'mock-?ups?', 'logo', 'artwork', 'copy', 'photos?', 'images?', 'video', 'wireframes?', 'creative'], he: ['עיצוב', 'מוקאפ', 'לוגו', 'קופי', 'תמונות', 'תמונה', 'סרטון'] },
    { id: 'details', en: ['details', 'info(?:rmation)?', 'address', 'phone number', 'passport', 'tax id', 'vat number', 'bank details', 'account details'], he: ['פרטים', 'מידע', 'כתובת', 'טלפון', 'תעודת זהות', 'דרכון', 'פרטי בנק', 'פרטי חשבון'] },
    { id: 'access', en: ['access', 'invite', 'permissions?', 'login', 'account', 'license'], he: ['גישה', 'הזמנה', 'הרשאה', 'הרשאות', 'חשבון', 'רישיון'] },
    { id: 'feedback', en: ['feedback', 'comments', 'opinion', 'edits', 'redlines', 'markup'], he: ['משוב', 'הערות', 'דעה', 'עריכות', 'תיקונים'] },
    { id: 'document', en: ['file', 'files', 'document', 'documents', 'attachment', 'pdf', 'form', 'forms', 'paperwork', 'docs', 'certificate', 'letter', 'application'], he: ['קובץ', 'קבצים', 'מסמך', 'מסמכים', 'טופס', 'טפסים', 'תעודה', 'מכתב', 'בקשה'] },
    { id: 'deliverable', en: ['deliverables?', 'work', 'version', 'release', 'patch', 'milestone'], he: ['תוצר', 'עבודה', 'גרסה', 'שחרור', 'אבן דרך'] },
    { id: 'money', en: ['deposit', 'fee', 'balance', 'amount', 'retainer', 'installment', 'refund', 'payment'], he: ['מקדמה', 'עמלה', 'יתרה', 'סכום', 'ריטיינר', 'תשלום', 'החזר'] }
  ];

  // How a request is framed. A sentence with an ACTION but no FRAME is a
  // statement, not an ask.
  const FRAME_EN = /\b(?:could|can|would|will) you\b|\b(?:can|could|shall) we\b|\bplease\b|\bkindly\b|\b(?:i|we)(?:'d| would) (?:like|appreciate|love)\b|\b(?:i|we) (?:need|require|want|expect)\b|\bneed you to\b|\b(?:waiting|awaiting) (?:for|on)\b|\bany chance\b|\bwhen (?:can|could|will) you\b|\bdo you have\b|\bby when\b|\bwould you mind\b|\bit would help (?:if|to)\b|\bstill need\b|\bhave you (?:had a chance|been able)\b/i;
  const FRAME_HE = /(?:תוכל|תוכלי|תוכלו|אפשר|ניתן|נא |בבקשה|אשמח|צריך ש|צריכים|אני צריך|אנחנו צריכים|ממתין|ממתינה|ממתינים|מחכה|מחכים|מתי תוכל|יש לך|היית יכול|האם תוכל|עדיין צריך)/;

  // English entries are regex fragments joined into one word-bounded pattern.
  // Hebrew has no \b, so each Hebrew entry is its own pattern.
  ACTIONS.concat(OBJECTS).forEach((e) => {
    e.enRe = new RegExp('\\b(?:' + e.en.join('|') + ')\\b', 'i');
    // A Hebrew entry is a whole word, optionally with attached prefix letters (ה, ו, ש, ל, ב, מ, כ):
    // "חתום" must not match inside "החתום" ("the signed"), nor "שלח" inside "שלחתי".
    e.heRe = e.he.map((w) => new RegExp('(?<![א-ת])[ולשבהמכ]{0,2}' + w + '(?![א-ת])'));
  });

  function hasHebrew(t) { return /[֐-׿]/.test(t); }

  function find(list, sentence) {
    const he = hasHebrew(sentence);
    for (const e of list) {
      if (e.enRe.test(sentence) || (he && e.heRe.some((r) => r.test(sentence)))) return e;
    }
    return null;
  }
  const findAction = (s) => find(ACTIONS, String(s || ''));
  const findObject = (s) => find(OBJECTS, String(s || ''));

  function framed(sentence) {
    const s = String(sentence || '');
    return FRAME_EN.test(s) || (hasHebrew(s) && FRAME_HE.test(s));
  }

  // One sentence -> { type, action, object, label, days } or null.
  function detectRequest(sentence) {
    const s = String(sentence || '');
    if (!framed(s)) return null;
    const action = findAction(s);
    if (!action) return null;
    const object = findObject(s);
    return {
      type: action.id + (object ? ':' + object.id : ''),
      action: action.id,
      object: object ? object.id : null,
      label: action.noun + (object ? ' · ' + object.id : ''),
      // A quote or a deliverable usually takes a day longer to produce.
      days: action.days + (object && (object.id === 'quote' || object.id === 'deliverable') && action.id !== 'pay' ? 1 : 0)
    };
  }

  // ---- the mirror: what YOU promised -------------------------------------------
  const COMMIT_EN = /\b(?:i|we)(?:'ll| will| shall)\b|\b(?:i|we)(?:'m|'re| am| are) (?:going to|gonna)\b|\blet me (?:check|look|review|get|send|find|confirm|come back|revert|run|see|loop|work|pull|put|dig)\b/i;
  const COMMIT_HE = /(?:אשלח|נשלח|אחזור|נחזור|אעדכן|נעדכן|אבדוק|נבדוק|אכין|נכין|אעביר|נעביר|אתאם|נתאם|אחזיר|נחזיר|אשיב|נשיב|אאשר|נאשר|אספק|נספק|אכתוב|נכתוב|אסגור|נסגור|אסיים|נסיים|אתקן|נתקן)/;
  // Not a promise: conditional, hedged, or an invitation for THEM to act.
  const COMMIT_NOT = /\b(?:maybe|might|perhaps|probably|hopefully|try to|if you|unless|in case|when you|once you|let me know)\b|(?:אולי|בערך|אם תרצו|אם תרצה|ברגע שתשלח|תודיע לי)/i;
  const COMMIT_NOT_ACTION = /\b(?:thank|thanks|happy|glad|be there|see you|call you|talk to you|speak)\b/i;

  // One sentence -> { type, action, object } or null.
  function detectCommitmentSentence(sentence) {
    const s = String(sentence || '');
    if (COMMIT_NOT.test(s)) return null;
    if (hasHebrew(s)) {
      if (!COMMIT_HE.test(s)) return null;
      const action = findAction(s);
      const object = findObject(s);
      const a = action ? action.id : 'reply';
      return { type: 'owe:' + a + (object ? ':' + object.id : ''), action: a, object: object ? object.id : null };
    }
    if (!COMMIT_EN.test(s) || COMMIT_NOT_ACTION.test(s)) return null;
    const action = findAction(s);
    if (!action) return null;
    const object = findObject(s);
    return { type: 'owe:' + action.id + (object ? ':' + object.id : ''), action: action.id, object: object ? object.id : null };
  }

  // Everything the lexicons see in a sentence, not just the first match. The
  // statistical model (core/intent-model.js) takes these as features, so the
  // hand-written vocabulary becomes evidence the model weighs rather than a gate.
  function lexHits(sentence) {
    const s = String(sentence || '');
    const he = hasHebrew(s);
    const hit = (list) => list.filter((e) => e.enRe.test(s) || (he && e.heRe.some((r) => r.test(s)))).map((e) => e.id);
    return {
      actions: hit(ACTIONS),
      objects: hit(OBJECTS),
      framed: framed(s),
      committed: hasHebrew(s) ? COMMIT_HE.test(s) : COMMIT_EN.test(s),
      hedged: COMMIT_NOT.test(s)
    };
  }

  // How many distinct request types the lexicon can express: every action,
  // alone or with every object, in two languages, asked or promised.
  function lexiconSize() {
    return ACTIONS.length * (OBJECTS.length + 1) * 2 * 2;
  }

  return { detectRequest, detectCommitmentSentence, findAction, findObject, framed, lexHits, lexiconSize, ACTIONS, OBJECTS };
})();

if (typeof module !== 'undefined') module.exports = { FlowRequestTypes };
