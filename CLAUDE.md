## Product identity — LOCKED. Read before describing Glance anywhere (a report, a blurb, a commit, a reply)

<!-- LOCKED-IDENTITY:START -->
**Glance closes open loops. Gmail is where it starts today.** Glance is a system for unfinished intentions: what you asked someone for, what you promised, what someone asked of you. Its loop is **detect → carry → execute → true close**. It starts in Gmail, the current primary entry surface, and executes through the places a close really happens (Google Tasks, Gmail drafts and Drive today; more surfaces later, only ever in service of closure). It stays silent when it is uncertain, never sends on your behalf, treats preparation as not completion, and counts a loop closed only on real completion or a deliberate release. Flow, the enterprise product, is separate.
<!-- LOCKED-IDENTITY:END -->

**Standing constraints.** Glance is not only a Gmail add-on (Gmail is the entry surface). Glance is not an AI email product (AI is under the hood; outcomes are what we sell). Pro is the personal depth
layer, not team or enterprise (that is Flow). Waiting or tracking alone is not success; true close is. Free must stay genuinely useful, never a dead demo. Zero-Prompt is sacred. Multi-platform means
execution across the surfaces where a close really happens, in service of closure: never a connector marketplace, inbox-zero or integrations for their own sake. Do not describe Glance as "a Chrome
extension for Gmail", "an AI email assistant" or "a smart inbox", and never describe tracking or a prepared draft as completion. Full rules, required framing and before/after examples: `docs/product-identity.md`.

**Every report keeps two parts apart.** *Product definition (vision-locked)*: the block above, unchanged by what the code does today. *Current implementation status (code reality)*: what ships in this
commit, stated as status. "It is a Chrome extension on Gmail" belongs in the second part only. Any description of Glance starts: "Glance closes open loops. Gmail is where it starts today."

## Owner product locks (2026-10-06 to 2026-10-08) — scope around the locked block

Owner decisions, recorded here as the one source. The block above stays as written until the owner changes it in `docs/product-identity.md`. Build state and order: `docs/open-tasks.md` ("Glance release order").

- **Glance** is the personal product: a floating Chrome extension that follows the person across every platform, plus the local computer layer (local documents). It is not a standalone website. Glance's own model runs on Glance cloud.
- **Flow** is the org product. It is deployed on the customer's own server (EDGE) or on our cloud.
- **ProofOfClose.** A task is closed only with `{system, externalId, fetchedBack, verifiedAt}`, plus remount and Undo (`docs/true-close.md` §7).
- **One consent screen** (Instinct-style): Select all plus one checkbox per service. Google, and full Microsoft: Outlook, Calendar, OneDrive, To Do, Contacts, Teams, Word/Excel.
- **Mail.Send** is approved with a preview and a one-click approve. It never auto-sends. Not built yet: it comes after the steps list, as that list's preview. Until it ships, the code never asks `Mail.Send`. The block's "never sends on your behalf" changes only with the owner's wording in `docs/product-identity.md`.
- **Next after Mail.Send: intent on any site.** Example: a friend asks on WhatsApp Web for last week's restaurant. Glance finds it in connected sources and drafts the reply. The person approves the send.
- **Attachment save** (owner, 2026-10-08): Glance offers to save an email's attached document to OneDrive (Outlook) or Drive (Gmail), even when the body does not ask. It is a suggestion the person approves, never automatic.
- **Broad, does everything** (owner, 2026-10-08): «חייב להיות פה הרבה מעבר לשמירה בדרייב והוספה למשימות... המוצר חייב להיות הרבה יותר הוליסטי» (11:25). «אם המוצר לא יודע לעשות הכל הוא לא שווה כלום!» (11:26). «זה כלל. הוא חייב להיות רחב ולעשות הכל!» (12:16). A user's intent, wherever the user is (the floating extension on any site, plus the user's own computer), is closed end to end and proven.
- **On HOLD until the owner writes «מאשר»:** Morning (invoices) and Netlify deploy.

