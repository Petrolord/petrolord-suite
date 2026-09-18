-- AS10 — Audit & Findings Manager: a new app, and the schema for it
-- (Assurance-ROADMAP.md §3 app 9).
--
-- This wave is not a rebuild. It is the one app in the module that
-- never existed at all: two Active, sellable tiles —
-- `safety-audit-manager` and `audit-trail-manager` — with NO CODE OF
-- ANY KIND behind either of them. No route in App.jsx, no page, no
-- component, nothing but a marketing entry a customer could buy. AS1
-- archived both and recorded that they would be rebuilt together here,
-- as one app that seeds its own tile.
--
-- What it is for: the audit programme an operator actually runs
-- outside its ISO management system — contractor and supplier audits,
-- HSE and permit-to-work audits, process and operational audits —
-- executed against a CHECKLIST rather than against the clauses of a
-- standard, with findings carried to closure.
--
-- WHY THIS IS NOT iso_audits (a decision, recorded rather than
-- assumed). AS8's audit is an audit of a management system: its scope
-- is a set of clauses, and `iso_audit_clauses` is its coverage record
-- over a certification cycle. A contractor HSE audit has no clauses
-- and no certification cycle; it has a protocol of questions, an
-- auditee, and answers. Forcing either shape onto the other would
-- damage both. What the two DO share — the lifecycle of an audit, the
-- vocabulary of a finding, and the rules for closing one — is shared
-- in code rather than copied: `audit_findings` and `audit_actions`
-- carry the same column names and the same vocabularies as
-- `iso_findings` and `iso_actions` ON PURPOSE, so
-- src/lib/auditManagement.js imports AS8's canCloseFinding and AS7's
-- effectiveness rules instead of restating them
-- (Assurance-ROADMAP.md §6: one authority per concept).
--
-- The rules this migration enforces:
--
-- 1. AN AUDIT IS NOT REPORTED WITH HALF ITS CHECKLIST BLANK, AND
--    "NOT APPLICABLE" IS AN ANSWER THAT NEEDS A REASON. The classic
--    failure of a paper audit programme is a 120-item protocol
--    returned with 40 items untouched and a report saying no findings
--    were raised. Every item of the protocol must carry a result
--    before the audit reports, and an item dismissed as not applicable
--    must say why — otherwise "not applicable" is how an auditor
--    empties a checklist they have run out of time for.
--
-- 2. A NONCONFORMANT ANSWER ON A CRITICAL ITEM MUST RAISE A FINDING.
--    This is what makes a checklist a control rather than a form. An
--    auditor may answer a critical question Nonconformant and write a
--    note; the audit will not report until that answer has a finding
--    against it, with a number, an owner and a due date.
--
-- 3. A STOP-WORK FINDING RECORDS WHAT WAS DONE ABOUT IT IMMEDIATELY.
--    Imminent danger is the one finding class that cannot wait for the
--    corrective action cycle. A finding marked stop-work carries its
--    immediate correction from the moment it is raised, not at
--    closure.
--
-- 4. AN AUDITOR MAY NOT AUDIT THEIR OWN AREA. The module's fourth
--    independence rule, after AS5's peer reviewer, AS8's ISO 19011
--    auditor and AS9's lesson author. Here it is the lead auditor and
--    the auditee: the person answering for the area cannot be the
--    person auditing it.
--
-- 5. A PROGRAMME IS COMPLETE WHEN ITS AUDITS ARE, NOT WHEN THE YEAR
--    ENDS. An annual audit programme marked complete with four of its
--    ten audits never performed is the document that gets shown to a
--    certification body. A programme cannot be completed while an
--    audit in it is neither reported nor cancelled with a reason.
--
-- 6. Codes that sequence per organization and per year, RLS from the
--    start with explicit grants, and cross-tenant guards on every
--    parent key.
--
-- Additive and idempotent: safe to re-run.

begin;

create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------
-- 1. audit_programmes — the plan, and what became of it
-- ---------------------------------------------------------------

