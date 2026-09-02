-- Project Portability PP0, shared-registry half (PLAN §4.3, §7).
--
-- **HELD: NOT APPLIED until a second engineer has reviewed it.** These
-- are the shared geoscience registries every app reads; the database
-- conventions require a second review for changes to shared tables even
-- when, as here, the change is additive with defaults and no rewrite.
--
-- Same three columns as 20260902120000_pp0_state_versions.sql:
--   schema_version integer NOT NULL DEFAULT 1   (row shape version)
--   app_build      text                          (build that last wrote it)
--   engine_version text                          (engine that produced it,
--                                                 for computed curves/grids)
-- geo_wells_logs already carries provenance.engine_version inside its
-- jsonb for computed curves; the column makes it queryable and uniform.

do $$
declare
  t text;
  tables text[] := array[
    'geo_wells', 'geo_wells_logs', 'geo_wells_tops', 'geo_wells_zones',
    'geo_surfaces', 'geo_culture', 'geoscience_settings',
    'seismic_volumes', 'seismic_horizons', 'seismic_faults',
    'seismic_lines', 'seismic_line_picks', 'seismic_exported_surfaces'
  ];
begin
  foreach t in array tables loop
    if to_regclass('public.' || t) is null then
      raise notice 'pp0 registry: table % not present, skipped', t;
      continue;
    end if;
    execute format('alter table public.%I add column if not exists schema_version integer not null default 1', t);
    execute format('alter table public.%I add column if not exists app_build text', t);
    execute format('alter table public.%I add column if not exists engine_version text', t);
    execute format('comment on column public.%I.schema_version is %L', t,
      'PP0: row shape version; opened via src/lib/stateVersion.js (migrate up, refuse newer)');
  end loop;
end $$;
