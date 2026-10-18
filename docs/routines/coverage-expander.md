# Coverage expander

Glance closes open loops. Gmail is where it starts today.

Product definition (vision-locked): unchanged. A loop closes on a read-back or a deliberate release. Glance does not send.

Current implementation status: one new close, unwired. `MEETING_HOLD` defaults off. No worker, manifest, or privacy change.

## 2026-10-15

Skipped E2 (commitment / promise) until the CTO confirms detection PR A is merged. Did not touch those files.

Open PRs already own the next files, so they were not rewritten: E6 `suggest-save.js` (#144), C4 / file-on-calendar `google-calendar.js` (#146), D4 `sheet-row.js` (#135), F2 `onedrive-find.js` (#133), U2 `local-file.js` (#127), M2 `chat-answer.js` (#122), M3 chat drafts (#147), M5 `teams-chat.js` (#148).

Picked close-map **C1** (score 240), the highest ranked gap with no open PR on a new file. Before: the worker's calendar create returns the POST id and does not GET it, so this corpus had **0** proofs with `fetchedBack`. After: **7/7** clear clocks prove a hold, **27/27** non-asks stay silent, **0** wrong offers. Guests stay empty. `sendUpdates=none`. Undo deletes only an unchanged event.

Checks: `node flow-trial-extension/test/meeting-hold-corpus.cjs` (0 failures). Needs Sali: a live Gate before the switch is turned on. Do not merge from this routine.

## 2026-10-18

Skipped E2 (commitment / promise) again, same reason. Did not touch those files. Rebased onto the latest `claude/install-uiux-pro-max-skill-a4agox`.

Open PRs still own E6, D4, F2, U2, M2, M3, M5, the Y/F lanes in #153 and #155. C1 is this branch's own open PR (#152), so C2 is stacked on it as new files.

Picked close-map **C2** (move that meeting, score 144, partial). Before: family G detects only the two-clock move ("from Thursday 16:00 to Friday 11:00") and the worker PATCH carries no read-back. On the 8 clear moves in the new corpus the engine offered **3/8** and **0/8** carried `fetchedBack`. After: **8/8** offered, **8/8** proved by a GET after the PATCH, **36/36** non-asks silent, **0** wrong offers. The new close also handles a move named by day only, when exactly one meeting-like event is on that day.

Safe by construction: an event with guests, a recurring series, an event someone else organizes, a busy target slot, a past slot, and an event edited since the card all stay silent or stop. `sendUpdates=none`. A failed read-back puts the old time back. Undo restores the old time only while the event still reads as Glance left it.

Checks: `node flow-trial-extension/test/meeting-move-corpus.cjs` (0 failures). `MEETING_MOVE` defaults off and nothing in the worker calls it. Needs Sali: a live Gate before the switch is turned on. Do not merge from this routine.
