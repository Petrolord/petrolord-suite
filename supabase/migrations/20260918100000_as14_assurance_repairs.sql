-- AS14 — Assurance repairs before launch (AssuranceApps-STATUS.md §3m).
--
-- HELD. Runs in the `schema` phase of
-- tools/validation/assurance/assurance-launch-apply.sh, after AS10's
-- seed and BEFORE the tile activation (20260918900000), because §1 is
-- what makes it safe to sell Document Control at all.
--
-- 1. documents: a REAL cross-tenant hole, not a reconstruction gap.
--    AS1 §8 said the parent registers "already have RLS and policies"
--    and left them alone. Read on 2026-09-18 (pg_policies), documents'
--    two policies are
--        "Users can manage org documents"  FOR ALL    USING (true)
--        "Users can view org documents"    FOR SELECT USING (true)
--    written to role public. RLS was on and scoped nothing: any signed-in
--    user of ANY organization could read, rewrite and delete every
--    organization's controlled documents. AS1 takes the anon grant away;
--    it does not touch the policy. The table holds 0 rows today, so
--    nothing has leaked, but Document Control goes Active at
--    20260918900000 and the first row written would have been readable
--    platform-wide. The app filters by org_id in the query, which is why
--    no test or page ever showed it. Dropped and replaced with the
--    my_org_id() policy every other assurance register uses.
--
-- 2. The rest of the parent-register reconstruction gap (STATUS §5).
--    risk_register, risk_kris, risk_mitigation_actions, risk_scenarios
--    and compliance_rules are correctly scoped in production (by
--    is_org_member / has_org_role) and by nothing in the repo, so a
--    rebuild from source had them with RLS off. Read live on 2026-09-18
--    and reproduced here in the module's own policy shape. In
--    production each is ADDITIVE and no wider than what is there:
--    my_org_id() is one of the caller's memberships. compliance_rules
--    gets a READ policy only, because live writes are admin-only
--    (has_org_role) and an org_rw policy would widen them. No code reads
--    compliance_rules. The live policies are not dropped.
--
-- 3. saved_reports (Risk Register custom reports) existed only in the
--    live database, with RLS OFF and full CRUD granted to anon: the same
--    class as the 121 tables in §1.5, on a table this module writes.
--    0 rows. Backfilled from the live catalogue (7 columns, 2 FKs, pk)
--    and scoped like every other register.
--
-- 4. QA plan (AS7): removing an inspection point is refused where the
--    engine's canRemoveCheckpoint refuses it, and an NCR cannot be raised
--    against a closed, superseded or cancelled plan (canRaiseNcr). Both
--    were client-side only, and deleting an unreleased hold point used to
--    clear the plan-closure gate with no trace.
--
-- 5. ISO Compliance (AS8): once an internal audit is Reported, Closed or
--    Cancelled, its clause scope AND the results recorded against it are
--    fixed. The app locked the scope from Reported and the results only
--    from Closed; Reported can only go on to Closed, so a result changed
--    in between rewrote an issued report.
--
-- Guards 4 and 5 act on direct writes only (pg_trigger_depth() = 1). A
-- cascade (a plan, audit, standard or organization being deleted) is not
-- somebody editing a record, and blocking it would break the org purge
-- and data-export tooling.
--
-- Idempotent: every statement is guarded or replaceable, and a second
-- run is a no-op (scratch/run-launch-check.sh re-applies it).

begin;

-- ---------------------------------------------------------------
-- 1. documents
-- ---------------------------------------------------------------
alter table public.documents enable row level security;
revoke all on table public.documents from anon;
grant select, insert, update, delete on table public.documents to authenticated;

drop policy if exists "Users can manage org documents" on public.documents;
drop policy if exists "Users can view org documents" on public.documents;
drop policy if exists documents_org_rw on public.documents;
create policy documents_org_rw on public.documents
  for all to authenticated
  using (org_id = public.my_org_id() or public.is_super_admin())
  with check (org_id = public.my_org_id() or public.is_super_admin());

comment on policy documents_org_rw on public.documents is
  'Replaces two USING (true) policies that let any signed-in user of any organization read and write every organization''s documents (AS14, 2026-09-18).';

-- ---------------------------------------------------------------
-- 2. Parent registers: RLS in the repo, not only in production
-- ---------------------------------------------------------------
alter table public.risk_register           enable row level security;
alter table public.risk_scenarios          enable row level security;
alter table public.risk_kris               enable row level security;
alter table public.risk_mitigation_actions enable row level security;
alter table public.compliance_rules        enable row level security;

revoke all on table
  public.risk_register, public.risk_scenarios, public.risk_kris,
  public.risk_mitigation_actions, public.compliance_rules
from anon;
grant select, insert, update, delete on table
  public.risk_register, public.risk_scenarios, public.risk_kris,
  public.risk_mitigation_actions
to authenticated;
grant select on table public.compliance_rules to authenticated;

do $$
declare t text;
begin
  foreach t in array array['risk_register', 'risk_scenarios'] loop
    execute format('drop policy if exists %I on public.%I', t || '_org_rw', t);
    execute format($f$
      create policy %I on public.%I
        for all to authenticated
        using (org_id = public.my_org_id() or public.is_super_admin())
        with check (org_id = public.my_org_id() or public.is_super_admin())
    $f$, t || '_org_rw', t);
  end loop;

  foreach t in array array['risk_kris', 'risk_mitigation_actions'] loop
    execute format('drop policy if exists %I on public.%I', t || '_org_rw', t);
    execute format($f$
      create policy %I on public.%I
        for all to authenticated
        using (
          public.is_super_admin() or exists (
            select 1 from public.risk_register r
             where r.id = %I.risk_id and r.org_id = public.my_org_id()
          )
        )
        with check (
          public.is_super_admin() or exists (
            select 1 from public.risk_register r
             where r.id = %I.risk_id and r.org_id = public.my_org_id()
          )
        )
    $f$, t || '_org_rw', t, t, t);
  end loop;
