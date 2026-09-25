-- Data & AI D5: dai_llm_calls, the metering log for language-model calls (HELD).
--
-- Owner decision for D5: engine first, an optional METERED language model,
-- never graded. No metering existed in the Suite, so this adds it. Every call
-- the ai-eval-assist edge function makes is one row here: the organization,
-- the user, the function, the model, the tokens in and out, the status and
-- when. The function refuses a call once the organization's calls for the
-- current UTC day reach its cap (DAILY_CAP in
-- supabase/functions/ai-eval-assist/logic.ts, 50 by default).
--
-- Who writes: only the edge function, with the service role, through
-- dai_llm_reserve_call (below) and a status update after the model answers.
-- authenticated users get SELECT only, and RLS lets a member read the calls
-- of an organization they belong to; there is no insert, update or delete
-- policy for them, and no grant to anon at all.
--
-- dai_llm_reserve_call(org, user, function, model, cap) takes a transaction
-- advisory lock per organization, counts the organization's calls since
-- 00:00 UTC that did not fail (status 'reserved' or 'ok'), and either inserts
-- a 'reserved' row and returns its id with the new count, or returns a null
-- id with the count when the cap is reached. Two concurrent calls from one
-- organization therefore cannot both take the last slot. A call the model
-- provider fails is marked 'error' and does not count against the cap; it
-- stays in the log. Execute is granted to service_role only.
--
-- No shared table is touched: organization_id references organizations and
-- user_id references auth.users; neither is altered.
--
-- Idempotent: safe to re-run. Not deploy-gated: the table can exist before
-- the function is deployed. The ai-eval-assist deploy is held for the owner.
--
-- Owner-run: supabase db query --linked -f supabase/migrations/20260925200000_d5_dai_llm_calls.sql

begin;

create table if not exists public.dai_llm_calls (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid references auth.users(id) on delete set null,
  function_name   text not null,
  model           text not null,
  tokens_in       integer,
  tokens_out      integer,
  status          text not null default 'reserved',
  error           text,
  created_at      timestamptz not null default now(),
  completed_at    timestamptz,
  constraint dai_llm_calls_status_check check (status in ('reserved', 'ok', 'error')),
  constraint dai_llm_calls_tokens_check check ((tokens_in is null or tokens_in >= 0) and (tokens_out is null or tokens_out >= 0)),
  constraint dai_llm_calls_function_check check (length(btrim(function_name)) > 0),
  constraint dai_llm_calls_model_check check (length(btrim(model)) > 0)
);

comment on table public.dai_llm_calls is
  'Metering log of language-model calls made by Suite edge functions (Data & AI D5, ai-eval-assist first). One row per call: organization, user, function, model, tokens in and out, status. Written only by the service role; members read their organization''s rows.';

create index if not exists dai_llm_calls_org_created_idx
  on public.dai_llm_calls (organization_id, created_at desc);

revoke all on table public.dai_llm_calls from anon;
revoke all on table public.dai_llm_calls from authenticated;
grant select on table public.dai_llm_calls to authenticated;
grant select, insert, update on table public.dai_llm_calls to service_role;

alter table public.dai_llm_calls enable row level security;

drop policy if exists dai_llm_calls_select on public.dai_llm_calls;
create policy dai_llm_calls_select on public.dai_llm_calls
  for select to authenticated
  using (public.is_org_member(organization_id) or public.is_super_admin());

create or replace function public.dai_llm_reserve_call(
  p_org uuid,
  p_user uuid,
  p_function text,
  p_model text,
  p_cap integer
)
returns table (call_id uuid, calls_today integer)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_count integer;
  v_id uuid;
  v_day_start timestamptz := date_trunc('day', now() at time zone 'utc') at time zone 'utc';
begin
  if p_org is null or p_cap is null or p_cap < 0 then
    raise exception 'dai_llm_reserve_call needs an organization and a cap of 0 or more' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('dai_llm_calls:' || p_org::text, 0));
  select count(*)::integer into v_count
    from public.dai_llm_calls
   where organization_id = p_org
     and created_at >= v_day_start
     and status in ('reserved', 'ok');
  if v_count >= p_cap then
    return query select null::uuid, v_count;
    return;
  end if;
  insert into public.dai_llm_calls (organization_id, user_id, function_name, model, status)
  values (p_org, p_user, p_function, p_model, 'reserved')
  returning id into v_id;
  return query select v_id, v_count + 1;
end;
$$;

comment on function public.dai_llm_reserve_call(uuid, uuid, text, text, integer) is
  'Service role only. Counts the organization''s language-model calls since 00:00 UTC that did not fail and, below p_cap, logs a reserved call and returns its id and the new count; at the cap returns a null id and the count. Serialised per organization by an advisory lock.';

revoke all on function public.dai_llm_reserve_call(uuid, uuid, text, text, integer) from public;
revoke all on function public.dai_llm_reserve_call(uuid, uuid, text, text, integer) from anon;
revoke all on function public.dai_llm_reserve_call(uuid, uuid, text, text, integer) from authenticated;
grant execute on function public.dai_llm_reserve_call(uuid, uuid, text, text, integer) to service_role;

commit;
