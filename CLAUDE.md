## Open tasks file — keep it current

`docs/open-tasks.md` is the running list of open tasks, blockers, decisions and
their status. Whenever a task, blocker, owner action or decision comes up in
conversation, add it there; when one is finished or changes status, update it in
the same turn, and refresh the "Last updated" date. Link the ClickUp task when one exists.

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
makes Glance specifically a Chrome extension talking to Gmail (persistence,
injected UI, the service worker). Full contract, the adapter pattern for
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
Pro-only last resort that never closes or writes anything alone. Full rule:
`docs/local-first-principle.md`.

## Product identity — AI is the engine, closure is the product

Glance is not sold or worded as "an AI email product". Copy on any Glance
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

`docs/intent-model.md` describes the on-device recognition stack (lexicon tier, learned model, pipeline), how it is measured and what the numbers do not prove. Retrain with `node scripts/train-intent-model.cjs` after changing `scripts/intent/generate.cjs` or the features; `flow-trial-extension/test/intent-model-corpus.cjs` enforces the precision and recall gates. Never lower a precision gate to raise recall, and never add an external model call to this path.

How the engine learns (teacher data, per-person timing, labels from outcomes), how it is measured, and what the numbers do not prove: `docs/ai-engine-upgrade.md`.
