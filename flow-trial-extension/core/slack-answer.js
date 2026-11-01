// A request that points at one Slack direct message ("reply to me here: <message link>", "let me know in the Slack DM", «תחזור אליי בסלאק»)
// becomes one offer: watch THAT DM for the person's own answer and count the loop closed when the answer is read back
// (core/slack-answer-close.js). Portable: no chrome.*, no DOM, no network. Behind the off switch SLACK_ANSWER (default off; the connector's
// own switch slackAnswerReadBack is separate, config/connectors.public.js).
//
// Rules:
//   - the text must carry exactly ONE link to a message in a Slack direct message (https://<workspace>.slack.com/archives/D…/p…). A DM is never
//     guessed from a name or "the latest DM"; no link, a link into a channel, or two different DMs is silence;
//   - the text must ask for an answer there: reply / answer / let me know / get back to me / confirm, here or in Slack, English or Hebrew;
//   - hedge, negation, FYI and "ask Dana to answer" stay silent; a text with no ask stays silent;
//   - direction is decided by WHERE the text came from, never by its words: text the person received is "mine" (the person owes the answer);
//     text the person sent is "theirs" (someone owes the person). The host passes it in;
//   - the offer never posts. Its steps are "watch that DM" and the person's own answer, which Glance does not write or send.
// No src/ file calls this yet (the steps-list wiring is open-tasks row 80).
const FlowSlackAnswer = (() => {
  function sibling(globalValue, file, name) {
    if (globalValue) return globalValue;
    try { return typeof require !== 'undefined' ? require(file)[name] : null; } catch (e) { return null; }
  }
  const closer = sibling(typeof FlowSlackAnswerClose !== 'undefined' ? FlowSlackAnswerClose : null, './slack-answer-close.js', 'FlowSlackAnswerClose');

  const SWITCH = 'SLACK_ANSWER';
  const SWITCH_DEFAULT = false;
  const SYSTEM = 'slack/message';

  const LINK = /https:\/\/[a-z0-9-]+\.slack\.com\/[^\s<>"')\]]+/gi;
  const ASK_EN = /\b(?:reply|respond|answer|let\s+me\s+know|get\s+back\s+to\s+me|write\s+back|confirm|message\s+me|ping\s+me|update\s+me)\b[^.!?\n]{0,60}\b(?:here|in\s+(?:this|the)\s+(?:slack\s+)?(?:dm|thread|conversation|chat)|on\s+slack|in\s+slack|via\s+slack)\b|\b(?:here|in\s+(?:this|the)\s+(?:slack\s+)?(?:dm|thread|conversation|chat)|on\s+slack|in\s+slack)\b[^.!?\n]{0,40}\b(?:reply|respond|answer|let\s+me\s+know|get\s+back\s+to\s+me|confirm)\b/i;
  const ASK_HE = /(?:תענה|תעני|תענו|תחזור|תחזרי|תחזרו|תכתוב|תכתבי|תכתבו|תעדכן|תעדכני|תעדכנו|תאשר|תאשרי|תאשרו|תודיע|תודיעי|תודיעו)[^.!?\n]{0,60}(?:בסלאק|בסלק|בהודעה\s+הפרטית|כאן|פה)|(?:בסלאק|בסלק)[^.!?\n]{0,40}(?:תענה|תעני|תחזור|תחזרי|תעדכן|תעדכני|תאשר|תאשרי|תודיע|תודיעי)/;
  const NEG = /\b(?:no need (?:to|for)|don'?t (?:need|bother)|do not (?:need|reply)|not necessary|cancel|skip)\b|אין\s+צורך|לא\s+צריך|לא\s+חייב|לבטל/i;
  const HEDGE = /\b(?:maybe|perhaps|if you want|if you'?d like|no pressure|whenever|sometime|at some point)\b|(?:^|[\s,.])אולי(?:[\s,.]|$)|אם\s+בא\s+לך|מתישהו/i;
  const FYI = /\b(?:fyi|for your information|no action needed|here is the recording|recording of)\b|לידיעתך|לידיעה|הקלטה\s+של/i;
  const THIRD = /\b(?:ask|have|get|tell|let)\s+(?!(?:me|us|you)\b)[A-Za-z][\w']*(?:\s+[A-Za-z][\w']*){0,3}\s+(?:to\s+)?(?:reply|answer|respond|confirm)\b|תבקש(?:י|ו)?\s*מ|תגיד(?:י|ו)?\s*ל(?!י(?:\s|$|[.,!?]))/i;

  function enabled(flags) {
    if (!flags || typeof flags !== 'object') return SWITCH_DEFAULT;
    return flags[SWITCH] === true;
  }

  // The one DM the text points at, or a reason for silence.
  function dmOf(text) {
    const links = String(text || '').match(LINK) || [];
    const ids = {};
    let sawOther = false;
    links.forEach((raw) => {
      const id = closer && closer.parseConversation ? closer.parseConversation(raw.replace(/[.,;:!?]+$/, '')) : null;
      if (id) ids[id] = 1; else sawOther = true;
    });
    const list = Object.keys(ids);
    if (list.length === 1 && !sawOther) return { conversation: list[0] };
    if (list.length > 1) return { reason: 'several-chats' };
    return { reason: links.length ? 'not-a-dm-link' : 'no-chat' };
  }

  // The ask, or silence with a reason. direction: "mine" | "theirs" (where the text came from; never read from the words).
  function recognize(text, direction) {
    const s = String(text || '').replace(/[​-‏‪-‮ ]/g, ' ');
    if (!s.trim()) return { kind: 'ignore' };
    if (!/\.slack\.com\//i.test(s)) return { kind: 'ignore' };
    if (direction !== 'mine' && direction !== 'theirs') return { kind: 'block', reason: 'no-direction' };
    if (NEG.test(s)) return { kind: 'block', reason: 'negation' };
    if (FYI.test(s)) return { kind: 'block', reason: 'fyi' };
    if (HEDGE.test(s)) return { kind: 'block', reason: 'hedge' };
    if (THIRD.test(s)) return { kind: 'block', reason: 'third-party' };
    const dm = dmOf(s);
    if (!dm.conversation) return { kind: 'block', reason: dm.reason };
    if (!(ASK_EN.test(s) || ASK_HE.test(s))) return { kind: 'block', reason: 'no-ask' };
    return { kind: 'clear', lang: /[֐-׿]/.test(s) ? 'he' : 'en', conversation: dm.conversation, direction: direction };
  }

  // The plan: one Do It that only starts watching the one DM. Nothing is posted; nothing is closed by the plan.
  function plan(input) {
    input = input || {};
    if (!enabled(input.flags)) return { action: 'off', reason: 'switch-off' };
    const r = recognize(input.text, input.direction);
    if (r.kind !== 'clear') return { action: 'silence', reason: r.reason || 'no-ask' };
    const mine = r.direction === 'mine';
    return {
      action: 'offer',
      approval: 'DoIt',
      conversation: r.conversation,
      direction: r.direction,
      line: r.lang === 'he'
        ? (mine ? 'לעקוב אחרי ההודעה הפרטית הזאת בסלאק ולסגור כשתענה בה?' : 'לעקוב אחרי ההודעה הפרטית הזאת בסלאק ולהודיע כשתגיע תשובה?')
        : (mine ? 'Watch that Slack DM and close this when you have answered there?' : 'Watch that Slack DM and tell you when an answer arrives?'),
      steps: [
        { id: 'watch', kind: 'watch', label: r.lang === 'he' ? 'קריאת ההודעה הפרטית הזאת בלבד (קריאה בלבד)' : 'Read that one DM (read only)', proof: SYSTEM },
        { id: 'answer', kind: 'manual', label: mine ? (r.lang === 'he' ? 'התשובה שלך בסלאק: גלאנס לא כותב ולא שולח' : 'Your answer, in Slack: Glance does not write or send') : (r.lang === 'he' ? 'להחליט אם התשובה סגרה את העניין' : 'You decide whether the answer settles it') }
      ],
      lang: r.lang
    };
  }

  return { SWITCH, SWITCH_DEFAULT, SYSTEM, enabled, recognize, plan, dmOf };
})();

if (typeof module !== 'undefined') module.exports = { FlowSlackAnswer };
else if (typeof globalThis !== 'undefined') globalThis.FlowSlackAnswer = FlowSlackAnswer;
