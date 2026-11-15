# Connector: ClickUp — one task exists in your list, read back

**Glance closes open loops. Gmail is where it starts today.** Status: **built and tested against a mock of the ClickUp API v2. Not verified live. Not deployed.** Both switches (`config/connectors.public.js`: `clickupReadBack`, `clickupOAuth`) are **off**. Date: 2026-11-15. Queue row 13 (`connectors-queue.md`), claimed in `integrations/QUEUE.md` (PR #293). Cursor's earlier claim of this row (#167, 2026-10-18) was a claim commit only and is closed unmerged; its branch is untouched. Built on the foundation from the Notion run (token relay, `core/consent-catalog.js`, `core/connector-outcome.js`); quality bar: `integrations/QUALITY-BAR.md`.

## 1. Contract (written before the code)

- **The close it makes real.** A task-only Do It adds **one task** (a name, and a due date when it is a clean `YYYY-MM-DD`, written at noon UTC without a time) to the ClickUp **list the person chose**. Nothing else is written: no description, assignee, tag, priority, status, checklist, attachment or comment.
- **The read-back.** `GET /task/{id}`. **Handled** only when it returns the same id, the name Glance wrote, in the chosen list, **not archived and not closed**. `ProofOfClose = {system:"clickup/task", externalId: task id, url: the app.clickup.com/t/… link, fetchedBack:true, verifiedAt}` (`SYSTEM_CLICKUP`).
- **Not a close:** the POST answering 200; a read-back that fails, answers another task, a different name, a task in another list, an archived or closed task, or a changed shape (`verify_failed`). The task may exist; a retry re-reads it and never makes a second one. A POST that answers 200 with no id is treated as unknown and the list is searched (a test caught this exact case).
- **Undo ARCHIVES, never deletes.** A ClickUp delete is permanent; an archive is restorable. Undo sends `archived: true` and reads the task back; undone only when it reads back archived (or gone). **Undo refuses a task the person changed** (renamed, a description added, or the due date moved: `edited-by-person`) and archives nothing: "never clobber a user edit".
- **Idempotent.** One task per loop key (device ledger `clickupLedger`, max 200). A second click or retry re-reads the stored task and does not POST. If a POST's outcome is unknown (5xx, timeout, 409, an id-less answer), the list's newest open tasks are read for the same name **created since the attempt began** (`date_created`) and that task is adopted instead of creating a twin; an older task with the same name, or an archived one, is never adopted.

## 2. Capability matrix (quality bar §1)

| Capability | Endpoint | Minimum scope | Undo | Read-back | Built |
|---|---|---|---|---|---|
| Create one task in the chosen list | `POST /list/{id}/task` | ClickUp OAuth (workspace access) | archive + `GET` | `GET /task/{id}` | **yes** |
| Read one task back | `GET /task/{id}` | same | - | the proof | **yes** |
| Archive the task Glance made | `PUT /task/{id}` `{archived:true}` | same | (the person can restore it) | `GET` | **yes** |
| Adopt after an unknown outcome | `GET /list/{id}/task?archived=false&include_closed=false&order_by=created&reverse=true&page=0` | same | - | - | **yes** (one bounded read) |
| Verify the list at Connect | `GET /list/{id}` | same | - | - | **yes** (once, at Connect) |
| Delete a task; spaces, teams, members, comments, attachments, tags, webhooks, time tracking | various | - | - | - | **no, and asserted unused** (a `DELETE` or any other path fails the corpus; the body may only carry `name`, `due_date`, `due_date_time`, `archived`) |

ClickUp's OAuth app has **no per-scope picker**: it grants the user's workspace access. The narrowing is in what Glance does (only the endpoints above, asserted), not in the grant. The privacy draft says so.

## 3. Auth

OAuth 2 authorization code. ClickUp apps have a client secret, so the code exchange goes through the **token relay** (`token-relay.md`, vendor `clickup`: client id, secret and code in a JSON body; `CLICKUP_CLIENT_ID` / `CLICKUP_CLIENT_SECRET` in Netlify env vars, never in the extension). **ClickUp has no PKCE and its access tokens do not expire (unverified), so there is no refresh:** the relay vendor entry is `supportsRefresh: false` and a refresh request is refused with 400 (tested). `state` round-trips through `runOAuthFlow`. The token is the **bare `Authorization` header value** (no "Bearer"), never in a URL. At Connect the person gives the **list link or id**; Glance reads that list once with the new token (`GET /list/{id}`) and stores the id and name; a list the person cannot open stores nothing. Tokens live on the device (`clickupAuth`). A 401 is reported `not-connected` and nothing is written. **Disconnect** removes `clickupAuth` and `clickupLedger`; ClickUp cannot be told to revoke the token from here, so the privacy draft says the person can also remove the app in ClickUp → Settings → Apps.

**Manifest:** the calls need `https://api.clickup.com/*`. **Not added** (this PR changes no permission). Going live needs it: owner «מאשר» + store re-review.

## 4. Switches (both default off)

| Switch | With it off |
|---|---|
| `clickupReadBack` | **No ClickUp writer exists at all** (nothing is registered under the id `clickup`); nothing is emitted, stored or called. |
| `clickupOAuth` | `connectClickupOAuth` refuses and calls nothing. Also needs `OAUTH_PUBLIC.clickupClientId` and the deployed relay. |

## 5. Recognition and the plan

**No new recognition.** An existing close family: the task Do It. ClickUp becomes one more destination for a task the person already approved. No lexicon, weight or gate changed; no new loop type (quality bar §7: **not applicable**). **Appears in the steps list as a destination: NOT YET** (the destination chooser is open-tasks row 80). Silent when: not connected, switch off, no title, no chosen list.

## 6. Learning hook

`core/connector-outcome.js` events with `connector:"clickup"`, `closeType:"task"`, `destinationSystem:"clickup/task"`: `approved`, `handled`, `readback_failed`, `undone`. `offered`, `edited`, `ignored` have no emitter yet. **No title, id or token in an event** (asserted). Off with the switch.

## 7. Tests (against a mock; no real account, key or token)

| File | Proves |
|---|---|
| `test/clickup-close-corpus.cjs` (25) | success with id + name + list + not archived/closed + link; **bare-token header, never in a URL; loop key never sent**; **only task and one-list endpoints, no DELETE, body keys limited to four**; idempotent; reload; archived / closed / renamed / moved / removed → not Handled; **Undo archives, never deletes**, twice, a fresh approve afterwards; **Undo refuses a renamed, described (text or description) or re-dated task (no PUT at all)**; archive that did nothing; already gone; no record; bad ids; 401; missing token / list / malformed list id (**nothing sent**); 403, 404, 400; 429 + Retry-After and forever; 5xx did / did not create; 409; timeout; **older or archived tasks never adopted**; network; **created but read-back fails → not Handled**; **7 changed shapes and an id-less POST answer**; other list / name / archived / closed; bad date dropped; **injection through the title**; clipping; no token in the ledger or proof. (Writing this corpus caught a real bug: an id-less answer was read as the id "undefined".) |
| `test/clickup-wiring-corpus.cjs` (26) | switches off register nothing and call nothing; on: writer + undoer registered under `clickup`, Handled with a proof, bare-token header, second click, events with no text, **Undo archives**, **a changed task is not archived**, Disconnect clears, read-back 500, coexistence with Asana; **Connect**: authorize URL (public client id, state, no secret, no PKCE), relay body exact, token on device with the list verified by name, forged state refused before the relay, no client id, relay refusal, a list the person cannot open, a non-list link; list-link parsing |
| `test/consent-catalog-corpus.cjs` (+1) | `clickup` is `experimental` (in select all); tick = relay sign-in + `https://api.clickup.com/*` only |
| `flow-landing/netlify/functions/token-relay/token-relay.test.cjs` (+1) | `clickup`: client id, secret and code in a JSON body; **a refresh request is refused**; a response that echoes the secret is withheld |

## 8. Security checks (named)

The token is the bare Authorization value and **never in a URL or a log** · only task endpoints and the one chosen list are used; **no delete** · the body may only carry `name`, `due_date`, `due_date_time`, `archived` (asserted) · the list is verified at Connect and a list the person cannot open is refused · ids strictly shaped before they enter a path · the title is one JSON string (hostile text cannot add a field, change the list or move a path) · **Undo archives (restorable) and never touches a task the person changed** · no token, title or id in events, ledger or proof · the client secret only in Netlify env vars and withheld from any relay response · `state` checked before the code leaves · nothing sent to a person.

## 9. Vendor facts I could not verify (no live ClickUp account; vendor docs were not fetched)

That `https://app.clickup.com/api` is the authorize page and `POST /api/v2/oauth/token` takes `client_id`, `client_secret`, `code` in JSON and answers `access_token`; that tokens do not expire and no refresh grant exists; that there is no PKCE; that the token is accepted as the bare `Authorization` value; that `POST /list/{id}/task` takes `name`, `due_date` (ms) and `due_date_time:false`; the task fields (`id`, `name`, `text_content`, `description`, `archived`, `date_closed`, `date_created`, `due_date`, `status.type`, `list.id`, `url`); that `PUT /task/{id}` `{archived:true}` archives and that the list endpoint's `archived=false&include_closed=false&order_by=created&reverse=true` parameters behave as used; that a list link ends in `/li/<id>` (ClickUp's URL shapes differ by view); the 429 `Retry-After`; whether a task due date set at noon UTC shows the same calendar day in the person's timezone; ClickUp's app-review requirements for use beyond the owner's workspace. **The owner Gate must confirm each before go-live.**

