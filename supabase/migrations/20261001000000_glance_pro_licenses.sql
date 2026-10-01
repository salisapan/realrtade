-- Glance Pro licences.
--
-- Project: zjquktirlrhbqcnkfaok only
--   https://zjquktirlrhbqcnkfaok.supabase.co
-- Do not apply this to the RealTrade project nlvljclvoguvrnntwufu.
--
-- Written by:  flow-landing/netlify/functions/stripe-webhook (service role)
-- Read by:     verify-license, billing-portal, glance-assist (service role)
--
-- The licence key itself is never stored. It is derived from the Stripe
-- subscription id with a server secret (see verify-license/license-core.js);
-- only its SHA-256 hash is kept here, so a leaked table cannot be used to
-- unlock anything.
--
-- Row level security is on with NO policies: anon and authenticated roles can
-- neither read nor write. Only the service role (which bypasses RLS) touches
-- this table. Safe to re-run.

create table if not exists public.licenses (
  id                      uuid primary key default gen_random_uuid(),
  key_hash                text not null,
  email                   text not null,
  plan                    text not null default 'pro',
  status                  text not null,
  interval                text,
  stripe_customer_id      text,
  stripe_subscription_id  text,
  checkout_session_id     text,
  current_period_end      timestamptz,
  trial_end               timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create unique index if not exists licenses_key_hash_key on public.licenses (key_hash);
create unique index if not exists licenses_subscription_key on public.licenses (stripe_subscription_id) where stripe_subscription_id is not null;
create unique index if not exists licenses_checkout_session_key on public.licenses (checkout_session_id) where checkout_session_id is not null;
create index if not exists licenses_email_idx on public.licenses (lower(email));

alter table public.licenses drop constraint if exists licenses_status_check;
alter table public.licenses add constraint licenses_status_check
  check (status in ('trialing','active','past_due','canceled','unpaid','incomplete','incomplete_expired','paused','comp'));

alter table public.licenses drop constraint if exists licenses_plan_check;
alter table public.licenses add constraint licenses_plan_check check (plan in ('pro'));

alter table public.licenses enable row level security;
revoke all on public.licenses from anon, authenticated;

-- Hand-issued licence for testing before launch (run in the SQL editor, then
-- derive the matching key with `node scripts/issue-comp-license.js you@x.com`):
--   insert into public.licenses (key_hash, email, status) values ('<hash>', 'you@x.com', 'comp');
