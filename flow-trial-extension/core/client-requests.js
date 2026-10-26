// Client requests: what a professional (an accountant, a lawyer) asked a client to send, item by item, kept open until each
// item really arrived. Portable: no chrome.*, no DOM, no network, no storage, no model. The host passes text, attachment
// metadata and the clock, and gets plain values back.
//
// Why this exists. A firm's day is a set of open loops with its clients: "send the bank statements for July and August",
// "Form 106 for 2025 is still missing", "please sign the power of attorney". One message asks for several things; they come
// back one by one, often in the wrong order, sometimes for the wrong month. core/follow-up.js keeps ONE loop per thread with
// ONE "what". This file keeps the list: one request, several items, each with its own period and its own proof.
//
// The discipline is Glance's (docs/true-close.md):
//   - An item is "received" only on evidence: an attachment in a message from that client, read back by the host
//     (fetchedBack), whose name or covering text names that document and, when the item has a period, that period.
//   - Anything unsure is "check" (shown to the person, one click), never "received". A file called scan_001.pdf is not a
//     bank statement for August.
//   - A client's "I sent it" without a file is "claimed", not received. "No invoices this month" is an answer: "none".
//   - A payment item closes on the client's own words that it was paid (the close map's Y3 rule), never on a promise.
//   - The request closes only when every item is received, none, or released by the person. Preparing a reminder never
//     closes anything; this file never sends: it writes the reminder text, the host shows it, the person sends it.
//
// Request shape:
//   { id, threadId, messageId, channel, client:{email,name}, lang, createdAt, deadlineIso, chaseIso, status:'open'|'closed'|'released',
//     closedAt, template, nudges, nudgedAt, items:[Item] }
// Item:
//   { key, type, label:{he,en}, months:['YYYY-MM']|null, year:number|null, amount:{value,currency,raw}|null,
//     status:'missing'|'received'|'check'|'claimed'|'none'|'released', got:['YYYY-MM'], proof:[Proof], note }
// Proof (core/proof-of-close.js shape): { system, externalId, fetchedBack, verifiedAt, name }
const FlowClientRequests = (() => {
  function sibling(globalValue, file, name) {
    if (globalValue) return globalValue;
    try { return typeof require !== 'undefined' ? require(file)[name] : null; } catch (e) { return null; }
  }
  const extract = sibling(typeof FlowExtract !== 'undefined' ? FlowExtract : null, './extract.js', 'FlowExtract');

  const HE = '֐-׿';
  // A Hebrew word boundary: JavaScript's \b does not see Hebrew letters as word characters.
  // Hebrew glues prefixes to the word (ו, ה, ב, ל, מ, ש, כ and pairs like וה, וב): "ואישור", "ובקשה", "שהחשבוניות".
  const hb = (src) => '(?<![' + HE + '])(?:ו?[הבלמשכ]?)' + src + '(?![' + HE + '])';
  const heRe = (src, flags) => new RegExp(hb(src), flags || '');

  // ---- the documents a firm asks for (data, not code) ----------------------------------------------------------------
  //   per:   'month' = asked per month (or a range of months), 'year' = per tax year, null = once
  //   ask:   how the document is named in a request
  //   file:  how it tends to be named as a file (only used to read attachments)
  //   proof: what an arrival proves. 'file' = the file came; signed documents still need a person's look at the signature.
  const DOC_TYPES = [
    { id: 'bank-statement', per: 'month', he: 'דפי בנק', en: 'bank statements',
      ask: [heRe('(?:דפי|דף|תדפיסי|תדפיס)\\s*(?:ה)?(?:בנק|חשבון|עו"ש|עוש)'), heRe('עו"ש'), /\b(?:bank|account|checking) statements?\b/i],
      file: [/bank|statement|stmt|checking|osh\b|עו"?ש|ד(?:ף|פי)[\s._-]*(?:ה)?בנק|תדפיס/i] },
    { id: 'credit-card', per: 'month', he: 'פירוט כרטיסי אשראי', en: 'credit card statements',
      ask: [heRe('(?:פירוט|פירוטי|דפי|דף)\\s*(?:ה)?(?:כרטיס(?:י)?\\s*)?(?:ה)?אשראי'), /\bcredit[- ]card (?:statements?|bills?)\b/i],
      file: [/credit|visa|isracard|mastercard|amex|diners|\bmax\b|\bcal\b|אשראי|ויזה|ישראכרט/i] },
    { id: 'invoices', per: 'month', he: 'חשבוניות', en: 'invoices',
      ask: [heRe('(?:ה)?חשבוניות(?:\\s*(?:ה)?(?:הוצאה|הכנסה|ספקים|מס))?'), heRe('חשבונית(?:\\s*(?:ה)?(?:הוצאה|הכנסה|מס))?'), /\binvoices?\b/i],
      file: [/invoice|\binv[\s._-]*\d|חשבוני(?:ת|ות)|tax[\s._-]*inv/i] },
    { id: 'receipts', per: 'month', he: 'קבלות', en: 'receipts',
      ask: [heRe('(?:ה)?קבלות'), /\breceipts\b/i],
      file: [/receipt|קבלה|קבלות/i] },
    { id: 'payslips', per: 'month', he: 'תלושי שכר', en: 'payslips',
      ask: [heRe('(?:ה)?תלושי?(?:\\s*(?:ה)?(?:שכר|משכורת))?'), /\b(?:pay ?slips?|salary slips?|pay stubs?)\b/i],
      file: [/payslip|pay[\s._-]*slip|pay[\s._-]*stub|salary|תלוש/i] },
    { id: 'form-106', per: 'year', he: 'טופס 106', en: 'Form 106',
      ask: [heRe('(?:טופס|טפסי|טופסי)\\s*106'), /(?:^|[^\d])106(?:[^\d]|$)(?=[^\n]*(?:שנת|לשנת|20\d\d|טופס|form))/i, /\bform 106\b/i],
      file: [/(?:^|[^\d])106(?:[^\d]|$)/] },
    { id: 'form-867', per: 'year', he: 'טופס 867', en: 'Form 867',
      ask: [heRe('(?:טופס|טפסי|טופסי)\\s*867'), /\bform 867\b/i],
      file: [/(?:^|[^\d])867(?:[^\d]|$)/] },
    { id: 'annual-savings', per: 'year', he: 'דוח שנתי מקרן הפנסיה / הגמל / ההשתלמות', en: 'annual pension or savings statement',
      ask: [heRe('(?:דו"ח|דוח|דוחות|אישור|אישורי)\\s*(?:שנתי(?:ים)?\\s*)?(?:מ|של\\s*|על\\s*)?(?:ה)?(?:קרן|קופת|קופות|פנסיה|גמל|השתלמות|ביטוח\\s*מנהלים|הפקדות)[^\\n,.;]*'),
        /\bannual (?:pension|provident|insurance|savings) (?:statement|report)s?\b/i],
      file: [/pension|gemel|hishtalmut|provident|פנסיה|גמל|השתלמות|הפקדות/i] },
    { id: 'id-copy', per: null, he: 'צילום תעודת זהות (עם ספח)', en: 'a copy of the ID card',
      ask: [heRe('(?:צילום\\s*)?(?:תעודת\\s*(?:ה)?זהות|ת"ז|ת\\.ז\\.?)(?:\\s*(?:\\+|עם|כולל|ו)\\s*(?:ה)?ספח)?'), /\b(?:copy of (?:your|the) )?(?:ID card|identity card|passport)\b|\b(?:copy|scan|photo) of (?:your|the|his|her|their) ID\b|\bID copy\b/i],
      file: [/(?:^|[^a-z])id(?:[^a-z]|$)|teudat|zehut|passport|ת"?ז|זהות|דרכון|ספח/i] },
    { id: 'power-of-attorney', per: null, he: 'ייפוי כוח חתום', en: 'a signed power of attorney', signed: true,
      ask: [heRe('י?יפוי[\\s-]*(?:ה)?כו?ח'), /\bpower of attorney\b|\bPOA\b/],
      file: [/\bpoa\b|power[\s._-]*of[\s._-]*attorney|י?יפוי[\s._-]*כו?ח/i] },
    { id: 'fee-agreement', per: null, he: 'הסכם שכר טרחה חתום', en: 'a signed fee agreement', signed: true,
      ask: [heRe('הסכם\\s*(?:ה)?שכר\\s*(?:ה)?טרחה'), /\b(?:fee|engagement|retainer) (?:agreement|letter)\b/i],
      file: [/fee[\s._-]*agreement|engagement|retainer|שכר[\s._-]*טרחה/i] },
    { id: 'signed-agreement', per: null, he: 'ההסכם החתום', en: 'the signed agreement', signed: true,
      ask: [heRe('(?:ה)?(?:הסכם|חוזה)\\s*(?:ה)?חתום'), heRe('(?:לחתום|חתימה|חתימתך|חתימתכם)\\s*על\\s*(?:ה)?(?:הסכם|חוזה)'), /\bsigned (?:agreement|contract)\b|\bsign (?:the )?(?:agreement|contract)\b/i],
      file: [/agreement|contract|signed|הסכם|חוזה|חתום/i] },
    { id: 'affidavit', per: null, he: 'תצהיר חתום', en: 'a signed affidavit', signed: true,
      ask: [heRe('(?:ה)?תצהיר(?:ים)?'), /\baffidavits?\b/i],
      file: [/affidavit|תצהיר/i] },
    { id: 'land-registry', per: null, he: 'נסח טאבו', en: 'a land registry extract',
      ask: [heRe('נסח\\s*(?:ה)?(?:טאבו|רישום)'), /\bland registry (?:extract|excerpt)\b|\btabu extract\b/i],
      file: [/tabu|nesach|land[\s._-]*registry|נסח|טאבו/i] },
    { id: 'tax-assessment', per: 'year', he: 'שומת המס', en: 'the tax assessment',
      ask: [heRe('(?:ה)?שומ(?:ת|ה)(?:\\s*(?:ה)?מס)?'), /\btax assessment\b/i],
      file: [/assessment|shuma|שומ(?:ה|ת)/i] }
  ];
  const BY_ID = {};
  DOC_TYPES.forEach((t) => { BY_ID[t.id] = t; });
  const PAYMENT = { id: 'payment', per: null, he: 'תשלום', en: 'the payment' };
  BY_ID.payment = PAYMENT;

  // ---- frames: is this message asking the client for something? ---------------------------------------------------
  const ASK_HE = heRe('(?:נא|אנא|בבקשה|תשלח(?:י|ו)?|שלח(?:י|ו)?|לשלוח|תעביר(?:י|ו)?|העביר(?:י|ו)?|להעביר|תצרפ?(?:י|ו)?|לצרף|צרפ(?:י|ו)|תחתו?מ(?:י|ו)?|לחתום|חתמ(?:י|ו)|נדרש(?:ים|ת|ות)?|חסר(?:ים|ה|ות)?|עדיין\\s*לא\\s*(?:קיבלנו|התקבל(?:ו)?)|צריכ(?:ים|ה)?|צריך|לחתימה|לחתימת(?:ך|כם|כן)|אבקש|נבקש|אודה|נודה|יש\\s*להעביר|מחכ(?:ים|ה)\\s*ל|ממתינ(?:ים|ה)\\s*ל|טרם\\s*(?:קיבלנו|התקבל(?:ו)?))');
  const ASK_EN = /\b(?:please|kindly|could you|can you|would you|send (?:me|us|over)|forward|attach|provide|we (?:still )?need|i (?:still )?need|still (?:missing|need|waiting)|missing|outstanding|waiting for|haven'?t (?:received|got)|sign (?:and return|the)|for (?:your )?signature)\b/i;
  // "Already received X" inside the ask: X is not asked for.
  const HAVE_HE = heRe('(?:קיבלנו|קיבלתי|התקבל(?:ו|ה)?|הגיע(?:ו|ה)?|יש\\s*לנו|יש\\s*לי)');
  const HAVE_EN = /\b(?:(?:we|i)(?:'ve| have)? (?:already )?(?:received|got)|thanks? for (?:sending|the)|already have)\b/i;
  const NO_NEED_HE = heRe('(?:אין\\s*צורך|לא\\s*צריך|לא\\s*נדרש(?:ים|ת|ות)?)');
  const NO_NEED_EN = /\b(?:no need (?:to|for)|don'?t need|not needed)\b/i;
  // The client's own "none": an answer, not a missing file. "Not yet" is not none.
  const NONE_HE = heRe('(?:אין\\s*(?:לי|לנו)?\\s*(?:\\S+\\s*){0,2}(?:החודש|בחודש|לחודש|השנה|בתקופה)|לא\\s*היו\\s*(?:לי|לנו)?\\s*(?:\\S+\\s*){0,2}(?:החודש|בחודש|לחודש|השנה|בתקופה)|לא\\s*היו\\s*(?:לי|לנו)?\\s*(?:הוצאות|הכנסות|חשבוניות|קבלות|תלושים|תלושי\\s*שכר)|אין\\s*(?:לי|לנו)\\s*(?:הוצאות|הכנסות|חשבוניות|קבלות|תלושים|תלושי\\s*שכר))');
  const NONE_EN = /\b(?:there (?:were|are) no|(?:i|we) (?:had|have) no|no) (?:\w+ ){0,2}(?:this|that|last) (?:month|year|period)\b|\b(?:i|we) (?:had|have) no (?:invoices|receipts|expenses|income|payslips)\b/i;
  const NOT_YET = new RegExp(hb('עדיין') + '|' + hb('עוד\\s*לא') + '|' + hb('בקרוב') + '|\\b(?:yet|soon|tomorrow|later)\\b', 'i');
  const SENT_CLAIM_HE = heRe('(?:שלחתי|שלחנו|העברתי|העברנו|צירפתי|צירפנו|מצורפ(?:ים|ות|ת)?|מצרפ(?:ת|ים)?|הנה)');
  const SENT_CLAIM_EN = /\b(?:i(?:'ve| have)? sent|we(?:'ve| have)? sent|attached|please find|here (?:is|are)|enclosed)\b/i;
  const PAID_HE = heRe('(?:שילמתי|שילמנו|שולם|שולמה|העברתי\\s*(?:את\\s*)?(?:ה)?(?:תשלום|כסף|סכום)|ביצעתי\\s*(?:את\\s*)?(?:ה)?(?:תשלום|העברה)|הועבר(?:ה)?\\s*(?:ה)?(?:תשלום|העברה))');
  const PAID_EN = /\b(?:(?:i|we)(?:'ve| have)? (?:paid|transferred|wired|sent the payment)|payment (?:was |has been )?(?:sent|made|transferred)|it'?s paid)\b/i;
  const PAY_WORD = new RegExp(hb('(?:תשלום|לתשלום|שכר\\s*טרחה|יתרה|חוב|לשלם|תשלמ(?:ו|י)|להעביר\\s*(?:את\\s*)?(?:ה)?(?:תשלום|סכום))') + '|\\b(?:payment|pay|balance|outstanding amount|fee|retainer)\\b', 'i');

  // ---- periods ---------------------------------------------------------------------------------------------------
  const MONTHS_HE = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
  const MONTHS_EN = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const MONTH_HE_RE = '(?:' + MONTHS_HE.join('|') + ')';
  const MONTH_EN_RE = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
  const pad = (n) => (n < 10 ? '0' : '') + n;
  const ym = (y, m) => y + '-' + pad(m);
  function monthIndex(word) {
    const w = String(word || '').toLowerCase();
    const he = MONTHS_HE.indexOf(word);
    if (he >= 0) return he + 1;
    const en = MONTHS_EN.indexOf(w.slice(0, 3));
    return en >= 0 ? en + 1 : 0;
  }
  function nowDate(now) { return new Date(typeof now === 'number' ? now : Date.now()); }
  // A month named without a year is the most recent one that has already started (a firm asks for the past).
  function inferYear(month, now) {
    const d = nowDate(now);
    return month <= d.getMonth() + 1 ? d.getFullYear() : d.getFullYear() - 1;
  }
  function range(y1, m1, y2, m2) {
    const out = [];
    let y = y1, m = m1, guard = 0;
    while ((y < y2 || (y === y2 && m <= m2)) && guard++ < 36) { out.push(ym(y, m)); m++; if (m > 12) { m = 1; y++; } }
    return out;
  }
  const YEAR = '(20\\d{2})';

  // Returns { months:['YYYY-MM'] } or { year } or null, read from one line of text (a request line or a file name).
  function parsePeriod(text, now) {
    const s = String(text || '');
    if (!s) return null;
    let m;
    // 2025-08 / 2025_08 / 202508 (file names)
    m = s.match(/(?:^|[^\d])(20\d{2})[-_.\/]?(0[1-9]|1[0-2])(?:[^\d]|$)/);
    if (m) return { months: [ym(+m[1], +m[2])] };
    // 7-8/2025, 07-08.2025
    m = s.match(/(?:^|[^\d])(0?[1-9]|1[0-2])\s*[-–]\s*(0?[1-9]|1[0-2])\s*[\/.]\s*(20\d{2})(?:[^\d]|$)/);
    if (m && +m[1] <= +m[2]) return { months: range(+m[3], +m[1], +m[3], +m[2]) };
    // 8/2025, 08.2025, 08-2025
    m = s.match(/(?:^|[^\d\/.])(0?[1-9]|1[0-2])\s*[\/.\-_]\s*(20\d{2})(?:[^\d]|$)/);
    if (m) return { months: [ym(+m[2], +m[1])] };
    // Hebrew months: "יולי-אוגוסט 2025", "יולי ואוגוסט", "אוגוסט"
    m = s.match(new RegExp('(?<![' + HE + '])(?:ב|ל|מ)?(' + MONTH_HE_RE + ')\\s*(?:[-–]|עד|ו|ול)\\s*(?:ב|ל)?(' + MONTH_HE_RE + ')(?:\\s*(?:של\\s*)?' + YEAR + ')?'));
    if (m) {
      const a = monthIndex(m[1]), b = monthIndex(m[2]);
      const y2 = m[3] ? +m[3] : inferYear(b, now);
      const y1 = a <= b ? y2 : y2 - 1;
      return { months: range(y1, a, y2, b) };
    }
    m = s.match(new RegExp('(?<![' + HE + '])(?:ב|ל|מ)?(' + MONTH_HE_RE + ')(?![' + HE + '])(?:\\s*(?:של\\s*)?' + YEAR + ')?'));
    if (m) { const a = monthIndex(m[1]); return { months: [ym(m[2] ? +m[2] : inferYear(a, now), a)] }; }
    // English months: "July-August 2025", "Aug 2025", "August"
    m = s.match(new RegExp('\\b(' + MONTH_EN_RE + ')\\s*(?:[-–]|to|and|&)\\s*(' + MONTH_EN_RE + ')\\b(?:,?\\s*' + YEAR + ')?', 'i'));
    if (m) {
      const a = monthIndex(m[1]), b = monthIndex(m[2]);
      const y2 = m[3] ? +m[3] : inferYear(b, now);
      return { months: range(a <= b ? y2 : y2 - 1, a, y2, b) };
    }
    m = s.match(new RegExp('\\b(' + MONTH_EN_RE + ')\\b(?:,?\\s*' + YEAR + ')?', 'i'));
    if (m && !/^may$/i.test(m[1]) ) { const a = monthIndex(m[1]); return { months: [ym(m[2] ? +m[2] : inferYear(a, now), a)] }; }
    // Hebrew numeric months: "לחודשים 7-8", "חודש 8"
    m = s.match(new RegExp(hb('(?:ל|ב|מ)?חודש(?:ים)?') + '\\s*(0?[1-9]|1[0-2])(?:\\s*[-–]\\s*(0?[1-9]|1[0-2]))?(?:\\s*[\\/.]?\\s*' + YEAR + ')?'));
    if (m) {
      const a = +m[1], b = m[2] ? +m[2] : a;
      const y = m[3] ? +m[3] : inferYear(b, now);
      return { months: a <= b ? range(y, a, y, b) : range(y - 1, a, y, b) };
    }
    // Quarters: Q3 2025, רבעון 3
    m = s.match(new RegExp('\\bQ([1-4])\\b(?:\\s*' + YEAR + ')?|' + hb('רבעון') + '\\s*([1-4])(?:\\s*(?:של\\s*)?' + YEAR + ')?', 'i'));
    if (m) {
      const q = +(m[1] || m[3]); const y = +(m[2] || m[4] || 0) || nowDate(now).getFullYear();
      return { months: range(y, q * 3 - 2, y, q * 3) };
    }
    // Relative: last month / last two months / החודש הקודם / החודשיים האחרונים
    const d = nowDate(now);
    const prev = (k) => { const x = new Date(d.getFullYear(), d.getMonth() - k, 1); return [x.getFullYear(), x.getMonth() + 1]; };
    if (new RegExp(hb('(?:החודשיים\\s*(?:ה)?אחרונים|חודשיים\\s*אחרונים|החודשיים\\s*הקודמים)') + '|\\blast two months\\b|\\bprevious two months\\b', 'i').test(s)) {
      const [y1, m1] = prev(2), [y2, m2] = prev(1); return { months: range(y1, m1, y2, m2) };
    }
    if (new RegExp(hb('(?:החודש\\s*(?:ה)?(?:קודם|שעבר)|חודש\\s*שעבר)') + '|\\b(?:last|previous) month\\b', 'i').test(s)) {
      const [y, mo] = prev(1); return { months: [ym(y, mo)] };
    }
    // A tax year: "לשנת 2025", "שנת המס 2025", "for 2025", "tax year 2025", a bare 2025 near a yearly document
    m = s.match(new RegExp(hb('(?:ל|ב)?שנת(?:\\s*(?:ה)?מס)?') + '\\s*' + YEAR + '|\\b(?:tax year|for|year)\\s*' + YEAR + '\\b', 'i'));
    if (m) return { year: +(m[1] || m[2]) };
    m = s.match(/(?:^|[^\d])(20\d{2})(?:[^\d]|$)/);
    if (m) return { year: +m[1] };
    return null;
  }

  // ---- reading a request ------------------------------------------------------------------------------------------
  // Lines first; a long line is cut into sentences, but never after a list number ("1. invoices" stays one line).
  function lines(text) {
    const out = [];
    String(text || '').split(/\n+/).forEach((raw) => {
      const line = raw.trim();
      if (!line) return;
      if (/^(?:[-•*·]|\d{1,2}[.)])\s/.test(line)) { out.push(line); return; }
      line.split(/(?<=[.!?;:])\s+(?=[^\s])/).forEach((x) => { if (x.trim()) out.push(x.trim()); });
    });
    return out;
  }
  function hasHebrew(s) { return new RegExp('[' + HE + ']').test(String(s || '')); }
  function typesIn(line) {
    const found = [];
    for (const t of DOC_TYPES) {
      let at = -1;
      for (const re of t.ask) { const m = re.exec(line); if (m && (at < 0 || m.index < at)) at = m.index; }
      if (at >= 0) found.push({ type: t, at });
    }
    // A fee agreement is also an agreement: keep the more specific one only.
    const ids = found.map((f) => f.type.id);
    const drop = new Set();
    if (ids.indexOf('fee-agreement') >= 0) drop.add('signed-agreement');
    if (ids.indexOf('credit-card') >= 0 && ids.indexOf('bank-statement') >= 0) {
      // "פירוט כרטיס אשראי מהבנק" is a credit card statement, not a bank statement, when only one document is named.
      const cc = found.find((f) => f.type.id === 'credit-card'), bk = found.find((f) => f.type.id === 'bank-statement');
      if (Math.abs(cc.at - bk.at) < 12) drop.add('bank-statement');
    }
    return found.filter((f) => !drop.has(f.type.id)).sort((a, b) => a.at - b.at).map((f) => f.type);
  }
  function asksIn(line) { return ASK_HE.test(line) || ASK_EN.test(line); }
  function haveIn(line) { return HAVE_HE.test(line) || HAVE_EN.test(line); }
  function noNeedIn(line) { return NO_NEED_HE.test(line) || NO_NEED_EN.test(line); }

  function itemFor(type, period, amount) {
    const t = typeof type === 'string' ? BY_ID[type] : type;
    const months = period && period.months && t.per === 'month' ? period.months.slice() : null;
    const year = t.per === 'year' ? (period && period.year ? period.year : period && period.months ? +period.months[period.months.length - 1].slice(0, 4) : null) : null;
    return {
      key: t.id + (months ? ':' + months[0] + (months.length > 1 ? '..' + months[months.length - 1] : '') : year ? ':' + year : ''),
      type: t.id, label: { he: t.he, en: t.en }, months, year, amount: amount || null,
      status: 'missing', got: [], proof: [], note: null, signed: Boolean(t.signed)
    };
  }

  // ---- things that are not a known document ("the deck and the Q3 numbers") -----------------------------------------
  // Used only with ctx.generic === true (the general follow loop, switch CLIENT_REQUESTS.items). One ask line with a
  // hand-over verb and a list of at least two things: each thing becomes an item. A vague word ("details", "your thoughts")
  // or a pronoun ("it", "them") is never an item: nothing could prove it arrived.
  const GIVE_EN = /\b(?:send|share|forward|attach|provide|upload|get me|pass (?:me|us|along)|email)\b(?:\s+(?:me|us|over|across|along|back))*\s+/i;
  const GIVE_HE = new RegExp('(?<![' + HE + '])(?:תשלח(?:י|ו)?|שלח(?:י|ו)?|לשלוח|תעביר(?:י|ו)?|העביר(?:י|ו)?|להעביר|תצרפ?(?:י|ו)?|לצרף|צרפ(?:י|ו)|תעלה|להעלות)(?![' + HE + '])(?:\\s+(?:לי|לנו|אליי|אלינו))?\\s+');
  const STOP_EN = new Set(['the', 'a', 'an', 'me', 'us', 'your', 'my', 'our', 'his', 'her', 'their', 'please', 'also', 'both', 'copy', 'copies', 'of', 'for', 'to', 'over', 'back', 'latest', 'final', 'updated', 'new', 'current', 'version', 'file', 'files', 'with', 'from', 'on', 'in', 'and', 'by', 'when', 'you', 'can']);
  const STOP_HE = new Set(['את', 'של', 'לי', 'לנו', 'גם', 'עם', 'על', 'עד', 'מה', 'כל', 'קובץ', 'עותק', 'האחרון', 'האחרונה', 'המעודכן', 'המעודכנת', 'הסופי', 'הסופית']);
  const VAGUE = /^(?:it|them|this|that|these|those|everything|anything|something|details?|info(?:rmation)?|updates?|answers?|thoughts?|feedback|comments?|input|confirmation|response|reply|news|status|זה|אותו|אותה|אותם|הכל|פרטים|הפרטים|מידע|המידע|עדכון|תשובה|משוב|הערות|אישור|האישור|סטטוס)$/i;
  // A few things have well-known file names in the other language.
  const SYN = [
    [/^(?:deck|slides?|presentation|מצגת|המצגת)$/i, ['deck', 'slide', 'presentation', 'pitch', 'מצגת', '.pptx', '.key']],
    [/^(?:numbers|figures|data|spreadsheet|sheet|נתונים|הנתונים|גיליון|הגיליון|האקסל|אקסל)$/i, ['numbers', 'data', 'figures', 'sheet', 'נתונים', '.xlsx', '.csv', '.xls']],
    [/^(?:quote|proposal|offer|הצעת|הצעה|ההצעה)$/i, ['quote', 'proposal', 'offer', 'הצעה', 'הצעת']],
    [/^(?:cv|resume|קורות|קו"ח)$/i, ['cv', 'resume', 'קורות', 'קו"ח']],
    [/^(?:photos?|pictures?|images?|תמונות|התמונות|תמונה)$/i, ['photo', 'picture', 'image', 'img', 'תמונ', '.jpg', '.jpeg', '.png', '.heic']],
    [/^(?:logo|לוגו|הלוגו)$/i, ['logo', 'לוגו']],
    [/^(?:report|דוח|הדוח|דו"ח|הדו"ח)$/i, ['report', 'דוח', 'דו"ח']],
    [/^(?:plan|plans|תוכנית|התוכנית|תכנית|התכנית|שרטוט|השרטוט)$/i, ['plan', 'drawing', 'תוכנית', 'תכנית', 'שרטוט', '.dwg']]
  ];
  function stripHe(w) { return w.length > 3 ? w.replace(/^(?:ו?ה|ו|ב|ל|מ)(?=[֐-׿]{2})/, '') : w; }
  function termsOf(phrase) {
    const out = new Set();
    String(phrase).toLowerCase().split(/[^\p{L}\p{N}"]+/u).filter(Boolean).forEach((w) => {
      if (STOP_EN.has(w) || STOP_HE.has(w) || w.length < 2) return;
      out.add(hasHebrew(w) ? stripHe(w) : w.replace(/s$/, ''));
      SYN.forEach(([re, alts]) => { if (re.test(w)) alts.forEach((a) => out.add(a)); });
    });
    return Array.from(out);
  }
  function genericItems(body) {
    const items = [];
    for (const line of lines(body)) {
      if (typesIn(line).length > 1) continue;
      const m = GIVE_EN.exec(line) || GIVE_HE.exec(line);
      if (!m) continue;
      let rest = line.slice(m.index + m[0].length);
      // The list ends at the deadline, the reason, or the end of the sentence.
      rest = rest.split(/\s+(?:by|before|until|no later than|so (?:that|i|we)|for the|asap|today|tomorrow|when you)\b|\s+(?:עד|לפני|כדי|בשביל|היום|מחר)(?=\s|$)|[.?!;:]/i)[0];
      const parts = rest.split(/\s*,\s*(?:and\s+|ו(?=את\s|ה))?|\s+(?:and|&|as well as|plus)\s+|\s+ו(?=את\s|ה[֐-׿])/i).map((x) => x.trim().replace(/^(?:את|the|a|an)\s+/i, '').trim()).filter(Boolean);
      if (parts.length < 2) continue;
      for (const part of parts) {
        const words = part.split(/\s+/);
        if (words.length > 6) { items.length = 0; break; }
        const core = part.replace(/^(?:me|us|your|my|our|his|her|their|את)\s+/i, '');
        if (VAGUE.test(core) || core.split(/\s+/).every((w) => VAGUE.test(w) || STOP_EN.has(w.toLowerCase()) || STOP_HE.has(w))) continue;
        const known = typesIn(part);
        if (known.length) { items.push({ known: known[0] }); continue; }
        const terms = termsOf(part);
        if (!terms.length) continue;
        const label = part.replace(/^(?:me|us|your|my|our)\s+/i, '');
        const slug = terms.filter((t) => !/^\./.test(t)).slice(0, 3).join('-') || 'item';
        items.push({ key: 'thing:' + slug, type: 'thing', label: { he: label, en: label }, terms, months: null, year: null, amount: null, status: 'missing', got: [], proof: [], note: null, signed: /signed|חתו?מ/i.test(part) });
      }
      // A list is at least two real things, one of them not a known document (those are read above).
      if (items.length >= 2 && items.filter((i) => !i.known).length) return items;
      items.length = 0;
    }
    return [];
  }
  function thingFits(item, name) {
    const n = String(name || '').toLowerCase();
    const ext = (n.match(/\.[a-z0-9]{2,5}$/) || [''])[0];
    const words = item.terms.filter((t) => !/^\./.test(t));
    const exts = item.terms.filter((t) => /^\./.test(t));
    return words.some((t) => t.length >= 3 && n.indexOf(t) >= 0) || (ext && exts.indexOf(ext) >= 0);
  }

  // text: the professional's OWN message to a client (quoted history removed by the host).
  // Returns null (no request) or { items, deadlineIso, lang, why }.
  function classifyOutgoingRequest(text, ctx) {
    const c = ctx || {};
    const body = String(text || '').trim();
    if (!body) return null;
    const ls = lines(body);
    const lang = hasHebrew(body) ? 'he' : 'en';
    const items = [];
    const seen = new Set();
    // A period stated once for the whole message ("לגבי אוגוסט 2025:" then a list) applies to the list lines that carry none.
    let shared = null;
    let anyAsk = false;
    let listContext = false;
    for (let i = 0; i < ls.length; i++) {
      const line = ls[i];
      const types = typesIn(line);
      const ask = asksIn(line);
      if (ask) anyAsk = true;
      const isListLine = /^\s*(?:[-•*·]|\d{1,2}[.)])\s*/.test(line);
      const p = parsePeriod(line, c.now);
      if (!types.length) {
        if (p && (ask || /:\s*$/.test(line))) shared = p;
        if (ask && /:\s*$/.test(line)) listContext = true;
        continue;
      }
      // "We received the bank statements; the invoices are still missing." Split the line at the turn.
      let segs = [line];
      const turn = line.split(new RegExp('\\s*(?:,|;|' + hb('אבל') + '|' + hb('אך') + '|' + hb('ועדיין') + '|\\bbut\\b|\\bhowever\\b)\\s*', 'i'));
      if (turn.length > 1 && types.length > 1) segs = turn;
      for (const seg of segs) {
        const segTypes = segs.length > 1 ? typesIn(seg) : types;
        if (!segTypes.length) continue;
        const segAsk = asksIn(seg) || (segs.length > 1 ? asksIn(line) && !haveIn(seg) : ask) || (isListLine && (listContext || anyAsk));
        if (noNeedIn(seg)) continue;
        if (haveIn(seg) && !asksIn(seg)) continue;
        if (!segAsk) continue;
        const segP = parsePeriod(seg, c.now) || p || shared;
        for (const t of segTypes) {
          const it = itemFor(t, segP);
          if (seen.has(it.key)) continue;
          seen.add(it.key);
          items.push(it);
        }
      }
    }
    // A payment asked of the client: a payment word, a figure, and an ask, in one line.
    if (extract && extract.parseMoney) {
      for (const line of ls) {
        if (!PAY_WORD.test(line) || !asksIn(line) || haveIn(line)) continue;
        const money = extract.parseMoney(line);
        if (!money) continue;
        const it = itemFor(PAYMENT, null, { value: money.value, currency: money.currency || null, raw: money.raw });
        if (!seen.has(it.key)) { seen.add(it.key); items.push(it); }
        break;
      }
    }
    if (c.generic === true) {
      genericItems(body).forEach((g) => {
        const it = g.known ? itemFor(g.known, parsePeriod(body, c.now)) : g;
        if (seen.has(it.key)) return;
        seen.add(it.key); items.push(it); anyAsk = true;
      });
    }
    if (!items.length || !anyAsk) return null;
    let deadlineIso = null;
    if (extract && extract.parseDate) {
      for (const line of ls) {
        if (!/(?:עד|לפני|לא\s*יאוחר|\bby\b|\bbefore\b|\buntil\b|\bno later than\b|\bdue\b)/i.test(line)) continue;
        const d = extract.parseDate(line, nowDate(c.now));
        if (d && d.iso) { deadlineIso = d.iso; break; }
      }
    }
    return { items, deadlineIso, lang, why: items.map((i) => i.key).join(', ') };
  }

  // ---- chase days -------------------------------------------------------------------------------------------------
  const DAY_MS = 86400000;
  function isoDay(t) { const d = nowDate(t); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  // Israel: Friday and Saturday are not business days.
  function addBusinessDays(fromMs, n) {
    let d = new Date(fromMs), left = n;
    while (left > 0) { d = new Date(d.getTime() + DAY_MS); const wd = d.getDay(); if (wd !== 5 && wd !== 6) left--; }
    return isoDay(d.getTime());
  }
  function firstChase(createdAt, deadlineIso) {
    const base = addBusinessDays(createdAt, 3);
    if (deadlineIso) {
      const dl = new Date(deadlineIso + 'T09:00:00').getTime();
      const before = addBusinessDays(dl - 2 * DAY_MS, 0);
      return before < base ? (before > isoDay(createdAt) ? before : base) : base;
    }
    return base;
  }

  // a: { threadId, messageId, channel, client:{email,name}, ask (classifyOutgoingRequest result), now, template }
  function buildRequest(a) {
    const now = typeof a.now === 'number' ? a.now : Date.now();
    return {
      id: String(a.threadId || a.messageId || ('req-' + now)),
      threadId: a.threadId ? String(a.threadId) : null,
      messageId: a.messageId ? String(a.messageId) : null,
      channel: a.channel || 'gmail',
      client: { email: a.client && a.client.email ? String(a.client.email).toLowerCase() : null, name: (a.client && a.client.name) || null },
      lang: a.ask.lang || 'he',
      createdAt: now,
      deadlineIso: a.ask.deadlineIso || null,
      chaseIso: firstChase(now, a.ask.deadlineIso || null),
      status: 'open', closedAt: null,
      template: a.template || null,
      nudges: 0, nudgedAt: null,
      items: a.ask.items.map((i) => JSON.parse(JSON.stringify(i)))
    };
  }

  // ---- reading what came back ---------------------------------------------------------------------------------------
  function typeOfName(name) {
    const n = String(name || '');
    const hits = DOC_TYPES.filter((t) => t.file.some((re) => re.test(n)));
    // A more specific signed document wins over a generic "agreement".
    if (hits.length > 1) {
      const ids = hits.map((t) => t.id);
      if (ids.indexOf('fee-agreement') >= 0) return BY_ID['fee-agreement'];
      if (ids.indexOf('power-of-attorney') >= 0) return BY_ID['power-of-attorney'];
      if (ids.indexOf('credit-card') >= 0 && ids.indexOf('bank-statement') >= 0) return null;
      return null;
    }
    return hits[0] || null;
  }
  const RESOLVED = { received: true, none: true, released: true };
  function isDone(item) { return Boolean(RESOLVED[item.status]); }
  function needMonths(item) { return item.months ? item.months.filter((m) => item.got.indexOf(m) < 0) : null; }
  function setReceived(item, proof, months) {
    if (months && item.months) months.forEach((m) => { if (item.months.indexOf(m) >= 0 && item.got.indexOf(m) < 0) item.got.push(m); });
    item.proof.push(proof);
    const left = needMonths(item);
    item.status = !item.months || (left && !left.length) ? 'received' : 'missing';
    item.note = item.status === 'missing' && left ? 'partial' : null;
  }
  function periodFits(item, period) {
    if (!period) return item.months ? (item.months.length === 1 ? 'unknown' : 'unknown') : item.year ? 'unknown' : 'yes';
    if (item.months) {
      if (period.months) { const hit = period.months.filter((m) => item.months.indexOf(m) >= 0); return hit.length ? hit : 'no'; }
      return 'unknown';
    }
    if (item.year) {
      if (period.year) return period.year === item.year ? 'yes' : 'no';
      if (period.months) return period.months.some((m) => +m.slice(0, 4) === item.year) ? 'yes' : 'no';
      return 'unknown';
    }
    return 'yes';
  }

  // msg: { messageId, channel, from:{email}, text, attachments:[{id?, name, mimeType?, size?}], fetchedBack:boolean, now }
  // Returns { request (a new object), changes:[{key, from, to, why}], unmatched:[names], closed:boolean }.
  // Only a message FROM the request's client counts; anything else returns the request unchanged.
  function applyArrival(request, msg) {
    const req = JSON.parse(JSON.stringify(request));
    const out = { request: req, changes: [], unmatched: [], closed: false };
    if (!req || req.status !== 'open' || !msg) return out;
    const from = msg.from && msg.from.email ? String(msg.from.email).toLowerCase() : null;
    if (!from || !req.client.email || from !== req.client.email) return out;
    const now = typeof msg.now === 'number' ? msg.now : Date.now();
    const text = String(msg.text || '');
    const atts = (msg.attachments || []).filter((a) => a && a.name && !/^(?:image\d*|logo|signature|outlook)\.(?:png|gif|jpe?g)$/i.test(a.name) && !(a.size && a.size < 4000));
    const open = req.items.filter((i) => !isDone(i));
    const change = (item, to, why) => { if (item.status !== to || why === 'partial') out.changes.push({ key: item.key, from: item.status, to, why }); };
    const proofOf = (att) => ({ system: msg.channel || req.channel || 'gmail', externalId: String(msg.messageId || '') + (att ? ':' + (att.id || att.name) : ''), fetchedBack: msg.fetchedBack === true, verifiedAt: now, name: att ? att.name : null });

    // 1. Attachments, each read on its own name; the covering text only names a file when there is exactly one.
    // Only lines that hand something over may name an attachment: "I have no invoices this month" names nothing that came.
    const textTypes = typesIn(lines(text).filter((l) => !(NONE_HE.test(l) || NONE_EN.test(l)) && !haveIn(l) && !noNeedIn(l)).join('\n'));
    const textPeriod = parsePeriod(text, now);
    atts.forEach((att) => {
      let t = typeOfName(att.name);
      let period = parsePeriod(att.name.replace(/\.[a-z0-9]{2,5}$/i, ''), now);
      if (!t && atts.length === 1 && textTypes.length === 1) { t = textTypes[0]; period = period || textPeriod; }
      if (!t && atts.length === 1 && open.length === 1 && (SENT_CLAIM_HE.test(text) || SENT_CLAIM_EN.test(text))) {
        // One file, one open item, and the client says "attached": likely, never certain.
        const it = open[0]; if (it.status !== 'check') { change(it, 'check', 'one unnamed file for the only open item'); it.status = 'check'; it.proof.push(proofOf(att)); }
        return;
      }
      // A name no open document item wants may still be one of the things asked for ("NDA_signed.pdf").
      if (!t || !open.some((i) => i.type === t.id && !isDone(i))) {
        const things = open.filter((i) => i.type === 'thing' && !isDone(i) && thingFits(i, att.name));
        if (things.length === 1) {
          const it = things[0];
          if (msg.fetchedBack !== true) { change(it, 'check', 'not read back'); it.status = 'check'; it.proof.push(proofOf(att)); return; }
          const before = it.status;
          setReceived(it, proofOf(att), null);
          out.changes.push({ key: it.key, from: before, to: it.status, why: it.signed ? 'file received; the signature is for you to look at' : 'file received' });
          return;
        }
        if (!t) { out.unmatched.push(att.name); return; }
      }
      const cands = open.filter((i) => i.type === t.id && !isDone(i));
      if (!cands.length) { out.unmatched.push(att.name); return; }
      // An item for the right document; is it the right period?
      for (const it of cands) {
        const fit = periodFits(it, period);
        if (fit === 'no') continue;
        if (msg.fetchedBack !== true) { change(it, 'check', 'not read back'); it.status = 'check'; it.proof.push(proofOf(att)); return; }
        if (fit === 'unknown') {
          // A one-month item and a file with no period: the client answered this request with this document. Likely, not proved.
          change(it, 'check', 'no period on the file'); it.status = 'check'; it.proof.push(proofOf(att)); return;
        }
        const months = Array.isArray(fit) ? fit : null;
        const before = it.status;
        setReceived(it, proofOf(att), months);
        out.changes.push({ key: it.key, from: before, to: it.status, why: it.status === 'received' ? (it.signed ? 'file received; the signature is for you to look at' : 'file received') : 'partial' });
        return;
      }
      out.unmatched.push(att.name);
    });

    // 2. Words without files.
    const ls = lines(text);
    for (const line of ls) {
      const lineTypes = typesIn(line);
      const targets = lineTypes.length ? open.filter((i) => lineTypes.some((t) => t.id === i.type)) : (open.length === 1 ? open : []);
      // "No invoices this month": an answer.
      if ((NONE_HE.test(line) || NONE_EN.test(line)) && !NOT_YET.test(line)) {
        targets.filter((i) => i.status === 'missing' && i.type !== 'payment').forEach((i) => { change(i, 'none', 'client says there are none'); i.status = 'none'; i.note = line.slice(0, 140); });
      }
      // "I paid": the client's own words close a payment (close map Y3).
      if ((PAID_HE.test(line) || PAID_EN.test(line)) && !NOT_YET.test(line)) {
        open.filter((i) => i.type === 'payment' && i.status !== 'received').forEach((i) => { change(i, 'received', 'client says it was paid'); i.status = 'received'; i.proof.push(Object.assign(proofOf(null), { name: 'text' })); i.note = line.slice(0, 140); });
      }
      // "I sent it" with no file in this message: a claim, not an arrival.
      if (!atts.length && (SENT_CLAIM_HE.test(line) || SENT_CLAIM_EN.test(line)) && !NOT_YET.test(line)) {
        targets.filter((i) => i.status === 'missing' && i.type !== 'payment').forEach((i) => { change(i, 'claimed', 'client says it was sent, no file here'); i.status = 'claimed'; i.note = line.slice(0, 140); });
      }
    }
    req.items.forEach((i) => { if (isDone(i)) i.note = i.note === 'partial' ? null : i.note; });
    if (req.items.every(isDone)) { req.status = 'closed'; req.closedAt = now; out.closed = true; }
    return out;
  }

  // The person's own decisions on an item: confirm a "check", release one ("no longer needed"), or mark it received by hand.
  function decide(request, key, verdict, now) {
    const req = JSON.parse(JSON.stringify(request));
    const it = req.items.find((i) => i.key === key);
    if (!it) return req;
    const t = typeof now === 'number' ? now : Date.now();
    if (verdict === 'confirm' && it.status === 'check') { it.status = 'received'; if (it.months) it.got = it.months.slice(); it.note = 'confirmed by you'; }
    else if (verdict === 'reject' && it.status === 'check') { it.status = 'missing'; it.proof = []; it.got = []; it.note = 'the file was not it'; }
    else if (verdict === 'release') { it.status = 'released'; it.note = 'no longer needed'; }
    else if (verdict === 'received') { it.status = 'received'; if (it.months) it.got = it.months.slice(); it.proof.push({ system: 'person', externalId: 'manual', fetchedBack: false, verifiedAt: t, name: null }); it.note = 'marked by you'; }
    else if (verdict === 'reopen') { it.status = 'missing'; it.note = null; }
    if (req.items.every(isDone)) { req.status = 'closed'; req.closedAt = t; } else if (req.status === 'closed') { req.status = 'open'; req.closedAt = null; }
    return req;
  }

  // ---- labels and the reminder --------------------------------------------------------------------------------------
  const MONTH_NAME_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function periodText(months, year, lang) {
    if (months && months.length) {
      const [y1, m1] = months[0].split('-').map(Number), [y2, m2] = months[months.length - 1].split('-').map(Number);
      const name = (m) => (lang === 'he' ? MONTHS_HE[m - 1] : MONTH_NAME_EN[m - 1]);
      if (months.length === 1) return (lang === 'he' ? 'ל' : 'for ') + name(m1) + ' ' + y1;
      if (y1 === y2) return (lang === 'he' ? 'ל' : 'for ') + name(m1) + '–' + name(m2) + ' ' + y2;
      return (lang === 'he' ? 'ל' : 'for ') + name(m1) + ' ' + y1 + '–' + name(m2) + ' ' + y2;
    }
    if (year) return (lang === 'he' ? 'לשנת ' : 'for ') + year;
    return '';
  }
  function labelOf(item, lang) {
    const l = lang === 'en' ? 'en' : 'he';
    const months = item.months ? (needMonths(item).length ? needMonths(item) : item.months) : null;
    const base = item.type === 'payment' && item.amount && item.amount.raw ? (l === 'he' ? 'התשלום על ' : 'the payment of ') + item.amount.raw : item.label[l];
    const per = periodText(months, item.year, l);
    return per ? base + ' ' + per : base;
  }
  function missingItems(req) { return req.items.filter((i) => i.status === 'missing' || i.status === 'claimed' || i.status === 'check'); }
  function receivedItems(req) { return req.items.filter((i) => i.status === 'received' || i.status === 'none'); }
  function dayText(iso, lang) {
    if (!iso) return '';
    const d = new Date(iso + 'T12:00:00');
    const he = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
    const en = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return lang === 'he' ? 'יום ' + he[d.getDay()] + ', ' + d.getDate() + '.' + (d.getMonth() + 1) : en[d.getDay()] + ', ' + MONTH_NAME_EN[d.getMonth()] + ' ' + d.getDate();
  }

  // The reminder the person sends (Glance never sends it). Lists ONLY what is still missing, thanks for what arrived.
  // opts: { level (1..3), lang, senderName, dueIso }
  function reminderDraft(request, opts) {
    const o = opts || {};
    const lang = o.lang || request.lang || 'he';
    const level = Math.max(1, Math.min(3, o.level || (request.nudges || 0) + 1));
    const miss = missingItems(request);
    if (!miss.length) return null;
    const got = receivedItems(request).filter((i) => i.status === 'received');
    const name = request.client && request.client.name ? (String(request.client.name).replace(/\([^)]*\)/g, ' ').split(/\s+/).map((w) => w.replace(/[^\p{L}'"-]/gu, '')).filter(Boolean)[0] || '') : '';
    const due = o.dueIso || request.deadlineIso;
    const list = miss.map((i) => '• ' + labelOf(i, lang) + (i.status === 'claimed' ? (lang === 'he' ? ' (כתבת ששלחת, אבל לא קיבלנו קובץ)' : ' (you mentioned sending it, but no file reached us)') : '')).join('\n');
    if (o.voice === 'me') return personalReminder({ name, got, list, due, level, lang, one: miss.length === 1, senderName: o.senderName });
    if (lang === 'he') {
      const hi = name ? 'שלום ' + name + ',' : 'שלום,';
      const thanks = got.length ? '\n\nתודה, קיבלנו: ' + got.map((i) => labelOf(i, 'he')).join(', ') + '.' : '';
      const ask = level === 1 ? 'תזכורת קטנה: עדיין חסרים לנו' : level === 2 ? 'אנחנו עדיין ממתינים ל' : 'כדי שנוכל להשלים את העבודה בזמן, חסרים לנו עדיין';
      const by = due ? (level === 3 ? '\n\nנצטרך אותם לכל המאוחר עד ' + dayText(due, 'he') + '.' : '\n\nנודה אם תשלח/י עד ' + dayText(due, 'he') + '.') : (level === 3 ? '\n\nנודה אם תשלח/י עוד היום, או תכתוב/תכתבי לנו מתי יגיעו.' : '');
      return hi + thanks + '\n\n' + ask + ':\n' + list + by + '\n\nאם כבר שלחת, אפשר להתעלם מההודעה.\n\nתודה' + (o.senderName ? ',\n' + o.senderName : ',');
    }
    const hi = name ? 'Hi ' + name + ',' : 'Hi,';
    const thanks = got.length ? '\n\nThank you, we received: ' + got.map((i) => labelOf(i, 'en')).join(', ') + '.' : '';
    const ask = level === 1 ? 'A quick reminder: we are still missing' : level === 2 ? 'We are still waiting for' : 'To finish the work on time, we still need';
    const by = due ? (level === 3 ? '\n\nWe need them by ' + dayText(due, 'en') + ' at the latest.' : '\n\nCould you send them by ' + dayText(due, 'en') + '?') : (level === 3 ? '\n\nPlease send them today, or tell us when they will arrive.' : '');
    return hi + thanks + '\n\n' + ask + ':\n' + list + by + '\n\nIf you already sent them, please ignore this note.\n\nThanks' + (o.senderName ? ',\n' + o.senderName : ',');
  }
  // The same reminder in one person's voice (the general follow loop): "I", not "we".
  function personalReminder(a) {
    const he = a.lang === 'he';
    const sign = a.senderName ? ',\n' + a.senderName : ',';
    if (he) {
      const hi = a.name ? 'היי ' + a.name + ',' : 'היי,';
      const thanks = a.got.length ? '\n\nתודה, קיבלתי: ' + a.got.map((i) => labelOf(i, 'he')).join(', ') + '.' : '';
      const ask = a.level === 1 ? 'תזכורת קטנה, עדיין חסר לי' : a.level === 2 ? 'אני עדיין מחכה ל' : 'כדי שאוכל להתקדם, עדיין חסר לי';
      const by = a.due ? (a.level === 3 ? '\n\nזה נחוץ לי עד ' + dayText(a.due, 'he') + ' לכל המאוחר.' : '\n\nאשמח לקבל עד ' + dayText(a.due, 'he') + '.') : (a.level === 3 ? '\n\nאשמח לקבל עוד היום, או לדעת מתי זה יגיע.' : '');
      return hi + thanks + '\n\n' + ask + ':\n' + a.list + by + '\n\nאם כבר שלחת, אפשר להתעלם.\n\nתודה' + sign;
    }
    const hi = a.name ? 'Hi ' + a.name + ',' : 'Hi,';
    const it = a.one ? 'it' : 'them';
    const thanks = a.got.length ? '\n\nThanks, I received: ' + a.got.map((i) => labelOf(i, 'en')).join(', ') + '.' : '';
    const ask = a.level === 1 ? "A quick reminder, I'm still missing" : a.level === 2 ? "I'm still waiting for" : 'So I can move forward, I still need';
    const by = a.due ? (a.level === 3 ? '\n\nI need ' + it + ' by ' + dayText(a.due, 'en') + ' at the latest.' : '\n\nCould you send ' + it + ' by ' + dayText(a.due, 'en') + '?') : (a.level === 3 ? '\n\nCould you send ' + it + ' today, or let me know when ' + (a.one ? 'it' : 'they') + ' will arrive?' : '');
    return hi + thanks + '\n\n' + ask + ':\n' + a.list + by + '\n\nIf you already sent ' + it + ', please ignore this.\n\nThanks' + sign;
  }
  function reminderSubject(request, lang) {
    const l = lang || request.lang || 'he';
    return l === 'he' ? 'תזכורת: מסמכים שחסרים לנו' : 'Reminder: documents we are still missing';
  }
  // After the person sent a reminder: the next chase is further out, and firmer.
  function recordNudge(request, now) {
    const req = JSON.parse(JSON.stringify(request));
    const t = typeof now === 'number' ? now : Date.now();
    req.nudges = (req.nudges || 0) + 1;
    req.nudgedAt = t;
    req.chaseIso = addBusinessDays(t, req.nudges >= 2 ? 2 : 3);
    return req;
  }
  function isDue(request, now) { return request.status === 'open' && missingItems(request).length > 0 && request.chaseIso <= isoDay(now); }

  // ---- recurring checklists (a firm's monthly and yearly rhythm) ------------------------------------------------------
  //   periodRule: 'prev-month' | 'prev-2-months' | 'prev-year' | null
  const PRESETS = {
    'vat-bimonthly': { he: 'דיווח מע"מ דו-חודשי', en: 'Bi-monthly VAT', day: 1, every: 2, items: [{ type: 'invoices', periodRule: 'prev-2-months' }, { type: 'receipts', periodRule: 'prev-2-months' }, { type: 'bank-statement', periodRule: 'prev-2-months' }, { type: 'credit-card', periodRule: 'prev-2-months' }] },
    'bookkeeping-monthly': { he: 'הנהלת חשבונות חודשית', en: 'Monthly bookkeeping', day: 1, every: 1, items: [{ type: 'invoices', periodRule: 'prev-month' }, { type: 'receipts', periodRule: 'prev-month' }, { type: 'bank-statement', periodRule: 'prev-month' }, { type: 'credit-card', periodRule: 'prev-month' }] },
    'payroll-monthly': { he: 'שכר חודשי', en: 'Monthly payroll', day: 1, every: 1, items: [{ type: 'payslips', periodRule: 'prev-month' }] },
    'annual-report': { he: 'דוח שנתי', en: 'Annual tax report', day: 1, every: 12, month: 2, items: [{ type: 'form-106', periodRule: 'prev-year' }, { type: 'form-867', periodRule: 'prev-year' }, { type: 'annual-savings', periodRule: 'prev-year' }] },
    'legal-onboarding': { he: 'פתיחת תיק', en: 'New client file', day: null, every: 0, items: [{ type: 'id-copy' }, { type: 'power-of-attorney' }, { type: 'fee-agreement' }] }
  };
  function periodFor(rule, now) {
    const d = nowDate(now);
    const prev = (k) => { const x = new Date(d.getFullYear(), d.getMonth() - k, 1); return ym(x.getFullYear(), x.getMonth() + 1); };
    if (rule === 'prev-month') return { months: [prev(1)] };
    if (rule === 'prev-2-months') return { months: [prev(2), prev(1)] };
    if (rule === 'prev-year') return { year: d.getFullYear() - 1 };
    return null;
  }
  // template: { id, preset?, items?:[{type, periodRule}], client:{email,name}, lang, day, every, month? }
  function instantiate(template, now) {
    const p = template.preset ? PRESETS[template.preset] : null;
    const defs = template.items || (p ? p.items : []);
    const items = defs.map((d) => itemFor(d.type, periodFor(d.periodRule, now)));
    const ask = { items, deadlineIso: template.dueInDays ? addBusinessDays(typeof now === 'number' ? now : Date.now(), template.dueInDays) : null, lang: template.lang || 'he' };
    const t = typeof now === 'number' ? now : Date.now();
    return buildRequest({ threadId: 'tpl:' + template.id + ':' + (items[0] ? items[0].key : isoDay(t)), client: template.client, ask, now: t, template: template.id });
  }
  // Which templates should open a request today? One per period: a template that already opened this period stays quiet.
  function dueTemplates(templates, requests, now) {
    const d = nowDate(now);
    return (templates || []).filter((tpl) => {
      const p = tpl.preset ? PRESETS[tpl.preset] : null;
      const day = tpl.day != null ? tpl.day : p ? p.day : null;
      const every = tpl.every != null ? tpl.every : p ? p.every : 0;
      if (!day || !every) return false;
      if (d.getDate() < day) return false;
      if (every === 2 && (d.getMonth() + 1) % 2 === 0) return false;           // bi-monthly VAT opens in odd months for the two months before
      const month = tpl.month != null ? tpl.month : p ? p.month : null;
      if (every === 12 && month && d.getMonth() + 1 < month) return false;
      const probe = instantiate(tpl, d.getTime());
      return !(requests || []).some((r) => r.id === probe.id);
    });
  }

  // ---- the board: what is missing from whom -----------------------------------------------------------------------
  function board(requests, now) {
    const today = isoDay(now);
    const byClient = {};
    for (const r of requests || []) {
      if (r.status !== 'open') continue;
      const miss = missingItems(r);
      if (!miss.length) continue;
      const k = r.client.email || r.client.name || r.id;
      const row = byClient[k] || (byClient[k] = { client: r.client, requests: 0, missing: 0, check: 0, claimed: 0, overdue: false, deadlineIso: null, nextChaseIso: null, items: [] });
      row.requests++;
      miss.forEach((i) => { row.items.push({ requestId: r.id, key: i.key, label: labelOf(i, r.lang), status: i.status }); if (i.status === 'check') row.check++; else if (i.status === 'claimed') row.claimed++; else row.missing++; });
      if (r.deadlineIso && (!row.deadlineIso || r.deadlineIso < row.deadlineIso)) row.deadlineIso = r.deadlineIso;
      if (!row.nextChaseIso || r.chaseIso < row.nextChaseIso) row.nextChaseIso = r.chaseIso;
      if ((r.deadlineIso && r.deadlineIso < today) || r.chaseIso <= today) row.overdue = true;
    }
    const rows = Object.values(byClient).sort((a, b) => (b.overdue - a.overdue) || String(a.deadlineIso || '9999').localeCompare(String(b.deadlineIso || '9999')) || b.missing - a.missing);
    return {
      rows,
      totals: { clients: rows.length, missing: rows.reduce((s, r) => s + r.missing, 0), check: rows.reduce((s, r) => s + r.check, 0), overdue: rows.filter((r) => r.overdue).length }
    };
  }

  return {
    DOC_TYPES, PRESETS, classifyOutgoingRequest, parsePeriod, buildRequest, applyArrival, decide, reminderDraft, reminderSubject, recordNudge, isDue,
    instantiate, dueTemplates, board, labelOf, missingItems, isDone, typeOfName, addBusinessDays, isoDay
  };
})();

if (typeof module !== 'undefined') module.exports = { FlowClientRequests };
