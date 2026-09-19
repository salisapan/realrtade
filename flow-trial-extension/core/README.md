# core/ — the portable brain

This directory holds the parts of Glance that are actually the product's
intelligence, as opposed to the parts that make it specifically a Chrome
extension talking to Gmail. The split exists for one reason: Glance (personal,
Zero-Prompt, a Chrome extension) and Flow (a future enterprise runtime with
its own governance, security, and deployment model) are two different
products that must be able to share one brain without one of them being
rewritten to get there.

## The rule

**Nothing in `core/` may reference `chrome.*`, `document`, `window`, or any
other global that only exists inside a browser extension or a web page.**

Every file here is loaded two ways today, and must keep working both ways:

1. As a plain `<script>` in a Chrome MV3 content script or the popup, sharing
   one global scope with the other core files and with `src/`.
2. Via `require()`/`vm.runInContext()` under plain Node, with no browser
   globals at all — every `test/*.cjs` file in this repo does exactly this,
   and it's the reason `core/` was already almost entirely decoupled before
   this directory existed: nothing in here has ever been able to assume a
   DOM or a `chrome` object was present.

That second constraint is not a testing convenience — it is a rehearsal for
the third way this code will eventually be loaded: inside whatever Flow's own
server-side or edge runtime turns out to be. If a module in `core/` runs
correctly under Node today, adding Flow later means writing a new *host* for
it, not touching the module.

## What lives here, and why

| Module | What it owns |
|---|---|
| `domains.js` | Per-field vocabulary and phrasing (sales, legal, finance, ops, support, hr). Data, not rules. |
| `connectors.js` | The catalog of destinations Glance can write to and how each authenticates. Data, not a rule engine. |
| `extract.js` | Pulls the amount, date, and decisive sentence out of plain text. No network, no state. |
| `judgment.js` | The scorer and the adaptive threshold — **this is where precision-vs-harm tracking actually lives**: `thresholdFrom()` takes a plain `{clicks, dismissals, ts}` triple and returns a number, with zero opinion about where that triple came from or how it's persisted. |
| `intent.js` | Classifies extracted facts into one of five intent types. |
| `actions.js` | Turns a classified intent into a named PROCESS with ordered steps, applying Execution Memory's bias. |
| `execution-memory.js` | The append-only log of what an account actually does with a proposed process, and the fold that turns it into per-step accept/remove/undo/pin counts. Storage is an **injected adapter** (see below), not a hardcoded call. |
| `privacyShield.js` | Finds and masks every sensitive span in text before it's allowed to leave the device. |
| `docreader.js` / `docwriter.js` | Read and write real `.docx` files using only Web Platform APIs (`Blob`, `TextEncoder`/`TextDecoder`, `DecompressionStream`) — no browser-only API, which is why these already run under Node unmodified. |

Notably absent: **storage.js stays in `src/`.** It is Glance's own choice of
*how* to remember things (`chrome.storage.local`, capped logs, weekly/badge
counters derived from them) — a client concern. A future Flow deployment
would persist its equivalent state completely differently (per-tenant
database rows, most likely), and it should be able to do that without
`core/` changing at all. `judgment.js`'s `thresholdFrom(calibration)` already
proves this works: the function is pure, and `storage.js`'s `calibrate()` is
just today's chosen way to keep the input it needs fed. Follow that pattern
for anything new.

## The adapter pattern (how a core module gets persistence)

`execution-memory.js` is the one module here that needs to remember
something across calls, so it's the reference example for how a `core/`
module gets durable storage without knowing what host it's running on:

```js
// Inside the module: a tiny interface, and a safe, non-durable default.
let adapter = inMemoryAdapter(); // never throws, never touches a host global

function setStorageAdapter(next) { adapter = next; }
// ...business logic calls adapter.get(key) / adapter.set(key, value) only.

return { /* ...business functions... */, setStorageAdapter };
```

The host wires in whatever persistence it actually has, from the *client*
side:

```js
// src/chrome-storage-adapter.js — pure client glue, zero business logic.
FlowExecutionMemory.setStorageAdapter({
  async get(key) { return (await chrome.storage.local.get(key))[key]; },
  async set(key, value) { await chrome.storage.local.set({ [key]: value }); }
});
```

A future Flow runtime writes its own version of that second file — a
database-backed adapter, say — and never touches `execution-memory.js`. If a
new `core/` module ever needs to persist something, give it this same shape
rather than reaching for `chrome.storage.local` directly.

## Deciding where new code belongs

Ask this before writing anything:

- **Would Flow's future enterprise runtime need this exact logic, unchanged,
  regardless of what UI or channel it's running behind?** → `core/`. Intention
  classification, process planning, Execution Memory, precision/harm
  calibration, and anything that transforms extracted facts into a decision
  belongs here.
- **Is this about *how Glance specifically* shows something, stores
  something, or talks to Gmail/Chrome?** → `src/` (or `popup/`). The chip, the
  Morning Brief, the Weekly Closing Summary banner, the extension-icon badge,
  Gmail DOM scraping, `chrome.storage.local` itself, and every connector's
  actual `fetch()` call all belong there.
- **Genuinely unsure?** Write it as if it belongs in `core/` (no host
  globals, plain functions, injected dependencies for anything external) —
  that version can always be *used* client-side, while the reverse (pulling
  browser coupling back out of something already shipped) is the rewrite this
  split exists to avoid.

## What this does *not* do

This is a code-organization boundary, not a running second product. There is
no server, no multi-tenant anything, no governance layer, no edge runtime
here yet — building those is explicitly future work. The only claim this
directory makes is: when that work starts, the modules above are already in
the right shape to be reused, not rewritten.
