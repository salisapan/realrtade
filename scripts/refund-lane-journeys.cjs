#!/usr/bin/env node
// Offline A/B for core/refund-lane.js (REFUND_LOOP + REFUND_CHASE, off) on glance-ai/eval-data/refund-lane-journeys-<set>.jsonl.
// Each journey is a sequence of real-shaped events (sent, merchant reply, opened notice, a day passing, a release), replayed
// through the lane with an in-memory store, a read-back that returns the same id (or fails when the event says so) and a draft
// writer. The set is frozen before the code it scores; the code is never tuned to it after it is scored.
// A = today: no refund loop exists, so nothing is carried, no move is offered, and nothing closes.
// Run: node scripts/refund-lane-journeys.cjs [v0]
const fs = require('fs');
const path = require('path');
const { FlowRefundLane: Lane } = require(path.join(__dirname, '..', 'flow-trial-extension', 'core', 'refund-lane.js'));
const SET = process.argv[2] || 'v0';
const rows = fs.readFileSync(path.join(__dirname, '..', 'glance-ai', 'eval-data', 'refund-lane-journeys-' + SET + '.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
async function replay(j) {
  let store = [], clock = 0, failRead = false;
  const host = {
    switches: () => ({ REFUND_LOOP: true, REFUND_CHASE: true }),
    load: async () => JSON.parse(JSON.stringify(store)), save: async (l) => { store = JSON.parse(JSON.stringify(l)); },
    readBack: async (id) => (failRead ? { ok: false } : { ok: true, message: { id } }),
    writeDraft: async () => ({ ok: true, id: 'd' }), now: () => clock
  };
  const lane = Lane.create(host);
  const moves = [];
  for (const e of j.events) {
    clock = new Date(e.at + 'T10:00:00').getTime();
    failRead = Boolean(e.readBackFails);
    if (e.type === 'sent') await lane.onSent(e.msg);
    else if (e.type === 'reply') await lane.onReply(e.msg);
    else if (e.type === 'opened') await lane.onOpened(e.msg);
    else if (e.type === 'tick') (await lane.today()).forEach((x) => { if (x.move) moves.push(x.move.step); });
    else if (e.type === 'release') { const open = store.filter((l) => l.status === 'open'); if (open.length === 1) await lane.release(open[0].id, e.reason); }
  }
  const lastTick = [...j.events].reverse().find((e) => e.type === 'tick');
  let finalMove = null;
  if (lastTick) { clock = new Date(lastTick.at + 'T10:00:00').getTime(); const t = await lane.today(); finalMove = t.length === 1 && t[0].move ? t[0].move.step : null; }
  return { store, moves, finalMove };
}
(async () => {
  const t = {}; const notes = [];
  const add = (arm, lang, k) => { const key = arm + '|' + lang; t[key] = t[key] || { n: 0, right: 0, closeDue: 0, closed: 0, missedClose: 0, wrongClose: 0, actionDue: 0, rightAction: 0 }; t[key][k]++; };
  for (const j of rows) {
    const r = await replay(j);
    const x = j.expect;
    const st = r.store;
    const closedOk = x.status === 'closed' ? st.length >= 1 && st.every((l) => l.status === 'closed' && l.closedAs === x.closedAs && (x.closedAs !== 'refunded' || (l.proof && l.proof.fetchedBack === true))) : true;
    const wrongClose = x.status !== 'closed' && st.some((l) => l.status === 'closed');
    const moveOk = !x.move || r.finalMove === x.move;
    const seenOk = !x.movesSeen || JSON.stringify([...new Set(r.moves)]) === JSON.stringify(x.movesSeen);
    const remOk = x.reminders === undefined || (st[0] && (st[0].reminders || 0) === x.reminders);
    const right = st.length === x.loops && closedOk && !wrongClose && moveOk && seenOk && remOk && (x.status !== 'open' || st.every((l) => l.status === 'open'));
    ['all', j.lang].forEach((l) => {
      add('A', l, 'n'); add('B', l, 'n');
      if (right) add('B', l, 'right');
      if (x.loops === 0) add('A', l, 'right');
      if (x.status === 'closed') { add('A', l, 'closeDue'); add('B', l, 'closeDue'); add('A', l, 'missedClose'); if (closedOk) add('B', l, 'closed'); else add('B', l, 'missedClose'); }
      if (wrongClose) add('B', l, 'wrongClose');
      if (x.movesSeen || x.move) { add('A', l, 'actionDue'); add('B', l, 'actionDue'); if (moveOk && seenOk) add('B', l, 'rightAction'); }
    });
    if (!right) notes.push(j.id + ' ' + JSON.stringify({ loops: st.length, status: st.map((l) => l.status + ':' + (l.closedAs || '')), reminders: st.map((l) => l.reminders || 0), moves: r.moves, finalMove: r.finalMove }));
  }
  console.log('| arm | lang | journeys n | ended right | closes due | closed with proof | missed close | wrong close | moves due | right move |');
  console.log('|---|---|---|---|---|---|---|---|---|---|');
  ['all', 'he', 'en'].forEach((l) => ['A', 'B'].forEach((arm) => { const x = t[arm + '|' + l]; console.log('| ' + arm + ' | ' + l + ' | ' + x.n + ' | ' + x.right + ' | ' + x.closeDue + ' | ' + x.closed + ' | ' + x.missedClose + ' | ' + x.wrongClose + ' | ' + x.actionDue + ' | ' + x.rightAction + ' |'); }));
  console.log('differences from the label (B):', notes.join('; ') || 'none');
})();
