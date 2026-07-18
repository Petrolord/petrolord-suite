-- W6 (Waterflood Design Studio surveillance tab): retire the standalone
-- Waterflood Dashboard.
--
-- The dashboard's surveillance analytics (reservoir-barrel VRR, Hall plot,
-- Chan diagnostics, pattern response, injector recommendations; all real and
-- jest-tested since the P1-P4 rebuild) now live in the Waterflood Design
-- Studio's Surveillance tab, and the dashboard route redirects there. One
-- waterflood app per owner decision 2026-07-18.
--
-- Also drops saved_waterflood_projects: the table held ZERO rows in
-- production when checked 2026-07-18 (the dashboard's own Save/Load was a
-- no-op placeholder until 2026-07-08 and the real table collected no
-- projects since). Surveillance data now persists inside
-- saved_waterflood_design_projects payloads.
--
-- get_all_my_projects note: the repo mirror
-- (src/database/functions/get_all_my_projects.sql) had its
-- waterflood_dashboard arm removed, but the function was found to NOT
-- exist in the live database when this migration was applied
-- 2026-07-18 (the P3 deploy note that would have created it was never
-- executed, and the mirror references other tables that do not exist
-- live either). Nothing to recreate here; the mirror stays aspirational.
--
-- DEPLOY RULE (honest catalog): apply WITH the production upload that
-- carries the Surveillance tab, never before. An archived tile must not
-- hide an app users can still reach only there, and the table must not be
-- dropped while a deployed build still queries it.
--
-- Idempotent.

update public.master_apps
   set status = 'Archived',
       is_functional = false,
       is_built = false,
       description = 'Retired: waterflood surveillance (VRR, Hall plot, Chan diagnostics, pattern response) now lives in the Waterflood Design Studio Surveillance tab.'
 where slug = 'waterflood-dashboard'
   and lower(module) = 'reservoir'
   and status <> 'Archived';

drop table if exists public.saved_waterflood_projects;
