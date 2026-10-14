# Learning from use: how Glance's own model learns through the connectors

Glance closes open loops. Gmail is where it starts today. Glance is an AI product: its own model understands each intention and plans the close. This page is Glance (the personal product) only. Flow, the enterprise product, is separate: its learning of organizational knowledge stays inside the customer's own tenant, is never shared across customers, and is not governed by this page.

## OWNER DECISION 2026-10-13: «מאשר את כולם» (paths A, B, C approved to build; path D approved as a dormant specification)

The owner asked that the model learn through the connectors and draw conclusions relevant to the model, and that the first plan ("per-device personalisation only") was not enough. He approved the four paths below. They are binding for the connector builder and the model trainer routines.

A connector is the place where a close is PROVEN (`ProofOfClose`, `docs/true-close.md` §7). That makes every approved, edited or undone close an honest label, better than a rule written by a generator.

## Path A: the owner's own use becomes owner-verified labels (build first)

- **What.** When the owner uses Glance on his own accounts (his Gmail, Outlook, task systems and so on), each decision he makes on a proposed close is a label: approved = the proposed step was right; edited = the step was right in kind and wrong in detail (the edit is the correction); undone = wrong; ignored for N days = weak negative; Handled with `fetchedBack` = the close really happened.
- **Why it matters.** The promotion gate needs 200 owner-verified labels and the owner does not label by hand (decision 2026-10-11). Labels earned by his own actions are owner-verified by action.
- **Owner authorisation (explicit, 2026-10-13).** For `promote_gate.cjs` and `labeling/lib.cjs`: a label with `labeledBy: "sali:action"` and `source: "own-use"`, created from his own approve / edit / undo on his own accounts, counts toward the 200 `ownerVerified` rows. Handled counts only when `fetchedBack` is true. Ignored is a weak negative and does not count. It is a new, named source; it never makes a Claude, Cursor, chief-of-staff, CTO, or two-pass-agreement label owner-verified, and `labeledBy: "sali"` rules for hand labels are unchanged. The gate enforces that itself: `ownerVerified: true` counts only for `labeledBy: "sali"` or a qualifying `sali:action` row. A row without the connector's read-back proof does not qualify. `MIN_OWNER` stays 200.
- **Privacy.** The labelled text is the owner's own mail. It stays in `flow-trial-extension/test/fixtures/private/` (gitignored) or on his device. Only aggregate numbers go in `docs/human-eval.md`, as before. Nothing private is committed.
- **Capture.** An on-device export in the extension (off by default, a switch the owner turns on for himself) writes his decisions to a local file with the masked sentence, the proposed step, the decision and the proof. He chooses when to hand the file to the lab; nothing is uploaded automatically.

## Path B: train on closing plans that really finished

- **What.** From path A (and, later, from consenting users), take a request, the plan Glance proposed (the steps list), what the person kept, changed or removed, and whether the close was proven. These are examples of "which chain of steps", not only "act or stay silent".
- **How.** Add them to the SFT data builder as a new target: the plan plus the corrections. A step the person removed is a negative; an edit is the target. Build it in the Understanding format (`build_sft_v3_grounded.cjs`), every claim a quote, validated by the device exactly as in the extension. Score on a held-out slice of real plans, never on rows used for training.
- **Hold-out.** The newest decisions are never used for training in the run that labels them.

## Path C: per-user calibration inside the small model (on device)

- **What.** A small per-person layer on top of the shared small model: a threshold and a bias per close type and per language, adjusted online from that person's approvals and undos. A close type the person keeps undoing gets a higher threshold; one they always approve gets a lower one, never below the safety floor.
- **Floor unchanged.** An explicit intent span is still required, the hard quiets and the veto still win, a model's answer is still only a proposal, and Handled still needs `fetchedBack`. Calibration moves how readily Glance offers, never what it may do.
- **Where it lives.** In device storage next to `core/person-model.js` and `core/execution-memory.js`; resettable from the ledger ("what Glance learned from you"). Nothing leaves the device. Works with the model off (it then adjusts the rule thresholds).
- **Proof.** A corpus that replays a person's decisions and shows the next offers move in the right direction, with a test that the floor never moves.

## Path D: opt-in contribution to the shared model (specified, DORMANT)

- **What.** A person may choose to contribute to improving Glance's shared model without sending any text: the device computes feature statistics or a model update on its own data and sends only that, with noise added (federated learning with differential privacy), plus per-connector aggregate counts.
- **Status.** Specified only. Dormant. It is governed by `docs/community-learning.md`. It switches on only with the owner's «מאשר», one clear consent step (a checkbox in the one sweeping consent screen, off by default), and the privacy page and store text changed in the same commit.
- **Hard rules.** No text, no addresses, no titles, no identifiers leave the device. A contribution can be withdrawn. The server aggregates and cannot reverse a single person's data. It never auto-enables.
- **Deliverable now.** The design: what exactly is computed on device, the noise and the threshold for a minimum number of contributors, how a withdrawn contribution is handled, and a simulation on synthetic users that shows the shared model improves without any single user being recoverable. Code behind a switch that is off and a test that proves nothing is emitted when it is off.

## Level 1 hook every connector must emit (carry-over from `connectors-queue.md`)

One outcome event per decision, no text: `{connector, closeType, proposed, approved|edited|ignored, handled, undone, latencyMs, destinationSystem, lang, at}`. It feeds `core/outcome-labels.js`, `core/execution-memory.js`, `core/person-model.js` and `core/learning-ledger.js`, and is the raw material for paths A, B and C.

## Who does what

- **Connector builder routine:** emits the hook with each connector; builds path C (calibration) and the path D design as separate days' work after the foundation, one slice per run, behind switches.
- **Model trainer routine (Mon/Thu):** when path A labels exist on the lab machine, ingests them (never overwriting a hand label), adds path B plans to the SFT data, and reports numbers by source (owner-action, two-pass agreement, spec). It must not change the gate rules itself; the gate change for path A is its own reviewed PR.
- **Owner:** turns on his own capture switch, hands the lab the local file when he chooses, and approves path D's consent and privacy text when he is ready.

## Honest limits

- Labels from one person's use are few at the start and reflect one person's habits. They are the trustworthy base, not a large one. Report n every time.
- Calibration can be fooled by a few hasty clicks; it moves slowly and has a floor.
- Nothing here is live until it is built, tested and switched on by the owner. Today the model's learning from outcomes is limited to the on-device modules listed above.
