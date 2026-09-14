-- "Almost Missed" gallery — anonymous, opt-in submissions of real catches
-- from missed-deadline.html. Apply via `supabase db push` or paste into the
-- Supabase SQL editor.
--
-- What can land in this table: a domain id, an engine-generated headline
-- built only from structured extracted facts (amount, date — the same
-- template the real product uses for its own record titles), a score, and
-- two booleans. Never the raw pasted email, never the decisive-sentence
-- quote, never a name or company. submit-catch.js enforces that boundary
-- server-side; this schema has no column that could hold more than that.
--
-- Submissions are not public the moment they land. `approved` starts false;
-- a human flips it to true in the Supabase dashboard before a row is ever
-- readable by anon. There is no admin UI for this yet — that review step is
-- a deliberate manual gate until volume justifies building one, not an
-- oversight.

create table if not exists public.catches (
  id            uuid primary key default gen_random_uuid(),
  domain_id     text not null,
  headline      text not null,
  score         integer,
  has_money     boolean not null default false,
  has_date      boolean not null default false,
  approved      boolean not null default false,
  created_at    timestamptz not null default now()
);

alter table public.catches enable row level security;

-- Public read, but only of rows a human has already approved. No anon
-- INSERT/UPDATE/DELETE policy exists at all — every write goes through
-- submit-catch.js using the service-role key, which bypasses RLS entirely.
drop policy if exists "anon can read approved catches" on public.catches;
create policy "anon can read approved catches"
  on public.catches
  for select
  to anon
  using (approved = true);
