-- qi_jobs behaviour checks (QI Q0). Run via db-tests/run.sh; each check raises on failure.
\set ON_ERROR_STOP 1
grant select on public.qi_jobs to authenticated;
grant select, update on public.qi_jobs to service_role;
create or replace function pg_temp.ok(c boolean, label text) returns void language plpgsql as $$
begin if not c then raise exception 'FAIL: %', label; end if; raise notice 'ok  %', label; end $$;

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
select 'ALL BEHAVIOUR CHECKS PASSED' as result;
