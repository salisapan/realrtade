# Outlook Graph Glance category marker

**Supabase project ref:** `zjquktirlrhbqcnkfaok` only (`supabase/config.toml`). Do not deploy against any other ref.

Marks inbound Outlook mail with category `Glance` and `flagStatus: flagged` when the bundled `flow-trial-extension/core` judge returns a Do It lane. Stores message IDs only.

## Functions

| Function | Role |
|---|---|
| `outlook-graph-glance` | Graph validation handshake + change notifications |
| `outlook-graph-connect` | Encrypted refresh token + inbox subscription on connect |
| `outlook-graph-jobs` | `?job=renew` / `?job=delta` / `?job=all` maintenance |
| `outlook-graph-loop` | `close` / `undo` / `not_this` category parity |

## Env vars (names only)

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OUTLOOK_TOKEN_ENCRYPTION_KEY`
- `OUTLOOK_GRAPH_CLIENT_STATE`
- `OUTLOOK_GRAPH_CLIENT_STATE_PEPPER` (optional; defaults to client state string)
- `OUTLOOK_GRAPH_NOTIFICATION_URL`
- `MICROSOFT_CLIENT_ID`
- `MICROSOFT_CLIENT_SECRET`
- `OUTLOOK_GRAPH_JOB_SECRET` (optional; required for connect/jobs/loop HTTP)

## Build judge bundle

```sh
node scripts/build-outlook-judge-esm.cjs
node scripts/check-outlook-judge-bundle.cjs
```

## Tests (local, mocks)

```sh
node supabase/functions/outlook-graph-glance/test/outlook-graph-glance.test.cjs
```

## Deploy steps (David — not run by agents)

1. `supabase link --project-ref zjquktirlrhbqcnkfaok` and confirm dashboard URL.
2. Apply `supabase/migrations/20261022120000_outlook_graph_glance_marker.sql` via `supabase db push` or SQL editor.
3. Set edge secrets listed above in the Supabase dashboard.
4. `node scripts/build-outlook-judge-esm.cjs` then deploy functions: `outlook-graph-glance`, `outlook-graph-connect`, `outlook-graph-jobs`, `outlook-graph-loop`.
5. Point Microsoft Graph subscription `notificationUrl` at the deployed `outlook-graph-glance` URL.
6. Schedule `outlook-graph-jobs?job=all` (cron) with `x-outlook-graph-secret` when `OUTLOOK_GRAPH_JOB_SECRET` is set.
