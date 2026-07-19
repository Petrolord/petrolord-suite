-- Nodal program follow-on (owner decision 2026-07-19,
-- NodalAnalysisStudio-STATUS.md): RETIRE the Integrated Asset Modeler.
--
-- The app was a legacy Horizons-era shell around the nodal-analysis-engine
-- edge function and the old components/nodalanalysis tree; the Nodal
-- Analysis Studio (validated engine stack, 1027 harness gates) supersedes
-- it. The SPA route now redirects to the studio (W3/W6 absorption
-- precedent); this migration archives the tile. Safe to apply immediately:
-- the current prod build still serves the old route, and the next upload
-- carries the redirect, so no user path 404s at any point.
--
-- Idempotent.

update public.master_apps
   set status        = 'Archived',
       is_built      = false,
       is_functional = false,
       description   = 'Retired. Superseded by the Nodal Analysis Studio (validated IPR and VLP system analysis); the old route redirects there.',
       updated_at    = now()
 where slug = 'integrated-asset-modeler'
   and status <> 'Archived';
