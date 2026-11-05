-- Revoke privileges from anon/authenticated that RLS does not cover (TRUNCATE etc.).
--
-- Project: zjquktirlrhbqcnkfaok only (flow-ai)
--   https://zjquktirlrhbqcnkfaok.supabase.co
-- Do not apply this to the RealTrade project nlvljclvoguvrnntwufu.
--
-- Proposed repo path: supabase/migrations/20261026090000_revoke_anon_truncate.sql
-- Drafted 2026-10-26 (security finding U14, CTO). NOT applied, NOT pushed.
--
-- Why: anon and authenticated held the full Supabase default set
-- (SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, and on PG17
-- MAINTAIN) on public.waitlist, public.leads and public.catches.
-- TRUNCATE, REFERENCES, TRIGGER and MAINTAIN are not filtered by row level
-- security, so the public anon key (shipped in trial.html / almost-missed.html)
-- could wipe the waitlist with one TRUNCATE. MAINTAIN also allows LOCK TABLE
-- (it does not appear in information_schema.role_table_grants).
--
-- What stays (the only paths that use the anon key; everything else, i.e.
-- submit-waitlist, trial-signup, confirm-signup, submit-lead, submit-catch,
-- community-*, stripe-webhook, uses SUPABASE_SERVICE_ROLE_KEY, which is
-- unaffected):
--   anon INSERT on waitlist  trial.html POST /rest/v1/waitlist, Prefer return=minimal
--                            (policy "anon can insert signups")
--   anon SELECT on catches   almost-missed.html GET /rest/v1/catches?approved=eq.true
--                            (policy "anon can read approved catches")
--   anon INSERT on leads     no client uses it today (submit-lead is service role),
--                            kept because policy "anon can submit a lead" exists;
--                            see the optional line in section 3.
-- authenticated keeps nothing: Supabase Auth is unused (auth.users is empty) and
-- no policy targets that role.
--
-- No sequences in public (all keys are uuid default gen_random_uuid()), and no
-- triggers on these tables, so no USAGE/EXECUTE grants are needed for inserts.
--
-- Safe to re-run: REVOKE/GRANT are idempotent; MAINTAIN is version-guarded.
-- The assertion block at the end rolls the whole transaction back if the
-- resulting privileges are not exactly the intended matrix.

begin;

-- 1. authenticated: nothing on these three tables.
revoke all on table public.waitlist, public.leads, public.catches from authenticated;

-- 2. anon: privileges that bypass RLS.
revoke truncate, references, trigger
  on table public.waitlist, public.leads, public.catches
  from anon;

-- 3. anon: row privileges with no matching policy and no client path.
--    (With RLS on and no policy they already return nothing, so revoking them
--    changes no behaviour; it removes the reliance on RLS alone.)
revoke select, update, delete on table public.waitlist from anon;
revoke select, update, delete on table public.leads    from anon;
revoke insert, update, delete on table public.catches  from anon;
-- Optional, stricter: no client inserts leads with the anon key.
-- revoke insert on table public.leads from anon;
-- drop policy if exists "anon can submit a lead" on public.leads;

-- 4. Keep (re-assert) exactly what the policies and the site rely on.
grant insert on table public.waitlist to anon;
grant insert on table public.leads    to anon;
grant select on table public.catches  to anon;

-- 5. MAINTAIN (PostgreSQL 17+): VACUUM/ANALYZE/REINDEX/CLUSTER/LOCK TABLE.
do $$
begin
  if current_setting('server_version_num')::int >= 170000 then
    execute 'revoke maintain on table public.waitlist, public.leads, public.catches from anon, authenticated';
  end if;
end
$$;

-- 6. Default privileges: stop new tables created by postgres (migrations,
--    dashboard SQL editor) from regaining the RLS-bypassing privileges.
--    Row privileges (SELECT/INSERT/UPDATE/DELETE) are left as the Supabase
--    default because RLS governs them; tables must still enable RLS.
--    Defaults owned by supabase_admin cannot be changed from the postgres role
--    and only apply to objects supabase_admin itself creates.
alter default privileges for role postgres in schema public
  revoke truncate, references, trigger on tables from anon, authenticated;
