# What changed in the code (generated from git, do not edit by hand)

Glance closes open loops. Gmail is where it starts today.

Source: `git log origin/claude/install-uiux-pro-max-skill-a4agox --since=2026-10-20` limited to `flow-trial-extension/core`, `flow-trial-extension/src`, `flow-trial-extension/manifest.json` and `glance-gmail-addon/`. Regenerate: `scripts/what-changed.sh 2026-10-20 > docs/glance-ai/shipped-in-code.md`.

- Extension version in `manifest.json` on the branch: 0.9.56
- Commits on the working branch that are not on `main`: 154. `main` and the store package do not carry them yet (merging to main and publishing need the owner's «מאשר»).
- Lines changed in core, src and the add-on since `main`: 136 files changed, 54493 insertions(+), 1143 deletions(-)

| Commit | When | What it changed in code | Files in core, src or the add-on |
|---|---|---|---|
| c5965a3c | 2026-10-21 | Lab: invoice loops finished + carry wiring (#183) | core/outside-signals.js core/pmf-metrics.js src/background.js src/follow.js  |
| 46e4b64e | 2026-10-21 | Meet link on an existing event wired on the existing Gmail card behind glanceSwitches.EVENT_CALL_LINK (off): one event you organize, only the conferen | core/README.md core/event-call-link.js src/content-gmail.js src/google-lane-host.js  |
| 58ac7200 | 2026-10-21 | One algorithm on every surface: the Gmail app card runs the shared judge, short direct asks are asks, parity corpus across Gmail, Outlook, chat and th | core/incoming-judge.js core/intent.js core/judgment.js glance-gmail-addon/Code.js  |
| 30a07cdd | 2026-10-21 | Teams link on an existing Outlook event wired into the live card behind glanceSwitches.OUTLOOK_EVENT_CALL_LINK (off); Outlook card chains share one ma | src/background.js src/content-outlook.js  |
| 7f07b273 | 2026-10-21 | Empty Google Doc, Sheet or Slides deck from a named request wired on the existing Gmail card behind glanceSwitches.WORKSPACE_FILE (off): canonical Do  | core/README.md core/workspace-file.js src/content-gmail.js src/google-lane-host.js  |
| ba9c418c | 2026-10-21 | Word or Excel from a request wired into the live Outlook card behind glanceSwitches.ONEDRIVE_NEW_FILE (off): worker plan, write and undo, receipt that | src/background.js src/content-outlook.js  |
| 9378b9c6 | 2026-10-21 | Planner on the existing Outlook To Do card behind glanceSwitches.PLANNER_TASK (off): a plan named in the mail gets the task, read back by id, Undo wit | core/README.md core/planner-task.js src/background.js  |
| 78acb7d3 | 2026-10-21 | Requests for an update or an introduction are requests (English and Hebrew); restore open-tasks rows a routine commit deleted; list value-test misses  | core/judgment.js  |
| d4c3a979 | 2026-10-21 | e2e for the Outlook Teams link, repeat and repeating To Do (7 specs); fix: the worker now loads FlowExtract so the repeating To Do actually repeats | core/extract.js src/background.js  |
| 440861a4 | 2026-10-21 | AI engine: the device reads first, Glance cloud only masked and capped, every close the model finds gets a plan and is carried until closed (M1–M5,  | core/README.md core/model-plan.js core/understanding-device.js core/understanding-router.js  |
| 4b41ac76 | 2026-10-21 | A repeat on the live Outlook meeting Hold It behind glanceSwitches.RECURRING_HOLD (off): series master read back for exactly the rule or deleted, Undo | src/background.js  |
| d5f6c25b | 2026-10-21 | Connector Dropbox: the file is saved, read back by content hash (#182) | core/README.md core/connectors.js core/consent-catalog.js core/dropbox-close.js  |
| aa28fc85 | 2026-10-21 | Connectors: Notion, Asana, Jira, Linear and DocuSign (read-only), all behind off switches (#177) | core/README.md core/asana-close.js core/connector-outcome.js core/connectors.js  |
| 1d7245d9 | 2026-10-21 | A repeat on the live Gmail Hold It behind glanceSwitches.RECURRING_HOLD (off): one stated rule the hold date fits creates the series, master read back | core/README.md core/recurring-reminder.js src/google-lane-host.js  |
| 86eb19d5 | 2026-10-21 | Teams link on an existing Outlook event: 'add a Teams link to the Thursday sync' turns on the Teams meeting of the one event you organize, read back b | core/README.md core/event-call-link.js core/outlook-event-call-link.js  |
| 5c87e4a0 | 2026-10-21 | Meet link on an existing event: 'add a Meet link to the Thursday sync' patches only the conference on the one event you organize, read back by id, Und | core/README.md core/event-call-link.js  |
| fd51137b | 2026-10-21 | Repeating To Do task on the existing Outlook To Do card behind glanceSwitches.RECURRING_TODO (off): rule read back, Undo treats the repeat rule as the | core/README.md core/todo-recurrence.js src/background.js src/native-edit.js  |
| 50b32348 | 2026-10-21 | Recurring reminder: a repeating commitment with one rule and one clock becomes a recurring Calendar reminder, no guest, read back by id, Undo refuses  | core/README.md core/recurring-reminder.js  |
| b96a7657 | 2026-10-21 | Meet link on the live Gmail Hold It behind glanceSwitches.MEET_LINK (off): link read back by id, event deleted when none shows, hold module untouched | core/README.md core/meet-link.js src/content-gmail.js src/google-lane-host.js  |
| cc5cb4ba | 2026-10-21 | Slides deck from a request: 'create a slide deck called X' becomes an empty Google Slides deck, read back by id, Undo refuses after an edit; names con | core/README.md core/workspace-file.js  |
| bfed11f1 | 2026-10-21 | Teams link on the live Outlook Hold It behind glanceSwitches.TEAMS_MEETING (off): link read back by id, event deleted when none shows, Undo no longer  | core/teams-meeting.js src/background.js src/content-outlook.js src/native-edit.js  |
| 558075f8 | 2026-10-21 | Planner task: 'add the task X to the Y plan' becomes a Planner task in that plan with no assignee, read back by id, Undo refuses after an edit (switch | core/README.md core/planner-task.js  |
| aefb365a | 2026-10-20 | Word or Excel from a request: 'create a Word document called X' becomes an empty .docx or .xlsx in OneDrive > Glance, never replacing, read back by id | core/README.md core/onedrive-new-file.js  |
| 3e8276a6 | 2026-10-20 | Doc or Sheet from a request: 'create a shared doc called X' becomes an empty Google Doc or Sheet, read back by id, Undo refuses after an edit (switch  | core/README.md core/workspace-file.js  |
| 6ed3bf12 | 2026-10-20 | Teams meeting link on a hold: a call proposed in Outlook mail becomes a calendar event with a real Teams join link, read back by id, Undo refuses afte | core/README.md core/teams-meeting.js  |
| b0b0df37 | 2026-10-20 | Meet link on a hold: a proposed video call becomes a calendar event with a real Meet link, read back, Undo refuses after an edit (switch off) | core/README.md core/meet-link.js  |
| ecc9e19b | 2026-10-20 | Slot ask: a bare 'that' or 'then' is not a time, so a hypothetical stays silent | core/judgment.js  |
| 94993fa5 | 2026-10-20 | Slot ask: a statement that names a day keeps the event path, calling someone else and deadlines are not an ask for a time | core/incoming-judge.js core/intent.js core/judgment.js  |
| 986c4490 | 2026-10-20 | Every way of asking for a time is a request: structural detector plus listed constructs, English and Hebrew | core/draft-reply.js core/incoming-judge.js core/intent.js core/judgment.js  |
| 37f221ba | 2026-10-20 | Breadth C5: please confirm you'll attend answers the one invite on your calendar, your choice, proved (switch off) (#174) | core/README.md core/rsvp.js  |
| fe6b116a | 2026-10-20 | Breadth D4: log the amount in the payments sheet adds that row and proves it (switch off) (#135) | core/README.md core/sheet-row.js  |
| 4663f624 | 2026-10-20 | A work-product request is its own pattern, so the quoted sentence and the create-when-missing silence stay as they were; log the ecosystems routine | core/intent.js core/judgment.js  |
| f27e1e1a | 2026-10-20 | A request to make a document, spreadsheet, report or summary is a request | core/judgment.js  |
| 24bec5cd | 2026-10-20 | Peek card on Outlook too; Graphify merge driver attribute | src/content-outlook.js  |
| fb14ca25 | 2026-10-20 | Breadth F2: the file they asked for, found in your OneDrive and attached to the reply (switch off) (#133) | core/README.md core/onedrive-find.js  |
