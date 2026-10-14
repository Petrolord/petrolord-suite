-- Suite Projects P0 role pentest. Runs AFTER the three migrations inside the
-- rolled-back transaction. org A = Lordsway Energy, org B = Lekki Peculiar School.
-- Fixtures are made AS the personas (so the policies are exercised), never as postgres,
-- except reading one demo well id.
insert into _ids values ('ORGA', '1ace6b81-f133-4d42-a0fe-56960e8d71ed'), ('ORGB', '9f582a00-fb23-40bc-98ab-6d1919dfc336');
insert into _ids select 'DEMOWELL', id::text from public.geo_wells where user_id = '77aad664-c819-4611-b479-a2f55dc17460' order by id limit 1;
insert into _ids select 'DEFA', id::text from public.suite_projects where organization_id = '1ace6b81-f133-4d42-a0fe-56960e8d71ed' and is_default;
create function pg_temp.id(k text) returns uuid language sql stable as $$ select v::uuid from _ids where _ids.k = id.k $$;
grant execute on all functions in schema pg_temp to public;

-- consultant: two clients, one project each; Beta's project is members only
insert into _ids values ('CA', pg_temp.run('consultant', $$insert into public.suite_clients (organization_id, owner_user_id, name, colour, notes)
  values (pg_temp.id('ORGA'), auth.uid(), 'Probe Client Alpha', '#1F6FEB', 'probe') returning id::text$$));
insert into _ids values ('CB', pg_temp.run('consultant', $$insert into public.suite_clients (organization_id, owner_user_id, name)
  values (pg_temp.id('ORGA'), auth.uid(), 'Probe Client Beta') returning id::text$$));
insert into _ids values ('PA', pg_temp.run('consultant', $$insert into public.suite_projects (organization_id, owner_user_id, client_id, name)
  values (pg_temp.id('ORGA'), auth.uid(), pg_temp.id('CA'), 'Probe Field A') returning id::text$$));
insert into _ids values ('PB', pg_temp.run('consultant', $$insert into public.suite_projects (organization_id, owner_user_id, client_id, name)
  values (pg_temp.id('ORGA'), auth.uid(), pg_temp.id('CB'), 'Probe Field B') returning id::text$$));
select pg_temp.t('consultant', 'fixture: Beta project to members only',
  $$with x as (update public.suite_projects set visibility = 'members' where id = pg_temp.id('PB') returning 1) select count(*)::text from x$$, '1');
select pg_temp.t('consultant', 'fixture: add projmember to Beta project',
  $$insert into public.suite_project_members (project_id, user_id, role) values (pg_temp.id('PB'), '1eb3c6ed-88b0-43a8-bd8b-d7f36aede040', 'editor')$$, 'OK');
insert into _ids values ('WA', pg_temp.run('consultant', $$insert into public.geo_wells (user_id, name, surface_x, surface_y, organization_id, suite_project_id)
  values (auth.uid(), 'PROBE-A-1', 0, 0, pg_temp.id('ORGA'), pg_temp.id('PA')) returning id::text$$));
insert into _ids values ('WB', pg_temp.run('consultant', $$insert into public.geo_wells (user_id, name, surface_x, surface_y, organization_id, suite_project_id)
  values (auth.uid(), 'PROBE-B-1', 0, 0, pg_temp.id('ORGA'), pg_temp.id('PB')) returning id::text$$));
insert into _ids values ('WBP', pg_temp.run('consultant', $$insert into public.geo_wells (user_id, name, surface_x, surface_y, suite_project_id)
  values (auth.uid(), 'PROBE-B-2 private', 0, 0, pg_temp.id('PB')) returning id::text$$));
select pg_temp.t('consultant', 'fixture: top on Beta well',
  $$insert into public.geo_wells_tops (well_id, name, md_m) values (pg_temp.id('WB'), 'Probe Top', 1000)$$, 'OK');
insert into _ids values ('VB', pg_temp.run('consultant', $$insert into public.seismic_volumes (user_id, name, organization_id, suite_project_id)
  values (auth.uid(), 'PROBE-VOL-B', pg_temp.id('ORGA'), pg_temp.id('PB')) returning id::text$$));
insert into _ids values ('POB', pg_temp.run('orgB', $$insert into public.suite_projects (organization_id, owner_user_id, name)
  values ('9f582a00-fb23-40bc-98ab-6d1919dfc336', auth.uid(), 'Probe School Project') returning id::text$$));
