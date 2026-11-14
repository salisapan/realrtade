# The model against every Glance capability (2026-11-14)

Owner, 2026-11-14: Glance is far more holistic than Gmail; develop the model in the context of all its capabilities. This page is the measurement that comes first. It is lab work: no manifest, permission, scope, copy or switch changed, and nothing here turns a Labs switch on.

**Product definition (vision-locked):** Glance closes open loops. Gmail is where it starts today. A close is proven (ProofOfClose, `fetchedBack`), never sent for the person, and always undoable.
**Current implementation status (code reality):** what follows is what the code at this commit does, measured with a lab probe.

## 1. The finding

The product's own list of closes, `docs/glance-ai/holistic-close-map.md`, has **62 close kinds** (E mail loops, C calendar, D docs and sheets, F files, T repeats, M chats, Y money, G government, R bookings, S orders, P people, U on-page and local, X chains). Their state in code today: 3 live, 34 partial, 4 quiet, 21 none.

The lab model (v3.3 and before) says one of **4 families**: task, calendar, draft, file_save. Set against the 62 kinds (`glance-ai/scoreboard/capabilities/kinds.cjs`, the `model` column is my reading of each row's closing action, not a measurement):

| What the 4 labels can say about the kind | kinds |
|---|---|
| the exact close (a task, a calendar hold, a reply draft, a saved attachment) | 13 |
| the right family but another action (move or cancel a meeting, find a file, chase, a recurring task) | 16 |
| nothing (create a file, write a row, a chat answer, a form, a contact, money moved, a page) | 33 |

So the 4-step scoreboard sees about a fifth of what the product can close, and the labels cannot even score the rest. Evidence on the frozen set: three `create_doc` rows ask plainly for a new doc ("Please create a new doc for the campaign notes."); the engine's Google and Microsoft file readers offer it, and the two-pass label says SILENT because the label space has no such step. The reader is right and the label is the gap (`last-frozen-kinds.txt`).

The engine is not one model. It is a union of about 25 kind-specific rule readers, each with its own corpus and Labs switch, run before the shared judge (`src/content-gmail.js`, around the `showFullDocumentChip` / `showRecurringChip` / `showNewFileChip` calls). The lab model never saw any of them.

## 2. The probe

`glance-ai/scoreboard/capabilities/` (lab only, nothing written anywhere):

- `probe-set.cjs`: 55 hand-written EN and HE texts, one per kind of close, with a negative beside most (a hedge, a negation, FYI, someone else acts, a changed bank). Written for this file; no real mail.
- `union.cjs`: the product's recognition union as the hosts run it: the kind readers first, then `FlowIncomingJudge.judge` with every Labs switch it takes on (`taskAskOn`, `paymentAskOn`, `bookingNoticeOn`, `systemNoticeOn`, `directAskOn`, `workspaceFileOn`). `load.cjs` loads the core files in manifest order, so no reader is missing by accident (my first run used a hand-picked list and made kinds look silent; that table was discarded).
- `run.cjs`: per kind and surface (Gmail, Outlook): right, wrong family, silent, offered where silence is right. Output: `last-run.md`.
- `frozen-kinds.cjs`: the same union over the 701 frozen rows, by kind route, next to the two-pass label. Output: `last-frozen-kinds.txt`.
- `kinds.cjs`: parses the close map into `kinds.json` / `kinds.md` (62 rows) with the model column.

Result after the fixes below (102 scored rows, Gmail and Outlook, the Labs switches on): **92 right, 1 offered the wrong family, 9 silent, 0 offered where silence is right.** (First run, before any fix: 86 of 98.) Not scored: `file.find` and `file.receipt`, because the worker's Drive and OneDrive search runs first and the judge alone is silent on purpose (`file-chain-not-run`).

## 3. What the probe found and what changed

| Finding | State |
|---|---|
| **A payment to a changed bank was offered as a task.** With PAYMENT_ASK or TASK_ASK on, "our bank details have changed, please pay the ₪4,000 invoice to the new account by Friday" became "Pay ₪4,000 to the new account": the two task readers ran before the phishing and bank-change veto the reply path already had. | **Fixed.** The veto now runs before both readers (`core/incoming-judge.js`). Hebrew "פרטי החשבון שלנו השתנו … העבר … לחשבון החדש" was not in the veto at all (it fell to a reply draft); `BANK_CHANGE` and `PAY_MOVE` in `core/intent.js` now read it. `test/payment-veto-corpus.cjs` (6 of its checks failed before the change). |
| Hebrew "תפתח קובץ אקסל / וורד בשם ..." was ignored by the OneDrive new-file reader. | **Fixed** in `core/onedrive-new-file.js`, with the negation, own-promise, third-person and no-name guards kept (`test/onedrive-new-file-corpus.cjs`). |
| "The Thursday sync is moved to Friday" and "the meeting is cancelled": silent. `core/calendar-move.js` is a writer; no host reads a moved-meeting mail into it; a cancelled meeting is vetoed. | **Declared gap.** Rows C2 and C3 of the close map say the same ("partial"). |
| «לפי מה שסיכמנו … אתה שולח את החשבונית עד יום שישי»: English reads "as agreed, you will send the invoice by Friday", Hebrew was silent because the agreed-commitment cue knew «מעביר» but not «שולח». | **Fixed** (`core/actions.js`, needs the agreement cue before the verb; a bare «אתה שולח …?» question and «אולי …» stay silent, probe rows `commit.reader.neg`). The title is still the generic "Log commitment for Oct 9", which names no work: open. |
| "Please add this paragraph to the Q4 doc": no recognizer; Hebrew falls to a reply draft. | **Declared gap.** (D3/D4 family.) |
| A form asked as a bare imperative with no name stays silent. | **Declared, kept for precision.** |
| "we approved $1,200 …" becomes "Log $1,200 agreed" (the money domain). | By design, not a gap (probe row relabelled). |

`test/capability-probe-corpus.cjs` pins the probe: no new miss, no wrong Do It, and every declared gap must be removed from its list on purpose when fixed.

## 4. What this means for the model

1. **The label space is the ceiling.** A model trained on four labels cannot get better at kinds it has no label for, and the scoreboard cannot score them. The next model work is a **kind head**: the 62 close-map ids (collapsed to the kinds a mail or chat text can carry, about 25) as the label, with the four families as the coarse level above it.
2. **The engine can label the kinds for free.** Every kind reader is a deterministic, corpus-tested recognizer. Run over the unlabeled training mail it gives silver kind labels at the readers' precision, with no teacher spend. Rare kinds (create a file, add a row) have few natural positives, so the generator (`scripts/intent/generate.cjs`) needs a scenario per kind first.
3. **The scoreboard needs a kind column.** `frozen-kinds.cjs` is the start: route counts per kind and surface. A kind-level frozen set needs rows the two-pass labelling has not touched, so it is written by hand per kind (the probe is the seed) and kept out of training.
4. **Chats and the other surfaces.** Rows M1 to M7 (WhatsApp, Messenger, Teams, Slack, LinkedIn) have no probe rows yet: the chat readers (`core/chat-*.js`) take a different input than a mail. They are the next probe, not covered here.
5. **Spend.** Nothing in this page spent a token. A teacher run for kind labels is still gated on the owner's yes in the `glance-model-lab` session, and I recommend not asking for it before the silver-label path in point 2 shows how many kinds it already covers.

## 4b. Same-day follow-up: chats, the training pool

- **Chat probe** (`glance-ai/scoreboard/capabilities/chat-run.cjs`, `test/chat-capability-probe-corpus.cjs`): 28 hand-written lines for a one-to-one chat, through the judge with surface `chat` and the chat readers as `src/chat-task-card.js` runs them (deadline, callback, payment, appointment, delivery window, trip, invitation, hold, video call, two business questions, reminder, plus negatives: acknowledgement, hedge, past, group, changed bank, one question, another call tool). **28 of 28 right, 0 offered where silence is right.** The one thing the first run showed was by design: a chat needs two business-opener questions, and "how long" is not an opener there.
- **The training pool has no positives for most kinds** (`silver-kinds.cjs`, the engine's union over the 21,478 synthetic training rows, `kinds-silver.json`): none 15,646, draft 2,312, task 2,224, calendar 677, pay 330, file_save 288, sheet_row 1. No doc, sheet, slides, Word, Excel, video-link or recurring row at all. Its `create_doc` scenario (132 rows) is "create an invoice / prepare a quote" (rows Y2 and Y7 of the close map), not a blank file, and the engine is silent or a task on it.
- **So I did not build a distilled kind head.** The kind readers are regexes; a student trained on rows they label, from templates shaped like the regexes, would copy the regexes and look good on its own data. A kind head needs rare-kind paraphrases labelled by a teacher, and that spend can only happen in the `glance-model-lab` session (no lab key in this environment). The owner's blanket yes of 2026-11-14 is on record; the run itself, the 200-row cost probe first, is for that session.
- **Not done on purpose:** move/cancel a meeting and "add to an existing doc" need a new write scope (`documents`, calendar update) and the privacy text with it, so they are a manifest decision; no Labs switch was turned on by default; nothing merged to `main` or deployed. The blanket approval does not stand in for the live Gate those need.

## 5. Surface table (every change here)

| Surface | Bank-change veto before the task and payment readers | Hebrew Excel/Word file | Probe |
|---|---|---|---|
| Gmail (content script) | done (shared judge) | n/a (Google files; the Google reader already took Hebrew) | done |
| Outlook (content script and Graph sync) | done (same judge) | done (OneDrive new-file reader; SharePoint new-file shares it) | done |
| Gmail add-on (iPhone/Android) | done after `node scripts/build-bundle.js` (CoreBundle rebuilt in this commit) | n/a | not probed |
| Chats (WhatsApp, Messenger, Instagram) | done where the chat card calls the judge; the chat payment reader has its own veto (not re-measured) | n/a | follow-up: chat probe |
| Safari iOS | n/a: does not exist yet | n/a | n/a |

## 5b. Limits

Labels on the frozen set are Claude's two-pass agreement, not owner-verified. The probe rows are mine, so they show where the engine is silent or wrong on shapes I thought of, not how often each kind occurs. The `model` column of the 62-kind table is my reading of the closing action. No live Gate was run: the headless Playwright suite does not boot in this lab (service worker), CI runs it. No Labs switch was turned on in the product.
