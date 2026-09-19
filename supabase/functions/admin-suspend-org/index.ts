// admin-suspend-org: deployed from the Horizons era and never committed; brought into
// the repo by the platform-admin security fix (2026-09-19) so it can be
// reviewed. Before: it checked public.users.is_super_admin of a super_admin_id taken from the BODY, with verify_jwt off, so anyone could suspend any organization.
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

    const { organization_id, action } = await req.json()

    if (!['suspend', 'reactivate'].includes(action)) {
      throw new Error('Invalid action. Use "suspend" or "reactivate".')
    }

    // 1. Verify Super Admin: the CALLER (from the JWT), never a body field.
    const guard = await requirePlatformAdmin(supabase, req)
    if (!guard.ok) {
      return new Response(JSON.stringify({ success: false, error: guard.error }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: guard.status })
    }
    const super_admin_id = guard.caller.id

    // 2. Update Organization
    const newStatus = action === 'suspend' ? 'suspended' : 'active'
    const { error: updateError } = await supabase
      .from('organizations')
      .update({ subscription_status: newStatus })
      .eq('id', organization_id)

    if (updateError) throw updateError

    // 3. Log Action
    await supabase.from('user_activity_logs').insert({
      super_admin_id,
      organization_id,
      action: action === 'suspend' ? 'super_admin_suspend_org' : 'super_admin_reactivate_org',
      details: {
        new_status: newStatus
      },
      timestamp: new Date().toISOString()
    })

    return new Response(
      JSON.stringify({ success: true, message: `Organization ${action}ed successfully` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
