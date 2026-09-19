-- Process Safety PS0: module row and the three catalog tiles (HELD).
--
-- The Suite's ninth module, modelled on the DS0 seed
-- (20260829850000_ds0_seed_midstream_downstream.sql). It hosts the three
-- applications behind NextGen HSE courses H3 to H5
-- (NextGen-Remaining-Courses-PLAN.md §14; ProcessSafety-ROADMAP.md).
--
-- Registration has two halves and both must be set: `master_apps.module` is
-- free text used by the UI (the hub filters on it), and `module_id` is the
-- UUID entitlements are actually resolved by (get-user-entitlements grants
-- every app whose module_id equals a purchased module_uuid). Seeding one
-- without the other produces tiles nobody can be sold, which is the trap
-- 20260829840000 exists because of.
--
-- The slug is `process-safety`, never `hse`: `hse` already names the
-- external HSE portal and its hse_free / hse_premium entitlements. Future
-- app tables for this module are prefixed `ps_*`.
--
-- Every tile lands as Coming Soon, is_built false, is_functional false. Not
-- one of these apps is written yet. A tile goes Active only in the migration
-- that ships its build (PS1 to PS3), and only once its route is live on the
-- production deploy target.
--
-- No pricing here. The module joins pricing_config.module_pricing at PS1,
-- when its first app ships, as Midstream & Downstream did at DS1.
--
-- DEPLOY GATE: apply only with the prod upload that ships the PS0 build. The
-- module tile and its hub route must exist on the deploy target before the
-- module appears in the catalog, or the dashboard links into a 404.
--
-- Idempotent: the modules row is matched on slug, and an existing tile is
-- re-homed and re-described in place with its status left alone.
--
-- Owner-run: supabase db query --linked -f supabase/migrations/20260919200000_ps0_seed_process_safety_module.sql

do $$
declare
  v_module_id uuid;
  tmpl public.master_apps%rowtype;
  rec record;
  v_order integer;
begin
  -- 1. The module itself, on the shape the live `modules` table already uses.
  select id into v_module_id from public.modules where slug = 'process-safety';
  if v_module_id is null then
    insert into public.modules (id, name, slug, description)
    values (
      gen_random_uuid(),
      'Process Safety',
      'process-safety',
      'Layers of protection analysis and SIL determination, consequence modelling and quantitative risk assessment'
    )
    returning id into v_module_id;
  end if;

  -- 2. A live row to copy, so column defaults come from a real neighbour
  --    rather than being typed. Facilities is the closest analogue: process
  --    safety studies sit on the same plant. module and module_id are
  --    overwritten below.
  select * into tmpl from public.master_apps
    where lower(module) = 'facilities' and status = 'Active' limit 1;
  if tmpl.id is null then
    raise notice 'no template row found; PS0 seed skipped.';
    return;
  end if;

  select coalesce(max(display_order), 0) into v_order from public.master_apps;

  for rec in
    select * from (values
      ('lopa-sil-studio', 'LOPA & SIL Studio', 'ShieldHalf',
       'Layers of protection analysis: mitigated event frequency against a tolerable target, the risk reduction a safety function must deliver and its SIL band, and PFDavg for 1oo1, 1oo2 and 2oo3 with common cause and proof-test interval.'),
      ('consequence-studio', 'Consequence Modelling Studio', 'AlertTriangle',
       'Release source terms, Gaussian plume dispersion, pool and jet fire radiation from a solid-flame model, TNT equivalence and multi-energy blast, and probit models that turn a dose into a probability of harm.'),
      ('qra-studio', 'QRA Studio', 'Scale',
       'Quantitative risk assessment: event trees, individual risk, potential loss of life, FAR, F-N curves against criterion lines, and ALARP judged by the implied cost of averting a fatality.')
    ) as t(slug, app_name, icon, description)
  loop
    if exists (select 1 from public.master_apps where slug = rec.slug) then
      update public.master_apps
      set module = 'Process Safety',
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
      tmpl.module := 'Process Safety';
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
