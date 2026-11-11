# Connector: Monday — one item exists on your board, read back

**Glance closes open loops. Gmail is where it starts today.** Status: **built and tested against a mock of the Monday GraphQL API. Not verified live. Not deployed.** The switch (`config/connectors.public.js`: `mondayReadBack`) is **off**. Date: 2026-11-11. Queue row 12 (`connectors-queue.md`), claimed in `integrations/QUEUE.md` (PR #284). A Monday writer already existed (`mondayWrite`, one item plus an "update" with the facts, no read-back); this connector is the read-back version of it, like `notionReadBack`. Quality bar: `integrations/QUALITY-BAR.md`.

## 1. Contract (written before the code)

- **The close it makes real.** A task-only Do It adds **one item** (named after the task) to the Monday **board the person chose** when they connected. Glance writes **only the item's name**: no column, no update (the earlier writer's facts "update" is not written), no file, no subscriber.
- **The read-back.** `items(ids: [id]) { id name state board { id } }`. **Handled** only when it returns the same id, the name Glance wrote, on the chosen board, with state `active` (not archived or deleted). `ProofOfClose = {system:"monday/item", externalId: item id, fetchedBack:true, verifiedAt}` (`SYSTEM_MONDAY`).
- **Not a close:** the mutation answering with an id; a read-back that fails, names another item, another name, another board, an archived or deleted item, or a changed shape (`verify_failed`). The item may exist; a retry re-reads it and never creates a second one.
- **Undo ARCHIVES, never deletes.** `archive_item`, then the item is read back; undone only when it reads back archived (or gone). **Undo refuses an item the person renamed** (`edited-by-person`) and archives nothing: "never clobber a user edit". An item already archived or gone is "Already archived / gone", with no read-back claimed. (The earlier `mondayUndo` used `delete_item`; with the switch on, the read-back undoer is used.)
- **Idempotent.** One item per loop key (device ledger `mondayLedger`, max 200). A second click or retry re-reads the stored item and does not create. If a create's outcome is unknown (5xx, timeout, a GraphQL error after the fact, an id-less answer), the board's newest items are read (`items_page`, newest first) for the same name **created since the attempt began** and that item is adopted instead of creating a twin; an older item with the same name, or an archived one, is never adopted.

## 2. Capability matrix (quality bar §1)

| Capability | Operation | Minimum scope | Undo | Read-back | Built |
|---|---|---|---|---|---|
| Create one item on the chosen board | `create_item(board_id, item_name)` | `boards:write` | `archive_item` + read | `items(ids)` | **yes** |
| Read one item back | `items(ids: [id]) { id name state board { id } }` | `boards:read` | - | the proof | **yes** |
| Archive the item Glance made | `archive_item(item_id)` | `boards:write` | (the person can restore it) | `items(ids)` | **yes** |
| Adopt after an unknown outcome | `boards(ids) { items_page(limit: 100, order by creation, desc) }` | `boards:read` | - | - | **yes** (one bounded read) |
| Delete an item; updates, columns, files, subscribers, users, account, webhooks, other boards | various | - | - | - | **no, and asserted unused** (the corpus accepts only the four operations above; every value is a GraphQL variable) |

## 3. Auth

**No new sign-in and no new relay.** It uses the Monday connection the person already made (`mondayAuth`: the OAuth access token and the board id, through the existing `monday-oauth-exchange` function). The token is sent as the `Authorization` header value exactly (Monday takes no "Bearer" prefix). If the Monday app lacks `boards:write` / `boards:read`, Monday answers a permission error and Glance says `scope-missing` and writes nothing; a 401 or "Not Authenticated" is `not-connected`. Rate limits (HTTP 429 with `Retry-After`, or a GraphQL complexity error) wait and retry; a request refused for rate was not processed, so it is safe to resend. **Disconnect** (`disconnectConnector('monday')`) removes `mondayAuth` and `mondayLedger`.

**Manifest:** the calls need `https://api.monday.com/*`; it is not in the manifest today (the earlier connector is "built but not promoted"). **Not added** (this PR changes no permission). Going live needs it: owner «מאשר» + store re-review.

## 4. Switch (default off)

| Switch | With it off |
|---|---|
| `mondayReadBack` | `WRITERS.monday` / `UNDOERS.monday` are the earlier `mondayWrite` / `mondayUndo`, **unchanged** (asserted: the old writer still creates an item and an update, with no proof, ledger or learning event). Nothing is emitted or stored by the new code. |

## 5. Recognition and the plan

**No new recognition.** An existing close family: the task Do It. Monday is one more destination for a task the person already approved. No lexicon, weight or gate changed; no new loop type (quality bar §7: **not applicable**). **Appears in the steps list as a destination: NOT YET** (the destination chooser is open-tasks row 80). Silent when: not connected, switch off, no title, no board.

## 6. Learning hook

`core/connector-outcome.js` events with `connector:"monday"`, `closeType:"task"`, `destinationSystem:"monday/item"`: `approved`, `handled`, `readback_failed`, `undone`. `offered`, `edited`, `ignored` have no emitter yet. **No title, id or token in an event** (asserted). Off with the switch.

## 7. Tests (against a mock; no real account, key or token)

