# CTO path to paid — Glance (personal), 2026-10-08

Glance closes open loops. Glance's entry point is any surface the user is on.

**Supersedes the earlier narrow framing (owner lock 2026-10-08).** E1, E2, E4, E6, and C1 are no longer a minimum paid loop set. They are the reliability track. They run alongside breadth. They do not gate breadth, and they are not the product scope. Paid readiness is decided by `docs/glance-ai/paid-readiness-bar.md` (owned by the CoS).

This page is Glance only. Flow, the org product, is separate. It does not change code, the release order in `docs/open-tasks.md`, or the yaml in `docs/glance-ai/paid-readiness-bar.md`. `charge` stays false until that yaml is green.

## Product definition (vision-locked)

Glance is a system for unfinished intentions: what you asked someone for, what you promised, what someone asked of you. Its loop is detect, carry, execute, true close. Gmail is the current primary entry surface. A loop is closed only with ProofOfClose (`system`, `externalId`, `fetchedBack`, `verifiedAt`) and a read-back. Glance never sends by itself. Every send is a preview and one explicit approval. Glance stays a floating extension across platforms, plus a layer on the person's own computer. Full Microsoft, with one Instinct-style consent, is the north star. Morning invoices and a Netlify deploy stay on hold until the founder writes «מאשר». Merges land on `claude/install-uiux-pro-max-skill-a4agox`, not `main`.

## Current implementation status (this tip)

Manifest version **0.9.40** (`flow-trial-extension/manifest.json`). The paid-readiness yaml on this tip is `overall: red`, `charge: false`, package 0.9.40. Nothing in this file is a usage, conversion, or revenue number. The repository has none (`docs/open-tasks.md` row 33).

Sizes below: **S** is one module and a corpus, no new consent. **M** is one writer plus a live Gate on one surface. **L** is a new scope, a locked-wording change, or a scenario that crosses apps.

The close map says "fifty-two loop types." The tables in `docs/glance-ai/holistic-close-map.md` §1 contain **58** non-chain rows (E1–U3) and **4** chain rows (X1–X4), **62** rows. Live among them: **3** (E1, E2, E4). The "52" figure is not reproducible from those tables. The paid bar's type count is a different set: 3 of 9 weekly finishes, not 3 of 52.

---

## 1. Blunt diagnosis

A person who installed this package and paid today would get three proved writes, a draft that is not a close, and silence or a false Handled everywhere else.

**What is real, and has a passed live Gate.**

- A dated ask, or the person's own dated promise, becomes a task. Gmail writes Google Tasks and GETs the task before Handled. Undo deletes it. Outlook task-only writes Microsoft To Do the same way. Code: `flow-trial-extension/src/background.js` `googleTasksWrite` / `googleTasksFetchBack` (GET after POST), `outlookTaskWrite`; proof systems `google/tasks` and `microsoft/todo` in `flow-trial-extension/core/proof-of-close.js`. Live Gates: `docs/open-tasks.md` rows 46, 47, and the 0.9.39 re-check in row 50 (PASS on cd524a30). Headless coverage: `flow-trial-extension/e2e/proof-of-close.spec.js` (fixture Graph and Tasks, not a live mailbox).
- One attached file the person asked to save is written to OneDrive, read back, and Undo deletes it or restores the previous version. Code: `outlookFileWrite`, system `microsoft/onedrive`. Live Gates: rows 49 and 50. There is **no** OneDrive test in `flow-trial-extension/e2e/`.
- A reply Do It creates a Gmail or Outlook draft. Undo deletes the draft. The draft id is not `fetchedBack`. `gmailDraftWrite` and `outlookDraftWrite` in `src/background.js`. A draft is not a close.

**What a payer would hit the same day.**

