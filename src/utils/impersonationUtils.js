import { supabase } from '@/lib/customSupabaseClient';

export const startOrgImpersonation = async (orgId, superAdminId) => {
  console.log(`ImpersonationUtils: Starting Org Impersonation for Org: ${orgId}, Admin: ${superAdminId}`);
  try {
    // 1. Insert into impersonation log
    const { data, error } = await supabase
      .from('super_admin_impersonation_log')
      .insert({
        super_admin_id: superAdminId,
        impersonated_org_id: orgId,
        action: 'START_ORG',
        session_start: new Date().toISOString(),
        user_agent: navigator.userAgent
      })
      .select()
      .single();

    if (error) throw error;

    // 2. Also log to user_activity_logs as requested by Task 10
    await supabase.from('user_activity_logs').insert({
      super_admin_id: superAdminId,
      organization_id: orgId,
      action: 'start_org_impersonation',
      details: {
        impersonated_org_id: orgId,
        session_id: data.id
      },
      ip_address: null, // Client side hard to get reliable IP
      user_agent: navigator.userAgent,
      timestamp: new Date().toISOString()
    });

    console.log("ImpersonationUtils: Logged start session:", data);
    return data.id;
  } catch (err) {
    console.error("ImpersonationUtils: Failed to log start:", err);
    return null;
  }
};

export const startMemberImpersonation = async (orgId, userId, superAdminId) => {
  console.log(`ImpersonationUtils: Starting Member Impersonation for User: ${userId}, Org: ${orgId}, Admin: ${superAdminId}`);
  try {
    const { data, error } = await supabase
      .from('super_admin_impersonation_log')
      .insert({
        super_admin_id: superAdminId,
        impersonated_org_id: orgId,
        impersonated_user_id: userId,
        action: 'START_MEMBER',
        session_start: new Date().toISOString(),
        user_agent: navigator.userAgent
      })
      .select()
      .single();

    if (error) throw error;

    // Log to user_activity_logs
    await supabase.from('user_activity_logs').insert({
      super_admin_id: superAdminId,
      organization_id: orgId,
      user_id: userId,
      action: 'start_member_impersonation',
      details: {
        impersonated_user_id: userId,
        session_id: data.id
      },
      user_agent: navigator.userAgent,
      timestamp: new Date().toISOString()
    });

    console.log("ImpersonationUtils: Logged start session:", data);
    return data.id;
  } catch (err) {
    console.error("ImpersonationUtils: Failed to log start:", err);
    return null;
  }
};

export const exitImpersonation = async (sessionId, superAdminId) => {
  console.log(`ImpersonationUtils: Exiting Impersonation Session: ${sessionId}`);
  if (!sessionId) return;

  try {
    const endTime = new Date();
    
    const { data: sessionData } = await supabase
        .from('super_admin_impersonation_log')
        .select('session_start')
        .eq('id', sessionId)
        .single();
        
    let duration = 0;
    if (sessionData?.session_start) {
        duration = Math.floor((endTime - new Date(sessionData.session_start)) / 1000);
    }

    const { error } = await supabase
      .from('super_admin_impersonation_log')
      .update({
        session_end: endTime.toISOString(),
        duration_seconds: duration,
        action: 'EXIT' 
      })
      .eq('id', sessionId); 

    if (error) throw error;

    // Log to user_activity_logs
    await supabase.from('user_activity_logs').insert({
      super_admin_id: superAdminId,
      action: 'exit_impersonation',
      details: {
        session_id: sessionId,
        duration_seconds: duration
      },
      user_agent: navigator.userAgent,
      timestamp: endTime.toISOString()
    });

    console.log("ImpersonationUtils: Logged exit session");
  } catch (err) {
    console.error("ImpersonationUtils: Failed to log exit:", err);
  }
};

export const getImpersonationHistory = async (superAdminId) => {
    // Fetch logs
    const { data, error } = await supabase
        .from('super_admin_impersonation_log')
        .select(`
            *,
            organizations(name),
            users:impersonated_user_id(email)
        `)
        .eq('super_admin_id', superAdminId)
        .order('created_at', { ascending: false });
        
    if (error) {
        console.error("ImpersonationUtils: Error fetching history", error);
        return [];
    }
    return data;
};