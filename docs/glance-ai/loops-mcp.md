# Glance loops as a local MCP server (dormant)

> Written 2026-10-14 at the owner's request ("execute the bold bet, wisely: an addition, not a contradiction of what the product is"). Companion to `docs/product-architecture.md` §5.7–§5.8, `docs/true-close.md` §7 (ProofOfClose), `docs/multi-platform.md`, `docs/glance-ai/holistic-close-map.md`.

## 0. Two parts, kept apart

**Product definition (vision-locked, unchanged by this document).** Glance closes open loops. Gmail is where it starts today. Its loop is detect → carry → execute → true close. It stays silent when uncertain, never sends on the person's behalf without a preview and a click, treats preparation as not completion, and counts a loop closed only on real completion or a deliberate release. Flow, the enterprise product, is separate. This document changes none of that.

**Current implementation status (code reality, this commit).** Built and tested, **dormant**: `core/loop-bridge.js` (the contract), `scripts/glance-loops-mcp.cjs` (a local MCP server), `test/loop-bridge-corpus.cjs` (111 checks, including the real server driven over real MCP framing by a scripted client). **Nothing in the extension talks to it:** not the manifest, not the service worker, not the popup, not a content script (the corpus asserts that). It has not been tried with Cursor, Claude Desktop or any other real MCP client, only with a scripted one.

## 1. What it is, and why it is an addition

People already run agents next to Glance (Cursor, Claude, Grok, whatever comes next). Those agents do real work that closes loops (they create a task, save a file, draft a document) and they cannot see what is open, so they duplicate, forget, or tell the person something is "done" that Glance does not count as done.

The bridge gives those agents **two things and nothing else**:

1. **Sight**: which loops are open, how old, how overdue, and what would close each one.
2. **A way to report**: "I did X, here is its id in that system." That is **evidence, and evidence is a claim**.

Glance stays the only judge. A loop closes when Glance itself reads the result back from the system that holds it (`ProofOfClose`: `{ system, externalId, fetchedBack, verifiedAt }`), exactly as today. An agent's report moves nothing.

Why this serves the product instead of changing it: the product is carrying a loop until it really closes. Today only Glance's own surfaces can carry a loop. With the bridge, work done anywhere the person already works becomes *evidence toward the same close*, and the loop keeps its single, strict definition of done. It is not a connector marketplace: Glance connects to no new system by this, it is *read* by the person's own agents, on the person's own computer, when the person turns it on.

## 2. The decision filter (`docs/product-architecture.md` §5.8)

| Question | Answer |
|---|---|
| Closer to "you intend, we execute"? | Yes, from the other side: an agent that executes part of an intention can show Glance what it did, and Glance verifies it. |
| Raises the feeling that things get closed? | Only if the close stays strict. An agent never closes; "claimed" is shown as claimed. A wrongly closed loop would be the worst outcome, so the design makes it impossible rather than unlikely. |
| Protects precision and silence? | Yes. Nothing is published unless the person turned it on. A loop with no open requirement is not listed. "Nothing is open" is a valid answer and the instructions tell the agent to say it. |
| Zero-Prompt? | One opt-in, once, when it is wired (§9). No recurring question. |
| Compounding value? | Yes: every agent the person uses becomes a source of evidence, and every verified claim is a labelled outcome for the learning paths already approved (`docs/glance-ai/learning-from-use.md`). |

## 3. What it will never do (each line is enforced by a test)

