# Connector: Linear — one issue exists in your team, read back

**Glance closes open loops. Gmail is where it starts today.** Status: **built and tested against a mock of the Linear GraphQL API. Not verified live. Not deployed.** Both switches (`config/connectors.public.js`: `linearReadBack`, `linearOAuth`) are **off**. Date: 2026-10-19. Queue row 4 (`connectors-queue.md`), claimed in `integrations/QUEUE.md`. Built on the foundation from the Notion run (`token-relay.md`, `core/consent-catalog.js`, `core/connector-outcome.js`); quality bar: `integrations/QUALITY-BAR.md`.

## 1. Contract (written before the code)

- **The close it makes real.** A task-only Do It adds **one issue** (title, and a due date when it is a clean `YYYY-MM-DD`) to the Linear team the person chose.
- **The read-back.** An `issue(id:)` query. **Handled** only when it returns the same id, the title Glance wrote, the chosen team, and the issue is not trashed, archived, completed or canceled. `ProofOfClose = {system:"linear/issue", externalId: id, fetchedBack:true, verifiedAt, url}` (`SYSTEM_LINEAR` in `core/proof-of-close.js`). The url is only used when it is on `linear.app`.
- **Not a close:** the mutation answering `success`; a read-back that fails, answers another issue, a different title, another team, or an issue already finished or trashed (`verify_failed`). The issue may exist; a retry re-reads it and never creates a second.
- **Undo.** `issueDelete`, then a read: undone only when Linear no longer returns the issue, or returns it trashed or archived. If the delete is forbidden Undo answers `delete-not-permitted` and **the issue stays**. The loop is marked undone only after the read-back confirms it, so a delete that did nothing can never let a retry make a second issue.
- **Idempotent, by a client-chosen id.** The issue id is generated on the device (`crypto.randomUUID`) **once per loop and stored in the ledger before the create call**; `issueCreate` is sent with that `id`. A second click, a retry, a crash between the call and its answer, or an unknown outcome (5xx, timeout, a GraphQL error) all lead to a read of the **same id**: if the issue exists it is adopted, if not the create is retried with the same id. Two issues cannot result. (If Linear ignored the client id, the id in its answer is used instead and a time-window read of the team is the fallback: unverified, §9.)
- **Not a close:** nothing is sent to anyone; no assignee, label, project, cycle, comment or subscriber.

## 2. Capability matrix (quality bar §1)

| Capability | Operation | Minimum scope | Undo | Read-back | Built |
|---|---|---|---|---|---|
| Create an issue in a team | `issueCreate` | `write` (`issues:create` alone cannot Undo) | `issueDelete` + read | `issue(id:)` | **yes** |
| Read the issue back | `issue(id:)` | `read` | - | - | **yes** |
| Adopt after an unknown outcome | `issue(id:)` (same id); fallback `team.issues(filter: createdAt)` | `read` | - | - | **yes** |
| Find the team id from its key | `teams` | `read` | - | - | **yes** (connect only) |
| Mark an issue done when the loop closes elsewhere | `issueUpdate` (state) | `write` | reverse state | `issue(id:)` | no (later slice) |
| Comment | `commentCreate` | `comments:create` | `commentDelete` | `comment(id:)` | no |
| Attach a link | `attachmentCreate` | `write` | `attachmentDelete` | `attachment(id:)` | no |
| Users, projects, cycles, labels, search | various | - | - | - | **no, and asserted unused** |

Linear's narrower scopes (`issues:create`, `comments:create`) exist (**unverified**); `issues:create` would allow a create without Undo, which the quality bar does not accept, so the build asks `read,write`. `LINEAR_SCOPES` in `src/background.js` is one constant.

## 3. Auth

