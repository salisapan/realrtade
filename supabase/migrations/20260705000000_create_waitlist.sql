-- Flow landing page waitlist capture.
-- Apply via `supabase db push` or paste into the Supabase SQL editor.

create table if not exists public.waitlist (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  lang       text,
  source     text,
  created_at timestamptz not null default now()
);

-- One row per email address.
create unique index if not exists waitlist_email_key on public.waitlist (lower(email));

alter table public.waitlist enable row level security;

-- Allow anonymous visitors to sign up (INSERT only). No SELECT/UPDATE/DELETE for anon,
-- so the list itself stays private and is only readable with the service role / dashboard.
drop policy if exists "anon can join waitlist" on public.waitlist;
create policy "anon can join waitlist"
  on public.waitlist
  for insert
  to anon
  with check (true);
