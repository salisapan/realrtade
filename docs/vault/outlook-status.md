---
tags: [stream, outlook]
updated: 2026-10-05
source: docs/multi-platform.md, docs/open-tasks.md rows 21, 21b
---
# Outlook — status stub

Owner doc: [[multi-platform]] (section "Outlook (through Microsoft Graph)"). Status rows: [[open-tasks]] 21, 21b.
This note is a quick snapshot for a new chat; refresh the date when you touch it. Facts below are copied from those docs on 2026-10-05, not new claims.

## Decided
- Outlook through Microsoft Graph (not by reading the Outlook page).
- Mail.ReadWrite: **yes, drafts only** (owner 2026-10-05). Code allow-list: `createReply`, PATCH/DELETE of Glance's own drafts. Never `Mail.Send`. Undo deletes only that draft.
- Entra app registered as **SPA**; client id set in `core/outlook-config.js`.

## Verified live (2026-10-05)
- SPA registration works ("Mobile and desktop" fails with `invalid_request`).
- Incoming asks + Do It (reply draft in Outlook Drafts, not sent).

## Built, tested only against a fake Microsoft
- PKCE sign-in, own-identity set, silent renewal (SPA refresh tokens last 24h), honest failure, no loop without a tap.

## Still open
- Owner acceptance tests 2, 2b, 5-8 need a real Microsoft account (row 21).
- Some organisations block user consent (admin must approve).

## Code / branch (implementation status)
- Branch `cos/outlook-fix-on-claude`; extension manifest `0.9.13` (0.9.4–0.9.9 Outlook work, 0.9.10–0.9.13 toolbar icon).
- Files: `core/outlook-config.js`, `outlook-auth.js`, `graph-mail.js`, `outlook-sync.js`, `src/outlook.js`; tests `outlook-*-corpus`.

## Log (newest first, one line each)
- 2026-10-05 · vault note created from docs; no new facts.
