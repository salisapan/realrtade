-- AS-IS GROUP marketing site (/as-is/contact) lead capture.
-- Apply via `supabase db push` or paste into the Supabase SQL editor.

create table if not exists public.as_is_leads (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  phone      text not null,
  email      text,
  city       text,
  message    text,
  created_at timestamptz not null default now()
);

alter table public.as_is_leads enable row level security;

-- Allow anonymous visitors to submit the contact form (INSERT only). No
-- SELECT/UPDATE/DELETE for anon, so submissions stay private and are only
-- readable with the service role / dashboard.
drop policy if exists "anon can submit as-is lead" on public.as_is_leads;
create policy "anon can submit as-is lead"
  on public.as_is_leads
  for insert
  to anon
  with check (true);
