-- Data & AI D5: the AI Evaluation Studio catalog tile, Coming Soon (HELD).
--
-- The DA0 seed (20260923120000) made the Data & AI module and its first four
-- tiles and, by design, did not seed the fifth. D5 seeds it here on the
-- DA0 insert branch: a live Active Geoscience row is copied with %ROWTYPE so
-- column defaults come from a real neighbour, and BOTH `module` ('Data & AI',
-- which the hub filters on) and `module_id` (the UUID entitlements resolve
-- by) are set. Seeding one without the other produces a tile nobody can be
-- sold, which is the trap 20260829840000 exists because of.
--
-- The tile lands Coming Soon, is_built false, is_functional false. It goes
-- Active only in 20260925210000, deploy-gated on the route being live.
--
-- Depends on the DA0 seed having created the module row (slug data-ai). If
-- it has not been applied this does nothing and says so, rather than
-- creating a module here.
--
-- No pricing: the data-ai module price (20260923150000, D1) covers every app
-- of the module, this one included. The tile inherits the template row's a
-- la carte master_apps.price, as the DA0 tiles did.
--
-- DEPLOY GATE: apply with, or after, the prod upload that ships the D5 build.
-- A Coming Soon tile links nowhere, so this is safe earlier, but the route
-- /dashboard/apps/data-ai/ai-evaluation-studio should exist on the deploy
-- target before anyone is shown the tile.
--
-- Idempotent: an existing ai-evaluation-studio tile is re-homed and
-- re-described in place with its status left alone.
--
-- Owner-run: supabase db query --linked -f supabase/migrations/20260925180000_d5_seed_ai_evaluation_studio_tile.sql

do $$
declare
  v_module_id uuid;
  tmpl public.master_apps%rowtype;
  v_order integer;
  v_slug text := 'ai-evaluation-studio';
  v_name text := 'AI Evaluation Studio';
  v_icon text := 'ScanSearch';
  v_description text := 'Evaluation of search and question-answering systems over oilfield documents: BM25 and '
    || 'TF-IDF retrieval with stated ties, precision, recall, MRR, MAP and nDCG at k against graded '
    || 'judgments, a seeded paired bootstrap between two systems, claim-by-claim groundedness checks of '
    || 'answers against the passages they cite, extraction scoring, Cohen''s kappa and calibration.';
begin
  select id into v_module_id from public.modules where slug = 'data-ai';
  if v_module_id is null then
    raise notice 'Module data-ai not present; run the DA0 seed (20260923120000) first. Nothing done.';
    return;
  end if;

  if exists (select 1 from public.master_apps where slug = v_slug) then
    update public.master_apps
    set module = 'Data & AI',
        module_id = v_module_id,
        description = v_description,
        icon_url = v_icon,
        updated_at = now()
    where slug = v_slug;
    return;
  end if;

  select * into tmpl from public.master_apps
    where lower(module) = 'geoscience' and status = 'Active' limit 1;
  if tmpl.id is null then
    raise notice 'no template row found; D5 tile seed skipped. Nothing done.';
    return;
  end if;

  select coalesce(max(display_order), 0) + 1 into v_order from public.master_apps;

  tmpl.id := gen_random_uuid();
  tmpl.slug := v_slug;
  tmpl.app_name := v_name;
  tmpl.description := v_description;
  -- A name from iconRegistry (src/data/applications.js); anything else
  -- renders as a plain box.
  tmpl.icon_url := v_icon;
  tmpl.module := 'Data & AI';
  tmpl.module_id := v_module_id;
  tmpl.status := 'Coming Soon';
  tmpl.is_built := false;
  tmpl.is_functional := false;
  tmpl.display_order := v_order;
  tmpl.created_at := now();
  tmpl.updated_at := now();
  insert into public.master_apps values (tmpl.*);
end $$;
