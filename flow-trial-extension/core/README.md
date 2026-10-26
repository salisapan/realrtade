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
| `docusign-close.js` | READ-ONLY: the close is "the one envelope the person linked is completed", read back from DocuSign. Completed closes with a proof; sent, delivered and signed wait; declined and voided never close; one envelope per loop; a cached completed is never trusted without the read; the person's release is the Undo and changes nothing in DocuSign. Never creates, sends or changes an envelope. The network, token store and ledger are injected; the API host and ids are shape-checked. Portable: no chrome.*, no DOM. |
| `dropbox-close.js` | One file saved into the person's Dropbox app folder as the close, proven by an independent metadata read that must match the file id, size and content hash Glance computed itself. Add mode, never overwrites or renames; a taken name with different content is reported, not written; Undo refuses a file the person edited. The network, token store, ledger and SHA-256 are injected. Portable: no chrome.*, no DOM. |
| `domains.js` | Per-field vocabulary and phrasing (sales, legal, finance, ops, support, hr). Data, not rules. |
| `connector-outcome.js` | The learning hook every connector emits: one event per decision with ids and enums only (never a title, address or text), and the pure conclusions drawn from them (which destination to offer first, how readily to offer a close type, a vendor whose read-back keeps failing). Portable: no chrome.*, no DOM, no network. |
| `consent-catalog.js` | The data behind the one sweeping consent screen: one entry per service with its honest line, group, state (built, experimental, coming) and permission steps; `stepsFor(ids)` returns exactly the steps for what was ticked, and Select all never includes a `coming` service. Portable: no chrome.*, no DOM, no network, no UI. |
| `connectors.js` | The catalog of destinations Glance can write to and how each authenticates. Data, not a rule engine. |
| `extract.js` | Pulls the amount, date, and decisive sentence out of plain text. No network, no state. |
| `judgment.js` | The scorer and the adaptive threshold — **this is where precision-vs-harm tracking actually lives**: `thresholdFrom()` takes a plain `{clicks, dismissals, ts}` triple and returns a number, with zero opinion about where that triple came from or how it's persisted. |
| `source-text.js` | The one cut for the words written this time, shared by Gmail, Outlook/Graph and a doc comment. A forward banner, a quote header and a quoted earlier comment drop out before anyone judges the text. |
| `intent.js` | Classifies extracted facts into one of five intent types. |
| `close-families.js` | One clear close across scenario families A–J, or silence. Family I routes when the asset is clear, the file is missing, and a company template is named. Up to four missing fields are a card. More than four is a chat fill of those names only. Family J is one named fact from one Sheet or one Doc. A weak score, a hedge, or two candidates stay silence. No Doc writer. |
| `client-requests.js` | **Client requests** (`docs/glance-ai/client-requests.md`): what a professional asked a client for, item by item (document types, periods, payments), kept open until each item arrives with proof; partial arrivals by month, "check", "claimed", "none"; the reminder that lists only what is missing; recurring checklists; the board. Never sends. Portable; the ledger is `src/client-requests-store.js`. |
| `close-chains.js` | One close chain for every requirement (a file, a fact, a date, an approval, an answer). Derives the requirement, reads the connected sources the host already fetched, prepares a draft when one honest find exists, and when nothing was found returns a needs-you card plus an optional holding reply that opens a promise. Closes only on real completion. Never sends, never issues a document, and a template is not a find. |
| `asana-close.js` | One task in the person's chosen Asana project as the close, read back as the proof: write, GET back, Handled only when it matches, one task per loop, Undo deletes and requires a 404 on the read-back. The network, token store and ledger are injected. Portable: no chrome.*, no DOM. |
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
| `jira-close.js` | One issue in the person's chosen Jira Cloud project as the close, read back as the proof: write, GET back, Handled only when it matches, one issue per loop, Undo deletes and requires a 404 on the read-back (and says so when the role may not delete). The network, token store and ledger are injected; stored ids are shape-checked before they enter a URL or JQL. Portable: no chrome.*, no DOM. |
| `json-enforce.js` | Strict JSON for model output, shared by every tier that asks a model for a structured answer (the on-device model, the company server). |
| `lang-normalize.js` | Language normalisation for local intent recognition — portable, no chrome.*, no DOM, no network, no model. |
| `learning-ledger.js` | "What Glance learned from you": a short, plain list of every time the engine moved because of something this person did. |
| `linear-close.js` | One issue in the person's chosen Linear team as the close, read back as the proof: the issue id is chosen on the device and stored before the create, so a retry never makes a second; Handled only when the read-back matches; Undo deletes and requires the issue to be gone or trashed. GraphQL with every value as a variable. The network, token store, ledger and id generator are injected. Portable: no chrome.*, no DOM. |
| `local-lm-audit.js` | The fixed sentences an on-device language model must pass on THIS device before core/local-lm.js lets it propose anything. |
| `local-lm-server.js` | A language model the person runs ON THEIR OWN COMPUTER (Ollama, LM Studio, or anything that speaks the same two HTTP dialects), as another source for the session core/local-lm.js already knows how to use. |
| `local-lm.js` | A language model that runs on THIS device, as the third recognition tier. |
| `local-file.js` | A file asked for that is on the person's own computer, not in the cloud (close map U2). One clear file ask, the cloud search empty, exactly one match in a folder the person granted once: read the bytes, save a copy to their OneDrive (never overwriting), read the item back by id (size and hash) for `microsoft/onedrive` ProofOfClose, Undo deletes that item. The ask still closes only on a sent message. Switch `LOCAL_FILE_CLOSE`, off. The folder, Graph and hashing are injected; no src/ file calls it yet. |
| `mask-ids.js` | Masks identifiers that core/privacyShield.js does not (national ID numbers, policy / case / account / claim numbers, IBANs, passport numbers) and composes it with the shield into the one masking pass that runs before ANY text may leave the device. |
| `meeting-debrief.js` | After a meeting: what came out of it — portable, no chrome.*, no DOM, no network, no model. |
| `model-store.js` | Fetches, verifies and keeps an on-device model's files, quietly and politely. |
| `notion-close.js` | One row in the person's chosen Notion database as the close, read back as the proof: write, GET back, Handled only when it matches, one page per loop, Undo archives and reads the archive back. The network, token store and ledger are injected. Portable: no chrome.*, no DOM. |
| `onedrive-file.js` | One OneDrive file for a save-the-attachment close, written into the `Glance` folder (`OneDrive > Glance > <file name>`, the line the Save card shows). Names, paths, the `Files.ReadWrite` check, and the bytes to upload. The service worker writes and reads the item back. A mail does not search OneDrive. No network in this file. |
| `onedrive-find.js` | The file they asked for, found on the person's own OneDrive (close map F2). Outlook only. One clear file ask, the thread without it, exactly one of the person's own files from a Graph search (no folders, deleted items or shares, under 3 MB): attach it to the reply draft, read the OneDrive item and the draft attachment back by id for `microsoft/onedrive` ProofOfClose. Undo removes the attachment, never the file. The ask still closes only on a sent message. Switch `ONEDRIVE_FIND`, off. Graph is injected; no src/ file calls it yet. |
| `outcome-labels.js` | Labels the product earns for free from what happens next — portable, no chrome.*, no DOM, no network. |
| `outlook-auth.js` | Sign in to Microsoft (OAuth 2.0 authorization code with PKCE) and keep the session alive: `session()` refreshes inside the 24-hour single-page-application window, renews silently (prompt=none) from hour 16, and treats a failed attempt as transient unless Microsoft says a person must sign in. |
| `system-notice.js` | A known service's notice with a consequence, a deadline and a preventing action ("your project will be paused on Oct 28 unless you update billing", "your domain expires, renew it"), in English and Hebrew. Known service domains only (or ones the caller passes), never a lookalike; a newsletter, promotion, webinar or `news@`/`newsletter@` sender stays quiet; a missing deadline, action or consequence stays quiet. The judge turns a hit into a Log It task with the date (Google Tasks, or Microsoft To Do on Outlook), only when the host passes `systemNoticeOn` (`glanceSwitches.SYSTEM_NOTICE`, off). It never pays, renews or signs in. |
| `meeting-confirm.js` | A meeting just agreed in a short chat message becomes one day and one clock to hold: «מעולה, נתראה ביום חמישי ב-15:00», «סגור, מחר ב-10:00», "Sounds good, see you Thursday at 3pm". Needs an agreement cue, one named day (today or later, at most 60 days ahead), one named clock; a question, a cancel, a move, "can't", "maybe", a look back or a clock already past stays quiet. Returns the day and clock only; the chat card offers the hold, the person approves. Loaded only by the chat lanes (`laneChatScripts`), no manifest change. Test: `test/meeting-confirm-corpus.cjs`. |
| `day-words.js` | Day words the date reader does not take, rewritten into forms it does, before a chat or mail reader looks for its one day: Hebrew weekday abbreviations («יום ה׳» to «יום חמישי»), the Hebrew hyphen in «ב־20:00», dotted dates after a day marker («עד 28.10», "by 28.10") to an ISO date (next such day when no year), and relative spans («בעוד יומיים», «בעוד שלושה ימים», «בעוד שבוע», "in 3 days", "in a week") to an ISO date. It only rewrites and never decides; prices, versions and decimals are left alone. Used by the chat readers and `meeting-confirm.js`. Portable. Corpus: `test/day-words-corpus.cjs`. |
| `held-hold.js` | Finds a calendar hold already written for a mail thread at a day and clock and not undone since, from the activity log rows (newest first), so a reminder mail for the same appointment is not offered a second Do It. Reads only, never writes. Used by the Gmail and Outlook mail cards. Portable. Also keys a Pay or reminder task by due day and title. Corpus: `test/held-hold-corpus.cjs`. |
| `chat-reminder.js` | A reminder someone asks of the person in a chat becomes one thing and one day: «אל תשכח להביא את הטופס ביום שני», "Don't forget to bring the signed form on Monday". A cue, one thing, one day that is today or later; a question, a look back, a hedge, an own promise or a missing day stays quiet. Returns the day and the thing only, never writes; the chat card offers the task. Portable. Corpus: `test/chat-reminder-corpus.cjs`. |
| `chat-deadline-ask.js` | A task with a deadline asked of the person in a chat without a question becomes one thing and one day: "Need the report by Wednesday", «תחתום על החוזה עד יום שישי». A need cue or a work verb, a deadline marker (by, before, עד, לפני) and one day that is today or later; a question, a hedge, an own promise, a third person or a missing day stays quiet. Returns the thing and the day only, never writes; the chat card offers the task. Portable. Corpus: `test/chat-deadline-ask-corpus.cjs`. |
| `chat-callback-ask.js` | A request to call the sender back on a named day becomes one day: "Please call me back tomorrow", «תתקשר אליי מחר». A call-me phrase and one day that is today or later; a refusal, a hedge, an own promise, a third person, a look back or a missing day stays quiet. Returns the day only and never calls anyone; the chat card offers a task titled Call back · name. Portable. Corpus: `test/chat-callback-ask-corpus.cjs`. |
| `chat-payment-ask.js` | A payment asked of the person in a chat, with one amount and one day, becomes an amount, a currency and a day: "Please transfer 500 NIS to my account by Sunday", «תעביר לי 500 שקל עד יום ראשון». A pay verb aimed at the person, exactly one amount with a currency, one day that is today or later; an own promise, a payment already made, a hedge, a refusal, two amounts or a missing amount or day stays quiet. Returns the amount and the day only and never pays or touches a bank; the chat card offers a task titled Pay 500 NIS · name. Portable. Corpus: `test/chat-payment-ask-corpus.cjs`. |
| `chat-appointment-notice.js` | An appointment, booking or reservation confirmed to the person in a chat becomes one day and one clock to hold: "Your appointment is confirmed for Sunday at 10:00", «התור שלך נקבע ליום ראשון בשעה 10:00». A possessive appointment noun (your / שלך), a confirming frame, one day that is today or later, one clock; a cancellation, an offer of slots, a question, a look back or a missing day or clock stays quiet. Returns the day and clock only; the chat card offers the hold titled Appointment · name. Portable. Corpus: `test/chat-appointment-notice-corpus.cjs`. |
| `chat-travel-notice.js` | A trip told to the person becomes one day and one clock to hold: "Your flight LY001 departs Sunday at 06:30", "Your train leaves tomorrow at 08:15", «הטיסה שלך ממריאה ביום ראשון ב-06:30», «הרכבת שלך יוצאת מחר ב-08:15». A possessive travel noun (your / שלך), a departure or confirmation frame, one day that is today or later, one clock; a cancelled, delayed or changed trip, a promotion, a question, a look back or a missing day or clock stays quiet. Returns the day and clock only; the card offers the hold titled Trip · name. Portable. Corpus: `test/chat-travel-notice-corpus.cjs`. |
| `chat-delivery-window.js` | A delivery with a day and a window told to the person becomes a day, a first clock and (for a window) a last clock to hold: "Your package will be delivered tomorrow between 14:00 and 18:00", «השליח יגיע מחר בין 14:00 ל-18:00». It needs an item or courier noun, a future arrival verb, one day today or later and a clock; a delivery already made, a failure, a cancellation, a delay, a pickup, a question and a promotion stay quiet; an hour under 7 with no marker is too ambiguous to hold. Never writes. Used by the chat card and the shared judge. Portable. Corpus: `test/chat-delivery-window-corpus.cjs`. |
| `chat-payment-claim.js` | The other side says they paid ("I transferred 500 NIS", "Just sent the payment", «העברתי לך 500 ש"ח», «שילמתי»): the claim and an amount when one is named, nothing else. It is the news that can close a "Waiting on Dana: Payment 500 NIS" task; a promise to pay later, a denial, a question, a condition, somebody else's payment and a payment for something else stay quiet. Never writes and never sees any money. Used by the chat card. Portable. Corpus: `test/chat-payment-claim-corpus.cjs`. |
| `chat-sent-claim.js` | The other side says they sent what was asked for ("I just sent you the signed contract", "Here is the invoice", «שלחתי לך את החוזה החתום», «הנה החשבונית»): the news that can close a "Waiting on Dana: Send me the signed contract" task, the document twin of `chat-payment-claim.js`. Reads the claim and the content words that name the thing, and `fits()` says which waiting task shares one of them; a claim that names nothing fits only the one open waiting task. A promise to send later, a denial, a question, a condition, somebody else and money stay quiet. Used by `src/chat-task-card.js` under `CHAT_TASK_CARD` (Mark done, read back as completed, Undo reopens); Glance has not seen the file, the click is the person's. Portable. |
| `chat-chase.js` | A "Waiting on Dana: ..." task Glance wrote from a chat (CHAT_PROMISE_CARD) whose due day has passed is a loop to chase. Reads the task title (name, what, a payment amount), counts overdue days (1 to 21; due today is not late yet), picks the first task that is due for a nudge (one reminder per task per 3 days) and writes a short, neutral, polite reminder in English or Hebrew that the person may put in the open chat's box. Never sends and never counts as the close (the close is the other side's payment or answer). Switch `CHAT_CHASE_DRAFT` (off), read by `src/chat-task-card.js`. Portable. |
| `google-task-close.js` | Closing a Google Task Glance wrote: the task is marked completed only if it still has the title, notes and due day Glance saw, and Handled waits for a GET showing status completed; a task the person changed is left exactly as it is; Undo reopens it only while it is unchanged and still completed. Used by the Google lane (`googleTaskClose`). Portable. Corpus: `test/google-task-close-corpus.cjs`. |
| `chat-pickup-notice.js` | A pickup with a last day, told to the person in a chat, becomes one day: "Your order is ready for pickup until Friday", «ההזמנה שלך מוכנה לאיסוף עד יום חמישי». A possessive item noun (your / שלך), a ready-or-waiting pickup word, a deadline marker and one day that is today or later; a delivery that arrives by itself, a pickup already made, a cancellation, a question, an offer or a missing deadline stays quiet. Returns the day only; the chat card offers a task titled Pick up the order · name. Portable. Corpus: `test/chat-pickup-notice-corpus.cjs`. |
| `chat-invitation-notice.js` | An invitation to an event that someone sends the person in a chat becomes one day and one clock to hold: "You're invited to my birthday on Saturday at 8pm", «מוזמן ליום ההולדת שלי ביום שישי ב-20:00». An invitation frame addressed to the person, one day that is today or later, one clock; a promotion or webinar, a thank-you, a cancellation, a question, a look back or a missing day or clock stays quiet. Returns the day and clock only; accepting or declining stays the person's, and the chat card offers the hold titled Invitation · name. Portable. Corpus: `test/chat-invitation-notice-corpus.cjs`; the seven chat readers are also held silent on everyday chat by `test/chat-fallbacks-silence-corpus.cjs`. |
| `chat-self-note.js` | A reminder the person writes to themselves in a chat becomes one thing and one day: "Remind me tomorrow to pay the electricity bill", «לעצמי: לחדש דרכון עד יום חמישי», «תזכיר לי מחר לשלם חשבון חשמל». An explicit cue (remind me / note to self / לעצמי / תזכיר לי / תזכורת), a named thing and one day that is today or later; read only for a message the person typed, never for an inbound one. A question, a hedge, a refusal, no thing or no day stays quiet. Returns the thing and the day only; the chat card offers a task titled with the thing. Portable. Corpus: `test/chat-self-note-corpus.cjs`. |
| `incoming-judge.js` | The one decision for "someone asked you something", shared by every mail surface: Gmail's chain (own text, classify with sender and subject, silence bar, file gate) as a pure function, plus the Gmail-shaped draft payload. The show decision uses the unrewritten plan. `planFor` runs only after that decision offers, and only after `meetingPlanVeto`. Cancel wording, including "no lnoger needed" and מוטלת, goes through that veto before a plan is built. Attaching a file to an existing invite (`attachToInvitePlan`) is the file-track card on every host. The task names the file. The draft says the file is attached only when a file is on the draft; otherwise it says the file is still to attach. It is not a new Meeting. A task-only plan uses a task label. The Meeting label stays on a calendar plan. Outlook stays `no-draft-close` unless the base judge would show an explicit hold, a draft, or a task. A cancelled, negated, out-of-office, or past-tense meeting stays quiet. `prepareForJudge` strips bidi marks, zero-width characters, nbsp and CR once, before that decision. A phone-signature line drops only when the line is nothing but the signature. |
| `outlook-calendar.js` | Outlook Family B file-on-hold: one named file and one clock become one calendar event body (file link in the description, no attendees). The Calendar checkbox asks `Calendars.ReadWrite`. Mail-only sign-in does not. A short name or a `https://graph.microsoft.com/` audience URI counts as that scope. `api://` and `outlook.office.com` do not. A comma- or space-separated scope string and the access token's scp claim are read the same way. unknown is missing, not a grant. No network. |
| `outlook-config.js` | The application (client) ID of the registered "Glance Outlook" Microsoft Entra app. Public; a placeholder until the owner registers it (open-tasks). |
| `lane-ms-host.js` | Service-worker entry for the Microsoft Graph lane. The one background import. It registers its own listener for this lane's message types and loads the contacts, Word, Excel, Teams, and send modules. A module service worker cannot call `import()`, so the loads are static. It does not replace `getManifest`, content-script registration, or the default listener. |
| `outlook-contacts.js` | Read-only recipient resolve by name through `/me/contacts` and `/me/people`. `Contacts.Read` from `outlook-config.js`. An unclear or split match stays quiet. No network in the portable helpers. |
| `outlook-word.js` | One `.docx` on the person's OneDrive. A new file is Handled when its item id is read back. An existing file is Handled only when the inserted text is in the file content. After that write, Glance does not write again and holds no lock. Undo deletes a file this write created, or restores the previous version, only when both eTag and lastModifiedDateTime are present and unchanged. A missing or changed stamp is `file-changed`. `Files.ReadWrite`. Never sends. No network in this file. |
| `outlook-excel.js` | Append one row or create one table through the Graph workbook API. An append is Handled only when the row at the index returned by the append has those same cells. Undo of an append deletes that row only after a read-back still matches its cells, and never the workbook. Undo of a table created inside the person's own workbook reads the table range and compares rows and address to the creation snapshot. An added or changed row, a failed read, a timeout, or a missing snapshot leaves the table alone. Undo deletes a workbook this write created only when both eTag and lastModifiedDateTime are present and unchanged. A missing or changed stamp is `file-changed`. `Files.ReadWrite`. Never sends. No network in this file. |
| `rsvp.js` | Answer an invite already on the person's calendar (close map C5): "Please confirm you'll attend the Thursday demo" / "נא לאשר הגעה לישיבה ביום חמישי". One explicit ask, exactly one open invite that fits (invited, not organizer, still needsAction, not cancelled, not past; by the day named, a deadline is not that day, or by its words). The person chooses Accept, Maybe or Decline; only their own attendee answer changes, with sendUpdates=none, read back by id for `google/calendar` ProofOfClose. Undo restores the previous answer and refuses after the person changed it. `calendar.events` is already granted. Switch `RSVP_REPLY`, off. Calendar is injected; no src/ file calls it yet. |
| `meet-link.js` | A video call with one day and one clock becomes a calendar hold with a real Google Meet link (ecosystem gap "Meet link on a hold"): "Can we do a video call tomorrow at 15:00?" / "נעשה שיחת וידאו מחר ב-15:00". One proposal, one day, one clock; two clocks, an alternative, a past day, a hedge, a negation, FYI, a third party, or another named tool (Zoom, Teams) stay silent. One Do It creates the event with `conferenceData` (hangoutsMeet), no guest, `sendUpdates=none`; Handled only when the read-back by id shows the same title, both instants and a created `meet.google.com` link, otherwise the event is withdrawn. Undo deletes it and refuses after the person edited it. The link is shown to share; Glance sends nothing. `calendar.events` is already granted. Switch `MEET_LINK`, off. `holdWithMeet` + `withMeet` put the same link on the live Gmail Hold It (wired in `src/google-lane-host.js`, the hold itself unchanged); the standalone `plan`/`create` path is not wired. |
| `workspace-file.js` | Create an empty Google Doc, Sheet or Slides deck from a request with no attachment: "Can you create a shared doc called Q4 launch plan?" / "תפתח בבקשה מסמך בשם סיכום רבעון שלישי". One explicit ask with a name the person gave (or a topic: "a tracker for the Q4 launch"); no name, an existing file, a request to write the content, Word or Excel, a hedge, a negation, FYI, or a third party stay silent. One Do It creates the native file with Drive `files.create` (`drive.file`, already granted); Handled only when the read-back by id shows the name, the Doc, Sheet or Slides type and not trashed. Glance writes nothing into it and shares nothing. Undo trashes it only while version and modifiedTime are unchanged. Switch `WORKSPACE_FILE`, off. `write(input, http)` and `undo(ref, http)` are the Google lane's writer signature; wired on the existing Gmail card (`src/google-lane-host.js`, `src/content-gmail.js` `showNewFileChip`): the worker answers `flow:google-new-file-plan` only with the switch on, the page shows the canonical Do It card with a one-step list, the write goes through `flow:google-write` as `googleNewFile`. A Google Form ("create a feedback form called X", a sign-up form, a survey) is the same module: created through the Forms API, read back by id, Undo only while the form's `revisionId` is the one read back; it needs the `forms.body` scope and the forms.googleapis.com host, which are not in `manifest.json` yet (owner «מאשר»). |
| `planner-task.js` | Add a task to a named Microsoft Planner plan: "Please add the task 'Send contract to Dana' to the Website relaunch plan by Friday" / "תוסיף משימה ... לתוכנית שיווק". One explicit ask with a title and a plan name that is exactly one of the person's plans (listed by the host); no plan named, an unknown or ambiguous plan, another tool (Jira, Asana), a hedge, a negation, FYI, or a third party stay silent. One Do It creates the task with no assignee (nobody is notified) and the date when the mail gave one; Handled only when the read-back by id shows title, plan and date. Undo deletes it with If-Match and refuses after the entity tag moved. Delegated `Tasks.ReadWrite` (already requested for To Do), no new scope. Switch `PLANNER_TASK`, off. `planNamed` picks the destination for a task card that already exists: the mail names exactly one of the person's plans in words. Wired on the existing Outlook To Do card in `src/background.js` (`outlookPlannerWrite`/`outlookPlannerUndo`): with the switch on and a plan named, the card's task is written to that plan instead of To Do; any doubt leaves it in To Do. The standalone `plan` path is not wired. |
| `recurring-reminder.js` | A repeating commitment becomes one recurring Google Calendar reminder (close map T1): "Please send me the weekly sales report every Monday at 9:00" / "Send the VAT summary on the 15th of each month at 10:00" / "בבקשה תשלח את הדוח כל יום ראשון ב-9:00". One explicit request or commitment, a commitment clause of at least two words, exactly one repeat rule (every day, every weekday, every <weekday>, the Nth of each month) and one clock; several rules, every other, quarterly, a hedge, a negation, FYI, a past habit, a third party, or no clock stay silent. One Do It creates the series with no guest and a popup at the start; Handled only when the read-back by id shows title, first start and the same rule. Undo deletes the whole series only while title, note, start, rule and guests are unchanged. A standing reminder does not close the ask (`loopClosed` false). `calendar.events` is already granted. Switch `RECURRING_REMINDER`, off. The standalone `plan`/`create` path is not wired to a card. `seriesFor`, `withRecurrence` and `confirmSeries` put the same repeat on the live Gmail Hold It under the separate switch `RECURRING_HOLD` (off; wired in `src/google-lane-host.js`, the hold module unchanged). |
| `event-call-link.js` | Add a Google Meet link to an event already on the calendar: "Can you add a Meet link to the Thursday sync?" / "תוסיף קישור למיט לישיבת צוות". One explicit ask; exactly one event the person organizes that fits (by the day named, or its words), with no call link, not cancelled, not past; Zoom/Teams named, a hedge, a negation, FYI or a third party stay silent. One Do It patches only the conference request (`sendUpdates=none`, no guest change) and reads the event back by id: Handled only with a created `meet.google.com` link and title, start and guests unchanged. Undo removes only the conference, and refuses after the person changed anything else or the link. `calendar.events` is already granted. Switch `EVENT_CALL_LINK`, off. `write(input, http)` and `undo(ref, http)` are the Google lane's writer signature; wired on the existing Gmail card (`src/google-lane-host.js` `flow:google-event-link-plan`, `src/content-gmail.js` `showEventLinkChip`): the worker reads the calendar only with the switch on and a mail that asks for a link. |
| `outlook-event-call-link.js` | Add a Microsoft Teams link to an event already on the Outlook calendar (twin of `event-call-link.js`): "Can you add a Teams link to the Thursday sync?" / "תוסיף בבקשה קישור לטימס לישיבת צוות". One explicit ask; exactly one event the person organizes that fits, not yet online, not cancelled, not past (the picking is the Google twin's on a mapped Graph event); Zoom or Meet named, a hedge, a negation, FYI or a third party stay silent. One Do It patches only `isOnlineMeeting`, reads the event back by id: Handled only with a Teams join link and subject, start and guests unchanged. Undo turns the online meeting off, and refuses after the person changed anything else or the link; Microsoft's own join block is not read as an edit. `Calendars.ReadWrite` is what the Calendar box already asks. Switch `OUTLOOK_EVENT_CALL_LINK`, off. Graph is injected; no src/ file calls it yet. |
| `teams-meeting.js` | A call proposed in Outlook mail with one day and one clock becomes a calendar hold with a real Microsoft Teams join link (ecosystem gap "Teams meeting link"): "Can we do a Teams call tomorrow at 15:00?" / "נעשה שיחה בטימס מחר ב-15:00". Posts `/me/events` with `isOnlineMeeting` and no guest, reads it back by id for subject, wall clock and a Teams join link, withdraws it otherwise; Undo deletes and refuses after an edit. Zoom, Meet, a hedge, two clocks and a third party stay silent. Behind `TEAMS_MEETING` (off); not wired to `src/`. Test: `test/teams-meeting-corpus.cjs`. |
| `onedrive-new-file.js` | "Can you create a Word document called X?" / "תפתח מסמך בשם X" in Outlook mail, with no attachment, becomes an empty `.docx` or `.xlsx` in OneDrive > Glance (row 76 part 8). Needs an explicit ask and a name; never replaces a file (`conflictBehavior=fail`); read back by id for name, a file, a size and not deleted; Undo deletes and refuses after an edit. Content requests, existing files, Google or other apps, hedges and third parties stay silent. Behind `ONEDRIVE_NEW_FILE` (off); not wired to `src/`. Test: `test/onedrive-new-file-corpus.cjs`. |
| `sharepoint-new-file.js` | "Can you create a Word document called X on the Marketing SharePoint site?" / «תפתח מסמך בשם X באתר Marketing ב-SharePoint» becomes an empty `.docx` or `.xlsx` in the Glance folder of that ONE site (owner approval 2026-10-24, row 79a). Reads the ask with `onedrive-new-file.js`, finds the site by name through Graph search (read only) and is silent unless exactly one site has that name; never replaces a file; Handled only after a read-back by id; Undo refuses after an edit. Needs `Sites.ReadWrite.All` (the SharePoint box on the Connect screen). Switch `SHAREPOINT_NEW_FILE` (off). Portable, host injects `call`. |
| `sharepoint-save-file.js` | "Please save the attached contract on the Marketing SharePoint site" / «תשמור את הקובץ המצורף באתר Marketing ב-SharePoint» in Outlook mail saves that attachment, bytes untouched, into the Glance folder of that ONE site (owner approval 2026-10-24, row 79a). An explicit ask only (a save verb, a file the mail points at, one named site; an ask that also sends or shares, a question, a report, a hedge, a third party and another target stay silent). The file is the only real attachment or the one the mail names, never a guess; the site comes from `sharepoint-new-file.js`. Never replaces a file; Handled only after a read-back by id with the same name and size; Undo refuses after an edit. Needs `Sites.ReadWrite.All`. Switch `SHAREPOINT_SAVE_FILE` (off). Portable, host injects `call`. |
| `todo-recurrence.js` | A commitment with one repeat rule and one clock becomes a repeating Microsoft To Do task ("send the report every Monday at 9:00"). Maps the rule `recurring-reminder.js` recognizes to Graph's `todoTask.recurrence` (daily, weekly on named days, monthly on a day 1–28), and compares a task read back with the rule asked for. Used by `outlookTaskWrite` in `src/background.js` behind `glanceSwitches.RECURRING_TODO` (off). Test: `test/todo-recurrence-corpus.cjs`. |
| `teams-chat.js` | Read the chats the person is in (`Chat.Read`) and show a draft reply in the panel. Never posts. A draft is not a close. No network in this file. |
| `outlook-send.js` | Preview To, Cc, subject, and body. Sends only on an explicit click when `MAIL_SEND_ENABLED` is true (default false). Otherwise `FORBIDDEN_SEND` and no request. A send is Handled only after Sent Items is read back. The send is an event-log row. Never auto-sends. |
| `outlook-sync.js` | What to do with the last couple of weeks of an Outlook mailbox. |
| `outlook-state-migrate.js` | One-shot upgrade: merge leftover HANDLED+UNDONE Outlook draft rows and scrub false-close counts for prepared-draft undos. |
| `draft-reply.js` | Shared reply-draft body for Gmail and Outlook (never sent): rich ack of concrete asks (facts when known; placeholders only when needed), same shape on both surfaces. |
| `owa-parse.js` | Outlook on the web reading-pane helpers (URL item id, subject/sender/body, match to sync entries). Selectors are best-effort against OWA markup. |
| `outside-signals.js` | Loops that close without the other person replying |
| `bill-paid.js` | A bill the person owes is closed only when it is paid: the payee's receipt, a bank or card debit naming the payee, or the person's own "I paid" to the payee, with the message as proof; lists bills past due (off: `opts.enabled`; not wired yet) |
| `labs-switches.js` | The closes that ship behind an off switch, in one list, for the popup's Labs rows |
| `person-model.js` | A model of HOW LONG each person takes — portable, no chrome.*, no DOM, no network, no model service. |
| `pmf-metrics.js` | Turns the durable local counters storage.js already keeps (shownStats, writeStats, undoneStats, activeDays, closeStats) into the three product- market-fit signals this product actually needs to know whether it's working |
| `recognition-stats.js` | How much of the recognising was done by our own code — portable, no chrome.*, no DOM, no network. |
| `recurrence.js` | Things that come around again — portable, no chrome.*, no DOM, no network, no model. |
| `reply-meaning.js` | What a reply MEANS for the loop it landed on — portable, no chrome.*, no DOM, no network, no model. |
| `reply-model-weights.js` | GENERATED by `scripts/train-reply-model.cjs`: the weights for `reply-model.js`. Never edit by hand. |
| `reply-model.js` | Does a reply truly FINISH what was asked? A small on-device classifier. |
| `request-types.js` | Request and promise recognition — portable, no chrome.*, no DOM, no network, and no model. |
| `resolution.js` | Resolution paths: finishing an intention that takes more than one step (define "done", find what exists, verify the precondition, prepare or ask, close ONLY on a real delivery). Receipts and transfer proofs, and the documents the person sends (contract, quote, proposal, signed copy). `docs/resolution-paths.md`, `docs/true-close.md`. Never sends, issues or signs. |
| `sheet-row.js` | Add one row to the tracker they named (close map D4): "Log the ₪3,850 in the payments sheet" / "תרשום 3,850 ש״ח בגיליון התשלומים". One explicit ask (verb, named sheet, exactly one amount), exactly one fitting Google Sheet (no templates), the amount, date, label and currency under the sheet's own headers (never a new column); append, then read that range back for `google/sheets` ProofOfClose. Undo deletes the row only while it still holds what Glance wrote. Needs the `spreadsheets` scope, not asked today. Switch `SHEET_ROW`, off. Sheets is injected; no src/ file calls it yet. |
| `story.js` | One story, many messages — portable, no chrome.*, no DOM, no network. |
| `step-list.js` | The checklist on a card: Queued, Preparing, Verifying, Verified, Couldn't confirm · Retry. Added and Manual steps. Handled still requires ProofOfClose `fetchedBack`. `mailSendPreview` is data for a later stream and does not send. |
| `suggest-save.js` | Which attached files could be saved, and the `attachmentSave` step the steps list draws. Rules and reason codes: suggest-save spec §1–§9. 0.9.41 draws one card titled `Save the file?` when the page has no other card and the worker says Files.ReadWrite is granted. The reason code stays `suggest:eligible-hidden`. 0.9.42 keeps an excluded file's name and size, and the row reads `name · skipped · why`. Mail.Send is not this step. |
| `understanding.js` | **The Understanding contract** (M1 of `docs/glance-ai/ai-product.md`): the device-side validator for a model's answer about one masked text. Every claim must quote words that are really in the text, or it is dropped with a reason. The device reads the due date from the quoted words itself (`core/extract.js`, then a bare weekday such as «עד שלישי»), so a model's misread date is corrected. `proposal()` gives at most one step or silence, and never closes, writes or sends. `instructions()` is the one prompt every tier asks with: the model quotes words, and the device reads every value. `placesOnly` (on the server) grounds every quote without reading values, because only the device can restore its placeholders. Off switch `aiUnderstandingV1` (default off). Corpus: `test/understanding-corpus.cjs`. |
| `understanding-router.js` | **Router v2** (M2): who reads a mail, in order. Tier 0, the device rules, settles quiets and clear cases with no model call. Tier 1 is the device model, when present. Tier 2 is Glance cloud, called only with consent and only on text masked by `exec-router.js` `maskForServer`; a surviving phone or email blocks the call. Every model answer passes `understanding.js` and then the host's strict gate and veto, which are injected; a missing gate counts as silence. Off switch `aiPrimary` (default off); nothing calls it yet. M8: a second switch, `aiRelevanceV1` (off), lets the host's profile scorer (`deps.relevance`) silence a `not_relevant` mail before any model call. It never adds a card. Corpus: `test/understanding-router-corpus.cjs`. |
| `understanding-device.js` | **Tier 1, the device model** (M4): the session from `src/local-lm-chrome.js` reads a mail twice, in two wordings of the one shared prompt. An answer counts only when both readings validate and agree on the step and the date; otherwise Router v2 escalates. It runs only in a language whose self-test on this device passed (precision ≥ 0.97 on ≥ 12 proposed, recall ≥ 0.4, fresh for 30 days). Off switch `aiDeviceTier1` (default off). Corpus: `test/understanding-device-corpus.cjs`. |
| `model-plan.js` | **The Plan** (M5): a grounded model proposal becomes the product's own closing process: `actions.js` `planFor()` builds it and `step-list.js` `rowsFor()` draws it, so a model cannot invent a step. The plan gate allows only calendar, draft and task writes (never a send or a page action), requires the anchor to match the proposal, and accepts only dates the device read. Each plan carries `doneWhen` (what really closes it: a sent reply, an event read back, the promised item arriving) and `carry` (when Glance looks again). Every step needs the person's click. `toWatch()` hands an ask or a promise to the follow loop (`follow-up.js` `buildWatch`, its own chase rules): an ask of you becomes a "mine" loop that closes when your reply goes out, and a promise to you becomes a "theirs" loop chased until the item arrives. Off switch `aiPlanV1` (default off). Corpus: `test/model-plan-corpus.cjs`. |
| `ai-engine.js` | **The AI engine, one call** (M9): `read(mail, deps, flags)` is the one entry a host calls for one mail. It runs `understanding-router.js` (tier 0 is the engine's own card, returned untouched), then for a model card `model-plan.js` `plan()` and `toWatch()`, so a model card arrives with its steps, `doneWhen` and its follow-loop watch. A `file_save` card is marked `suggestSave` for `suggest-save.js`. A model card that cannot be planned is not shown. A host that injects no gate or veto gets `ai-floor.js`; a host gate or veto wins. Nothing here closes, writes or sends. Rides on `aiPrimary` (off): with it off `read()` returns `{used:false}` and calls nothing; `aiPlanV1` (off) adds the plan and the watch. No host calls it yet. Corpus: `test/ai-engine-corpus.cjs`. |
| `ai-floor.js` | **The floor under every model answer** (M9): the production strict gate and veto Router v2 runs on each Tier 1 or Tier 2 proposal, ported from the lab (`glance-ai/oss/veto/propose-gate.cjs`, `llm-veto.cjs`) so a host needs to give the AI engine only its model transport and mask. Gate: a step Glance can close (draft, task, calendar; a file goes to `suggest-save.js`), no ask for a new document or a file into an invite, no offer or price acceptance, and a task, event or reply anchored in time (a device-read date or a deadline cue). Veto: own mail, a reply draft on a note to self, injection, fraud-shaped money, any money movement, a save with no single attachment or a target the surface cannot write, a past date or a meeting that already happened. Dates are only the device's. Silence-only. No switch of its own: it runs only inside `ai-engine.js` (`aiPrimary`, off). Corpus: `test/ai-floor-corpus.cjs`. |
| `style-profile.js` | How YOU write, as counts. Portable: no chrome.*, no DOM, no network, no model. |
| `google-account.js` | Which Google account a write may use. Portable: no chrome.*, no DOM, no network. The host reads each candidate token's address from the Gmail profile; `choose` returns the token of the account recorded at Connect, refuses a readable address that is not that account (`wrong-account`), and refuses an unreadable profile or an absent account to compare with (`account-unverified`): no write without a positive match. |
| `google-calendar.js` | Google lane Hold It: one clock becomes one calendar event. A named file is included when the hold has one. The start is an absolute instant in the person's time zone (passed in, otherwise Intl; never a silent UTC default). No attendees, no invites. Handled waits for a read-back of that event. Undo deletes it. `calendar.events` only. |
| `google-compose.js` | Fills To, subject, and body for a Gmail compose the person sends. Glance never presses Send. The result is a preview (`closes: false`) and is not a trusted close. Undo restores the previous fields only while Send has not been pressed. |
| `google-config.js` | Full-flavor Google client id, extension id, and the allowlist: openid, email, profile, drive.file, calendar.events, tasks (the manifest also grants gmail.compose for the reply draft). `contacts.readonly` is not on it. A wide Gmail scope, a wide Drive scope, and a documents or spreadsheets scope are refused here. |
| `google-docs.js` | Create or edit one Doc on a file Glance created or the person picked, through drive.file. Handled waits for the inserted text to be read back. Undo trashes a created file or deletes the inserted range. |
| `google-drafts.js` | A reply draft saved in the thread through the Gmail drafts API (`gmail.compose`): create, read back by id, verify the thread, recipient and body, then report. Glance never sends. A saved draft is preparation: `closes: false`. A read-back that does not match deletes the draft again. Undo deletes it. |
| `google-drive.js` | Save one attachment to Drive with drive.file, in a folder named Glance that it finds or makes (My Drive when it cannot). Handled waits for a read-back of that file. Undo trashes the file, never the folder. A mail does not search Drive. |
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
