-- =============================================================================
-- SECURITY 05 of 05 (2026-10): permissive and dormant-trap policies, the
-- recursive policies, leaky SECURITY DEFINER functions, storage policies.
-- Needs 01 (is_super_admin() from platform_admins). Runbook:
-- docs/security/RUNBOOK-2026-10.md. Read live 2026-10-14 (pg_policies,
-- has_function_privilege, storage.buckets); code checked on Suite main
-- b197cec3c and HSE main 9aed410.
--
--   1. 49 "Allow admin full access" policies test the JWT claim user_role
--      (get_my_claim('user_role') = 'admin'). No access-token hook sets that
--      claim today, so they grant nothing; but any future hook, or a
--      misconfigured one, would make them a platform-wide bypass. They are
--      DROPPED, which keeps today's effective access exactly (rewriting them
--      to is_super_admin() would have widened platform-admin reads of every
--      user's saved projects; the dry run showed it).
--   2. Policies that are USING/WITH CHECK (true), or that let any org admin of
--      ANY org manage global tables (has_any_org_role), are replaced with org,
--      owner or platform-admin scoping. Each table's live use is noted inline.
--      Global reference catalogues keep their public read (available_modules,
--      branding_templates, help_categories, pricing_tiers, safety_moments,
--      safety_moment_categories, tubular_grades): no tenant data.
--   3. petrophysics_team_members (and so petrophysics_projects and
--      petrophysics_activity_log) and quickvol_workspace_members had
--      self-referencing policies that raise 42P17 "infinite recursion". They
--      are rewritten through a SECURITY DEFINER membership helper.
--   4. SECURITY DEFINER functions that returned other users' or other orgs'
--      data to any caller: get_users_for_organization now requires a platform
--      admin or an admin of that org; functions with no client caller lose
--      client EXECUTE. Functions used inside PUBLIC policies keep anon EXECUTE
--      (revoking it would make anon queries on those tables error).
--   5. Storage: billing-docs (anyone, even anon, could upload, overwrite,
--      list and delete), quotes (anyone could list every quote PDF and any
--      signed-in user could upload into it), pta-* (any signed-in user could
--      read and overwrite anyone's files), org-assets listing (anon could list
--      every HSE quick-report photo), bank-transfer-proofs (any org admin of
--      any org could read every proof). Public buckets keep serving their
--      public URLs; only API listing and writes are narrowed.
--
-- Idempotent. No begin/commit inside.
-- ROLLBACK: tools/security/2026-10/rollback/05_policy_fixes.rollback.sql
-- (generated from the live pg_policies before apply; see the runbook).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. user_role JWT-claim policies: dropped (dormant today; a trap later)
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname
      from pg_policies
     where schemaname = 'public'
       and (coalesce(qual, '') like '%get_my_claim(''user_role''%'
            or coalesce(with_check, '') like '%get_my_claim(''user_role''%')
  loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Permissive policies
-- ---------------------------------------------------------------------------

-- access_audit_log: no client writer (service role only). Anyone could forge rows.
drop policy if exists "System insert access logs" on public.access_audit_log;

-- custom_fields / custom_workflows: no client code; ALL USING (true) let anyone
-- edit any org's definitions. Org members read, org admins manage.
drop policy if exists "Org admins manage custom fields" on public.custom_fields;
drop policy if exists "Org members view custom fields" on public.custom_fields;
drop policy if exists custom_fields_member_read on public.custom_fields;
drop policy if exists custom_fields_admin_write on public.custom_fields;
create policy custom_fields_member_read on public.custom_fields
  for select to authenticated
  using (public.is_org_member(organization_id) or public.is_super_admin());
create policy custom_fields_admin_write on public.custom_fields
  for all to authenticated
  using (public.is_org_admin_of(organization_id) or public.is_super_admin())
  with check (public.is_org_admin_of(organization_id) or public.is_super_admin());
revoke all on table public.custom_fields from anon;

