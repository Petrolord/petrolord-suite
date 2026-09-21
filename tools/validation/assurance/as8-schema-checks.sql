-- AS8 schema checks, against a scratch PostgreSQL 15 carrying the AS1
-- backfill plus 20260917600000.
--
-- Run with:
--   tools/validation/assurance/scratch/run-checks.sh \
--     tools/validation/assurance/as8-schema-checks.sql \
--     supabase/migrations/20260917600000_as8_iso_compliance.sql
--
-- Every section is wrapped in begin/rollback and every write sits on
-- its own savepoint, because `set local role` outside a transaction is
-- a no-op and the checks then run as superuser and pass everything
-- (the AS3 gotcha).
\set ON_ERROR_STOP 0

insert into public.organizations (id,name) values
 ('11111111-1111-1111-1111-111111111111','Org A'),
 ('22222222-2222-2222-2222-222222222222','Org B');
insert into public.users (id,email) values
 ('aaaaaaaa-0000-0000-0000-000000000001','a@example.test'),
 ('aaaaaaaa-0000-0000-0000-000000000003','owner@example.test'),
 ('bbbbbbbb-0000-0000-0000-000000000002','b@example.test');
insert into public.organization_members (organization_id,user_id,role) values
 ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','admin'),
 ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000003','member'),
 ('22222222-2222-2222-2222-222222222222','bbbbbbbb-0000-0000-0000-000000000002','admin');

-- A standard and two clauses for Org A, and one standard for Org B.
insert into public.iso_standards (id,org_id,code,title)
 values ('cccccccc-0000-0000-0000-000000000001',
         '11111111-1111-1111-1111-111111111111','ISO 9001:2015','Quality management systems'),
        ('cccccccc-0000-0000-0000-000000000002',
         '22222222-2222-2222-2222-222222222222','ISO 9001:2015','Org B quality');
insert into public.iso_clauses (id,org_id,standard_id,clause_ref,title,owner_id)
 values ('dddddddd-0000-0000-0000-000000000001',
         '11111111-1111-1111-1111-111111111111','cccccccc-0000-0000-0000-000000000001',
         '7.1.5','Monitoring and measuring resources','aaaaaaaa-0000-0000-0000-000000000003'),
        ('dddddddd-0000-0000-0000-000000000002',
         '11111111-1111-1111-1111-111111111111','cccccccc-0000-0000-0000-000000000001',
         '8.5.1','Control of production','aaaaaaaa-0000-0000-0000-000000000001');

\echo '=== Codes sequence per org and per year ==='
begin;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}',true) \g /dev/null
set local role authenticated;
\echo '-- first audit of 2026 (want IA-2026-001)'
savepoint a; select public.next_iso_audit_code('11111111-1111-1111-1111-111111111111',2026) as first; rollback to a;
insert into public.iso_audits (org_id,audit_code,title,standard_id)
 values ('11111111-1111-1111-1111-111111111111','IA-2026-001','Q3 internal audit',
         'cccccccc-0000-0000-0000-000000000001');
\echo '-- second (want IA-2026-002)'
savepoint b; select public.next_iso_audit_code('11111111-1111-1111-1111-111111111111',2026) as second; rollback to b;
\echo '-- a duplicate audit code inside the org (want 23505)'
savepoint c; insert into public.iso_audits (org_id,audit_code,title)
 values ('11111111-1111-1111-1111-111111111111','IA-2026-001','dup'); rollback to c;
\echo '-- another tenant cannot ask for either code (want 42501 twice)'
savepoint d; select public.next_iso_audit_code('22222222-2222-2222-2222-222222222222',2026); rollback to d;
savepoint e; select public.next_iso_finding_code('22222222-2222-2222-2222-222222222222',2026); rollback to e;
\echo '-- first finding of 2026 (want IAF-2026-001)'
savepoint f; select public.next_iso_finding_code('11111111-1111-1111-1111-111111111111',2026) as first_finding; rollback to f;
\echo '-- a different year starts again at 001 (want IA-2027-001)'
savepoint g; select public.next_iso_audit_code('11111111-1111-1111-1111-111111111111',2027) as next_year; rollback to g;
commit;

