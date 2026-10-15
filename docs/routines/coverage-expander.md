# Coverage expander

Glance closes open loops. Gmail is where it starts today.

Product definition (vision-locked): unchanged. A loop closes on a read-back or a deliberate release. Glance does not send.

Current implementation status: one new close, unwired. `MEETING_HOLD` defaults off. No worker, manifest, or privacy change.

## 2026-10-15

Skipped E2 (commitment / promise) until the CTO confirms detection PR A is merged. Did not touch those files.

Open PRs already own the next files, so they were not rewritten: E6 `suggest-save.js` (#144), C4 / file-on-calendar `google-calendar.js` (#146), D4 `sheet-row.js` (#135), F2 `onedrive-find.js` (#133), U2 `local-file.js` (#127), M2 `chat-answer.js` (#122), M3 chat drafts (#147), M5 `teams-chat.js` (#148).

Picked close-map **C1** (score 240), the highest ranked gap with no open PR on a new file. Before: the worker's calendar create returns the POST id and does not GET it, so this corpus had **0** proofs with `fetchedBack`. After: **7/7** clear clocks prove a hold, **27/27** non-asks stay silent, **0** wrong offers. Guests stay empty. `sendUpdates=none`. Undo deletes only an unchanged event.

Checks: `node flow-trial-extension/test/meeting-hold-corpus.cjs` (0 failures). Needs Sali: a live Gate before the switch is turned on. Do not merge from this routine.
