// An answer in one app that settles a loop opened in another. Portable: no chrome.*, no DOM, no network.
//
// You emailed Dana for the signed lease; she answers on WhatsApp. Glance should not keep chasing her by email, and it should not
// close the loop on a guess either. The rules (precision first, like everything that closes a loop, core/follow-up.js):
//   - the sender must be the SAME PERSON as the loop's counterpart on hard evidence (core/identity-graph.js: same email or phone);
//   - only loops that wait on THEM are considered; your own promises and clocks are never settled by someone else's message;
//   - a message that names the same reference number, or the same amount on a payment loop, belongs to that loop ('topical');
//   - a topical message that reads as an answer, a payment or a "no" closes the loop with a receipt and Reopen ('close');
//   - a message with no such link only ASKS, and only when that person has exactly one open loop, the message is a real sentence AND
//     it reads like an answer (a delivery, a payment, a "no", a promised day); "ok", "thanks", chat and an out-of-office never ask,
//     and anything that hands the ball back to you never asks or closes;
//   - two loops that fit equally: silence. A loop that was asked about recently is not asked about again.
const FlowCrossChannel = (() => {
  function sibling(globalValue, file, name) {
    if (globalValue) return globalValue;
    try { return typeof require !== 'undefined' ? require(file)[name] : null; } catch (e) { return null; }
  }
  const identity = sibling(typeof FlowIdentity !== 'undefined' ? FlowIdentity : null, './identity-graph.js', 'FlowIdentity');
  const story = sibling(typeof FlowStory !== 'undefined' ? FlowStory : null, './story.js', 'FlowStory');
  const followUp = sibling(typeof FlowFollowUp !== 'undefined' ? FlowFollowUp : null, './follow-up.js', 'FlowFollowUp');
  const extractMod = sibling(typeof FlowExtract !== 'undefined' ? FlowExtract : null, './extract.js', 'FlowExtract');

  const ASK_COOLDOWN_MS = 3 * 24 * 3600 * 1000;
  const MIN_WORDS = 4;

  function words(t) { return (String(t || '').match(/\S+/g) || []).length; }

  // Open loops waiting on this person, in any app, other than the very conversation the message arrived in.
  function candidates(watches, graph, sender, where) {
    const w0 = where || {};
    return (Array.isArray(watches) ? watches : []).filter((w) => w && w.status === 'waiting' && w.direction !== 'mine' && w.direction !== 'clock'
      && w.counterpart && identity.same(graph, w.counterpart, sender)
      && !(w0.thread && w.threadId === w0.thread && (w.channel || 'gmail') === (w0.channel || 'gmail')));
  }

  function topical(watch, text, ex) {
    const wrefs = story.refs((watch.subject || '') + ' ' + (watch.what || ''));
    const mrefs = story.refs(text);
    if (Array.from(mrefs).some((r) => wrefs.has(r))) return 'ref';
    if (watch.kind === 'payment' && watch.amount && watch.amount.value > 0 && ex && ex.parseMoney) {
      const m = ex.parseMoney(String(text || ''));
      if (m && Math.abs(m.value - watch.amount.value) < 0.005 && (!watch.amount.currency || !m.currency || m.currency === watch.amount.currency)) return 'amount';
    }
    return null;
  }

  // sender: a party (core/channel.js). where: { channel, thread }. opts: { now, extract }.
  // Returns null or { watchId, action: 'close' | 'promised' | 'ask', reply, link: 'ref'|'amount'|'person' }.
  function judge(watches, graph, sender, text, where, opts) {
    const o = opts || {};
    const now = typeof o.now === 'number' ? o.now : Date.now();
    const ex = o.extract || extractMod;
    const body = String(text || '').trim();
    if (!identity || !story || !followUp || !body) return null;
    const cands = candidates(watches, graph, sender, where);
    if (!cands.length) return null;

    // Which loop is it about? A topical link picks one; otherwise only a person with exactly one loop qualifies.
    const linked = cands.map((w) => ({ w, link: topical(w, body, ex) })).filter((x) => x.link);
    let pick = null;
    if (linked.length === 1) pick = linked[0];
    else if (linked.length > 1) return null;                         // two loops fit: do not guess
    else if (cands.length === 1) pick = { w: cands[0], link: 'person' };
    else return null;

    const reply = followUp.classifyReply(body, pick.w, { now, email: sender && sender.email, extract: ex });
    if (!reply || reply.outcome === 'auto' || reply.outcome === 'ack' || reply.outcome === 'yours' || reply.outcome === 'answered') return null;

    if (pick.link === 'person') {
      // No topical link: at most a question, never an action, and not for a loop asked about lately or for a throwaway message.
      if (words(body) < MIN_WORDS) return null;
      if (pick.w.crossAskedAt && now - pick.w.crossAskedAt < ASK_COOLDOWN_MS) return null;
      // Silence is better than a weak question: with no link to the loop, the message must at least READ like an answer
      // (a stated delivery, payment, decline or a promised day), never just "they wrote something".
      if (reply.outcome === 'closed' && reply.basis === 'default') return null;
      return { watchId: pick.w.id, action: 'ask', reply, link: 'person' };
    }
    if (reply.outcome === 'promised') return { watchId: pick.w.id, action: 'promised', reply, link: pick.link };
    if (reply.outcome === 'closed' && reply.basis === 'default') return { watchId: pick.w.id, action: 'ask', reply, link: pick.link }; // linked, but no cue that it is an answer
    return { watchId: pick.w.id, action: 'close', reply, link: pick.link };
  }

  // The patch a close writes, in the shape core/follow-up.js applyReply() produces, plus where the answer came from.
  function patchFor(watch, decision, channel, now) {
    const res = followUp.applyReply(watch, decision.reply, now);
    if (!res || res.none || !res.patch) return null;
    return Object.assign({}, res.patch, { viaChannel: channel || null });
  }

  return { ASK_COOLDOWN_MS, candidates, topical, judge, patchFor };
})();

if (typeof module !== 'undefined') module.exports = { FlowCrossChannel };
