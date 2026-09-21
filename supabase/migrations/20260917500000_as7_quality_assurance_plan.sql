-- AS7 — Quality Assurance Plan & NCR: the schema this app never had
-- (Assurance-ROADMAP.md §3 app 6).
--
-- Unlike AS3 to AS6, there was nothing to wire up. There are no qa_*
-- tables, no ncr* tables and no capa* tables anywhere in the database.
-- The whole app is four files under src/data/qa-plan/:
--
--   qaPlanSampleData.js      six invented plans, each with a `progress`
--                            percentage written in by hand (45, 10, 78,
--                            90, 30, 100) and owners called Sarah
--                            Jenkins, Mike Robertson and Lisa Wang
--   checkpointSampleData.js  two checkpoints, both belonging to the
--                            same plan
--   ncrSampleData.js         two non-conformance reports
--   capaSampleData.js        two corrective actions, imported by NO
--                            page at all — corrective action, the half
--                            of the discipline that closes the loop,
--                            was absent from the user interface
--
-- And a user could not create any of it. NewQAPlan.jsx has no state:
-- no `value`, no `onChange`, no `useState` for any field, exactly as
-- AS6 found in NewMOC.jsx. Its Create Plan button toasts "QA Plan Draft
-- Created" and navigates to the register, where the six invented plans
-- are. "Raise NCR" toasts "Raise NCR form...". "Add Checkpoint" toasts
-- "Add checkpoint dialog...". The Reports page draws no chart at all:
-- it renders the literal text "[Chart Visualization: Active 60%, Draft
-- 20%, Closed 20%]" inside a bordered box.
--
-- So this migration is the app.
--
-- The rules it enforces, and why each one is a rule:
--
-- 1. A HOLD POINT THAT PASSED WITHOUT A VERIFIER DID NOT PASS.
--    A hold point is the one control in an inspection and test plan
--    that actually stops work: nothing proceeds past it until the
--    verifying party attends, checks against the acceptance criteria
--    and signs. A witness point is weaker on purpose — the party is
--    notified and may attend, and work may proceed if it does not. That
--    distinction is the engineering content of an ITP, and an app that
--    lets either be ticked to Passed from a dropdown with no date and
--    no name has recorded an opinion, not a verification.
--    Any checkpoint reaching a decided status must carry both the
--    result date and who decided.
--
-- 2. A WAIVER WITHOUT A REASON IS NOT A WAIVER. Waiving an inspection
--    point is a deliberate acceptance of reduced assurance, and the
--    reason is the only thing that makes it auditable later.
--
-- 3. AN NCR IS NOT CLOSED BY SAYING SO. Closure requires the agreed
--    disposition (use as is, repair, rework, reject, and so on), the
--    date, and who closed it. A critical or major NCR additionally
--    requires the root cause, because closing one without it is how the
--    same non-conformance arrives again next quarter.
--
-- 4. AN EFFECTIVENESS CHECK IS A DATE AND A NAME, not a checkbox.
--    src/lib/qualityAssurance.js will not let a critical or major NCR
--    close until a corrective action has been verified effective; this
--    stops that verification being claimed without evidence of who
--    made it and when.
--
-- 5. CODES THAT SEQUENCE. next_qa_plan_code() and next_ncr_code() per
--    organization and per year, on the precedent of next_risk_code
--    (AS2), next_obligation_code (AS3), next_document_number (AS4),
--    next_peer_review_code (AS5) and next_moc_code (AS6), with the
--    unique constraints behind them so a race loses instead of
--    colliding silently.
--
-- 6. RLS FROM THE START, with explicit grants to `authenticated`. AS1's
--    RLS migration grants that role nothing (correct against
--    production, where the grants pre-existed; wrong on any rebuild
--    from the repo), so every table here states its own grants, as AS3
--    onward do.
--
-- Additive and idempotent: safe to re-run.

begin;

create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------
-- 1. qa_plans — the parent register
-- ---------------------------------------------------------------