end $$;

drop policy if exists compliance_rules_org_read on public.compliance_rules;
create policy compliance_rules_org_read on public.compliance_rules
  for select to authenticated
  using (org_id = public.my_org_id() or public.is_super_admin());

-- ---------------------------------------------------------------
-- 3. saved_reports
-- ---------------------------------------------------------------
create table if not exists public.saved_reports (
  id uuid default gen_random_uuid() not null,
  org_id uuid not null,
  name text not null,
  type text not null,
  config jsonb not null,
  created_by uuid,
  created_at timestamp with time zone default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'saved_reports_pkey'
                    and conrelid = 'public.saved_reports'::regclass) then
    alter table public.saved_reports add constraint saved_reports_pkey primary key (id);
  end if;
  if not exists (select 1 from pg_constraint
                  where conname = 'saved_reports_org_id_fkey'
                    and conrelid = 'public.saved_reports'::regclass) then
    alter table public.saved_reports add constraint saved_reports_org_id_fkey
      foreign key (org_id) references public.organizations(id);
  end if;
  if not exists (select 1 from pg_constraint
                  where conname = 'saved_reports_created_by_fkey'
                    and conrelid = 'public.saved_reports'::regclass) then
    alter table public.saved_reports add constraint saved_reports_created_by_fkey
      foreign key (created_by) references auth.users(id);
  end if;
end $$;

create index if not exists saved_reports_org_idx
  on public.saved_reports (org_id, created_at desc);

alter table public.saved_reports enable row level security;
revoke all on table public.saved_reports from anon;
grant select, insert, update, delete on table public.saved_reports to authenticated;

drop policy if exists saved_reports_org_rw on public.saved_reports;
create policy saved_reports_org_rw on public.saved_reports
  for all to authenticated
  using (org_id = public.my_org_id() or public.is_super_admin())
  with check (org_id = public.my_org_id() or public.is_super_admin());

comment on table public.saved_reports is
  'Risk Register saved custom reports. Existed only in the live database with RLS off and anon CRUD; backfilled and scoped (AS14, 2026-09-18).';

-- ---------------------------------------------------------------
-- 4. QA plan: point removal and NCRs against finished plans
-- ---------------------------------------------------------------
create or replace function public.qa_checkpoint_guard_delete()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_plan_status text;
begin
  if pg_trigger_depth() > 1 then
    return old;  -- a cascade from a plan or organization delete
  end if;
  select status into v_plan_status from public.qa_plans where id = old.plan_id;
  if v_plan_status in ('Closed', 'Superseded', 'Cancelled') then
    raise exception 'This plan is %. Its inspection points are the record it was finished on.',
      lower(v_plan_status) using errcode = 'P0001';
  end if;
  if coalesce(old.status, 'Pending') not in ('Pending', 'Notified', 'In progress')
     or old.result_date is not null then
    raise exception 'Item % has a result recorded (%). A recorded result is evidence and stays on the plan.',
      coalesce(old.item_no, '?'), coalesce(old.status, 'Pending') using errcode = 'P0001';
  end if;
  if old.point_type = 'Hold point' and v_plan_status is distinct from 'Draft' then
    raise exception 'A hold point cannot be removed once its plan has left Draft. Record it as Not applicable with the reason.'
      using errcode = 'P0001';
  end if;
  return old;
end;
$$;

drop trigger if exists qa_checkpoints_guard_delete on public.qa_checkpoints;
create trigger qa_checkpoints_guard_delete
  before delete on public.qa_checkpoints
  for each row execute function public.qa_checkpoint_guard_delete();

create or replace function public.qa_ncr_guard_finished_plan()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_plan_status text;
begin
  if new.plan_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.plan_id is not distinct from old.plan_id then
    return new;  -- an NCR already on the plan may still be worked
  end if;
  select status into v_plan_status from public.qa_plans where id = new.plan_id;
  if v_plan_status in ('Closed', 'Superseded', 'Cancelled') then
    raise exception 'That quality plan is %. Raise the non-conformance against the plan now in force, or with no plan.',
      lower(v_plan_status) using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists qa_ncrs_guard_finished_plan on public.qa_ncrs;
create trigger qa_ncrs_guard_finished_plan
  before insert or update of plan_id on public.qa_ncrs
  for each row execute function public.qa_ncr_guard_finished_plan();

-- ---------------------------------------------------------------
-- 5. ISO: scope and results fixed once the audit is Reported
-- ---------------------------------------------------------------
create or replace function public.iso_audit_clauses_lock()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_status text;
begin
  if pg_trigger_depth() > 1 then
    return coalesce(new, old);  -- a cascade from an audit, clause or organization delete
  end if;
  select status into v_status from public.iso_audits
   where id = coalesce(new.audit_id, old.audit_id);
  if v_status in ('Reported', 'Closed', 'Cancelled') then
    raise exception 'This audit is %. Its clause scope and results are what the report said and can no longer be changed.',
      lower(v_status) using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists iso_audit_clauses_lock on public.iso_audit_clauses;
create trigger iso_audit_clauses_lock
  before insert or update or delete on public.iso_audit_clauses
  for each row execute function public.iso_audit_clauses_lock();

revoke all on function public.qa_checkpoint_guard_delete() from public, anon;
revoke all on function public.qa_ncr_guard_finished_plan() from public, anon;
revoke all on function public.iso_audit_clauses_lock() from public, anon;

commit;
