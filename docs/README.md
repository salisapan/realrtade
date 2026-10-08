# docs/ — the map (read this first, human or agent)

<!-- LOCKED-IDENTITY:START -->
**Glance closes open loops. Gmail is where it starts today.** Glance is a system for unfinished intentions: what you asked someone for, what you promised, what someone asked of you. Its loop is **detect → carry → execute → true close**. It starts in Gmail, the current primary entry surface, and executes through the places a close really happens (Google Tasks, Gmail drafts and Drive today; more surfaces later, only ever in service of closure). It stays silent when it is uncertain, never sends on your behalf, treats preparation as not completion, and counts a loop closed only on real completion or a deliberate release. Flow, the enterprise product, is separate.
<!-- LOCKED-IDENTITY:END -->

Any description of Glance starts from the sentence above, and any report keeps the *product definition (vision-locked)* apart from the *current implementation status (code reality)*; both rules and the anti-drift list are in `product-identity.md`.

> Maintained as part of every change: `test/docs-consistency-corpus.cjs` fails when a doc listed here is missing, when a `core/` module is missing from `flow-trial-extension/core/README.md`,
> and when the public numbers (allowances, prices, switches) in the docs disagree with the code. Last reviewed: 2026-10-04.

## 0. Who reads what

- **Any agent (Claude Code, a Grok bot, another)**: `CLAUDE.md` (standing rules, they override defaults) -> this file -> `open-tasks.md` (what is open, blocked, decided) -> the one document that owns the topic you touch (table below).
  `.claude/ecc-agents/INDEX.md` is the role library `CLAUDE.md` routes to. `docs/ai-assistant-context-parity.md` says what a fresh clone does and does not give an assistant.
- **A public AI reader of the site** (`flow-landing/llms.txt`): describes only what is live. It is kept short on purpose and never describes a switch that is off.
- **David / the owner**: `revenue-routines.md` (Hebrew) and `open-tasks.md`.

## 1. Topic -> the document that owns it -> the code -> the test