create table if not exists public.qa_plans (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  plan_code         text not null,
  title             text not null,
  description       text,
  scope             text,
  -- What the plan covers. Free text on purpose: an operator's own
  -- project and contract references do not fit a vocabulary.
  project_ref       text,
  asset_id          text,
  discipline        text,
  department        text,
  contractor        text,
  status            text not null default 'Draft',
  revision          text,
  quality_objective text,
  owner_id          uuid references public.users(id),
  approver_id       uuid references public.users(id),
  approved_date     date,
  start_date        date,
  end_date          date,
  created_by        uuid references public.users(id),
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),
  constraint qa_plans_org_code_key unique (org_id, plan_code),
  constraint qa_plans_status_check check (status in
    ('Draft', 'Under review', 'Active', 'Superseded', 'Closed', 'Cancelled')),
  constraint qa_plans_dates_check check (
    start_date is null or end_date is null or end_date >= start_date)
);

comment on table public.qa_plans is
  'Quality assurance and inspection plans. Before AS7 this register was six invented rows in src/data/qa-plan/qaPlanSampleData.js, shown to every organization.';
comment on column public.qa_plans.status is
  'A plan does not reach Closed while a hold point is unresolved or an NCR raised against it is open. src/lib/qualityAssurance.js owns that gate (AS7).';

-- The sample data carried `progress: 45`, a hand-written percentage
-- with nothing behind it. There is deliberately no progress column:
-- completion is counted from the checkpoints, in
-- src/lib/qualityAssurance.js, or it is not a measurement.

create index if not exists qa_plans_org_status_idx on public.qa_plans (org_id, status);
create index if not exists qa_plans_org_created_idx on public.qa_plans (org_id, created_at desc);

-- ---------------------------------------------------------------
-- 2. qa_checkpoints — the inspection and test plan itself
-- ---------------------------------------------------------------

create table if not exists public.qa_checkpoints (
  id                  uuid primary key default gen_random_uuid(),
  plan_id             uuid not null references public.qa_plans(id) on delete cascade,
  item_no             text not null,
  sequence            integer,
  title               text not null,
  activity            text,
  description         text,
  -- Hold, witness, review, monitor and surveillance are the five
  -- intervention types an ITP uses, and only the first stops work.
  point_type          text not null default 'Review point',
  acceptance_criteria text,
  reference_document  text,
  -- Who does the verifying. An ITP that does not say is a wish list.
  responsible_party   text,
  verifying_document  text,
  planned_date        date,
  status              text not null default 'Pending',
  result_date         date,
  verified_by         uuid references public.users(id),
  verifier_name       text,
  remarks             text,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now(),
  constraint qa_checkpoints_plan_item_key unique (plan_id, item_no),
  constraint qa_checkpoints_point_type_check check (point_type in
    ('Hold point', 'Witness point', 'Review point', 'Monitor point', 'Surveillance point')),
  constraint qa_checkpoints_status_check check (status in
    ('Pending', 'Notified', 'In progress', 'Passed', 'Failed', 'Waived', 'Not applicable')),
  constraint qa_checkpoints_responsible_check check (responsible_party is null
    or responsible_party in
      ('Company', 'Contractor', 'Vendor', 'Third party', 'Certifying authority')),

  -- RULE 1. A decided checkpoint carries the date it was decided and
  -- who decided it. Passed, Failed and Waived are all decisions; the
  -- other four statuses are positions on the way there.
  constraint qa_checkpoints_decision_needs_record check (
    status not in ('Passed', 'Failed', 'Waived')
    or (result_date is not null
        and (verified_by is not null or nullif(btrim(coalesce(verifier_name, '')), '') is not null))
  ),

  -- RULE 2. A waiver without a reason is not a waiver.
  constraint qa_checkpoints_waiver_needs_reason check (
    status <> 'Waived' or nullif(btrim(coalesce(remarks, '')), '') is not null
  )
);

comment on constraint qa_checkpoints_decision_needs_record on public.qa_checkpoints is
  'A hold point that passed without a verifier did not pass. Passed, Failed and Waived each require the result date and a named verifier (AS7).';
comment on constraint qa_checkpoints_waiver_needs_reason on public.qa_checkpoints is
  'Waiving an inspection point is a deliberate acceptance of reduced assurance. The reason is the only thing that makes it auditable afterwards (AS7).';
comment on column public.qa_checkpoints.point_type is
  'Only a hold point stops work. A witness point notifies a party who may attend, and work may proceed if it does not. src/lib/qualityAssurance.js treats the two differently when deciding whether a plan may close (AS7).';

create index if not exists qa_checkpoints_plan_idx on public.qa_checkpoints (plan_id, sequence);
create index if not exists qa_checkpoints_status_idx on public.qa_checkpoints (plan_id, status);

