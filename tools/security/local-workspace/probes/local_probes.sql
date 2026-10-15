-- Local workspace L1 (20261016100000), probes. Inside the rolled-back dry run only.
-- Personas from tools/security/suite-projects/probes/harness_head.sql.
insert into _ids values ('ORGA', '1ace6b81-f133-4d42-a0fe-56960e8d71ed') on conflict do nothing;
insert into _ids values ('CONS', '1d5bc4bf-5bf3-4349-8319-b20e9ffb1c39') on conflict do nothing;
insert into _ids values ('PMEM', '1eb3c6ed-88b0-43a8-bd8b-d7f36aede040') on conflict do nothing;
create function pg_temp.id(k text) returns uuid language sql stable as $$ select v::uuid from _ids where _ids.k = id.k $$;
grant execute on all functions in schema pg_temp to public;

-- fixtures: a members-only client project with projmember in it, the consultant's device, a local volume and its replica
insert into _ids values ('PB', pg_temp.run('consultant', $$insert into public.suite_projects (organization_id, owner_user_id, name, visibility)
  values (pg_temp.id('ORGA'), auth.uid(), 'Probe local workspace members only', 'members') returning id::text$$));
select pg_temp.t('consultant', 'fixture: members-only project created', $$select (pg_temp.id('PB') is not null)::text$$, 'true');
select pg_temp.t('consultant', 'fixture: projmember added to the project',
  $$insert into public.suite_project_members (project_id, user_id, role) values (pg_temp.id('PB'), pg_temp.id('PMEM'), 'editor')$$, 'OK');
insert into _ids values ('D1', pg_temp.run('consultant', $$insert into public.seismic_devices (label, kind) values ('Ayo''s PC', 'browser_folder') returning id::text$$));
select pg_temp.t('consultant', 'registers a device (owner defaults to the caller)',
  $$select (user_id = auth.uid())::text from public.seismic_devices where id = pg_temp.id('D1')$$, 'true');
insert into _ids values ('V1', pg_temp.run('consultant', $$insert into public.seismic_volumes (user_id, name, storage_path, status, organization_id, suite_project_id, storage_location, device_id, content_id, brick_root)
  values (auth.uid(), 'Probe local stack', auth.uid()::text || '/probe-local', 'ready', pg_temp.id('ORGA'), pg_temp.id('PB'), 'local', pg_temp.id('D1'), 'cid-probe', 'root-probe') returning id::text$$));
select pg_temp.t('consultant', 'registers a local volume in the members-only project',
  $$select storage_location || '/' || (suite_project_id = pg_temp.id('PB'))::text from public.seismic_volumes where id = pg_temp.id('V1')$$, 'local/true');
select pg_temp.t('consultant', 'records a ready replica on the device',
  $$insert into public.seismic_volume_replicas (volume_id, device_id, device_label, state, bytes) values (pg_temp.id('V1'), pg_temp.id('D1'), 'Ayo''s PC', 'ready', 85899345920)$$, 'OK');
select pg_temp.t('consultant', 'an existing cloud volume still reads cloud (default)',
  $$select coalesce(min(storage_location), 'cloud') from public.seismic_volumes where user_id = auth.uid() and id <> pg_temp.id('V1')$$, 'cloud');
select pg_temp.t('consultant', 'a bad location is refused',
  $$update public.seismic_volumes set storage_location = 'moon' where id = pg_temp.id('V1')$$, 'ERR 23514');

-- who sees the local volume and where it lives
select pg_temp.t('projmember', 'project member sees the local volume', $$select storage_location from public.seismic_volumes where id = pg_temp.id('V1')$$, 'local');
select pg_temp.t('projmember', 'project member sees the replica label', $$select device_label || '/' || state from public.seismic_volume_replicas where volume_id = pg_temp.id('V1')$$, 'Ayo''s PC/ready');
select pg_temp.t('member', 'org member outside the project does not see the volume', $$select count(*)::text from public.seismic_volumes where id = pg_temp.id('V1')$$, '0');
select pg_temp.t('member', 'org member outside the project does not see the replica', $$select count(*)::text from public.seismic_volume_replicas where volume_id = pg_temp.id('V1')$$, '0');
select pg_temp.t('orgadmin', 'org admin without a logged open does not see the replica', $$select count(*)::text from public.seismic_volume_replicas where volume_id = pg_temp.id('V1')$$, '0');
select pg_temp.t('orgB', 'another organisation sees no volume', $$select count(*)::text from public.seismic_volumes where id = pg_temp.id('V1')$$, '0');
select pg_temp.t('orgB', 'another organisation sees no replica', $$select count(*)::text from public.seismic_volume_replicas$$, '0');
select pg_temp.t('noorg', 'a user with no organisation sees no replica', $$select count(*)::text from public.seismic_volume_replicas$$, '0');
select pg_temp.t('demo', 'the demo account sees no replica', $$select count(*)::text from public.seismic_volume_replicas$$, '0');
select pg_temp.t('anon', 'anon cannot read replicas', $$select count(*)::text from public.seismic_volume_replicas$$, 'ERR 42501');
select pg_temp.t('anon', 'anon cannot read devices', $$select count(*)::text from public.seismic_devices$$, 'ERR 42501');
select pg_temp.t('anon', 'anon cannot read copy requests', $$select count(*)::text from public.seismic_copy_requests$$, 'ERR 42501');

