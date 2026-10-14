# Local close quality

Three counts, on this device only (`chrome.storage.local`). No cloud
analytics, no org dashboard. The fold is `core/close-quality-metrics.js`.
`FlowStorage.recordCloseQuality` / `getCloseQualitySnapshot` persist and
read it. The Activity tab shows the line when any count is above zero.

| Event | Definition |
|---|---|
| **success** | A Trusted Do It close that fully wrote. Every step the chip proposed returned ok. A partial write is not a success. On current main the receipt can still say "Handled." for a partial; this count follows the full write, not that string. |
| **return** | The user used Do It again on a later local calendar day (`Date#toDateString()`). Using Do It means the click that starts a close, after the already-closed and empty-step guards. The first Do It is not a return. More than one Do It on the same day counts once. |
| **false-Do-It** | The user rejected the chip: they dismissed it, or they undid a write that had landed. Once per message. A full write that is later undone counts as both a success and a false-Do-It. Undoing a **prepared Outlook reply draft** is not a false-Do-It (and not a Still Open false-close): that draft is not a trusted close. |

The Activity line reads `Full closes N · Returns N · Turned down N · False-close P%`.

Trusted closes per week and silence-by-reason are a separate fold (`docs/quiet-metrics.md`). A full write here is the same Handled event that fold counts, and an Undo here is the same Undo that removes it from the trusted count.

**False-close rate** is turned-down messages ÷ messages the user actually judged. Judged means a full write or a dismiss/undo. A full write that is later undone counts once, as false. The week-1 bar is 15% (`FALSE_CLOSE_BAR`). The rate is null until something has been judged. Dismiss and undo are the only reject reasons; both already flow through `recordCloseQuality`. No other surface reads the rate.
