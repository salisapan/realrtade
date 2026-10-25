# Connector: Zoom — the meeting exists, read back, with its join link

**Glance closes open loops. Gmail is where it starts today.** Status: **built and tested against a mock of the Zoom REST API v2. Not verified live. Not deployed.** Both switches (`config/connectors.public.js`: `zoomReadBack`, `zoomOAuth`) and the recognition switch `ZOOM_MEETING` are **off**. Date: 2026-10-25. Queue row 7 (`connectors-queue.md`), claimed in `integrations/QUEUE.md` (PR #205). Built on the foundation from the Notion run (token relay, `core/consent-catalog.js`, `core/connector-outcome.js`); quality bar: `integrations/QUALITY-BAR.md`.

## 1. Contract (written before the code)

- **The close it makes real.** Someone proposes a call and **names Zoom** with one day and one clock ("Can we do a Zoom call tomorrow at 15:00?", «נעשה שיחה בזום מחר ב-15:00»). The person approves one Do It. Glance **creates one scheduled meeting on the person's own Zoom account** at that clock, with **nobody invited** (Zoom emails no one), and shows the join link for the person to share. Glance sends nothing.
- **The read-back.** An independent `GET /meetings/{id}`. **Created** only when it returns the same id, the **topic** and **start** Glance wrote (within a minute), and a **`join_url` on `https://*.zoom.us/j/<digits>`**. `ProofOfClose = {system:"zoom/meeting", externalId: meeting id, url: join link, fetchedBack:true, verifiedAt}` (`SYSTEM_ZOOM`).
- **Host link and passcode are never kept.** The response also carries `start_url` (host-start token) and a passcode. They are not read into a result, a proof, a ledger, an event or a log (asserted). Only the join link is shown.
- **Idempotent.** A loop key maps to one meeting id in a ledger. A second click or retry re-reads that meeting and does not POST again. An unknown outcome (5xx, timeout, 409, a 2xx with no id) first lists the person's upcoming meetings for the same topic and start **created since the attempt began** and adopts it; an older meeting with the same topic and time is never adopted.
- **Undo.** Refuses a meeting the person changed (topic or start differs from what Glance wrote → `edited-by-person`, nothing deleted: "never clobber a user edit"). Otherwise `DELETE /meetings/{id}?schedule_for_reminder=false`, then a GET that must answer 404 (read back). Already gone is "Already gone", no read-back claimed. No ledger record → refuses (`no-record`).
- **Not a close:** a POST answering 201; a read-back that fails, names another id, another topic or start, or has no / a foreign join link (`verify_failed`).
- **Start and length.** The start must be an ISO instant **with a zone**; a start with no zone is refused, never guessed; a start already past is refused (`start-in-past`). Length 15–480 minutes, whole number, default 30.

## 2. Capability matrix (quality bar §1)

| Capability | Endpoint | Minimum scope | Undo | Read-back | Built |
|---|---|---|---|---|---|
| Create one scheduled meeting (no invitees) | `POST api.zoom.us/v2/users/me/meetings` | `meeting:write:meeting` | `DELETE /meetings/{id}` + GET → 404 | `GET /meetings/{id}` | **yes** |
| Read one meeting back | `GET api.zoom.us/v2/meetings/{id}` | `meeting:read:meeting` | - | - | **yes** |
| Delete the meeting Glance made | `DELETE api.zoom.us/v2/meetings/{id}` | `meeting:delete:meeting` | (cannot be restored) | GET → 404 | **yes** |
| Adopt after an unknown outcome | `GET /users/me/meetings?type=upcoming&page_size=100` | `meeting:read:meeting` | - | - | **yes** (one bounded page) |
| Invite people, registrants, recordings, chat, contacts, users, webinars | various | - | - | - | **no, and asserted unused** (only the three meeting paths above are ever called) |
| Revoke the token on Disconnect | `POST zoom.us/oauth/revoke` | needs the client secret | - | - | **no** (needs the secret; the person removes the app in Zoom → Connected apps; the local token and ledger are removed) |

## 3. Auth

OAuth 2.0 authorization code with **PKCE (S256)**. Zoom apps have a client secret, so the code exchange and refresh go through the **token relay** (`token-relay.md`, vendor `zoom`: HTTP Basic client auth, form body; secrets in Netlify env vars, never in the extension). `state` round-trips through `runOAuthFlow`. Zoom **rotates the refresh token** on every refresh; the engine saves the new one. A 401 triggers one refresh; if that fails nothing is saved. Tokens live on the device (`zoomAuth`). **Disconnect** removes `zoomAuth` and `zoomLedger`.

Scopes asked: `meeting:write:meeting meeting:read:meeting meeting:delete:meeting` (granular scope names, unverified, §9).

**Manifest:** the calls need `https://api.zoom.us/*`. **Not added** (this PR changes no permission). Going live needs it: owner «מאשר» + store re-review. The relay host `theflow-ai.com` is already allowed for the earlier connectors only once the relay is deployed (owner).

## 4. Switches (all default off)

| Switch | With it off |
|---|---|
| `zoomReadBack` | `flow:zoom-create` / `flow:zoom-undo` answer `connector-not-live` and call nothing; nothing is emitted; no writer is registered. |
| `zoomOAuth` | `connectZoomOAuth` refuses and calls nothing. Also needs `OAUTH_PUBLIC.zoomClientId` and the deployed relay. |
| `ZOOM_MEETING` (recognition, `core/zoom-meeting.js`) | `plan()` answers `off`; nothing is offered. |

## 5. Recognition and the plan

`core/zoom-meeting.js` (portable, no network): a call that **names Zoom**, with exactly one day and one clock, in English or Hebrew, becomes one Do It. The wall clock is turned into an instant with the **device's own UTC offset** that the host passes in (`startIsoFor`); a missing or absurd offset gives no instant. Silent, each with a stated reason: another named tool (Teams, Meet, Webex, WhatsApp, phone), **the other side says they will make the Zoom link** (`they-host`: "I'll send a Zoom link", "my Zoom", «אני אשלח קישור לזום»), two clocks or an alternative, a past day, a hedge, a negation, FYI / recording / webinar, "ask Dana to set up a Zoom", no proposal verb, no day, no clock. A generic "video call" is **not** a Zoom ask: the mailbox's own tool (Teams, Meet) owns it. Hard quiets and every precision gate are unchanged (no lexicon, weight or model changed). **Appears in the steps list / Loops: NOT YET** (the recognizer and message API are ready and tested; the card and the start-instant call from the content script are open-tasks row 80). The plan's steps are `create` (proof `zoom/meeting`) and a manual `share` step, never "send".

## 6. Learning hook

`core/connector-outcome.js` events with `connector:"zoom"`, `closeType:"meeting"`, `destinationSystem:"zoom/meeting"`: `approved`, `handled`, `readback_failed`, `undone`. `offered`, `edited`, `ignored` have no emitter yet. **No topic, id, link or token in an event** (asserted). Off with the switch.

## 7. Tests (against a mock; no real account, key or mail)

| File | Proves |
|---|---|
| `test/zoom-close-corpus.cjs` (35) | success with id + topic + start + join link; scheduled type 2, UTC, **no invitees, waiting room on, host first**; only meeting endpoints used; **start_url and passcode never reach result/proof/ledger**; length bounds; zone-less / malformed / past start refused before any call; idempotent; reload; deleted / rescheduled / renamed by the person → not Handled; Undo with read-back, twice, a fresh approve afterwards; **Undo refuses an edited meeting (no DELETE call)**, delete that did nothing, already gone, no record, non-digit ids; 401 refresh / fails; 403; 400; 429 + Retry-After (and forever); 5xx did / did not create; 409; timeout; **adoption never takes an older meeting**; network; **created but read-back fails → not Handled**; other id / empty / changed shape; wrong topic / start / missing or foreign / non-https join link (including `zoom.us.evil.example`); id-less 201; **injection through the topic**; clipping; loop key never sent; not connected |
| `test/zoom-wiring-corpus.cjs` (32) | switches off call nothing; on: created and read back, one POST + one GET, no invitee, join link only, second click, events with no topic/id/link/token, ledger without link or token, Undo, **edited meeting not deleted**, foreign sender refused, Disconnect clears, bad input refused before any call, read-back 500; OAuth: authorize URL and scopes, **PKCE verifier hashes to the challenge**, relay body exact, token on device only, forged state, no client id, relay refusing the code; **401 → one relay refresh → rotated refresh token stored** |
| `test/zoom-meeting-corpus.cjs` (45) | 8 positive asks (en/he), 20 silent cases with reasons, ignored cases, off by default, the plan (Do It, proof system, no send/invite step), Hebrew plan, hostile sender name, device-offset start instants (+03:00, −05:00, +05:30), absurd offset → none |
| `test/consent-catalog-corpus.cjs` (+1) | `zoom` is `experimental` (in select all); tick = relay sign-in + `https://api.zoom.us/*` only |
| `flow-landing/netlify/functions/token-relay/token-relay.test.cjs` (+1) | `zoom`: Basic auth, form body, PKCE verifier forwarded, refresh, a response that echoes the secret is withheld |

## 8. Security checks (named)

Narrowest scopes and unused endpoints asserted (only the three meeting paths are ever called); **no invitee, no email from Glance**; **host start link and passcode never stored, returned or logged**; the topic is one JSON string (hostile text cannot add a field, change the type or move a path); ids must be digits before they enter a path; the join link must be `https://*.zoom.us/j/<digits>` (a look-alike host or http fails); never delete a meeting the person changed; no token, topic, id or link in events, ledger or proof; `state` and PKCE checked before the code leaves; the client secret lives only in Netlify env vars and is withheld from any relay response; the loop key is never sent to Zoom; nothing private leaves the device beyond the topic and start the person approved.

## 9. Vendor facts I could not verify (no live Zoom account; vendor docs were not fetched)

Endpoint paths and the `type: 2` scheduled meeting body (`topic`, `start_time` UTC with `timezone`, `duration`, `settings.join_before_host`, `waiting_room`); that a created meeting returns `id` (number), `join_url`, `start_url`, `password`; that a meeting made with no invitees emails nobody; the `GET /meetings/{id}` fields; `DELETE ?schedule_for_reminder=false` and the 404 (code 3001) on a deleted meeting; the list endpoint `type=upcoming` and its `created_at` field (adoption relies on it); the 429 `Retry-After`; **granular scope names** (`meeting:write:meeting` vs the classic `meeting:write`) and which Zoom account types may use them; PKCE with a secret on the token call; Basic client auth and a form body; **refresh-token rotation**; and the **Zoom Marketplace review** needed before anyone outside the owner's account can connect. **The owner Gate must confirm each on the vendor page before go-live.**

## 10. Known limits

- Creates a meeting only; it does not invite, email, add registrants, or put it on a calendar (the calendar hold is the Google / Outlook writers' job). A passcode is set by Zoom and is inside the join link.
- The start is a single instant in the device's timezone offset at the moment of the click; a DST change between the click and the day is Zoom's to render (the meeting is stored in UTC).
- Adoption reads one page of up to 100 upcoming meetings; a person with more may get a second meeting after an unknown outcome (the ledger still prevents a second click from creating one).
- Disconnect cannot revoke the token at Zoom (needs the secret); the person removes the app in Zoom.
- The steps-list card and the content-script call are not built (row 80).

## 11. OWNER PACK

1. **Console.** `https://marketplace.zoom.us/develop/create` → **OAuth** app → *User-managed*, with **PKCE** on. Redirect URL `https://dnjhplgmnkabbjogfpbhofjedlkehkai.chromiumapp.org/` (and the Chrome Web Store id's URL). Scopes: `meeting:write:meeting`, `meeting:read:meeting`, `meeting:delete:meeting`. Copy the **Client ID** into `OAUTH_PUBLIC.zoomClientId` (public).
2. **Netlify env vars (relay):** `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`. Deploy the relay only with the owner's «מאשר».
3. **Vendor review.** Zoom Marketplace: for anyone beyond the owner's own account the app needs publish review (verify the current requirements: description, scope justification, privacy policy URL, support contact, a demo). Scope justification: *meeting:write*: "to create the one meeting the person approved, with nobody invited." *meeting:read*: "to read that meeting back and confirm it exists with the right time before showing it as done." *meeting:delete*: "only if the person presses Undo, and never for a meeting they changed."
4. **Chrome Web Store permission justification (DRAFT):** "Host permission for api.zoom.us: lets Glance create one Zoom meeting the person approved and read it back to confirm it exists. Requested only when the person ticks Zoom."
5. **Privacy-page paragraph (DRAFT, not applied):** "If you connect Zoom, Glance creates the one meeting you approve on your own Zoom account, with nobody invited, and reads it back to confirm it exists. It shows you the join link and sends it to no one. It leaves a meeting you changed alone when you press Undo. Your Zoom access token stays on your device; the one-time sign-in code passes through Glance's sign-in relay, which holds the app secret and keeps nothing."
6. **Live Gate script** (owner, own Zoom account, switches on for the chosen build):
   1. Connect Zoom in the popup. Expect Zoom's consent to name the three meeting permissions.
   2. In the extension console send `flow:zoom-create` with a topic and a start tomorrow (or approve the Do It once the card exists). Expect Verifying…, then Created; in Zoom → Meetings the meeting appears at the right local time, nobody got an email, and the join link in Glance matches the one Zoom shows.
   3. Click again / reload: still one meeting.
   4. Rename or reschedule it in Zoom, then press Undo: expect Undo to **refuse** and the meeting to stay. Revert (or use a fresh one) and press Undo: expect the meeting gone.
   5. Wait for a token refresh (or revoke the access token): expect a silent refresh, still one meeting.
   6. Disconnect: expect the local token gone; remove the app in Zoom → Connected apps.
   7. Pass = 2–5 as written. Anything else: do not turn the switch on for anyone.

## 12. Blockers to going live

(a) owner creates the Zoom OAuth app and sets `ZOOM_CLIENT_ID` / `ZOOM_CLIENT_SECRET` in Netlify and `OAUTH_PUBLIC.zoomClientId`; (b) owner «מאשר» to deploy the relay; (c) `api.zoom.us` host in the manifest + store re-review; (d) privacy/store drafts applied; (e) the unverified vendor facts in §9, above all granular scopes, no-invitee behaviour and refresh rotation; (f) the steps-list card and the start-instant call (row 80); (g) Zoom Marketplace review before use beyond the owner's account.
