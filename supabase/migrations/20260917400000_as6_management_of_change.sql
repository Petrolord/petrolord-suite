-- AS6 — Management of Change: codes that do not collide, the
-- vocabularies the gates depend on, and an expiry date that means
-- something (Assurance-ROADMAP.md §3 app 5).
--
-- Seven moc_* tables exist and the app uses NONE of them. Not one page
-- issues a query. Every screen is a literal:
--
--   Register.jsx      five hardcoded rows (MOC-2026-089 down to -077)
--   Dashboard.jsx     metrics 42 / 12 / 5 / 128, a stage breakdown, a
--                     monthly trend and a recent-activity list, all
--                     literals
--   Approvals.jsx     two hardcoded approval tasks
--   MOCDetail.jsx     `const { id = 'MOC-2026-089' } = useParams()`
--   NewMOC.jsx        the form has NO STATE AT ALL. No value, no
--                     onChange, no useState for any field. Submitting
--                     runs setTimeout(800) and then toasts "Record
--                     MOC-2026-090 has been created successfully",
--                     with the number hardcoded, and navigates to it.
--
-- And the schema that is sitting unused is genuinely good. It already
-- carries everything an MOC process needs:
--
--   moc_records.expiry_date        temporary change expiry
--   moc_approvals.level            the multi-level approval gate
--   moc_actions.status/due_date    actions to closure
--   moc_impacts.impact_area        the impact assessment
--   moc_reviews.discipline         discipline review
--   moc_activity_log               the audit trail
--
-- What it needed:
--
-- 1. MOC CODES. The app never issued one, because it never wrote a
--    record; the code it toasted was a string literal, and it was the
--    SAME literal every time: "MOC-2026-090". The database already
--    defends itself here — `moc_records_org_id_moc_code_key` is a real
--    unique constraint from the AS1 backfill, as `documents` had in
--    AS4 — so the second person to create a change would have been
--    rejected, had anything ever reached the database.
--    next_moc_code() issues them per organization and per year,
--    matching the MOC-2026-089 convention the mock data used, as
--    next_risk_code (AS2), next_obligation_code (AS3),
--    next_document_number (AS4) and next_peer_review_code (AS5) do.
--
-- 2. THE VOCABULARIES. Stage, type, category, risk level, approval
--    status, action status and impact severity are all free text, and
--    every gate in src/lib/managementOfChange.js is a comparison
--    against one of them. A typo in a stage silently removes a change
--    from every count it belongs in.
--
-- 3. A TEMPORARY CHANGE THAT CANNOT LOSE ITS EXPIRY DATE. This is the
--    one that matters. A temporary or emergency change is, by
--    definition, a deviation the facility is running on until a date.
--    A temporary change with no expiry is a permanent change nobody
--    decided to make, and it is the classic MOC failure: the clamp
--    that was going to be replaced next shutdown and is still there
--    four years later. The check refuses it.
--
-- 4. RLS AND POLICIES FOR moc_records, which AS1 §8 deliberately left
--    alone because production already has them (see the AS5 migration
--    for the full account of this gap). Stated here for this app's own
--    tables so the module can be rebuilt from the repo.
--
-- Additive and idempotent.

begin;

create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------
-- 1. moc_records
-- ---------------------------------------------------------------

alter table public.moc_records
  add column if not exists implemented_by      uuid,
  add column if not exists closed_by           uuid,
  add column if not exists rejection_reason    text,
  add column if not exists current_situation   text;

