-- Supply Chain SC3: the Materials & Spares Planner catalog tile, Coming Soon, and its price (HELD).
--
-- Module decision: the planner sits in Midstream & Downstream beside the
-- Terminal & Depot Studio and the Fuel Pricing & Supply Chain Studio, the
-- module that already carries the Suite's supply-chain apps. There is no
-- Supply Chain module in the Suite catalog, and adding one would mean a new
-- modules row, a module price and entitlement registration for a single app.
--
-- The tile is seeded as the DS0 and D5 seeds did it: a live row of the same
-- module (terminal-depot-studio) is copied with %ROWTYPE so column defaults
-- come from a real neighbour, and BOTH `module` ('Midstream & Downstream',
-- which the hub filters on) and `module_id` (the UUID entitlements resolve
-- by) are set. Seeding one without the other produces a tile nobody can be
-- sold, which is the trap 20260829840000 exists because of.
--
-- The tile lands Coming Soon, is_built false, is_functional false. It goes
-- Active only in 20260928120000, deploy-gated on the route being live.
--
-- Price: master_apps.price 299 (USD per month for the organisation, the
-- a la carte licence), set the way 20260927120000_suite_pricing_2026_09 sets
-- every app price (by slug, joined to its module). 299 is the price of the
-- Fuel Pricing & Supply Chain Studio, the nearest peer in the module,
-- OWNER-CONFIRMED 2026-09-27. The module price in
-- pricing_config.module_pricing already includes every app of the module and
-- is not changed here; the module stays cheaper than its apps bought singly.
--
-- Depends on the DS0 seed (20260829850000) having created the module row
-- (slug midstream-downstream). If it has not, this does nothing and says so.
--
-- DEPLOY GATE: a Coming Soon tile links nowhere, so this is safe before the
-- upload, but apply it with, or after, the prod upload that ships the SC3 build.
--
-- Idempotent: an existing materials-spares-planner tile is re-homed,
-- re-described and re-priced in place with its status left alone.
-- No begin/commit of its own (one implicit transaction under db query -f).
--
-- Owner-run: supabase db query --linked -f supabase/migrations/20260928110000_sc3_seed_materials_spares_tile.sql

do $$
declare
  v_module_id uuid;
  tmpl public.master_apps%rowtype;
  v_order integer;
  v_slug text := 'materials-spares-planner';
  v_name text := 'Materials & Spares Planner';
  -- A name from iconRegistry (src/data/applications.js); anything else renders as a plain box.
  v_icon text := 'Package';
  v_price numeric := 299;
  v_description text := 'Materials and spares planning on a stated policy: criticality classes from weighted '
    || 'criteria with the reason for each item, ABC by annual usage value, the economic order quantity and '
    || 'quantity discounts, safety stock and reorder points for normal and Poisson demand, insurance spares '
    || 'costed against downtime, lead-time risk by seeded Monte Carlo, and slow-moving and obsolete stock '
    || 'with write-downs. Every cost, rate, service level and band is an input you state.';
begin
  select id into v_module_id from public.modules where slug = 'midstream-downstream';
  if v_module_id is null then
    raise notice 'Module midstream-downstream not present; run the DS0 seed (20260829850000) first. Nothing done.';
    return;
  end if;

  if exists (select 1 from public.master_apps where slug = v_slug) then
    update public.master_apps
    set module = 'Midstream & Downstream',
        module_id = v_module_id,
        app_name = v_name,
        description = v_description,
        icon_url = v_icon,
        price = v_price,
        updated_at = now()
    where slug = v_slug;
    return;
  end if;

  select * into tmpl from public.master_apps
    where slug = 'terminal-depot-studio' and module_id = v_module_id;
  if tmpl.id is null then
    raise notice 'Template tile terminal-depot-studio not found in midstream-downstream; SC3 tile seed skipped. Nothing done.';
    return;
  end if;

  select coalesce(max(display_order), 0) + 1 into v_order from public.master_apps;

  tmpl.id := gen_random_uuid();
  tmpl.slug := v_slug;
  tmpl.app_name := v_name;
  tmpl.description := v_description;
  tmpl.icon_url := v_icon;
  tmpl.module := 'Midstream & Downstream';
  tmpl.module_id := v_module_id;
  tmpl.price := v_price;
  tmpl.status := 'Coming Soon';
  tmpl.is_built := false;
  tmpl.is_functional := false;
  tmpl.display_order := v_order;
  tmpl.created_at := now();
  tmpl.updated_at := now();
  insert into public.master_apps values (tmpl.*);
end $$;
