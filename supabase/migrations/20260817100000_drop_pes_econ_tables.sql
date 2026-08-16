-- PES retirement close-out (owner-approved drop, 2026-08-17): remove the
-- retired Petroleum Economics Studio's orphan database family.
--
-- The owner authorized dropping "the six orphan econ_* tables" flagged in
-- EPE.md §4.2b (econ_projects / econ_models_v2 / econ_scenarios_v2 /
-- econ_inputs / econ_fiscal_terms / econ_results — the ones PES actually
-- wrote). Live inspection shows they are the core of a larger dead family
-- that only ever existed for PES and interlinks by FK, so this drops the
-- whole family in one pass rather than leaving 13 broken remnants:
--
--   17 econ_* tables (the six above + afe_budgets, audit_log, fdp_snapshots,
--   imports, line_items, metrics, models, scenarios, scenario_notes,
--   sensitivity_results, timegrid — the v1 generation plus tabs PES never
--   wired), the econ_audit_logs VIEW (a plain projection of econ_audit_log),
--   and integration_snapshots (0 rows, no repo consumers, FKs only into
--   econ_models_v2/econ_scenarios_v2 — the dead PES→FDP/AFE hand-off).
--
-- Verified before drop (2026-08-16/17):
--   - zero repo consumers for every relation (grep across src/ and
--     supabase/functions/; the only econ_ hits are DCA's economic-limit
--     variable names)
--   - none of these tables has a repo migration (no DDL to orphan)
--   - 4 rows TOTAL across the family: one "Block 4" test project chain
--     (econ_projects/models_v2/scenarios_v2/metrics, Dec 2025, owner's own
--     account); everything else 0 rows
--   - no functions reference econ_%; only view is econ_audit_logs (dropped
--     here); external FKs into the family come only from
--     integration_snapshots (dropped here)
--
-- CASCADE covers owned sequences and any lingering grants/policies.
-- Idempotent.

drop view if exists public.econ_audit_logs;

drop table if exists
  public.integration_snapshots,
  public.econ_afe_budgets,
  public.econ_audit_log,
  public.econ_fdp_snapshots,
  public.econ_imports,
  public.econ_metrics,
  public.econ_scenario_notes,
  public.econ_sensitivity_results,
  public.econ_inputs,
  public.econ_fiscal_terms,
  public.econ_results,
  public.econ_line_items,
  public.econ_timegrid,
  public.econ_scenarios_v2,
  public.econ_scenarios,
  public.econ_models_v2,
  public.econ_models,
  public.econ_projects
  cascade;
