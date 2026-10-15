# Close oracle

Glance closes open loops. Gmail is where it starts today.

## 2026-10-15

Close verification (`ProofOfClose` / `fetchedBack`).

Before this run, an `ok: true` write with no read-back counted as Handled for 4 of 4 Calendar and Drive kinds (`calendar`, `driveDoc`, `driveSheet`, `driveFile`). A Calendar create, move, or cancel could report success from the write response. A Drive upload could report success from the upload body.

After this run, 0 of those 4 kinds count as Handled without `fetchedBack`. A Calendar create or move is Handled when a later GET returns the same event id, the start that was written, and a status other than cancelled. A cancel is Handled when that GET is 404, 410, or cancelled. A Drive file is Handled when a later GET returns the same file id and the file is not trashed. A miss is `verify_failed`.

Regression tests: `flow-trial-extension/test/proof-of-close-corpus.cjs` and `flow-trial-extension/test/background-write-corpus.cjs`.

Still open: a Gmail draft with `ok: true` and no read-back still counts as the draft that was prepared. The chip has no separate prepared state, so this run left that path alone.
