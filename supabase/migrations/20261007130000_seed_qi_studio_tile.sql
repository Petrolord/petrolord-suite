-- QI Studio: its own app tile (QI programme close, 2026-10-07;
-- docs/scope/QI-STATUS.md, docs/upgrade/QI-UPGRADE.md U2-003).
--
-- NOT APPLIED. File only; the owner applies it, then uploads the Suite zip
-- that moves the route's licence gate to 'qi-studio'.
--
-- QI Studio was built as an app of its own (route
-- /dashboard/apps/geoscience/qi-studio, live since Suite dc206c539) but had
-- no master_apps row: it opened on a Seismolord or Rock Physics Studio
-- licence. This seeds its tile in the Geoscience module, so it is sold and
-- granted like every other app: a la carte at its own price, and included
-- in the Geoscience module (purchased_modules grants every app whose
-- module_id matches).
--
-- Status Active from the start: the route is already on the deploy target
-- (the F12 rule, a tile never goes Active before its route is live, holds).
--
-- Price 1690 a month, owner-delegated 2026-10-07 ("assign price to it as
-- you consider fit"): the top of the Suite's per-app band (199 to 1690,
-- 2026-09-27 review), above Seismolord (1490) and Rock Physics Studio (1190)
-- because QI Studio carries the prestack chain, both inversions and the
-- server compute behind them, the work a desktop QI package sells for a
-- multiple of this per seat each year.
--
-- %ROWTYPE sibling copy off the live Rock Physics Studio row, so module,
-- module_id and the other columns come from a real neighbour rather than
-- being typed. No shared table is changed in structure; one row is added to
-- master_apps (the catalogue), as every tile seed does. Idempotent.

do $$
declare
  tmpl public.master_apps%rowtype;
  v_slug text := 'qi-studio';
  v_name text := 'QI Studio';
  v_price numeric := 1690;
  v_icon text := 'ScanSearch';
  v_desc text := 'Quantitative interpretation from the data audit to the '
    || 'prospect assessment. Audit the wells and seismic a study needs, '
    || 'grade each well against each target and keep an issue register; '
    || 'QC the seismic and the prestack gathers on the seismic worker; tie '
    || 'the wells and build angle wavelets; make angle stacks, trim and '
    || 'match them, and compute AVO intercept, gradient and fluid factor; '
    || 'invert post-stack for impedance and prestack for AI, SI and '
    || 'density, each checked at blind wells; predict porosity with Q10, '
    || 'Q50 and Q90 volumes and facies with Bayesian probabilities; and '
    || 'assess each prospect''s trap, anomaly fit and evidence for the '
    || 'risk team, with the report, SEG-Y exports and a run record for '
    || 'every product.';
begin
  if exists (select 1 from public.master_apps where slug = v_slug) then
    update public.master_apps
    set app_name = v_name, description = v_desc, price = v_price, icon_url = v_icon,
        status = 'Active', is_built = true, is_functional = true, updated_at = now()
    where slug = v_slug;
    return;
  end if;

  select * into tmpl from public.master_apps where slug = 'rock-physics-studio' limit 1;
  if tmpl.id is null then
    raise exception 'The Rock Physics Studio row is missing; the QI Studio tile copies its module.';
  end if;
  if exists (select 1 from public.master_apps where app_name = v_name) then
    raise exception 'The name QI Studio is already used by another slug.';
  end if;

  tmpl.id := gen_random_uuid();
  tmpl.slug := v_slug;
  tmpl.app_name := v_name;
  tmpl.description := v_desc;
  tmpl.price := v_price;
  tmpl.icon_url := v_icon;
  tmpl.status := 'Active';
  tmpl.is_built := true;
  tmpl.is_functional := true;
  tmpl.created_at := now();
  tmpl.updated_at := now();
  tmpl.display_order := tmpl.display_order + 1;  -- beside Rock Physics Studio in the Geoscience grid

  insert into public.master_apps values (tmpl.*);
end $$;