insert into _p select 'probe', 'fixtures', 'fixture ids', case when count(*) filter (where v is null or v like 'ERR%') = 0 then 'PASS ' else 'FAIL ' end
  || string_agg(k || '=' || coalesce(left(v, 8), 'null'), ' ' order by k) || '  (expect all uuids)' from _ids;

-- anon: nothing
select pg_temp.t('anon', 'read suite_projects', $$select count(*)::text from public.suite_projects$$, 'ERR 42501');
select pg_temp.t('anon', 'read suite_clients', $$select count(*)::text from public.suite_clients$$, 'ERR 42501');
select pg_temp.t('anon', 'read access log', $$select count(*)::text from public.suite_project_access_log$$, 'ERR 42501');
select pg_temp.t('anon', 'read user state', $$select count(*)::text from public.suite_user_state$$, 'ERR 42501');
select pg_temp.t('anon', 'bootstrap rpc', $$select public.suite_project_bootstrap()::text$$, 'ERR 42501');
select pg_temp.t('anon', 'admin_open rpc', $$select public.suite_project_admin_open(pg_temp.id('PB'))::text$$, 'ERR 42501');
select pg_temp.t('anon', 'move rpc', $$select public.suite_move_to_project('geo_wells', array[pg_temp.id('WA')], pg_temp.id('PB'))::text$$, 'ERR 42501');
select pg_temp.t('anon', 'helper can_read', $$select public.suite_project_can_read(pg_temp.id('PA'))::text$$, 'ERR 42501');
select pg_temp.t('anon', 'internal helper', $$select public.suite_project_can_read_as(pg_temp.id('PA'), '1d5bc4bf-5bf3-4349-8319-b20e9ffb1c39')::text$$, 'ERR 42501');
select pg_temp.t('anon', 'read geo_wells', $$select count(*)::text from public.geo_wells$$, 'ERR 42501');
select pg_temp.t('anon', 'storage listing still works', $$select (count(*) >= 0)::text from storage.objects$$, 'true');

-- consultant: complete separation between the two clients' projects
select pg_temp.t('consultant', 'sees both clients', $$select count(*)::text from public.suite_clients where id in (pg_temp.id('CA'), pg_temp.id('CB'))$$, '2');
select pg_temp.t('consultant', 'project A lists only A wells', $$select string_agg(name, ',') from public.geo_wells where suite_project_id = pg_temp.id('PA')$$, 'PROBE-A-1');
select pg_temp.t('consultant', 'project B lists only B wells', $$select string_agg(name, ',' order by name) from public.geo_wells where suite_project_id = pg_temp.id('PB')$$, 'PROBE-B-1,PROBE-B-2 private');
select pg_temp.t('consultant', 'project A has no B tops', $$select count(*)::text from public.geo_wells_tops t join public.geo_wells w on w.id = t.well_id where w.suite_project_id = pg_temp.id('PA')$$, '0');
select pg_temp.t('consultant', 'project B volume only in B', $$select count(*)::text from public.seismic_volumes where suite_project_id = pg_temp.id('PA')$$, '0');
select pg_temp.t('consultant', 'default keeps the old wells', $$select (count(*) > 0)::text from public.geo_wells where suite_project_id = pg_temp.id('DEFA') and user_id = auth.uid()$$, 'true');
select pg_temp.t('consultant', 'stamp: current project A',
  $$insert into public.suite_user_state (user_id, current_project_id) values (auth.uid(), pg_temp.id('PA')) on conflict (user_id) do update set current_project_id = excluded.current_project_id$$, 'OK');
select pg_temp.t('consultant', 'stamp: new well lands in current project A',
  $$insert into public.geo_wells (user_id, name, surface_x, surface_y) values (auth.uid(), 'PROBE-A-2', 0, 0) returning (suite_project_id = pg_temp.id('PA'))::text$$, 'true');
select pg_temp.t('consultant', 'bootstrap returns current A', $$select (public.suite_project_bootstrap() ->> 'current_project_id')$$, (select v from _ids where k = 'PA'));
select pg_temp.t('consultant', 'cannot write into another org project',
  $$insert into public.geo_wells (user_id, name, surface_x, surface_y, suite_project_id) values (auth.uid(), 'PROBE-X', 0, 0, pg_temp.id('POB'))$$, 'ERR 42501');
