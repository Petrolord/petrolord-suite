-- AS6 schema checks, against a scratch PostgreSQL 15 carrying the AS1
-- backfill plus 20260917400000.
\set ON_ERROR_STOP 0
insert into public.organizations (id,name) values
 ('11111111-1111-1111-1111-111111111111','Org A'),
 ('22222222-2222-2222-2222-222222222222','Org B');
-- moc_approvals.approver_id is a foreign key into public.users, so the
-- approver has to exist before a signature can be recorded.
insert into public.users (id,email) values
 ('aaaaaaaa-0000-0000-0000-000000000001','a@example.test'),
 ('bbbbbbbb-0000-0000-0000-000000000002','b@example.test');
insert into public.organization_members (organization_id,user_id,role) values
 ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','admin'),
 ('22222222-2222-2222-2222-222222222222','bbbbbbbb-0000-0000-0000-000000000002','admin');

\echo '=== MOC codes: sequence per org and per year ==='
begin;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}',true) \g /dev/null
set local role authenticated;
\echo '-- first of 2026 (want MOC-2026-001)'
savepoint a; select public.next_moc_code('11111111-1111-1111-1111-111111111111',2026) as first; rollback to a;
insert into public.moc_records (org_id,moc_code,title,category,type,stage)
  values ('11111111-1111-1111-1111-111111111111','MOC-2026-001','Upgrade compressor',
          'Facility or hardware','Permanent','Review');
\echo '-- second (want MOC-2026-002)'
savepoint b; select public.next_moc_code('11111111-1111-1111-1111-111111111111',2026) as second; rollback to b;
\echo '-- a duplicate code inside the org (want 23505)'
savepoint c; insert into public.moc_records (org_id,moc_code,title,category,type)
  values ('11111111-1111-1111-1111-111111111111','MOC-2026-001','dup','Other','Permanent'); rollback to c;
\echo '-- another tenant cannot ask for a code (want 42501)'
savepoint d; select public.next_moc_code('22222222-2222-2222-2222-222222222222',2026); rollback to d;
commit;

\echo '=== THE SAFETY GATE: a temporary change must carry an expiry date ==='
begin;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}',true) \g /dev/null
set local role authenticated;
\echo '-- a TEMPORARY change past Draft with no expiry (want a check violation)'
savepoint e; insert into public.moc_records (org_id,moc_code,title,category,type,stage)
  values ('11111111-1111-1111-1111-111111111111','MOC-2026-010','Pipeline clamp',
          'Facility or hardware','Temporary','Review'); rollback to e;
\echo '-- an EMERGENCY change past Draft with no expiry (want a check violation)'
savepoint f; insert into public.moc_records (org_id,moc_code,title,category,type,stage)
  values ('11111111-1111-1111-1111-111111111111','MOC-2026-011','Emergency bypass',
          'Process or chemistry','Emergency','Approval'); rollback to f;
\echo '-- the same temporary change WITH an expiry (want 1 row)'
savepoint g; insert into public.moc_records (org_id,moc_code,title,category,type,stage,expiry_date)
  values ('11111111-1111-1111-1111-111111111111','MOC-2026-012','Pipeline clamp',
          'Facility or hardware','Temporary','Review','2026-12-31')
  returning moc_code; rollback to g;
\echo '-- a temporary change still in DRAFT is exempt (want 1 row)'
savepoint h; insert into public.moc_records (org_id,moc_code,title,category,type,stage)
  values ('11111111-1111-1111-1111-111111111111','MOC-2026-013','Draft clamp',
          'Facility or hardware','Temporary','Draft')
  returning moc_code; rollback to h;
\echo '-- a PERMANENT change needs no expiry (want 1 row)'
savepoint i; insert into public.moc_records (org_id,moc_code,title,category,type,stage)
  values ('11111111-1111-1111-1111-111111111111','MOC-2026-014','New DCS logic',
          'Software or IT','Permanent','Approval')
  returning moc_code; rollback to i;
