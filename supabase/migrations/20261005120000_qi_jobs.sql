-- =============================================================================
-- QI Build Programme, phase Q0: the seismic worker job queue
-- docs/scope/QI-PLAN.md, docs/scope/QI-STATUS.md
-- -----------------------------------------------------------------------------
-- The seismic worker (worker/seismic-worker, on seismic-worker.petrolord.com)
-- PULLS work: it claims queued qi_jobs rows with the service role, runs them
-- against the object store and Supabase Storage, and writes the outcome back.
-- No inbound API on the worker host. Same model as sim_runs, with two changes:
--
--   * claim, heartbeat and the stale sweep are SECURITY DEFINER functions, so
--     claiming is atomic (FOR UPDATE SKIP LOCKED) and several worker hosts can
--     share one queue; the heartbeat also carries progress and returns the
--     cancel flag in one round trip;
--   * terminal writes from the worker are guarded on (claimed_by, attempt), so
--     a worker that lost its claim to the sweep cannot overwrite a newer try.
--
-- Humans READ their own jobs. The only client write paths are
-- qi_enqueue_job and qi_cancel_job. claim/heartbeat/sweep are callable by the
-- service role only. The worker bypasses RLS, so EVERY handler must check that
-- the job's owner owns its inputs before reading them.
--
-- Product-prefixed table (qi_*); no shared table is touched. Safe to apply
-- ahead of any app deploy: nothing in the SPA reads it yet.
-- =============================================================================

create table if not exists public.qi_jobs (
    id               uuid primary key default gen_random_uuid(),
    user_id          uuid not null references auth.users (id) on delete cascade,
    organization_id  uuid references public.organizations (id) on delete set null,
    kind             text not null check (kind ~ '^[a-z][a-z0-9_]{1,62}$'),
    params           jsonb not null default '{}'::jsonb,
    input_refs       jsonb not null default '{}'::jsonb,
    status           text not null default 'queued'
                       check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
    progress         real not null default 0 check (progress >= 0 and progress <= 1),
    progress_message text,
    cancel_requested boolean not null default false,
    attempt          int not null default 0,
    claimed_by       text,
    queued_at        timestamptz not null default now(),
    claimed_at       timestamptz,
    heartbeat_at     timestamptz,
    finished_at      timestamptz,
    result_refs      jsonb,
    failure_stage    text,
    error_message    text,
    engine_commit    text,
    cost_seconds     real
);

create index if not exists qi_jobs_queue_idx
    on public.qi_jobs (queued_at) where status = 'queued';
create index if not exists qi_jobs_running_idx
    on public.qi_jobs (heartbeat_at) where status = 'running';
create index if not exists qi_jobs_user_idx
    on public.qi_jobs (user_id, queued_at desc);

alter table public.qi_jobs enable row level security;

drop policy if exists "qi_jobs_select_own" on public.qi_jobs;
create policy "qi_jobs_select_own"
    on public.qi_jobs for select
    using (auth.uid() = user_id);

comment on table public.qi_jobs is
  'Seismic worker job queue (QI programme Q0). Clients enqueue and cancel only through qi_enqueue_job and qi_cancel_job; the worker claims with the service role.';

-- ---------------------------------------------------------------------------
-- Enqueue (client)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Cancel (client): queued -> cancelled now; running -> flag for the worker
-- ---------------------------------------------------------------------------
create or replace function public.qi_cancel_job(p_job_id uuid)
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  v_status text;
begin
  update public.qi_jobs
     set status = 'cancelled', finished_at = now()
   where id = p_job_id and user_id = auth.uid() and status = 'queued'
  returning status into v_status;
  if found then return 'cancelled'; end if;

  update public.qi_jobs
     set cancel_requested = true
   where id = p_job_id and user_id = auth.uid() and status = 'running'
  returning status into v_status;
  if found then return 'cancel_requested'; end if;

  return 'not_cancellable';
end $$;

-- ---------------------------------------------------------------------------
-- Claim (worker): oldest queued job of a kind this worker runs, atomically
-- ---------------------------------------------------------------------------
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
          order by q.queued_at
          limit 1
          for update skip locked)
  returning j.*;
end $$;

-- ---------------------------------------------------------------------------
-- Heartbeat (worker): keeps the claim alive, records progress, reports cancel.
-- still_mine is false when the sweep has requeued the job under this worker.
-- ---------------------------------------------------------------------------
create or replace function public.qi_heartbeat_job(
    p_job_id uuid, p_worker_id text, p_attempt int,
    p_progress real default null, p_message text default null)
returns table (cancel_requested boolean, still_mine boolean)
language plpgsql security definer
set search_path = public
as $$
declare
  v_cancel boolean;
begin
  update public.qi_jobs j
     set heartbeat_at = now(),
         progress = coalesce(least(greatest(p_progress, 0), 1), j.progress),
         progress_message = coalesce(left(p_message, 200), j.progress_message)
   where j.id = p_job_id and j.status = 'running'
     and j.claimed_by = p_worker_id and j.attempt = p_attempt
  returning j.cancel_requested into v_cancel;
  if found then
    return query select v_cancel, true;
  else
    return query select false, false;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Stale sweep (worker): requeue lost jobs, fail them after p_max_attempts
-- ---------------------------------------------------------------------------
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

revoke all on function public.qi_enqueue_job(text, jsonb, jsonb, uuid) from public, anon;
grant execute on function public.qi_enqueue_job(text, jsonb, jsonb, uuid) to authenticated;
revoke all on function public.qi_cancel_job(uuid) from public, anon;
grant execute on function public.qi_cancel_job(uuid) to authenticated;

revoke all on function public.qi_claim_job(text, text[]) from public, anon, authenticated;
revoke all on function public.qi_heartbeat_job(uuid, text, int, real, text) from public, anon, authenticated;
revoke all on function public.qi_sweep_stale_jobs(int, int) from public, anon, authenticated;
grant execute on function public.qi_claim_job(text, text[]) to service_role;
grant execute on function public.qi_heartbeat_job(uuid, text, int, real, text) to service_role;
grant execute on function public.qi_sweep_stale_jobs(int, int) to service_role;
