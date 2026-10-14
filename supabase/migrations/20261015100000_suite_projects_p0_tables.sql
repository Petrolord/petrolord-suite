-- Suite Projects P0, part 1 of 3: clients, projects, members, access log,
-- user state, helper functions and RPCs.
-- Design: docs/scope/SuiteProject-DESIGN.md (sections 4, 5, 11 and 12, the
-- Client level added 2026-10-14). Owner GO 2026-10-14 ("Start with P0 and P1").
--
-- What this file adds (product tables only; organizations, users,
-- organization_members and invitations are only referenced, never changed):
--   suite_clients              a client (company) inside an organisation
--   suite_projects             a project inside an organisation, optionally under one client
--   suite_project_members      who belongs to a project (owner / editor / viewer)
--   suite_project_access_log   append-only: admin opens, visibility changes, members, archive, moves
--   suite_user_state           the user's current project
--
-- Access rules (all through SECURITY DEFINER helpers with search_path pinned;
-- every helper returns false on a null or unknown argument, so they fail closed):
--   suite_project_can_read(p)    data in p may be read: owner, member, any org member
--                                when visibility = 'organisation', or an org admin who
--                                opened the project through suite_project_admin_open in
--                                the last 12 hours (that open is logged)
--   suite_project_can_edit(p)    rows may be written into p: owner,
--                                member with role owner/editor, any org member of an open
--                                project, or a logged org admin. Archiving hides a project
--                                from the switcher and from the insert stamp; it does not
--                                lock existing rows.
--   suite_project_can_see(p)     the project's name and settings may be listed: can_read,
--                                or an org admin (admins see every project in the list,
--                                and reading a members-only project's data needs the
--                                logged open)
--   suite_project_row_visible(p) used by the registry RESTRICTIVE policies (file 2):
--                                true for null, for any project that is not members-only,
--                                otherwise can_read
--   suite_project_row_writable(p, row_org)  can_edit, and the row's organisation matches
--
-- Membership is read through organization_members inside these SECURITY DEFINER
-- functions with exactly the semantics of is_org_member / is_org_admin_of
-- (status active; admin roles owner, admin, org_admin, super_admin). Policies call
-- only the helpers. anon gets nothing: no table grant, no function EXECUTE.
--
-- Idempotent; no transaction lines (`supabase db query -f` sends the file as one
-- batch, which is one transaction). Rollback:
-- tools/security/suite-projects/rollback/20261015100000.rollback.sql

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------
create table if not exists public.suite_clients (
    id              uuid primary key default gen_random_uuid(),
    organization_id uuid references public.organizations(id) on delete cascade,
    owner_user_id   uuid not null references auth.users(id) on delete cascade,
    name            text not null check (length(btrim(name)) between 1 and 120),
    logo_url        text check (logo_url is null or length(logo_url) <= 1000),
    colour          text check (colour is null or colour ~ '^#[0-9A-Fa-f]{6}$'),
    notes           text check (notes is null or length(notes) <= 4000),
    status          text not null default 'active' check (status in ('active', 'archived')),
    created_by      uuid references auth.users(id) on delete set null,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);
comment on table public.suite_clients is
    'Suite Projects: a client (company) inside an organisation, or a personal client when organization_id is null. Groups projects in the header switcher. Design docs/scope/SuiteProject-DESIGN.md section 12.';
create index if not exists suite_clients_org_idx on public.suite_clients (organization_id);
create index if not exists suite_clients_owner_idx on public.suite_clients (owner_user_id);
create unique index if not exists suite_clients_name_uniq on public.suite_clients
    (coalesce(organization_id, owner_user_id), lower(btrim(name)));

create table if not exists public.suite_projects (
    id              uuid primary key default gen_random_uuid(),
    organization_id uuid references public.organizations(id) on delete cascade,
    owner_user_id   uuid references auth.users(id) on delete set null,
    client_id       uuid references public.suite_clients(id) on delete restrict,
    name            text not null check (length(btrim(name)) between 1 and 120),
    description     text check (description is null or length(description) <= 4000),
    visibility      text not null default 'organisation' check (visibility in ('organisation', 'members')),
    settings        jsonb not null default '{}'::jsonb,   -- reserved for P2 (CRS, units, datum, timescale)
    is_default      boolean not null default false,
    status          text not null default 'active' check (status in ('active', 'archived')),
    created_by      uuid references auth.users(id) on delete set null,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    app_build       text,
    -- a personal project (no organisation) always has an owner
    constraint suite_projects_personal_owner check (organization_id is not null or owner_user_id is not null),
    -- the default project is open, active and has no client
    constraint suite_projects_default_shape check (not is_default or (visibility = 'organisation' and status = 'active' and client_id is null))
);
comment on table public.suite_projects is
    'Suite Projects: a workspace inside an organisation (or a personal one), optionally under a client. Registry rows carry suite_project_id. Design docs/scope/SuiteProject-DESIGN.md.';
