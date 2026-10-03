-- Community learning (docs/community-learning.md). DORMANT: nothing writes here until the owner enables it.
-- Service role only: RLS is enabled and there are NO policies, so the anon and authenticated keys can read and write nothing.
-- What is stored is never mail, never text, and never an identifier: a noisy 2,048-number sketch per upload (the noise is
-- added on the device) and, separately, the signed delta the aggregator publishes.

create table if not exists public.community_sketches (
  id bigserial primary key,
  round integer not null,
  sigma real not null,
  sketch real[] not null,
  created_at timestamptz not null default now()
);
create index if not exists community_sketches_round_idx on public.community_sketches (round);
alter table public.community_sketches enable row level security;

create table if not exists public.community_published (
  round integer primary key,
  payload text not null,      -- the exact JSON string that was signed
  sig text not null,          -- base64 ECDSA P-256 / SHA-256 (IEEE P1363) over payload
  created_at timestamptz not null default now()
);
alter table public.community_published enable row level security;
