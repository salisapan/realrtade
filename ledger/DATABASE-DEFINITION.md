# Database definition

Glance closes open loops. Gmail is where it starts today.

The event log is append-only. Readers upcast old rows in memory and do not rewrite them.

## Store

- IndexedDB database `glance-closed-intent-ledger`, object store `events`, key `id`.
- Indexes: `time`, `type`, `engine_version`, `decision_id`, `source_id` (source + id, the dedupe key).
- chrome.storage.local keeps settings and cursors only: opt-in, install uuid, seq, cap, retention, rolled counts.
- A future server sink is not implemented.

## Envelope

CloudEvents 1.0. `seq` is an extension attribute. `type` is one of:

- `ai.theflow.glance.intent.decision.v1`
- `ai.theflow.glance.intent.shown.v1`
- `ai.theflow.glance.intent.clicked.v1`
- `ai.theflow.glance.intent.closed.v1`
- `ai.theflow.glance.intent.undone.v1`
- `ai.theflow.glance.intent.failed.v1`
- `ai.theflow.glance.intent.dismissed.v1`
- `ai.theflow.glance.intent.missed.v1`

## Retention

365 days, deleted by a chrome.alarms job after the counts are folded.
