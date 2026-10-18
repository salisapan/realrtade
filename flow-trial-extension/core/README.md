# core/ — the portable brain

This directory holds the parts of Glance that are actually the product's
intelligence, as opposed to the parts that make it specifically a Chrome
extension talking to Gmail. The split exists for one reason: Glance (personal,
Zero-Prompt, a Chrome extension) and Flow (a future enterprise runtime with
its own governance, security, and deployment model) are two different
products that must be able to share one brain without one of them being
rewritten to get there.

## The rule

**Nothing in `core/` may reference `chrome.*`, `document`, `window`, or any
other global that only exists inside a browser extension or a web page.**

Every file here is loaded two ways today, and must keep working both ways:

1. As a plain `<script>` in a Chrome MV3 content script or the popup, sharing
   one global scope with the other core files and with `src/`.
2. Via `require()`/`vm.runInContext()` under plain Node, with no browser
   globals at all — every `test/*.cjs` file in this repo does exactly this,
   and it's the reason `core/` was already almost entirely decoupled before
   this directory existed: nothing in here has ever been able to assume a
   DOM or a `chrome` object was present.

That second constraint is not a testing convenience — it is a rehearsal for
the third way this code will eventually be loaded: inside whatever Flow's own
server-side or edge runtime turns out to be. If a module in `core/` runs
correctly under Node today, adding Flow later means writing a new *host* for
it, not touching the module.

## What lives here, and why

