# Connector: Asana — one task exists in your project, read back

**Glance closes open loops. Gmail is where it starts today.** Status: **built and tested against a mock of the Asana API. Not verified live. Not deployed.** Both switches (`config/connectors.public.js`: `asanaReadBack`, `asanaOAuth`) are **off**. Date: 2026-10-15. Queue row 2 (`connectors-queue.md`), claimed in `integrations/QUEUE.md`. Built on the foundation from the Notion run (`token-relay.md`, `core/consent-catalog.js`, `core/connector-outcome.js`); quality bar: `integrations/QUALITY-BAR.md`.

## 1. Contract (written before the code)

- **The close it makes real.** A task-only Do It adds **one task** (name, and a due date when it is a clean `YYYY-MM-DD`) to the Asana project the person chose.
- **The read-back.** `GET /tasks/{gid}`. **Handled** only when it returns the same gid, with the name Glance wrote, not completed, and the chosen project among its `projects`. `ProofOfClose = {system:"asana/task", externalId: gid, fetchedBack:true, verifiedAt, url}` (`SYSTEM_ASANA` in `core/proof-of-close.js`).
- **Not a close:** the POST answering 201; a read-back that fails, answers another task, a different name, a completed task, or a task outside the project (`verify_failed`). The task may exist; a retry re-reads it and never makes a second.
- **Undo.** `DELETE /tasks/{gid}`, then `GET`; undone only when Asana answers **404** for it. A task already gone is "Already gone", with no read-back claimed.
- **Idempotent.** One task per loop key (device ledger `asanaLedger`, max 200). A second click or retry re-reads the stored task and does not POST. If a POST's outcome is unknown (5xx, timeout, 409, a gid-less 201) the project's tasks (3 pages of 100) are read for the same name created in the last minute and that task is adopted. A new approve after an Undo is a deliberate new close.
- **Not a close:** nothing sent to anyone, no comment, no assignee, no follow, no other task touched.

## 2. Capability matrix (quality bar §1)

| Capability | Endpoint | Minimum scope | Undo | Read-back (ProofOfClose) | Built |
|---|---|---|---|---|---|
| Create a task in a project | `POST /tasks` | `tasks:write` | `DELETE /tasks/{gid}` + `GET` → 404 | `GET /tasks/{gid}` | **yes** |
| Read a project's name at connect | `GET /projects/{gid}` | `projects:read` | - | - | **yes** (connect only) |
| Adopt a task after an unknown outcome | `GET /projects/{gid}/tasks` | `tasks:read` | - | - | **yes** |
| Mark a task complete when the loop closes elsewhere | `PUT /tasks/{gid}` `completed:true` | `tasks:write` | `completed:false` | `GET` | no (a "true close" from Asana completion is a later slice) |
| Add a comment to a task | `POST /tasks/{gid}/stories` | `stories:write` | `DELETE /stories/{gid}` | `GET /stories/{gid}` | no |
| Attach a Drive/OneDrive link | `POST /attachments` (external) | `attachments:write` | `DELETE` | `GET` | no |
| Choose among projects / workspaces | `GET /projects`, `/workspaces` | `projects:read` | - | - | no (the person pastes a project link) |
| Search, users, teams | various | - | - | - | **no, and asserted unused** |

Scope names above are Asana's granular scopes **as I remember them; unverified** (see §9). If Asana's app uses the older "default" full-access scope, the minimal-scope claim cannot be made and the owner must decide.

## 3. Auth

OAuth 2.0 **with PKCE (S256)**. Authorize URL `https://app.asana.com/-/oauth_authorize?client_id=…&response_type=code&redirect_uri=…&code_challenge=…&code_challenge_method=S256&state=…`; `state` round-trips through `runOAuthFlow`. The code **and the verifier** go to the token relay (`token-relay.md`, vendor `asana`), which adds the client secret (form-encoded body) and returns the token; whether Asana requires the secret when PKCE is used is unverified, the relay applies it when configured. Tokens live on the device (`asanaAuth`: token, refresh token, project gid, project name), like the other connectors. A 401 triggers one refresh through the relay; if that fails the close says "not connected" and writes nothing. Disconnect removes `asanaAuth` and `asanaLedger`. The person pastes a project link; a bare number or either Asana URL shape is accepted, anything else is refused before any sign-in.

**Manifest:** writing needs the host `https://app.asana.com/*`. **Not added** (this PR changes no permission). Going live needs it: owner «מאשר» + store re-review.

## 4. Switches (both default off)

| Switch | With it off |
|---|---|
| `asanaReadBack` | No Asana writer or undoer is registered at all (`WRITERS.asana` is undefined); nothing is emitted. |
| `asanaOAuth` | `connectAsanaOAuth` refuses and calls nothing. Also needs the relay deployed and `OAUTH_PUBLIC.asanaClientId` set. |

## 5. Recognition and the plan

- **No new recognition.** Asana is a **destination** for a close that is already recognised (a task-only Do It). The Hebrew/English recognition, the precision gates and the hard quiets are untouched. No new loop type, so no new intent examples (quality bar §7: **not applicable**; no weights, no gate changed).
- **Appears in the steps list / Loops: NOT YET** (same gap as Notion, `open-tasks.md` row 77): the steps list builds only `googleTask` / `outlookTask`; letting it choose Asana, via `FlowConnectorOutcome.destinationOrder` over the connected destinations, needs an owner decision on the default when two task systems are connected.
- **Silent when:** not connected, switch off, no project, no title.

## 6. Learning hook

