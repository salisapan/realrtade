// A request that points at one Microsoft Teams chat ("reply to me here: <chat link>", "let me know in the Teams chat", «תחזור אליי בצ'אט
// בטימס») becomes one offer: watch THAT chat for the person's own answer and count the loop closed when the answer is read back
// (core/teams-answer-close.js). Portable: no chrome.*, no DOM, no network. Behind the off switch TEAMS_ANSWER (default off; the
// connector's own switch teamsAnswerReadBack is separate, config/connectors.public.js).
//
// Rules:
//   - the text must carry exactly ONE Teams chat link (https://teams.microsoft.com/l/chat/<id>/0). A chat is never guessed from a
//     name or "the latest chat"; no link, a link to a meeting or a channel, or two different chats is silence;
//   - the text must ask for an answer in the chat: "reply / answer / let me know / get back to me / confirm" in the chat, English or Hebrew;
//   - hedge, negation, FYI and "ask Dana to answer" stay silent; a text with no ask stays silent;
//   - direction is decided by WHERE the text came from, never by its words: text the person received is "mine" (the person owes the
//     answer); text the person sent is "theirs" (someone owes the person). The host passes it in;
//   - the offer never posts. Its only steps are "watch that chat" and, when the person's own reply is read back, "close".
// No src/ file calls this yet (the steps-list wiring is open-tasks row 80).
const FlowTeamsAnswer = (() => {
  function sibling(globalValue, file, name) {
    if (globalValue) return globalValue;
    try { return typeof require !== 'undefined' ? require(file)[name] : null; } catch (e) { return null; }
  }
  const closer = sibling(typeof FlowTeamsAnswerClose !== 'undefined' ? FlowTeamsAnswerClose : null, './teams-answer-close.js', 'FlowTeamsAnswerClose');

  const SWITCH = 'TEAMS_ANSWER';
  const SWITCH_DEFAULT = false;
  const SYSTEM = 'teams/chat-message';

  const LINK = /https:\/\/(?:teams\.microsoft\.com|teams\.live\.com)\/l\/[^\s<>"')\]]+/gi;
  const ASK_EN = /\b(?:reply|respond|answer|let\s+me\s+know|get\s+back\s+to\s+me|write\s+back|confirm|message\s+me|ping\s+me|update\s+me)\b[^.!?\n]{0,60}\b(?:here|in\s+(?:this|the)\s+(?:teams\s+)?chat|on\s+teams|in\s+teams|via\s+teams)\b|\b(?:here|in\s+(?:this|the)\s+(?:teams\s+)?chat|on\s+teams|in\s+teams)\b[^.!?\n]{0,40}\b(?:reply|respond|answer|let\s+me\s+know|get\s+back\s+to\s+me|confirm)\b/i;
  const ASK_HE = /(?:תענה|תעני|תענו|תחזור|תחזרי|תחזרו|תכתוב|תכתבי|תכתבו|תעדכן|תעדכני|תעדכנו|תאשר|תאשרי|תאשרו|תודיע|תודיעי|תודיעו|שלח(?:י|ו)?\s+לי\s+תשובה)[^.!?\n]{0,60}(?:בצ'אט|בצאט|בטימס|בטימז|כאן|פה)|(?:בצ'אט|בצאט|בטימס|בטימז)[^.!?\n]{0,40}(?:תענה|תעני|תחזור|תחזרי|תעדכן|תעדכני|תאשר|תאשרי|תודיע|תודיעי)/;
  const NEG = /\b(?:no need (?:to|for)|don'?t (?:need|bother)|do not (?:need|reply)|not necessary|cancel|skip)\b|אין\s+צורך|לא\s+צריך|לא\s+חייב|לבטל/i;
  const HEDGE = /\b(?:maybe|perhaps|if you want|if you'?d like|no pressure|whenever|sometime|at some point)\b|(?:^|[\s,.])אולי(?:[\s,.]|$)|אם\s+בא\s+לך|מתישהו/i;
  const FYI = /\b(?:fyi|for your information|no action needed|here is the recording|recording of)\b|לידיעתך|לידיעה|הקלטה\s+של/i;
  const THIRD = /\b(?:ask|have|get|tell|let)\s+(?!(?:me|us|you)\b)[A-Za-z][\w']*(?:\s+[A-Za-z][\w']*){0,3}\s+(?:to\s+)?(?:reply|answer|respond|confirm)\b|תבקש(?:י|ו)?\s*מ|תגיד(?:י|ו)?\s*ל(?!י(?:\s|$|[.,!?]))/i;

  function enabled(flags) {
    if (!flags || typeof flags !== 'object') return SWITCH_DEFAULT;
    return flags[SWITCH] === true;
  }

  // The one chat the text points at, or a reason for silence.
  function chatOf(text) {
    const links = String(text || '').match(LINK) || [];
    const ids = {};
    let sawOther = false;
    links.forEach((raw) => {
      const clean = raw.replace(/[.,;:!?]+$/, '');
      const id = closer && closer.parseChatId ? closer.parseChatId(clean) : null;
      if (id) ids[id] = 1; else sawOther = true;
    });
    const list = Object.keys(ids);
    if (list.length === 1 && !sawOther) return { chatId: list[0] };
    if (list.length > 1) return { reason: 'several-chats' };
    return { reason: links.length ? 'not-a-chat-link' : 'no-chat' };
  }

  // The ask, or silence with a reason. direction: "mine" | "theirs" (where the text came from; never read from the words).
  function recognize(text, direction) {
    const s = String(text || '').replace(/[​-‏‪-‮ ]/g, ' ');
    if (!s.trim()) return { kind: 'ignore' };
    if (!/teams\.(?:microsoft|live)\.com/i.test(s)) return { kind: 'ignore' };
    if (direction !== 'mine' && direction !== 'theirs') return { kind: 'block', reason: 'no-direction' };
    if (NEG.test(s)) return { kind: 'block', reason: 'negation' };
    if (FYI.test(s)) return { kind: 'block', reason: 'fyi' };
    if (HEDGE.test(s)) return { kind: 'block', reason: 'hedge' };
    if (THIRD.test(s)) return { kind: 'block', reason: 'third-party' };
    const chat = chatOf(s);
    if (!chat.chatId) return { kind: 'block', reason: chat.reason };
    if (!(ASK_EN.test(s) || ASK_HE.test(s))) return { kind: 'block', reason: 'no-ask' };
    return { kind: 'clear', lang: /[֐-׿]/.test(s) ? 'he' : 'en', chatId: chat.chatId, direction: direction };
  }

  // The plan: one Do It that only starts watching the one chat. Nothing is posted; nothing is closed by the plan.
  function plan(input) {
    input = input || {};
    if (!enabled(input.flags)) return { action: 'off', reason: 'switch-off' };
    const r = recognize(input.text, input.direction);
    if (r.kind !== 'clear') return { action: 'silence', reason: r.reason || 'no-ask' };
    const mine = r.direction === 'mine';
    return {
      action: 'offer',
      approval: 'DoIt',
      chatId: r.chatId,
      direction: r.direction,
      line: r.lang === 'he'
        ? (mine ? "לעקוב אחרי הצ'אט הזה ולסגור כשתענה בו?" : "לעקוב אחרי הצ'אט הזה ולהודיע כשתגיע תשובה?")
        : (mine ? 'Watch that Teams chat and close this when you have answered there?' : 'Watch that Teams chat and tell you when an answer arrives?'),
      steps: [
        { id: 'watch', kind: 'watch', label: r.lang === 'he' ? "קריאת הצ'אט הזה בלבד (קריאה בלבד)" : 'Read that one chat (read only)', proof: SYSTEM },
        { id: 'answer', kind: 'manual', label: mine ? (r.lang === 'he' ? "התשובה שלך בצ'אט: גלאנס לא כותב ולא שולח" : 'Your answer, in the chat: Glance does not write or send') : (r.lang === 'he' ? 'להחליט אם התשובה סגרה את העניין' : 'You decide whether the answer settles it') }
      ],
      lang: r.lang
    };
  }

  return { SWITCH, SWITCH_DEFAULT, SYSTEM, enabled, recognize, plan, chatOf };
})();

if (typeof module !== 'undefined') module.exports = { FlowTeamsAnswer };
else if (typeof globalThis !== 'undefined') globalThis.FlowTeamsAnswer = FlowTeamsAnswer;