## Start here — the map of every document

`docs/README.md` is the reading order and the update map: which document owns which topic, the code and tests behind it, and which files to update in the same commit when something changes
(an allowance, a price, what leaves the device, a switch, a new `core/` module, a rule on closing a loop). `test/docs-consistency-corpus.cjs` fails when the map and the code disagree.

## Open tasks file — keep it current

`docs/open-tasks.md` is the running list of open tasks, blockers, decisions and
their status. Whenever a task, blocker, owner action or decision comes up in
conversation, add it there; when one is finished or changes status, update it in
the same turn, and refresh the "Last updated" date. Link the ClickUp task when one exists.

## Product facts and release order

A change that moves a product fact or the release order updates the truth file that owns it (`CLAUDE.md`, `docs/open-tasks.md`, or the topic document) in the same change, and adds one short, plain, dated line to `docs/vault/decisions.md`: what shipped or changed, the version, and the Gate result when there is one.

Current package is **0.9.48**, on top of 0.9.47. This build keeps the steps list and the suggest-save card titled `Save the file?`. An Outlook file links only after a whole-mailbox query and one confirming signal, and a conversation id, an internet id, or a clock that disagrees outweighs a matching filename. Above the ceiling, a failed attachment read, or an empty chip with no id stays `suggest:unresolved`. A different file is never saved. An unmarked hour of 1–12 links only when just one of that hour and its other half is in the set (12 is noon or midnight the same local day), or when the mailbox is 24-hour (`HH:mm`, hour cycle h23, or an unmarked hour of 13 or more, or 00, on an OWA list row or the reading-pane header). A time inside the email body does not prove 24-hour time. A one-digit hour with no marker stays unresolved. Hebrew AM/PM markers stay. A OneDrive save while Microsoft is connected uses the Graph message id, shows `Verifying…`, and says Handled only when `fetchedBack` is true. Approve close on that miss runs the confirm again. When Outlook is not connected, or OneDrive is not allowed, the card says so and does not offer a Retry that cannot confirm. The header says Outlook connected when Outlook is on, and still says Google connected when Google is. A save card can be offered when the address is only in Graph and the conversation id or the subject is on the page. A file receipt stays on the message whose file it names. A To line Graph can read still drafts, and a Cc-only ask stays quiet. An undone promise reopens one Do It on that mail. Loops shows Suggested and Added as section headings. A clean parking-permit renew with a deadline stays a request. A mass-mail footer stays quiet. A write that is still verifying stays on the open list as `Verifying…` or `מאמת`, with no Do It. No new scope and no new permission. Mail.Send is not built. Gate for this package: not run live. The headless mirror is `flow-trial-extension/e2e/gate-0947.spec.js`.

## Product architecture — read before touching pricing, positioning, or feature scope

Flow Trial (Free + Pro) and Flow (the core product) are **two separate
products for two separate audiences** — not one product on a pricing
ladder. Full detail, including what each tier may and may not claim, is in
`docs/product-architecture.md`. Read it before editing `pricing.html`,
`trial.html`'s positioning, or any copy that could imply the two products
share security/compliance guarantees.

## Glance/Flow code architecture — read before adding logic to the extension

Inside `flow-trial-extension/`, `core/` and `src/` are a deliberate product
boundary, not a folder preference: `core/` is portable business logic
(intention classification, process planning, Execution Memory, precision/harm
calibration, document read/write) with zero `chrome.*`/`document`/`window`
reference, meant to outlive Glance's Chrome-extension packaging and one day
serve a separate enterprise Flow runtime unchanged. `src/` is everything that
makes Glance's current entry surface a Chrome extension talking to Gmail (persistence,
injected UI, the service worker): implementation status, not the product definition above. Full contract, the adapter pattern for
giving a core module storage without coupling it to `chrome.storage.local`,
and a decision guide for where new code belongs are in
`flow-trial-extension/core/README.md` — read it before adding any new module
to either directory, and route new logic there rather than mixing it into
whichever file is already open.

