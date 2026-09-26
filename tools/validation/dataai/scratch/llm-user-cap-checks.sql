-- Probes of 20260926120000_d5_dai_llm_user_cap.sql on the scratch fixture.
-- Every probe raises on failure (ON_ERROR_STOP), and prints PASS otherwise.
\set ON_ERROR_STOP 1
set client_min_messages = notice;

-- Org A, users 1 to 3; org cap 5, personal cap 2.
set role service_role;
do $$
declare
  a uuid := '00000000-0000-4000-8000-0000000000a1';
  b uuid := '00000000-0000-4000-8000-0000000000b1';
  u1 uuid := '00000000-0000-4000-8000-000000000001';
  u2 uuid := '00000000-0000-4000-8000-000000000002';
  u3 uuid := '00000000-0000-4000-8000-000000000003';
  u4 uuid := '00000000-0000-4000-8000-000000000004';
  r record;
  first_id uuid;
begin
  -- both overloads exist
  if (select count(*) from pg_proc where proname = 'dai_llm_reserve_call') <> 2 then raise exception 'FAIL: expected two overloads'; end if;
  raise notice 'PASS both overloads present (5-argument kept)';

  -- the deployed 5-argument call still resolves and works
  select * into r from public.dai_llm_reserve_call(b, u4, 'ai-eval-assist', 'gpt-4o-mini', 50);
  if r.call_id is null or r.calls_today <> 1 then raise exception 'FAIL: 5-argument call %', r; end if;
  raise notice 'PASS 5-argument call logs a reserved call (%)', r.calls_today;

  -- a call from yesterday does not count
  insert into public.dai_llm_calls (organization_id, user_id, function_name, model, status, created_at)
  values (a, u1, 'ai-eval-assist', 'm', 'ok', date_trunc('day', now() at time zone 'utc') at time zone 'utc' - interval '1 second');

  select * into r from public.dai_llm_reserve_call(a, u1, 'ai-eval-assist', 'gpt-6-luna', 5, 2);
  if r.call_id is null or r.calls_today <> 1 or r.user_calls_today <> 1 or r.cap_hit is not null then raise exception 'FAIL: u1 first %', r; end if;
  first_id := r.call_id;
  select * into r from public.dai_llm_reserve_call(a, u1, 'ai-eval-assist', 'gpt-6-luna', 5, 2);
  if r.call_id is null or r.calls_today <> 2 or r.user_calls_today <> 2 then raise exception 'FAIL: u1 second %', r; end if;
  raise notice 'PASS counts 1/1 then 2/2 (yesterday''s call not counted)';

  select * into r from public.dai_llm_reserve_call(a, u1, 'ai-eval-assist', 'gpt-6-luna', 5, 2);
  if r.call_id is not null or r.cap_hit <> 'user' or r.calls_today <> 2 or r.user_calls_today <> 2 then raise exception 'FAIL: u1 personal cap %', r; end if;
  raise notice 'PASS personal cap: null id, cap_hit user, counts 2 and 2';

  select * into r from public.dai_llm_reserve_call(a, u2, 'ai-eval-assist', 'gpt-6-luna', 5, 2);
  if r.call_id is null or r.calls_today <> 3 or r.user_calls_today <> 1 then raise exception 'FAIL: u2 after u1 capped %', r; end if;
  raise notice 'PASS another person in the same organization still reserves (3 org, 1 own)';

  update public.dai_llm_calls set status = 'error' where id = first_id;
  select * into r from public.dai_llm_reserve_call(a, u1, 'ai-eval-assist', 'gpt-6-luna', 5, 2);
  if r.call_id is null or r.calls_today <> 3 or r.user_calls_today <> 2 then raise exception 'FAIL: failed call freed no slot %', r; end if;
  raise notice 'PASS a failed call frees its slot on both counts';

  select * into r from public.dai_llm_reserve_call(a, u2, 'ai-eval-assist', 'gpt-6-luna', 5, 2);
  if r.call_id is null or r.calls_today <> 4 then raise exception 'FAIL: u2 second %', r; end if;
  select * into r from public.dai_llm_reserve_call(a, u3, 'ai-eval-assist', 'gpt-6-luna', 5, 2);
  if r.call_id is null or r.calls_today <> 5 or r.user_calls_today <> 1 then raise exception 'FAIL: u3 fills org %', r; end if;
  select * into r from public.dai_llm_reserve_call(a, u3, 'ai-eval-assist', 'gpt-6-luna', 5, 2);
  if r.call_id is not null or r.cap_hit <> 'organization' or r.calls_today <> 5 or r.user_calls_today <> 1 then raise exception 'FAIL: organization cap %', r; end if;
  raise notice 'PASS organization cap: null id, cap_hit organization, counts 5 and 1';

  select * into r from public.dai_llm_reserve_call(a, u1, 'ai-eval-assist', 'gpt-6-luna', 5, 2);
  if r.cap_hit <> 'organization' then raise exception 'FAIL: both caps reached should report organization %', r; end if;
  raise notice 'PASS both caps reached reports organization';

  select * into r from public.dai_llm_reserve_call(b, u1, 'ai-eval-assist', 'gpt-6-luna', 5, 2);
  if r.call_id is null or r.calls_today <> 2 or r.user_calls_today <> 1 then raise exception 'FAIL: other organization %', r; end if;
  raise notice 'PASS another organization has its own counts, personal count per organization';

  begin
    perform public.dai_llm_reserve_call(a, null, 'ai-eval-assist', 'm', 5, 2);
    raise exception 'FAIL: null user accepted';
  exception when sqlstate '22023' then raise notice 'PASS null user refused (22023)';
  end;
  begin
    perform public.dai_llm_reserve_call(a, u1, 'ai-eval-assist', 'm', 5, -1);
    raise exception 'FAIL: negative user cap accepted';
  exception when sqlstate '22023' then raise notice 'PASS negative personal cap refused (22023)';
  end;

  update public.dai_llm_calls set reasoning_effort = 'low' where id = first_id;
  begin
    update public.dai_llm_calls set reasoning_effort = 'minimal' where id = first_id;
    raise exception 'FAIL: reasoning_effort minimal accepted';
  exception when check_violation then raise notice 'PASS reasoning_effort low accepted, minimal refused';
  end;
end $$;
reset role;

-- anon and authenticated cannot execute either overload
set role authenticated;
do $$ begin
  perform public.dai_llm_reserve_call('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001', 'x', 'm', 5, 2);
  raise exception 'FAIL: authenticated executed the 6-argument function';
exception when insufficient_privilege then raise notice 'PASS authenticated refused execute (6-argument)';
end $$;
reset role;
set role anon;
do $$ begin
  perform public.dai_llm_reserve_call('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001', 'x', 'm', 5, 2);
  raise exception 'FAIL: anon executed the 6-argument function';
exception when insufficient_privilege then raise notice 'PASS anon refused execute (6-argument)';
end $$;
reset role;
