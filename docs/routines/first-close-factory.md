# First-close factory

Short log of the first-session one-click close. Glance closes open loops. Gmail is where it starts today.

## 2026-10-15

Before: the setup panel had 0 one-click closes. Connect left a note to open an email. A Gmail Do It from that panel did not write the task.

After: 1 offer on the setup panel when the inbox already shows one high-confidence task (one step, read-back, undo, no send). 1 Do It click. A hedge and a two-step ask stay off the card. Window: 60000 ms from connect to the offer and to the close.

E2E: `flow-trial-extension/e2e/first-close.spec.js` passed on 2026-10-15. Measured from Connect: offer at 315 ms, Handled at 364 ms, budget 60000 ms. One task POST, one read-back GET, zero sends, then Undo DELETE.

## 2026-10-18

Before: after merging the latest base, the first-close E2E failed at the first step (the popup now starts Hebrew). The offer card was English only: "One close", the hint, the why line, "Do It", "Handled.", "Undo". A Hebrew popup showed 22 Latin words on that one card.

After: the card follows the UI language through `FlowFirstClose.copy(lang)` (Hebrew: סגירה אחת, בצע, טופל., בטל, בוטל.). The why line is forced to the same language. The Hebrew card shows 0 Latin words (offer and receipt). Behaviour is unchanged: one safe task, read-back, Undo, nothing sent.

E2E: `flow-trial-extension/e2e/first-close.spec.js` runs in `he` and `en`, both passed on 2026-10-18. Measured from Connect: he offer 313 ms, Handled 386 ms; en offer 284 ms, Handled 337 ms; budget 60000 ms. One task POST, one read-back GET, zero sends, then Undo DELETE. Corpus: `test/first-close-corpus.cjs` adds language parity checks (same keys, no Latin in Hebrew, no Hebrew in English), 0 failures.

Not mine: `e2e/hebrew-ui-lint.spec.js` fails on the base tip too (it cannot find `#flow-brief-indicator-host`).
