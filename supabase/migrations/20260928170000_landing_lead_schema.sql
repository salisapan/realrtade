-- Glance / Flow landing lead schema.
--
-- Project: zjquktirlrhbqcnkfaok only
--   https://zjquktirlrhbqcnkfaok.supabase.co
-- Do not apply this to the RealTrade project nlvljclvoguvrnntwufu.
--
-- Writers this migration matches (flow-landing/):
--   submit-waitlist.js   public.waitlist  INSERT email, lang, source, created_at
--                        then PATCH company, role, website
--   confirm-signup.js    public.waitlist  PATCH confirmed_at
--   trial.html           public.waitlist  anon INSERT, optional ref_code
--   pricing.html         public.waitlist  anon INSERT (email, lang, source, created_at)
--   submit-lead.js       public.leads     email, name, company, role, seats,
--                        deployment, timeline, message, source, lang
--
-- Depends on 20260705000000_create_waitlist.sql. Safe to re-run.
-- These tables are the marketing-site signup and contact-form store.
-- They are not an audit log, an admin console, or an SSO directory.

-- First step is email-only. Glance trial / Pro rows (source
-- trial-extension, pricing-pro) never send company, role, or website.
alter table public.waitlist add column if not exists company text;
alter table public.waitlist add column if not exists role text;
alter table public.waitlist add column if not exists website text;

-- confirm-signup.js sets this when the double opt-in link is used.
-- Left null on insert. The anon policy below refuses a client-supplied value.
alter table public.waitlist add column if not exists confirmed_at timestamptz;

-- trial.html may send a referring install id, sliced to 32 characters.
alter table public.waitlist add column if not exists ref_code text;

-- Caps match the writers. Existing rows have nulls in these columns, so
-- adding the checks cannot fail on data already stored.
alter table public.waitlist drop constraint if exists waitlist_company_len;
alter table public.waitlist add constraint waitlist_company_len
  check (company is null or char_length(company) <= 160);

alter table public.waitlist drop constraint if exists waitlist_role_len;
alter table public.waitlist add constraint waitlist_role_len
  check (role is null or char_length(role) <= 120);

alter table public.waitlist drop constraint if exists waitlist_website_len;
alter table public.waitlist add constraint waitlist_website_len
  check (website is null or char_length(website) <= 200);

alter table public.waitlist drop constraint if exists waitlist_ref_code_len;
alter table public.waitlist add constraint waitlist_ref_code_len
  check (ref_code is null or char_length(ref_code) <= 32);

-- trial.html and pricing.html still insert with the public anon key.
-- They must not stamp confirmed_at or write the enterprise qualification
-- fields. Those updates use the service role, which bypasses RLS.
-- ref_code stays allowed because the Glance trial form sends it.
drop policy if exists "anon can join waitlist" on public.waitlist;
create policy "anon can join waitlist"
  on public.waitlist
  for insert
  to anon
  with check (
    confirmed_at is null
    and company is null
    and role is null
    and website is null
  );

comment on column public.waitlist.company is
  'Flow deployment waitlist. Set by submit-waitlist.js action=update.';
comment on column public.waitlist.role is
  'Flow deployment waitlist. Set by submit-waitlist.js action=update.';
comment on column public.waitlist.website is
  'Flow deployment waitlist. Set by submit-waitlist.js action=update.';
comment on column public.waitlist.confirmed_at is
  'Set by confirm-signup.js when the double opt-in link is used.';
comment on column public.waitlist.ref_code is
  'Optional Glance referral code from trial.html.';

-- Enterprise enquiries from contact.html (submit-lead.js).
-- The contact form does not write with the anon key. No anon policy.
create table if not exists public.leads (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  name        text,
  company     text,
  role        text,
  seats       text,
  deployment  text,
  timeline    text,
  message     text,
  source      text not null default 'contact',
  lang        text not null default 'en',
  created_at  timestamptz not null default now(),
  constraint leads_email_len check (char_length(email) between 1 and 200),
  constraint leads_name_len check (name is null or char_length(name) <= 120),
  constraint leads_company_len check (company is null or char_length(company) <= 160),
  constraint leads_role_len check (role is null or char_length(role) <= 120),
  constraint leads_message_len check (message is null or char_length(message) <= 4000),
  constraint leads_source_len check (char_length(source) between 1 and 60),
  constraint leads_seats_check check (
    seats is null or seats in ('1-10', '11-25', '26-50', '51-200', '200+')
  ),
  constraint leads_deployment_check check (
    deployment is null or deployment in ('masked-cloud', 'flow-edge', 'not-sure')
  ),
  constraint leads_timeline_check check (
    timeline is null or timeline in ('now', 'this-quarter', 'this-year', 'exploring')
  ),
  constraint leads_lang_check check (lang in ('en', 'he'))
);

