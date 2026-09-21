-- AS9 schema checks, against a scratch PostgreSQL 15 carrying the AS1
-- backfill plus 20260917700000.
--
-- Run with:
--   tools/validation/assurance/scratch/run-checks.sh \
--     tools/validation/assurance/as9-schema-checks.sql \
--     supabase/migrations/20260917700000_as9_lessons_learned.sql
--
-- Every section is wrapped in begin/rollback and every write sits on
-- its own savepoint: `set local role` outside a transaction is a no-op
-- and the checks then run as superuser and pass everything (the AS3
-- gotcha).
\set ON_ERROR_STOP 0

insert into public.organizations (id,name) values
 ('11111111-1111-1111-1111-111111111111','Org A'),
 ('22222222-2222-2222-2222-222222222222','Org B');
insert into public.users (id,email) values
 ('aaaaaaaa-0000-0000-0000-000000000001','author@example.test'),
 ('aaaaaaaa-0000-0000-0000-000000000003','reviewer@example.test'),
 ('bbbbbbbb-0000-0000-0000-000000000002','b@example.test');
insert into public.organization_members (organization_id,user_id,role) values
 ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','admin'),
 ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000003','member'),
 ('22222222-2222-2222-2222-222222222222','bbbbbbbb-0000-0000-0000-000000000002','admin');

-- One risk and one MOC per organization, to push lessons into.
insert into public.risk_register (id,org_id,risk_id,title,category) values
 ('11111111-0000-0000-0000-0000000000a1','11111111-1111-1111-1111-111111111111',
  'RSK-1001','Export pump alignment','Operational'),
 ('22222222-0000-0000-0000-0000000000a2','22222222-2222-2222-2222-222222222222',
  'RSK-1001','Org B risk','Operational');
insert into public.moc_records (id,org_id,moc_code,title,category,type) values
 ('11111111-0000-0000-0000-0000000000b1','11111111-1111-1111-1111-111111111111',
  'MOC-2026-001','Revise the startup procedure','Procedure','Permanent');

\echo '=== Lesson codes sequence per org and per year ==='
begin;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}',true) \g /dev/null
set local role authenticated;
\echo '-- first lesson of 2026 (want LL-2026-001)'
savepoint a; select public.next_lesson_code('11111111-1111-1111-1111-111111111111',2026) as first; rollback to a;
insert into public.lesson_records (id,org_id,lesson_code,title,author_id)
 values ('11111111-0000-0000-0000-0000000000c1','11111111-1111-1111-1111-111111111111',
         'LL-2026-001','Pump failure during startup','aaaaaaaa-0000-0000-0000-000000000001');
\echo '-- second (want LL-2026-002)'
savepoint b; select public.next_lesson_code('11111111-1111-1111-1111-111111111111',2026) as second; rollback to b;
\echo '-- a duplicate code inside the org (want 23505)'
savepoint c; insert into public.lesson_records (org_id,lesson_code,title)
 values ('11111111-1111-1111-1111-111111111111','LL-2026-001','dup'); rollback to c;
\echo '-- another tenant cannot ask for it (want 42501)'
savepoint d; select public.next_lesson_code('22222222-2222-2222-2222-222222222222',2026); rollback to d;
\echo '-- a different year starts again at 001 (want LL-2027-001)'
savepoint e; select public.next_lesson_code('11111111-1111-1111-1111-111111111111',2027) as next_year; rollback to e;
commit;

\echo '=== RULE 1: an author may not validate their own lesson ==='
begin;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}',true) \g /dev/null
set local role authenticated;
\echo '-- the author signs it off (want 23514)'
savepoint f; update public.lesson_records
 set validated_by='aaaaaaaa-0000-0000-0000-000000000001', validated_at='2026-09-17'
 where lesson_code='LL-2026-001'; rollback to f;
\echo '-- somebody else does (want 1 row)'
savepoint g; update public.lesson_records
 set description='The pump was run without alignment checks.',
     root_cause='The commissioning procedure had no alignment hold point.',
     recommendation='Add an alignment hold point to the commissioning ITP.',
     status='Validated',
     validated_by='aaaaaaaa-0000-0000-0000-000000000003', validated_at='2026-09-17'
 where lesson_code='LL-2026-001' returning lesson_code; rollback to g;
