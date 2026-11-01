# Connector: Slack (official Web API) — the answer is in the DM, read back (read-only)

**Glance closes open loops. Gmail is where it starts today.** Status: **built and tested against a mock of the Slack Web API. Not verified live. Not deployed.** The switches (`config/connectors.public.js`: `slackAnswerReadBack`, `slackAnswerOAuth`) and the recognition switch `SLACK_ANSWER` (`core/slack-answer.js`) are **off**. Date: 2026-11-01. Queue row 9 (`connectors-queue.md`), claimed in `integrations/QUEUE.md` (PR #250). Built on the foundation from the Notion run (token relay, `core/consent-catalog.js`, `core/connector-outcome.js`); quality bar: `integrations/QUALITY-BAR.md`.

## 1. Contract (written before the code)

- **READ-ONLY.** This connector **never posts, edits, deletes or reacts to a Slack message.** An answer is the person's own words in their own voice; Glance never sends on the person's behalf. Every request the engine makes is a `GET` of `auth.test` or `conversations.history` (asserted in the tests and in the wiring test). It is a **separate connection** from the older "post one message to a channel" Slack writer (`slackAuth`, `chat:write`), which is untouched.
- **Direct messages only.** The engine accepts only a conversation id that starts with `D` (or a Slack message link into one). A channel (`C…`), a group (`G…`) or any other id is refused before any call. The user scopes asked are `im:history` and `im:read` only; a token that carries any other scope is refused at sign-in and never stored.
- **The close it makes real.** Someone asked the person something in a Slack DM (a request carrying that DM's message link). The person links that one DM to the loop. The loop closes (`ok`, `closed`, a proof) **only when** a plain message **from the person** exists in that DM, sent **after the ask**, that is a **real answer**, **and** a second read of that exact message by its timestamp returns the same message from the same person. `ProofOfClose = {system:"slack/message", externalId: "<DM id>/<timestamp>", fetchedBack:true, verifiedAt}` (`SYSTEM_SLACK_MESSAGE`).
- **A short reply is held open.** "ok", "thanks", "got it", a thumbs-up, a Slack emoji code, «תודה», «סבבה», only a mention or link, or fewer than three words is not an answer (`docs/reply-model.md`). The result says `heldOpen: "short-reply"`. A message with a subtype (join, bot post, deletion notice, file share, edit event) is never an answer.
- **The other direction (`theirs`).** The person asked someone else. A message from the other side after the ask is **reported** (`answerArrived: true`, with the timestamp) and **never closes** the loop: a reply arriving is not the request being done, so the person decides.
- **One DM per loop.** A loop key is bound to the first DM linked to it; another is refused (`another-chat-linked`) until the person releases the first. A DM is never guessed from a name.
- **Idempotent.** Nothing is written, so a second check only re-reads. The ledger keeps one record per loop (DM id, ask time, direction, timestamp, state).
- **Release.** The person's deliberate release: the loop is no longer watched. Nothing in Slack changes.
- **No text is kept.** No message text, name or title is returned, stored in the ledger, put in a proof, or put in a learning event.
- **Not a close:** the history answering `ok:true`; a read-back that fails, names another message, another author, a subtype message, a text that is no longer an answer, or two messages (`verify_failed`).

## 2. Capability matrix (quality bar §1)

| Capability | Endpoint | Minimum scope | Undo | Read-back | Built |
|---|---|---|---|---|---|
| Identify the person | `GET auth.test` | (token) | - | - | **yes** |
| Read the newest messages of one DM since the ask | `GET conversations.history?channel=D…&oldest=…&limit=50` | `im:history` | - | - | **yes** |
| Read one message back by timestamp | `GET conversations.history?channel=D…&latest=ts&oldest=ts&inclusive=true&limit=1` | `im:history` | - | the proof | **yes** |
| Post, edit, delete, react, upload | `chat.*`, `reactions.*`, `files.*` | `chat:write` etc. | - | - | **no, and asserted unused** (a non-GET or any other method fails the corpus; the older channel-post writer is a separate connection) |
| Channels, groups, users, search, threads | `conversations.list/replies`, `users.*`, `search.*` | various | - | - | **no** (only the one linked DM is read; `im:read` is requested but no listing call is made) |

## 3. Auth

Slack OAuth v2 authorization code with **user scopes** `im:history,im:read`. Slack apps have a client secret and **Slack has no PKCE**, so the code exchange and refresh go through the **token relay** (`token-relay.md`, vendor `slack`: client id and secret in a form body; secrets `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` in Netlify env vars, never in the extension). `state` round-trips through `runOAuthFlow`. Slack answers HTTP 200 with `{ok:false,error}` on a refusal and puts a user-only token under `authed_user.access_token`, so this connector parses that itself (not the shared token helper). Token rotation is optional at Slack: when it is on, a refresh token comes back and the engine refreshes once on `token_expired` and saves the new one. Tokens live on the device (`slackAnswerAuth`). **Disconnect** (`disconnectConnector('slackAnswer')`) removes `slackAnswerAuth` and `slackAnswerLedger` and leaves the channel-post connection alone.

The same Slack app (and `OAUTH_PUBLIC.slackClientId`) can serve both connectors; the answer connector only adds the two user scopes. **Manifest:** the calls need `https://slack.com/api/*`. **Not added** (this PR changes no permission). Going live needs it: owner «מאשר» + store re-review.

## 4. Switches (all default off)

| Switch | With it off |
|---|---|
| `slackAnswerReadBack` | `flow:slack-answer-check` / `flow:slack-answer-release` answer `connector-not-live` and call nothing; nothing is emitted or stored; no writer is registered. |
| `slackAnswerOAuth` | `connectSlackAnswerOAuth` refuses and calls nothing. Also needs `OAUTH_PUBLIC.slackClientId`, the deployed relay and the two user scopes on the Slack app. |
| `SLACK_ANSWER` (recognition, `core/slack-answer.js`) | `plan()` answers `off`; nothing is offered. |

## 5. Recognition and the plan

`core/slack-answer.js` (portable, no network): a text that carries **exactly one link to a message in a Slack DM** and asks for an answer there ("reply to me here", "let me know in the Slack DM", «תחזור אליי בסלאק») becomes one **watch-only** Do It. The **direction** (`mine` / `theirs`) comes from **where the text came from** (received vs sent), passed in by the host, never from its words. Silent, each with a reason: no Slack link (a DM is never guessed from a name), a link into a channel or a profile, two different DMs, hedge, negation, FYI, "ask Dana to reply", no ask, no direction. The plan's steps are `watch` (read that one DM, read only, proof `slack/message`) and a manual `answer` step that is the person's ("Glance does not write or send"). Hard quiets and every precision gate are unchanged. **Appears in the steps list / Loops: NOT YET** (the recognizer and message API are ready and tested; the card, the `askedAtIso` and the direction from the content script are open-tasks row 80). The existing Slack page reader (`src/slack-parse.js`, `content-slack.js`) is untouched: "replace page reading where possible" is a later slice once this is live.

## 6. Learning hook

`core/connector-outcome.js` events with `connector:"slack"`, `closeType:"answer"`, `destinationSystem:"slack/message"`: `handled`, `readback_failed`, `undone` (release). `offered`, `approved`, `edited`, `ignored` have no emitter yet. **No text, name, DM id or timestamp in an event** (asserted). Off with the switch.

## 7. Tests (against a mock; no real workspace, key or mail)

| File | Proves |
|---|---|
| `test/slack-answer-close-corpus.cjs` (24) | success: own answer after the ask, read back by timestamp, proof of `slack/message`; **every request is a GET** to `auth.test` / the one DM's history; waiting; before the ask and other author; **short acknowledgements held open** (en/he/emoji/Slack codes/mentions); Hebrew answer, 2 vs 3 words; **subtypes are never answers**; **theirs never closes**; idempotent and reload; deleted afterwards; release; **one DM per loop**; DM ids and links accepted, **channels, groups, other hosts, traversal refused before any call**; bad params; not connected; `invalid_auth`, `missing_scope`, `channel_not_found`; `token_expired` → one refresh → saved; 429 + Retry-After and forever, `ratelimited`; 5xx, timeout, offline; **listed but read-back fails → not closed**; read-back with another message / author / subtype / short / two messages / empty / changed shape; **injection in a message**; **no text, name or token in the ledger or proof** |
| `test/slack-answer-wiring-corpus.cjs` (34) | switches off call nothing, store nothing, leave the older writer registered; on: waiting, "ok" held open, own answer closes with a proof, **all Slack calls are GETs of the one DM**, event has no text or ids, ledger has no text, foreign sender refused, release, **Disconnect clears the token and ledger but keeps the channel-post connection**, theirs never closes, bad input and not connected before any call, read-back failure; OAuth: authorize URL has only `user_scope=im:history,im:read`, relay body exact, token from `authed_user`, **a token with a write scope or without `im:history` is refused and not stored**, `ok:false` and no-token answers store nothing, forged state, no client id |
| `test/slack-answer-corpus.cjs` (30, recognition) | 8 positive asks (en/he, both directions), 12 silent cases with reasons, no-link ignored, off by default, plan (watch-only, no post/send step), Hebrew plan, theirs wording |
| `test/consent-catalog-corpus.cjs` (+1) | `slack` is `experimental` (in select all); tick = relay sign-in + `https://slack.com/api/*` only |
| `flow-landing/netlify/functions/token-relay/token-relay.test.cjs` (+1) | `slack`: client id and secret in a form body, no Authorization header, refresh, a response that echoes the secret is withheld |

## 8. Security checks (named)

Narrowest scopes (`im:history`, `im:read`; a token with any other scope is refused and not stored) · GET-only, asserted; no `chat:write` · direct messages only (a channel or group id is refused before any call) · only `auth.test` and one DM's history are read · ids and links must match strict shapes, a link must be on `*.slack.com` · a DM is never guessed · one DM per loop · **no message text, name or title leaves the engine** (not in a result, ledger, proof or event) · injection in a message cannot change a URL or what is written (nothing is written) · a short acknowledgement never closes · a reply from the other side never closes · the client secret lives only in Netlify env vars and is withheld from any relay response · `state` checked before the code leaves · the token is stored on the device only · nothing private leaves the device.

## 9. Vendor facts I could not verify (no live Slack workspace; vendor docs were not fetched)

That `conversations.history` works for a DM with a user token holding `im:history`; that `oldest`/`latest`/`inclusive`/`limit` behave as used (including `limit=1` with both bounds on the same timestamp returning exactly that message); that `ts` is `<10 digits>.<6 digits>` and unique per DM; the `subtype` set for non-plain messages; that `auth.test` returns `user_id` for a user token; the error strings (`invalid_auth`, `token_expired`, `missing_scope`, `channel_not_found`, `ratelimited`) and the 429 `Retry-After`; that `oauth.v2.access` with only `user_scope` returns `authed_user.access_token` and an HTTP 200 `ok:false` on refusal; token rotation and its refresh shape; whether `im:read` is needed at all for `conversations.history` of a DM (it is requested to stay safe and may be dropped to narrow the grant); Slack app review/Marketplace requirements for distribution beyond the owner's workspace; workspace admin approval for apps. **The owner Gate must confirm each before go-live.**

## 10. Known limits

- Reads the newest 50 messages of the linked DM since the ask; an answer buried under more than 50 newer messages is not seen (paging not built).
- Whether an answer actually did the work stays the person's call; a model may only hold a loop open (`docs/reply-model.md`).
- Threads inside a DM are not read (`conversations.replies` is not used); a reply in a thread is not seen.
- Group DMs (`G…`/`mpim`) and channels are not read: they need other scopes.
- The steps-list card, the ask time and the direction from the content script are not built (row 80). A Slack message link must be present in the text.

## 11. OWNER PACK

1. **Slack app.** `https://api.slack.com/apps` → the Glance app (create one if there is none) → *OAuth & Permissions*: add **User Token Scopes** `im:history` and `im:read` (no bot scope is needed for this connector). Redirect URL `https://dnjhplgmnkabbjogfpbhofjedlkehkai.chromiumapp.org/` (and the Chrome Web Store id's URL). Optionally switch on *Token Rotation* (then a refresh token is issued). Copy the **Client ID** into `OAUTH_PUBLIC.slackClientId` (public).
2. **Netlify env vars (relay):** `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`. Deploy the relay only with the owner's «מאשר».
3. **Review.** A Slack app installed only in the owner's workspace needs no review; distribution to others needs Slack's app review/Marketplace listing (verify current requirements: description, scope justification, privacy policy URL, support contact). Scope justification: *im:history*: "to read the one direct message the person linked to a request and confirm their own reply is there; Glance never posts." *im:read*: "to identify that direct message."
4. **Chrome Web Store permission justification (DRAFT):** "Host permission for slack.com/api: lets Glance read the one Slack direct message the person links to a request, to confirm their own reply. Read only. Requested only when the person ticks Slack."
5. **Privacy-page paragraph (DRAFT, not applied):** "If you connect Slack for answers, Glance can read the one direct message you link to a request, to see whether you have answered it. It only reads: it never writes, sends or deletes a message and reads no channel. It counts the request closed only when your own answer is there, and keeps no message text. Your Slack access token stays on your device; the one-time sign-in code passes through Glance's sign-in relay, which holds the app secret and keeps nothing."
6. **Live Gate script** (owner, own Slack workspace, switches on for the chosen build):
   1. Connect Slack (answers). Expect Slack's consent to name only **View messages and other content in your direct messages** and nothing that writes.
   2. In a test DM, have a colleague write a request; copy that message's link («Copy link»). In the extension console send `flow:slack-answer-check` with `{key, conversation: <link>, askedAtIso: <time of the request>, direction: "mine"}`. Expect `waiting`, not closed.
   3. Reply "ok" and check again: expect `heldOpen: short-reply`, not closed.
   4. Reply with a real sentence and check: expect `closed`, a proof, `externalId` = `<DM id>/<timestamp>` of your message. Check again and after a reload: still closed; the DM shows no message from Glance.
   5. Delete your answer and check: expect not closed.
   6. Check with `direction: "theirs"` after a colleague reply: expect `answerArrived`, never closed.
   7. Try a channel link: expect `bad-params`, no request. Release: nothing changes in Slack.
   8. Disconnect: expect the local token gone; in Slack → Apps the older channel-post connection (if any) is unchanged.
   9. Pass = 2–8 as written. Anything else: do not turn the switch on for anyone.

## 12. Blockers to going live

(a) owner adds the two user scopes to the Slack app and sets `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` in Netlify and `OAUTH_PUBLIC.slackClientId`; (b) owner «מאשר» to deploy the relay; (c) `slack.com/api` host in the manifest + store re-review; (d) privacy/store drafts applied; (e) the unverified vendor facts in §9; (f) the steps-list card with the ask time and direction (row 80); (g) Slack review for use beyond the owner's workspace; (h) the switches turned on (owner «מאשר»).
