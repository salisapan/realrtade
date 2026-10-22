# outlook-graph-marker (task O)

Supabase Edge function for **flow-ai** project `zjquktirlrhbqcnkfaok` only. Never configure or deploy against `nlvljclvoguvrnntwufu` (RealTrade).

## Behavior

- Microsoft Graph **change notifications** on Inbox messages (`changeType: created`, `Mail.ReadWrite` only).
- Per-user `clientState` (HMAC) validated with constant-time compare; account lookup by `subscriptionId`.
- Runs the same on-device **incoming judge** via `judge.bundle.mjs` (built from `flow-trial-extension/scripts/outlook-marker-judge-entry.mjs`).
- When the judge offers a **Do It** lane (`outlookDraft` / `outlookTask`), PATCHes the message with visible **flag**, category **Glance**, and optional extension idempotency marker.
- **Renews** subscriptions when expiry is under 24 hours (Graph mail max TTL ~4230 minutes).
- **Scheduled** maintenance (`?cron=1` or `?scheduled=1`): renew all accounts, delta catch-up, judge/mark — requires header `x-glance-cron` matching Edge secret `OUTLOOK_MARKER_CRON_SECRET` (401 otherwise; no work enqueued).

## Build judge bundle

```sh
node flow-trial-extension/scripts/bundle-outlook-marker-judge.cjs
```

## Secrets (not in repo)

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (zjquktirlrhbqcnkfaok)
- `MICROSOFT_CLIENT_ID`, `MICROSOFT_TENANT_ID`, `MICROSOFT_SCOPE` (`offline_access Mail.ReadWrite`)
- `OUTLOOK_GRAPH_CLIENT_STATE_SECRET` (or legacy `OUTLOOK_GRAPH_CLIENT_STATE`), `OUTLOOK_GRAPH_NOTIFICATION_URL`
- `OUTLOOK_MARKER_CRON_SECRET` — shared secret for scheduled sweeps (`x-glance-cron` header)

## Migration

`supabase/migrations/20261022103000_outlook_graph_marker.sql` is **not applied** in the code-only delivery; apply manually after review.
