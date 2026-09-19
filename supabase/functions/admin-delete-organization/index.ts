// admin-delete-organization: deployed from the Horizons era and never committed; brought into
// the repo by the platform-admin security fix (2026-09-19) so it can be
// reviewed. Before: it checked public.users.is_super_admin of a super_admin_id taken from the BODY, with verify_jwt off, so anyone could act as any admin (or self-flag, then pass their own id).
// The caller must be a signed-in PLATFORM SUPER ADMIN: a row in
// public.platform_admins (see ../_shared/platform-admin.ts). Any
// super_admin_id in the request body is ignored; the audited id is the
// caller's own.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from './cors.ts'
import { requirePlatformAdmin } from '../_shared/platform-admin.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { organization_id } = await req.json()

    // 1. Verify Super Admin: the CALLER (from the JWT), never a body field.
    const guard = await requirePlatformAdmin(supabase, req)
    if (!guard.ok) {
      return new Response(JSON.stringify({ success: false, error: guard.error }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: guard.status })
    }
    const super_admin_id = guard.caller.id

    // 2. Fetch Org Info for Logs (Before Deletion)
    const { data: orgInfo } = await supabase
      .from('organizations')
      .select('name, contact_email')
      .eq('id', organization_id)
      .single()

    // 3. Log Action Before Deletion (Audit Trail)
    await supabase.from('user_activity_logs').insert({
      super_admin_id,
      organization_id, // Note: This ID will act as a historical reference even if org is deleted, though FK constraint might fail if strict.
                       // Ideally logs are in a separate system or FK is nullable/set null on delete.
                       // We made organization_id nullable in migration.
      action: 'super_admin_delete_org',
      details: {
        org_id: organization_id,
        org_name: orgInfo?.name,
        contact: orgInfo?.contact_email,
        deleted_at: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    })

    // 4. Perform Deletion (Cascade Logic)
    
    // A. Get all users in org to clean up their app access
    const { data: orgUsers } = await supabase
      .from('organization_users')
      .select('user_id')
      .eq('organization_id', organization_id)
    
    const userIds = orgUsers?.map(u => u.user_id) || []

    if (userIds.length > 0) {
        // Delete user_app_access for these users
        await supabase
            .from('user_app_access')
            .delete()
            .in('user_id', userIds)
    }

    // B. Delete organization_users
    const { error: usersDelError } = await supabase
      .from('organization_users')
      .delete()
      .eq('organization_id', organization_id)
    if (usersDelError) throw usersDelError

    // C. Delete organization_apps
    const { error: appsDelError } = await supabase
      .from('organization_apps')
      .delete()
      .eq('organization_id', organization_id)
    if (appsDelError) throw appsDelError

    // D. Delete organization
    const { error: orgDelError } = await supabase
      .from('organizations')
      .delete()
      .eq('id', organization_id)
    if (orgDelError) throw orgDelError

    return new Response(
      JSON.stringify({ success: true, message: 'Organization deleted successfully' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
