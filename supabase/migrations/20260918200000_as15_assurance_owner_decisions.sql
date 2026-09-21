-- AS15: the Assurance owner decisions (AssuranceApps-STATUS.md §3n).
--
-- HELD. Runs in the `schema` phase of
-- tools/validation/assurance/assurance-launch-apply.sh, after AS14 and
-- before the tile activation. The owner delegated these decisions on
-- 2026-09-18 ("choose the best options based on your judgement"); each is
-- recorded in the STATUS doc with its reasoning. The engine (engines
-- PR, `engines/assurance`) and the app enforce the same rules; this makes
-- them hold for a write from any route.
--
-- 1. Segregation of duties, MOC. An approval is decided by the person it
--    is assigned to, and the originator of a change never approves it.
--    Before this, role labels were not enforced: any member could decide
--    any level, and the approve form assigned the gate to whoever clicked
--    Add, so an originator could approve their own change.
-- 2. Emergency-change authority. An Emergency change may be implemented
--    on its first approval level (engine canAdvance) and is ratified by
--    the rest within 7 days. The database holds the half that matters
--    most: an Emergency change cannot be CLOSED until every level has
--    approved and none has rejected.
-- 3. Segregation of duties, Document Control. A review task is decided by
--    its reviewer, and a revision's author does not review it. The one
--    exception is the app closing the OTHER pending tasks of a round
--    somebody has just decided (status 'Closed'), which is bookkeeping,
--    not a decision.
-- 4. Validation by typed name, Lessons Learned. The author may not
--    validate their own lesson even by typing somebody else's name: the
--    signed-in actor is checked, not only validated_by.
-- 5. ISO 19011 for every auditor. iso_audit_clauses gains examined_by,
--    stamped with the signed-in user who records a result; a clause's
--    owner may not record the result for it.
--
-- auth.uid() is null for the service role and for maintenance run as a
-- database owner. Rules 1, 3, 4 and 5 check the actor only when there is
-- one, so tooling and migrations are not blocked. Idempotent.

begin;

-- ---------------------------------------------------------------
-- 1. moc_approvals: assignee decides; originator never approves
-- ---------------------------------------------------------------
create or replace function public.moc_approvals_sod()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_originator uuid;
begin
  select originator_id into v_originator from public.moc_records where id = new.moc_id;
  if new.approver_id is not distinct from v_originator and v_originator is not null then
    raise exception 'The originator of a change cannot approve it.' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' then
    if new.approver_id is distinct from old.approver_id and old.status <> 'Pending' then
      raise exception 'A decided approval is part of the record and cannot be reassigned.'
        using errcode = 'P0001';
    end if;
    if old.status = 'Pending' and new.status is distinct from 'Pending'
       and auth.uid() is not null and auth.uid() is distinct from old.approver_id then
      raise exception 'Only the person this approval is assigned to can decide it.'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists moc_approvals_sod on public.moc_approvals;
create trigger moc_approvals_sod
  before insert or update on public.moc_approvals
  for each row execute function public.moc_approvals_sod();

-- ---------------------------------------------------------------
-- 2. An Emergency change closes only when fully ratified
-- ---------------------------------------------------------------
create or replace function public.moc_emergency_close_ratified()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_missing int; v_rejected int; v_levels int;
begin
  if new.stage <> 'Closed' or new.type is distinct from 'Emergency'
     or old.stage is not distinct from 'Closed' then
    return new;
  end if;
  select count(distinct coalesce(level, 1)) into v_levels
    from public.moc_approvals where moc_id = new.id;
  select count(*) into v_rejected
    from public.moc_approvals where moc_id = new.id and status = 'Rejected';
  select count(*) into v_missing from (
    select coalesce(level, 1) as lvl from public.moc_approvals where moc_id = new.id
    group by 1 having not bool_or(status = 'Approved')) x;
  if v_levels = 0 or v_rejected > 0 or v_missing > 0 then
    raise exception 'An emergency change cannot close until every approval level has ratified it.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists moc_emergency_close_ratified on public.moc_records;
create trigger moc_emergency_close_ratified
  before update of stage on public.moc_records
  for each row execute function public.moc_emergency_close_ratified();

-- ---------------------------------------------------------------
-- 3. doc_workflows: reviewer decides; author never reviews
-- ---------------------------------------------------------------
create or replace function public.doc_workflows_sod()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_author uuid;
begin
  select created_by into v_author from public.doc_revisions where id = new.revision_id;
  if v_author is not null and new.reviewer_id = v_author then
    raise exception 'The author of a revision cannot review it.' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and old.status = 'Pending'
     and new.status is distinct from 'Pending' and new.status <> 'Closed'
     and auth.uid() is not null and auth.uid() is distinct from old.reviewer_id then
    raise exception 'Only the reviewer this task is assigned to can decide it.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists doc_workflows_sod on public.doc_workflows;
create trigger doc_workflows_sod
  before insert or update on public.doc_workflows
  for each row execute function public.doc_workflows_sod();

-- ---------------------------------------------------------------
-- 4. lesson_records: the author never performs a validation
-- ---------------------------------------------------------------
create or replace function public.lesson_validation_actor()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.status = 'Validated' and old.status is distinct from 'Validated'
     and auth.uid() is not null
     and auth.uid() = coalesce(new.author_id, new.created_by) then
    raise exception 'The author of a lesson cannot validate it, and that includes recording somebody else''s name.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists lesson_records_validation_actor on public.lesson_records;
create trigger lesson_records_validation_actor
  before update on public.lesson_records
  for each row execute function public.lesson_validation_actor();

-- ---------------------------------------------------------------
-- 5. iso_audit_clauses: who examined, and not the clause owner
-- ---------------------------------------------------------------
alter table public.iso_audit_clauses
  add column if not exists examined_by uuid references public.users(id);

comment on column public.iso_audit_clauses.examined_by is
  'The signed-in user who recorded this result. ISO 19011: may not be the clause owner (AS15).';

create or replace function public.iso_examiner_independent()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_owner uuid; v_ref text;
begin
  if new.result = 'Not examined' then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.result is not distinct from old.result
     and new.evidence_seen is not distinct from old.evidence_seen
     and new.examined_on is not distinct from old.examined_on then
    return new;  -- not a new examination
  end if;
  if auth.uid() is null then
    return new;
  end if;
  new.examined_by := auth.uid();
  select owner_id, clause_ref into v_owner, v_ref from public.iso_clauses where id = new.clause_id;
  if v_owner is not null and v_owner = auth.uid() then
    raise exception 'You own clause %. An auditor may not audit their own work (ISO 19011).',
      coalesce(v_ref, '?') using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists iso_audit_clauses_examiner on public.iso_audit_clauses;
create trigger iso_audit_clauses_examiner
  before insert or update on public.iso_audit_clauses
  for each row execute function public.iso_examiner_independent();

revoke all on function public.moc_approvals_sod() from public, anon;
revoke all on function public.moc_emergency_close_ratified() from public, anon;
revoke all on function public.doc_workflows_sod() from public, anon;
revoke all on function public.lesson_validation_actor() from public, anon;
revoke all on function public.iso_examiner_independent() from public, anon;

commit;
