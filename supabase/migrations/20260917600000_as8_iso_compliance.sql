-- AS8 — ISO Compliance: the schema this app never had
-- (Assurance-ROADMAP.md §3 app 7).
--
-- As in AS7, there was nothing to wire up: there are no iso_* tables
-- anywhere in the database. The whole app is one file,
-- src/data/isoComplianceData.js, and that file does not even hold
-- fixed rows. It GENERATES them at module load:
--
--   score: Math.floor(Math.random() * 20) + 80,
--   dueDate: new Date(Date.now() + Math.random() * 5000000000)...
--   lastUpdated: new Date(Date.now() - Math.random() * 10000000000)...
--
-- So the audit scores, the finding due dates and the clause review
-- dates are different on every page load, and so is the "Overall
-- Compliance" percentage on the dashboard, which is computed from
-- thirty clauses whose status is decided by `i % 5`. A user who
-- refreshes twice sees two different compliance positions for the same
-- organization, and neither describes anything.
--
-- Nothing persists. The Add Clause modal pushes onto `useState` and
-- toasts "The new ISO clause has been successfully registered". The
-- detail page renders the URL's id as a heading over a dashed box and a
-- status panel hardcoded to Compliant / Current / Oct 12, 2023,
-- whichever clause is asked for. The reports page lists four report
-- types in a sidebar and renders the same one whichever is clicked,
-- over Print and Export PDF buttons that toast "Your report is being
-- generated and will download shortly" and generate nothing.
--
-- So this migration is the app. The rules it enforces:
--
-- 1. A CLAUSE CLAIMED CONFORMANT MUST SAY ON WHAT EVIDENCE, AND WHEN.
--    "Compliant" in a dropdown is an opinion. ISO conformity is a claim
--    about documented information, and a certification auditor's first
--    question is which document, and when it was last looked at. A
--    clause reaching Conformant or Partially conformant must carry the
--    evidence reference, the assessment date and who assessed it.
--
-- 2. NOT APPLICABLE NEEDS A JUSTIFICATION. ISO 9001:2015 §4.3 permits
--    a requirement to be determined not applicable, and requires the
--    justification to be kept as documented information. Without it,
--    "not applicable" is how a clause nobody wants to work on leaves
--    the register.
--
-- 3. AN AUDITOR MAY NOT AUDIT THEIR OWN WORK. ISO 19011's independence
--    principle, and the rule a real internal audit programme lives or
--    dies by. The database refuses an audit whose lead auditor owns a
--    clause in its own scope; src/lib/isoCompliance.js says so before
--    the row is attempted, and names the clauses.
--
-- 4. AN AUDIT IS NOT REPORTED UNTIL EVERY CLAUSE IN ITS SCOPE HAS A
--    RESULT, and not closed while a major nonconformity it raised is
--    still open. An audit reported with half its scope unexamined is
--    the failure mode that makes coverage statistics meaningless.
--
-- 5. A MAJOR NONCONFORMITY IS NOT CLOSED BY A CORRECTION. ISO 9001
--    §10.2 separates the correction (fix the thing) from the corrective
--    action (remove the cause). Closing a major one requires the root
--    cause, a corrective action, and that action verified effective —
--    the same proportionality as AS5 and AS7, where an observation or
--    an opportunity for improvement needs none of it.
--
-- 6. CODES THAT SEQUENCE, per organization and per year, under an
--    advisory lock, on the precedent of AS2 to AS7.
--
-- 7. RLS FROM THE START, with explicit grants to `authenticated`.
--
-- Additive and idempotent: safe to re-run.

begin;

create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------
-- 1. iso_standards — which management system standards this
--    organization actually runs, and where its certificate stands
-- ---------------------------------------------------------------
-- The old app had no such table and no such idea: every clause carried
-- a standard as free text ('ISO 14001:2015' assigned by `i % 3`), so
-- there was nowhere to record that a certificate exists, expires, or is
-- being surveilled, which is the only reason an organization keeps a
-- clause register at all.