create unique index if not exists suite_projects_one_org_default on public.suite_projects (organization_id)
    where is_default and organization_id is not null;
create unique index if not exists suite_projects_one_personal_default on public.suite_projects (owner_user_id)
    where is_default and organization_id is null;
create index if not exists suite_projects_org_idx on public.suite_projects (organization_id);
create index if not exists suite_projects_owner_idx on public.suite_projects (owner_user_id);
create index if not exists suite_projects_client_idx on public.suite_projects (client_id) where client_id is not null;

create table if not exists public.suite_project_members (
    project_id uuid not null references public.suite_projects(id) on delete cascade,
    user_id    uuid not null references auth.users(id) on delete cascade,
    role       text not null default 'editor' check (role in ('owner', 'editor', 'viewer')),
    added_by   uuid references auth.users(id) on delete set null,
    added_at   timestamptz not null default now(),
    primary key (project_id, user_id)
);
create index if not exists suite_project_members_user_idx on public.suite_project_members (user_id);
comment on table public.suite_project_members is
    'Suite Projects: project membership. Members of a members-only project read its data; owner/editor write.';

create table if not exists public.suite_project_access_log (
    id              bigint generated always as identity primary key,
    project_id      uuid not null,           -- no FK: the log outlives a deleted project
    organization_id uuid,
    actor_id        uuid,
    event           text not null check (event in ('admin_open', 'visibility_changed', 'member_added', 'member_removed',
                                                   'member_role_changed', 'archived', 'restored', 'client_changed',
                                                   'rows_moved_in', 'rows_moved_out', 'created', 'deleted')),
    detail          jsonb not null default '{}'::jsonb,
    created_at      timestamptz not null default now()
);
create index if not exists suite_project_access_log_project_idx on public.suite_project_access_log (project_id, created_at desc);
create index if not exists suite_project_access_log_admin_idx on public.suite_project_access_log (actor_id, project_id, created_at desc)
    where event = 'admin_open';
comment on table public.suite_project_access_log is
    'Suite Projects: append-only log (admin opens of members-only projects, visibility and membership changes, archive, row moves). Written only by SECURITY DEFINER functions and triggers.';

create table if not exists public.suite_user_state (
    user_id            uuid primary key references auth.users(id) on delete cascade,
    current_project_id uuid references public.suite_projects(id) on delete set null,
    updated_at         timestamptz not null default now()
);
comment on table public.suite_user_state is
    'Suite Projects: the project each user is working in (header switcher). Null means the default project.';

