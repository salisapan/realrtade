# Connector: Notion — one row exists, read back

**Glance closes open loops. Gmail is where it starts today.** Status: **built and tested against a mock of the Notion API. Not verified live.** Both switches (`config/connectors.public.js`: `notionReadBack`, `notionOAuth`) are **off**. Date: 2026-10-14. Queue row 1 of `connectors-queue.md`.

## 1. Contract (written before the code)

- **The close it makes real.** A task-only Do It adds **one row** (title, and a due date when the database has a date column and the date is a clean `YYYY-MM-DD`) to the Notion database the person chose.
- **The read-back.** `GET /v1/pages/{id}`. The close is **Handled** only when that GET returns the same page id, not archived, in the chosen database, with the title Glance wrote. `ProofOfClose = { system: "notion/page", externalId, fetchedBack: true, verifiedAt, url }` (`core/proof-of-close.js`, `SYSTEM_NOTION`).
- **What is not a close.** The POST answering 200 is not. A read-back that fails, answers another page, an archived page, another database, or a changed title is `ok:false` (`verify_failed`), never "Handled". The row may exist; the retry re-reads it and does not create a second.
- **Undo.** `PATCH archived:true`, then `GET` and require `archived:true`. Notion has no hard delete over the API; archiving is the trash button. A page already gone (404) is "Already gone", with no read-back claimed.
- **Idempotent.** One page per loop key (a ledger on the device, `notionLedger`, max 200 entries). A second click or a retry re-reads the stored page and does not POST. If a POST's outcome is unknown (5xx, timeout, 409, an id-less 200) the database is queried for the same title created in the last minute and that row is adopted. A new approve after an Undo is a deliberate new close and creates a fresh page.
- **Not a close:** nothing is sent to anyone, nothing is read from the rest of the workspace (no `/search`, no `/users`), no comment, no share.

## 2. Auth and scopes

