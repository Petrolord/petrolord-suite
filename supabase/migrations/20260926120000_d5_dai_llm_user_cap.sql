-- Data & AI D5 follow-on: a personal daily cap on language-model calls, and
-- the reasoning effort recorded per call (HELD).
--
-- Owner decision 2026-09-26: the ai-eval-assist organization cap goes from
-- 50 to 200 calls per UTC day, and each person gets their own cap of 40
-- calls per UTC day within an organization, so one person cannot use up the
-- organization's calls. The caps themselves are constants in the edge
-- function (DAILY_CAP and USER_DAILY_CAP in
-- supabase/functions/ai-eval-assist/logic.ts); this migration adds the
-- database half.
--
-- 1. A NEW OVERLOAD dai_llm_reserve_call(org, user, function, model, cap,
--    user_cap). The 5-argument function from 20260925200000 is KEPT
--    unchanged, so the ai-eval-assist build deployed today keeps working
--    between this apply and the redeploy. The new overload has no default
--    on p_user_cap, so a 5-argument call can only resolve to the old one.
--    Once the new edge function is deployed the old overload is unused; it
--    can be dropped in a later migration.
--
--    Under the same per-organization advisory lock as the old function it
--    counts, since 00:00 UTC and among calls that did not fail (status
--    'reserved' or 'ok'), the organization's calls and this user's calls in
--    this organization. At either cap it returns a null call id with both
--    counts and which cap was reached ('organization' is checked first, then
--    'user'); below both it logs a reserved call and returns its id with
--    both counts including the new call. A call the provider fails is marked
--    'error' by the edge function and frees its slot on both counts.
--
-- 2. A nullable column dai_llm_calls.reasoning_effort (none, low, medium,
--    high, xhigh or max; null for a model that takes no reasoning effort).
--    The edge function writes it with the call's outcome. The model name was
--    already recorded in dai_llm_calls.model.
--
-- Security as 20260925200000: security definer, search_path public, execute
-- to service_role only (revoked from public, anon and authenticated). No
-- shared table is touched; no RLS policy changes.
--
-- Idempotent: safe to re-run.
--
-- ORDER: apply this migration FIRST, then redeploy the edge function
-- (supabase functions deploy ai-eval-assist). The new function calls the
-- 6-argument overload and writes reasoning_effort, so deployed before this
-- migration it answers 503 "not configured".
--
-- Owner-run: supabase db query --linked -f supabase/migrations/20260926120000_d5_dai_llm_user_cap.sql

begin;

alter table public.dai_llm_calls
  add column if not exists reasoning_effort text;

alter table public.dai_llm_calls
  drop constraint if exists dai_llm_calls_reasoning_effort_check;
alter table public.dai_llm_calls
  add constraint dai_llm_calls_reasoning_effort_check
  check (reasoning_effort is null or reasoning_effort in ('none', 'low', 'medium', 'high', 'xhigh', 'max'));

comment on column public.dai_llm_calls.reasoning_effort is
  'The reasoning effort sent with the call (none, low, medium, high, xhigh or max); null for a model that takes no reasoning effort.';

create or replace function public.dai_llm_reserve_call(
  p_org uuid,
  p_user uuid,
  p_function text,
  p_model text,
  p_cap integer,
  p_user_cap integer
)
returns table (call_id uuid, calls_today integer, user_calls_today integer, cap_hit text)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_count integer;
  v_user_count integer;
  v_id uuid;
  v_day_start timestamptz := date_trunc('day', now() at time zone 'utc') at time zone 'utc';
begin
  if p_org is null or p_user is null or p_cap is null or p_cap < 0 or p_user_cap is null or p_user_cap < 0 then
    raise exception 'dai_llm_reserve_call needs an organization, a user and caps of 0 or more' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('dai_llm_calls:' || p_org::text, 0));
  select count(*)::integer,
         (count(*) filter (where user_id = p_user))::integer
    into v_count, v_user_count
    from public.dai_llm_calls
   where organization_id = p_org
     and created_at >= v_day_start
     and status in ('reserved', 'ok');
  if v_count >= p_cap then
    return query select null::uuid, v_count, v_user_count, 'organization'::text;
    return;
  end if;
  if v_user_count >= p_user_cap then
    return query select null::uuid, v_count, v_user_count, 'user'::text;
    return;
  end if;
  insert into public.dai_llm_calls (organization_id, user_id, function_name, model, status)
  values (p_org, p_user, p_function, p_model, 'reserved')
  returning id into v_id;
  return query select v_id, v_count + 1, v_user_count + 1, null::text;
end;
$$;

comment on function public.dai_llm_reserve_call(uuid, uuid, text, text, integer, integer) is
  'Service role only. Counts, since 00:00 UTC and among calls that did not fail, the organization''s language-model calls and this user''s calls in it; below both p_cap and p_user_cap logs a reserved call and returns its id and both new counts; at either cap returns a null id, both counts and cap_hit (organization or user). Serialised per organization by an advisory lock.';

revoke all on function public.dai_llm_reserve_call(uuid, uuid, text, text, integer, integer) from public;
revoke all on function public.dai_llm_reserve_call(uuid, uuid, text, text, integer, integer) from anon;
revoke all on function public.dai_llm_reserve_call(uuid, uuid, text, text, integer, integer) from authenticated;
grant execute on function public.dai_llm_reserve_call(uuid, uuid, text, text, integer, integer) to service_role;

commit;
