-- Scratch schema for the renewal-expiry dry run (local postgres:16 only).
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$; do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$; do $$ begin create role service_role nologin; exception when duplicate_object then null; end $$;
-- Live public-schema default ACL for functions (read 2026-09-28): new functions get anon/authenticated EXECUTE.
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
create table public.organizations(id uuid primary key, suite_status text);
create table public.organization_members(id uuid primary key);
create table public.modules(id uuid primary key);
create table public.master_apps(id uuid primary key, app_name text, slug text, module text, module_id uuid, status text);
-- quotes: the columns the RPC and the finalizers read (live types, 2026-09-28)
create table public.quotes(id uuid primary key default gen_random_uuid(), quote_id text unique, organization_id uuid, apps jsonb, modules jsonb, seats int,
 expiry_date timestamptz, status text, updated_at timestamptz, billing_term text, billing_period text, payment_verified boolean default false, payment_verified_at timestamptz);
-- purchased_modules: live column list, FKs and indexes (2026-09-28)
create table public.purchased_modules(
 id uuid primary key default gen_random_uuid(), organization_id uuid references organizations(id), module_id text, app_id text, module_name text,
 purchase_date timestamptz default now(), expiry_date timestamptz, status text, quote_id uuid references quotes(id),
 seats_allocated int default 0, storage_allocated_gb int default 0, current_seats_used int default 0, current_storage_used_gb numeric default 0.00,
 subscription_status text default 'active', renewal_date timestamptz, auto_renew boolean default true, cancellation_date timestamptz,
 cancellation_reason text, cancelled_by uuid references organization_members(id), next_billing_date timestamptz, last_renewal_date timestamptz,
 module_uuid uuid references modules(id), app_uuid uuid references master_apps(id));
create unique index purchased_modules_org_app_uidx on public.purchased_modules(organization_id, app_id);
create unique index purchased_modules_org_module_noapp_uidx on public.purchased_modules(organization_id, module_id) where app_id is null;
-- subscriptions / payments: only what the finalizer model touches (end_date is a date, as live)
create table public.subscriptions(id uuid primary key default gen_random_uuid(), organization_id uuid, quote_id uuid, term text, billing_period text,
 start_date date, end_date date, status text, payment_status text);
create table public.payments(reference text primary key, status text, local_status text);
grant usage on schema public to anon, authenticated, service_role;
insert into modules values ('59fea9fb-ce7f-4534-b523-d4c0f8126032');
insert into master_apps values
 ('00000000-0000-0000-0000-0000000000a1','Material Balance Studio','mbal','Reservoir','59fea9fb-ce7f-4534-b523-d4c0f8126032','Active'),
 ('00000000-0000-0000-0000-0000000000a2','DCA Studio','dca','Reservoir','59fea9fb-ce7f-4534-b523-d4c0f8126032','Active'),
 ('00000000-0000-0000-0000-0000000000a3','Fluid Studio','fluid','Reservoir','59fea9fb-ce7f-4534-b523-d4c0f8126032','Active');

-- Scenario helpers. mkq(org, quote text id, 'a1:3,a2:2', term) makes an org (if new) and a quote
-- the way generate-quote stores it (apps as objects with per-app seats, expiry_date NULL).
create function mkq(p_org int, p_q text, p_apps text, p_term text) returns void language plpgsql as $$
declare o uuid := ('00000000-0000-0000-0000-0000000000' || lpad(p_org::text, 2, '0'))::uuid; j jsonb := '[]';
        x text; begin
  insert into organizations values (o, null) on conflict do nothing;
  foreach x in array string_to_array(p_apps, ',') loop
    j := j || jsonb_build_object('id', '00000000-0000-0000-0000-0000000000' || split_part(x, ':', 1), 'name', split_part(x, ':', 1),
                                 'module', 'reservoir', 'seats', split_part(x, ':', 2)::int);
  end loop;
  insert into quotes(quote_id, organization_id, apps, modules, seats, billing_term, billing_period)
    values (p_q, o, j, '["reservoir"]', 1, p_term, p_term);
end $$;
create function org(p int) returns uuid language sql as $$ select ('00000000-0000-0000-0000-0000000000' || lpad(p::text, 2, '0'))::uuid $$;
-- "a1=2027-01-15, a2=..., MOD=..." for one org (dates in UTC)
create function ends(p int) returns text language sql as $$
  select string_agg(coalesce(nullif(right(app_id, 2), ''), 'MOD') || '=' || coalesce(to_char(expiry_date at time zone 'UTC', 'YYYY-MM-DD'), 'NULL'), ', '
                    order by app_id nulls last) from purchased_modules where organization_id = org(p) $$;
create function subs(p int) returns text language sql as $$
  select count(*) || ' sub(s): ' || coalesce(string_agg(q.quote_id || '->' || coalesce(s.end_date::text, 'NULL'), ', ' order by q.quote_id), '')
  from subscriptions s join quotes q on q.id = s.quote_id where s.organization_id = org(p) $$;
