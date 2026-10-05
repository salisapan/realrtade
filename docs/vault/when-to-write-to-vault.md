---
tags: [process]
updated: 2026-10-05
---
# מתי כותבים ל־vault — when to write to the vault

**The vault is a context cache, not a source of truth.** It exists so a new chat (CoS, Grok, Claude Code, Sali) does not start from zero. Code and product truth stay in `CLAUDE.md` + `docs/` ([[README]] is the map). If the vault and a doc disagree, the doc wins and the vault is fixed.

## Read (before)
Before starting any stream: skim [[Home]], the top of [[decisions]], and the stream note. Then the normal order: `CLAUDE.md` → [[README]] → [[open-tasks]] → owner doc.

## Write (after) — כותבים כש...
| What happened | Vault | `docs/` in the **same commit** |
|---|---|---|
| Sali decided something (yes/no, price, scope, wording) | one line on top of [[decisions]] (template [[decision]]) | [[open-tasks]] row + "Last updated", and every file [[README]] §2 lists for that change |
| A stream changed state (verified live, blocked, handed off) | the stream note (`outlook-status`, `living-icon-handoff`, …): date + one log line | [[open-tasks]] row status |
| Sali explained what he wants in his own words (taste, rejection, "not like this") | the stream note, "What Sali wants" (quote short Hebrew phrases) | nothing, unless it becomes a rule → [[design-principles]] |
| A long working session ended | `sessions/YYYY-MM-DD.md` (Daily note, template [[session]]): 5-10 bullets, what's next | nothing extra |
| A new stream starts | new note in `vault/`, linked from [[Home]] | owner doc row in [[README]] §1 if it is a new topic |
| A product fact changed (allowance, price, switch, what leaves the device, close rule, surface) | link from the stream note | **all** files in [[README]] §2 — the vault never replaces that |

- Bridge notes (`vault/bridge/to-cos/`, `vault/bridge/to-claude/`) are messages between Claude Code and CoS, not product truth. Product facts still update `CLAUDE.md` and the `docs/` §2 files. Protocol: [[vault/bridge/README]].

## Never write to the vault
- Secrets, tokens, keys, client secrets, personal mail text, the private eval sentences (gitignored for a reason).
- A new definition or marketing line for Glance (only [[glance-definition]], verbatim).
- A number that is not in the repo (usage, revenue, conversion).
- Statuses copied from [[open-tasks]] (link instead; copies drift).

## Style
Short. Dated (`YYYY-MM-DD`, Israel time). Newest first. Link with `[[note]]`; the docs are notes too (`[[open-tasks]]`, `[[multi-platform]]`).