| Module | What it owns |
|---|---|
| `domains.js` | Per-field vocabulary and phrasing (sales, legal, finance, ops, support, hr). Data, not rules. |
| `connectors.js` | The catalog of destinations Glance can write to and how each authenticates. Data, not a rule engine. |
| `extract.js` | Pulls the amount, date, and decisive sentence out of plain text. No network, no state. |
| `judgment.js` | The scorer and the adaptive threshold — **this is where precision-vs-harm tracking actually lives**: `thresholdFrom()` takes a plain `{clicks, dismissals, ts}` triple and returns a number, with zero opinion about where that triple came from or how it's persisted. |
| `source-text.js` | The one cut for the words written this time, shared by Gmail, Outlook/Graph and a doc comment. A forward banner, a quote header and a quoted earlier comment drop out before anyone judges the text. |
| `intent.js` | Classifies extracted facts into one of five intent types. |
| `close-families.js` | One clear close across scenario families A–J, or silence. Family I routes when the asset is clear, the file is missing, and a company template is named. Up to four missing fields are a card. More than four is a chat fill of those names only. Family J is one named fact from one Sheet or one Doc. A weak score, a hedge, or two candidates stay silence. No Doc writer. |
| `client-requests.js` | **Client requests** (`docs/glance-ai/client-requests.md`): what a professional asked a client for, item by item (document types, periods, payments), kept open until each item arrives with proof; partial arrivals by month, "check", "claimed", "none"; the reminder that lists only what is missing; recurring checklists; the board. Never sends. Portable; the ledger is `src/client-requests-store.js`. |
| `close-chains.js` | One close chain for every requirement (a file, a fact, a date, an approval, an answer). Derives the requirement, reads the connected sources the host already fetched, prepares a draft when one honest find exists, and when nothing was found returns a needs-you card plus an optional holding reply that opens a promise. Closes only on real completion. Never sends, never issues a document, and a template is not a find. |
| `actions.js` | Turns a classified intent into a named PROCESS with ordered steps, applying Execution Memory's bias. `planFor` runs only after the judge has already offered. A Meeting plan needs a meeting noun, an explicit date, and a clock. An absolute date does not turn "Call Tom" or "I will call the bank" into that hold. A commitment or a task keeps that kind. `meetingPlanVeto` is the single classifier. Outlook stays quiet unless the base judge would show. |
| `execution-memory.js` | The append-only log of what an account actually does with a proposed process, and the fold that turns it into per-step accept/remove/undo/pin counts. Storage is an **injected adapter** (see below), not a hardcoded call. |
| `close-memory.js` | Personal close memory: a capped local record of Trusted Do It full writes (dated commitment, follow-up/send ask, confirmed amount, calendar hold). On a later message that clearly continues that matter, recall prefers **silence**. Same injected-adapter seam, its own key (`glancePersonalCloseMemory`), no raw subject or body. |
| `privacyShield.js` | Finds and masks every sensitive span in text before it's allowed to leave the device. |
| `docreader.js` / `docwriter.js` | Read and write real `.docx` files using only Web Platform APIs (`Blob`, `TextEncoder`/`TextDecoder`, `DecompressionStream`) — no browser-only API, which is why these already run under Node unmodified. |
| `close-quality-metrics.js` | The three personal-close counts (full-write success, day-level return, dismiss-or-undo false-Do-It) and the false-close rate against the 15% bar. Pure fold over plain events. Persistence stays in `src/storage.js`. |
| `quiet-metrics.js` | Trusted closes per local week (Do It → full write → Handled, not Undone) and silence decisions by reason code. Pure fold. No message text. The Activity tab reads it; the Morning Brief does not. Persistence stays in `src/storage.js`. |
| `proof-of-close.js` | Proof of close. Handled only when `fetchedBack` is true. Builds `{ system, externalId, url?, number?, fetchedBack: true, verifiedAt }`. A miss is `proof_pending` or `verify_failed`, not a trusted close. Google Tasks (`google/tasks`), Microsoft To Do (`microsoft/todo`), and one OneDrive file (`microsoft/onedrive`) are read back by id. One allowlisted page (`computer/<host>`, fixture `computer/example.com`) is read back by a DOM re-query (URL + success selector). A click and a screenshot hash are not that read. `computer/local/<app>` is a later gate and is not a proof here. A password or מאשר pauses as `proof_pending` for CoS. The live page driver is not wired. A rebuilt Gmail thread mounts a proved row again by legacy message id or thread id. An Outlook thread mounts a To Do or OneDrive row by item id, path id, or conversation id. A remounted To Do receipt keeps the creation snapshot on `ref.created`, including an emptied field stored as null. A stored null that later has a value is unconfirmed, not an edit. Importance is copied. A current importance of normal, or a missing importance, is not an edit. A current importance other than normal that differs from the snapshot is an edit. The reminder fields are not copied and are not compared. The open mail and Loops read one proof record keyed by message id. A refused Undo is stored on that record and on the remount copy, so a reload shows that refusal. A Graph id and the OWA address spelling are the same id after `+` `/` `=` fold to `-` `_`. The letters stay case-sensitive. An old row with no message id may match that id case-insensitively, and only as that fallback: the receipt can show, the stored ids stay on the log row so the card can stamp that key, and Undo says Couldn't confirm and deletes nothing. A missing item, HTTP 404 or 410, becomes Deleted in To Do and drops Undo. Any other read error keeps the record and says couldn't verify. Opening the mail reconciles from the reading pane. The body in that snapshot is a hash of the normalized text plus a prefix of at most 8KB. and `receiptLogFields` stores that same snapshot, so Undo compares the words that were written. No network. |
| `still-open.js` | The morning list: which personal closes clear the bar (dated promise, explicit follow-up, confirmed amount), the cap of three, the rank, and the shown / Do It / undo / false-close fold. Pure. A stored personalClose tag does not outvote the trust-finish silence bar: hedge, more than one candidate, weak / low / unsure, a quoted older ask, and newsletter noise score 0, and a fact ask stays off because the list has no cell to check. `src/storage.js` persists scan rows and the fold; the Brief and popup only render what `select` returns. |
| `google-closes.js` | When a Drive, Doc, or Sheet write is the close (place one found file, save one attachment, or create from an existing company template). Pure. More than four missing slots is a named checklist; four or fewer stay fields on the card. No template, no clear artifact, or no single Drive match means silence — never a blank Doc. |

### The rest of the modules (one line each, from each file's own header)

`test/docs-consistency-corpus.cjs` fails if a file is added to `core/` and not listed in this README, so this table cannot silently fall behind.