\echo '-- an external validator with no account, named in text (want 1 row)'
savepoint h; update public.lesson_records
 set description='x', root_cause='y', recommendation='z', status='Validated',
     validator_name='External reviewer', validated_at='2026-09-17'
 where lesson_code='LL-2026-001' returning validator_name; rollback to h;
\echo '-- and the author cannot be edited in afterwards to match either (want 23514)'
savepoint i;
update public.lesson_records set validated_by='aaaaaaaa-0000-0000-0000-000000000003'
 where lesson_code='LL-2026-001';
update public.lesson_records set author_id='aaaaaaaa-0000-0000-0000-000000000003'
 where lesson_code='LL-2026-001';
rollback to i;
commit;

\echo '=== RULE 2: an anecdote is not a lesson ==='
begin;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}',true) \g /dev/null
set local role authenticated;
\echo '-- published with a title and nothing else (want a check violation)'
savepoint j; update public.lesson_records set status='Published'
 where lesson_code='LL-2026-001'; rollback to j;
\echo '-- what happened and why, but no recommendation (want a check violation)'
savepoint k; update public.lesson_records
 set description='The pump was run without alignment checks.',
     root_cause='The procedure had no alignment hold point.',
     status='Validated', validated_by='aaaaaaaa-0000-0000-0000-000000000003',
     validated_at='2026-09-17'
 where lesson_code='LL-2026-001'; rollback to k;
\echo '-- a whitespace recommendation is not a recommendation (want a check violation)'
savepoint l; update public.lesson_records
 set description='x', root_cause='y', recommendation='   ', status='Validated',
     validated_by='aaaaaaaa-0000-0000-0000-000000000003', validated_at='2026-09-17'
 where lesson_code='LL-2026-001'; rollback to l;
\echo '-- all three (want 1 row)'
savepoint m; update public.lesson_records
 set description='x', root_cause='y', recommendation='Add the hold point.',
     status='Validated', validated_by='aaaaaaaa-0000-0000-0000-000000000003',
     validated_at='2026-09-17'
 where lesson_code='LL-2026-001' returning status; rollback to m;
\echo '-- a Draft needs none of it: capture comes before analysis (want 1 row)'
savepoint n; update public.lesson_records set status='Draft'
 where lesson_code='LL-2026-001' returning status; rollback to n;
\echo '-- validation without a date or a name (want a check violation)'
savepoint o; update public.lesson_records
 set description='x', root_cause='y', recommendation='z', status='Validated'
 where lesson_code='LL-2026-001'; rollback to o;
commit;

\echo '=== RULE 3: a lesson that was never applied has not been learned ==='
begin;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}',true) \g /dev/null
set local role authenticated;
update public.lesson_records
 set description='x', root_cause='y', recommendation='Add the hold point.',
     status='Published', validated_by='aaaaaaaa-0000-0000-0000-000000000003',
     validated_at='2026-09-17', published_at='2026-09-17'
 where lesson_code='LL-2026-001';
\echo '-- Embedded with nothing applied (want 23514)'
savepoint p; update public.lesson_records set status='Embedded'
 where lesson_code='LL-2026-001'; rollback to p;
\echo '-- a REJECTED application does not embed anything (want 23514)'
savepoint q;
insert into public.lesson_applications (lesson_id,target_type,reference,outcome,notes)
 values ('11111111-0000-0000-0000-0000000000c1','Procedure','OPS-PR-14','Rejected',
         'The procedure is being retired anyway.');
update public.lesson_records set status='Embedded' where lesson_code='LL-2026-001';
rollback to q;
\echo '-- an adopted one does (want 1 row)'
savepoint r;
insert into public.lesson_applications (lesson_id,target_type,reference,outcome)
 values ('11111111-0000-0000-0000-0000000000c1','Procedure','OPS-PR-14 rev 6','Adopted');
