# Open tasks and status

Living list of what is still open on the product and the website, kept up to date by
Claude during sessions. When something comes up in conversation (a follow-up, a blocker,
a decision, a thing the owner has to do), it is added here; when it is finished or
changes status, this file is updated in the same turn.

Statuses: `open` · `in progress` · `blocked` (needs the owner) · `decision` (waiting for an answer) · `done`

Last updated: 2026-10-01

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

## Decisions waiting for an answer

| Question | Status | Notes |
|----------|--------|-------|
| Keep the "independent, not affiliated with other Flow products" line in `llms.txt` and JSON-LD, or drop it? | decision | It was removed from visible text on request; it remains only in machine-readable data. |
| Simplify the extension popup further (it still asks "Where should Glance write?" and offers recipe export)? | decision | Connecting Google is now the whole setup. |
| Homepage Hebrew dictionary is dormant (no language switch) | decision | Either add a language switch or remove the Hebrew strings. |
| Glance Pro ($14/user/mo) is listed on Pricing but not built | decision | Page says "Not available yet" and collects interest only. |

## Done (recent)

- 2026-10-01: Founders section on the homepage, richer Person/Organization data, `llms.txt`, About title/lead naming the founders.
- 2026-09-30: Glance sign-up gives an instant download (`trial-signup` function, 28 tests), device-aware install panel, returning-visitor memory, store-ready config.
- 2026-09-30: Glance setup questions (work domain, caution, team size) removed from `trial.html`; popup "Save & start" step removed.
- 2026-09-30: Homepage restructured with Flow as the front door; 5-link navigation on all 47 pages; plain-English Pricing; unbuilt capabilities (Flow-Edge, audit trail) no longer stated as live.
- 2026-09-30: Branch brought up to date with `origin/main` (was 123 commits behind).
