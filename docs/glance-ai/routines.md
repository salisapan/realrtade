# Routines: who runs what, and how nothing collides

> Written 2026-10-14 for the owner, the Claude lanes, David's agents (Grok bot, CoS) and any Cursor routine. Status of each Claude lane is in `docs/open-tasks.md` rows 63–69; this page is the map and the rules between them. Times are Israel time and are copied from those rows: if the dashboards say otherwise, fix this table.

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

Cursor routines added 2026-10-14 (section 3) own only their own report directory, so they cannot overlap any row above.

## 2. Lane rules (every routine, every agent)

These are the rules that stop two agents stepping on each other. The first one comes from a real mistake: `main` is 80+ commits behind the working branch, and facts read from `main` are wrong.

1. **The working branch is `claude/install-uiux-pro-max-skill-a4agox`.** `git fetch origin` and read from it. Never take a fact from `main`.
2. **One owner per file.** A routine writes only inside what it owns (column "Owns"). The shared index files (`docs/open-tasks.md`, `docs/README.md`, `docs/vault/decisions.md`, `flow-trial-extension/core/README.md`) belong to the Claude lanes and CoS: a report-only routine never edits them.
3. **Branches by prefix.** `claude/*` Claude, `cos/*` David, `cursor/*` Cursor. Never push to a prefix that is not yours. PRs go into the working branch, as drafts. No force push, no merge, no close.
4. **The three-condition auto-merge rule stays** (`CLAUDE.md`): all green, behind an off switch, and no changed file also changed by another open PR. A Cursor routine never merges.
5. **Check before you write:** `gh pr list --state open --json number,headRefName,files` and stop if an open PR touches a file you are about to write.
6. **`docs/open-tasks.md` row numbers are taken in order, by the Claude lanes.** A report-only routine proposes a row in its report; it does not add one.
7. **The bridge** (`docs/vault/bridge/`, draft PR #77, never merged, never closed) is for Claude and CoS. A Cursor routine does not post there unless its prompt says so.
8. **Silence is a result.** A routine with nothing to report writes nothing.
9. **No invented numbers.** Usage, installs, revenue and accuracy are "not measured" until the repo holds them. Status is stated as code reality, apart from the product definition.
10. **Nothing is sent, deployed or switched on** by a routine. Anything only the owner can do goes in the report under "Needs Sali", one line each.

## 3. New Cursor routines

All four are report-only. Each owns `docs/glance-ai/reports/<name>/` and one long-lived branch `cursor/routine-<name>` with one draft PR into the working branch, reused every run.

| Name | When | Question it answers |
|---|---|---|
| `referee` | daily 07:10, before the 07:30 standup | Are two agents about to collide? |
| `listener` | Sunday 08:00, before the product lab proposes at 14:52 | How do real people describe loops that stay open, and on which surface? |
| `conductor` | Sunday 09:00, after the listener | Where does Glance stand against its own paid-readiness bar, and which existing lane should get priority this week? |
| `mcp-watch` | Monday 08:00 | Is the dormant loops bridge still correct against the MCP specification? |

### Preamble (paste at the top of every Cursor routine prompt)

```
You are a Cursor routine for Glance (repo salisapan/realrtade). Glance closes open loops. Gmail is where it starts today. Flow, the enterprise product, is separate: never mix them.

LANE RULES (binding)
1. The working branch is claude/install-uiux-pro-max-skill-a4agox. Run `git fetch origin` and read from it. `main` is old and wrong for this work: never take a fact from main.
2. Read first: CLAUDE.md (owner locks), docs/README.md, docs/open-tasks.md, docs/glance-ai/routines.md (the lane map).
3. You own exactly one directory: docs/glance-ai/reports/<your-name>/. Write only there. Never edit anything else: not CLAUDE.md, the identity block, manifest.json, flow-landing/, privacy text, any config switch, glance-ai/, docs/open-tasks.md, docs/README.md, docs/vault/decisions.md.
4. Use one long-lived branch cursor/routine-<your-name> and one draft PR into claude/install-uiux-pro-max-skill-a4agox, reused every run (push a new commit). Never force push, never merge, never close, never mark ready.
5. Before writing, run `gh pr list --state open --json number,headRefName,files`. If another open PR touches your directory, stop and say so.
6. Do not post to Slack, ClickUp or PR #77. Do not send mail. Do not deploy. Do not turn a switch on.
7. Be honest: state status as code reality, apart from the product definition. Never invent usage, revenue, accuracy or install numbers: write "not measured". If nothing changed since your last report, write nothing and end.
8. Anything only Sali can do goes under "Needs Sali" at the top of the report, one line each.
```

### referee (daily 07:10)

```
NAME: referee. Read-only, apart from your report. Goal: stop the agents from stepping on each other.
Check from the working branch and the open PRs:
a. Overlaps (the third auto-merge condition): for every pair of open PRs, the files changed in both. Name the PRs and the files.
b. PRs whose base is main (nearly all should target claude/install-uiux-pro-max-skill-a4agox) or whose branch prefix is not claude/, cursor/ or cos/.
c. docs/open-tasks.md row numbers: duplicates or collisions between the working branch and the open PR branches (`git show origin/<branch>:docs/open-tasks.md`). Two PRs adding the same row number are a conflict waiting to happen.
d. Two lanes building the same loop type or connector in different open PRs (docs/glance-ai/holistic-close-map.md, docs/glance-ai/connectors-queue.md).
e. A lane open-tasks calls "in progress" that has produced no commit or PR in 10 days.
Report only findings, each with PR numbers and one suggested action for the owner. No findings: write nothing and end.
```

### listener (Sunday 08:00)

```
NAME: listener. Goal: learn, from public posts, how real people describe loops that stay open, to sharpen what Glance closes first.
Search X (the X tools) and the web for the last 7 days, English and Hebrew: something asked for that never came back, a promise forgotten, an invoice, signature or file still missing, a follow-up chased ("still waiting on", "forgot to follow up", "עוד לא קיבלתי", "שכחתי לחזור", "מחכה לחשבונית / לחתימה / לקובץ").
Classify each hit into one loop type of docs/glance-ai/holistic-close-map.md (or "new type") and the surface it happened on (mail, chat, calendar, files, other).
Write docs/glance-ai/reports/listener/YYYY-MM-DD.md: counts per loop type and surface; the top 5 themes in your own words (paraphrase; no quote over 8 words; no handles, names or links to individual posts); any loop type or surface the close map lacks; one sentence on what this suggests for the next breadth slice. State the sample size every time and that X and the open web are not Glance's users.
Hard rules: no handles, names or post links in the repo. Three or fewer relevant people: say the week had too little signal and stop. Public posts are an evaluation aid only: never train on them, never copy them into a test fixture.
Design-partner candidates: never in the repo. List up to 5 profile handles (professionals who describe the pain in detail) only in the final message of this run, for Sali. Never contact anyone.
```

### conductor (Sunday 09:00)

```
NAME: conductor. Goal: one honest page on where Glance stands against its own paid-readiness bar, and which existing lane should get priority this week. You recommend; you decide nothing.
Read docs/glance-ai/paid-readiness-bar.md (the yaml), docs/glance-ai/STATE.md, docs/glance-ai/holistic-close-map.md, docs/glance-ai/connectors-queue.md, docs/open-tasks.md rows 52-70, the latest reports of listener and referee, and `gh pr list` into the working branch.
For each criterion in the yaml: the current value as written (a null stays null and red; never fill it from a proxy), the gap, the cheapest move that closes it, and WHICH existing lane owns that move (rows 63 AI, 64 lab, 65 breadth, 66 rehearsal, 67 red team, 69 platforms, the connector builder, the model trainer).
Then: the one lane that should get priority this week and why (one paragraph), and one thing to STOP or defer this week (a lane, a connector or a slice) with the reason.
Rules: payments stay paused until the yaml says overall green (open-tasks row 61). Never recommend turning on Pro, Paddle, a price or the store listing. Do not edit the yaml. You may propose a connector the owner has not queued, as a proposal for the owner to queue. Claim no number the repo does not hold.
Write docs/glance-ai/reports/conductor/YYYY-MM-DD.md.
```

### mcp-watch (Monday 08:00)

```
NAME: mcp-watch. Goal: keep Glance's loops MCP server (docs/glance-ai/loops-mcp.md, scripts/glance-loops-mcp.cjs, flow-trial-extension/core/loop-bridge.js) correct against the MCP specification and honest about who can use it. It is dormant and must stay safe. You do not edit the server or the core.
Fetch the current MCP specification (modelcontextprotocol.io: latest protocol version, transports, authorization and security best practices, tool annotations, structured output) and the release notes since 2025-06-18. Compare with what the server speaks (PROTOCOLS in scripts/glance-loops-mcp.cjs, tool annotations, structuredContent, stdio framing).
Write docs/glance-ai/reports/mcp-watch/YYYY-MM-DD.md with: (1) any spec change that makes the server wrong, unsafe or unable to connect, with the section; (2) any new security guidance the bridge does not follow (DNS rebinding, origin checks, token handling, tool poisoning, confused deputy); (3) which agent clients currently support stdio MCP servers and tool annotations. Nothing else. No change since last time: write nothing.
Never describe the bridge as live: it stays dormant until Sali approves wiring it (docs/glance-ai/loops-mcp.md section 9).
```

## 4. Additions to the Claude routines that already exist

Ideas that the owner and Claude already run as lanes should not be duplicated by a second routine. Append these paragraphs to the existing prompts instead.

**Red team (row 67, Fridays 12:52). Append:**

```
ADDENDUM 2026-10-14. Each run also: (a) writes 10 hard threads that mimic real life (forwarded chains, "I'll handle it" hedges, Hebrew shorthand, a colleague answering for the person, "attached" with nothing attached) and runs them; every false close or silent miss becomes a permanent test; label model-written data as model-written; (b) hunts false closes: any path where a loop becomes resolved without a ProofOfClose or a real attachment; (c) never lowers a precision gate; (d) reads docs/glance-ai/loops-mcp.md and attacks the dormant bridge: an agent claiming evidence for another loop, a replayed claim, an instruction hidden in a loop sentence at level "named", a snapshot that carries a field it should not. Fixes go in core/loop-bridge.js with a permanent test in test/loop-bridge-corpus.cjs.
```

**Scenario rehearsal (row 66, Fridays 09:37). Append:**

```
ADDENDUM 2026-10-14. Each run also times setup-to-first-close on a fresh profile with a mock inbox of 20 mails, and records minutes and number of taps in docs/glance-ai/scenario-rehearsal.md. A regression of more than 20% against the last run is the first line of the report. A rehearsal never fills a paid-bar value.
```

**Breadth builder (row 65) and connector builder. Append:**

```
ADDENDUM 2026-10-14. Tie-breaker: when two rows are in the same state, prefer the one that the latest docs/glance-ai/reports/listener/ report names most, if that report exists. Never edit docs/glance-ai/loops-mcp.md, core/loop-bridge.js or scripts/glance-loops-mcp.cjs. A new connector's closes feed the loops bridge only after the owner approves wiring it.
```

## 5. Where each of the seven earlier ideas lives now

| Idea | Where |
|---|---|
| Adversarial mail generator | Red team addendum (a) |
| False-close hunter | Red team addendum (b) |
| Loop atlas, ranked by frequency, pain and can-it-be-proved | `holistic-close-map.md` + the paid-bar's `frequency_weight`, read weekly by `conductor`, fed by `listener` |
| Connector builder | The existing connector builder and `connectors-queue.md` (tie-breaker addendum) |
| Public-pain listener | `listener` |
| Magic-moment timer | Scenario rehearsal addendum |
| Weekly conductor | `conductor` |
| The bold bet (loops as MCP) | Built dormant: `docs/glance-ai/loops-mcp.md`; watched by `mcp-watch` |
| (new) Collision referee | `referee` |
