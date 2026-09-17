-- AS5 — Peer Review Manager: the roster the app never had, codes that
-- do not collide, and an org_id that cannot be null
-- (Assurance-ROADMAP.md §3 app 4).
--
-- Like AS4, this is mostly not schema. All three tables already exist
-- and are well shaped. `peer_review_comments` even carries
-- `response_text`/`responded_by`/`responded_at` and
-- `verified_by`/`verified_at`, which is precisely the comment
-- disposition and verification loop a technical assurance review runs
-- on. Nothing has ever written a single row to any of them.
--
-- `PeerReviewService` performs every write against three module-level
-- JavaScript arrays:
--
--   let localReviews  = [...MOCK_REVIEWS];
--   let localComments = [...MOCK_COMMENTS];
--   let localAudit    = [...MOCK_AUDIT];
--
-- saveReview() pushes onto localReviews. addComment() pushes onto
-- localComments. updateCommentStatus(), updateReviewStage() and
-- logAudit() mutate them in place. The UI then reports "Review
-- initiated", "Your comment has been successfully registered" and
-- "Action recorded. Backend process triggered."
--
-- There is no backend process. Every review raised, every technical
-- comment written against a deliverable, every disposition, every
-- stage change and the entire audit trail exist until the page is
-- reloaded, and are then gone, with no error at any point.
--
-- What the schema actually needed:
--
-- 1. `peer_reviews.org_id` IS NULLABLE. Every other parent register in
--    this module declares it not null. A review written without one is
--    invisible to `org_id = my_org_id()`, so it belongs to nobody and
--    nobody can see it, including the person who raised it. The table
--    is empty, so the constraint can be added safely; it is added
--    guarded, and skipped rather than failing if that ever stops being
--    true.
--
-- 2. REVIEW CODES THAT COLLIDE. `PR-2026-${Math.floor(Math.random() *
--    900 + 100)}` draws from 900 values with no unique constraint:
--    two reviews share a code at about 36 reviews by the birthday
--    bound. Reviews are cited by code in decision records and in
--    assurance close-out reports. next_peer_review_code() issues them
--    in sequence per organization and per year, which is the
--    convention the mock data itself used (PR-2026-001).
--
-- 3. NO ROSTER. The mock reviews carry a `team` array of roles —
--    Coordinator, Lead Reviewer, Reviewer (Reservoir), Author,
--    Approver — and there is no table for it, so the roster could
--    never have been persisted even if anything had tried.
--    `peer_review_participants` is the one genuinely missing table,
--    and it is what makes reviewer workload answerable.
--
-- Deliverables and attachments are deliberately NOT added here. A
-- reviewed deliverable is a controlled document, and AS4 just built
-- that: linking the two belongs to AS11, where the hub joins the
-- module up, rather than growing a second document store inside this
-- app.
--
-- Additive and idempotent.

begin;

create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------
-- 1. peer_reviews
-- ---------------------------------------------------------------

alter table public.peer_reviews
  add column if not exists closed_at   timestamp with time zone,
  add column if not exists decided_at  timestamp with time zone,
  add column if not exists decided_by  uuid;

do $$
declare
  v_orphans integer;
begin
  -- org_id not null, but only if no row would be broken by it. A
  -- migration that fails on production data is worse than one that
  -- reports why it declined.
  select count(*) into v_orphans from public.peer_reviews where org_id is null;
  if v_orphans = 0 then
    begin
      alter table public.peer_reviews alter column org_id set not null;
    exception when others then
      raise notice 'peer_reviews.org_id left nullable: %', sqlerrm;
    end;
  else
    raise notice 'peer_reviews.org_id left nullable: % row(s) have no org_id. '
      'Those reviews are invisible to every org-scoped policy and need '
      'assigning before the constraint can be added.', v_orphans;
  end if;

  if not exists (select 1 from pg_constraint
                  where conname = 'peer_reviews_stage_check'
                    and conrelid = 'public.peer_reviews'::regclass) then
    alter table public.peer_reviews
      add constraint peer_reviews_stage_check
      check (stage is null or stage in
             ('Draft', 'In Review', 'Verification', 'Closed', 'Cancelled'));
  end if;
  if not exists (select 1 from pg_constraint
                  where conname = 'peer_reviews_priority_check'
                    and conrelid = 'public.peer_reviews'::regclass) then
    alter table public.peer_reviews
      add constraint peer_reviews_priority_check
      check (priority is null or priority in ('Low', 'Medium', 'High', 'Critical'));
  end if;
  if not exists (select 1 from pg_constraint
                  where conname = 'peer_reviews_decision_check'
                    and conrelid = 'public.peer_reviews'::regclass) then
    alter table public.peer_reviews
      add constraint peer_reviews_decision_check
      check (decision is null or decision in
             ('Pending', 'Approved', 'Approved with conditions', 'Rejected'));
  end if;
