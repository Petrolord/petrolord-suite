-- =============================================================================
-- SECURITY 01 of 05 (2026-10): platform_admins and the invitation RPCs.
-- ADDITIVE ONLY. Safe to apply before any function deploy or site upload.
-- Runbook: docs/security/RUNBOOK-2026-10.md (step order, verify, rollback).
-- Review: owner + second engineer approved the security programme 2026-10-14.
--
-- Consolidates and supersedes the September drafts:
--   PR #538 20260919195000 section A/B (platform_admins, is_super_admin()),
--   PR #537 20260919190000 sections 3-4 (token-validated acceptance RPCs).
--
-- What it does
--   A. public.platform_admins: the single source of platform (Petrolord
--      staff) super admins. RLS on, no policies, no client grants: only
--      service_role and SECURITY DEFINER SQL read it. Seeded with exactly the
--      three accounts the owner confirmed on 2026-10-14 (the same three that
--      is_super_admin() hardcodes today): ayoasaolu@gmail.com,
--      ayodejiasaolu1@gmail.com, info@petrolord.com. support@petrolord.com is
--      deliberately not included (owner decision).
--   B. public.is_super_admin() reads platform_admins. Same signature and the
--      same three people, so every policy and function that calls it behaves
--      exactly as before on the day of apply.
--   C. New token-validated invitation functions (nothing calls them until the
--      HSE upload and the Suite function deploys that follow):
--        accept_invitation(p_token)        signed-in invitee joins
--        get_invitation_by_token(p_token)  pre-signup lookup, no token leaked
--        decline_invitation(p_token)       token holder declines
--        invitation_role_allowed(org, role) used by 02's invitation policies
--        invitation_accept_internal(...)   shared core, no client EXECUTE
--      Rules: auth user email must match the invitee email; invitation must be
--      pending and unexpired; the inviter must still be an active org admin
--      (or a platform admin); the membership takes the INVITATION's role;
--      super_admin is never granted by invitation; owner only from an owner;
--      single use under a row lock.
--   D. invitations.token unique index (0 duplicates on 2026-10-14).
--
-- Nothing is revoked, dropped or tightened here; 02-05 do that.
-- Idempotent: create if not exists / create or replace / on conflict.
-- No begin/commit inside (supabase db query -f runs the file as one
-- implicit transaction).
--
-- ROLLBACK (docs/security/RUNBOOK-2026-10.md, step R1): restore the old
-- is_super_admin() body (email list); the new functions and the table are
-- harmless when unused and may stay.
-- =============================================================================

-- ---- A. platform_admins -----------------------------------------------------
create table if not exists public.platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text,
  granted_at timestamptz not null default now(),
  granted_by text,
  note       text
);
comment on table public.platform_admins is
  'Platform (Petrolord staff) super admins. THE source of truth for public.is_super_admin() and every edge function admin check. service_role only.';

alter table public.platform_admins enable row level security;
revoke all on table public.platform_admins from public, anon, authenticated;
grant select, insert, update, delete on table public.platform_admins to service_role;

insert into public.platform_admins (user_id, email, granted_by, note)
select u.id, lower(u.email), 'migration 20261014120000',
       'owner-confirmed list 2026-10-14'
  from auth.users u
 where lower(u.email) in ('ayoasaolu@gmail.com', 'ayodejiasaolu1@gmail.com', 'info@petrolord.com')
   and u.email_confirmed_at is not null
on conflict (user_id) do nothing;

do $$
declare n int;
begin
  select count(*) into n from public.platform_admins;
  if n = 0 then
    raise exception 'platform_admins is empty after the seed: refusing to lock every platform admin out';
  end if;
end $$;

-- ---- B. is_super_admin() reads the table --------------------------------------
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid());
$$;
comment on function public.is_super_admin() is
  'Platform super admin = a row in public.platform_admins (security 2026-10). Never user_metadata, never users.is_super_admin.';
-- EXECUTE grants are left as they are: anon must keep EXECUTE because
-- policies granted to PUBLIC call this function (it returns false for anon).