\echo '-- and it cannot be dodged by EDITING the expiry away afterwards (want a check violation)'
savepoint j;
insert into public.moc_records (org_id,moc_code,title,category,type,stage,expiry_date)
  values ('11111111-1111-1111-1111-111111111111','MOC-2026-015','Clamp',
          'Facility or hardware','Temporary','Review','2026-12-31');
update public.moc_records set expiry_date = null where moc_code='MOC-2026-015';
rollback to j;
commit;

\echo '=== the vocabularies are enforced ==='
begin;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}',true) \g /dev/null
set local role authenticated;
savepoint k; insert into public.moc_records (org_id,moc_code,title,category,type,stage)
  values ('11111111-1111-1111-1111-111111111111','MOC-2026-020','x','Facility or hardware','Permanent','Invented'); rollback to k;
savepoint l; insert into public.moc_records (org_id,moc_code,title,category,type)
  values ('11111111-1111-1111-1111-111111111111','MOC-2026-021','x','Facility or hardware','Provisional'); rollback to l;
savepoint m; insert into public.moc_records (org_id,moc_code,title,category,type,risk_level)
  values ('11111111-1111-1111-1111-111111111111','MOC-2026-022','x','Facility or hardware','Permanent','Catastrophic'); rollback to m;
savepoint n; insert into public.moc_approvals (moc_id,approver_id,level,status)
  select id,'aaaaaaaa-0000-0000-0000-000000000001',1,'Maybe' from public.moc_records where moc_code='MOC-2026-001'; rollback to n;
savepoint o; insert into public.moc_actions (moc_id,action_type,description)
  select id,'Whenever','x' from public.moc_records where moc_code='MOC-2026-001'; rollback to o;
commit;

\echo '=== one approval per approver per level ==='
begin;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}',true) \g /dev/null
set local role authenticated;
insert into public.moc_approvals (moc_id,approver_id,level,role)
  select id,'aaaaaaaa-0000-0000-0000-000000000001',1,'Technical Authority'
    from public.moc_records where moc_code='MOC-2026-001';
\echo '-- the same approver at the same level again (want 23505)'
savepoint p; insert into public.moc_approvals (moc_id,approver_id,level,role)
  select id,'aaaaaaaa-0000-0000-0000-000000000001',1,'Technical Authority'
    from public.moc_records where moc_code='MOC-2026-001'; rollback to p;
\echo '-- the same approver at a HIGHER level is a real second signature (want 1 row)'
savepoint q; insert into public.moc_approvals (moc_id,approver_id,level,role)
  select id,'aaaaaaaa-0000-0000-0000-000000000001',2,'Management Approver'
    from public.moc_records where moc_code='MOC-2026-001' returning level; rollback to q;
commit;

\echo '=== cross-tenant and anon ==='
begin;
select set_config('request.jwt.claims','{"sub":"bbbbbbbb-0000-0000-0000-000000000002"}',true) \g /dev/null
set local role authenticated;
\echo '-- Org B sees Org A changes (want 0)'
savepoint r; select count(*) as orgb_sees from public.moc_records; rollback to r;
\echo '-- Org B sees Org A activity log, a child (want 0)'
savepoint s; select count(*) as orgb_sees_log from public.moc_activity_log; rollback to s;
\echo '-- Org B plants a change into Org A (want denied)'
savepoint t; insert into public.moc_records (org_id,moc_code,title,category,type)
  values ('11111111-1111-1111-1111-111111111111','MOC-2026-666','planted','Other','Permanent'); rollback to t;
rollback;
begin;
select set_config('request.jwt.claims','{}',true) \g /dev/null
set local role anon;
\echo '-- anon (want permission denied on both)'
savepoint u; select count(*) from public.moc_records; rollback to u;
savepoint v; select count(*) from public.moc_approvals; rollback to v;
rollback;
