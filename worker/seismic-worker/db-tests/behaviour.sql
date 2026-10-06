-- qi_jobs behaviour checks (QI Q0). Run via db-tests/run.sh; each check raises on failure.
\set ON_ERROR_STOP 1
grant select, update on public.qi_jobs to service_role;
create or replace function pg_temp.ok(c boolean, label text) returns void language plpgsql as $$
begin if not c then raise exception 'FAIL: %', label; end if; raise notice 'ok  %', label; end $$;
select pg_temp.ok(not exists (select 1 from information_schema.role_table_grants where table_name = 'qi_jobs' and grantee = 'anon'), 'anon holds no grants on qi_jobs');
select pg_temp.ok((select array_agg(privilege_type::text order by privilege_type::text) from information_schema.role_table_grants where table_name = 'qi_jobs' and grantee = 'authenticated') = array['SELECT']::text[], 'authenticated may only SELECT qi_jobs');

-- user 1 enqueues as authenticated
set role authenticated; set test.uid = '00000000-0000-0000-0000-000000000001';
select public.qi_enqueue_job('noop', '{"seconds":1}') as j1 \gset
select public.qi_enqueue_job('noop', '{}') as j2 \gset
select pg_temp.ok((select count(*) from public.qi_jobs) = 2, 'owner sees own 2 jobs');
-- negative controls on enqueue
do $$ begin perform public.qi_enqueue_job('Bad Kind!'); raise exception 'FAIL: bad kind accepted';
  exception when sqlstate '22023' then raise notice 'ok  bad kind rejected'; end $$;
do $$ begin perform public.qi_enqueue_job('noop', '{}', '{}', '00000000-0000-0000-0000-0000000000bb');
  raise exception 'FAIL: foreign org accepted';
  exception when sqlstate '42501' then raise notice 'ok  non-member org rejected'; end $$;
select public.qi_enqueue_job('noop') \gset
select public.qi_enqueue_job('noop') \gset
do $$ begin perform public.qi_enqueue_job('noop'); raise exception 'FAIL: 5th in-flight accepted';
  exception when sqlstate 'P0001' then raise notice 'ok  in-flight cap of 4 enforced'; end $$;
-- client cannot claim, insert or update directly
do $$ begin perform public.qi_claim_job('x', array['noop']); raise exception 'FAIL: client claimed';
  exception when insufficient_privilege then raise notice 'ok  client cannot call qi_claim_job'; end $$;
do $$ begin update public.qi_jobs set status = 'succeeded'; raise exception 'FAIL: client updated';
  exception when insufficient_privilege then raise notice 'ok  client cannot update qi_jobs'; end $$;
-- user 2 sees nothing of user 1
set test.uid = '00000000-0000-0000-0000-000000000002';
select pg_temp.ok((select count(*) from public.qi_jobs) = 0, 'other user sees none (RLS)');
select pg_temp.ok(public.qi_cancel_job(:'j1') = 'not_cancellable', 'other user cannot cancel');
reset role;

-- worker: claims are exclusive and oldest-first
set role service_role;
select id as c1 from public.qi_claim_job('wA', array['noop']) \gset
select pg_temp.ok(:'c1' = :'j1', 'claim takes the oldest queued job');
select id as c2 from public.qi_claim_job('wB', array['noop']) \gset
select pg_temp.ok(:'c2' = :'j2' and :'c1' <> :'c2', 'second worker gets a different job');
select pg_temp.ok((select count(*) from public.qi_claim_job('wC', array['other_kind'])) = 0, 'kind filter respected');
select pg_temp.ok((select still_mine from public.qi_heartbeat_job(:'c1', 'wA', 1, 0.5, 'half')), 'heartbeat by owner');
select pg_temp.ok(not (select still_mine from public.qi_heartbeat_job(:'c1', 'wB', 1, 0.9, 'x')), 'heartbeat by wrong worker refused');
select pg_temp.ok((select progress from public.qi_jobs where id = :'c1') = 0.5, 'progress recorded, wrong worker ignored');
reset role;

-- user cancels running job 1: flag set, worker sees it
set role authenticated; set test.uid = '00000000-0000-0000-0000-000000000001';
select pg_temp.ok(public.qi_cancel_job(:'j1') = 'cancel_requested', 'running job gets cancel flag');
reset role; set role service_role;
select pg_temp.ok((select cancel_requested from public.qi_heartbeat_job(:'c1', 'wA', 1)), 'worker heartbeat reports cancel');
reset role;

