-- EPE Wave E (docs/scope/EPE-Industry-Audit.md Band 4: 4.2/4.3/4.11 + run
-- locking): org sharing v1 (read-only) on the Seismolord W4.1 pattern, case
-- archiving, run lock/approve, and the corporate assumption library.
--
-- Sharing semantics: a case owner may share a CASE with their organization;
-- members then READ the case and its whole family (uploads, configs, runs,
-- results, MC runs, sensitivity). All writes stay owner-scoped. Reviewers
-- review; they do not run or edit.

-- ---- epe_cases: share column, archive, split policies ---------------
alter table public.epe_cases
  add column if not exists organization_id uuid references public.organizations (id) on delete set null,
  add column if not exists archived_at timestamptz;

comment on column public.epe_cases.organization_id is
  'Wave E org sharing: null = private; set = read-only visible to that organization (whole case family). Owner-only writes everywhere.';
comment on column public.epe_cases.archived_at is
  'Wave E: soft archive; archived cases hide from the default list.';

create index if not exists epe_cases_organization_id_idx
  on public.epe_cases (organization_id) where organization_id is not null;

drop policy if exists "Users can manage their own EPE cases" on public.epe_cases;
drop policy if exists "epe_cases_select_own_or_org" on public.epe_cases;
create policy "epe_cases_select_own_or_org"
  on public.epe_cases for select
  using (
    auth.uid() = user_id
    or (organization_id is not null and public.is_org_member(organization_id))
  );
drop policy if exists "epe_cases_insert_own" on public.epe_cases;
create policy "epe_cases_insert_own"
  on public.epe_cases for insert
  with check (
    auth.uid() = user_id
    and (organization_id is null or public.is_org_member(organization_id))
  );
drop policy if exists "epe_cases_update_own" on public.epe_cases;
create policy "epe_cases_update_own"
  on public.epe_cases for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and (organization_id is null or public.is_org_member(organization_id))
  );
drop policy if exists "epe_cases_delete_own" on public.epe_cases;
create policy "epe_cases_delete_own"
  on public.epe_cases for delete
  using (auth.uid() = user_id);

-- ---- shared-case readers on the family (SELECT-only, additive) ------
-- Case-keyed children.
drop policy if exists "epe_production_volumes_select_org" on public.epe_production_volumes;
create policy "epe_production_volumes_select_org"
  on public.epe_production_volumes for select
  using (exists (
    select 1 from public.epe_cases c
    where c.id = epe_production_volumes.case_id
      and c.organization_id is not null
      and public.is_org_member(c.organization_id)
  ));
drop policy if exists "epe_capex_select_org" on public.epe_capex;
create policy "epe_capex_select_org"
  on public.epe_capex for select
  using (exists (
    select 1 from public.epe_cases c
    where c.id = epe_capex.case_id
      and c.organization_id is not null
      and public.is_org_member(c.organization_id)
  ));
drop policy if exists "epe_opex_select_org" on public.epe_opex;
create policy "epe_opex_select_org"
  on public.epe_opex for select
  using (exists (
    select 1 from public.epe_cases c
    where c.id = epe_opex.case_id
      and c.organization_id is not null
      and public.is_org_member(c.organization_id)
  ));
drop policy if exists "epe_run_configs_select_org" on public.epe_run_configs;
create policy "epe_run_configs_select_org"
  on public.epe_run_configs for select
  using (exists (
    select 1 from public.epe_cases c
    where c.id = epe_run_configs.case_id
      and c.organization_id is not null
      and public.is_org_member(c.organization_id)
  ));
drop policy if exists "epe_runs_select_org" on public.epe_runs;
create policy "epe_runs_select_org"
  on public.epe_runs for select
  using (exists (
    select 1 from public.epe_cases c
    where c.id = epe_runs.case_id
      and c.organization_id is not null
      and public.is_org_member(c.organization_id)
  ));
drop policy if exists "epe_mc_runs_select_org" on public.epe_mc_runs;
create policy "epe_mc_runs_select_org"
  on public.epe_mc_runs for select
  using (exists (
    select 1 from public.epe_cases c
    where c.id = epe_mc_runs.case_id
      and c.organization_id is not null
      and public.is_org_member(c.organization_id)
  ));