\echo '=== RULE 1: a conformity claim carries evidence, a date and an assessor ==='
begin;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}',true) \g /dev/null
set local role authenticated;
\echo '-- Conformant from a dropdown, nothing behind it (want a check violation)'
savepoint h; insert into public.iso_clauses (org_id,standard_id,clause_ref,title,status)
 values ('11111111-1111-1111-1111-111111111111','cccccccc-0000-0000-0000-000000000001',
         '9.2','Internal audit','Conformant'); rollback to h;
\echo '-- with evidence but no date (want a check violation)'
savepoint i; insert into public.iso_clauses (org_id,standard_id,clause_ref,title,status,evidence_reference)
 values ('11111111-1111-1111-1111-111111111111','cccccccc-0000-0000-0000-000000000001',
         '9.2','Internal audit','Conformant','QMS-PR-009 rev 4'); rollback to i;
\echo '-- with evidence and a date but nobody named (want a check violation)'
savepoint j; insert into public.iso_clauses (org_id,standard_id,clause_ref,title,status,evidence_reference,assessed_date)
 values ('11111111-1111-1111-1111-111111111111','cccccccc-0000-0000-0000-000000000001',
         '9.2','Internal audit','Conformant','QMS-PR-009 rev 4','2026-09-01'); rollback to j;
\echo '-- all three (want 1 row)'
savepoint k; insert into public.iso_clauses (org_id,standard_id,clause_ref,title,status,evidence_reference,assessed_date,assessed_by)
 values ('11111111-1111-1111-1111-111111111111','cccccccc-0000-0000-0000-000000000001',
         '9.2','Internal audit','Conformant','QMS-PR-009 rev 4','2026-09-01',
         'aaaaaaaa-0000-0000-0000-000000000001') returning clause_ref; rollback to k;
\echo '-- an assessor with no Suite login, named in text (want 1 row)'
savepoint l; insert into public.iso_clauses (org_id,standard_id,clause_ref,title,status,evidence_reference,assessed_date,assessor_name)
 values ('11111111-1111-1111-1111-111111111111','cccccccc-0000-0000-0000-000000000001',
         '9.2','Internal audit','Partially conformant','QMS-PR-009 rev 4','2026-09-01',
         'External consultant') returning assessor_name; rollback to l;
\echo '-- Nonconformant needs the date and the assessor, not the evidence (want a check violation, then 1 row)'
savepoint m; insert into public.iso_clauses (org_id,standard_id,clause_ref,title,status)
 values ('11111111-1111-1111-1111-111111111111','cccccccc-0000-0000-0000-000000000001',
         '9.3','Management review','Nonconformant'); rollback to m;
savepoint n; insert into public.iso_clauses (org_id,standard_id,clause_ref,title,status,assessed_date,assessed_by)
 values ('11111111-1111-1111-1111-111111111111','cccccccc-0000-0000-0000-000000000001',
         '9.3','Management review','Nonconformant','2026-09-01',
         'aaaaaaaa-0000-0000-0000-000000000001') returning clause_ref; rollback to n;
\echo '-- and the claim cannot be edited in afterwards either (want a check violation)'
savepoint o; update public.iso_clauses set status='Conformant'
 where id='dddddddd-0000-0000-0000-000000000001'; rollback to o;
commit;

\echo '=== RULE 2: not applicable needs a justification (ISO 9001 4.3) ==='
begin;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}',true) \g /dev/null
set local role authenticated;
\echo '-- excluded with no justification (want a check violation)'
savepoint p; insert into public.iso_clauses (org_id,standard_id,clause_ref,title,applicability,status)
 values ('11111111-1111-1111-1111-111111111111','cccccccc-0000-0000-0000-000000000001',
         '8.3','Design and development','Not applicable','Not applicable'); rollback to p;
