-- Suite Projects P2 gate, live and rolled back: a project settings change
-- leaves stored data byte-identical. The consultant creates a client project
-- holding a well, then changes every setting; md5 of every registry and
-- child table (read as the migration role, so every row counts) and of the
-- storage object list must not move. A colleague who does not manage the
-- project cannot change its settings.
create function pg_temp.fingerprint() returns text language sql as $$
  select md5(string_agg(t || ':' || h, '|' order by t)) from (
    select 'geo_wells' t, md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.id), '')) h from public.geo_wells x union all
    select 'geo_wells_logs', md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.id), '')) from public.geo_wells_logs x union all
    select 'geo_wells_tops', md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.id), '')) from public.geo_wells_tops x union all
    select 'geo_wells_zones', md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.id), '')) from public.geo_wells_zones x union all
    select 'geo_surfaces', md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.id), '')) from public.geo_surfaces x union all
    select 'geo_culture', md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.id), '')) from public.geo_culture x union all
    select 'geo_correlation_sections', md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.id), '')) from public.geo_correlation_sections x union all
    select 'geo_strat_units', md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.id), '')) from public.geo_strat_units x union all
    select 'strat_projects', md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.id), '')) from public.strat_projects x union all
    select 'seismic_volumes', md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.id), '')) from public.seismic_volumes x union all
    select 'seismic_lines', md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.id), '')) from public.seismic_lines x union all
    select 'seismic_projects', md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.id), '')) from public.seismic_projects x union all
    select 'seismic_horizons', md5(coalesce(string_agg(x.id::text || x.updated_at::text, ',' order by x.id), '')) from public.seismic_horizons x union all
    select 'geoscience_settings', md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.id), '')) from public.geoscience_settings x union all
    select 'suite_unit_settings', md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by 1), '')) from public.suite_unit_settings x union all
    select 'storage', md5(coalesce(string_agg(x.bucket_id || x.name || coalesce(x.updated_at::text, ''), ',' order by x.bucket_id, x.name), '')) from storage.objects x
  ) f;
$$;
grant execute on all functions in schema pg_temp to public;

insert into _ids values ('ORGA', '1ace6b81-f133-4d42-a0fe-56960e8d71ed');
create function pg_temp.id(k text) returns uuid language sql stable as $$ select v::uuid from _ids where _ids.k = id.k $$;
grant execute on all functions in schema pg_temp to public;
insert into _ids values ('CA', pg_temp.run('consultant', $$insert into public.suite_clients (organization_id, owner_user_id, name)
  values (pg_temp.id('ORGA'), auth.uid(), 'Probe Client P2') returning id::text$$));
insert into _ids values ('PA', pg_temp.run('consultant', $$insert into public.suite_projects (organization_id, owner_user_id, client_id, name)
  values (pg_temp.id('ORGA'), auth.uid(), pg_temp.id('CA'), 'Probe P2 Field') returning id::text$$));
select pg_temp.t('consultant', 'fixture: a well in the project',
  $$insert into public.geo_wells (user_id, name, surface_x, surface_y, crs, suite_project_id) values (auth.uid(), 'PROBE-P2-1', 1, 2, 'EPSG:26332', pg_temp.id('PA')) returning 'ok'$$, 'ok');
insert into _ids values ('FP0', pg_temp.fingerprint());

select pg_temp.t('consultant', 'owner saves every setting',
  $$with x as (update public.suite_projects set settings = '{"units":{"preset":"metric","units":{},"version":1},"crs":{"tag":"EPSG:26332","name":"Minna / UTM 32N","xyUnit":"m"},"datum":{"refKind":"RT","verticalDatum":"LAT","srdM":12.5},"timescale":"ICS 2023/09"}'::jsonb
     where id = pg_temp.id('PA') returning 1) select count(*)::text from x$$, '1');
select pg_temp.t('consultant', 'owner changes them again',
  $$with x as (update public.suite_projects set settings = '{"timescale":"ICS 2026/06"}'::jsonb where id = pg_temp.id('PA') returning 1) select count(*)::text from x$$, '1');
insert into _p select 'probe', 'gate', 'stored data byte-identical after settings changes',
  case when pg_temp.fingerprint() = (select v from _ids where k = 'FP0') then 'PASS identical' else 'FAIL changed' end || '  (expect identical)';
select pg_temp.t('member', 'colleague (not manager) cannot change settings',
  $$with x as (update public.suite_projects set settings = '{}'::jsonb where id = pg_temp.id('PA') returning 1) select count(*)::text from x$$, '0');
select pg_temp.t('orgB', 'another organisation cannot change settings',
  $$with x as (update public.suite_projects set settings = '{}'::jsonb where id = pg_temp.id('PA') returning 1) select count(*)::text from x$$, '0');
select pg_temp.t('consultant', 'settings as saved', $$select settings->>'timescale' from public.suite_projects where id = pg_temp.id('PA')$$, 'ICS 2026/06');
-- negative control: a real data change DOES move the fingerprint
select pg_temp.t('consultant', 'negative control: edit the well',
  $$with x as (update public.geo_wells set surface_x = 3 where name = 'PROBE-P2-1' and user_id = auth.uid() returning 1) select count(*)::text from x$$, '1');
insert into _p select 'probe', 'gate', 'negative control: fingerprint detects a data change',
  case when pg_temp.fingerprint() <> (select v from _ids where k = 'FP0') then 'PASS changed' else 'FAIL identical' end || '  (expect changed)';
