// Full-document close (D1 part 1, Gmail + Google Docs): when the mail asks
// for a document, Glance prepares one Google Doc. A quote keeps the original
// shape. Any other asked or implied document (agreement, meeting summary,
// work plan, letter, report, proposal, spec, form, or a plain document)
// gets its own sections, with a placeholder where the mail is silent.
// Before that offer, an existing Glance Doc, a matching attachment, or a
// visible draft can open or update instead of creating another file.
// Preview with one click; never auto-sent. No invented prices.
// Portable: no chrome.*, no DOM, no network.
const FlowFullDocumentClose = (() => {
  const SWITCH = 'FULL_DOCUMENT_CLOSE';
  const CONNECTOR = 'googleDocFull';
  const PLACE = {
    he: { party: '[לא צוין לקוח]', amount: '[לא צוין מחיר]', title: '[לא צוינה כותרת]' },
    en: { party: '[client not given]', amount: '[price not given]', title: '[title not given]' }
  };
  const PRICE_PLACEHOLDER = PLACE.he.amount;
  const TITLE_PLACEHOLDER = PLACE.he.title;

  const ASK_EN = /\b(?:send|prepare|draft|write|put together|share)\b.{0,40}\b(?:the\s+)?(?:quote|quotation|proposal|contract|agreement|sow|statement of work)\b/i;
  const ASK_HE = /(?:שלח|שלחי|הכן|הכיני|תכין|תכיני|להכין|נא\s+להכין).{0,40}(?:הצעת\s*מחיר|הצעה|חוזה|הסכם)|(?:אפשר\s+לקבל|(?<!לא\s)לקבל|בקשה\s+ל)\s*הצעת\s*מחיר/u;
  const PARTY_PLACEHOLDER = PLACE.he.party;

  function placeholdersFor(lang) {
    return PLACE[lang === 'he' ? 'he' : 'en'];
  }

  function langOf(text, lang) {
    if (lang === 'he' || lang === 'en') return lang;
    return /[\u0590-\u05FF]/.test(String(text || '')) ? 'he' : 'en';
  }

  function isPlaceholder(value) {
    return /^\s*\[[^\]]+\]\s*$/.test(String(value || ''));
  }

  function splitItems(raw) {
    return String(raw || '')
      .split(/\s*,\s*|\s+and\s+|\s+ו/)
      .map((part) => part.replace(/^ו/, '').trim())
      .filter((part) => part.length >= 2 && part.length <= 80);
  }

  // Gmail's text/plain part wraps mid-list ("קשר\r\nובלוג"); treat those
  // breaks as spaces so the list stays one phrase.
  function flattenMail(text) {
    return String(text || '').replace(/\r\n?/g, '\n').replace(/[\n\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // Comma lists in the ask, e.g. "5 עמודים, טופס יצירת קשר ובלוג".
  // Start after a sentence or a colon so a dated subject like "14/11" cannot
  // begin the list, and a live body like "לעסק: 5 עמודים, ..." is not missed.
  function itemsFrom(text) {
    const t = flattenMail(text);
    const he = t.match(/(?:^|[.!?:;…]\s+)(\d+\s+[\u0590-\u05FF][^.,]{1,80},\s*[^.,]{2,80}(?:،\s*[^.,]{2,80}|,\s*[^.,]{2,80}|\s+ו[^.,]{2,80})*)/);
    if (he) return splitItems(he[1]);
    const en = t.match(/(?:^|[.!?:;…]\s+)(\d+\s+\w[^.,]{1,80}(?:,\s*[^.,]{2,80}|\s+and\s+[^.,]{2,80})+)/);
    if (en) return splitItems(en[1]);
    return [];
  }

  // Strip a trailing calendar date, optional time, and an optional Hebrew
  // weekday letter: "14/11", "14/11 ב", "14/11 20:25".
  function cleanTitle(value) {
    return String(value || '')
      .replace(/\s+\d{1,2}\/\d{1,2}(?:\/\d{2,4})?(?:\s+\d{1,2}:\d{2})?(?:\s+[א-ת])?\s*$/u, '')
      .trim();
  }

  function quoteTitleFrom(text) {
    const t = flattenMail(text);
    const quoted = t.match(/(?:titled|called|named)\s+[“"']?([^”"'\n]{3,80})[”"']?/i) || t.match(/[“"]([^”"\n]{3,80})[”"]/);
    if (quoted) return cleanTitle(quoted[1]);
    // לבניית / לבנית / לבנות — [ית] is one character and misses "לבניית".
    const build = t.match(/לבני(?:י?ת|ות)\s+([^.,:;\n]{3,80})/);
    if (build) return cleanTitle(build[1]);
    const forSite = t.match(/הצעת\s*מחיר\s+ל(?!בני)([^.,:;\n]{3,80})/);
    if (forSite) return cleanTitle(forSite[1]);
    return '';
  }

  function enrichFromMail(close, text) {
    const filled = Object.assign({}, (close && close.filled) || {});
    if (!filled.title || isPlaceholder(filled.title)) {
      const title = quoteTitleFrom(text);
      if (title) filled.title = title;
    }
    const items = itemsFrom(text);
    if (items.length) filled.items = items;
    return Object.assign({}, close, { filled: filled });
  }

  function fieldLabels(lang) {
    if (lang === 'he') return { party: 'לקוח', amount: 'מחיר', title: 'כותרת', items: 'העבודה' };
    return { party: 'Client', amount: 'Price', title: 'Title', items: 'Work' };
  }
  const CREATE_ONLY = /\bcreate\s+(?:a\s+)?(?:shared\s+)?(?:doc|document|sheet|spreadsheet|deck|slides?)\b/i;
  const ASK_CONTENT_IN_MAIL = /\b(?:write|summarize|draft)\b.{0,30}\b(?:in the (?:email|mail)|one-?page summary)\b/i;

  function sibling(file, exportName) {
    const g = typeof globalThis !== 'undefined' ? globalThis : {};
    if (g[exportName]) return g[exportName];
    try {
      return typeof require !== 'undefined' ? require(file)[exportName] : null;
    } catch (e) { return null; }
  }

  function Closes() {
    return sibling('./google-closes.js', 'FlowGoogleCloses');
  }

  function Style() {
    return sibling('./style-profile.js', 'FlowStyle');
  }

  function enabled(flags) {
    return !!(flags && flags[SWITCH] === true);
  }

  function extractAmount(text) {
    const E = sibling('./extract.js', 'FlowExtract');
    if (E && typeof E.facts === 'function') {
      try {
        const facts = E.facts(String(text || ''));
        if (facts && facts.moneyText) return facts.moneyText;
      } catch (e) { /* fall through */ }
    }
    const m = String(text || '').match(/(?:\$|₪|€)\s*[\d,.]+(?:\.\d{2})?|[\d,.]+\s*(?:USD|ILS|EUR|ש[\"״']?ח)/i);
    return m ? m[0].trim() : null;
  }

  function recognize(text) {
    const t = String(text || '').trim();
    if (!t) return { kind: 'empty' };
    if (CREATE_ONLY.test(t) || ASK_CONTENT_IN_MAIL.test(t)) return { kind: 'silence', reason: 'wrong-shape' };
    if (ASK_EN.test(t) || ASK_HE.test(t)) return { kind: 'clear' };
    return { kind: 'silence', reason: 'no-ask' };
  }

  function amountInText(text) {
    const s = String(text || '');
    return /\$[\d,.]+(?:\.\d{2})?/.test(s) || /₪[\d,.]+/.test(s) || /€[\d,.]+/.test(s) || /[\d,.]+\s*(?:USD|ILS|EUR)\b/i.test(s);
  }

  function amountVerbatimInSource(sourceText, amountVal) {
    const s = String(sourceText || '');
    const a = String(amountVal || '').trim();
    if (!a) return false;
    return s.indexOf(a) !== -1;
  }

  function stripInventedAmounts(close, sourceText) {
    if (!close || !close.filled) return close;
    const filled = Object.assign({}, close.filled);
    if (filled.amount && !amountVerbatimInSource(sourceText, filled.amount)) delete filled.amount;
    return Object.assign({}, close, { filled: filled });
  }

  function ensurePricePlaceholder(close, sourceText, lang) {
    if (!close) return close;
    const slots = close.slots || [];
    const needsAmount = slots.indexOf('amount') !== -1 || close.artifact === 'quote';
    if (!needsAmount) return close;
    const ph = placeholdersFor(langOf(sourceText, lang)).amount;
    const filled = Object.assign({}, close.filled || {});
    if (!filled.amount) filled.amount = ph;
    else if (!amountVerbatimInSource(sourceText, filled.amount) && filled.amount !== ph) {
      filled.amount = ph;
    }
    return Object.assign({}, close, { filled: filled });
  }

  function ensureTitlePlaceholder(close, lang, sourceText) {
    if (!close) return close;
    const slots = close.slots || [];
    if (slots.indexOf('title') === -1) return close;
    const ph = placeholdersFor(langOf(sourceText, lang)).title;
    const filled = Object.assign({}, close.filled || {});
    if (!filled.title) filled.title = ph;
    const missing = (close.missing || []).filter((name) => name !== 'title' && name !== 'amount' && !filled[name]);
    return Object.assign({}, close, { filled: filled, missing: missing });
  }

  function ensurePartyPlaceholder(close, lang, sourceText) {
    if (!close) return close;
    const slots = close.slots || [];
    if (slots.indexOf('party') === -1) return close;
    const filled = Object.assign({}, close.filled || {});
    if (filled.party) return close;
    filled.party = placeholdersFor(langOf(sourceText, lang)).party;
    const missing = (close.missing || []).filter((name) => name !== 'party' && !filled[name]);
    return Object.assign({}, close, { filled: filled, missing: missing });
  }

  function fallbackQuoteTemplate(text, lang) {
    if (!/(?:הצעת\s*מחיר|\b(?:quote|quotation)\b)/i.test(String(text || ''))) return null;
    return {
      artifact: 'quote',
      kind: 'doc',
      name: lang === 'he' ? 'הצעת מחיר' : 'Quote',
      slots: ['party', 'amount', 'title']
    };
  }

  function applyPreviewPlaceholders(close, sourceText, lang) {
    const useLang = langOf(sourceText, lang);
    let c = stripInventedAmounts(close, sourceText);
    c = enrichFromMail(c, sourceText);
    c = ensurePartyPlaceholder(c, useLang, sourceText);
    c = ensurePricePlaceholder(c, sourceText, useLang);
    c = ensureTitlePlaceholder(c, useLang, sourceText);
    const filled = c.filled || {};
    const missing = (c.missing || []).filter((name) => !filled[name]);
    return Object.assign({}, c, { missing: missing });
  }

  function greetingLine(styleSummary, lang, partyName) {
    const S = Style();
    if (!S || !styleSummary) return lang === 'he' ? 'שלום,' : 'Hi,';
    if (lang === 'he') {
      if (styleSummary.greeting === 'hi-name' && partyName) return 'היי ' + partyName + ',';
      if (styleSummary.greeting === 'shalom-name' && partyName) return 'שלום ' + partyName + ',';
      return 'שלום,';
    }
    if (styleSummary.greeting === 'dear-name' && partyName) return 'Dear ' + partyName + ',';
    if (styleSummary.greeting === 'hi-name' && partyName) return 'Hi ' + partyName + ',';
    if (styleSummary.greeting === 'hello-name' && partyName) return 'Hello ' + partyName + ',';
    return 'Hi,';
  }

  // The Hebrew close is the word בברכה, with the bet. A cue strip that drops a
  // leading ב (the same letter as the preposition) turns it into ברכה. Keys
  // come from FlowStyle (bekavod, not a misspelled bekvod). A missing key,
  // "none", or a value that is already the stripped word stays the exact line.
  function signoffLine(styleSummary, lang) {
    const he = lang === 'he';
    const fallback = he ? 'בברכה,' : 'Best,';
    const S = Style();
    const key = styleSummary && styleSummary.signoff;
    if (!S || !key || key === 'none') return fallback;
    const fromStyle = S.SIGN_TEXT && S.SIGN_TEXT[he ? 'he' : 'en'] && S.SIGN_TEXT[he ? 'he' : 'en'][key];
    const line = fromStyle || fallback;
    if (he && (line === 'ברכה,' || line === 'ברכה')) return 'בברכה,';
    return line;
  }

  function composeHtml(close, opts) {
    if (!close) return { blank: true };
    const lang = (opts && opts.lang === 'he') ? 'he' : 'en';
    const ph = placeholdersFor(lang);
    const labels = fieldLabels(lang);
    const filled = (close && close.filled) || {};
    const styleSummary = (opts && opts.styleSummary) || null;
    const partyVal = String(filled.party || '').trim();
    const partyIsReal = partyVal && !isPlaceholder(partyVal);
    const open = greetingLine(styleSummary, lang, partyIsReal ? partyVal : '');
    const closeLine = signoffLine(styleSummary, lang);
    const party = partyVal || ph.party;
    const amount = String(filled.amount || '').trim() || ph.amount;
    const title = String(filled.title || '').trim() || ph.title;
    const items = Array.isArray(filled.items) ? filled.items.map((item) => String(item || '').trim()).filter(Boolean) : [];
    const docName = (close.template && close.template.name) || (lang === 'he' ? 'הצעת מחיר' : 'Quote');
    const heading = title && !isPlaceholder(title) ? docName + ' — ' + title : docName;
    let html = '';
    if (close.template && close.template.logo) html += '<p>' + escapeHtml('[' + close.template.logo + ']') + '</p>';
    if (close.template && close.template.intro) html += '<p>' + escapeHtml(close.template.intro) + '</p>';
    html += '<h1>' + escapeHtml(heading) + '</h1>';
    html += '<p>' + escapeHtml(open) + '</p>';
    html += '<p><strong>' + escapeHtml(labels.party) + ':</strong> ' + escapeHtml(party) + '</p>';
    if (items.length) {
      html += '<p><strong>' + escapeHtml(labels.items) + ':</strong></p><ul>';
      items.forEach((item) => { html += '<li>' + escapeHtml(item) + '</li>'; });
      html += '</ul>';
    }
    html += '<p><strong>' + escapeHtml(labels.amount) + ':</strong> ' + escapeHtml(amount) + '</p>';
    html += '<p>' + escapeHtml(closeLine) + '</p>';
    return { html: html, title: docName, previewOnly: true, closes: false };
  }

  function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Every document this lane can fill. Quote stays on composeHtml.
  // keys are matched against a filename or a draft subject, in either language.
  const DOC_TYPES = {
    quote: { he: 'הצעת מחיר', en: 'Quote', keys: ['הצעת מחיר', 'quote', 'quotation'] },
    agreement: { he: 'הסכם', en: 'Agreement', keys: ['הסכם', 'חוזה', 'contract', 'agreement'] },
    'meeting-summary': { he: 'סיכום פגישה', en: 'Meeting summary', keys: ['סיכום פגישה', 'פרוטוקול', 'meeting summary', 'meeting minutes', 'protocol'] },
    'work-plan': { he: 'תוכנית עבודה', en: 'Work plan', keys: ['תוכנית עבודה', 'תכנית עבודה', 'work plan'] },
    spec: { he: 'אפיון', en: 'Spec', keys: ['אפיון', 'spec', 'specification', 'statement of work', 'sow'] },
    letter: { he: 'מכתב', en: 'Letter', keys: ['מכתב', 'letter'] },
    report: { he: 'דוח', en: 'Report', keys: ['דוח', 'דו"ח', 'דו״ח', 'report'] },
    proposal: { he: 'הצעה', en: 'Proposal', keys: ['הצעה', 'proposal'] },
    form: { he: 'טופס', en: 'Form', keys: ['טופס', 'form'] },
    document: { he: 'מסמך', en: 'Document', keys: ['מסמך', 'document'] }
  };
  const TYPE_ORDER = ['quote', 'agreement', 'meeting-summary', 'work-plan', 'spec', 'letter', 'report', 'proposal', 'form', 'document'];
  const TYPE_RE = {
    quote: /הצעת\s*מחיר|\b(?:quote|quotation)\b/i,
    agreement: /הסכם|חוזה|\b(?:contract|agreement)\b/i,
    'meeting-summary': /סיכום\s*פגישה|פרוטוקול|\bmeeting\s+(?:summary|minutes|notes)\b|\bprotocol\b/i,
    'work-plan': /תוכנית\s*עבודה|תכנית\s*עבודה|\bwork\s*plan\b/i,
    spec: /אפיון|\b(?:specification|spec)\b|\bstatement\s+of\s+work\b|\bsow\b/i,
    letter: /מכתב|\bletter\b/i,
    report: /דו["״']?ח|\breport\b/i,
    proposal: /הצעה(?!ת)|\bproposal\b/i,
    form: /טופס|\b(?:a|the|this)\s+form\b/i,
    document: /מסמך|\bdocument\b/i
  };
  const CREATE_VERB = /(?:הכן|הכיני|תכין|תכיני|להכין|לנסח|תנסח|נסח|לכתוב|תכתוב|תכתבי|טיוטת|טיוטה|נשמח\s+לקבל|אפשר\s+לקבל|בקשה\s+ל|להפיק|תפיק)|(?:\b(?:prepare|draft|write|put\s+together|draw\s+up|compose)\b)/i;
  const FYI_RE = /\b(?:fyi|for your information|no action needed|no need to (?:reply|do anything))\b|(?:לידיעתך|לידיעה בלבד|אין צורך בפעולה|לתשומת לב)/i;
  const NEWS_RE = /unsubscribe|view this email in your browser|להסרה|רשימת התפוצה|ניוזלטר|\bnewsletter\b/i;

  function typeSpec(type) {
    return DOC_TYPES[type] || DOC_TYPES.document;
  }

  function splitSubject(text) {
    const flat = flattenMail(text);
    const m = flat.match(/^(.{2,180}?)\.\s+/);
    if (!m) return { subject: '', body: flat, flat: flat };
    return { subject: m[1].trim(), body: flat.slice(m[0].length).trim(), flat: flat };
  }

  function courtesyOnly(text) {
    return /^(?:thanks|thank you|תודה|לידיעתך|לידיעה|fyi|for your information)[.!\s,]*$/i.test(String(text || '').trim());
  }

  function matchIndex(flat, type) {
    const re = TYPE_RE[type];
    if (!re) return -1;
    const m = re.exec(String(flat || ''));
    return m ? m.index : -1;
  }

  // The type the verb is asking for: the nearest specific keyword after
  // the verb. "טופס" later in a quote's item list is not a second ask.
  // A plain "מסמך" yields to a specific type in the same breath.
  function typeAfterVerb(after) {
    let best = null;
    let bestAt = 80;
    TYPE_ORDER.forEach((type) => {
      if (type === 'document') return;
      const at = after.search(TYPE_RE[type]);
      if (at >= 0 && at < bestAt) { bestAt = at; best = type; }
    });
    if (best) return best;
    const docAt = after.search(TYPE_RE.document);
    if (docAt >= 0 && docAt < 40) return 'document';
    return null;
  }

  function askedTypes(flat) {
    const out = [];
    const re = new RegExp(CREATE_VERB.source, 'gi');
    let m;
    while ((m = re.exec(flat))) {
      const type = typeAfterVerb(flat.slice(m.index, m.index + 90));
      if (type && out.indexOf(type) < 0) out.push(type);
      if (m.index === re.lastIndex) re.lastIndex += 1;
    }
    return out;
  }

  function isAsked(flat, type) {
    return askedTypes(flat).indexOf(type) >= 0;
  }

  // The document the mail asks for, or the one its subject names.
  // A bracket tag such as [G-Quote] is not the document.
  // FYI and newsletters name a document without asking for one.
  function classifyDocument(text) {
    const parts = splitSubject(text);
    const flat = parts.flat.replace(/\[[^\]]*\]/g, ' ');
    const subject = parts.subject.replace(/\[[^\]]*\]/g, ' ');
    if (!flat.trim()) return null;
    if (CREATE_ONLY.test(flat) || ASK_CONTENT_IN_MAIL.test(flat)) return null;
    const asked = askedTypes(flat);
    if (!asked.length && (FYI_RE.test(flat) || NEWS_RE.test(flat) || courtesyOnly(parts.body || flat))) return null;
    if (asked.length) return asked[0];
    if (!subject || courtesyOnly(parts.body)) return null;
    const named = TYPE_ORDER.filter((type) => subject.search(TYPE_RE[type]) >= 0);
    const specific = named.filter((type) => type !== 'document');
    return (specific.length ? specific : named)[0] || null;
  }

  function isQuoteMail(text) {
    return /(?:הצעת\s*מחיר|\b(?:quote|quotation)\b)/i.test(String(text || ''));
  }

  function titleKeyOf(heading) {
    return String(heading || '').replace(/[\u200B-\u200F\u202A-\u202E]/g, '').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 60);
  }

  function topicFrom(subject, type) {
    let s = cleanTitle(String(subject || '').replace(/^\[[^\]]+\]\s*/, ''));
    const spec = typeSpec(type);
    (spec.keys || []).forEach((key) => {
      if (!key) return;
      s = s.replace(new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), ' ');
    });
    s = s.replace(/^[\s—\-:]+|[\s—\-:]+$/g, '').replace(/\s+/g, ' ').trim();
    s = s.replace(/^ל(?=[\u0590-\u05FF])/u, '');
    if (s.length < 2 || s.length > 80) return '';
    return s;
  }

  function listAfter(text, label) {
    const m = String(text || '').match(new RegExp(label + '\\s*[:：]\\s*([^\\n.]{2,180})'));
    if (!m) return [];
    return splitItems(m[1]);
  }

  function phraseAfter(text, label) {
    const m = String(text || '').match(new RegExp(label + '\\s*[:：]\\s*([^\\n.]{2,180})'));
    return m ? m[1].trim() : '';
  }

  // Whole cue words only. A single leading ב is the start of בברכה, not a prefix.
  function stripCuePrefix(value) {
    let s = String(value || '').trim();
    let prev = '';
    while (s && s !== prev) {
      prev = s;
      s = s.replace(/^(?:הוחלט|החלטות|משימות|משימה|לביצוע)\s*[:：]?\s*/u, '').trim();
    }
    return s;
  }

  function peopleFrom(text) {
    const m = String(text || '').match(/(?:השתתפו|משתתפים|נכחו|נוכחים)\s*[:：]?\s*([^\n.]{2,180})/u);
    if (!m) return [];
    return splitItems(m[1]).map(stripCuePrefix).filter((name) => name && !/^(?:השתתפו|משתתפים|נכחו|נוכחים)$/.test(name));
  }

  function cueList(text, pattern, keepCue) {
    const out = [];
    const re = new RegExp('(' + pattern + ')\\s*[:：]?\\s*([^\\n.]{2,160})', 'g');
    let m;
    while ((m = re.exec(String(text || '')))) {
      let value = stripCuePrefix(m[2]);
      if (keepCue && m[1] === keepCue) value = (keepCue + ' ' + value).trim();
      if (value) out.push(value);
    }
    return out;
  }

  function addressFrom(text) {
    const m = String(text || '').match(/(?:רחוב|רח['׳])\s+[\u0590-\u05FF]{2,20}(?:\s+[\u0590-\u05FF]{2,20})?\s+\d{1,4}(?:\s+[\u0590-\u05FF]{2,20}(?:\s+[\u0590-\u05FF]{2,20})?)?/u);
    return m ? m[0].replace(/\s+/g, ' ').trim() : '';
  }

  function termFrom(text) {
    const labeled = phraseAfter(text, '(?:תקופה|תוקף)');
    if (labeled) return stripCuePrefix(labeled);
    const m = String(text || '').match(/(?:לשנתיים|לשנה|לחודשיים|לחודש|לשבועיים|לשבוע|ליומיים)\s+מ\s*[-–]?\s*\d{1,2}\/\d{1,2}\/\d{2,4}/);
    if (!m) return '';
    return m[0].replace(/\s+/g, ' ').replace(/מ\s*-\s*/, 'מ-').trim();
  }

  function amountClause(text) {
    const m = String(text || '').match(/[\d][\d,]*(?:\.\d+)?\s*(?:₪|ש["״׳']?ח)(?:\s+(?:לחודש|לשנה|לשעה))?(?:\s+(?:כולל|לא כולל)\s+מע["״׳']?מ)?/);
    return m ? m[0].replace(/\s+/g, ' ').trim() : '';
  }

  function richerAmount(labeled, clause) {
    const a = String(labeled || '').trim();
    const b = String(clause || '').trim();
    if (!a) return b;
    if (!b) return a;
    if (a.indexOf(b) >= 0) return a;
    if (b.indexOf(a) >= 0) return b;
    return a.length >= b.length ? a : b;
  }

  function placeholder(lang, label) {
    return lang === 'he' ? ('[להשלים: ' + label + ']') : ('[to fill in: ' + label + ']');
  }

  function sectionOf(id, he, en, value, items) {
    return { id: id, he: he, en: en, value: value || '', items: items || [] };
  }

  function fillSections(type, text, lang) {
    const t = flattenMail(text);
    const parts = splitSubject(text);
    const topic = topicFrom(parts.subject, type);
    if (type === 'agreement') {
      const between = t.match(/בין\s+([\u0590-\u05FF][\u0590-\u05FF\s]{1,40}?)\s+לבין\s+([\u0590-\u05FF][\u0590-\u05FF\s]{1,40})/u);
      const parties = between ? (between[1].trim() + ', ' + between[2].trim()) : '';
      const term = termFrom(t);
      const rent = phraseAfter(t, '(?:דמי שכירות|תנאים)');
      const terms = richerAmount(rent, amountClause(t));
      return {
        topic: topic,
        sections: [
          sectionOf('parties', 'צדדים', 'Parties', parties),
          sectionOf('subject', 'נושא', 'Subject', topic),
          sectionOf('property', 'כתובת', 'Address', addressFrom(t)),
          sectionOf('terms', 'תנאים', 'Terms', terms),
          sectionOf('term', 'תוקף', 'Term', term),
          sectionOf('signatures', 'חתימות', 'Signatures', '')
        ]
      };
    }
    if (type === 'meeting-summary') {
      return {
        topic: topic,
        sections: [
          sectionOf('attendees', 'משתתפים', 'Attendees', '', peopleFrom(t)),
          sectionOf('topics', 'נושאים', 'Topics', topic),
          sectionOf('decisions', 'החלטות', 'Decisions', '', cueList(t, 'החלטות|הוחלט|סוכם', 'סוכם')),
          sectionOf('actions', 'משימות להמשך', 'Follow-ups', '', cueList(t, 'משימות|משימה|לביצוע', ''))
        ]
      };
    }
    if (type === 'work-plan') {
      const steps = [];
      const re = /שלב\s+[א-ת0-9]+\s*[:：]\s*([^.\n]{2,60})/g;
      let m;
      while ((m = re.exec(t))) steps.push(m[1].trim());
      return {
        topic: topic,
        sections: [
          sectionOf('goal', 'מטרה', 'Goal', phraseAfter(t, 'מטרה')),
          sectionOf('steps', 'שלבים', 'Steps', '', steps),
          sectionOf('schedule', 'לוח זמנים', 'Schedule', phraseAfter(t, 'לוח זמנים')),
          sectionOf('owners', 'אחראים', 'Owners', phraseAfter(t, '(?:אחראית|אחראי|אחראים)'))
        ]
      };
    }
    if (type === 'letter') {
      const to = t.match(/מכתב\s+ל([\u0590-\u05FF]{2,20}(?:\s+[\u0590-\u05FF]{2,20})?)/u);
      const about = t.match(/על\s+([^.\n]{2,80})/);
      return {
        topic: topic,
        sections: [
          sectionOf('to', 'נמען', 'To', to ? to[1].trim() : ''),
          sectionOf('subject', 'נושא', 'Subject', topic),
          sectionOf('body', 'תוכן', 'Body', about ? about[1].trim() : ''),
          sectionOf('close', 'סיום', 'Closing', '')
        ]
      };
    }
    if (type === 'report') {
      return {
        topic: topic,
        sections: [
          sectionOf('background', 'רקע', 'Background', phraseAfter(t, 'רקע')),
          sectionOf('findings', 'ממצאים', 'Findings', phraseAfter(t, 'ממצאים')),
          sectionOf('conclusions', 'מסקנות', 'Conclusions', phraseAfter(t, '(?:מסקנה|מסקנות)')),
          sectionOf('recommendations', 'המלצות', 'Recommendations', phraseAfter(t, '(?:המלצה|המלצות)'))
        ]
      };
    }
    if (type === 'proposal') {
      const withWhom = t.match(/עם\s+([^.\n]{2,60})/);
      return {
        topic: topic,
        sections: [
          sectionOf('background', 'רקע', 'Background', ''),
          sectionOf('offer', 'ההצעה', 'Proposal', withWhom ? withWhom[1].trim() : topic),
          sectionOf('scope', 'היקף', 'Scope', ''),
          sectionOf('next', 'הצעד הבא', 'Next step', '')
        ]
      };
    }
    if (type === 'spec') {
      return {
        topic: topic,
        sections: [
          sectionOf('goal', 'מטרה', 'Goal', phraseAfter(t, 'מטרה') || topic),
          sectionOf('requirements', 'דרישות', 'Requirements', '', listAfter(t, 'דרישות')),
          sectionOf('out', 'מחוץ להיקף', 'Out of scope', phraseAfter(t, 'מחוץ להיקף')),
          sectionOf('acceptance', 'קבלה', 'Acceptance', phraseAfter(t, 'קבלה'))
        ]
      };
    }
    if (type === 'form') {
      return {
        topic: topic,
        sections: [
          sectionOf('fields', 'שדות', 'Fields', '', listAfter(t, 'שדות')),
          sectionOf('instructions', 'הנחיות', 'Instructions', phraseAfter(t, 'הנחיות'))
        ]
      };
    }
    const contentItems = [];
    const colon = t.match(/:\s*([^.\n]{2,180})/);
    if (colon) contentItems.push.apply(contentItems, splitItems(colon[1]));
    return {
      topic: topic,
      sections: [
        sectionOf('subject', 'נושא', 'Subject', topic),
        sectionOf('content', 'תוכן', 'Content', contentItems.length ? '' : '', contentItems),
        sectionOf('notes', 'הערות', 'Notes', '')
      ]
    };
  }

  function composeTyped(type, text, lang, styleSummary) {
    const spec = typeSpec(type);
    const useLang = lang === 'he' || (lang !== 'en' && langOf(text, lang) === 'he') ? 'he' : (lang === 'he' ? 'he' : langOf(text, lang));
    const filled = fillSections(type, text, useLang);
    const name = useLang === 'he' ? spec.he : spec.en;
    const heading = filled.topic ? (name + ' — ' + filled.topic) : name;
    let html = '<h1>' + escapeHtml(heading) + '</h1>';
    if (type === 'letter') {
      html += '<p>' + escapeHtml(greetingLine(styleSummary, useLang, '')) + '</p>';
    }
    (filled.sections || []).forEach((sec) => {
      const label = useLang === 'he' ? sec.he : sec.en;
      if (sec.items && sec.items.length) {
        html += '<p><strong>' + escapeHtml(label) + ':</strong></p><ul>';
        sec.items.forEach((item) => { html += '<li>' + escapeHtml(item) + '</li>'; });
        html += '</ul>';
        return;
      }
      const value = sec.value || placeholder(useLang, label);
      html += '<p><strong>' + escapeHtml(label) + ':</strong> ' + escapeHtml(value) + '</p>';
    });
    html += '<p>' + escapeHtml(signoffLine(styleSummary, useLang)) + '</p>';
    return { html: html, title: heading, previewOnly: true, closes: false, sections: filled.sections, topic: filled.topic };
  }

  function docishAttachment(file) {
    const name = String((file && (file.filename || file.name)) || '');
    const mime = String((file && (file.mimeType || file.mime)) || '');
    return /\.(pdf|docx?|gdoc|rtf|odt)$/i.test(name) || /google-apps\.document|officedocument|application\/pdf|msword/i.test(mime);
  }

  function nameHitsType(name, type) {
    const spec = typeSpec(type);
    const n = String(name || '').toLowerCase();
    return (spec.keys || []).some((key) => key && n.indexOf(String(key).toLowerCase()) >= 0);
  }

  // The thread already carries the document. No Do It: nothing to create.
  function attachmentCovers(attachments, type) {
    return (attachments || []).some((file) => docishAttachment(file) && nameHitsType(file.filename || file.name, type));
  }

  function formatDay(value) {
    const s = String(value || '').trim();
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return String(Number(iso[3])) + '/' + String(Number(iso[2]));
    const dmy = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?/);
    if (dmy) return String(Number(dmy[1])) + '/' + String(Number(dmy[2]));
    return '';
  }

  function fileView(raw) {
    const props = (raw && raw.appProperties) || {};
    let fromDesc = {};
    const desc = String((raw && raw.description) || '');
    if (desc.indexOf('glance ') === 0) {
      try { fromDesc = JSON.parse(desc.slice(7)); } catch (e) { fromDesc = {}; }
    }
    return {
      id: String((raw && raw.id) || ''),
      name: String((raw && raw.name) || ''),
      url: String((raw && (raw.webViewLink || raw.url)) || ''),
      trashed: !!(raw && raw.trashed),
      threadId: String(props.glanceThread || fromDesc.thread || (raw && raw.threadId) || ''),
      messageId: String(props.glanceMessage || fromDesc.message || (raw && raw.messageId) || ''),
      docType: String(props.glanceType || fromDesc.type || (raw && raw.docType) || ''),
      titleKey: String(props.glanceTitle || fromDesc.title || (raw && raw.titleKey) || ''),
      at: String(props.glanceAt || fromDesc.at || (raw && raw.at) || ''),
      hash: String(props.glanceHash || (raw && raw.hash) || ''),
      glance: props.glanceDoc === '1' || fromDesc.glance === true || !!(raw && raw.glance)
    };
  }

  function reasonFor(lang, mode, at) {
    const day = formatDay(at);
    if (lang === 'he') {
      if (mode === 'update') return 'כבר קיים מסמך מהשרשור הזה' + (day ? ' מ-' + day : '');
      if (mode === 'open') return 'כבר קיים מסמך מתאים' + (day ? ' מ-' + day : '') + ' — לא נוצר חדש';
      if (mode === 'draft') return 'יש טיוטה בשרשור — לא נוצר מסמך חדש';
      return 'יש יותר ממסמך אחד שעשוי להתאים. לא נוצר מסמך.';
    }
    if (mode === 'update') return 'A document from this thread already exists' + (day ? ' (' + day + ')' : '');
    if (mode === 'open') return 'A matching document already exists' + (day ? ' (' + day + ')' : '') + ' — nothing new was created';
    if (mode === 'draft') return 'A draft is already in this thread — nothing new was created';
    return 'More than one document might match. Nothing was created.';
  }

  function labelFor(lang, mode) {
    if (lang === 'he') {
      if (mode === 'update') return 'עדכן';
      if (mode === 'open' || mode === 'draft') return 'פתח את הקיים';
      return '';
    }
    if (mode === 'update') return 'Update';
    if (mode === 'open' || mode === 'draft') return 'Open existing';
    return '';
  }

  // Deterministic: attachment wins (no card), then one safe Glance Doc
  // from this thread (update), then one other match (open), then several
  // (say so, never create). Drive files Glance cannot see are not a signal.
  function decideExisting(input) {
    input = input || {};
    const type = input.docType || 'document';
    const lang = input.lang === 'he' ? 'he' : 'en';
    const threadId = String(input.threadId || '');
    const titleKey = String(input.titleKey || '');
    const messageId = String(input.messageId || '');
    const own = {};
    [].concat(input.ownDocumentIds || []).forEach((id) => { if (id) own[String(id)] = true; });
    if (attachmentCovers(input.attachments, type)) {
      return { mode: 'attached', reason: 'already-attached' };
    }
    const files = (input.existingDocs == null ? [] : input.existingDocs).map(fileView).filter((file) => {
      if (!file.id || file.trashed || !file.glance || file.docType !== type) return false;
      if (own[file.id]) return false;
      if (messageId && file.messageId && file.messageId === messageId) return false;
      return true;
    });
    const updates = files.filter((file) => threadId && file.threadId === threadId);
    const opens = files.filter((file) => titleKey && file.titleKey === titleKey && !(threadId && file.threadId === threadId));
    const drafts = (input.drafts || []).filter((row) => {
      const subject = String((row && (row.subject || row.name)) || '');
      return nameHitsType(subject, type) || (titleKey && subject.toLowerCase().indexOf(titleKey) >= 0);
    }).map((row) => ({
      id: '',
      name: String(row.subject || row.name || ''),
      url: String(row.href || row.url || ''),
      at: '',
      draft: true
    }));
    const ranked = updates.map((file) => Object.assign({ kind: 'update' }, file))
      .concat(opens.map((file) => Object.assign({ kind: 'open' }, file)))
      .concat(drafts.map((file) => Object.assign({ kind: 'draft' }, file)));
    if (ranked.length > 1) {
      return { mode: 'ambiguous', reason: 'ambiguous', cardLine: reasonFor(lang, 'ambiguous', ''), doItLabel: '', noDoIt: true, candidates: ranked };
    }
    if (ranked.length === 1) {
      const one = ranked[0];
      const mode = one.kind === 'update' ? 'update' : 'open';
      return {
        mode: mode,
        reason: mode,
        cardLine: reasonFor(lang, one.kind === 'draft' ? 'draft' : mode, one.at),
        doItLabel: labelFor(lang, one.kind === 'draft' ? 'draft' : mode),
        existing: one
      };
    }
    return { mode: 'create', reason: 'create' };
  }

  function planQuote(input, text) {
    const C = Closes();
    if (!C || typeof C.consider !== 'function') return { action: 'silence', reason: 'not-configured' };
    const amount = input.amount || extractAmount(text);
    const lang = input.lang === 'he' ? 'he' : 'en';
    const consider = C.consider({
      text: text,
      template: input.template || input.companyTemplate || fallbackQuoteTemplate(text, lang),
      dateIso: input.dateIso || null,
      dateText: input.dateText || null,
      amount: amount,
      hasClock: input.hasClock === true,
      fileMatch: 'none',
      attachmentCount: 0
    });
    if (!consider || !consider.close) return { action: 'silence', reason: consider && consider.wait ? 'need-slot' : 'no-close' };
    let close = applyPreviewPlaceholders(consider.close, text, lang);
    const built = composeHtml(close, { lang: lang, styleSummary: input.styleSummary, partyName: close.filled && close.filled.party });
    if (!built || built.blank) return { action: 'silence', reason: 'incomplete-slots' };
    return {
      action: 'offer',
      connectorId: CONNECTOR,
      previewOnly: true,
      closes: false,
      docType: 'quote',
      mode: 'create',
      titleKey: titleKeyOf(built.title || (lang === 'he' ? 'הצעת מחיר' : 'Quote')),
      googleClose: close,
      built: built,
      cardLine: langLine(input.lang, close.artifact || 'quote'),
      steps: [{ kind: 'driveDocFull', id: 'full-doc', label: built.title || 'Document' }]
    };
  }

  function planTyped(input, text, docType) {
    const lang = input.lang === 'he' ? 'he' : (input.lang === 'en' ? 'en' : langOf(text, input.lang));
    const built = composeTyped(docType, text, lang, input.styleSummary);
    if (!built || !built.html) return { action: 'silence', reason: 'incomplete-slots' };
    const spec = typeSpec(docType);
    return {
      action: 'offer',
      connectorId: CONNECTOR,
      previewOnly: true,
      closes: false,
      docType: docType,
      mode: 'create',
      titleKey: titleKeyOf(built.title),
      googleClose: {
        artifact: docType,
        kind: 'doc',
        family: 'I',
        lang: lang,
        slots: (built.sections || []).map((sec) => sec.id),
        filled: { title: built.topic || '' },
        template: { name: spec.he, artifact: docType, kind: 'doc' }
      },
      built: built,
      cardLine: langLine(lang, docType),
      steps: [{ kind: 'driveDocFull', id: 'full-doc', label: built.title || spec.he }]
    };
  }

  function applyExisting(offer, input) {
    if (!offer || offer.action !== 'offer') return offer;
    const lang = input.lang === 'he' ? 'he' : 'en';
    const decision = decideExisting({
      docType: offer.docType || 'quote',
      threadId: input.threadId || '',
      messageId: input.messageId || '',
      ownDocumentIds: input.ownDocumentIds || [],
      titleKey: offer.titleKey || '',
      attachments: input.attachments || [],
      drafts: input.drafts || [],
      existingDocs: input.existingDocs,
      lang: lang
    });
    if (decision.mode === 'attached') return { action: 'silence', reason: 'already-attached' };
    if (decision.mode === 'create') return offer;
    return Object.assign({}, offer, {
      mode: decision.mode,
      reason: decision.reason,
      cardLine: decision.cardLine || offer.cardLine,
      doItLabel: decision.doItLabel || '',
      noDoIt: decision.noDoIt === true,
      existing: decision.existing || null,
      candidates: decision.candidates || null,
      writes: decision.mode === 'update'
    });
  }

  function notARequest(text, docType) {
    if (!docType) return false;
    if (isAsked(flattenMail(text), docType)) return false;
    return FYI_RE.test(text) || NEWS_RE.test(text);
  }

  function plan(input) {
    input = input || {};
    if (!enabled(input.flags)) return { action: 'off', reason: 'switch-off' };
    const text = String(input.text || '').slice(0, 8000);
    const rec = recognize(text);
    if (rec.kind === 'empty' || rec.reason === 'wrong-shape') return { action: 'silence', reason: rec.reason || rec.kind };

    const docType = classifyDocument(text);
    const quote = docType === 'quote' || (docType == null && rec.kind === 'clear' && isQuoteMail(text));
    if (quote) {
      if (rec.kind !== 'clear') return { action: 'silence', reason: rec.reason || 'no-ask' };
      if (notARequest(text, 'quote') && !isAsked(flattenMail(text), 'quote')) return { action: 'silence', reason: 'not-a-request' };
      return applyExisting(planQuote(input, text), input);
    }
    if (!docType) {
      const flat = flattenMail(text);
      if ((FYI_RE.test(flat) || NEWS_RE.test(flat)) && TYPE_ORDER.some((type) => matchIndex(flat, type) >= 0)) {
        return { action: 'silence', reason: 'not-a-request' };
      }
      return { action: 'silence', reason: rec.reason || 'no-ask' };
    }
    if (notARequest(text, docType)) return { action: 'silence', reason: 'not-a-request' };
    if (!isAsked(flattenMail(text), docType)) {
      const parts = splitSubject(text);
      const named = parts.subject && matchIndex(parts.subject, docType) >= 0 && !courtesyOnly(parts.body);
      if (!named) return { action: 'silence', reason: 'no-ask' };
    }
    return applyExisting(planTyped(input, text, docType), input);
  }

  function langLine(lang, artifact) {
    if (lang === 'he') {
      const noun = artifact === 'quote' ? 'הצעת מחיר' : (typeSpec(artifact).he || 'מסמך');
      return 'טיוטת ' + noun + ' מוכנה לעיון — לא נשלחה';
    }
    if (!artifact || artifact === 'quote') return 'Full ' + (artifact || 'document') + ' ready to preview — not sent';
    return 'Full ' + (typeSpec(artifact).en || artifact) + ' ready to preview — not sent';
  }

  return {
    SWITCH,
    CONNECTOR,
    enabled,
    recognize,
    plan,
    composeHtml,
    stripInventedAmounts,
    ensurePricePlaceholder,
    ensureTitlePlaceholder,
    applyPreviewPlaceholders,
    amountInText,
    PRICE_PLACEHOLDER,
    TITLE_PLACEHOLDER,
    PARTY_PLACEHOLDER,
    placeholdersFor,
    itemsFrom,
    quoteTitleFrom,
    classifyDocument,
    decideExisting,
    DOC_TYPES,
    titleKeyOf,
    composeTyped
  };
})();

if (typeof module !== 'undefined') module.exports = { FlowFullDocumentClose };
else if (typeof globalThis !== 'undefined') globalThis.FlowFullDocumentClose = FlowFullDocumentClose;