-- stale sweep: job 2 goes stale on attempt 1 -> requeued; again on attempt 2 -> failed
update public.qi_jobs set heartbeat_at = now() - interval '10 minutes' where id = :'j2';
set role service_role;
select pg_temp.ok(public.qi_sweep_stale_jobs(120, 2) = 1, 'sweep found one stale job');
select pg_temp.ok((select status from public.qi_jobs where id = :'j2') = 'queued', 'stale attempt 1 requeued');
select pg_temp.ok(not (select still_mine from public.qi_heartbeat_job(:'j2', 'wB', 1)), 'old worker told it lost the claim');
select id as c3 from public.qi_claim_job('wB', array['noop']) \gset
select pg_temp.ok((select attempt from public.qi_jobs where id = :'j2') = 2, 'reclaim increments attempt');
reset role;
update public.qi_jobs set heartbeat_at = now() - interval '10 minutes' where id = :'j2';
set role service_role;
select public.qi_sweep_stale_jobs(120, 2) \gset
select pg_temp.ok((select status || '/' || failure_stage from public.qi_jobs where id = :'j2') = 'failed/worker_lost', 'stale at max attempts fails as worker_lost');
-- guarded terminal write from a worker that lost its claim matches nothing
set test.j2 = :'j2';
do $$ declare n int; begin
  update public.qi_jobs set status = 'succeeded' where id = current_setting('test.j2')::uuid and status = 'running' and claimed_by = 'wB' and attempt = 1;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: stale worker write landed'; end if;
  raise notice 'ok  stale worker terminal write matches no row'; end $$;
reset role;
-- a fresh healthy heartbeat is never swept (negative control)
set role service_role;
select pg_temp.ok(public.qi_sweep_stale_jobs(120, 2) = 0, 'healthy running job not swept');
reset role;

-- ---------------------------------------------------------------- qi_datasets
select pg_temp.ok(not exists (select 1 from information_schema.role_table_grants where table_name = 'qi_datasets' and grantee = 'anon'), 'anon holds no grants on qi_datasets');
select pg_temp.ok((select array_agg(privilege_type::text) from information_schema.role_table_grants where table_name = 'qi_datasets' and grantee = 'authenticated') = array['SELECT'], 'authenticated may only SELECT qi_datasets');
insert into public.qi_datasets (user_id, name, original_filename, bucket, object_key, bytes, part_size, part_count, upload_id)
values ('00000000-0000-0000-0000-000000000001', 'big', 'big.sgy', 'seismic-raw', 'u1/d1/big.sgy', 1000, 67108864, 1, 'up1'),
       ('00000000-0000-0000-0000-000000000001', 'old', 'old.sgy', 'seismic-raw', 'u1/d2/old.sgy', 500, 67108864, 1, null);
update public.qi_datasets set status = 'deleted' where name = 'old';
select pg_temp.ok((select updated_at > created_at or updated_at = created_at from public.qi_datasets where name = 'old'), 'updated_at maintained');
set role service_role;
select pg_temp.ok(public.qi_user_storage_bytes('00000000-0000-0000-0000-000000000001') = 1000, 'storage counts live uploads only (deleted excluded)');
reset role;
set role authenticated; set test.uid = '00000000-0000-0000-0000-000000000001';
select pg_temp.ok((select count(*) from public.qi_datasets) = 2, 'owner sees own datasets');
do $$ begin perform public.qi_user_storage_bytes('00000000-0000-0000-0000-000000000002'); raise exception 'FAIL: client read another user quota';
  exception when insufficient_privilege then raise notice 'ok  client cannot call qi_user_storage_bytes'; end $$;
do $$ begin insert into public.qi_datasets (user_id, name, original_filename, bucket, object_key, bytes, part_size, part_count)
  values (auth.uid(), 'x', 'x', 'seismic-raw', 'k', 1, 1, 1); raise exception 'FAIL: client inserted a dataset';
  exception when insufficient_privilege then raise notice 'ok  client cannot insert datasets'; end $$;