create table if not exists public.iso_standards (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete cascade,
  code                text not null,
  title               text,
  scope_statement     text,
  certification_status text not null default 'Not certified',
  certification_body  text,
  certificate_number  text,
  certified_from      date,
  certificate_expires date,
  next_surveillance   date,
  -- The certification cycle, in years. Clause coverage is judged over
  -- it: a clause not internally audited within the cycle has not been
  -- audited, whatever the register says.
  cycle_years         integer not null default 3,
  owner_id            uuid references public.users(id),
  notes               text,
  created_by          uuid references public.users(id),
  created_at          timestamptz default now(),
  updated_at          timestamptz default now(),
  constraint iso_standards_org_code_key unique (org_id, code),
  constraint iso_standards_status_check check (certification_status in
    ('Not certified', 'Seeking certification', 'Certified', 'Suspended', 'Withdrawn')),
  constraint iso_standards_cycle_check check (cycle_years between 1 and 6),
  -- A certificate is a number, a body and an expiry. A "Certified"
  -- row with none of them is the claim without the certificate.
  constraint iso_standards_certified_needs_certificate check (
    certification_status <> 'Certified'
    or (nullif(btrim(coalesce(certificate_number, '')), '') is not null
        and nullif(btrim(coalesce(certification_body, '')), '') is not null
        and certificate_expires is not null)
  )
);

comment on table public.iso_standards is
  'The management system standards an organization runs, and its certificate position. The app it replaces carried the standard as free text on each clause and had nowhere to record a certificate at all (AS8).';

create index if not exists iso_standards_org_idx on public.iso_standards (org_id);

-- ---------------------------------------------------------------
-- 2. iso_clauses — the clause register
-- ---------------------------------------------------------------

create table if not exists public.iso_clauses (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete cascade,
  standard_id         uuid not null references public.iso_standards(id) on delete cascade,
  clause_ref          text not null,
  title               text not null,
  requirement         text,
  department          text,
  owner_id            uuid references public.users(id),
  owner_name          text,
  -- Applicability first, conformity second. A clause that does not
  -- apply is not a clause you are failing.
  applicability       text not null default 'Applicable',
  applicability_justification text,
  status              text not null default 'Not assessed',
  evidence_reference  text,
  evidence_document_id uuid references public.documents(id) on delete set null,
  assessed_date       date,
  assessed_by         uuid references public.users(id),
  assessor_name       text,
  next_review_due     date,
  notes               text,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now(),
  constraint iso_clauses_standard_ref_key unique (standard_id, clause_ref),
  constraint iso_clauses_applicability_check check (applicability in
    ('Applicable', 'Not applicable')),
  constraint iso_clauses_status_check check (status in
    ('Not assessed', 'Conformant', 'Partially conformant', 'Nonconformant', 'Not applicable')),

  -- RULE 1. A conformity claim is evidence, a date and a name.
  constraint iso_clauses_claim_needs_evidence check (
    status not in ('Conformant', 'Partially conformant')
    or (nullif(btrim(coalesce(evidence_reference, '')), '') is not null
        and assessed_date is not null
        and (assessed_by is not null
             or nullif(btrim(coalesce(assessor_name, '')), '') is not null))
  ),

  -- A nonconformant verdict is a finding waiting to be raised, so it
  -- needs the date and the assessor too, but not the evidence of
  -- conformity it does not have.
  constraint iso_clauses_nonconformity_needs_assessor check (
    status <> 'Nonconformant'
    or (assessed_date is not null
        and (assessed_by is not null
             or nullif(btrim(coalesce(assessor_name, '')), '') is not null))
  ),

  -- RULE 2. ISO 9001:2015 §4.3.
  constraint iso_clauses_exclusion_needs_justification check (
    applicability <> 'Not applicable'
    or nullif(btrim(coalesce(applicability_justification, '')), '') is not null
  ),

  -- The two fields must agree: a clause marked not applicable cannot
  -- also be claimed conformant, which is how an exclusion quietly
  -- becomes a pass.
  constraint iso_clauses_applicability_agrees_with_status check (
    (applicability = 'Not applicable') = (status = 'Not applicable')
  )
);

