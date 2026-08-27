-- =============================================================================
-- Reservoir Simulation Studio — S0 foundation (OPM Flow connectivity)
-- docs/scope/ReservoirSimulationStudio-STATUS.md
-- -----------------------------------------------------------------------------
-- Petrolord runs reservoir simulations by driving OPM Flow (open-source,
-- Eclipse-deck-compatible) on the studio VPS. Prod is a static SPA + Supabase,
-- so the worker PULLS: it polls sim_runs with the service-role key, downloads
-- the deck from the private 'sim' bucket, runs flow, uploads results under the
-- owner's storage prefix and updates the row. No inbound API on the VPS.
--
--   * sim_cases  - user-authored simulation cases (client-writable, owner RLS,
--                  org members read)
--   * sim_runs   - job queue/status registry. Humans READ ONLY; all writes go
--                  through the service role (worker) or the two RPCs below.
--   * sim_enqueue_run(case_id)  - SECURITY DEFINER enqueue with quotas
--   * sim_cancel_run(run_id)    - queued -> cancelled; running -> flag for the
--                                 worker to SIGTERM flow at next heartbeat
--   * 'sim' bucket - private; deck {uid}/{case_id}/deck/..., results
--                  {uid}/{case_id}/runs/{run_id}/... (worker writes under the
--                  OWNER's prefix so the owner-path select policy serves the
--                  SPA directly)
--
-- Safe to apply ahead of the app deploy (no tile change). The tile seed is a
-- separate migration HELD for the prod upload that carries the route.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Drop the legacy Horizons-era sim tables (discovered live 2026-08-26).
--    sim_projects {base_deck_info} / sim_cases {case_name, overrides,
--    history_match_score} were hand-created for the dead
--    reservoir-simulation-connector shell (archived R0; edge function never
--    existed). Both verified EMPTY and referenced by zero code; the only FK
--    is sim_cases -> sim_projects. Guarded on the legacy signature column so
--    re-runs never touch the new table, and it refuses to drop if any rows
--    somehow appeared.
-- ---------------------------------------------------------------------------
do $$
declare
  v_rows bigint;
begin
  if to_regclass('public.sim_cases') is not null and exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'sim_cases'
         and column_name = 'case_name') then
    execute 'select count(*) from public.sim_cases' into v_rows;
    if v_rows > 0 then
      raise exception 'legacy public.sim_cases holds % rows - manual review required', v_rows;
    end if;
    drop table public.sim_cases;
    raise notice 'dropped legacy empty public.sim_cases';
  end if;

  if to_regclass('public.sim_projects') is not null and exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'sim_projects'
         and column_name = 'base_deck_info') then
    execute 'select count(*) from public.sim_projects' into v_rows;
    if v_rows > 0 then
      raise exception 'legacy public.sim_projects holds % rows - manual review required', v_rows;
    end if;
    drop table public.sim_projects;
    raise notice 'dropped legacy empty public.sim_projects';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Cases