create table if not exists public.audit_programmes (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  title         text not null,
  programme_year integer not null,
  objective     text,
  scope_statement text,
  owner_id      uuid references public.users(id),
  owner_name    text,
  status        text not null default 'Draft',
  approved_by   uuid references public.users(id),
  approver_name text,
  approved_at   date,
  completed_at  date,
  notes         text,
  created_by    uuid references public.users(id),
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  constraint audit_programmes_org_title_year_key unique (org_id, title, programme_year),
  constraint audit_programmes_year_check check (programme_year between 2000 and 2100),
  constraint audit_programmes_status_check check (status in
    ('Draft', 'Approved', 'In progress', 'Complete', 'Cancelled')),
  -- An approved programme is a decision somebody made on a date.
  constraint audit_programmes_approval_needs_record check (
    status not in ('Approved', 'In progress', 'Complete')
    or (approved_at is not null
        and (approved_by is not null
             or nullif(btrim(coalesce(approver_name, '')), '') is not null))
  ),
  constraint audit_programmes_complete_needs_date check (
    status <> 'Complete' or completed_at is not null
  )
);

comment on table public.audit_programmes is
  'The audit programme: what an organization planned to audit this year. Completion is judged against the audits in it, not against the calendar (AS10).';

create index if not exists audit_programmes_org_idx
  on public.audit_programmes (org_id, programme_year desc);

-- ---------------------------------------------------------------
-- 2. audit_templates and audit_template_items — the protocol
-- ---------------------------------------------------------------
-- The checklist is the difference between this app and AS8's ISO
-- audit: an audit here is executed against a protocol of questions,
-- and the protocol is reusable across audits so two contractor audits
-- can be compared.

create table if not exists public.audit_templates (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  code        text not null,
  title       text not null,
  description text,
  audit_type  text not null default 'Safety',
  version     text,
  status      text not null default 'Draft',
  created_by  uuid references public.users(id),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  constraint audit_templates_org_code_key unique (org_id, code),
  constraint audit_templates_type_check check (audit_type in
    ('Safety', 'Environmental', 'Contractor', 'Supplier', 'Process',
     'Operational', 'Permit to work', 'Management system', 'Other')),
  constraint audit_templates_status_check check (status in ('Draft', 'Active', 'Retired'))
);

create index if not exists audit_templates_org_idx on public.audit_templates (org_id, status);

create table if not exists public.audit_template_items (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.audit_templates(id) on delete cascade,
  section     text,
  item_no     text not null,
  sequence    integer,
  question    text not null,
  guidance    text,
  reference   text,
  -- Criticality drives rule 2: a critical question answered
  -- Nonconformant must raise a finding before the audit reports.
  criticality text not null default 'Minor',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  constraint audit_template_items_key unique (template_id, item_no),
  constraint audit_template_items_criticality_check check (criticality in
    ('Critical', 'Major', 'Minor'))
);

create index if not exists audit_template_items_template_idx
  on public.audit_template_items (template_id, sequence);

-- ---------------------------------------------------------------
-- 3. audit_records — one audit
-- ---------------------------------------------------------------

