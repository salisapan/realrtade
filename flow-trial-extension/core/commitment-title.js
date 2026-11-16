// Task title for a dated commitment or a sender promise. The span comes from
// the same sentence that fired the intent. The subject is not a title.
// A model does not write this. No clean verb and object falls back to empty,
// and the writer keeps the chip label (`neutralTitle`) it already had.
// Portable: no chrome.*, no DOM, no network.
const FlowCommitmentTitle = (() => {
  const MAX = 60;
  const PROMISE_EN = /\b(?:i|we)(?:'ll| will)\s+(?:send|deliver|share|provide|submit|file|pay|return|forward|transfer|wire|prepare|email|finish|complete|renew)\b/i;
  const AGREED_EN = /\b(?:we|i)\s+agreed\s+to\s+[a-z]/i;
  // «As agreed on the call, you will send the invoice by Friday»: the reader's own agreed commitment (slot gold, 2026-11-15: the task was titled «Log commitment for Oct 9»).
  // It needs the agreement cue in the same sentence, so «you will receive an email» is not a commitment.
  const READER_EN = /\b(?:per our (?:call|chat|meeting)|as (?:we )?(?:agreed|discussed)|we agreed|you (?:said|agreed|promised|mentioned|committed))\b[^.!?]*\byou(?:'ll|\s+will)\s+(?:send|deliver|share|provide|submit|file|pay|return|forward|transfer|wire|prepare|email|finish|complete|renew)\b/i;
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
    // Outlook sometimes leaves a zero-width mark inside a word. It is not a letter.
    return String(value == null ? '' : value).replace(/[\u200B\u200C\u200D\uFEFF\u2060]/g, '').replace(/\s+/g, ' ').trim();
  }

  // One spelling for every key path. Maqaf becomes a space, then niqqud and
  // cantillation (U+0591–U+05C7) drop. The letters that remain are the word.
  function prepareText(value) {
    return clean(value).replace(/\u05BE/g, ' ').replace(/[\u0591-\u05C7]/g, '').replace(/\s+/g, ' ').trim();
  }

  const HE_INF = {
    'אשלח': 'לשלוח', 'נשלח': 'לשלוח',
    'אעביר': 'להעביר', 'נעביר': 'להעביר',
    'אשלם': 'לשלם', 'נשלם': 'לשלם',
    'אגיש': 'להגיש', 'נגיש': 'להגיש',
    'אכין': 'להכין', 'נכין': 'להכין',
    'אחזיר': 'להחזיר', 'נחזיר': 'להחזיר'
  };

  // The key text. "אני אשלח את החוזה" and "לשלוח את החוזה" are the same
  // commitment. Pointing and maqaf are already gone.
  function keyText(value) {
    let t = prepareText(value);
    if (!t) return '';
    const verb = 'אשלח|נשלח|אעביר|נעביר|אשלם|נשלם|אגיש|נגיש|אכין|נכין|אחזיר|נחזיר';
    t = t.replace(new RegExp('^(?:אני|אנחנו)\\s+(' + verb + ')(?=\\s|$)'), function (_m, v) { return HE_INF[v] || _m; });
    t = t.replace(new RegExp('^(' + verb + ')(?=\\s|$)'), function (_m, v) { return HE_INF[v] || _m; });
    return t.toLowerCase().replace(/[^a-z0-9\u0590-\u05ff]+/gi, ' ').replace(/\s+/g, ' ').trim();
  }

  // Split before whitespace is collapsed. A subject glued on with a newline
  // is its own sentence, and it is not the commitment.
  function sentences(text) {
    return String(text == null ? '' : text)
      .replace(/\r/g, '')
      .split(/\n+|(?<=[.!?])\s+/)
      .map((part) => clean(part).replace(/[.!?]+$/, '').trim())
      .filter(Boolean);
  }

  function stripGreeting(sentence) {
    return sentence
      .replace(/^(?:hi|hello|hey|dear)(?:\s+[\w.'-]+){0,4}\s*,\s*/i, '')
      .replace(/^(?:היי|הי|שלום)(?:\s+\S+){0,3}\s*,\s*/, '')
      .replace(/^(?:היי|הי|שלום)\s*,\s*/, '');
  }

  function fires(sentence) {
    return PROMISE_EN.test(sentence) || AGREED_EN.test(sentence) || READER_EN.test(sentence) || PROMISE_HE.test(sentence) || AGREED_HE.test(sentence);
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

  const EN_TRIGGER = /(?:we|i)\s+agreed\s+to\s+|(?:i|we|you)(?:'ll|\s+will)\s+/i;

  function englishSpan(sentence) {
    let t = stripGreeting(sentence).replace(/\s*,?\s*please\s*$/i, '').replace(/^(?:please\s+)/i, '');
    const at = t.search(EN_TRIGGER);
    if (at < 0) return '';
    // The lead-in may sit after a greeting or a subject that stayed in the
    // same sentence. The title starts after the trigger, not at the start.
    t = t.slice(at).replace(EN_TRIGGER, '');
    t = t.replace(/^(\w+)\s+(?:you|me|us)\s+/i, '$1 ');
    t = t.replace(/\s+(?:by|due|until|before|no later than)\b[\s\S]*$/i, '');
    t = clean(t).replace(/[,:;]+$/, '');
    const words = t.split(' ').filter(Boolean);
    if (words.length < 2) return '';
    return clip(capitalize(words.join(' ')));
  }

  function hebrewSpan(sentence) {
    let t = stripGreeting(sentence).replace(/\s*בבקשה\s*$/, '').replace(/^בבקשה\s+/, '');
    const verbAt = t.search(/(?:(?:אני|אנחנו)\s+)?(?:אשלח|נשלח|אעביר|נעביר|אשלם|נשלם|אגיש|נגיש|אכין|נכין|אחזיר|נחזיר)/);
    const agreedAt = t.search(/סוכם\s+ש|הסכמנו\s+ל/);
    let at = -1;
    if (verbAt >= 0 && agreedAt >= 0) at = Math.min(verbAt, agreedAt);
    else at = verbAt >= 0 ? verbAt : agreedAt;
    if (at > 0) t = t.slice(at);
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
    const sentence = firingSentence(prepareText(text));
    if (!sentence) return '';
    if (/[\u0590-\u05FF]/.test(sentence)) return hebrewSpan(sentence);
    return englishSpan(sentence);
  }

  // The task for an ask that has no promise in it («Sali, please send me the updated budget by Thursday») is titled by the work («Send the updated budget»), not by its date
  // («Reply requested by Oct 8»), which names nothing (instinct-level reading, 2026-11-16). English only, verb plus object, nothing guessed: no verb from the list, no title.
  const ASK_VERBS = 'send|transfer|wire|settle|get|submit|upload|forward|share|review|sign|confirm|update|prepare|renew|pay|call|book|schedule|complete|finish|provide|fill|attach|check|approve|return|deliver|email|write|draft|fix|order|pick up|bring|finalize|finalise|arrange';
  const ASK_FRAME = new RegExp('\\b(?:reminder:?|please|kindly|could you|can you|would you|will you|i need you to|we need you to|i(?:\'d| would) like you to)\\s+(?:please\\s+)?(?:to\\s+)?(' + ASK_VERBS + ')\\s+(?:(?:me|us|you)\\s+)?(.+?)(?=\\s+(?:by|before|until|no later than|today|tomorrow|tonight|this|next|on|at|asap|as soon|thanks|thank)\\b|\\s+and\\s+(?:let|tell|then|send|call|reply)\\b|[?!;]|[.,](?!\\d)|$)', 'i');
  function askTitleFromBody(text) {
    const rows = sentences(prepareText(text)).map(stripGreeting).map((x) => x.replace(/^[A-Z][a-z]+,\s+/, ''));
    for (let i = 0; i < rows.length; i++) {
      if (/^(?:what|which|how|when|where|who|why|is|are|do|does)\b/i.test(rows[i])) continue;
      const m = rows[i].match(ASK_FRAME);
      if (!m) continue;
      const obj = clean(m[2]).replace(/\s+(?:again|please)$/i, '');
      const words = obj.split(' ').filter(Boolean);
      if (words.length < 1 || words.length > 9 || /^(?:it|this|that|them|these|those)$/i.test(obj)) continue;
      const verb = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();
      return clip(verb + ' ' + obj);
    }
    return '';
  }

  // Body wins. params.what is only the sentence when the body is empty
  // (a replay that stored the ask and not the mail). Subject is ignored.
  function fromPayload(p) {
    const row = p || {};
    const rawText = row.text == null ? '' : String(row.text);
    const rawBody = row.bodyText == null ? '' : String(row.bodyText);
    const body = rawText.trim() ? rawText : rawBody;
    const what = row.params && row.params.what ? String(row.params.what) : '';
    return titleFromBody(body.trim() ? body : what);
  }

  return { titleFromBody: titleFromBody, askTitleFromBody: askTitleFromBody, fromPayload: fromPayload, prepareText: prepareText, keyText: keyText, MAX: MAX };
})();

if (typeof module !== 'undefined') module.exports = { FlowCommitmentTitle };
else if (typeof globalThis !== 'undefined') globalThis.FlowCommitmentTitle = FlowCommitmentTitle;
