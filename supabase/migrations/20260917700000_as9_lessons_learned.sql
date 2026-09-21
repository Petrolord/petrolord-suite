-- AS9 — Lessons Learned: the schema this app never had
-- (Assurance-ROADMAP.md §3 app 8).
--
-- The third app in a row with no tables at all. There are no lesson*
-- tables anywhere in the database. The whole app is
-- src/utils/lessons-learned/mockData.js: five invented lessons written
-- out by hand — a pump failure on "Subsea Tie-back Alpha" by John Doe,
-- a drill bit optimization on "Well X-15 Development" by Jane Smith —
-- and a METRICS object whose seven numbers are literals:
--
--   export const METRICS = { total: 156, draft: 12, underReview: 24,
--     published: 110, archived: 10, pendingAction: 5,
--     highReusability: 89 };
--
-- The dashboard renders those seven, two of them with trend badges
-- reading "+12% MoM" and "+5% MoM" over nothing, above a captured
-- trend chart of six hardcoded months and a category pie of four
-- hardcoded slices.
--
-- Nothing could be captured. NewLesson.jsx has no state: no `value`,
-- no `onChange`, no `useState` for any of its six fields, the third
-- app in this module with that exact defect. Its Save Draft button
-- toasts "Lesson draft has been saved successfully" and navigates
-- away. The register's Filters, Export, Capture Lesson and per-row
-- menu all toast "🚧 This feature isn't implemented yet—but don't
-- worry! You can request it in your next prompt! 🚀", naming the
-- prompt builder to paying customers, which is the AS3 finding again.
--
-- And LessonDetail.jsx reads
--
--   const lesson = MOCK_LESSONS.find(l => l.id === id) || MOCK_LESSONS[0];
--
-- commented `// fallback for demo`, so asking for a lesson this
-- organization does not have shows it a different lesson — the AS4
-- Document Control defect, in a second app.
--
-- So this migration is the app. The rules it enforces:
--
-- 1. AN AUTHOR MAY NOT VALIDATE THEIR OWN LESSON. The third
--    independence rule in this module, after AS5's peer review and
--    AS8's ISO 19011 auditor. A lessons database whose entries are
--    published by the person who wrote them records opinions about
--    what happened; a validated one records what the organization
--    accepts happened.
--
-- 2. AN ANECDOTE IS NOT A LESSON. Publishing requires the description
--    of what happened, the root cause, AND the recommendation. The
--    first two without the third are a story; the app this replaces
--    had all three as optional free text on a form that saved nothing.
--
-- 3. A LESSON THAT WAS NEVER APPLIED HAS NOT BEEN LEARNED. This is
--    the whole reason the roadmap kept this app rather than folding it
--    into a document library. `lesson_applications` records each push
--    into the thing that changes — a risk on the register, an MOC, a
--    procedure, a training course, a design standard — and a lesson
--    cannot be marked Embedded without one, nor archived without
--    either an application or a written reason for not applying it.
--    "Archived, nobody said why" is how a lessons database becomes a
--    folder of PDFs.
--
-- 4. REUSABILITY IS COUNTED, NOT CLAIMED. There is deliberately no
--    reusability column. The old register showed a High / Medium / Low
--    reusability badge on every row, assigned by hand in the data
--    file, and a "High Reusability: 89" tile. What replaces it is the
--    applicability scope (this asset, this discipline, the whole
--    organization) and the number of times the lesson has actually
--    been applied, which is a count of rows.
--
-- 5. CODES THAT SEQUENCE, per organization and per year, under an
--    advisory lock, on the precedent of AS2 to AS8.
--
-- 6. RLS FROM THE START, with explicit grants to `authenticated`.
--
-- Additive and idempotent: safe to re-run.

begin;

create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------
-- 1. lesson_records — the register
-- ---------------------------------------------------------------