## 10. Known limits

- One list per connection. To use another list the person reconnects.
- A list link must carry `/li/<id>`; other link shapes are refused with a message (the bare numeric id also works).
- Undo refuses a task whose name, description or due date changed; a task that was only moved or re-statused is still archived (those are not read for the check).
- The adoption read lists the list's first page of newest open tasks; a very busy list could hide a created task beyond it (a second click still cannot create one).
- The destination chooser in the steps list is not built (row 80); until then the writer is not reachable from a card.

## 11. OWNER PACK

1. **ClickUp app.** ClickUp → Settings → Apps → *Create an App*; set the redirect URL to `https://dnjhplgmnkabbjogfpbhofjedlkehkai.chromiumapp.org/` (and the Chrome Web Store id's URL). Copy the **Client ID** into `OAUTH_PUBLIC.clickupClientId` (public).
2. **Netlify env vars (relay):** `CLICKUP_CLIENT_ID`, `CLICKUP_CLIENT_SECRET`. Deploy the relay only with the owner's «מאשר».
3. **Review.** ClickUp reviews apps listed in its marketplace; an app used only by its owner needs none (verify the current requirements).
4. **Chrome Web Store permission justification (DRAFT):** "Host permission for api.clickup.com: lets Glance add one task to the ClickUp list the person chose and read it back. Requested only when the person ticks ClickUp."
5. **Privacy-page paragraph (DRAFT, not applied):** "If you connect ClickUp, Glance adds the one task you approve to the list you choose and reads it back to confirm it was added. ClickUp grants access to your workspace as a whole; Glance only ever touches that one task. Undo archives that task, and leaves it alone if you changed it. Your ClickUp token stays on your device; the one-time sign-in code passes through Glance's sign-in relay, which holds the app secret and keeps nothing. You can remove the app any time in ClickUp → Settings → Apps."
6. **Live Gate script** (owner, own ClickUp account, a test list, switches on for the chosen build):
   1. Connect ClickUp with the test list's link. Expect ClickUp's own consent page; the connection shows the list name.
   2. Approve a task Do It once the destination exists (or call the writer from the extension console). Expect Verifying…, then Added; the task appears in the list with the right name and due date and nothing else.
   3. Click again / reload: still one task.
   4. Edit the task's description or title in ClickUp, then press Undo: expect Undo to **refuse** and the task to stay. Use a fresh task, press Undo: expect the task **archived** (visible under the list's archived tasks), restorable.
   5. Try a list link you cannot open: expect a clear refusal and nothing stored.
   6. Disconnect: expect the local token gone; remove the app in ClickUp → Settings → Apps.
   7. Pass = 2–6 as written. Anything else: do not turn the switch on for anyone.

## 12. Blockers to going live

(a) owner creates the ClickUp app and sets `CLICKUP_CLIENT_ID` / `CLICKUP_CLIENT_SECRET` in Netlify and `OAUTH_PUBLIC.clickupClientId`; (b) owner «מאשר» to deploy the relay; (c) `api.clickup.com` host in the manifest + store re-review; (d) privacy/store drafts applied; (e) the unverified vendor facts in §9; (f) the destination chooser in the steps list (row 80); (g) the switches turned on (owner «מאשר»).