OAuth 2.0 authorization code with **PKCE (S256)** (Linear documents PKCE: unverified). Authorize URL `https://linear.app/oauth/authorize?client_id=…&response_type=code&scope=read,write&redirect_uri=…&code_challenge=…&code_challenge_method=S256&state=…`; `state` round-trips through `runOAuthFlow`. The code **and the verifier** go to the token relay (vendor `linear`, form-encoded body with the secret, to `https://api.linear.app/oauth/token`). The team is found by the key the person pasted (`ENG`, or a `linear.app/<workspace>/team/ENG/…` link): a `teams` query, and only a team whose id is a UUID is used. Stored on the device (`linearAuth`: token, refresh token, team id, key, name). A 401, or an authentication error inside an HTTP-200 GraphQL body, triggers one refresh through the relay (Linear refresh tokens and their rotation: unverified); if that fails the close says "not connected" and writes nothing. Disconnect removes `linearAuth` and `linearLedger`.

**Manifest:** the API calls go to `https://api.linear.app/*`. **Not added** (this PR changes no permission). Going live needs it: owner «מאשר» + store re-review.

## 4. Switches (both default off)

| Switch | With it off |
|---|---|
| `linearReadBack` | No Linear writer or undoer is registered at all (`WRITERS.linear` is undefined); nothing is emitted. |
| `linearOAuth` | `connectLinearOAuth` refuses and calls nothing. Also needs the relay deployed and `OAUTH_PUBLIC.linearClientId` set. |

## 5. Recognition and the plan

- **No new recognition.** Linear is a **destination** for a close that is already recognised (a task-only Do It). The Hebrew/English recognition, the precision gates and the hard quiets are untouched. No new loop type, so no new intent examples (quality bar §7: **not applicable**; no weights or gates changed).
- **Appears in the steps list / Loops: NOT YET** (same gap as the other connectors, `open-tasks.md` row 75).
- **Silent when:** not connected, switch off, no team, no title.

## 6. Learning hook

`core/connector-outcome.js` events with `connector:"linear"`, `destinationSystem:"linear/issue"`: `approved`, `handled`, `readback_failed`, `undone`. `offered`, `edited`, `ignored` have no emitter yet. No title, address, issue identifier or text (asserted). Off with the switch. Conclusions exist and are tested but no card reads them yet (row 75).

## 7. Tests (against a mock; no real account, key or mail)

| File | Proves |
|---|---|
| `test/linear-close-corpus.cjs` (36) | success + proof + url; **every value is a GraphQL variable, the query text is constant**; only create/read/delete operations; idempotent; reload; completed/canceled/trashed/removed by someone else; Undo (trashed, hard-deleted, forbidden, delete that did nothing → not marked undone, already gone, non-uuid ids); 401 refresh and **authentication error inside HTTP 200**; refresh fails / none; forbidden; team not found / rejected input (not retried); rate limit as HTTP 429 and as a `RATELIMITED` error, with Retry-After (and forever); 5xx did/did not create (**same id retried**); a conflict error after a create that landed; timeout; network; **crash between create and answer (stored id adopted)**; **created but read-back fails → not Handled**; other issue / empty / null / changed shape / other team / other title / completed / trashed; `success:false`; **Linear ignores the client id**; malformed stored auth incl. an injection in the team id; bad date; **injection**; clipping; no token in ledger/proof; foreign url never in the proof; not connected |
| `test/linear-wiring-corpus.cjs` | switches off register nothing; on: id chosen on the device, proof accepted by `FlowProofOfClose`, 2nd click, events with no text, Undo, Disconnect, read-back 500, all four connectors together; OAuth: authorize URL, PKCE challenge = SHA-256 of the verifier sent to the relay, relay body, team resolved, unknown team, non-UUID team id ignored, forged state, no client id, relay refusal, team parsing |
| `token-relay.test.cjs` (+1) | Linear form body with verifier, secret never returned or echoed |
| `test/consent-catalog-corpus.cjs` (+1) | `linear` tick = relay sign-in + `api.linear.app` host only; Select all includes it |

## 8. Security checks (named)

Scopes minimal as far as Undo allows and unused operations asserted (no users, projects, comments, search); **GraphQL injection closed** (every value is a variable; the query strings are constants and are asserted never to contain the title, team or id); team id and issue id are UUID-checked before use; no token, identifier or title in events; no token in ledger, proof or logs; hostile title cannot move team, id, query or fields; `state` and PKCE checked before the code leaves; relay is not an open proxy and never returns or logs the secret; only the one-time code, verifier or refresh token leaves the device (through the relay); nothing is sent to a person.