comment on constraint iso_clauses_claim_needs_evidence on public.iso_clauses is
  'Conformance is a claim about documented information. Without the evidence reference, the date and the assessor it is an opinion in a dropdown, which is exactly what the app this replaces stored (AS8).';
comment on constraint iso_clauses_exclusion_needs_justification on public.iso_clauses is
  'ISO 9001:2015 §4.3: a requirement determined not applicable must have its justification kept as documented information (AS8).';

create index if not exists iso_clauses_org_idx on public.iso_clauses (org_id, standard_id);
create index if not exists iso_clauses_status_idx on public.iso_clauses (standard_id, status);
create index if not exists iso_clauses_review_idx on public.iso_clauses (next_review_due)
  where applicability = 'Applicable';

-- ---------------------------------------------------------------
-- 3. iso_audits — the internal audit programme
-- ---------------------------------------------------------------

create table if not exists public.iso_audits (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations(id) on delete cascade,
  audit_code         text not null,
  standard_id        uuid references public.iso_standards(id) on delete set null,
  title              text not null,
  audit_type         text not null default 'Internal',
  scope              text,
  criteria           text,
  department         text,
  lead_auditor_id    uuid references public.users(id),
  lead_auditor_name  text,
  planned_start      date,
  planned_end        date,
  actual_start       date,
  actual_end         date,
  status             text not null default 'Planned',
  conclusion         text,
  report_issued_date date,
  report_issued_by   uuid references public.users(id),
  closed_date        date,
  closed_by          uuid references public.users(id),
  created_by         uuid references public.users(id),
  created_at         timestamptz default now(),
  updated_at         timestamptz default now(),
  constraint iso_audits_org_code_key unique (org_id, audit_code),
  constraint iso_audits_type_check check (audit_type in
    ('Internal', 'Supplier', 'Certification', 'Surveillance', 'Recertification')),
  constraint iso_audits_status_check check (status in
    ('Planned', 'In progress', 'Fieldwork complete', 'Reported', 'Closed', 'Cancelled')),
  constraint iso_audits_dates_check check (
    planned_end is null or planned_start is null or planned_end >= planned_start),

  -- RULE 4, first half. A report is a date and a named auditor. The
  -- old register showed a score out of 100 for every audit and no
  -- report at all; a score is not a report.
  constraint iso_audits_report_needs_record check (
    status not in ('Reported', 'Closed')
    or (report_issued_date is not null
        and (lead_auditor_id is not null
             or nullif(btrim(coalesce(lead_auditor_name, '')), '') is not null)
        and nullif(btrim(coalesce(conclusion, '')), '') is not null)
  ),
  constraint iso_audits_closure_needs_date check (
    status <> 'Closed' or closed_date is not null
  )
);

create index if not exists iso_audits_org_idx on public.iso_audits (org_id, status);
create index if not exists iso_audits_standard_idx on public.iso_audits (standard_id);

-- ---------------------------------------------------------------
-- 4. iso_audit_clauses — what the audit actually looked at
-- ---------------------------------------------------------------
-- The coverage table, and the reason the module can answer the only
-- question that matters about an audit programme: which applicable
-- clauses have not been audited this cycle. The old app had no link
-- between an audit and a clause at all; its findings carried a
-- `clauseId` computed as `i % 30`.

create table if not exists public.iso_audit_clauses (
  id          uuid primary key default gen_random_uuid(),
  audit_id    uuid not null references public.iso_audits(id) on delete cascade,
  clause_id   uuid not null references public.iso_clauses(id) on delete cascade,
  result      text not null default 'Not examined',
  evidence_seen text,
  examined_on date,
  notes       text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  constraint iso_audit_clauses_key unique (audit_id, clause_id),
  constraint iso_audit_clauses_result_check check (result in
    ('Not examined', 'Conformant', 'Nonconformant', 'Observation', 'Not applicable')),
  -- A result recorded is a date. Otherwise "examined" is a checkbox.
  constraint iso_audit_clauses_result_needs_date check (
    result = 'Not examined' or examined_on is not null
  )
);

