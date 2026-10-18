# Shared connector queue (Claude routine + Cursor routine)

The single queue both connector routines use. Built from the rows of `docs/glance-ai/connectors-queue.md` (the Claude connector builder's queue; its owner directive, token relay, consent catalogue, learning hook and owner-pack rules stay binding). Quality bar: [`QUALITY-BAR.md`](QUALITY-BAR.md).

## Rules (both routines, every run)

1. **Claim before you build.** Claim exactly ONE row whose owner is `free`: set `owner` (claude|cursor), `status=claimed`, `claimed_at` (ISO date, Israel) and the branch, as the **FIRST commit** on that row's branch, then open a **draft PR immediately** and put its number in the row.
2. **Never take a row claimed by the other routine.** A claim older than **7 days with no PR activity** (no commit, comment or review) becomes `free` again; the taker notes the stale claim in `notes`.
3. **No concurrency.** The Claude routine runs at its existing time; Cursor's `integration-builder` runs **Sun 07:47 IL** (`47 4 * * 0` UTC). They never run at the same time. If a claim conflict still appears (same row on two branches), the earlier `claimed_at` wins; the other routine drops the row and picks another.
4. **Cross-review.** Each run, review the other routine's newest open connector PR against `QUALITY-BAR.md`: post review comments, or open a stacked fix PR on top of its branch. **Never force-push, rebase or commit directly onto the other routine's branch.** Never merge.
5. Status moves only forward: `free → claimed → built (mock-tested, PR open) → wired (reachable from the steps list / popup, switch off) → live (owner's live Gate passed)`. Only the owner marks `live`.
6. Vendor dev-app registration, env vars, vendor review = **CoS/owner** action; write the exact missing setup in `notes/blockers`.
7. Branches: Claude `claude/connector-<date>-<tool>`; Cursor `cursor/routine-integration-builder` (or `cursor/routine-integration-builder-<tool>`). Base: `claude/install-uiux-pro-max-skill-a4agox`. Never touch `main`.

## Queue

| tool | owner | status | branch/PR | claimed_at | notes/blockers (dev app setup = CoS) |
|---|---|---|---|---|---|
| Notion | claude | built | `claude/connector-2026-10-14-notion` / #138 (draft) | 2026-10-14 | Foundation (token relay, consent catalogue, learning hook) built with it. Waiting on CoS/owner: Notion public integration registration + env vars, relay deploy, `api.notion.com` manifest host, unverified vendor facts, steps-list destination wiring (open-tasks row 75) |
| ClickUp | free | free | - | - | OAuth2. CoS: ClickUp OAuth app + client id/secret |
| Slack | free | free | - | - | OAuth2 + secret (relay); app review for distribution. CoS: Slack app |
| Monday | free | free | - | - | OAuth2. CoS: monday app |
| HubSpot | free | free | - | - | **Blocked on a decision:** Glance or Flow (owner). Do not claim until decided |
| Pipedrive | free | free | - | - | OAuth2 + secret (relay). CoS: Pipedrive app. Same Glance-vs-Flow question as CRM rows; confirm with owner |
| Jira | claude | built | `claude/connector-2026-10-18-jira` / #168 (draft, stacked on #156 Asana, which is on #138 Notion) | 2026-10-18 | Built and tested against a mock; not verified live; switches off. Waiting on CoS/owner: Atlassian app registration + `JIRA_CLIENT_ID`/`JIRA_CLIENT_SECRET`, relay deploy, `api.atlassian.com` manifest host, unverified vendor facts (`connectors/jira.md` §9), steps-list destination wiring (open-tasks row 75). Shares registry/switch/catalog files with Cursor's ClickUp #167 on the same base: whichever merges second resolves the conflicts |
| Zoom | free | free | - | - | OAuth2 + secret (relay); marketplace review. CoS: Zoom app |
| Salesforce | free | free | - | - | **Blocked on a decision:** Glance or Flow (owner). Do not claim until decided |
| WhatsApp | free | free | - | - | Business Cloud API only (no scraping); needs Meta business verification by owner. Never auto-send |
| Trello | free | free | - | - | API key + token flow, not OAuth2. CoS: Trello Power-Up key |
| Asana | claude | built | `claude/connector-2026-10-15-asana` / #156 (draft, stacked on #138 until it merges) | 2026-10-15 | Built and tested against a mock; not verified live; switches off. Waiting on CoS/owner: Asana app registration + `ASANA_CLIENT_ID`/`ASANA_CLIENT_SECRET`, relay deploy, `app.asana.com` manifest host, unverified vendor facts (`connectors/asana.md` §9), steps-list destination wiring (open-tasks row 75) |
| Dropbox | free | free | - | - | OAuth2 PKCE. CoS: Dropbox app |

Rows still only in `connectors-queue.md` (Linear, DocuSign, Teams via Graph, Stripe, Box, Calendly, Adobe Sign, Google Meet link, open banking; Morning on HOLD) are added here as `free` when a routine is about to take one; until then `connectors-queue.md` remains the Claude routine's detailed design reference, and this file is the source of truth for ownership.