## 9. Vendor facts I could not verify (the docs host `linear.app/developers` was blocked from the build sandbox)

The authorize/token URLs and form body; PKCE support; scope names and the comma separator; refresh tokens, their lifetime and rotation; **that `IssueCreateInput` accepts a client-supplied `id`** (this build's idempotency rests on it; the fallback is tested but weaker); `issueCreate`/`issueDelete`/`issue(id:)`/`teams` shapes and field names (`trashed`, `archivedAt`, `completedAt`, `canceledAt`, `dueDate`, `url`); that a deleted issue is returned trashed or as "Entity not found"; how a missing entity is reported (HTTP status and error text: the classifier accepts 200 or 4xx with "not found"); rate-limit signalling (HTTP 429 or a `RATELIMITED` error code, and which header carries the wait); the `team.issues` filter and `DateTimeOrDuration` type for the fallback; app review rules. **The owner Gate must confirm each on the vendor page before go-live.**

## 10. Known limits

- If Linear does not accept a client-supplied id, an unknown-outcome create falls back to reading the last minute of the team's issues (50) for the same title: two same-titled loops in that minute could be confused.
- The ledger holds the clipped title and the issue id (to verify and adopt); on the device, removed on Disconnect.
- Only title and due date are written (no description, assignee, labels, priority).
- Delete may be forbidden to some members; then Undo cannot undo and says so. An "archive" fallback is a later slice.
- An issue completed in Linear is not yet read as "the loop closed" (later slice).

## 11. OWNER PACK

1. **Console.** Linear → Settings → API → OAuth applications → New. Callback URL: `https://dnjhplgmnkabbjogfpbhofjedlkehkai.chromiumapp.org/` (and the Chrome Web Store id's URL when it exists). Scopes to allow: `read`, `write`. Publish the app only after the review in step 3.
2. **Netlify env vars** (relay): `LINEAR_CLIENT_ID`, `LINEAR_CLIENT_SECRET`. Public client id into `OAUTH_PUBLIC.linearClientId`.
3. **Vendor review.** A public OAuth app needs the app details (name, icon, developer, privacy-policy URL) and, to be listed, Linear's review (verify the current requirements). Scope justification: *write*: "to create the one issue the person approved, and to delete it only if the person presses Undo." *read*: "to read that issue back and confirm it exists before showing it as done, and to find the team the person named."
4. **Chrome Web Store permission justification (DRAFT):** "Host permission for api.linear.app: lets Glance add one issue to the Linear team the person chooses and read it back. Requested only when the person ticks Linear."
5. **Privacy-page paragraph (DRAFT, not applied):** "If you connect Linear, Glance adds the task you approve to the team you chose and reads it back to confirm. The Linear access token stays on your device. When you sign in with Linear, the one-time sign-in code and, later, the refresh token pass through our server once, only to be exchanged with Linear; we do not store or log them, and we never see your Linear content."
6. **Live Gate script** (owner, own Linear workspace, after the switches are turned on for the chosen build):
   1. Use a throwaway team "Glance test" (key e.g. `GT`) in your own workspace.
   2. Connect Linear in the popup with the team key or link. Expect "Connected: Glance test".
   3. In Gmail open a mail with a clear ask and a date; press Do It on the task step. Expect Verifying…, then Handled; the issue appears in the team with the title and due date.
   4. Press Do It again / reload Gmail: still exactly one issue. **Also** kill the network right after pressing Do It and press it again: still one issue (this tests the client id).
   5. Press Undo. Expect the card to revert and the issue in Linear's trash. As a member who may not delete, repeat 3 and press Undo: expect "can't undo", the issue still there.
   6. Wait for the access token to expire, press Do It: expect a silent refresh. Disconnect, then Do It: "not connected", no Handled.
   7. Pass = 3–6 as written. Anything else: do not turn the switch on for anyone.

## 12. Blockers to going live

(a) owner registers the Linear OAuth app and sets the env vars; (b) owner «מאשר» to deploy the relay; (c) `api.linear.app` host + store re-review; (d) privacy/store drafts applied; (e) the unverified vendor facts in §9, above all the client-supplied issue id; (f) steps-list destination wiring (row 75).
