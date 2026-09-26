-- Mapping T1 (MAP-T1-015, 2026-09-26): a well status on the shared wells
-- registry so maps can post the industry well symbols (oil, gas, dry,
-- injector, planned). geo_wells is a geo_* product registry table, not one
-- of the shared platform tables. Nullable, no default: existing rows read
-- as "no status" and keep the plain well symbol. Idempotent.
-- HELD: owner-run, staging and production share one Supabase project.
--   supabase db query --linked -f supabase/migrations/20260926140000_geo_wells_status.sql

alter table public.geo_wells add column if not exists status text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'geo_wells_status_check'
  ) then
    alter table public.geo_wells add constraint geo_wells_status_check check (
      status is null or status in (
        'planned', 'drilling', 'oil', 'gas', 'oil_gas', 'water', 'dry',
        'injector_water', 'injector_gas', 'suspended', 'abandoned'
      )
    );
  end if;
end $$;

comment on column public.geo_wells.status is
  'Well status for map symbols (Mapping T1): planned, drilling, oil, gas, oil_gas, water, dry, injector_water, injector_gas, suspended, abandoned; null = not recorded.';