| File | Proves |
|---|---|
| `test/monday-close-corpus.cjs` (24) | success; **token is the header value, no Bearer; API version pinned; loop key never sent**; **only create_item / items(ids) / items_page / archive_item, constant query text, every value a variable, no delete / update / column / user**; idempotent; reload; archived / deleted / renamed / moved / removed → not Handled; **Undo archives, never deletes**, twice, a fresh approve afterwards; **Undo refuses a renamed item (no archive call at all)**; archive that did nothing; already gone; no record; bad ids; not connected, bad board id (**nothing sent**); HTTP 401, 403, a missing-permission error, an unknown board; **429 + Retry-After and a complexity error, and forever**; 5xx did / did not create; **a GraphQL error after the item was created → adopted**; timeout; **older or archived items never adopted**; network; **created but read-back fails → not Handled**; 9 changed shapes; other board / name / archived; **injection through the name (two hostile strings)**; clipping; no token in ledger or proof |
| `test/monday-wiring-corpus.cjs` (18) | switch off: the earlier writer registered and working exactly as before; on: the read-back writer and undoer registered, Handled with a proof, the existing connection's token and board used, no relay, **no update, no delete**, second click, events with no text, **Undo archives**, **a renamed item is not archived**, Disconnect clears, read-back 500, not connected and no board call nothing, coexistence with Notion read-back |
| `test/consent-catalog-corpus.cjs` (+1) | `monday` is `experimental` (in select all); tick = the existing Monday sign-in + `https://api.monday.com/*` only |

## 8. Security checks (named)

Narrowest scopes (`boards:write`, `boards:read`; confirmed at the Gate) · **GraphQL variables only: no value ever reaches the query text, so a name cannot change the query** (asserted with two hostile strings) · only four operations exist in the file; **no delete** · ids strictly digits before use; the board is the stored one · **Undo archives (restorable) and never touches an item the person renamed** · the token stays on the device and goes only in the Authorization header · no token, title or id in events, ledger or proof · nothing is sent to a person · the earlier writer is untouched with the switch off.

## 9. Vendor facts I could not verify (no live Monday account; vendor docs were not fetched)

The `create_item`, `items(ids:)`, `archive_item` operations and their fields (`id`, `name`, `state` = `active | archived | deleted`, `board { id }`, `created_at`); `items_page` with `query_params.order_by` on `__creation_log__` descending and `limit: 100`; the API version `2024-10` pinned in the `API-Version` header; that the token goes as the bare `Authorization` value; the error shapes (HTTP 200 with an `errors` array and `extensions.code`, or `error_code` / `error_message`) and the code names used for authentication, permission, board-not-found and complexity limits; the 429 `Retry-After`; whether the existing OAuth app already holds `boards:read` and `boards:write` (Monday scopes are set on the app, and the earlier code deliberately sends none); whether `archive_item` keeps the item restorable for the person; and Monday's app-listing requirements for use beyond the owner's account. **The owner Gate must confirm each before go-live.**

## 10. Known limits

- One board per connection (the board id stored at Connect). The item goes to the board's first group (Monday decides).
- Only the item name is written; the earlier writer's facts "update" is not. Putting the facts back needs a separate, read-back-proven step.
- Undo refuses only a renamed item; an item that was moved, or whose columns or updates were edited, is still archived (those are not read for the check).
- The adoption read lists the board's 100 newest items; a very busy board could hide a created item beyond that and then a second item could result after an unknown outcome (a second click still cannot create one).
- The destination chooser in the steps list is not built (row 80); until then the writer is not reachable from a card.

## 11. OWNER PACK

1. **Monday app.** In the existing Monday app (the one behind `OAUTH_PUBLIC.mondayClientId` and the `monday-oauth-exchange` function): confirm the **OAuth scopes** `boards:read` and `boards:write`. **No new app, no new env var, no new function.**
2. **Manifest and store.** `https://api.monday.com/*` host and a store re-review (owner «מאשר»).
3. **Review.** Monday reviews apps listed in its marketplace; an app used only by its owner needs none (verify the current requirements).
4. **Chrome Web Store permission justification (DRAFT):** "Host permission for api.monday.com: lets Glance add one item to the Monday board the person chose and read it back. Requested only when the person ticks Monday."
5. **Privacy-page paragraph (DRAFT, not applied):** "If you connect Monday, Glance adds the one item you approve to the board you chose and reads it back to confirm it was added. Undo archives that item, and leaves it alone if you renamed it. Your Monday access token stays on your device."
6. **Live Gate script** (owner, own Monday account, a test board, switch on for the chosen build):
   1. Connect Monday with the test board id. Expect Monday's consent to name only the board read and write permissions.
   2. Approve a task Do It once the destination exists (or call the writer from the extension console). Expect Verifying…, then Added; the item appears on the board with the right name and no extra updates or columns.
   3. Click again / reload: still one item.
   4. Rename the item in Monday, then press Undo: expect Undo to **refuse** and the item to stay. Use a fresh item, press Undo: expect the item **archived** (Monday → board menu → Archive), restorable.
   5. Disconnect: expect the local token gone; remove the app in Monday → Apps if wanted.
   6. Pass = 2–5 as written. Anything else: do not turn the switch on for anyone.

## 12. Blockers to going live

(a) the Monday app's scopes confirmed (`boards:read`, `boards:write`); (b) `api.monday.com` host in the manifest + store re-review (`«מאשר»`); (c) privacy/store drafts applied; (d) the unverified vendor facts in §9; (e) the destination chooser in the steps list (row 80); (f) the switch turned on (owner «מאשר»).