-- devices are private
select pg_temp.t('projmember', 'nobody reads another user''s device', $$select count(*)::text from public.seismic_devices where id = pg_temp.id('D1')$$, '0');
select pg_temp.t('member', 'nobody renames another user''s device', $$with x as (update public.seismic_devices set label = 'hijack' where id = pg_temp.id('D1') returning 1) select count(*)::text from x$$, '0');
select pg_temp.t('member', 'nobody deletes another user''s device', $$with x as (delete from public.seismic_devices where id = pg_temp.id('D1') returning 1) select count(*)::text from x$$, '0');
select pg_temp.t('member', 'a device cannot be registered for someone else', $$insert into public.seismic_devices (user_id, label) values (pg_temp.id('CONS'), 'fake')$$, 'ERR 42501');
select pg_temp.t('consultant', 'a blank device label is refused', $$insert into public.seismic_devices (label) values ('   ')$$, 'ERR 23514');

-- replica writes
insert into _ids values ('D2', pg_temp.run('member', $$insert into public.seismic_devices (label) values ('Wole''s laptop') returning id::text$$));
insert into _ids values ('D3', pg_temp.run('projmember', $$insert into public.seismic_devices (label, kind) values ('Demi''s PC', 'browser_opfs') returning id::text$$));
select pg_temp.t('member', 'cannot add a replica on the consultant''s device', $$insert into public.seismic_volume_replicas (volume_id, device_id, device_label) values (pg_temp.id('V1'), pg_temp.id('D1'), 'x')$$, 'ERR 42501');
select pg_temp.t('member', 'cannot add a replica of a volume they cannot read, even on their own device', $$insert into public.seismic_volume_replicas (volume_id, device_id, device_label) values (pg_temp.id('V1'), pg_temp.id('D2'), 'x')$$, 'ERR 42501');
select pg_temp.t('projmember', 'cannot add a replica on a device that is not theirs', $$insert into public.seismic_volume_replicas (volume_id, device_id, device_label) values (pg_temp.id('V1'), pg_temp.id('D1'), 'x')$$, 'ERR 42501');
select pg_temp.t('projmember', 'cannot write a replica in the consultant''s name', $$insert into public.seismic_volume_replicas (volume_id, device_id, user_id, device_label) values (pg_temp.id('V1'), pg_temp.id('D3'), pg_temp.id('CONS'), 'x')$$, 'ERR 42501');
select pg_temp.t('projmember', 'cannot change the consultant''s replica', $$with x as (update public.seismic_volume_replicas set state = 'deleted' where volume_id = pg_temp.id('V1') and device_id = pg_temp.id('D1') returning 1) select count(*)::text from x$$, '0');
select pg_temp.t('projmember', 'cannot delete the consultant''s replica', $$with x as (delete from public.seismic_volume_replicas where volume_id = pg_temp.id('V1') and device_id = pg_temp.id('D1') returning 1) select count(*)::text from x$$, '0');
select pg_temp.t('projmember', 'may record their own copy of a volume they read (L3 attach)', $$insert into public.seismic_volume_replicas (volume_id, device_id, device_label, state) values (pg_temp.id('V1'), pg_temp.id('D3'), 'Demi''s PC', 'writing')$$, 'OK');
select pg_temp.t('consultant', 'a revoked device takes no new replica writes',
  $$with x as (update public.seismic_devices set revoked_at = now() where id = pg_temp.id('D1') returning 1),
        y as (select 1 from x) select count(*)::text from y$$, '1');
select pg_temp.t('consultant', 'revoked: the replica cannot be updated', $$update public.seismic_volume_replicas set state = 'missing' where volume_id = pg_temp.id('V1') and device_id = pg_temp.id('D1')$$, 'ERR 42501');
select pg_temp.t('consultant', 'un-revoke for the remaining probes', $$with x as (update public.seismic_devices set revoked_at = null where id = pg_temp.id('D1') returning 1) select count(*)::text from x$$, '1');

