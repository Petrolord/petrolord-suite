-- AS7 schema checks, against a scratch PostgreSQL 15 carrying the AS1
-- backfill plus 20260917500000.
--
-- Run with:
--   tools/validation/assurance/scratch/run-checks.sh \
--     tools/validation/assurance/as7-schema-checks.sql \
--     supabase/migrations/20260917500000_as7_quality_assurance_plan.sql
--
-- Every section is wrapped in begin/rollback and every write sits on
-- its own savepoint. That is not tidiness: `set local role` outside a
-- transaction is a NO-OP, and the checks then run as superuser and
-- pass everything (the AS3 gotcha).
\set ON_ERROR_STOP 0

insert into public.organizations (id,name) values
 ('11111111-1111-1111-1111-111111111111','Org A'),
 ('22222222-2222-2222-2222-222222222222','Org B');
insert into public.users (id,email) values
 ('aaaaaaaa-0000-0000-0000-000000000001','a@example.test'),
 ('bbbbbbbb-0000-0000-0000-000000000002','b@example.test');
insert into public.organization_members (organization_id,user_id,role) values
 ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','admin'),
 ('22222222-2222-2222-2222-222222222222','bbbbbbbb-0000-0000-0000-000000000002','admin');

\echo '=== QAP and NCR codes sequence per org and per year ==='
begin;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}',true) \g /dev/null
set local role authenticated;
\echo '-- first plan of 2026 (want QAP-2026-001)'
savepoint a; select public.next_qa_plan_code('11111111-1111-1111-1111-111111111111',2026) as first; rollback to a;
insert into public.qa_plans (org_id,plan_code,title,status)
  values ('11111111-1111-1111-1111-111111111111','QAP-2026-001','Subsea tie-back ITP','Active');
\echo '-- second (want QAP-2026-002)'
savepoint b; select public.next_qa_plan_code('11111111-1111-1111-1111-111111111111',2026) as second; rollback to b;
\echo '-- a duplicate plan code inside the org (want 23505)'
savepoint c; insert into public.qa_plans (org_id,plan_code,title)
  values ('11111111-1111-1111-1111-111111111111','QAP-2026-001','dup'); rollback to c;
\echo '-- another tenant cannot ask for either code (want 42501 twice)'
savepoint d; select public.next_qa_plan_code('22222222-2222-2222-2222-222222222222',2026); rollback to d;
savepoint e; select public.next_ncr_code('22222222-2222-2222-2222-222222222222',2026); rollback to e;
\echo '-- first NCR of 2026 (want NCR-2026-001)'
savepoint f; select public.next_ncr_code('11111111-1111-1111-1111-111111111111',2026) as first_ncr; rollback to f;
\echo '-- a different year starts again at 001 (want QAP-2027-001)'
savepoint g; select public.next_qa_plan_code('11111111-1111-1111-1111-111111111111',2027) as next_year; rollback to g;
commit;

\echo '=== RULE 1: a decided checkpoint carries the date and the verifier ==='
begin;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}',true) \g /dev/null
set local role authenticated;
\echo '-- a HOLD POINT ticked to Passed with no date and no verifier (want a check violation)'
savepoint h; insert into public.qa_checkpoints (plan_id,item_no,title,point_type,status)
  select id,'1.1','Material certificate verification','Hold point','Passed'
    from public.qa_plans where plan_code='QAP-2026-001'; rollback to h;
\echo '-- Passed with a date but still nobody named (want a check violation)'
savepoint i; insert into public.qa_checkpoints (plan_id,item_no,title,point_type,status,result_date)
  select id,'1.2','Weld NDT review','Hold point','Passed','2026-09-17'
    from public.qa_plans where plan_code='QAP-2026-001'; rollback to i;
\echo '-- Passed with both (want 1 row)'
savepoint j; insert into public.qa_checkpoints (plan_id,item_no,title,point_type,status,result_date,verified_by)
  select id,'1.3','Weld NDT review','Hold point','Passed','2026-09-17','aaaaaaaa-0000-0000-0000-000000000001'
    from public.qa_plans where plan_code='QAP-2026-001' returning item_no; rollback to j;