| Module | What it owns |
|---|---|
| `active-question.js` | One question to the person, only when the on-device engine is torn about a sentence of their own message; rationed hard (one a day, three a week). The answer is also a label for the model. |
| `ai-ladder.js` | **The deeper read** (`docs/ai-ladder.md`): the policy for the one external step: who may be asked about what (the pipeline's residual), the Free and Pro allowance in units, consent/state/popup copy, the hash cache, and the checks every answer passes on the device. Portable; the network and the counter live in `src/background.js` and `glance-assist/ladder.js`. |
| `capability.js` | The silent WebGPU / memory / disk check that runs BEFORE anything is downloaded for the hybrid path; returns a permanent or transient reason plus GPU diagnostics for the log (`[glance:hybrid:gpu]`). Dormant while `config/hybrid.public.js` is off. |
| `capture.js` | "Stay on this", from anywhere. Portable: no chrome.*, no DOM, no network. |
| `channel.js` | What a conversation partner and a message look like, whatever app they were in. |
| `classification-metrics.js` | Turns the durable local counters `storage.js` keeps into the one signal for "own code first, a model last": the share of messages decided locally, by the remote fallback, or not at all. |
| `commitment-title.js` | Task title for Google Tasks and Microsoft To Do. The verb and object come from the same sentence that fired the dated commitment or the sender promise. Openers, the date phrase, and a sender prefix stay off the title. A zero-width mark inside a word is not part of the title. No clean span keeps the chip label. Subject is not a title. No model. No network. |
| `display-copy.js` | What a person reads on a card, in Activity, and under Why not shown. Each row is titled from that row. A file card is `Save the file?`. A raw message id or a mailbox route is not a subject. A hold card's own text names the weekday and the clock (`Hold Mon 10:00`, or the Hebrew equivalent). Card chrome and the Activity tab follow one locale helper: a stored setting, then the host page language, then the browser. |
| `build-stamp.js` | One build stamp, loaded by the service worker and by the page. The panel compares the two and says Reload Glance when the running worker is still a previous registration. This is not `chrome.runtime.getManifest`. |
| `community-key.js` | The public key slot for community learning (empty = no delta can ever be applied; the safe default). Community learning is DORMANT (`docs/community-learning.md`). |
| `community.js` | Community learning, client side — portable, no chrome.*, no DOM, no network. |
| `cross-channel.js` | An answer in one app that settles a loop opened in another. |
| `dense-prior-data.js` | GENERATED: GloVe 6B 100d (PDDL 1.0), top 20,000 words, reduced to 32 dimensions, int8; the data behind `dense-prior.js`. |
| `dense-prior.js` | A pretrained dense word-vector prior for the intent model — portable, no chrome.*, no DOM, no network. |
| `entitlements.js` | Glance Pro entitlement policy — portable, no chrome.*, no DOM, no network. |
| `exec-router.js` | The dual-tier router for a "Do It" / "Draft It" proposal (device model first, masked server only with consent, strict JSON; dormant, `docs/hybrid-execution-architecture.md`) AND `maskForServer`, the one function every send to our server goes through (also used by the deeper read). |
| `expiry.js` | Things that run out — portable, no chrome.*, no DOM, no network, no model. |
| `fact-reply.js` | Reply-with-facts. One inbound ask for one concrete fact that lives in a Google Sheet or Doc. |
| `file-attach.js` | Family A (find + attach) and the handoff into Family I (create only when a company template already exists). An ask that gets someone else to act is not a clear file. |
| `file-path.js` | File-backed execution for open loops — portable, no chrome.*, no DOM, no network, no model. |
| `follow-up.js` | "Waiting on" and "what you promised": what a message asks or promises, what a reply did to a loop (including the true-close rules, `docs/true-close.md`), when to chase, the Free cap input, nudge drafts. Portable logic only. |
| `graph-mail.js` | Outlook mail as plain utterances, from Microsoft's own mail API (Microsoft Graph). The full body is the sentence. A truncated `bodyPreview` (255 characters, body empty) does not become a file or send card (`outlook:body-preview-only`). |
| `hybrid-status.js` | The lightweight state manager the extension popup reads |
| `identity-graph.js` | One person, many apps. Portable: no chrome.*, no DOM, no network, no message text. |
| `intent-model-weights.js` | GENERATED by `scripts/train-intent-model.cjs`: the int8 weights for `intent-model.js`. Never edit by hand. |
| `intent-model.js` | A small statistical intent model that runs entirely on the device — portable, no chrome.*, no DOM, no network. |
| `intent-pipeline.js` | The tiered local recognition pipeline — portable, no chrome.*, no DOM, no network. |
| `json-enforce.js` | Strict JSON for model output, shared by every tier that asks a model for a structured answer (the on-device model, the company server). |
| `lang-normalize.js` | Language normalisation for local intent recognition — portable, no chrome.*, no DOM, no network, no model. |
| `learning-ledger.js` | "What Glance learned from you": a short, plain list of every time the engine moved because of something this person did. |
| `local-lm-audit.js` | The fixed sentences an on-device language model must pass on THIS device before core/local-lm.js lets it propose anything. |
| `local-lm-server.js` | A language model the person runs ON THEIR OWN COMPUTER (Ollama, LM Studio, or anything that speaks the same two HTTP dialects), as another source for the session core/local-lm.js already knows how to use. |
| `local-lm.js` | A language model that runs on THIS device, as the third recognition tier. |
| `mask-ids.js` | Masks identifiers that core/privacyShield.js does not (national ID numbers, policy / case / account / claim numbers, IBANs, passport numbers) and composes it with the shield into the one masking pass that runs before ANY text may leave the device. |
| `meeting-debrief.js` | After a meeting: what came out of it — portable, no chrome.*, no DOM, no network, no model. |
| `model-store.js` | Fetches, verifies and keeps an on-device model's files, quietly and politely. |
| `onedrive-file.js` | One OneDrive file for a save-the-attachment close. Names, paths, the `Files.ReadWrite` check, and the bytes to upload. The service worker writes and reads the item back. A mail does not search OneDrive. No network in this file. |
| `outcome-labels.js` | Labels the product earns for free from what happens next — portable, no chrome.*, no DOM, no network. |
| `outlook-auth.js` | Sign in to Microsoft (OAuth 2.0 authorization code with PKCE) and keep the session alive: `session()` refreshes inside the 24-hour single-page-application window, renews silently (prompt=none) from hour 16, and treats a failed attempt as transient unless Microsoft says a person must sign in. |
| `incoming-judge.js` | The one decision for "someone asked you something", shared by every mail surface: Gmail's chain (own text, classify with sender and subject, silence bar, file gate) as a pure function, plus the Gmail-shaped draft payload. The show decision uses the unrewritten plan. `planFor` runs only after that decision offers, and only after `meetingPlanVeto`. Cancel wording, including "no lnoger needed" and מוטלת, goes through that veto before a plan is built. Attaching a file to an existing invite (`attachToInvitePlan`) is the file-track card on every host. The task names the file. The draft says the file is attached only when a file is on the draft; otherwise it says the file is still to attach. It is not a new Meeting. A task-only plan uses a task label. The Meeting label stays on a calendar plan. Outlook stays `no-draft-close` unless the base judge would show an explicit hold, a draft, or a task. A cancelled, negated, out-of-office, or past-tense meeting stays quiet. `prepareForJudge` strips bidi marks, zero-width characters, nbsp and CR once, before that decision. A phone-signature line drops only when the line is nothing but the signature. |
| `outlook-calendar.js` | Outlook Family B file-on-hold: one named file and one clock become one calendar event body (file link in the description, no attendees). The Calendar checkbox asks `Calendars.ReadWrite`. Mail-only sign-in does not. A short name or a `https://graph.microsoft.com/` audience URI counts as that scope. `api://` and `outlook.office.com` do not. A comma- or space-separated scope string and the access token's scp claim are read the same way. unknown is missing, not a grant. No network. |
| `outlook-config.js` | The application (client) ID of the registered "Glance Outlook" Microsoft Entra app. Public; a placeholder until the owner registers it (open-tasks). |
| `lane-ms-host.js` | Service-worker entry for the Microsoft Graph lane. The one background import. It registers its own listener for this lane's message types and loads the contacts, Word, Excel, Teams, and send modules. A module service worker cannot call `import()`, so the loads are static. It does not replace `getManifest`, content-script registration, or the default listener. |
| `outlook-contacts.js` | Read-only recipient resolve by name through `/me/contacts` and `/me/people`. `Contacts.Read` from `outlook-config.js`. An unclear or split match stays quiet. No network in the portable helpers. |
| `outlook-word.js` | One `.docx` on the person's OneDrive. A new file is Handled when its item id is read back. An existing file is Handled only when the inserted text is in the file content. After that write, Glance does not write again and holds no lock. Undo deletes a file this write created, or restores the previous version, only when both eTag and lastModifiedDateTime are present and unchanged. A missing or changed stamp is `file-changed`. `Files.ReadWrite`. Never sends. No network in this file. |
| `outlook-excel.js` | Append one row or create one table through the Graph workbook API. An append is Handled only when the row at the index returned by the append has those same cells. Undo of an append deletes that row only after a read-back still matches its cells, and never the workbook. Undo of a table created inside the person's own workbook reads the table range and compares rows and address to the creation snapshot. An added or changed row, a failed read, a timeout, or a missing snapshot leaves the table alone. Undo deletes a workbook this write created only when both eTag and lastModifiedDateTime are present and unchanged. A missing or changed stamp is `file-changed`. `Files.ReadWrite`. Never sends. No network in this file. |
| `teams-chat.js` | Read the chats the person is in (`Chat.Read`) and show a draft reply in the panel. Never posts. A draft is not a close. No network in this file. |
| `outlook-send.js` | Preview To, Cc, subject, and body. Sends only on an explicit click when `MAIL_SEND_ENABLED` is true (default false). Otherwise `FORBIDDEN_SEND` and no request. A send is Handled only after Sent Items is read back. The send is an event-log row. Never auto-sends. |
| `outlook-sync.js` | What to do with the last couple of weeks of an Outlook mailbox. |
| `outlook-state-migrate.js` | One-shot upgrade: merge leftover HANDLED+UNDONE Outlook draft rows and scrub false-close counts for prepared-draft undos. |
| `draft-reply.js` | Shared reply-draft body for Gmail and Outlook (never sent): rich ack of concrete asks (facts when known; placeholders only when needed), same shape on both surfaces. |
| `owa-parse.js` | Outlook on the web reading-pane helpers (URL item id, subject/sender/body, match to sync entries). Selectors are best-effort against OWA markup. |
| `outside-signals.js` | Loops that close without the other person replying |
| `person-model.js` | A model of HOW LONG each person takes — portable, no chrome.*, no DOM, no network, no model service. |
| `pmf-metrics.js` | Turns the durable local counters storage.js already keeps (shownStats, writeStats, undoneStats, activeDays, closeStats) into the three product- market-fit signals this product actually needs to know whether it's working |
| `recognition-stats.js` | How much of the recognising was done by our own code — portable, no chrome.*, no DOM, no network. |
| `recurrence.js` | Things that come around again — portable, no chrome.*, no DOM, no network, no model. |
| `reply-meaning.js` | What a reply MEANS for the loop it landed on — portable, no chrome.*, no DOM, no network, no model. |
| `reply-model-weights.js` | GENERATED by `scripts/train-reply-model.cjs`: the weights for `reply-model.js`. Never edit by hand. |
| `reply-model.js` | Does a reply truly FINISH what was asked? A small on-device classifier. |
| `request-types.js` | Request and promise recognition — portable, no chrome.*, no DOM, no network, and no model. |
| `resolution.js` | Resolution paths: finishing an intention that takes more than one step (define "done", find what exists, verify the precondition, prepare or ask, close ONLY on a real delivery). Receipts and transfer proofs, and the documents the person sends (contract, quote, proposal, signed copy). `docs/resolution-paths.md`, `docs/true-close.md`. Never sends, issues or signs. |
| `story.js` | One story, many messages — portable, no chrome.*, no DOM, no network. |
| `step-list.js` | The checklist on a card: Queued, Preparing, Verifying, Verified, Couldn't confirm · Retry. Added and Manual steps. Handled still requires ProofOfClose `fetchedBack`. `mailSendPreview` is data for a later stream and does not send. |
| `suggest-save.js` | Which attached files could be saved, and the `attachmentSave` step the steps list draws. Rules and reason codes: suggest-save spec §1–§9. 0.9.41 draws one card titled `Save the file?` when the page has no other card and the worker says Files.ReadWrite is granted. The reason code stays `suggest:eligible-hidden`. 0.9.42 keeps an excluded file's name and size, and the row reads `name · skipped · why`. Mail.Send is not this step. |
| `understanding.js` | **The Understanding contract** (M1 of `docs/glance-ai/ai-product.md`): the device-side validator for a model's answer about one masked text. Every claim must quote words that are really in the text, or it is dropped with a reason. The device reads the due date from the quoted words itself (`core/extract.js`, then a bare weekday such as «עד שלישי»), so a model's misread date is corrected. `proposal()` gives at most one step or silence, and never closes, writes or sends. `instructions()` is the one prompt every tier asks with: the model quotes words, and the device reads every value. `placesOnly` (on the server) grounds every quote without reading values, because only the device can restore its placeholders. Off switch `aiUnderstandingV1` (default off). Corpus: `test/understanding-corpus.cjs`. |
| `understanding-router.js` | **Router v2** (M2): who reads a mail, in order. Tier 0, the device rules, settles quiets and clear cases with no model call. Tier 1 is the device model, when present. Tier 2 is Glance cloud, called only with consent and only on text masked by `exec-router.js` `maskForServer`; a surviving phone or email blocks the call. Every model answer passes `understanding.js` and then the host's strict gate and veto, which are injected; a missing gate counts as silence. Off switch `aiPrimary` (default off); nothing calls it yet. Corpus: `test/understanding-router-corpus.cjs`. |
| `model-plan.js` | **The Plan** (M5): a grounded model proposal becomes the product's own closing process: `actions.js` `planFor()` builds it and `step-list.js` `rowsFor()` draws it, so a model cannot invent a step. The plan gate allows only calendar, draft and task writes (never a send or a page action), requires the anchor to match the proposal, and accepts only dates the device read. Each plan carries `doneWhen` (what really closes it: a sent reply, an event read back, the promised item arriving) and `carry` (when Glance looks again). Every step needs the person's click. Off switch `aiPlanV1` (default off). Corpus: `test/model-plan-corpus.cjs`. |
| `style-profile.js` | How YOU write, as counts. Portable: no chrome.*, no DOM, no network, no model. |
| `google-calendar.js` | Google lane Hold It: one clock becomes one calendar event. A named file is included when the hold has one. The start is an absolute instant in the person's time zone (passed in, otherwise Intl; never a silent UTC default). No attendees, no invites. Handled waits for a read-back of that event. Undo deletes it. `calendar.events` only. |
| `google-compose.js` | Fills To, subject, and body for a Gmail compose the person sends. Glance never presses Send. The result is a preview (`closes: false`) and is not a trusted close. Undo restores the previous fields only while Send has not been pressed. |
| `google-config.js` | Full-flavor Google client id, extension id, and the allowlist: openid, email, profile, drive.file, calendar.events, tasks, contacts.readonly. A gmail scope, a wide Drive scope, and a documents or spreadsheets scope are refused here. |
| `google-contacts.js` | Exact-email contact lookup with contacts.readonly. Read only: no create, edit, or delete. |
| `google-docs.js` | Create or edit one Doc on a file Glance created or the person picked, through drive.file. Handled waits for the inserted text to be read back. Undo trashes a created file or deletes the inserted range. |
| `google-drive.js` | Save one attachment to Drive with drive.file. Handled waits for a read-back of that file. Undo trashes it. A mail does not search Drive. |
| `google-proof.js` | Handled for the Google lane: lane writes count only with ProofOfClose fetchedBack. A compose preview is not a trusted close. Other kinds delegate to `proof-of-close.js`. |
| `google-sheets.js` | Append one row to a spreadsheet Glance created or the person picked, through drive.file. Handled waits for that range to be read back. Undo clears the range, or trashes the file when this lane created it. |
| `google-tasks.js` | One Google Task for the lane (`googleLaneTask`). Handled waits for a read-back of that task. Undo deletes it. |

Notably absent: **storage.js stays in `src/`.** It is Glance's own choice of
*how* to remember things (`chrome.storage.local`, capped logs, weekly/badge
counters derived from them) — a client concern. A future Flow deployment
would persist its equivalent state completely differently (per-tenant
database rows, most likely), and it should be able to do that without
`core/` changing at all. `judgment.js`'s `thresholdFrom(calibration)` already
proves this works: the function is pure, and `storage.js`'s `calibrate()` is
just today's chosen way to keep the input it needs fed. Follow that pattern
for anything new.

## The adapter pattern (how a core module gets persistence)

`execution-memory.js` is the one module here that needs to remember
something across calls, so it's the reference example for how a `core/`
module gets durable storage without knowing what host it's running on:

```js
// Inside the module: a tiny interface, and a safe, non-durable default.
let adapter = inMemoryAdapter(); // never throws, never touches a host global

function setStorageAdapter(next) { adapter = next; }
// ...business logic calls adapter.get(key) / adapter.set(key, value) only.

return { /* ...business functions... */, setStorageAdapter };
```

The host wires in whatever persistence it actually has, from the *client*
side:

```js
// src/chrome-storage-adapter.js — pure client glue, zero business logic.
FlowExecutionMemory.setStorageAdapter({
  async get(key) { return (await chrome.storage.local.get(key))[key]; },
  async set(key, value) { await chrome.storage.local.set({ [key]: value }); }
});
```

A future Flow runtime writes its own version of that second file — a
database-backed adapter, say — and never touches `execution-memory.js`. If a
new `core/` module ever needs to persist something, give it this same shape
rather than reaching for `chrome.storage.local` directly.

## Deciding where new code belongs

Ask this before writing anything:

- **Would Flow's future enterprise runtime need this exact logic, unchanged,
  regardless of what UI or channel it's running behind?** → `core/`. Intention
  classification, process planning, Execution Memory, precision/harm
  calibration, and anything that transforms extracted facts into a decision
  belongs here.
- **Is this about *how Glance specifically* shows something, stores
  something, or talks to Gmail/Chrome?** → `src/` (or `popup/`). The chip, the
  Morning Brief, the Weekly Closing Summary banner, the extension-icon badge,
  Gmail DOM scraping, `chrome.storage.local` itself, and every connector's
  actual `fetch()` call all belong there.
- **Genuinely unsure?** Write it as if it belongs in `core/` (no host
  globals, plain functions, injected dependencies for anything external) —
  that version can always be *used* client-side, while the reverse (pulling
  browser coupling back out of something already shipped) is the rewrite this
  split exists to avoid.

## Adding a new inbox host (e.g. Outlook) — a different axis from the split above

Everything above is about **Glance vs. Flow** — one brain, two future
products. This section is about a narrower, nearer-term question: Glance
itself is a Chrome extension that today only watches Gmail. Nothing here
implements Outlook (or anything else) — this is only the audit that
confirms doing so later won't force a rewrite, per the standing
architectural-readiness requirement this section exists to satisfy.

**The short version: almost nothing needs to change.** `core/` already has
zero host coupling by construction (see "The rule" above — that was never
Gmail-specific to begin with, it was written that way from the start). The
real question was whether `src/` quietly baked Gmail assumptions into
things that *should* have been generic. It mostly didn't:

- **`src/brief.js` and `src/weekly.js` are already 100% host-agnostic.**
  Pure DOM (`document.createElement`, no Gmail selectors, no `chrome.*`),
  driven entirely by plain data (`{title, subtitle, onDoIt, onDismiss}` row
  shapes) that `content-gmail.js` hands them. A future `content-outlook.js`
  reuses both files verbatim — literally the same two `<script>` tags — for
  the Morning Brief, the Weekly Closing Summary, and Contextual Resurfacing.
- **`chip.css`'s classes are already generic** (`flow-chip-*`, not
  `gmail-chip-*`), so the chip's visual language is reusable as-is.
