'use strict';
// Who owes what (docs/glance-ai/ai-product.md §3): the device checks the kind a model gave each intention against the words the model
// itself quoted (ask_span and evidence_span), and corrects it only when a plain frame in those words says otherwise. A wrong kind is a
// wrong Do It for the person: a reminder of their own promise drafted as a reply, or an ask of them filed as something they are owed.
//
//   reminder of your own promise  "you mentioned you would send…", "as promised, you will share…", «הבטחת ש…», «אמרת שתשלחי…»
//                                 ask_of_me or promise_to_me -> promise_by_me (the person's own commitment: the engine's follow-through)
//   an ask addressed to you       "could you…", "please…", «תעבירי לי…», «בבקשה»   promise_to_me -> ask_of_me, when the sender promises nothing
//   the sender's own promise      "I'll…", "we will…", «אשלח», «נעביר»            ask_of_me -> promise_to_me, when nothing asks the person
// Anything else is left as the model said. The check never adds an intention, a date or a span; the floor, the gate and the veto still
// run on the corrected answer. Off switch: SWITCH ('aiKindCheckV1'), default off: wrap() returns the model function unchanged.
// Portable: no chrome.*, no DOM, no network.
const FlowKindCheck = (() => {
  const SWITCH = 'aiKindCheckV1';
  const DEFAULTS = Object.freeze({ [SWITCH]: false });
  const HB = '[\\u05D0-\\u05EA]';

  const REMIND_OWN_EN = /\byou\s+(?:mentioned|said|promised|told\s+(?:me|us)|confirmed|agreed)\s+(?:that\s+)?you(?:'d|'ll|\s+would|\s+will)\b|\bas\s+(?:you\s+)?promised\b[^.!?\n]{0,60}?\byou(?:'ll|\s+will|\s+would)\b|\byou\s+(?:were\s+going|agreed|offered|promised)\s+to\b/i;
  const REMIND_OWN_HE = new RegExp('(?:אמרת|הבטחת|ציינת|הזכרת)\\s+ש(?:את\\s+|אתה\\s+)?ת' + HB + '{2,}|כמו\\s+שהבטחת|הבטחת\\s+ל');
  const ASK_EN = /\b(?:could|can|would|will)\s+you\b|\bplease\b|\bkindly\b|\bi\s+need\s+you\s+to\b|\bi(?:'d|\s+would)\s+appreciate\s+it\s+if\s+you\b/i;
  const ASK_HE = new RegExp('(?:^|[\\s,.;:!?("\'\\-])ת' + HB + '{2,}(?:י|ו)\\s+(?:לי|לנו|בבקשה)|בבקשה|אפשר\\s+(?:לקבל|לשלוח|להעביר)|(?:^|[\\s,.;:!?])תוכל(?:י|ו)?(?=$|[\\s,.;:!?])');
  const SENDER_PROMISE_EN = /\b(?:i|we)(?:'ll|\s+will|\s+shall|\s+am\s+going\s+to|'m\s+going\s+to|\s+are\s+going\s+to)\b/i;
  const SENDER_PROMISE_HE = /(?:^|[\s,.;:!?])(?:אשלח|נשלח|אעביר|נעביר|אחזור|נחזור|אדאג|נדאג|אכין|נכין|אעדכן|נעדכן|אחתום|נחתום|אגיע|נגיע)(?=$|[\s,.;:!?])/;

  const remindsOwn = (s) => REMIND_OWN_EN.test(s) || REMIND_OWN_HE.test(s);
  const asks = (s) => ASK_EN.test(s) || ASK_HE.test(s);
  const senderPromises = (s) => SENDER_PROMISE_EN.test(s) || SENDER_PROMISE_HE.test(s);

  function enabled(flags) { return !!(flags && flags[SWITCH] === true); }

  // kindFor(kind, words) -> { kind, why } : the kind the device keeps for one intention, and why it changed (null when it did not).
  function kindFor(kind, words) {
    const s = String(words || '');
    if ((kind === 'ask_of_me' || kind === 'promise_to_me') && remindsOwn(s)) return { kind: 'promise_by_me', why: 'kind:reminder-of-own-promise' };
    if (kind === 'promise_to_me' && asks(s) && !senderPromises(s)) return { kind: 'ask_of_me', why: 'kind:ask-addressed-to-you' };
    if (kind === 'ask_of_me' && senderPromises(s) && !asks(s)) return { kind: 'promise_to_me', why: 'kind:sender-promise' };
    return { kind, why: null };
  }

  // check(answer) -> { answer, changes } . A copy; the input is never changed. A non-object answer comes back as it was.
  function check(answer) {
    if (!answer || typeof answer !== 'object' || !Array.isArray(answer.intentions)) return { answer, changes: [] };
    const changes = [];
    const intentions = answer.intentions.map((it, i) => {
      if (!it || typeof it !== 'object') return it;
      const k = kindFor(it.kind, [it.ask_span, it.evidence_span].filter(Boolean).join('\n'));
      if (!k.why) return it;
      changes.push({ index: i, from: it.kind, to: k.kind, why: k.why });
      return Object.assign({}, it, { kind: k.kind });
    });
    return { answer: Object.assign({}, answer, { intentions }), changes };
  }

  // wrap(flags, fn) -> a model function whose answer passes check() first; fn itself while the switch is off.
  // A string answer (raw JSON from a device session) is parsed first; an unreadable one is passed on for the validator to refuse.
  function wrap(flags, fn) {
    if (!enabled(flags) || typeof fn !== 'function') return fn;
    return async (text) => {
      const raw = await fn(text);
      let a = raw;
      if (typeof raw === 'string') { try { a = JSON.parse(raw); } catch (e) { return raw; } }
      return check(a).answer;
    };
  }

  return { SWITCH, DEFAULTS, enabled, kindFor, check, wrap };
})();

if (typeof module !== 'undefined') module.exports = { FlowKindCheck };