-- copy requests
insert into _ids values ('CR', pg_temp.run('projmember', $$insert into public.seismic_copy_requests (volume_id, owner_id, what, note) values (pg_temp.id('V1'), pg_temp.id('CONS'), 'display', 'probe') returning id::text$$));
select pg_temp.t('projmember', 'can request a cloud copy from the owner', $$select status from public.seismic_copy_requests where id = pg_temp.id('CR')$$, 'open');
select pg_temp.t('projmember', 'cannot name themselves as the owner', $$insert into public.seismic_copy_requests (volume_id, owner_id) values (pg_temp.id('V1'), auth.uid())$$, 'ERR 42501');
select pg_temp.t('projmember', 'cannot point the request at a different owner', $$with x as (update public.seismic_copy_requests set owner_id = auth.uid() where id = pg_temp.id('CR') returning 1) select count(*)::text from x$$, 'ERR 42501');
select pg_temp.t('member', 'cannot request a copy of a volume they cannot read', $$insert into public.seismic_copy_requests (volume_id, owner_id) values (pg_temp.id('V1'), pg_temp.id('CONS'))$$, 'ERR 42501');
select pg_temp.t('member', 'does not see the request', $$select count(*)::text from public.seismic_copy_requests where id = pg_temp.id('CR')$$, '0');
select pg_temp.t('consultant', 'the owner sees the request', $$select count(*)::text from public.seismic_copy_requests where id = pg_temp.id('CR')$$, '1');
select pg_temp.t('consultant', 'the owner marks it fulfilled', $$with x as (update public.seismic_copy_requests set status = 'fulfilled' where id = pg_temp.id('CR') returning status) select string_agg(status, ',') from x$$, 'fulfilled');
select pg_temp.t('projmember', 'the requester cannot delete it', $$delete from public.seismic_copy_requests where id = pg_temp.id('CR')$$, 'ERR 42501');

-- the server queue refuses local volumes and ignores browser jobs
select pg_temp.t('consultant', 'a server job naming the local volume is refused',
  $$select public.qi_enqueue_job('attribute_volume', jsonb_build_object('parent_volume_id', pg_temp.id('V1')::text, 'attribute', jsonb_build_object('name', 'envelope')))::text$$, 'ERR P0001');
select pg_temp.t('consultant', 'the refusal also finds an id nested in a list',
  $$select public.qi_enqueue_job('avo_volumes', jsonb_build_object('stacks', jsonb_build_array(jsonb_build_object('volume_id', upper(pg_temp.id('V1')::text)))))::text$$, 'ERR P0001');
select pg_temp.t('consultant', 'a server noop is still accepted', $$select (public.qi_enqueue_job('noop', '{"probe":"lws"}'::jsonb) is not null)::text$$, 'true');
insert into _ids values ('L1', pg_temp.run('consultant', $$select public.qi_start_local_job('attribute_volume', jsonb_build_object('parent_volume_id', pg_temp.id('V1')::text), '{}'::jsonb, 'browser', pg_temp.id('D1'))::text$$));
select pg_temp.t('consultant', 'a browser job is recorded as running on the device',
  $$select status || '/' || executor || '/' || (device_id = pg_temp.id('D1'))::text || '/' || claimed_by from public.qi_jobs where id = pg_temp.id('L1')$$, 'running/browser/true/device:%');
select pg_temp.t('consultant', 'heartbeat', $$select (public.qi_update_local_job(pg_temp.id('L1'), 0.5, 'Computing')) ->> 'found'$$, 'true');
select pg_temp.t('consultant', 'heartbeat recorded the progress', $$select progress::text || '/' || progress_message from public.qi_jobs where id = pg_temp.id('L1')$$, '0.5/Computing');
select pg_temp.t('consultant', 'cancel flags the running browser job', $$select public.qi_cancel_job(pg_temp.id('L1'))$$, 'cancel_requested');
select pg_temp.t('consultant', 'the next heartbeat reports the cancel', $$select (public.qi_update_local_job(pg_temp.id('L1'), 0.6)) ->> 'cancel_requested'$$, 'true');
select pg_temp.t('member', 'another user cannot update the job', $$select (public.qi_update_local_job(pg_temp.id('L1'), 0.9, null, 'failed')) ->> 'found'$$, 'false');
select pg_temp.t('member', 'and learns nothing about it', $$select coalesce((public.qi_update_local_job(pg_temp.id('L1'))) ->> 'status', 'none')$$, 'none');
select pg_temp.t('consultant', 'terminal write', $$select (public.qi_update_local_job(pg_temp.id('L1'), null, null, 'succeeded', '{"bricks": 12}'::jsonb, null, null, 'suite-probe')) ->> 'status'$$, 'succeeded');
select pg_temp.t('consultant', 'terminal row', $$select status || '/' || progress::text || '/' || (result_refs ->> 'bricks') || '/' || engine_commit || '/' || (finished_at is not null)::text from public.qi_jobs where id = pg_temp.id('L1')$$, 'succeeded/1/12/suite-probe/true');
select pg_temp.t('consultant', 'a finished job takes no more writes', $$select (public.qi_update_local_job(pg_temp.id('L1'), 0.1)) ->> 'found'$$, 'false');
select pg_temp.t('consultant', 'an unknown terminal status is refused', $$select (public.qi_update_local_job(pg_temp.id('L1'), null, null, 'queued'))::text$$, 'ERR 22023');
select pg_temp.t('consultant', 'the server executor cannot be recorded from a computer', $$select public.qi_start_local_job('noop', '{}'::jsonb, '{}'::jsonb, 'server')::text$$, 'ERR 22023');
select pg_temp.t('consultant', 'another user''s device cannot be named', $$select public.qi_start_local_job('noop', '{}'::jsonb, '{}'::jsonb, 'browser', pg_temp.id('D2'))::text$$, 'ERR 42501');
select pg_temp.t('anon', 'anon cannot record a job', $$select public.qi_start_local_job('noop')::text$$, 'ERR 42501');
select pg_temp.t('member', 'the consultant''s browser job is not visible to others', $$select count(*)::text from public.qi_jobs where id = pg_temp.id('L1')$$, '0');
select pg_temp.t('consultant', 'a browser job lands in the current project (stamp)', $$select (suite_project_id is not null)::text from public.qi_jobs where id = pg_temp.id('L1')$$, 'true');

