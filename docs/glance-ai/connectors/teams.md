# Connector: Microsoft Teams (Graph) — the answer is in the chat, read back (read-only)

**Glance closes open loops. Gmail is where it starts today.** Status: **built and tested against a mock of Microsoft Graph chats. Not verified live. Not deployed.** The switch (`config/connectors.public.js`: `teamsAnswerReadBack`) and the recognition switch `TEAMS_ANSWER` (`core/teams-answer.js`) are **off**. Date: 2026-10-26. Queue row 8 (`connectors-queue.md`), claimed in `integrations/QUEUE.md` (PR #232). Built on the foundation from the Notion run (`core/consent-catalog.js`, `core/connector-outcome.js`); quality bar: `integrations/QUALITY-BAR.md`.

## 1. Contract (written before the code)

- **READ-ONLY.** This connector **never posts, edits, deletes or reacts to a Teams message.** An answer is the person's own words in their own voice; Glance never sends on the person's behalf (CLAUDE.md, `Mail.Send` lock). Every request the engine makes is a `GET` (asserted in the tests and in the wiring test).
- **The close it makes real.** Someone asked the person something in a Teams chat (a request that carries that chat's link). The person links that one chat to the loop. The loop closes (`ok`, `closed`, a proof) **only when** a message **from the person** exists in that chat, created **after the ask**, not deleted, that is a **real answer**, **and** a second `GET` of that message by id returns the same message in the same chat. `ProofOfClose = {system:"teams/chat-message", externalId: message id, fetchedBack:true, verifiedAt}` (`SYSTEM_TEAMS_CHAT`).
- **A short reply is held open.** "ok", "thanks", "got it", a thumbs-up, «תודה», «סבבה», or fewer than three words is not an answer (`docs/reply-model.md`: a short reply is held open). The result says `heldOpen: "short-reply"`.
- **The other direction (`theirs`).** The person asked someone else. A message from the other side after the ask is **reported** (`answerArrived: true`, with the message id) and **never closes** the loop: a reply arriving is not the request being done, so the person decides. Waiting or tracking alone is not success.
- **One chat per loop.** A loop key is bound to the first chat linked to it; a second chat is refused (`another-chat-linked`) until the person releases the first. A chat is never guessed from a name or "the latest chat"; the engine only takes a chat id or a `teams.microsoft.com` / `teams.live.com` chat link.
- **Idempotent.** Nothing is written, so a second check only re-reads. The ledger keeps one record per loop (chat id, ask time, direction, message id, state).
- **Release.** The person's deliberate release: the loop is no longer watched. Nothing in Teams changes (there is nothing to undo there; Glance wrote nothing).
- **No text is kept.** No message text, author name or chat title is returned, stored in the ledger, put in a proof, or put in a learning event.
- **Not a close:** the list answering 200; a read-back that fails, names another message, another chat, another author, a deleted message, a message from before the ask, or a text that is no longer an answer (`verify_failed`).

## 2. Capability matrix (quality bar §1)

| Capability | Endpoint | Minimum scope | Undo | Read-back | Built |
|---|---|---|---|---|---|
| Identify the person | `GET /me?$select=id` | (sign-in) | - | - | **yes** |
| List the newest messages of one chat | `GET /me/chats/{chat}/messages?$top=50&$orderby=createdDateTime desc` | `Chat.Read` | - | - | **yes** |
| Read one message back by id | `GET /me/chats/{chat}/messages/{id}` | `Chat.Read` | - | the proof | **yes** |
| Post, reply, edit, delete, react, send | `POST/PATCH/DELETE …` | `Chat.ReadWrite` / `ChatMessage.Send` | - | - | **no, and asserted unused** (a non-GET fails the corpus; `outlookAssertNotSend` still refuses send/reply paths) |
| List all chats, channels, teams, members, presence, meetings | various | - | - | - | **no** (only the one linked chat is read) |
| Channel messages | `GET /teams/{id}/channels/{id}/messages` | `ChannelMessage.Read.All` (admin consent) | - | - | **no** (needs admin consent; out of this slice) |

## 3. Auth

**No new auth, no secret, no relay.** The connector uses the Microsoft sign-in the person already made on the Connect screen (the Entra app Outlook already uses), and **only the `Chat.Read` scope that screen's Teams box already asks** (`core/outlook-config.js` `CONNECT_SERVICES` → `teams`, `core/consent-catalog.js` → `ms-teams`). Nothing is asked until the person ticks Teams. If `Chat.Read` is not among the scopes the sign-in holds, the connector says `chat-not-granted` and reads nothing. Token refresh is the Outlook connection's own (`outlookFetch`); a 401 is reported `not-connected`. **Disconnect** is the Outlook disconnect; the ledger (`teamsAnswerLedger`) holds ids and times only.

**Manifest:** `https://graph.microsoft.com/*` is already a host for the Outlook connection. **No manifest, scope or permission change in this PR.**

## 4. Switches (default off)

| Switch | With it off |
|---|---|
| `teamsAnswerReadBack` | `flow:teams-answer-check` / `flow:teams-answer-release` answer `connector-not-live` and call nothing; nothing is emitted; nothing is stored; no writer is registered. |
| `TEAMS_ANSWER` (recognition, `core/teams-answer.js`) | `plan()` answers `off`; nothing is offered. |

## 5. Recognition and the plan

`core/teams-answer.js` (portable, no network): a text that carries **exactly one Teams chat link** and asks for an answer there ("reply to me here", "let me know in the Teams chat", «תחזור אליי בטימס», «תענה לי בצ'אט») becomes one **watch-only** Do It. The **direction** (`mine` / `theirs`) comes from **where the text came from** (received vs sent), passed in by the host, never from its words. Silent, each with a reason: no link (a chat is never guessed from a name), a link to a meeting or a channel, two different chats, hedge, negation, FYI, "ask Dana to reply", no ask, no direction. The plan's steps are `watch` (read that one chat, read only, proof `teams/chat-message`) and a manual `answer` step that is the person's ("Glance does not write or send"). Hard quiets and every precision gate are unchanged (no lexicon, weight or model changed). **Appears in the steps list / Loops: NOT YET** (the recognizer and the message API are ready and tested; the card, the `askedAtIso` and the direction from the content script are open-tasks row 80). Cursor's T1 Teams web lane (#217, `core/teams-web-read.js`) reads the open Teams page for new asks; this connector is about closing a loop that already exists. They share no file.

## 6. Learning hook

`core/connector-outcome.js` events with `connector:"teams"`, `closeType:"answer"`, `destinationSystem:"teams/chat-message"`: `handled`, `readback_failed`, `undone` (release). `offered`, `approved`, `edited`, `ignored` have no emitter yet. **No text, name, chat id or message id in an event** (asserted). Off with the switch.

## 7. Tests (against a mock; no real account, key or mail)

| File | Proves |
|---|---|
| `test/teams-answer-close-corpus.cjs` (23) | success: own answer after the ask, read back by id, proof of `teams/chat-message`; **every request is a GET** to `/me` or one chat's messages; waiting; own message from before the ask, another person's message, **short acknowledgements held open** (en/he/emoji), Hebrew answer, 2 vs 3 words; deleted, system event, empty body; **theirs never closes**; idempotent and reload; deleted afterwards → not closed; release; **one chat per loop**; chat links (encoded id) and **refused ids / hosts / traversal before any call**; bad params; 401, 403 (`Chat.Read` not granted), chat 404; 429 + Retry-After and forever; 5xx then retry, forever, timeout, offline; **listed but read-back fails → not closed**; read-back with another id / chat / author / deleted / short / early / empty / changed shape; **injection in a message**; **no text, name or token in the ledger or proof**; text helpers |
| `test/teams-answer-wiring-corpus.cjs` (21) | switch off calls nothing and stores nothing; on: waiting, "ok" held open, own answer closes with a proof, **all Graph calls are GETs on `/me` and one chat's messages**, event has no text or ids, ledger has no text, foreign sender refused, release; **`Chat.Read` not granted → reads nothing**; theirs never closes; bad input refused before any call; read-back failure |
| `test/teams-answer-corpus.cjs` (recognition) | 8 positive asks (en/he, both directions), 12 silent cases with reasons, no-link ignored, off by default, plan (watch-only, no post/send step), Hebrew plan, theirs wording |

## 8. Security checks (named)

Narrowest scope (`Chat.Read`, already asked; no write scope exists in this file) · **GET-only, asserted** · no `Mail.Send`/`ChatMessage.Send`/`Chat.ReadWrite` · only `/me` and the one linked chat are read · ids must match strict shapes before they enter a path; a chat link must be on a Teams host · the chat is never guessed · one chat per loop · **no message text, author or title leaves the engine** (not in a result, ledger, proof or event) · injection in a message cannot change a path or what is written (nothing is written) · a short acknowledgement never closes · a reply from the other side never closes · the loop key and the chat id are never sent anywhere but Graph · nothing private leaves the device.

## 9. Vendor facts I could not verify (no live Microsoft account; docs were not fetched)

That `Chat.Read` allows `GET /me/chats/{id}/messages` and `GET /me/chats/{id}/messages/{id}` for the person's own chats; that `$orderby=createdDateTime desc` and `$top=50` are accepted on the chat messages list (documented limit and ordering); the message fields used (`id`, `messageType`, `createdDateTime`, `deletedDateTime`, `chatId`, `from.user.id`, `body.content`); that `from.user.id` equals `/me`'s `id` for the person's own messages; that a deleted message is shown with `deletedDateTime` or disappears; the chat id shape (`19:…@thread.v2` / `@unq.gbl.spaces`); that a Teams chat deep link is `https://teams.microsoft.com/l/chat/<encoded id>/0`; the `Retry-After` header on 429 (the current Graph caller does not pass headers through, so the engine waits a fixed second); tenant policies that block `Chat.Read` for a work account (an admin may have to consent); and whether the page's Cursor T1 lane and this read share one token budget. **The owner Gate must confirm each before go-live.**

## 10. Known limits

- Reads the newest 50 messages of the linked chat; an answer buried under more than 50 newer messages is not seen (it would need paging, not built).
- A real answer is judged by words (three or more, not an acknowledgement) and by the reply-model rule that a short reply is held open. Whether the answer actually did the work stays the person's call; a model may only hold a loop open (`docs/reply-model.md`).
- Group chats: any message from the person after the ask counts, in any thread of that chat.
- Channels (team channels) are not read: that needs `ChannelMessage.Read.All` and admin consent.
- The steps-list card, the ask time and the direction from the content script are not built (row 80). A chat link must be present in the text.

## 11. OWNER PACK

1. **Entra app.** The Outlook Entra app already lists the delegated permission `Chat.Read`. Confirm it is listed (and whether the target tenants need admin consent for it). **No new app, no secret, no relay env var.**
2. **Manifest and store.** None: `graph.microsoft.com` is already allowed. No permission change.
3. **Privacy-page paragraph (DRAFT, not applied):** "If you tick Teams, Glance can read the one Teams chat you link to a request, to see whether you have answered it. It only reads: it never writes, sends or deletes a message. It counts the request closed only when your own answer is there, and keeps no message text. Your Microsoft access token stays on your device."
4. **Chrome Web Store justification (DRAFT):** "No new permission. The existing Microsoft Graph access is used, with the Chat.Read permission the person ticks as Teams, to read one linked chat and confirm the person's own reply. Read only."
5. **Live Gate script** (owner, own Microsoft work or school account with Teams, switch on for the chosen build):
   1. Connect Microsoft and tick Teams. Expect Microsoft's consent to name **Read your chat messages** and nothing that writes.
   2. In a test chat, have a colleague write a request. Copy that chat's link (… → Copy link to chat). In the extension console send `flow:teams-answer-check` with `{key, chatId: <link>, askedAtIso: <time of the request>, direction: "mine"}`. Expect `waiting`, not closed.
   3. Reply "ok" in the chat and check again: expect `heldOpen: short-reply`, not closed.
   4. Reply with a real sentence and check: expect `closed`, a proof, and the message id matching the one you wrote. Check again and after a reload: still closed, nothing posted by Glance (look at the chat: no message from Glance).
   5. Delete your answer and check: expect not closed.
   6. Check with `direction: "theirs"` after a colleague reply: expect `answerArrived`, never closed.
   7. Release: expect nothing changes in Teams.
   8. Pass = 2–7 as written. Anything else: do not turn the switch on for anyone.

## 12. Blockers to going live

(a) `Chat.Read` listed on the Entra app and any tenant admin consent (owner); (b) the unverified Graph facts in §9; (c) the privacy and store drafts applied (owner «מאשר»); (d) the steps-list card plus the ask time and direction (row 80); (e) the switch turned on (owner «מאשר»).