- Suggest-save is computed and not drawn. `core/suggest-save.js` decides. `attachmentSaveWrite` exists in `src/background.js` and the comment there says the page does not call it. No steps list (Suggested / Added) is in this checkout. `docs/open-tasks.md` row 52 is open. The name 0.9.41 is not the manifest version.
- On Outlook, an eligible PDF is logged as `suggest:no-consent` even when the person has Files.ReadWrite. The page asks `FlowOnedriveFile.hasWriteScope`. That global is set by `core/onedrive-file.js`. The service worker imports it (`src/background.js`). The Outlook content-script list does not (`SURFACES.outlook.extra` in the same file: `owa-parse`, `draft-reply`, `graph-mail`, `outlook-config`, `outlook-auth`, `outlook-calendar`, `outlook-sync`, `outlook.js`, `chip-host`, `content-outlook`). When the global is missing, consent stays `null`. `suggestSave` treats any consent other than `true` as `suggest:no-consent` (`core/suggest-save.js`). Gmail hard-codes `consent: null` in `flushSuggest` (`src/content-gmail.js`), so the same reason is recorded there on purpose. The headless suite locks the Outlook bug in: `e2e/suggest-save.spec.js` says loading the module into the page would change the shipped reason, and asserts `suggest:no-consent` on an eligible mail. A payer never sees the suggestion. Why-not-shown shows a consent failure that did not happen.
- A named meeting on Google Calendar can say Handled without a read-back. `googleCalendarWrite` POSTs `/calendars/primary/events` and returns `ok: true` with `ref.eventId` from the POST body. It does not GET the event. `stepCountsAsHandled` requires `fetchedBack` only for Google Tasks, Microsoft To Do, OneDrive, and the computer kind. Every other `ok: true` counts as Handled (`core/proof-of-close.js`, comment: "Calendar, drafts, and Google Drive are not in this list"). That violates the close rule for any calendar chip that fires. Outlook calendar write is separately blocked: the checkbox asks `Calendars.ReadWrite` (`core/outlook-config.js`) and row 45 says the Entra app does not list it.
- Chat, Messenger, Teams, Slack, a sent file, and a sent receipt do not close. WhatsApp Web is an optional host and a read-only content script (`src/content-whatsapp.js`). There is no chat composer. `Mail.Send` is refused in `core/outlook-config.js`, `core/outlook-auth.js`, and `src/outlook.js`. The manifest `oauth2` scopes are Tasks, `calendar.events`, `gmail.compose`, `drive.readonly`, `drive.file`. No `gmail.send`.
- The on-device rules stay quiet when unsure. The shadow model, with the veto, misses about half of closes on machine labels (50.8%, 637/1255) and shows a wrong Do It on 1.4% (82/5727) of that set (`docs/glance-ai/STATE.md`). Those numbers are not owner-checked. Owner-verified labels are **0 of 200**. The chief-of-staff preview in `docs/glance-ai/owner-gold-preview-2026-10-08.md` is provisional. On that 17-row preview the engine on this tip is the worst row: wrong-Do-It 57.1% (4/7) and missed close 80% (8/10). n is 17 synthetic sentences. It is a warning, not a rate.
- Setup is not one screen that works. Google is one consent, with the scopes above, not the locked set (no Sheets, Docs, Slides, Contacts, Gmail search of other threads). Microsoft is one Connect screen with a checkbox per service (`CONNECT_SERVICES` in `core/outlook-config.js`). Checking Calendar, Contacts, or Teams asks scopes the Entra app is documented as not listing (rows 44 and 45). The consent window then fails. Files.ReadWrite and Tasks.ReadWrite are in the same "missing" note in row 44, but the OneDrive and To Do live Gates passed, so those two grants existed on the account that ran the Gate. The Entra portal itself is not in this repository. See §7.
- Pro is not for sale, and the three proved writes are Free. See §5.

**Claims from the team, checked against this checkout.**

| Claim | Verdict |
|---|---|
| 3 of 52 loop types covered, paid bar red | Bar red: yes (`paid-readiness-bar.md` yaml). Live types: 3 (E1, E2, E4). The catalog count 52 does not match the tables (58 + 4 chains). |
| 0.9.41 in progress: steps list, 7 display bugs, Outlook `suggest:no-consent` because `FlowOnedriveFile` is missing | The consent bug is in this tree and the e2e expects it. The steps list is not in this tree. Display bugs named and tested here are **3** (stale Undone banner, double Handled receipt, Why-not-shown mismatch): `e2e/display-bugs.spec.js`, row 51. A list of 7 is **UNKNOWN**. Not in `docs/open-tasks.md`, `docs/vault/sessions/2026-10-08.md`, or the e2e suite. |
| Google connection fallback from 0.9.39 not tested live | The code and the mock corpus exist (`src/background.js` `launchWebAuthFlow`, `test/google-web-auth-corpus.cjs`). Row 50 records a live Gate PASS of package 0.9.39 on cd524a30. That note does not say the backup window was the path that connected. The e2e asserts that a `getAuthToken` failure does **not** open a window (`e2e/google-connect.spec.js`). A live success of the fallback is **UNKNOWN**. |
| Entra missing `Calendars.ReadWrite`, Contacts, `Chat.Read` | The extension asks for them. Rows 44 and 45 say the app does not list them. No live Calendar, Contacts, or Teams Gate has passed. Portal state is not in git. Treated as blocked. `Mail.Send` is not asked. |
| `Mail.Send` not built; per-email approval; never auto-send | Confirmed. Not built. The lock holds in code. |
| Own-computer driver is a skeleton | Confirmed. `docs/computer-proof-gate.md`: live page driver not wired. Corpus injects the reader. `computer/local/<app>` is not a proof. |
| Own model has 0 of 200 owner labels | Confirmed. `owner-gold.jsonl` has no owner-verified rows. `labeledBy` must be `sali`. |

