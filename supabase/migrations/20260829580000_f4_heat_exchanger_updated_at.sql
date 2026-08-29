-- Facilities F4 — bring saved_heat_exchanger_projects onto the shared
-- savedProjects service contract (the same fix F2 made for the relief
-- table): the service orders and upserts by updated_at, which this
-- Horizons-era table never had. Additive and idempotent; existing rows
-- backfill from created_at. results_data becomes nullable because the
-- studio writes inputs only and re-derives results on load.

alter table public.saved_heat_exchanger_projects
    add column if not exists updated_at timestamptz;

update public.saved_heat_exchanger_projects
   set updated_at = created_at
 where updated_at is null;

alter table public.saved_heat_exchanger_projects
    alter column updated_at set default now(),
    alter column updated_at set not null;

alter table public.saved_heat_exchanger_projects
    alter column results_data drop not null;