- **Today (unchanged, live):** an internal-integration token the person pastes, plus the database link (`connectNotion`). Works with no app review.
- **New, behind `notionOAuth`:** "Sign in with Notion" (public integration). Authorize URL `https://api.notion.com/v1/oauth/authorize?client_id=…&response_type=code&owner=user&redirect_uri=…&state=…`; the `state` round-trips through `runOAuthFlow`. The one-time code goes to the **token relay** (`connectors/token-relay.md`), which adds the client secret and returns the token. Tokens live on the device only, in `notionAuth` (same place as the pasted token). A 401 triggers one refresh through the relay when a refresh token exists; if it fails the close says "not connected" and writes nothing. Disconnect removes `notionAuth` and the ledger.
- **Scopes.** Notion has no OAuth scope strings: the integration's **capabilities** are set in the vendor console. Glance needs: **Read content** (to read the database schema and read the page back), **Insert content** (create the row), **Update content** (archive on Undo). It needs **no** user-information capability, **no** comment capability. The person also chooses which pages to share on Notion's own consent screen.
- **Manifest.** Writing needs the host `https://api.notion.com/*`. It is **not** in `manifest.json` (it was removed on purpose earlier; the consent catalogue lists it as the Notion tick's host-permission step). **Going live needs that host added in the manifest or as an optional permission: owner «מאשר» + Chrome Web Store re-review.** This PR does not change `manifest.json`.
- **Vendor facts, with sources.** Verified from the Notion reference via search result: the *refresh a token* endpoint is `POST /v1/oauth/token` on `api.notion.com` (`developers.notion.com/reference/refresh-a-token`). **Not verified (the developer docs host was blocked from the build sandbox on 2026-10-14):** that the token request takes the client id and secret as HTTP Basic auth with a JSON body (the Notion SDK does this); that Notion's token endpoint does not support PKCE (a third-party proxy README says so; Notion states nothing I could read); the exact body of a refresh; token lifetime; whether an OAuth revoke endpoint exists. The relay's Notion entry uses the Basic + JSON form. **The owner/live Gate must confirm each of these on the vendor page before go-live.**

## 3. The switches

| Switch | File | Default | With it off |
|---|---|---|---|
| `notionReadBack` | `config/connectors.public.js` | `false` | The earlier `notionWrite` / `notionUndo` run unchanged (no read-back claim, no ledger, no learning event). |
| `notionOAuth` | `config/connectors.public.js` | `false` | `connectNotionOAuth` refuses and calls nothing; only the pasted token connects. Also needs the relay deployed and `OAUTH_PUBLIC.notionClientId` set. |

## 4. Recognition and the plan

- **No new recognition.** Notion is a **destination** for a close that is already recognised (a task-only Do It: a request or a promise with an explicit intent span). Hebrew and English recognition, the precision gates and the hard quiets are untouched; no corpus threshold changed. Nothing Notion-specific can make Glance offer something it would have stayed silent on.
- **When it appears.** `WRITERS.notion` is reached through `flow:execute-action` with `connectorId: "notion"`. The steps list (`core/step-list.js`) today builds its task step as `googleTask` / `outlookTask` only. **Offering Notion as the task destination in the steps list is NOT built yet**: it needs the destination chooser (use `FlowConnectorOutcome.destinationOrder` over the connected, switched-on destinations) and an owner decision on the default when two task systems are connected. Row 70 in `open-tasks.md`.
- **When it stays silent.** Not connected, switch off, no database, no title: nothing is offered and nothing is sent.

## 5. The learning hook (path A/C inputs)

`core/connector-outcome.js`: `{connector, closeType, stage, latencyMs, destinationSystem, lang, at}`; **no text, address or title** (keys outside the list are dropped; a value that is not a short token is dropped). Emitted from `notionReadBackWrite` / `notionReadBackUndo` for `approved`, `handled`, `readback_failed`, `undone`; `offered`, `edited` and `ignored` are defined and tested but have **no emitter yet** (they belong to the steps-list card, not the writer). Stored on the device in `connectorOutcomes` (capped at 400). Switch off: nothing is emitted. Conclusions are pure functions with tests: destination order, offer level (normal / reduced / withhold by undo rate), vendor failure memory, median latency. **Wiring those conclusions into what the card offers is not built yet** (same row 70); until then they move nothing.

## 6. Tests (all against a mock; no real account, key or mail)

| File | What it proves |
|---|---|
| `flow-trial-extension/test/notion-close-corpus.cjs` (30) | success; only title + due written; idempotent; read-back after reload; archived-by-someone → not Handled; Undo with read-back; 401 → refresh; refresh fails; no refresh token; 403; 404; 429 + Retry-After (and forever); 5xx that did / did not create; 409; timeout; network down; **created but read-back fails → not Handled, retry never re-POSTs**; wrong id / empty / changed shape; other database / changed title; id-less 200; no title column; no date column / bad date; **injection**; clipping; no token in ledger or proof; not connected |
| `flow-trial-extension/test/notion-wiring-corpus.cjs` | switches default off and change nothing; on: proof, accepted by `FlowProofOfClose`, second click, events carry no text, Undo read back, Disconnect forgets token + ledger, read-back 500 through the real wiring; OAuth: authorize URL, relay body is exactly `{vendor, grant, code, redirect_uri, install_id}`, forged state refused, no client id → asks nothing, relay refusal stores nothing |
| `flow-trial-extension/test/connector-outcome-corpus.cjs` (12) | no text can ride along; off emits nothing; each conclusion moves the next offer the expected way; one hasty undo does not silence |
| `flow-trial-extension/test/consent-catalog-corpus.cjs` (10) | nothing ticked = nothing asked; Select all excludes `coming`; one Microsoft sign-in; no Send; agrees with `FlowOutlookConfig` |
| `flow-landing/netlify/functions/token-relay/token-relay.test.cjs` (16) | allow-list, fixed token URL, secret not in body/response/log, redirect + origin checks, rate limit, vendor errors |

## 7. Security checks (each named)

1. Scopes minimal: three Notion capabilities, no user-info, no comment; no `/search`, no `/users` call (asserted).
2. No token in the ledger, the proof, the outcome events or any log (asserted; the relay logs only vendor name, grant, status).
3. Injection: a hostile title (JSON break-out, path traversal, script, markdown link, prompt text) stays one plain-text title; parent, endpoint and property names cannot move (asserted).
4. `state` checked before the code is used; a forged state never reaches the relay (asserted).
5. Relay: not an open proxy (fixed vendor list, fixed token URL, request-supplied URLs ignored), secret never returned, redirect_uri pinned to this extension, CORS only for the extension origin.
6. Nothing private leaves the device except the one-time code / refresh token on its way to Notion through the relay. No masked text, no title, no address goes anywhere new.
7. Never `Mail.Send`; Notion writes nothing to anyone.

## 8. Known limits

- Dedup for an unknown-outcome POST relies on a title query within a one-minute window; two different loops with the **same exact title** created within that window could be confused. The loop key makes the normal path exact.
- The ledger holds the clipped title (to verify the read-back and adopt a lost POST). It is on the device and is removed on Disconnect. The earlier connector's Activity log already holds titles.
- Notion does not enforce uniqueness; the person can duplicate the row by hand in Notion; Glance does not police that.
- Property mapping is minimal on purpose (title + due date). The earlier connector's richer fill (amount, quote, sender) is **not** in the proof writer.
- Token refresh and revoke details are unverified (see §2).

## 9. OWNER PACK

1. **Console.** `https://www.notion.so/my-integrations` → New integration → type **Public**. Redirect URI to paste: `https://dnjhplgmnkabbjogfpbhofjedlkehkai.chromiumapp.org/` (and the Chrome Web Store id's `chromiumapp.org` URL once it exists). Capabilities: **Read content, Insert content, Update content**; user information: **No user information**; comments: none.
2. **Netlify env vars** for the relay: `NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET` (and `EXTRA_EXTENSION_IDS` for the store id). Put the **client id** (public) in `OAUTH_PUBLIC.notionClientId`.
3. **Vendor review.** A public integration needs the Notion listing details: name, logo, a privacy policy URL and a terms URL, a description, and the website. (Verify the current requirements on Notion's page before submitting.) Justification text per capability: *Read content*: "to read the title column and confirm the row Glance added exists." *Insert content*: "to add one row, the task the person approved." *Update content*: "to archive that one row if the person presses Undo."
4. **Chrome Web Store permission justification (DRAFT):** "Host permission for api.notion.com: lets Glance add one row to the Notion database the person chooses and read it back. Requested only when the person ticks Notion."
5. **Privacy-page paragraph (DRAFT, not edited in any page):** "If you connect Notion, Glance adds the task you approve as one row in the database you chose and reads it back to confirm. The Notion access token stays on your device. When you sign in with Notion, the one-time sign-in code and, later, the refresh token pass through our server once, only to be exchanged with Notion; we do not store or log them, and we never see your Notion content."
6. **Live Gate script** (owner, own Notion account, after the switches are turned on for the build the owner chooses):
   1. Create a throwaway database "Glance test" with a Name (title) and a Due (date) column; share it with the integration.
   2. Connect Notion in the popup (token, then "Sign in with Notion" if the relay is deployed). Expect: "Connected: Glance test".
   3. In Gmail, open a mail with a clear ask and a date; press Do It on the task step. Expect: the card says Verifying…, then Handled; the row appears in Notion with the title and due date.
   4. Press Do It again / reload Gmail and look: still exactly one row.
   5. Press Undo. Expect: the card reverts; the row is in Notion's Trash (archived).
   6. Revoke the integration's access in Notion, press Do It on a new mail. Expect: "Notion isn't connected" and **no** Handled.
   7. Pass = steps 3–6 behave as written. Anything else: do not turn the switch on for anyone.

## 10. Blockers to going live

(a) the owner registers the Notion public integration (§9.1) and sets the env vars; (b) the owner deploys the relay (`«מאשר»`; nothing here deploys); (c) `api.notion.com` host in `manifest.json` / optional permission + store re-review (`«מאשר»`); (d) privacy page and store text (§9.4, 9.5) applied by the owner; (e) the unverified vendor facts in §2 confirmed; (f) the steps-list destination wiring (row 70).
