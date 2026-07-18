-- SC6 (SCAL Studio): archive the "Relative Permeability & Fractional Flow"
-- alias tile (slug relative-permeability-designer).
--
-- The 2026-07-17 hygiene pass renamed this alias honestly; the
-- ReservoirEngineering-Module.md 4.2 lock says it archives when SCAL
-- Studio ships and becomes the rel-perm home. The route becomes a redirect
-- to the SCAL Studio (App.jsx change in the same PR); the Fractional Flow
-- Calculator alias and the Waterflood Design Studio keep Buckley-Leverett.
--
-- DEPLOY RULE (honest catalog): apply this migration WITH the production
-- upload that carries the SCAL route and the redirect, never before. An
-- Active scal-studio tile must not 404 on old prod code, and this archived
-- alias must not strand users before the redirect exists.
--
-- Row preserved; idempotent.

update public.master_apps
   set status = 'Archived',
       is_functional = false,
       is_built = false,
       description = 'Superseded by SCAL Studio, the rel-perm home: Corey curve design and fitting to core data, Leverett J-function capillary pressure and saturation-height profiles. Buckley-Leverett displacement stays in the Waterflood Design Studio.'
 where slug = 'relative-permeability-designer'
   and status <> 'Archived';