create table if not exists public.lesson_records (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete cascade,
  lesson_code         text not null,
  title               text not null,
  -- What happened, why it happened, and what to do about it. The
  -- third is the one that makes this a lesson.
  description         text,
  root_cause          text,
  root_cause_category text,
  recommendation      text,
  consequence         text,

  category            text,
  discipline          text,
  department          text,
  project_ref         text,
  asset_id            text,
  event_date          date,

  -- Where it came from. A lesson that came out of an audit finding or
  -- a non-conformance can name it, so the trail runs both ways.
  source_type         text not null default 'Other',
  source_reference    text,

  -- Not a self-assigned star rating: who else this could apply to.
  applicability_scope text not null default 'This asset',

  status              text not null default 'Draft',
  author_id           uuid references public.users(id),
  author_name         text,
  owner_id            uuid references public.users(id),
  validated_by        uuid references public.users(id),
  validator_name      text,
  validated_at        date,
  published_at        date,
  review_due          date,
  archive_reason      text,
  superseded_by       uuid references public.lesson_records(id) on delete set null,
  keywords            text,
  created_by          uuid references public.users(id),
  created_at          timestamptz default now(),
  updated_at          timestamptz default now(),

  constraint lesson_records_org_code_key unique (org_id, lesson_code),
  constraint lesson_records_status_check check (status in
    ('Draft', 'Submitted', 'Validated', 'Published', 'Embedded', 'Archived', 'Superseded')),
  constraint lesson_records_source_check check (source_type in
    ('Incident', 'Near miss', 'Audit finding', 'Non-conformance', 'Management of change',
     'Project close-out', 'Operational experience', 'Success', 'Other')),
  constraint lesson_records_scope_check check (applicability_scope in
    ('This asset', 'This discipline', 'This organization', 'Industry-wide')),
  constraint lesson_records_root_cause_category_check check (root_cause_category is null
    or root_cause_category in
      ('Procedure or documentation', 'Human factors or competence', 'Design',
       'Material or equipment', 'Supplier or subcontractor', 'Planning or scheduling',
       'Communication', 'Measurement or monitoring', 'Management system', 'Other')),

  -- RULE 2. An anecdote is not a lesson.
  constraint lesson_records_publishable_needs_substance check (
    status not in ('Validated', 'Published', 'Embedded')
    or (nullif(btrim(coalesce(description, '')), '') is not null
        and nullif(btrim(coalesce(root_cause, '')), '') is not null
        and nullif(btrim(coalesce(recommendation, '')), '') is not null)
  ),

  -- RULE 1, the record half: a validation is a date and a name.
  constraint lesson_records_validation_needs_record check (
    status not in ('Validated', 'Published', 'Embedded')
    or (validated_at is not null
        and (validated_by is not null
             or nullif(btrim(coalesce(validator_name, '')), '') is not null))
  ),

  constraint lesson_records_published_needs_date check (
    status not in ('Published', 'Embedded') or published_at is not null
  ),

  -- RULE 3, the archive half. The Embedded half needs a count, so it
  -- is a trigger below.
  constraint lesson_records_archive_needs_reason check (
    status <> 'Archived' or nullif(btrim(coalesce(archive_reason, '')), '') is not null
  ),

  constraint lesson_records_superseded_needs_successor check (
    status <> 'Superseded' or superseded_by is not null
  ),
  constraint lesson_records_not_its_own_successor check (
    superseded_by is null or superseded_by <> id
  )
);

comment on table public.lesson_records is
  'The lessons register. The app it replaces held five lessons in src/utils/lessons-learned/mockData.js and a METRICS object of seven literal numbers (AS9).';
comment on constraint lesson_records_publishable_needs_substance on public.lesson_records is
  'What happened, why it happened and what to do about it. The first two without the third are a story (AS9).';
comment on column public.lesson_records.applicability_scope is
  'Replaces the High/Medium/Low "reusability" badge the old register showed on every row, which was typed into a data file. How widely this applies is a judgement; how often it HAS been applied is a count of lesson_applications (AS9).';

create index if not exists lesson_records_org_idx on public.lesson_records (org_id, status);
create index if not exists lesson_records_category_idx on public.lesson_records (org_id, category);
create index if not exists lesson_records_review_idx on public.lesson_records (review_due)
  where status in ('Published', 'Embedded');

-- ---------------------------------------------------------------
-- 2. lesson_applications — where the lesson actually went
-- ---------------------------------------------------------------
-- The table that makes this app worth building, per the roadmap: a
-- lesson pushed into the risk register or the MOC it applies to.

