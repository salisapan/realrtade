// What to do with the last couple of weeks of an Outlook mailbox. Portable: no chrome.*, no DOM, no network, no storage.
// The runner (src/outlook.js) fetches the messages and applies the result; this file only DECIDES, with the same rules Gmail uses
// (core/follow-up.js, core/story.js, core/cross-channel.js), and returns plain data:
//
//   patches  changes to loops that already exist (a reply closed one, a promised day moved one, you chased, you delivered)
//   offers   conversations where YOUR newest message asks for something or promises something and no loop exists yet: shown in the
//            popup as "Waiting on a reply? Stay on it", never created without a tap (as in Gmail)
//   asks     a question to put to the person instead of acting ("Does this settle it?", "Is it paid?")
//   parties  the people met, for core/identity-graph.js
//
// Precision first, exactly as in Gmail: a doubtful message leaves a loop open and says nothing. A message is judged once (the loop
// remembers the id of the last message it acted on).
const FlowOutlookSync = (() => {
  function sibling(globalValue, file, name) {
    if (globalValue) return globalValue;
    try { return typeof require !== 'undefined' ? require(file)[name] : null; } catch (e) { return null; }
  }
  const followUp = sibling(typeof FlowFollowUp !== 'undefined' ? FlowFollowUp : null, './follow-up.js', 'FlowFollowUp');
  const story = sibling(typeof FlowStory !== 'undefined' ? FlowStory : null, './story.js', 'FlowStory');
  const crossChannel = sibling(typeof FlowCrossChannel !== 'undefined' ? FlowCrossChannel : null, './cross-channel.js', 'FlowCrossChannel');
  const identity = sibling(typeof FlowIdentity !== 'undefined' ? FlowIdentity : null, './identity-graph.js', 'FlowIdentity');
  const graphMail = sibling(typeof FlowGraphMail !== 'undefined' ? FlowGraphMail : null, './graph-mail.js', 'FlowGraphMail');
  const channel = sibling(typeof FlowChannel !== 'undefined' ? FlowChannel : null, './channel.js', 'FlowChannel');

  const MAX_OFFERS = 5;
  const MAX_ASKS = 5;
  const watchId = (conv) => 'ol:' + conv;
  const first = (p) => (followUp && followUp.firstName(p && p.name, p && p.email)) || 'They';

  function sortByTime(a, b) { return (a.ts == null ? Infinity : a.ts) - (b.ts == null ? Infinity : b.ts); }

  function dayWord(iso) { return iso || ''; }

  // The sentence shown for a reply's effect on a loop.
  function lineFor(reply, watch, party, res) {
    const who = first(party);
    if (reply.outcome === 'paid') return who + ' says it is paid. Loop closed.';
    if (reply.outcome === 'declined') return who + ' said no. Nothing left to chase, so I closed it.';
    if (reply.outcome === 'promised') return who + ' promised it' + (reply.promisedIso ? ' for ' + dayWord(reply.promisedIso) : '') + '. I moved the next look' + (res && res.patch && res.patch.chaseIso ? ' to ' + res.patch.chaseIso : '') + '.';
    if (reply.outcome === 'yours') return who + ' wrote back and needs something from you.';
    return who + ' replied. Loop closed.';
  }

  // opts: { messages, me, watches, graph, state:{offered,declined}, now, deps:{ extract, types, pipeline } }
  function plan(opts) {
    const o = opts || {};
    const out = { patches: [], offers: [], asks: [], parties: [], lines: [], stats: { conversations: 0, closed: 0, moved: 0, offers: 0 } };
    if (!followUp || !graphMail || !channel) return out;
    const now = typeof o.now === 'number' ? o.now : Date.now();
    const me = o.me;
    const deps = o.deps || {};
    const cls = Object.assign({ now }, deps);
    const watches = Array.isArray(o.watches) ? o.watches : [];
    const state = o.state || {};
    const offered = state.offered || {}, declined = state.declined || {};
    const byId = {};
    (o.messages || []).forEach((m) => { if (m && m.id) byId[m.id] = m; });

    // 1. normalise and group by conversation
    const threads = {};
    Object.keys(byId).forEach((id) => {
      const u = graphMail.toUtterance(byId[id], me);
      if (!u || !u.thread || !u.text.trim()) return;
      (threads[u.thread] = threads[u.thread] || []).push(u);
    });

    const seenParty = {};
    Object.keys(threads).forEach((conv) => {
      const utts = threads[conv].sort(sortByTime);
      const last = utts[utts.length - 1];
      const raws = utts.map((u) => byId[u.id]);
      const cp = graphMail.counterpartOf(raws, me);
      if (cp && cp.email && !seenParty[cp.email]) { seenParty[cp.email] = true; out.parties.push(cp); }
      out.stats.conversations++;
      const id = watchId(conv);
      const w = watches.find((x) => x && x.id === id) || null;
      const lastRaw = byId[last.id] || {};

      // ---- your message is the newest ------------------------------------------------------------------
      if (last.direction === 'out') {
        if (w && w.status === 'waiting') {
          if (w.messageId === last.id) return;
          if (followUp.isMine(w)) {
            if (followUp.deliversFor(w, last.text, null)) { out.patches.push({ id, patch: Object.assign({ messageId: last.id }, followUp.closeAsKept(w, last.ts || now)) }); out.stats.closed++; out.lines.push('Promise kept. Loop closed.'); }
            else out.patches.push({ id, patch: { messageId: last.id } });
          } else if (followUp.looksLikeChase(last.text)) {
            out.patches.push({ id, patch: Object.assign({ messageId: last.id }, followUp.recordNudge(w, last.ts || now, watches)) });
            out.stats.moved++;
            out.lines.push('Chase noted. I will look again later.');
          } else out.patches.push({ id, patch: { messageId: last.id } });
          return;
        }
        if (w) return;                                               // a closed or stopped loop for this conversation: not offered again
        const key = conv + '|' + last.id;
        if (offered[key] || declined[key] || out.offers.length >= MAX_OFFERS) return;
        const ask = followUp.classifyOutgoing(last.text, cls) || followUp.classifyCommitment(last.text, cls);
        if (!ask || !cp) return;
        out.offers.push({
          key, conversationId: conv, messageId: last.id, ask,
          base: { threadId: id, messageId: last.id, subject: String(lastRaw.subject || '').slice(0, 160), counterpart: { name: cp.name, email: cp.email, phone: null }, channel: 'outlook', threadUrl: lastRaw.webLink || null }
        });
        out.stats.offers++;
        return;
      }

      // ---- their message is the newest -------------------------------------------------------------------
      const party = last.from;
      let target = w && w.status === 'waiting' && !followUp.isMine(w) && !followUp.isClock(w) ? w : null;
      let via = null;
      if (!target && !w) {
        // an answer in a thread of its own, or from another app: follow the story
        if (story && followUp.isActive) {
          const hit = story.match(watches, { email: party.email, subject: lastRaw.subject, text: last.text }, { extract: deps.extract, samePerson: identity ? (c) => identity.same(o.graph, c, party) : null });
          if (hit) { target = hit.watch; via = (target.channel || 'gmail') !== 'outlook' ? 'outlook' : null; }
        }
        if (!target && crossChannel && identity) {
          const d = crossChannel.judge(watches, o.graph, party, last.text, { channel: 'outlook', thread: id }, { now, extract: deps.extract });
          if (d) {
            const cw = watches.find((x) => x.id === d.watchId);
            if (cw && cw.lastReplyMessageId !== last.id) {
              if (d.action === 'ask') {
                if (out.asks.length < MAX_ASKS) {
                  const yes = crossChannel.patchFor(cw, Object.assign({}, d, { action: 'close' }), 'outlook', now);
                  if (yes) out.asks.push({ key: 'x|' + cw.id + '|' + last.id, watchId: cw.id, title: first(party) + ' wrote in Outlook.', detail: 'Does this settle “' + String(cw.what || '').slice(0, 80) + '”? I kept the loop open.', yes: Object.assign({ lastReplyMessageId: last.id }, yes) });
                  out.patches.push({ id: cw.id, patch: { crossAskedAt: now } });
                }
              } else {
                const patch = crossChannel.patchFor(cw, d, 'outlook', now);
                if (patch) {
                  out.patches.push({ id: cw.id, patch: Object.assign({ lastReplyMessageId: last.id }, patch) });
                  out.stats[d.action === 'close' ? 'closed' : 'moved']++;
                  out.lines.push(lineFor(d.reply, cw, party, { patch }) + ' (from Outlook)');
                }
              }
            }
          }
          return;
        }
      }
      if (!target || target.lastReplyMessageId === last.id) return;
      const reply = followUp.classifyReply(last.text, target, { now, email: party.email, extract: deps.extract });
      const res = followUp.applyReply(target, reply, last.ts || now);
      if (!res || res.none) return;
      if (res.confirm) {
        // a payment loop answered without saying it was paid: ask, never assume
        if (out.asks.length < MAX_ASKS) out.asks.push({ key: 'p|' + target.id + '|' + last.id, watchId: target.id, title: first(party) + ' replied. Is it paid?', detail: 'Nothing in the message says the payment was sent, so I kept the loop open.', yes: { status: 'resolved', resolvedAt: now, resolvedBy: 'manual', closedAs: 'paid', lastReplyMessageId: last.id } });
        out.patches.push({ id: target.id, patch: Object.assign({}, res.patch, { lastReplyMessageId: last.id }) });
        return;
      }
      const patch = Object.assign({}, res.patch, { lastReplyMessageId: last.id }, via ? { viaChannel: via } : {});
      out.patches.push({ id: target.id, patch });
      if (res.close) out.stats.closed++; else if (res.rescheduled) out.stats.moved++;
      if (res.close || res.rescheduled || res.yours) out.lines.push(lineFor(reply, target, party, res));
    });
    return out;
  }

  return { MAX_OFFERS, MAX_ASKS, watchId, plan };
})();

if (typeof module !== 'undefined') module.exports = { FlowOutlookSync };
