-- Facilities F2 — bring saved_relief_projects onto the shared
-- savedProjects service contract: the service orders and upserts by
-- updated_at, which the Horizons-era table never had. Additive and
-- idempotent; existing rows backfill from created_at. The old app's
-- results_data column stays in place (the studio no longer writes it:
-- results are re-derived from inputs on load, the saved_* convention).

alter table public.saved_relief_projects
    add column if not exists updated_at timestamptz;

update public.saved_relief_projects
   set updated_at = created_at
 where updated_at is null;

alter table public.saved_relief_projects
    alter column updated_at set default now(),
    alter column updated_at set not null;

-- The service upserts client-generated ids; the table's id already has
-- gen_random_uuid() as default, so no change needed there. results_data
-- must accept the studio's inputs-only writes:
alter table public.saved_relief_projects
    alter column results_data drop not null;
