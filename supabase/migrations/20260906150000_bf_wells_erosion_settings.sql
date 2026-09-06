-- BF0 (BasinFlow-ROADMAP.md, 2026-09-06): erosion events and the model
-- settings (surface temperature) were held in app state but never
-- persisted, so a saved well lost them on reload. Product-prefixed
-- table (bf_*), additive, idempotent.
alter table public.bf_wells
  add column if not exists erosion_events jsonb not null default '[]'::jsonb,
  add column if not exists settings jsonb not null default '{}'::jsonb;
comment on column public.bf_wells.erosion_events is 'Erosion events [{age Ma, amount m}] consumed by the basin engine (BF0)';
comment on column public.bf_wells.settings is 'Model settings {surfaceTemp C, ...} consumed by the basin engine (BF0)';
