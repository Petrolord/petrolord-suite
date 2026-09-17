-- AS4 — Document Control: the columns a revision chain needs, document
-- numbers that do not collide, and a place to put the file
-- (Assurance-ROADMAP.md §3 app 3).
--
-- Unlike AS3, this wave is mostly NOT schema. AS1 already backfilled
-- seven doc_* tables and the app uses almost none of them:
--
--   doc_revisions      the revision chain. Never read, never written.
--   doc_workflows      reviewer, role, status, due date: this IS the
--                      approval queue. The app served a hardcoded
--                      MOCK_APPROVALS array of two rows instead.
--   doc_activity_log   action, details, timestamp. The app served four
--                      hardcoded entries reading "2 hours ago",
--                      permanently, to every organization.
--   doc_comments       never read.
--   doc_distribution   distribution and acknowledgement. Never read.
--   doc_categories     read in one select, never written.
--
-- So the tables to hold a real document control system were already
-- there. What was missing is below.
--
-- 1. DOCUMENT NUMBERS THAT COLLIDE, AND A COLLISION THAT IS REPORTED
--    AS SUCCESS. NewDocument.jsx minted them as
--    `${DEPT}-${CAT}-${Math.floor(Math.random() * 1000)}`, zero-padded
--    to three digits. Three digits inside a department-and-category
--    bucket collide at about 37 documents by the birthday bound.
--
--    Unlike the risk register in AS2, the database here DOES defend
--    itself: `documents_org_id_document_number_key` is a real unique
--    constraint, transcribed from production by the AS1 backfill. So
--    the insert is correctly rejected with 23505.
--
--    And then `DocumentControlService.saveDocument()` catches the
--    error and returns `{ success: true, data: [{ id: 'new-id', ... }] }`,
--    commented "Mock success". The user is shown "Document saved as
--    draft" and navigated to the library, and the document does not
--    exist. Two defects compounding into silent loss of a controlled
--    document, on the one write path this app has.
--
--    `next_document_number()` removes the first half; AS4's service
--    rewrite removes the second. Same treatment as next_risk_code
--    (AS2) and next_obligation_code (AS3), except that the sequence is
--    per organization AND per prefix, so HSE-POL-001 and ENG-DWG-001
--    can both exist.
--
-- 2. WHERE THE FILE GOES. `doc_revisions` already carries file_url,
--    file_name and file_size, which is the schema anticipating a file
--    the app never accepted: the "Click to upload or drag and drop,
--    PDF DOCX XLSX up to 50MB" box on the New Document page is a
--    styled div with no input element and no handler behind it. A
--    document control system that cannot hold the document is a
--    spreadsheet with extra steps. `storage_path` is added so a
--    revision can point into the Supabase storage bucket rather than
--    only at a URL somebody pasted, and `is_current` marks the
--    revision the library should show.
--
-- 3. REVIEW DATES THAT CAN BE COMPUTED. `next_review_date` existed and
--    nothing derived it. `review_period_months` lets it be recomputed
--    on each issue instead of typed once and forgotten, which is how a
--    controlled document quietly goes years past review.
--
-- 4. WHAT SUPERSEDED WHAT. `status` could say 'Superseded' and there
--    was no column saying by which document, so the chain ended there.
--
-- The storage bucket itself is NOT created here; see the note at the
-- end. Additive and idempotent.

begin;

create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------
-- 1. documents
-- ---------------------------------------------------------------

alter table public.documents
  add column if not exists description          text,
  add column if not exists review_period_months integer,
  add column if not exists superseded_by        uuid,
  add column if not exists created_by           uuid;

do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'documents_superseded_by_fkey'
                    and conrelid = 'public.documents'::regclass) then
    alter table public.documents
      add constraint documents_superseded_by_fkey
      foreign key (superseded_by) references public.documents(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint
                  where conname = 'documents_review_period_check'
                    and conrelid = 'public.documents'::regclass) then
    alter table public.documents
      add constraint documents_review_period_check
      check (review_period_months is null
             or (review_period_months >= 1 and review_period_months <= 120));
  end if;
  -- The vocabularies the app already uses, written down. Null stays
  -- allowed: these are existing columns with defaults, and a check that
  -- refuses a value some other module writes would be a new outage.
  if not exists (select 1 from pg_constraint
                  where conname = 'documents_status_check'
                    and conrelid = 'public.documents'::regclass) then
    alter table public.documents
      add constraint documents_status_check
      check (status is null or status in
             ('Draft', 'In Review', 'Approved', 'Published',
              'Superseded', 'Obsolete', 'Rejected'));
  end if;
  if not exists (select 1 from pg_constraint
                  where conname = 'documents_confidentiality_check'
                    and conrelid = 'public.documents'::regclass) then
    alter table public.documents
      add constraint documents_confidentiality_check
      check (confidentiality is null or confidentiality in
             ('Public', 'Internal', 'Confidential', 'Restricted'));
  end if;
end $$;

comment on column public.documents.superseded_by is
  'The document that replaced this one. status could say Superseded with nothing saying by what, so the revision chain ended at the word (AS4).';
comment on column public.documents.review_period_months is
  'Recomputes next_review_date on each issue instead of it being typed once and forgotten, which is how a controlled document goes years past review (AS4).';