The 0.9.40 Gate has not been run live (row 51). Headless CI is not that Gate.

---

## 2. Reliability track (E1, E2, E4, E6, C1)

E1, E2, E4, E6, and C1 are the reliability track: bugs to fix, running alongside breadth. They do not gate breadth, and they are not the product scope. Paid readiness is decided by `docs/glance-ai/paid-readiness-bar.md` (owned by the CoS).

The bugs on this track are the Outlook suggest-save `suggest:no-consent` read, Calendar without `fetchedBack`, one-click, Undo, and error copy. Frequency figures below are the judgments in the close map, not telemetry.

| Order | Loop | Why this one | What "flawless" is |
|---|---|---|---|
| 1 | **E1** Dated ask becomes a task | Frequency 5. Already live on Google Tasks and Microsoft To Do. | Same sentence, Hebrew or English, Gmail or Outlook: one task, GET, Handled, reload remounts, Undo deletes that task and Activity drops HANDLED. A second click does not create a second task. |
| 2 | **E2** Your own dated promise becomes a task | Frequency 5. Same writer as E1, different detector (`detectCommitmentSentence`). Splitting it keeps a promise from being graded as an ask. | "אחזור אליך ביום חמישי" and the English equivalent take the task path, not a reply draft. The 0.9.39 panel bug (a task-only close wrote a draft) stays dead. |
| 3 | **E4** One attachment saved to OneDrive, when they asked | Frequency 4. The only proved file write. A payer who lives in Outlook loses contracts in the inbox. | One real file, GET, Undo. Two files, a refusal, and a shared-folder ask stay silent. Gmail that names OneDrive stays quiet. |
| 4 | **E6** Suggest-save, accepted, then proved | Frequency 5, score 300, the top unfinished row. The unasked PDF is the daily loss. The engine exists. The card does not, and the Outlook consent read is wrong. | The suggestion is visible. Accept writes one file and Handled waits for GET. Dismiss writes nothing. No consent, or a missing scope, says reconnect and does not pretend the file was ineligible for another reason. |
| 5 | **C1** A named meeting on the person's calendar, no guests | Frequency 5, score 240. The writer exists. The proof does not, and today `ok: true` can say Handled. Google `calendar.events` is already in the manifest. | One named clock. POST, then GET by id, then Handled. Undo deletes that event. No attendees. "Find a time" shows nothing. Two clocks show nothing. An Outlook token without `Calendars.ReadWrite` says reconnect and does not say Handled. |

E1 and E2 are one writer with two detectors. They are listed separately because a payer notices both, and a regression that turns a promise into a draft is a different bug from a missed ask.

E3 (the reply) stays a draft and must not say Handled. F1 and Y1 close only when a sent message carries the file. That needs `Mail.Send` as a preview and one click. This track does not hold those loops, and it does not hold breadth. Clearing it does not flip `charge`. The charge bar stays `docs/glance-ai/paid-readiness-bar.md`.

---

## 3. Paid-bar gap table

Source of the bar: `docs/glance-ai/paid-readiness-bar.md` yaml, `updated: 2026-10-08`, `package: 0.9.40`. `overall` is green only when every row is green. Proxy numbers do not fill `current`.