\echo '-- whitespace is not a justification (want a check violation)'
savepoint q; insert into public.iso_clauses (org_id,standard_id,clause_ref,title,applicability,status,applicability_justification)
 values ('11111111-1111-1111-1111-111111111111','cccccccc-0000-0000-0000-000000000001',
         '8.3','Design and development','Not applicable','Not applicable','   '); rollback to q;
\echo '-- with one (want 1 row)'
savepoint r; insert into public.iso_clauses (org_id,standard_id,clause_ref,title,applicability,status,applicability_justification)
 values ('11111111-1111-1111-1111-111111111111','cccccccc-0000-0000-0000-000000000001',
         '8.3','Design and development','Not applicable','Not applicable',
         'The organization builds to client design; no design authority is held.')
 returning clause_ref; rollback to r;
\echo '-- an excluded clause cannot also be claimed conformant (want a check violation)'
savepoint s; insert into public.iso_clauses (org_id,standard_id,clause_ref,title,applicability,status,applicability_justification,evidence_reference,assessed_date,assessed_by)
 values ('11111111-1111-1111-1111-111111111111','cccccccc-0000-0000-0000-000000000001',
         '8.3','Design and development','Not applicable','Conformant','no design held',
         'QMS-PR-003','2026-09-01','aaaaaaaa-0000-0000-0000-000000000001'); rollback to s;
commit;

\echo '=== RULE 3: an auditor may not audit their own work (ISO 19011) ==='
begin;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}',true) \g /dev/null
set local role authenticated;
\echo '-- clause 7.1.5 is owned by the owner user; put it in an audit they lead (want 23514)'
savepoint t;
update public.iso_audits set lead_auditor_id='aaaaaaaa-0000-0000-0000-000000000003'
 where audit_code='IA-2026-001';
insert into public.iso_audit_clauses (audit_id,clause_id)
 select id,'dddddddd-0000-0000-0000-000000000001' from public.iso_audits where audit_code='IA-2026-001';
rollback to t;
\echo '-- the other direction: scope first, then name that owner as lead auditor (want 23514)'
savepoint u;
insert into public.iso_audit_clauses (audit_id,clause_id)
 select id,'dddddddd-0000-0000-0000-000000000001' from public.iso_audits where audit_code='IA-2026-001';
update public.iso_audits set lead_auditor_id='aaaaaaaa-0000-0000-0000-000000000003'
 where audit_code='IA-2026-001';
rollback to u;
\echo '-- an independent auditor over the same clause (want 1 row)'
savepoint v;
update public.iso_audits set lead_auditor_id='aaaaaaaa-0000-0000-0000-000000000001'
 where audit_code='IA-2026-001';
insert into public.iso_audit_clauses (audit_id,clause_id)
 select id,'dddddddd-0000-0000-0000-000000000001' from public.iso_audits where audit_code='IA-2026-001'
 returning result;
rollback to v;
\echo '-- and an external lead auditor with no Suite account is not blocked (want 1 row)'
savepoint w;
update public.iso_audits set lead_auditor_id=null, lead_auditor_name='External lead auditor'
 where audit_code='IA-2026-001';
insert into public.iso_audit_clauses (audit_id,clause_id)
 select id,'dddddddd-0000-0000-0000-000000000001' from public.iso_audits where audit_code='IA-2026-001'
 returning result;
rollback to w;
commit;

\echo '=== RULE 4: a coverage result is a date; a report is a conclusion ==='
begin;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}',true) \g /dev/null
set local role authenticated;
\echo '-- Conformant with no examination date (want a check violation)'
savepoint x; insert into public.iso_audit_clauses (audit_id,clause_id,result)
 select id,'dddddddd-0000-0000-0000-000000000002','Conformant'
   from public.iso_audits where audit_code='IA-2026-001'; rollback to x;
