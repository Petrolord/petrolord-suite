-- AS5 schema checks, run against a scratch PostgreSQL 15 carrying the
-- AS1 backfill plus 20260917300000. Every "want" below is asserted by
-- eye in the output; the negative cases must raise.
\set ON_ERROR_STOP 0
insert into public.organizations (id,name) values
 ('11111111-1111-1111-1111-111111111111','Org A'),
 ('22222222-2222-2222-2222-222222222222','Org B');
insert into public.organization_members (organization_id,user_id,role) values
 ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','admin'),
 ('22222222-2222-2222-2222-222222222222','bbbbbbbb-0000-0000-0000-000000000002','admin');

\echo '=== review codes: sequence per org and per year ==='
begin;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}',true) \g /dev/null
set local role authenticated;
\echo '-- first code of 2026 (want PR-2026-001)'
savepoint a; select public.next_peer_review_code('11111111-1111-1111-1111-111111111111',2026) as first; rollback to a;
insert into public.peer_reviews (org_id, review_code, title, review_type)
  values ('11111111-1111-1111-1111-111111111111','PR-2026-001','FDP review','Field Development Plan');
\echo '-- second (want PR-2026-002)'
savepoint b; select public.next_peer_review_code('11111111-1111-1111-1111-111111111111',2026) as second; rollback to b;
\echo '-- a new year starts its own sequence (want PR-2027-001)'
savepoint c; select public.next_peer_review_code('11111111-1111-1111-1111-111111111111',2027) as new_year; rollback to c;
\echo '-- a duplicate code inside the org (want 23505)'
savepoint d; insert into public.peer_reviews (org_id, review_code, title, review_type)
  values ('11111111-1111-1111-1111-111111111111','PR-2026-001','dup','Reserves Audit'); rollback to d;
\echo '-- another tenant cannot ask for a code (want 42501)'
savepoint f; select public.next_peer_review_code('22222222-2222-2222-2222-222222222222',2026); rollback to f;
commit;

\echo '=== a review can no longer belong to nobody ==='
begin;
savepoint g;
insert into public.peer_reviews (review_code, title, review_type)
  values ('PR-2026-999','no org','Reserves Audit');
rollback to g;

\echo '=== the vocabularies are enforced ==='
savepoint h;
insert into public.peer_reviews (org_id, review_code, title, review_type, stage)
  values ('11111111-1111-1111-1111-111111111111','PR-2026-010','bad stage','Reserves Audit','Invented');
rollback to h;
savepoint i;
insert into public.peer_reviews (org_id, review_code, title, review_type, decision)
  values ('11111111-1111-1111-1111-111111111111','PR-2026-011','bad decision','Reserves Audit','Maybe');
rollback to i;
savepoint j;
insert into public.peer_review_comments (review_id, comment_text, severity)
  select id,'x','Showstopper' from public.peer_reviews where review_code='PR-2026-001';
rollback to j;
savepoint k;
insert into public.peer_review_comments (review_id, comment_text, status)
  select id,'x','Maybe' from public.peer_reviews where review_code='PR-2026-001';
rollback to k;
rollback;

\echo '=== the roster: one person, one role, one review ==='
begin;
insert into public.peer_review_participants (review_id, user_id, role)
  select id,'aaaaaaaa-0000-0000-0000-000000000001','Lead Reviewer'
    from public.peer_reviews where review_code='PR-2026-001';
\echo '-- the same person in the same role again (want 23505)'
savepoint l;
insert into public.peer_review_participants (review_id, user_id, role)
  select id,'aaaaaaaa-0000-0000-0000-000000000001','Lead Reviewer'
    from public.peer_reviews where review_code='PR-2026-001';
rollback to l;
\echo '-- the same person in a different role is fine (want 1 row)'
insert into public.peer_review_participants (review_id, user_id, role)
  select id,'aaaaaaaa-0000-0000-0000-000000000001','Approver'
    from public.peer_reviews where review_code='PR-2026-001'
  returning role;
\echo '-- an invented role (want a check violation)'
savepoint m;
insert into public.peer_review_participants (review_id, user_id, role)
  select id,'aaaaaaaa-0000-0000-0000-000000000001','Chief Vibes Officer'
    from public.peer_reviews where review_code='PR-2026-001';
rollback to m;
commit;

\echo '=== the same code in ANOTHER org is fine: unique per org, not globally ==='
begin;
select set_config('request.jwt.claims','{"sub":"bbbbbbbb-0000-0000-0000-000000000002"}',true) \g /dev/null
set local role authenticated;
\echo '-- Org B takes PR-2026-001 too (want 1 row)'
savepoint e; insert into public.peer_reviews (org_id, review_code, title, review_type)
  values ('22222222-2222-2222-2222-222222222222','PR-2026-001','other org','Reserves Audit')
  returning review_code; rollback to e;
rollback;

\echo '=== cross-tenant: Org B must not see or touch Org A ==='
begin;
select set_config('request.jwt.claims','{"sub":"bbbbbbbb-0000-0000-0000-000000000002"}',true) \g /dev/null
set local role authenticated;
\echo '-- Org B sees Org A reviews (want 0)'
savepoint n; select count(*) as orgb_sees from public.peer_reviews; rollback to n;
\echo '-- Org B sees Org A roster, the new child (want 0)'
savepoint o; select count(*) as orgb_sees_roster from public.peer_review_participants; rollback to o;
\echo '-- Org B plants a participant on an Org A review (want denied)'
savepoint p;
insert into public.peer_review_participants (review_id, user_id, role)
  values ((select id from public.peer_reviews limit 1),'bbbbbbbb-0000-0000-0000-000000000002','Reviewer');
rollback to p;
rollback;

\echo '=== anon, the role behind the publishable key (want denied) ==='
begin;
select set_config('request.jwt.claims','{}',true) \g /dev/null
set local role anon;
savepoint q; select count(*) from public.peer_reviews; rollback to q;
savepoint r; select count(*) from public.peer_review_participants; rollback to r;
rollback;
