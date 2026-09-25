-- Data & AI D5: the AI Evaluation Studio tile goes Active (HELD).
--
-- The module's fifth working app. data-quality-studio (D1), ml-workbench
-- (D2), electrofacies-studio (D3) and forecasting-ml-workbench (D4) are not
-- touched here.
--
-- Depends on 20260925180000 (the D5 tile seed) having created the row. If it
-- has not been applied this does nothing and says so, rather than inserting a
-- tile with no module behind it.
--
-- DEPLOY GATE (the F12 rule, as D1 to D4). Apply ONLY after:
--   1. the D5 tile seed (20260925180000), and 20260925190000 (dai_eval_runs),
--      so the tile is never sold over a table that does not exist;
--   2. the production upload carrying the route
--      /dashboard/apps/data-ai/ai-evaluation-studio is live and that route
--      has been served on the deployed site. A tile must never go Active
--      before its route is on the deploy target.
-- The language-model helper is optional: the tile can go Active whether or
-- not 20260925200000 (dai_llm_calls) is applied and ai-eval-assist is
-- deployed; without them the helper shows that it is not configured.
-- No pricing change: the data-ai module price (20260923150000, D1) already
-- covers every app of the module, this one included.
--
-- The description follows the owner copy rule and names the methods the app
-- runs. Status flips only; the row is matched on slug AND module so no other
-- tile can be touched. Idempotent.
--
-- Owner-run: supabase db query --linked -f supabase/migrations/20260925210000_d5_activate_ai_evaluation_studio_tile.sql

do $$
declare
  v_slug text := 'ai-evaluation-studio';
begin
  if not exists (select 1 from public.master_apps
                  where slug = v_slug and module = 'Data & AI') then
    raise notice 'Tile % not present in Data & AI; run the D5 tile seed (20260925180000) first. Nothing done.', v_slug;
    return;
  end if;

  update public.master_apps
     set status = 'Active',
         is_built = true,
         is_functional = true,
         description = 'Evaluation of search and question-answering systems over oilfield documents, on the '
           || 'synthetic Ekene documents or your own corpus: BM25 and TF-IDF retrieval with each term''s '
           || 'contribution and stated ties; precision, recall, hit, MRR, MAP and nDCG at k with a visible '
           || 'relevance threshold; two systems compared by a seeded paired bootstrap; answers checked claim '
           || 'by claim against the passages they cite; extraction scored against labels; Cohen''s kappa '
           || 'between graders; and calibration with the Brier decomposition. Runs are saved per '
           || 'organization with their settings, seed and engine version.',
         updated_at = now()
   where slug = v_slug
     and module = 'Data & AI';
end $$;
