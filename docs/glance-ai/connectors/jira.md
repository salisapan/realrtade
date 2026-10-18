# Connector: Jira — one issue exists in your project, read back

**Glance closes open loops. Gmail is where it starts today.** Status: **built and tested against a mock of the Jira Cloud API. Not verified live. Not deployed.** Both switches (`config/connectors.public.js`: `jiraReadBack`, `jiraOAuth`) are **off**. Date: 2026-10-18. Queue row 3 (`connectors-queue.md`), claimed in `integrations/QUEUE.md`. Built on the foundation from the Notion run (`token-relay.md`, `core/consent-catalog.js`, `core/connector-outcome.js`); quality bar: `integrations/QUALITY-BAR.md`.

## 1. Contract (written before the code)

- **The close it makes real.** A task-only Do It adds **one issue** (summary, and a due date when it is a clean `YYYY-MM-DD`) to the Jira Cloud project the person chose, with the issue type found at connect time (the type named "Task", else the first non-subtask type).
- **The read-back.** `GET /issue/{key}?fields=summary,project,status,duedate`. **Handled** only when it returns the same key, the summary Glance wrote, the chosen project, and a status that is not in the "done" category. `ProofOfClose = {system:"jira/issue", externalId: key, fetchedBack:true, verifiedAt, url: <site>/browse/<key>}` (`SYSTEM_JIRA` in `core/proof-of-close.js`). The url is only set when the stored site is `https://<name>.atlassian.net`.
- **Not a close:** the POST answering 201; a read-back that fails, answers another issue, a different summary, an issue in another project or one already Done (`verify_failed`). The issue may exist; a retry re-reads it and never makes a second.
- **Undo.** `DELETE /issue/{key}`, then `GET`; undone only when Jira answers **404**. If the person's Jira role may not delete issues (403) Undo answers `delete-not-permitted` and **the issue stays**: Undo is never claimed without the read-back. An issue already gone is "Already gone", no read-back claimed.
- **Idempotent.** One issue per loop key (device ledger `jiraLedger`, max 200). A second click or retry re-reads the stored issue and does not POST. If a POST's outcome is unknown (5xx, timeout, 409, a key-less 201) the project's issues created in the last 10 minutes are read (`project = "KEY" AND created >= -10m`) and the one with the same summary is adopted. The title is never put into the query.
- **Not a close:** nothing is sent to anyone; no assignee, no comment, no transition, no watchers.

## 2. Capability matrix (quality bar §1)

| Capability | Endpoint | Minimum scope | Undo | Read-back | Built |
|---|---|---|---|---|---|
| Create an issue in a project | `POST /rest/api/3/issue` | `write:jira-work` | `DELETE /issue/{key}` + `GET` → 404 | `GET /issue/{key}` | **yes** |
| Read the issue back | `GET /rest/api/3/issue/{key}` | `read:jira-work` | - | - | **yes** |
| Adopt after an unknown outcome | `GET /rest/api/3/search/jql` | `read:jira-work` | - | - | **yes** |
| Find the site | `GET api.atlassian.com/oauth/token/accessible-resources` | (the token) | - | - | **yes** (connect only) |
| Read the project's issue types | `GET /rest/api/3/project/{key}` | `read:jira-work` | - | - | **yes** (connect only) |
| Transition an issue to Done when the loop closes elsewhere | `POST /issue/{key}/transitions` | `write:jira-work` | reverse transition | `GET` | no (later slice) |
| Comment | `POST /issue/{key}/comment` | `write:jira-work` | `DELETE` comment | `GET` comment | no |
| Attach a file / link | `POST /issue/{key}/attachments` | `write:jira-work` | `DELETE` | `GET` | no |
| Assign, watch, user search, project list, filters | various | - | - | - | **no, and asserted unused** |

The classic scopes are coarser than the one close needs (`write:jira-work` also covers comments and transitions). Atlassian also offers granular scopes (for example `write:issue:jira`, `read:issue:jira`, `delete:issue:jira`, `read:project:jira`) **as I remember them; unverified** (§9). If the owner prefers them, the scope string is one constant (`JIRA_SCOPES` in `src/background.js`). Deleting additionally needs the person's Jira project permission, not a scope.

## 3. Auth