select pg_temp.t('consultant', 'cannot see other org project', $$select count(*)::text from public.suite_projects where id = pg_temp.id('POB')$$, '0');
select pg_temp.t('consultant', 'cannot move a demo well', $$select public.suite_move_to_project('geo_wells', array[pg_temp.id('DEMOWELL')], pg_temp.id('PA'))::text$$, 'ERR 42501');
select pg_temp.t('consultant', 'cannot move into other org project', $$select public.suite_move_to_project('geo_wells', array[pg_temp.id('WA')], pg_temp.id('POB'))::text$$, 'ERR 42501');
select pg_temp.t('consultant', 'move rpc refuses other tables', $$select public.suite_move_to_project('organizations', array[pg_temp.id('ORGA')], pg_temp.id('PA'))::text$$, 'ERR 22023');
select pg_temp.t('consultant', 'project with data cannot be deleted',
  $$delete from public.suite_projects where id = pg_temp.id('PA')$$, 'ERR 23503');
select pg_temp.t('consultant', 'client with projects cannot be deleted',
  $$delete from public.suite_clients where id = pg_temp.id('CA')$$, 'ERR 23503');
select pg_temp.t('consultant', 'default project cannot be deleted',
  $$with x as (delete from public.suite_projects where id = pg_temp.id('DEFA') returning 1) select count(*)::text from x$$, '0');
select pg_temp.t('consultant', 'default project cannot go members only',
  $$update public.suite_projects set visibility = 'members' where id = pg_temp.id('DEFA')$$, 'ERR 23514');
select pg_temp.t('consultant', 'a forged default is saved as an ordinary project',
  $$insert into public.suite_projects (organization_id, owner_user_id, name, is_default) values (pg_temp.id('ORGA'), auth.uid(), 'Fake default', true) returning is_default::text$$, 'false');
select pg_temp.t('consultant', 'visibility change logged',
  $$select count(*)::text from public.suite_project_access_log where project_id = pg_temp.id('PB') and event = 'visibility_changed'$$, '1');

-- member of the org (open project A; not a member of members-only B)
select pg_temp.t('member', 'sees open project A', $$select count(*)::text from public.suite_projects where id = pg_temp.id('PA')$$, '1');
select pg_temp.t('member', 'does not see members-only B', $$select count(*)::text from public.suite_projects where id = pg_temp.id('PB')$$, '0');
select pg_temp.t('member', 'sees client Alpha only', $$select string_agg(name, ',') from public.suite_clients where id in (pg_temp.id('CA'), pg_temp.id('CB'))$$, 'Probe Client Alpha');
select pg_temp.t('member', 'reads shared well in open A (unchanged access)', $$select count(*)::text from public.geo_wells where id = pg_temp.id('WA')$$, '1');
select pg_temp.t('member', 'no B wells (shared or private)', $$select count(*)::text from public.geo_wells where id in (pg_temp.id('WB'), pg_temp.id('WBP'))$$, '0');
select pg_temp.t('member', 'no B tops', $$select count(*)::text from public.geo_wells_tops where well_id = pg_temp.id('WB')$$, '0');
select pg_temp.t('member', 'no B volume', $$select count(*)::text from public.seismic_volumes where id = pg_temp.id('VB')$$, '0');
select pg_temp.t('member', 'cannot write into B', $$insert into public.geo_wells (user_id, name, surface_x, surface_y, suite_project_id) values (auth.uid(), 'PROBE-M-B', 0, 0, pg_temp.id('PB'))$$, 'ERR 42501');
select pg_temp.t('member', 'can add own well to open A', $$insert into public.geo_wells (user_id, name, surface_x, surface_y, suite_project_id) values (auth.uid(), 'PROBE-M-A', 0, 0, pg_temp.id('PA')) returning (suite_project_id = pg_temp.id('PA'))::text$$, 'true');
select pg_temp.t('member', 'stamp: no current project lands in org default', $$insert into public.geo_wells (user_id, name, surface_x, surface_y) values (auth.uid(), 'PROBE-M-D', 0, 0) returning (suite_project_id = pg_temp.id('DEFA'))::text$$, 'true');
select pg_temp.t('member', 'cannot join B', $$insert into public.suite_project_members (project_id, user_id, role) values (pg_temp.id('PB'), auth.uid(), 'owner')$$, 'ERR 42501');
select pg_temp.t('member', 'cannot make B current', $$insert into public.suite_user_state (user_id, current_project_id) values (auth.uid(), pg_temp.id('PB'))$$, 'ERR 42501');
select pg_temp.t('member', 'cannot change A visibility', $$with x as (update public.suite_projects set visibility = 'members' where id = pg_temp.id('PA') returning 1) select count(*)::text from x$$, '0');
select pg_temp.t('member', 'admin_open refused', $$select public.suite_project_admin_open(pg_temp.id('PB'))::text$$, 'ERR 42501');
select pg_temp.t('member', 'cannot move the consultant well', $$select public.suite_move_to_project('geo_wells', array[pg_temp.id('WA')], pg_temp.id('DEFA'))::text$$, 'ERR 42501');
select pg_temp.t('member', 'cannot read B log', $$select count(*)::text from public.suite_project_access_log where project_id = pg_temp.id('PB')$$, '0');
select pg_temp.t('member', 'cannot write own row into B by update', $$with x as (update public.geo_wells set suite_project_id = pg_temp.id('PB') where user_id = auth.uid() and name = 'PROBE-M-A' returning 1) select count(*)::text from x$$, 'ERR 42501');

