import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { corsHeaders } from './cors.ts';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
Deno.serve(async (req)=>{
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    // 1. Validate User via JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing Authorization header');
    }
    const { data: { user }, error: userError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (userError || !user) {
      throw new Error('Invalid user token');
    }
    // 2. Get User's Organization
    // organization_members is the single canonical membership table
    // (consolidation 20260713300000 — the organization_users table this
    // function originally queried was dropped, which 400'd every call).
    // If the user is in multiple orgs we take the first active membership.
    const { data: memberRows, error: orgError } = await supabase.from('organization_members')
      .select('organization_id, status')
      .eq('user_id', user.id);
    if (orgError) throw orgError;
    const orgUser = (memberRows ?? []).find((m)=>(m.status ?? 'active').toLowerCase() === 'active') ?? null;
    if (!orgUser) {
      // User has no organization, return empty entitlements
      return new Response(JSON.stringify({
        accessible_app_ids: [],
        accessible_module_ids: [],
        entitlements: [],
        org_id: null
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    const orgId = orgUser.organization_id;
    // 2b. Internal organization (Lordsway staff): full catalog access without
    // purchases. The flag lives on organizations.is_internal and is only ever
    // set by migration, so this cannot be reached by self-signup.
    const { data: orgRow } = await supabase.from('organizations')
      .select('id, is_internal').eq('id', orgId).maybeSingle();
    if (orgRow?.is_internal === true) {
      const { data: catalogApps, error: catalogError } = await supabase.from('master_apps')
        .select('id, module_id').ilike('status', 'active');
      if (catalogError) throw catalogError;
      const allAppIds = (catalogApps ?? []).map((a)=>a.id);
      const allModuleIds = Array.from(new Set((catalogApps ?? []).map((a)=>a.module_id).filter(Boolean)));
      return new Response(JSON.stringify({
        accessible_app_ids: allAppIds,
        accessible_module_ids: allModuleIds,
        entitlements: [{ type: 'internal', status: 'active', module_name: 'Internal (staff)', expiry_date: null }],
        org_id: orgId,
        internal: true
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // 3. Fetch Active, Non-Expired Purchases. A NULL expiry_date means "no
    // expiry" (manual_verify_quote can leave it null) — treat as still active,
    // matching usePurchasedModules.
    const now = new Date().toISOString();
    const { data: purchases, error: purchaseError } = await supabase.from('purchased_modules').select(`
        id,
        organization_id,
        module_id,
        app_id,
        module_name,
        purchase_date,
        expiry_date,
        status,
        seats_allocated,
        current_seats_used,
        module_uuid,
        app_uuid
      `).eq('organization_id', orgId).eq('status', 'active').or(`expiry_date.is.null,expiry_date.gt.${now}`);
    if (purchaseError) throw purchaseError;
    // 4. Build Access Lists
    const accessibleAppIds = new Set();
    const accessibleModuleIds = new Set();
    const entitlements = [];
    // Pre-fetch master_apps to resolve module-level purchases to app IDs
    // We need to know which apps belong to which module_uuid
    const { data: allApps, error: appsError } = await supabase.from('master_apps').select('id, module_id');
    if (appsError) throw appsError;
    for (const p of purchases){
      const ent = {
        purchase_id: p.id,
        module_name: p.module_name,
        expiry_date: p.expiry_date,
        purchase_date: p.purchase_date,
        seats_allocated: p.seats_allocated,
        seats_used: p.current_seats_used,
        status: p.status,
        type: p.app_uuid ? 'app' : 'module',
        target_id: p.app_uuid || p.module_uuid // UUID of app or module
      };
      entitlements.push(ent);
      if (p.app_uuid) {
        // Direct App Purchase
        accessibleAppIds.add(p.app_uuid);
      } else if (p.module_uuid) {
        // Module Purchase - Grant access to all apps in this module
        accessibleModuleIds.add(p.module_uuid);
        const moduleApps = allApps?.filter((a)=>a.module_id === p.module_uuid) || [];
        moduleApps.forEach((a)=>accessibleAppIds.add(a.id));
      }
    }
    // 5. Return Structured JSON
    return new Response(JSON.stringify({
      accessible_app_ids: Array.from(accessibleAppIds),
      accessible_module_ids: Array.from(accessibleModuleIds),
      entitlements: entitlements,
      org_id: orgId
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Error fetching entitlements:', error);
    return new Response(JSON.stringify({
      error: error.message
    }), {
      status: 400,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