-- ---------------------------------------------------------------
-- 2. Document numbers, unique and issued in sequence
-- ---------------------------------------------------------------

-- No unique index is added here: `documents_org_id_document_number_key`
-- already exists and does the job. It is named in a test, so that the
-- day somebody drops it the create path fails loudly rather than
-- quietly admitting duplicates.

create index if not exists documents_org_status_idx
  on public.documents (org_id, status);
create index if not exists documents_org_review_idx
  on public.documents (org_id, next_review_date);

/**
 * The next document number for an organization within one prefix.
 *
 * Per org AND per prefix, so HSE-POL-001 and ENG-DWG-001 can both
 * exist. p_prefix is the part before the final number, e.g. 'HSE-POL'.
 */
create or replace function public.next_document_number(p_org uuid, p_prefix text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_next   integer;
  v_prefix text;
begin
  if not (p_org = public.my_org_id() or public.is_super_admin()) then
    raise exception 'not a member of that organization' using errcode = '42501';
  end if;

  -- Normalise, so 'hse-pol', 'HSE-POL' and 'HSE-POL-' cannot each start
  -- their own sequence and then collide with one another.
  v_prefix := upper(regexp_replace(coalesce(p_prefix, 'DOC'), '[^A-Za-z0-9-]', '', 'g'));
  v_prefix := regexp_replace(v_prefix, '-+$', '');
  if v_prefix = '' then v_prefix := 'DOC'; end if;

  perform pg_advisory_xact_lock(hashtext('doc_number' || p_org::text || v_prefix));

  select coalesce(max((regexp_replace(document_number, '^.*-', ''))::integer), 0) + 1
    into v_next
    from public.documents
   where org_id = p_org
     and document_number ~ ('^' || v_prefix || '-[0-9]+$');

  return v_prefix || '-' || lpad(v_next::text, 3, '0');
end;
$$;

revoke all on function public.next_document_number(uuid, text) from public, anon;
grant execute on function public.next_document_number(uuid, text) to authenticated;

comment on function public.next_document_number(uuid, text) is
  'Issues the next sequential document number for an organization within one prefix, under an advisory lock. Replaces a client-side Math.random() over 1000 values that collided at about 37 documents per bucket by the birthday bound, with no unique constraint behind it (AS4).';

-- ---------------------------------------------------------------
-- 3. Revisions: where the file lives, and which one is current
-- ---------------------------------------------------------------

alter table public.doc_revisions
  add column if not exists storage_path text,
  add column if not exists file_type    text,
  add column if not exists is_current   boolean default false,
  add column if not exists superseded_at timestamp with time zone;

create index if not exists doc_revisions_document_idx
  on public.doc_revisions (document_id, created_at desc);

-- Exactly one current revision per document. A partial unique index
-- rather than a check, so the database enforces it rather than the app
-- remembering to clear the old flag.
create unique index if not exists doc_revisions_one_current
  on public.doc_revisions (document_id)
  where is_current;

comment on column public.doc_revisions.storage_path is
  'Path inside the `documents` storage bucket. file_url is kept for a revision that lives somewhere else, but a file uploaded through the app lands here (AS4).';

create index if not exists doc_workflows_reviewer_idx
  on public.doc_workflows (reviewer_id, status);
create index if not exists doc_activity_document_idx
  on public.doc_activity_log (document_id, created_at desc);

-- ---------------------------------------------------------------
-- 3b. Grants, which AS1 assumed rather than made
-- ---------------------------------------------------------------
-- Found while rebuilding this module from the repo on a scratch
-- PostgreSQL 15: AS1's RLS migration revokes `anon` and enables row
-- level security with policies `to authenticated`, but it never GRANTs
-- anything to `authenticated`. Against production that is correct,
-- because the grants were already there. Against an empty database,
-- which is exactly what the schema backfill claims to support, the
-- result is a module where RLS is perfect and no application role can
-- read a single row.
--
-- Stated explicitly here for the doc_* family, the same way AS3 did for
-- the regulatory tables. Idempotent, and a no-op against production.
grant select, insert, update, delete on table
  public.documents,
  public.doc_revisions,
  public.doc_workflows,
  public.doc_comments,
  public.doc_categories,
  public.doc_distribution,
  public.doc_activity_log
to authenticated;

revoke all on table
  public.documents,
  public.doc_revisions,
  public.doc_workflows,
  public.doc_comments,
  public.doc_categories,
  public.doc_distribution,
  public.doc_activity_log
from anon;

-- ---------------------------------------------------------------
-- 4. The storage bucket is NOT created here
-- ---------------------------------------------------------------
-- Creating a bucket and its policies touches `storage.objects`, which
-- is outside the public schema this programme has been working in, and
-- the Suite's existing buckets (`seismic`, `wellsite`) were created
-- through the Supabase dashboard rather than by migration. Doing it
-- differently here would leave the platform with two conventions.
--
-- The owner creates a PRIVATE bucket named `documents`, and the app
-- degrades honestly until it exists: uploads are offered only when the
-- bucket answers, and the New Document page says why when it does not,
-- rather than showing an upload box that does nothing — which is
-- exactly what it did before this wave.
--
-- Paths are `<org_id>/<document_id>/<revision_id>-<filename>`, so a
-- storage policy scoping on the leading path segment is the same
-- org_id check every table policy in AS1 uses.

commit;
