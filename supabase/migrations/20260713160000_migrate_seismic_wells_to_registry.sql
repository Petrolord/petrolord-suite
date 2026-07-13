-- Well Data Manager G1.4 (docs/scope/WellDataManager-PLAN.md, decision
-- 5, owner sign-off 2026-07-12): Seismolord migrates onto the shared
-- geo_wells registry. seismic_wells data copies over (ids preserved),
-- jsonb tops normalize into geo_wells_tops, and seismic_wells becomes a
-- COMPATIBILITY VIEW for exactly one phase — hard drop at G1.5 after
-- the Seismolord e2e + live smoke pass.
--
-- Why the view is writable (INSTEAD OF triggers): production is a
-- manually-uploaded static SPA, so already-deployed Seismolord clients
-- keep INSERTing/DELETEing seismic_wells until the next production
-- upload. The triggers route those writes into the registry; without
-- them every production well save breaks the moment this applies.
--
-- Security: the view is security_invoker, so every read/write runs
-- under the caller's own geo_wells RLS (owner-or-org-member reads,
-- owner-only writes). No policy logic is duplicated here.
--
-- Deliberate behavioural deltas for old clients (transitional, ends at
-- G1.5):
--   * org-shared registry wells now appear in Seismolord's list (that
--     is the point of the shared registry);
--   * deleting a well someone else shared deletes 0 rows (RLS) — the
--     re-pointed service surfaces this as an error, old clients see a
--     silent no-op;
--   * deleting a well that has WDM log curves cascades the metadata
--     rows but cannot clean the owner's storage objects from SQL — the
--     re-pointed services do; the window where an OLD client deletes a
--     NEW well with logs is accepted (empty tables at apply time).

-- ---- 1. copy wells (idempotent: ids preserved, re-run skips) --------------

insert into public.geo_wells
  (id, user_id, name, uwi, surface_x, surface_y, kb_m, td_md_m,
   units_note, deviation, checkshots, created_at, updated_at)
select
  id, user_id, name, uwi, surface_x, surface_y, kb_m, td_md_m,
  'SI (m); migrated from seismic_wells (G1.4)',
  deviation, checkshots, created_at, updated_at
from public.seismic_wells
on conflict (id) do nothing;

-- ---- 2. normalize tops jsonb -> geo_wells_tops ----------------------------
-- Guarded per well so a re-run cannot duplicate rows.

insert into public.geo_wells_tops (well_id, name, md_m)
select w.id, t->>'name', (t->>'md')::double precision
from public.seismic_wells w
cross join lateral jsonb_array_elements(w.tops) t
where jsonb_typeof(w.tops) = 'array'
  and t->>'name' is not null
  and (t->>'md') is not null
  and not exists (select 1 from public.geo_wells_tops gt where gt.well_id = w.id);

-- ---- 3. table -> compatibility view ---------------------------------------

drop table public.seismic_wells;

create view public.seismic_wells
with (security_invoker = true) as
select
  w.id, w.user_id, w.name, w.uwi,
  w.surface_x, w.surface_y, w.kb_m, w.td_md_m,
  w.deviation,
  coalesce((
    select jsonb_agg(jsonb_build_object('name', t.name, 'md', t.md_m) order by t.md_m)
    from public.geo_wells_tops t
    where t.well_id = w.id
  ), '[]'::jsonb) as tops,
  w.checkshots, w.created_at, w.updated_at
from public.geo_wells w;

comment on view public.seismic_wells is
  'G1.4 COMPATIBILITY VIEW over geo_wells (+ tops re-aggregated to the legacy jsonb shape) for not-yet-redeployed Seismolord clients. security_invoker: callers hit geo_wells RLS. Writable via INSTEAD OF triggers. Hard drop scheduled at G1.5.';

-- ---- 4. INSTEAD OF triggers (writes from old clients) ---------------------
-- Plain invoker-rights functions: the underlying DML runs as the
-- calling role, so geo_wells/geo_wells_tops RLS decides everything.

create or replace function public.seismic_wells_compat_insert()
returns trigger
language plpgsql
as $$
begin
  new.id := coalesce(new.id, gen_random_uuid());
  -- populate the echo row: INSERT ... RETURNING on the view hands back
  -- NEW, which never sees the base table's column defaults
  new.created_at := coalesce(new.created_at, now());
  new.updated_at := coalesce(new.updated_at, new.created_at);
  new.kb_m := coalesce(new.kb_m, 0);
  new.deviation := coalesce(new.deviation, '[]'::jsonb);
  new.tops := coalesce(new.tops, '[]'::jsonb);
  new.checkshots := coalesce(new.checkshots, '[]'::jsonb);
  insert into public.geo_wells
    (id, user_id, name, uwi, surface_x, surface_y, kb_m, td_md_m,
     units_note, deviation, checkshots, created_at, updated_at)
  values
    (new.id, new.user_id, new.name, new.uwi, new.surface_x, new.surface_y,
     new.kb_m, new.td_md_m,
     'SI (m); written via seismic_wells compat view (G1.4)',
     new.deviation, new.checkshots, new.created_at, new.updated_at);
  insert into public.geo_wells_tops (well_id, name, md_m)
  select new.id, t->>'name', (t->>'md')::double precision
  from jsonb_array_elements(new.tops) t
  where t->>'name' is not null and (t->>'md') is not null;
  return new;
end;
$$;

create or replace function public.seismic_wells_compat_update()
returns trigger
language plpgsql
as $$
declare
  updated integer;
begin
  update public.geo_wells set
    name = new.name,
    uwi = new.uwi,
    surface_x = new.surface_x,
    surface_y = new.surface_y,
    kb_m = coalesce(new.kb_m, 0),
    td_md_m = new.td_md_m,
    deviation = coalesce(new.deviation, '[]'::jsonb),
    checkshots = coalesce(new.checkshots, '[]'::jsonb),
    updated_at = now()
  where id = old.id;
  get diagnostics updated = row_count;
  if updated = 0 then
    return null; -- RLS filtered it: not the owner
  end if;
  if new.tops is distinct from old.tops then
    delete from public.geo_wells_tops where well_id = old.id;
    insert into public.geo_wells_tops (well_id, name, md_m)
    select old.id, t->>'name', (t->>'md')::double precision
    from jsonb_array_elements(coalesce(new.tops, '[]'::jsonb)) t
    where t->>'name' is not null and (t->>'md') is not null;
  end if;
  return new;
end;
$$;

create or replace function public.seismic_wells_compat_delete()
returns trigger
language plpgsql
as $$
declare
  deleted integer;
begin
  delete from public.geo_wells where id = old.id;
  get diagnostics deleted = row_count;
  if deleted = 0 then
    return null; -- RLS filtered it: not the owner
  end if;
  return old;
end;
$$;

create trigger seismic_wells_compat_insert
  instead of insert on public.seismic_wells
  for each row execute function public.seismic_wells_compat_insert();

create trigger seismic_wells_compat_update
  instead of update on public.seismic_wells
  for each row execute function public.seismic_wells_compat_update();

create trigger seismic_wells_compat_delete
  instead of delete on public.seismic_wells
  for each row execute function public.seismic_wells_compat_delete();

grant select, insert, update, delete on public.seismic_wells to authenticated;
grant select, insert, update, delete on public.seismic_wells to service_role;