-- ---------------------------------------------------------------------------
-- 2. Internal membership readers (explicit user id; never granted to clients)
-- ---------------------------------------------------------------------------
create or replace function public.suite_org_member_as(p_org uuid, p_uid uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
    select p_org is not null and p_uid is not null and exists (
        select 1 from public.organization_members om
         where om.organization_id = p_org and om.user_id = p_uid
           and coalesce(lower(om.status), 'active') = 'active');
$$;

create or replace function public.suite_org_admin_as(p_org uuid, p_uid uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
    select p_org is not null and p_uid is not null and exists (
        select 1 from public.organization_members om
         where om.organization_id = p_org and om.user_id = p_uid
           and coalesce(lower(om.status), 'active') = 'active'
           and om.role = any (array['owner', 'admin', 'org_admin', 'super_admin']));
$$;

-- the organisation a user works in: same rule as my_org_id()
create or replace function public.suite_org_of(p_uid uuid)
returns uuid language sql stable security definer set search_path = public, pg_temp as $$
    select om.organization_id from public.organization_members om
     where om.user_id = p_uid and coalesce(lower(om.status), 'active') = 'active'
     order by om.joined_at nulls last, om.created_at
     limit 1;
$$;

create or replace function public.suite_project_can_read_as(p uuid, p_uid uuid)
returns boolean language plpgsql stable security definer set search_path = public, pg_temp as $$
declare pr record;
begin
    if p is null or p_uid is null then return false; end if;
    select id, organization_id, owner_user_id, visibility into pr from public.suite_projects where id = p;
    if not found then return false; end if;
    if pr.owner_user_id = p_uid then return true; end if;
    if exists (select 1 from public.suite_project_members m where m.project_id = p and m.user_id = p_uid) then
        return true;
    end if;
    if pr.organization_id is null then return false; end if;
    if pr.visibility = 'organisation' and public.suite_org_member_as(pr.organization_id, p_uid) then
        return true;
    end if;
    -- an org admin reads a members-only project only after a logged open (12 hours)
    return public.suite_org_admin_as(pr.organization_id, p_uid) and exists (
        select 1 from public.suite_project_access_log l
         where l.event = 'admin_open' and l.actor_id = p_uid and l.project_id = p
           and l.created_at > now() - interval '12 hours');
end $$;

create or replace function public.suite_project_can_edit_as(p uuid, p_uid uuid)
returns boolean language plpgsql stable security definer set search_path = public, pg_temp as $$
declare pr record;
begin
    if p is null or p_uid is null then return false; end if;
    select id, organization_id, owner_user_id, visibility into pr from public.suite_projects where id = p;
    if not found then return false; end if;
    if pr.owner_user_id = p_uid then return true; end if;
    if exists (select 1 from public.suite_project_members m
                where m.project_id = p and m.user_id = p_uid and m.role in ('owner', 'editor')) then
        return true;
    end if;
    if pr.organization_id is null then return false; end if;
    if pr.visibility = 'organisation' and public.suite_org_member_as(pr.organization_id, p_uid) then
        return true;
    end if;
    return public.suite_org_admin_as(pr.organization_id, p_uid) and exists (
        select 1 from public.suite_project_access_log l
         where l.event = 'admin_open' and l.actor_id = p_uid and l.project_id = p
           and l.created_at > now() - interval '12 hours');
end $$;

-- who manages a project (rename, visibility, archive, members): owner, member role
-- owner, or an org admin
create or replace function public.suite_project_can_manage_as(p uuid, p_uid uuid)
returns boolean language plpgsql stable security definer set search_path = public, pg_temp as $$
declare pr record;
begin
    if p is null or p_uid is null then return false; end if;
    select id, organization_id, owner_user_id into pr from public.suite_projects where id = p;
    if not found then return false; end if;
    return pr.owner_user_id = p_uid
        or exists (select 1 from public.suite_project_members m where m.project_id = p and m.user_id = p_uid and m.role = 'owner')
        or public.suite_org_admin_as(pr.organization_id, p_uid);
end $$;

-- the user's default project (organisation default, else personal); created on demand
create or replace function public.suite_default_project_as(p_uid uuid)
returns uuid language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_org uuid; v_id uuid; v_owner uuid;
begin
    if p_uid is null then return null; end if;
    v_org := public.suite_org_of(p_uid);
    if v_org is not null then
        select id into v_id from public.suite_projects where organization_id = v_org and is_default;
        if v_id is null then
            select om.user_id into v_owner from public.organization_members om
             where om.organization_id = v_org and om.role = 'owner' and coalesce(lower(om.status), 'active') = 'active'
             order by om.joined_at nulls last, om.created_at limit 1;
            insert into public.suite_projects (organization_id, owner_user_id, name, is_default, visibility, created_by)
            values (v_org, coalesce(v_owner, p_uid), 'Default', true, 'organisation', p_uid)
            on conflict (organization_id) where is_default and organization_id is not null do nothing;
            select id into v_id from public.suite_projects where organization_id = v_org and is_default;
        end if;
        return v_id;
    end if;
    select id into v_id from public.suite_projects where organization_id is null and owner_user_id = p_uid and is_default;
    if v_id is null then
        insert into public.suite_projects (organization_id, owner_user_id, name, is_default, visibility, created_by)
        values (null, p_uid, 'Default', true, 'organisation', p_uid)
        on conflict (owner_user_id) where is_default and organization_id is null do nothing;
        select id into v_id from public.suite_projects where organization_id is null and owner_user_id = p_uid and is_default;
    end if;
    return v_id;
end $$;

revoke all on function public.suite_org_member_as(uuid, uuid), public.suite_org_admin_as(uuid, uuid),
    public.suite_org_of(uuid), public.suite_project_can_read_as(uuid, uuid), public.suite_project_can_edit_as(uuid, uuid),
    public.suite_project_can_manage_as(uuid, uuid), public.suite_default_project_as(uuid)
    from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Policy helpers (the caller is auth.uid(); authenticated only)
-- ---------------------------------------------------------------------------
create or replace function public.suite_project_can_read(p uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
    select public.suite_project_can_read_as(p, auth.uid());
$$;

create or replace function public.suite_project_can_edit(p uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
    select public.suite_project_can_edit_as(p, auth.uid());
$$;

create or replace function public.suite_project_can_see(p uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
    select public.suite_project_can_read_as(p, auth.uid())
        or coalesce((select public.suite_org_admin_as(sp.organization_id, auth.uid())
                       from public.suite_projects sp where sp.id = p), false);
$$;

create or replace function public.suite_project_row_visible(p uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
    select p is null
        or coalesce((select sp.visibility <> 'members' from public.suite_projects sp where sp.id = p), false)
        or public.suite_project_can_read_as(p, auth.uid());
$$;

create or replace function public.suite_project_row_writable(p uuid, p_row_org uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
    select p is null or (
        public.suite_project_can_edit_as(p, auth.uid())
        and coalesce((select sp.organization_id is null or p_row_org is null or p_row_org = sp.organization_id
                        from public.suite_projects sp where sp.id = p), false));
$$;

create or replace function public.suite_project_can_manage(p uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
    select public.suite_project_can_manage_as(p, auth.uid());
$$;

-- the two helpers below take the row's id only for lookups in OTHER tables:
-- SELECT policies must judge a row from its own columns, because a function
-- re-reading the same table cannot see a row the current statement just
-- inserted (INSERT ... RETURNING would be refused)
create or replace function public.suite_project_is_member(p uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
    select p is not null and auth.uid() is not null and exists (
        select 1 from public.suite_project_members m where m.project_id = p and m.user_id = auth.uid());
$$;

create or replace function public.suite_client_has_readable_project(c uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
    select c is not null and exists (select 1 from public.suite_projects sp
                                      where sp.client_id = c and public.suite_project_can_read_as(sp.id, auth.uid()));
$$;

create or replace function public.suite_client_can_see(c uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
    select coalesce((
        select cl.owner_user_id = auth.uid()
            or public.suite_org_admin_as(cl.organization_id, auth.uid())
            or exists (select 1 from public.suite_projects sp
                        where sp.client_id = cl.id and public.suite_project_can_read_as(sp.id, auth.uid()))
          from public.suite_clients cl where cl.id = c), false);
$$;

create or replace function public.suite_client_can_manage(c uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
    select coalesce((
        select cl.owner_user_id = auth.uid() or public.suite_org_admin_as(cl.organization_id, auth.uid())
          from public.suite_clients cl where cl.id = c), false);
$$;

revoke all on function public.suite_project_can_read(uuid), public.suite_project_can_edit(uuid),
    public.suite_project_can_see(uuid), public.suite_project_row_visible(uuid),
    public.suite_project_row_writable(uuid, uuid), public.suite_client_can_see(uuid),
    public.suite_client_can_manage(uuid), public.suite_project_can_manage(uuid),
    public.suite_project_is_member(uuid), public.suite_client_has_readable_project(uuid)
    from public, anon;
grant execute on function public.suite_project_can_read(uuid), public.suite_project_can_edit(uuid),
    public.suite_project_can_see(uuid), public.suite_project_row_visible(uuid),
    public.suite_project_row_writable(uuid, uuid), public.suite_client_can_see(uuid),
    public.suite_client_can_manage(uuid), public.suite_project_can_manage(uuid),
    public.suite_project_is_member(uuid), public.suite_client_has_readable_project(uuid)
    to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Triggers: integrity and the log
-- ---------------------------------------------------------------------------
-- true when the statement comes from a signed-in or anonymous API client (PostgREST
-- sets the JWT claims); false for migrations, the service role and SECURITY
-- DEFINER work done by these functions. current_user cannot be used: inside a
-- SECURITY DEFINER trigger it is the definer.
create or replace function public.suite_is_client()
returns boolean language sql stable set search_path = public, pg_temp as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') in ('authenticated', 'anon');
$$;

create or replace function public.suite_log(p_project uuid, p_org uuid, p_event text, p_detail jsonb)
returns void language sql volatile security definer set search_path = public, pg_temp as $$
    insert into public.suite_project_access_log (project_id, organization_id, actor_id, event, detail)
    values (p_project, p_org, auth.uid(), p_event, coalesce(p_detail, '{}'::jsonb));
$$;
revoke all on function public.suite_log(uuid, uuid, text, jsonb) from public, anon, authenticated;

create or replace function public.suite_clients_guard()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare client boolean := public.suite_is_client();
begin
    new.updated_at := now();
    if tg_op = 'INSERT' then
        if client then new.created_by := auth.uid(); end if;
        return new;
    end if;
    -- a client never changes organisation or creator
    new.organization_id := old.organization_id;
    new.created_by := old.created_by;
    if client and new.owner_user_id is distinct from old.owner_user_id
       and not public.suite_org_admin_as(old.organization_id, auth.uid()) then
        new.owner_user_id := old.owner_user_id;
    end if;
    return new;
end $$;
drop trigger if exists suite_clients_guard on public.suite_clients;
create trigger suite_clients_guard before insert or update on public.suite_clients
    for each row execute function public.suite_clients_guard();

create or replace function public.suite_projects_guard()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare client boolean := public.suite_is_client(); cl record;
begin
    new.updated_at := now();
    if tg_op = 'INSERT' then
        if client then
            new.created_by := auth.uid();
            new.is_default := false;          -- defaults are made only by suite_default_project_as
        end if;
    else
        new.organization_id := old.organization_id;
        new.created_by := old.created_by;
        new.is_default := old.is_default;
        new.created_at := old.created_at;
        if client and new.owner_user_id is distinct from old.owner_user_id
           and not public.suite_org_admin_as(old.organization_id, auth.uid()) then
            new.owner_user_id := old.owner_user_id;
        end if;
    end if;
    -- the client belongs to the same organisation (or, for a personal project, the same owner)
    if new.client_id is not null and client and new.client_id is distinct from (case when tg_op = 'UPDATE' then old.client_id end)
       and not public.suite_client_can_see(new.client_id) then
        raise exception 'You cannot use that client.' using errcode = '42501';
    end if;
    if new.client_id is not null then
        select organization_id, owner_user_id into cl from public.suite_clients where id = new.client_id;
        if not found
           or (new.organization_id is not null and cl.organization_id is distinct from new.organization_id)
           or (new.organization_id is null and (cl.organization_id is not null or cl.owner_user_id is distinct from new.owner_user_id)) then
            raise exception 'The client must belong to the same organisation as the project.' using errcode = 'SP001';
        end if;
    end if;
    return new;
end $$;
drop trigger if exists suite_projects_guard on public.suite_projects;
create trigger suite_projects_guard before insert or update on public.suite_projects
    for each row execute function public.suite_projects_guard();

create or replace function public.suite_projects_after()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
    if tg_op = 'INSERT' then
        if new.owner_user_id is not null then
            insert into public.suite_project_members (project_id, user_id, role, added_by)
            values (new.id, new.owner_user_id, 'owner', coalesce(auth.uid(), new.owner_user_id))
            on conflict do nothing;
        end if;
        perform public.suite_log(new.id, new.organization_id, 'created', jsonb_build_object('name', new.name, 'client_id', new.client_id));
        return null;
    elsif tg_op = 'UPDATE' then
        if new.visibility is distinct from old.visibility then
            perform public.suite_log(new.id, new.organization_id, 'visibility_changed',
                jsonb_build_object('from', old.visibility, 'to', new.visibility));
        end if;
        if new.status is distinct from old.status then
            perform public.suite_log(new.id, new.organization_id, case when new.status = 'archived' then 'archived' else 'restored' end, '{}'::jsonb);
        end if;
        if new.client_id is distinct from old.client_id then
            perform public.suite_log(new.id, new.organization_id, 'client_changed',
                jsonb_build_object('from', old.client_id, 'to', new.client_id));
        end if;
        return null;
    else
        perform public.suite_log(old.id, old.organization_id, 'deleted', jsonb_build_object('name', old.name));
        return null;
    end if;
end $$;
drop trigger if exists suite_projects_after on public.suite_projects;
create trigger suite_projects_after after insert or update or delete on public.suite_projects
    for each row execute function public.suite_projects_after();

create or replace function public.suite_project_members_guard()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare pr record; client boolean := public.suite_is_client();
begin
    if tg_op = 'DELETE' then
        select organization_id into pr from public.suite_projects where id = old.project_id;
        perform public.suite_log(old.project_id, pr.organization_id, 'member_removed', jsonb_build_object('user_id', old.user_id, 'role', old.role));
        return old;
    end if;
    select organization_id, owner_user_id into pr from public.suite_projects where id = new.project_id;
    if tg_op = 'INSERT' then
        if client and not public.suite_project_can_manage(new.project_id) then
            raise exception 'Only the project owner adds members.' using errcode = '42501';
        end if;
        if client then new.added_by := auth.uid(); new.added_at := now(); end if;
        -- a member of an organisation project is a member of that organisation;
        -- a personal project has its owner only
        if (pr.organization_id is not null and not public.suite_org_member_as(pr.organization_id, new.user_id))
           or (pr.organization_id is null and new.user_id is distinct from pr.owner_user_id) then
            raise exception 'Only members of the organisation can join this project.' using errcode = 'SP002';
        end if;
        perform public.suite_log(new.project_id, pr.organization_id, 'member_added', jsonb_build_object('user_id', new.user_id, 'role', new.role));
    else
        new.project_id := old.project_id; new.user_id := old.user_id;
        new.added_by := old.added_by; new.added_at := old.added_at;
        if new.role is distinct from old.role then
            perform public.suite_log(new.project_id, pr.organization_id, 'member_role_changed',
                jsonb_build_object('user_id', new.user_id, 'from', old.role, 'to', new.role));
        end if;
    end if;
    return new;
end $$;
drop trigger if exists suite_project_members_guard on public.suite_project_members;
create trigger suite_project_members_guard before insert or update or delete on public.suite_project_members
    for each row execute function public.suite_project_members_guard();

create or replace function public.suite_user_state_touch()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists suite_user_state_touch on public.suite_user_state;
create trigger suite_user_state_touch before insert or update on public.suite_user_state
    for each row execute function public.suite_user_state_touch();

-- trigger functions and the client test are never called directly
revoke all on function public.suite_is_client(), public.suite_clients_guard(), public.suite_projects_guard(),
    public.suite_projects_after(), public.suite_project_members_guard(), public.suite_user_state_touch()
    from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Row level security on the new tables
-- ---------------------------------------------------------------------------
alter table public.suite_clients enable row level security;
alter table public.suite_projects enable row level security;
alter table public.suite_project_members enable row level security;
alter table public.suite_project_access_log enable row level security;
alter table public.suite_user_state enable row level security;

drop policy if exists suite_clients_select on public.suite_clients;
create policy suite_clients_select on public.suite_clients for select to authenticated
    using (owner_user_id = auth.uid()
           or (organization_id is not null and is_org_admin_of(organization_id))
           or public.suite_client_has_readable_project(id));
drop policy if exists suite_clients_insert on public.suite_clients;
create policy suite_clients_insert on public.suite_clients for insert to authenticated
    with check (owner_user_id = auth.uid() and (organization_id is null or is_org_member(organization_id)));
drop policy if exists suite_clients_update on public.suite_clients;
create policy suite_clients_update on public.suite_clients for update to authenticated
    using (public.suite_client_can_manage(id)) with check (public.suite_client_can_manage(id));
drop policy if exists suite_clients_delete on public.suite_clients;
create policy suite_clients_delete on public.suite_clients for delete to authenticated
    using (public.suite_client_can_manage(id));

drop policy if exists suite_projects_select on public.suite_projects;
create policy suite_projects_select on public.suite_projects for select to authenticated
    using (owner_user_id = auth.uid()
           or (organization_id is not null and is_org_admin_of(organization_id))
           or (organization_id is not null and visibility = 'organisation' and is_org_member(organization_id))
           or public.suite_project_is_member(id));
drop policy if exists suite_projects_insert on public.suite_projects;
create policy suite_projects_insert on public.suite_projects for insert to authenticated
    with check (owner_user_id = auth.uid() and not is_default
                and (organization_id is null or is_org_member(organization_id))
                and (client_id is null or public.suite_client_can_see(client_id)));
drop policy if exists suite_projects_update on public.suite_projects;
create policy suite_projects_update on public.suite_projects for update to authenticated
    using (public.suite_project_can_manage(id))
    with check (client_id is null or public.suite_client_can_see(client_id));
drop policy if exists suite_projects_delete on public.suite_projects;
create policy suite_projects_delete on public.suite_projects for delete to authenticated
    using (not is_default and (owner_user_id = auth.uid() or is_org_admin_of(organization_id)));

drop policy if exists suite_project_members_select on public.suite_project_members;
create policy suite_project_members_select on public.suite_project_members for select to authenticated
    using (public.suite_project_can_see(project_id));
drop policy if exists suite_project_members_write on public.suite_project_members;
create policy suite_project_members_write on public.suite_project_members for insert to authenticated
    with check (public.suite_project_can_manage(project_id));
drop policy if exists suite_project_members_update on public.suite_project_members;
create policy suite_project_members_update on public.suite_project_members for update to authenticated
    using (public.suite_project_can_manage(project_id))
    with check (public.suite_project_can_manage(project_id));
drop policy if exists suite_project_members_delete on public.suite_project_members;
create policy suite_project_members_delete on public.suite_project_members for delete to authenticated
    using (user_id = auth.uid() or public.suite_project_can_manage(project_id));

drop policy if exists suite_project_access_log_select on public.suite_project_access_log;
create policy suite_project_access_log_select on public.suite_project_access_log for select to authenticated
    using (actor_id = auth.uid() or public.suite_project_can_manage(project_id)
           or (organization_id is not null and is_org_admin_of(organization_id)));

drop policy if exists suite_user_state_own on public.suite_user_state;
create policy suite_user_state_own on public.suite_user_state for all to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid() and (current_project_id is null or public.suite_project_can_see(current_project_id)));

revoke all on public.suite_clients, public.suite_projects, public.suite_project_members,
    public.suite_project_access_log, public.suite_user_state from anon, public;
revoke all on public.suite_clients, public.suite_projects, public.suite_project_members,
    public.suite_project_access_log, public.suite_user_state from authenticated;
grant select, insert, update, delete on public.suite_clients, public.suite_projects,
    public.suite_project_members, public.suite_user_state to authenticated;
grant select on public.suite_project_access_log to authenticated;

-- ---------------------------------------------------------------------------
-- 6. RPCs (authenticated only)
-- ---------------------------------------------------------------------------

-- The caller's default project (made on first call) and current project.
create or replace function public.suite_project_bootstrap()
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); v_default uuid; v_current uuid;
begin
    if uid is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
    v_default := public.suite_default_project_as(uid);
    select current_project_id into v_current from public.suite_user_state where user_id = uid;
    if v_current is not null and not public.suite_project_can_see(v_current) then v_current := null; end if;
    return jsonb_build_object('default_project_id', v_default,
                              'current_project_id', coalesce(v_current, v_default),
                              'organization_id', public.suite_org_of(uid));
end $$;

-- An org admin opens a members-only project they are not a member of: logged,
-- and the log row is what lets them read it for 12 hours.
create or replace function public.suite_project_admin_open(p uuid)
returns boolean language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); pr record;
begin
    if uid is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
    select id, organization_id, owner_user_id, visibility into pr from public.suite_projects where id = p;
    if not found then raise exception 'Project not found.' using errcode = 'P0002'; end if;
    if pr.owner_user_id = uid or exists (select 1 from public.suite_project_members m where m.project_id = p and m.user_id = uid)
       or (pr.visibility = 'organisation' and public.suite_org_member_as(pr.organization_id, uid)) then
        return true;                                   -- ordinary access, nothing to log
    end if;
    if not public.suite_org_admin_as(pr.organization_id, uid) then
        raise exception 'You are not a member of this project.' using errcode = '42501';
    end if;
    perform public.suite_log(p, pr.organization_id, 'admin_open', jsonb_build_object('visibility', pr.visibility));
    return true;
end $$;

revoke all on function public.suite_project_bootstrap(), public.suite_project_admin_open(uuid) from public, anon;
grant execute on function public.suite_project_bootstrap(), public.suite_project_admin_open(uuid) to authenticated;

notify pgrst, 'reload schema';
