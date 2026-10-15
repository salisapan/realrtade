# First-close factory

Short log of the first-session one-click close. Glance closes open loops. Gmail is where it starts today.

## 2026-10-15

Before: the setup panel had 0 one-click closes. Connect left a note to open an email. A Gmail Do It from that panel did not write the task.

After: 1 offer on the setup panel when the inbox already shows one high-confidence task (one step, read-back, undo, no send). 1 Do It click. A hedge and a two-step ask stay off the card. Window: 60000 ms from connect to the offer and to the close.

E2E: `flow-trial-extension/e2e/first-close.spec.js` passed on 2026-10-15. Measured from Connect: offer at 315 ms, Handled at 364 ms, budget 60000 ms. One task POST, one read-back GET, zero sends, then Undo DELETE.
