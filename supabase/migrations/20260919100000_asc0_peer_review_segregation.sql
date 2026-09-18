-- ASC-0: segregation of duties for peer review (owner decision D1,
-- 2026-09-18; AssuranceApps-STATUS.md §3n and §3o).
--
-- HELD. Owner-run, after AS15. Applied staging first, never by hand.
-- The engine (engines #212, peerReview canAssignPeerReviewer and
-- canActOnComment) and the app enforce the same rules; this makes them
-- hold for a write from any route. It is the AS15 pattern for MOC
-- approvals and document review, applied to the one Assurance app that
-- had no independence rule at all.
--
-- 1. The author of the work under review (peer_reviews.author_id) is never
--    its Lead Reviewer or a Reviewer: not as peer_reviews.lead_reviewer_id
--    and not as a Lead Reviewer or Reviewer row in peer_review_participants.
--    Other roles (Author, Coordinator, Approver, Observer) are not
--    reviewers and are not refused. A roster row with no user_id (a typed
--    name, somebody without an account) cannot be matched and is allowed,
--    as in the engine.
-- 2. The author never takes a reviewer-owned move on a comment: Verified,
--    Rejected or Withdrawn. Responded (the author's move) and Closed (the
--    coordinator's) are not restricted.
--
-- Rule 1 compares stored ids and holds for every writer. Rule 2 checks the
-- signed-in actor, so it applies only when auth.uid() is not null: the
-- service role and maintenance run as a database owner are not blocked.
-- Both act on direct writes only (pg_trigger_depth() = 1), as AS14 did: a
-- cascade from a review or organization delete is not somebody assigning
-- or deciding anything.
--
-- Existing rows are not re-checked: a trigger fires on new writes only, and
-- an update re-checks rule 1 only when it changes the author, the lead
-- reviewer, a participant's person or role, or the review a row belongs
-- to. Live data read 2026-09-18 (read-only): 6 reviews, none with an
-- author_id or lead_reviewer_id, 0 participants, 2 comments, none
-- Verified, Rejected or Withdrawn, so nothing on record already breaks
-- either rule.
--
-- Idempotent.

begin;

-- ---------------------------------------------------------------
-- 1a. peer_reviews: the author is not the lead reviewer, and a new
--     author is not already one of the review's reviewers
-- ---------------------------------------------------------------
create or replace function public.peer_reviews_sod()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new.author_id is not distinct from old.author_id
     and new.lead_reviewer_id is not distinct from old.lead_reviewer_id then
    return new;  -- neither person changed: an ordinary edit or a stage move
  end if;
  if new.author_id is null then
    return new;
  end if;
  if new.lead_reviewer_id is not distinct from new.author_id then
    raise exception 'The author of the work under review cannot review it. Choose somebody independent of the work.'
      using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and new.author_id is distinct from old.author_id
     and exists (select 1 from public.peer_review_participants p
                  where p.review_id = new.id and p.user_id = new.author_id
                    and p.role in ('Lead Reviewer', 'Reviewer')) then
    raise exception 'The author of the work under review cannot review it. Choose somebody independent of the work.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists peer_reviews_sod on public.peer_reviews;
create trigger peer_reviews_sod
  before insert or update on public.peer_reviews
  for each row execute function public.peer_reviews_sod();

-- ---------------------------------------------------------------
-- 1b. peer_review_participants: the author is never a reviewer
-- ---------------------------------------------------------------
create or replace function public.peer_review_participants_sod()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_author uuid;
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new.user_id is not distinct from old.user_id
     and new.role is not distinct from old.role
     and new.review_id is not distinct from old.review_id then
    return new;
  end if;
  if new.user_id is null or new.role not in ('Lead Reviewer', 'Reviewer') then
    return new;
  end if;
  select author_id into v_author from public.peer_reviews where id = new.review_id;
  if v_author is not null and v_author = new.user_id then
    raise exception 'The author of the work under review cannot review it. Choose somebody independent of the work.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists peer_review_participants_sod on public.peer_review_participants;
create trigger peer_review_participants_sod
  before insert or update on public.peer_review_participants
  for each row execute function public.peer_review_participants_sod();

-- ---------------------------------------------------------------
-- 2. peer_review_comments: the author takes no reviewer-owned move
-- ---------------------------------------------------------------
create or replace function public.peer_review_comments_sod()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_author uuid;
begin
  if pg_trigger_depth() > 1 or auth.uid() is null then
    return new;
  end if;
  if new.status is not distinct from old.status
     or new.status not in ('Verified', 'Rejected', 'Withdrawn') then
    return new;
  end if;
  select author_id into v_author from public.peer_reviews where id = new.review_id;
  if v_author is not null and v_author = auth.uid() then
    raise exception 'The author of the work under review cannot % a comment on it. A reviewer independent of the work decides it.',
      case new.status when 'Verified' then 'verify' when 'Rejected' then 'reject' else 'withdraw' end
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists peer_review_comments_sod on public.peer_review_comments;
create trigger peer_review_comments_sod
  before update on public.peer_review_comments
  for each row execute function public.peer_review_comments_sod();

revoke all on function public.peer_reviews_sod() from public, anon;
revoke all on function public.peer_review_participants_sod() from public, anon;
revoke all on function public.peer_review_comments_sod() from public, anon;

commit;
