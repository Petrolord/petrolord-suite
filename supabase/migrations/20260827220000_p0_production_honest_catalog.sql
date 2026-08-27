-- P0 — Production Operations module honest catalog
-- (Production-ROADMAP.md §1/§5; owner sign-off 2026-08-27).
-- Audit of all 39 Production rows (2026-08-27, three full code sweeps):
--
-- 1. ARCHIVE four Active tiles that misadvertise:
--    * wellbore-flow-simulator — "high-fidelity transient simulation"
--      is a 2.5 s fake delay around a Math.random() pressure walk;
--      tubing ID, GOR, water cut collected and never read. RETIRED at
--      P0 (owner §6.3): route redirects to Nodal, mock engine deleted.
--    * production-surveillance-dashboard — uploads two CSVs then
--      discards both; renders Math.random() rates for 7 hardcoded
--      wells; SCADA/export/audit-trail are toast stubs. Rebuilds as
--      Production Surveillance Studio (P2) on the P1 data spine.
--    * flow-assurance-monitor — hydrate curve is 18*ln(P)-100 with no
--      composition/salinity/inhibitor; pressure drop a constant
--      0.02 psi/ft; method dropdowns unbound. Rebuilds at P10 on the
--      Fluid Studio EOS.
--    * network-diagram-pro — solver is a toast, Save/Import/Export
--      have no onClick, zero persistence, yet listed at $199 and
--      ungated. DELISTED at P0 (owner §6.4); the editor folds into
--      Production Network Studio (P11).
--
-- 2. ARCHIVE all 'Coming Soon' Production rows (31 zero-code stubs) —
--    the G0/R0/D0 precedent: future apps (P1-P12) seed their own tile
--    when they ship; archived rows are never revived.
--
-- Rows preserved (status flips only); idempotent. Post-state:
-- Production = exactly 3 Active tiles: nodal-analysis-engine (the
-- validated anchor), artificial-lift-designer (honest screening;
-- upgraded at P9), well-schematic-designer (redirect to Completion
-- Design Studio, absorbed at drilling D7).

update public.master_apps
   set status = 'Archived', is_functional = false, is_built = false
 where lower(module) = 'production'
   and slug in ('wellbore-flow-simulator',
                'production-surveillance-dashboard',
                'flow-assurance-monitor',
                'network-diagram-pro')
   and status <> 'Archived';

update public.master_apps
   set status = 'Archived'
 where lower(module) = 'production'
   and status = 'Coming Soon';
