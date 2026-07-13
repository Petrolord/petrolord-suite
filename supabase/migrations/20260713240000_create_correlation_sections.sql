-- Well Correlation G3.1 (docs/scope/WellCorrelation-PLAN.md, approved
-- 2026-07-13).
--
-- geo_correlation_sections — Well Correlation's app-private workspace
-- state: the ordered set of wells on a cross-section, the datum choice
-- (structural vs flatten-on-a-top), and track layout. Small jsonb,
-- owner-only in every direction (the petro_projects pattern, plan
-- decision 3). This is NOT a registry child — the tops it edits are
-- the shared geo_wells_tops rows, which keep their existing RLS
-- unchanged; only the SECTION definition lives here.
--
-- No change to geo_wells_tops / geo_wells_zones: G3 reads and writes
-- the existing rows through per-top service functions
-- (src/lib/wellsRegistry.js saveTop/updateTop/deleteTop/propagateTop),
-- all owner-only via the policies proven in the G1.1 pentest.

create table if not exists public.geo_correlation_sections (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid not null references auth.users (id) on delete cascade,
    name          text not null,
    well_ids      uuid[] not null default '{}',
    datum         jsonb not null default '{"mode":"structural"}'::jsonb,
    track_layout  jsonb not null default '{}'::jsonb,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

comment on table public.geo_correlation_sections is
    'Well Correlation section state (ordered well_ids, datum choice, track layout — small jsonb). Owner-only; the tops it edits are the shared geo_wells_tops rows.';

create index if not exists geo_correlation_sections_user_id_idx
    on public.geo_correlation_sections (user_id, updated_at desc);

alter table public.geo_correlation_sections enable row level security;

drop policy if exists "geo_correlation_sections_select_own" on public.geo_correlation_sections;
create policy "geo_correlation_sections_select_own"
    on public.geo_correlation_sections for select
    using (auth.uid() = user_id);

drop policy if exists "geo_correlation_sections_insert_own" on public.geo_correlation_sections;
create policy "geo_correlation_sections_insert_own"
    on public.geo_correlation_sections for insert
    with check (auth.uid() = user_id);

drop policy if exists "geo_correlation_sections_update_own" on public.geo_correlation_sections;
create policy "geo_correlation_sections_update_own"
    on public.geo_correlation_sections for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

drop policy if exists "geo_correlation_sections_delete_own" on public.geo_correlation_sections;
create policy "geo_correlation_sections_delete_own"
    on public.geo_correlation_sections for delete
    using (auth.uid() = user_id);