- **No tool closes, releases, sends, nudges, creates, deletes or writes anything.** There are three tools (§4). The corpus fails if a fourth appears or any name contains close, release, send, nudge, create, delete, write, remind, draft, resolve or done.
- **Evidence never closes a loop.** A claim that sets `closed`, `close`, `fetchedBack`, `verifiedAt`, `status`, `release`, `sent` or `resolved` is refused with "that is Glance's alone to set".
- **No personal data at the default level** (§5): no name, address, sentence, subject, thread id, amount, attachment or message body.
- **No outbound request of any kind.** The server only listens on `127.0.0.1`. The corpus fails if either file can call `fetch`, `http.request`, `child_process`, a socket client or a WebSocket.
- **Not reachable from a web page.** Loopback Host only (DNS-rebinding), no web Origin (only none, or the extension's own), a bearer token compared in constant time.
- **It does not change what Glance promises**: it never sends mail, it adds no model call, and it does not make Glance an assistant that writes for the person.

## 4. The three tools

| Tool | What it does | Annotations |
|---|---|---|
| `glance_open_loops` | Lists open loops (filter by `direction`, `overdue`, `limit`). | read-only |
| `glance_loop` | One open loop by id: what closes it, what Glance needs to see first, and the unverified claims against it. | read-only |
| `glance_propose_evidence` | Records a **claim**: `loopId`, `system` (`google/tasks`, `microsoft/onedrive`, …), `externalId`, optional https `url` and one-line `note`. Returns `status: "claimed", closed: false`. At most three unverified claims per loop; the same claim twice is stored once. | not read-only, not destructive, idempotent |

The server's `instructions` (sent on `initialize`) tell the agent: it cannot close anything, evidence is a claim, never tell the person a loop is closed because it proposed evidence, and say "nothing is open" when nothing is.

## 5. What leaves, by level

| Field | `minimal` (default) | `named` (a separate, explicit choice, later) |
|---|---|---|
| Opaque id (`lp_` + hash of the loop id and this install's salt) | yes | yes |
| Direction (waiting on them / owed by you), kind (reply / payment), stage, days open, due day, next look day, overdue, what closes it | yes | yes |
| Money | only that there is some (`hasAmount`) | the figure and the currency |
| Who | no | a first name, or a company domain; never an address |
| What was asked | no | one sentence, masked by `core/privacyShield.js` and scrubbed again (addresses, links, numbers) |
| Thread id, message id, subject, body, attachments, phone, address | **never** | **never** |

Whatever an extension publishes, the server rebuilds the snapshot from an allowlist and scrubs every string again, so a bug on the publishing side cannot carry a field through.

Agents may be hosted in the cloud (a cloud model is reading the answer). Anything the bridge returns can therefore reach that provider. That is why the default is the smallest useful view, and why `named` is a separate consent when it is wired.

## 6. The doors

```
agent ──MCP over stdio──▶ scripts/glance-loops-mcp.cjs ◀──loopback HTTP 127.0.0.1──  extension (later)
                              state in memory: snapshot + claims
```

Loopback endpoints (all need `Authorization: Bearer <token>`, a loopback `Host`, and no web `Origin`): `POST /snapshot` (publish), `GET /proposals` (collect claims), `POST /proposals/ack` (handled), `GET /health`. Bodies are capped at 256 KB. The token is `GLANCE_LOOPS_TOKEN` (16+ characters); without it, and without `--snapshot`, the server refuses to start. stdout carries only JSON-RPC; the token and loops are never logged.

## 7. How a claim could become a close (not built)

1. The extension collects claims (`GET /proposals`) while the person has the bridge on.
2. For each claim it uses a reader it already has for that `system` (Google Tasks, Microsoft To Do, OneDrive, Drive, Notion, … see `core/proof-of-close.js` and the connector queue) and **reads the result back itself**. A system it cannot read is not verified, ever.
3. Only a successful read-back produces a `ProofOfClose`, and only then does the normal close path run, with Undo, remount and the receipt, as for any close.
4. The claim is acknowledged (`POST /proposals/ack`) whether it verified or not, and the outcome is a labelled example for the learning paths.

## 8. Threats considered

| Threat | Answer |
|---|---|
| An agent says "done" to close a loop | There is no tool that closes; evidence is stored as a claim; the forbidden fields are refused (corpus). |
| An agent claims evidence for someone else's loop | Claims refer to opaque ids from the snapshot only, and are re-read by Glance before they mean anything. |
| A web page talks to the server | Loopback Host check, Origin check, bearer token (corpus). |
| DNS rebinding | Host header must be loopback (corpus). |
| Token guessing | Constant-time comparison; 16-character minimum; loopback only. |
| Personal data in a snapshot | Minimal default; allowlist rebuild; second scrub; opaque ids with a per-install salt (corpus). |
| Prompt injection through a loop sentence | The sentence exists only at `named` level, masked and clipped to 140 characters; the instructions tell the agent the text is data. The red-team routine attacks this every Friday (`docs/glance-ai/routines.md`). |
| A flood of claims | Three unverified claims per loop; 200 in all; 256 KB bodies. |
| A bug that lets the server act | It has no outbound network and no way to run a command (corpus checks the source). |

## 9. Activation checklist (every step is the owner's «מאשר»)

This changes what leaves the device and a store permission, so it needs the same-commit privacy and store changes that `CLAUDE.md` requires.

1. The owner approves wiring (this is not built).
2. Extension client behind an off switch (`config/loops-bridge.public.js`, `enabled: false`): publish a snapshot (`FlowLoopBridge.publicSnapshot`) on change and collect claims. The manifest already lists `http://127.0.0.1/*` as an **optional** host (used by the local model server), so no new install-time permission is expected; confirm that on the day.
3. A popup row: off by default, one opt-in, shows the token setup and which level is on; `named` is a second, separate choice.
4. The verifier of §7, with the connectors that already have a read-back.
5. `flow-landing/privacy.html`, `trial.html`, the popup footer and the store text name what the bridge shows, to whom (the person's own agents, which may be cloud-hosted) and at which level.
6. A real-client check (Cursor and Claude, over stdio) and a real-Gmail check that a claim never closes a loop and a verified one does, with Undo.
7. `docs/vault/decisions.md` gets the one dated line, `open-tasks.md` row 71 changes status.

## 10. Try the server by hand (development only)

```sh
cd flow-trial-extension
node -e "const {FlowLoopBridge:B}=require('./core/loop-bridge.js');console.log(JSON.stringify(B.publicSnapshot([{id:'w1',status:'waiting',kind:'reply',direction:'theirs',createdAt:'2026-10-03T08:00:00Z',deadlineIso:'2026-10-10',stage:'nudged'}],{salt:'dev',now:Date.now()})))" > /tmp/loops.json
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"glance_open_loops","arguments":{}}}' | node ../scripts/glance-loops-mcp.cjs --snapshot /tmp/loops.json
```

For Cursor, add to `~/.cursor/mcp.json` (an absolute path; development snapshot only): `{ "mcpServers": { "glance-loops": { "command": "node", "args": ["/abs/scripts/glance-loops-mcp.cjs", "--snapshot", "/tmp/loops.json"] } } }`.

## 11. Tests

`node flow-trial-extension/test/loop-bridge-corpus.cjs`: projection and leaks (minimal and named), the allowlist rebuild, the three tools, every refused claim, the loopback/Origin/token doors, and the real server driven over real MCP framing (initialize, tools/list, tools/call, the HTTP endpoints, 401/403/413/400, the file mode, the refusal to start without a token), plus checks that neither file can make an outbound request and that nothing in the extension references the bridge.
