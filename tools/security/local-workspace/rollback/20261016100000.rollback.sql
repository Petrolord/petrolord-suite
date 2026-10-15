-- Rollback of 20261016100000_local_workspace_l1.sql (local workspace L1).
-- Restores qi_enqueue_job and qi_sweep_stale_jobs exactly as in
-- 20261005120000_qi_jobs.sql and qi_claim_job exactly as in
-- 20261006110000_qi_fair_claim.sql (bodies copied verbatim, same grants),
-- drops the two local-job functions, the new columns and the three new tables.
-- Safe to run twice (if exists everywhere). No transaction lines: run it as
-- one file with supabase db query --linked -f (one implicit transaction).
-- Browser and local job rows (executor <> 'server') are deleted first, so the
-- restored server functions never see a row they cannot run.

drop function if exists public.qi_update_local_job(uuid, real, text, text, jsonb, text, text, text, real);
drop function if exists public.qi_start_local_job(text, jsonb, jsonb, text, uuid, uuid);

do $$ begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'qi_jobs' and column_name = 'executor') then
    execute 'delete from public.qi_jobs where executor <> ''server''';
  end if;
end $$;

create or replace function public.qi_enqueue_job(
    p_kind text,
    p_params jsonb default '{}'::jsonb,
    p_input_refs jsonb default '{}'::jsonb,
    p_organization_id uuid default null)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_inflight int;
  v_daily    int;
  v_id       uuid;
begin
  if v_uid is null then
    raise exception 'Sign in to run worker jobs.' using errcode = '28000';
  end if;
  if p_kind is null or p_kind !~ '^[a-z][a-z0-9_]{1,62}$' then
    raise exception 'Unknown job kind.' using errcode = '22023';
  end if;
  if pg_column_size(coalesce(p_params, '{}'::jsonb)) > 65536
     or pg_column_size(coalesce(p_input_refs, '{}'::jsonb)) > 65536 then
    raise exception 'Job settings are too large (64 KB limit).' using errcode = '22023';
  end if;
  if p_organization_id is not null and not public.is_org_member(p_organization_id) then
    raise exception 'You are not a member of that organization.' using errcode = '42501';
  end if;

  select count(*) into v_inflight from public.qi_jobs
   where user_id = v_uid and status in ('queued', 'running');
  if v_inflight >= 4 then
    raise exception 'You already have 4 worker jobs queued or running. Wait for one to finish.'
      using errcode = 'P0001';
  end if;
  select count(*) into v_daily from public.qi_jobs
   where user_id = v_uid and queued_at > now() - interval '24 hours';
  if v_daily >= 200 then
    raise exception 'Daily worker job limit reached (200 in 24 hours).' using errcode = 'P0001';
  end if;

  insert into public.qi_jobs (user_id, organization_id, kind, params, input_refs)
  values (v_uid, p_organization_id, p_kind,
          coalesce(p_params, '{}'::jsonb), coalesce(p_input_refs, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.qi_enqueue_job(text, jsonb, jsonb, uuid) from public, anon;
grant execute on function public.qi_enqueue_job(text, jsonb, jsonb, uuid) to authenticated;

create or replace function public.qi_claim_job(p_worker_id text, p_kinds text[])
returns setof public.qi_jobs
language plpgsql security definer
set search_path = public
as $$
begin
  return query
  update public.qi_jobs j
     set status = 'running',
         claimed_by = p_worker_id,
         claimed_at = now(),
         heartbeat_at = now(),
         attempt = j.attempt + 1,
         progress = 0,
         progress_message = null
   where j.id = (
         select q.id from public.qi_jobs q
          where q.status = 'queued' and q.kind = any (p_kinds)
          order by (select count(*) from public.qi_jobs r
                     where r.user_id = q.user_id and r.status = 'running'),
                   q.queued_at
          limit 1
          for update skip locked)
  returning j.*;
end $$;
revoke all on function public.qi_claim_job(text, text[]) from public, anon, authenticated;
grant execute on function public.qi_claim_job(text, text[]) to service_role;

create or replace function public.qi_sweep_stale_jobs(p_stale_after_s int, p_max_attempts int)
returns int
language plpgsql security definer
set search_path = public
as $$
declare
  v_n int := 0;
  v_m int := 0;
begin
  update public.qi_jobs
     set status = 'failed', failure_stage = 'worker_lost',
         error_message = 'The worker stopped responding while running this job, more than once. Try again; if it keeps happening, report it.',
         finished_at = now()
   where status = 'running'
     and heartbeat_at < now() - make_interval(secs => p_stale_after_s)
     and attempt >= p_max_attempts;
  get diagnostics v_n = row_count;

  update public.qi_jobs
     set status = case when cancel_requested then 'cancelled' else 'queued' end,
         finished_at = case when cancel_requested then now() else null end,
         claimed_by = null, claimed_at = null, heartbeat_at = null
   where status = 'running'
     and heartbeat_at < now() - make_interval(secs => p_stale_after_s)
     and attempt < p_max_attempts;
  get diagnostics v_m = row_count;
  return v_n + v_m;
end $$;
revoke all on function public.qi_sweep_stale_jobs(int, int) from public, anon, authenticated;
grant execute on function public.qi_sweep_stale_jobs(int, int) to service_role;

drop index if exists public.qi_jobs_executor_idx;
alter table public.qi_jobs drop constraint if exists qi_jobs_executor_check;
alter table public.qi_jobs drop column if exists device_id;
alter table public.qi_jobs drop column if exists executor;

alter table public.qi_datasets drop constraint if exists qi_datasets_storage_location_check;
alter table public.qi_datasets drop column if exists storage_location;

drop table if exists public.seismic_copy_requests;
drop table if exists public.seismic_volume_replicas;
drop function if exists public.seismic_volume_replicas_touch();

drop index if exists public.seismic_volumes_storage_location_idx;
alter table public.seismic_volumes drop constraint if exists seismic_volumes_storage_location_check;
alter table public.seismic_volumes drop constraint if exists seismic_volumes_previews_check;
alter table public.seismic_volumes drop column if exists previews;
alter table public.seismic_volumes drop column if exists device_id;
alter table public.seismic_volumes drop column if exists brick_root;
alter table public.seismic_volumes drop column if exists content_id;
alter table public.seismic_volumes drop column if exists storage_location;

drop table if exists public.seismic_devices;
