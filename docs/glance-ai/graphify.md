# Graphify: every agent uses it

Owner, 2026-10-20: every agent works with Graphify to cut token use and stay efficient.

- **Who:** Claude sessions and routines, Cursor and Codex agents (David's Grok-bot agents included), and subagents they spawn.
- **How:** run `scripts/graphify-setup.sh` once per checkout (AST only, no API cost). Then, before Read, Grep or Glob over code: `graphify query "<question>"`, `graphify path "<A>" "<B>"`, `graphify explain "<concept>"`. After editing code: `graphify update .`.
- **Rule file:** `.cursor/rules/graphify.mdc` (alwaysApply). Cursor reads it on its own; other agents read this page through `CLAUDE.md` and `AGENTS.md`.
- **Why it is not committed:** `graphify-out/` is about 14 MB and changes on every commit, so it is gitignored; each checkout builds its own in under a minute.
- **If blocked** (permission system, no network): continue with grep and Read, and write "graphify blocked" in the run report. Do not work around the block. Routines never run `graphify hook install`.
- **What is shared instead:** everything an agent builds goes to git (pushed branches or PRs into `claude/install-uiux-pro-max-skill-a4agox`), and a routine run that works is part of the code, not a note: tests, docs, `docs/glance-ai/ecosystem-runs.md`, decisions line. A run that reports SUCCEEDED but pushed nothing counts as not done.