- **The step-kind vocabulary (`calendar`/`draft`/`task`) is already
  platform-neutral.** "Draft a reply" is a real concept in Outlook too — the
  catalog in `actions.js` never needed Gmail-specific language.
- **`background.js`'s connector writers are Google-Workspace-specific, not
  Gmail-specific** — worth stating explicitly because it's easy to conflate
  the two. Calendar/Gmail-draft/Tasks are WRITE destinations, chosen by
  what the user connected, completely independent of which inbox
  SURFACED the intention. An Outlook-sourced "Do It" click can, and today
  would, still write to Google Calendar — the host being added is the
  *source* of detected intentions, not necessarily the destination.
- **Every durable id (`messageId`, `intentionId`, `processId`) is an opaque
  string.** No core logic parses a Gmail-specific id format, so a
  different host's own id shape (Outlook's `internetMessageId`, say) needs
  no translation layer.

What genuinely is Gmail-specific, by design, is `content-gmail.js` itself —
it exists to scrape Gmail's DOM (`role="main"` reading pane,
`div[role="listitem"]` messages, the `email` attribute, `h2.hP`) into the
plain `{text, sender, subject, messageId, threadUrl, attachments}` shape
the rest of the system actually runs on. A new host means writing that
file's equivalent, not touching anything it calls into.

