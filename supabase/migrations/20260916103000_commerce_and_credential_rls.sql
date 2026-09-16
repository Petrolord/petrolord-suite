-- Commerce and credential tables: RLS and grants
-- (Assurance-ROADMAP.md §1.5 and §5.)
--
-- NOT an Assurance migration. It is filed here because the AS1 audit is
-- where it surfaced, and it is kept in its own file so it can be
-- reviewed and applied on its own terms, ahead of the AS1 work.
--
-- REQUIRES A SECOND ENGINEER'S REVIEW BEFORE APPLY. `organization_apps`
-- and `quotes` are shared tables under the database conventions.
--
-- What the audit found, read live 2026-09-16 from pg_class and
-- information_schema.role_table_grants:
--
--   121 tables in the public schema have RLS DISABLED and carry
--   SELECT, INSERT, UPDATE, DELETE grants to `anon`.
--
-- `anon` is the role behind the publishable key that ships inside the
-- production SPA bundle. Almost all 121 are empty legacy Horizons
-- tables. These are the ones that are not, or that are load bearing:
--
--   organization_apps (9 rows)  the ORG ENTITLEMENT TABLE.
--                               SupabaseAuthContext reads it to decide
--                               who may open which app. Writable by
--                               anyone holding the publishable key,
--                               which is a monetization bypass, not
--                               only a data exposure.
--   pricing_config    (6 rows)  the server-authoritative module
--                               pricing. Writable the same way.
--   quotes            (6 rows)  real customer quotes, carrying
--                               organization_id and user_id.
--   modules           (9 rows)  the module catalogue behind the quote
--                               builder.
--   purchased_apps, subscription_modules, api_keys,
--   access_credentials, studio_access_tokens   empty, and the last
--                               three are named for secrets and are
--                               referenced by no code in the repo at
--                               all.
--
-- The fix is shaped by what actually reads each table, so that nothing
-- breaks:
--
--   pricing_config   read only by generate-quote and hse-checkout, both
--                    service role. No client reads it. Lock it fully.
--   organization_apps read client-side by authenticated users for their
--                    own org (SupabaseAuthContext, TeamManagement,
--                    seatUtils); written only by provision-quote
--                    (service role). SELECT for members, writes service
--                    role only.
--   quotes           read by QuoteDashboard for the owning org; written
--                    by the edge functions. Org-scoped SELECT.
--   modules          read by QuoteBuilder and SystemHealth as an
--                    authenticated catalogue. SELECT for authenticated,
--                    no writes.
--   purchased_apps   note in passing, NOT fixed here: it is INSERTED
--                    FROM THE BROWSER by
--                    src/utils/paymentVerificationLogic.js. Locking it
--                    would break payment verification, and moving that
--                    insert server-side is its own change. The anon
--                    grant goes; the authenticated insert stays, scoped
--                    to the caller's own org.
--   api_keys, access_credentials, studio_access_tokens,
--   subscription_modules, user_points_summary
--                    referenced by nothing. RLS on, no policy, both
--                    roles revoked. If something does turn out to read
--                    one of them, it fails loudly and visibly rather
--                    than staying open.
--
-- The remaining ~90 empty legacy tables are NOT touched here. Enabling
-- RLS on a table another module is quietly using breaks that module,
-- and that sweep needs its own audit of who reads what. It is §7
-- question 4 for the owner.
--
-- Idempotent.

begin;

-- ---------------------------------------------------------------
-- 1. Fully locked: no client role reaches these at all
-- ---------------------------------------------------------------
revoke all on table
  public.pricing_config,
  public.api_keys,
  public.access_credentials,
  public.studio_access_tokens,
  public.subscription_modules
from anon, authenticated;

alter table public.pricing_config       enable row level security;
alter table public.api_keys             enable row level security;
alter table public.access_credentials   enable row level security;
alter table public.studio_access_tokens enable row level security;
alter table public.subscription_modules enable row level security;

-- ---------------------------------------------------------------
-- 2. organization_apps: the entitlement table
-- ---------------------------------------------------------------
revoke all on table public.organization_apps from anon, authenticated;
grant select on table public.organization_apps to authenticated;
alter table public.organization_apps enable row level security;

drop policy if exists organization_apps_member_read on public.organization_apps;
create policy organization_apps_member_read on public.organization_apps
  for select to authenticated
  using (organization_id = public.my_org_id() or public.is_super_admin());

-- No write policy on purpose. Entitlements are granted by
-- provision-quote under the service role, which bypasses RLS. A client
-- must not be able to grant itself an app.

-- ---------------------------------------------------------------
-- 3. quotes: real customer records
-- ---------------------------------------------------------------
revoke all on table public.quotes from anon, authenticated;
grant select on table public.quotes to authenticated;
alter table public.quotes enable row level security;

drop policy if exists quotes_org_read on public.quotes;
create policy quotes_org_read on public.quotes
  for select to authenticated
  using (
    public.is_super_admin()
    or organization_id = public.my_org_id()
    or user_id = auth.uid()
  );

-- ---------------------------------------------------------------
-- 4. modules: an authenticated catalogue, never writable by a client
-- ---------------------------------------------------------------
revoke all on table public.modules from anon, authenticated;
grant select on table public.modules to authenticated;
alter table public.modules enable row level security;

drop policy if exists modules_read on public.modules;
create policy modules_read on public.modules
  for select to authenticated
  using (true);

-- ---------------------------------------------------------------
-- 5. purchased_apps: the browser still inserts here (see the header).
--    Take anon away and scope the authenticated writes to the caller.
-- ---------------------------------------------------------------
revoke all on table public.purchased_apps from anon;
alter table public.purchased_apps enable row level security;

drop policy if exists purchased_apps_own_rw on public.purchased_apps;
create policy purchased_apps_own_rw on public.purchased_apps
  for all to authenticated
  using (organization_id = public.my_org_id() or public.is_super_admin())
  with check (organization_id = public.my_org_id() or public.is_super_admin());

-- ---------------------------------------------------------------
-- 6. user_points_summary: gamification, org and user scoped
-- ---------------------------------------------------------------
revoke all on table public.user_points_summary from anon;
alter table public.user_points_summary enable row level security;

drop policy if exists user_points_summary_own_read on public.user_points_summary;
create policy user_points_summary_own_read on public.user_points_summary
  for select to authenticated
  using (
    public.is_super_admin()
    or user_id = auth.uid()
    or organization_id = public.my_org_id()
  );

comment on table public.organization_apps is
  'Org app entitlements. Read by members, written ONLY by the service role. RLS closed 2026-09-16 (Assurance-ROADMAP.md §5); it was anon-writable before that.';
comment on table public.pricing_config is
  'Server-authoritative pricing. No client role may read or write it. RLS closed 2026-09-16 (Assurance-ROADMAP.md §5).';

commit;