end $$;

create unique index if not exists peer_reviews_org_code_uniq
  on public.peer_reviews (org_id, review_code);

create index if not exists peer_reviews_org_stage_idx
  on public.peer_reviews (org_id, stage);
create index if not exists peer_reviews_org_due_idx
  on public.peer_reviews (org_id, due_date);

comment on column public.peer_reviews.decision is
  'The review outcome. Only meaningful once the review is Closed; src/lib/peerReview.js refuses to close a review with unresolved Critical or Major comments (AS5).';

-- ---------------------------------------------------------------
-- 2. Review codes, in sequence per organization and per year
-- ---------------------------------------------------------------

create or replace function public.next_peer_review_code(p_org uuid, p_year integer default null)
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

  perform pg_advisory_xact_lock(hashtext('peer_review_code' || p_org::text || v_year::text));

  select coalesce(max((regexp_replace(review_code, '^.*-', ''))::integer), 0) + 1
    into v_next
    from public.peer_reviews
   where org_id = p_org
     and review_code ~ ('^PR-' || v_year::text || '-[0-9]+$');

  return 'PR-' || v_year::text || '-' || lpad(v_next::text, 3, '0');
end;
$$;

revoke all on function public.next_peer_review_code(uuid, integer) from public, anon;
grant execute on function public.next_peer_review_code(uuid, integer) to authenticated;

comment on function public.next_peer_review_code(uuid, integer) is
  'Issues the next sequential PR-<year>- code for an organization, under an advisory lock. Replaces a client-side Math.random() over 900 values that collided at about 36 reviews by the birthday bound (AS5).';

-- ---------------------------------------------------------------
-- 3. Comments: the vocabularies the disposition loop depends on
-- ---------------------------------------------------------------

do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'peer_review_comments_severity_check'
                    and conrelid = 'public.peer_review_comments'::regclass) then
    alter table public.peer_review_comments
      add constraint peer_review_comments_severity_check
      check (severity is null or severity in ('Critical', 'Major', 'Minor', 'Editorial'));
  end if;
  if not exists (select 1 from pg_constraint
                  where conname = 'peer_review_comments_status_check'
                    and conrelid = 'public.peer_review_comments'::regclass) then
    alter table public.peer_review_comments
      add constraint peer_review_comments_status_check
      check (status is null or status in
             ('Open', 'Responded', 'Verified', 'Closed', 'Rejected', 'Withdrawn'));
  end if;
end $$;

create index if not exists peer_review_comments_review_idx
  on public.peer_review_comments (review_id, created_at desc);
create index if not exists peer_review_audit_review_idx
  on public.peer_review_audit (review_id, created_at desc);

comment on column public.peer_review_comments.status is
  'Disposition. Open -> Responded (author answers) -> Verified (reviewer accepts) -> Closed, or Rejected back to the author. A comment cannot reach Verified without a response; src/lib/peerReview.js owns the transitions (AS5).';

-- ---------------------------------------------------------------
-- 4. The roster, which had no table at all
-- ---------------------------------------------------------------

create table if not exists public.peer_review_participants (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.peer_reviews(id) on delete cascade,
  user_id uuid,
  display_name text,
  role text not null,
  discipline text,
  invited_at timestamp with time zone default now(),
  accepted_at timestamp with time zone,
  created_at timestamp with time zone default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'peer_review_participants_role_check'
                    and conrelid = 'public.peer_review_participants'::regclass) then
    alter table public.peer_review_participants
      add constraint peer_review_participants_role_check
      check (role in ('Coordinator', 'Lead Reviewer', 'Reviewer', 'Author', 'Approver', 'Observer'));
  end if;
  -- A person holds one role on one review. Two "Author" rows for the
  -- same person is a duplicate, not a second job.
  if not exists (select 1 from pg_constraint
                  where conname = 'peer_review_participants_unique_role'
                    and conrelid = 'public.peer_review_participants'::regclass) then
    alter table public.peer_review_participants
      add constraint peer_review_participants_unique_role
      unique (review_id, user_id, role);
  end if;
end $$;

