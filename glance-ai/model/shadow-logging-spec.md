# Real-traffic shadow logging: spec for the extension (implementer: Dima)

> Design only, 2026-10-07. Nothing here has been built in `salisapan/realrtade`. It applies the locked decisions: training consent is opt-in and **off by default**; the in-house model runs **on the Glance server first**.

## Goal
Every judged message records what the incumbent decided and what the candidate would have decided. The candidate never adds a card. The log only measures. That data becomes (a) real-traffic shadow metrics for the M3 gate and (b) the queue for owner labeling.

## When it runs
- `consent.shadow === true` (new popup toggle, **off by default**, its own copy separate from the training-consent toggle). When consent is off, it logs nothing. No counters either.
- Runs on every place `FlowIncomingJudge.judge` is called (Gmail chip, OWA card, Graph planner). It also runs on our own silences: `own-sender`, `note-to-self`, `quiet:*`.

## Record (one per judged message, stored locally first)
```json
{ "v": 1, "ts": "ISO", "surface": "gmail|outlook", "direction": "inbound|outbound|self",
  "msgKey": "sha256(account salt + messageId)",          // never the raw id
  "textHash": "sha256(redacted own text)", "lang": "he|en|mixed", "attachmentCount": 0,
  "features": [hashed indices from model/train/featurize.cjs],   // no text leaves the device in shadow mode
  "incumbent": { "show": true, "reason": "show|<silence reason>", "label": "<family>|<step>" },
  "candidate": { "model": "v1@<sha>", "label": "SILENT|<family>|<step>", "pShow": 0.0, "veto": "base|v2|cap|null" },
  "outcome": { "clicked": false, "dismissed": false, "fetchedBack": false, "undone": false } }   // filled later by the existing receipt/undo paths
```
- **No body or subject text.** Hashed features plus hashes only. Redacted text (privacyShield / mask-ids) is captured **only** when the owner labels a row in a session, and only when `consent.training === true`.
- Retention: 30 days local, ring buffer capped at 5k rows. Upload to the Glance server is a separate opt-in. It is batched and authenticated, and the server never sees raw text.

## Where the candidate runs
- Phase 1 (server-first, matching lock #3): the extension sends the `features` vector, never text. The server runs `artifacts/<v>.onnx` and returns `{label, pShow}`. If that fails or exceeds a 300 ms timeout, the candidate is recorded as `null`. The user-visible path is never affected.
- Phase 2 (on-device): `runtime/glance-model.cjs` plus `<v>.weights.json` (~0.9 MB int8 sparse) loads in the service worker.

## Owner label queue (feeds labeling/owner-gold.jsonl)
Rows are queued for Sali's ~20/day session in this priority order:
1. disagreement where the candidate would show and the incumbent is silent (potential wrong-Do-It, or a teacher miss)
2. disagreement where the incumbent shows and the candidate is silent (potential teacher wrong-Do-It)
3. any `outcome.undone` or dismissed card
4. a random 10% of agreements, so the gold set is not only hard cases

## Gate metrics computed from the log
wrong-Do-It (candidate shows and owner/incumbent says SILENT), missed-close, per-family agreement, and veto hit rates. These feed `shadow/run-shadow.cjs`-style reports. The M3 swap still requires ≥200 owner labels plus a full shadow week.
