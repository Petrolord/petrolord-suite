-- QI worker tables in projects (20261015160000), probes. Inside the rolled-back dry run only.
insert into _ids values ('ORGA', '1ace6b81-f133-4d42-a0fe-56960e8d71ed') on conflict do nothing;
insert into _ids select 'DEFA', id::text from public.suite_projects where organization_id = '1ace6b81-f133-4d42-a0fe-56960e8d71ed' and is_default on conflict do nothing;
create function pg_temp.id(k text) returns uuid language sql stable as $$ select v::uuid from _ids where _ids.k = id.k $$;
grant execute on all functions in schema pg_temp to public;
insert into _ids values ('PB', pg_temp.run('consultant', $$insert into public.suite_projects (organization_id, owner_user_id, name, visibility)
  values (pg_temp.id('ORGA'), auth.uid(), 'Probe QI members only', 'members') returning id::text$$));
insert into _ids values ('J1', pg_temp.run('consultant', $$select public.qi_enqueue_job('noop', '{"probe":1}'::jsonb)::text$$));
select pg_temp.t('consultant', 'a job with no current project lands in the default',
  $$select (suite_project_id = pg_temp.id('DEFA'))::text from public.qi_jobs where id = pg_temp.id('J1')$$, 'true');
select pg_temp.t('consultant', 'switch to the members-only project',
  $$insert into public.suite_user_state (user_id, current_project_id) values (auth.uid(), pg_temp.id('PB')) on conflict (user_id) do update set current_project_id = excluded.current_project_id$$, 'OK');
insert into _ids values ('J2', pg_temp.run('consultant', $$select public.qi_enqueue_job('noop', '{"probe":2}'::jsonb)::text$$));
select pg_temp.t('consultant', 'a job enqueued now lands in the current project',
  $$select (suite_project_id = pg_temp.id('PB'))::text from public.qi_jobs where id = pg_temp.id('J2')$$, 'true');
-- the edge function and the worker write qi_datasets with the service role: the stamp reads the row's user
insert into _ids values ('CONS', '1d5bc4bf-5bf3-4349-8319-b20e9ffb1c39');
with x as (insert into public.qi_datasets (user_id, name, original_filename, bucket, object_key, bytes, part_size, part_count)
  values (pg_temp.id('CONS'), 'Probe QI file', 'probe.sgy', 'seismic-raw', 'probe/' || gen_random_uuid()::text, 1024, 1024, 1) returning id)
insert into _ids select 'DS', id::text from x;
select pg_temp.t('consultant', 'a service-role file of the consultant lands in their current project',
  $$select (suite_project_id = pg_temp.id('PB'))::text from public.qi_datasets where id = pg_temp.id('DS')$$, 'true');
select pg_temp.t('consultant', 'the consultant reads their own file',
  $$select count(*)::text from public.qi_datasets where id = pg_temp.id('DS')$$, '1');
select pg_temp.t('member', 'a colleague does not read the consultant''s file (own rows only, as before)',
  $$select count(*)::text from public.qi_datasets where id = pg_temp.id('DS')$$, '0');
select pg_temp.t('member', 'a colleague does not read the consultant''s jobs (own rows only, as before)',
  $$select count(*)::text from public.qi_jobs where params ->> 'probe' is not null$$, '0');
select pg_temp.t('orgB', 'another organisation reads none of them',
  $$select count(*)::text from public.qi_jobs where params ->> 'probe' is not null$$, '0');
select pg_temp.t('anon', 'anon reads no jobs',
  $$select count(*)::text from public.qi_jobs$$, 'ERR 42501');
select pg_temp.t('member', 'clients still cannot insert jobs directly',
  $$insert into public.qi_jobs (user_id, kind) values (auth.uid(), 'noop')$$, 'ERR 42501');
select pg_temp.t('member', 'clients still cannot insert files directly',
  $$insert into public.qi_datasets (user_id, name, original_filename, bucket, object_key, bytes, part_size, part_count) values (auth.uid(), 'x', 'x', 'seismic-raw', 'x', 1, 1, 1)$$, 'ERR 42501');
select pg_temp.t('consultant', 'cancel still works on the consultant''s own queued job',
  $$select public.qi_cancel_job(pg_temp.id('J2'))$$, 'cancelled');
