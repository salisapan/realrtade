# Glance value audit

Audited against GitHub `main` at `b096cbb` (2026-09-27), Glance **0.7.0**. No product behavior changed for this write-up. Source of truth is that tree: `flow-trial-extension/manifest.json`, `flow-trial-extension/README.md`, `flow-trial-extension/core/connectors.js`, and the writers in `src/background.js`. A local snapshot or an older commit is not.

This file replaces the audit on draft PR #25, which was measured against `46dfdc8` (version 0.6.0). That write-up is not a description of what ships now.

Glance is the self-serve product. Flow is the separate enterprise product for regulated organizations. This audit does not move security, compliance, SSO, audit-log, or “implemented for you” claims onto Glance. The boundary is `docs/product-architecture.md` §0a (what ships) and §4 (the two products stay two products).

## What the previous audit got wrong

PR #25 described a Notion-front-door extension with no Calendar and no Tasks:

- It said there is no Calendar host permission, no Tasks host permission, and no writer that creates an event or an open task. `identity` was described as only the OAuth redirect for HubSpot, Salesforce, Slack, and Monday.com.
- It ranked “make Do It create the next object (a prefilled Google Calendar template first)” as item 1, because a successful click was framed as filing a log receipt.
- It treated HubSpot, Salesforce, Slack, and Monday.com as visible **Needs setup** cards, and Notion as the only destination a user can connect.
- It treated the sidebar, Draft-It, attachment X-ray, Privacy Shield, and the Next-Step `.docx` as loaded-and-unmounted leftovers, and treated judgment as the only thing on the chip.

`main` at 0.7.0 is a Google loop:

1. **Google is the MVP connector** (`connectors.js` `id: 'googleTasks'`, label `Google`, `auth: 'google'`, `mvp: true`, `status: 'live'`). One `chrome.identity.getAuthToken` grant covers the scopes in `manifest.json`: `tasks`, `calendar.events`, `gmail.compose`, `drive.readonly`.
2. **Calendar is a real Calendar API write.** `googleCalendarWrite` POSTs to `https://www.googleapis.com/calendar/v3/calendars/primary/events`. A named time becomes a timed event (default length 30 minutes). A date with no clock time becomes an all-day event. Undo DELETEs that event. This is not a `calendar.google.com/calendar/render?action=TEMPLATE` tab.
3. **Tasks and Gmail drafts are the other two live writers.** Tasks land in a list titled `Glance`. A Gmail draft is created and never sent.
4. **Notion is live in the catalog** (`status: 'live'`, `auth: 'token'`). It is not the front door. The popup does not render it. The chip does not route to it. `api.notion.com` is not in `host_permissions`.
5. **HubSpot, Salesforce, Slack, and Monday.com are `building`.** Client ids in `background.js` are still `YOUR_*_CLIENT_ID` placeholders. Their API hosts were removed from `manifest.json` `host_permissions` for Chrome Web Store review. Writer functions remain in `WRITERS` so a direct caller is not a missing-key crash; the Gmail chip does not call them.
6. **The chip closes a named process**, not a single “Log …” page. `core/actions.js` maps intent to Schedule & Confirm, Schedule It, Reply & Track, Follow Through, or Log It, and runs Calendar, Gmail draft, and Task steps. Execution Memory reorders non-anchor steps from local history.

Draft PR #27 opens a prefilled Calendar TEMPLATE and states that Glance does not call the Calendar API. That statement is false against this `main`. TEMPLATE may be a supplemental or legacy idea. It must not be documented, demoed, or prioritized as “add Calendar, because Calendar is missing.”

## Do this next

Ordered by what still blocks a true first close on the loop that already exists. Do not spend the next change inventing a calendar destination.

1. **Scorer accuracy, on the local engine.** `core/judgment.js` and `core/intent.js` decide whether the Google writers run. The design bias is silence over a wrong write. Recent `main` commits already widened the English and Hebrew lexicons, stopped REQUEST from depending on a date or amount, and added dismissal-based suppression. Keep measuring against `test/judgment-corpus.cjs` and `test/intent-actions-corpus.cjs`. The remote classifier (`ensureRemoteClassification` → `glance-assist` `classify`) is a masked fallback for a local miss, and it stays silent when `ANTHROPIC_API_KEY` is unset. It is not a reason to stop tightening the local corpus, and it is not a second product.
2. **Chrome Web Store.** The extension is still installed by Load unpacked. `flow-trial-extension/docs/chrome-web-store-submission.md` already drafts the listing around the Google three. Finish the human dashboard steps (screenshots, data-use form). Do not put Notion or the four building connectors in the listing.
3. **Keep the building connectors hidden.** `popup.js` already renders only `mvp: true`. Leave HubSpot, Salesforce, Slack, and Monday.com off that screen, off the store listing, and out of Glance marketing sentences. Do not restore their API hosts until a connector is actually reachable. Notion stays in the catalog as token-live code, not as the demo path.

