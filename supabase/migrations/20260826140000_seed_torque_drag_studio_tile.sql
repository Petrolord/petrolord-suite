-- Drilling D1 launch: seed the Torque & Drag Studio tile (slug
-- torque-drag-studio). %ROWTYPE sibling-copy pattern (20260825200000):
-- update-in-place if the slug exists, else copy the well-planning row so
-- module/price/unknown columns stay schema-correct. Idempotent.
--
-- DEPLOY GATE: apply live only with the prod upload that carries the
-- torque-drag-studio route (the 2026-07-07 tile-without-route lesson).
-- The legacy torque-drag-predictor and casing-wear-analyzer rows stay
-- Archived (D0); archived rows are never revived.

do $$
declare
  tmpl public.master_apps%rowtype;
  name_taken boolean;
  v_desc text := 'Soft-string torque and drag on your planned trajectories: '
    || 'hookloads, surface torque, side forces, buckling limits, friction '
    || 'sensitivity and casing wear, validated against independent oracles. '
    || 'Reads the definitive designs you built in Well Design Studio.';
begin
  select exists (
    select 1 from public.master_apps
    where app_name = 'Torque & Drag Studio' and slug <> 'torque-drag-studio'
  ) into name_taken;

  if exists (select 1 from public.master_apps where slug = 'torque-drag-studio') then
    update public.master_apps
    set app_name = case when name_taken then app_name else 'Torque & Drag Studio' end,
        description = v_desc,
        status = 'Active',
        is_built = true,
        is_functional = true,
        updated_at = now()
    where slug = 'torque-drag-studio';
    if name_taken then
      raise notice 'app_name "Torque & Drag Studio" already taken by another slug; rename skipped.';
    end if;
    return;
  end if;

  select * into tmpl from public.master_apps where slug = 'well-planning' limit 1;
  if tmpl.id is null then
    select * into tmpl from public.master_apps where module is not null limit 1;
  end if;
  if tmpl.id is null then
    raise notice 'master_apps is empty; nothing to template from. Seed skipped.';
    return;
  end if;

  tmpl.id := gen_random_uuid();
  tmpl.slug := 'torque-drag-studio';
  tmpl.app_name := 'Torque & Drag Studio';
  tmpl.description := v_desc;
  tmpl.status := 'Active';
  tmpl.is_built := true;
  tmpl.is_functional := true;
  tmpl.created_at := now();
  tmpl.updated_at := now();
  select coalesce(max(display_order), 0) + 1 into tmpl.display_order from public.master_apps;

  insert into public.master_apps values (tmpl.*);
end $$;
