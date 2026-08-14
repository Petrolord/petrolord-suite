-- D4 (Economics-ROADMAP.md): archive Coming Soon stubs whose scope the
-- Decision Studio program absorbed into existing apps, so the catalog does
-- not advertise duplicates:
--   portfolio-optimization  -> Capital Portfolio Studio (risked-EMV
--                              knapsack + efficient frontier, D4)
--   efficient-frontier      -> Capital Portfolio Studio (same)
--   monte-carlo-economics   -> EPE Risk (Monte Carlo) tab (D2)
-- Archive direction (hides the rows, preserves them + any FKs); safe to
-- apply immediately per the honest-catalog rule. Idempotent.

update public.master_apps
set status = 'Archived', updated_at = now()
where slug in ('portfolio-optimization', 'efficient-frontier', 'monte-carlo-economics')
  and status = 'Coming Soon';