-- ---- C. invitation core and RPCs -----------------------------------------------
create or replace function public.invitation_accept_internal(
  p_token text, p_user_id uuid, p_email text, p_full_name text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_token   text := nullif(btrim(p_token), '');
  v_email   text := lower(btrim(coalesce(p_email, '')));
  v_uuid    uuid;
  v_inv     public.invitations%rowtype;
  v_om      public.organization_members%rowtype;
  v_role    text;
  v_inviter_role text;
  v_name    text;
  v_admin_roles constant text[] := array['owner', 'admin', 'org_admin', 'super_admin'];
  v_invalid constant text := 'This invitation is invalid, has expired or has already been used.';
begin
  if p_user_id is null or v_email = '' then
    raise exception 'Sign in to accept this invitation.' using errcode = '42501';
  end if;
  if v_token is null then
    raise exception '%', v_invalid using errcode = '22023';
  end if;

  -- (a) public.invitations (HSE flow)
  begin
    v_uuid := v_token::uuid;
  exception when invalid_text_representation then
    v_uuid := null;
  end;

  if v_uuid is not null then
    select * into v_inv from public.invitations where token = v_uuid for update;
  end if;

  if v_inv.id is not null then
    if lower(btrim(v_inv.email)) is distinct from v_email then
      raise exception 'This invitation was sent to a different email address.' using errcode = '42501';
    end if;

    if v_inv.status = 'accepted' then
      select om.role into v_role from public.organization_members om
       where om.organization_id = v_inv.org_id and om.user_id = p_user_id
         and coalesce(lower(om.status), 'active') = 'active';
      if v_role is not null then
        return jsonb_build_object('status', 'already_accepted',
          'organization_id', v_inv.org_id, 'role', v_role);
      end if;
      raise exception '%', v_invalid using errcode = '22023';
    end if;

    if v_inv.status is distinct from 'pending'
       or v_inv.expires_at is null or v_inv.expires_at <= now()
       or v_inv.org_id is null then
      raise exception '%', v_invalid using errcode = '22023';
    end if;

    v_role := v_inv.role;
    if v_role is null or v_role = 'super_admin' then
      raise exception 'This invitation carries a role that cannot be granted by invitation.' using errcode = '42501';
    end if;

    select om.role into v_inviter_role from public.organization_members om
     where om.organization_id = v_inv.org_id and om.user_id = v_inv.invited_by
       and coalesce(lower(om.status), 'active') = 'active'
       and om.role = any (v_admin_roles)
     order by case om.role when 'super_admin' then 0 when 'owner' then 1 else 2 end
     limit 1;
    if v_inviter_role is null and v_inv.invited_by is not null
       and exists (select 1 from public.platform_admins pa where pa.user_id = v_inv.invited_by) then
      v_inviter_role := 'super_admin';
    end if;
    if v_inviter_role is null then
      raise exception 'This invitation was not issued by an administrator of the organization.' using errcode = '42501';
    end if;
    if v_role = 'owner' and v_inviter_role not in ('owner', 'super_admin') then
      raise exception 'Only an owner can invite another owner.' using errcode = '42501';
    end if;

    v_name := coalesce(nullif(btrim(p_full_name), ''),
                       nullif(btrim(concat_ws(' ', v_inv.first_name, v_inv.last_name)), ''),
                       v_email);

    select * into v_om from public.organization_members om
     where om.organization_id = v_inv.org_id
       and (om.user_id = p_user_id or lower(om.email) = v_email)
     order by (om.user_id = p_user_id) desc nulls last
     limit 1
     for update;

    if v_om.id is not null and v_om.user_id = p_user_id
       and coalesce(lower(v_om.status), 'active') = 'active' then
      update public.invitations set status = 'accepted', accepted_at = now() where id = v_inv.id;
      return jsonb_build_object('status', 'already_member',
        'organization_id', v_inv.org_id, 'role', v_om.role);
    elsif v_om.id is not null then
      update public.organization_members
         set user_id = p_user_id, role = v_role, status = 'active',
             full_name = coalesce(nullif(full_name, ''), v_name),
             joined_at = coalesce(joined_at, now()),
             invitation_token = null, invitation_expires_at = null,
             updated_at = now()
       where id = v_om.id;
    else
      insert into public.organization_members
        (organization_id, user_id, full_name, email, role, status, joined_at, created_at, updated_at)
      values (v_inv.org_id, p_user_id, v_name, v_email, v_role, 'active', now(), now(), now());
    end if;

    update public.invitations set status = 'accepted', accepted_at = now() where id = v_inv.id;
    return jsonb_build_object('status', 'accepted', 'organization_id', v_inv.org_id, 'role', v_role);
  end if;

  -- (b) organization_members.invitation_token (Suite flow)
  select * into v_om from public.organization_members om
   where om.invitation_token = v_token
   for update;

  if v_om.id is null then
    raise exception '%', v_invalid using errcode = '22023';
  end if;
  if lower(btrim(v_om.email)) is distinct from v_email then
    raise exception 'This invitation was sent to a different email address.' using errcode = '42501';
  end if;
  if coalesce(lower(v_om.status), '') <> 'invited'
     or v_om.invitation_expires_at is null or v_om.invitation_expires_at <= now() then
    raise exception '%', v_invalid using errcode = '22023';
  end if;
  if v_om.role = 'super_admin' then
    raise exception 'This invitation carries a role that cannot be granted by invitation.' using errcode = '42501';
  end if;

  update public.organization_members
     set user_id = p_user_id, status = 'active',
         full_name = coalesce(nullif(full_name, ''), nullif(btrim(p_full_name), ''), v_email),
         joined_at = coalesce(joined_at, now()),
         invitation_token = null, invitation_expires_at = null,
         updated_at = now()
   where id = v_om.id;

  return jsonb_build_object('status', 'accepted', 'organization_id', v_om.organization_id, 'role', v_om.role);
end;
$$;

revoke all on function public.invitation_accept_internal(text, uuid, text, text) from public, anon, authenticated, service_role;
comment on function public.invitation_accept_internal(text, uuid, text, text) is
  'Invitation acceptance core (token + invitee email + inviter check, invitation role, single use). Called only by accept_invitation() and handle_new_user().';

create or replace function public.accept_invitation(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_name  text;
begin
  if v_uid is null then
    raise exception 'Sign in to accept this invitation.' using errcode = '42501';
  end if;
  select au.email, au.raw_user_meta_data->>'full_name' into v_email, v_name
    from auth.users au where au.id = v_uid;
  if v_email is null then
    raise exception 'Sign in to accept this invitation.' using errcode = '42501';
  end if;
  return public.invitation_accept_internal(p_token, v_uid, v_email, v_name);
end;
$$;
revoke all on function public.accept_invitation(text) from public, anon;
grant execute on function public.accept_invitation(text) to authenticated, service_role;

create or replace function public.get_invitation_by_token(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_uuid uuid;
  v_out  jsonb;
begin
  begin
    v_uuid := nullif(btrim(p_token), '')::uuid;
  exception when invalid_text_representation then
    return null;
  end;
  if v_uuid is null then
    return null;
  end if;
  select jsonb_build_object(
           'id', i.id, 'email', i.email, 'role', i.role,
           'first_name', i.first_name, 'last_name', i.last_name,
           'org_id', i.org_id, 'expires_at', i.expires_at,
           'organizations', jsonb_build_object('name', o.name))
    into v_out
    from public.invitations i
    left join public.organizations o on o.id = i.org_id
   where i.token = v_uuid and i.status = 'pending' and i.expires_at > now();
  return v_out;
end;
$$;
revoke all on function public.get_invitation_by_token(text) from public;
grant execute on function public.get_invitation_by_token(text) to anon, authenticated, service_role;

create or replace function public.decline_invitation(p_token text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uuid uuid;
begin
  begin
    v_uuid := nullif(btrim(p_token), '')::uuid;
  exception when invalid_text_representation then
    return false;
  end;
  if v_uuid is null then
    return false;
  end if;
  update public.invitations set status = 'declined'
   where token = v_uuid and status = 'pending';
  return found;
end;
$$;
revoke all on function public.decline_invitation(text) from public;
grant execute on function public.decline_invitation(text) to anon, authenticated, service_role;

create or replace function public.invitation_role_allowed(p_org_id uuid, p_role text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select p_role is not null
     and (p_role <> 'super_admin' or public.is_super_admin())
     and (p_role <> 'owner'
          or public.has_org_role(p_org_id, array['owner', 'super_admin'])
          or public.is_super_admin());
$$;
revoke all on function public.invitation_role_allowed(uuid, text) from public, anon;
grant execute on function public.invitation_role_allowed(uuid, text) to authenticated, service_role;

-- ---- D. one token per invitation ---------------------------------------------
create unique index if not exists invitations_token_key on public.invitations (token);
