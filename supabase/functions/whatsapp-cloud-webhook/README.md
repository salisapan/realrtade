# WhatsApp Cloud API webhook (W4)

Target project: `zjquktirlrhbqcnkfaok` only.

## Secrets (dashboard → Edge Functions)

| Name | Purpose |
|---|---|
| `SUPABASE_URL` | Auto-injected in hosted functions |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto-injected; webhook inserts only with this role |
| `WA_META_APP_SECRET` | HMAC `X-Hub-Signature-256` verification |
| `WA_META_VERIFY_TOKEN` | GET subscribe handshake |

Do not commit values. Do not deploy from this PR without owner «מאשר».

## Local

```sh
supabase link --project-ref zjquktirlrhbqcnkfaok
supabase functions serve whatsapp-cloud-webhook --no-verify-jwt
```
