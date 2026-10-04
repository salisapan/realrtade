-- The allowance counter for the deeper read (docs/ai-ladder.md).
--
-- Project: zjquktirlrhbqcnkfaok only (the Glance project). Do not apply this to the RealTrade project nlvljclvoguvrnntwufu.
-- NOT APPLIED: the project is paused, and restoring it is the owner's action. Until this exists the server answers "unavailable" and the extension stays on the device.
--
-- Written and read by: flow-landing/netlify/functions/glance-assist/ladder.js (service role, through the function below).
-- What is stored: a hash of a person's id (never the id, never an e-mail), the period, and a number of units. Never a sentence, never an answer.
--   subject  'free:<sha256>' | 'pro:<sha256>'  (period 'YYYY-MM')        the monthly allowance
--            'ip:<sha256>'                      (period 'YYYY-MM-DD')     a daily cap per network address, so a new install id is not a new allowance
--            'global'                           (period 'YYYY-MM-DD')     a daily cap for everyone together: the automatic off switch for cost
--
-- glance_ai_charge adds p_units (negative = a refund, 0 = a look) when the total would stay within p_limit, in one locked step, and says whether it did.
-- Row level security is on with NO policies and the function is executable by the service role only. Safe to re-run.

create table if not exists public.ai_usage (
  subject     text        not null,
  period      text        not null,
  units       integer     not null default 0 check (units >= 0),
  updated_at  timestamptz not null default now(),
  primary key (subject, period)
);

alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from anon, authenticated;

create or replace function public.glance_ai_charge(p_subject text, p_period text, p_units integer, p_limit integer)
returns table (allowed boolean, used integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_units integer;
begin
  insert into public.ai_usage (subject, period, units) values (p_subject, p_period, 0)
    on conflict (subject, period) do nothing;
  select u.units into current_units from public.ai_usage u where u.subject = p_subject and u.period = p_period for update;
  if p_units > 0 and current_units + p_units > p_limit then
    return query select false, current_units;
    return;
  end if;
  update public.ai_usage u set units = greatest(0, current_units + p_units), updated_at = now()
    where u.subject = p_subject and u.period = p_period;
  return query select true, greatest(0, current_units + p_units);
end;
$$;

revoke all on function public.glance_ai_charge(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.glance_ai_charge(text, text, integer, integer) to service_role;

-- Old day rows are worth nothing after a week; run by hand or on a schedule:
--   delete from public.ai_usage where period ~ '^\d{4}-\d{2}-\d{2}$' and period < to_char(now() - interval '7 days', 'YYYY-MM-DD');
