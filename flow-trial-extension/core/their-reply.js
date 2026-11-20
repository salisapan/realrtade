// Their reply finishes your wait, proven (close map row E9). Portable: no chrome.*,
// no DOM, no network. Behind the off switch THEIR_REPLY_PROOF (default off).
//
// core/follow-up.js already reads what a reply means (classifyReply: closed,
// promised, ack, question, blocked, declined, paid, auto) and today closes a
// waiting loop on it with resolvedBy 'reply' and no proof. This module is the
// proven close: the reply is read back by id from the mailbox, it must be from
// the person you are waiting on, in that thread, after you asked, and its words
// must still mean done. Only then the loop closes with a ProofOfClose
// (`gmail/message` or `microsoft/mail`).
//
// Rules:
//   - 'closed' closes as 'replied' (or 'delivered' when the loop waited on a file
//     and the reply says it is attached); 'declined' closes as 'declined' (their
//     deliberate release);
//   - a payment loop never closes on "I paid" / «שולם»: that is a claim, not
//     money received (owner, 2026-10-10). The plan says 'claimed' and the loop
//     waits for the notice (core/money-arrived.js, row Y3);
//   - "Perfect", "thanks", out of office, a promise, a question back and "I never
//     got it" never close; the plan says why;
//   - a message from anyone else (including the person themselves), from another
//     thread, or older than the loop never closes it;
//   - nothing is read or changed until the switch is on.
//
// Loop shape (core/follow-up.js): { id, status: 'waiting', direction: 'theirs',
//   kind: 'reply'|'payment', counterpart: { email }, threadId, createdAt, lang }.
// The host passes the thread's messages ({ id, threadId|conversationId, from,
// dateMs|receivedDateTime, text|bodyPreview }) and injects readMessage(id) for
// the read-back. No src/ file calls this yet.
const FlowTheirReply = (() => {
  function sibling(globalValue, file, name) {
    if (globalValue) return globalValue;
    try { return typeof require !== 'undefined' ? require(file)[name] : null; } catch (e) { return null; }
  }
  const proofs = sibling(typeof FlowProofOfClose !== 'undefined' ? FlowProofOfClose : null, './proof-of-close.js', 'FlowProofOfClose');
  const followUp = sibling(typeof FlowFollowUp !== 'undefined' ? FlowFollowUp : null, './follow-up.js', 'FlowFollowUp');

  const SWITCH = 'THEIR_REPLY_PROOF';
  const SWITCH_DEFAULT = false;
  const QUOTE_HEAD = /(?:^|\n)\s*(?:On .{4,200}?wrote:|בתאריך .{4,200}?(?:נכתב|כתב|כתבה)[^:\n]*:|-{2,}\s*Original Message\s*-{2,}|-{2,}\s*הודעה מקורית\s*-{2,}|From: .+\n(?:Sent|Date): |מאת: .+\n(?:נשלח|תאריך): )/i;

  function enabled(flags) {
    if (!flags || typeof flags !== 'object') return SWITCH_DEFAULT;
    return flags[SWITCH] === true;
  }

  function ownWords(text) {
    let s = String(text || '').replace(/\r\n?/g, '\n');
    const q = s.search(QUOTE_HEAD);
    if (q >= 0) s = s.slice(0, q);
    return s.split('\n').filter((l) => !/^\s*>/.test(l)).join('\n').replace(/[​-‏‪-‮ ]/g, ' ').trim();
  }

  function emailOf(v) {
    const raw = v && typeof v === 'object' ? ((v.emailAddress && v.emailAddress.address) || v.address || v.email || '') : String(v || '');
    const m = String(raw).toLowerCase().match(/[^\s<>"',;:]+@[^\s<>"',;]+\.[a-z0-9-]+/);
    return m ? m[0] : '';
  }

  function norm(m) {
    m = m || {};
    const when = typeof m.dateMs === 'number' ? m.dateMs
      : (m.receivedDateTime ? Date.parse(m.receivedDateTime) : (m.internalDate ? Number(m.internalDate) : NaN));
    const labels = Array.isArray(m.labelIds) ? m.labelIds : [];
    return {
      id: m.id != null ? String(m.id) : '',
      threadId: String(m.threadId || m.conversationId || ''),
      from: emailOf(m.from),
      draft: labels.indexOf('DRAFT') >= 0 || m.isDraft === true,
      dateMs: Number.isFinite(when) ? when : null,
      text: m.text != null ? m.text : (m.bodyPreview || (m.body && m.body.content) || m.snippet || '')
    };
  }

  function waiting(loop) {
    return Boolean(loop) && loop.status === 'waiting' && loop.direction !== 'mine'
      && Boolean(loop.threadId) && Boolean(emailOf(loop.counterpart && loop.counterpart.email));
  }

  // What their words mean for this loop: { close: 'replied'|'delivered'|'declined' } or { hold: reason }.
  function judge(text, loop, now) {
    if (!followUp || typeof followUp.classifyReply !== 'function') return { hold: 'no-reader' };
    const kind = loop.kind === 'payment' ? 'payment' : 'reply';
    const r = followUp.classifyReply(ownWords(text), { kind: kind }, { now: typeof now === 'number' ? now : Date.now(), email: emailOf(loop.counterpart.email) });
    const o = r && r.outcome;
    if (o === 'declined') return { close: 'declined', outcome: o };
    if (o === 'paid' || (kind === 'payment' && (o === 'closed' || o === 'answered'))) return { hold: 'claimed', outcome: o };
    if (o === 'closed') return { close: loop.file ? 'delivered' : 'replied', outcome: o };
    return { hold: o === 'yours' ? (r.reason || 'yours') : (o || 'unknown'), outcome: o };
  }

  function silence(reason, extra) { return Object.assign({ action: 'silence', reason: reason }, extra || {}); }

  // The plan: close the loop on their newest reply that means done, hold with the reason, or silence.
  function plan(input) {
    input = input || {};
    if (!enabled(input.flags)) return { action: 'off', reason: 'switch-off' };
    const loop = input.loop;
    if (!waiting(loop)) return silence('no-waiting-loop');
    const them = emailOf(loop.counterpart.email);
    const since = typeof loop.createdAt === 'number' ? loop.createdAt : null;
    if (since == null) return silence('no-start-time');
    const msgs = (input.thread && Array.isArray(input.thread.messages) ? input.thread.messages : []).map(norm)
      .filter((m) => m.id && !m.draft && m.threadId === String(loop.threadId) && m.from === them && m.dateMs != null && m.dateMs > since)
      .sort((a, b) => a.dateMs - b.dateMs);
    if (!msgs.length) return silence('no-reply');
    const last = msgs[msgs.length - 1];
    const j = judge(last.text, loop, input.now);
    if (!j.close) return { action: 'hold', reason: j.hold, messageId: last.id };
    const he = loop.lang === 'he';
    const lines = {
      replied: he ? 'ענו לך. הלולאה נסגרה.' : 'They answered. Loop closed.',
      delivered: he ? 'שלחו את מה שחיכית לו. הלולאה נסגרה.' : 'They sent what you were waiting for. Loop closed.',
      declined: he ? 'אמרו לא. הלולאה נסגרה.' : 'They said no. Loop closed.'
    };
    return { action: 'close', loopId: loop.id, messageId: last.id, threadId: String(loop.threadId), closedAs: j.close, line: lines[j.close] };
  }

  function miss(reason, extra) { return Object.assign({ ok: false, reason: reason, proof: null }, extra || {}); }

  // Read their reply back by id and close the loop. Returns the loop patch.
  async function close(input, io) {
    input = input || {};
    io = io || {};
    if (!enabled(input.flags)) return miss('switch-off');
    const p = input.plan;
    const loop = input.loop;
    if (!p || p.action !== 'close' || !loop || loop.id !== p.loopId) return miss('invalid');
    if (!waiting(loop)) return miss('loop-not-open');
    if (typeof io.readMessage !== 'function') return miss('no-host');
    let got;
    try { got = await io.readMessage(p.messageId); } catch (e) { got = null; }
    if (!got || got.status === 401 || got.status === 403) return miss('not-connected');
    if (!got.ok || !got.message) return miss('verify_failed', { why: 'gone' });
    const m = norm(got.message);
    if (m.id !== String(p.messageId)) return miss('verify_failed', { why: 'other-message' });
    if (m.threadId !== p.threadId) return miss('verify_failed', { why: 'other-thread' });
    if (m.from !== emailOf(loop.counterpart.email)) return miss('verify_failed', { why: 'not-from-them' });
    if (m.draft) return miss('verify_failed', { why: 'draft' });
    const j = judge(m.text, loop, input.nowMs);
    if (j.close !== p.closedAs) return miss('verify_failed', { why: 'meaning-differs' });
    const verifiedAt = typeof input.now === 'string' ? input.now : new Date().toISOString();
    const system = input.surface === 'outlook' ? 'microsoft/mail' : 'gmail/message';
    const proof = proofs ? proofs.buildProof({ system: system, externalId: m.id, fetchedBack: true, verifiedAt: verifiedAt }) : null;
    if (!proof) return miss('proof_pending');
    const t = Date.parse(verifiedAt);
    const before = { status: loop.status, resolvedAt: loop.resolvedAt || null, resolvedBy: loop.resolvedBy || null, closedAs: loop.closedAs || null };
    return {
      ok: true,
      proof: proof,
      patch: { status: 'resolved', resolvedAt: t, resolvedBy: 'reply', closedAs: p.closedAs, replyProof: proof },
      ref: { loopId: loop.id, before: before, resolvedAt: t, messageId: m.id, createdByGlance: true },
      loopClosed: true
    };
  }

  // Undo: reopen the loop, only while it is still the close Glance made.
  function undo(ref, loopNow) {
    if (!ref || ref.createdByGlance !== true || !ref.before) return { ok: false, reason: 'not-ours' };
    if (!loopNow || loopNow.id !== ref.loopId) return { ok: false, reason: 'loop-gone' };
    const same = loopNow.status === 'resolved' && loopNow.resolvedBy === 'reply' && loopNow.resolvedAt === ref.resolvedAt
      && loopNow.replyProof && String(loopNow.replyProof.externalId) === ref.messageId;
    if (!same) return { ok: false, reason: 'changed-since', undoUnavailable: true };
    return { ok: true, undone: true, patch: Object.assign({}, ref.before, { replyProof: null }) };
  }

  return { SWITCH, SWITCH_DEFAULT, enabled, ownWords, judge, plan, close, undo };
})();

if (typeof module !== 'undefined') module.exports = { FlowTheirReply };
else if (typeof globalThis !== 'undefined') globalThis.FlowTheirReply = FlowTheirReply;