Explicitly not on this list: “add Calendar because the product has none.”

## 1. The live loop

Gmail reading pane → on-device judgment and intent → one process chip, or silence → one or more Google writes → a receipt with Undo.

| Step | What actually happens | Where |
|---|---|---|
| Version | Manifest name Glance, version **0.7.0**. `oauth2.client_id` is a real Google client id, not the `YOUR_GOOGLE_OAUTH_CLIENT_ID` placeholder `googleTasksConfigured()` rejects. | `manifest.json`; `background.js` |
| Attach | Content script on `https://mail.google.com/*` only. | `manifest.json` |
| Connect | Popup shows one card, **Google** / Tasks, Calendar & Gmail. The same grant can also be requested the first time a real chip is about to show (`ensureGoogleAutoConnect`). | `popup.js` `renderConnectors`; `content-gmail.js` |
| Judge | `judgment.js` scores in the tab. `intent.js` classifies into scheduled event, request, commitment of the reader, decision to log, or follow-up. Below the bar, or no type, the remote fallback may run once (below). Otherwise nothing is drawn. | `core/judgment.js`, `core/intent.js` |
| Plan | One named process. Anchor step cannot be dropped. Execution Memory may reorder or drop a non-anchor step this account has net-rejected. | `core/actions.js`, `core/execution-memory.js` |
| Write | Step kind `calendar` → Calendar API event. `gmailDraft` → Gmail draft (optional Drive file). `googleTask` → task in the Glance list. Undo reverses that step. | `background.js` |
| Quiet | Most mail produces no chip. That is the product. | `judgment.js` |

Host permissions on this manifest: `mail.google.com`, `tasks.googleapis.com`, `www.googleapis.com/calendar`, `www.googleapis.com/drive`, `gmail.googleapis.com`, `theflow-ai.com`. Not Notion, HubSpot, Salesforce, Slack, or Monday.com.

### What one click can create

| Process | When | Steps | Closed line |
|---|---|---|---|
| Schedule & Confirm | Scheduled event that also asks the reader to confirm | Calendar (anchor), Gmail draft, Task | Scheduled, drafted, and tracked. |
| Schedule It | Scheduled event | Calendar (anchor), Task | Scheduled, with a reminder set. |
| Reply & Track | Request | Gmail draft (anchor), Task | Drafted and tracked. |
| Follow Through | Commitment of the reader | Task (anchor), Gmail draft | Reminder set, reply ready. |
| Log It | Decision to log, or follow-up | Task | Logged and tracked. |

A Gmail draft is a skeleton the user sends themselves. The draft step does not call a language model. Drive (`drive.readonly`) can attach a file the thread already has, a file the user picks, or a Drive search when the message names an object such as an invoice. That search is part of the draft step, not a fifth connector card.

## 2. Surfaces in the tree

| Surface | On the live path? | What it needs |
|---|---|---|
| Judgment, extract, intent, named processes | Yes. This is the chip. | Nothing beyond the extension. Extract and judgment do not call the network. |
| Execution Memory | Yes. Local `chrome.storage`. Biases the next chip. `toPatternSummary()` is unused foundation, not a team feature. | Nothing leaves the device. |
| Google Tasks, Calendar events, Gmail drafts, Drive attach | Yes, after the Google grant. | `chrome.identity` and the scopes above. Calendar is the API writer, not a template URL. |
| Morning Brief, contextual resurfacing, weekly closing line | Yes, once the account is onboarded to Google. `init()` calls `checkBrief()` and `checkWeeklySummary()`. They render only when something is still open. | The same local log as the chip. Hidden when the stored connector is not Google. |
| Privacy Shield | Used on the remote-classify fallback (masked text only). Also the mask Draft-It and X-ray would use. | The token map stays in the tab. |
| Remote classify | Called only when local `classify()` returns no type. Failure, including “not configured,” stays silent. | `ANTHROPIC_API_KEY` on `glance-assist`. Model id in that function is `claude-opus-5`. |
| Sidebar, Draft-It, `.docx` X-ray, Next-Step `.docx` | In the tree. **Not mounted.** `mountSidebar()` and `wireAttachmentHoverCards()` are not called. `docwriter.js` / `docreader.js` are the local docx tools those screens would use. PDF is unsupported. | Remount only after `glance-assist` is actually configured. Until then a click would show “This feature is not configured yet.” |
| Notion | Catalog `live`, token, writer function present. | Not on the chip, not in the popup, no Notion host permission. |
| HubSpot, Salesforce, Slack, Monday.com | Catalog `building`. Placeholder client ids. | Hidden. Hosts stripped. Do not demo them as connectable. |
| Pipedrive | Catalog `planned`. | No button. |

