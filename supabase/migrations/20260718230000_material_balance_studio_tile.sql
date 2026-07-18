-- MB3 (Material Balance Studio): tile copy for the upgraded app.
--
-- The reservoir-balance tile keeps its slug (tile link and entitlement key,
-- Waterflood/Well Test precedent) but is renamed to match the app it now
-- opens: the two-page case list became the studio-class workstation on the
-- shared Studio shell (Data | PVT | Aquifer | Run | Plots, with the aquifer
-- screening, history match, forecast/contacts/report tabs following in the
-- MB4-MB6 phases of the same program).
--
-- Live-catalog check 2026-07-18: only the 'reservoir-balance' slug exists as
-- a tile (the -pro / -surveillance / material-balance-studio slugs are SPA
-- route aliases with no master_apps rows), so this migration touches exactly
-- one row.
--
-- DEPLOY RULE (honest catalog, R0/G0 precedent): apply this migration WITH
-- the production upload that carries the studio, never before. A tile named
-- "Studio" must not open the old case-list page.
--
-- Row preserved; idempotent.

update public.master_apps
   set app_name = 'Material Balance Studio',
       description = 'Material balance analysis on a benchmark-validated engine: OOIP and OGIP by Havlena-Odeh regression, drive index decomposition, pot, Fetkovich and Carter-Tracy aquifer models, and diagnostic plots. Cases save to your account.'
 where slug = 'reservoir-balance'
   and lower(module) = 'reservoir'
   and app_name <> 'Material Balance Studio';