| Topic | Owner document | Code | Tests |
|---|---|---|---|
| **What Glance IS (locked identity: closes open loops, starts in Gmail), the wording rules and the anti-drift list** | `product-identity.md` (owns the verbatim block) | every file that quotes the block, `flow-landing/llms.txt`, the store listing | `test/docs-consistency-corpus.cjs`, `test/identity-copy-corpus.cjs` |
| Two products (Glance Free/Pro vs Flow), what each may claim | `product-architecture.md`, `product-identity.md` | `flow-landing/pricing.html`, `trial.html` | `test/identity-copy-corpus.cjs` |
| Standing review rules | `design-principles.md`, `decision-filter.md`, `local-first-principle.md`, `magic-moment.md` | - | - |
| What is sold, the Free/Pro table, money | `monetization.md`, `revenue-routines.md` (Hebrew) | `core/entitlements.js`, `glance-assist` licence check | `test/pro-corpus.cjs` |
| **The recognition order and the one external step** | `ai-ladder.md` (owns it), `when-recognition-fails.md`, `intent-model.md` | `core/ai-ladder.js`, `glance-assist/ladder.js`, `src/background.js`, `src/follow.js` | `test/ai-ladder-*-corpus.cjs`, `glance-assist/ladder.test.cjs`, `scripts/ai-ladder/eval.cjs` |
| **A review of every model and AI layer: what runs where, what is on or off, what was tested and failed, the numbers and their limits** (for David and any agent) | `ai-models-overview.md` (Hebrew) | see the table in that file | - |
| The on-device engine and how it learns | `intent-model.md`, `ai-engine-upgrade.md`, `reply-model.md`, `human-eval.md` | `core/request-types.js`, `intent-model.js`, `intent-pipeline.js`, `reply-model.js` | `intent-model-corpus`, `reply-model-corpus`, `request-types-corpus` |
| **True close: when a loop is closed** | `true-close.md`, `open-loops.md`, `reply-model.md`, `computer-proof-gate.md` | `core/follow-up.js` (`classifyReplyText`), `core/reply-meaning.js`, `core/proof-of-close.js`, `core/commitment-title.js`, `core/onedrive-file.js`, `core/suggest-save.js` | `test/true-close-corpus.cjs`, `reply-closure-corpus`, `test/proof-of-close-corpus.cjs`, `test/outlook-todo-corpus.cjs`, `test/commitment-title-corpus.cjs`, `test/onedrive-file-corpus.cjs`, `test/computer-proof-corpus.cjs`, `test/suggest-save-corpus.cjs`, `test/suggest-save-parity-corpus.cjs` |
| Multi-step resolution (receipts, contract, quote, proposal, signed copy) | `resolution-paths.md`, `true-close.md` §4, `file-backed-closure-plan.md` | `core/resolution.js`, `src/follow.js` | `test/resolution-corpus.cjs`, harness section 32 and 32j |
| Close chains: one requirement (file, fact, date, approval, answer), search connected sources, draft or needs-you, close only on real completion. An ask that gets someone else to act is silence, not a file prepare. Gmail and Outlook pass the same Drive and thread evidence | `true-close.md` §4, `resolution-paths.md`, `multi-platform.md`, `reply-model.md` | `core/close-chains.js`, `core/file-attach.js`, `core/source-text.js`, `src/content-gmail.js`, `src/content-outlook.js`, `src/outlook.js` | `test/close-chains-corpus.cjs`, `test/third-party-ask-corpus.cjs`, `test/source-parity-corpus.cjs`, `test/gmail-outlook-parity-corpus.cjs`, `test/owa-page-harness.cjs` |
| A model on the person's own computer | `local-model-server.md` | `core/local-lm.js`, `local-lm-server.js` | `local-lm-corpus`, `local-lm-server-corpus` |
| Hybrid on-device model + server for Do It proposals (**dormant**) | `hybrid-execution-architecture.md`, `lm-fallback-evaluation-plan.md` | `config/hybrid.public.js`, `src/hybrid-sw.js`, `core/exec-router.js`, `core/capability.js` | `hybrid-*-corpus`, `exec-router-corpus`, `capability-corpus` |
| Masking before anything leaves the device | `ai-ladder.md` §2, `hybrid-execution-architecture.md` §6 | `core/privacyShield.js`, `mask-ids.js`, `exec-router.js` (`maskForServer`) | `privacy-shield-corpus`, `mask-ids-corpus`, `glance-assist/scrub-e2e.test.cjs` |
| Other apps (WhatsApp Web, Outlook, capture) | `multi-platform.md` | `src/content-whatsapp.js`, `core/graph-mail.js`, `outlook-*.js` | `whatsapp-harness`, `outlook-*-corpus` |
| Community (cross-user) learning (**dormant**) | `community-learning.md` | `core/community.js` | `community-corpus` |
| Packaging, the Chrome Web Store, setup | `flow-trial-extension/docs/SETUP.md`, `chrome-web-store-submission.md`, `hybrid-execution-architecture.md` §0c | `scripts/package_trial_extension.py` (lite/full), `scripts/verify_trial_install.py` | `verify_trial_install.py` |
| Open work, blockers, decisions | `open-tasks.md` | - | - |
| Glance's own model lab (offline; v2 default, v2.1 in shadow). Flow is not this lab | `docs/glance-ai/STATE.md` | `glance-ai/README.md`, `glance-ai/labeling/README.md` | `glance-ai/oss/veto/test-hebrew-amount.cjs`, `glance-ai/model/suggest-save/test-corpus.cjs`, `glance-ai/model/suggest-save/check_dataset.py`, `glance-ai/labeling/test-ingest.cjs`, `glance-ai/labeling/test-score.cjs` |
| Which personal loops Glance can close, what this tip covers, and the slices after the steps list. Flow is not this map | `docs/glance-ai/holistic-close-map.md` | `core/proof-of-close.js`, `core/close-chains.js`, `core/request-types.js`, `src/background.js` | - |
| When Glance is worth paying for. The chief of staff reads the yaml. Flow is not this bar | `docs/glance-ai/paid-readiness-bar.md` | `core/pmf-metrics.js`, `core/close-quality-metrics.js`, `docs/human-eval.md`, `docs/real-mail-eval/2026-10-08.md` | - |