`flow-trial-extension/README.md` still leads “What actually works today” with a five-destination table (Notion through Monday.com) and only later documents Google as the default. Read §0a and this file first when those paragraphs disagree. The README’s own layout list and the Chrome Web Store draft are closer to the code.

## 3. Demo truth

A demo of Glance on this build may say:

- Install is still unpacked, not the Chrome Web Store.
- Sign in with Google once. The popup does not ask which CRM to use.
- Open a Gmail message that actually decides something. Most messages stay quiet.
- Do It writes into that Google account: a Calendar event, a Task, a Gmail draft, or the combination the process names. Undo removes what that click created. A draft is not sent.
- Judgment for a local hit stays on the device.

A demo may not say:

- Glance’s only working destination is Notion, or that the product is a log of a sentence.
- Glance has no Calendar, so the next step is a Calendar TEMPLATE link.
- HubSpot, Salesforce, Slack, or Monday.com can be connected in this build.
- Draft-It, attachment X-ray, or a generated `.docx` is on the screen. The code is there; the UI is not mounted.
- Glance carries Flow’s security review, SSO, audit log, DPA, or on-prem deployment. Those are Flow. Pro (shared connectors, weekly digest) is not this build either.

`trial.html` already names Google Calendar, Tasks, and a draft reply. One FAQ answer says mail is not sent to a server to decide. That is true for a local hit. A local miss can send **masked** text to `glance-assist` for classification. `privacy.html` discloses Draft-It and the attachment summary as unmounted, and does not yet name that classify fallback. Fix that sentence in the same pass as any other “nothing leaves the device to decide” claim. Do not “fix” it by turning the remote call off in a docs change.

The Flow enterprise pricing card that says Notion, HubSpot, Salesforce, Slack, and Monday.com are included is Flow’s setup-fee language, not a Glance connect button. Leave it on the Flow side of the page.

## 4. Related drafts

| PR | How to treat it against this `main` |
|---|---|
| [#25](https://github.com/salisapan/realrtade/pull/25) | Superseded by this file. Do not revive its “no Calendar / add a TEMPLATE” ranking. |
| [#27](https://github.com/salisapan/realrtade/pull/27) | TEMPLATE hold. Do not merge it as if Calendar were missing. If any of it survives, it has to be supplemental to `googleCalendarWrite`, and its “does not call the Calendar API” claims have to be deleted. |
| [#24](https://github.com/salisapan/realrtade/pull/24), [#23](https://github.com/salisapan/realrtade/pull/23) | Scoring and public-engine sync, opened against older `main`. Rebase and remeasure before treating their score tables as current. Scorer accuracy is still priority 1; those diffs are not automatically the patch. |
| [#21](https://github.com/salisapan/realrtade/pull/21), [#22](https://github.com/salisapan/realrtade/pull/22), [#20](https://github.com/salisapan/realrtade/pull/20) | Install zip, env CI, engineering audit. Separate from this ranking. |

## 5. First-week success

A new user, non-sensitive work, Gmail already open in Chrome. Success is all of the following. None of it requires a new destination.

1. They add Glance from the Chrome Web Store with the Google account already in the browser.
2. One Google sign-in. They never see a connector whose button cannot succeed.
3. A real decision in their own inbox shows one process chip. Dismiss still works. Silence on newsletters still works.
4. One click creates the Calendar event, Task, and/or Gmail draft that process names. View opens the object the API returned. Undo removes it.
5. The site they came from describes this loop: Google three, click to write, local judgment, no Draft-It, no five live CRMs, no Flow compliance claim.

Out of this definition: shared team connectors, a weekly digest as a shipped Pro feature, SSO, an audit log, a mounted sidebar model, and any security or compliance claim. Those belong to Flow, or to Glance Pro after the product owner picks a Pro list (`docs/product-architecture.md` §2).
