-- Midstream & Downstream DS1 — Crude Assay & Blending Studio persistence.
--
-- Follows the saved_<app>_projects convention (owner-scoped RLS with WITH
-- CHECK, whole-input payload in inputs_data). Results are recomputed on load
-- and never stored: cut yields, blend properties, the stability screen and
-- the netback are all pure functions of the assays entered, so a reopened
-- study cannot show numbers that no longer follow from its inputs.
--
-- Safe pre-deploy, idempotent. The app degrades to a stated "run the
-- migration" message without it.

create table if not exists public.saved_crude_assay_projects (
    id uuid primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    project_name text not null,
    inputs_data jsonb not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.saved_crude_assay_projects enable row level security;

do $$
begin
    begin
        create policy "Users can manage their own assay studies"
            on public.saved_crude_assay_projects for all
            using (auth.uid() = user_id)
            with check (auth.uid() = user_id);
    exception when duplicate_object then null;
    end;
end $$;
