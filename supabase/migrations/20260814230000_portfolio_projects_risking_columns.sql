-- D4 (Economics-ROADMAP.md): Capital Portfolio Studio computed valuations.
-- portfolio_projects gains risking + valuation-provenance columns:
--   pos          chance of success (0..1), default 1 = unrisked
--   fail_cost    expected loss in $MM if the project fails, default 0
--   npv_stddev   success-case NPV standard deviation in $MM (from a linked
--                Monte Carlo run), nullable
--   source_type  'manual' (typed) or 'epe_mc' (linked EPE Monte Carlo run)
--   source_ref   epe_mc_runs.id when linked (no FK: the runs table is
--                owner-scoped and prunable; the link is provenance, not a
--                hard dependency)
--   source_label human-readable provenance shown in the UI
-- Additive and idempotent; existing rows keep their behavior (pos 1, no
-- spread).

alter table public.portfolio_projects
  add column if not exists pos numeric not null default 1,
  add column if not exists fail_cost numeric not null default 0,
  add column if not exists npv_stddev numeric,
  add column if not exists source_type text not null default 'manual',
  add column if not exists source_ref uuid,
  add column if not exists source_label text;
