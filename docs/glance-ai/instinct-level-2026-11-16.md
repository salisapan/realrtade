# Instinct-level: sees what matters without setup, proposes the steps, does the work (2026-11-16)

Owner, 2026-11-16 (a screenshot of Instinct's WhatsApp business chat): Instinct always sees what is important without being configured, proposes steps to solve it, and does it on its own computer. Bring Glance to that level, on top of everything built in Glance's own model.

**Product definition (vision-locked):** Glance closes open loops. Gmail is where it starts today. Its loop is detect, carry, execute, true close; it stays silent when unsure, never sends for the person, treats a draft as unfinished, and counts a loop closed only on real completion (ProofOfClose, `fetchedBack`) or a deliberate release. Glance is an Intent Closer, not an assistant; this page borrows Instinct's bar, not its description.
**Current implementation status (code reality):** measured below on this commit. Nothing on this page turns a switch on, adds a scope or changes public copy.

## 1. What Instinct is, from what the repo and the owner say

A chat-and-phone errand service (`docs/glance-ai/holistic-close-map.md`, competitor row: "It works from chat and phone"; close map rows M2 and X2: the answer in the chat, found in connected sources, sent only after approval). The three properties the owner names: it **sees** what is important with no setup, it **proposes steps**, and it **does** them on a computer of its own. Glance already took its consent style (one screen, select all, one checkbox per service) and its day-one onboarding (role and department).

## 2. The bar, as three measurable properties

| # | Property | How it is measured | Today |
|---|---|---|---|
| P1 | **Sees without setup**: what matters is offered with no switch turned on | recall on the held-out kind sets with every Labs switch OFF (`GLANCE_SHIPPED=1`), with zero wrong Do It | **27% (24 of 89, 95% 19 to 37%) on kind set v0 and 21% (15 of 70, 13 to 32%) on v1**; with every switch ON 75% (67 of 89) and 77% (54 of 70); 0 wrong Do It either way |
| P2 | **Proposes the right steps**: the card names the work, the day, the clock and the amount that will be written | the slot gold (`glance-ai/labeling/slot-gold/`): slots right among offered rows, and rows offered at all | all on: 40 of 40 offered, 0 wrong slot; **as shipped: 26 of 40 offered, 0 wrong slot after this commit (3 of the 26 used to carry a title that names nothing: «Reply requested by Oct 8»)** |
| P3 | **Does the work, proven**: a close exists for the kind, is written, read back and undoable, on the surface the person is on | the close map (62 kinds) and the writers with ProofOfClose | 3 kinds live, 34 partial, 4 quiet, 21 none; the person's own computer is a scaffold for one fixture page; the chat answer from connected sources (M2) does not exist |

## 3. The finding: the product reads far more than it shows

`scoreboard/capabilities/switch-readiness.cjs` lists every Labs row (`core/labs-switches.js`): **26 closes the engine can already read are off until the person turns them on; 0 have a recorded live Gate; 12 have a held-out set; 22 have a headless e2e.** The distance to "sees without setup" is mostly not recognition (75% to 77% with the switches on) but that the readers ship dark, behind the live Gate the owner's lock requires. The CLAUDE.md lock says every integrated product is on by default after one consent; the code ships them off until a Gate passes.

Two real defects the as-shipped reading found and that are fixed in the same commit: a mail that says «I sent the quote on Monday. Please confirm you received it by Thursday» was filed on the Monday the quote was sent (a past action with a day is not the close's day; `core/extract.js`), and the default reply card's task was titled by its date, not by the work (fixed in this commit for an English ask with a plain verb and object: «Send the updated budget», «Pay the $1,200 invoice»; the title written to Google Tasks, `googleTaskTitle` in `src/background.js`; Hebrew asks too: «לשלוח את ההסכם החתום», «להכין את המצגת הסופית»).

## 4. What does the work today, and what does not

- **Writes with proof and Undo (API, no computer needed):** Google Tasks and Microsoft To Do, Calendar holds and meeting links, Drive and OneDrive saves, new Docs, Sheets, Slides, Word and Excel files, a Sheet row, reply drafts (never sent). These cover the daily errands.
- **The person's own computer:** `docs/computer-proof-gate.md` is a scaffold for one allowlisted fixture page (`computer/example.com`); the live page driver is not wired, and `computer/local/<app>` (a close against a local file) is a later gate. This is the part of Instinct's «does it on its computer» that Glance does not have.
- **Chat as a front door:** the WhatsApp Web, Messenger and Instagram cards read a one-to-one chat and offer a task or a hold (38 of 38 on the chat probe), behind off switches; M2 (find the answer in Calendar, mail or Drive, draft it in the chat, the person approves and sends) is not built.

## 5. Build order, each step with its own acceptance test

1. **Sight without setup (P1).** Rank the 26 rows by value and risk and ask the owner to turn on, per wave, the ones whose close is a task or a hold with Undo. Wave 1: TASK_ASK, PAYMENT_ASK (a task «Pay X», never a payment), BOOKING_NOTICE, SYSTEM_NOTICE, CALENDAR_CHANGE. Evidence pack per row before the ask: held-out set with 0 wrong Do It, a headless e2e in a real browser, the Gate script for the owner. Acceptance: shipped-config recall on the kind sets reaches the all-on figure, 0 wrong Do It, and the live Gate is recorded. **Done 2026-11-16 on the owner's «תדליק»: the wave is TASK_ASK, PAYMENT_ASK, BOOKING_NOTICE and SYSTEM_NOTICE, ON in a non-store install (`core/labs-seed.js`, `test/labs-seed-corpus.cjs`); CALENDAR_CHANGE was held back because its writer has no read-back yet. The live Gate on these four is the owner's step and is not run.**
2. **Steps that name the work (P2).** English done in this commit (`FlowCommitmentTitle.askTitleFromBody`: a plain verb plus object from the ask, nothing guessed; slot gold as shipped 0 of 26 wrong). Hebrew done too (an infinitive after «תוכל/נא/בבקשה», or the bare imperative «תכין», «תשלח»). Next: the asks the verb list does not carry, then the 14 rows the default product does not offer at all (they are the dark readers of step 1).
3. **Plan quality as a measured thing.** A held-out set of mails with the gold list of steps (which close, in which order, with which slot), scored on the steps, not on the family. Acceptance: step-list exact match and wrong-step rate with intervals, per surface.
4. **Execute on the computer (P3), in three gated stages, each with ProofOfClose and Undo and never sending:** (a) wire the page driver for the allowlisted fixture page and prove it in a real browser (now possible in this lab: the Playwright path is fixed); (b) `computer/local/<app>`: read a local file, save a copy to the person's OneDrive or Drive, then the mail or chat close; (c) an errand: Glance finds the thing in the connected sources and drafts the answer in the chat, the person approves. Each stage's host list, scope and consent text is a manifest and privacy decision.
5. **Chat as a first-class front door.** M2 and the same cards on the phone (the Gmail add-on, then Safari iOS), with the importance ranking: what is waiting on someone, what money is at risk, what is due today first.

## 6. What changed in this commit

- `scoreboard/capabilities/switch-readiness.cjs`, `kinds`-style table of the 26 Labs rows (`switch-readiness.md`).
- `GLANCE_SHIPPED=1` for `union.cjs`: reads the product as it ships (every switch off); `test/kind-frozen-corpus.cjs` ratchets it (no wrong Do It, recall may not fall).
- `core/extract.js`: a past action with a day («I sent the quote on Monday») is not the close's day.
- `core/commitment-title.js`, `src/background.js`: an ask with a plain verb and object titles its task by the work, not by its date; `test/commitment-title-corpus.cjs`, and `test/slot-gold-corpus.cjs` ratchets the as-shipped slots (0 wrong). A first version of the title cut «$1,200» to «$1» at the comma; the as-shipped slot run caught it before it shipped.
- Not done on purpose: any switch turned on, any manifest host or scope, any public copy; the computer driver (it needs the stage-4a decision).

## 7. Honest limits

The sets are small and hand-written; they say where the engine is silent or wrong on shapes someone thought of, not how often. «Instinct-level» is the owner's bar, not a measured comparison with Instinct, which this lab cannot run. No live Gate has been run.