\echo '-- with one (want 1 row)'
savepoint y; insert into public.iso_audit_clauses (audit_id,clause_id,result,examined_on)
 select id,'dddddddd-0000-0000-0000-000000000002','Conformant','2026-09-10'
   from public.iso_audits where audit_code='IA-2026-001' returning result; rollback to y;
\echo '-- Reported with no report date, auditor or conclusion (want a check violation)'
savepoint z1; update public.iso_audits set status='Reported' where audit_code='IA-2026-001'; rollback to z1;
\echo '-- Reported with a date and an auditor but no conclusion (want a check violation)'
savepoint z2; update public.iso_audits set status='Reported', report_issued_date='2026-09-15',
 lead_auditor_name='K. Adeyemi' where audit_code='IA-2026-001'; rollback to z2;
\echo '-- with all three (want 1 row)'
savepoint z3; update public.iso_audits set status='Reported', report_issued_date='2026-09-15',
 lead_auditor_name='K. Adeyemi', conclusion='The management system conforms, with two minor nonconformities.'
 where audit_code='IA-2026-001' returning audit_code; rollback to z3;
commit;

\echo '=== RULE 5: closing a finding, proportionally ==='
begin;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}',true) \g /dev/null
set local role authenticated;
insert into public.iso_findings (id,org_id,finding_code,finding_type,title,standard_id)
 values ('eeeeeeee-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111',
         'IAF-2026-001','Major nonconformity','Calibration records not retained',
         'cccccccc-0000-0000-0000-000000000001'),
        ('eeeeeeee-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111',
         'IAF-2026-002','Observation','Procedure index out of date',
         'cccccccc-0000-0000-0000-000000000001');
\echo '-- a major nonconformity closed by saying so (want a check violation)'
savepoint m1; update public.iso_findings set status='Closed', closed_date='2026-09-30',
 closed_by='aaaaaaaa-0000-0000-0000-000000000001'
 where finding_code='IAF-2026-001'; rollback to m1;
\echo '-- with a correction but no root cause (want a check violation)'
savepoint m2; update public.iso_findings set status='Closed', closed_date='2026-09-30',
 closed_by='aaaaaaaa-0000-0000-0000-000000000001', correction='Records reconstructed from the calibration house.'
 where finding_code='IAF-2026-001'; rollback to m2;
\echo '-- with both (want 1 row)'
savepoint m3; update public.iso_findings set status='Closed', closed_date='2026-09-30',
 closed_by='aaaaaaaa-0000-0000-0000-000000000001', correction='Records reconstructed.',
 root_cause='No retention period was assigned to calibration records in the QMS.'
 where finding_code='IAF-2026-001' returning finding_code; rollback to m3;
\echo '-- an observation closes without either (want 1 row)'
savepoint m4; update public.iso_findings set status='Closed', closed_date='2026-09-30',
 closed_by='aaaaaaaa-0000-0000-0000-000000000001'
 where finding_code='IAF-2026-002' returning finding_code; rollback to m4;
\echo '-- voiding needs a reason (want a check violation, then 1 row)'
savepoint m5; update public.iso_findings set status='Voided' where finding_code='IAF-2026-002'; rollback to m5;
savepoint m6; update public.iso_findings set status='Voided', closure_notes='Raised against the wrong clause.'
 where finding_code='IAF-2026-002' returning finding_code; rollback to m6;
\echo '-- an effectiveness verdict is a date and a name, either way (want two check violations, then 1 row)'
savepoint m7; insert into public.iso_actions (finding_id,description,effectiveness_verified)
 values ('eeeeeeee-0000-0000-0000-000000000001','Assign retention periods',true); rollback to m7;
savepoint m8; insert into public.iso_actions (finding_id,description,effectiveness_verified)
 values ('eeeeeeee-0000-0000-0000-000000000001','Assign retention periods',false); rollback to m8;