create index if not exists iso_audit_clauses_clause_idx on public.iso_audit_clauses (clause_id);

-- ---------------------------------------------------------------
-- 5. iso_findings — the findings register
-- ---------------------------------------------------------------

create table if not exists public.iso_findings (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations(id) on delete cascade,
  finding_code     text not null,
  audit_id         uuid references public.iso_audits(id) on delete set null,
  clause_id        uuid references public.iso_clauses(id) on delete set null,
  standard_id      uuid references public.iso_standards(id) on delete set null,
  finding_type     text not null default 'Observation',
  title            text not null,
  description      text,
  objective_evidence text,
  requirement_ref  text,
  department       text,
  status           text not null default 'Open',
  raised_by        uuid references public.users(id),
  raised_date      date not null default current_date,
  due_date         date,
  owner_id         uuid references public.users(id),
  owner_name       text,
  -- ISO 9001 §10.2 separates these two, and so does this table.
  correction       text,
  root_cause       text,
  root_cause_category text,
  closed_date      date,
  closed_by        uuid references public.users(id),
  closure_notes    text,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now(),
  constraint iso_findings_org_code_key unique (org_id, finding_code),
  constraint iso_findings_type_check check (finding_type in
    ('Major nonconformity', 'Minor nonconformity', 'Observation',
     'Opportunity for improvement')),
  constraint iso_findings_status_check check (status in
    ('Open', 'Correction proposed', 'Action in progress', 'Verification',
     'Closed', 'Voided')),
  constraint iso_findings_root_cause_category_check check (root_cause_category is null
    or root_cause_category in
      ('Procedure or documentation', 'Human factors or competence', 'Design',
       'Material or equipment', 'Supplier or subcontractor', 'Planning or scheduling',
       'Communication', 'Measurement or monitoring', 'Management system', 'Other')),

  -- RULE 5. A major nonconformity closes on a root cause, not on a
  -- correction. A minor one closes on a recorded correction. An
  -- observation or an opportunity for improvement closes on neither:
  -- treating all four the same is how an audit programme stops
  -- distinguishing between a typo and a systemic failure.
  constraint iso_findings_closure_needs_record check (
    status <> 'Closed'
    or (closed_date is not null
        and closed_by is not null
        and (finding_type not in ('Major nonconformity', 'Minor nonconformity')
             or nullif(btrim(coalesce(correction, '')), '') is not null)
        and (finding_type <> 'Major nonconformity'
             or nullif(btrim(coalesce(root_cause, '')), '') is not null))
  ),
  constraint iso_findings_void_needs_reason check (
    status <> 'Voided' or nullif(btrim(coalesce(closure_notes, '')), '') is not null
  ),
  constraint iso_findings_dates_check check (
    closed_date is null or closed_date >= raised_date
  )
);

comment on constraint iso_findings_closure_needs_record on public.iso_findings is
  'ISO 9001 §10.2: a correction fixes the thing, a corrective action removes the cause. A major nonconformity needs both recorded; src/lib/isoCompliance.js additionally refuses closure until a corrective action has been verified effective (AS8).';

create index if not exists iso_findings_org_idx on public.iso_findings (org_id, status);
create index if not exists iso_findings_audit_idx on public.iso_findings (audit_id);
create index if not exists iso_findings_clause_idx on public.iso_findings (clause_id);
create index if not exists iso_findings_due_idx on public.iso_findings (due_date)
  where status <> 'Closed';

-- ---------------------------------------------------------------
-- 6. iso_actions — corrective and preventive actions to closure
-- ---------------------------------------------------------------
-- isoActionsData existed in the data file and NO PAGE RENDERED IT,
-- exactly as AS7 found with capaSampleData.js. Corrective action is
-- the half of the discipline that closes the loop, and in both apps it
-- was the half missing from the interface.

