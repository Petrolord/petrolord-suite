-- AS10 schema checks, against a scratch PostgreSQL 15 carrying the AS1
-- backfill plus 20260917800000.
--
-- Run with:
--   tools/validation/assurance/scratch/run-checks.sh \
--     tools/validation/assurance/as10-schema-checks.sql \
--     supabase/migrations/20260917800000_as10_audit_findings_manager.sql
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
 ('aaaaaaaa-0000-0000-0000-000000000001','auditor@example.test'),
 ('aaaaaaaa-0000-0000-0000-000000000003','auditee@example.test'),
 ('bbbbbbbb-0000-0000-0000-000000000002','b@example.test');
insert into public.organization_members (organization_id,user_id,role) values
 ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','admin'),
 ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000003','member'),
 ('22222222-2222-2222-2222-222222222222','bbbbbbbb-0000-0000-0000-000000000002','admin');

-- A programme, a checklist of two items (one critical), and Org B's own.
insert into public.audit_programmes (id,org_id,title,programme_year)
 values ('11111111-0000-0000-0000-0000000000a1'::uuid,
         '11111111-1111-1111-1111-111111111111','2026 HSE audit programme',2026);
insert into public.audit_templates (id,org_id,code,title,audit_type,status)
 values ('11111111-0000-0000-0000-0000000000b1'::uuid,
         '11111111-1111-1111-1111-111111111111','CHK-HSE-01','Contractor HSE audit',
         'Contractor','Active'),
        ('22222222-0000-0000-0000-0000000000b2'::uuid,
         '22222222-2222-2222-2222-222222222222','CHK-HSE-01','Org B checklist',
         'Contractor','Active');
insert into public.audit_template_items (id,template_id,item_no,question,criticality) values
 ('11111111-0000-0000-0000-0000000000c1'::uuid,'11111111-0000-0000-0000-0000000000b1'::uuid,
  '1.1','Is a valid permit to work displayed at the worksite?','Critical'),
 ('11111111-0000-0000-0000-0000000000c2'::uuid,'11111111-0000-0000-0000-0000000000b1'::uuid,
  '1.2','Are toolbox talk records available for the last seven days?','Minor');

\echo '=== Codes sequence per org and per year ==='
begin;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}',true) \g /dev/null
set local role authenticated;
\echo '-- first audit of 2026 (want AUD-2026-001)'
savepoint a; select public.next_audit_code('11111111-1111-1111-1111-111111111111',2026) as first; rollback to a;
insert into public.audit_records
 (id,org_id,audit_code,title,programme_id,template_id,audit_type,
  lead_auditor_id,auditee_id,planned_start,planned_end)
 values ('11111111-0000-0000-0000-0000000000d1'::uuid,
         '11111111-1111-1111-1111-111111111111','AUD-2026-001',
         'Contractor HSE audit: Rig 7','11111111-0000-0000-0000-0000000000a1'::uuid,
         '11111111-0000-0000-0000-0000000000b1'::uuid,'Contractor',
         'aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000003',
         '2026-09-01','2026-09-05');
\echo '-- second (want AUD-2026-002)'
savepoint b; select public.next_audit_code('11111111-1111-1111-1111-111111111111',2026) as second; rollback to b;
\echo '-- a duplicate code inside the org (want 23505)'
savepoint c; insert into public.audit_records (org_id,audit_code,title)
 values ('11111111-1111-1111-1111-111111111111','AUD-2026-001','dup'); rollback to c;
\echo '-- another tenant cannot ask for either code (want 42501 twice)'
savepoint d; select public.next_audit_code('22222222-2222-2222-2222-222222222222',2026); rollback to d;
savepoint e; select public.next_audit_finding_code('22222222-2222-2222-2222-222222222222',2026); rollback to e;
\echo '-- first finding of 2026 (want AF-2026-001), and 2027 starts again (want AUD-2027-001)'
savepoint f; select public.next_audit_finding_code('11111111-1111-1111-1111-111111111111',2026) as first_finding; rollback to f;
savepoint g; select public.next_audit_code('11111111-1111-1111-1111-111111111111',2027) as next_year; rollback to g;
commit;