create index if not exists peer_review_participants_review_idx
  on public.peer_review_participants (review_id);
create index if not exists peer_review_participants_user_idx
  on public.peer_review_participants (user_id);

comment on table public.peer_review_participants is
  'The review roster. The app carried a `team` array of roles in its mock data and there was no table for it, so a roster could never have been persisted even if anything had tried (AS5).';

-- ---------------------------------------------------------------
-- 5. RLS and grants
-- ---------------------------------------------------------------
-- AS1 enabled RLS on the three parent tables and wrote policies `to
-- authenticated` without granting that role anything (see the AS4
-- migration's note). Stated explicitly here for the whole family, and
-- the new child scopes through its parent's org_id.

revoke all on table
  public.peer_reviews,
  public.peer_review_comments,
  public.peer_review_audit,
  public.peer_review_participants
from anon;

grant select, insert, update, delete on table
  public.peer_reviews,
  public.peer_review_comments,
  public.peer_review_audit,
  public.peer_review_participants
to authenticated;

-- AND THE POLICIES THEMSELVES, which AS1 deliberately did not write.
--
-- AS1 §8 says: "documents itself already has RLS and policies; it only
-- needs the anon grant taken away. Same for risk_register, moc_records,
-- peer_reviews, peer_review_comments, peer_review_audit." That is true
-- of production, and it means the repo cannot reconstruct this module's
-- security posture. Rebuilding the Assurance schema from the repo on an
-- empty database — which is exactly what the AS1 backfill claims to
-- support, and how a staging or recovery environment would be stood up
-- — yields these six parent registers with RLS DISABLED and no policy
-- of any kind. Every one of them holds a register. This was caught by
-- the AS5 schema checks: a member of Org B could read Org A's reviews
-- on a clean rebuild.
--
-- Stated here for the three peer review tables, which are AS5's to own.
-- The other parents (risk_register, moc_records, documents,
-- compliance_rules, risk_kris, risk_mitigation_actions, risk_scenarios)
-- are NOT touched: rewriting another app's live policy from a guess at
-- what production holds is how a working module breaks. They are
-- recorded in AssuranceApps-STATUS.md as an open item for a migration
-- that reads the live policies first.
--
-- Idempotent, and a no-op against production, where equivalent policies
-- already exist under their own names.

alter table public.peer_reviews            enable row level security;
alter table public.peer_review_comments    enable row level security;
alter table public.peer_review_audit       enable row level security;
alter table public.peer_review_participants enable row level security;

drop policy if exists peer_reviews_org_rw on public.peer_reviews;
create policy peer_reviews_org_rw on public.peer_reviews
  for all to authenticated
  using (org_id = public.my_org_id() or public.is_super_admin())
  with check (org_id = public.my_org_id() or public.is_super_admin());

-- The two children carry no org_id, so each scopes through its parent.
drop policy if exists peer_review_comments_org_rw on public.peer_review_comments;
create policy peer_review_comments_org_rw on public.peer_review_comments
  for all to authenticated
  using (
    public.is_super_admin() or exists (
      select 1 from public.peer_reviews r
       where r.id = peer_review_comments.review_id
         and r.org_id = public.my_org_id()
    )
  )
  with check (
    public.is_super_admin() or exists (
      select 1 from public.peer_reviews r
       where r.id = peer_review_comments.review_id
         and r.org_id = public.my_org_id()
    )
  );

drop policy if exists peer_review_audit_org_rw on public.peer_review_audit;
create policy peer_review_audit_org_rw on public.peer_review_audit
  for all to authenticated
  using (
    public.is_super_admin() or exists (
      select 1 from public.peer_reviews r
       where r.id = peer_review_audit.review_id
         and r.org_id = public.my_org_id()
    )
  )
  with check (
    public.is_super_admin() or exists (
      select 1 from public.peer_reviews r
       where r.id = peer_review_audit.review_id
         and r.org_id = public.my_org_id()
    )
  );

drop policy if exists peer_review_participants_org_rw on public.peer_review_participants;
create policy peer_review_participants_org_rw on public.peer_review_participants
  for all to authenticated
  using (
    public.is_super_admin() or exists (
      select 1 from public.peer_reviews r
       where r.id = peer_review_participants.review_id
         and r.org_id = public.my_org_id()
    )
  )
  with check (
    public.is_super_admin() or exists (
      select 1 from public.peer_reviews r
       where r.id = peer_review_participants.review_id
         and r.org_id = public.my_org_id()
    )
  );

commit;