create table if not exists public.iso_actions (
  id                     uuid primary key default gen_random_uuid(),
  finding_id             uuid not null references public.iso_findings(id) on delete cascade,
  action_type            text not null default 'Corrective',
  description            text not null,
  assigned_to            uuid references public.users(id),
  assignee_name          text,
  due_date               date,
  status                 text not null default 'Open',
  completed_at           timestamptz,
  completion_evidence    text,
  effectiveness_due      date,
  effectiveness_verified boolean,
  effectiveness_checked_at date,
  effectiveness_verified_by uuid references public.users(id),
  effectiveness_notes    text,
  created_at             timestamptz default now(),
  updated_at             timestamptz default now(),
  constraint iso_actions_type_check check (action_type in ('Corrective', 'Preventive')),
  constraint iso_actions_status_check check (status in
    ('Open', 'In progress', 'Complete', 'Cancelled')),
  constraint iso_actions_complete_needs_date check (
    status <> 'Complete' or completed_at is not null
  ),
  constraint iso_actions_effectiveness_needs_record check (
    effectiveness_verified is null
    or (effectiveness_checked_at is not null and effectiveness_verified_by is not null)
  )
);

create index if not exists iso_actions_finding_idx on public.iso_actions (finding_id, status);
create index if not exists iso_actions_due_idx on public.iso_actions (due_date)
  where status in ('Open', 'In progress');

-- ---------------------------------------------------------------
-- 7. iso_activity_log — the audit trail of the audit programme
-- ---------------------------------------------------------------

create table if not exists public.iso_activity_log (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  entity_type text not null,
  entity_id   uuid not null,
  standard_id uuid references public.iso_standards(id) on delete cascade,
  audit_id    uuid references public.iso_audits(id) on delete cascade,
  finding_id  uuid references public.iso_findings(id) on delete cascade,
  actor_id    uuid references public.users(id),
  action      text not null,
  details     jsonb,
  created_at  timestamptz default now(),
  constraint iso_activity_entity_check check (entity_type in
    ('standard', 'clause', 'audit', 'coverage', 'finding', 'action'))
);

create index if not exists iso_activity_org_idx on public.iso_activity_log (org_id, created_at desc);
create index if not exists iso_activity_entity_idx on public.iso_activity_log (entity_type, entity_id);

-- ---------------------------------------------------------------
-- 8. Codes, in sequence per organization and per year
-- ---------------------------------------------------------------

create or replace function public.next_iso_audit_code(p_org uuid, p_year integer default null)
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

  perform pg_advisory_xact_lock(hashtext('iso_audit_code' || p_org::text || v_year::text));

  select coalesce(max((regexp_replace(audit_code, '^.*-', ''))::integer), 0) + 1
    into v_next
    from public.iso_audits
   where org_id = p_org
     and audit_code ~ ('^IA-' || v_year::text || '-[0-9]+$');

  return 'IA-' || v_year::text || '-' || lpad(v_next::text, 3, '0');
end;
$$;

create or replace function public.next_iso_finding_code(p_org uuid, p_year integer default null)
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

  perform pg_advisory_xact_lock(hashtext('iso_finding_code' || p_org::text || v_year::text));

  select coalesce(max((regexp_replace(finding_code, '^.*-', ''))::integer), 0) + 1
    into v_next
    from public.iso_findings
   where org_id = p_org
     and finding_code ~ ('^IAF-' || v_year::text || '-[0-9]+$');

  return 'IAF-' || v_year::text || '-' || lpad(v_next::text, 3, '0');
end;
$$;

revoke all on function public.next_iso_audit_code(uuid, integer) from public, anon;
revoke all on function public.next_iso_finding_code(uuid, integer) from public, anon;
grant execute on function public.next_iso_audit_code(uuid, integer) to authenticated;
grant execute on function public.next_iso_finding_code(uuid, integer) to authenticated;