| Id | Bar | Status | Evidence | Fix | Owner | Size |
|---|---|---|---|---|---|---|
| `live_loop_types` | At least 6 of the 9 weekly finishes, each with ProofOfClose and Undo where the write can be reversed | **yellow** | `current: 3`, ids E1, E2, E4. Proof systems in `core/proof-of-close.js` match those three writes. Calendar and drafts are excluded from `isProofTaskKind` on purpose. | Ship E6 (steps list plus the consent-module fix), then C1 with a GET. F1 waits on the send preview. Do not count a draft. | Dima for E6 and C1 | M, then M |
| `frequency_weight` | Live mass / 42 at least 0.60 | **yellow** | 14/42 = 0.33. The 42 is 5+5+5+4+5+5+5+4+4 on E1, E2, E3, E4, E6, C1, F1, M2, Y1. Arithmetic checks. | E6 (5) and C1 (5) take live mass to 24/42 = 0.57. One more of F1 (5) or M2 (4) or E3-as-send (5) crosses 0.60. E3-as-draft must not be added to the mass. | Dima, then the send stream | M |
| `surfaces` | Mail, calendar, files, and chat, each with one proved close | **yellow** | Mail: tasks, live. Files: OneDrive, live. Calendar: POST exists, no proof GET, and Handled is allowed without one. Chat: no composer (`docs/open-tasks.md` row 54). | Calendar proof on Google first. Chat only after an approved send exists. | Dima, then founder for the Outlook calendar scope | M, then L |
| `weekly_closes` | Median active user, at least 5 proved closes in a week | **red** | `current: null`. No population counter is wired to this bar. Activity on the device can count Handled rows with `fetchedBack` (`core/proof-of-close.js`, `core/quiet-metrics.js`). Nobody has run the 14-day note. | Do not invent a dashboard. Run the note in §2 of the paid bar after scenario A passes. | Founder (the five people). Dima only if the Activity count is wrong. | S to read, founder time to run |
| `minutes_saved` | At least 30 minutes a week, median, self-reported in week 2 | **red** | `current: null`. The 30 minutes is the $14 price test in `docs/monetization.md`. It is a bar, not a result. | Same note. A column, not a new feature. | Founder | S |
| `wrong_do_it` | At most 2% of shown Do It cards, owner-checked, n at least 100 | **red** | `current: null`. Machine proxy 1.4% (82/5727) is marked `counts_as_current: false`. Owner labels 0/200. Real-mail gold n=8 asks, model labels, and the runner did not see a card (`docs/real-mail-eval/2026-10-08.md`). | Owner-check at least 100 shown cards on mail the person received. The reliability track is where the known bugs are, and that sample is not the product scope. Do not copy 1.4% into `current`. Do not promote v2 or v2.1. | AI Engineer prepares the set. Founder marks it (`labeledBy: sali`). | M |
| `silence_on_real_loops` | At most 20% of real asks that should show a card stay silent, owner-checked, n at least 100 | **red** | `current: null`. Machine missed-close 50.8%. Human blind ASK recall 0.74 on 35 asks is sent mail, model labels, no longer blind (`docs/human-eval.md` §3). The 17-row preview is not this set. | Same owner-checked sample. Silence stays the default when the on-device rules are unsure. A model must not be added to close the gap. | AI Engineer prepares. Founder marks. | M |
| `scenario_gate_pass_rate` | Scenarios A–E all pass. Threshold 1.0. | **red** | `passed: 0`, `required: 5`. Single-action Gates (0.9.30, 0.9.31, 0.9.37, 0.9.39) are not these scenarios. Headless e2e does not run A–E. | Run A on the three proofs plus the steps list before any new type. B, C, D, E wait on send, chat, calendar proof, and the computer driver. | Dima runs A. Founder watches the live session. | M for A. L for B–E |
| `setup_minutes` | One consent screen per ecosystem, first proved close in under 10 minutes | **red** | `current: null`. Not timed. Microsoft screen exists. Checked Calendar, Contacts, and Teams boxes fail until Entra lists the permissions (rows 44, 45). Google fallback live success is UNKNOWN. | Fix the Entra grants that the checkboxes already request. Time five people who did not build it. One consent each. Stopwatch to the first proved close. | Founder for Entra and the stopwatch. Dima if the screen itself is wrong. | S once the portal is updated |
| `dogfood_keep` | At least 4 of 5 people write a line on 10 of 14 days, and each of those 4 has at least 5 proved closes in days 8–14 | **red** | `current: 0`. The free build. No Pro key. | Start only after scenario A passes on the build they install. A draft does not count. | Founder | Founder time |
| `unprompted_pay` | At least 3 of 5 say they would pay, in their own words, on a day nobody asked about price | **red** | `current: 0`. `prompted_counts: false`. | Write down the sentence. A "Would you pay $14?" form does not count. | Founder | Founder time |

`overall: red`. `charge: false`. That matches the rule in the yaml.

---

## 4. Reliability gaps

These are how the reliability track fails while looking fine. They are not the product scope.

**Silent failures.**

- Outlook suggest-save reports `suggest:no-consent` when `FlowOnedriveFile` is not on the page (§1). The e2e treats that as the contract. A green CI run does not mean consent works.
- Gmail suggest-save always passes `consent: null` (`src/content-gmail.js` `flushSuggest`). Every Gmail suggestion is `suggest:no-consent` before any other reason. That is acceptable only while the card is not drawn. The steps list must pass a real Drive consent bit, or Gmail suggestions stay a fake consent error.
- A scan exception on Outlook logs `page:scan-error` and does not show a card (`src/content-outlook.js`). The person sees silence. Why-not-shown can show the reason if the panel is opened. Many people will not open it.
- `verify_failed` after a Google Tasks POST returns `ok: false` with a `ref`, but Handled is correctly withheld (`googleTasksWrite`). The task may already exist. The receipt path does not undo a step that was not `ok` (`src/content-gmail.js`: a write that failed contributes nothing to Undo). An orphan task is the failure mode. Same shape is likely on To Do and OneDrive. **UNKNOWN** whether the live Gates ever hit a GET miss after a successful POST.
- Calendar `ok: true` without `fetchedBack` counts as Handled (§1). That is a false close, not a silent one.

