-- Production P0 (Production-ROADMAP.md §5): bring the four orphan
-- production tables into the repo and enforce their RLS.
--
-- All four exist only in the live DB (Horizons era): no migration, no
-- policy in repo. Live audit 2026-08-27: each carries one owner policy
-- (auth.uid() = user_id) but WELLBORE_FLOW_PROJECTS HAS RLS DISABLED —
-- the policy is unenforced decoration and any authenticated user can
-- read/write all rows (3 rows live at audit). This migration:
--
--   1. codifies the DDL (create table if not exists, mirroring the
--      live columns exactly), so repo == database;
--   2. enables RLS on all four (the actual fix for wellbore_flow_projects,
--      a no-op on the other three);
--   3. recreates each owner policy idempotently under its existing live
--      name, adding the WITH CHECK the originals lacked (a FOR ALL
--      policy without WITH CHECK falls back to USING, so behavior is
--      unchanged — this just makes the write-side rule explicit).
--
-- These are per-user app saves (saved_*_projects convention: owner-
-- scoped, no org_id). The P1 data spine (po_*) is org-scoped and
-- separate. Three of the four apps retire under this program (WFS at
-- P0, surveillance P2, flow assurance P10); their tables stay read-
-- protected until the owner-gated post-P12 drop decision, per the
-- drilling precedent. artificial_lift_designs remains live behind
-- Artificial Lift Designer.

-- 1 · artificial_lift_designs (live app: Artificial Lift Designer)
create table if not exists public.artificial_lift_designs (
    id                 uuid primary key default gen_random_uuid(),
    user_id            uuid not null references auth.users (id) on delete cascade,
    design_name        text not null,
    design_description text,
    design_data        jsonb,
    created_at         timestamptz not null default now(),
    updated_at         timestamptz not null default now()
);
alter table public.artificial_lift_designs enable row level security;
drop policy if exists "Users can manage their own designs" on public.artificial_lift_designs;
create policy "Users can manage their own designs"
    on public.artificial_lift_designs for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

-- 2 · wellbore_flow_projects (app retired at P0; table read-protected until owner-gated drop)
create table if not exists public.wellbore_flow_projects (
    id           uuid primary key default gen_random_uuid(),
    user_id      uuid not null references auth.users (id) on delete cascade,
    project_name text not null,
    inputs_data  jsonb,
    results_data jsonb,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);
alter table public.wellbore_flow_projects enable row level security;  -- THE FIX: was disabled live
drop policy if exists "Users can manage their own wellbore flow projects" on public.wellbore_flow_projects;
create policy "Users can manage their own wellbore flow projects"
    on public.wellbore_flow_projects for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

-- 3 · flow_assurance_projects (app rebuilds at P10; table stays until then)
create table if not exists public.flow_assurance_projects (
    id           uuid primary key default gen_random_uuid(),
    user_id      uuid not null references auth.users (id) on delete cascade,
    project_name text not null,
    inputs_data  jsonb,
    results_data jsonb,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);
alter table public.flow_assurance_projects enable row level security;
drop policy if exists "Users can manage their own flow assurance projects" on public.flow_assurance_projects;
create policy "Users can manage their own flow assurance projects"
    on public.flow_assurance_projects for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

-- 4 · production_surveillance_projects (app rebuilds at P2 on the po_* spine)
create table if not exists public.production_surveillance_projects (
    id           uuid primary key default gen_random_uuid(),
    user_id      uuid not null references auth.users (id) on delete cascade,
    project_name text not null,
    inputs_data  jsonb,
    results_data jsonb,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);
alter table public.production_surveillance_projects enable row level security;
drop policy if exists "Users can manage their own surveillance projects" on public.production_surveillance_projects;
create policy "Users can manage their own surveillance projects"
    on public.production_surveillance_projects for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