create table if not exists public.audit_records (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations(id) on delete cascade,
  audit_code         text not null,
  programme_id       uuid references public.audit_programmes(id) on delete set null,
  template_id        uuid references public.audit_templates(id) on delete set null,
  title              text not null,
  audit_type         text not null default 'Safety',
  scope              text,
  criteria           text,
  site               text,
  asset_id           text,
  department         text,
  contractor         text,
  -- The person answering for the area, and the person auditing it.
  -- Rule 4 keeps them apart.
  auditee_id         uuid references public.users(id),
  auditee_name       text,
  lead_auditor_id    uuid references public.users(id),
  lead_auditor_name  text,
  audit_team         text,
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
  cancellation_reason text,
  created_by         uuid references public.users(id),
  created_at         timestamptz default now(),
  updated_at         timestamptz default now(),

  constraint audit_records_org_code_key unique (org_id, audit_code),
  constraint audit_records_type_check check (audit_type in
    ('Safety', 'Environmental', 'Contractor', 'Supplier', 'Process',
     'Operational', 'Permit to work', 'Management system', 'Other')),
  constraint audit_records_status_check check (status in
    ('Planned', 'In progress', 'Fieldwork complete', 'Reported', 'Closed', 'Cancelled')),
  constraint audit_records_dates_check check (
    planned_end is null or planned_start is null or planned_end >= planned_start),

  -- As in AS8: a report is a date, a named auditor and a conclusion.
  constraint audit_records_report_needs_record check (
    status not in ('Reported', 'Closed')
    or (report_issued_date is not null
        and (lead_auditor_id is not null
             or nullif(btrim(coalesce(lead_auditor_name, '')), '') is not null)
        and nullif(btrim(coalesce(conclusion, '')), '') is not null)
  ),
  constraint audit_records_closure_needs_date check (
    status <> 'Closed' or closed_date is not null
  ),
  -- Rule 5's other half: an audit that did not happen says why, so a
  -- programme's completion can be read honestly.
  constraint audit_records_cancel_needs_reason check (
    status <> 'Cancelled' or nullif(btrim(coalesce(cancellation_reason, '')), '') is not null
  )
);

create index if not exists audit_records_org_idx on public.audit_records (org_id, status);
create index if not exists audit_records_programme_idx on public.audit_records (programme_id);
create index if not exists audit_records_planned_idx on public.audit_records (planned_end)
  where status in ('Planned', 'In progress', 'Fieldwork complete');

-- ---------------------------------------------------------------
-- 4. audit_responses — the checklist, answered
-- ---------------------------------------------------------------

create table if not exists public.audit_responses (
  id          uuid primary key default gen_random_uuid(),
  audit_id    uuid not null references public.audit_records(id) on delete cascade,
  item_id     uuid not null references public.audit_template_items(id) on delete cascade,
  result      text not null default 'Not examined',
  evidence    text,
  note        text,
  examined_on date,
  examined_by uuid references public.users(id),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),

  constraint audit_responses_key unique (audit_id, item_id),
  constraint audit_responses_result_check check (result in
    ('Not examined', 'Conformant', 'Nonconformant', 'Observation', 'Not applicable')),
  -- An answer is a date. Otherwise "examined" is a checkbox.
  constraint audit_responses_answer_needs_date check (
    result = 'Not examined' or examined_on is not null
  ),
  -- RULE 1, second half. "Not applicable" is an answer, and an answer
  -- has a reason; without one it is the fastest way to empty a
  -- checklist nobody had time to work through.
  constraint audit_responses_na_needs_reason check (
    result <> 'Not applicable' or nullif(btrim(coalesce(note, '')), '') is not null
  ),
  -- A nonconformity is an assertion about what was seen.
  constraint audit_responses_nonconformity_needs_evidence check (
    result <> 'Nonconformant'
    or nullif(btrim(coalesce(evidence, '')), '') is not null
  )
);

comment on constraint audit_responses_na_needs_reason on public.audit_responses is
  'Not applicable is an answer, and an answer has a reason. Without this it is the fastest way to empty a checklist nobody had time to finish (AS10).';

create index if not exists audit_responses_audit_idx on public.audit_responses (audit_id, result);
create index if not exists audit_responses_item_idx on public.audit_responses (item_id);

-- ---------------------------------------------------------------
-- 5. audit_findings — deliberately the same shape as iso_findings
-- ---------------------------------------------------------------

