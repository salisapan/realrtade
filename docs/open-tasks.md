# Open tasks and status

Living list of what is still open on the product and the website, kept up to date by
Claude during sessions. When something comes up in conversation (a follow-up, a blocker,
a decision, a thing the owner has to do), it is added here; when it is finished or
changes status, this file is updated in the same turn.

Statuses: `open` · `in progress` · `blocked` (needs the owner) · `decision` (waiting for an answer) · `done`

Last updated: 2026-10-02

## Open

| # | Task | Status | Owner | Due | Notes |
|---|------|--------|-------|-----|-------|
| 1 | Merge branch `claude/install-uiux-pro-max-skill-a4agox` into `main` and deploy | open | owner | 2026-10-07 | Live site still shows the old copy. ClickUp: https://app.clickup.com/t/z8vk7p8nh3 |
| 2 | Restore the Supabase project `flow-ai` (currently INACTIVE) | blocked | owner | 2026-10-07 | While paused, no sign-up is stored. Glance still hands out the download and emails the owner the address, but the waitlist stays empty. |
| 3 | Confirm Netlify env vars: `SUPABASE_SERVICE_ROLE_KEY`, `EMAIL_VERIFY_SECRET`, `RESEND_API_KEY` | open | owner | 2026-10-07 | Needed by `trial-signup`, `send-trial-access`, `download-trial-zip`. |
| 4 | Test a real Glance sign-up end to end after deploy | open | Claude + owner | after #1-3 | Row in `waitlist`, download starts, backup email arrives. |
| 5 | Search Console: Request indexing for `/` and `/about.html` | open | owner | 2026-10-07 | ClickUp: https://app.clickup.com/t/z8vk7p8nh4 |
| 6 | Send LinkedIn links (Sali, Tomer, company page) so `sameAs` can be added | open | owner | 2026-10-07 | ClickUp: https://app.clickup.com/t/z8vk7p8nh5. Claude then adds `sameAs` to JSON-LD on `index.html` and `about.html`. |
| 7 | Publish Glance on the Chrome Web Store, then set `chromeStoreUrl` in `flow-landing/assets/site-config.js` | open | owner | - | Turns every "Get Glance" path into one-click "Add to Chrome". Submission drafts: `flow-trial-extension/docs/chrome-web-store-submission.md`. |
| 8 | Re-check Google AI Mode for "theflow-ai.com founders" a few days after #1 and #5 | open | owner | ~2026-10-14 | Expect Sali Sapan and Tomer Steinmetz; if not, revisit entity signals. |
| 9 | After deploy: confirm a Flow waitlist sign-up receives the Playbook PDF | open | Claude + owner | after #1-3 | `send-playbook` now ships its PDF via `netlify.toml` (`node_bundler = "none"` + `included_files`); verify end to end once deployed. |
| 10 | When Supabase is restored: confirm migration `20260928170000_landing_lead_schema.sql` is applied (waitlist `ref_code`, `confirmed_at`, `leads` table) | open | owner + Claude | after #2 | Code writes these columns; they could not be checked while the project is paused. |
| 11 | Switch on Glance Pro payments: Stripe account, prices, webhook, Netlify env vars, Supabase migration, real-Gmail check of Draft-It, test-mode purchase, then `PRO_PUBLIC=1`. **Also run the 12-step real-Gmail script in `docs/open-loops.md` §6 (open loops: ack/promise/chase/close/reopen/payment) before merging** | open | owner | 2026-10-08 | Full order in `docs/monetization.md` §5; loop behaviour in `docs/open-loops.md`. ClickUp: https://app.clickup.com/t/z8vk7p8q64 |

## Decisions waiting for an answer

