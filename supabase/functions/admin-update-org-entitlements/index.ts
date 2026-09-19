// admin-update-org-entitlements: deployed from the Horizons era and never committed; brought into
// the repo by the platform-admin security fix (2026-09-19) so it can be
// reviewed. Before: it checked public.users.is_super_admin of a super_admin_id taken from the BODY, with verify_jwt off, so anyone could rewrite any organization's apps.
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

    const { organization_id, entitlements } = await req.json()

    // 1. Verify Super Admin: the CALLER (from the JWT), never a body field.
    const guard = await requirePlatformAdmin(supabase, req)
    if (!guard.ok) {
      return new Response(JSON.stringify({ success: false, error: guard.error }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: guard.status })
    }
    const super_admin_id = guard.caller.id

    // 2. Fetch Organization Type
    const { data: orgData, error: orgError } = await supabase
      .from('organizations')
      .select('org_type')
      .eq('id', organization_id)
      .single();
    
    if (orgError) throw orgError;
    const orgType = orgData.org_type || 'customer';

    // 3. Fetch current entitlements for logging diff & validation
    const { data: currentApps } = await supabase
      .from('organization_apps')
      .select('*')
      .eq('organization_id', organization_id)
    
    const currentAppIds = currentApps ? currentApps.map(a => a.app_id) : [];

    // 4. Validate Logic based on Org Type
    // Internal/Sandbox: Allowed to add new apps (which means entitlements contains IDs not in currentApps)
    // Customer: Allowed to update existing, but NOT add new apps (unless through sales/upgrade flow usually, but admin override is strict here per req)
    // Actually, req says "Customer: read-only app selection". This usually means UI limitation, but backend should enforce too.
    // "Consultant/Partner: read-only entitlements".

    const isAddingNewApp = entitlements.some(e => !currentAppIds.includes(e.app_id));
    
    if (orgType === 'partner' || orgType === 'consultant') {
        // Partners/Consultants cannot have entitlements modified manually here (only emergency access allowed via other endpoint)
        // Unless it's just a status update? Spec says "read-only entitlements". Assuming completely blocked.
        throw new Error(`Modification denied for ${orgType} organizations.`);
    }

    if (orgType === 'customer' && isAddingNewApp) {
        throw new Error('Adding new applications to Customer organizations is restricted. Use Upgrade flow.');
    }

    // 5. Upsert Entitlements
    const updates = entitlements.map((ent) => ({
      organization_id,
      app_id: ent.app_id,
      module_id: ent.module_id,
      seats_allocated: ent.seats_allocated,
      status: ent.status || 'active',
      updated_at: new Date().toISOString()
    }))

    const { error: upsertError } = await supabase
      .from('organization_apps')
      .upsert(updates, { onConflict: 'organization_id, app_id' })

    if (upsertError) throw upsertError

    // 6. Log Action
    await supabase.from('user_activity_logs').insert({
      super_admin_id,
      organization_id,
      action: 'super_admin_update_entitlements',
      details: {
        org_type: orgType,
        previous: currentApps,
        updates: updates,
        diff_summary: `Updated ${updates.length} entitlements`
      },
      timestamp: new Date().toISOString()
    })

    return new Response(
      JSON.stringify({ success: true, message: 'Entitlements updated successfully' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
