// Language normalisation for local intent recognition — portable, no chrome.*,
// no DOM, no network, no model. English and Hebrew.
//
// Why this exists: matching raw words is brittle ("sending", "sent", "send" are
// three different strings; Hebrew glues prepositions and pronouns onto the
// word, so "ללקוח" never equals "לקוח"). This turns a sentence into a short list
// of normalised features a statistical model can generalise over:
//   - lower-cased tokens with contractions opened ("I'll" -> "i will")
//   - English suffix stemming (sending/sent/sends -> send)
//   - Hebrew prefix and suffix stripping, keeping BOTH the raw and the stripped
//     form so a wrong strip can never hide the real word
//   - numbers, money, dates, times, e-mails and links replaced by placeholders
//     so "$4,200" and "$900" are the same thing to the model
//   - negation marked on the words it governs ("not paid" != "paid")
const FlowLang = (() => {
  const CONTRACTIONS = [
    [/\bwon't\b/g, 'will not'], [/\bcan't\b/g, 'can not'], [/\bcannot\b/g, 'can not'], [/\bshan't\b/g, 'shall not'],
    [/\b(\w+)n't\b/g, '$1 not'], [/\bi'm\b/g, 'i am'], [/\b(\w+)'re\b/g, '$1 are'], [/\b(\w+)'ve\b/g, '$1 have'],
    [/\b(\w+)'ll\b/g, '$1 will'], [/\b(\w+)'d\b/g, '$1 would'], [/\blet's\b/g, 'let us'], [/\bit's\b/g, 'it is'],
    [/\bthat's\b/g, 'that is'], [/\bwhat's\b/g, 'what is'], [/\bhere's\b/g, 'here is'], [/\bthere's\b/g, 'there is']
  ];
  const IRREGULAR = {
    sent: 'send', sending: 'send', sends: 'send', paid: 'pay', paying: 'pay', pays: 'pay', signed: 'sign', signing: 'sign', signs: 'sign',
    got: 'get', gotten: 'get', getting: 'get', gets: 'get', made: 'make', making: 'make', makes: 'make', gave: 'give', given: 'give', giving: 'give',
    took: 'take', taken: 'take', taking: 'take', went: 'go', gone: 'go', going: 'go', goes: 'go', did: 'do', done: 'do', doing: 'do', does: 'do',
    was: 'be', were: 'be', been: 'be', is: 'be', are: 'be', am: 'be', had: 'have', has: 'have', having: 'have', told: 'tell', said: 'say',
    wrote: 'write', written: 'write', writing: 'write', met: 'meet', meeting: 'meeting', thought: 'think', knew: 'know', known: 'know', saw: 'see', seen: 'see',
    left: 'leave', brought: 'bring', bought: 'buy', kept: 'keep', held: 'hold', ran: 'run', running: 'run', shipped: 'ship'
  };
  const MONTHS = /^(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)$/;
  const WEEKDAYS = /^(?:mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)$/;
  const HE_MONTHS = /^(?:ינואר|פברואר|מרץ|אפריל|מאי|יוני|יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר)$/;
  const HE_DAYS = /^(?:ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)$/;
  const FINALS = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
  const NEGATORS = new Set(['not', 'no', 'never', 'neither', 'nor', 'without', 'לא', 'אין', 'בלי', 'טרם', 'אל']);
  const NEG_SCOPE = 3;

  function isHe(w) { return /[א-ת]/.test(w); }

  function stemEn(w) {
    if (IRREGULAR[w]) return IRREGULAR[w];
    if (w.length <= 3) return w;
    let s = w;
    if (/ies$/.test(s) && s.length > 4) s = s.slice(0, -3) + 'y';
    else if (/(?:ches|shes|sses|xes|zes)$/.test(s)) s = s.slice(0, -2);
    else if (/ing$/.test(s) && s.length > 5) s = s.slice(0, -3);
    else if (/ied$/.test(s) && s.length > 4) s = s.slice(0, -3) + 'y';
    else if (/ed$/.test(s) && s.length > 4) s = s.slice(0, -2);
    else if (/ly$/.test(s) && s.length > 5) s = s.slice(0, -2);
    else if (/s$/.test(s) && !/(?:ss|us|is)$/.test(s)) s = s.slice(0, -1);
    // "scheduled" -> "schedul" and "schedule" -> "schedule": drop a trailing e so both meet.
    if (/e$/.test(s) && s.length > 4) s = s.slice(0, -1);
    if (/([bdgklmnprt])\1$/.test(s) && s.length > 4) s = s.slice(0, -1); // "submitt" -> "submit"
    return s;
  }

  // Hebrew: returns every plausible base form, most specific first. Normalises
  // final letters so "תשלום" / "תשלומים" share a stem, and strips attached
  // prepositions (ה ו ב ל כ מ ש) and common pronoun/plural suffixes.
  function formsHe(w) {
    const base = w.replace(/[ךםןףץ]/g, (c) => FINALS[c]);
    const out = [base];
    let cur = base;
    for (let i = 0; i < 2; i++) {
      if (cur.length > 3 && /^[והבלכמש]/.test(cur)) { cur = cur.slice(1); out.push(cur); } else break;
    }
    const suffixes = ['ימ', 'ות', 'נו', 'כמ', 'תי', 'ני', 'הו', 'כ', 'ה', 'י', 'ת'];
    for (const f of out.slice()) {
      for (const sx of suffixes) {
        if (f.length - sx.length >= 3 && f.endsWith(sx)) { out.push(f.slice(0, -sx.length)); break; }
      }
    }
    return Array.from(new Set(out));
  }

  // text -> [{ w: normalised primary form, forms: [...], he: bool, neg: bool, raw }]
  function tokenize(text) {
    let t = String(text == null ? '' : text).toLowerCase().replace(/[‘’`´]/g, "'").replace(/[“”]/g, '"');
    t = t.replace(/https?:\/\/\S+|www\.\S+/g, ' <url> ').replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, ' <email> ');
    t = t.replace(/(?:[$€£₪]\s?\d[\d,.]*|\d[\d,.]*\s?(?:[$€£₪]|usd|eur|gbp|ils|nis|dollars?|euros?|שקל(?:ים)?|ש"ח|שח|דולר(?:ים)?|אירו))/g, ' <money> ');
    t = t.replace(/\b\d{1,2}:\d{2}\s?(?:am|pm)?\b|\b\d{1,2}\s?(?:am|pm)\b/g, ' <time> ');
    t = t.replace(/\b\d{1,4}[/.\-]\d{1,2}(?:[/.\-]\d{1,4})?\b/g, ' <date> ');
    t = t.replace(/\b\d{1,2}(?:st|nd|rd|th)\b/g, ' <num> ').replace(/\d[\d,.]*/g, ' <num> ');
    for (const [re, rep] of CONTRACTIONS) t = t.replace(re, rep);
    const raw = t.match(/<[a-z]+>|[a-zא-ת]+(?:["'][a-zא-ת]+)?|[?!]/g) || [];
    const out = [];
    let negLeft = 0;
    for (const r of raw) {
      if (r === '?' || r === '!') { out.push({ w: r === '?' ? '<q>' : '<excl>', forms: [], he: false, neg: false, raw: r }); negLeft = 0; continue; }
      if (r[0] === '<') { out.push({ w: r, forms: [], he: false, neg: false, raw: r }); continue; }
      const word = r.replace(/["']/g, (m, i) => (isHe(r) ? '' : m));
      let w, forms;
      if (isHe(word)) {
        if (HE_MONTHS.test(word)) { w = '<month>'; forms = []; }
        else if (HE_DAYS.test(word)) { w = '<weekday>'; forms = []; }
        else { forms = formsHe(word); w = forms.length > 1 ? forms[1] : forms[0]; }
      } else if (MONTHS.test(word) && word.length > 2) { w = '<month>'; forms = []; }
      else if (WEEKDAYS.test(word) && word.length > 2) { w = '<weekday>'; forms = []; }
      else { w = stemEn(word.replace(/'/g, '')); forms = []; }
      const neg = negLeft > 0;
      if (NEGATORS.has(word)) negLeft = NEG_SCOPE; else if (negLeft > 0) negLeft--;
      out.push({ w, forms, he: isHe(word), neg, raw: word });
    }
    return out;
  }

  return { tokenize, stemEn, formsHe };
})();

if (typeof module !== 'undefined') module.exports = { FlowLang };