-- member of the members-only project
select pg_temp.t('projmember', 'sees B', $$select count(*)::text from public.suite_projects where id = pg_temp.id('PB')$$, '1');
select pg_temp.t('projmember', 'reads shared B well', $$select count(*)::text from public.geo_wells where id = pg_temp.id('WB')$$, '1');
select pg_temp.t('projmember', 'private B well stays private', $$select count(*)::text from public.geo_wells where id = pg_temp.id('WBP')$$, '0');
select pg_temp.t('projmember', 'reads B tops', $$select count(*)::text from public.geo_wells_tops where well_id = pg_temp.id('WB')$$, '1');
select pg_temp.t('projmember', 'reads B volume', $$select count(*)::text from public.seismic_volumes where id = pg_temp.id('VB')$$, '1');
select pg_temp.t('projmember', 'editor can add to B', $$insert into public.geo_wells (user_id, name, surface_x, surface_y, organization_id, suite_project_id) values (auth.uid(), 'PROBE-PM-B', 0, 0, pg_temp.id('ORGA'), pg_temp.id('PB')) returning 'ok'$$, 'ok');
select pg_temp.t('projmember', 'cannot manage B', $$with x as (update public.suite_projects set name = 'hijack' where id = pg_temp.id('PB') returning 1) select count(*)::text from x$$, '0');

-- org admin: list yes, data only after a logged open
select pg_temp.t('orgadmin', 'lists B', $$select count(*)::text from public.suite_projects where id = pg_temp.id('PB')$$, '1');
select pg_temp.t('orgadmin', 'no B wells before open', $$select count(*)::text from public.geo_wells where id = pg_temp.id('WB')$$, '0');
select pg_temp.t('orgadmin', 'no B tops before open', $$select count(*)::text from public.geo_wells_tops where well_id = pg_temp.id('WB')$$, '0');
select pg_temp.t('orgadmin', 'cannot fake an open log row', $$insert into public.suite_project_access_log (project_id, actor_id, event) values (pg_temp.id('PB'), auth.uid(), 'admin_open')$$, 'ERR 42501');
select pg_temp.t('orgadmin', 'admin_open', $$select public.suite_project_admin_open(pg_temp.id('PB'))::text$$, 'true');
select pg_temp.t('orgadmin', 'reads shared B well after open', $$select count(*)::text from public.geo_wells where id = pg_temp.id('WB')$$, '1');
select pg_temp.t('orgadmin', 'reads B tops after open', $$select count(*)::text from public.geo_wells_tops where well_id = pg_temp.id('WB')$$, '1');
select pg_temp.t('orgadmin', 'private B well stays private', $$select count(*)::text from public.geo_wells where id = pg_temp.id('WBP')$$, '0');
select pg_temp.t('orgadmin', 'open is logged', $$select count(*)::text from public.suite_project_access_log where project_id = pg_temp.id('PB') and event = 'admin_open' and actor_id = auth.uid()$$, '1');
select pg_temp.t('consultant', 'project owner sees the admin open', $$select count(*)::text from public.suite_project_access_log where project_id = pg_temp.id('PB') and event = 'admin_open'$$, '1');
select pg_temp.t('orgadmin', 'cannot delete the log', $$delete from public.suite_project_access_log where project_id = pg_temp.id('PB')$$, 'ERR 42501');