| Question | Status | Notes |
|----------|--------|-------|
| Keep the "independent, not affiliated with other Flow products" line in `llms.txt` and JSON-LD, or drop it? | decision | It was removed from visible text on request; it remains only in machine-readable data. |
| Simplify the extension popup further (it still asks "Where should Glance write?" and offers recipe export)? | decision | Connecting Google is now the whole setup. |
| Homepage Hebrew dictionary is dormant (no language switch) | decision | Either add a language switch or remove the Hebrew strings. |
| The 31 long articles in `/blog` and 8 long pages in `/solutions` (about 1,600 and 700 words each) are the organic/AI-search layer, and many cover industries Flow does not target (energy, telecom, retail, customs, education). Keep as is, or consolidate/noindex the off-target ones? | decision | Nothing was deleted: removing indexed URLs loses ranking history. Recommended: wait for Search Console data after the first deploy, then merge or noindex whatever draws no impressions. The visitor path no longer depends on them: they are reachable from the footer only. |
| Glance Pro redefined as the individual AI tier (Draft-It + attachment summaries), instead of the small-team plan in `product-architecture.md` §2 | decision | Reason: it is the only boundary that can be enforced (server-side, costs us per use) and everything in it is built. Team features stay a later tier via Contact. Approve, or tell me which features Pro must carry. |
| Glance Pro now sells follow-through (unlimited Waiting on, money owed, Draft-It, summaries); Free tracks 3 Waiting-on items | decision | Replaces the earlier "AI only" Pro, which was too thin to charge for. Reasoning in `docs/monetization.md` §2. Needs a real-Gmail check before deploy (row 11). |
| Pro price ($14 monthly / $132 yearly), 14-day card-required trial, founding coupon, refund within 14 days | decision | Prices live in Stripe, so changing them needs no code. The refund promise is already in `terms.html`. |
| Automatic remote classification is now switched off for everyone (`REMOTE_CLASSIFY = false`) | decision | It sent masked email text to a model without being asked, which contradicts the page's promise. Keep it off, or build it as an opt-in Pro setting. |

## Done (recent)

- 2026-10-01: All five proposed loop dimensions built (`docs/open-loops.md` §9): meeting debrief, things that run out, aging of replies you owe, recurring rhythms (Pro), person view. New cores `expiry.js`, `meeting-debrief.js`, `recurrence.js`; new corpus `loop-dimensions-corpus.cjs`. Real-Gmail steps 15-19 added; still unverified in live Gmail.
- 2026-10-01: Local-first rule written (`docs/local-first-principle.md`, also in CLAUDE.md). New `core/request-types.js` recognises requests and promises (frame + action + object, EN/HE, 660 types) with no model; Glance now also tracks promises YOU made ("You promised something", closes as kept when you send it). New `test/request-types-corpus.cjs` plus harness cases. Real-Gmail steps 13-14 added to `docs/open-loops.md`. Next dimensions proposed there (§9): decision waiting for the owner on which to build first.
- 2026-10-02: Closure brief finished (`docs/closure-plan.md`): "Prepare my reply" (Gmail draft when the ball is back with you, never sent), weight of intention (soft asks open no loop), "Deadline passed" label and deadline-aware nudges. **Owner:** real-Gmail steps 29-35 in `docs/open-loops.md` §9a-ii.
- 2026-10-02: Identity + closure pass (`docs/product-identity.md`, `docs/local-detection-plan.md`). Glance copy is outcome-led (FAQ "Is there AI in this?", loop mark replaces the sparkle, store description rebuilt, copy test `identity-copy-corpus`). Closure intelligence: new `yours` stage (question back / could-not-open / counter-offer hand the move to you and stop the chase), `declined` closes as a no, answers in a new thread settle the same loop, two-word chasers open loops, soft acks no longer close. Reply fixtures: first-contact 68% vs 32% before; wrongly-closed loops 11 -> 1. `recognitionStats` on device (counts only). **Owner:** run steps 20-28 in `docs/open-loops.md` §9a on real Gmail; decide whether to connect the engine to `core/intent.js`.
- 2026-10-02: Local intent engine (`docs/intent-model.md`): on-device model + lexicon pipeline recognises asks/promises with no external model; blind set recall roughly 0.27->0.68 (asks) and 0.33->0.75 (promises) at precision 1.00 (small sets, synthetic training data, Hebrew weaker). Used in follow-up and meeting debrief; learns on the device from accept / "Not now" (feature numbers only). **Owner decision open:** connect it to `core/intent.js` (incoming mail judge)? Retrain: `node scripts/train-intent-model.cjs`.
- 2026-10-01: Glance reframed as an open-loop system (`docs/open-loops.md`). A loop now has stages (waiting, nudged, promised, closed); a reply is read for what it did (out-of-office and "thanks" leave it open, a dated promise moves the chase day, a real answer closes it, a payment closes only when they say it was paid, otherwise it asks once); three nudge levels (friendly free, firmer and last Pro); Reopen; "Loops" tab with days open, money owed and paid this month; site and Pro copy leads with money on the line. Also fixed: month-and-day dates in your own message threw inside the follow-up check. New checks in `follow-up-corpus` (+60), `follow-write-corpus` (+9), `follow-gmail-harness` (+14).
- 2026-10-01: Glance's paid value rebuilt around money and deadlines. New "Waiting on": your own message asks for something (or sends an invoice) -> one card -> a Google Task on the chase day -> completed automatically when they reply; nudge drafts; the Free limit of 3; a Pro-only total owed to you. Pricing page wording fixed ("Join the Pro waitlist" replaces "Notify Me"). 66 + 27 + 18 new checks.

