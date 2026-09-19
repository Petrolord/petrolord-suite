// admin-grant-user-app-access: deployed from the Horizons era and never committed; brought into
// the repo by the platform-admin security fix (2026-09-19) so it can be
// reviewed. Before: it checked public.users.is_super_admin of a super_admin_id taken from the BODY, with verify_jwt off, so anyone could grant any user any app.
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

    const { user_id, app_id, expires_at, reason, grant_type, granted_by } = await req.json()

    // 1. Verify Super Admin: the CALLER (from the JWT), never a body field.
    const guard = await requirePlatformAdmin(supabase, req)
    if (!guard.ok) {
      return new Response(JSON.stringify({ success: false, error: guard.error }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: guard.status })
    }
    const super_admin_id = guard.caller.id

    // 2. Fetch user to find organization_id for logging
    const { data: userOrg } = await supabase
        .from('organization_users')
        .select('organization_id')
        .eq('user_id', user_id)
        .single()

    // 3. Upsert Access
    const { error: accessError } = await supabase
      .from('user_app_access')
      .upsert({
        user_id,
        app_name: app_id, // Assuming app_id maps to app_name in schema
        expires_at: expires_at,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        // New fields if schema supports them, otherwise store in metadata or log only
        // Assuming schema might not have these columns yet based on provided migration history, 
        // we'll rely on the LOG for the details like reason/grant_type.
      }, { onConflict: 'user_id, app_name' })

    if (accessError) throw accessError

    // 4. Log Action
    await supabase.from('user_activity_logs').insert({
      super_admin_id,
      user_id,
      organization_id: userOrg?.organization_id,
      action: 'super_admin_grant_access',
      details: {
        app_id,
        expires_at,
        grant_type: grant_type || 'standard',
        reason: reason || 'No reason provided',
        granted_by: granted_by
      },
      timestamp: new Date().toISOString()
    })

    return new Response(
      JSON.stringify({ success: true, message: 'Access granted successfully' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
