-- PES retirement + EPE rename (owner decision 2026-08-16):
--
-- 1. ARCHIVE the `petroleum-economics-studio` tile. The standalone app was
--    fatally broken end to end (workspace route param mismatch meant the
--    model view could never load; all internal nav links 404'd; 9 context
--    functions its tabs call were never defined; its econ_* tables have no
--    repo DDL). The Active/is_functional row misadvertised it — honest-
--    catalog rule, archive direction, safe to apply immediately. The SPA
--    code is deleted in the same branch; its routes redirect to EPE.
--    No org ever held a grant for either slug (organization_apps verified
--    empty for both on 2026-08-16), so nobody is stranded.
--
-- 2. RENAME the `epe-suite` tile to "Petroleum Economics Studio" — EPE
--    inherits the name. Slug stays epe-suite (it is the tile link + the
--    entitlement key). The tile keeps opening the same app at the same
--    route, so this is safe to apply ahead of the next prod upload; until
--    that upload the in-app headers still read "EPE" (cosmetic only).
--
-- Idempotent. master_apps.app_name is UNIQUE, so the archived row must
-- surrender the name before epe-suite can take it.

update public.master_apps
set status = 'Archived',
    is_functional = false,
    app_name = 'Petroleum Economics Studio (legacy, retired)',
    updated_at = now()
where slug = 'petroleum-economics-studio'
  and app_name <> 'Petroleum Economics Studio (legacy, retired)';

update public.master_apps
set app_name = 'Petroleum Economics Studio',
    description = 'Case-based petroleum economics: JV, PSC, PIA 2021 and NTA 2025 fiscal modeling with sensitivities, Monte Carlo, and run comparison.',
    updated_at = now()
where slug = 'epe-suite'
  and app_name <> 'Petroleum Economics Studio';
