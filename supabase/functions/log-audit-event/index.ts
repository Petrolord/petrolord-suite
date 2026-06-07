import { corsHeaders } from "./cors.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
Deno.serve(async (req)=>{
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const authHeader = req.headers.get('Authorization');
    // Get user from auth header if present, otherwise rely on payload if trusted (internal calls)
    let actorId = null;
    if (authHeader) {
      const supabaseUser = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY'), {
        global: {
          headers: {
            Authorization: authHeader
          }
        }
      });
      const { data: { user } } = await supabaseUser.auth.getUser();
      if (user) actorId = user.id;
    }
    const { organization_id, action, resource_type, resource_id, details, ip_address, user_agent } = await req.json();
    if (!organization_id || !action) {
      throw new Error("Missing required fields");
    }
    // Mask sensitive data in details
    const maskedDetails = {
      ...details
    };
    const sensitiveKeys = [
      'password',
      'token',
      'secret',
      'credit_card',
      'cvv'
    ];
    const maskObject = (obj)=>{
      for(const key in obj){
        if (typeof obj[key] === 'object' && obj[key] !== null) {
          maskObject(obj[key]);
        } else if (sensitiveKeys.some((k)=>key.toLowerCase().includes(k))) {
          obj[key] = '***MASKED***';
        }
      }
    };
    maskObject(maskedDetails);
    const { error } = await supabaseAdmin.from('organization_audit_logs').insert({
      organization_id,
      actor_id: actorId,
      action,
      resource_type,
      resource_id,
      details: maskedDetails,
      ip_address: ip_address || req.headers.get('x-forwarded-for') || 'unknown',
      user_agent: user_agent || req.headers.get('user-agent') || 'unknown',
      created_at: new Date().toISOString()
    });
    if (error) throw error;
    return new Response(JSON.stringify({
      success: true
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error("Audit Log Error:", error);
    // Don't fail the caller if audit logging fails, just log to console
    return new Response(JSON.stringify({
      error: error.message
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