create table if not exists public.audit_findings (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations(id) on delete cascade,
  finding_code     text not null,
  audit_id         uuid references public.audit_records(id) on delete set null,
  -- The checklist answer this came from, which is what makes rule 2
  -- checkable.
  response_id      uuid references public.audit_responses(id) on delete set null,
  finding_type     text not null default 'Observation',
  -- The one class that cannot wait for the corrective action cycle.
  stop_work        boolean not null default false,
  title            text not null,
  description      text,
  objective_evidence text,
  requirement_ref  text,
  department       text,
  site             text,
  status           text not null default 'Open',
  raised_by        uuid references public.users(id),
  raised_date      date not null default current_date,
  due_date         date,
  owner_id         uuid references public.users(id),
  owner_name       text,
  correction       text,
  root_cause       text,
  root_cause_category text,
  closed_date      date,
  closed_by        uuid references public.users(id),
  closure_notes    text,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now(),

  constraint audit_findings_org_code_key unique (org_id, finding_code),
  -- The AS8 vocabulary, unchanged, so the two apps' findings can be
  -- counted together and one module can close both.
  constraint audit_findings_type_check check (finding_type in
    ('Major nonconformity', 'Minor nonconformity', 'Observation',
     'Opportunity for improvement')),
  constraint audit_findings_status_check check (status in
    ('Open', 'Correction proposed', 'Action in progress', 'Verification',
     'Closed', 'Voided')),
  constraint audit_findings_root_cause_category_check check (root_cause_category is null
    or root_cause_category in
      ('Procedure or documentation', 'Human factors or competence', 'Design',
       'Material or equipment', 'Supplier or subcontractor', 'Planning or scheduling',
       'Communication', 'Measurement or monitoring', 'Management system', 'Other')),

  -- RULE 3. Imminent danger is dealt with on the spot; the record of
  -- what was done exists from the moment the finding is raised.
  constraint audit_findings_stop_work_needs_correction check (
    stop_work is not true
    or nullif(btrim(coalesce(correction, '')), '') is not null
  ),
  -- And a stop-work finding is never an observation.
  constraint audit_findings_stop_work_is_a_nonconformity check (
    stop_work is not true
    or finding_type in ('Major nonconformity', 'Minor nonconformity')
  ),

  -- ISO 9001 §10.2, as AS8: the correction deals with the thing, the
  -- root cause with the cause.
  constraint audit_findings_closure_needs_record check (
    status <> 'Closed'
    or (closed_date is not null
        and closed_by is not null
        and (finding_type not in ('Major nonconformity', 'Minor nonconformity')
             or nullif(btrim(coalesce(correction, '')), '') is not null)
        and (finding_type <> 'Major nonconformity'
             or nullif(btrim(coalesce(root_cause, '')), '') is not null))
  ),
  constraint audit_findings_void_needs_reason check (
    status <> 'Voided' or nullif(btrim(coalesce(closure_notes, '')), '') is not null
  ),
  constraint audit_findings_dates_check check (
    closed_date is null or closed_date >= raised_date
  )
);

comment on constraint audit_findings_stop_work_needs_correction on public.audit_findings is
  'A finding that stopped work records what was done about it at the time, not at closure. Imminent danger does not wait for the corrective action cycle (AS10).';

create index if not exists audit_findings_org_idx on public.audit_findings (org_id, status);
create index if not exists audit_findings_audit_idx on public.audit_findings (audit_id);
create index if not exists audit_findings_response_idx on public.audit_findings (response_id);
create index if not exists audit_findings_due_idx on public.audit_findings (due_date)
  where status <> 'Closed';

-- ---------------------------------------------------------------
-- 6. audit_actions — identical in shape to iso_actions and qa_capas
-- ---------------------------------------------------------------

create table if not exists public.audit_actions (
  id                     uuid primary key default gen_random_uuid(),
  finding_id             uuid not null references public.audit_findings(id) on delete cascade,
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
  constraint audit_actions_type_check check (action_type in ('Corrective', 'Preventive')),
  constraint audit_actions_status_check check (status in
    ('Open', 'In progress', 'Complete', 'Cancelled')),
  constraint audit_actions_complete_needs_date check (
    status <> 'Complete' or completed_at is not null
  ),
  constraint audit_actions_effectiveness_needs_record check (
    effectiveness_verified is null
    or (effectiveness_checked_at is not null and effectiveness_verified_by is not null)
  )
);

