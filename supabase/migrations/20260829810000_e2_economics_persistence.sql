-- Economics E2 — persistence for the three economics apps that had none:
-- NPV Scenario Builder, Value of Information Analyzer and Probabilistic
-- Breakeven Analyzer. All three are gated, sold apps whose work was lost
-- on every page reload.
--
-- Follows the saved_<app>_projects convention (owner-scoped RLS with
-- WITH CHECK, whole-input payload in inputs_data, results recomputed on
-- load and never duplicated server-side). Safe pre-deploy, idempotent.

create table if not exists public.saved_npv_projects (
    id uuid primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    project_name text not null,
    inputs_data jsonb not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.saved_voi_projects (
    id uuid primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    project_name text not null,
    inputs_data jsonb not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.saved_breakeven_projects (
    id uuid primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    project_name text not null,
    inputs_data jsonb not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.saved_npv_projects enable row level security;
alter table public.saved_voi_projects enable row level security;
alter table public.saved_breakeven_projects enable row level security;

do $$
begin
    begin
        create policy "Users can manage their own NPV scenarios"
            on public.saved_npv_projects for all
            using (auth.uid() = user_id)
            with check (auth.uid() = user_id);
    exception when duplicate_object then null;
    end;

    begin
        create policy "Users can manage their own VOI studies"
            on public.saved_voi_projects for all
            using (auth.uid() = user_id)
            with check (auth.uid() = user_id);
    exception when duplicate_object then null;
    end;

    begin
        create policy "Users can manage their own breakeven studies"
            on public.saved_breakeven_projects for all
            using (auth.uid() = user_id)
            with check (auth.uid() = user_id);
    exception when duplicate_object then null;
    end;
end $$;