-- Hand-created table: CREATE TABLE above was a no-op. Add any column the
-- writer sends that is still missing. Checks in the CREATE TABLE apply
-- only when this migration creates the table; the block below adds the
-- same checks when they are absent, and fails if stored rows violate them.
alter table public.leads add column if not exists email text;
alter table public.leads add column if not exists name text;
alter table public.leads add column if not exists company text;
alter table public.leads add column if not exists role text;
alter table public.leads add column if not exists seats text;
alter table public.leads add column if not exists deployment text;
alter table public.leads add column if not exists timeline text;
alter table public.leads add column if not exists message text;
alter table public.leads add column if not exists source text default 'contact';
alter table public.leads add column if not exists lang text default 'en';
alter table public.leads add column if not exists created_at timestamptz default now();

alter table public.leads alter column source set default 'contact';
alter table public.leads alter column lang set default 'en';
alter table public.leads alter column created_at set default now();

-- A hand-built table may have added these as nullable. Require them when
-- no stored row is missing a value. A row with a null email keeps the
-- column nullable so this migration can still finish; new writes from
-- submit-lead.js always send email, source, and lang.
do $$
begin
  if not exists (select 1 from public.leads where email is null) then
    alter table public.leads alter column email set not null;
  end if;
  if not exists (select 1 from public.leads where source is null) then
    alter table public.leads alter column source set not null;
  end if;
  if not exists (select 1 from public.leads where lang is null) then
    alter table public.leads alter column lang set not null;
  end if;
  if not exists (select 1 from public.leads where created_at is null) then
    alter table public.leads alter column created_at set not null;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'leads_email_len' and conrelid = 'public.leads'::regclass) then
    alter table public.leads add constraint leads_email_len
      check (char_length(email) between 1 and 200);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'leads_name_len' and conrelid = 'public.leads'::regclass) then
    alter table public.leads add constraint leads_name_len
      check (name is null or char_length(name) <= 120);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'leads_company_len' and conrelid = 'public.leads'::regclass) then
    alter table public.leads add constraint leads_company_len
      check (company is null or char_length(company) <= 160);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'leads_role_len' and conrelid = 'public.leads'::regclass) then
    alter table public.leads add constraint leads_role_len
      check (role is null or char_length(role) <= 120);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'leads_message_len' and conrelid = 'public.leads'::regclass) then
    alter table public.leads add constraint leads_message_len
      check (message is null or char_length(message) <= 4000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'leads_source_len' and conrelid = 'public.leads'::regclass) then
    alter table public.leads add constraint leads_source_len
      check (char_length(source) between 1 and 60);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'leads_seats_check' and conrelid = 'public.leads'::regclass) then
    alter table public.leads add constraint leads_seats_check
      check (seats is null or seats in ('1-10', '11-25', '26-50', '51-200', '200+'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'leads_deployment_check' and conrelid = 'public.leads'::regclass) then
    alter table public.leads add constraint leads_deployment_check
      check (deployment is null or deployment in ('masked-cloud', 'flow-edge', 'not-sure'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'leads_timeline_check' and conrelid = 'public.leads'::regclass) then
    alter table public.leads add constraint leads_timeline_check
      check (timeline is null or timeline in ('now', 'this-quarter', 'this-year', 'exploring'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'leads_lang_check' and conrelid = 'public.leads'::regclass) then
    alter table public.leads add constraint leads_lang_check
      check (lang in ('en', 'he'));
  end if;
end $$;

alter table public.leads enable row level security;

revoke all on table public.leads from anon, authenticated;
grant select, insert, update, delete on table public.leads to service_role;

comment on table public.leads is
  'Enterprise contact-form enquiries from submit-lead.js. Glance trial and Pro interest stay on public.waitlist.';

notify pgrst, 'reload schema';
