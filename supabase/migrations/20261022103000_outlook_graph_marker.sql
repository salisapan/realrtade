-- Outlook Graph marker (task O) for flow-ai zjquktirlrhbqcnkfaok ONLY.
-- Repo-only in this change: do NOT apply until owner review. Never push to nlvljclvoguvrnntwufu.
-- Mail.ReadWrite only; refresh tokens live in Vault (pgcrypto-backed secret ids on the row).

create extension if not exists pgcrypto;

create table if not exists public.outlook_graph_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  mailbox text not null default 'me',
  refresh_secret_id uuid not null,
  subscription_id text,
  subscription_expires_at timestamptz,
  client_state text,
  delta_link text,
  own_addresses text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.outlook_graph_accounts is
  'Graph webhook marker state for Glance (server-side category). Tokens via Vault secret id.';

alter table public.outlook_graph_accounts enable row level security;
alter table public.outlook_graph_accounts force row level security;
-- No policies for anon/authenticated; service_role bypasses RLS for the Edge worker.
revoke all on table public.outlook_graph_accounts from anon, authenticated;

create or replace function public.outlook_graph_accounts_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger outlook_graph_accounts_updated_at
  before update on public.outlook_graph_accounts
  for each row
  execute function public.outlook_graph_accounts_set_updated_at();

-- Read refresh token material for the Edge worker (service role only).
create or replace function public.outlook_marker_read_refresh(secret_id uuid)
returns text
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  payload text;
begin
  select decrypted_secret into payload
  from vault.decrypted_secrets
  where id = secret_id;
  return payload;
end;
$$;

revoke all on function public.outlook_marker_read_refresh(uuid) from public;
revoke execute on function public.outlook_marker_read_refresh(uuid) from anon, authenticated;
grant execute on function public.outlook_marker_read_refresh(uuid) to service_role;

create or replace function public.outlook_marker_write_refresh(secret_id uuid, token text)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
begin
  perform vault.update_secret(secret_id, token);
end;
$$;

revoke all on function public.outlook_marker_write_refresh(uuid, text) from public;
revoke execute on function public.outlook_marker_write_refresh(uuid, text) from anon, authenticated;
grant execute on function public.outlook_marker_write_refresh(uuid, text) to service_role;

-- Sample scheduled sweep (comment only — enable pg_cron + pg_net after Edge deploy):
-- select cron.schedule(
--   'outlook-graph-marker-maintenance',
--   '0 */6 * * *',
--   $$
--   select net.http_post(
--     url := 'https://zjquktirlrhbqcnkfaok.supabase.co/functions/v1/outlook-graph-marker?cron=1',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'x-glance-cron', current_setting('app.outlook_marker_cron_secret', true)
--     ),
--     body := '{}'::jsonb
--   ) as request_id;
--   $$
-- );
-- Store the same value in Edge secrets as OUTLOOK_MARKER_CRON_SECRET (not in SQL).