create index if not exists audit_actions_finding_idx on public.audit_actions (finding_id, status);
create index if not exists audit_actions_due_idx on public.audit_actions (due_date)
  where status in ('Open', 'In progress');

-- ---------------------------------------------------------------
-- 7. audit_activity_log
-- ---------------------------------------------------------------

create table if not exists public.audit_activity_log (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  entity_type  text not null,
  entity_id    uuid not null,
  programme_id uuid references public.audit_programmes(id) on delete cascade,
  audit_id     uuid references public.audit_records(id) on delete cascade,
  finding_id   uuid references public.audit_findings(id) on delete cascade,
  actor_id     uuid references public.users(id),
  action       text not null,
  details      jsonb,
  created_at   timestamptz default now(),
  constraint audit_activity_entity_check check (entity_type in
    ('programme', 'template', 'audit', 'response', 'finding', 'action'))
);

create index if not exists audit_activity_org_idx
  on public.audit_activity_log (org_id, created_at desc);
create index if not exists audit_activity_entity_idx
  on public.audit_activity_log (entity_type, entity_id);

-- ---------------------------------------------------------------
-- 8. Codes, in sequence per organization and per year
-- ---------------------------------------------------------------

create or replace function public.next_audit_code(p_org uuid, p_year integer default null)
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

  perform pg_advisory_xact_lock(hashtext('audit_code' || p_org::text || v_year::text));

  select coalesce(max((regexp_replace(audit_code, '^.*-', ''))::integer), 0) + 1
    into v_next
    from public.audit_records
   where org_id = p_org
     and audit_code ~ ('^AUD-' || v_year::text || '-[0-9]+$');

  return 'AUD-' || v_year::text || '-' || lpad(v_next::text, 3, '0');
end;
$$;

create or replace function public.next_audit_finding_code(p_org uuid, p_year integer default null)
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

  perform pg_advisory_xact_lock(hashtext('audit_finding_code' || p_org::text || v_year::text));

  select coalesce(max((regexp_replace(finding_code, '^.*-', ''))::integer), 0) + 1
    into v_next
    from public.audit_findings
   where org_id = p_org
     and finding_code ~ ('^AF-' || v_year::text || '-[0-9]+$');

  return 'AF-' || v_year::text || '-' || lpad(v_next::text, 3, '0');
end;
$$;

revoke all on function public.next_audit_code(uuid, integer) from public, anon;
revoke all on function public.next_audit_finding_code(uuid, integer) from public, anon;
grant execute on function public.next_audit_code(uuid, integer) to authenticated;
grant execute on function public.next_audit_finding_code(uuid, integer) to authenticated;

comment on function public.next_audit_code(uuid, integer) is
  'Issues the next sequential AUD-<year>- code for an organization, under an advisory lock (AS10).';

-- ---------------------------------------------------------------
-- 9. RULE 4: an auditor may not audit their own area
-- ---------------------------------------------------------------
-- The module's fourth independence rule. An external lead auditor,
-- named in text with no Suite account, is independent by construction
-- and is not blocked.

create or replace function public.audit_lead_not_auditee()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.lead_auditor_id is not null
     and new.auditee_id is not null
     and new.lead_auditor_id = new.auditee_id then
    raise exception
      'the lead auditor is also the auditee for this audit; an auditor may not audit their own area'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists audit_records_lead_not_auditee on public.audit_records;
create trigger audit_records_lead_not_auditee
  before insert or update of lead_auditor_id, auditee_id on public.audit_records
  for each row execute function public.audit_lead_not_auditee();

-- ---------------------------------------------------------------
-- 10. RULES 1 and 2: what "reported" means
-- ---------------------------------------------------------------
-- Both need a count across another table, which a check constraint
-- cannot do, so they are one trigger on the status change.
--
-- An audit with no template is not held to rule 1: an ad-hoc audit
-- with no protocol has no checklist to leave blank. One WITH a
-- template must have answered all of it.

create or replace function public.audit_report_is_complete()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_unanswered integer;
  v_items integer;
  v_missing text;