create table if not exists public.lesson_applications (
  id             uuid primary key default gen_random_uuid(),
  lesson_id      uuid not null references public.lesson_records(id) on delete cascade,
  target_type    text not null,
  -- The two Suite targets carry a real foreign key, so the trail is
  -- navigable rather than a typed-in reference.
  target_risk_id uuid references public.risk_register(id) on delete set null,
  target_moc_id  uuid references public.moc_records(id) on delete set null,
  reference      text,
  outcome        text not null default 'Adopted',
  notes          text,
  applied_by     uuid references public.users(id),
  applied_by_name text,
  applied_on     date not null default current_date,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now(),

  constraint lesson_applications_target_check check (target_type in
    ('Risk register', 'Management of change', 'Procedure', 'Training',
     'Design standard', 'Contract or tender', 'Maintenance plan', 'Other')),
  constraint lesson_applications_outcome_check check (outcome in
    ('Adopted', 'Adapted', 'Rejected')),

  -- A push into a Suite register names the row it created or changed.
  constraint lesson_applications_risk_needs_target check (
    target_type <> 'Risk register' or target_risk_id is not null
  ),
  constraint lesson_applications_moc_needs_target check (
    target_type <> 'Management of change' or target_moc_id is not null
  ),
  -- Everything else names something a person can go and look at.
  constraint lesson_applications_other_needs_reference check (
    target_type in ('Risk register', 'Management of change')
    or nullif(btrim(coalesce(reference, '')), '') is not null
  ),
  -- A rejection is a decision and needs its reasoning, like AS7's
  -- waiver and AS8's exclusion.
  constraint lesson_applications_rejection_needs_note check (
    outcome <> 'Rejected' or nullif(btrim(coalesce(notes, '')), '') is not null
  )
);

comment on table public.lesson_applications is
  'Each time a lesson was pushed into the thing that changes: a risk on the register, an MOC, a procedure, a training course. A lesson that was never applied has not been learned (AS9).';

create index if not exists lesson_applications_lesson_idx
  on public.lesson_applications (lesson_id, applied_on desc);
create index if not exists lesson_applications_risk_idx
  on public.lesson_applications (target_risk_id) where target_risk_id is not null;
create index if not exists lesson_applications_moc_idx
  on public.lesson_applications (target_moc_id) where target_moc_id is not null;

-- ---------------------------------------------------------------
-- 3. lesson_activity_log
-- ---------------------------------------------------------------

create table if not exists public.lesson_activity_log (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  entity_type text not null,
  entity_id   uuid not null,
  lesson_id   uuid references public.lesson_records(id) on delete cascade,
  actor_id    uuid references public.users(id),
  action      text not null,
  details     jsonb,
  created_at  timestamptz default now(),
  constraint lesson_activity_entity_check check (entity_type in ('lesson', 'application'))
);

create index if not exists lesson_activity_org_idx
  on public.lesson_activity_log (org_id, created_at desc);
create index if not exists lesson_activity_entity_idx
  on public.lesson_activity_log (entity_type, entity_id);

-- ---------------------------------------------------------------
-- 4. Codes, in sequence per organization and per year
-- ---------------------------------------------------------------

create or replace function public.next_lesson_code(p_org uuid, p_year integer default null)
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

  perform pg_advisory_xact_lock(hashtext('lesson_code' || p_org::text || v_year::text));

  select coalesce(max((regexp_replace(lesson_code, '^.*-', ''))::integer), 0) + 1
    into v_next
    from public.lesson_records
   where org_id = p_org
     and lesson_code ~ ('^LL-' || v_year::text || '-[0-9]+$');

  return 'LL-' || v_year::text || '-' || lpad(v_next::text, 3, '0');
end;
$$;

revoke all on function public.next_lesson_code(uuid, integer) from public, anon;
grant execute on function public.next_lesson_code(uuid, integer) to authenticated;

comment on function public.next_lesson_code(uuid, integer) is
  'Issues the next sequential LL-<year>- code for an organization, under an advisory lock. The app it replaces had five codes written into a data file (AS9).';

-- ---------------------------------------------------------------
-- 5. RULE 1: an author may not validate their own lesson
-- ---------------------------------------------------------------
-- The third independence rule in this module, after AS5's peer review
-- and AS8's ISO 19011 auditor, and for the same reason: a lessons
-- database published by the people who wrote it records what
-- individuals think happened, not what the organization accepts.
--
-- An external validator named in text is not blocked: the rule is
-- about the author signing their own work, not about having an
-- account.

create or replace function public.lesson_validation_independent()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.validated_by is null then
    return new;
  end if;
  if new.validated_by = coalesce(new.author_id, new.created_by) then
    raise exception
      'the author of a lesson may not validate it; ask somebody else to review it'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists lesson_records_validation_independent on public.lesson_records;