do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'moc_records_stage_check'
                    and conrelid = 'public.moc_records'::regclass) then
    alter table public.moc_records
      add constraint moc_records_stage_check
      check (stage is null or stage in
             ('Draft', 'Screening', 'Review', 'Approval',
              'Implementation', 'Closed', 'Rejected', 'Cancelled'));
  end if;
  if not exists (select 1 from pg_constraint
                  where conname = 'moc_records_type_check'
                    and conrelid = 'public.moc_records'::regclass) then
    alter table public.moc_records
      add constraint moc_records_type_check
      check (type in ('Permanent', 'Temporary', 'Emergency'));
  end if;
  if not exists (select 1 from pg_constraint
                  where conname = 'moc_records_category_check'
                    and conrelid = 'public.moc_records'::regclass) then
    alter table public.moc_records
      add constraint moc_records_category_check
      check (category in
             ('Facility or hardware', 'Process or chemistry',
              'Procedural or documentation', 'Organizational or personnel',
              'Software or IT', 'Other'));
  end if;
  if not exists (select 1 from pg_constraint
                  where conname = 'moc_records_risk_check'
                    and conrelid = 'public.moc_records'::regclass) then
    alter table public.moc_records
      add constraint moc_records_risk_check
      check (risk_level is null or risk_level in ('Low', 'Medium', 'High', 'Critical'));
  end if;
  if not exists (select 1 from pg_constraint
                  where conname = 'moc_records_priority_check'
                    and conrelid = 'public.moc_records'::regclass) then
    alter table public.moc_records
      add constraint moc_records_priority_check
      check (priority is null or priority in ('Low', 'Medium', 'High', 'Critical'));
  end if;

  -- THE ONE THAT MATTERS. A temporary or emergency change is a
  -- deviation the facility is running on until a date. One without an
  -- expiry is a permanent change nobody decided to make: the clamp
  -- that was going to be replaced next shutdown and is still there
  -- four years later. A Draft is exempt, because the date is often the
  -- last thing known while the request is still being written.
  if not exists (select 1 from pg_constraint
                  where conname = 'moc_records_temporary_needs_expiry'
                    and conrelid = 'public.moc_records'::regclass) then
    alter table public.moc_records
      add constraint moc_records_temporary_needs_expiry
      check (
        type = 'Permanent'
        or stage = 'Draft'
        or expiry_date is not null
      );
  end if;
end $$;

comment on constraint moc_records_temporary_needs_expiry on public.moc_records is
  'A temporary or emergency change past Draft must carry an expiry date. A temporary change with no expiry is a permanent change nobody decided to make (AS6).';
comment on column public.moc_records.expiry_date is
  'When a temporary or emergency change must be reverted or made permanent. src/lib/managementOfChange.js reports one past this date as EXPIRED, which outranks every other state the change can be in.';

-- No unique index is added: `moc_records_org_id_moc_code_key` already
-- exists and does the job. It is named in a test, so that the day
-- somebody drops it the create path fails loudly.

create index if not exists moc_records_org_stage_idx
  on public.moc_records (org_id, stage);
create index if not exists moc_records_org_expiry_idx
  on public.moc_records (org_id, expiry_date)
  where expiry_date is not null;

-- ---------------------------------------------------------------
-- 2. MOC codes, in sequence per organization and per year
-- ---------------------------------------------------------------

create or replace function public.next_moc_code(p_org uuid, p_year integer default null)
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

  perform pg_advisory_xact_lock(hashtext('moc_code' || p_org::text || v_year::text));

  select coalesce(max((regexp_replace(moc_code, '^.*-', ''))::integer), 0) + 1
    into v_next
    from public.moc_records
   where org_id = p_org
     and moc_code ~ ('^MOC-' || v_year::text || '-[0-9]+$');

  return 'MOC-' || v_year::text || '-' || lpad(v_next::text, 3, '0');
end;
$$;

revoke all on function public.next_moc_code(uuid, integer) from public, anon;
grant execute on function public.next_moc_code(uuid, integer) to authenticated;

comment on function public.next_moc_code(uuid, integer) is
  'Issues the next sequential MOC-<year>- code for an organization, under an advisory lock. The app never issued one at all: the number it reported on creation was a string literal (AS6).';

-- ---------------------------------------------------------------
-- 3. The children the gates read
-- ---------------------------------------------------------------

