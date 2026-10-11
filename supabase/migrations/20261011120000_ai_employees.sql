-- AI employees foundation (owner approved 2026-10-11). Petrolord's first AI
-- employee is the YouTube channel manager, running in shadow mode: it
-- proposes, and a human approves every item before anything is published.
--
-- Three new tables, all ai_ prefixed. No shared table is changed.
--   ai_employees         the register: one row per AI employee, its manager,
--                        autonomy step (1 shadow .. 4 autonomous within
--                        limits) and status (paused is the off switch).
--   ai_employee_tasks    the approval queue: proposals with a jsonb payload,
--                        reviewed by a named human.
--   ai_employee_actions  the append-only action log (no update or delete
--                        policy, no update or delete grant).
--
-- Access: platform super admins only, through public.is_super_admin(), the
-- existing helper the event_leads, promo code and admin pages use. The anon
-- role gets nothing. The worker (tools/ai-employees/youtube) uses the
-- service role, which bypasses RLS.
--
-- Idempotent: create if not exists, drop policy if exists, and the seed row
-- inserts on conflict do nothing. No transaction wrapper in this file.

create table if not exists public.ai_employees (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  role_title text not null,
  purpose text not null,
  manager_email text not null,
  next_manager_email text,
  autonomy_step int not null default 1,
  status text not null default 'active',
  started_at timestamptz not null default now(),
  next_review_at timestamptz,
  access_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_employees_slug_fmt check (slug ~ '^[a-z0-9][a-z0-9-]{1,63}$'),
  constraint ai_employees_autonomy_step check (autonomy_step between 1 and 4),
  constraint ai_employees_status check (status in ('active', 'paused', 'retired'))
);

create table if not exists public.ai_employee_tasks (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.ai_employees (id) on delete cascade,
  kind text not null,
  title text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'proposed',
  reviewer_email text,
  review_note text,
  reviewed_at timestamptz,
  result jsonb,
  created_at timestamptz not null default now(),
  constraint ai_employee_tasks_kind check (kind ~ '^[a-z][a-z0-9_]{1,63}$'),
  constraint ai_employee_tasks_title_len check (char_length(title) between 1 and 300),
  constraint ai_employee_tasks_status check (status in ('proposed', 'approved', 'rejected', 'done', 'failed')),
  constraint ai_employee_tasks_reviewed check (status = 'proposed' or (reviewer_email is not null and reviewed_at is not null))
);

create index if not exists ai_employee_tasks_employee_idx on public.ai_employee_tasks (employee_id, status, created_at desc);

create table if not exists public.ai_employee_actions (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.ai_employees (id) on delete cascade,
  task_id uuid references public.ai_employee_tasks (id) on delete set null,
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint ai_employee_actions_action_len check (char_length(action) between 1 and 120)
);

create index if not exists ai_employee_actions_employee_idx on public.ai_employee_actions (employee_id, created_at desc);

-- keep updated_at honest on the register
create or replace function public.ai_employees_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists ai_employees_touch_updated_at on public.ai_employees;
create trigger ai_employees_touch_updated_at
  before update on public.ai_employees
  for each row execute function public.ai_employees_touch_updated_at();

alter table public.ai_employees enable row level security;
alter table public.ai_employee_tasks enable row level security;
alter table public.ai_employee_actions enable row level security;

-- register: super admins read, add and edit (pause and resume)
drop policy if exists ai_employees_super_admin_select on public.ai_employees;
create policy ai_employees_super_admin_select on public.ai_employees
  for select to authenticated
  using (public.is_super_admin());

drop policy if exists ai_employees_super_admin_insert on public.ai_employees;
create policy ai_employees_super_admin_insert on public.ai_employees
  for insert to authenticated
  with check (public.is_super_admin());

drop policy if exists ai_employees_super_admin_update on public.ai_employees;
create policy ai_employees_super_admin_update on public.ai_employees
  for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- approval queue: super admins read, add and review
drop policy if exists ai_employee_tasks_super_admin_select on public.ai_employee_tasks;
create policy ai_employee_tasks_super_admin_select on public.ai_employee_tasks
  for select to authenticated
  using (public.is_super_admin());

drop policy if exists ai_employee_tasks_super_admin_insert on public.ai_employee_tasks;
create policy ai_employee_tasks_super_admin_insert on public.ai_employee_tasks
  for insert to authenticated
  with check (public.is_super_admin());

drop policy if exists ai_employee_tasks_super_admin_update on public.ai_employee_tasks;
create policy ai_employee_tasks_super_admin_update on public.ai_employee_tasks
  for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- action log: append-only. Read and insert; no update or delete policy.
drop policy if exists ai_employee_actions_super_admin_select on public.ai_employee_actions;
create policy ai_employee_actions_super_admin_select on public.ai_employee_actions
  for select to authenticated
  using (public.is_super_admin());

drop policy if exists ai_employee_actions_super_admin_insert on public.ai_employee_actions;
create policy ai_employee_actions_super_admin_insert on public.ai_employee_actions
  for insert to authenticated
  with check (public.is_super_admin());

-- table privileges: anon gets nothing; signed-in users reach the rows only
-- through the super-admin policies above
revoke all on public.ai_employees from anon, authenticated;
revoke all on public.ai_employee_tasks from anon, authenticated;
revoke all on public.ai_employee_actions from anon, authenticated;
grant select, insert, update on public.ai_employees to authenticated;
grant select, insert, update on public.ai_employee_tasks to authenticated;
grant select, insert on public.ai_employee_actions to authenticated;

-- seed: the YouTube channel manager, step 1 (shadow), first review in 30 days
insert into public.ai_employees (
  slug, role_title, purpose, manager_email, next_manager_email,
  autonomy_step, status, started_at, next_review_at, access_notes
) values (
  'youtube-channel-manager',
  'YouTube channel manager',
  'Prepares listings, uploads, playlists, comment replies and a weekly report for the Petrolord YouTube channel. Shadow mode: it proposes and a human approves every item.',
  'ayoasaolu@lordswayenergy.com',
  'seyiojo@lordswayenergy.com',
  1,
  'active',
  now(),
  now() + interval '30 days',
  'YouTube Data API v3 through an OAuth refresh token held root-only on the studio box (/root/.youtube-oauth-token.json). Reads finished videos under /root/demo-videos (read-only). Writes proposals to ai_employee_tasks; uploads only tasks a super admin approved.'
)
on conflict (slug) do nothing;
