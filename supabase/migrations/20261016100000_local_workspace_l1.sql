-- =============================================================================
-- Local workspace L1 for Seismolord and QI Studio (owner decisions 2026-10-15)
-- docs/scope/LocalWorkspace-DESIGN.md, sections 5.2, 4.3 and 6.5
-- -----------------------------------------------------------------------------
-- Heavy seismic bytes can now live on the user's own disk (a folder the user
-- picks in Chrome or Edge, or the browser's private storage elsewhere) and the
-- heavy jobs can run in that user's browser. The cloud keeps what is small and
-- shared: the volume row and manifest, provenance, previews, interpretations
-- and the audit trail. This migration adds the records that make that honest:
--
--   seismic_devices          one row per install of a user's local workspace
--                            ("Ayo's PC"); owner-only, like every user row
--   seismic_volume_replicas  one row per copy of a volume on a device, with the
--                            device label colleagues see; readable by whoever
--                            can read the volume (children follow their root,
--                            so the Suite Projects restrictive policies on
--                            seismic_volumes decide), written by its owner only
--   seismic_copy_requests    a colleague asks the volume owner for a cloud copy
--   seismic_volumes          + storage_location, content_id, brick_root,
--                            device_id, previews (per-volume preview override)
--   qi_datasets              + storage_location (ready for L2; L1 writes none)
--   qi_jobs                  + executor ('server', 'browser', 'local') and
--                            device_id. The server worker claims and sweeps
--                            executor = 'server' rows only, and a server
--                            enqueue that names a local-only volume is refused.
--                            Browser jobs are recorded through two new RPCs,
--                            qi_start_local_job and qi_update_local_job, so the
--                            audit trail and the jobs list stay in one table.
--
-- Existing rows keep storage_location 'cloud' and executor 'server' (owner
-- decision 7: existing projects and volumes stay as they are), so every
-- current read, claim and enqueue behaves exactly as before. Product tables
-- only; no shared table is touched. Idempotent; no transaction lines.
-- Rollback: tools/security/local-workspace/rollback/20261016100000.rollback.sql
-- Verify:   tools/security/local-workspace/verify/20261016100000.verify.sql
-- Dry run:  tools/security/local-workspace/probes/run_dryrun.sh
-- =============================================================================

-- ---------------------------------------------------------------------------
-- seismic_devices
-- ---------------------------------------------------------------------------
create table if not exists public.seismic_devices (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
    label         text not null check (char_length(btrim(label)) between 1 and 80),
    kind          text not null default 'browser_folder'
                    check (kind in ('browser_folder', 'browser_opfs', 'helper')),
    created_at    timestamptz not null default now(),
    last_seen_at  timestamptz not null default now(),
    revoked_at    timestamptz
);
create index if not exists seismic_devices_user_idx on public.seismic_devices (user_id);
alter table public.seismic_devices enable row level security;

drop policy if exists "seismic_devices_select_own" on public.seismic_devices;
create policy "seismic_devices_select_own" on public.seismic_devices
    for select to authenticated using (user_id = auth.uid());
drop policy if exists "seismic_devices_insert_own" on public.seismic_devices;
create policy "seismic_devices_insert_own" on public.seismic_devices
    for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "seismic_devices_update_own" on public.seismic_devices;
create policy "seismic_devices_update_own" on public.seismic_devices
    for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "seismic_devices_delete_own" on public.seismic_devices;
create policy "seismic_devices_delete_own" on public.seismic_devices
    for delete to authenticated using (user_id = auth.uid());

revoke all on public.seismic_devices from anon;
grant select, insert, update, delete on public.seismic_devices to authenticated;
comment on table public.seismic_devices is
    'Local workspace L1: one row per install of a user''s local seismic workspace (a browser folder, the browser''s private storage, or the L2 helper). Owner-only. revoked_at stops the device being used for new replicas and jobs.';