**Consent and permissions.**

- Default Microsoft sign-in is `offline_access`, `User.Read`, `Mail.Read`, `Mail.ReadWrite` (`core/outlook-config.js`). To Do, Calendar, OneDrive, Contacts, and Teams are extra boxes. A mail-only token must say reconnect and must not say Handled. The To Do and OneDrive paths do this in the page copy (`Reconnect Outlook to allow To Do` / `OneDrive` in `src/content-outlook.js`). Calendar on Outlook cannot succeed until the founder adds the scope.
- Google scopes in the manifest are narrower than the locked Instinct list. Adding a scope is a privacy-page change and a store-text change in the same commit.
- Optional hosts (WhatsApp Web, Graph, the three Outlook hosts, localhost) are not granted at install. A surface that is off is not a bug. A checked box whose consent fails is.

**Token refresh.**

- Microsoft SPA refresh tokens last 24 hours and do not slide. `core/outlook-auth.js` renews silently from hour 16 and treats a transient failure as "try later," not "signed out." Row 41 says the 24-hour drop was fixed in code and corpus-tested. The later live Gates ran inside a session. A soak past hour 24 on this package is **UNKNOWN**.
- Google: `getAuthToken` stays primary. `launchWebAuthFlow` is the fallback when browser sign-in is off, and a user cancel must not fall through (`test/google-web-auth-corpus.cjs`). Disconnect drops an in-flight window so a late approval cannot write `googleWebAuth` back. Live exercise of the success path is **UNKNOWN** (§1). The stored web token has an `expiresAt`. Expiry is corpus-tested, not live-tested on this tip.
- Pro key recheck is every 12 hours, with a 7-day offline grace (`core/entitlements.js`). That grace is irrelevant until a key exists. A network failure keeps the old record. The server saying "not valid" ends it.

**Idempotency of writes.**

- `onDoIt` checks `hasTerminalOutcome` so a second surface does not write the same close again (`src/content-gmail.js`). The chip is replaced with "Closing…" only after that await. Two clicks on the same chip before the await returns can both pass. Tasks, events, and files have no idempotency key on the POST. A double Google Task is the failure this file's own comment says the product has never accepted.
- There is no client token that makes a retried POST the same task.

**Undo.**

- Proved task, To Do, and OneDrive Undos delete by the id that was read back, and a 404 counts as gone (`googleTasksUndo` and the matching Outlook paths). The headless suite checks To Do and Google Tasks, including Activity dropping HANDLED. OneDrive Undo is live-gated (row 49) and not in e2e.
- Calendar Undo deletes by `eventId` from the POST, or restores a stored previous start (`googleCalendarUndo`). 404 and 410 count as undone. If Handled was shown without a GET, Undo may delete a real event the receipt should not have claimed yet.
- A sent message is Undo unavailable. Nothing sends today, so this branch is untested. The copy must exist before `Mail.Send` does.
- Computer Undo is specified. The live driver is not wired, so the page does not move (`docs/computer-proof-gate.md`).

**RTL and Hebrew.**

- The chip host is `dir="ltr"`. Hebrew intent text on the Gmail chip sets `dir="auto"` (`src/content-gmail.js`). The receipt status has an English line and `טופל.` (`core/proof-of-close.js`). That is a partial treatment, not an RTL audit.
- Hebrew OneDrive save and a Hebrew To Do title passed the 0.9.37 live Gate (row 49). The long Outlook parser history (localized aria-label, date row taken as the sender, RTL marks) is row 41. Those fixes are in the tree. A fresh Hebrew UI pass on 0.9.40 has not been the live Gate.
- Machine Hebrew missed-close on v2+veto is 47.1% (227/482). Not owner-checked. Do not tune recall to move it.

**Extension update and migration.**

- `onInstalled` restores optional surfaces and opens the popup on a fresh install (`src/background.js`). Registered content scripts are replaced when the file list changes, then injected into open tabs. An update can leave a tab on the old script until that injection runs. **UNKNOWN** whether a proved banner survives an update in a live profile. The remount path is by message id, not by a hash of the text, which is what made 0.9.28 and 0.9.29 drop the banner on reload.
- The only named migration in `src/storage.js` is Outlook draft state (`migrateOutlookDraftState`). There is no storage schema version for the rest of `chrome.storage.local`. A new key has to tolerate a missing old key. That is mostly true for proof fields (`externalId` falls back to `taskId`). It is not a migration suite.
- CI does not run the corpus. `.github/workflows/glance-e2e.yml` runs Playwright on pull requests to `claude/install-uiux-pro-max-skill-a4agox`, in UTC and `Asia/Jerusalem`. `.github/workflows/glance-install-zip.yml` packages the zip. The corpus files under `flow-trial-extension/test/` are local. A red corpus does not fail this CI.