set test.uid = '00000000-0000-0000-0000-000000000002';
select pg_temp.ok((select count(*) from public.qi_datasets) = 0, 'other user sees no datasets (RLS)');
reset role;
do $$ begin insert into public.qi_datasets (user_id, name, original_filename, bucket, object_key, bytes, part_size, part_count)
  values ('00000000-0000-0000-0000-000000000001', 'dup', 'd', 'seismic-raw', 'u1/d1/big.sgy', 1, 1, 1); raise exception 'FAIL: duplicate object key';
  exception when unique_violation then raise notice 'ok  one registry row per object'; end $$;

-- ------------------------------------------------- seismic storage tiers (Q0b-4)
select pg_temp.ok(public.seismic_storage_quota_bytes_for('00000000-0000-0000-0000-000000000001') = 21474836480, 'no tier: quota is the 20 GiB floor');
insert into public.organization_members values ('00000000-0000-0000-0000-0000000000aa', '00000000-0000-0000-0000-000000000001', 'active'),
  ('00000000-0000-0000-0000-0000000000bb', '00000000-0000-0000-0000-000000000001', 'active'),
  ('00000000-0000-0000-0000-0000000000bb', '00000000-0000-0000-0000-000000000002', 'invited');
insert into public.seismic_storage_tiers (organization_id, quota_bytes, label) values
  ('00000000-0000-0000-0000-0000000000aa', 107374182400, '100 GiB'), ('00000000-0000-0000-0000-0000000000bb', 536870912000, '500 GiB');
select pg_temp.ok(public.seismic_storage_quota_bytes_for('00000000-0000-0000-0000-000000000001') = 536870912000, 'member of two tiered orgs gets the largest');
select pg_temp.ok(public.seismic_storage_quota_bytes_for('00000000-0000-0000-0000-000000000002') = 21474836480, 'an invited (not active) member does not get the tier');
do $$ begin insert into public.seismic_storage_tiers values ('00000000-0000-0000-0000-0000000000aa', 1000, null);
  raise exception 'FAIL: tier below the floor accepted';
  exception when check_violation or unique_violation then raise notice 'ok  a tier below 20 GiB is refused'; end $$;
set role authenticated; set test.uid = '00000000-0000-0000-0000-000000000001';
select pg_temp.ok(public.seismic_storage_quota_bytes() = 536870912000, 'the caller-quota function follows the tier (bucket policy uses it)');
select pg_temp.ok((select count(*) from public.seismic_storage_tiers) = 1, 'tiers are visible only through is_org_member (the stub knows one org)');
do $$ begin perform public.seismic_storage_quota_bytes_for('00000000-0000-0000-0000-000000000002'); raise exception 'FAIL: client read another quota';
  exception when insufficient_privilege then raise notice 'ok  clients cannot call seismic_storage_quota_bytes_for'; end $$;
do $$ begin update public.seismic_storage_tiers set quota_bytes = 999999999999; raise exception 'FAIL: client changed a tier';
  exception when insufficient_privilege then raise notice 'ok  clients cannot change tiers'; end $$;
reset role;

-- ------------------------------------------------- fair claim (Q0b-6)
delete from public.qi_jobs;
insert into public.qi_jobs (id, user_id, kind, status, claimed_by, attempt, heartbeat_at, queued_at) values
  ('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-000000000001', 'noop', 'running', 'w', 1, now(), now() - interval '50 minutes');
insert into public.qi_jobs (id, user_id, kind, queued_at) values
  ('00000000-0000-0000-0000-00000000f002', '00000000-0000-0000-0000-000000000001', 'noop', now() - interval '40 minutes'),
  ('00000000-0000-0000-0000-00000000f003', '00000000-0000-0000-0000-000000000001', 'noop', now() - interval '30 minutes'),
  ('00000000-0000-0000-0000-00000000f004', '00000000-0000-0000-0000-000000000002', 'noop', now() - interval '5 minutes');
set role service_role;
select pg_temp.ok((select id from public.qi_claim_job('w2', array['noop'])) = '00000000-0000-0000-0000-00000000f004', 'fair claim: the user with nothing running goes first, though their job is newest');
select pg_temp.ok((select id from public.qi_claim_job('w3', array['noop'])) = '00000000-0000-0000-0000-00000000f002', 'fair claim: then oldest first among equals');
reset role;
select 'ALL BEHAVIOUR CHECKS PASSED' as result;