-- ---------------------------------------------------------------------------
-- seismic_volumes: where the bulk samples live, and the volume identity
-- ---------------------------------------------------------------------------
alter table public.seismic_volumes
    add column if not exists storage_location text not null default 'cloud',
    add column if not exists content_id text,
    add column if not exists brick_root text,
    add column if not exists device_id uuid references public.seismic_devices (id) on delete set null,
    add column if not exists previews text not null default 'auto';

do $$ begin
  alter table public.seismic_volumes add constraint seismic_volumes_storage_location_check
    check (storage_location in ('cloud', 'local', 'both'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.seismic_volumes add constraint seismic_volumes_previews_check
    check (previews in ('auto', 'on', 'off'));
exception when duplicate_object then null; end $$;

create index if not exists seismic_volumes_storage_location_idx
    on public.seismic_volumes (storage_location) where storage_location <> 'cloud';

comment on column public.seismic_volumes.storage_location is
    'Local workspace L1: where the bricks live. cloud = the seismic bucket (every volume before 2026-10-16); local = only on the device(s) in seismic_volume_replicas; both = promoted, a cloud copy beside the local one.';
comment on column public.seismic_volumes.content_id is
    'Local workspace L1: the volume identity, a hash of the source SHA-256, header mapping, crop, codec and (derived volumes) the parent content_id, the job parameters and the engine commit. Same recipe on the same source gives the same content_id.';
comment on column public.seismic_volumes.brick_root is
    'Local workspace L1: root hash of the per-brick SHA-256 list. A replica is ready only when its bricks hash to this root.';
comment on column public.seismic_volumes.device_id is
    'Local workspace L1: the owner''s device that holds the original local copy (null for cloud volumes).';
comment on column public.seismic_volumes.previews is
    'Local workspace L1 (owner decision 4): per-volume override for uploading thumbnails of a local volume. auto = the project rule (on, except members-only projects), on, off.';

-- ---------------------------------------------------------------------------
-- seismic_volume_replicas
-- ---------------------------------------------------------------------------
create table if not exists public.seismic_volume_replicas (
    volume_id     uuid not null references public.seismic_volumes (id) on delete cascade,
    device_id     uuid not null references public.seismic_devices (id) on delete cascade,
    user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
    device_label  text not null check (char_length(btrim(device_label)) between 1 and 80),
    state         text not null default 'writing' check (state in ('writing', 'ready', 'missing', 'deleted')),
    bytes         bigint not null default 0 check (bytes >= 0),
    verified_at   timestamptz,
    last_seen_at  timestamptz not null default now(),
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),
    primary key (volume_id, device_id)
);
create index if not exists seismic_volume_replicas_user_idx on public.seismic_volume_replicas (user_id);
create index if not exists seismic_volume_replicas_device_idx on public.seismic_volume_replicas (device_id);
alter table public.seismic_volume_replicas enable row level security;

-- read: whoever can read the volume (its own policies, Suite Projects included)
drop policy if exists "seismic_volume_replicas_select_visible" on public.seismic_volume_replicas;
create policy "seismic_volume_replicas_select_visible" on public.seismic_volume_replicas
    for select to authenticated
    using (exists (select 1 from public.seismic_volumes v where v.id = seismic_volume_replicas.volume_id));
-- write: your own replicas, on your own live device, of a volume you can read
drop policy if exists "seismic_volume_replicas_insert_own" on public.seismic_volume_replicas;
create policy "seismic_volume_replicas_insert_own" on public.seismic_volume_replicas
    for insert to authenticated
    with check (
      user_id = auth.uid()
      and exists (select 1 from public.seismic_devices d
                   where d.id = seismic_volume_replicas.device_id and d.user_id = auth.uid() and d.revoked_at is null)
      and exists (select 1 from public.seismic_volumes v where v.id = seismic_volume_replicas.volume_id)
    );
drop policy if exists "seismic_volume_replicas_update_own" on public.seismic_volume_replicas;
create policy "seismic_volume_replicas_update_own" on public.seismic_volume_replicas
    for update to authenticated
    using (user_id = auth.uid())
    with check (
      user_id = auth.uid()
      and exists (select 1 from public.seismic_devices d
                   where d.id = seismic_volume_replicas.device_id and d.user_id = auth.uid() and d.revoked_at is null)
      and exists (select 1 from public.seismic_volumes v where v.id = seismic_volume_replicas.volume_id)
    );
drop policy if exists "seismic_volume_replicas_delete_own" on public.seismic_volume_replicas;
create policy "seismic_volume_replicas_delete_own" on public.seismic_volume_replicas
    for delete to authenticated using (user_id = auth.uid());

revoke all on public.seismic_volume_replicas from anon;
grant select, insert, update, delete on public.seismic_volume_replicas to authenticated;
comment on table public.seismic_volume_replicas is
    'Local workspace L1: one row per copy of a volume on a device. device_label is what colleagues see ("Lives on Ayo''s PC"). Read follows the volume; writes are the replica owner''s own, on a live device of theirs.';

create or replace function public.seismic_volume_replicas_touch()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;
comment on function public.seismic_volume_replicas_touch() is
    'Local workspace L1: keeps seismic_volume_replicas.updated_at and seismic_copy_requests.updated_at current.';
drop trigger if exists seismic_volume_replicas_touch on public.seismic_volume_replicas;
create trigger seismic_volume_replicas_touch before update on public.seismic_volume_replicas
    for each row execute function public.seismic_volume_replicas_touch();

-- ---------------------------------------------------------------------------
-- seismic_copy_requests
-- ---------------------------------------------------------------------------
create table if not exists public.seismic_copy_requests (
    id            uuid primary key default gen_random_uuid(),
    volume_id     uuid not null references public.seismic_volumes (id) on delete cascade,
    requester_id  uuid not null default auth.uid() references auth.users (id) on delete cascade,
    owner_id      uuid not null references auth.users (id) on delete cascade,
    what          text not null default 'display' check (what in ('display', 'full')),
    status        text not null default 'open' check (status in ('open', 'fulfilled', 'declined', 'cancelled')),
    note          text check (note is null or char_length(note) <= 500),
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);
create index if not exists seismic_copy_requests_owner_idx on public.seismic_copy_requests (owner_id);
create index if not exists seismic_copy_requests_requester_idx on public.seismic_copy_requests (requester_id);
create index if not exists seismic_copy_requests_volume_idx on public.seismic_copy_requests (volume_id);
alter table public.seismic_copy_requests enable row level security;

drop policy if exists "seismic_copy_requests_select_party" on public.seismic_copy_requests;
create policy "seismic_copy_requests_select_party" on public.seismic_copy_requests
    for select to authenticated
    using (
      auth.uid() in (requester_id, owner_id)
      and exists (select 1 from public.seismic_volumes v where v.id = seismic_copy_requests.volume_id)
    );
drop policy if exists "seismic_copy_requests_insert_requester" on public.seismic_copy_requests;
create policy "seismic_copy_requests_insert_requester" on public.seismic_copy_requests
    for insert to authenticated
    with check (
      requester_id = auth.uid()
      and owner_id <> auth.uid()
      and owner_id = (select v.user_id from public.seismic_volumes v where v.id = seismic_copy_requests.volume_id)
      and status = 'open'
    );
drop policy if exists "seismic_copy_requests_update_party" on public.seismic_copy_requests;
create policy "seismic_copy_requests_update_party" on public.seismic_copy_requests
    for update to authenticated
    using (auth.uid() in (requester_id, owner_id))
    with check (
      auth.uid() in (requester_id, owner_id)
      and owner_id = (select v.user_id from public.seismic_volumes v where v.id = seismic_copy_requests.volume_id)
    );

revoke all on public.seismic_copy_requests from anon;
revoke delete, truncate, references, trigger on public.seismic_copy_requests from authenticated;
grant select, insert, update on public.seismic_copy_requests to authenticated;
comment on table public.seismic_copy_requests is
    'Local workspace L1: a colleague asks the owner of a local volume for a cloud copy (display or full). Visible to the two parties while they can read the volume. No client delete; a request ends as fulfilled, declined or cancelled.';

drop trigger if exists seismic_copy_requests_touch on public.seismic_copy_requests;
create trigger seismic_copy_requests_touch before update on public.seismic_copy_requests
    for each row execute function public.seismic_volume_replicas_touch();

-- ---------------------------------------------------------------------------
-- qi_datasets: location (ready for the L2 helper; L1 writes none)
-- ---------------------------------------------------------------------------
alter table public.qi_datasets add column if not exists storage_location text not null default 'cloud';
do $$ begin
  alter table public.qi_datasets add constraint qi_datasets_storage_location_check
    check (storage_location in ('cloud', 'local', 'both'));
exception when duplicate_object then null; end $$;
comment on column public.qi_datasets.storage_location is
    'Local workspace: where the file lives. cloud for every file today; local and both are reserved for the L2 helper (prestack gather stores on the user''s disk).';

-- ---------------------------------------------------------------------------
-- qi_jobs: executor and device
-- ---------------------------------------------------------------------------
alter table public.qi_jobs
    add column if not exists executor text not null default 'server',
    add column if not exists device_id uuid references public.seismic_devices (id) on delete set null;
do $$ begin
  alter table public.qi_jobs add constraint qi_jobs_executor_check
    check (executor in ('server', 'browser', 'local'));
exception when duplicate_object then null; end $$;
create index if not exists qi_jobs_executor_idx on public.qi_jobs (executor) where executor <> 'server';
comment on column public.qi_jobs.executor is
    'Local workspace L1: who runs the job. server = the seismic worker (claims only these); browser = the user''s browser; local = the L2 helper. Non-server rows are written through qi_start_local_job and qi_update_local_job.';
comment on column public.qi_jobs.device_id is
    'Local workspace L1: the seismic_devices row of the computer that ran a browser or local job.';

-- ---------------------------------------------------------------------------
-- Enqueue (client): server jobs only; the caps count server jobs only, and a
-- job that names a local-only volume is refused (the server cannot read it)
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

  -- local workspace L1: the server cannot read or write a volume that lives on a computer
  if exists (
    select 1 from public.seismic_volumes v
     where v.storage_location = 'local'
       and v.id::text in (
         select lower(x #>> '{}')
           from jsonb_path_query(coalesce(p_params, '{}'::jsonb), 'strict $.**') x
          where jsonb_typeof(x) = 'string'
            and (x #>> '{}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) then
    raise exception 'This job uses a volume that lives on a computer, so it runs there. Run it in the browser on that computer, or copy the volume to the cloud first.'
      using errcode = 'P0001';
  end if;

  select count(*) into v_inflight from public.qi_jobs
   where user_id = v_uid and status in ('queued', 'running') and executor = 'server';
  if v_inflight >= 4 then
    raise exception 'You already have 4 worker jobs queued or running. Wait for one to finish.'
      using errcode = 'P0001';
  end if;
  select count(*) into v_daily from public.qi_jobs
   where user_id = v_uid and queued_at > now() - interval '24 hours' and executor = 'server';
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

-- ---------------------------------------------------------------------------
-- Claim (worker): fair claim (20261006110000), server jobs only
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
          where q.status = 'queued' and q.kind = any (p_kinds) and q.executor = 'server'
          order by (select count(*) from public.qi_jobs r
                     where r.user_id = q.user_id and r.status = 'running' and r.executor = 'server'),
                   q.queued_at
          limit 1
          for update skip locked)
  returning j.*;
end $$;
revoke all on function public.qi_claim_job(text, text[]) from public, anon, authenticated;
grant execute on function public.qi_claim_job(text, text[]) to service_role;

-- ---------------------------------------------------------------------------
-- Stale sweep (worker): server jobs as before; a browser or local job whose
-- computer stopped reporting for 6 hours is failed, never requeued
-- ---------------------------------------------------------------------------
create or replace function public.qi_sweep_stale_jobs(p_stale_after_s int, p_max_attempts int)
returns int
language plpgsql security definer
set search_path = public
as $$
declare
  v_n int := 0;
  v_m int := 0;
  v_l int := 0;
begin
  update public.qi_jobs
     set status = 'failed', failure_stage = 'worker_lost',
         error_message = 'The worker stopped responding while running this job, more than once. Try again; if it keeps happening, report it.',
         finished_at = now()
   where status = 'running' and executor = 'server'
     and heartbeat_at < now() - make_interval(secs => p_stale_after_s)
     and attempt >= p_max_attempts;
  get diagnostics v_n = row_count;

  update public.qi_jobs
     set status = case when cancel_requested then 'cancelled' else 'queued' end,
         finished_at = case when cancel_requested then now() else null end,
         claimed_by = null, claimed_at = null, heartbeat_at = null
   where status = 'running' and executor = 'server'
     and heartbeat_at < now() - make_interval(secs => p_stale_after_s)
     and attempt < p_max_attempts;
  get diagnostics v_m = row_count;

  update public.qi_jobs
     set status = 'failed', failure_stage = 'browser_closed',
         error_message = 'The computer running this job stopped reporting before it finished. Open the project on that computer to run it again.',
         finished_at = now()
   where status = 'running' and executor <> 'server'
     and coalesce(heartbeat_at, claimed_at, queued_at) < now() - interval '6 hours';
  get diagnostics v_l = row_count;
  return v_n + v_m + v_l;
end $$;
revoke all on function public.qi_sweep_stale_jobs(int, int) from public, anon, authenticated;
grant execute on function public.qi_sweep_stale_jobs(int, int) to service_role;

-- ---------------------------------------------------------------------------
-- Browser and local jobs (client): recorded in qi_jobs for the audit trail
-- ---------------------------------------------------------------------------
create or replace function public.qi_start_local_job(
    p_kind text,
    p_params jsonb default '{}'::jsonb,
    p_input_refs jsonb default '{}'::jsonb,
    p_executor text default 'browser',
    p_device_id uuid default null,
    p_organization_id uuid default null)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_daily int;
  v_id    uuid;
begin
  if v_uid is null then
    raise exception 'Sign in to run jobs.' using errcode = '28000';
  end if;
  if p_kind is null or p_kind !~ '^[a-z][a-z0-9_]{1,62}$' then
    raise exception 'Unknown job kind.' using errcode = '22023';
  end if;
  if pg_column_size(coalesce(p_params, '{}'::jsonb)) > 65536
     or pg_column_size(coalesce(p_input_refs, '{}'::jsonb)) > 65536 then
    raise exception 'Job settings are too large (64 KB limit).' using errcode = '22023';
  end if;
  if p_executor is null or p_executor not in ('browser', 'local') then
    raise exception 'A job recorded from a computer runs in the browser or in Petrolord Local.' using errcode = '22023';
  end if;
  if p_device_id is not null and not exists (
       select 1 from public.seismic_devices d
        where d.id = p_device_id and d.user_id = v_uid and d.revoked_at is null) then
    raise exception 'That computer is not one of yours, or it was removed.' using errcode = '42501';
  end if;
  if p_organization_id is not null and not public.is_org_member(p_organization_id) then
    raise exception 'You are not a member of that organization.' using errcode = '42501';
  end if;
  select count(*) into v_daily from public.qi_jobs
   where user_id = v_uid and executor <> 'server' and queued_at > now() - interval '24 hours';
  if v_daily >= 2000 then
    raise exception 'Daily limit of jobs recorded from your computers reached (2000 in 24 hours).' using errcode = 'P0001';
  end if;

  insert into public.qi_jobs (user_id, organization_id, kind, params, input_refs, status, executor, device_id,
                              claimed_by, claimed_at, heartbeat_at, attempt)
  values (v_uid, p_organization_id, p_kind, coalesce(p_params, '{}'::jsonb), coalesce(p_input_refs, '{}'::jsonb),
          'running', p_executor, p_device_id, 'device:' || coalesce(p_device_id::text, 'browser'), now(), now(), 1)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.qi_start_local_job(text, jsonb, jsonb, text, uuid, uuid) from public, anon;
grant execute on function public.qi_start_local_job(text, jsonb, jsonb, text, uuid, uuid) to authenticated;
comment on function public.qi_start_local_job(text, jsonb, jsonb, text, uuid, uuid) is
    'Local workspace L1: record a job that runs in the caller''s browser (or the L2 helper) as a running qi_jobs row with executor browser/local. The server worker never claims it.';

create or replace function public.qi_update_local_job(
    p_job_id uuid,
    p_progress real default null,
    p_message text default null,
    p_status text default null,
    p_result_refs jsonb default null,
    p_failure_stage text default null,
    p_error_message text default null,
    p_engine_commit text default null,
    p_cost_seconds real default null)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_cancel boolean;
  v_status text;
begin
  if v_uid is null then
    raise exception 'Sign in to run jobs.' using errcode = '28000';
  end if;
  if p_status is not null and p_status not in ('succeeded', 'failed', 'cancelled') then
    raise exception 'A job ends as succeeded, failed or cancelled.' using errcode = '22023';
  end if;
  if p_result_refs is not null and pg_column_size(p_result_refs) > 262144 then
    raise exception 'Job results are too large (256 KB limit).' using errcode = '22023';
  end if;

  if p_status is null then
    update public.qi_jobs j
       set heartbeat_at = now(),
           progress = coalesce(least(greatest(p_progress, 0), 1), j.progress),
           progress_message = coalesce(left(p_message, 200), j.progress_message)
     where j.id = p_job_id and j.user_id = v_uid and j.executor <> 'server' and j.status = 'running'
    returning j.cancel_requested, j.status into v_cancel, v_status;
  else
    update public.qi_jobs j
       set status = p_status,
           heartbeat_at = now(),
           progress = case when p_status = 'succeeded' then 1
                           else coalesce(least(greatest(p_progress, 0), 1), j.progress) end,
           progress_message = case when p_status = 'succeeded' then null
                                   else coalesce(left(p_message, 200), j.progress_message) end,
           result_refs = coalesce(p_result_refs, j.result_refs),
           failure_stage = coalesce(left(p_failure_stage, 100), j.failure_stage),
           error_message = coalesce(left(p_error_message, 4000), j.error_message),
           engine_commit = coalesce(left(p_engine_commit, 200), j.engine_commit),
           cost_seconds = coalesce(p_cost_seconds, j.cost_seconds),
           finished_at = now()
     where j.id = p_job_id and j.user_id = v_uid and j.executor <> 'server' and j.status = 'running'
    returning j.cancel_requested, j.status into v_cancel, v_status;
  end if;

  if not found then
    select j.cancel_requested, j.status into v_cancel, v_status
      from public.qi_jobs j
     where j.id = p_job_id and j.user_id = v_uid and j.executor <> 'server';
    return jsonb_build_object('found', false, 'cancel_requested', coalesce(v_cancel, false), 'status', v_status);
  end if;
  return jsonb_build_object('found', true, 'cancel_requested', coalesce(v_cancel, false), 'status', v_status);
end $$;
revoke all on function public.qi_update_local_job(uuid, real, text, text, jsonb, text, text, text, real) from public, anon;
grant execute on function public.qi_update_local_job(uuid, real, text, text, jsonb, text, text, text, real) to authenticated;
comment on function public.qi_update_local_job(uuid, real, text, text, jsonb, text, text, text, real) is
    'Local workspace L1: progress (p_status null) or the outcome of the caller''s own running browser or local job. Returns {found, cancel_requested, status}; cancel_requested is the flag qi_cancel_job sets.';
