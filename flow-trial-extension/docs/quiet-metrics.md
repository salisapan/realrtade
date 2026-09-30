# Local quiet metrics

Two readouts, on this device only (`chrome.storage.local`). No cloud
analytics. The fold is `core/quiet-metrics.js`.
`FlowStorage.recordCloseQuality` updates trusted closes when it already
records a full write or an Undo. `FlowStorage.recordSilence` records a
silence decision. The Activity tab shows a line when either count is
above zero. The Morning Brief stays the list of closes still open.

## Trusted closes / week

A **trusted close** is one message that went Do It → real write → Handled, and was not Undone.

| Step | What counts |
|---|---|
| Do It | The click that runs the close. A chip that was only shown does not. |
| Real write | Every step the chip proposed returned ok. Same test as `FlowCloseQuality.isFullWrite`. |
| Handled | The receipt status for that full write (`FlowReceipt` "Handled." / "טופל."). "Partly handled." is not a trusted close. |
| No Undo | That message was not later undone. An Undo drops it out of the trusted count. It stays in the week's handled count, and the Undo count goes up by one. |

**This week** is the local `YYYY-Wnn` bucket from `weekKey` — the same bucket as the habit metric in `core/pmf-metrics.js`, not an ISO week. The write's timestamp picks the week. An Undo in a later week corrects the week of the write.

The Activity line is `Trusted closes N this week · Undo U`. Undo 0 means none. A small U is the "low Undo" reading. The rate `U / handled` is on the snapshot (`undoRate`) and is null until a full write exists. Nothing here treats an undone write as trusted.

## Silence quality

A **silence decision** is Glance choosing not to show a chip, once per message. A mail the scorer never named is not one of these (that stays the classification miss counter). Dismissing a chip that did show is a false-Do-It, not silence.

Stored fields are a message id, a timestamp, and one reason code. No subject, sender, or body.

| Code | Decision |
|---|---|
| `noise` | Judgment noise: newsletter, pitch, FYI, calendar boilerplate, automated mail. |
| `hedge` | Soft ask, hedge, negation, contingent ("once", "hoping"), or already settled / past. |
| `family` | Close-families A–J refused the mail: two targets, a retraction, a cancel with no new slot, or the same kind of veto. |
| `low` | Trust bar: a follow-up was classified at confidence `low`. The chip stays off. |
| `google` | A Drive, Doc, or Sheet close chose silence (no single file, no template, unclear artifact). |
| `calibrated` | This account's dismiss / Undo history suppressed that intent type. |
| `memory` | Personal close memory: this matter is already fully closed. |
| `file` | Find-and-attach: not one clear file. |
| `fact` | Reply-with-facts: not one cell or one paragraph. |

The Activity line prefers this week's mix (`Silence this week N · hedge H · …`). If this week has none yet, it shows the all-time mix without the words "this week". Reasons with a zero count are omitted. The silence bar itself is unchanged; these codes only name a decision the chip path already made.

Week buckets keep 16 weeks. The id list keeps 300 messages so an Undo can find the week of that write. Silence totals do not shrink when an id ages out. A message id is rejected when it is empty, longer than 128 characters, or contains whitespace, so a body cannot be stored as an id.
