// The refund lane: the wiring that makes a refund get done, end to end, on any mail surface. Portable: no chrome.*, no DOM,
// no network. The host (Gmail today, the Outlook twin next: surfaces rule 2026-10-22) injects storage, a read-back by id, and
// its draft writer, then calls four hooks. Each hook is a no-op while the switch is off.
//
//   onSent(msg)     the person sent a message: a refund request opens a loop (core/refund-loop.js ask); a later message to
//                   the same merchant (same thread, or the same order number) is a reminder (core/refund-chase.js remindedPatch),
//                   whatever its words: an edited Glance draft and a hand-written one count the same
//   onReply(msg)    the merchant answered on the thread: the stage moves (approved with a date, declined, store credit, needs-you)
//   onOpened(msg)   the person opened a notice: a card, bank or app credit from that merchant for that amount closes the loop,
//                   but only after the host READ IT BACK BY ID (ProofOfClose fetchedBack). A failed read-back leaves it open.
//                   A part of the amount is counted; an unnamed credit with the amount asks once
//   today()         every open loop with its next move (core/refund-chase.js plan): the line for the Loops panel
//   doIt(loopId)    writes the move's draft through the host's draft writer. Never sends. The draft is not a reminder until the
//                   person sends it (onSent sees it), and never a close
//   release / reopen / answerAsk
//
// Switches: REFUND_LOOP (the lane at all) and REFUND_CHASE (the next move and its draft), both off by default, both read from
// the host's switches on every call. Real-user A/B (core/pmf-metrics.js experiment 'refund-loop'): when the host passes a
// variant and a fold, the lane emits counts only (an event name), never text.
const FlowRefundLane = (() => {
  function sibling(globalValue, file, name) {
    if (globalValue) return globalValue;
    try { return typeof require !== 'undefined' ? require(file)[name] : null; } catch (e) { return null; }
  }
  const loopMod = sibling(typeof FlowRefundLoop !== 'undefined' ? FlowRefundLoop : null, './refund-loop.js', 'FlowRefundLoop');
  const chase = sibling(typeof FlowRefundChase !== 'undefined' ? FlowRefundChase : null, './refund-chase.js', 'FlowRefundChase');

  function domainOf(email) { const m = /@([^>\s]+)>?\s*$/.exec(String(email || '').trim().toLowerCase()); return m ? m[1] : ''; }
  function iso(t) { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  // host: { switches(): {REFUND_LOOP, REFUND_CHASE}, load(): Promise<loops[]>, save(loops): Promise,
  //         readBack(id): Promise<{ok, message:{id}}>, writeDraft(draft): Promise<{ok, id}>, now(): number,
  //         ab?: { variant: 'A'|'B', emit(event) } }
  function create(host) {
    const sw = () => (host && typeof host.switches === 'function' ? host.switches() : {}) || {};
    const on = () => sw().REFUND_LOOP === true && Boolean(loopMod);
    const chaseOn = () => on() && sw().REFUND_CHASE === true && Boolean(chase);
    const now = () => (host && typeof host.now === 'function' ? host.now() : Date.now());
    const emit = (e) => { try { if (host && host.ab && typeof host.ab.emit === 'function') host.ab.emit(e); } catch (x) { /* counts are never worth a failure */ } };
    const showB = () => !(host && host.ab && host.ab.variant === 'A');                     // arm A counts but shows nothing
    async function load() { const l = await host.load(); return Array.isArray(l) ? l : []; }
    async function save(l) { await host.save(l); }
    function sameMerchant(loop, email) {
      const a = String(email || '').trim().toLowerCase();
      return Boolean(a) && (a === loop.email || (domainOf(a) && domainOf(a) === domainOf(loop.email)));
    }

    async function onSent(msg) {
      if (!on() || !msg) return null;
      const loops = await load();
      const t = now();
      // A later message to the same merchant about the same refund is a reminder, whatever its words.
      const mine = loops.filter((l) => l.status === 'open' && sameMerchant(l, msg.to) && (
        l.threadId === msg.threadId || (l.orderNo && new RegExp('(?:^|\\D)' + l.orderNo + '(?!\\d)').test(String(msg.text || '')))));
      if (mine.length === 1 && mine[0].sentIds.indexOf(msg.id) < 0) {
        const l = mine[0];
        Object.assign(l, chase ? chase.remindedPatch(l, t) : { reminders: (l.reminders || 0) + 1, lastReminderIso: iso(t) });
        l.sentIds.push(msg.id);
        await save(loops);
        return { kind: 'reminder', loopId: l.id, reminders: l.reminders };
      }
      if (mine.length > 1) return null;                                                     // two refunds fit: do not guess
      const ask = loopMod.ask(msg.text, { enabled: true, to: msg.to, toName: msg.toName, now: t });
      if (!ask) return null;
      const id = 'refund:' + String(msg.threadId || msg.id);
      if (loops.some((l) => l.id === id)) return null;
      const loop = Object.assign({ id, threadId: msg.threadId || null, sentIds: [msg.id], askedAt: iso(t) }, ask, { askedAt: iso(t) });
      loops.push(loop);
      await save(loops);
      emit('refund_asked');
      return { kind: 'opened', loopId: id };
    }

    async function onReply(msg) {
      if (!on() || !msg) return null;
      const loops = await load();
      const l = loops.find((x) => x.status === 'open' && x.threadId === msg.threadId && sameMerchant(x, msg.fromEmail));
      if (!l) return null;
      const st = loopMod.reply(l, msg.text, { enabled: true, now: now() });
      if (!st) return null;
      Object.assign(l, st);
      await save(loops);
      return { kind: 'stage', loopId: l.id, stage: st.stage };
    }

    async function onOpened(msg) {
      if (!on() || !msg) return null;
      const loops = await load();
      const d = loopMod.judge(loops, msg, { enabled: true });
      if (!d) return null;
      const l = loops.find((x) => x.id === d.loopId);
      if (d.verdict === 'ask') { l.pendingAsk = { msgId: msg.id }; await save(loops); return { kind: 'ask', loopId: l.id }; }
      // ProofOfClose: the notice is read back by id before anything is counted or closed.
      let back = null;
      try { back = await host.readBack(msg.id); } catch (e) { back = null; }
      const fetchedBack = Boolean(back && back.ok && back.message && back.message.id === msg.id);
      if (!fetchedBack) return { kind: 'verifying', loopId: l.id };
      if (d.verdict === 'partial') {
        Object.assign(l, loopMod.partialPatch(l, d, { id: msg.id, fetchedBack }, now()));
        await save(loops);
        return { kind: 'partial', loopId: l.id, received: l.received };
      }
      Object.assign(l, loopMod.closePatch(l, d, { id: msg.id, fetchedBack }, now()));
      await save(loops);
      emit('refund_money_back');
      return { kind: 'closed', loopId: l.id, proof: l.proof };
    }

    // The person's answer to the one question ("Was this the refund?"): yes closes with that notice, read back again.
    async function answerAsk(loopId, yes) {
      if (!on()) return null;
      const loops = await load();
      const l = loops.find((x) => x.id === loopId && x.status === 'open' && x.pendingAsk);
      if (!l) return null;
      const msgId = l.pendingAsk.msgId;
      delete l.pendingAsk;
      if (!yes) { await save(loops); return { kind: 'kept-open', loopId }; }
      const back = await host.readBack(msgId).catch(() => null);
      if (!(back && back.ok && back.message && back.message.id === msgId)) { await save(loops); return { kind: 'verifying', loopId }; }
      Object.assign(l, loopMod.closePatch(l, { kind: 'card' }, { id: msgId, fetchedBack: true }, now()), { resolvedBy: 'person-confirmed' });
      await save(loops);
      emit('refund_money_back');
      return { kind: 'closed', loopId, proof: l.proof };
    }

    // The Loops panel's lines: every open loop, with its next move when REFUND_CHASE is on.
    async function today() {
      if (!on() || !showB()) return [];
      const loops = await load();
      const t = now();
      const out = loops.filter((l) => l.status === 'open').map((l) => ({ loop: l, move: chaseOn() ? chase.plan(l, { enabled: true, now: t }) : null }));
      out.forEach((x) => {
        if (x.move && x.move.step === 'remind-merchant' && x.loop.stage === 'approved' && !x.loop.notBackCounted) { x.loop.notBackCounted = true; emit('refund_not_back_by_day'); }
        if (!x.loop.shownCounted) { x.loop.shownCounted = true; emit('refund_loop_shown'); }
      });
      await save(loops);
      return out;
    }

    // The person's Do It on a move with a draft: the host writes the draft (Gmail or Outlook). Nothing is sent.
    async function doIt(loopId) {
      if (!chaseOn()) return null;
      const loops = await load();
      const l = loops.find((x) => x.id === loopId && x.status === 'open');
      if (!l) return null;
      const move = chase.plan(l, { enabled: true, now: now() });
      if (!move || !move.draft) return { kind: 'no-draft', step: move ? move.step : null };
      const res = await host.writeDraft(move.draft);
      if (!(res && res.ok)) return { kind: 'draft-failed', step: move.step };
      l.lastDraft = { id: res.id || null, step: move.step, at: iso(now()) };
      await save(loops);
      return { kind: 'draft', step: move.step, draftId: res.id || null, to: move.draft.to, toHint: move.draft.toHint || null };
    }

    async function release(loopId, reason) {
      if (!on()) return null;
      const loops = await load();
      const l = loops.find((x) => x.id === loopId && x.status === 'open');
      if (!l) return null;
      Object.assign(l, loopMod.releasePatch(reason, now()));
      await save(loops);
      emit('refund_released');
      return { kind: 'released', loopId };
    }
    async function reopen(loopId) {
      if (!on()) return null;
      const loops = await load();
      const l = loops.find((x) => x.id === loopId && x.status === 'closed');
      if (!l) return null;
      const wasRefunded = l.closedAs === 'refunded';
      Object.assign(l, loopMod.reopenPatch());
      await save(loops);
      if (wasRefunded) emit('refund_reopened');
      return { kind: 'reopened', loopId };
    }

    return { onSent, onReply, onOpened, answerAsk, today, doIt, release, reopen };
  }

  return { create };
})();

if (typeof module !== 'undefined') module.exports = { FlowRefundLane };
