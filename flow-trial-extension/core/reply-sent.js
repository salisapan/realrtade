// The reply you owed was really sent (close map row E3). Portable: no chrome.*,
// no DOM, no network. Behind the off switch REPLY_SENT_CLOSE (default off).
//
// E3 today stops at a reply draft (core/google-drafts.js, the Outlook draft).
// A draft is preparation, not completion (docs/true-close.md): the loop stays
// open until the person presses Send. This module reads the thread after that:
// when a message the person sent in that thread, after the ask, is really sent
// (Gmail label SENT and not DRAFT, or Graph isDraft false), from the person's
// own address, and it answers rather than holds, the loop closes as 'kept',
// resolvedBy 'reply-sent'. Handled needs that sent message read back by id.
//
// Rules:
//   - Glance never sends. This module only reads what the person sent;
//   - a draft that is still a draft never closes anything;
//   - a holding reply ("I'll get back to you", "אחזור אליך", "let me check",
//     "בודק ומעדכן") is not the answer: the loop stays open and the plan says
//     'hold' (the host may offer it as the person's own promise, row E2);
//   - a bare acknowledgement ("Thanks!", "תודה", "OK", "👍") stays open too;
//     quoted text under the reply ("On ... wrote:", "> ...") is not the answer;
//   - only the person's own address counts; a message from anyone else, from
//     another thread, or older than the ask never closes the loop;
//   - nothing is read or changed until the switch is on.
//
// Loop shape: { id, status: 'open'|'waiting', direction: 'mine', threadId,
//   askAt (ms), lang, draftRef?: { draftId, threadId } }.
// Thread messages may be Gmail (users.threads.get, format=full, the host puts
// the decoded body in text) or Graph (/me/messages?$filter=conversationId eq):
//   { id, threadId|conversationId, labelIds?, isDraft?, from, dateMs|sentDateTime, text|bodyPreview }
// The host injects readMessage(id) -> Promise<{ ok, status, message }> for the
// read-back. No src/ file calls this yet.
const FlowReplySent = (() => {
  function sibling(globalValue, file, name) {
    if (globalValue) return globalValue;
    try { return typeof require !== 'undefined' ? require(file)[name] : null; } catch (e) { return null; }
  }
  const proofs = sibling(typeof FlowProofOfClose !== 'undefined' ? FlowProofOfClose : null, './proof-of-close.js', 'FlowProofOfClose');

  const SWITCH = 'REPLY_SENT_CLOSE';
  const SWITCH_DEFAULT = false;

  // The reply only promises a later answer.
  const HOLD_EN = /\b(?:i(?:'ll| will) (?:get back|come back|revert|check|look into|update|let you know|follow up|confirm (?:later|tomorrow|by|on|once|when|after))|(?:let|lemme) me (?:check|look|see|confirm|get back|find out)|will (?:check|revert|update|confirm) (?:and|later|tomorrow|soon|asap|shortly)|(?:checking|looking into it|on it)\b|get back to you|circle back|(?:give|allow) me (?:a|some) (?:day|few|minute|moment|bit|time)|not sure yet|still checking)\b/i;
  const HOLD_HE = /(?:אחזור אלי(?:ך|כם|ייך)|אחזור עם תשובה|אבדוק ו(?:אעדכן|אחזור|אחזיר)|בודק(?:ת)? ו(?:מעדכן|מעדכנת|חוזר|חוזרת)|נבדוק ונעדכן|אעדכן (?:בהמשך|מחר|בקרוב|אחרי)|רגע,? בודק|תן לי לבדוק|תני לי לבדוק|עוד לא יודע|עוד לא יודעת|אני על זה|מטפל(?:ת)? בזה|אחזיר לך תשובה|נחזור אליך)/;
  // A reply that only acknowledges. Nothing else in the message.
  const ACK_ONLY = /^(?:(?:thanks?|thank you|thx|ty|ok(?:ay)?|k|great|perfect|cool|noted|got it|received|sounds good|will do|sure|👍|🙏|תודה(?: רבה)?|אוקיי|אוקי|בסדר|סבבה|מעולה|קיבלתי|מצוין|יופי|רשמתי)[\s!.,…🙏👍]*)+$/i;
  // The quoted original under a reply: everything from the first marker on.
  const QUOTE_HEAD = /(?:^|\n)\s*(?:On .{4,200}?wrote:|בתאריך .{4,200}?(?:נכתב|כתב|כתבה)[^:\n]*:|-{2,}\s*Original Message\s*-{2,}|-{2,}\s*הודעה מקורית\s*-{2,}|From: .+\n(?:Sent|Date): |מאת: .+\n(?:נשלח|תאריך): )/i;

  function enabled(flags) {
    if (!flags || typeof flags !== 'object') return SWITCH_DEFAULT;
    return flags[SWITCH] === true;
  }

  function clean(s) {
    return String(s || '').replace(/[​-‏‪-‮ ]/g, ' ').replace(/[ \t]+/g, ' ').trim();
  }

  // The person's own words: no quoted original, no "> " lines.
  function ownWords(text) {
    let s = String(text || '').replace(/\r\n?/g, '\n');
    const q = s.search(QUOTE_HEAD);
    if (q >= 0) s = s.slice(0, q);
    s = s.split('\n').filter((l) => !/^\s*>/.test(l)).join('\n');
    return clean(s.replace(/\n+/g, ' '));
  }

  // What the sent words do: 'answer', 'hold', 'ack' or 'empty'.
  function readReply(text) {
    const own = ownWords(text);
    if (!own) return 'empty';
    if (ACK_ONLY.test(own)) return 'ack';
    if (HOLD_EN.test(own) || HOLD_HE.test(own)) return 'hold';
    return 'answer';
  }

  function emailOf(v) {
    const raw = v && typeof v === 'object'
      ? ((v.emailAddress && v.emailAddress.address) || v.address || v.email || '')
      : String(v || '');
    const m = String(raw).toLowerCase().match(/[^\s<>"',;:]+@[^\s<>"',;]+\.[a-z0-9-]+/);
    return m ? m[0] : '';
  }

  // One message, Gmail or Graph, in one shape.
  function norm(m) {
    m = m || {};
    const labels = Array.isArray(m.labelIds) ? m.labelIds : null;
    let sent = null;
    if (labels) sent = labels.indexOf('SENT') >= 0 && labels.indexOf('DRAFT') < 0;
    else if (typeof m.isDraft === 'boolean') sent = m.isDraft === false;
    const when = typeof m.dateMs === 'number' ? m.dateMs
      : (m.sentDateTime ? Date.parse(m.sentDateTime) : (m.internalDate ? Number(m.internalDate) : NaN));
    return {
      id: m.id != null ? String(m.id) : '',
      threadId: String(m.threadId || m.conversationId || ''),
      sent: sent === true,
      from: emailOf(m.from),
      dateMs: Number.isFinite(when) ? when : null,
      text: m.text != null ? m.text : (m.bodyPreview || (m.body && m.body.content) || m.snippet || '')
    };
  }

  function openReply(loop) {
    return Boolean(loop) && (loop.status === 'open' || loop.status === 'waiting')
      && loop.direction === 'mine' && Boolean(loop.threadId || (loop.draftRef && loop.draftRef.threadId));
  }

  function threadOf(loop) {
    return String(loop.threadId || (loop.draftRef && loop.draftRef.threadId) || '');
  }

  function silence(reason, extra) {
    return Object.assign({ action: 'silence', reason: reason }, extra || {});
  }

  // The plan: close the loop with the one sent message that answers, hold, or silence.
  //   loop     the person's open reply loop
  //   thread   { messages: [...] } as the host read it
  //   me       the person's own address(es) on this mailbox
  function plan(input) {
    input = input || {};
    if (!enabled(input.flags)) return { action: 'off', reason: 'switch-off' };
    const loop = input.loop;
    if (!openReply(loop)) return silence('no-open-reply');
    const mine = (Array.isArray(input.me) ? input.me : [input.me]).map(emailOf).filter(Boolean);
    if (!mine.length) return silence('no-identity');
    const tid = threadOf(loop);
    const since = typeof loop.askAt === 'number' ? loop.askAt : (typeof loop.createdAt === 'number' ? loop.createdAt : null);
    if (since == null) return silence('no-ask-time');
    const msgs = (input.thread && Array.isArray(input.thread.messages) ? input.thread.messages : []).map(norm);
    const ours = msgs.filter((m) => m.id && m.threadId === tid && mine.indexOf(m.from) >= 0 && m.dateMs != null && m.dateMs > since);
    const sent = ours.filter((m) => m.sent).sort((a, b) => a.dateMs - b.dateMs);
    if (!sent.length) return silence(ours.length ? 'draft-unsent' : 'not-sent');
    const kinds = sent.map((m) => ({ m: m, kind: readReply(m.text) }));
    const answers = kinds.filter((k) => k.kind === 'answer');
    if (!answers.length) {
      const last = kinds[kinds.length - 1];
      if (kinds.some((k) => k.kind === 'hold')) return { action: 'hold', reason: 'holding-reply', messageId: last.m.id };
      return silence(last.kind === 'ack' ? 'ack-only' : 'empty-reply');
    }
    const best = answers[answers.length - 1].m;
    return {
      action: 'close',
      loopId: loop.id,
      messageId: best.id,
      threadId: tid,
      sentAt: best.dateMs,
      line: loop.lang === 'he' ? 'ענית. הלולאה נסגרה.' : 'You replied. Loop closed.'
    };
  }

  function miss(reason, extra) {
    return Object.assign({ ok: false, reason: reason, proof: null }, extra || {});
  }

  // Read the sent message back by id and close the loop. Returns the loop patch;
  // the host stores it with the same storage it uses for core/follow-up.js.
  async function close(input, io) {
    input = input || {};
    io = io || {};
    if (!enabled(input.flags)) return miss('switch-off');
    const planned = input.plan;
    const loop = input.loop;
    if (!planned || planned.action !== 'close' || !loop || loop.id !== planned.loopId) return miss('invalid');
    if (!openReply(loop)) return miss('loop-not-open');
    if (typeof io.readMessage !== 'function') return miss('no-host');
    const mine = (Array.isArray(input.me) ? input.me : [input.me]).map(emailOf).filter(Boolean);
    let got;
    try { got = await io.readMessage(planned.messageId); } catch (e) { got = null; }
    if (!got || got.status === 401 || got.status === 403) return miss('not-connected');
    if (!got.ok || !got.message) return miss('verify_failed', { why: 'gone' });
    const m = norm(got.message);
    if (m.id !== String(planned.messageId)) return miss('verify_failed', { why: 'other-message' });
    if (!m.sent) return miss('verify_failed', { why: 'not-sent' });
    if (m.threadId !== planned.threadId) return miss('verify_failed', { why: 'other-thread' });
    if (mine.indexOf(m.from) < 0) return miss('verify_failed', { why: 'not-from-person' });
    if (readReply(m.text) !== 'answer') return miss('verify_failed', { why: 'not-an-answer' });
    const verifiedAt = typeof input.now === 'string' ? input.now : new Date().toISOString();
    const system = input.surface === 'outlook' ? 'microsoft/mail' : 'gmail/message';
    const proof = proofs ? proofs.buildProof({ system: system, externalId: m.id, fetchedBack: true, verifiedAt: verifiedAt }) : null;
    if (!proof) return miss('proof_pending');
    const t = Date.parse(verifiedAt);
    const before = { status: loop.status, resolvedAt: loop.resolvedAt || null, resolvedBy: loop.resolvedBy || null, closedAs: loop.closedAs || null };
    return {
      ok: true,
      proof: proof,
      patch: { status: 'resolved', resolvedAt: t, resolvedBy: 'reply-sent', closedAs: 'kept', replyProof: proof },
      ref: { loopId: loop.id, before: before, resolvedAt: t, messageId: m.id, createdByGlance: true },
      // The person answered: that is the close they owed. The sent mail itself
      // is theirs; Glance never deletes or recalls it.
      loopClosed: true,
      sentUndo: 'unavailable'
    };
  }

  // Undo: reopen the loop, only while it is still the close Glance made. The
  // sent message is never touched.
  function undo(ref, loopNow) {
    if (!ref || ref.createdByGlance !== true || !ref.before) return { ok: false, reason: 'not-ours' };
    if (!loopNow || loopNow.id !== ref.loopId) return { ok: false, reason: 'loop-gone' };
    const same = loopNow.status === 'resolved' && loopNow.resolvedBy === 'reply-sent' && loopNow.resolvedAt === ref.resolvedAt
      && loopNow.replyProof && String(loopNow.replyProof.externalId) === ref.messageId;
    if (!same) return { ok: false, reason: 'changed-since', undoUnavailable: true };
    return { ok: true, undone: true, patch: Object.assign({}, ref.before, { replyProof: null }) };
  }

  return { SWITCH, SWITCH_DEFAULT, enabled, ownWords, readReply, norm, plan, close, undo };
})();

if (typeof module !== 'undefined') module.exports = { FlowReplySent };
else if (typeof globalThis !== 'undefined') globalThis.FlowReplySent = FlowReplySent;