-- another organisation
select pg_temp.t('orgB', 'no org A projects', $$select count(*)::text from public.suite_projects where organization_id = pg_temp.id('ORGA')$$, '0');
select pg_temp.t('orgB', 'no org A clients', $$select count(*)::text from public.suite_clients where organization_id = pg_temp.id('ORGA')$$, '0');
select pg_temp.t('orgB', 'no probe wells', $$select count(*)::text from public.geo_wells where name like 'PROBE-%'$$, '0');
select pg_temp.t('orgB', 'cannot write into A', $$insert into public.geo_wells (user_id, name, surface_x, surface_y, suite_project_id) values (auth.uid(), 'PROBE-B-X', 0, 0, pg_temp.id('PA'))$$, 'ERR 42501');
select pg_temp.t('orgB', 'cannot join A', $$insert into public.suite_project_members (project_id, user_id, role) values (pg_temp.id('PA'), auth.uid(), 'owner')$$, 'ERR 42501');
select pg_temp.t('orgB', 'cannot open A as admin', $$select public.suite_project_admin_open(pg_temp.id('PA'))::text$$, 'ERR 42501');
select pg_temp.t('orgB', 'cannot make A current', $$insert into public.suite_user_state (user_id, current_project_id) values (auth.uid(), pg_temp.id('PA'))$$, 'ERR 42501');
select pg_temp.t('orgB', 'cannot rename A', $$with x as (update public.suite_projects set name = 'x' where id = pg_temp.id('PA') returning 1) select count(*)::text from x$$, '0');
select pg_temp.t('orgB', 'cannot create a client in org A', $$insert into public.suite_clients (organization_id, owner_user_id, name) values (pg_temp.id('ORGA'), auth.uid(), 'x')$$, 'ERR 42501');
select pg_temp.t('orgB', 'cannot create a project in org A', $$insert into public.suite_projects (organization_id, owner_user_id, name) values (pg_temp.id('ORGA'), auth.uid(), 'x')$$, 'ERR 42501');
select pg_temp.t('orgB', 'cannot hang a project on client Alpha', $$insert into public.suite_projects (organization_id, owner_user_id, client_id, name) values (pg_temp.id('ORGB'), auth.uid(), pg_temp.id('CA'), 'x')$$, 'ERR 42501');
select pg_temp.t('orgB', 'cannot read A log', $$select count(*)::text from public.suite_project_access_log where organization_id = pg_temp.id('ORGA')$$, '0');
select pg_temp.t('orgB', 'cannot move into A', $$select public.suite_move_to_project('geo_wells', array[]::uuid[], pg_temp.id('PA'))::text$$, 'ERR 42501');
select pg_temp.t('orgB', 'cannot move rows into A', $$select public.suite_move_to_project('geo_wells', array[pg_temp.id('WA')], pg_temp.id('PA'))::text$$, 'ERR 42501');

-- no organisation: personal default
select pg_temp.t('noorg', 'bootstrap personal default', $$select ((public.suite_project_bootstrap() ->> 'organization_id') is null)::text$$, 'true');
select pg_temp.t('noorg', 'all own wells in the personal default',
  $$select (count(*) filter (where w.suite_project_id = p.id) = count(*))::text from public.geo_wells w, public.suite_projects p where w.user_id = auth.uid() and p.is_default and p.organization_id is null and p.owner_user_id = auth.uid()$$, 'true');
select pg_temp.t('noorg', 'no org A projects', $$select count(*)::text from public.suite_projects where organization_id = pg_temp.id('ORGA')$$, '0');

-- demo: the Default project only, same data
select pg_temp.t('demo', 'one project (Default)', $$select string_agg(name || ':' || is_default, ',') from public.suite_projects$$, 'Default:true');
select pg_temp.t('demo', 'no clients', $$select count(*)::text from public.suite_clients$$, '0');
select pg_temp.t('demo', 'all visible wells in Default', $$select (count(*) filter (where suite_project_id = (select id from public.suite_projects where is_default)) = count(*))::text from public.geo_wells$$, 'true');

-- last: the consultant moves well A into project B
select pg_temp.t('consultant', 'move A well into B', $$select public.suite_move_to_project('geo_wells', array[pg_temp.id('WA')], pg_temp.id('PB'))::text$$, '1');
select pg_temp.t('consultant', 'move logged both sides', $$select count(*)::text from public.suite_project_access_log where event in ('rows_moved_in','rows_moved_out') and project_id in (pg_temp.id('PA'), pg_temp.id('PB'))$$, '2');
select pg_temp.t('member', 'moved well now hidden from member', $$select count(*)::text from public.geo_wells where id = pg_temp.id('WA')$$, '0');
select pg_temp.t('consultant', 'tops follow their well', $$select count(*)::text from public.geo_wells_tops t join public.geo_wells w on w.id = t.well_id where w.suite_project_id = pg_temp.id('PB')$$, '1');
