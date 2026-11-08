# Connector: Trello — one card exists in your list, read back

**Glance closes open loops. Gmail is where it starts today.** Status: **built and tested against a mock of the Trello REST API. Not verified live. Not deployed.** Both switches (`config/connectors.public.js`: `trelloReadBack`, `trelloOAuth`) are **off**. Date: 2026-11-08. Queue row 11 (`connectors-queue.md`), claimed in `integrations/QUEUE.md` (PR #264). Built on the foundation from the Notion run (`core/consent-catalog.js`, `core/connector-outcome.js`); quality bar: `integrations/QUALITY-BAR.md`.

## 1. Contract (written before the code)

- **The close it makes real.** A task-only Do It adds **one card** (a name, and a due date when it is a clean `YYYY-MM-DD`, written at noon UTC so the calendar day holds in nearly every timezone) at the bottom of the Trello **list the person chose**. No description, label, member, checklist, attachment or comment is written.
- **The read-back.** `GET /cards/{id}`. **Handled** only when it returns the same id, with the name Glance wrote, **not archived**, in the chosen list. `ProofOfClose = {system:"trello/card", externalId: card id, url: the https://trello.com/c/… short link, fetchedBack:true, verifiedAt}` (`SYSTEM_TRELLO`).
- **Not a close:** the POST answering 200; a read-back that fails, answers another card, a different name, an archived card, a card in another list, or a changed shape (`verify_failed`). The card may exist; a retry re-reads it and never makes a second one.
- **Undo ARCHIVES, never deletes.** A Trello delete is permanent and an archive is restorable, so Undo sends `closed: true` and then reads the card back; undone only when it reads back archived. **Undo refuses a card the person changed** (name differs, a description was added, or the due date moved: `edited-by-person`) and archives nothing: "never clobber a user edit". A card already archived or already gone is "Already archived / gone", with no read-back claimed.
- **Idempotent.** One card per loop key (device ledger `trelloLedger`, max 200). A second click or retry re-reads the stored card and does not POST. If a POST's outcome is unknown (5xx, timeout, 409, an id-less 200), the chosen list's open cards are read for the same name **created since the attempt began** (a Trello card id carries its creation time in its first 8 hex digits) and that card is adopted instead of creating a twin; an older card with the same name, or an archived one, is never adopted.
- **Not a close:** nothing sent to anyone, no member added, no notification asked for.

## 2. Capability matrix (quality bar §1)

| Capability | Endpoint | Minimum scope | Undo | Read-back | Built |
|---|---|---|---|---|---|
| Create one card in the chosen list | `POST /1/cards` | token `read,write` | archive + `GET` | `GET /1/cards/{id}` | **yes** |
| Read one card back | `GET /1/cards/{id}?fields=name,desc,idList,closed,due,shortUrl` | `read` | - | the proof | **yes** |
| Archive the card Glance made | `PUT /1/cards/{id}` `{closed:true}` | `write` | (the person can restore it) | `GET` | **yes** |
| Adopt after an unknown outcome | `GET /1/lists/{id}/cards?fields=name,closed` | `read` | - | - | **yes** (one bounded read) |
| Find the chosen list at connect time | `GET /1/boards/{id}/lists?filter=open&fields=name` | `read` | - | - | **yes** (once, at Connect) |
| Delete a card; labels, members, checklists, attachments, comments, search, webhooks, other boards | various | - | - | - | **no, and asserted unused** (a `DELETE` or any other path fails the corpus) |

## 3. Auth

**Trello has no OAuth 2 and no client secret** (this is the queue's "API key + token flow"). The **app key** is public (`OAUTH_PUBLIC.trelloApiKey`, 32 hex digits). "Connect Trello" opens Trello's own authorize page (`trello.com/1/authorize`, `response_type=token`, `scope=read,write`, `expiration=never`, the key); Trello returns the person's **token in the return URL's fragment**. **There is no relay and no secret.** Trello does not echo a `state`, so Glance puts a random state in the return URL's query and **checks it before the token is used** (a forged or missing state is refused and nothing is called). The token must match a strict shape or nothing is stored. The token is sent in the **`Authorization: OAuth oauth_consumer_key=…, oauth_token=…` header, never in a URL**. At Connect, the person gives the **board link and the list name**; Glance reads that board's open lists once and picks the list by exact name (case-insensitive); **two lists with the same name, or none, are refused, never guessed**. Tokens live on the device (`trelloAuth`). Trello tokens do not refresh; a 401 is reported `not-connected` and nothing is written. **Disconnect** removes `trelloAuth` and `trelloLedger`; Trello cannot be told to revoke the token from here without a call that is not built, so the privacy draft says the person can also revoke it in Trello → Settings → Applications.

**Manifest:** the calls need `https://api.trello.com/*`. **Not added** (this PR changes no permission). Going live needs it: owner «מאשר» + store re-review.

## 4. Switches (both default off)

| Switch | With it off |
|---|---|
| `trelloReadBack` | **No Trello writer exists at all** (nothing is registered under the id `trello`); nothing is emitted, stored or called. |
| `trelloOAuth` | `connectTrello` refuses and calls nothing. Also needs `OAUTH_PUBLIC.trelloApiKey`. |

## 5. Recognition and the plan

**No new recognition.** This is an existing close family: the task Do It (the same one that offers Google Tasks, Microsoft To Do, Asana…). Trello becomes one more destination for a task the person already approved. No lexicon, weight or gate changed; no new loop type (quality bar §7: **not applicable**). **Appears in the steps list as a destination: NOT YET** (the destination chooser using `FlowConnectorOutcome.destinationOrder` is open-tasks row 80). The writer is registered under `trello` only when the switch is on, and is unreachable until that chooser exists. Silent when: not connected, switch off, no title, no chosen list.

## 6. Learning hook

`core/connector-outcome.js` events with `connector:"trello"`, `closeType:"task"`, `destinationSystem:"trello/card"`: `approved`, `handled`, `readback_failed`, `undone`. `offered`, `edited`, `ignored` have no emitter yet. **No title, id or token in an event** (asserted). Off with the switch.

## 7. Tests (against a mock; no real account, key or token)

| File | Proves |
|---|---|
| `test/trello-close-corpus.cjs` (26) | success with id + name + list + not archived + short link; **token in the header, never in a URL; loop key never sent**; **only card and one-list endpoints, no DELETE**; idempotent; reload; archived / renamed / moved / removed → not Handled; **Undo archives, never deletes**, twice, a fresh approve afterwards; **Undo refuses a renamed, described or re-dated card (no PUT at all)**; archive that did nothing; already gone; no record; bad ids; 401; missing token / key / list id; 403, 404, 400; 429 + Retry-After and forever; 5xx did / did not create; 409; timeout; **adoption never takes an older or archived card**; network; **created but read-back fails → not Handled**; changed shapes; other list / name / archived; id-less 200; bad date dropped; **injection through the title**; clipping; no token or key in the ledger or proof |
| `test/trello-wiring-corpus.cjs` (34) | switches off register nothing and call nothing; on: writer + undoer registered under `trello`, Handled with a proof, header-only token, second click, events with no text, **Undo archives**, **an edited card is not archived**, Disconnect clears, read-back 500, coexistence with Asana; **Connect**: authorize URL (public key, `read,write`, state in the return URL, no secret), token from the fragment, list found by name case-insensitively, **no relay**, **forged or missing state refused before the token is used**, no / malformed / markup token refused, bad board or list input refused before any sign-in, unknown list, **two lists with one name refused**, a board the person cannot open, no app key; board-link parsing |
| `test/consent-catalog-corpus.cjs` (+1) | `trello` is `experimental` (in select all); tick = Trello's authorize page + `https://api.trello.com/*` only |

## 8. Security checks (named)

Narrowest token scope that creates and archives a card (`read,write`) · the app key is public and holds no secret · **the token travels only in the Authorization header, never in a URL or a log** · `state` carried in the return URL and checked before the token is used · token shape validated before storage · only card endpoints and the one chosen list are used; no delete · the list is picked by exact name and **never guessed** · ids strictly shaped (24 hex) before they enter a path · the title is one JSON string (hostile text cannot add a field, change the list or move a path) · **Undo archives (restorable) and never touches a card the person changed** · no token, key, title or id in events, ledger or proof · nothing is sent to a person.

## 9. Vendor facts I could not verify (no live Trello account; vendor docs were not fetched)

That `https://trello.com/1/authorize` accepts `response_type=token`, `callback_method=fragment`, `scope=read,write`, `expiration=never` and a `return_url` that carries a query string through to the redirect (the **state-in-the-return-URL trick depends on this**); that the token comes back as `#token=…` and its shape (letters and digits, 20–100 characters); that the `Authorization: OAuth oauth_consumer_key=…, oauth_token=…` header is accepted on every call (the documented alternative is `key` and `token` query parameters, which this connector avoids on purpose); that `POST /1/cards` takes a JSON body with `idList`, `name`, `pos`, `due`; the `GET /cards/{id}` fields; that `PUT /cards/{id}` with `closed:true` archives; that a card id's first 8 hex digits are its creation time in seconds; that `GET /lists/{id}/cards` returns only open cards; that a 429 carries `Retry-After`; the plain-text bodies of error responses; the **Power-Up / app key** registration and whether an app key issued for a personal tool may be used by other people; and Atlassian's current terms for a public Trello integration. **The owner Gate must confirm each before go-live.**

## 10. Known limits

- One list per connection. To use another list the person reconnects.
- A Trello list is matched by name at Connect time; a list renamed later still works (the stored id is used) but the label shown is the old name.
- Undo refuses a card whose name, description or due date changed; a card that was only moved to another list or labelled is still archived (those are not read for the check). It reads the card first and archives only what still looks like the one Glance made.
- The adoption read lists the chosen list's open cards; a very large list is read whole (Trello returns all open cards).
- The destination chooser in the steps list is not built (row 80); until then the writer is not reachable from a card.

## 11. OWNER PACK

1. **App key.** `https://trello.com/power-ups/admin` → create a Power-Up (or an app) for Glance → copy the **API key** (32 hex digits) into `OAUTH_PUBLIC.trelloApiKey` (public; there is **no secret to set anywhere**). Add the allowed origin/redirect for the extension: `https://dnjhplgmnkabbjogfpbhofjedlkehkai.chromiumapp.org` (and the Chrome Web Store id's URL).
2. **Netlify env vars:** none (no relay).
3. **Review.** Trello does not review a personal-use key; for a published Power-Up or a public integration check Atlassian's current requirements (verify the current terms, privacy policy URL, support contact).
4. **Chrome Web Store permission justification (DRAFT):** "Host permission for api.trello.com: lets Glance add one card to the Trello list the person chose and read it back. Requested only when the person ticks Trello."
5. **Privacy-page paragraph (DRAFT, not applied):** "If you connect Trello, Glance adds the one card you approve to the list you choose and reads it back to confirm it was added. Undo archives that card, and leaves it alone if you changed it. Your Trello token stays on your device and is sent only to Trello. You can revoke it any time in Trello → Settings → Applications."
6. **Live Gate script** (owner, own Trello account, a test board, switches on for the chosen build):
   1. Connect Trello with the board link and the list name. Expect Trello's own page to ask for read and write on your account; the connection shows the list name.
   2. Approve a task Do It once the destination exists (or call the writer from the extension console). Expect Verifying…, then Added; the card appears at the bottom of the list with the right title and due date.
   3. Click again / reload: still one card.
   4. Edit the card's description or title in Trello, then press Undo: expect Undo to **refuse** and the card to stay. Use a fresh card, press Undo: expect the card **archived** (visible under the board menu → Archived items), restorable.
   5. Try a list name that does not exist, and two lists with the same name: expect a clear refusal and nothing stored.
   6. Disconnect: expect the local token gone; revoke the app in Trello → Settings → Applications.
   7. Pass = 2–6 as written. Anything else: do not turn the switch on for anyone.

## 12. Blockers to going live

(a) owner creates the Trello app key and puts it in `OAUTH_PUBLIC.trelloApiKey`; (b) `api.trello.com` host in the manifest + store re-review (`«מאשר»`); (c) privacy/store drafts applied; (d) the unverified vendor facts in §9, above all the return-URL state and the header authentication; (e) the destination chooser in the steps list (row 80); (f) the switches turned on (owner «מאשר»).
