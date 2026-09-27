# Local close quality

Three counts, on this device only (`chrome.storage.local`). No cloud
analytics, no org dashboard. The fold is `core/close-quality-metrics.js`.
`FlowStorage.recordCloseQuality` / `getCloseQualitySnapshot` persist and
read it. The Activity tab shows the line when any count is above zero.

| Event | Definition |
|---|---|
| **success** | A Trusted Do It close that fully wrote. Every step the chip proposed returned ok. A partial write is not a success. On current main the receipt can still say "Handled." for a partial; this count follows the full write, not that string. |
| **return** | The user used Do It again on a later local calendar day (`Date#toDateString()`). Using Do It means the click that starts a close, after the already-closed and empty-step guards. The first Do It is not a return. More than one Do It on the same day counts once. |
| **false-Do-It** | The user rejected the chip: they dismissed it, or they undid a write that had landed. Once per message. A full write that is later undone counts as both a success and a false-Do-It. |

The Activity line reads `Full closes N · Returns N · Turned down N`.
