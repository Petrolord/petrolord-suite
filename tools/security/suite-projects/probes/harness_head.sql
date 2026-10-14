-- Suite Projects P0 probe harness. Used ONLY inside BEGIN ... ROLLBACK (run_dryrun.sh).
-- Technique from tools/security/2026-10/probes: become a persona with
-- set_config('role') + request.jwt.claims, run a statement, record the result.
-- Personas (live accounts; nothing persists, the transaction always rolls back):
--   anon
--   consultant  ayoasaolu@gmail.com      Lordsway owner; the pilot: two clients, one project each
--   member      woledada1@gmail.com      Lordsway engineer; member of the org, not of the members-only project
--   projmember  demilolaojo@gmail.com    Lordsway engineer; added to the members-only project
--   orgadmin    seyiojo@lordswayenergy.com  Lordsway admin (sees members-only data only after a logged open)
--   orgB        ndifreke.usoro@peculiarschools.com  Lekki Peculiar School (another organisation)
--   demo        demo@petrolord.com       Petrolord Demo owner (must see exactly the same rows before and after)
--   noorg       support@petrolord.com    no organisation (personal default project)
create temp table _p (phase text, persona text, probe text, result text) on commit drop;
grant all on _p to public;
create temp table _ids (k text primary key, v text) on commit drop;
grant all on _ids to public;
create temp table _personas (persona text, uid uuid, email text) on commit drop;
grant all on _personas to public;
insert into _personas values
  ('anon', null, null),
  ('consultant', '1d5bc4bf-5bf3-4349-8319-b20e9ffb1c39', 'ayoasaolu@gmail.com'),
  ('member', '02dbca6c-7816-4b74-972c-be4fbd6e2753', 'woledada1@gmail.com'),
  ('projmember', '1eb3c6ed-88b0-43a8-bd8b-d7f36aede040', 'demilolaojo@gmail.com'),
  ('orgadmin', '0b403d59-ea61-4809-9429-a692bca9214b', 'seyiojo@lordswayenergy.com'),
  ('orgB', '19db244f-eb02-461a-b6f9-813d65c8e259', 'ndifreke.usoro@peculiarschools.com'),
  ('demo', '77aad664-c819-4611-b479-a2f55dc17460', 'demo@petrolord.com'),
  ('noorg', '8035d144-d8bd-43e9-b949-8a5e47ab4dbe', 'support@petrolord.com');

create function pg_temp.q(p_sql text) returns text language plpgsql as $f$
declare r text;
begin
  if p_sql ~* '^\s*(insert|update|delete)\M' and p_sql !~* '\mreturning\M' then
    execute p_sql;
    return 'OK';
  end if;
  execute p_sql into r;
  return coalesce(r, 'NULL');
exception when others then
  return 'ERR ' || sqlstate;
end $f$;

create function pg_temp.become(p text) returns void language plpgsql as $f$
declare v uuid; e text;
begin
  select uid, email into v, e from _personas where persona = p;
  if p = 'anon' then
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    perform set_config('role', 'anon', true);
  else
    perform set_config('request.jwt.claims',
      json_build_object('sub', v, 'role', 'authenticated', 'email', e)::text, true);
    perform set_config('role', 'authenticated', true);
  end if;
end $f$;

create function pg_temp.unbecome() returns void language plpgsql as $f$
begin
  reset role;
  perform set_config('request.jwt.claims', '', true);
end $f$;

-- run one statement as a persona and return its result (used for fixtures)
create function pg_temp.run(p_persona text, p_sql text) returns text language plpgsql as $f$
declare r text;
begin
  perform pg_temp.become(p_persona);
  r := pg_temp.q(p_sql);
  perform pg_temp.unbecome();
  return r;
end $f$;

-- what each persona can see on every table P0 touches or that reads them: row
-- count, md5 of visible ids, and a storage count. Kept to these tables so the
-- exclusive locks taken by the migration are held for seconds only.
create temp table _snap_tables (t text) on commit drop;
grant all on _snap_tables to public;
insert into _snap_tables values
  ('geo_wells'),('geo_wells_logs'),('geo_wells_tops'),('geo_wells_zones'),('geo_wells_intervals'),('geo_wells_core_images'),
  ('geo_surfaces'),('geo_culture'),('geo_correlation_sections'),('geo_strat_units'),('strat_projects'),('strat_zone_schemes'),
  ('seismic_projects'),('seismic_volumes'),('seismic_lines'),('seismic_horizons'),('seismic_faults'),('seismic_line_picks'),
  ('seismic_exported_surfaces'),('seismic_sessions'),('seismic_crop_definitions'),('suite_record_changes'),
  ('organizations'),('organization_members'),('users'),('invitations'),('geoscience_settings'),('suite_unit_settings');
create function pg_temp.snapshot(p_phase text) returns void language plpgsql as $f$
declare t text; p text; has_id boolean;
begin
  for p in select persona from _personas loop
    for t in select s.t from _snap_tables s order by 1 loop
      has_id := exists (select 1 from information_schema.columns c
                         where c.table_schema = 'public' and c.table_name = t and c.column_name = 'id');
      perform pg_temp.become(p);
      insert into _p values (p_phase, p, 'count:' || t,
        pg_temp.q(format('select count(*)::text from public.%I', t)));
      if has_id then
        insert into _p values (p_phase, p, 'ids:' || t,
          pg_temp.q(format($q$select md5(coalesce(string_agg(id::text, ',' order by id::text), '')) from public.%I$q$, t)));
      end if;
      perform pg_temp.unbecome();
    end loop;
    perform pg_temp.become(p);
    insert into _p values (p_phase, p, 'count:storage.objects', pg_temp.q('select count(*)::text from storage.objects'));
    perform pg_temp.unbecome();
  end loop;
end $f$;

create function pg_temp.t(p_persona text, p_probe text, p_sql text, p_expect text) returns void language plpgsql as $f$
declare r text;
begin
  r := pg_temp.run(p_persona, p_sql);
  insert into _p values ('probe', p_persona, p_probe,
    case when r like p_expect then 'PASS ' else 'FAIL ' end || r || '  (expect ' || p_expect || ')');
end $f$;
grant execute on all functions in schema pg_temp to public;

set local statement_timeout = '600s';
set local lock_timeout = '3s';   -- fail fast rather than queue behind (or block) live traffic
select pg_temp.snapshot('before');