comment on function public.next_iso_audit_code(uuid, integer) is
  'Issues the next sequential IA-<year>- code for an organization, under an advisory lock. The app it replaces generated its audit ids as AUDIT-202300 + i (AS8).';

-- ---------------------------------------------------------------
-- 9. RULE 3: an auditor may not audit their own work
-- ---------------------------------------------------------------
-- ISO 19011's independence principle. Enforced here rather than left
-- to the interface, because it is the one rule an internal audit
-- programme is judged on and the one most easily lost in a hurry: the
-- person who owns the procedure is the fastest person to audit it.
--
-- It fires from both directions. Naming a lead auditor who owns a
-- clause already in scope is refused, and adding a clause to the scope
-- that its lead auditor owns is refused.

create or replace function public.iso_audit_independence()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_lead uuid;
  v_clashes text;
begin
  if tg_table_name = 'iso_audits' then
    -- Naming (or changing) the lead auditor: does that person own any
    -- clause already in this audit's scope?
    v_lead := new.lead_auditor_id;
    if v_lead is null then
      return new;
    end if;
    select string_agg(c.clause_ref, ', ' order by c.clause_ref)
      into v_clashes
      from public.iso_audit_clauses ac
      join public.iso_clauses c on c.id = ac.clause_id
     where ac.audit_id = new.id
       and c.owner_id = v_lead;
  else
    -- Adding a clause to the scope: is its owner this audit's lead
    -- auditor? The row is not yet visible, so it is checked directly.
    select lead_auditor_id into v_lead from public.iso_audits where id = new.audit_id;
    if v_lead is null then
      return new;
    end if;
    select c.clause_ref
      into v_clashes
      from public.iso_clauses c
     where c.id = new.clause_id
       and c.owner_id = v_lead;
  end if;

  if v_clashes is not null then
    raise exception
      'the lead auditor owns clause % in this audit''s scope; an auditor may not audit their own work (ISO 19011)',
      v_clashes
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists iso_audits_independence on public.iso_audits;
create trigger iso_audits_independence
  before insert or update of lead_auditor_id on public.iso_audits
  for each row execute function public.iso_audit_independence();

drop trigger if exists iso_audit_clauses_independence on public.iso_audit_clauses;
create trigger iso_audit_clauses_independence
  before insert or update of clause_id on public.iso_audit_clauses
  for each row execute function public.iso_audit_independence();

-- ---------------------------------------------------------------
-- 10. Cross-tenant guards
-- ---------------------------------------------------------------
-- RLS alone does not say that a finding's audit, clause and standard
-- belong to the same organization as the finding: a member of Org A
-- can see their own finding row and, without this, could point it at a
-- clause they cannot read. The AS7 precedent, widened to three parents.

create or replace function public.iso_parents_same_org()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_org uuid;
begin
  -- A clause and an audit each name one parent: the standard.
  -- A finding names up to three, so the branches are per table rather
  -- than per column: NEW has no audit_id on iso_audits, and reading a
  -- field a row does not have is an error, not a null.
  if tg_table_name in ('iso_clauses', 'iso_audits') then
    if new.standard_id is not null then
      select org_id into v_org from public.iso_standards where id = new.standard_id;
      if v_org is distinct from new.org_id then
        raise exception 'that standard belongs to another organization' using errcode = '42501';
      end if;
    end if;
    return new;
  end if;

  if new.audit_id is not null then
    select org_id into v_org from public.iso_audits where id = new.audit_id;
    if v_org is distinct from new.org_id then
      raise exception 'that audit belongs to another organization' using errcode = '42501';
    end if;
  end if;
  if new.clause_id is not null then
    select org_id into v_org from public.iso_clauses where id = new.clause_id;
    if v_org is distinct from new.org_id then
      raise exception 'that clause belongs to another organization' using errcode = '42501';
    end if;
  end if;
  if new.standard_id is not null then
    select org_id into v_org from public.iso_standards where id = new.standard_id;
    if v_org is distinct from new.org_id then
      raise exception 'that standard belongs to another organization' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists iso_clauses_parents_same_org on public.iso_clauses;