\echo '-- a third-party verifier who has no Suite login, named in text (want 1 row)'
savepoint k; insert into public.qa_checkpoints (plan_id,item_no,title,point_type,status,result_date,verifier_name)
  select id,'1.4','Third party witness','Witness point','Passed','2026-09-17','Lloyds surveyor'
    from public.qa_plans where plan_code='QAP-2026-001' returning verifier_name; rollback to k;
\echo '-- FAILED needs the same record (want a check violation)'
savepoint l; insert into public.qa_checkpoints (plan_id,item_no,title,point_type,status)
  select id,'1.5','Hydrotest','Hold point','Failed'
    from public.qa_plans where plan_code='QAP-2026-001'; rollback to l;
\echo '-- Pending needs nothing (want 1 row)'
savepoint m; insert into public.qa_checkpoints (plan_id,item_no,title,point_type,status)
  select id,'1.6','Coating inspection','Hold point','Pending'
    from public.qa_plans where plan_code='QAP-2026-001' returning status; rollback to m;
\echo '-- and it cannot be dodged by clearing the verifier afterwards (want a check violation)'
savepoint n;
insert into public.qa_checkpoints (plan_id,item_no,title,point_type,status,result_date,verified_by)
  select id,'1.7','Weld NDT','Hold point','Passed','2026-09-17','aaaaaaaa-0000-0000-0000-000000000001'
    from public.qa_plans where plan_code='QAP-2026-001';
update public.qa_checkpoints set verified_by = null, verifier_name = null where item_no='1.7';
rollback to n;
commit;

\echo '=== RULE 2: a waiver without a reason is not a waiver ==='
begin;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}',true) \g /dev/null
set local role authenticated;
\echo '-- Waived with no remarks (want a check violation)'
savepoint o; insert into public.qa_checkpoints (plan_id,item_no,title,point_type,status,result_date,verified_by)
  select id,'2.1','Vendor surveillance','Witness point','Waived','2026-09-17','aaaaaaaa-0000-0000-0000-000000000001'
    from public.qa_plans where plan_code='QAP-2026-001'; rollback to o;
\echo '-- Waived with whitespace only (want a check violation)'
savepoint p; insert into public.qa_checkpoints (plan_id,item_no,title,point_type,status,result_date,verified_by,remarks)
  select id,'2.2','Vendor surveillance','Witness point','Waived','2026-09-17','aaaaaaaa-0000-0000-0000-000000000001','   '
    from public.qa_plans where plan_code='QAP-2026-001'; rollback to p;
\echo '-- Waived with a reason (want 1 row)'
savepoint q; insert into public.qa_checkpoints (plan_id,item_no,title,point_type,status,result_date,verified_by,remarks)
  select id,'2.3','Vendor surveillance','Witness point','Waived','2026-09-17','aaaaaaaa-0000-0000-0000-000000000001',
         'Covered by the vendor''s own third-party release note'
    from public.qa_plans where plan_code='QAP-2026-001' returning item_no; rollback to q;
commit;

\echo '=== RULE 3: NCR closure is a disposition, a date, a name and — for major — a root cause ==='
begin;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}',true) \g /dev/null
set local role authenticated;
\echo '-- a MAJOR NCR closed with nothing (want a check violation)'
savepoint r; insert into public.qa_ncrs (org_id,ncr_code,title,severity,status)
  values ('11111111-1111-1111-1111-111111111111','NCR-2026-001','Flange out of tolerance','Major','Closed');
rollback to r;
\echo '-- closed with a disposition and a date but no root cause (want a check violation)'
savepoint s; insert into public.qa_ncrs (org_id,ncr_code,title,severity,status,disposition,disposition_date,closed_date,closed_by)
  values ('11111111-1111-1111-1111-111111111111','NCR-2026-002','Flange out of tolerance','Major','Closed',
          'Rework','2026-09-10','2026-09-17','aaaaaaaa-0000-0000-0000-000000000001');