drop policy if exists "Org admins manage workflows" on public.custom_workflows;
drop policy if exists "Org members view workflows" on public.custom_workflows;
drop policy if exists custom_workflows_member_read on public.custom_workflows;
drop policy if exists custom_workflows_admin_write on public.custom_workflows;
create policy custom_workflows_member_read on public.custom_workflows
  for select to authenticated
  using (public.is_org_member(organization_id) or public.is_super_admin());
create policy custom_workflows_admin_write on public.custom_workflows
  for all to authenticated
  using (public.is_org_admin_of(organization_id) or public.is_super_admin())
  with check (public.is_org_admin_of(organization_id) or public.is_super_admin());
revoke all on table public.custom_workflows from anon;

-- demo_requests: two duplicate PUBLIC insert policies. The only live writer is
-- the send-demo-request edge function (service role, bypasses RLS); no SPA
-- inserts. The anonymous form stays open through that function, which the
-- 2026-10 function sweep guards (validation, fixed recipient).
drop policy if exists "Allow public insert" on public.demo_requests;
drop policy if exists "Enable insert for everyone" on public.demo_requests;

-- drilling_incidents: public-source incident summaries (8 rows, no tenant
-- column). Read stays open to signed-in users only.
drop policy if exists "Allow public read access" on public.drilling_incidents;
drop policy if exists drilling_incidents_read on public.drilling_incidents;
create policy drilling_incidents_read on public.drilling_incidents
  for select to authenticated using (true);
revoke all on table public.drilling_incidents from anon;

-- incident_attachments / incident_comments: scoped through public.incidents.
drop policy if exists "Insert attachments" on public.incident_attachments;
drop policy if exists incident_attachments_org_insert on public.incident_attachments;
create policy incident_attachments_org_insert on public.incident_attachments
  for insert to authenticated
  with check (exists (select 1 from public.incidents i
                       where i.id = incident_attachments.incident_id
                         and (i.created_by = auth.uid() or public.is_org_member(i.organization_id))));

drop policy if exists "Insert comments" on public.incident_comments;
drop policy if exists "View comments" on public.incident_comments;
drop policy if exists incident_comments_org_read on public.incident_comments;
drop policy if exists incident_comments_org_insert on public.incident_comments;
create policy incident_comments_org_read on public.incident_comments
  for select to authenticated
  using (exists (select 1 from public.incidents i
                  where i.id = incident_comments.incident_id
                    and (i.created_by = auth.uid() or public.is_org_member(i.organization_id)))
         or public.is_super_admin());
create policy incident_comments_org_insert on public.incident_comments
  for insert to authenticated
  with check (coalesce(user_id, auth.uid()) = auth.uid()
              and exists (select 1 from public.incidents i
                           where i.id = incident_comments.incident_id
                             and (i.created_by = auth.uid() or public.is_org_member(i.organization_id))));
revoke all on table public.incident_attachments, public.incident_comments from anon;

-- leaderboard_scores: ALL USING (true) let anyone rewrite every score. HSE
-- now reads the points ledger; nothing writes this table. Org read stays.
drop policy if exists "Update leaderboard" on public.leaderboard_scores;
drop policy if exists "View leaderboard" on public.leaderboard_scores;
revoke all on table public.leaderboard_scores from anon;

-- master_apps: any signed-in user could insert catalogue rows. Writes are the
-- super admin console only ("Allow super admin write access" stays).
drop policy if exists "Allow authenticated users to insert apps" on public.master_apps;

-- mem_activity_log: inserts must be the caller's own rows.
drop policy if exists "Users can insert their own activity" on public.mem_activity_log;
drop policy if exists mem_activity_log_own_insert on public.mem_activity_log;
create policy mem_activity_log_own_insert on public.mem_activity_log
  for insert to authenticated
  with check (user_id = auth.uid());

-- nextgen_registrations: the legacy NextGen interest form (last row
-- 2026-09-08). Kept as the one anonymous insert, with shape checks, because
-- older NextGen pages may still post to it; reads stay platform admin only.
drop policy if exists "Allow public form submissions" on public.nextgen_registrations;
drop policy if exists nextgen_registrations_public_insert on public.nextgen_registrations;
create policy nextgen_registrations_public_insert on public.nextgen_registrations
  for insert to anon, authenticated
  with check (length(coalesce(full_name, '')) between 1 and 200
              and length(coalesce(email, '')) between 3 and 320
              and length(coalesce(details::text, '')) <= 5000);

