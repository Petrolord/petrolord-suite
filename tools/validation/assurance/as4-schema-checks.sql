\set ON_ERROR_STOP 0
insert into public.organizations (id,name) values
 ('11111111-1111-1111-1111-111111111111','Org A'),
 ('22222222-2222-2222-2222-222222222222','Org B');
insert into public.organization_members (organization_id,user_id,role) values
 ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','admin'),
 ('22222222-2222-2222-2222-222222222222','bbbbbbbb-0000-0000-0000-000000000002','admin');

\echo '=== document numbers sequence per org AND per prefix ==='
begin;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}',true) \g /dev/null
set local role authenticated;
select public.next_document_number('11111111-1111-1111-1111-111111111111','HSE-POL') as first_hse;
insert into public.documents (org_id,document_number,title) values ('11111111-1111-1111-1111-111111111111','HSE-POL-001','a');
select public.next_document_number('11111111-1111-1111-1111-111111111111','HSE-POL') as second_hse;
\echo '-- a different prefix starts its own sequence (want ENG-DWG-001)'
select public.next_document_number('11111111-1111-1111-1111-111111111111','ENG-DWG') as first_eng;
\echo '-- casing and a trailing dash must NOT start a separate sequence (want HSE-POL-002)'
select public.next_document_number('11111111-1111-1111-1111-111111111111','hse-pol-') as normalised;
\echo '-- a duplicate number inside the org (want 23505)'
savepoint d; insert into public.documents (org_id,document_number,title) values ('11111111-1111-1111-1111-111111111111','HSE-POL-001','dup'); rollback to d;
\echo '-- the SAME number in another org is fine (want 1 row)'
savepoint e; insert into public.documents (org_id,document_number,title) values ('22222222-2222-2222-2222-222222222222','HSE-POL-001','other org') returning document_number; rollback to e;
\echo '-- another tenant cannot ask for a number (want 42501)'
savepoint f; select public.next_document_number('22222222-2222-2222-2222-222222222222','HSE-POL'); rollback to f;
commit;

\echo '=== one current revision per document, enforced by the database ==='
begin;
\echo '-- (seeded outside the role, so this block tests the index not the policy)'
insert into public.doc_revisions (document_id, revision_number, is_current)
  select id,'01',true from public.documents where document_number='HSE-POL-001';
\echo '-- a second current revision on the same document (want 23505)'
savepoint g;
insert into public.doc_revisions (document_id, revision_number, is_current)
  select id,'02',true from public.documents where document_number='HSE-POL-001';
rollback to g;
\echo '-- a non-current one is fine (want 1 row)'
insert into public.doc_revisions (document_id, revision_number, is_current)
  select id,'02',false from public.documents where document_number='HSE-POL-001' returning revision_number;
commit;

\echo '=== the vocabularies are enforced ==='
savepoint h;
insert into public.documents (org_id,document_number,title,status)
  values ('11111111-1111-1111-1111-111111111111','X-001','bad','Invented');
insert into public.documents (org_id,document_number,title,confidentiality)
  values ('11111111-1111-1111-1111-111111111111','X-002','bad','Top Secret');