**Error UX.**

- Gmail maps `not-connected`, `verify_failed`, and `proof_pending` to sentences (`reasonMessage` in `src/content-gmail.js`). `verify_failed` always says "could not read that task back," including when the write was not a task. A file miss would be described as a task.
- The fallback is "Something went wrong. Try again." It does not say whether anything was written.
- Outlook's reconnect lines name To Do and OneDrive. A calendar miss on Outlook is not in that pair.
- Design owns the sentences. They should name the object (task, file, event) and say when a write landed but was not confirmed.

---

## 5. Monetization plumbing

The rails are built on this branch. They do not gate the thing a payer would be buying, and they cannot take a card today.

**What is in the repository.**

- Checkout is off unless `PRO_PUBLIC=1` and Stripe price ids, the webhook secret, `LICENSE_SECRET`, and the Supabase service role are all set (`flow-landing/netlify/functions/create-checkout/create-checkout.js`). The price shown is read from Stripe, not hard-coded. The written price is $14 a month or $132 a year (`docs/monetization.md`). It is not on sale.
- The webhook checks the Stripe signature, then writes a licence row. The key is not stored. A hash is (`supabase/migrations/20261001000000_glance_pro_licenses.sql`, `stripe-webhook.js`). Row level security is on with no policies.
- The extension activates a pasted key by calling `verify-license` on `https://theflow-ai.com/.netlify/functions` (`src/background.js`). A key the server does not confirm is not stored.
- `glance-assist` returns 402 `pro_required` for `draft-reply`, `summarize-attachment`, `classify`, and `execute` when the licence is missing or invalid, and 503 when licensing is not configured. It fails closed (`flow-landing/netlify/functions/glance-assist/glance-assist.js`).
- On the device, Free tracks 3 open loops and the first nudge. Pro tracks more and allows firmer nudges (`core/entitlements.js`, `FREE_WATCH_CAP = 3`). The popup enforces that (`popup/popup.js`, `src/follow.js`). Judging, the Do It chip, Google writes, and Undo do not check a licence. The comment in `src/background.js` says so on purpose.
- Tests exist: `flow-landing/netlify/functions/verify-license/license.test.cjs` and `flow-trial-extension/test/pro-corpus.cjs`. They are not the e2e workflow.
- The deeper-read counter migration says **NOT APPLIED**. The Supabase project is paused, and restoring it is the founder's action (`supabase/migrations/20261004000000_glance_ai_usage.sql`). Until that function exists, the server answers unavailable and the extension stays on the device. Whether the `licenses` table was applied before the pause is **UNKNOWN** from this checkout. The migration file does not say "not applied." `docs/open-tasks.md` row 33 says the project is paused.

**What a payment would deliver the same day.**

Nothing that matches the product. The three proved closes are Free. Pro, as coded, sells a higher Waiting-on cap, firmer nudge drafts, Draft-It, and attachment summaries. Draft-It is a proposal from a paid model. It is not a proved close. The deeper read is off until `GLANCE_AI_LADDER` is set, which is blocked on a precision eval the founder has not run (row 34).

Taking a card also needs all of the following, and each one is missing or held:

1. `overall: green` on the paid bar (row 61). It is red.
2. `PRO_PUBLIC=1` on production. Not set. Row 11 says do not set it yet.
3. A Stripe account, live or test price ids, and the webhook secret. Owner action. Not verifiable from git. Treated as not done.
4. Supabase restored, and the licence table present. Paused. UNKNOWN whether the table is already there.
5. A Netlify deploy of the functions that `theflow-ai.com` would call. The founder has not written «מאשר». The standup note says the live site copy is stale. **UNKNOWN** whether the Pro functions on the live site match this branch. The extension calls the production host, not this branch.
6. A real purchase, then a real mailbox check of Draft-It (row 11, the 12-step script in `docs/open-loops.md` §6). Not run.

Paddle is not in the repository. Do not open an account. Do not put a price on the Chrome Web Store listing. A free listing for the five dogfood people can proceed (row 7) and stays free.