begin
  if new.status not in ('Reported', 'Closed') then
    return new;
  end if;
  -- Editing an audit that is already reported is not re-reporting it.
  -- An INSERT straight into Reported has no OLD and is held to the
  -- gate like anything else: a fresh row has no answered checklist.
  if tg_op = 'UPDATE' and old.status in ('Reported', 'Closed') then
    return new;
  end if;

  if new.template_id is not null then
    select count(*) into v_items
      from public.audit_template_items where template_id = new.template_id;

    -- Items with no response row at all, plus responses left unanswered.
    select v_items - count(*) filter (where r.result <> 'Not examined')
      into v_unanswered
      from public.audit_responses r
     where r.audit_id = new.id;

    if v_unanswered > 0 then
      raise exception
        'this audit has % checklist item(s) with no answer; an audit reported with its checklist half blank is the failure this app exists to prevent',
        v_unanswered
        using errcode = '23514';
    end if;
  end if;

  -- RULE 2: a critical item answered Nonconformant needs a finding.
  select string_agg(i.item_no, ', ' order by i.item_no)
    into v_missing
    from public.audit_responses r
    join public.audit_template_items i on i.id = r.item_id
   where r.audit_id = new.id
     and r.result = 'Nonconformant'
     and i.criticality = 'Critical'
     and not exists (
       select 1 from public.audit_findings f
        where f.response_id = r.id and f.status <> 'Voided');

  if v_missing is not null then
    raise exception
      'critical checklist item(s) % were answered Nonconformant with no finding raised against them',
      v_missing
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists audit_records_report_is_complete on public.audit_records;
create trigger audit_records_report_is_complete
  before insert or update of status on public.audit_records
  for each row execute function public.audit_report_is_complete();

-- ---------------------------------------------------------------
-- 11. RULE 5: a programme is complete when its audits are
-- ---------------------------------------------------------------

create or replace function public.audit_programme_is_complete()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_outstanding integer;
begin
  if new.status <> 'Complete' then
    return new;
  end if;

  select count(*) into v_outstanding
    from public.audit_records
   where programme_id = new.id
     and status not in ('Reported', 'Closed', 'Cancelled');

  if v_outstanding > 0 then
    raise exception
      '% audit(s) in this programme have not been reported or cancelled; a programme marked complete over audits that never happened is the document a certification body will ask for',
      v_outstanding
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists audit_programmes_is_complete on public.audit_programmes;
create trigger audit_programmes_is_complete
  before insert or update of status on public.audit_programmes
  for each row execute function public.audit_programme_is_complete();

-- ---------------------------------------------------------------
-- 12. Cross-tenant guards
-- ---------------------------------------------------------------

create or replace function public.audit_parents_same_org()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_org uuid;
begin
  if tg_table_name = 'audit_records' then
    if new.programme_id is not null then
      select org_id into v_org from public.audit_programmes where id = new.programme_id;
      if v_org is distinct from new.org_id then
        raise exception 'that programme belongs to another organization' using errcode = '42501';
      end if;
    end if;
    if new.template_id is not null then
      select org_id into v_org from public.audit_templates where id = new.template_id;
      if v_org is distinct from new.org_id then
        raise exception 'that checklist belongs to another organization' using errcode = '42501';
      end if;
    end if;
    return new;
  end if;

  -- audit_findings
  if new.audit_id is not null then
    select org_id into v_org from public.audit_records where id = new.audit_id;
    if v_org is distinct from new.org_id then
      raise exception 'that audit belongs to another organization' using errcode = '42501';
    end if;
  end if;
  if new.response_id is not null then
    select a.org_id into v_org
      from public.audit_responses r join public.audit_records a on a.id = r.audit_id
     where r.id = new.response_id;
    if v_org is distinct from new.org_id then
      raise exception 'that checklist answer belongs to another organization'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists audit_records_parents_same_org on public.audit_records;
create trigger audit_records_parents_same_org
  before insert or update of programme_id, template_id, org_id on public.audit_records
  for each row execute function public.audit_parents_same_org();