-- petrophysics_notifications: dead table (04: RLS on, no client grants); its
-- INSERT WITH CHECK (true) policy is inert but is dropped so no true-write
-- policy remains on a tenant table.
drop policy if exists "System can insert notifications" on public.petrophysics_notifications;

-- organization_audit_logs: written by log-audit-event with the service role.
drop policy if exists "System can insert audit logs" on public.organization_audit_logs;

-- organization_branding: HSE reads its own org's row after sign-in
-- (GlobalThemeContext). No anonymous reader.
drop policy if exists "Public Read Branding" on public.organization_branding;
drop policy if exists organization_branding_member_read on public.organization_branding;
create policy organization_branding_member_read on public.organization_branding
  for select to authenticated
  using (public.is_org_member(organization_id) or public.is_super_admin());
revoke all on table public.organization_branding from anon;

-- quick_report_media / quick_report_notifications: scoped to the report's org.
-- The anonymous QR observation flow writes through the
-- submit-public-observation edge function (service role).
drop policy if exists "Insert media" on public.quick_report_media;
drop policy if exists quick_report_media_org_insert on public.quick_report_media;
create policy quick_report_media_org_insert on public.quick_report_media
  for insert to authenticated
  with check (coalesce(created_by, auth.uid()) = auth.uid()
              and exists (select 1 from public.quick_reports q
                           where q.id = quick_report_media.report_id
                             and (q.created_by_user_id = auth.uid() or public.is_org_member(q.organization_id))));
drop policy if exists "Insert notifications" on public.quick_report_notifications;
drop policy if exists "System can insert notifications" on public.quick_report_notifications;
drop policy if exists quick_report_notifications_org_insert on public.quick_report_notifications;
create policy quick_report_notifications_org_insert on public.quick_report_notifications
  for insert to authenticated
  with check (public.is_org_member(organization_id)
              and exists (select 1 from public.organization_members m
                           where m.organization_id = quick_report_notifications.organization_id
                             and m.user_id = quick_report_notifications.recipient_user_id));
revoke all on table public.quick_report_media, public.quick_report_notifications from anon;

-- user_notifications: anyone (even anon) could notify anyone. HSE
-- notificationService notifies colleagues in the same org; the Suite helper
-- notifies the caller. Allowed: to yourself, or to a member of an org you are
-- a member of, attributed to you.
drop policy if exists "Users can insert notifications" on public.user_notifications;
drop policy if exists "Allow authenticated users to insert notifications" on public.user_notifications;
drop policy if exists user_notifications_scoped_insert on public.user_notifications;
create policy user_notifications_scoped_insert on public.user_notifications
  for insert to authenticated
  with check (coalesce(created_by, auth.uid()) = auth.uid()
              and (user_id = auth.uid()
                   or (organization_id is not null
                       and public.is_org_member(organization_id)
                       and exists (select 1 from public.organization_members m
                                    where m.organization_id = user_notifications.organization_id
                                      and m.user_id = user_notifications.user_id))));
revoke all on table public.user_notifications from anon;

-- wells (legacy Well Planning table, 15 rows): two SELECT USING (true)
-- policies let every signed-in user read every user's wells. The only reader
-- (well-planning legacyImport) filters to the caller's own rows, which the
-- owner policy already allows.
drop policy if exists wells_read on public.wells;
drop policy if exists wells_read_authenticated on public.wells;

-- Global tables that ANY org admin of ANY org could manage.
drop policy if exists "Admins manage pricing" on public.pricing_tiers;
drop policy if exists pricing_tiers_platform_admin_write on public.pricing_tiers;
create policy pricing_tiers_platform_admin_write on public.pricing_tiers
  for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
drop policy if exists "Admins manage discounts" on public.discount_codes;
drop policy if exists discount_codes_platform_admin on public.discount_codes;
create policy discount_codes_platform_admin on public.discount_codes
  for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