-- ---------------------------------------------------------------
-- 3. qa_ncrs — non-conformance reports
-- ---------------------------------------------------------------
-- Its own parent, not a child of qa_plans. A non-conformance found on
-- received material has an org and a supplier and often no plan at all,
-- and an NCR that can only exist inside a plan is an NCR nobody raises.

create table if not exists public.qa_ncrs (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references public.organizations(id) on delete cascade,
  ncr_code              text not null,
  plan_id               uuid references public.qa_plans(id) on delete set null,
  checkpoint_id         uuid references public.qa_checkpoints(id) on delete set null,
  title                 text not null,
  description           text,
  severity              text not null default 'Minor',
  status                text not null default 'Open',
  discipline            text,
  department            text,
  asset_id              text,
  supplier              text,
  requirement_ref       text,
  quantity_affected     text,
  raised_by             uuid references public.users(id),
  raised_date           date not null default current_date,
  due_date              date,
  disposition           text,
  disposition_rationale text,
  disposition_approved_by uuid references public.users(id),
  disposition_date      date,
  root_cause            text,
  root_cause_category   text,
  cost_impact           numeric,
  cost_currency         text,
  closed_date           date,
  closed_by             uuid references public.users(id),
  closure_notes         text,
  created_at            timestamptz default now(),
  updated_at            timestamptz default now(),
  constraint qa_ncrs_org_code_key unique (org_id, ncr_code),
  constraint qa_ncrs_severity_check check (severity in
    ('Critical', 'Major', 'Minor', 'Observation')),
  constraint qa_ncrs_status_check check (status in
    ('Open', 'Under investigation', 'Disposition agreed', 'Actions in progress',
     'Verification', 'Closed', 'Voided')),
  constraint qa_ncrs_disposition_check check (disposition is null or disposition in
    ('Use as is', 'Repair', 'Rework', 'Regrade', 'Reject', 'Return to supplier', 'Scrap')),
  constraint qa_ncrs_root_cause_category_check check (root_cause_category is null
    or root_cause_category in
      ('Procedure or documentation', 'Human factors or competence', 'Design',
       'Material or equipment', 'Supplier or subcontractor', 'Planning or scheduling',
       'Communication', 'Measurement or inspection', 'Other')),

  -- RULE 3. Closure is a disposition, a date and a name. A critical or
  -- major non-conformance additionally needs the root cause: closing
  -- one without it is how the same non-conformance arrives again next
  -- quarter. Voided is the separate, honest outcome for an NCR raised
  -- in error, and it is exempt.
  constraint qa_ncrs_closure_needs_record check (
    status <> 'Closed'
    or (closed_date is not null
        and closed_by is not null
        and disposition is not null
        and (severity not in ('Critical', 'Major')
             or nullif(btrim(coalesce(root_cause, '')), '') is not null))
  ),

  -- A disposition is a decision, so it carries its date.
  constraint qa_ncrs_disposition_needs_date check (
    disposition is null or disposition_date is not null
  ),
  constraint qa_ncrs_dates_check check (
    closed_date is null or closed_date >= raised_date
  )
);

comment on constraint qa_ncrs_closure_needs_record on public.qa_ncrs is
  'A critical or major NCR cannot be closed without a disposition, a closure date, a named closer AND a root cause. Voided is the honest outcome for one raised in error (AS7).';
comment on table public.qa_ncrs is
  'Non-conformance reports. Its own parent rather than a child of qa_plans, because a non-conformance on received material has a supplier and often no plan.';

create index if not exists qa_ncrs_org_status_idx on public.qa_ncrs (org_id, status);
create index if not exists qa_ncrs_org_severity_idx on public.qa_ncrs (org_id, severity);
create index if not exists qa_ncrs_plan_idx on public.qa_ncrs (plan_id) where plan_id is not null;

-- ---------------------------------------------------------------
-- 4. qa_capas — corrective and preventive actions
-- ---------------------------------------------------------------
-- The half of the discipline that was missing from the app entirely.
-- src/data/qa-plan/capaSampleData.js existed and no page imported it.