drop trigger if exists audit_findings_parents_same_org on public.audit_findings;
create trigger audit_findings_parents_same_org
  before insert or update of audit_id, response_id, org_id on public.audit_findings
  for each row execute function public.audit_parents_same_org();

-- A response joins an audit to a checklist item; both must belong to
-- the same organization, and neither carries org_id itself.
create or replace function public.audit_response_same_org()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_audit_org uuid; v_item_org uuid;
begin
  select org_id into v_audit_org from public.audit_records where id = new.audit_id;
  select t.org_id into v_item_org
    from public.audit_template_items i join public.audit_templates t on t.id = i.template_id
   where i.id = new.item_id;
  if v_audit_org is distinct from v_item_org then
    raise exception 'that checklist item belongs to another organization' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists audit_responses_same_org on public.audit_responses;
create trigger audit_responses_same_org
  before insert or update of audit_id, item_id on public.audit_responses
  for each row execute function public.audit_response_same_org();

-- ---------------------------------------------------------------
-- 13. RLS, policies and grants
-- ---------------------------------------------------------------

revoke all on table
  public.audit_programmes, public.audit_templates, public.audit_template_items,
  public.audit_records, public.audit_responses, public.audit_findings,
  public.audit_actions, public.audit_activity_log
from anon;

grant select, insert, update, delete on table
  public.audit_programmes, public.audit_templates, public.audit_template_items,
  public.audit_records, public.audit_responses, public.audit_findings,
  public.audit_actions, public.audit_activity_log
to authenticated;

alter table public.audit_programmes     enable row level security;
alter table public.audit_templates      enable row level security;
alter table public.audit_template_items enable row level security;
alter table public.audit_records        enable row level security;
alter table public.audit_responses      enable row level security;
alter table public.audit_findings       enable row level security;
alter table public.audit_actions        enable row level security;
alter table public.audit_activity_log   enable row level security;

-- The five that carry org_id directly.
do $$
declare t text;
begin
  foreach t in array array['audit_programmes', 'audit_templates', 'audit_records',
                           'audit_findings', 'audit_activity_log'] loop
    execute format('drop policy if exists %I on public.%I', t || '_org_rw', t);
    execute format($f$
      create policy %I on public.%I
        for all to authenticated
        using (org_id = public.my_org_id() or public.is_super_admin())
        with check (org_id = public.my_org_id() or public.is_super_admin())
    $f$, t || '_org_rw', t);
  end loop;
end $$;

drop policy if exists audit_template_items_org_rw on public.audit_template_items;
create policy audit_template_items_org_rw on public.audit_template_items
  for all to authenticated
  using (
    public.is_super_admin() or exists (
      select 1 from public.audit_templates t
       where t.id = audit_template_items.template_id and t.org_id = public.my_org_id())
  )
  with check (
    public.is_super_admin() or exists (
      select 1 from public.audit_templates t
       where t.id = audit_template_items.template_id and t.org_id = public.my_org_id())
  );

drop policy if exists audit_responses_org_rw on public.audit_responses;
create policy audit_responses_org_rw on public.audit_responses
  for all to authenticated
  using (
    public.is_super_admin() or exists (
      select 1 from public.audit_records a
       where a.id = audit_responses.audit_id and a.org_id = public.my_org_id())
  )
  with check (
    public.is_super_admin() or exists (
      select 1 from public.audit_records a
       where a.id = audit_responses.audit_id and a.org_id = public.my_org_id())
  );

drop policy if exists audit_actions_org_rw on public.audit_actions;
create policy audit_actions_org_rw on public.audit_actions
  for all to authenticated
  using (
    public.is_super_admin() or exists (
      select 1 from public.audit_findings f
       where f.id = audit_actions.finding_id and f.org_id = public.my_org_id())
  )
  with check (
    public.is_super_admin() or exists (
      select 1 from public.audit_findings f
       where f.id = audit_actions.finding_id and f.org_id = public.my_org_id())
  );

commit;