\echo '=== RULE 4: an auditor may not audit their own area ==='
begin;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}',true) \g /dev/null
set local role authenticated;
\echo '-- lead auditor is also the auditee (want 23514)'
savepoint h; update public.audit_records set auditee_id='aaaaaaaa-0000-0000-0000-000000000001'
 where audit_code='AUD-2026-001'; rollback to h;
\echo '-- an external lead auditor named in text is not blocked (want 1 row)'
savepoint i; update public.audit_records
 set lead_auditor_id=null, lead_auditor_name='External lead auditor',
     auditee_id='aaaaaaaa-0000-0000-0000-000000000001'
 where audit_code='AUD-2026-001' returning audit_code; rollback to i;
commit;

\echo '=== RULE 1: an answer is a date, "not applicable" is a reason ==='
begin;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}',true) \g /dev/null
set local role authenticated;
\echo '-- Conformant with no examination date (want a check violation)'
savepoint j; insert into public.audit_responses (audit_id,item_id,result)
 values ('11111111-0000-0000-0000-0000000000d1'::uuid,
         '11111111-0000-0000-0000-0000000000c2'::uuid,'Conformant'); rollback to j;
\echo '-- Not applicable with no reason (want a check violation)'
savepoint k; insert into public.audit_responses (audit_id,item_id,result,examined_on)
 values ('11111111-0000-0000-0000-0000000000d1'::uuid,
         '11111111-0000-0000-0000-0000000000c2'::uuid,'Not applicable','2026-09-02'); rollback to k;
\echo '-- whitespace is not a reason (want a check violation)'
savepoint l; insert into public.audit_responses (audit_id,item_id,result,examined_on,note)
 values ('11111111-0000-0000-0000-0000000000d1'::uuid,
         '11111111-0000-0000-0000-0000000000c2'::uuid,'Not applicable','2026-09-02','   '); rollback to l;
\echo '-- with one (want 1 row)'
savepoint m; insert into public.audit_responses (audit_id,item_id,result,examined_on,note)
 values ('11111111-0000-0000-0000-0000000000d1'::uuid,
         '11111111-0000-0000-0000-0000000000c2'::uuid,'Not applicable','2026-09-02',
         'No hot work was carried out in the audit window.') returning result; rollback to m;
\echo '-- a nonconformity with no evidence (want a check violation)'
savepoint n; insert into public.audit_responses (audit_id,item_id,result,examined_on)
 values ('11111111-0000-0000-0000-0000000000d1'::uuid,
         '11111111-0000-0000-0000-0000000000c1'::uuid,'Nonconformant','2026-09-02'); rollback to n;
commit;

\echo '=== RULE 1 and 2 at the gate: what "reported" means ==='
begin;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}',true) \g /dev/null
set local role authenticated;
\echo '-- reported with NOTHING answered (want 23514, naming 2 items)'
savepoint o; update public.audit_records
 set status='Reported', report_issued_date='2026-09-06', conclusion='No issues.'
 where audit_code='AUD-2026-001'; rollback to o;

\echo '-- one of two answered (want 23514, naming 1 item)'
savepoint p;
insert into public.audit_responses (audit_id,item_id,result,examined_on)
 values ('11111111-0000-0000-0000-0000000000d1'::uuid,
         '11111111-0000-0000-0000-0000000000c2'::uuid,'Conformant','2026-09-02');
update public.audit_records
 set status='Reported', report_issued_date='2026-09-06', conclusion='No issues.'
 where audit_code='AUD-2026-001';
rollback to p;

\echo '-- both answered, the CRITICAL one Nonconformant with no finding (want 23514 naming 1.1)'
savepoint q;
insert into public.audit_responses (audit_id,item_id,result,examined_on,evidence) values
 ('11111111-0000-0000-0000-0000000000d1'::uuid,'11111111-0000-0000-0000-0000000000c2'::uuid,
  'Conformant','2026-09-02',null),
 ('11111111-0000-0000-0000-0000000000d1'::uuid,'11111111-0000-0000-0000-0000000000c1'::uuid,
  'Nonconformant','2026-09-02','No permit displayed at the drill floor at 09:40.');