drop policy if exists "Admins view reports" on public.billing_reports;
drop policy if exists billing_reports_platform_admin_read on public.billing_reports;
create policy billing_reports_platform_admin_read on public.billing_reports
  for select to authenticated
  using (public.is_super_admin());
revoke all on table public.discount_codes, public.billing_reports from anon;

-- ---------------------------------------------------------------------------
-- 3. Recursive policies
-- ---------------------------------------------------------------------------
create or replace function public.petrophysics_can_see_project(p_project uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.petrophysics_projects p
                  where p.id = p_project and p.user_id = auth.uid())
      or exists (select 1 from public.petrophysics_team_members t
                  where t.project_id = p_project and t.user_id = auth.uid());
$$;
revoke all on function public.petrophysics_can_see_project(uuid) from public, anon;
grant execute on function public.petrophysics_can_see_project(uuid) to authenticated, service_role;

create or replace function public.petrophysics_owns_project(p_project uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.petrophysics_projects p
                  where p.id = p_project and p.user_id = auth.uid());
$$;
revoke all on function public.petrophysics_owns_project(uuid) from public, anon;
grant execute on function public.petrophysics_owns_project(uuid) to authenticated, service_role;

drop policy if exists "Admins can manage team members" on public.petrophysics_team_members;
drop policy if exists "Users can view team members" on public.petrophysics_team_members;
drop policy if exists petrophysics_team_members_read on public.petrophysics_team_members;
drop policy if exists petrophysics_team_members_owner_write on public.petrophysics_team_members;
create policy petrophysics_team_members_read on public.petrophysics_team_members
  for select to authenticated
  using (user_id = auth.uid() or public.petrophysics_can_see_project(project_id));
create policy petrophysics_team_members_owner_write on public.petrophysics_team_members
  for all to authenticated
  using (public.petrophysics_owns_project(project_id))
  with check (public.petrophysics_owns_project(project_id));

drop policy if exists "Team members can view projects" on public.petrophysics_projects;
drop policy if exists petrophysics_projects_team_read on public.petrophysics_projects;
create policy petrophysics_projects_team_read on public.petrophysics_projects
  for select to authenticated
  using (public.petrophysics_can_see_project(id));

drop policy if exists "Team can insert logs" on public.petrophysics_activity_log;
drop policy if exists "Team can view logs" on public.petrophysics_activity_log;
drop policy if exists petrophysics_activity_log_team_read on public.petrophysics_activity_log;
drop policy if exists petrophysics_activity_log_team_insert on public.petrophysics_activity_log;
create policy petrophysics_activity_log_team_read on public.petrophysics_activity_log
  for select to authenticated
  using (public.petrophysics_can_see_project(project_id));
create policy petrophysics_activity_log_team_insert on public.petrophysics_activity_log
  for insert to authenticated
  with check (user_id = auth.uid() and public.petrophysics_can_see_project(project_id));
revoke all on table public.petrophysics_team_members, public.petrophysics_projects,
  public.petrophysics_activity_log from anon;

-- quickvol_workspaces / quickvol_workspace_members reference each other (and
-- the activity, comment and version tables reference them): 42P17. All five
-- are dead tables (04 enables RLS and removes client grants), so their legacy
-- policies are dropped; RLS stays on with no policy (service role only).
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname from pg_policies
     where schemaname = 'public'
       and tablename in ('quickvol_workspaces', 'quickvol_workspace_members',
                         'quickvol_activity_logs', 'quickvol_comments', 'quickvol_versions')
  loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4. SECURITY DEFINER functions
-- ---------------------------------------------------------------------------
-- get_users_for_organization: returned any org's member e-mails and sign-in
-- times to any signed-in user. Caller: the super admin console
-- (AdminOrganizationContext). Now platform admins and that org's admins only.
create or replace function public.get_users_for_organization(org_id uuid)
returns table(user_id uuid, email text, modules text[], role text,
              user_created_at timestamptz, user_last_sign_in_at timestamptz)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not (public.is_super_admin() or public.is_org_admin_of(get_users_for_organization.org_id)) then
    raise exception 'Only an administrator of this organization can list its users.' using errcode = '42501';
  end if;
  return query
  select
    u.id,
    u.email::text,
    coalesce((select array_agg(distinct oa.module_id)
                from public.organization_apps oa
               where oa.organization_id = get_users_for_organization.org_id
                 and oa.module_id is not null), array[]::text[]),
    om.role::text,
    u.created_at,
    u.last_sign_in_at
  from public.organization_members om
  join auth.users u on om.user_id = u.id
  where om.organization_id = get_users_for_organization.org_id;