### The host-adapter contract

A `content-<host>.js` must, at minimum:

1. Extract plain data from the host's DOM/API: message body text, sender
   name/email, subject, a stable per-message id, a thread URL, and any
   real attachments. None of this may leak into `core/` as anything other
   than plain strings/objects.
2. Call `FlowIntent.classify(text, { senderEmail, senderName, calibration,
   calibrationByType, now })` and `FlowActions.planFor(intent, {
   threadUrl, hasThreadAttachment, executionMemory })` exactly as
   `content-gmail.js` does — these two calls are the entire "detect and
   plan" contract, and neither function has ever heard of Gmail.
3. Render the chip using the same `chip.css` classes and the same
   shell/ring/shine DOM structure `content-gmail.js`'s `injectChip`/`el()`
   helpers build, so it inherits every existing visual and accessibility
   property for free.
4. Wire Do It / Dismiss / Undo to the exact same `FlowStorage.appendLog`,
   `FlowStorage.calibrate`, and `FlowExecutionMemory.record*` calls
   `content-gmail.js` makes — **tagging every `appendLog` call with its own
   `SOURCE_APP` constant** (`content-gmail.js`'s own top-of-file constant
   is the reference example; Outlook's would be `'outlook'`). This is the
   one convention that must be followed exactly, since it's what lets the
   Activity log, and any future per-host precision comparison, attribute
   every outcome to the surface that produced it.
5. Reuse `FlowBrief`/`FlowWeekly` verbatim for the sticky surfaces.
   `FlowStorage.getStillOpen()` is the morning list (capped, high-stakes).
   `getPending()` / `hasTerminalOutcome()` remain the unresolved-shown set
   the in-thread chip and contextual resurfacing use. Both are
   source-agnostic.
6. Call `FlowStorage.consumeDailyActiveTrigger()` /
   `consumeWeeklyHabitTrigger()` the same way `content-gmail.js`'s `init()`
   does, so retention and habit-formation measurement (see
   `core/pmf-metrics.js`) reflect activity in the new host too, not just
   Gmail.

Nothing above requires a single line of `core/` to change. If a future
host genuinely can't be served this way — if it needs a core function to
behave differently depending on which host called it — that's the signal
an assumption snuck into `core/` that shouldn't be there, and the fix is to
generalize that function's inputs, not to special-case the host inside it.

### What's still a known, accepted gap (not fixed here)

`intent.js`'s `classify()` hardcodes `domain = FLOW_DOMAINS[0]` regardless
of the account's own `domainId` — a pre-existing gap in wiring the domain
picker through to classification, not something a second host introduces
or worsens. Left alone here since it's an orthogonal feature gap, not an
architectural coupling risk, and fixing it means touching the same
precision-critical scoring path this whole file exists to keep stable.

## What this does *not* do

This is a code-organization boundary, not a running second product. There is
no server, no multi-tenant anything, no governance layer, no edge runtime
here yet — building those is explicitly future work. The only claim this
directory makes is: when that work starts, the modules above are already in
the right shape to be reused, not rewritten.