-- Run-keyed and deeper children.
drop policy if exists "epe_results_select_org" on public.epe_results;
create policy "epe_results_select_org"
  on public.epe_results for select
  using (exists (
    select 1 from public.epe_runs r
    join public.epe_cases c on c.id = r.case_id
    where r.id = epe_results.run_id
      and c.organization_id is not null
      and public.is_org_member(c.organization_id)
  ));
drop policy if exists "epe_sensitivity_runs_select_org" on public.epe_sensitivity_runs;
create policy "epe_sensitivity_runs_select_org"
  on public.epe_sensitivity_runs for select
  using (exists (
    select 1 from public.epe_runs r
    join public.epe_cases c on c.id = r.case_id
    where r.id = epe_sensitivity_runs.base_run_id
      and c.organization_id is not null
      and public.is_org_member(c.organization_id)
  ));
drop policy if exists "epe_sensitivity_results_select_org" on public.epe_sensitivity_results;
create policy "epe_sensitivity_results_select_org"
  on public.epe_sensitivity_results for select
  using (exists (
    select 1 from public.epe_sensitivity_runs sr
    join public.epe_runs r on r.id = sr.base_run_id
    join public.epe_cases c on c.id = r.case_id
    where sr.id = epe_sensitivity_results.sensitivity_run_id
      and c.organization_id is not null
      and public.is_org_member(c.organization_id)
  ));

-- ---- epe_runs: lock / approve ---------------------------------------
alter table public.epe_runs
  add column if not exists locked boolean not null default false,
  add column if not exists approved_by uuid references auth.users (id) on delete set null,
  add column if not exists approved_at timestamptz;

comment on column public.epe_runs.locked is
  'Wave E: a locked run cannot be deleted (RLS-enforced) until its owner unlocks it.';

-- Replace the blanket ALL policy so DELETE can honor the lock. The org
-- SELECT policy above already covers shared reads.
drop policy if exists "Users can manage their own EPE runs" on public.epe_runs;
drop policy if exists "epe_runs_select_own" on public.epe_runs;
create policy "epe_runs_select_own"
  on public.epe_runs for select
  using (auth.uid() = user_id);
drop policy if exists "epe_runs_insert_own" on public.epe_runs;
create policy "epe_runs_insert_own"
  on public.epe_runs for insert
  with check (auth.uid() = user_id);
drop policy if exists "epe_runs_update_own" on public.epe_runs;
create policy "epe_runs_update_own"
  on public.epe_runs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
drop policy if exists "epe_runs_delete_own_unlocked" on public.epe_runs;
create policy "epe_runs_delete_own_unlocked"
  on public.epe_runs for delete
  using (auth.uid() = user_id and locked = false);

-- ---- corporate assumption library (4.3) -----------------------------
create table if not exists public.epe_assumption_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  organization_id uuid references public.organizations (id) on delete set null,
  name text not null,
  description text,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.epe_assumption_sets is
  'Wave E: reusable pricing/economics assumption sets (payload = the run-config fields it pins, e.g. prices, deck, differentials, discounting). organization_id set = shared read-only with that org.';

alter table public.epe_assumption_sets enable row level security;
create index if not exists epe_assumption_sets_org_idx
  on public.epe_assumption_sets (organization_id) where organization_id is not null;

drop policy if exists "epe_assumption_sets_select_own_or_org" on public.epe_assumption_sets;
create policy "epe_assumption_sets_select_own_or_org"
  on public.epe_assumption_sets for select
  using (
    auth.uid() = user_id
    or (organization_id is not null and public.is_org_member(organization_id))
  );
drop policy if exists "epe_assumption_sets_insert_own" on public.epe_assumption_sets;
create policy "epe_assumption_sets_insert_own"
  on public.epe_assumption_sets for insert
  with check (
    auth.uid() = user_id
    and (organization_id is null or public.is_org_member(organization_id))
  );
drop policy if exists "epe_assumption_sets_update_own" on public.epe_assumption_sets;
create policy "epe_assumption_sets_update_own"
  on public.epe_assumption_sets for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and (organization_id is null or public.is_org_member(organization_id))
  );
drop policy if exists "epe_assumption_sets_delete_own" on public.epe_assumption_sets;
create policy "epe_assumption_sets_delete_own"
  on public.epe_assumption_sets for delete
  using (auth.uid() = user_id);
