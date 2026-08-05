-- Internal (staff) organizations: members get full catalog access without
-- purchases. Consumed by get-user-entitlements (server gate) and
-- usePurchasedModules (client gate). The flag is set only by migration,
-- never by any signup or app path, so it cannot be self-granted.
--
-- SHARED TABLE (organizations): per Petrolord_Database_Conventions this
-- change requires a second engineer's review — flagged in the PR for the
-- owner's sign-off. Additive column with default false; zero behavior
-- change for every existing org except the one flagged below.

alter table public.organizations
  add column if not exists is_internal boolean not null default false;

-- The super-admin org becomes the Lordsway staff org: rename it honestly
-- and flag it internal. Staff join it through the normal invitation flow.
update public.organizations
   set name = 'Lordsway Energy',
       is_internal = true
 where id = '1ace6b81-f133-4d42-a0fe-56960e8d71ed'; -- was "User's Organization"
