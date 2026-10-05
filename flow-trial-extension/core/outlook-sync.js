// What to do with the last couple of weeks of an Outlook mailbox. Portable: no chrome.*, no DOM, no network, no storage.
// The runner (src/outlook.js) fetches the messages and applies the result; this file only DECIDES, with the same rules Gmail uses
// (core/follow-up.js, core/story.js, core/cross-channel.js, core/intent.js), and returns plain data:
//
//   patches   changes to loops that already exist
//   offers    conversations where YOUR newest message asks/promises and no loop exists yet
//   incoming  someone else asked YOU something (same silence bar as Gmail: FlowIntent.shouldShowChip); Do It creates a reply draft
//   asks      a question to put to the person instead of acting
//   parties   the people met, for core/identity-graph.js
//
// Precision first: a doubtful message leaves a loop open and says nothing. A message is judged once.
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
  const MAX_INCOMING = 5;
  const watchId = (conv) => 'ol:' + conv;
  const first = (p) => (followUp && followUp.firstName(p && p.name, p && p.email)) || 'They';

  function sortByTime(a, b) { return (a.ts == null ? Infinity : a.ts) - (b.ts == null ? Infinity : b.ts); }

  function dayWord(iso) { return iso || ''; }

  function lineFor(reply, watch, party, res) {
    const who = first(party);
    if (reply.outcome === 'paid') return who + ' says it is paid. Loop closed.';
    if (reply.outcome === 'declined') return who + ' said no. Nothing left to chase, so I closed it.';
    if (reply.outcome === 'promised') return who + ' promised it' + (reply.promisedIso ? ' for ' + dayWord(reply.promisedIso) : '') + '. I moved the next look' + (res && res.patch && res.patch.chaseIso ? ' to ' + res.patch.chaseIso : '') + '.';
    if (reply.outcome === 'yours') return who + ' wrote back and needs something from you.';
    return who + ' replied. Loop closed.';
  }

  function meSetOf(me) {
    if (graphMail && graphMail.meSetOf) return graphMail.meSetOf(me);
    if (!me || !channel) return null;
    if (me instanceof Set) return me;
    if (Array.isArray(me)) {
      const s = new Set();
      me.forEach((a) => { const e = channel.normalizeEmail(a); if (e) s.add(e); });
      return s.size ? s : null;
    }
    const e = channel.normalizeEmail(me);
    return e ? new Set([e]) : null;
  }

  // opts: { messages, me, watches, graph, state:{offered,declined,incomingDeclined}, now, deps:{ extract, types, pipeline, intent, factReply } }
  function plan(opts) {
    const o = opts || {};
    const out = { patches: [], offers: [], incoming: [], asks: [], parties: [], lines: [], stats: { conversations: 0, closed: 0, moved: 0, offers: 0, incoming: 0 } };
    if (!followUp || !graphMail || !channel) return out;
    const now = typeof o.now === 'number' ? o.now : Date.now();
    const me = o.me;
    const meSet = meSetOf(me);
    const deps = o.deps || {};
    const cls = Object.assign({ now }, deps);
    const watches = Array.isArray(o.watches) ? o.watches : [];
    const state = o.state || {};
    const offered = state.offered || {}, declined = state.declined || {};
    const incomingDeclined = state.incomingDeclined || {};
    const byId = {};
    (o.messages || []).forEach((m) => { if (m && m.id) byId[m.id] = m; });

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
      // Note to self (every party is me): produce nothing.
      if (!cp) { out.stats.conversations++; return; }
      if (cp.email && !seenParty[cp.email]) { seenParty[cp.email] = true; out.parties.push(cp); }
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
          } else if (w.direction === 'theirs' || w.fromIncoming) {
            // Your sent reply closes an incoming ask. A draft still in Drafts does not (we only see sentitems here).
            out.patches.push({ id, patch: { messageId: last.id, lastReplyMessageId: last.id, status: 'resolved', resolvedAt: last.ts || now, resolvedBy: 'reply', closedAs: 'replied' } });
            out.stats.closed++;
            out.lines.push('You replied. Loop closed.');
          } else out.patches.push({ id, patch: { messageId: last.id } });
          return;
        }
        if (w) return;
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
      // Never classify a message whose sender is in ownAddresses.
      if (meSet && graphMail.isOwn && graphMail.isOwn(party.email, meSet)) return;

      let target = w && w.status === 'waiting' && !followUp.isMine(w) && !followUp.isClock(w) ? w : null;
      let via = null;
      let crossHandled = false;
      if (!target && !w) {
        if (story && followUp.isActive) {
          const hit = story.match(watches, { email: party.email, subject: lastRaw.subject, text: last.text }, { extract: deps.extract, samePerson: identity ? (c) => identity.same(o.graph, c, party) : null });
          if (hit) { target = hit.watch; via = (target.channel || 'gmail') !== 'outlook' ? 'outlook' : null; }
        }
        if (!target && crossChannel && identity) {
          const d = crossChannel.judge(watches, o.graph, party, last.text, { channel: 'outlook', thread: id }, { now, extract: deps.extract });
          if (d) {
            crossHandled = true;
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
        }
      }
      if (target && target.lastReplyMessageId !== last.id) {
        const reply = followUp.classifyReply(last.text, target, { now, email: party.email, extract: deps.extract });
        const res = followUp.applyReply(target, reply, last.ts || now);
        if (res && !res.none) {
          if (res.confirm) {
            if (out.asks.length < MAX_ASKS) out.asks.push({ key: 'p|' + target.id + '|' + last.id, watchId: target.id, title: first(party) + ' replied. Is it paid?', detail: 'Nothing in the message says the payment was sent, so I kept the loop open.', yes: { status: 'resolved', resolvedAt: now, resolvedBy: 'manual', closedAs: 'paid', lastReplyMessageId: last.id } });
            out.patches.push({ id: target.id, patch: Object.assign({}, res.patch, { lastReplyMessageId: last.id }) });
            return;
          }
          const patch = Object.assign({}, res.patch, { lastReplyMessageId: last.id }, via ? { viaChannel: via } : {});
          out.patches.push({ id: target.id, patch });
          if (res.close) out.stats.closed++; else if (res.rescheduled) out.stats.moved++;
          if (res.close || res.rescheduled || res.yours) out.lines.push(lineFor(reply, target, party, res));
          return;
        }
      }
      if (crossHandled) return;
      // An incoming ask in a conversation that already has a loop: handled above as a reply, not as a second item.
      if (w) return;

      // ---- incoming ask: someone else asked you something (same judge Gmail uses) ------------------------
      // Fall through instead of returning silently when no loop / story / crossChannel hit.
      const intentApi = deps.intent || (typeof FlowIntent !== 'undefined' ? FlowIntent : null);
      if (!intentApi || typeof intentApi.classify !== 'function') return;
      if (out.incoming.length >= MAX_INCOMING) return;
      const ikey = conv + '|' + last.id;
      if (incomingDeclined[ikey] || declined[ikey]) return;
      const subject = String(lastRaw.subject || '');
      const text = (subject ? subject + '\n' : '') + last.text;
      const intent = intentApi.classify(text, {
        senderEmail: party.email, senderName: party.name,
        calibration: deps.calibration || null, calibrationByType: deps.calibrationByType || null,
        now: new Date(now)
      });
      if (!intent || !intentApi.shouldShowChip(intent)) return;
      if (deps.factReply && typeof deps.factReply.blocksInbox === 'function' && deps.factReply.blocksInbox(intent, text)) return;
      out.incoming.push({
        key: ikey, conversationId: conv, messageId: last.id, intent,
        base: {
          threadId: id, messageId: last.id, subject: subject.slice(0, 160),
          counterpart: { name: party.name, email: party.email, phone: null },
          channel: 'outlook', threadUrl: lastRaw.webLink || null,
          sender: { name: party.name, email: party.email },
          text: last.text
        }
      });
      out.stats.incoming++;
    });
    return out;
  }

  return { MAX_OFFERS, MAX_ASKS, MAX_INCOMING, watchId, plan };
})();

if (typeof module !== 'undefined') module.exports = { FlowOutlookSync };
