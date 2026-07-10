-- Volumetrics catalog consolidation: one tile for the one volumetrics app.
--
-- QuickVol and ReservoirCalc Pro both resolved to the same component; QuickVol
-- has been retired in code. Here we make ReservoirCalc Pro the single visible
-- tile and hide the QuickVol tile.
--
-- We ARCHIVE the QuickVol row rather than DELETE it: useMasterApps only shows
-- rows with status IN ('Active','Coming Soon') AND is_functional AND is_built
-- (non-superadmins), so status='Archived' removes the tile from the hub while
-- preserving the row and any entitlement/history references that point at it.
-- Idempotent; deploy via the Supabase SQL editor or `supabase db push`.

do $$
declare
  rc_id uuid;
  qv_id uuid;
  tmpl public.master_apps%rowtype;
  next_order int;
begin
  select id into rc_id from public.master_apps where slug = 'reservoircalc-pro';
  select id into qv_id from public.master_apps where slug = 'quickvol';

  if rc_id is not null then
    -- Canonical tile exists — make sure it is the live, named tile.
    update public.master_apps
       set app_name = 'ReservoirCalc Pro',
           status = 'Active',
           is_built = true,
           is_functional = true,
           updated_at = now()
     where id = rc_id;
  elsif qv_id is not null then
    -- No reservoircalc-pro tile, but a quickvol tile exists: repurpose it in
    -- place so a tile always remains (and skip the archive step below).
    update public.master_apps
       set slug = 'reservoircalc-pro',
           app_name = 'ReservoirCalc Pro',
           status = 'Active',
           is_built = true,
           is_functional = true,
           updated_at = now()
     where id = qv_id;
    raise notice 'master_apps: repurposed quickvol tile -> reservoircalc-pro';
    return;
  else
    -- Neither exists: seed reservoircalc-pro from a geoscience sibling row.
    select * into tmpl from public.master_apps
     where lower(module) = 'geoscience'
     order by display_order asc nulls last
     limit 1;
    if tmpl.id is null then
      raise notice 'master_apps: no geoscience template — skipping tile seed';
      return;
    end if;
    select coalesce(max(display_order), 0) + 1 into next_order from public.master_apps;
    tmpl.id            := gen_random_uuid();
    tmpl.slug          := 'reservoircalc-pro';
    tmpl.app_name      := 'ReservoirCalc Pro';
    tmpl.description   := 'Deterministic and probabilistic (Monte Carlo) STOIIP/GIIP volumetrics — GRV-from-surfaces, correlated uncertainty, tornado sensitivity, input-quality checks, and PDF reporting.';
    tmpl.icon_url      := 'Layers';
    tmpl.status        := 'Active';
    tmpl.is_built      := true;
    tmpl.is_functional := true;
    tmpl.display_order := next_order;
    tmpl.created_at    := now();
    tmpl.updated_at    := now();
    insert into public.master_apps values (tmpl.*);
    raise notice 'master_apps: seeded reservoircalc-pro tile';
  end if;

  -- Hide the duplicate QuickVol tile (row preserved for entitlement/history).
  if qv_id is not null then
    update public.master_apps
       set status = 'Archived', updated_at = now()
     where id = qv_id;
    raise notice 'master_apps: archived duplicate quickvol tile';
  end if;
end $$;
