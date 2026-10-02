-- Well datum model (Well Data Manager U2-007; serves Well Correlation
-- U2-018 and Wellsite U2-019 / WS-U1-024). Owner released 2026-10-01.
-- Design: docs/scope/WellDatum-DESIGN-AND-STATUS.md.
--
-- Until now a registry well had one vertical number, kb_m NOT NULL DEFAULT 0,
-- with no name for the reference or the datum, and every door wrote 0 when
-- nothing was entered, so 0 and "not entered" could not be told apart.
--
-- This adds, on the product registry table public.geo_wells only:
--   depth_ref_kind    where measured depth is zero: KB, RT, DF, GL, MSL, OTHER
--   depth_ref_label   the name when the kind is OTHER
--   depth_ref_elev_m  elevation of that point above the vertical datum, m.
--                     NULL = not entered. 0 is a real value.
--   well_environment  onshore | offshore
--   ground_elev_m     onshore: ground level above the vertical datum, m
--   water_depth_m     offshore: vertical datum to mudline, m, positive down
--   vertical_datum    its name: MSL, LAT, or a named national datum
--   elev_unit         m | ft: the unit the elevations were entered in
--                     (storage stays metres)
--   datum_changes     jsonb array: who corrected the datum, when, from, to
--
-- kb_m stays as it is (NOT NULL, default 0). The app keeps it equal to
-- depth_ref_elev_m (0 while unset) so builds that predate this model read
-- the number they always read.
--
-- Additive and nullable. No column is dropped or retyped, no default is
-- changed, and there is NO policy, grant or trigger change. geo_wells is a
-- product-prefixed registry table; none of the four shared tables is touched.
--
-- Backfill (the only data written): a well whose kb_m is not 0 states it as
-- a kelly bushing elevation (depth_ref_kind 'KB', depth_ref_elev_m = kb_m);
-- where its units_note records that KB was entered in feet, elev_unit 'ft'.
-- A kb_m of exactly 0 is left unset, because 0 was the default at every
-- door (column default, registry writer, import dialogs, Well Design
-- publish). The vertical datum name and the environment are not backfilled:
-- nothing stored says which they are.
--
-- Idempotent. The whole file is ONE DO statement, so it runs as one
-- transaction however it is sent, and it carries no begin or commit line: a
-- dry run that wraps it in begin ... rollback really rolls back.

do $datum$
begin
  alter table public.geo_wells
    add column if not exists depth_ref_kind   text,
    add column if not exists depth_ref_label  text,
    add column if not exists depth_ref_elev_m double precision,
    add column if not exists well_environment text,
    add column if not exists ground_elev_m    double precision,
    add column if not exists water_depth_m    double precision,
    add column if not exists vertical_datum   text,
    add column if not exists elev_unit        text,
    add column if not exists datum_changes    jsonb;

  alter table public.geo_wells drop constraint if exists geo_wells_depth_ref_kind_check;
  alter table public.geo_wells add constraint geo_wells_depth_ref_kind_check
    check (depth_ref_kind is null or depth_ref_kind in ('KB', 'RT', 'DF', 'GL', 'MSL', 'OTHER'));

  alter table public.geo_wells drop constraint if exists geo_wells_depth_ref_label_check;
  alter table public.geo_wells add constraint geo_wells_depth_ref_label_check
    check (depth_ref_label is null or length(depth_ref_label) <= 80);

  alter table public.geo_wells drop constraint if exists geo_wells_well_environment_check;
  alter table public.geo_wells add constraint geo_wells_well_environment_check
    check (well_environment is null or well_environment in ('onshore', 'offshore'));

  alter table public.geo_wells drop constraint if exists geo_wells_elev_unit_check;
  alter table public.geo_wells add constraint geo_wells_elev_unit_check
    check (elev_unit is null or elev_unit in ('m', 'ft'));

  alter table public.geo_wells drop constraint if exists geo_wells_vertical_datum_check;
  alter table public.geo_wells add constraint geo_wells_vertical_datum_check
    check (vertical_datum is null or length(vertical_datum) between 1 and 80);

  alter table public.geo_wells drop constraint if exists geo_wells_water_depth_check;
  alter table public.geo_wells add constraint geo_wells_water_depth_check
    check (water_depth_m is null or water_depth_m >= 0);

  -- water depth is an offshore fact, ground level an onshore one
  alter table public.geo_wells drop constraint if exists geo_wells_datum_environment_check;
  alter table public.geo_wells add constraint geo_wells_datum_environment_check
    check (
      -- coalesce: with no environment the comparison is NULL, and a NULL
      -- check passes, so absence must read as false
      (water_depth_m is null or coalesce(well_environment = 'offshore', false))
      and (ground_elev_m is null or well_environment is distinct from 'offshore')
    );

  -- an elevation says what it belongs to
  alter table public.geo_wells drop constraint if exists geo_wells_depth_ref_elev_kind_check;
  alter table public.geo_wells add constraint geo_wells_depth_ref_elev_kind_check
    check (depth_ref_elev_m is null or depth_ref_kind is not null);

  alter table public.geo_wells drop constraint if exists geo_wells_datum_changes_check;
  alter table public.geo_wells add constraint geo_wells_datum_changes_check
    check (datum_changes is null or jsonb_typeof(datum_changes) = 'array');

  comment on column public.geo_wells.depth_ref_kind is
    'Datum model: where measured depth is zero (KB kelly bushing, RT rotary table, DF drill floor, GL ground level, MSL mean sea level, OTHER named in depth_ref_label).';
  comment on column public.geo_wells.depth_ref_label is
    'Datum model: the name of the depth reference when depth_ref_kind is OTHER.';
  comment on column public.geo_wells.depth_ref_elev_m is
    'Datum model: elevation of the depth reference above the vertical datum, metres. NULL = not entered (TVDSS is refused); 0 is a real value. kb_m mirrors it (0 while NULL) for older builds.';
  comment on column public.geo_wells.well_environment is
    'Datum model: onshore or offshore.';
  comment on column public.geo_wells.ground_elev_m is
    'Datum model: onshore ground level elevation above the vertical datum, metres.';
  comment on column public.geo_wells.water_depth_m is
    'Datum model: offshore water depth, vertical datum to mudline, metres, positive down.';
  comment on column public.geo_wells.vertical_datum is
    'Datum model: name of the vertical datum (MSL, LAT, or a named national datum). NULL = not named; the apps then read elevations as above mean sea level and say so.';
  comment on column public.geo_wells.elev_unit is
    'Datum model: the unit (m or ft) the elevations were entered in and are shown in. Storage is metres.';
  comment on column public.geo_wells.datum_changes is
    'Datum model: jsonb array of datum corrections [{at, by, by_name, app, reason, kind, shift_tvdss_m, from, to, affected}].';

  -- Backfill only what the stored data states unambiguously.
  update public.geo_wells
     set depth_ref_kind = 'KB',
         depth_ref_elev_m = kb_m,
         elev_unit = case when units_note like 'entered: KB/TD ft%' then 'ft' else elev_unit end
   where depth_ref_elev_m is null
     and depth_ref_kind is null
     and kb_m is not null
     and kb_m <> 0;
end
$datum$;
