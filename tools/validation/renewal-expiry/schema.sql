do $$ begin create role anon nologin; exception when duplicate_object then null; end $$; do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$; do $$ begin create role service_role nologin; exception when duplicate_object then null; end $$;
create table public.organizations(id uuid primary key);
create table public.organization_members(id uuid primary key);
create table public.modules(id uuid primary key);
create table public.master_apps(id uuid primary key, app_name text, slug text, module text, module_id uuid, status text);
create table public.quotes(id uuid primary key default gen_random_uuid(), quote_id text, organization_id uuid, apps jsonb, modules jsonb, seats int, expiry_date timestamptz, status text, updated_at timestamptz);
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
grant usage on schema public to anon, authenticated, service_role;
insert into organizations values ('00000000-0000-0000-0000-00000000000a');
insert into modules values ('59fea9fb-ce7f-4534-b523-d4c0f8126032');
insert into master_apps values
 ('00000000-0000-0000-0000-0000000000a1','Material Balance Studio','mbal','Reservoir','59fea9fb-ce7f-4534-b523-d4c0f8126032','Active'),
 ('00000000-0000-0000-0000-0000000000a2','DCA Studio','dca','Reservoir','59fea9fb-ce7f-4534-b523-d4c0f8126032','Active'),
 ('00000000-0000-0000-0000-0000000000a3','Fluid Studio','fluid','Reservoir','59fea9fb-ce7f-4534-b523-d4c0f8126032','Active');
-- Q1: first purchase (A 3 seats, B 2 seats). Q2: renewal of A+B (seats 4/2) plus new app C. expiry_date NULL as generate-quote writes it.
insert into quotes(id,quote_id,organization_id,apps,seats) values
 ('00000000-0000-0000-0000-0000000000f1','QT-FIRST','00000000-0000-0000-0000-00000000000a',
  '[{"id":"00000000-0000-0000-0000-0000000000a1","name":"Material Balance Studio","module":"reservoir","seats":3},{"id":"00000000-0000-0000-0000-0000000000a2","name":"DCA Studio","module":"reservoir","seats":2}]',1),
 ('00000000-0000-0000-0000-0000000000f2','QT-RENEW','00000000-0000-0000-0000-00000000000a',
  '[{"id":"00000000-0000-0000-0000-0000000000a1","name":"Material Balance Studio","module":"reservoir","seats":4},{"id":"00000000-0000-0000-0000-0000000000a2","name":"DCA Studio","module":"reservoir","seats":2},{"id":"00000000-0000-0000-0000-0000000000a3","name":"Fluid Studio","module":"reservoir","seats":1}]',1);
