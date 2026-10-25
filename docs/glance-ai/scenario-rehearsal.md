# Scenario rehearsal — A to E, automated, before the owner's live Gates

Glance closes open loops. Gmail is where it starts today.

## Product definition (vision-locked)

The five scenario Gates are in `docs/glance-ai/holistic-close-map.md` §4. A scenario passes only when every step proves itself: a write is read back by id (`fetchedBack`), Handled appears only after that read-back, the receipt comes back after a reload, and Undo removes what Glance made. A draft, a task that tracks, or a prepared reply is never the close. The paid bar (`docs/glance-ai/paid-readiness-bar.md`) needs all five live Gates and `setup_minutes` ≤ 10.

## Current implementation status (code reality)

This page is a rehearsal. It runs in the headless suite with mocked Gmail, Outlook, WhatsApp and Messenger pages and mocked Google and Microsoft APIs. It does not run a live Gate, and it never fills a paid-bar `current` value. Every number below is from the run on 2026-10-24, on top of `fe129efb` (package 0.9.56).

**How to run it.** `cd flow-trial-extension && xvfb-run -a npx playwright test e2e/scenario-a.spec.js e2e/rehearsal-*.spec.js`. In a cloud session whose Chromium differs from the Playwright pin, add `GLANCE_CHROMIUM=/opt/pw-browsers/chromium` (`e2e/support/launch.js`; CI leaves it unset).

**How to read a row.** *pass*: the step ran and its proof held. *expected missing*: the path does not exist yet; the test asserts the honest state (nothing sent, no Handled) and names the catalog row. *Gate gap*: the path exists and does something other than the Gate says; the test is marked `test.fail` with the reason, so the run turns red the day it is fixed and this row must be updated.

### Results, 2026-10-24 (UTC and Asia/Jerusalem, both green)

| Scenario | Spec | Pass | Gate gap | Expected missing | Scenario |
|---|---|---|---|---|---|
| A — Thursday morning | `e2e/scenario-a.spec.js` | 4 of 4 steps | 0 | 0 | **passes in rehearsal**. Live Gate not run |
| B — the receipt leaves | `e2e/rehearsal-b.spec.js` | 3 | 2 | 2 | not yet |
| C — the restaurant, in the chat | `e2e/rehearsal-c.spec.js` | 3 | 0 | 3 | not yet |
| D — the meeting they named | `e2e/rehearsal-d.spec.js` | 4 | 1 | 1 | not yet |
| E — the contract, and the invoice | `e2e/rehearsal-e.spec.js` | 2 | 1 | 3 | not yet |

Rehearsal score: **1 of 5** (A). Live score stays 0 of 5 until the owner runs them.

### Step by step