create trigger lesson_records_validation_independent
  before insert or update of validated_by, author_id, created_by on public.lesson_records
  for each row execute function public.lesson_validation_independent();

-- ---------------------------------------------------------------
-- 6. RULE 3: Embedded means applied, and it is a count
-- ---------------------------------------------------------------
-- A check constraint cannot count rows in another table, so this half
-- of the rule is a trigger. `Rejected` applications do not count: a
-- lesson somebody considered and decided not to act on has not been
-- embedded in anything.

create or replace function public.lesson_embedded_needs_application()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_count integer;
begin
  if new.status <> 'Embedded' then
    return new;
  end if;
  select count(*) into v_count
    from public.lesson_applications
   where lesson_id = new.id
     and outcome in ('Adopted', 'Adapted');
  if v_count = 0 then
    raise exception
      'a lesson is embedded when it has changed something: record where it was applied first'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists lesson_records_embedded_needs_application on public.lesson_records;
create trigger lesson_records_embedded_needs_application
  before insert or update of status on public.lesson_records
  for each row execute function public.lesson_embedded_needs_application();

-- ---------------------------------------------------------------
-- 7. Cross-tenant guards
-- ---------------------------------------------------------------
-- An application may point at a risk or an MOC. RLS does not say that
-- those belong to the same organization as the lesson: a member of
-- Org A can see their own lesson and, without this, could point its
-- application at a risk they cannot read. The AS7 and AS8 precedent,
-- crossing app boundaries this time.

create or replace function public.lesson_application_same_org()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_lesson_org uuid; v_target_org uuid;
begin
  select org_id into v_lesson_org from public.lesson_records where id = new.lesson_id;

  if new.target_risk_id is not null then
    select org_id into v_target_org from public.risk_register where id = new.target_risk_id;
    if v_target_org is distinct from v_lesson_org then
      raise exception 'that risk belongs to another organization' using errcode = '42501';
    end if;
  end if;

  if new.target_moc_id is not null then
    select org_id into v_target_org from public.moc_records where id = new.target_moc_id;
    if v_target_org is distinct from v_lesson_org then
      raise exception 'that change record belongs to another organization'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists lesson_applications_same_org on public.lesson_applications;
create trigger lesson_applications_same_org
  before insert or update of lesson_id, target_risk_id, target_moc_id
  on public.lesson_applications
  for each row execute function public.lesson_application_same_org();

-- A superseding lesson must be this organization's own.
create or replace function public.lesson_successor_same_org()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_org uuid;
begin
  if new.superseded_by is null then
    return new;
  end if;
  select org_id into v_org from public.lesson_records where id = new.superseded_by;
  if v_org is distinct from new.org_id then
    raise exception 'that lesson belongs to another organization' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists lesson_records_successor_same_org on public.lesson_records;
create trigger lesson_records_successor_same_org
  before insert or update of superseded_by, org_id on public.lesson_records
  for each row execute function public.lesson_successor_same_org();

-- ---------------------------------------------------------------
-- 8. RLS, policies and grants
-- ---------------------------------------------------------------

revoke all on table
  public.lesson_records, public.lesson_applications, public.lesson_activity_log
from anon;

grant select, insert, update, delete on table
  public.lesson_records, public.lesson_applications, public.lesson_activity_log
to authenticated;

alter table public.lesson_records      enable row level security;
alter table public.lesson_applications enable row level security;
alter table public.lesson_activity_log enable row level security;

do $$
declare t text;
begin
  foreach t in array array['lesson_records', 'lesson_activity_log'] loop
    execute format('drop policy if exists %I on public.%I', t || '_org_rw', t);
    execute format($f$
      create policy %I on public.%I
        for all to authenticated
        using (org_id = public.my_org_id() or public.is_super_admin())
        with check (org_id = public.my_org_id() or public.is_super_admin())
    $f$, t || '_org_rw', t);
  end loop;
end $$;

drop policy if exists lesson_applications_org_rw on public.lesson_applications;
create policy lesson_applications_org_rw on public.lesson_applications
  for all to authenticated
  using (
    public.is_super_admin() or exists (
      select 1 from public.lesson_records l
       where l.id = lesson_applications.lesson_id and l.org_id = public.my_org_id())
  )
  with check (
    public.is_super_admin() or exists (
      select 1 from public.lesson_records l
       where l.id = lesson_applications.lesson_id and l.org_id = public.my_org_id())
  );

commit;
