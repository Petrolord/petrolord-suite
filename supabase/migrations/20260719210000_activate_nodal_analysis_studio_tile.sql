-- NA5 (Nodal Analysis Studio, docs/scope/NodalAnalysisStudio-STATUS.md):
-- tile activation for the real nodal workstation.
--
-- The nodal-analysis-engine tile has sat at "Coming Soon" (not built, not
-- functional) since the Horizons era; the page behind it was an empty
-- file, deleted in NA4. The slug stays (tile link + entitlement key, WTA
-- precedent) and the tile becomes the Nodal Analysis Studio: renamed,
-- honest description, activated in place in the Production module. The
-- SPA carries the matching apps/production/nodal-analysis-engine alias
-- route (plus the canonical apps/production/nodal-analysis-studio) in
-- the same release.
--
-- DEPLOY RULE (honest catalog, R0/G0/W3/WT3 precedent): apply this
-- migration WITH the production upload that carries the studio, never
-- before. An Active tile must not 404 on old prod code.
--
-- Rows preserved; idempotent and self-skipping.

do $$
begin
  update public.master_apps
     set app_name      = 'Nodal Analysis Studio',
         description   = 'Well performance workstation: IPR and VLP system analysis with validated multiphase correlations (Beggs and Brill with Payne, modified Hagedorn-Brown, Gray, Fancher-Brown), Cullender-Smith gas columns, operating point solve with stability diagnosis, sensitivity sweeps, gas lift screening and choke performance. Projects save to your account.',
         status        = 'Active',
         is_built      = true,
         is_functional = true,
         updated_at    = now()
   where slug = 'nodal-analysis-engine'
     and status <> 'Active';

  if not found then
    raise notice 'master_apps: nodal-analysis-engine already Active — skipping';
  else
    raise notice 'master_apps: nodal-analysis-engine activated as Nodal Analysis Studio (Production)';
  end if;
end $$;
