-- F0 — DDL backfill for the four facilities persistence tables
-- (Facilities-ROADMAP.md §4.5). These tables predate the migrations
-- directory and existed only in the live DB; this captures them
-- in-repo so fresh rebuilds create them. Verified against the live
-- schema 2026-08-29: all four already have RLS ENABLED with an owner
-- policy plus an admin policy, so on the live DB this migration is a
-- no-op (everything guarded by IF NOT EXISTS / duplicate_object).

-- saved_relief_projects (Relief & Blowdown Sizer)
create table if not exists public.saved_relief_projects (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id),
    project_name text not null,
    inputs_data jsonb not null,
    results_data jsonb,
    created_at timestamptz not null default now()
);

-- saved_pipeline_sizer_projects (Pipeline Sizer, retired at F0; table
-- kept for its rows and for the F1 flagship to migrate or ignore)
create table if not exists public.saved_pipeline_sizer_projects (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    project_name text not null,
    inputs_data jsonb not null,
    results_data jsonb,
    created_at timestamptz not null default now()
);

-- saved_heat_exchanger_projects (Heat Exchanger Sizer)
create table if not exists public.saved_heat_exchanger_projects (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id),
    project_name text not null,
    inputs_data jsonb not null,
    results_data jsonb,
    created_at timestamptz not null default now()
);

-- facility_layouts (Facility Layout Mapper)
create table if not exists public.facility_layouts (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    project_name text not null,
    layout_data jsonb not null,
    created_at timestamptz not null default now()
);

alter table public.saved_relief_projects enable row level security;
alter table public.saved_pipeline_sizer_projects enable row level security;
alter table public.saved_heat_exchanger_projects enable row level security;
alter table public.facility_layouts enable row level security;

do $$
begin
    begin
        create policy "Users can manage their own data"
            on public.saved_relief_projects for all
            using (auth.uid() = user_id);
    exception when duplicate_object then null;
    end;
    begin
        create policy "Allow admin full access"
            on public.saved_relief_projects for all
            using (get_my_claim('user_role'::text) = 'admin'::text);
    exception when duplicate_object then null;
    end;

    begin
        create policy "Users can manage their own pipeline sizer projects"
            on public.saved_pipeline_sizer_projects for all
            using (auth.uid() = user_id);
    exception when duplicate_object then null;
    end;
    begin
        create policy "Allow admin full access"
            on public.saved_pipeline_sizer_projects for all
            using (get_my_claim('user_role'::text) = 'admin'::text);
    exception when duplicate_object then null;
    end;

    begin
        create policy "Users can manage their own data"
            on public.saved_heat_exchanger_projects for all
            using (auth.uid() = user_id);
    exception when duplicate_object then null;
    end;
    begin
        create policy "Allow admin full access"
            on public.saved_heat_exchanger_projects for all
            using (get_my_claim('user_role'::text) = 'admin'::text);
    exception when duplicate_object then null;
    end;

    begin
        create policy "Users can manage their own layouts"
            on public.facility_layouts for all
            using (auth.uid() = user_id);
    exception when duplicate_object then null;
    end;
    begin
        create policy "Allow admin full access"
            on public.facility_layouts for all
            using (get_my_claim('user_role'::text) = 'admin'::text);
    exception when duplicate_object then null;
    end;
end $$;
