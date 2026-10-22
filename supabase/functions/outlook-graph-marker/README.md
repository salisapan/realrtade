# outlook-graph-marker (task O)

Supabase Edge function for **flow-ai** project `zjquktirlrhbqcnkfaok` only. Never configure or deploy against `nlvljclvoguvrnntwufu` (RealTrade).

## Behavior

- Microsoft Graph **change notifications** on Inbox messages (`Mail.ReadWrite` only).
- Validates `clientState` against `OUTLOOK_GRAPH_CLIENT_STATE`.
- Runs the same on-device **incoming judge** via `judge.bundle.mjs` (built from `flow-trial-extension/scripts/outlook-marker-judge-entry.mjs`).
- When the judge offers a **Do It** lane (`outlookDraft` / `outlookTask`), PATCHes the message with category **Glance** and extension flag `glanceServerMarker`.
- **Renews** subscriptions when expiry is under 7 days; supports **delta** catch-up fields on `outlook_graph_accounts`.

## Build judge bundle

```sh
node flow-trial-extension/scripts/bundle-outlook-marker-judge.cjs
```

## Secrets (not in repo)

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (zjquktirlrhbqcnkfaok)
- `MICROSOFT_CLIENT_ID`, `MICROSOFT_TENANT_ID`, `MICROSOFT_SCOPE` (`offline_access Mail.ReadWrite`)
- `OUTLOOK_GRAPH_CLIENT_STATE`, `OUTLOOK_GRAPH_NOTIFICATION_URL`

## Migration

`supabase/migrations/20261022103000_outlook_graph_marker.sql` is **not applied** in the code-only delivery; apply manually after review.