Same-day value, when the bar is eventually green, is: the person pays, the webhook writes the hash, the welcome mail contains the key, the extension's verify call stores `proLicense`, and the cap lifts. That path is coded and unproven against live Stripe. It still would not be why they paid. Paid readiness is `docs/glance-ai/paid-readiness-bar.md` (owned by the CoS). The reliability track in §2 is not the product scope, and those closes are not behind the licence. Charging for Draft-It while closes are thin sells the thing the identity says Glance is not.

Do not move the proved closes behind a paywall to create a reason. Free stays useful. The paywall stays on the cap and the paid model calls until a dogfood week shows the closes are the habit. Then the founder decides what Pro adds. That decision is already open in `docs/open-tasks.md` ("Glance Pro redefined…"). This note does not close it.

---

## 6. Ordered build queue for the next two weeks

This queue is the reliability track in §2. It runs alongside breadth. It does not gate breadth, and it is not the product scope. Inside the track, the next stream starts when the current Gate has passed live, on the build a person would install. Headless green is necessary and not sufficient. If stream 1 slips, streams 2–4 of this track do not start. A breadth PR still proceeds: a live scenario Gate, then a squash-merge, and it does not touch a file an open Dima PR is changing.

Another developer already has 0.9.41 in flight on this branch. This checkout does not contain the steps list. The in-flight tree was not reviewed here. **UNKNOWN** how far that work is.

### Stream 1 — Finish the steps list, and make suggest-save tell the truth

**Gate.** Scenario A in `docs/glance-ai/holistic-close-map.md` §4.

**Work.** The checklist with Suggested and Added, on Gmail and Outlook, suggest-save visible (row 52). Include `core/onedrive-file.js` in the Outlook page script list, or stop reading consent from a global the page does not have. Pass a real consent boolean. An eligible file with Files.ReadWrite must not log `suggest:no-consent`. Update `e2e/suggest-save.spec.js` so it stops requiring the bug. Re-run the three display bugs live (row 51). If the in-flight work has four more display bugs, they are part of this stream only when they are written down. They are not in this tip.

**Done when.** One sitting, on real Outlook: a dated promise becomes a To Do task, GET, Handled, reload remounts. The next mail has one PDF and does not ask to save it. The suggestion is visible. Accept, GET, Handled. A third mail gets a reply draft on the list as Added and does not say Handled. Undo the task. Undo the file. Activity drops both HANDLED lines. The draft Undo deletes the draft. Nothing is sent. A mail with the OneDrive box off says reconnect, not `suggest:no-consent` for an eligible file. Hebrew and English each once.

**Owner.** Dima. Design if a new sentence is required on the suggestion card.

**Size.** M. The writer is already in `attachmentSaveWrite`.

### Stream 2 — Prove the meeting on Google Calendar

**Gate.** The Gmail half of scenario D. Not the WhatsApp cross-check. Not guests.

**Work.** `googleCalendarWrite` GETs the event by id and returns a proof with `fetchedBack: true`, or `verify_failed` / `proof_pending`. Add the calendar kind to `isProofTaskKind` so `ok: true` without a proof is not Handled. Undo deletes that event. "Find a time" and two clocks stay silent. Outlook without `Calendars.ReadWrite` says reconnect and does not say Handled. No attendees.

**Done when.** Live Gmail: "Can we meet Thursday at 16:00?" Do It, GET returns that id, Handled, reload remounts, Undo deletes the event, Activity drops HANDLED. A "find a time" mail shows nothing. A double click creates one event.

**Owner.** Dima.

**Size.** M. Scope `calendar.events` is already granted. No Entra change. No identity-wording change.

### Stream 3 — Make those loops fail loudly and once

**Gate.** Scenario A again, plus the Gmail half of D, after the fixes.

**Work.** One click in flight per message, before any POST. A `verify_failed` after a successful POST keeps the `ref` and offers Undo of the orphan, and does not say Handled. `verify_failed` names task, file, or event. Hebrew chip and receipt read in order on an Outlook Hebrew UI. Install the unpacked zip over a profile that already has a Handled task and confirm the banner remounts. No new loop type.

**Done when.** Double-click Do It on E1 creates one task. A forced GET miss leaves one task and an Undo that deletes it, and the receipt does not say Handled. Scenario A and the Gmail meeting Gate pass again on that build.

**Owner.** Dima. Design for the three failure sentences.

**Size.** M.

### Stream 4 — Owner-check the reliability track, and start the note only if A passed

**Gate.** None of A–E. This fills `wrong_do_it` and `silence_on_real_loops`, which stay null until the founder marks them.

**Work.** AI Engineer assembles at least 100 real asks the person received, plus the shown cards from dogfood, for the reliability track (E1, E2, E4, E6, and C1). That sample is not the product scope. Founder marks them. `labeledBy` is `sali`. Batch-001 (19 synthetic cases) can be the warm-up. It is not the 100. Do not promote a model. Do not rent a GPU. Do not change a precision gate.