| ID | Step | Result | Proof or reason |
|---|---|---|---|
| A1–A4 | To Do task, suggest-save to OneDrive, a reply that stays a draft, both Undos | pass | POST then GET by id for the task and the file; Handled only after; the task banner remounts after reload; the draft says Draft ready, not Handled; DELETE for both; no send call |
| B1 | Hebrew receipt ask, one receipt in Drive | pass | The card names `קבלה 3850.pdf`, says not sent, and "done when" is the sent file. Prepare writes one Gmail draft. No send call, no Handled |
| B2 | No file and no payment seen | pass | The card asks "האם שולם?" and writes nothing |
| B3 | "Can you ask accounting to send the receipt?" | pass | No card, no write |
| B4 | Two receipts with the same kind of name | Gate gap | A card says "more than one matches, I will not choose" with Prepare my reply. The Gate says no card. Owner decision |
| B5 | Hebrew card language | Gate gap | Title and line are Hebrew; the buttons are English (`src/follow.js` `resolutionCard`) |
| B6 | Approve the send, read the sent message back with the receipt, Handled; remount after reload; Undo before approve | expected missing | Row 53 (Mail.Send as the steps-list preview), catalog Y1 |
| C1 | WhatsApp, "איפה אכלנו בשבוע שעבר?", one place on the calendar | pass | The chat box holds the place and a Maps link; the calendar was read; Send was never pressed; no Handled |
| C2 | Two different places that week (Google and Outlook) | pass | The box stays empty |
| C3 | Same ask on Messenger with that host not turned on | pass | No draft, no calendar read |
| C4 | Approve and send the line; re-read it and set `fetchedBack`; receipt after reload; Undo | expected missing | Row 54, catalog M2 |
| D1 | Gmail, "Can we meet Thursday at 16:00 about the quote, and reply to confirm?" | pass | One event, no attendee, 16:00; GET by id after the POST; Handled; one receipt after reload and no second POST; Undo sends DELETE |
| D2 | WhatsApp the same morning, "Thursday at 4 still good?" | pass | No second event. With today's switches the chat card is off, so this proves the default only |
| D3 | Outlook, no `Calendars.ReadWrite` | pass | The card asks for calendar permission; Do It writes nothing and never says Handled |
| D4 | Outlook, with the permission | pass | POST, then GET of that event, then Handled |
| D5 | "Can you find us 30 minutes next week…" | Gate gap | A Reply & Track card (draft plus task) on purpose: `core/intent.js` "the card is a reply that offers times, not a hold". The Gate says nothing. Owner decision |
| D6 | The confirmation as a preview, approved, the sent message read back | expected missing | Row 53, slice 2 |
| E1 | "שלחי לי בבקשה את ההסכם החתום", one PDF in Drive | pass | The card names `הסכם.pdf`, says not sent, and closes only on the sent file. No write until asked |
| E2 | "תוציאי חשבונית מס" in the same sitting | pass | No card, no write, no invoicing call |
| E3 | One offer on the contract mail | Gate gap | The resolution card and the Reply & Track chip both show. The chip's Do It writes a draft and a task and says "Handled … Closed — set a reminder", while the card says done only when the file is sent (`src/content-gmail.js` file-ask branch does not step aside when `FlowResolution.owns` the ask) |
| E4 | "Needs a signature" on the steps list | expected missing | Catalog U3 |
| E5 | Reply preview, approved send, close on the sent attachment | expected missing | Row 53, catalog X1 |
| E6 | Friday follow-up event on the same steps list | expected missing | Catalog X1 with C1 |

### Fresh install to the first proved close

`e2e/rehearsal-setup.spec.js`, empty profile: open the panel, Connect Google, open a mail with a dated ask, Do It, Handled after the task is read back.

| Measure | Rehearsal | Bar |
|---|---|---|
| Clicks in Glance | 2 (Connect, Do It) | — |
| Consent screens | 1 (the stubbed Google screen) | at most 1 |
| Machine seconds | 1.7 (UTC), 1.9 (Asia/Jerusalem) | — |

The machine seconds are not `setup_minutes`. A person reads, decides and passes Google's own screen, and the Microsoft screen still fails on unlisted Entra permissions (open-tasks rows 44, 45). Only the owner's stopwatch with five people fills that value.

### Found this run, not fixed here

Each of these is in a file another open pull request changes, so this run did not edit it (the routine's rule). B5 and E3 went to David once on PR #77.

| Finding | File | Smallest fix |
|---|---|---|
| B5 English buttons on a Hebrew card | `src/follow.js` `resolutionCard` (PR #121 also changes it) | Pick the button labels by `he`, as the title and line already do |
| E3 two offers, and "Handled … Closed" on a draft plus a task | `src/content-gmail.js` file-ask branch (PRs #121, #153, #155, #179) | When the file gate is clear and `FlowResolution.owns(ask.id)` on Gmail, skip the chip so the resolution card is the one offer |
| B4 a card for two receipts | `src/follow.js` / `core/resolution.js` | Owner decision: the Gate says silence, the code asks |
| D5 a reply card for "find a time" | `core/intent.js` | Owner decision: the Gate says nothing, the code offers a reply |
| C title-only place | `src/lane-chat-worker.js` reads the event location only, by design | Owner decision: the Gate's example names the place in the title; reading titles is a new data path and a privacy-page change |

Also seen, not asserted: the Outlook hold is titled with the whole sentence, while Gmail titles it "Hold Thu 16:00".

### What changed in code this run

Test-only. `e2e/support/launch.js`: an opt-in `GLANCE_CHROMIUM` executable path, and WhatsApp Web routed in the headless copy (the repo manifest already lists it as an optional host). New: `e2e/support/rehearsal.js` and `e2e/rehearsal-{b,c,d,e,setup}.spec.js`. No product file, permission, host, scope, switch, copy or privacy text changed.

### What the owner runs live next

Scenario A, on the build in this tip: the three proofs already pass here. Then D1 on Gmail and D4 on Outlook with the calendar permission, which are the next steps that pass in rehearsal without anything new.
