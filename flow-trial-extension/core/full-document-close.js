// Full-document close (D1 part 1, Gmail + Google Docs): when the mail asks
// for a quote, proposal, or similar document, Glance prepares a complete Doc
// in the person's writing style. Preview with one Do It; never auto-sent.
// No invented prices — amounts appear only when the mail itself states them.
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

  function signoffLine(styleSummary, lang) {
    const S = Style();
    if (!S || !styleSummary) return lang === 'he' ? 'בברכה,' : 'Best,';
    const map = {
      en: { best: 'Best,', 'best-regards': 'Best regards,', thanks: 'Thanks,', cheers: 'Cheers,', sincerely: 'Sincerely,' },
      he: { brakha: 'בברכה,', toda: 'תודה,', 'toda-raba': 'תודה רבה,', bekvod: 'בכבוד רב,' }
    };
    const table = map[lang === 'he' ? 'he' : 'en'] || map.en;
    return table[styleSummary.signoff] || (lang === 'he' ? 'בברכה,' : 'Best,');
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

  function plan(input) {
    input = input || {};
    if (!enabled(input.flags)) return { action: 'off', reason: 'switch-off' };
    const text = String(input.text || '').slice(0, 8000);
    const rec = recognize(text);
    if (rec.kind !== 'clear') return { action: 'silence', reason: rec.reason || rec.kind };

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
      googleClose: close,
      built: built,
      cardLine: langLine(input.lang, close.artifact || 'quote'),
      steps: [{ kind: 'driveDocFull', id: 'full-doc', label: built.title || 'Document' }]
    };
  }

  function langLine(lang, artifact) {
    if (lang === 'he') return 'טיוטת ' + (artifact === 'quote' ? 'הצעת מחיר' : 'מסמך') + ' מוכנה לעיון — לא נשלחה';
    return 'Full ' + (artifact || 'document') + ' ready to preview — not sent';
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
    quoteTitleFrom
  };
})();

if (typeof module !== 'undefined') module.exports = { FlowFullDocumentClose };
else if (typeof globalThis !== 'undefined') globalThis.FlowFullDocumentClose = FlowFullDocumentClose;