The 14-day note (paid bar §2) starts only after stream 1's live Gate. It is not a build. If stream 1 has not passed, the note does not start.

**Done when.** The yaml `current` for those two rates is a number with n, or it stays null and the page says why. No weight file changes.

**Owner.** AI Engineer prepares. Founder marks.

**Size.** M of founder attention. S of code if the existing `apply-owner-answers.cjs` path is enough.

### Holds

**Alongside this track, not after it.** Breadth slices 1–3 run in parallel with this queue. Each of those PRs gets a live scenario Gate and is then squash-merged. No stream touches a file an open Dima PR is changing at the same time. `Mail.Send` stays a preview and one click (row 53), with the locked identity wording changed in the same commit. F1 and Y1 close on the sent message (scenario B). Scenario D's reply half, M2 / scenario C, and the computer driver (row 48, one allowlisted page, before any local PDF or government site) are breadth, not a gate this track holds.

Teams, Slack, LinkedIn, Sheets rows, Slides, Doc comments, RSVP, and inviting guests are breadth, sequenced by the close map. The full Microsoft ecosystem covers create and edit for docs, tables and spreadsheets, calendar, mail, and Teams. Google gets the same treatment. Monday.com, HubSpot, and Salesforce are org tools: later, breadth.

**Holds.**

- Morning / Green Invoice, and a Netlify production deploy, until the owner writes «מאשר».
- `PRO_PUBLIC`, Stripe live keys, a paid store listing, and Paddle, until `docs/glance-ai/paid-readiness-bar.md` is green.
- GPU rental, v2.1 promotion, a new external model call, and community learning. Owned by the AI Engineer.

E3 stays a draft until `Mail.Send` is the preview. Shipping the draft as if it were the close sells Superhuman's product.

---

## 7. Founder-only actions

No engineer can do these. None of them authorize a deploy or a charge by themselves.

1. **Entra app** `22682454-808b-41e5-80fe-6abadc1d5595`. Add delegated `Calendars.ReadWrite`, `Contacts.Read`, and `Chat.Read` if those Connect boxes should succeed. Confirm in the portal that `Tasks.ReadWrite` and `Files.ReadWrite` are listed. The live To Do and OneDrive Gates passed, so those two were granted on the account that ran them. Row 44 still lists `Files.ReadWrite` as missing. That line looks stale. The portal was not read from this repository. Do not add `Mail.Send` until stream 1 has passed and row 53 is the active stream. Do not add `Calendars.ReadWrite.Shared`.
2. **Sign in again** on the one Connect screen after any new delegated permission, with that box checked. A token from before the grant will not grow the scope by itself.
3. **Live-test the Google fallback.** Turn browser sign-in off (or use the Brave/Edge case the 0.9.39 note names). Connect must open the backup window, land a token, and complete one Google Task with a GET. Cancel must not open that window. Row 50's package PASS is not this test until someone writes down that the backup window was used.
4. **Answer batch-001.** Nineteen synthetic cases in `glance-ai/labeling/`. Items 8 and 17 are open. Item 17's note says the close is a save to OneDrive, not a task and not silence. Marks count only when `labeledBy` is `sali`. Command: `node glance-ai/labeling/apply-owner-answers.cjs --answers path/to/answers.json`. This does not replace the shipped weights.
5. **Do not write «מאשר»** for a Netlify deploy or for Morning in this fortnight. The paid bar does not release that hold.
6. **Do not set `PRO_PUBLIC=1`.** Do not create live Stripe charges. A test-mode Stripe account can be prepared and left dark. Restoring the paused Supabase project is the same class of action: needed before any key check against production, not needed to finish streams 1–3.
7. **Time setup** once Calendar's box either works or is hidden. Five people who did not build Glance. One consent per ecosystem. Stopwatch to the first proved close. Under 10 minutes is the bar. Write the minutes down. No message text.
8. **Dogfood** starts after scenario A passes. Four other people, the free build, no comp licence used as a price trial. The note columns are in the paid bar §2.
9. **Free Chrome Web Store listing** (row 7) is the install path those five people should use. It stays free. The page does not say Pro is for sale. The developer-account login is the founder's.
10. **ClickUp dates** in row 59 are overdue, including the Netlify batch that is still on hold. Close or re-date them. Do not treat a re-date as «מאשר».

---

## What this file does not do

It does not flip `charge`. It does not edit the paid-bar yaml. It does not move rows 51–54. It does not turn on a model, a send scope, or Morning. It does not describe Flow.
