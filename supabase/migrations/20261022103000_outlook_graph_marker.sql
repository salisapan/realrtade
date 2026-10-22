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
grant execute on function public.outlook_marker_read_refresh(uuid) to service_role;

create or replace function public.outlook_marker_write_refresh(secret_id uuid, token text)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
begin
  update vault.secrets
  set secret = token
  where id = secret_id;
end;
$$;

revoke all on function public.outlook_marker_write_refresh(uuid, text) from public;
grant execute on function public.outlook_marker_write_refresh(uuid, text) to service_role;
