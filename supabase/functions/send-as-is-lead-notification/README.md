# AS-IS lead notification email — setup

Emails the AS-IS team the moment someone submits the `/as-is/contact` form,
via Resend. Without this, submissions land in `public.as_is_leads` and sit
there until someone happens to check the table — the whole point of the
form is a fast follow-up, so this closes that loop. Written and ready; it
needs a few one-time manual steps in your Supabase and Resend dashboards to
go live (this sandbox has no credentials for either, so these can't be run
for you).

## 1. Create a Resend account and get an API key

1. Sign up at https://resend.com.
2. Add and verify a sending domain (Domains → Add Domain, then add the DNS
   records it gives you). Until a domain is verified, Resend only lets you
   send to your own account email — fine for testing, not for real leads.
3. Create an API key (API Keys → Create API Key). Copy it — you won't see
   it again.
4. Edit `index.ts` in this folder:
   - `FROM_ADDRESS` — an address at your verified domain, e.g.
     `"AS-IS GROUP Website <leads@as-isgroup.com>"`.
   - `TO_ADDRESS` — confirm this is the inbox that should receive new leads
     (currently `info@as-isgroup.com`, matching the site's public contact
     address — change it if leads should go somewhere else, e.g. a shared
     sales inbox).

## 2. Add the API key as an Edge Function secret

Using the Supabase CLI (from the repo root, once linked to your project
with `supabase link`):

```bash
supabase secrets set RESEND_API_KEY=re_your_key_here
```

Optional but recommended — a shared secret so only your own webhook can
call this function:

```bash
supabase secrets set AS_IS_LEADS_WEBHOOK_SECRET=$(openssl rand -hex 24)
```

(Both can also be set from the Supabase Dashboard → Edge Functions →
send-as-is-lead-notification → Secrets, if you'd rather not use the CLI.)

## 3. Deploy the function

```bash
supabase functions deploy send-as-is-lead-notification
```

This prints the function's URL, e.g.
`https://<project-ref>.supabase.co/functions/v1/send-as-is-lead-notification`.

## 4. Create the Database Webhook

In the Supabase Dashboard: **Database → Webhooks → Create a new hook**

- Name: `as-is-lead-notification`
- Table: `public.as_is_leads`
- Events: `INSERT` only
- Type: `HTTP Request`
- URL: the function URL from step 3
- Method: `POST`
- Headers: if you set `AS_IS_LEADS_WEBHOOK_SECRET` above, add a header
  `x-webhook-secret: <the same value>` here so the function can verify the
  request came from your own webhook.

That's it — every new row in `as_is_leads` (i.e. every contact form
submission on `/as-is/contact`) now triggers an email to your team within
seconds of the visitor hitting "שליחת הפנייה".

## Notes

- The email is plain text and includes a `reply_to` set to the lead's own
  email when they provided one, so replying goes straight back to them.
- If lead volume ever looks abusive, add a check here or tighten the RLS
  insert policy on `as_is_leads` before it affects your Resend sending
  reputation.
