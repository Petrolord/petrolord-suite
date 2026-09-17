insert into public.organizations (id, name) values
  ('11111111-1111-1111-1111-111111111111','Org A'),
  ('22222222-2222-2222-2222-222222222222','Org B');
insert into public.organization_members (organization_id, user_id, role) values
  ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','admin'),
  ('22222222-2222-2222-2222-222222222222','bbbbbbbb-0000-0000-0000-000000000002','admin');
insert into public.regulatory_authorities (id, org_id, name, acronym) values
  ('33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111','A Regulator','AR');
insert into public.regulatory_obligations (id, org_id, authority_id, title, obligation_code) values
  ('44444444-4444-4444-4444-444444444444','11111111-1111-1111-1111-111111111111',
   '33333333-3333-3333-3333-333333333333','Org A discharge permit','REG-1001');
insert into public.regulatory_evidence (obligation_id, submitted_date, reference) values
  ('44444444-4444-4444-4444-444444444444','2026-01-31','A-SUB-1');