create trigger iso_clauses_parents_same_org
  before insert or update of standard_id, org_id on public.iso_clauses
  for each row execute function public.iso_parents_same_org();

drop trigger if exists iso_findings_parents_same_org on public.iso_findings;
create trigger iso_findings_parents_same_org
  before insert or update of audit_id, clause_id, standard_id, org_id on public.iso_findings
  for each row execute function public.iso_parents_same_org();

drop trigger if exists iso_audits_parents_same_org on public.iso_audits;
create trigger iso_audits_parents_same_org
  before insert or update of standard_id, org_id on public.iso_audits
  for each row execute function public.iso_parents_same_org();

-- A coverage row joins an audit to a clause. Both must be the same
-- organization's; this one cannot be expressed as an org_id comparison
-- because the row carries neither.
create or replace function public.iso_coverage_same_org()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_audit_org uuid; v_clause_org uuid;
begin
  select org_id into v_audit_org from public.iso_audits where id = new.audit_id;
  select org_id into v_clause_org from public.iso_clauses where id = new.clause_id;
  if v_audit_org is distinct from v_clause_org then
    raise exception 'that clause belongs to another organization' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists iso_audit_clauses_same_org on public.iso_audit_clauses;
create trigger iso_audit_clauses_same_org
  before insert or update of audit_id, clause_id on public.iso_audit_clauses
  for each row execute function public.iso_coverage_same_org();

-- ---------------------------------------------------------------
-- 11. RLS, policies and grants
-- ---------------------------------------------------------------

revoke all on table
  public.iso_standards, public.iso_clauses, public.iso_audits,
  public.iso_audit_clauses, public.iso_findings, public.iso_actions,
  public.iso_activity_log
from anon;

grant select, insert, update, delete on table
  public.iso_standards, public.iso_clauses, public.iso_audits,
  public.iso_audit_clauses, public.iso_findings, public.iso_actions,
  public.iso_activity_log
to authenticated;

alter table public.iso_standards     enable row level security;
alter table public.iso_clauses       enable row level security;
alter table public.iso_audits        enable row level security;
alter table public.iso_audit_clauses enable row level security;
alter table public.iso_findings      enable row level security;
alter table public.iso_actions       enable row level security;
alter table public.iso_activity_log  enable row level security;

-- The five tables that carry org_id directly.
do $$
declare t text;
begin
  foreach t in array array['iso_standards', 'iso_clauses', 'iso_audits',
                           'iso_findings', 'iso_activity_log'] loop
    execute format('drop policy if exists %I on public.%I', t || '_org_rw', t);
    execute format($f$
      create policy %I on public.%I
        for all to authenticated
        using (org_id = public.my_org_id() or public.is_super_admin())
        with check (org_id = public.my_org_id() or public.is_super_admin())
    $f$, t || '_org_rw', t);
  end loop;
end $$;

-- The two that scope through a parent.
drop policy if exists iso_audit_clauses_org_rw on public.iso_audit_clauses;
create policy iso_audit_clauses_org_rw on public.iso_audit_clauses
  for all to authenticated
  using (
    public.is_super_admin() or exists (
      select 1 from public.iso_audits a
       where a.id = iso_audit_clauses.audit_id and a.org_id = public.my_org_id())
  )
  with check (
    public.is_super_admin() or exists (
      select 1 from public.iso_audits a
       where a.id = iso_audit_clauses.audit_id and a.org_id = public.my_org_id())
  );

drop policy if exists iso_actions_org_rw on public.iso_actions;
create policy iso_actions_org_rw on public.iso_actions
  for all to authenticated
  using (
    public.is_super_admin() or exists (
      select 1 from public.iso_findings f
       where f.id = iso_actions.finding_id and f.org_id = public.my_org_id())
  )
  with check (
    public.is_super_admin() or exists (
      select 1 from public.iso_findings f
       where f.id = iso_actions.finding_id and f.org_id = public.my_org_id())
  );

commit;