OAuth 2.0 (3LO): `https://auth.atlassian.com/authorize?audience=api.atlassian.com&client_id=…&scope=read:jira-work write:jira-work offline_access&redirect_uri=…&response_type=code&prompt=consent&state=…`. `state` round-trips through `runOAuthFlow`. PKCE: **none** (Atlassian 3LO does not document it: unverified). The code goes to the token relay (vendor `jira`: JSON body with client id and secret to `https://auth.atlassian.com/oauth/token`). Then the site is resolved from accessible-resources (only an id that is a UUID and a url that is `https://<name>.atlassian.net` are accepted; several sites and a bare key → the person is asked for a link), the project is read, and the issue type is chosen. Stored on the device (`jiraAuth`): token, refresh token, cloud id, site url, project key and name, issue type. A 401 triggers one refresh through the relay; **Atlassian rotates the refresh token**, so the new one is saved (tested); if the refresh fails the close says "not connected" and writes nothing. Disconnect removes `jiraAuth` and `jiraLedger`.

Every stored value is checked against a strict shape (project key `[A-Z][A-Z0-9_]{1,9}`, UUID cloud id, digits issue type) before it enters a URL or a JQL query; a malformed value means "not connected" and nothing is sent (tested).

**Manifest:** the API calls go to `https://api.atlassian.com/*`. **Not added** (this PR changes no permission). Going live needs it: owner «מאשר» + store re-review.

## 4. Switches (both default off)

| Switch | With it off |
|---|---|
| `jiraReadBack` | No Jira writer or undoer is registered at all (`WRITERS.jira` is undefined); nothing is emitted. |
| `jiraOAuth` | `connectJiraOAuth` refuses and calls nothing. Also needs the relay deployed and `OAUTH_PUBLIC.jiraClientId` set. |

## 5. Recognition and the plan

- **No new recognition.** Jira is a **destination** for a close that is already recognised (a task-only Do It). The Hebrew/English recognition, the precision gates and the hard quiets are untouched. No new loop type, so no new intent examples (quality bar §7: **not applicable**; no weights or gates changed).
- **Appears in the steps list / Loops: NOT YET** (same gap as Notion and Asana, `open-tasks.md` row 75): the steps list builds only `googleTask` / `outlookTask`; choosing Jira via `FlowConnectorOutcome.destinationOrder` needs an owner decision on the default when several task systems are connected.
- **Silent when:** not connected, switch off, no project, no title.

## 6. Learning hook

`core/connector-outcome.js` events with `connector:"jira"`, `destinationSystem:"jira/issue"` from the writer: `approved`, `handled`, `readback_failed`, `undone`. `offered`, `edited`, `ignored` have no emitter yet (the steps-list card). No title, address, issue key or text (asserted). Off with the switch. Conclusions exist and are tested but no card reads them yet (row 75).

## 7. Tests (against a mock; no real account, key or mail)

| File | Proves |
|---|---|
| `test/jira-close-corpus.cjs` (33) | success + proof + browse url; only issue endpoints; idempotent; reload; Done/removed by someone else; Undo with read-back, **403 on delete = not claimed**, delete that does nothing, already gone, non-key paths; 401 refresh with **rotated refresh token saved**, refresh fails / none; 403; 404; 400 (field rejected, not retried); 429 + Retry-After (and forever); 5xx did/did not create; 409; timeout; network down; **created but read-back fails → not Handled**; other issue / empty / changed shape / other project / other summary / Done; key-less 201; malformed stored auth incl. JQL-injection project key; **adopt query carries no title**; bad date; **injection**; clipping; no token in ledger/proof; foreign site url never in the proof; not connected |
| `test/jira-wiring-corpus.cjs` | switches off register nothing; on: proof accepted by `FlowProofOfClose`, 2nd click, events with no text, Undo, Disconnect, read-back 500 via the real wiring, three connectors together; OAuth: authorize URL and scopes, relay body, site + project + Task type resolution (not Epic/Sub-task), one-site bare key, several sites, non-Atlassian site ignored, forged state, no client id, relay refusal, project parsing |
| `token-relay.test.cjs` (+1) | Jira JSON body and refresh, secret never returned |
| `test/consent-catalog-corpus.cjs` (+1) | `jira` tick = relay sign-in + `api.atlassian.com` host only; Select all includes it |

## 8. Security checks (named)

Scopes minimal as far as the classic scopes allow and unused endpoint families asserted (no user search, project list, filters); no token, key or title in events; no token in ledger, proof or logs; hostile summary cannot move project, issue type, endpoint or fields; **JQL injection closed**: the project key is validated by regex and the title never enters a query; ids validated before they enter a path; `state` checked before the code leaves; relay is not an open proxy and never returns or logs the secret; only the one-time code or refresh token leaves the device (through the relay); nothing is sent to a person.

