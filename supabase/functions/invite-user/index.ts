// invite-user: LEGACY invitation writer (public.invitations).
// Deployed from the Horizons era (v44) and never committed; brought into the
// repo by the 2026-10 security sweep. Before: verify_jwt off and no caller
// check, so anyone could create an admin invitation to any organization and
// read its token back. The Suite admin Org Team dialog in the live bundle
// still calls it; the repo version of that dialog uses invite-employee.
// Delete this function once the Suite zip with that change is live.
// Now: the caller must be an org admin of that organization or a platform
// super admin.
import { corsHeaders } from "./cors.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { getCaller, isOrgAdmin, isPlatformAdmin } from '../_shared/platform-admin.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // The caller must be an active owner/admin/org_admin of the organization,
    // or a platform super admin.
    const caller = await getCaller(supabaseClient, req);
    if (!caller) {
      return new Response(JSON.stringify({ error: 'Sign in required.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 });
    }

    // Get the request body
    const { email, role, organization_id, app_context } = await req.json();

    const allowed = (await isOrgAdmin(supabaseClient, caller.id, organization_id))
      || (await isPlatformAdmin(supabaseClient, caller));
    if (!allowed) {
      return new Response(JSON.stringify({ error: 'Only organization admins can invite members.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 });
    }

    // Validate inputs
    if (!email || !role || !organization_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Role validation: Strictly enforce allowed roles for invitation
    // app_context is informational for UI routing/email templates
    const allowedRoles = ['admin', 'member', 'viewer'];
    if (!allowedRoles.includes(role)) {
      return new Response(
        JSON.stringify({ error: 'Invalid role. Must be one of: admin, member, viewer' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Insert invitation
    const { data, error } = await supabaseClient
      .from('invitations')
      .insert([
        {
          email,
          role, // This role applies to the org generally, permissions derived from matrix
          org_id: organization_id, // Using correct column name from schema
          invited_by: caller.id,
          app_context: app_context || 'suite', // Default to suite if missing
          token: crypto.randomUUID(),
          status: 'pending',
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
        }
      ])
      .select()
      .single();

    if (error) throw error;

    // Send email logic would go here (using Resend or similar)
    // For now we just return the invitation data

    return new Response(
      JSON.stringify({ success: true, invitation: data }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});