-- ---------------------------------------------------------------------------
create table if not exists public.sim_cases (
    id              uuid primary key default gen_random_uuid(),
    user_id         uuid not null references auth.users (id) on delete cascade,
    organization_id uuid references public.organizations (id) on delete set null,
    name            text not null,
    description     text,
    deck_source     text not null default 'upload'
                      check (deck_source in ('upload', 'template', 'generated')),
    template_slug   text,           -- e.g. 'SPE1CASE1' when deck_source='template'
    deck_path       text,           -- storage key of the main .DATA file
    deck_bytes      bigint,         -- total bundle size (client-reported; worker re-checks)
    deck_sha256     text,           -- main deck hash (client-reported; worker re-hashes)
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create index if not exists sim_cases_user_idx
    on public.sim_cases (user_id, updated_at desc);

alter table public.sim_cases enable row level security;

drop policy if exists "sim_cases_select_own_or_org" on public.sim_cases;
create policy "sim_cases_select_own_or_org"
    on public.sim_cases for select
    using (
        auth.uid() = user_id
        or (organization_id is not null and public.is_org_member(organization_id))
    );

drop policy if exists "sim_cases_insert_own" on public.sim_cases;
create policy "sim_cases_insert_own"
    on public.sim_cases for insert
    with check (
        auth.uid() = user_id
        and (organization_id is null or public.is_org_member(organization_id))
    );

drop policy if exists "sim_cases_update_own" on public.sim_cases;
create policy "sim_cases_update_own"
    on public.sim_cases for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

drop policy if exists "sim_cases_delete_own" on public.sim_cases;
create policy "sim_cases_delete_own"
    on public.sim_cases for delete
    using (auth.uid() = user_id);

comment on table public.sim_cases is
  'Reservoir Simulation Studio cases (Eclipse-style decks in the private sim bucket, run by the OPM Flow worker).';

-- ---------------------------------------------------------------------------
-- 2. Runs (job queue; service-role-written)
-- ---------------------------------------------------------------------------
create table if not exists public.sim_runs (
    id               uuid primary key default gen_random_uuid(),
    case_id          uuid not null references public.sim_cases (id) on delete cascade,
    -- Denormalized so quota checks and the worker's storage prefix never need a join.
    user_id          uuid not null references auth.users (id) on delete cascade,
    organization_id  uuid,
    status           text not null default 'queued'
                       check (status in ('queued', 'running', 'complete', 'failed', 'cancelled')),
    cancel_requested boolean not null default false,
    attempt          int not null default 0,
    worker_id        text,
    queued_at        timestamptz not null default now(),
    claimed_at       timestamptz,
    heartbeat_at     timestamptz,
    finished_at      timestamptz,
    deck_sha256      text,           -- hash of what the worker ACTUALLY ran
    opm_version      text,
    exit_code        int,
    failure_stage    text,           -- validate_failed|download_failed|sim_failed|timeout|oom|
                                     -- output_missing|output_too_large|parse_failed|upload_failed|worker_lost
    error_message    text,           -- honest PRT/stderr excerpt, worker-truncated (~4 KB)
    elapsed_seconds  numeric,
    active_cells     int,
    report_steps     int,
    result_path      text,           -- {uid}/{case_id}/runs/{run_id}/summary.json
    log_path         text,           -- {uid}/{case_id}/runs/{run_id}/prt_excerpt.txt
    result_bytes     bigint
);

create index if not exists sim_runs_queue_idx
    on public.sim_runs (queued_at) where status = 'queued';
create index if not exists sim_runs_case_idx
    on public.sim_runs (case_id, queued_at desc);
create index if not exists sim_runs_quota_idx
    on public.sim_runs (user_id, queued_at desc);

alter table public.sim_runs enable row level security;

-- Humans read their own (or org) runs. All writes go through the service role
-- (worker bypasses RLS) or the SECURITY DEFINER RPCs below, so there are NO
-- insert/update/delete policies (org_export_jobs convention).
drop policy if exists "sim_runs_select_own_or_org" on public.sim_runs;
create policy "sim_runs_select_own_or_org"
    on public.sim_runs for select
    using (
        auth.uid() = user_id
        or (organization_id is not null and public.is_org_member(organization_id))
    );

comment on table public.sim_runs is
  'OPM Flow job queue. Worker on the studio VPS claims queued rows atomically; clients enqueue/cancel only via sim_enqueue_run/sim_cancel_run.';

-- ---------------------------------------------------------------------------
-- 3. Enqueue RPC (the only client write-path into sim_runs)
-- ---------------------------------------------------------------------------
create or replace function public.sim_enqueue_run(p_case_id uuid)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_case     public.sim_cases%rowtype;
  v_inflight int;
  v_daily    int;
  v_run_id   uuid;
begin
  if auth.uid() is null then
    raise exception 'sim_enqueue_run: sign in first';
  end if;

  select * into v_case from public.sim_cases where id = p_case_id;
  if v_case.id is null or v_case.user_id <> auth.uid() then
    raise exception 'sim_enqueue_run: case not found (or not yours)';
  end if;
  if v_case.deck_path is null then
    raise exception 'sim_enqueue_run: upload a deck to this case first';
  end if;
  if coalesce(v_case.deck_bytes, 0) > 26214400 then
    raise exception 'sim_enqueue_run: deck bundle exceeds the 25 MB limit';
  end if;

  -- Quotas (constants documented in ReservoirSimulationStudio-STATUS.md).
  select count(*) into v_inflight
    from public.sim_runs
   where user_id = auth.uid() and status in ('queued', 'running');
  if v_inflight >= 2 then
    raise exception 'sim_enqueue_run: you already have 2 runs queued or running - wait for one to finish';
  end if;

  select count(*) into v_daily
    from public.sim_runs
   where user_id = auth.uid() and queued_at > now() - interval '24 hours';
  if v_daily >= 10 then
    raise exception 'sim_enqueue_run: daily limit reached (10 runs per 24 h)';
  end if;

  insert into public.sim_runs (case_id, user_id, organization_id)
  values (v_case.id, v_case.user_id, v_case.organization_id)
  returning id into v_run_id;

  return v_run_id;
end;
$$;

revoke all on function public.sim_enqueue_run(uuid) from public, anon;
grant execute on function public.sim_enqueue_run(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Cancel RPC
-- ---------------------------------------------------------------------------
create or replace function public.sim_cancel_run(p_run_id uuid)
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  v_run public.sim_runs%rowtype;
begin
  select * into v_run from public.sim_runs where id = p_run_id;
  if v_run.id is null or v_run.user_id <> auth.uid() then
    raise exception 'sim_cancel_run: run not found (or not yours)';
  end if;

  if v_run.status = 'queued' then
    -- Guarded so a worker claim between the SELECT and this UPDATE wins.
    update public.sim_runs
       set status = 'cancelled', finished_at = now()
     where id = p_run_id and status = 'queued';
    if found then
      return 'cancelled';
    end if;
    -- Fell through: the worker claimed it meanwhile; flag it instead.
  end if;

  if v_run.status = 'running' or v_run.status = 'queued' then
    update public.sim_runs set cancel_requested = true where id = p_run_id;
    return 'cancel_requested';
  end if;

  return v_run.status; -- already finished; nothing to do
end;
$$;

revoke all on function public.sim_cancel_run(uuid) from public, anon;
grant execute on function public.sim_cancel_run(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Private 'sim' bucket + owner-path storage policies
--    (seismic bucket model, 20260710170000; per-verb, idempotent)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('sim', 'sim', false)
on conflict (id) do nothing;

drop policy if exists "sim_objects_select_own" on storage.objects;
create policy "sim_objects_select_own"
    on storage.objects for select to authenticated
    using (
        bucket_id = 'sim'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

drop policy if exists "sim_objects_insert_own" on storage.objects;
create policy "sim_objects_insert_own"
    on storage.objects for insert to authenticated
    with check (
        bucket_id = 'sim'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

drop policy if exists "sim_objects_update_own" on storage.objects;
create policy "sim_objects_update_own"
    on storage.objects for update to authenticated
    using (
        bucket_id = 'sim'
        and (storage.foldername(name))[1] = auth.uid()::text
    )
    with check (
        bucket_id = 'sim'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

drop policy if exists "sim_objects_delete_own" on storage.objects;
create policy "sim_objects_delete_own"
    on storage.objects for delete to authenticated
    using (
        bucket_id = 'sim'
        and (storage.foldername(name))[1] = auth.uid()::text
    );