## Design & UX review principles — read before any UI, copy, or flow change

Twelve standing review criteria distilled from the product owner's live
feedback across the site, in `docs/design-principles.md`: total design
consistency (every primary CTA is the canonical Do It component), zero gap
between promise and reality, friction as the enemy, logical experience
ordering, visual bugs as always-urgent blockers, and seven more derived
from repeated instances of the same defect surviving in one place after
being fixed in another. Apply these to every change, and when a fix
reveals the same pattern elsewhere in the codebase, fix all instances in
the same pass rather than waiting to be asked about each one.

## The decision filter — apply before building anything non-trivial

There is one enforced decision filter, run at two levels. Start with
`docs/product-architecture.md` §5.8 — the product owner's own five-question
checklist ("You intend — we execute," feeling of closure, precision and
silence, Zero-Prompt, compounding value) — for every significant decision
and new piece of work. When an answer there is genuinely ambiguous, or a
"no" needs explaining rather than just asserting, drop down to
`docs/decision-filter.md`, the detailed reference underneath it: one
grounded question (does this strengthen our ability to become the most
reliable system in the world at turning intention into closed execution?)
with "intention," "execution," "closed," and "reliable" mapped onto actual
code (`core/intent.js`, `background.js`'s connectors,
`core/pmf-metrics.js`'s strict closure-rate definition, `judgment.js`'s
precision-over-recall bias) and an explicit table showing how its four
terms cover all five of §5.8's questions. Read whichever level you need
before proposing new features, new data paths, or new UI surfaces — not
just once.

## Local-first recognition — the base rule, apply to everything

Our own code recognises requests, promises, answers and tasks BEFORE any
external model is involved, and no feature may depend on a model to work. Build
recognition as data (lexicons, frames) in `flow-trial-extension/core/`, with
corpus tests, and stay silent when unsure. A model is an optional, masked,
last resort (Free with an allowance, Pro with more: `docs/ai-ladder.md`) that never closes or writes anything alone. Full rule:
`docs/local-first-principle.md`.

## Product identity — AI is the engine, closure is the product

Glance is not sold or worded as "an AI email product" or as "a Gmail extension". Copy on any Glance
surface talks about loops that are open, chased, yours or closed, and money at
risk, never about cleverness. `docs/product-identity.md` has the rule and the
list of phrases a Glance surface may not use (enforced by
`flow-trial-extension/test/identity-copy-corpus.cjs`).

## The Magic Moment — read before touching onboarding or first-use copy

`docs/magic-moment.md` defines, in concrete product terms, the first
instant a new user realizes Glance actually closed something real for them
without being managed — the first successful Do It, not the first chip
shown or onboarding completing. Read it before changing onboarding flow,
the first-run experience, or the receipt/closure copy in
`flow-trial-extension/src/content-gmail.js`.

## ECC Agent Routing Protocol

For every task requested by the user:

1. Check the ECC agents index at `.claude/ecc-agents/INDEX.md` (table of all 68
   agents) and the full checklist text under `.claude/ecc-agents/full/<name>.md`.
2. Automatically select and assume the role/guidelines of the best-suited ECC
   agent (e.g. `planner`, `code-reviewer`, `security-reviewer`, `tdd-guide`,
   `architect`, a language-specific `*-reviewer`/`*-build-resolver`, etc.),
   matching the task against each agent's `description` field in the index.
3. State in 1 sentence at the start of the response which agent persona is
   active and why, then execute the task.

