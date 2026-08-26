-- D0 — Drilling & Completions module honest catalog
-- (docs/scope/Drilling-ROADMAP.md §1/§4; owner sign-off 2026-08-26).
-- Audit of all 45 Drilling rows (2026-08-26, two full code sweeps):
--
-- 1. ARCHIVE eight Active tiles that misadvertise:
--    * torque-drag-predictor — dead static form: readOnly inputs, Run
--      button with no onClick, results permanently empty.
--    * drilling-fluids-hydraulics — inline "simplified" math, Save is
--      handleUnsupportedFeature; superseded at D2.
--    * cementing-simulation-app — displacement efficiency, pressures,
--      ECD and the whole placement curve are Math.random(); D4 rebuild.
--    * frac-completion-app — 28-line all-Math.random engine; D9.
--    * wellbore-stability-analyzer — self-declared placeholder physics,
--      hardcoded 0.45 psi/ft frac gradient; superseded at D5.
--    * casing-wear-analyzer — real wear model fed by Math.random()
--      dogleg contact forces; superseded at D1.
--    * rto-dashboard — hardcoded canned "live rig data" with no data
--      connection of any kind (owner: archive, not Coming Soon).
--    * offset-well-incident-finder — invokes edge fn
--      incident-finder-engine which DOES NOT EXIST; errors on every use.
--
-- 2. ARCHIVE all 'Coming Soon' Drilling rows (33 zero-code stubs) —
--    the G-series/R0 precedent: future apps (D1-D11) seed their own
--    tile when they ship; archived rows are never revived.
--
-- 3. MOVE well-spacing-optimizer to the Reservoir module (real
--    deterministic EUR/NPV-vs-spacing math, but it is reservoir
--    economics, not drilling engineering; owner-locked 2026-08-26).
--    Route re-homed to apps/reservoir/well-spacing-optimizer in the
--    same deploy.
--
-- Rows preserved (status flips only, the G0/R0 archive pattern);
-- idempotent. Post-state: Drilling = exactly 2 Active tiles
-- (well-planning, casing-tubing-design-pro).

update public.master_apps
   set status = 'Archived', is_functional = false, is_built = false
 where lower(module) = 'drilling'
   and slug in ('torque-drag-predictor', 'drilling-fluids-hydraulics',
                'cementing-simulation-app', 'frac-completion-app',
                'wellbore-stability-analyzer', 'casing-wear-analyzer',
                'rto-dashboard', 'offset-well-incident-finder')
   and status <> 'Archived';

update public.master_apps
   set status = 'Archived'
 where lower(module) = 'drilling'
   and status = 'Coming Soon';

update public.master_apps
   set module = 'Reservoir',
       module_id = '59fea9fb-ce7f-4534-b523-d4c0f8126032'
 where slug = 'well-spacing-optimizer'
   and lower(module) = 'drilling';