create table if not exists public.qa_capas (
  id                     uuid primary key default gen_random_uuid(),
  ncr_id                 uuid not null references public.qa_ncrs(id) on delete cascade,
  action_type            text not null default 'Corrective',
  description            text not null,
  assigned_to            uuid references public.users(id),
  assignee_name          text,
  due_date               date,
  status                 text not null default 'Open',
  completed_at           timestamptz,
  completion_evidence    text,
  -- The effectiveness check. A corrective action that was done is not
  -- the same as a corrective action that worked.
  effectiveness_due      date,
  effectiveness_verified boolean,
  effectiveness_checked_at date,
  effectiveness_verified_by uuid references public.users(id),
  effectiveness_notes    text,
  created_at             timestamptz default now(),
  updated_at             timestamptz default now(),
  constraint qa_capas_action_type_check check (action_type in ('Corrective', 'Preventive')),
  constraint qa_capas_status_check check (status in
    ('Open', 'In progress', 'Complete', 'Cancelled')),
  constraint qa_capas_complete_needs_date check (
    status <> 'Complete' or completed_at is not null
  ),

  -- RULE 4. An effectiveness verdict is a date and a name, either way.
  -- Recording "not effective" matters as much as recording "effective":
  -- it is the trigger to go round again.
  constraint qa_capas_effectiveness_needs_record check (
    effectiveness_verified is null
    or (effectiveness_checked_at is not null and effectiveness_verified_by is not null)
  )
);

comment on constraint qa_capas_effectiveness_needs_record on public.qa_capas is
  'An effectiveness check is a date and a name, not a checkbox. Applies to a "not effective" verdict too: that one is the trigger to go round again (AS7).';
comment on column public.qa_capas.effectiveness_verified is
  'src/lib/qualityAssurance.js will not close a critical or major NCR until a corrective action here has been verified effective. A completed action is not a working one (AS7).';

create index if not exists qa_capas_ncr_idx on public.qa_capas (ncr_id, status);
create index if not exists qa_capas_due_idx on public.qa_capas (due_date)
  where status in ('Open', 'In progress');

-- ---------------------------------------------------------------
-- 5. qa_activity_log — the audit trail
-- ---------------------------------------------------------------
-- One log for the module, keyed by the entity it describes, because a
-- quality record's history crosses from the plan to the checkpoint to
-- the NCR to the corrective action and back.

create table if not exists public.qa_activity_log (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  entity_type text not null,
  entity_id   uuid not null,
  plan_id     uuid references public.qa_plans(id) on delete cascade,
  ncr_id      uuid references public.qa_ncrs(id) on delete cascade,
  actor_id    uuid references public.users(id),
  action      text not null,
  details     jsonb,
  created_at  timestamptz default now(),
  constraint qa_activity_entity_check check (entity_type in
    ('plan', 'checkpoint', 'ncr', 'capa'))
);

create index if not exists qa_activity_org_idx on public.qa_activity_log (org_id, created_at desc);
create index if not exists qa_activity_entity_idx on public.qa_activity_log (entity_type, entity_id);

-- ---------------------------------------------------------------
-- 6. Codes, in sequence per organization and per year
-- ---------------------------------------------------------------

create or replace function public.next_qa_plan_code(p_org uuid, p_year integer default null)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_next integer;
  v_year integer;
begin
  if not (p_org = public.my_org_id() or public.is_super_admin()) then
    raise exception 'not a member of that organization' using errcode = '42501';
  end if;

  v_year := coalesce(p_year, extract(year from now())::integer);

  perform pg_advisory_xact_lock(hashtext('qa_plan_code' || p_org::text || v_year::text));

  select coalesce(max((regexp_replace(plan_code, '^.*-', ''))::integer), 0) + 1
    into v_next
    from public.qa_plans
   where org_id = p_org
     and plan_code ~ ('^QAP-' || v_year::text || '-[0-9]+$');

  return 'QAP-' || v_year::text || '-' || lpad(v_next::text, 3, '0');
end;
$$;

create or replace function public.next_ncr_code(p_org uuid, p_year integer default null)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_next integer;
  v_year integer;
begin
  if not (p_org = public.my_org_id() or public.is_super_admin()) then
    raise exception 'not a member of that organization' using errcode = '42501';
  end if;

  v_year := coalesce(p_year, extract(year from now())::integer);

  perform pg_advisory_xact_lock(hashtext('qa_ncr_code' || p_org::text || v_year::text));

  select coalesce(max((regexp_replace(ncr_code, '^.*-', ''))::integer), 0) + 1
    into v_next
    from public.qa_ncrs
   where org_id = p_org
     and ncr_code ~ ('^NCR-' || v_year::text || '-[0-9]+$');

  return 'NCR-' || v_year::text || '-' || lpad(v_next::text, 3, '0');
