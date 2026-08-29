-- E0 — Economics module honest catalog
-- (Economics-ROADMAP.md §6 E0; owner sign-off 2026-08-29).
--
-- The FIRST in-repo record of the Economics catalog. Eight of the
-- twelve live Active tiles predate the migrations directory and have
-- no DDL record anywhere in this repo (afe-cost-control-manager,
-- fdp-accelerator, fiscal-regime-designer, npv-scenario-builder,
-- probabilistic-breakeven-analyzer, project-management-pro,
-- technical-report-autopilot, value-of-information-analyzer); only
-- epe-suite, decision-studio, decision-tree-builder and
-- capital-portfolio-studio were ever written down, by the D series.
--
-- Audit of all 41 Economics rows (2026-08-29, full code sweep):
--
-- 1. The twelve Active tiles are the locked portfolio and all twelve
--    have real routed code. They are asserted here (Active, built,
--    functional) so the repo finally records them, not changed.
--
-- 2. ARCHIVE all 25 'Coming Soon' Economics rows. Every one is a
--    zero-code stub with is_built = false. This follows the
--    G0/R0/D0/P0/F0 precedent exactly: a future app seeds its own tile
--    when it ships, and archived rows are never revived. Two of them
--    deserve naming because their code is deleted in this same phase:
--    * competitor-intelligence-hub — an unrouted page returning
--      invented competitor activity (named operators, invented well
--      counts, invented capex) as though it were intelligence.
--    * deal-data-room-automator — an unrouted page returning
--      fabricated document view and download analytics.
--    The Economics-ROADMAP.md re-audit found no thirteenth app worth
--    building, so none of these 25 is a commitment we intend to keep.
--
-- Rows are preserved (status flips only); idempotent.
-- Post-state: Economics = exactly 12 Active / 0 Coming Soon /
-- 29 Archived.

begin;

-- 1. Assert the twelve real tiles (no-op if already correct)
update master_apps
   set status = 'Active',
       is_built = true,
       is_functional = true,
       updated_at = now()
 where lower(module) like '%econom%'
   and slug in (
     'epe-suite',
     'decision-studio',
     'decision-tree-builder',
     'capital-portfolio-studio',
     'value-of-information-analyzer',
     'npv-scenario-builder',
     'fiscal-regime-designer',
     'probabilistic-breakeven-analyzer',
     'fdp-accelerator',
     'project-management-pro',
     'afe-cost-control-manager',
     'technical-report-autopilot'
   )
   and (status <> 'Active' or is_built is distinct from true
        or is_functional is distinct from true);

-- 2. Zero-code Coming Soon stubs
update master_apps
   set status = 'Archived',
       is_built = false,
       is_functional = false
 where lower(module) like '%econom%'
   and status = 'Coming Soon';

commit;
