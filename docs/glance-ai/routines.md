# Routines: who runs what, and how nothing collides

> Written 2026-10-14 for the owner, the Claude lanes, David's agents (Grok bot, CoS) and any Cursor routine. Updated the same day: Cursor routines are **proactive** — they act, not only write a report. Status of each Claude lane is in `docs/open-tasks.md` rows 63–69; this page is the map and the rules between them. Times are Israel time and are copied from those rows: if the dashboards say otherwise, fix this table.

Glance closes open loops. Gmail is where it starts today. Routines serve that and nothing else: none of them is about being busy, and none changes the product definition. Flow is separate.

## 1. The lanes (who owns which work)

| Lane | Who | When | Branches | Owns (writes) |
|---|---|---|---|---|
| AI product milestones M1–M7 (row 63) | Claude routine | Sun–Thu 10:52 | `claude/ai-engine-*` | the milestone it is building, each a draft PR behind an off switch |
| Model trainer (row 63) | Claude routine | Mon, Thu 17:43 | `claude/model-*` | `glance-ai/` model lab, labelling batches |
| Product lab (row 64) | Claude routine | Sun 14:52 proposal, Wed 14:52 build | `claude/lab-*` | `docs/glance-ai/proposals/` |
| Breadth builder (row 65) | Claude routine | Mon, Tue, Thu 14:52 | `claude/breadth-*` | one loop type of `holistic-close-map.md` per run |
| Scenario rehearsal (row 66) | Claude routine | Fri 09:37 | `claude/*` | `docs/glance-ai/scenario-rehearsal.md`, the headless e2e suite |
| Red team (row 67) | Claude routine | Fri 12:52 | `claude/*` | `docs/glance-ai/red-team.md`, fixes in `core/` with tests |
| Connector builder (`connectors-queue.md`) | Claude routine | one row at a time, the next row the next day | `claude/connector-*` | `docs/glance-ai/connectors-queue.md`, `docs/glance-ai/connectors/` |
| More platforms (row 69) | Claude and David | as built | `claude/platforms-*` | chat surfaces |
| CoS standup, Flow outreach, ClickUp | David (Grok bot) | standup 07:30 | `cos/*` | ClickUp, `docs/vault/bridge/`, outreach packs |
| Owner locks and «מאשר» | Sali | - | - | `CLAUDE.md` locks, every switch, `main`, Netlify |
| referee (row 72) | Cursor routine | daily 07:10 | `cursor/routine-referee` | `docs/glance-ai/reports/referee/`; PR review comments on open PRs |
| listener (row 72) | Cursor routine | Sun 08:00 | `cursor/routine-listener` | `docs/glance-ai/reports/listener/`, `docs/glance-ai/pain-queue.md` |
| conductor (row 72) | Cursor routine | Sun 09:00 | `cursor/routine-conductor` | `docs/glance-ai/reports/conductor/`, `docs/glance-ai/week-priority.md` |
| mcp-watch (row 72) | Cursor routine | Mon 08:00 | `cursor/routine-mcp-watch` | `docs/glance-ai/reports/mcp-watch/`; may patch bridge files when the spec drifted |
| builder (row 72) | Cursor routine | Tue–Thu 11:00 | `cursor/routine-builder` | one cheap slice from `week-priority.md`, behind an off switch, with tests |

## 2. Lane rules (every routine, every agent)