- 2026-10-01: Glance Pro payment rails (not live until `PRO_PUBLIC=1`): Stripe Checkout, signature-verified webhook, derived licence keys (hash only in the database), key check / resend / billing portal, a server-side licence gate on `glance-assist` (it was open to anyone and calls paid models), Pro card in the extension panel, welcome page, pricing page that switches from Notify Me to checkout by itself, privacy and terms updated, 57 + 40 new checks. Founders section back on the homepage. Plan and owner steps: `docs/monetization.md`.

- 2026-10-01: Site simplification pass. Homepage 5,332 px to 3,725 px: the "Built for sensitive data" and founders sections were removed (they repeated the hero chips and the footer/About founders link; the pre-certification note now sits under "How it works"), the closing CTA is one heading and one form. Glance page 4,471 px to 2,514 px: the signup form is now in the hero, "What it is / isn't", "Data & privacy" and the closing box were merged into one short privacy card, FAQ cut from 9 to 5 (FAQ schema updated to match). Fixed a real bug where reduced-motion visitors saw the homepage cards as blank.

- 2026-10-01: Action-to-outcome audit of every form: Pricing Pro "Notify Me" no longer swallows database failures (now stored server-side and the confirmation email is only promised when sent); the homepage deployment form now notifies the owner when a lead completes it; both covered by tests (`submit-waitlist.test.cjs`).
- 2026-10-01: Playbook promise fixed: `send-playbook` could not find its PDF on Netlify (default bundler skips it); added `included_files`. Light-theme fixes for founder cards and header wordmark. Visual check in light/dark and desktop/mobile of the new homepage sections, Pricing, About and the Glance download panel.
- 2026-10-01: Open-tasks file plus a scheduled routine (weekdays 07:47 Israel) that checks state and syncs; ClickUp sync needs connectors the org does not allow on routines.
- 2026-10-01: Founders section on the homepage, richer Person/Organization data, `llms.txt`, About title/lead naming the founders.
- 2026-09-30: Glance sign-up gives an instant download (`trial-signup` function, 28 tests), device-aware install panel, returning-visitor memory, store-ready config.
- 2026-09-30: Glance setup questions (work domain, caution, team size) removed from `trial.html`; popup "Save & start" step removed.
- 2026-09-30: Homepage restructured with Flow as the front door; 5-link navigation on all 47 pages; plain-English Pricing; unbuilt capabilities (Flow-Edge, audit trail) no longer stated as live.
- 2026-09-30: Branch brought up to date with `origin/main` (was 123 commits behind).