end;
$$;

revoke all on function public.next_qa_plan_code(uuid, integer) from public, anon;
revoke all on function public.next_ncr_code(uuid, integer) from public, anon;
grant execute on function public.next_qa_plan_code(uuid, integer) to authenticated;
grant execute on function public.next_ncr_code(uuid, integer) to authenticated;

comment on function public.next_qa_plan_code(uuid, integer) is
  'Issues the next sequential QAP-<year>- code for an organization, under an advisory lock. The app never issued one: its plan numbers were six literals in a data file (AS7).';

-- ---------------------------------------------------------------
-- 7. RLS, policies and grants
-- ---------------------------------------------------------------

revoke all on table
  public.qa_plans, public.qa_checkpoints, public.qa_ncrs,
  public.qa_capas, public.qa_activity_log
from anon;

grant select, insert, update, delete on table
  public.qa_plans, public.qa_checkpoints, public.qa_ncrs,
  public.qa_capas, public.qa_activity_log
to authenticated;

alter table public.qa_plans        enable row level security;
alter table public.qa_checkpoints  enable row level security;
alter table public.qa_ncrs         enable row level security;
alter table public.qa_capas        enable row level security;
alter table public.qa_activity_log enable row level security;

-- Parents carry org_id directly.
do $$
declare t text;
begin
  foreach t in array array['qa_plans', 'qa_ncrs', 'qa_activity_log'] loop
    execute format('drop policy if exists %I on public.%I', t || '_org_rw', t);
    execute format($f$
      create policy %I on public.%I
        for all to authenticated
        using (org_id = public.my_org_id() or public.is_super_admin())
        with check (org_id = public.my_org_id() or public.is_super_admin())
    $f$, t || '_org_rw', t);
  end loop;
end $$;

-- Children scope through their parent, the AS1 pattern.
drop policy if exists qa_checkpoints_org_rw on public.qa_checkpoints;
create policy qa_checkpoints_org_rw on public.qa_checkpoints
  for all to authenticated
  using (
    public.is_super_admin() or exists (
      select 1 from public.qa_plans p
       where p.id = qa_checkpoints.plan_id and p.org_id = public.my_org_id())
  )
  with check (
    public.is_super_admin() or exists (
      select 1 from public.qa_plans p
       where p.id = qa_checkpoints.plan_id and p.org_id = public.my_org_id())
  );

drop policy if exists qa_capas_org_rw on public.qa_capas;
create policy qa_capas_org_rw on public.qa_capas
  for all to authenticated
  using (
    public.is_super_admin() or exists (
      select 1 from public.qa_ncrs n
       where n.id = qa_capas.ncr_id and n.org_id = public.my_org_id())
  )
  with check (
    public.is_super_admin() or exists (
      select 1 from public.qa_ncrs n
       where n.id = qa_capas.ncr_id and n.org_id = public.my_org_id())
  );

-- An NCR may name a plan, and a checkpoint on it. Both must belong to
-- the same organization as the NCR. RLS alone does not say this: a
-- member of Org A can see their own NCR row and, without this, could
-- point plan_id at a plan they cannot read.
create or replace function public.qa_ncr_parents_same_org()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_org uuid;
begin
  if new.plan_id is not null then
    select org_id into v_org from public.qa_plans where id = new.plan_id;
    if v_org is distinct from new.org_id then
      raise exception 'that quality plan belongs to another organization'
        using errcode = '42501';
    end if;
  end if;
  if new.checkpoint_id is not null then
    select p.org_id into v_org
      from public.qa_checkpoints c join public.qa_plans p on p.id = c.plan_id
     where c.id = new.checkpoint_id;
    if v_org is distinct from new.org_id then
      raise exception 'that checkpoint belongs to another organization'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists qa_ncrs_parents_same_org on public.qa_ncrs;
create trigger qa_ncrs_parents_same_org
  before insert or update of plan_id, checkpoint_id, org_id on public.qa_ncrs
  for each row execute function public.qa_ncr_parents_same_org();

commit;
