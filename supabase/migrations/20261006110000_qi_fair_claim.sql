-- =============================================================================
-- QI Build Programme, phase Q0b-6: fair scheduling on the seismic worker queue
-- docs/scope/QI-PLAN.md (Q0b, "one huge project cannot starve the others")
-- -----------------------------------------------------------------------------
-- qi_claim_job took the oldest queued job overall, so a user with several
-- large jobs queued could hold the worker while another user's job waited.
-- It now takes the oldest queued job of the user with the fewest jobs
-- currently running (ties: oldest first). Same signature, same atomic claim
-- (FOR UPDATE SKIP LOCKED), same grants. qi_jobs only; no shared table.
-- =============================================================================

create index if not exists qi_jobs_user_running_idx
    on public.qi_jobs (user_id) where status = 'running';

create or replace function public.qi_claim_job(p_worker_id text, p_kinds text[])
returns setof public.qi_jobs
language plpgsql security definer
set search_path = public
as $$
begin
  return query
  update public.qi_jobs j
     set status = 'running',
         claimed_by = p_worker_id,
         claimed_at = now(),
         heartbeat_at = now(),
         attempt = j.attempt + 1,
         progress = 0,
         progress_message = null
   where j.id = (
         select q.id from public.qi_jobs q
          where q.status = 'queued' and q.kind = any (p_kinds)
          order by (select count(*) from public.qi_jobs r
                     where r.user_id = q.user_id and r.status = 'running'),
                   q.queued_at
          limit 1
          for update skip locked)
  returning j.*;
end $$;

revoke all on function public.qi_claim_job(text, text[]) from public, anon, authenticated;
grant execute on function public.qi_claim_job(text, text[]) to service_role;
