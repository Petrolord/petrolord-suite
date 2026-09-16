-- AS1 — Assurance & Compliance module honest catalog
-- (Assurance-ROADMAP.md §1.1 and §3; audit of all 33 Assurance rows,
-- 2026-09-16, full code sweep of every routed app tree.)
--
-- First in-repo record of the Assurance catalog: no Assurance migration
-- existed at all before this. Assurance is the only Suite module never
-- rebuilt, and its catalog was wrong in BOTH directions at once.
--
-- 1. ARCHIVE ten Active tiles that have NO CODE OF ANY KIND — no route
--    in App.jsx, no page, no component, nothing but a marketing entry.
--    A customer could buy all ten. Module price is computed from this
--    catalog (pricing_config.module_pricing), so Assurance has been
--    priced on ten apps that do not exist.
--
--    audit-trail-manager, safety-audit-manager   -> rebuilt together as
--      the Audit & Findings Manager at AS10, which seeds its own tile.
--    environmental-compliance                    -> folds into
--      Regulatory Compliance as a regime category at AS3.
--    monte-carlo-analyzer, decision-tree-analyzer -> duplicates. The
--      canonical implementations are ReservoirCalc Pro's
--      MonteCarloEngine.js and the Economics decision apps, per
--      ReservoirEngineering-Module.md §5. Never rebuilt here.
--    charge-seal-trap-risk, exploration-risk-analyzer,
--    prospect-ranking-tool -> exploration risk is geoscience material
--      (NextGen-Remaining-Courses-PLAN.md §9). Archived rather than
--      moved: the G0/R0/D0/P0/F0 precedent is that a module seeds its
--      own tile when the app ships, and creating empty Geoscience rows
--      would repeat the exact defect this migration is fixing.
--    data-privacy-manager, security-analytics -> platform
--      administration, not petroleum engineering. They belong with the
--      org-data-export and DPA work, not on a sellable app tile.
--
-- 2. DEMOTE iso-compliance-tool from Active to Coming Soon. It has real
--    routed code, but it reads @/data/isoComplianceData into useState
--    and persists NOTHING — nothing a user does there survives a
--    reload. Sellable today. Rebuilt with real persistence at AS8,
--    which promotes it back. Same treatment produced-water-treatment
--    got at F0.
--
-- 3. ARCHIVE the fourteen zero-code 'Coming Soon' stubs, per the F0
--    precedent (archived rows are never revived; future apps seed their
--    own tile when they ship). The five Coming Soon rows that DO have
--    built, routed, entitlement-gated code behind them are preserved as
--    Coming Soon and promoted by their own waves: document-control
--    (AS4), peer-review-manager (AS5), management-of-change (AS6),
--    quality-assurance-plan (AS7), lesson-learned-db (AS9).
--
-- Post-state: Assurance = exactly 3 Active tiles (risk-register,
-- risk-heatmap, regulatory-compliance — the three apps that are real
-- and persist honestly) + 6 Coming Soon (document-control,
-- iso-compliance-tool, lesson-learned-db, management-of-change,
-- peer-review-manager, quality-assurance-plan).
--
-- Rows are preserved; status flips only. Idempotent.

begin;

-- 1. Active tiles with no code behind them
update master_apps
   set status = 'Archived',
       is_built = false,
       is_functional = false
 where lower(module) = 'assurance'
   and slug in (
     'audit-trail-manager',
     'safety-audit-manager',
     'environmental-compliance',
     'monte-carlo-analyzer',
     'decision-tree-analyzer',
     'charge-seal-trap-risk',
     'exploration-risk-analyzer',
     'prospect-ranking-tool',
     'data-privacy-manager',
     'security-analytics'
   )
   and status <> 'Archived';

-- 2. Real code, zero persistence: not sellable until AS8
update master_apps
   set status = 'Coming Soon',
       is_functional = false
 where lower(module) = 'assurance'
   and slug = 'iso-compliance-tool'
   and status = 'Active';

-- 3. Zero-code Coming Soon stubs (everything Coming Soon except the
--    five tiles with real routed code behind them)
update master_apps
   set status = 'Archived'
 where lower(module) = 'assurance'
   and status = 'Coming Soon'
   and slug not in (
     'document-control',
     'peer-review-manager',
     'management-of-change',
     'quality-assurance-plan',
     'lesson-learned-db',
     'iso-compliance-tool'
   );

commit;
