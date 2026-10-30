// The other side says they sent the thing that was asked for: "I just sent you the signed contract", "Here is the invoice", "The files are
// attached", «שלחתי לך את החוזה החתום», «הנה החשבונית». This is the news that can close a "Waiting on Dana: Send me the signed contract" task
// (a document, not a payment: core/chat-payment-claim.js owns money). It reads only the claim and the words that name the thing; which
// waiting task it fits, and the person's click, decide the rest. A promise to send later, a denial, a question, a condition, somebody else's
// sending and a payment stay quiet. Portable: no chrome.*, no DOM, no network.
const FlowChatSentClaim = (() => {
  const VERB_EN = '(?:sent|emailed|e-?mailed|uploaded|shared|attached|forwarded|dropped)';
  const SENT_I = new RegExp('\\b(?:i|we)(?:\'ve|\\s+have)?\\s+(?:just\\s+|already\\s+|now\\s+|also\\s+)?' + VERB_EN + '\\s*(?:you\\s+|it\\s+to\\s+you\\s+|over\\s+)?(?:the\\s+|my\\s+|your\\s+|our\\s+|a\\s+|an\\s+)?(.*)$', 'i');
  const SENT_JUST = new RegExp('^(?:just\\s+|already\\s+)' + VERB_EN + '\\s+(?:you\\s+)?(?:the\\s+|my\\s+|your\\s+|our\\s+)(.+)$', 'i');
  const HERE = /^(?:here(?:'s|\s+is|\s+are)|attached\s+(?:is|are)|(?:please\s+)?find\s+attached|please\s+find)\s+(?:the\s+|my\s+|your\s+|our\s+)?(.+)$/i;
  const ATTACHED = /^(?:the\s+|my\s+|our\s+)?(.+?)\s+(?:is|are|was|were)\s+(?:now\s+)?(?:attached|sent|uploaded|ready)\b/i;
  // Short replies that name little or nothing: "Sent!", "Done, sent", "Just emailed it", "Sent you an email", "sent the quote".
  const BARE_EN = /^(?:done[,.!\s-]*|ok[,.!\s-]*|okay[,.!\s-]*)?(?:just\s+|already\s+)?(?:sent|emailed|e-?mailed|uploaded|shared)(?:\s+(?:it|them|that|this)(?:\s+(?:over|now))?|\s+you\s+(?:an?\s+)?(?:email|e-?mail|mail|message|link)|\s+(?:the|my|our)\s+(.+?))?\s*[.!]*$/i;
  const BARE_HE = /^(?:בוצע[,.!\s-]*)?(?:שלחתי|שלחנו|העליתי|העלינו)(?:\s+(?:לך\s+|לכם\s+)?(?:את\s+)?(?:זה|אותו|אותה|אותם|במייל|בוואטסאפ|בווטסאפ))?\s*[.!]*$/;
  const SENT_HE = /(?:^|\s)(?:שלחתי|שלחנו|העליתי|העלינו|צירפתי|צירפנו|הנה)\s+(?:לך\s+|לכם\s+)?(?:את\s+)?(.*)$/;
  const ATTACHED_HE = /^(.+?)\s+(?:מצורף|מצורפת|מצורפים|מצורפות|נשלח|נשלחה|נשלחו|מוכן|מוכנה|מוכנים)(?:[\s.,!]|$)/;
  // Later, never, not yet, a condition, somebody else, or a payment: not a document sent.
  const NO_EN = /\b(?:will|won'?t|going\s+to|gonna|'ll|haven'?t|hasn'?t|not\s+yet|didn'?t|did\s+not|never|can'?t|cannot|if\s+i|once\s+i|when\s+i|after\s+i|tomorrow|tonight|later|soon|he\s+(?:sent|emailed|uploaded)|she\s+(?:sent|emailed|uploaded)|they\s+(?:sent|emailed|uploaded)|payment|transfer(?:red)?|money|paid|wire[d]?)\b/i;
  const NO_HE = /(?:אשלח|אעלה|אצרף|נשלח\s+(?:מחר|בהמשך)|עוד\s+לא|לא\s+(?:שלחתי|העליתי|צירפתי)|אם\s+אשלח|ברגע\s+ש|מחר|בהמשך|תשלום|כסף|העברה|העברתי|שילמתי)/;
  // Red team 2026-10-30: sending the thing to somebody else is not sending it to you ("I sent the contract to the lawyer", «שלחתי לעורך הדין
  // את החוזה»), and an unsigned copy or a draft is not the signed one the task waits for.
  const TO_OTHER_EN = /\b(?:sent|emailed|e-?mailed|forwarded|shared|uploaded)\b[^.!?]{0,60}?\bto\s+(?:the|my|our|his|her|their)\s+(?!email|mail|inbox|chat|group|link|drive|folder)[a-z]/i;
  const TO_OTHER_HE = /(?:שלחתי|שלחנו|העברתי|העברנו|העליתי)\s+(?:את\s+\S+(?:\s+\S+)?\s+)?ל(?:עורך|עורכת|עו\"ד|עוה\"ד|רואה|רואת|רו\"ח|מנהל|מנהלת|ספק|ספקים|בנק|לקוח|לקוחה|משרד|הנהלת|מחלקת|אחראי|צוות|שליח|חברה|חברת|אינסטלטור|חשמלאי|קבלן|מתווך|מתווכת|בעל|בעלת|יועץ|יועצת)(?![\u0590-\u05FF])/;
  const NOT_SIGNED = /\bun-?signed\b|\bnot\s+(?:yet\s+)?signed\b|\bdrafts?\b|טיוט|לא\s+חתו?ם|(?:בלי|ללא|חסר(?:ה|ים)?)\s+(?:\S+\s+)?(?:ה)?חתימ|\bmissing\s+(?:the\s+|a\s+)?signature/i;
  const QUESTION = /[?؟]/;
  const STOP = new Set(['the', 'and', 'you', 'your', 'our', 'for', 'with', 'from', 'this', 'that', 'them', 'they', 'are', 'was', 'were', 'has', 'have', 'its', 'now', 'just', 'here', 'there', 'over', 'also', 'again', 'please', 'attached', 'sent', 'send', 'share', 'shared', 'file', 'files', 'it', 'me', 'my', 'to', 'of', 'in', 'on', 'at', 'a', 'an', 'is', 'as', 'by', 'את', 'של', 'לך', 'לכם', 'לי', 'עם', 'גם', 'הנה', 'מצורף', 'מצורפת', 'שלחתי', 'שלחנו', 'שלח', 'תשלח', 'קובץ', 'קבצים', 'מייל', 'במייל', 'בוואטסאפ', 'בווטסאפ', 'email', 'mail', 'whatsapp', 'message']);

  // The content words of a phrase, lowercased: no short words, no filler, a Hebrew one-letter prefix (ה ו ל ב מ כ ש) taken off.
  function tokens(phrase) {
    const out = [];
    String(phrase || '').toLowerCase().replace(/[^a-z0-9֐-׿' -]/g, ' ').split(/[\s-]+/).forEach((w) => {
      let t = w.replace(/^'+|'+$/g, '');
      if (/[֐-׿]/.test(t) && t.length > 3) t = t.replace(/^(?:[ולבכש]?ה)(?=[֐-׿]{3,})/, '');
      if (t.length >= 3 && !STOP.has(t) && out.indexOf(t) < 0) out.push(t);
    });
    return out;
  }

  // { kind: 'sent', words: [...], lang } (words empty when the message names nothing: "I sent it") or { kind: 'none', reason }.
  function recognize(text) {
    const raw = String(text == null ? '' : text).replace(/[‎‏‪-‮]/g, '').replace(/\s+/g, ' ').trim();
    if (!raw) return { kind: 'none', reason: 'empty' };
    if (raw.length > 160) return { kind: 'none', reason: 'long' };
    if (QUESTION.test(raw)) return { kind: 'none', reason: 'question' };
    if (NO_EN.test(raw) || NO_HE.test(raw)) return { kind: 'none', reason: 'not-a-document-sent' };
    if (TO_OTHER_EN.test(raw) || TO_OTHER_HE.test(raw)) return { kind: 'none', reason: 'sent-to-someone-else' };
    const he = /[֐-׿]/.test(raw);
    let obj = null;
    let m = raw.match(BARE_EN) || raw.match(BARE_HE) || raw.match(SENT_I) || raw.match(SENT_JUST) || raw.match(HERE) || raw.match(ATTACHED);
    if (m) obj = m[1] || '';
    else {
      m = raw.match(SENT_HE) || raw.match(ATTACHED_HE);
      if (m) obj = m[1];
    }
    if (obj == null) return { kind: 'none', reason: 'no-claim' };
    const cut = String(obj).split(/[.!,;]| but | and (?:i|we) /i)[0].replace(/\s+to\s+[A-Za-z][\w'-]*(?:\s+[A-Za-z][\w'-]*)?$/i, '');
    return { kind: 'sent', words: tokens(cut), lang: he ? 'he' : 'en', unsigned: NOT_SIGNED.test(raw) };
  }

  // Which of the waiting tasks (each { title }) the words fit: the ones sharing a content word with the request. A claim that names nothing fits a
  // task only when it is the one open waiting task (the host passes that count). Returns the fitting tasks.
  function fits(claim, tasks, openCount) {
    const list = Array.isArray(tasks) ? tasks : [];
    if (!claim || claim.kind !== 'sent') return [];
    if (!claim.words.length) return openCount === 1 ? list.slice(0, 1) : [];
    return list.filter((t) => {
      const what = String(t && t.title || '').replace(/^(?:Waiting on|מחכים ל-?)[^:]*:\s*/, '');
      if (claim.unsigned && /\bsigned\b|חתו?ם|חתומ/i.test(what)) return false;
      const have = tokens(what);
      return claim.words.some((w) => have.indexOf(w) >= 0);
    });
  }

  return { recognize, tokens, fits };
})();

if (typeof module !== 'undefined') module.exports = { FlowChatSentClaim };
else if (typeof globalThis !== 'undefined') globalThis.FlowChatSentClaim = FlowChatSentClaim;
