-- Mapping & Surface Studio MS5 (2026-09-06): per-user depth display unit.
-- The Mapping ribbon's depth unit (ft default, owner decision 2026-09-05)
-- was remembered per browser in localStorage; this column makes it
-- follow the user across browsers. Additive, defaulted, no rewrite.
-- geoscience_settings is a product table (geoscience_*), not shared-
-- table scope. Idempotent. Readers treat an absent column as "unset".

alter table public.geoscience_settings
  add column if not exists depth_unit text not null default 'ft';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'geoscience_settings_depth_unit_check'
      and conrelid = 'public.geoscience_settings'::regclass
  ) then
    alter table public.geoscience_settings
      add constraint geoscience_settings_depth_unit_check
      check (depth_unit in ('m', 'ft'));
  end if;
end $$;

comment on column public.geoscience_settings.depth_unit is
  'Depth display unit for the Geoscience map apps: m | ft (Mapping defaults to ft).';