rollback to s;
\echo '-- the same, with a root cause (want 1 row)'
savepoint t; insert into public.qa_ncrs (org_id,ncr_code,title,severity,status,disposition,disposition_date,closed_date,closed_by,root_cause)
  values ('11111111-1111-1111-1111-111111111111','NCR-2026-003','Flange out of tolerance','Major','Closed',
          'Rework','2026-09-10','2026-09-17','aaaaaaaa-0000-0000-0000-000000000001',
          'The machining drawing issued to the vendor was revision B, superseded in March')
  returning ncr_code; rollback to t;
\echo '-- an OBSERVATION closes without a root cause (want 1 row)'
savepoint u; insert into public.qa_ncrs (org_id,ncr_code,title,severity,status,disposition,disposition_date,closed_date,closed_by)
  values ('11111111-1111-1111-1111-111111111111','NCR-2026-004','Label missing','Observation','Closed',
          'Use as is','2026-09-10','2026-09-17','aaaaaaaa-0000-0000-0000-000000000001')
  returning ncr_code; rollback to u;
\echo '-- VOIDED, the honest outcome for one raised in error, is exempt (want 1 row)'
savepoint v; insert into public.qa_ncrs (org_id,ncr_code,title,severity,status)
  values ('11111111-1111-1111-1111-111111111111','NCR-2026-005','Raised against the wrong joint','Critical','Voided')
  returning status; rollback to v;
\echo '-- a disposition with no disposition date (want a check violation)'
savepoint w; insert into public.qa_ncrs (org_id,ncr_code,title,severity,disposition)
  values ('11111111-1111-1111-1111-111111111111','NCR-2026-006','x','Minor','Repair'); rollback to w;
\echo '-- an invented disposition (want a check violation)'
savepoint x; insert into public.qa_ncrs (org_id,ncr_code,title,severity,disposition,disposition_date)
  values ('11111111-1111-1111-1111-111111111111','NCR-2026-007','x','Minor','Ignore','2026-09-10'); rollback to x;
\echo '-- closed before it was raised (want a check violation)'
savepoint y; insert into public.qa_ncrs (org_id,ncr_code,title,severity,status,raised_date,disposition,disposition_date,closed_date,closed_by,root_cause)
  values ('11111111-1111-1111-1111-111111111111','NCR-2026-008','x','Major','Closed','2026-09-17',
          'Repair','2026-09-10','2026-09-01','aaaaaaaa-0000-0000-0000-000000000001','y'); rollback to y;
commit;

\echo '=== RULE 4: an effectiveness verdict is a date and a name, either way ==='
begin;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}',true) \g /dev/null
set local role authenticated;
insert into public.qa_ncrs (org_id,ncr_code,title,severity)
  values ('11111111-1111-1111-1111-111111111111','NCR-2026-100','Control panel wiring','Major');
\echo '-- effective, with nothing behind it (want a check violation)'
savepoint z1; insert into public.qa_capas (ncr_id,action_type,description,effectiveness_verified)
  select id,'Corrective','Rewire to the approved schematic',true
    from public.qa_ncrs where ncr_code='NCR-2026-100'; rollback to z1;
\echo '-- NOT effective, also with nothing behind it (want a check violation)'
savepoint z2; insert into public.qa_capas (ncr_id,action_type,description,effectiveness_verified)
  select id,'Corrective','Rewire to the approved schematic',false
    from public.qa_ncrs where ncr_code='NCR-2026-100'; rollback to z2;
\echo '-- effective, with a date and a name (want 1 row)'
savepoint z3; insert into public.qa_capas (ncr_id,action_type,description,effectiveness_verified,effectiveness_checked_at,effectiveness_verified_by)
  select id,'Corrective','Rewire to the approved schematic',true,'2026-09-17','aaaaaaaa-0000-0000-0000-000000000001'
    from public.qa_ncrs where ncr_code='NCR-2026-100' returning effectiveness_verified; rollback to z3;
\echo '-- not yet checked at all is the normal state (want 1 row)'
savepoint z4; insert into public.qa_capas (ncr_id,action_type,description)
  select id,'Preventive','Add the revision check to the vendor release procedure'
    from public.qa_ncrs where ncr_code='NCR-2026-100' returning action_type; rollback to z4;
