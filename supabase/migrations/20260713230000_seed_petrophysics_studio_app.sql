-- Petrophysics Studio G2.6 close-out (docs/scope/PetrophysicsStudio-
-- PLAN.md decision 7): register the flagship app in master_apps as a
-- Geoscience tile. Flipped Active only NOW — the workstation
-- (G2.3-G2.5) works end-to-end and the route ships in the same PR (the
-- deploy lesson).
--
-- Supersedes five shallow tiles (roadmap §1). Only two of them were
-- ever catalogued and both are already Archived
-- (20260712200000_archive_geoscience_shell_tiles.sql:
-- log-facies-analysis, petrophysical-integration-suite); the other
-- three (well-log-analyzer, petrophysics-estimator, crossplot-
-- generator) never had master_apps rows, so there is nothing to
-- archive here — their routes redirect to petrophysics-studio in the
-- SPA. This migration only seeds the new tile.
--
-- Same %ROWTYPE template-copy pattern as the seismolord / well-data-
-- manager seeds; functional name per §6.2; flat 899 inherited (§6.4).
-- Idempotent and self-skipping.

do $$
declare
  tmpl public.master_apps%rowtype;
  next_order int;
begin
  if exists (select 1 from public.master_apps where slug = 'petrophysics-studio') then
    raise notice 'master_apps: petrophysics-studio already present — skipping';
    return;
  end if;

  select * into tmpl
    from public.master_apps
   where lower(module) = 'geoscience'
   order by (slug = 'well-data-manager') desc,
            (slug = 'seismolord') desc,
            display_order asc nulls last
   limit 1;

  if tmpl.id is null then
    raise notice 'master_apps: no geoscience template row found — skipping petrophysics-studio seed';
    return;
  end if;

  select coalesce(max(display_order), 0) + 1 into next_order from public.master_apps;

  tmpl.id            := gen_random_uuid();
  tmpl.slug          := 'petrophysics-studio';
  tmpl.app_name      := 'Petrophysics Studio';
  tmpl.description   := 'Deep log analysis on the shared well registry: shale volume, porosity, Rw and water saturation, cutoffs and net pay, density-neutron and Pickett crossplots with manual facies tagging, a raster log digitizer, and computed curves plus zone summaries published back for correlation, mapping and volumetrics.';
  tmpl.icon_url      := 'FlaskConical';
  tmpl.status        := 'Active';
  tmpl.is_built      := true;
  tmpl.is_functional := true;
  tmpl.display_order := next_order;
  tmpl.created_at    := now();
  tmpl.updated_at    := now();

  insert into public.master_apps values (tmpl.*);

  raise notice 'master_apps: seeded petrophysics-studio (module/module_id inherited from template)';
end $$;
