-- Petrophysics Studio PS3 (audit A2 + B1): named interpretations and
-- per-zone parameter overrides.
--
-- petro_projects becomes multi-row per user in app behaviour (the
-- schema always allowed it; the app now exposes list/open/save-as/
-- rename/delete). Additive only: the per-zone override store and a
-- description column. RLS is untouched — the existing owner-only
-- select/insert/update/delete policies (20260713220000) already cover
-- every new operation. Product-prefixed table; no shared-table change.

alter table public.petro_projects
    add column if not exists zone_params jsonb not null default '{}'::jsonb,
    add column if not exists description text;

comment on column public.petro_projects.zone_params is
    'Per-zone parameter override patches keyed by geo_wells_zones.id (Petrophysics Studio PS3). Merged over params at compute time; zones sorted by top, first match wins.';

comment on column public.petro_projects.description is
    'Optional free-text note shown in the interpretation list.';
