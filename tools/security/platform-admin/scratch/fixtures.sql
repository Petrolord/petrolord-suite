-- Fixtures for the platform-admin rehearsal (run.sh, scratch Postgres only).
-- Created ONCE, before the migration, so the migration seeds from a state
-- shaped like production:
--   * the three allow-list admins, as in production, each with
--     users.is_super_admin = true; ONE of them is left UNCONFIRMED here to
--     prove the seed takes confirmed addresses only (in production all three
--     are confirmed);
--   * support@petrolord.com: trusted by the edge-function lists but NOT by
--     the SQL helper, users.is_super_admin false (as in production);
--   * two customer orgs with owners, a viewer, a target member, a pending
--     ADMIN invitation carrying a token, and a purchased app;
--   * a stranger with no organization.
insert into auth.users (id, email, email_confirmed_at) values
  ('a0000000-0000-0000-0000-000000000001', 'info@petrolord.com', now()),
  ('a0000000-0000-0000-0000-000000000002', 'ayoasaolu@gmail.com', now()),
  ('a0000000-0000-0000-0000-000000000003', 'ayodejiasaolu1@gmail.com', null),
  ('a0000000-0000-0000-0000-000000000004', 'support@petrolord.com', now()),
  ('b0000000-0000-0000-0000-000000000001', 'owner1@o1.test', now()),
  ('b0000000-0000-0000-0000-000000000002', 'viewer1@o1.test', now()),
  ('b0000000-0000-0000-0000-000000000003', 'owner2@o2.test', now()),
  ('b0000000-0000-0000-0000-000000000004', 'target2@o2.test', now()),
  ('c0000000-0000-0000-0000-000000000001', 'stranger@x.test', now());
insert into public.users (id, email, is_super_admin) select id, email,
  email in ('info@petrolord.com', 'ayoasaolu@gmail.com', 'ayodejiasaolu1@gmail.com') from auth.users;

insert into public.organizations (id, name) values
  ('00000000-0000-0000-0000-0000000000a1', 'O1'),
  ('00000000-0000-0000-0000-0000000000a2', 'O2');
insert into public.organization_members (organization_id, user_id, full_name, email, role, status, joined_at) values
  ('00000000-0000-0000-0000-0000000000a1', 'b0000000-0000-0000-0000-000000000001', 'Owner One', 'owner1@o1.test', 'owner', 'active', now() - interval '2 days'),
  ('00000000-0000-0000-0000-0000000000a1', 'b0000000-0000-0000-0000-000000000002', 'Viewer One', 'viewer1@o1.test', 'viewer', 'active', now() - interval '1 day'),
  ('00000000-0000-0000-0000-0000000000a2', 'b0000000-0000-0000-0000-000000000003', 'Owner Two', 'owner2@o2.test', 'owner', 'active', now() - interval '2 days'),
  ('00000000-0000-0000-0000-0000000000a2', 'b0000000-0000-0000-0000-000000000004', 'Target Two', 'target2@o2.test', 'engineer', 'active', now() - interval '1 day');
-- a pending ADMIN invitation in O1 (the token a viewer must not see)
insert into public.organization_members (organization_id, user_id, full_name, email, role, status, invited_at, invitation_token, invitation_expires_at) values
  ('00000000-0000-0000-0000-0000000000a1', null, 'New Hire', 'newhire@x.test', 'admin', 'invited', now(), 'tok-admin-invite-secret', now() + interval '7 days');
insert into public.purchased_modules (organization_id, module_id, app_id, status, seats_allocated) values
  ('00000000-0000-0000-0000-0000000000a2', 'reservoir', 'dca', 'active', 5);
update public.users set organization_id = '00000000-0000-0000-0000-0000000000a1' where email in ('owner1@o1.test', 'viewer1@o1.test');
update public.users set organization_id = '00000000-0000-0000-0000-0000000000a2' where email in ('owner2@o2.test', 'target2@o2.test');
