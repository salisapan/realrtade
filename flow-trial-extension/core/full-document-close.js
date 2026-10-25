// Full-document close (D1 part 1, Gmail + Google Docs): when the mail asks
// for a quote, proposal, or similar document, Glance prepares a complete Doc
// in the person's writing style. Preview with one Do It; never auto-sent.
// No invented prices — amounts appear only when the mail itself states them.
// Portable: no chrome.*, no DOM, no network.
const FlowFullDocumentClose = (() => {
  const SWITCH = 'FULL_DOCUMENT_CLOSE';
  const CONNECTOR = 'googleDocFull';

  const ASK_EN = /\b(?:send|prepare|draft|write|put together|share)\b.{0,40}\b(?:the\s+)?(?:quote|quotation|proposal|contract|agreement|sow|statement of work)\b/i;
  const ASK_HE = /(?:שלח|שלחי|הכן|הכיני|תכין|תכיני|להכין|נא\s+להכין).{0,40}(?:הצעת\s*מחיר|הצעה|חוזה|הסכם)/u;
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
    return /\d[\d,.]*\s*(?:₪|\$|€|usd|ils|eur)?/i.test(String(text || '')) || /[\u0590-\u05FF].*\d/.test(String(text || ''));
  }

  function stripInventedAmounts(close, sourceText) {
    if (!close || !close.filled) return close;
    if (amountInText(sourceText)) return close;
    const filled = Object.assign({}, close.filled);
    if (filled.amount) delete filled.amount;
    return Object.assign({}, close, { filled: filled });
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
    const C = Closes();
    if (!C || !close) return { blank: true };
    const built = C.artifactBody(close, (close && close.filled) || {});
    if (!built || built.blank) return built || { blank: true };
    const lang = opts && opts.lang === 'he' ? 'he' : 'en';
    const styleSummary = (opts && opts.styleSummary) || null;
    const party = (close.filled && close.filled.party) || (opts && opts.partyName) || '';
    const open = greetingLine(styleSummary, lang, party);
    const closeLine = signoffLine(styleSummary, lang);
    const body = built.html || '';
    const html = '<p>' + escapeHtml(open) + '</p>' + body + '<p>' + escapeHtml(closeLine) + '</p>';
    return Object.assign({}, built, { html: html, previewOnly: true, closes: false });
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
    const consider = C.consider({
      text: text,
      template: input.template || input.companyTemplate || null,
      dateIso: input.dateIso || null,
      dateText: input.dateText || null,
      amount: amount,
      hasClock: input.hasClock === true,
      fileMatch: 'none',
      attachmentCount: 0
    });
    if (!consider || !consider.close) return { action: 'silence', reason: consider && consider.wait ? 'need-slot' : 'no-close' };
    let close = consider.close;
    close = stripInventedAmounts(close, text);
    const built = composeHtml(close, { lang: input.lang, styleSummary: input.styleSummary, partyName: close.filled && close.filled.party });
    if (!built || built.blank) return { action: 'silence', reason: 'incomplete-slots' };

    return {
      action: 'offer',
      connectorId: CONNECTOR,
      previewOnly: true,
      closes: false,
      googleClose: close,
      built: built,
      cardLine: langLine(input.lang, close.artifact || 'quote'),
      steps: [{ kind: 'driveDoc', id: 'full-doc', label: built.title || 'Document' }]
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
    amountInText
  };
})();

if (typeof module !== 'undefined') module.exports = { FlowFullDocumentClose };
else if (typeof globalThis !== 'undefined') globalThis.FlowFullDocumentClose = FlowFullDocumentClose;