do $$
begin
  if current_setting('server_version_num')::int >= 170000 then
    execute 'alter default privileges for role postgres in schema public revoke maintain on tables from anon, authenticated';
  end if;
end
$$;

-- 7. Assert the result; any mismatch raises and the transaction rolls back.
do $$
declare
  r record;
  privs text[] := array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'];
  p text;
  want boolean;
begin
  if current_setting('server_version_num')::int >= 170000 then
    privs := array_append(privs, 'MAINTAIN');
  end if;
  for r in
    select rol, tbl from unnest(array['anon','authenticated']) rol,
                         unnest(array['public.waitlist','public.leads','public.catches']) tbl
  loop
    foreach p in array privs loop
      want := (r.rol = 'anon' and (
                 (r.tbl = 'public.waitlist' and p = 'INSERT') or
                 (r.tbl = 'public.leads'    and p = 'INSERT') or
                 (r.tbl = 'public.catches'  and p = 'SELECT')));
      if has_table_privilege(r.rol, r.tbl, p) is distinct from want then
        raise exception 'privilege check failed: % % on % (expected %)', r.rol, p, r.tbl, want;
      end if;
    end loop;
  end loop;

  if exists (
    select 1
    from pg_default_acl d
    join pg_namespace n on n.oid = d.defaclnamespace,
         lateral aclexplode(d.defaclacl) a
    where n.nspname = 'public'
      and d.defaclobjtype = 'r'
      and pg_get_userbyid(d.defaclrole) = 'postgres'
      and a.grantee in ('anon'::regrole, 'authenticated'::regrole)
      and a.privilege_type in ('TRUNCATE','REFERENCES','TRIGGER','MAINTAIN')
  ) then
    raise exception 'default privileges for postgres in public still grant TRUNCATE/REFERENCES/TRIGGER/MAINTAIN';
  end if;
end
$$;

commit;

-- ---------------------------------------------------------------------------
-- Verification (read-only; run after apply). Expected result of query A:
--   anon | catches  | SELECT
--   anon | leads    | INSERT
--   anon | waitlist | INSERT
-- and no rows for authenticated. Query B must return zero rows.
-- Query C (MAINTAIN is not in information_schema) must return all false.
--
-- A)
-- select grantee, table_name, string_agg(privilege_type, ',' order by privilege_type) as privs
-- from information_schema.role_table_grants
-- where table_schema = 'public' and grantee in ('anon','authenticated')
-- group by grantee, table_name
-- order by table_name, grantee;
--
-- B)
-- select pg_get_userbyid(d.defaclrole) as owner, a.grantee::regrole, a.privilege_type
-- from pg_default_acl d
-- join pg_namespace n on n.oid = d.defaclnamespace, lateral aclexplode(d.defaclacl) a
-- where n.nspname = 'public' and d.defaclobjtype = 'r'
--   and pg_get_userbyid(d.defaclrole) = 'postgres'
--   and a.grantee in ('anon'::regrole, 'authenticated'::regrole)
--   and a.privilege_type in ('TRUNCATE','REFERENCES','TRIGGER','MAINTAIN');
--
-- C)
-- select r.rolname, c.relname, has_table_privilege(r.oid, c.oid, 'MAINTAIN') as maintain
-- from pg_class c cross join pg_roles r
-- where c.oid in ('public.waitlist'::regclass, 'public.leads'::regclass, 'public.catches'::regclass)
--   and r.rolname in ('anon','authenticated');
--
-- Smoke test of the live client paths (from a browser or curl with the anon key):
--   GET  /rest/v1/catches?select=headline&approved=eq.true   -> 200
--   POST /rest/v1/waitlist  (Prefer: return=minimal)         -> 201 (409 on duplicate email)
--   TRUNCATE is not reachable via PostgREST; confirm with query A instead.
