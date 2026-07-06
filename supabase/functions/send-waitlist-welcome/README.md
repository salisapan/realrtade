# Waitlist welcome email — setup

Sends a real welcome email the moment someone joins the waitlist, via
Resend. This function is written and ready; it needs a few one-time
manual steps in your Supabase and Resend dashboards to go live (this
sandbox has no credentials for either, so these can't be run for you).

## 1. Create a Resend account and get an API key

1. Sign up at https://resend.com (free tier covers a waitlist easily).
2. Add and verify a sending domain (Domains → Add Domain, then add the
   DNS records it gives you). Until a domain is verified, Resend only
   lets you send to your own account email — fine for testing, not for
   real signups.
3. Create an API key (API Keys → Create API Key). Copy it — you won't
   see it again.
4. Edit `index.ts` in this folder and replace `FROM_ADDRESS` with an
   address at your verified domain, e.g. `"Flow <hello@your-domain.com>"`.

## 2. Add the API key as an Edge Function secret

Using the Supabase CLI (from the repo root, once linked to your project
with `supabase link`):

```bash
supabase secrets set RESEND_API_KEY=re_your_key_here
```

Optional but recommended — a shared secret so only your own webhook can
call this function:

```bash
supabase secrets set WAITLIST_WEBHOOK_SECRET=$(openssl rand -hex 24)
```

(Both can also be set from the Supabase Dashboard → Edge Functions →
send-waitlist-welcome → Secrets, if you'd rather not use the CLI.)

## 3. Deploy the function

```bash
supabase functions deploy send-waitlist-welcome
```

This prints the function's URL, e.g.
`https://<project-ref>.supabase.co/functions/v1/send-waitlist-welcome`.

## 4. Create the Database Webhook

In the Supabase Dashboard: **Database → Webhooks → Create a new hook**

- Name: `waitlist-welcome-email`
- Table: `public.waitlist`
- Events: `INSERT` only
- Type: `HTTP Request`
- URL: the function URL from step 3
- Method: `POST`
- Headers: if you set `WAITLIST_WEBHOOK_SECRET` above, add a header
  `x-webhook-secret: <the same value>` here so the function can verify
  the request came from your own webhook.

That's it — every new row in `waitlist` will now trigger this function,
which sends the matching EN/HE welcome email based on the row's `lang`
column.

## Notes

- The email copy lives in `index.ts` (`COPY.en` / `COPY.he`) — plain
  text for now; ask if you'd like an HTML version instead.
- If email volume ever looks abusive (the public waitlist insert policy
  has no rate limiting beyond the landing page's honeypot field), add
  a check here or tighten the RLS policy before it affects your Resend
  sending reputation.
