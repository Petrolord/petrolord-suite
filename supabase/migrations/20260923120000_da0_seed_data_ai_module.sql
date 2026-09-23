-- Data & AI DA0: module row and the four catalog tiles (HELD).
--
-- The Suite's tenth module, modelled on the PS0 seed
-- (20260919200000_ps0_seed_process_safety_module.sql), which followed DS0
-- (20260829850000_ds0_seed_midstream_downstream.sql). It hosts the four
-- applications behind NextGen Data & AI courses D1 to D4
-- (NextGen-Remaining-Courses-PLAN.md §15; DataAI-ROADMAP.md). The fifth
-- course's app, AI Evaluation Studio (D5), is not seeded here.
--
-- Registration has two halves and both must be set: `master_apps.module` is
-- free text used by the UI (the hub filters on it), and `module_id` is the
-- UUID entitlements are actually resolved by (get-user-entitlements grants
-- every app whose module_id equals a purchased module_uuid). Seeding one
-- without the other produces tiles nobody can be sold, which is the trap
-- 20260829840000 exists because of.
--
-- The slug is `data-ai`, which is also what appRoutePath makes of the
-- display name 'Data & AI', so app URLs are /dashboard/apps/data-ai/<slug>.
-- Future app tables for this module are prefixed `dai_*`.
--
-- Every tile lands as Coming Soon, is_built false, is_functional false. Not
-- one of these apps is written yet. A tile goes Active only in the migration
-- that ships its build (D1 to D4), and only once its route is live on the
-- production deploy target.
--
-- No pricing here. The module joins pricing_config.module_pricing at D1,
-- when its first app ships, as Process Safety did at PS1; the price is the
-- owner's to set. The tiles inherit the template row's a la carte
-- master_apps.price, as the PS0 tiles did.
--
-- DEPLOY GATE: apply only with the prod upload that ships the DA0 build. The
-- module tile and its hub route must exist on the deploy target before the
-- module appears in the catalog, or the dashboard links into a 404.
--
-- Idempotent: the modules row is matched on slug, and an existing tile is
-- re-homed and re-described in place with its status left alone.
--
-- Owner-run: supabase db query --linked -f supabase/migrations/20260923120000_da0_seed_data_ai_module.sql

do $$
declare
  v_module_id uuid;
  tmpl public.master_apps%rowtype;
  rec record;
  v_order integer;
begin
  -- 1. The module itself, on the shape the live `modules` table already uses.
  select id into v_module_id from public.modules where slug = 'data-ai';
  if v_module_id is null then
    insert into public.modules (id, name, slug, description)
    values (
      gen_random_uuid(),
      'Data & AI',
      'data-ai',
      'Data quality checks, machine learning on well data, electrofacies clustering and statistical production forecasting'
    )
    returning id into v_module_id;
  end if;

  -- 2. A live row to copy, so column defaults come from a real neighbour
  --    rather than being typed. Geoscience is the closest analogue: these
  --    apps read the same well and log registries. module and module_id are
  --    overwritten below.
  select * into tmpl from public.master_apps
    where lower(module) = 'geoscience' and status = 'Active' limit 1;
  if tmpl.id is null then
    raise notice 'no template row found; DA0 seed skipped.';
    return;
  end if;

  select coalesce(max(display_order), 0) into v_order from public.master_apps;

  for rec in
    select * from (values
      ('data-quality-studio', 'Data Quality Studio', 'Filter',
       'Completeness, validity and consistency checks on logs and production data, outliers by z-score, MAD, Tukey fences and Mahalanobis distance, and Shewhart, EWMA and CUSUM charts for sensor and rate anomalies. Every flag states its rule.'),
      ('ml-workbench', 'ML Workbench', 'Network',
       'Ordinary least squares, ridge and logistic regression on well data, validated by train and test splits and k-fold that hold out whole wells, scored by RMSE, R squared, confusion matrix, F1 and ROC AUC.'),
      ('electrofacies-studio', 'Electrofacies Studio', 'Layers',
       'Electrofacies from logs by principal component analysis, seeded k-means and hierarchical clustering chosen by elbow and silhouette, and kNN and decision tree classifiers checked against core facies.'),
      ('forecasting-ml-workbench', 'Production Forecasting ML Workbench', 'TrendingDown',
       'Production forecasts by simple, Holt and damped trend exponential smoothing, judged by rolling-origin backtests with MAPE and MASE against an Arps decline baseline, with bootstrap intervals.')
    ) as t(slug, app_name, icon, description)
  loop
    if exists (select 1 from public.master_apps where slug = rec.slug) then
      update public.master_apps
      set module = 'Data & AI',
          module_id = v_module_id,
          description = rec.description,
          icon_url = rec.icon,
          updated_at = now()
      where slug = rec.slug;
    else
      v_order := v_order + 1;
      tmpl.id := gen_random_uuid();
      tmpl.slug := rec.slug;
      tmpl.app_name := rec.app_name;
      tmpl.description := rec.description;
      -- Names from iconRegistry (src/data/applications.js); anything else
      -- renders as a plain box.
      tmpl.icon_url := rec.icon;
      tmpl.module := 'Data & AI';
      tmpl.module_id := v_module_id;
      -- Honest from the first day: nothing here is built yet.
      tmpl.status := 'Coming Soon';
      tmpl.is_built := false;
      tmpl.is_functional := false;
      tmpl.display_order := v_order;
      tmpl.created_at := now();
      tmpl.updated_at := now();
      insert into public.master_apps values (tmpl.*);
    end if;
  end loop;
end $$;
