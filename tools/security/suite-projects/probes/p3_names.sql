-- Suite Projects P3: well names per project (after 20261015120000, rolled back).
insert into _ids values ('ORGA', '1ace6b81-f133-4d42-a0fe-56960e8d71ed');
create function pg_temp.id(k text) returns uuid language sql stable as $$ select v::uuid from _ids where _ids.k = id.k $$;
grant execute on all functions in schema pg_temp to public;
insert into _ids values ('PA', pg_temp.run('consultant', $$insert into public.suite_projects (organization_id, owner_user_id, name)
  values (pg_temp.id('ORGA'), auth.uid(), 'Probe P3 A') returning id::text$$));
insert into _ids values ('PB', pg_temp.run('consultant', $$insert into public.suite_projects (organization_id, owner_user_id, name)
  values (pg_temp.id('ORGA'), auth.uid(), 'Probe P3 B') returning id::text$$));
select pg_temp.t('consultant', 'well-1 in project A',
  $$insert into public.geo_wells (user_id, name, surface_x, surface_y, suite_project_id) values (auth.uid(), 'Probe Well-1', 0, 0, pg_temp.id('PA')) returning 'ok'$$, 'ok');
select pg_temp.t('consultant', 'same name in project B is allowed',
  $$insert into public.geo_wells (user_id, name, surface_x, surface_y, suite_project_id) values (auth.uid(), 'probe  WELL-1', 0, 0, pg_temp.id('PB')) returning 'ok'$$, 'ok');
select pg_temp.t('consultant', 'same name twice in project A is refused',
  $$insert into public.geo_wells (user_id, name, surface_x, surface_y, suite_project_id) values (auth.uid(), 'PROBE WELL-1 ', 0, 0, pg_temp.id('PA')) returning 'ok'$$, 'ERR 23505');
select pg_temp.t('consultant', 'moving into a project that has the name is refused',
  $$select public.suite_move_to_project('geo_wells', array[(select id from public.geo_wells where name = 'probe  WELL-1' and user_id = auth.uid())], pg_temp.id('PA'))::text$$, 'ERR 23505');
select pg_temp.t('member', 'a colleague may use the same name (per owner, as before)',
  $$insert into public.geo_wells (user_id, name, surface_x, surface_y, suite_project_id) values (auth.uid(), 'Probe Well-1', 0, 0, pg_temp.id('PA')) returning 'ok'$$, 'ok');
