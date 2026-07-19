-- Fluid Systems & Flow Behavior Studio: Studio-shell migration companion.
-- The shared saved-projects service (src/utils/savedProjects.js) lists and
-- upserts by updated_at; this table predates the Studio kit and was created
-- without that column. Additive and idempotent; the legacy UI ignores it.

alter table public.saved_fluid_studio_projects
    add column if not exists updated_at timestamptz;

update public.saved_fluid_studio_projects
    set updated_at = created_at
    where updated_at is null;

alter table public.saved_fluid_studio_projects
    alter column updated_at set default now(),
    alter column updated_at set not null;