-- the in-flight cap counts server jobs only: five running browser jobs, then two server enqueues
select pg_temp.t('consultant', 'five running browser jobs', $$select count(public.qi_start_local_job('noop', jsonb_build_object('n', g)))::text from generate_series(1, 5) g$$, '5');
select pg_temp.t('consultant', 'a server enqueue is not blocked by browser jobs', $$select (public.qi_enqueue_job('noop', '{"probe":"lws2"}'::jsonb) is not null)::text$$, 'true');

-- the worker side (as the transaction owner, which holds the service-role grants)
insert into public.qi_jobs (id, user_id, kind, status, executor) values
  ('aaaaaaaa-0000-4000-8000-00000000b001', pg_temp.id('CONS'), 'lws_probe_kind', 'queued', 'browser');
insert into _p select 'probe', 'worker', 'claim never takes a browser row', case when n = 0 then 'PASS ' else 'FAIL ' end || n || '  (expect 0)'
  from (select count(*) n from public.qi_claim_job('lws-probe', array['lws_probe_kind'])) c;
insert into public.qi_jobs (id, user_id, kind, status) values
  ('aaaaaaaa-0000-4000-8000-00000000b002', pg_temp.id('CONS'), 'lws_probe_kind', 'queued');
insert into _p select 'probe', 'worker', 'claim still takes a server row (positive control)', case when n = 'aaaaaaaa-0000-4000-8000-00000000b002' then 'PASS ' else 'FAIL ' end || coalesce(n, 'none')
  from (select (select id::text from public.qi_claim_job('lws-probe', array['lws_probe_kind'])) n) c;
insert into _ids values ('L2', pg_temp.run('consultant', $$select public.qi_start_local_job('noop', '{"stale":1}'::jsonb)::text$$));
insert into _ids values ('L3', pg_temp.run('consultant', $$select public.qi_start_local_job('noop', '{"fresh":1}'::jsonb)::text$$));
update public.qi_jobs set heartbeat_at = now() - interval '7 hours' where id = pg_temp.id('L2');
update public.qi_jobs set heartbeat_at = now() - interval '7 hours', claimed_at = now() - interval '7 hours'
 where id = 'aaaaaaaa-0000-4000-8000-00000000b002';
select public.qi_sweep_stale_jobs(120, 3);
insert into _p select 'probe', 'worker', 'sweep fails a stale browser job as browser_closed', case when r = 'failed/browser_closed' then 'PASS ' else 'FAIL ' end || coalesce(r, 'none')
  from (select status || '/' || failure_stage r from public.qi_jobs where id = pg_temp.id('L2')) c;
insert into _p select 'probe', 'worker', 'sweep leaves a fresh browser job running', case when r = 'running' then 'PASS ' else 'FAIL ' end || coalesce(r, 'none')
  from (select status r from public.qi_jobs where id = pg_temp.id('L3')) c;
insert into _p select 'probe', 'worker', 'sweep still requeues a stale server job', case when r = 'queued' then 'PASS ' else 'FAIL ' end || coalesce(r, 'none')
  from (select status r from public.qi_jobs where id = 'aaaaaaaa-0000-4000-8000-00000000b002') c;
insert into _p select 'probe', 'worker', 'no browser row was ever requeued', case when n = 0 then 'PASS ' else 'FAIL ' end || n
  from (select count(*) n from public.qi_jobs where executor <> 'server' and status = 'queued' and id <> 'aaaaaaaa-0000-4000-8000-00000000b001') c;