savepoint m9; insert into public.iso_actions (finding_id,description,effectiveness_verified,
 effectiveness_checked_at,effectiveness_verified_by)
 values ('eeeeeeee-0000-0000-0000-000000000001','Assign retention periods',false,'2026-10-01',
         'aaaaaaaa-0000-0000-0000-000000000001') returning action_type; rollback to m9;
\echo '-- and a complete action carries its completion time (want a check violation)'
savepoint m10; insert into public.iso_actions (finding_id,description,status)
 values ('eeeeeeee-0000-0000-0000-000000000001','Assign retention periods','Complete'); rollback to m10;
commit;

\echo '=== A certificate is a number, a body and an expiry ==='
begin;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}',true) \g /dev/null
set local role authenticated;
\echo '-- Certified with none of them (want a check violation)'
savepoint c1; update public.iso_standards set certification_status='Certified'
 where id='cccccccc-0000-0000-0000-000000000001'; rollback to c1;
\echo '-- with all three (want 1 row)'
savepoint c2; update public.iso_standards set certification_status='Certified',
 certificate_number='NG-QMS-44812', certification_body='Lloyd''s Register', certificate_expires='2029-03-31'
 where id='cccccccc-0000-0000-0000-000000000001' returning code; rollback to c2;
\echo '-- Seeking certification needs none of them (want 1 row)'
savepoint c3; update public.iso_standards set certification_status='Seeking certification'
 where id='cccccccc-0000-0000-0000-000000000001' returning code; rollback to c3;
commit;

\echo '=== Cross-tenant: parents must belong to the same organization ==='
begin;
select set_config('request.jwt.claims','{"sub":"bbbbbbbb-0000-0000-0000-000000000002"}',true) \g /dev/null
set local role authenticated;
\echo '-- Org B raising a finding against Org A''s standard (want 42501)'
savepoint t1; insert into public.iso_findings (org_id,finding_code,title,standard_id)
 values ('22222222-2222-2222-2222-222222222222','IAF-2026-001','planted',
         'cccccccc-0000-0000-0000-000000000001'); rollback to t1;
\echo '-- Org B hanging a clause off Org A''s standard (want 42501)'
savepoint t2; insert into public.iso_clauses (org_id,standard_id,clause_ref,title)
 values ('22222222-2222-2222-2222-222222222222','cccccccc-0000-0000-0000-000000000001',
         '4.1','planted'); rollback to t2;
\echo '-- Org B sees none of Org A''s rows (want 0 0 0 0)'
select (select count(*) from public.iso_standards) as standards,
       (select count(*) from public.iso_clauses)   as clauses,
       (select count(*) from public.iso_audits)    as audits,
       (select count(*) from public.iso_findings)  as findings;
commit;

\echo '=== Org A sees its own (want 1 standard, 2 clauses, 1 audit) ==='
begin;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}',true) \g /dev/null
set local role authenticated;
select (select count(*) from public.iso_standards) as standards,
       (select count(*) from public.iso_clauses)   as clauses,
       (select count(*) from public.iso_audits)    as audits;
commit;

\echo '=== anon is denied outright (want permission denied, seven times) ==='
begin;
set local role anon;
savepoint n1; select count(*) from public.iso_standards;     rollback to n1;
savepoint n2; select count(*) from public.iso_clauses;       rollback to n2;
savepoint n3; select count(*) from public.iso_audits;        rollback to n3;
savepoint n4; select count(*) from public.iso_audit_clauses; rollback to n4;
savepoint n5; select count(*) from public.iso_findings;      rollback to n5;
savepoint n6; select count(*) from public.iso_actions;       rollback to n6;
savepoint n7; select count(*) from public.iso_activity_log;  rollback to n7;
commit;

\echo '=== RLS is on for all seven (want t seven times) ==='
select relname, relrowsecurity from pg_class
 where relname in ('iso_standards','iso_clauses','iso_audits','iso_audit_clauses',
                   'iso_findings','iso_actions','iso_activity_log')
 order by relname;