update public.lesson_records set status='Embedded' where lesson_code='LL-2026-001'
 returning status;
rollback to r;
\echo '-- archiving needs a reason (want a check violation, then 1 row)'
savepoint s; update public.lesson_records set status='Archived'
 where lesson_code='LL-2026-001'; rollback to s;
savepoint t; update public.lesson_records set status='Archived',
 archive_reason='The asset was decommissioned in 2027.'
 where lesson_code='LL-2026-001' returning status; rollback to t;
\echo '-- superseding needs the successor (want a check violation)'
savepoint u; update public.lesson_records set status='Superseded'
 where lesson_code='LL-2026-001'; rollback to u;
commit;

\echo '=== Applications name what they changed ==='
begin;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}',true) \g /dev/null
set local role authenticated;
\echo '-- "Risk register" with no risk (want a check violation)'
savepoint v; insert into public.lesson_applications (lesson_id,target_type)
 values ('11111111-0000-0000-0000-0000000000c1','Risk register'); rollback to v;
\echo '-- with one (want 1 row)'
savepoint w; insert into public.lesson_applications (lesson_id,target_type,target_risk_id)
 values ('11111111-0000-0000-0000-0000000000c1','Risk register',
         '11111111-0000-0000-0000-0000000000a1') returning outcome; rollback to w;
\echo '-- "Management of change" with no MOC (want a check violation), then with one (want 1 row)'
savepoint x; insert into public.lesson_applications (lesson_id,target_type)
 values ('11111111-0000-0000-0000-0000000000c1','Management of change'); rollback to x;
savepoint y; insert into public.lesson_applications (lesson_id,target_type,target_moc_id)
 values ('11111111-0000-0000-0000-0000000000c1','Management of change',
         '11111111-0000-0000-0000-0000000000b1') returning outcome; rollback to y;
\echo '-- "Training" with no reference at all (want a check violation)'
savepoint z; insert into public.lesson_applications (lesson_id,target_type)
 values ('11111111-0000-0000-0000-0000000000c1','Training'); rollback to z;
\echo '-- a rejection with no reasoning (want a check violation)'
savepoint z2; insert into public.lesson_applications (lesson_id,target_type,reference,outcome)
 values ('11111111-0000-0000-0000-0000000000c1','Training','IND-104','Rejected'); rollback to z2;
\echo '-- CROSS-TENANT: pushing a lesson into another organization''s risk (want 42501)'
savepoint z3; insert into public.lesson_applications (lesson_id,target_type,target_risk_id)
 values ('11111111-0000-0000-0000-0000000000c1','Risk register',
         '22222222-0000-0000-0000-0000000000a2'); rollback to z3;
commit;

\echo '=== Org B sees none of Org A''s lessons (want 0 0) ==='
begin;
select set_config('request.jwt.claims','{"sub":"bbbbbbbb-0000-0000-0000-000000000002"}',true) \g /dev/null
set local role authenticated;
select (select count(*) from public.lesson_records) as lessons,
       (select count(*) from public.lesson_applications) as applications;
\echo '-- and cannot plant one in Org A (want 0 rows written)'
savepoint z4; insert into public.lesson_records (org_id,lesson_code,title)
 values ('11111111-1111-1111-1111-111111111111','LL-2026-999','planted'); rollback to z4;
commit;

\echo '=== Org A sees its own (want 1) ==='
begin;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}',true) \g /dev/null
set local role authenticated;
select count(*) as lessons from public.lesson_records;
commit;

\echo '=== anon is denied outright (want permission denied, three times) ==='
begin;
set local role anon;
savepoint n1; select count(*) from public.lesson_records;      rollback to n1;
savepoint n2; select count(*) from public.lesson_applications; rollback to n2;
savepoint n3; select count(*) from public.lesson_activity_log; rollback to n3;
commit;

\echo '=== RLS is on for all three (want t three times) ==='
select relname, relrowsecurity from pg_class
 where relname in ('lesson_records','lesson_applications','lesson_activity_log')
 order by relname;
