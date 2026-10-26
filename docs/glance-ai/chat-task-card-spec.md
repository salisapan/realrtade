# Chat task card: an inbound ask on WhatsApp, Messenger or Instagram gets a Do It

Glance closes open loops. Gmail is where it starts today.

Owner, 2026-10-21: the same detection and the same level on every surface. Detection is already shared (`docs/glance-ai/one-algorithm.md`): the chat lane runs `FlowIncomingJudge.judge` with `surface: 'chat'` and keeps the result as `judged.incoming`. What is missing is the card. Today a chat page offers only a draft in the composer for a place or a fact ask, and nothing for "send me the report by Thursday".

**Spec for the builder routines (behind `glanceSwitches.CHAT_TASK_CARD`, default off; no new scope, no new host, no manifest change)**

1. **When.** `FlowChatLane.draftInto` finds no place or fact answer and `judged.incoming.show` is true with a `googleTask` step (or a Microsoft To Do step when only Microsoft is connected). Group chats stay out, as now. A chat with a message from the person after the ask stays quiet.
2. **The card.** The existing `.flow-chip-host` card, the canonical Do It (`shell`, `ring`, `shine`, label `Do It`), the same sentence slots as Gmail (`.flow-chip-process-name`, `.flow-chip-text`, `.flow-chip-main-row`, dismiss). Its CSS is `src/chip.css`, which the chat lane registrations in `src/background.js` (`LANE_CHAT`) do not load today: add it to the `css` of each chat registration. No new design (shared rule 2026-10-20). A text slot the card needs and does not have goes in `docs/glance-ai/card-requests-*.md` for the Grok bot.
3. **The write.** The worker already does it: `flow:execute-action` with `{ connectorId: 'googleTask', label, params: { dateIso, what }, facts, entities, threadUrl }`, read back by id (ProofOfClose `{system, externalId, fetchedBack, verifiedAt}`). Handled only when `fetchedBack` is true. Undo is `flow:undo-action` and refuses to touch a task the person edited. The `threadUrl` is the chat's address, with no message text in it.
4. **Never.** No send, no Enter, no composer write for this card. The card is a task, not a reply. A draft in the composer stays only for place and fact asks, as today.
5. **Tests.** A corpus (`test/chat-task-card-corpus.cjs`: the lines of `test/surface-parity-corpus.cjs` plus chat-shaped ones, English and Hebrew, with quiet negatives) and a headless spec on the existing mock chat page (`e2e/lane-chat-draft.spec.js` shows how): switch off shows nothing; on, the card shows, Do It writes and reads back, the receipt survives a reload, Undo works, an edited task is left alone.
6. **Reports.** The run report says "chat task card" and which of the six points shipped. Gate stays "not run" until the owner runs it on the real site.