## 2. When X changes, update these in the SAME commit

| Change | Update |
|---|---|
| An allowance, a price, a Free/Pro line | `core/ai-ladder.js` `PLANS` or `core/entitlements.js` -> `ai-ladder.md` §3-§4, `monetization.md` table, `revenue-routines.md` §3, `flow-landing/privacy.html` and `trial.html` (numbers), `flow-trial-extension/README.md` |
| What leaves the device | `flow-landing/privacy.html`, `trial.html`, `popup/popup.html` footer, `chrome-web-store-submission.md` (data usage), `local-first-principle.md`, `ai-ladder.md`/`hybrid-execution-architecture.md`, `llms.txt` if public |
| A switch (`config/*.public.js`, a Netlify env var such as `GLANCE_AI_LADDER`) | the config comment, `ai-ladder.md` §7 or the hybrid §13, `flow-trial-extension/README.md` (env list), `open-tasks.md`, and the copy corpus for that switch |
| A new `core/` module | `core/README.md` (a test enforces it), this table if it is a new topic, and the extension manifest + `popup.html` script lists |
| How Glance is described anywhere (a blurb, a listing, a report, a commit message) | start from the locked block in `product-identity.md`; change the block only there and in every file the consistency test names, in one commit, with the owner's say-so. Reports keep *product definition* and *implementation status* apart |
| A rule on when a loop closes | `true-close.md`, `reply-model.md`, a case in `test/true-close-corpus.cjs` |
| A new multi-step document class | `core/resolution.js` `CLASSES`, `resolution-paths.md`, `true-close.md` §4, corpus + harness |
| A new surface (an app) | `multi-platform.md`, the privacy page, the store text, in the same commit |
| Anything decided, blocked or finished | `open-tasks.md` (and its "Last updated") |
| Owner labels for the Glance model lab | `docs/glance-ai/STATE.md`, `glance-ai/labeling/README.md`, `open-tasks.md` |
| Which personal loops Glance should close next | `docs/glance-ai/holistic-close-map.md`, one line in `vault/decisions.md`. The release order stays in `open-tasks.md` |
| Whether Glance is worth paying for, or a money step should wait | `docs/glance-ai/paid-readiness-bar.md` (the yaml `current` and `status`), one line in `vault/decisions.md` when `overall` changes |
| A product fact or the release order | the truth file that owns it (`CLAUDE.md`, `open-tasks.md`, and the topic doc) and one dated line in `vault/decisions.md`, in the same change |
| Anything David or the owner should do about money | `revenue-routines.md` |
| An owner lock on product scope (what Glance or Flow is, consent, send rules, holds) | `CLAUDE.md` "Owner product locks", `open-tasks.md` if it changes work, and one dated line in `vault/decisions.md` that links here |
| Who the person is, and whether group or Cc mail is offered or quiet | `docs/glance-ai/user-context-v0.md`, `CLAUDE.md` "Owner product locks", one line in `vault/decisions.md`. Product quiets (cc-only, addressed-to-other, the #118 no-To/Cc hedge) stay until the contrast-pair shadow test |
| Flow sales and outreach rules, CoS routines | `revenue-routines.md` §8-§9, and one dated line in `vault/decisions.md` |

## 3. Every document, one line

`ai-assistant-context-parity.md` what an assistant gets from a fresh clone · **`ai-models-overview.md` every model and AI layer in one page, in Hebrew** · `ai-engine-upgrade.md` teacher data, a model of each person, outcome labels · **`ai-ladder.md` the second reading: order, allowance, cost, contract, how to switch on, real-Gmail test** ·
`closure-plan.md` unfinished intentions to completion · `community-learning.md` cross-user learning, dormant · `decision-filter.md` the five-question filter · `design-principles.md` twelve review criteria ·
`encoder-evaluation-plan.md` encoder experiment (not met) · `engineering-audit.md`, `system-audit-2026-09.md` audits · `file-backed-closure-plan.md` single-file closure · `human-eval.md` first numbers on real mail ·
`hybrid-execution-architecture.md` device model + server for Do It proposals, dormant, packaging profiles, GPU diagnostics · `intent-model.md` the local engine and its tiers · `lm-fallback-evaluation-plan.md` small on-device model experiment (not met) ·
`local-detection-plan.md` outcome identity and local closure · `local-first-principle.md` our code recognises first · `local-model-server.md` Ollama / LM Studio · `magic-moment.md` the first real close ·
`monetization.md` how Glance earns · `multi-platform.md` loops beyond email · `open-loops.md` the open-loop model · `open-tasks.md` status · `product-architecture.md` Flow and the Glance split ·
`product-identity.md` AI is the engine, closure is the product · `reply-model.md` closing on understanding · `resolution-paths.md` more than one step · `revenue-routines.md` Hebrew routines for David ·
**`true-close.md` when a loop is closed, what was found and fixed** · `computer-proof-gate.md` CoS checklist for the own-computer ProofOfClose wedge (one allowlisted page, DOM re-read; live driver not wired; local-file gate later) · `when-recognition-fails.md` the steps when a sentence is not recognised ·
`docs/glance-ai/STATE.md` Glance model lab: candidates, headline metrics, gated Qwen table, blockers, owner-label path (still 0/200), next stages. The preview write-up is `docs/glance-ai/owner-gold-preview-2026-10-08.md`. · `docs/glance-ai/user-context-v0.md` UserContext v0: per-user profile, relevance of a mail to that person, and the offer or quiet lock. Not built. · `docs/glance-ai/holistic-close-map.md` personal close catalog, coverage on this tip, three slices after the steps list, five scenario Gates. · `docs/glance-ai/paid-readiness-bar.md` the worth-paying bar, today's scorecard, and the yaml a routine reads before any charge. · `vault/decisions.md` one dated line when a product fact or the release order changes.
Data files (`*.json`): measurement outputs of the scripts under `scripts/`; the numbers cited in the documents come from them.

## 4. Run everything (what "the tests pass" means)

```sh
cd flow-trial-extension
for t in test/*-corpus.cjs; do node $t || echo "FAILED $t"; done          # 66 corpora, no network
node test/follow-gmail-harness.cjs && node test/whatsapp-harness.cjs      # real content scripts in Chromium (takes ~10 minutes; SKIPPED without Playwright)
npx playwright test                                                # headless unpacked-extension suite (CI: .github/workflows/glance-e2e.yml; live Gate stays, open-tasks row 56)
cd ../flow-landing/netlify/functions/glance-assist
for t in ladder model-router scrub-e2e style-hints; do node $t.test.cjs; done
cd ../../../.. && python3 scripts/verify_trial_install.py                  # both packaging profiles, size guard, download handler
node scripts/ai-ladder/eval.cjs                                           # SKIPPED without provider keys; with keys it is the gate for GLANCE_AI_LADDER
```

Nothing here can drive a real Gmail, a real provider, Stripe or Supabase: those checks are the owner's (`open-tasks.md` rows 34 and 35).

## 5. The Obsidian vault (`docs/` is the vault)

Open `docs/` as the vault in Obsidian, so these truth files show up there too. `docs/vault/` is only a view and a cache over them: `vault/Home.md` links here, and `vault/decisions.md` is a short dated log with one line per decision that links to the truth file. A vault note never holds a fact that is not in a truth file. Rule: `vault/when-to-write-to-vault.md`.