**Note on what this actually is:** the `ecc@ecc` plugin has not been observed
to materialize as real Claude Code subagents in any session on this project
(`~/.claude/plugins/installed_plugins.json` has come back empty every time it
was checked). So step 2 means reading the selected agent's checklist and
following it in the current context — not spawning an isolated subagent with
its own fresh context window. For a task where fresh-eyes review is the point
(most notably `code-reviewer` and `security-reviewer` catching what the
implementer was blind to), prefer explicitly spawning a `general-purpose`
Agent primed with that agent file's full contents instead of self-adopting
the persona inline.

## The local intent engine — read before touching recognition

`docs/intent-model.md` describes the on-device recognition stack (lexicon tier, learned model, pipeline), how it is measured and what the numbers do not prove. Retrain with `node scripts/train-intent-model.cjs` after changing `scripts/intent/generate.cjs` or the features; `flow-trial-extension/test/intent-model-corpus.cjs` enforces the precision and recall gates. Never lower a precision gate to raise recall. The one external step on this path is the owner-approved "deeper read" (`docs/ai-ladder.md`: one masked sentence, two askings, Free allowance and Pro allowance counted on the server, a proposal only, off until the owner measures it with `scripts/ai-ladder/eval.cjs`); do not add any other external model call to recognition, and never widen that one without the same measurement and a privacy-page change in the same commit. How a loop earns a true close and why a short reply is held open: `docs/true-close.md`.

How the engine learns (teacher data, per-person timing, labels from outcomes, an on-device language-model tier, the learning ledger, the one active question, voice-matched drafts, closes from outside the thread), how it is measured, and what the numbers do not prove: `docs/ai-engine-upgrade.md`. Numbers on real mail, and every disclosure about them: `docs/human-eval.md`. How a reply is judged to finish a request (and why a model may only hold a loop open): `docs/reply-model.md`. Other apps (WhatsApp Web, right-click capture, Outlook through Graph), the identity graph and cross-app closing: `docs/multi-platform.md` — read it before adding a surface; every surface is opt-in and stricter than Gmail; surfaces are read-only except the Outlook reply draft created on the person's Do It (owner decision 2026-10-05; never sending), and a surface change updates the privacy page and store permissions in the same commit. The private human-text sentences are gitignored and must never be committed.
Community (cross-user) learning is built but DORMANT and its on-device wiring is deliberately not built: read `docs/community-learning.md` before touching it, and never switch it on without the privacy copy changing in the same commit.

Requests that take more than one step (starting with "send me the receipt"): `docs/resolution-paths.md` — define "done", find an existing artifact, verify the precondition (the payment), prepare or ask the one who issues it, and close ONLY when a message the person sent carries a real attachment. Glance never sends, issues or generates a receipt; that needs a billing connector that does not exist yet. Read it before adding a new multi-step class or letting any step close a loop.

What Glance calls when it cannot recognise an intent (no external model by default; the server router; the owner's open decision): `docs/when-recognition-fails.md`. A model on the person's own computer (Ollama, LM Studio) as tier 2, loopback-only and gated by the same precision self-test: `docs/local-model-server.md` — never let a non-loopback address through, and never let it close or write anything.

## Hybrid execution (device model, masked server fallback, strict JSON) — dormant, read before touching

`docs/hybrid-execution-architecture.md`: the owner's three-tier plan for Do It / Draft It, what is built and tested, what is deliberately not claimed (no compliance or regulated-industry wording: `docs/product-architecture.md`), and the ordered activation checklist. Nothing in it is wired into the manifest, `background.js` or the content scripts yet; the server is never used without a one-time consent and only with masked text; a model's answer is a proposal and never closes or writes anything.

## Testing and the live Gate

Headless regression for the unpacked extension runs in CI on pull requests into `claude/install-uiux-pro-max-skill-a4agox` (`.github/workflows/glance-e2e.yml`, suite under `flow-trial-extension/e2e/`). It runs before the owner's live browser Gate. The live Gate stays; this suite does not replace it. The command and what "the tests pass" means: `docs/README.md` §4. Status: `docs/open-tasks.md` row 56.

