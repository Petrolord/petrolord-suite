-- Suite Projects P4 probes (after 20261015130000, rolled back).
insert into _ids values ('ORGA', '1ace6b81-f133-4d42-a0fe-56960e8d71ed');
insert into _ids select 'DEFA', id::text from public.suite_projects where organization_id = '1ace6b81-f133-4d42-a0fe-56960e8d71ed' and is_default;
create function pg_temp.id(k text) returns uuid language sql stable as $$ select v::uuid from _ids where _ids.k = id.k $$;
grant execute on all functions in schema pg_temp to public;
insert into _ids values ('PB', pg_temp.run('consultant', $$insert into public.suite_projects (organization_id, owner_user_id, name, visibility)
  values (pg_temp.id('ORGA'), auth.uid(), 'Probe P4 members only', 'members') returning id::text$$));
-- a saved app project lands in the current project; with none, the default
select pg_temp.t('member', 'saved project with no current project lands in the default',
  $$insert into public.saved_well_test_projects (user_id, project_name, inputs_data) values (auth.uid(), 'Probe WT', '{}') returning (suite_project_id = pg_temp.id('DEFA'))::text$$, 'true');
select pg_temp.t('consultant', 'switch to the members-only project',
  $$insert into public.suite_user_state (user_id, current_project_id) values (auth.uid(), pg_temp.id('PB')) on conflict (user_id) do update set current_project_id = excluded.current_project_id$$, 'OK');
select pg_temp.t('consultant', 'an org-shared ReservoirCalc Pro project lands in the current project',
  $$insert into public.saved_quickvol_projects (user_id, project_name, inputs_data, organization_id, visibility) values (auth.uid(), 'PROBE-P4-RCP', '{}', pg_temp.id('ORGA'), 'organization') returning (suite_project_id = pg_temp.id('PB'))::text$$, 'true');
select pg_temp.t('member', 'a colleague outside the members-only project does not see it',
  $$select count(*)::text from public.saved_quickvol_projects where project_name = 'PROBE-P4-RCP'$$, '0');
select pg_temp.t('consultant', 'move it to the open default project',
  $$select public.suite_move_to_project('saved_quickvol_projects', array[(select id from public.saved_quickvol_projects where project_name = 'PROBE-P4-RCP')], pg_temp.id('DEFA'))::text$$, '1');
select pg_temp.t('member', 'now the colleague sees it (shared with the organisation, open project)',
  $$select count(*)::text from public.saved_quickvol_projects where project_name = 'PROBE-P4-RCP'$$, '1');
select pg_temp.t('orgB', 'another organisation never sees it',
  $$select count(*)::text from public.saved_quickvol_projects where project_name = 'PROBE-P4-RCP'$$, '0');
select pg_temp.t('member', 'cannot write an app project into the members-only project',
  $$insert into public.saved_well_test_projects (user_id, project_name, inputs_data, suite_project_id) values (auth.uid(), 'Probe WT2', '{}', pg_temp.id('PB'))$$, 'ERR 42501');
select pg_temp.t('member', 'a Well Design site lands in the default',
  $$insert into public.wp_sites (user_id, name) values (auth.uid(), 'Probe site') returning (suite_project_id = pg_temp.id('DEFA'))::text$$, 'true');
select pg_temp.t('member', 'an economics case lands in the default',
  $$insert into public.epe_cases (user_id, case_name) values (auth.uid(), 'Probe case') returning (suite_project_id = pg_temp.id('DEFA'))::text$$, 'true');