end;
$function$;
revoke all on function public.get_users_for_organization(uuid) from public, anon;
grant execute on function public.get_users_for_organization(uuid) to authenticated, service_role;

-- No client caller in Suite or HSE: service role only.
do $$
declare f text;
begin
  foreach f in array array[
    'public.can_user_access_app(uuid, text)',
    'public.get_user_subscribed_modules(uuid)',
    'public.get_constraint_def(text)',
    'public.get_app_seat_usage_db(uuid, text)',
    'public.check_hse_access(uuid)'
  ] loop
    if to_regprocedure(f) is not null then
      execute format('revoke execute on function %s from public, anon, authenticated', f);
      execute format('grant execute on function %s to service_role', f);
    end if;
  end loop;
end $$;

-- Signed-in only (each checks auth.uid() or is_super_admin() inside).
do $$
declare f text;
begin
  foreach f in array array[
    'public.delete_organization(uuid)',
    'public.hse_complete_org_setup(uuid)',
    'public.update_last_accessed_app(text)'
  ] loop
    if to_regprocedure(f) is not null then
      execute format('revoke execute on function %s from public, anon', f);
      execute format('grant execute on function %s to authenticated, service_role', f);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Storage
-- ---------------------------------------------------------------------------
-- billing-docs: no code uses it (1 legacy object). Platform admins only.
drop policy if exists "Allow authenticated users to manage billing docs" on storage.objects;
drop policy if exists billing_docs_platform_admin on storage.objects;
create policy billing_docs_platform_admin on storage.objects
  for all to authenticated
  using (bucket_id = 'billing-docs' and public.is_super_admin())
  with check (bucket_id = 'billing-docs' and public.is_super_admin());

-- quotes: written by generate-quote (service role); links are public URLs
-- (public bucket, unaffected). API listing and client uploads closed.
drop policy if exists "Public Access to Quotes" on storage.objects;
drop policy if exists "Auth Users Upload Quotes" on storage.objects;
drop policy if exists quotes_platform_admin_read on storage.objects;
create policy quotes_platform_admin_read on storage.objects
  for select to authenticated
  using (bucket_id = 'quotes' and public.is_super_admin());

-- org-assets: HSE uploads (upsert) and shows public URLs after sign-in.
-- Listing narrowed from anyone to signed-in users; public URLs unaffected.
drop policy if exists "Public Access to Org Assets" on storage.objects;
drop policy if exists org_assets_authenticated_read on storage.objects;
create policy org_assets_authenticated_read on storage.objects
  for select to authenticated
  using (bucket_id = 'org-assets');

-- pta-reports / pta-uploads: no code, 0 objects. Own folder only.
drop policy if exists "Allow authenticated users to manage pta-reports" on storage.objects;
drop policy if exists "Allow authenticated users to manage pta-uploads" on storage.objects;
drop policy if exists pta_objects_own on storage.objects;
create policy pta_objects_own on storage.objects
  for all to authenticated
  using (bucket_id in ('pta-reports', 'pta-uploads') and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id in ('pta-reports', 'pta-uploads') and (storage.foldername(name))[1] = auth.uid()::text);

-- bank-transfer-proofs: any org admin of any org could read every proof.
-- Platform admins (and the service role, which bypasses RLS) only.
drop policy if exists "Admins View Proofs" on storage.objects;
drop policy if exists bank_transfer_proofs_platform_admin_read on storage.objects;
create policy bank_transfer_proofs_platform_admin_read on storage.objects
  for select to authenticated
  using (bucket_id = 'bank-transfer-proofs' and public.is_super_admin());
