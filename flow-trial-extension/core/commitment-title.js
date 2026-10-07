// Task title for a dated commitment or a sender promise. The span comes from
// the same sentence that fired the intent. The subject is not a title.
// A model does not write this. No clean verb and object falls back to empty,
// and the writer keeps the chip label (`neutralTitle`) it already had.
// Portable: no chrome.*, no DOM, no network.
const FlowCommitmentTitle = (() => {
  const MAX = 60;
  const PROMISE_EN = /\b(?:i|we)(?:'ll| will)\s+(?:send|deliver|share|provide|submit|file|pay|return|forward|transfer|wire|prepare|email|finish|complete|renew)\b/i;
  const AGREED_EN = /\b(?:we|i)\s+agreed\s+to\s+[a-z]/i;
  const PROMISE_HE = /(?:^|\s)(?:(?:אני|אנחנו)\s+)?(?:אשלח|נשלח|אעביר|נעביר|אשלם|נשלם|אגיש|נגיש|אכין|נכין|אחזיר|נחזיר)/;
  const AGREED_HE = /סוכם\s+ש|הסכמנו\s+/;
  const DATE_CUE = /\b(?:by|due|until|before|no later than|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december)\b|עד\s/i;
  const HE_VERBS = [
    [/^אני\s+אשלח/, 'לשלוח'],
    [/^אנחנו\s+נשלח/, 'לשלוח'],
    [/^אשלח/, 'לשלוח'],
    [/^נשלח/, 'לשלוח'],
    [/^אני\s+אעביר/, 'להעביר'],
    [/^אנחנו\s+נעביר/, 'להעביר'],
    [/^אעביר/, 'להעביר'],
    [/^נעביר/, 'להעביר'],
    [/^אני\s+אשלם/, 'לשלם'],
    [/^אנחנו\s+נשלם/, 'לשלם'],
    [/^אשלם/, 'לשלם'],
    [/^נשלם/, 'לשלם'],
    [/^אני\s+אגיש/, 'להגיש'],
    [/^אנחנו\s+נגיש/, 'להגיש'],
    [/^אגיש/, 'להגיש'],
    [/^נגיש/, 'להגיש'],
    [/^אני\s+אכין/, 'להכין'],
    [/^אנחנו\s+נכין/, 'להכין'],
    [/^אכין/, 'להכין'],
    [/^נכין/, 'להכין'],
    [/^אני\s+אחזיר/, 'להחזיר'],
    [/^אנחנו\s+נחזיר/, 'להחזיר'],
    [/^אחזיר/, 'להחזיר'],
    [/^נחזיר/, 'להחזיר']
  ];

  function clean(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function sentences(text) {
    return clean(text).split(/\n+|(?<=[.!?])\s+/).map((part) => part.replace(/[.!?]+$/, '').trim()).filter(Boolean);
  }

  function fires(sentence) {
    return PROMISE_EN.test(sentence) || AGREED_EN.test(sentence) || PROMISE_HE.test(sentence) || AGREED_HE.test(sentence);
  }

  function firingSentence(text) {
    const rows = sentences(text).filter(fires);
    if (!rows.length) return '';
    for (let i = 0; i < rows.length; i++) {
      if (DATE_CUE.test(rows[i])) return rows[i];
    }
    return rows[0];
  }

  function clip(value) {
    if (value.length <= MAX) return value;
    const cut = value.lastIndexOf(' ', MAX);
    if (cut >= 12) return value.slice(0, cut).trim();
    return value.slice(0, MAX).trim();
  }

  function capitalize(value) {
    if (!value || !/^[a-z]/.test(value)) return value;
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function englishSpan(sentence) {
    let t = sentence.replace(/\s*,?\s*please\s*$/i, '').replace(/^(?:please\s+)/i, '');
    t = t.replace(/^(?:we|i)\s+agreed\s+to\s+/i, '');
    t = t.replace(/^(?:i|we)(?:'ll|\s+will)\s+/i, '');
    t = t.replace(/^(\w+)\s+(?:you|me|us)\s+/i, '$1 ');
    t = t.replace(/\s+(?:by|due|until|before|no later than)\b[\s\S]*$/i, '');
    t = clean(t).replace(/[,:;]+$/, '');
    const words = t.split(' ').filter(Boolean);
    if (words.length < 2) return '';
    return clip(capitalize(words.join(' ')));
  }

  function hebrewSpan(sentence) {
    let t = sentence.replace(/\s*בבקשה\s*$/, '').replace(/^בבקשה\s+/, '');
    t = t.replace(/^(?:סוכם\s+ש|הסכמנו\s+ל)\s*/, '');
    t = clean(t);
    for (let i = 0; i < HE_VERBS.length; i++) {
      if (HE_VERBS[i][0].test(t)) {
        t = t.replace(HE_VERBS[i][0], HE_VERBS[i][1]);
        break;
      }
    }
    t = t.replace(/^(ל\S+)\s+(?:לך|לכם|לי)\s+/, '$1 ');
    t = t.replace(/\s+עד(?:\s|$).*$/, '');
    t = clean(t);
    const words = t.split(' ').filter(Boolean);
    if (words.length < 2 || !/^ל/.test(words[0])) return '';
    return clip(words.join(' '));
  }

  function titleFromBody(text) {
    const sentence = firingSentence(text);
    if (!sentence) return '';
    if (/[\u0590-\u05FF]/.test(sentence)) return hebrewSpan(sentence);
    return englishSpan(sentence);
  }

  // Body wins. params.what is only the sentence when the body is empty
  // (a replay that stored the ask and not the mail). Subject is ignored.
  function fromPayload(p) {
    const row = p || {};
    const body = clean(row.text || row.bodyText || '');
    const what = row.params && row.params.what ? clean(row.params.what) : '';
    return titleFromBody(body || what);
  }

  return { titleFromBody: titleFromBody, fromPayload: fromPayload, MAX: MAX };
})();

if (typeof module !== 'undefined') module.exports = { FlowCommitmentTitle };
else if (typeof globalThis !== 'undefined') globalThis.FlowCommitmentTitle = FlowCommitmentTitle;