1. **The working branch is `claude/install-uiux-pro-max-skill-a4agox`.** `git fetch origin` and read from it. Never take a fact from `main`.
2. **One owner per file.** A routine writes only inside what it owns (column "Owns"), plus the files its prompt names for that run. The shared index files (`docs/open-tasks.md`, `docs/README.md`, `docs/vault/decisions.md`, `flow-trial-extension/core/README.md`) belong to the Claude lanes and CoS unless a prompt explicitly says otherwise for one line.
3. **Branches by prefix.** `claude/*` Claude, `cos/*` David, `cursor/*` Cursor. Never push to a prefix that is not yours. PRs go into the working branch, as drafts. No force push, no merge, no close, no mark-ready.
4. **The three-condition auto-merge rule stays** (`CLAUDE.md`): all green, behind an off switch, and no changed file also changed by another open PR. A Cursor routine never merges.
5. **Check before you write:** `gh pr list --state open --json number,headRefName,files` and stop (or pick another file) if an open PR touches a file you are about to write.
6. **`docs/open-tasks.md` row numbers are taken in order, by the Claude lanes.** A Cursor routine proposes a row in its log; it does not add one unless its prompt says so.
7. **The Claude↔CoS bridge** (`docs/vault/bridge/`, draft PR #77) is for Claude and CoS. A Cursor routine does not post there.
8. **Act, then log.** A proactive routine's primary output is the action (comment, queue file, priority file, draft PR with code). The log under `docs/glance-ai/reports/<name>/` is a short receipt of what it did. If there is nothing to do, write nothing and end.
9. **No invented numbers.** Usage, installs, revenue and accuracy are "not measured" until the repo holds them. Status is stated as code reality, apart from the product definition.
10. **Nothing is sent, deployed or switched on** by a routine. Anything only the owner can do goes under "Needs Sali", one line each. Never request or connect chat/mail/tracker tools unless the prompt names that tool.

## 3. Cursor routines (proactive)

Each owns the paths in the table above and one long-lived branch `cursor/routine-<name>` with one draft PR into the working branch, reused every run.

| Name | When | What it does (not only a report) |
|---|---|---|
| `referee` | daily 07:10 | Finds collisions and **comments on the open PRs** with the exact conflict and the next move |
| `listener` | Sunday 08:00 | Turns public-pain signal into **`pain-queue.md`**, which breadth and the builder must read |
| `conductor` | Sunday 09:00 | Writes **`week-priority.md`**: one lane to push, one thing to defer, one cheap slice for the builder |
| `mcp-watch` | Monday 08:00 | If the MCP spec drifted, **opens a draft PR that fixes** the dormant bridge + tests |
| `builder` | Tue–Thu 11:00 | **Implements** the one cheap slice named in `week-priority.md`, behind an off switch, with tests |

### Preamble (paste at the top of every Cursor routine prompt)

```
You are a Cursor routine for Glance (repo salisapan/realrtade). You are PROACTIVE: your job is to act, not to leave a report and stop. The short log under docs/glance-ai/reports/<your-name>/ is a receipt of what you did. If there is nothing to do, write nothing and end.

PRODUCT (locked — never shrink this to a Gmail add-on)
Glance closes open loops. Gmail is where it starts today. Glance is a system for unfinished intentions: what you asked someone for, what you promised, what someone asked of you. Its loop is detect → carry → execute → true close. Gmail is the current primary entry surface, not the product. Execution and true close happen across the surfaces where a close really finishes (Tasks, drafts, Drive, chat, files, signatures, payments — only ever in service of closure). It stays silent when uncertain, never sends on your behalf, treats preparation as not completion, and counts a loop closed only on real completion (ProofOfClose read-back) or a deliberate release. Flow, the enterprise product, is separate: never mix them.

FORBIDDEN product wording (docs/product-identity.md): never call Glance "a Chrome extension for Gmail", "a Gmail add-on", "an AI email assistant" or "a smart inbox". "It installs in Chrome and reads the open Gmail thread" is fine only as today's implementation status, never as what Glance is. Keep product definition apart from code reality in every change and every log.

LANE RULES (binding)
1. The working branch is claude/install-uiux-pro-max-skill-a4agox. Run `git fetch origin` and read from it. `main` is old and wrong for this work: never take a fact from main.
2. Read first: CLAUDE.md (owner locks), docs/README.md, docs/product-identity.md, docs/open-tasks.md, docs/glance-ai/routines.md (the lane map), and any file your prompt names.
3. Write only what your prompt says you own. Before every write, run `gh pr list --state open --json number,headRefName,files`. If another open PR already touches that file, skip it and pick the next safe action (or stop).
4. Use one long-lived branch cursor/routine-<your-name> and one draft PR into claude/install-uiux-pro-max-skill-a4agox, reused every run (push a new commit). Never force push, never merge, never close, never mark ready.
5. Do not post to the Claude↔CoS bridge (draft PR #77). Do not send messages to people. Do not deploy. Do not turn a switch on. Never request or connect chat/mail/tracker tools for this routine unless your prompt names that tool.
6. Be honest: state status as code reality, apart from the product definition. Never invent usage, revenue, accuracy or install numbers: write "not measured".
7. Anything only Sali can do goes under "Needs Sali" at the top of the receipt, one line each.
8. Act first. The receipt is secondary: docs/glance-ai/reports/<your-name>/YYYY-MM-DD.md lists what you did in under 20 lines. No action taken: write nothing and end.
```

### referee (daily 07:10)

```
NAME: referee. Goal: stop agents from stepping on each other — by acting on the open PRs, not by filing a report alone.

Check from the working branch and the open PRs:
a. Overlaps (the third auto-merge condition): for every pair of open PRs, the files changed in both.
b. PRs whose base is main (nearly all should target claude/install-uiux-pro-max-skill-a4agox) or whose branch prefix is not claude/, cursor/ or cos/.
c. docs/open-tasks.md row numbers: duplicates or collisions between the working branch and the open PR branches (`git show origin/<branch>:docs/open-tasks.md`).
d. Two lanes building the same loop type or connector in different open PRs (docs/glance-ai/holistic-close-map.md, docs/glance-ai/connectors-queue.md).
e. A lane open-tasks calls "in progress" that has produced no commit or PR in 10 days.

ACTIONS (do these, in order, for every finding):
1. On each involved open PR, post ONE top-level PR comment (not a review verdict). Prefer the built-in **Comment on Pull Request** tool. If that tool is unavailable, fall back to shell: `gh pr comment <n> --body "..."`. The body must name: the finding type (a–e), the other PR numbers, the conflicting files or row numbers, and the next move (e.g. "retarget base to claude/install-uiux-pro-max-skill-a4agox", "wait for #138 to merge before touching docs/README.md", "rebase after #139", "stalled 10+ days — resume with a commit or ask the owner whether to drop it"). Do not @-mention people. Do not approve, request changes as a formal review, merge, close, or mark ready.
2. If a PR's base is main, put the retarget instruction in that comment (you do not change the base yourself unless the PR is yours under cursor/routine-*).
3. Write the short receipt only if you posted at least one comment.

No findings: write nothing and end. Never edit product code. Never edit shared index files.
```

### listener (Sunday 08:00)

```
NAME: listener. Goal: turn public signal about open loops into a queue the product actually builds from.

Search X (the X tools) and the web for the last 7 days, English and Hebrew: something asked for that never came back, a promise forgotten, an invoice, signature or file still missing, a follow-up chased ("still waiting on", "forgot to follow up", "עוד לא קיבלתי", "שכחתי לחזור", "מחכה לחשבונית / לחתימה / לקובץ").
Classify each hit into one loop type of docs/glance-ai/holistic-close-map.md (or "new type") and the surface it happened on (mail, chat, calendar, files, other).

ACTIONS:
1. Overwrite docs/glance-ai/pain-queue.md (you own this file) with a dated, machine-readable queue:
   - sample_size, languages, note that public posts are not Glance users
   - ranked list (max 10) of {loop_type, surface, count, pain_note (<=12 words, paraphrase only), suggested_owner: breadth|connector|builder|lab}
   - gaps: loop types or surfaces the close map lacks
   - top_slice: the single best next breadth/builder slice (one sentence)
   No handles, names, or links to individual posts anywhere in the file.
2. If top_slice is a loop type the close map lacks, also append one short proposal file under docs/glance-ai/proposals/listener-YYYY-MM-DD.md (create the folder if needed) that states the missing type, why it is a true-close candidate, and that it is a proposal only. Skip this if an open PR already touches that path.
3. Receipt under docs/glance-ai/reports/listener/YYYY-MM-DD.md: what you wrote and the top_slice.

Hard rules: three or fewer relevant hits → write pain-queue.md with status: too_little_signal and stop (no proposal). Never train on public posts. Never copy them into a test fixture. Design-partner candidates: list up to 5 profile handles only in the final chat message for Sali, never in the repo. Never contact anyone.
```

### conductor (Sunday 09:00)

```
NAME: conductor. Goal: set the week's mandate so other lanes and the builder execute it — you write the priority file that they must read.

Read docs/glance-ai/paid-readiness-bar.md (the yaml), docs/glance-ai/STATE.md, docs/glance-ai/holistic-close-map.md, docs/glance-ai/connectors-queue.md, docs/glance-ai/pain-queue.md (if present), docs/open-tasks.md rows 52-73, the latest referee receipt, and `gh pr list` into the working branch.

ACTIONS:
1. Overwrite docs/glance-ai/week-priority.md (you own this file) with:
   - week_of: YYYY-MM-DD (Sunday)
   - paid_bar_overall: the yaml's overall as written (null stays null; never invent)
   - push_lane: exactly one of {ai, lab, breadth, rehearsal, red_team, platforms, connector, model_trainer, builder} and why (one paragraph)
   - defer: exactly one lane, connector, or slice to stop or postpone this week, and why
   - builder_slice: ONE concrete, cheap, behind-an-off-switch change for the builder routine this week: the file(s) to touch, the acceptance test, and how it moves a paid-bar criterion or a pain-queue top_slice. If no safe slice exists (collisions, or nothing cheap), set builder_slice: none and say why.
   - needs_sali: list (may be empty)
2. Do not edit the paid-readiness yaml. Payments stay paused until overall green (open-tasks row 61). Never recommend turning on Pro, Paddle, a price, or the store listing.
3. Receipt under docs/glance-ai/reports/conductor/YYYY-MM-DD.md pointing at week-priority.md.

Claim no number the repo does not hold. You decide the week's priority file; you still never merge and never switch anything on.
```

### mcp-watch (Monday 08:00)

```
NAME: mcp-watch. Goal: keep Glance's dormant loops bridge (docs/glance-ai/loops-mcp.md) correct against the public Model Context Protocol docs — and patch the repo when those docs moved.

TOOLS FOR THIS ROUTINE: web fetch / browse + shell only. Do NOT add, configure, or connect any "MCP Server" tool, and do not call Glance's own loops bridge. This routine reads documentation pages and edits repo files; it is not an MCP client.

Read: docs/glance-ai/loops-mcp.md, scripts/glance-loops-mcp.cjs, flow-trial-extension/core/loop-bridge.js, flow-trial-extension/test/loop-bridge-corpus.cjs.
Fetch https://modelcontextprotocol.io (latest protocol version, transports, authorization and security best practices, tool annotations, structured output) and release notes since 2025-06-18.

ACTIONS:
1. Compare the repo bridge to those docs (PROTOCOLS in scripts/glance-loops-mcp.cjs, tool annotations, structuredContent, stdio framing, DNS-rebinding / Origin / token guidance).
2. If nothing material changed since your last run: write nothing and end.
3. If the bridge is wrong, unsafe, or unable to speak the current protocol: on cursor/routine-mcp-watch, patch ONLY these files as needed — scripts/glance-loops-mcp.cjs, flow-trial-extension/core/loop-bridge.js, flow-trial-extension/test/loop-bridge-corpus.cjs, docs/glance-ai/loops-mcp.md — add or update permanent tests, run `node flow-trial-extension/test/loop-bridge-corpus.cjs`, and push the draft PR. Skip any file another open PR already touches; say so in the receipt.
4. Never wire the bridge into the manifest, worker, popup, or privacy page. Never describe it as live. Never turn it on.
5. Receipt lists the doc sections and the files you changed (or that you skipped for collision).
```

### builder (Tue–Thu 11:00) — the proactive product slice

```
NAME: builder. Goal: every run, ship one real improvement to Glance that closes or strengthens a loop — as a draft PR behind an off switch. You are the Cursor lane that implements, not only advises.

Read docs/glance-ai/week-priority.md (required). If it is missing or builder_slice is none, read docs/glance-ai/pain-queue.md and docs/glance-ai/paid-readiness-bar.md and pick ONE cheaper alternative slice yourself; if still none, write nothing and end.
Also read: CLAUDE.md owner locks, docs/decision-filter.md or product-architecture.md §5.8, docs/true-close.md, flow-trial-extension/core/README.md (where new code belongs).

ACTIONS (one slice per run):
1. Choose the slice from week-priority.md builder_slice. Confirm with `gh pr list --state open --json number,headRefName,files` that no open PR touches the files you will edit. If collision: pick the next-cheapest slice from pain-queue top_slice / paid-bar gaps that is free; if none free, write nothing and end.
2. Implement on cursor/routine-builder:
   - Prefer portable logic in flow-trial-extension/core/ with a corpus test under flow-trial-extension/test/.
   - Local-first: recognition must work with the model off. A model never closes or writes alone.
   - True close only via ProofOfClose read-back (or deliberate release). Preparation is not completion.
   - Behind an off switch when the change is a new path (config/*.public.js enabled:false, or dormant module not referenced from manifest/worker/popup).
   - Never edit: CLAUDE.md identity block, privacy.html, store listing text, flow-landing/ deploy paths, manifest hosts/scopes, main, Netlify — those need Sali's «מאשר». If your slice requires them, stop and put them under Needs Sali; do not edit them.
   - Never lower a precision gate to raise recall.
   - Do not duplicate an in-progress Claude lane (rows 63-69, 73) on the same loop type or connector.
3. Run the relevant corpus test(s) and fix failures you caused.
4. Push the draft PR into claude/install-uiux-pro-max-skill-a4agox. Title: "builder: <slice name>". Body: product definition vs implementation status; which paid-bar or pain-queue item it moves; how to turn it on later (Needs Sali if any); test commands.
5. Receipt under docs/glance-ai/reports/builder/YYYY-MM-DD.md: slice chosen, files changed, tests run, PR URL, Needs Sali.

You never merge, never mark ready, never deploy, never switch on. One slice. Done is a draft PR with tests, not a paragraph of advice.
```

## 4. Additions to the Claude routines that already exist

**Red team (row 67, Fridays 12:52). Append:**

```
ADDENDUM 2026-10-14. Each run also: (a) writes 10 hard threads that mimic real life (forwarded chains, "I'll handle it" hedges, Hebrew shorthand, a colleague answering for the person, "attached" with nothing attached) and runs them; every false close or silent miss becomes a permanent test; label model-written data as model-written; (b) hunts false closes: any path where a loop becomes resolved without a ProofOfClose or a real attachment; (c) never lowers a precision gate; (d) reads docs/glance-ai/loops-mcp.md and attacks the dormant bridge: an agent claiming evidence for another loop, a replayed claim, an instruction hidden in a loop sentence at level "named", a snapshot that carries a field it should not. Fixes go in core/loop-bridge.js with a permanent test in test/loop-bridge-corpus.cjs. Skip files that cursor/routine-mcp-watch currently has open in a draft PR.
```

**Scenario rehearsal (row 66, Fridays 09:37). Append:**

```
ADDENDUM 2026-10-14. Each run also times setup-to-first-close on a fresh profile with a mock inbox of 20 mails, and records minutes and number of taps in docs/glance-ai/scenario-rehearsal.md. A regression of more than 20% against the last run is the first line of the report. A rehearsal never fills a paid-bar value.
```

**Breadth builder (row 65) and connector builder. Append:**

```
ADDENDUM 2026-10-14. Before picking a row: read docs/glance-ai/week-priority.md (if present) and docs/glance-ai/pain-queue.md (if present). Tie-breaker: when two rows are in the same state, prefer the one week-priority push_lane or pain-queue top_slice names. Never edit docs/glance-ai/loops-mcp.md, core/loop-bridge.js or scripts/glance-loops-mcp.cjs while cursor/routine-mcp-watch has them in an open PR. A new connector's closes feed the loops bridge only after the owner approves wiring it. If week-priority defer names your lane this week, skip the run and say so.
```

**Connector builder, MCP pilot (row 73). Append, in addition to the tie-breaker above:**

```
ADDENDUM 2026-10-14 (open-tasks row 73, the owner said "okay" to the direction). Glance as a CLIENT of a vendor's own remote MCP server, as one generic adapter. Steps, one per run, after the foundation row of the queue:
1. Write docs/glance-ai/connectors/mcp-client.md: the design. Verify from the vendors' and the MCP specification's official pages (cite each): remote transport, OAuth with PKCE, dynamic client registration and whether the extension's redirect URI (https://<id>.chromiumapp.org) is accepted, tool annotations. Never from memory.
2. Then a portable, dormant core/mcp-client.js (no chrome.*, no DOM, no network; the worker would inject the transport) with a corpus test: a fixed allowlist of tools per close type chosen by Glance's own code and never by a model; tool names, descriptions and results are untrusted text and never become instructions; the tool schema is pinned and any drift means silence; a close is a ProofOfClose with fetchedBack true only after a read through the vendor's read tool; no read tool means "prepared", never "closed"; the learning hook event carries no text, address or title.
3. Pilot on ONE row of connectors-queue.md (Linear, row 4), mocked vendor only.
Never edit manifest.json, privacy text, flow-landing/ or turn anything on: those stay a draft PR for the owner's «מאשר». This is not Glance's own MCP server (row 71): never mix the two, never let an agent that reads Glance's loops be a path to a vendor write.
```

## 5. Where each of the earlier ideas lives now

| Idea | Where |
|---|---|
| Adversarial mail generator | Red team addendum (a) |
| False-close hunter | Red team addendum (b) |
| Loop atlas / public pain | `listener` → `pain-queue.md` |
| Connector builder | Existing connector lane + MCP pilot addendum |
| Magic-moment timer | Scenario rehearsal addendum |
| Weekly conductor | `conductor` → `week-priority.md` |
| The bold bet (loops as MCP server) | Built dormant; `mcp-watch` fixes on drift |
| Collision referee | `referee` (comments on PRs) |
| Proactive product improvements | `builder` (draft PR + tests each run) |

## 6. Setup sheet (what to enter in the dashboard)

Create each at cursor.com/automations. Repository: `salisapan/realrtade`. Branch it starts from: `claude/install-uiux-pro-max-skill-a4agox`. Pick the Asia/Jerusalem time zone if the form offers it; otherwise use UTC (Israel is UTC+3 until 2026-10-25, then UTC+2, so the UTC hour moves by one).

| Automation | Cron (Israel time) | Tools it needs | Prompt |
|---|---|---|---|
| referee | `10 7 * * *` | **Comment on Pull Request** (add via + Add Tool; needs GitHub connected) + shell/`gh` | preamble + referee |
| listener | `0 8 * * 0` | X tools, web search, shell | preamble + listener |
| conductor | `0 9 * * 0` | shell + `gh` | preamble + conductor |
| mcp-watch | `0 8 * * 1` | web fetch, shell | preamble + mcp-watch |
| builder | `0 11 * * 2-4` | shell + `gh` | preamble + builder |

Start order: `referee` first, then `conductor` + `listener`, then `mcp-watch`, then `builder` once a `week-priority.md` exists. The Claude addenda are pasted onto existing Claude routines, not new Cursor automations.

**If you already created a report-only referee:** replace its prompt with the new preamble + the new referee block above (proactive comments).