`core/connector-outcome.js` events with `connector:"asana"` from the writer: `approved`, `handled`, `readback_failed`, `undone`. `offered`, `edited`, `ignored` have no emitter yet (they belong to the steps-list card). No title, address or text (asserted). Off with the switch. Conclusions exist and are tested but are not read by any card yet (row 77).

## 7. Tests (against a mock; no real account, key or mail)

| File | Proves |
|---|---|
| `test/asana-close-corpus.cjs` (30) | success + proof; only task endpoints; idempotent; reload; completed/removed by someone else; Undo with read-back (and when the delete does nothing, and when already gone, and a gid that is not digits); 401 refresh / refresh fails / no refresh token; 403; 404; 429 + Retry-After (and forever); 5xx did/did not create; 409; timeout; network down; **created but read-back fails → not Handled**; other task / empty / changed shape; other project / other name / completed; gid-less 201; bad project gid; bad date; **injection**; clipping; no token in ledger/proof; not connected |
| `test/asana-wiring-corpus.cjs` | switches off register nothing; on: proof accepted by `FlowProofOfClose`, 2nd click, events with no text, Undo, Disconnect, read-back 500 via the real wiring, Notion and Asana together; OAuth: PKCE challenge matches the verifier sent to the relay, forged state, no client id, relay refusal, project-link parsing |
| `token-relay.test.cjs` (+2) | Asana form body, verifier forwarded, secret never returned or echoed; unconfigured vendor |
| `test/consent-catalog-corpus.cjs` (+1) | `asana` tick = relay sign-in + its host only; Select all includes it |

## 8. Security checks (named)

Scopes minimal and unused endpoint families asserted (no search/users/workspaces); no token in ledger, proof, events or logs; injection in the title cannot move project, endpoint or fields; gid validated as digits before it enters a path; `state` and PKCE verified before the code leaves; relay is not an open proxy and never returns or logs the secret; only the one-time code, verifier or refresh token leaves the device (through the relay); never sends anything to a person.

## 9. Vendor facts I could not verify (the docs host `developers.asana.com` was blocked from the build sandbox)

Endpoint paths and bodies (`/tasks`, `{data:{…}}`, `projects`, `due_on`, `permalink_url`, `opt_fields`, project task paging with `next_page.offset`), the authorize/token URLs, form-encoded token request with PKCE `code_verifier`, whether the secret is required under PKCE, access-token lifetime and refresh grant, the granular scope names, that a deleted task answers 404, the 30-day trash, rate-limit headers (`Retry-After`), review requirements. **The owner Gate must confirm each on the vendor page before go-live.**

## 10. Known limits

- Adoption after an unknown POST reads at most 300 tasks of the project and matches an exact name created in the last minute; a project with more recent tasks than that, or two same-titled loops in a minute, could be missed or confused (the normal path is exact via the loop key).
- The ledger holds the clipped title (to verify and adopt); it is on the device and removed on Disconnect.
- Only name and due date are written (no notes, quote, assignee).
- A task completed in Asana is not yet read as "the loop closed" (later slice).

## 11. OWNER PACK

1. **Console.** `https://app.asana.com/0/my-apps` → Create new app. Redirect URL: `https://dnjhplgmnkabbjogfpbhofjedlkehkai.chromiumapp.org/` (and the Chrome Web Store id's URL when it exists). Tick the minimal scopes of §2 (or note if Asana only offers "default").
2. **Netlify env vars** (relay): `ASANA_CLIENT_ID`, `ASANA_CLIENT_SECRET`. Public client id into `OAUTH_PUBLIC.asanaClientId`.
3. **Vendor review.** Asana asks for app details and a review before public distribution (verify the current requirements: name, icon, privacy-policy and terms URLs, scope justification). Scope justification text: *create task*: "to add the one task the person approved to the project they chose." *read task/project*: "to read that task back and confirm it exists before showing it as done, and to read the project's name when connecting." *delete task*: "only if the person presses Undo."
4. **Chrome Web Store permission justification (DRAFT):** "Host permission for app.asana.com: lets Glance add one task to the Asana project the person chooses and read it back. Requested only when the person ticks Asana."
5. **Privacy-page paragraph (DRAFT, not applied):** "If you connect Asana, Glance adds the task you approve to the project you chose and reads it back to confirm. The Asana access token stays on your device. When you sign in with Asana, the one-time sign-in code and, later, the refresh token pass through our server once, only to be exchanged with Asana; we do not store or log them, and we never see your Asana content."
6. **Live Gate script** (owner, own Asana account, after the switches are turned on for the chosen build):
   1. Create a throwaway project "Glance test" in your own workspace.
   2. Connect Asana in the popup with that project's link. Expect "Connected: Glance test".
   3. In Gmail open a mail with a clear ask and a date; press Do It on the task step. Expect Verifying…, then Handled; the task appears in the project with the title and due date.
   4. Press Do It again / reload Gmail: still exactly one task.
   5. Press Undo. Expect the card to revert and the task gone from the project (in Asana's trash).
   6. Disconnect, then try Do It: "not connected", no Handled. Revoke the app in Asana, reconnect: works again.
   7. Pass = 3–6 as written. Anything else: do not turn the switch on for anyone.

## 12. Blockers to going live

(a) owner registers the Asana app and sets the env vars; (b) owner «מאשר» to deploy the relay; (c) `app.asana.com` host + store re-review; (d) privacy/store drafts applied; (e) the unverified vendor facts in §9; (f) steps-list destination wiring (row 77).