update public.audit_records
 set status='Reported', report_issued_date='2026-09-06', conclusion='One nonconformity.'
 where audit_code='AUD-2026-001';
rollback to q;

\echo '-- with the finding raised against that answer (want 1 row)'
savepoint r;
insert into public.audit_responses (audit_id,item_id,result,examined_on,evidence) values
 ('11111111-0000-0000-0000-0000000000d1'::uuid,'11111111-0000-0000-0000-0000000000c2'::uuid,
  'Conformant','2026-09-02',null),
 ('11111111-0000-0000-0000-0000000000d1'::uuid,'11111111-0000-0000-0000-0000000000c1'::uuid,
  'Nonconformant','2026-09-02','No permit displayed at the drill floor at 09:40.');
insert into public.audit_findings (org_id,finding_code,audit_id,response_id,finding_type,title)
 select '11111111-1111-1111-1111-111111111111','AF-2026-001',
        '11111111-0000-0000-0000-0000000000d1'::uuid, r.id,'Major nonconformity',
        'Work proceeding without a displayed permit'
   from public.audit_responses r
  where r.audit_id='11111111-0000-0000-0000-0000000000d1'::uuid
    and r.item_id='11111111-0000-0000-0000-0000000000c1'::uuid;
update public.audit_records
 set status='Reported', report_issued_date='2026-09-06', conclusion='One nonconformity.'
 where audit_code='AUD-2026-001' returning audit_code;
rollback to r;

\echo '-- a VOIDED finding does not satisfy the rule (want 23514)'
savepoint s;
insert into public.audit_responses (audit_id,item_id,result,examined_on,evidence) values
 ('11111111-0000-0000-0000-0000000000d1'::uuid,'11111111-0000-0000-0000-0000000000c2'::uuid,
  'Conformant','2026-09-02',null),
 ('11111111-0000-0000-0000-0000000000d1'::uuid,'11111111-0000-0000-0000-0000000000c1'::uuid,
  'Nonconformant','2026-09-02','No permit displayed.');
insert into public.audit_findings
 (org_id,finding_code,audit_id,response_id,finding_type,title,status,closure_notes)
 select '11111111-1111-1111-1111-111111111111','AF-2026-002',
        '11111111-0000-0000-0000-0000000000d1'::uuid, r.id,'Major nonconformity',
        'voided one','Voided','Raised against the wrong item.'
   from public.audit_responses r
  where r.audit_id='11111111-0000-0000-0000-0000000000d1'::uuid
    and r.item_id='11111111-0000-0000-0000-0000000000c1'::uuid;
update public.audit_records
 set status='Reported', report_issued_date='2026-09-06', conclusion='x'
 where audit_code='AUD-2026-001';
rollback to s;

\echo '-- an ad-hoc audit with no checklist is not held to rule 1 (want 1 row)'
savepoint t;
insert into public.audit_records (org_id,audit_code,title,lead_auditor_name)
 values ('11111111-1111-1111-1111-111111111111','AUD-2026-009','Ad-hoc yard walkdown','K. A.');
update public.audit_records set status='Reported', report_issued_date='2026-09-06',
 conclusion='Nothing of note.' where audit_code='AUD-2026-009' returning audit_code;
rollback to t;

\echo '-- and an INSERT straight into Reported is held to the gate too (want 23514)'
savepoint u;
insert into public.audit_records (org_id,audit_code,title,template_id,status,
 report_issued_date,conclusion,lead_auditor_name)
 values ('11111111-1111-1111-1111-111111111111','AUD-2026-010','Backdated',
         '11111111-0000-0000-0000-0000000000b1'::uuid,'Reported','2026-09-06','x','K. A.');
rollback to u;
commit;

