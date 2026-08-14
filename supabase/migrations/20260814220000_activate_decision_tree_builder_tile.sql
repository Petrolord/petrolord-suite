-- D3 (Economics-ROADMAP.md): Decision Tree Builder tile activation.
--
-- DEPLOY-GATED: apply ONLY after the production upload that ships the
-- apps/economics/decision-tree-builder route (master_apps deploy lesson:
-- an Active tile's card appears everywhere immediately, and clicking it on
-- a build without the route 404s to home). Tracked NOT YET APPLIED in
-- MIGRATIONS.md until the gate clears.
--
-- The catalog row exists as a Coming Soon stub; this flips it Active with
-- honest copy. Idempotent.

update public.master_apps
set
  app_name = 'Decision Tree Builder',
  description = 'Multi-stage decision trees with EMV rollback, value of information, and Bayes-consistent probabilities. Link payoffs to EPE Monte Carlo runs.',
  status = 'Active',
  is_built = true,
  is_functional = true,
  updated_at = now()
where slug = 'decision-tree-builder'
  and status <> 'Active';
