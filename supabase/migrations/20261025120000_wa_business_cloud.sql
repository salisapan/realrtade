-- W4 WhatsApp Business Cloud (Coexistence). Project zjquktirlrhbqcnkfaok only.
-- NOT APPLIED in this PR. Service role writes inbound messages; authenticated JWT reads own rows.
-- Safe to re-run (IF NOT EXISTS / guarded policies).

create table if not exists public.wa_business_platform (
  id            text primary key,
  kill_switch   boolean not null default false,
  updated_at    timestamptz not null default now()
);

insert into public.wa_business_platform (id, kill_switch)
values ('global', false)
on conflict (id) do nothing;

create table if not exists public.wa_business_phone_links (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  phone_number_id   text not null,
  waba_id           text,
  display_phone     text,
  created_at        timestamptz not null default now(),
  unique (user_id, phone_number_id)
);

create index if not exists wa_business_phone_links_phone_idx
  on public.wa_business_phone_links (phone_number_id);

create table if not exists public.wa_business_inbound_messages (
  id                uuid primary key default gen_random_uuid(),
  wamid             text not null unique,
  phone_number_id   text not null,
  from_wa_id        text not null,
  contact_name      text,
  message_type      text not null,
  text_body         text,
  caption           text,
  mime_type         text,
  media_sha256      text,
  media_id          text,
  filename          text,
  media_bytes       bytea,
  received_at       timestamptz not null default now(),
  raw_payload       jsonb,
  created_at        timestamptz not null default now()
);

create index if not exists wa_business_inbound_phone_received_idx
  on public.wa_business_inbound_messages (phone_number_id, received_at desc);

create table if not exists public.wa_business_drafts (
  id                  uuid primary key default gen_random_uuid(),
  inbound_message_id  uuid not null references public.wa_business_inbound_messages (id) on delete cascade,
  user_id             uuid not null default auth.uid() references auth.users (id) on delete cascade,
  draft_body          text not null,
  proof               jsonb not null,
  undone_at           timestamptz,
  created_at          timestamptz not null default now(),
  unique (inbound_message_id, user_id)
);

alter table public.wa_business_platform enable row level security;
alter table public.wa_business_phone_links enable row level security;
alter table public.wa_business_inbound_messages enable row level security;
alter table public.wa_business_drafts enable row level security;

revoke all on public.wa_business_platform from anon, authenticated;
revoke all on public.wa_business_phone_links from anon, authenticated;
revoke all on public.wa_business_inbound_messages from anon, authenticated;
revoke all on public.wa_business_drafts from anon, authenticated;

-- Authenticated users may read the global kill flag only.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'wa_business_platform' and policyname = 'wa_platform_read_kill'
  ) then
    create policy wa_platform_read_kill on public.wa_business_platform
      for select to authenticated
      using (id = 'global');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'wa_business_phone_links' and policyname = 'wa_phone_links_own'
  ) then
    create policy wa_phone_links_own on public.wa_business_phone_links
      for all to authenticated
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'wa_business_inbound_messages' and policyname = 'wa_inbound_read_linked'
  ) then
    create policy wa_inbound_read_linked on public.wa_business_inbound_messages
      for select to authenticated
      using (
        phone_number_id in (
          select phone_number_id from public.wa_business_phone_links where user_id = auth.uid()
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'wa_business_drafts' and policyname = 'wa_drafts_own'
  ) then
    create policy wa_drafts_own on public.wa_business_drafts
      for all to authenticated
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
  end if;
end $$;

grant select on public.wa_business_platform to authenticated;
grant select, insert, update, delete on public.wa_business_phone_links to authenticated;
grant select on public.wa_business_inbound_messages to authenticated;
grant select, insert, update on public.wa_business_drafts to authenticated;
