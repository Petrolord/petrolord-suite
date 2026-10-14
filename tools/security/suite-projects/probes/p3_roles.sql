-- Suite Projects P3: roles and membership, per role (live, rolled back).
insert into _ids values ('ORGA', '1ace6b81-f133-4d42-a0fe-56960e8d71ed');
create function pg_temp.id(k text) returns uuid language sql stable as $$ select v::uuid from _ids where _ids.k = id.k $$;
grant execute on all functions in schema pg_temp to public;
insert into _ids values ('PB', pg_temp.run('consultant', $$insert into public.suite_projects (organization_id, owner_user_id, name, visibility)
  values (pg_temp.id('ORGA'), auth.uid(), 'Probe P3 members only', 'members') returning id::text$$));
insert into _ids values ('WB', pg_temp.run('consultant', $$insert into public.geo_wells (user_id, name, surface_x, surface_y, organization_id, suite_project_id)
  values (auth.uid(), 'PROBE-P3-B', 0, 0, pg_temp.id('ORGA'), pg_temp.id('PB')) returning id::text$$));

-- owner adds a viewer
select pg_temp.t('consultant', 'owner adds a colleague as viewer',
  $$insert into public.suite_project_members (project_id, user_id, role) values (pg_temp.id('PB'), '1eb3c6ed-88b0-43a8-bd8b-d7f36aede040', 'viewer')$$, 'OK');
select pg_temp.t('projmember', 'viewer reads the shared well', $$select count(*)::text from public.geo_wells where id = pg_temp.id('WB')$$, '1');
select pg_temp.t('projmember', 'viewer cannot add data', $$insert into public.geo_wells (user_id, name, surface_x, surface_y, suite_project_id) values (auth.uid(), 'PROBE-P3-V', 0, 0, pg_temp.id('PB'))$$, 'ERR 42501');
select pg_temp.t('projmember', 'viewer cannot add members', $$insert into public.suite_project_members (project_id, user_id, role) values (pg_temp.id('PB'), '02dbca6c-7816-4b74-972c-be4fbd6e2753', 'viewer')$$, 'ERR 42501');
select pg_temp.t('projmember', 'viewer cannot promote self',
  $$with x as (update public.suite_project_members set role = 'owner' where project_id = pg_temp.id('PB') and user_id = auth.uid() returning 1) select count(*)::text from x$$, '0');
select pg_temp.t('projmember', 'viewer cannot change settings',
  $$with x as (update public.suite_projects set settings = '{"timescale":"ICS 2023/09"}' where id = pg_temp.id('PB') returning 1) select count(*)::text from x$$, '0');

-- owner promotes to editor
select pg_temp.t('consultant', 'owner makes the viewer an editor',
  $$with x as (update public.suite_project_members set role = 'editor' where project_id = pg_temp.id('PB') and user_id = '1eb3c6ed-88b0-43a8-bd8b-d7f36aede040' returning 1) select count(*)::text from x$$, '1');
select pg_temp.t('projmember', 'editor adds data', $$insert into public.geo_wells (user_id, name, surface_x, surface_y, suite_project_id) values (auth.uid(), 'PROBE-P3-E', 0, 0, pg_temp.id('PB')) returning 'ok'$$, 'ok');
select pg_temp.t('projmember', 'editor still cannot add members', $$insert into public.suite_project_members (project_id, user_id, role) values (pg_temp.id('PB'), '02dbca6c-7816-4b74-972c-be4fbd6e2753', 'viewer')$$, 'ERR 42501');

-- other organisation and non-members
select pg_temp.t('consultant', 'a user from another organisation cannot be added',
  $$insert into public.suite_project_members (project_id, user_id, role) values (pg_temp.id('PB'), '19db244f-eb02-461a-b6f9-813d65c8e259', 'viewer')$$, 'ERR SP002');
select pg_temp.t('member', 'non-member cannot read the members list', $$select count(*)::text from public.suite_project_members where project_id = pg_temp.id('PB')$$, '0');
select pg_temp.t('member', 'non-member cannot add self', $$insert into public.suite_project_members (project_id, user_id, role) values (pg_temp.id('PB'), auth.uid(), 'viewer')$$, 'ERR 42501');

-- org admin manages membership; it is logged
select pg_temp.t('orgadmin', 'org admin adds a member',
  $$insert into public.suite_project_members (project_id, user_id, role) values (pg_temp.id('PB'), '02dbca6c-7816-4b74-972c-be4fbd6e2753', 'viewer')$$, 'OK');
select pg_temp.t('member', 'the added member now reads the shared well', $$select count(*)::text from public.geo_wells where id = pg_temp.id('WB')$$, '1');
select pg_temp.t('consultant', 'owner sees who added whom',
  $$select count(*)::text from public.suite_project_access_log where project_id = pg_temp.id('PB') and event = 'member_added' and actor_id = '0b403d59-ea61-4809-9429-a692bca9214b'$$, '1');

-- removal ends access
select pg_temp.t('consultant', 'owner removes the editor',
  $$with x as (delete from public.suite_project_members where project_id = pg_temp.id('PB') and user_id = '1eb3c6ed-88b0-43a8-bd8b-d7f36aede040' returning 1) select count(*)::text from x$$, '1');
select pg_temp.t('projmember', 'removed member no longer reads the shared well', $$select count(*)::text from public.geo_wells where id = pg_temp.id('WB')$$, '0');
select pg_temp.t('projmember', 'removed member still sees their own row', $$select count(*)::text from public.geo_wells where name = 'PROBE-P3-E' and user_id = auth.uid()$$, '1');
select pg_temp.t('member', 'a member may leave', $$with x as (delete from public.suite_project_members where project_id = pg_temp.id('PB') and user_id = auth.uid() returning 1) select count(*)::text from x$$, '1');
select pg_temp.t('consultant', 'the log records adds, role change and removals',
  $$select string_agg(event, ',' order by event) from (select distinct event from public.suite_project_access_log where project_id = pg_temp.id('PB') and event like 'member%') e$$, 'member_added,member_removed,member_role_changed');
