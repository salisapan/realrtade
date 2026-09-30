# Glance / Flow landing database

Migrations in this directory belong to the marketing site
(`flow-landing/`, theflow-ai.com). They do not belong to RealTrade.

| | Project ref | What it is |
|---|---|---|
| **This directory** | `zjquktirlrhbqcnkfaok` | Waitlist, enterprise contact leads, Almost Missed catches |
| **Not this directory** | `nlvljclvoguvrnntwufu` | RealTrade. Do not link or push these migrations there |

`supabase/config.toml` records `zjquktirlrhbqcnkfaok`. The landing
functions hardcode `https://zjquktirlrhbqcnkfaok.supabase.co`. A service-role
key from the other project will be rejected here.

These tables store signup and contact-form rows. They are not an audit
log, an admin console, or an SSO directory. Glance trial and Pro interest
(`source` `trial-extension` or `pricing-pro`) share `public.waitlist` with
the Flow deployment form; company, role, and website are written only by
the deployment form's second step.

## Apply the migration

Apply **only** after the dashboard URL contains `zjquktirlrhbqcnkfaok`.

**SQL editor.** Paste, in order:

1. `migrations/20260705000000_create_waitlist.sql` (skip if `public.waitlist` already exists)
2. `migrations/20260914000000_create_catches.sql` (skip if `public.catches` already exists)
3. `migrations/20260928170000_landing_lead_schema.sql` (adds `company`, `role`, `website`, `confirmed_at`, `ref_code`, and creates `public.leads`)

The new file is safe to re-run. If `public.leads` already exists but a row
violates a check (seat band, deployment, timeline, `en`/`he`), the migration
stops. Fix that row, then run it again. A hand-built row with a null
`email` does not stop the migration; `email` stays nullable in that case.
`submit-lead.js` always sends an email.

**CLI.**

```sh
supabase link --project-ref zjquktirlrhbqcnkfaok
supabase db push
```

`link` stores the ref locally. `config.toml` does not replace that step.

**Confirm.** In the SQL editor for `zjquktirlrhbqcnkfaok`:

```sql
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and table_name in ('waitlist', 'leads')
  and column_name in (
    'company', 'role', 'website', 'confirmed_at', 'ref_code',
    'email', 'seats', 'deployment', 'timeline', 'message', 'source', 'lang'
  )
order by table_name, column_name;
```

`waitlist` should list `company`, `role`, `website`, `confirmed_at`, and
`ref_code`. `leads` should list `email`, `company`, `role`, `seats`,
`deployment`, `timeline`, `message`, `source`, and `lang`.

## Netlify environment variables

Set these on the theflow-ai.com site (Site configuration → Environment
variables). Do not commit values. The service-role key must be the one
for `zjquktirlrhbqcnkfaok`, not RealTrade.

| Variable | Required for | Notes |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | `submit-waitlist`, `submit-lead`, `confirm-signup`, `submit-catch` | Service-role key for `zjquktirlrhbqcnkfaok`. The functions hardcode that project's URL. They do not read a Supabase URL from the environment. Without this key those handlers return 500 and write nothing. |
| `EMAIL_VERIFY_SECRET` | `submit-waitlist` (both steps), `send-confirmation`, `confirm-signup` | Shared HMAC secret. Waitlist create/update refuses to run without it. The homepage qualification step cannot finish without it. |
| `RESEND_API_KEY` | Mail after a row is stored | `submit-lead` still stores the row when this is unset; the sales notification is skipped. Confirmation and playbook mail do not send without it. |

`trial.html` and `pricing.html` insert into `waitlist` from the browser
with the public anon key already shipped in those pages. That key is not
a Netlify secret. It cannot update `company`, `role`, `website`, or
`confirmed_at` (row level security). Those columns are written by the
functions above, using the service-role key.

## Edge function in this folder

`functions/send-waitlist-welcome/` is not what the landing pages call.
Signup mail goes through Netlify `send-confirmation` and `confirm-signup`.
Deploying the edge function is not required for leads or the waitlist to
be stored. If you do deploy it, link the same project ref,
`zjquktirlrhbqcnkfaok`.
