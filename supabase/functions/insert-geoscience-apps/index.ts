// insert-geoscience-apps: deployed from the Horizons era and never committed;
// brought into the repo by the platform-admin security fix (2026-09-19).
// Service role, or a platform super admin (public.platform_admins).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from './cors.ts'
import { requirePlatformAdmin } from '../_shared/platform-admin.ts'

const GEOSCIENCE_MODULE_ID = 'f44a23a1-c0e0-4ed1-8961-91b3c6c2f091';

const APPS_LIST = [
  // Active (11)
  { name: "EarthModel Pro", status: "Active" },
  { name: "Velocity Model Builder", status: "Active" },
  { name: "Depth Conversion Engine", status: "Active" },
  { name: "Well to Seismic Tie", status: "Active" },
  { name: "Log Facies Analysis", status: "Active" },
  { name: "Petrophysical Integration Suite", status: "Active" },
  { name: "Well Correlation Tool", status: "Active" },
  { name: "EarthModel Studio", status: "Active" },
  { name: "ReservoirCalc Pro", status: "Active" },
  { name: "1D Mechanical Earth Model", status: "Active" },
  { name: "Material Balance & Volumetrics", status: "Active" },
  // Coming Soon (21)
  { name: "Seismic Velocity Picker", status: "Coming Soon" },
  { name: "Seismic Inversion Toolkit", status: "Coming Soon" },
  { name: "Checkshot & VSP Processor", status: "Coming Soon" },
  { name: "Wavelet Analysis Tool", status: "Coming Soon" },
  { name: "Synthetic Seismogram", status: "Coming Soon" },
  { name: "Sonic Log Analyzer", status: "Coming Soon" },
  { name: "Rock Physics Analyzer", status: "Coming Soon" },
  { name: "Reservoir Characterization Tool", status: "Coming Soon" },
  { name: "Structural Mapping Suite", status: "Coming Soon" },
  { name: "Fault & Fracture Analyzer", status: "Coming Soon" },
  { name: "Pressure Prediction System", status: "Coming Soon" },
  { name: "Pressure Compartment Analyzer", status: "Coming Soon" },
  { name: "Fluid Contact Mapper", status: "Coming Soon" },
  { name: "Basin Modeling Suite", status: "Coming Soon" },
  { name: "Seal Integrity Analyzer", status: "Coming Soon" },
  { name: "Migration Risk Analyzer", status: "Coming Soon" },
  { name: "Trap Definition Tool", status: "Coming Soon" },
  { name: "Charge & Migration Modeler", status: "Coming Soon" },
  { name: "Thermal Maturity Analyzer", status: "Coming Soon" },
  { name: "Source Rock Analyzer", status: "Coming Soon" },
  { name: "Geothermal Gradient Calculator", status: "Coming Soon" }
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    
    // Create Service Client for DB operations (Bypass RLS)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      serviceRoleKey ?? ''
    )

    // Authorization Check
    // If strict service role check is required, we check against the key. 
    // However, to support frontend invocations (which send user JWT), we also validate Admin users.
    let isAuthorized = false;

    if (authHeader && serviceRoleKey && authHeader.includes(serviceRoleKey)) {
        isAuthorized = true;
    } else if (authHeader) {
        // Security fix 2026-09-19: any signed-in user used to be allowed
        // ("for debug purposes"). Platform super admins only now.
        const guard = await requirePlatformAdmin(supabase, req)
        isAuthorized = guard.ok
    }

    if (!isAuthorized) {
        return new Response(JSON.stringify({ error: 'Unauthorized: Service Role or Admin required' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // 1. Check existing apps to avoid duplicates
    const { data: existingApps, error: fetchError } = await supabase
        .from('master_apps')
        .select('app_name')
        .eq('module_id', GEOSCIENCE_MODULE_ID)
    
    if (fetchError) throw fetchError

    const existingNames = new Set(existingApps?.map(a => a.app_name) || [])
    const toInsert = []

    for (const app of APPS_LIST) {
        if (!existingNames.has(app.name)) {
            toInsert.push({
                id: crypto.randomUUID(),
                app_name: app.name,
                module_id: GEOSCIENCE_MODULE_ID,
                status: app.status,
                description: `${app.name} - Geoscience app in EarthModel Suite`,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                module: 'Geoscience',
                slug: app.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, ''),
                is_functional: app.status === 'Active',
                is_built: app.status === 'Active'
            })
        }
    }

    if (toInsert.length > 0) {
        const { error: insertError } = await supabase.from('master_apps').insert(toInsert)
        if (insertError) throw insertError
    }

    // 2. Get new total count
    const { count, error: countError } = await supabase
        .from('master_apps')
        .select('*', { count: 'exact', head: true })
        .eq('module_id', GEOSCIENCE_MODULE_ID)

    if (countError) throw countError;

    return new Response(JSON.stringify({
        success: true,
        inserted: toInsert.length,
        total_geoscience_apps: count
    }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    })
  }
})