do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'moc_approvals_status_check'
                    and conrelid = 'public.moc_approvals'::regclass) then
    alter table public.moc_approvals
      add constraint moc_approvals_status_check
      check (status is null or status in ('Pending', 'Approved', 'Rejected', 'Delegated'));
  end if;
  if not exists (select 1 from pg_constraint
                  where conname = 'moc_approvals_level_check'
                    and conrelid = 'public.moc_approvals'::regclass) then
    alter table public.moc_approvals
      add constraint moc_approvals_level_check
      check (level is null or (level >= 1 and level <= 10));
  end if;
  if not exists (select 1 from pg_constraint
                  where conname = 'moc_actions_status_check'
                    and conrelid = 'public.moc_actions'::regclass) then
    alter table public.moc_actions
      add constraint moc_actions_status_check
      check (status is null or status in ('Open', 'In progress', 'Complete', 'Cancelled'));
  end if;
  if not exists (select 1 from pg_constraint
                  where conname = 'moc_actions_type_check'
                    and conrelid = 'public.moc_actions'::regclass) then
    alter table public.moc_actions
      add constraint moc_actions_type_check
      check (action_type in ('Pre-implementation', 'Implementation', 'Post-implementation'));
  end if;
  if not exists (select 1 from pg_constraint
                  where conname = 'moc_impacts_severity_check'
                    and conrelid = 'public.moc_impacts'::regclass) then
    alter table public.moc_impacts
      add constraint moc_impacts_severity_check
      check (severity is null or severity in ('None', 'Low', 'Medium', 'High', 'Critical'));
  end if;
  if not exists (select 1 from pg_constraint
                  where conname = 'moc_reviews_status_check'
                    and conrelid = 'public.moc_reviews'::regclass) then
    alter table public.moc_reviews
      add constraint moc_reviews_status_check
      check (status is null or status in ('Pending', 'Complete', 'Rejected'));
  end if;
  -- One approval row per approver per level. Two "Pending" rows for the
  -- same person at level 2 is a duplicate, not a second signature.
  if not exists (select 1 from pg_constraint
                  where conname = 'moc_approvals_unique_approver_level'
                    and conrelid = 'public.moc_approvals'::regclass) then
    alter table public.moc_approvals
      add constraint moc_approvals_unique_approver_level
      unique (moc_id, approver_id, level);
  end if;
end $$;

comment on column public.moc_approvals.level is
  'The approval gate this signature belongs to. A change leaves Approval only when every level has at least one Approved row and none is Rejected; src/lib/managementOfChange.js owns that rule (AS6).';
comment on column public.moc_actions.action_type is
  'Pre-implementation actions gate the change leaving Approval. Post-implementation actions gate it closing. That ordering is the whole point of the action list (AS6).';

create index if not exists moc_approvals_moc_idx on public.moc_approvals (moc_id, level);
create index if not exists moc_actions_moc_idx on public.moc_actions (moc_id, status);
create index if not exists moc_impacts_moc_idx on public.moc_impacts (moc_id);
create index if not exists moc_reviews_moc_idx on public.moc_reviews (moc_id);
create index if not exists moc_activity_moc_idx on public.moc_activity_log (moc_id, created_at desc);

-- ---------------------------------------------------------------
-- 4. RLS, policies and grants
-- ---------------------------------------------------------------
-- AS1 gave the six moc_* children their policies and left moc_records
-- alone as an already-protected parent. Correct against production,
-- and it leaves a repo rebuild with the parent open and the children
-- scoped through it. Stated here, with the family's grants, on the
-- AS4/AS5 precedent.

revoke all on table
  public.moc_records, public.moc_approvals, public.moc_actions,
  public.moc_impacts, public.moc_reviews, public.moc_comments,
  public.moc_activity_log
from anon;

grant select, insert, update, delete on table
  public.moc_records, public.moc_approvals, public.moc_actions,
  public.moc_impacts, public.moc_reviews, public.moc_comments,
  public.moc_activity_log
to authenticated;

alter table public.moc_records enable row level security;

drop policy if exists moc_records_org_rw on public.moc_records;
create policy moc_records_org_rw on public.moc_records
  for all to authenticated
  using (org_id = public.my_org_id() or public.is_super_admin())
  with check (org_id = public.my_org_id() or public.is_super_admin());

-- moc_comments and moc_activity_log were not in AS1's child sweep
-- either; both scope through the parent the same way.
do $$
declare t text;
begin
  foreach t in array array['moc_comments', 'moc_activity_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_org_rw', t);
    execute format($f$
      create policy %I on public.%I
        for all to authenticated
        using (
          public.is_super_admin() or exists (
            select 1 from public.moc_records m
             where m.id = %I.moc_id and m.org_id = public.my_org_id()
          )
        )
        with check (
          public.is_super_admin() or exists (
            select 1 from public.moc_records m
             where m.id = %I.moc_id and m.org_id = public.my_org_id()
          )
        )
    $f$, t || '_org_rw', t, t, t);
  end loop;
end $$;

commit;
