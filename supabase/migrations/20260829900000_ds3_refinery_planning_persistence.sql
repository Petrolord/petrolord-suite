-- Midstream & Downstream DS3 — Refinery Planning & Scheduling persistence.
--
-- saved_<app>_projects convention (owner-scoped RLS with WITH CHECK, payload
-- in inputs_data). Only the configuration, the period and the recorded
-- actuals are stored: the plan, the schedule and the reconciliation are all
-- recomputed on load, so a reopened plan cannot show numbers that no longer
-- follow from its configuration.
--
-- Safe pre-deploy, idempotent.

create table if not exists public.saved_refinery_plan_projects (
    id uuid primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    project_name text not null,
    inputs_data jsonb not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.saved_refinery_plan_projects enable row level security;

do $$
begin
    begin
        create policy "Users can manage their own refinery plans"
            on public.saved_refinery_plan_projects for all
            using (auth.uid() = user_id)
            with check (auth.uid() = user_id);
    exception when duplicate_object then null;
    end;
end $$;