\echo '=== RULE 3: a stop-work finding records its correction at the time ==='
begin;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}',true) \g /dev/null
set local role authenticated;
\echo '-- stop-work with no correction (want a check violation)'
savepoint v; insert into public.audit_findings
 (org_id,finding_code,audit_id,finding_type,title,stop_work)
 values ('11111111-1111-1111-1111-111111111111','AF-2026-003',
         '11111111-0000-0000-0000-0000000000d1'::uuid,'Major nonconformity',
         'Unguarded rotating equipment',true); rollback to v;
\echo '-- with one (want 1 row)'
savepoint w; insert into public.audit_findings
 (org_id,finding_code,audit_id,finding_type,title,stop_work,correction)
 values ('11111111-1111-1111-1111-111111111111','AF-2026-003',
         '11111111-0000-0000-0000-0000000000d1'::uuid,'Major nonconformity',
         'Unguarded rotating equipment',true,
         'Work stopped at 09:45 and the guard refitted before restart.')
 returning finding_code; rollback to w;
\echo '-- a stop-work OBSERVATION is a contradiction (want a check violation)'
savepoint x; insert into public.audit_findings
 (org_id,finding_code,audit_id,finding_type,title,stop_work,correction)
 values ('11111111-1111-1111-1111-111111111111','AF-2026-004',
         '11111111-0000-0000-0000-0000000000d1'::uuid,'Observation','x',true,'y'); rollback to x;
\echo '-- closing a major finding without a root cause (want a check violation, then 1 row)'
savepoint y;
insert into public.audit_findings (id,org_id,finding_code,audit_id,finding_type,title)
 values ('11111111-0000-0000-0000-0000000000e9'::uuid,
         '11111111-1111-1111-1111-111111111111','AF-2026-005',
         '11111111-0000-0000-0000-0000000000d1'::uuid,'Major nonconformity','Permit not displayed');
update public.audit_findings set status='Closed', closed_date='2026-09-30',
 closed_by='aaaaaaaa-0000-0000-0000-000000000001', correction='Permit reissued and displayed.'
 where finding_code='AF-2026-005';
rollback to y;
savepoint z;
insert into public.audit_findings (id,org_id,finding_code,audit_id,finding_type,title)
 values ('11111111-0000-0000-0000-0000000000e8'::uuid,
         '11111111-1111-1111-1111-111111111111','AF-2026-006',
         '11111111-0000-0000-0000-0000000000d1'::uuid,'Major nonconformity','Permit not displayed');
update public.audit_findings set status='Closed', closed_date='2026-09-30',
 closed_by='aaaaaaaa-0000-0000-0000-000000000001', correction='Permit reissued.',
 root_cause='The permit board was moved during the shift change and not restored.'
 where finding_code='AF-2026-006' returning finding_code;
rollback to z;
\echo '-- an effectiveness verdict is a date and a name, either way (want 2 violations, then 1 row)'
savepoint z1;
insert into public.audit_findings (id,org_id,finding_code,audit_id,finding_type,title)
 values ('11111111-0000-0000-0000-0000000000e7'::uuid,
         '11111111-1111-1111-1111-111111111111','AF-2026-007',
         '11111111-0000-0000-0000-0000000000d1'::uuid,'Major nonconformity','x');
savepoint z2; insert into public.audit_actions (finding_id,description,effectiveness_verified)
 values ('11111111-0000-0000-0000-0000000000e7'::uuid,'Restore the permit board',true); rollback to z2;
savepoint z3; insert into public.audit_actions (finding_id,description,effectiveness_verified)
 values ('11111111-0000-0000-0000-0000000000e7'::uuid,'Restore the permit board',false); rollback to z3;
savepoint z4; insert into public.audit_actions (finding_id,description,effectiveness_verified,
 effectiveness_checked_at,effectiveness_verified_by)
 values ('11111111-0000-0000-0000-0000000000e7'::uuid,'Restore the permit board',false,
         '2026-10-01','aaaaaaaa-0000-0000-0000-000000000001') returning action_type; rollback to z4;