\echo '-- Complete with no completion timestamp (want a check violation)'
savepoint z5; insert into public.qa_capas (ncr_id,description,status)
  select id,'x','Complete' from public.qa_ncrs where ncr_code='NCR-2026-100'; rollback to z5;
commit;

\echo '=== an NCR cannot borrow another tenant''s plan ==='
begin;
select set_config('request.jwt.claims','{"sub":"bbbbbbbb-0000-0000-0000-000000000002"}',true) \g /dev/null
set local role authenticated;
\echo '-- Org B raises its own NCR against Org A''s plan (want 42501)'
savepoint z6; insert into public.qa_ncrs (org_id,ncr_code,title,severity,plan_id)
  select '22222222-2222-2222-2222-222222222222','NCR-2026-900','probe','Minor',id
    from public.qa_plans; rollback to z6;
commit;
-- Org B cannot see Org A's plans at all, so that select returns no
-- rows and the insert is a no-op. The same probe as superuser, where
-- the plan IS visible, is what proves the trigger fires.
begin;
\echo '-- the same probe with the plan actually visible (want 42501 from the trigger)'
savepoint z7; insert into public.qa_ncrs (org_id,ncr_code,title,severity,plan_id)
  select '22222222-2222-2222-2222-222222222222','NCR-2026-901','probe','Minor',id
    from public.qa_plans where plan_code='QAP-2026-001'; rollback to z7;
\echo '-- and the trigger cannot be dodged by repointing it afterwards (want 42501)'
savepoint z8;
insert into public.qa_ncrs (org_id,ncr_code,title,severity)
  values ('22222222-2222-2222-2222-222222222222','NCR-2026-902','probe','Minor');
update public.qa_ncrs set plan_id = (select id from public.qa_plans where plan_code='QAP-2026-001')
  where ncr_code='NCR-2026-902';
rollback to z8;
commit;

\echo '=== cross-tenant and anon ==='
begin;
select set_config('request.jwt.claims','{"sub":"bbbbbbbb-0000-0000-0000-000000000002"}',true) \g /dev/null
set local role authenticated;
\echo '-- Org B sees Org A plans (want 0)'
savepoint z9; select count(*) as orgb_sees_plans from public.qa_plans; rollback to z9;
\echo '-- Org B sees Org A NCRs (want 0)'
savepoint za; select count(*) as orgb_sees_ncrs from public.qa_ncrs; rollback to za;
\echo '-- Org B sees Org A checkpoints, a child (want 0)'
savepoint zb; select count(*) as orgb_sees_checkpoints from public.qa_checkpoints; rollback to zb;
\echo '-- Org B sees Org A corrective actions, a child (want 0)'
savepoint zc; select count(*) as orgb_sees_capas from public.qa_capas; rollback to zc;
\echo '-- Org B plants a plan into Org A (want denied)'
savepoint zd; insert into public.qa_plans (org_id,plan_code,title)
  values ('11111111-1111-1111-1111-111111111111','QAP-2026-666','planted'); rollback to zd;
rollback;

begin;
select set_config('request.jwt.claims','{}',true) \g /dev/null
set local role anon;
\echo '-- anon (want permission denied on all five)'
savepoint ze; select count(*) from public.qa_plans; rollback to ze;
savepoint zf; select count(*) from public.qa_checkpoints; rollback to zf;
savepoint zg; select count(*) from public.qa_ncrs; rollback to zg;
savepoint zh; select count(*) from public.qa_capas; rollback to zh;
savepoint zi; select count(*) from public.qa_activity_log; rollback to zi;
\echo '-- anon cannot issue a code either (want permission denied)'
savepoint zj; select public.next_ncr_code('11111111-1111-1111-1111-111111111111',2026); rollback to zj;
rollback;

\echo '=== posture summary (want rowsecurity t on all five, 0 anon grants) ==='
select c.relname, c.relrowsecurity as rls,
       (select count(*) from pg_policies p
         where p.schemaname='public' and p.tablename=c.relname) as policies
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relname like 'qa\_%' and c.relkind='r'
 order by 1;
select count(*) as anon_grants_on_qa_tables
  from information_schema.role_table_grants
 where table_schema='public' and grantee='anon' and table_name like 'qa\_%';
