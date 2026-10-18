# Connector: ClickUp — one task exists in your List, read back

**Glance closes open loops. Gmail is where it starts today.** Status: **built and tested against a mock of the ClickUp API. Not verified live. Not deployed.** Both switches (`config/connectors.public.js`: `clickupReadBack`, `clickupOAuth`) are **off**. Date: 2026-10-18. Queue row ClickUp in `integrations/QUEUE.md` (owner: cursor routine `integration-builder`; PR #167, stacked on #156 -> #138 for the token relay, consent catalogue and learning hook). Quality bar: `integrations/QUALITY-BAR.md`. The capability matrix also stands alone in `integrations/clickup.md` (same table).

## 1. Contract (written before the code)

- **The close it makes real.** A task-only Do It adds **one task** (name, and a due date when it is a clean `YYYY-MM-DD`) to the ClickUp List the person chose.
- **The read-back.** `GET /v2/task/{id}`. **Handled** only when it returns the same id, with the name Glance wrote, in the chosen List, not archived and not closed (`status.type` closed/done or a `date_closed`). `ProofOfClose = {system:"clickup/task", externalId, fetchedBack:true, verifiedAt, url}` (`SYSTEM_CLICKUP` in `core/proof-of-close.js`).
- **Not a close:** the POST answering 200; a read-back that fails, answers another task, a different name, another List, an archived or closed task (`verify_failed`). The task may exist; a retry re-reads it and never makes a second.
- **Undo.** `DELETE /v2/task/{id}`, then `GET`; undone only when ClickUp answers **404** for it. A task already gone is "Already gone", with no read-back claimed.
- **Idempotent.** One task per loop key (device ledger `clickupLedger`, max 200). A second click or retry re-reads the stored task and does not POST. If a POST's outcome is unknown (5xx, timeout, 409, an id-less 200) the List's tasks created in the last minute (`date_created_gt`, 3 pages) are read for the same name and that task is adopted. A new approve after an Undo is a deliberate new close.
- **Not a close:** nothing sent to anyone, no comment, no assignee, no notification, no other task touched.

## 2. Capability matrix (quality bar §1)

| Capability | Endpoint | Minimum scope | Undo | Read-back (ProofOfClose) | Built |
|---|---|---|---|---|---|
| Create a task in a List | `POST /v2/list/{list_id}/task` | none (ClickUp OAuth has no scopes; access is the Workspaces the person authorised) | `DELETE /v2/task/{task_id}` then `GET` → 404 | `GET /v2/task/{task_id}` | **yes** |
| Read a task back | `GET /v2/task/{task_id}` | none | - | itself | **yes** |
| Delete a task (Undo only) | `DELETE /v2/task/{task_id}` (204) | none | - | `GET` → 404 | **yes** |
| Read a List's name at connect | `GET /v2/list/{list_id}` | none | - | - | **yes** (connect only) |
| Adopt a task after an unknown outcome | `GET /v2/list/{list_id}/task?order_by=created&reverse=true&date_created_gt=…&page=n` | none | - | - | **yes** |
| Mark a task done when the loop closes elsewhere | `PUT /v2/task/{task_id}` (`status`) | none | `PUT` the previous status | `GET` | no (a "true close" from ClickUp completion is a later slice) |
| Comment on a task | `POST /v2/task/{task_id}/comment` (`notify_all` can notify people: draft + approve only) | none | `DELETE /v2/comment/{comment_id}` | `GET /v2/task/{task_id}/comment` | no |
| Set or clear a due date | `PUT /v2/task/{task_id}` (`due_date`, `due_date_time`) | none | `PUT` the old value | `GET` | no (a clean date is written at create) |
| Assign someone | `PUT /v2/task/{task_id}` (`assignees`; notifies a person: draft + approve only) | none | `PUT` the old assignees back | `GET` | no |
| Attach a file | `POST /v2/task/{task_id}/attachment` (multipart) | none | v3 attachments delete | `GET /v2/task/{task_id}` attachments | no |
| Add a tag | `POST /v2/task/{task_id}/tag/{tag_name}` | none | `DELETE` same path | `GET` | no |
| Subtask | `POST /v2/list/{list_id}/task` with `parent` | none | `DELETE` task | `GET` | no |
| Checklist item | `POST /v2/task/{task_id}/checklist` (+ items) | none | `DELETE /v2/checklist/{id}` | `GET` | no |
| Link or depend on another task | `POST /v2/task/{task_id}/link/{links_to}` | none | `DELETE` same path | `GET` | no |
| Watch for completion in ClickUp (true close from outside) | `POST /v2/team/{team_id}/webhook` | none; needs a public server endpoint | `DELETE /v2/webhook/{id}` | the event plus `GET /v2/task/{task_id}` | no (needs a server; later slice) |
| Pick a List from a tree | `GET /v2/team`, `/team/{id}/space`, `/space/{id}/folder`, `/folder/{id}/list`, `/space/{id}/list` | none | - | - | no (the person pastes a List link) |
| Search across the Workspace | `GET /v2/team/{team_id}/task` | none | - | - | **no, and asserted unused** |
| Who am I | `GET /v2/user`, `GET /v2/team` | none | - | - | **no, and asserted unused** |
| Time tracking, goals, docs, chat, custom fields | various | none | - | - | no (no loop needs them) |

Endpoints and methods above were read from the vendor's OpenAPI reference on 2026-10-18 (`developer.clickup.com/reference/*`). Every row marked "no" is a path I read but did not exercise.

**Least privilege.** ClickUp's OAuth has **no scopes**: a token reaches every Workspace the person ticked on ClickUp's own screen. The only enforceable least privilege is therefore in Glance: the module calls exactly the five task/List endpoints marked built (a test asserts that no other path is ever requested), and writes only into the one List id the person pasted. The owner Gate must confirm on the vendor page that there is no scope parameter (§9).

## 3. Auth

OAuth 2.0 authorization code, **no PKCE** (the vendor documents none). Authorize URL `https://app.clickup.com/api?client_id=…&redirect_uri=…&state=…`; `state` round-trips through `runOAuthFlow` and is checked before the code leaves the device. The one-time **code** goes to the token relay (`token-relay.md`, vendor `clickup`), which adds `client_id` and `client_secret` and sends ClickUp exactly `{client_id, client_secret, code}` as JSON; `redirect_uri` and any verifier are not forwarded. ClickUp returns `{access_token}`: **no refresh token, and the token does not expire today ("subject to change")**. The token lives on the device (`clickupAuth`: token, List id, List name), like the other connectors. A 401 means the token is gone (revoked): "not connected", nothing written; a 401 with a "Team not authorized" code (`OAUTH_023`, `026`, `027`, `029`–`045`) means the List's Workspace was not ticked: "project-not-shared". If ClickUp ever starts issuing refresh tokens the module already refreshes once on a 401 (the relay would need `supportsRefresh`). Disconnect removes `clickupAuth` and `clickupLedger`. The person pastes a List link (ends `/li/<id>`) or a bare id; anything else is refused before any sign-in.

**Manifest:** writing needs the host `https://api.clickup.com/*`. **Not added** (this PR changes no permission). Going live needs it: owner «מאשר» + store re-review. Only the service worker calls ClickUp (ClickUp's own docs say a browser page is blocked by CORS; an extension service worker with the host permission is not).

## 4. Switches (both default off)

| Switch | With it off |
|---|---|
| `clickupReadBack` | No ClickUp writer or undoer is registered at all (`WRITERS.clickup` is undefined); the learning hook emits nothing. |
| `clickupOAuth` | `connectClickUpOAuth` refuses and calls nothing; the popup status says "not configured". Also needs the relay deployed and `OAUTH_PUBLIC.clickupClientId` set. |

## 5. Recognition and the plan

- **No new recognition rule.** ClickUp is a **destination** for a close that is already recognised (a task-only Do It). The Hebrew/English recognition, the precision gates and the hard quiets are untouched; no weights changed.
- **Learning data (§8).** One new loop family, "task in a work tool named in the sentence", has 39 synthetic training candidates and 14 held-out synthetic cases in `test/fixtures/intent-clickup-*.json`.
- **Appears in the steps list / Loops / suggest cards: NOT YET** (same gap as Notion and Asana, `open-tasks.md` row 70): the steps list builds only `googleTask` / `outlookTask` and sends `connectorId: action.kind`; letting it choose ClickUp, via `FlowConnectorOutcome.destinationOrder` over the connected destinations, needs an owner decision on the default when two task systems are connected. Until then the writer is reachable only by `flow:execute-action` with `connectorId:"clickup"`, which is what the e2e rehearsal sends.
- **Silent when:** not connected, switch off, no List, no title.

## 6. Learning hook

`core/connector-outcome.js` events with `connector:"clickup"`, `destinationSystem:"clickup/task"` from the writer: `approved`, `handled`, `readback_failed`, `undone`. `offered`, `edited`, `ignored` have no emitter yet (they belong to the steps-list card). No title, address or text (asserted). Off with the switch (asserted). Conclusions exist and are tested but are not read by any card yet (row 70).

## 7. Tests (against a mock; no real account, key or mail)

| File | Proves |
|---|---|
| `test/clickup-close-corpus.cjs` (40) | success + proof; due date at 12:00 UTC with `due_date_time:false`; only the five task/List endpoints; idempotent; reload; closed/archived/removed by someone else; Undo with read-back (twice, delete that does nothing, already gone, path-escaping ids, 401/403 on Undo); 401 with a refresh token / refresh fails / no refresh token today; 401 "Team not authorized"; 403; 404; 429 with `X-RateLimit-Reset` and with `Retry-After` and capped and forever; 5xx did/did not create and forever; 409; timeout did/did not create; network down; **created but read-back fails/times out → not Handled**; other task / empty / changed shape; other List / other name / closed / archived; id-less or hostile-id 200; bad List id; bad date; **injection**; clipping; no token in ledger/proof; not connected; ProofOfClose needs the read-back; an unknown-outcome retry after a reload adopts the earlier task |
| `test/clickup-wiring-corpus.cjs` | switches off register nothing and emit nothing; on: proof accepted by `FlowProofOfClose`, only `api.clickup.com`, 2nd click, events with no text, Undo, Disconnect (then zero requests), read-back 500 through the real wiring, three connectors together, no switch leak between connectors; OAuth: state checked before the relay, relay body exactly `vendor, grant, code, redirect_uri, install_id`, no PKCE, no secret, token stored on the device, unauthorised Workspace explained, List-link parsing |
| `e2e/clickup-connector.spec.js` (4) | in the real extension (throw-away copy with the switches and host on, mock ClickUp and relay): Do It → Handled → 2nd click nothing → Undo; read-back failure is never Handled, retry, Disconnect then Do It sends nothing; Sign in with ClickUp end to end; hostile title |
| `token-relay.test.cjs` (+2) | ClickUp JSON body is exactly `client_id, client_secret, code`; verifier and redirect not forwarded; secret never returned, echoed or logged; no refresh grant; foreign redirect refused; unconfigured vendor |
| `test/consent-catalog-corpus.cjs` (+1) | `clickup` tick = relay sign-in + its host only; Select all includes it |
| `test/clickup-intent-data-corpus.cjs` (7) | the synthetic data: counts, labels, never owner-verified, disjoint, nothing private, held-out precision pinned at 1.00 |

## 8. Model learning (quality bar §7)

- **Data.** `test/fixtures/intent-clickup-synthetic.json`: **39** labelled synthetic sentences (ASK 16, PROMISE 11, INFORM 8, ACK 4; English 31, Hebrew 8), each with `act`, `action`, `lang`, `entities {tool:"clickup", object, what}`, `synthetic:true`, `ownerVerified:false`, `src:"synthetic-clickup-2026-10-18"`. The INFORM/ACK rows are the silence cases (an outage, a finished task, a notification). **Training candidates for the Sunday AI run**; this run trains nothing.
- **Held-out.** `test/fixtures/intent-clickup-heldout.json`: **14** cases, disjoint from the training candidates and from every other fixture (asserted), wired into `scripts/intent/eval-sets.cjs` as `clickupHeldOut` (and the candidates as `clickupSyntheticCandidates`, scored by the current weights).
- **Before / after (shipped weights, no weight change).** The four existing sets are identical before and after (`dev`, `blind`, `teacherEval`, `teacherEval2` byte-equal in `eval-sets.cjs --json`). The new sets, current weights, pipeline (precision / recall):

| Set | n | ASK | PROMISE | model accuracy |
|---|---|---|---|---|
| `clickupHeldOut` (before = after) | 14 | 1.00 / 1.00 | 1.00 / 0.50 | 0.929 |
| `clickupSyntheticCandidates` (before = after) | 39 | 0.938 / 0.938 | 1.00 / 0.818 | 0.923 |

- **What this says to the Sunday run.** Recall on PROMISE phrased with "Let me add that to ClickUp", "I can put … in ClickUp" and "Will add …" is the gap (silence, not a wrong answer). One precision finding on the candidates: **"ClickUp sent you a notification: Dana commented on Q4 pricing." is read as an ASK** (a notification, not a request). The existing automated-mail quiets should catch real notifications; it is flagged here rather than hidden. The held-out set has no false positive and the corpus pins that. Never lower this gate to raise recall.

## 9. Security checks (named; quality bar §8)

Scopes: ClickUp has none, so unused endpoint families are asserted unused (no search, users, teams, spaces, comments, webhooks); no token in ledger, proof, events or logs; injection in the title cannot move List, endpoint or fields; task ids are validated as `[A-Za-z0-9_-]` and List ids as digits before they enter a path (a `String(undefined)` slip is caught: ids must be real strings); `state` verified before the code leaves; no PKCE exists to verify; the relay is not an open proxy, forwards only `client_id, client_secret, code`, and never returns, echoes or logs the secret; only the one-time code leaves the device (through the relay); never sends anything to a person (no comment, no assignee).

## 10. Vendor facts

**Verified on 2026-10-18 from ClickUp's own pages** (`developer.clickup.com`): authorize URL `https://app.clickup.com/api`; token URL `https://api.clickup.com/api/v2/oauth/token`, body `client_id`, `client_secret`, `code` (JSON or form), answer `{access_token}`; OAuth header `Authorization: Bearer {token}`; the token "currently does not expire. This is subject to change"; only Workspace owners or admins can create OAuth apps; users choose the Workspaces to authorise; Create Task `POST /v2/list/{list_id}/task` (`name`, `due_date` ms, `due_date_time`), answer carries `id`, `name`, `status{type}`, `date_closed`, `archived`, `url`, `list{id}`; Get Task; Delete Task answers 204; Get List; Get Tasks (100 per page, `page`, `order_by`, `reverse`, `date_created_gt` in ms, `last_page`); the List id is the number after `/li` in the List's URL; rate limits per token 100/min (Free, Unlimited, Business), 1,000 (Business Plus), 10,000 (Enterprise) with `X-RateLimit-Limit`, `-Remaining`, `-Reset` (Unix timestamp) on a 429; error codes `OAUTH_023/026/027/029–045` team not authorised, `OAUTH_019/021/025/077` token not found; browser pages are blocked by CORS.

**Vendor facts I could not verify (the owner Gate must confirm each before go-live):** that a task deleted through the API answers **404** (not another code) on `GET`; that `status.type` uses the values `closed`/`done` for finished tasks; how a date sent at 12:00 UTC with `due_date_time:false` is shown in other time zones (the build assumes the same calendar day everywhere); whether `X-RateLimit-Reset` is seconds (the code accepts seconds or milliseconds) and whether a 429 carries `Retry-After`; that the authorize page accepts a `chromiumapp.org` redirect URI and exact-matches it; that there is no scope parameter and no PKCE; whether ClickUp reviews or lists public OAuth apps (I found no review requirement in the docs); whether the EU data region uses another host; ClickUp's retention of API-deleted tasks (the trash window); the exact List URL shape for every view type (the build accepts any `…/li/<digits>` path).

## 11. Known limits

- Adoption after an unknown POST reads at most 300 tasks created in the last minute; two same-titled loops in a minute could be confused (the normal path is exact via the loop key).
- The ledger holds the clipped title (to verify and adopt); it is on the device and removed on Disconnect.
- Only name and due date are written (no description, quote, assignee, tag).
- A task completed in ClickUp is not yet read as "the loop closed" (later slice, webhook or poll).
- The popup's connect button needs `core/connectors.js` to mark the entry `mvp`; it is not, so no row shows today (same as Asana).

## 12. OWNER PACK

1. **Console.** In ClickUp: avatar → Settings → Apps → **Create new app** (a Workspace owner or admin must do this). Name "Glance". Redirect URL: `https://dnjhplgmnkabbjogfpbhofjedlkehkai.chromiumapp.org/` (and the Chrome Web Store id's URL when it exists). ClickUp shows a `client_id` and a `secret`; there are no scopes to tick.
2. **Netlify env vars** (relay): `CLICKUP_CLIENT_ID`, `CLICKUP_CLIENT_SECRET`. Public client id into `OAUTH_PUBLIC.clickupClientId`.
3. **Vendor review.** None found in the docs. Check whether ClickUp asks for app details (name, icon, privacy-policy URL) before other people's Workspaces can authorise the app. Justification text if asked: *create task*: "to add the one task the person approved to the List they chose." *read task/List*: "to read that task back and confirm it exists before showing it as done, and to read the List's name when connecting." *delete task*: "only if the person presses Undo."
4. **Chrome Web Store permission justification (DRAFT):** "Host permission for api.clickup.com: lets Glance add one task to the ClickUp List the person chooses and read it back. Requested only when the person ticks ClickUp."
5. **Privacy-page paragraph (DRAFT, not applied):** "If you connect ClickUp, Glance adds the task you approve to the List you chose and reads it back to confirm. The ClickUp access token stays on your device. When you sign in with ClickUp, the one-time sign-in code passes through our server once, only to be exchanged with ClickUp; we do not store or log it, and we never see your ClickUp content."
6. **Live Gate script** (owner, own ClickUp account, after the switches are turned on for the chosen build):
   1. Create a throwaway List "Glance test" in your own Workspace; copy its link (it ends `/li/<number>`).
   2. Connect ClickUp in the popup with that link; on ClickUp's screen tick only that List's Workspace. Expect "Connected: Glance test".
   3. In Gmail open a mail with a clear ask and a date; press Do It on the task step. Expect Verifying…, then Handled; the task appears in the List with the title and due date (check the day in your time zone).
   4. Press Do It again / reload Gmail: still exactly one task.
   5. Press Undo. Expect the card to revert and the task gone from the List.
   6. Disconnect, then try Do It: "not connected", no Handled. Revoke the app in ClickUp, reconnect: works again. Authorise a different Workspace only, paste a List from the first: expect the "cannot open that List" message.
   7. Pass = 3–6 as written. Anything else: do not turn the switch on for anyone.

## 13. Blockers to going live

(a) a ClickUp Workspace owner/admin registers the app and the owner sets the env vars; (b) owner «מאשר» to deploy the relay; (c) `api.clickup.com` host + store re-review; (d) privacy/store drafts applied; (e) the unverified vendor facts in §10; (f) steps-list destination wiring (row 70); (g) the Sunday AI run trains on the synthetic candidates.