rollback to z1;
commit;

\echo '=== RULE 5: a programme is complete when its audits are ==='
begin;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}',true) \g /dev/null
set local role authenticated;
\echo '-- complete over an audit that is still Planned (want 23514)'
savepoint p1; update public.audit_programmes
 set status='Complete', approved_at='2026-01-10',
     approved_by='aaaaaaaa-0000-0000-0000-000000000001', completed_at='2026-12-31'
 where title='2026 HSE audit programme'; rollback to p1;
\echo '-- cancelling that audit WITH a reason lets the programme close (want 1 row)'
savepoint p2;
update public.audit_records set status='Cancelled',
 cancellation_reason='The contractor demobilised before the audit window.'
 where audit_code='AUD-2026-001';
update public.audit_programmes
 set status='Complete', approved_at='2026-01-10',
     approved_by='aaaaaaaa-0000-0000-0000-000000000001', completed_at='2026-12-31'
 where title='2026 HSE audit programme' returning status;
rollback to p2;
\echo '-- cancelling it with no reason is refused (want a check violation)'
savepoint p3; update public.audit_records set status='Cancelled'
 where audit_code='AUD-2026-001'; rollback to p3;
\echo '-- an approved programme needs its approver and date (want a check violation)'
savepoint p4; update public.audit_programmes set status='Approved'
 where title='2026 HSE audit programme'; rollback to p4;
commit;

\echo '=== Cross-tenant guards ==='
begin;
select set_config('request.jwt.claims','{"sub":"bbbbbbbb-0000-0000-0000-000000000002"}',true) \g /dev/null
set local role authenticated;
\echo '-- Org B running an audit off Org A''s checklist (want 42501)'
savepoint x1; insert into public.audit_records (org_id,audit_code,title,template_id)
 values ('22222222-2222-2222-2222-222222222222','AUD-2026-001','planted',
         '11111111-0000-0000-0000-0000000000b1'::uuid); rollback to x1;
\echo '-- Org B raising a finding against Org A''s audit (want 42501)'
savepoint x2; insert into public.audit_findings (org_id,finding_code,audit_id,title)
 values ('22222222-2222-2222-2222-222222222222','AF-2026-001',
         '11111111-0000-0000-0000-0000000000d1'::uuid,'planted'); rollback to x2;
\echo '-- Org B sees none of Org A''s rows (want 0 0 0 0)'
select (select count(*) from public.audit_programmes) as programmes,
       (select count(*) from public.audit_records)    as audits,
       (select count(*) from public.audit_responses)  as responses,
       (select count(*) from public.audit_findings)   as findings;
commit;

\echo '=== Org A sees its own (want 1 programme, 1 template, 2 items, 1 audit) ==='
begin;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}',true) \g /dev/null
set local role authenticated;
select (select count(*) from public.audit_programmes)     as programmes,
       (select count(*) from public.audit_templates)      as templates,
       (select count(*) from public.audit_template_items) as items,
       (select count(*) from public.audit_records)        as audits;
commit;

\echo '=== anon is denied outright (want permission denied, eight times) ==='
begin;
set local role anon;
savepoint n1; select count(*) from public.audit_programmes;     rollback to n1;
savepoint n2; select count(*) from public.audit_templates;      rollback to n2;
savepoint n3; select count(*) from public.audit_template_items; rollback to n3;
savepoint n4; select count(*) from public.audit_records;        rollback to n4;
savepoint n5; select count(*) from public.audit_responses;      rollback to n5;
savepoint n6; select count(*) from public.audit_findings;       rollback to n6;
savepoint n7; select count(*) from public.audit_actions;        rollback to n7;
savepoint n8; select count(*) from public.audit_activity_log;   rollback to n8;
commit;

\echo '=== RLS is on for all eight (want t eight times) ==='
select relname, relrowsecurity from pg_class
 where relname in ('audit_programmes','audit_templates','audit_template_items',
                   'audit_records','audit_responses','audit_findings','audit_actions',
                   'audit_activity_log')
 order by relname;
