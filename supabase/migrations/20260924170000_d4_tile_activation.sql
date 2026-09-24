-- Data & AI D4: the Production Forecasting ML Workbench tile goes Active (HELD).
--
-- The module's fourth working app, and the last of this run (AI Evaluation
-- Studio, D5, is not seeded). data-quality-studio (D1), ml-workbench (D2)
-- and electrofacies-studio (D3) are not touched here.
--
-- Depends on the DA0 seed (20260923120000) having created the row. If it has
-- not been applied this does nothing and says so, rather than inserting a tile
-- with no module behind it.
--
-- DEPLOY GATE (the F12 rule, as D1 20260923140000, D2 20260924130000 and D3
-- 20260924150000). Apply ONLY after:
--   1. the DA0 seed, and 20260924160000 (dai_forecast_runs), so the tile is
--      never sold over a table that does not exist;
--   2. the production upload carrying the route
--      /dashboard/apps/data-ai/forecasting-ml-workbench is live and that route
--      has been served on the deployed site. A tile must never go Active
--      before its route is on the deploy target.
-- No pricing change: the data-ai module price (20260923150000, D1) already
-- covers every app of the module, this one included.
--
-- The description follows the owner copy rule and names the methods the app
-- runs. Status flips only; the row is matched on slug AND module so no other
-- tile can be touched. Idempotent.
--
-- Owner-run: supabase db query --linked -f supabase/migrations/20260924170000_d4_tile_activation.sql

do $$
declare
  v_slug text := 'forecasting-ml-workbench';
begin
  if not exists (select 1 from public.master_apps
                  where slug = v_slug and module = 'Data & AI') then
    raise notice 'Tile % not present in Data & AI; run the DA0 seed (20260923120000) first. Nothing done.', v_slug;
    return;
  end if;

  update public.master_apps
     set status = 'Active',
         is_built = true,
         is_functional = true,
         description = 'Production forecasts per well from an uploaded table or the production data ledger: '
           || 'simple exponential smoothing, Holt''s linear trend and the damped trend, fitted by least '
           || 'squares or with parameters held, set against the Arps decline; residual bootstrap P90, P50 '
           || 'and P10 from a stated seed; rolling-origin backtests ranked by MASE with MAE, RMSE, sMAPE and '
           || 'MAPE; and the same backtest across every well of a field. Runs are saved per organization '
           || 'with their settings, seed and engine version.',
         updated_at = now()
   where slug = v_slug
     and module = 'Data & AI';
end $$;
