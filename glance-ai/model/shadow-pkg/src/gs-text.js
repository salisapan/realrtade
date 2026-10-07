/* Glance shadow tier, text utilities (v2.2 drop-in package). Plain JS, no deps, no eval, no network.
 * Byte-for-byte ports of the offline pipeline so features match the Python-trained weights:
 *   runtime/normalize-v21.cjs (normalizeText), runtime/normalize.cjs (cleanText, stripBoilerplate),
 *   train/featurize.cjs (fnv1a, norm), runtime/addressee.cjs (addresseeOf, recipientRole), runtime/product-rules.cjs (RX, negatedOnly).
 * Loads as a classic script (content script / importScripts), as a side-effect ES-module import (MV3 module SW), or via require (Node tests).
 * Registers self.GlanceShadow.text. */
(function (root) {
  'use strict';
  var NS = root.GlanceShadow || (root.GlanceShadow = {});

  // ---- normalize-v21: four format-only operations, never removes words
  function normalizeText(t) {
    return String(t == null ? '' : t).replace(/\r\n?/g, '\n').replace(/[\u00a0\u2007\u202f\u2009]/g, ' ').replace(/[\u200b-\u200d\u2060\ufeff]/g, '').replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '');
  }
  function normalizeInput(c) { return Object.assign({}, c, { body: normalizeText(c.body), subject: normalizeText(c.subject), rawBody: c.body }); }

  // ---- normalize.cjs (v2 model path): cleanText + boilerplate strip (signature / disclaimer / [image] / mobile footer)
  var DISCLAIMER = /^(?:confidentiality notice|this (?:e-?mail|message) (?:and any attachments )?(?:is|are|may contain) (?:confidential|privileged)|the information (?:contained )?in this (?:e-?mail|message)|הודעה זו (?:והמצורפים לה )?(?:מיועדת|מיועדים|עשויה)|המידע (?:הכלול )?בהודעה זו|מסמך זה (?:מכיל|עשוי))/i;
  var MOBILE = /^(?:sent from my (?:iphone|ipad|android|samsung|mobile)|get outlook for (?:ios|android)|נשלח מה-?(?:iphone|אייפון|אנדרואיד|נייד)(?: שלי)?|נשלח מהנייד)\s*$/i;
  function cleanText(t) {
    return String(t || '').replace(/\r\n?/g, '\n').replace(/[\u00a0\u2007\u202f\u2009]/g, ' ').replace(/[\u200b-\u200d\u2060\ufeff]/g, '').replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
      .split('\n').map(function (l) { return l.replace(/[ \t]+/g, ' ').trim(); }).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  function stripBoilerplate(t) {
    var lines = cleanText(t).split('\n'); var out = [];
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i];
      if (l === '--' || l === '-- ' || l === '__' || /^_{5,}$/.test(l)) break;
      if (DISCLAIMER.test(l)) break;
      if (/^-{2,}\s*(?:original message|forwarded message)|^on .{0,120} wrote:$|^from: .+$/i.test(l)) { out.push(l); continue; }
      if (/^\[(?:image|cid|logo)[^\]]*\]$/i.test(l) || MOBILE.test(l)) continue;
      out.push(l);
    }
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  function normalizeCase(c) { return Object.assign({}, c, { body: stripBoilerplate(c.body), rawBody: c.body }); }

  // ---- featurize.cjs primitives
  function fnv1a(s) { var h = 0x811c9dc5; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; }
  function norm(t) {
    return String(t || '').normalize('NFKC').toLowerCase()
      .replace(/[\u0591-\u05C7]/g, '')
      .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, ' _email_ ')
      .replace(/https?:\/\/\S+/g, ' _url_ ')
      .replace(/[₪$€£]\s?\d[\d,.]*/g, ' _money_ ')
      .replace(/\d{1,2}:\d{2}|\b\d{1,2}\s?(?:am|pm)\b/g, ' _clock_ ')
      .replace(/\d+/g, '0')
      .replace(/[’`]/g, "'");
  }

  // ---- addressee.cjs
  var GREET_EN = /^(?:hi|hey|hello|dear|good\s+(?:morning|afternoon|evening)|morning|hiya|yo)\b[\s,!]*/i;
  var GREET_HE = /^(?:היי|הי|שלום\s+רב|שלום|בוקר\s+טוב|ערב\s+טוב|צהריים\s+טובים|אהלן|הלו|יקר(?:ה|י)?)(?=[\s,!]|$)[\s,!]*/;
  var GROUP = /^(?:team|all|everyone|guys|folks|there|both|colleagues|כולם|צוות|חברים|חברות|לכולם|שניכם)$/i;
  var NOT_NAME = new Set(['thanks', 'thank', 'please', 'also', 'so', 'fyi', 'update', 'reminder', 'great', 'ok', 'okay', 'sure', 'yes', 'no', 'unfortunately', 'quick', 'urgent', 'again', 'sorry', 'well', 'btw', 'note', 'important', 'perfect', 'awesome', 'cool', 're', 'fwd', 'hope', 'today', 'tomorrow', 'tonight', 'now', 'next', 'first', 'meanwhile', 'regarding', 'anyway', 'otherwise', 'however', 'unless', 'if', 'when', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'sunday', 'saturday', 'finance', 'legal', 'hr', 'invoice', 'contract', 'attached',
    'תודה', 'בבקשה', 'אגב', 'מעולה', 'סבבה', 'אוקיי', 'טוב', 'כן', 'לא', 'רגע', 'אז', 'בנוסף', 'ובכן', 'עדכון', 'חשוב', 'דחוף', 'נהדר', 'יופי', 'מצוין', 'אחלה', 'תזכורת', 'לידיעתך', 'מקווה', 'שוב', 'סליחה', 'רק', 'בהמשך', 'כאמור', 'מצורף', 'מצורפת', 'נדרשת', 'שימו', 'הערה', 'מחר', 'היום', 'עכשיו', 'בינתיים', 'לגבי', 'בקיצור', 'בכל', 'אם', 'כש', 'למרות', 'מבחינתי', 'מבחינתנו', 'כרגע', 'עדיין', 'בעיקרון', 'ראשית', 'שנית', 'לסיכום', 'החשבונית', 'החוזה', 'הקובץ', 'הפגישה', 'בהצלחה', 'ברשותך', 'אוקי', 'יאללה', 'נו', 'אהלן', 'שבוע', 'חג', 'בהתאם', 'כמובן', 'בסדר', 'ראיתי', 'קיבלתי', 'מצטער', 'מצטערת']);
  function aclean(t) { return String(t || '').replace(/\r\n?/g, '\n').replace(/[\u00a0\u2007\u202f]/g, ' ').replace(/[\u200e\u200f\u202a-\u202e]/g, ''); }
  function firstLines(text) { return aclean(text).split('\n').map(function (l) { return l.trim(); }).filter(Boolean).slice(0, 2); }
  function nameMatches(name, ownNames) {
    var n = name.toLowerCase();
    return (ownNames || []).some(function (o) { var t = String(o).toLowerCase().trim(); return t && (t === n || t.split(/\s+/)[0] === n); });
  }
  function addresseeOf(text, ownNames) {
    var ls = firstLines(text);
    for (var i = 0; i < ls.length; i++) {
      var line = ls[i];
      var g = line.match(GREET_EN) || line.match(GREET_HE);
      var greeted = Boolean(g && g[0].length);
      if (greeted) line = line.slice(g[0].length);
      if (greeted && !line.trim()) continue;
      var m = line.match(/^([A-Za-z][a-z]+|[\u05D0-\u05EA][\u05D0-\u05EA'׳]{1,})(?:\s+(?:and|ו)\s*([A-Z][a-z]+|[\u05D0-\u05EA]{2,}))?\s*(?:[,:–—-]|$)/);
      if (m) {
        var name = m[1];
        if (GROUP.test(name)) return 'group';
        if (NOT_NAME.has(name.toLowerCase())) { if (greeted) return 'none'; continue; }
        if (nameMatches(name, ownNames) || (m[2] && nameMatches(m[2], ownNames))) return 'own';
        if (greeted || /^[^\s,]+\s*[,:–—-]/.test(line)) return 'other';
      }
      return 'none';
    }
    return 'none';
  }
  function recipientRole(c, ownEmail) {
    var own = String(ownEmail || '').toLowerCase();
    var to = (c.to || []).map(function (x) { return String(x).toLowerCase(); }), cc = (c.cc || []).map(function (x) { return String(x).toLowerCase(); });
    if (to.indexOf(own) >= 0) return 'to';
    if (cc.indexOf(own) >= 0) return 'cc-only';
    return 'none';
  }

  // ---- product-rules.cjs (regexes + negatedOnly), used by the silence-only veto
  var RX = {
    ONEDRIVE: /one\s?-?drive|וואן\s?-?דרייב/i,
    SAVE_VERB: /\b(?:save|upload|store|file|put)\b|(?:^|[\s,.(])(?:ו?(?:ל|ת|נ)?(?:שמור|שמרי|שמרו|תשמור|תשמרי|תשמרו|לשמור|תעלה|תעלי|תעלו|להעלות|העלה|העלי|תאחסן|לאחסן))(?=$|[\s,.?!])/i,
    NEG_SAVE: /\b(?:do\s+not|don['’]?t|no\s+need\s+to|never|you\s+don['’]?t\s+need\s+to|hold\s+off\s+on)\s+(?:\w+\s+){0,2}(?:sav(?:e|ing)|upload(?:ing)?|stor(?:e|ing)|fil(?:e|ing))\b|(?:^|[\s,.(])(?:אל|לא\s+צריך|אין\s+צורך|בבקשה\s+לא|בבקשה\s+אל|לא)\s+(?:ל|ת)?(?:שמור|תשמור|תשמרי|תשמרו|לשמור|תעלה|תעלי|תעלו|להעלות|לאחסן)/i,
    NEG_CUE: /^(?:please\s+)?(?:do\s+not|don['’]?t|no\s+need|never\s+mind|you\s+don['’]?t\s+need|hold\s+off|there['’]?s\s+no\s+need)\b|^(?:בבקשה\s+)?(?:אל\s+ת|אין\s+צורך|לא\s+צריך|לא\s+לשמור|לא\s+לשלוח|בבקשה\s+לא|עזוב|עזבי|תתעלם|תתעלמי)/i,
    ASK_CUE: /\?|\b(?:please|pls|could\s+you|can\s+you|would\s+you|kindly|let\s+me\s+know|lmk|send|pay|sign|confirm|review|approve|schedule|need)\b|(?:^|\s)(?:תוכל|תוכלי|תוכלו|אפשר|בבקשה|נא|אנא|אשמח|נשמח|תשלח|תשלחי|שלח|שלחי|תעביר|תעבירי|תעבירו|תאשר|תאשרי|תחתום|תחתמי|תשלם|תשלמי|צריך|צריכה|מחכה|מחכים|נדרשת)(?=$|[\s,.?!])/i,
    NO_ACTION_HE: /לא\s+נדרש(?:ת|ים|ות)?\s+(?:(?:ממך|מצדך|מכם|מצדכם|ממכם)\s+)?(?:כל\s+)?(?:פעולה|דבר|כלום)|לא\s+נדרש(?:ת)?\s+(?:ממך|מצדך|מכם)(?=$|[\s,.!])|אין\s+צורך\s+(?:ב|לעשות\s+)?(?:פעולה|דבר|כלום)|לידיעה\s+בלבד|לתיעוד\s+בלבד/,
    NO_ACTION_EN: /\b(?:no\s+action\s+(?:is\s+)?(?:needed|required)|nothing\s+(?:is\s+)?(?:needed|required)\s+from\s+you|no\s+(?:reply|response)\s+(?:is\s+)?(?:needed|required|necessary)|fyi\s+only|for\s+your\s+records\s+only)\b/i,
    POS_ACTION_HE: /(?<!לא\s)(?:נדרשת\s+פעולה|פעולה\s+נדרשת)\s*(?:מצדך\s*)?[:–-]/,
    MARKETING: /\b(?:unsubscribe|register\s+now|webinar|flash\s+sale|\d+%\s+off|shop\s+now|manage\s+(?:your\s+)?(?:email\s+)?preferences|exclusive\s+offer|newsletter)\b|וובינר|הירשמו|ההרשמה\s+פתוחה|להסרה|ניוזלטר|רשימת\s+התפוצה|מבצע|סייל|\d+%\s+הנחה|הנחה!|שדרגו\s+עכשיו|הטבה\s+בלעדית|מקומות\s+אחרונים/i,
    CONDITIONAL: /\b(?:nothing\s+(?:is\s+)?decided|not\s+(?:yet\s+)?decided|no\s+decision\s+yet|suppose\s+we|hypothetically|if\s+we\s+(?:approve|approved|go\s+ahead)|if\s+(?:leadership|management|the\s+board)\s+approves?)\b|לא\s+הוחלט|טרם\s+הוחלט|נניח\s+ש|אם\s+נאשר|אם\s+ההנהלה\s+תאשר|עוד\s+לא\s+סגרנו|שום\s+דבר\s+לא\s+סגור|עדיין\s+לא\s+החלטנו/i
  };
  var GREETING_ONLY = /^(?:hi|hey|hello|dear|good\s+\w+|thanks|thank\s+you|best|regards|cheers|many\s+thanks|best\s+regards|היי|הי|שלום|בוקר\s+טוב|תודה|בברכה|תודה\s+רבה|המשך\s+יום\s+טוב|יום\s+נעים|בתודה)\b[^.?!]{0,25}[,!.]?$/i;
  function sentences(t) { return aclean(t).split(/(?<=[.?!])\s+|\n+/).map(function (s) { return s.trim(); }).filter(Boolean); }
  function negatedOnly(own) {
    var ss = sentences(own).filter(function (s) { return !GREETING_ONLY.test(s); });
    var neg = 0, pos = 0;
    for (var i = 0; i < ss.length; i++) { if (RX.NEG_CUE.test(ss[i])) neg++; else if (RX.ASK_CUE.test(ss[i])) pos++; }
    return neg > 0 && pos === 0;
  }

  var api = { normalizeText: normalizeText, normalizeInput: normalizeInput, cleanText: cleanText, stripBoilerplate: stripBoilerplate, normalizeCase: normalizeCase,
    fnv1a: fnv1a, norm: norm, addresseeOf: addresseeOf, recipientRole: recipientRole, RX: RX, negatedOnly: negatedOnly };
  NS.text = api;
  if (typeof module === 'object' && module && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