## 9. Vendor facts I could not verify (the docs host `developer.atlassian.com` was blocked from the build sandbox)

The authorize/token URLs and JSON token body; `audience`, `prompt=consent` and the `offline_access` scope for refresh; **rotating refresh tokens** (and their lifetime / reuse rule); no PKCE for 3LO; accessible-resources shape; the gateway path `https://api.atlassian.com/ex/jira/{cloudId}/rest/api/3`; issue create body (`fields.project.key`, `fields.issuetype.id`, `summary`, `duedate`) and that `duedate` and the issue type are on the create screen; `GET /search/jql` (the older `/search` is being removed: confirm the current path and JQL `created >= -10m`); 404 after delete, 204 on delete, 403 when the role cannot delete; statusCategory key `done`; `Retry-After` on 429; granular scope names; marketplace/app review rules. **The owner Gate must confirm each on the vendor page before go-live.**

## 10. Known limits

- A project whose "Task" type lacks the due date field answers 400 (`rejected`); Glance does not retry without the date (a wrong outcome is worse than none). Team-managed projects may need a different type: the owner Gate checks this.
- Adoption reads the last 10 minutes of the project (50 issues) and matches an exact summary; two same-titled loops in that window could be confused (the normal path is exact via the loop key).
- The ledger holds the clipped title (to verify and adopt); on the device, removed on Disconnect.
- Only summary and due date are written (no description, assignee, labels).
- Delete may be forbidden by the person's role; then Undo cannot undo and says so. A "move to a Cancelled status" fallback is a later slice.
- An issue moved to Done in Jira is not yet read as "the loop closed" (later slice).

## 11. OWNER PACK

1. **Console.** `https://developer.atlassian.com/console/myapps/` → Create → OAuth 2.0 integration. Callback URL: `https://dnjhplgmnkabbjogfpbhofjedlkehkai.chromiumapp.org/` (and the Chrome Web Store id's URL when it exists). Permissions: Jira platform REST API → classic `read:jira-work`, `write:jira-work` (or the granular set in §2). Distribution: "Sharing" must be enabled for other people's sites.
2. **Netlify env vars** (relay): `JIRA_CLIENT_ID`, `JIRA_CLIENT_SECRET`. Public client id into `OAUTH_PUBLIC.jiraClientId`.
3. **Vendor review.** Sharing an Atlassian OAuth app beyond your own site needs the distribution settings (vendor name, privacy-policy URL, data-handling answers) and, for the Marketplace, a review (verify the current requirements). Scope justification: *write:jira-work*: "to create the one issue the person approved, and to delete it only if the person presses Undo." *read:jira-work*: "to read that issue back and confirm it exists before showing it as done, to read the project's issue types, and to adopt an issue after a network failure so no duplicate is created."
4. **Chrome Web Store permission justification (DRAFT):** "Host permission for api.atlassian.com: lets Glance add one issue to the Jira project the person chooses and read it back. Requested only when the person ticks Jira."
5. **Privacy-page paragraph (DRAFT, not applied):** "If you connect Jira, Glance adds the task you approve to the project you chose and reads it back to confirm. The Jira access token stays on your device. When you sign in with Atlassian, the one-time sign-in code and, later, the refresh token pass through our server once, only to be exchanged with Atlassian; we do not store or log them, and we never see your Jira content."
6. **Live Gate script** (owner, own Jira Cloud site, after the switches are turned on for the chosen build):
   1. Use a throwaway project "Glance test" (key e.g. `GT`) on your own site; make sure you may create and delete issues.
   2. Connect Jira in the popup with the project link. Expect "Connected: Glance test".
   3. In Gmail open a mail with a clear ask and a date; press Do It on the task step. Expect Verifying…, then Handled; the issue appears in the project with the summary and due date.
   4. Press Do It again / reload Gmail: still exactly one issue.
   5. Press Undo. Expect the card to revert and the issue gone. Then, as a user who may **not** delete issues, repeat 3 and press Undo: expect "can't undo: your Jira role can't delete" and the issue still there, with no Handled lost or invented.
   6. Wait for the access token to expire (about an hour), press Do It: expect it to work after a silent refresh. Disconnect, then Do It: "not connected", no Handled.
   7. Pass = 3–6 as written. Anything else: do not turn the switch on for anyone.

## 12. Blockers to going live

(a) owner registers the Atlassian app and sets the env vars; (b) owner «מאשר» to deploy the relay; (c) `api.atlassian.com` host + store re-review; (d) privacy/store drafts applied; (e) the unverified vendor facts in §9; (f) steps-list destination wiring (row 75).
